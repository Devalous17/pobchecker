import http from "node:http";
import { spawn } from "node:child_process";

const port = Number(process.env.PORT || 8080);
const lua = process.env.POB_LUAJIT || "luajit";
const bridge = process.env.POB_BRIDGE || new URL("./bridge.lua", import.meta.url).pathname;
const sourceDirectory = process.env.POB_SRC || process.cwd();

function checkRuntime() {
  return new Promise((resolve) => {
    const child = spawn(lua, ["-e", "local xml = require('xml'); local json = require('dkjson'); local utf8 = require('lua-utf8'); assert(type(xml.LoadXMLFile) == 'function'); assert(type(json.decode) == 'function'); assert(type(utf8.gsub) == 'function')"], {
      cwd: sourceDirectory,
      stdio: ["ignore", "ignore", "pipe"],
      timeout: 5_000,
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => resolve({ ready: false, error: error.message }));
    child.on("close", (code) => resolve(code === 0 ? { ready: true } : { ready: false, error: stderr.trim() || `Lua runtime probe exited with ${code}` }));
  });
}

function run(request) {
  return new Promise((resolve, reject) => {
    const child = spawn(lua, [bridge], { cwd: sourceDirectory, stdio: ["pipe", "pipe", "pipe"], timeout: 12000 });
    let stdout = ""; let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; }); child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(stderr.trim() || `Lua engine exited with ${code}`));
      const lines = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      for (let index = lines.length - 1; index >= 0; index -= 1) {
        try {
          const result = JSON.parse(lines[index]);
          if (result?.error) return reject(new Error(result.error));
          return resolve(result);
        } catch {
          // PoB can print human-readable startup messages before the bridge JSON.
        }
      }
      const diagnostics = [stderr.trim(), stdout.trim()].filter(Boolean).join("\n").slice(-4_000);
      reject(new Error(`Lua engine returned no JSON response${diagnostics ? `: ${diagnostics}` : "."}`));
    });
    child.stdin.end(JSON.stringify(request) + "\n");
  });
}

const server = http.createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    const runtime = await checkRuntime();
    const payload = runtime.ready
      ? { ok: true, engineReady: true, service: "pob-engine" }
      : { ok: false, engineReady: false, service: "pob-engine", diagnostics: [runtime.error || "Lua runtime dependencies are unavailable."] };
    response.writeHead(runtime.ready ? 200 : 503, { "content-type": "application/json" });
    return response.end(JSON.stringify(payload));
  }
  if (request.method !== "POST" || request.url !== "/calculate") { response.writeHead(404); return response.end(); }
  let body = ""; request.on("data", (chunk) => { body += chunk; if (body.length > 2_100_000) { response.writeHead(413, { "content-type": "application/json" }); response.end(JSON.stringify({ error: "Request is too large." })); request.destroy(); } });
  request.on("end", async () => { try { const result = await run(JSON.parse(body)); response.writeHead(200, { "content-type": "application/json" }); response.end(JSON.stringify(result)); } catch (error) { response.writeHead(400, { "content-type": "application/json" }); response.end(JSON.stringify({ error: error instanceof Error ? error.message : "engine failure" })); } });
});
server.listen(port, "0.0.0.0", () => console.log(`pob-engine listening on ${port}`));
