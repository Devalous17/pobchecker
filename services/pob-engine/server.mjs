import http from "node:http";
import { spawn } from "node:child_process";

const port = Number(process.env.PORT || 8080);
const lua = process.env.POB_LUAJIT || "luajit";
const bridge = process.env.POB_BRIDGE || new URL("./bridge.lua", import.meta.url).pathname;

function run(request) {
  return new Promise((resolve, reject) => {
    const child = spawn(lua, [bridge], { cwd: process.env.POB_SRC || process.cwd(), stdio: ["pipe", "pipe", "pipe"], timeout: 12000 });
    let stdout = ""; let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; }); child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject); child.on("close", (code) => { if (code !== 0) return reject(new Error(stderr || `Lua engine exited with ${code}`)); try { const result = JSON.parse(stdout.trim().split("\n").at(-1)); if (result?.error) return reject(new Error(result.error)); resolve(result); } catch { reject(new Error("Lua engine returned invalid JSON")); } });
    child.stdin.end(JSON.stringify(request) + "\n");
  });
}

const server = http.createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/health") { response.writeHead(200, { "content-type": "application/json" }); return response.end(JSON.stringify({ ok: true, service: "pob-engine" })); }
  if (request.method !== "POST" || request.url !== "/calculate") { response.writeHead(404); return response.end(); }
  let body = ""; request.on("data", (chunk) => { body += chunk; if (body.length > 2_100_000) { response.writeHead(413, { "content-type": "application/json" }); response.end(JSON.stringify({ error: "Request is too large." })); request.destroy(); } });
  request.on("end", async () => { try { const result = await run(JSON.parse(body)); response.writeHead(200, { "content-type": "application/json" }); response.end(JSON.stringify(result)); } catch (error) { response.writeHead(400, { "content-type": "application/json" }); response.end(JSON.stringify({ error: error instanceof Error ? error.message : "engine failure" })); } });
});
server.listen(port, "0.0.0.0", () => console.log(`pob-engine listening on ${port}`));
