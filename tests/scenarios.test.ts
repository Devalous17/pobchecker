import { describe, expect, it } from "vitest";
import { weightedAverageDps } from "../src/features/scenarios/timeline";
import { buildScenarioReport } from "../src/features/scenarios/report";

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
});
