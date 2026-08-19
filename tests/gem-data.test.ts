import { describe, expect, it } from "vitest";
import { parsePoBGemDataForTest } from "../src/features/pob/gem-data";
import registry from "../data/pob-gems.json";

describe("official PoB gem metadata", () => {
  it("reads attribute tags and requirements from Gems.lua", () => {
    const data = parsePoBGemDataForTest(`return {\n ["a"] = {\n  name = "Example Spell",\n  baseTypeName = "Example Spell",\n  tags = {\n   intelligence = true,\n   grants_active_skill = true,\n  },\n  reqStr = 0,\n  reqDex = 0,\n  reqInt = 100,\n },\n}`);
    expect(data.get("examplespell")).toMatchObject({ color: "int", requirements: "STR 0 · DEX 0 · INT 100" });
  });
});

describe("bundled PoB active-gem registry", () => {
  it("contains active skill variants and delivery metadata offline", () => {
    expect(registry.activeCount).toBeGreaterThan(500);
    expect(registry.records.find((record) => record.name === "Spell Totem")).toMatchObject({ isSupport: true, tags: expect.arrayContaining(["support"]) });
    expect(registry.records.find((record) => record.name === "Shockwave Totem")).toMatchObject({ delivery: "totem", tags: expect.arrayContaining(["grants_active_skill", "totem"]) });
    expect(registry.records.find((record) => record.name === "Fire Trap")).toMatchObject({ delivery: "trap" });
  });
});
