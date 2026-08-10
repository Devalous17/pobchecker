import { describe, expect, it } from "vitest";
import { calculateBuildQuality } from "../src/features/analysis/quality";
import { parsePobXml } from "../src/features/pob/parse";

describe("build quality rating", () => {
  it("keeps a glass cannon from receiving a high overall grade", () => {
    const build = parsePobXml(`<PathOfBuilding><Build><PlayerStat stat="FullDPS" value="200000000"/><PlayerStat stat="TotalEHP" value="2500"/><PlayerStat stat="PhysicalMaximumHitTaken" value="1800"/></Build></PathOfBuilding>`);
    const quality = calculateBuildQuality(build, []);
    expect(quality.offence.score).toBeGreaterThan(quality.defence.score!);
    expect(quality.overall.score).toBeLessThanOrEqual(5);
    expect(quality.overall.grade).toBe("E");
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
