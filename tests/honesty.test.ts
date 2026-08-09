import { describe, expect, it } from "vitest";
import { parsePobXml } from "../src/features/pob/parse";
import { calculateHonestyScore } from "../src/features/analysis/honesty";
import { detectConditions } from "../src/features/conditions/registry";
describe("honesty score", () => { it("is explainable and bounded", () => { const build=parsePobXml(`<PathOfBuilding><Build/><TreeView><Node name="Arcane Chemistry" type="Notable"/></TreeView><Config><Input name="useFrenzyCharges" value="true"/></Config></PathOfBuilding>`); const score=calculateHonestyScore(build,detectConditions(build)); expect(score.score).toBeGreaterThanOrEqual(1); expect(score.score).toBeLessThanOrEqual(10); expect(score.factors[0].conditionId).toBe("frenzy-charges"); }); });
