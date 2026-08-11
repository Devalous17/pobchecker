export type DeliveryKind = "self-cast/attack" | "totem/ballista" | "minion/summon" | "trap" | "mine" | "brand" | "unknown";

export interface SkillCapabilityProfile {
  delivery: DeliveryKind;
  coverageSignals: string[];
  singleTargetSignals: string[];
  evidence: string[];
  confidence: "High" | "Medium" | "Low";
}

export type CapabilityBuild = { mainSkill?: string; skills: string[]; skillSetups: Array<{ includeInFullDPS?: boolean; mainActiveSkill?: boolean; gems: Array<{ name: string; displayName?: string; detail: string; enabled: boolean; support: boolean; provided: boolean; trigger: boolean }> }> };

const unique = (items: string[]) => [...new Set(items)];

export function inferSkillCapabilities(build: CapabilityBuild): SkillCapabilityProfile {
  const mainSetup = build.skillSetups.find((setup) => setup.includeInFullDPS) ?? build.skillSetups.find((setup) => setup.mainActiveSkill) ?? build.skillSetups[0];
  const active = mainSetup?.gems.filter((gem) => gem.enabled && !gem.support && !gem.provided && !gem.trigger) ?? [];
  const mainSetupText = mainSetup?.gems.map((gem) => `${gem.name} ${gem.displayName ?? ""} ${gem.detail}`).join(" ") ?? "";
  const allSetupText = build.skillSetups.flatMap((setup) => setup.gems.map((gem) => `${gem.name} ${gem.displayName ?? ""} ${gem.detail}`)).join(" ");
  const text = `${build.mainSkill ?? ""} ${mainSetupText}`.toLowerCase();
  const deliveryText = `${build.mainSkill ?? ""} ${build.skills.join(" ")} ${allSetupText}`.toLowerCase();
  const delivery: DeliveryKind = /totem|ballista/.test(deliveryText)
    ? "totem/ballista"
    : /minion|summon|skeleton|zombie|spectre|golem|absolution|animate|spider|sentinel|srs/.test(deliveryText)
      ? "minion/summon"
      : /trap/.test(deliveryText)
        ? "trap"
        : /mine/.test(deliveryText)
          ? "mine"
          : /brand/.test(deliveryText)
            ? "brand"
            : active.length || build.mainSkill ? "self-cast/attack" : "unknown";
  const coverageSignals: string[] = [];
  if (/area|aoe|radius|nova|blast|burst|wave|cone|spray|rain|volley|cascade|explosion|explode|detonate|proliferat|secondary|melee splash|ancestral call/.test(text)) coverageSignals.push("Area or secondary coverage");
  if (/projectile|shot|arrow|bolt|orb|spark|ball|rain|volley|multiple projectile|greater multiple|gmp|returning projectile/.test(text)) coverageSignals.push("Projectile coverage");
  if (/chain|fork|bounce|ricochet|pierce|split|spell cascade|unleash/.test(text)) coverageSignals.push("Chain, fork, pierce, or bounce coverage");
  if (/minion|summon|totem|ballista|trap|mine|brand/.test(deliveryText)) coverageSignals.push("Multiple-source delivery");
  if (/ignite|bleed|poison|proliferat|contagion|burn/.test(text)) coverageSignals.push("Damage-over-time spread");
  const singleTargetSignals: string[] = ["Aggregate PoB DPS channel" ];
  if (/concentrated effect|focused|single target|penetration|critical damage|more duration|increased critical|multistrike|faster casting|faster attacks/.test(text)) singleTargetSignals.push("Single-target scaling support");
  if (delivery === "totem/ballista") singleTargetSignals.push("Totem/ballista delivery count is modeled separately");
  if (delivery === "minion/summon") singleTargetSignals.push("Minion output is kept separate from player hit DPS");
  const evidence = [
    active.length ? `Active main setup: ${active.map((gem) => gem.displayName ?? gem.name).join(", ")}.` : "No active main setup was confidently identified.",
    `Delivery model: ${delivery}.`,
    coverageSignals.length ? `Coverage signals: ${unique(coverageSignals).join(", ")}.` : "No direct coverage signal was exported; Clear is estimated conservatively.",
  ];
  return { delivery, coverageSignals: unique(coverageSignals), singleTargetSignals: unique(singleTargetSignals), evidence, confidence: delivery === "unknown" ? "Low" : coverageSignals.length ? "Medium" : "Low" };
}
