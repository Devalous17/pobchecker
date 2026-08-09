import { describe, expect, it } from "vitest";
import { parsePobXml } from "../src/features/pob/parse";
import { detectConditions } from "../src/features/conditions/registry";
import { examplePobFixture } from "../src/features/import/example-fixture";

describe("static condition auditor", () => {
  it("separates configuration from source evidence", () => {
    const build = parsePobXml(`<PathOfBuilding><Build/><Skills/><Items><Item name="Blood Rage"/></Items><Config><Input name="useFrenzyCharges" value="true"/><Input name="usePowerCharges" value="true"/></Config></PathOfBuilding>`);
    const conditions = detectConditions(build);
    expect(conditions.map((condition) => condition.id)).toEqual(["power-charges", "frenzy-charges"]);
    expect(conditions.find((condition) => condition.id === "frenzy-charges")?.sourceDetected).toBe(true);
    expect(conditions.find((condition) => condition.id === "power-charges")?.reliability).toBe("Unverified");
  });
  it("does not call an unverified source invalid", () => {
    const build = parsePobXml(`<PathOfBuilding><Build/><Skills/><Items/><Config><Input name="conditionEnemyLowLife" value="true"/></Config></PathOfBuilding>`);
    const condition = detectConditions(build)[0];
    expect(condition.reliability).toBe("Unverified");
    expect(condition.confidence).toBe("Low");
    expect(condition.explanation).toContain("rather than being called invalid");
  });
  it("preserves source categories for attribution", () => {
    const build = parsePobXml(`<PathOfBuilding><Build ascendClassName="Hierophant"/><Skills><Skill name="Punishment"/></Skills><Items><Item name="Diamond Flask"/></Items><TreeView><Node name="Conviction of Power"/></TreeView><Config/></PathOfBuilding>`);
    expect(build.sources.map((source) => source.category)).toEqual(["gem", "flask", "ascendancy", "ascendancy"]);
  });

  it("reads the real PoB export shape for title, stats, skills, config, and tree", () => {
    const build = parsePobXml(examplePobFixture);

    expect(build.identity.name).toBe("Storm Burst of Repulsion");
    expect(build.importedStats.source).toBe("pob-calcs");
    expect(build.importedStats.fullDps).toBeCloseTo(211952890.21049);
    expect(build.importedStats.totalDps).toBeCloseTo(52988222.552622);
    expect(build.importedStats.life).toBe(3867);
    expect(build.importedStats.effectiveHealthPool).toBeCloseTo(169614.60894962);
    expect(build.skills.slice(0, 6)).toEqual([
      "Storm Burst of Repulsion",
      "More Duration",
      "Increased Critical Damage",
      "Lightning Penetration",
      "Infused Channelling",
      "Inspiration",
    ]);
    expect(build.allocatedNodeIds).toEqual(["25651", "34434", "40510"]);
    expect(build.enabledConfigs).toEqual(expect.arrayContaining([
      "usePowerCharges",
      "useEnduranceCharges",
    ]));
    expect(build.configFields).toContainEqual({ name: "sigilOfPowerStages", value: "4" });
  });
});
