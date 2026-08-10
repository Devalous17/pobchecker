import { describe, expect, it } from "vitest";
import { detectConditions } from "../src/features/conditions/registry";
import { analyzeBuildLayers, applyScenarioSnapshots } from "../src/features/analysis/layers";
import type { ScenarioReport } from "../src/features/scenarios/model";
import { calculateBuildQuality } from "../src/features/analysis/quality";
import { examplePobFixture } from "../src/features/import/example-fixture";
import { parsePobXml } from "../src/features/pob/parse";

describe("build layer analyzer", () => {
  it("uses the Storm Burst configured setup as the offence evidence source", () => {
    const build = parsePobXml(examplePobFixture);
    const conditions = detectConditions(build);
    const layers = analyzeBuildLayers(build, conditions, calculateBuildQuality(build, conditions));
    const damage = layers.offence.findings.find((finding) => finding.id === "offence-damage-output");

    expect(build.mainSkill).toBe("Storm Burst of Repulsion");
    expect(damage?.evidence).toContain("Main skill: Storm Burst of Repulsion");
    expect(damage?.snapshots.find((snapshot) => snapshot.state === "typical")?.value).toBeCloseTo(211952890.21049);
    expect(damage?.snapshots.find((snapshot) => snapshot.state === "baseline")?.status).toBe("unavailable");
  });

  it("detects RF DoT output and Energy Shield recovery as separate layers", () => {
    const build = parsePobXml(`<PathOfBuilding><Build><PlayerStat stat="TotalDPS" value="0"/><PlayerStat stat="TotalDotDPS" value="14768527"/><PlayerStat stat="TotalEHP" value="155817"/><PlayerStat stat="PhysicalMaximumHitTaken" value="48493"/><PlayerStat stat="FireMaximumHitTaken" value="275999"/><PlayerStat stat="EnergyShield" value="46598"/><PlayerStat stat="EnergyShieldRegenRecovery" value="7859.3"/></Build><Skills><SkillSet id="1"><Skill slot="Body Armour" mainActiveSkill="1"><Gem nameSpec="Righteous Fire" name="Righteous Fire"/></Skill></SkillSet></Skills></PathOfBuilding>`);
    const conditions = detectConditions(build);
    const layers = analyzeBuildLayers(build, conditions, calculateBuildQuality(build, conditions));
    const damage = layers.offence.findings.find((finding) => finding.id === "offence-damage-output");
    const recovery = layers.defence.findings.find((finding) => finding.id === "defence-recovery");

    expect(build.mainSkill).toBe("Righteous Fire");
    expect(damage?.evidence).toContain("Damage-over-Time DPS: 14,768,527");
    expect(recovery?.evidence).toContain("Energy Shield regeneration: 7,859.3/s");
  });

  it("keeps uneven elemental maximum hits separate instead of hiding weaker resistances", () => {
    const build = parsePobXml(`<PathOfBuilding><Build><PlayerStat stat="TotalEHP" value="100000"/><PlayerStat stat="FireResist" value="75"/><PlayerStat stat="ColdResist" value="85"/><PlayerStat stat="LightningResist" value="75"/><PlayerStat stat="FireMaximumHitTaken" value="60000"/><PlayerStat stat="ColdMaximumHitTaken" value="90000"/><PlayerStat stat="LightningMaximumHitTaken" value="60000"/></Build></PathOfBuilding>`);
    const conditions = detectConditions(build);
    const layers = analyzeBuildLayers(build, conditions, calculateBuildQuality(build, conditions));
    const ids = layers.defence.findings.map((finding) => finding.id);

    expect(ids).toContain("defence-fire-hit");
    expect(ids).toContain("defence-cold-hit");
    expect(ids).toContain("defence-lightning-hit");
    expect(ids).not.toContain("defence-elemental-hit");
    expect(layers.defence.findings.find((finding) => finding.id === "defence-fire-hit")?.evidence).toContain("Fire resistance: 75%");
  });

  it("replaces baseline and peak snapshots with authoritative offence and defence states", () => {
    const build = parsePobXml(examplePobFixture);
    const conditions = detectConditions(build);
    const analysis = analyzeBuildLayers(build, conditions, calculateBuildQuality(build, conditions));
    const metric = (value: number, defence: Record<string, number | null> = {}) => ({ value, unit: "dps" as const, status: "calculated" as const, confidence: "High" as const, includedConditions: [], assumptions: [], explanation: "worker", defence });
    const scenarios = {
      encounterSeconds: 30,
      configured: metric(56_000_000),
      unconditional: metric(8_000_000, { totalEHP: 20_000, physicalMaximumHitTaken: 12_000, elementalMaximumHitTaken: 58_000, chaosMaximumHitTaken: 10_000, block: 42, spellBlock: 39, spellSuppression: 3, manaRegen: 577 }),
      peak: metric(15_000_000, { totalEHP: 78_000, physicalMaximumHitTaken: 23_000, elementalMaximumHitTaken: 99_000, chaosMaximumHitTaken: 21_000, block: 42, spellBlock: 39, spellSuppression: 3, manaRegen: 577 }),
      burst: metric(9_000_000),
      initial: metric(6_000_000),
      sustained: { ...metric(10_000_000), status: "estimated" as const, confidence: "Medium" as const },
      mapping: metric(11_000_000),
      timeline: [],
    } satisfies ScenarioReport;
    const applied = applyScenarioSnapshots(analysis, scenarios);
    const damage = applied.offence.findings.find((finding) => finding.id === "offence-damage-output");
    const ehp = applied.defence.findings.find((finding) => finding.id === "defence-hit-pool");
    const physical = applied.defence.findings.find((finding) => finding.id === "defence-physical-hit");
    expect(damage?.snapshots.find((snapshot) => snapshot.state === "baseline")?.value).toBe(8_000_000);
    expect(damage?.snapshots.find((snapshot) => snapshot.state === "peak")?.value).toBe(15_000_000);
    expect(ehp?.snapshots.find((snapshot) => snapshot.state === "baseline")?.value).toBe(20_000);
    expect(physical?.snapshots.find((snapshot) => snapshot.state === "peak")?.value).toBe(23_000);
  });

  it("attaches controlled support and curse comparisons after a scenario run", () => {
    const build = parsePobXml(examplePobFixture);
    const conditions = detectConditions(build);
    const analysis = analyzeBuildLayers(build, conditions, calculateBuildQuality(build, conditions));
    const metric = (value: number) => ({ value, unit: "dps" as const, status: "calculated" as const, confidence: "High" as const, includedConditions: [], assumptions: [], explanation: "worker" });
    const comparison = (name: string, deltaDps: number) => ({ name, withDps: 56_000_000, withoutDps: 56_000_000 - deltaDps, deltaDps, status: "calculated" as const, confidence: "High" as const, explanation: "controlled" });
    const scenarios = { encounterSeconds: 30, configured: metric(56_000_000), unconditional: metric(8_000_000), peak: metric(15_000_000), burst: metric(9_000_000), initial: metric(6_000_000), sustained: metric(10_000_000), mapping: metric(11_000_000), timeline: [], supportContributions: [comparison("Increased Critical Damage", 2_000_000)], curseContributions: [comparison("Punishment", 10_000_000)] } satisfies ScenarioReport;
    const applied = applyScenarioSnapshots(analysis, scenarios);
    expect(applied.offence.findings.find((finding) => finding.id === "offence-main-link")?.comparisons?.[0].deltaDps).toBe(2_000_000);
    expect(applied.offence.findings.find((finding) => finding.id === "offence-curse-package")?.comparisons?.[0].name).toBe("Punishment");
  });
});
