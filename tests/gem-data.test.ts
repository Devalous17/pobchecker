import { describe, expect, it } from "vitest";
import { parsePoBGemDataForTest } from "../src/features/pob/gem-data";

describe("official PoB gem metadata", () => {
  it("reads attribute tags and requirements from Gems.lua", () => {
    const data = parsePoBGemDataForTest(`return {\n ["a"] = {\n  name = "Example Spell",\n  baseTypeName = "Example Spell",\n  tags = {\n   intelligence = true,\n   grants_active_skill = true,\n  },\n  reqStr = 0,\n  reqDex = 0,\n  reqInt = 100,\n },\n}`);
    expect(data.get("examplespell")).toMatchObject({ color: "int", requirements: "STR 0 · DEX 0 · INT 100" });
  });
});
