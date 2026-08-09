import { describe, expect, it } from "vitest";
import { calculateWithEngine, EngineUnavailableError } from "../src/features/engine/client";

describe("headless engine boundary", () => {
  it("fails explicitly when no engine is configured", async () => {
    delete process.env.POB_ENGINE_URL;
    await expect(calculateWithEngine({ xml: "<PathOfBuilding/>", scenario: {} })).rejects.toBeInstanceOf(EngineUnavailableError);
  });
  it("accepts only the typed scenario contract", async () => {
    const fakeFetch = async () => new Response(JSON.stringify({ engine: { name: "test", version: "1", commit: "x" }, calculated: true, scenario: {}, offence: { totalDPS: 10 }, defence: { totalEHP: null }, diagnostics: [] }), { status: 200, headers: { "content-type": "application/json" } });
    process.env.POB_ENGINE_URL = "http://engine";
    const result = await calculateWithEngine({ xml: "<PathOfBuilding/>", scenario: { enemyIsBoss: true } }, fakeFetch);
    expect(result.offence.totalDPS).toBe(10);
    delete process.env.POB_ENGINE_URL;
  });
});
