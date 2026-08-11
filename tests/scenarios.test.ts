import { describe, expect, it } from "vitest";
import { weightedAverageDps } from "../src/features/scenarios/timeline";
import { buildScenarioReport, highestValidResult, scenarioDps } from "../src/features/scenarios/report";
import { buildScenarioProfiles } from "../src/features/scenarios/model";
import { parsePobXml } from "../src/features/pob/parse";
import { detectConditions } from "../src/features/conditions/registry";
import { examplePobFixture } from "../src/features/import/example-fixture";

describe("combat scenarios", () => {
  it("uses timeline-weighted sustained DPS", () => {
    expect(weightedAverageDps([{ id: "open", label: "open", durationSeconds: 5, dps: 100, source: "engine", assumptions: [] }, { id: "ramp", label: "ramp", durationSeconds: 5, dps: 200, source: "engine", assumptions: [] }], 10)).toBe(150);
  });
  it("does not create scenario values without engine output", () => {
    const report = buildScenarioReport({}, 30);
    expect(report.peak.value).toBeNull();
    expect(report.sustained.value).toBeNull();
    expect(report.peak.status).toBe("unavailable");
  });
  it("uses TotalDotDPS for damage-over-time-only builds", () => {
    const result = {
      engine: { name: "test", version: "1", commit: "x" },
      calculated: true,
      scenario: {},
      offence: { totalDPS: 0, totalDot: 14_800_000, fullDPS: 0 },
      defence: {},
      diagnostics: [],
    };
    expect(scenarioDps(result)).toEqual({ value: 14_800_000, source: "TotalDotDPS" });
    expect(buildScenarioReport({ configured: result, unconditional: result, peak: result }, 30).configured.value).toBe(14_800_000);
  });
  it("prefers aggregate FullDPS over hit DPS when both are exported", () => {
    const result = {
      engine: { name: "test", version: "1", commit: "x" }, calculated: true, scenario: {},
      offence: { fullDPS: 200, combinedDPS: 150, totalDPS: 100, totalDot: 50 }, defence: {}, diagnostics: [],
    };
    expect(scenarioDps(result)).toEqual({ value: 200, source: "FullDPS" });
  });
  it("multiplies a per-source hit channel by active totems when FullDPS is absent", () => {
    const result = {
      engine: { name: "test", version: "1", commit: "x" }, calculated: true, scenario: { TotemsSummoned: 4 },
      offence: { fullDPS: 0, totalDPS: 47_700_000, totalDot: 0 }, defence: {}, diagnostics: [],
    };
    expect(scenarioDps(result)).toEqual({ value: 190_800_000, source: "TotalDPS × 4 active totems/ballistas" });
  });
  it("chooses the highest boss-valid state instead of the imported configured state", () => {
    const result = (dps: number) => ({ engine: { name: "test", version: "1", commit: "x" }, calculated: true, scenario: {}, offence: { totalDPS: dps }, defence: {}, diagnostics: [] });
    expect(scenarioDps(highestValidResult({ peak: result(5), burst: result(6), initial: result(4) })!).value).toBe(6);
  });
  it("does not treat sustained output as the peak state", () => {
    const result = (dps: number) => ({ engine: { name: "test", version: "1", commit: "x" }, calculated: true, scenario: {}, offence: { totalDPS: dps }, defence: {}, diagnostics: [] });
    expect(highestValidResult({ peak: result(5), burst: result(6), initial: result(4) }) && scenarioDps(highestValidResult({ peak: result(5), burst: result(6), initial: result(4) })!).value).toBe(6);
  });
  it("builds distinct evidence-based profiles without inventing unsupported Frenzy Charges", () => {
    const build = parsePobXml(examplePobFixture);
    const profiles = buildScenarioProfiles(build, detectConditions(build));
    const byId = Object.fromEntries(profiles.map((profile) => [profile.id, profile]));
    expect(byId.initial.config.usePowerCharges).toBe(true);
    expect(byId.initial.config.useEnduranceCharges).toBe(true);
    expect(byId.initial.config.useFrenzyCharges).toBe(false);
    expect(byId.initial.config.conditionEnemyLowLife).toBe(false);
    expect(byId.peak.config.useFrenzyCharges).toBe(false);
    expect(byId.peak.config.conditionEnemyLowLife).toBe(true);
    expect(byId.peak.config.skillPartCalcs).toBeUndefined();
    expect(byId.peak.config.skillCount).toBeUndefined();
    expect(byId.mapping.config.enemyIsBoss).toBe("None");
    expect(byId.unconditional.config.resetAllConditions).toBe(true);
    expect(byId.unconditional.config.enemyIsBoss).toBe("None");
    expect(byId.sustained.config.enemyIsBoss).toBe("Pinnacle");
    expect(byId.sustained.config.resetAllConditions).toBe(true);
  });
  it("removes manually disabled source-backed conditions from alternate profiles", () => {
    const build = parsePobXml(examplePobFixture);
    const profiles = buildScenarioProfiles(build, detectConditions(build), ["power-charges", "enemy-low-life", "curse-playerCursedWithPunishment"]);
    const byId = Object.fromEntries(profiles.map((profile) => [profile.id, profile]));
    expect(byId.peak.config.usePowerCharges).toBe(false);
    expect(byId.peak.config.conditionEnemyLowLife).toBe(false);
    expect(byId.recommended.config.playerCursedWithPunishment).toBeUndefined();
  });
  it("carries imported skill mode and count into alternate scenarios", () => {
    const build = parsePobXml(`<PathOfBuilding><Build><mainSocketGroup>1</mainSocketGroup></Build><Skills><SkillSet id="1"><Skill mainActiveSkill="1"><Gem nameSpec="Example Skill" name="Example Skill"/></Skill></SkillSet></Skills><Config><Input name="skillPartCalcs" number="2"/><Input name="skillCount" number="4"/></Config></PathOfBuilding>`);
    const profiles = buildScenarioProfiles(build, detectConditions(build));
    const peak = profiles.find((profile) => profile.id === "peak");
    expect(peak?.config.skillPartCalcs).toBe(2);
    expect(peak?.config.skillCount).toBe(4);
  });
});
