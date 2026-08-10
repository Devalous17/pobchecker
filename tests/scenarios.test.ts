import { describe, expect, it } from "vitest";
import { weightedAverageDps } from "../src/features/scenarios/timeline";
import { buildScenarioReport } from "../src/features/scenarios/report";
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
    expect(byId.mapping.config.enemyIsBoss).toBe("None");
    expect(byId.unconditional.config.resetAllConditions).toBe(true);
    expect(byId.unconditional.config.enemyIsBoss).toBe("None");
  });
});
