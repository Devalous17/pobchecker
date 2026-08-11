import { describe, expect, it } from "vitest";
import { calculateBuildQuality, dpsStrengthScore, DPS_CALIBRATION_ANCHORS, importedRatingDps, recalculateBuildQuality } from "../src/features/analysis/quality";
import type { ScenarioReport } from "../src/features/scenarios/model";
import { parsePobXml } from "../src/features/pob/parse";

describe("build quality rating", () => {
  it("keeps the DPS calibration anchors stable", () => {
    for (const anchor of DPS_CALIBRATION_ANCHORS) expect(dpsStrengthScore(anchor.dps)).toBeCloseTo(anchor.score, 5);
    expect(dpsStrengthScore(1_000_000_000)).toBe(10);
    expect(dpsStrengthScore(10_000)).toBe(1);
  });

  it("keeps a glass cannon from receiving a high overall grade", () => {
    const build = parsePobXml(`<PathOfBuilding><Build><PlayerStat stat="FullDPS" value="200000000"/><PlayerStat stat="TotalEHP" value="2500"/><PlayerStat stat="PhysicalMaximumHitTaken" value="1800"/></Build></PathOfBuilding>`);
    const quality = calculateBuildQuality(build, []);
    expect(quality.offence.score).toBeGreaterThan(quality.defence.score!);
    expect(quality.overall.score).toBeLessThanOrEqual(5);
    expect(quality.overall.grade).toBe("E");
  });

  it("exposes the five main-skill overview ratings", () => {
    const build = parsePobXml(`<PathOfBuilding><Build><mainSocketGroup>1</mainSocketGroup><PlayerStat stat="FullDPS" value="52000000"/><PlayerStat stat="TotalEHP" value="80000"/><PlayerStat stat="PhysicalMaximumHitTaken" value="20000"/><PlayerStat stat="Speed" value="6"/></Build><Skills><SkillSet id="1"><Skill mainActiveSkill="1"><Gem nameSpec="Arc" name="Arc"/></Skill></SkillSet></Skills></PathOfBuilding>`);
    const quality = calculateBuildQuality(build, []);
    expect(Object.keys(quality.categoryRatings)).toEqual(["dps", "clear", "defence", "bossing"]);
    expect(quality.categoryRatings.dps.score).toBe(quality.offence.score);
    expect(quality.categoryRatings.clear.score).toBeGreaterThan((quality.categoryRatings.bossing.score ?? 0) - 1);
  });

  it("grades a sourced, well-rounded imported snapshot from its evidence", () => {
    const build = parsePobXml(`<PathOfBuilding><Build><PlayerStat stat="FullDPS" value="80000000"/><PlayerStat stat="TotalEHP" value="150000"/><PlayerStat stat="PhysicalMaximumHitTaken" value="30000"/><PlayerStat stat="FireMaximumHitTaken" value="80000"/><PlayerStat stat="ChaosMaximumHitTaken" value="30000"/></Build></PathOfBuilding>`);
    const quality = calculateBuildQuality(build, []);
    expect(quality.overall.score).toBeGreaterThanOrEqual(8);
    expect(["S", "A"]).toContain(quality.overall.grade);
  });

  it("ignores an exported zero FullDPS when a positive TotalDPS exists", () => {
    const build = parsePobXml(`<PathOfBuilding><Build><PlayerStat stat="FullDPS" value="0"/><PlayerStat stat="TotalDPS" value="15000000"/><PlayerStat stat="TotalEHP" value="90000"/><PlayerStat stat="PhysicalMaximumHitTaken" value="20000"/></Build></PathOfBuilding>`);
    const quality = calculateBuildQuality(build, []);
    expect(quality.offence.score).toBeGreaterThan(2);
  });

  it("uses aggregate PoB DPS before falling back to hit DPS", () => {
    const build = parsePobXml(`<PathOfBuilding><Build><PlayerStat stat="FullDPS" value="0"/><PlayerStat stat="CombinedDPS" value="22000000"/><PlayerStat stat="TotalDPS" value="800000"/></Build></PathOfBuilding>`);
    expect(importedRatingDps(build)).toMatchObject({ value: 22_000_000, label: "Combined PoB DPS", origin: "imported" });
    expect(calculateBuildQuality(build, []).ratingDps.label).toBe("Combined PoB DPS");
  });

  it("keeps an imported aggregate PoB value authoritative after worker verification", () => {
    const build = parsePobXml(`<PathOfBuilding><Build><PlayerStat stat="FullDPS" value="18200000"/><PlayerStat stat="TotalEHP" value="90000"/></Build></PathOfBuilding>`);
    const scenarios = { recommended: { value: 11_200_000 }, configured: { value: 17_900_000 } } as unknown as ScenarioReport;
    const quality = recalculateBuildQuality(calculateBuildQuality(build, []), build, [], scenarios);
    expect(quality.ratingDps.value).toBe(18_200_000);
    expect(quality.ratingDps.origin).toBe("imported");
    expect(quality.ratingDps.differencePercent).toBeCloseTo(-38.4615, 3);
  });

  it("uses PoB DoT DPS when hit DPS fields are zero", () => {
    const build = parsePobXml(`<PathOfBuilding><Build><PlayerStat stat="FullDPS" value="0"/><PlayerStat stat="TotalDPS" value="0"/><PlayerStat stat="TotalDotDPS" value="14768527"/><PlayerStat stat="TotalEHP" value="155817"/><PlayerStat stat="PhysicalMaximumHitTaken" value="48493"/></Build></PathOfBuilding>`);
    const quality = calculateBuildQuality(build, []);
    expect(quality.offence.score).toBeGreaterThan(6);
    expect(quality.offence.basis.some((item) => item.includes("Damage-over-Time"))).toBe(true);
  });

  it("gives a 52m imported output a decimal A-range offence score", () => {
    const build = parsePobXml(`<PathOfBuilding><Build><PlayerStat stat="TotalDPS" value="52000000"/></Build></PathOfBuilding>`);
    const quality = calculateBuildQuality(build, []);
    expect(quality.offence.score).toBeGreaterThanOrEqual(8.4);
    expect(quality.offence.score).toBeLessThan(8.7);
    expect(quality.offence.grade).toBe("A");
  });
});
