import { describe, expect, it } from "vitest";
import type { EngineResponse } from "../src/features/engine/protocol";
import { parsePobXml } from "../src/features/pob/parse";
import { selectMainSkillByDps, selectMainSkillFromPoBMarker } from "../src/features/pob/main-skill";

const response = (totalDPS: number, selectedSkill: string): EngineResponse => ({
  engine: { name: "test", version: "1", commit: "x" },
  calculated: true,
  scenario: {},
  selectedSkill,
  offence: { fullDPS: 0, combinedDPS: 0, totalDPS, totalDot: 0 },
  defence: {},
  diagnostics: [],
});

const buildWithStaleMainMarker = () => parsePobXml(`<PathOfBuilding><Build mainSocketGroup="1"><PlayerStat stat="TotalDPS" value="667109"/></Build><Skills><SkillSet id="1"><Skill enabled="true" mainActiveSkill="1" slot="Weapon 1"><Gem nameSpec="Lightning Warp" name="Lightning Warp"/><Gem nameSpec="Faster Casting" name="Faster Casting" isSupport="true"/><Gem nameSpec="Inspiration" name="Inspiration"/></Skill><Skill enabled="true" slot="Gloves"><Gem nameSpec="Spark" name="Spark"/><Gem nameSpec="Arcane Surge" name="Arcane Surge" isSupport="true"/><Gem nameSpec="Spell Echo" name="Spell Echo"/></Skill></SkillSet></Skills></PathOfBuilding>`);

describe("main skill selection", () => {
  it("selects the highest-DPS active gem instead of trusting a stale mainActiveSkill marker", async () => {
    const build = buildWithStaleMainMarker();
    const selected = await selectMainSkillByDps(build, async (candidate) => candidate.gem.name === "Spark" ? response(5_000_000, "Spark") : response(104_000, "Lightning Warp"));

    expect(selected.mainSkill).toBe("Spark");
    expect(selected.mainSkillSelection?.method).toBe("worker-dps");
    expect(selected.mainSkillSelection?.selectedDps).toBe(5_000_000);
    expect(selected.mainSkillSelection?.selectedHitDps).toBe(5_000_000);
    expect(selected.damageChannels.find((channel) => channel.skillName === "Spark")?.includeInFullDPS).toBe(true);
    expect(selected.damageChannels.find((channel) => channel.skillName === "Lightning Warp")?.includeInFullDPS).toBe(false);
  });

  it("uses the PoB Include in Full DPS marker as the imported main-skill identity", () => {
    const build = buildWithStaleMainMarker();
    const selected = selectMainSkillFromPoBMarker(build);

    expect(selected.mainSkill).toBe("Lightning Warp");
    expect(selected.mainSkillSelection?.method).toBe("pob-marker");
    expect(selected.mainSkillSelection?.reason).toMatch(/Include in Full DPS/i);
  });

  it("does not select the first utility gem when PoB identifies the second active gem", () => {
    const build = parsePobXml(`<PathOfBuilding><Build><FullDPSSkill source="Storm Burst of Repulsion" /></Build><Skills><SkillSet id="1"><Skill enabled="true" includeInFullDPS="true" mainActiveSkill="2" slot="Gloves"><Gem nameSpec="Decoy Totem" name="Decoy Totem"/><Gem nameSpec="Storm Burst of Repulsion" name="Storm Burst"/></Skill></SkillSet></Skills></PathOfBuilding>`);
    const selected = selectMainSkillFromPoBMarker(build);

    expect(selected.mainSkill).toBe("Storm Burst of Repulsion");
    expect(selected.mainSkillSelection?.selectedSkill).toBe("Storm Burst of Repulsion");
  });

  it("uses metadata safeguards instead of trusting a stale marker when the worker has no positive result", async () => {
    const parsed = buildWithStaleMainMarker();
    const build = {
      ...parsed,
      skillSetups: parsed.skillSetups.map((setup) => ({
        ...setup,
        gems: setup.gems.map((gem) => gem.name === "Lightning Warp"
          ? { ...gem, tags: ["area", "duration", "grants_active_skill", "lightning", "movement", "spell", "travel"], damageModel: "hit-or-secondary" }
          : gem.name === "Spark"
            ? { ...gem, tags: ["duration", "grants_active_skill", "lightning", "projectile", "spell"], damageModel: "hit-or-secondary" }
            : gem),
      })),
    };
    const selected = await selectMainSkillByDps(build, async () => response(0, "Spark"));

    expect(selected.mainSkill).toBe("Spark");
    expect(selected.mainSkillSelection?.method).toBe("fallback");
    expect(selected.mainSkillSelection?.comparedCandidates.map((candidate) => candidate.skillName)).toEqual(["Lightning Warp", "Spark"]);
    expect(selected.mainSkillSelection?.warnings[0]).toMatch(/no positive worker result/i);
  });

  it("rejects a positive stale aggregate when the worker identifies another skill", async () => {
    const build = buildWithStaleMainMarker();
    const selected = await selectMainSkillByDps(build, async (candidate) => candidate.gem.name === "Spark"
      ? response(667_109, "Lightning Warp")
      : response(104_000, "Spark"));

    expect(selected.mainSkillSelection?.method).toBe("fallback");
    expect(selected.mainSkillSelection?.selectedSkill).toBe("Lightning Warp");
    expect(selected.mainSkillSelection?.selectedDps).toBeUndefined();
    expect(selected.mainSkillSelection?.comparedCandidates.every((candidate) => candidate.status === "zero")).toBe(true);
  });

  it("ignores a Tree-provided triggered skill when a socketed skill is also marked active", () => {
    const build = parsePobXml(`<PathOfBuilding><Build><PlayerStat stat="TotalDPS" value="5000000"/></Build><Skills><SkillSet id="1"><Skill enabled="true" mainActiveSkill="1" mainActiveSkillCalcs="1" source="Tree:35011"><Gem nameSpec="" skillId="SummonSpectralTiger" skillMinion="SummonedSpectralTiger"/></Skill><Skill enabled="true" mainActiveSkill="1" mainActiveSkillCalcs="1" slot="Gloves"><Gem nameSpec="Spark of the Nova" name="Spark"/></Skill></SkillSet></Skills></PathOfBuilding>`);
    const selected = selectMainSkillFromPoBMarker(build);

    expect(build.skillSetups[0].gems[0].provided).toBe(true);
    expect(build.skillSetups[0].gems[0].trigger).toBe(true);
    expect(selected.mainSkill).toBe("Spark of the Nova");
  });
});
