import { describe, expect, it } from "vitest";
import { detectConditions } from "../src/features/conditions/registry";
import { buildReport } from "../src/features/analysis/report";
import { parsePobXml } from "../src/features/pob/parse";

describe("report source summaries", () => {
  it("summarizes allocated ascendancy nodes without core-tree notables", () => {
    const build = parsePobXml(`<PathOfBuilding><Build ascendClassName="Hierophant"/><TreeView>
      <Node id="core" name="Arcane Chemistry" type="Notable" allocated="true"/>
      <Node id="key" name="Mind Over Matter" type="Keystone" allocated="true"/>
      <Node id="asc" name="Conviction of Power" type="Ascendancy" allocated="true"/>
    </TreeView></PathOfBuilding>`);

    const report = buildReport(build, detectConditions(build));

    expect(report.topNotables.map((node) => node.name)).toEqual(["Conviction of Power"]);
  });
});
