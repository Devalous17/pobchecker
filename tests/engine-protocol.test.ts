import { describe, expect, it } from "vitest";
import { calculateWithEngine, EngineUnavailableError, getEngineStatus } from "../src/features/engine/client";

describe("headless engine boundary", () => {
  it("fails explicitly when no engine is configured", async () => {
    delete process.env.POB_ENGINE_URL;
    await expect(calculateWithEngine({ xml: "<PathOfBuilding/>", scenario: {} })).rejects.toBeInstanceOf(EngineUnavailableError);
  });
  it("reports the missing worker without probing an arbitrary URL", async () => {
    delete process.env.POB_ENGINE_URL;
    await expect(getEngineStatus()).resolves.toEqual({ state: "not-configured", message: "The isolated Path of Building worker is not configured for this environment." });
  });
  it("reports a healthy configured worker", async () => {
    process.env.POB_ENGINE_URL = "http://engine/";
    const fakeFetch = async () => new Response(JSON.stringify({ ok: true, engineReady: true }), { status: 200 });
    await expect(getEngineStatus(fakeFetch)).resolves.toEqual({ state: "ready", message: "The isolated Path of Building worker is ready." });
    delete process.env.POB_ENGINE_URL;
  });
  it("does not report ready when Lua dependencies are missing", async () => {
    process.env.POB_ENGINE_URL = "http://engine";
    const fakeFetch = async () => new Response(JSON.stringify({ ok: false, engineReady: false, diagnostics: ["module 'xml' not found"] }), { status: 503 });
    await expect(getEngineStatus(fakeFetch)).resolves.toEqual({ state: "unreachable", message: "The PoB worker is not ready: module 'xml' not found" });
    delete process.env.POB_ENGINE_URL;
  });
  it("accepts only the typed scenario contract", async () => {
    const fakeFetch = async () => new Response(JSON.stringify({ engine: { name: "test", version: "1", commit: "x" }, calculated: true, scenario: {}, offence: { totalDPS: 10 }, defence: { totalEHP: null }, diagnostics: [] }), { status: 200, headers: { "content-type": "application/json" } });
    process.env.POB_ENGINE_URL = "http://engine";
    const result = await calculateWithEngine({ xml: "<PathOfBuilding/>", scenario: { enemyIsBoss: "Pinnacle" } }, fakeFetch);
    expect(result.offence.totalDPS).toBe(10);
    delete process.env.POB_ENGINE_URL;
  });
  it("surfaces calculation errors without mislabeling the worker offline", async () => {
    process.env.POB_ENGINE_URL = "http://engine";
    const fakeFetch = async () => new Response(JSON.stringify({ error: "Lua module dkjson could not be loaded" }), { status: 400, headers: { "content-type": "application/json" } });
    await expect(calculateWithEngine({ xml: "<PathOfBuilding/>", scenario: {} }, fakeFetch)).rejects.toThrow("Lua module dkjson could not be loaded");
    delete process.env.POB_ENGINE_URL;
  });
});
