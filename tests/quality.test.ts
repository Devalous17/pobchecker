import { describe, expect, it } from "vitest";
import { calculateBuildQuality, dpsStrengthScore, DPS_CALIBRATION_ANCHORS, importedRatingDps, recalculateBuildQuality, scenarioOffenceRating } from "../src/features/analysis/quality";
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
    const build = parsePobXml(`<PathOfBuilding><Build><PlayerStat stat="FullDPS" value="80000000"/><PlayerStat stat="TotalEHP" value="150000"/><PlayerStat stat="Armour" value="30000"/><PlayerStat stat="EffectiveBlockChance" value="75"/><PlayerStat stat="EffectiveSpellBlockChance" value="75"/><PlayerStat stat="PhysicalMaximumHitTaken" value="80000"/><PlayerStat stat="FireMaximumHitTaken" value="80000"/><PlayerStat stat="ColdMaximumHitTaken" value="80000"/><PlayerStat stat="ChaosMaximumHitTaken" value="80000"/><PlayerStat stat="FireResist" value="75"/><PlayerStat stat="ColdResist" value="75"/><PlayerStat stat="LightningResist" value="75"/><PlayerStat stat="ChaosResist" value="0"/></Build></PathOfBuilding>`);
    const quality = calculateBuildQuality(build, []);
    expect(quality.overall.score).toBeGreaterThanOrEqual(8);
    expect(["S", "A"]).toContain(quality.overall.grade);
  });

  it("treats capped elemental resistance and zero chaos resistance as the defence floor", () => {
    const build = parsePobXml(`<PathOfBuilding><Build><PlayerStat stat="FullDPS" value="1000000"/><PlayerStat stat="TotalEHP" value="5000"/><PlayerStat stat="PhysicalMaximumHitTaken" value="5000"/><PlayerStat stat="FireResist" value="75"/><PlayerStat stat="ColdResist" value="75"/><PlayerStat stat="LightningResist" value="75"/><PlayerStat stat="ChaosResist" value="0"/></Build></PathOfBuilding>`);
    const quality = calculateBuildQuality(build, []);
    expect(quality.defence.score).toBeGreaterThanOrEqual(3.5);
    expect(quality.defence.basis.some((item) => item.includes("3.5/3.5"))).toBe(true);
  });

  it("rewards a layered endurance-style tank instead of using the weakest max hit", () => {
    const build = parsePobXml(`<PathOfBuilding><Build><PlayerStat stat="FullDPS" value="1000000"/><PlayerStat stat="TotalEHP" value="266000"/><PlayerStat stat="Armour" value="90000"/><PlayerStat stat="EffectiveBlockChance" value="75"/><PlayerStat stat="EffectiveSpellBlockChance" value="75"/><PlayerStat stat="EffectiveSpellSuppressionChance" value="100"/><PlayerStat stat="PhysicalMaximumHitTaken" value="69000"/><PlayerStat stat="FireMaximumHitTaken" value="266000"/><PlayerStat stat="ColdMaximumHitTaken" value="266000"/><PlayerStat stat="LightningMaximumHitTaken" value="266000"/><PlayerStat stat="ChaosMaximumHitTaken" value="20000"/><PlayerStat stat="FireResist" value="90"/><PlayerStat stat="ColdResist" value="90"/><PlayerStat stat="LightningResist" value="90"/><PlayerStat stat="ChaosResist" value="50"/></Build></PathOfBuilding>`);
    const quality = calculateBuildQuality(build, []);
    expect(quality.defence.score).toBeGreaterThanOrEqual(9.5);
    expect(quality.defence.basis.some((item) => item.includes("weakest type"))).toBe(true);
  });

  it("recognizes an exceptional endurance-charge tank as the 10/10 benchmark", () => {
    const build = parsePobXml(`<PathOfBuilding><Build ascendClassName="Juggernaut"><PlayerStat stat="FullDPS" value="1000000"/><PlayerStat stat="TotalEHP" value="117175"/><PlayerStat stat="PhysicalDamageReduction" value="90"/><PlayerStat stat="EnduranceCharges" value="18"/><PlayerStat stat="PhysicalMaximumHitTaken" value="66762"/><PlayerStat stat="FireMaximumHitTaken" value="247269"/><PlayerStat stat="ColdMaximumHitTaken" value="238438"/><PlayerStat stat="LightningMaximumHitTaken" value="238438"/><PlayerStat stat="ChaosMaximumHitTaken" value="16595"/><PlayerStat stat="FireResist" value="76"/><PlayerStat stat="ColdResist" value="75"/><PlayerStat stat="LightningResist" value="75"/><PlayerStat stat="ChaosResist" value="75"/><PlayerStat stat="LifeRegenRecovery" value="482.9"/><PlayerStat stat="LifeLeechGainRate" value="640.7"/></Build></PathOfBuilding>`);
    const quality = calculateBuildQuality(build, []);
    expect(quality.defence.score).toBe(10);
    expect(quality.defence.basis.some((item) => item.includes("Exceptional tank benchmark reached"))).toBe(true);
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

  it("uses the corrected worker value when the export only has a hit-DPS fallback", () => {
    const build = parsePobXml(`<PathOfBuilding><Build><PlayerStat stat="TotalDPS" value="800000"/><PlayerStat stat="TotalEHP" value="80000"/></Build><Skills><SkillSet id="1" includeInFullDPS="true"><Skill mainActiveSkill="1"><Gem nameSpec="Storm Burst of Repulsion" name="Storm Burst"/><Gem nameSpec="Spell Totem Support" name="Spell Totem Support" isSupport="true"/></Skill></SkillSet></Skills></PathOfBuilding>`);
    const before = calculateBuildQuality(build, []);
    const scenarios = { recommended: { value: 190_000_000 }, configured: { value: 800_000 } } as unknown as ScenarioReport;
    const after = recalculateBuildQuality(before, build, [], scenarios);
    expect(after.ratingDps.origin).toBe("worker-typical");
    expect(after.ratingDps.value).toBe(190_000_000);
    expect(after.offence.score).toBeGreaterThan(before.offence.score!);
  });

  it("includes peer benchmark context in the recalibrated offence evidence", () => {
    const build = parsePobXml(`<PathOfBuilding><Build><PlayerStat stat="TotalDPS" value="56000000"/></Build><Skills><SkillSet id="1" includeInFullDPS="true"><Skill mainActiveSkill="1"><Gem nameSpec="Remote Mine" name="Remote Mine"/><Gem nameSpec="Minefield Support" name="Minefield Support" isSupport="true"/></Skill></SkillSet></Skills></PathOfBuilding>`);
    const rating = scenarioOffenceRating(56_000_000, build, []);
    expect(rating.basis.some((item) => item.includes("Peer calibration"))).toBe(true);
    expect(rating.basis.some((item) => item.includes("Peer score for mine"))).toBe(true);
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

  it("does not penalize a trap main setup for unrelated utility summons", () => {
    const build = parsePobXml(`<PathOfBuilding><Build><PlayerStat stat="TotalDPS" value="23700000000"/></Build><Skills><SkillSet id="1" includeInFullDPS="true"><Skill mainActiveSkill="1"><Gem nameSpec="Blade Blast" name="Blade Blast"/><Gem nameSpec="Trap Support" name="Trap Support" isSupport="true"/></Skill></SkillSet><SkillSet id="2"><Skill><Gem nameSpec="Raise Spectre" name="Raise Spectre"/></Skill></SkillSet></Skills></PathOfBuilding>`);
    const rating = scenarioOffenceRating(23_700_000_000, build, [{ reliability: "Conditional" }, { reliability: "Conditional" }]);
    expect(rating.score).toBe(10);
    expect(rating.basis.some((item) => item.includes("Main delivery model: trap"))).toBe(true);
    expect(rating.basis.some((item) => item.includes("reduce the practical score"))).toBe(false);
    expect(rating.basis.some((item) => item.includes("conditional or temporary"))).toBe(true);
  });
});
