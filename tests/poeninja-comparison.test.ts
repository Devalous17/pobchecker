import { describe, expect, it } from "vitest";
import { fetchPoeNinjaComparison, parsePoeNinjaCharacterUrl } from "../src/features/poeninja/comparison";

describe("Poe.ninja comparison", () => {
  it("parses supported explicit character URLs", () => {
    expect(parsePoeNinjaCharacterUrl("https://poe.ninja/poe1/builds/allflame/character/mamuro-3802/Luminary_Is_Bait")).toMatchObject({ league: "allflame", account: "mamuro-3802", character: "Luminary_Is_Bait" });
  });

  it("rejects deceptive or unsupported URLs", () => {
    expect(() => parsePoeNinjaCharacterUrl("https://poe.ninja.evil.example/poe1/builds/allflame/character/a/b")).toThrow();
    expect(() => parsePoeNinjaCharacterUrl("http://poe.ninja/poe1/builds/allflame/character/a/b")).toThrow();
  });

  it("extracts public identity metadata without inventing stats", async () => {
    const result = await fetchPoeNinjaComparison("https://poe.ninja/poe1/builds/allflame/character/mamuro-3802/Luminary_Is_Bait", async () => new Response("<meta name=\"description\" content=\"Luminary_Is_Bait, level 97 Hierophant in the Allflame league.\">", { status: 200 }));
    expect(result).toMatchObject({ source: "poe-ninja", level: 97, className: "Hierophant" });
    expect(result.stats).toBeUndefined();
  });
});
