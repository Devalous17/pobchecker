import { describe, expect, it } from "vitest";
import { inferSkillCapabilities } from "../src/features/analysis/capabilities";

const setup = (names: string[]) => ({
  id: "main",
  label: "Main setup",
  enabled: true,
  includeInFullDPS: true,
  mainActiveSkill: true,
  gems: names.map((name) => ({ name, displayName: name, attributeColor: "unknown" as const, detail: "Imported active skill", support: /support|chain|projectile|area/i.test(name), trigger: false, provided: false, enabled: true, includeInFullDPS: false })),
});

describe("universal skill capabilities", () => {
  it("detects generic projectile and chaining coverage without skill-specific rules", () => {
    const profile = inferSkillCapabilities({ mainSkill: "Example Projectile Skill", skills: ["Example Projectile Skill", "Chain Support"], skillSetups: [setup(["Example Projectile Skill", "Chain Support"])] });
    expect(profile.coverageSignals).toEqual(expect.arrayContaining(["Projectile coverage", "Chain, fork, pierce, or bounce coverage"]));
    expect(profile.delivery).toBe("self-cast/attack");
  });

  it("detects delivery categories for totems and minions", () => {
    expect(inferSkillCapabilities({ mainSkill: "Example", skills: ["Spell Totem Support"], skillSetups: [setup(["Example", "Spell Totem Support"])] }).delivery).toBe("totem/ballista");
    expect(inferSkillCapabilities({ mainSkill: "Example", skills: ["Raise Skeleton"], skillSetups: [setup(["Raise Skeleton"])] }).delivery).toBe("minion/summon");
  });

  it("recognizes item-granted Spell Totem support", () => {
    const profile = inferSkillCapabilities({
      mainSkill: "Storm Burst of Repulsion",
      skills: ["Storm Burst"],
      skillSetups: [setup(["Storm Burst of Repulsion"])],
      equippedItems: [{ name: "Soul Mantle", baseType: "Spidersilk Robe", text: "Socketed Gems are Supported by Level 20 Spell Totem" }],
    });
    expect(profile.delivery).toBe("totem/ballista");
    expect(profile.evidence.some((item) => item.includes("Soul Mantle"))).toBe(true);
  });

  it("uses the main setup for coverage instead of unrelated utility skills", () => {
    const main = setup(["Heavy Strike"]);
    const utility = { ...setup(["Projectile Utility"]), includeInFullDPS: false, mainActiveSkill: false };
    const profile = inferSkillCapabilities({ mainSkill: "Heavy Strike", skills: ["Heavy Strike", "Projectile Utility"], skillSetups: [main, utility] });
    expect(profile.coverageSignals).not.toContain("Projectile coverage");
  });

  it("separates mapping mechanics from boss-only damage", () => {
    const profile = inferSkillCapabilities({
      mainSkill: "Spark of the Nova",
      identity: { ascendancy: "Occultist" },
      passiveNodes: [{ name: "Profane Bloom" }],
      skills: ["Spark of the Nova", "Herald of Ice"],
      skillSetups: [setup(["Spark of the Nova", "Herald of Ice", "Greater Multiple Projectiles", "Chain Support"])],
    });
    expect(profile.clearSignals).toEqual(expect.arrayContaining([
      "Build-wide clear/explosion or persistent-area evidence",
      "Projectile or chaining density",
    ]));
  });
});
