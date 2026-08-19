export type DeliveryKind = "self-cast/attack" | "totem/ballista" | "minion/summon" | "trap" | "mine" | "brand" | "channelled" | "triggered" | "ailment/DoT" | "reflected" | "unknown";

export interface SkillCapabilityProfile {
  delivery: DeliveryKind;
  coverageSignals: string[];
  clearSignals: string[];
  singleTargetSignals: string[];
  evidence: string[];
  confidence: "High" | "Medium" | "Low";
}

export type CapabilityBuild = { mainSkill?: string; mainSkillSelection?: { method: string; selectedSkill?: string; selectedDps?: number }; skills: string[]; identity?: { ascendancy?: string; className?: string }; passiveNodes?: Array<{ name: string }>; skillSetups: Array<{ includeInFullDPS?: boolean; mainActiveSkill?: boolean; gems: Array<{ name: string; displayName?: string; detail: string; tags?: string[]; delivery?: string; damageModel?: string; enabled: boolean; support: boolean; provided: boolean; trigger: boolean }> }>; equippedItems?: Array<{ name: string; text: string; baseType?: string }> };

const unique = (items: string[]) => [...new Set(items)];

export function inferSkillCapabilities(build: CapabilityBuild): SkillCapabilityProfile {
  const normalizedMainSkill = build.mainSkillSelection ? (build.mainSkill ?? "").toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  const mainSetup = build.skillSetups.find((setup) => setup.gems.some((gem) => normalizedMainSkill && (gem.name.toLowerCase().replace(/[^a-z0-9]/g, "") === normalizedMainSkill || (gem.displayName ?? "").toLowerCase().replace(/[^a-z0-9]/g, "") === normalizedMainSkill))) ?? build.skillSetups.find((setup) => setup.includeInFullDPS) ?? build.skillSetups.find((setup) => setup.mainActiveSkill) ?? build.skillSetups[0];
  const active = mainSetup?.gems.filter((gem) => gem.enabled && !gem.support && !gem.provided && !gem.trigger) ?? [];
  const mainSetupText = mainSetup?.gems.map((gem) => `${gem.name} ${gem.displayName ?? ""} ${gem.detail}`).join(" ") ?? "";
  const mainSetupTags = mainSetup?.gems.flatMap((gem) => gem.tags ?? []).join(" ") ?? "";
  const mainSetupMetadata = mainSetup?.gems.map((gem) => `${gem.delivery ?? ""} ${gem.damageModel ?? ""}`).join(" ") ?? "";
  const mainItemEvidence = (build.equippedItems ?? []).filter((item) => /socketed|gems? are supported|supported by|additional links?|additional support/i.test(item.text)).map((item) => `${item.name} ${item.baseType ?? ""} ${item.text}`).join(" ");
  const text = `${build.mainSkill ?? ""} ${mainSetupText}`.toLowerCase();
  const passiveEvidence = (build.passiveNodes ?? []).map((node) => node.name).join(" ");
  const deliveryText = `${build.mainSkill ?? ""} ${build.identity?.ascendancy ?? ""} ${mainSetupTags} ${mainSetupMetadata} ${mainSetupText} ${mainItemEvidence} ${passiveEvidence}`.toLowerCase();
  const taggedDelivery = `${mainSetupTags} ${mainSetupMetadata}`.toLowerCase();
  const itemDelivery: DeliveryKind | undefined = /supported by[^.]{0,180}\b(?:spell )?totem\b|socketed gems?[^.]{0,180}\btotem\b|\btotem\b[^.]{0,180}socketed gems?/i.test(mainItemEvidence)
    ? "totem/ballista"
    : /supported by[^.]{0,180}\bballista\b|socketed gems?[^.]{0,180}\bballista\b/i.test(mainItemEvidence)
      ? "totem/ballista"
      : /supported by[^.]{0,180}\btrap\b|socketed gems?[^.]{0,180}\btrap\b/i.test(mainItemEvidence)
        ? "trap"
        : /supported by[^.]{0,180}\bmine\b|socketed gems?[^.]{0,180}\bmine\b/i.test(mainItemEvidence)
          ? "mine"
          : /supported by[^.]{0,180}\bbrand\b|socketed gems?[^.]{0,180}\bbrand\b/i.test(mainItemEvidence)
            ? "brand"
            : undefined;
  const delivery: DeliveryKind = itemDelivery ?? (/reflect/.test(taggedDelivery) || /reflect damage|reflected damage/.test(deliveryText)
    ? "reflected"
    : /totem|ballista/.test(taggedDelivery) || /totem|ballista/.test(deliveryText)
    ? "totem/ballista"
    : /minion|summon/.test(taggedDelivery) || /minion|summon|skeleton|zombie|spectre|golem|absolution|animate|spider|sentinel|srs/.test(deliveryText)
      ? "minion/summon"
      : /trap/.test(taggedDelivery) || /trap/.test(deliveryText)
        ? "trap"
        : /mine/.test(taggedDelivery) || /mine/.test(deliveryText)
          ? "mine"
          : /brand/.test(taggedDelivery) || /brand/.test(deliveryText)
            ? "brand"
            : /channelled|channeling/.test(taggedDelivery) || /channelled|channeling/.test(deliveryText)
              ? "channelled"
              : /triggered|trigger|cast on|when you/.test(taggedDelivery) || mainSetup?.gems.some((gem) => gem.trigger)
                ? "triggered"
                : /damage.?over.?time|damage_over_time|ignite|bleed|poison|burn|contagion|essence drain|righteous fire|caustic/.test(deliveryText)
                  ? "ailment/DoT"
            : active.length || build.mainSkill ? "self-cast/attack" : "unknown");
  const coverageSignals: string[] = [];
  const clearSignals: string[] = [];
  if (/area|aoe|radius|nova|blast|burst|wave|cone|spray|rain|volley|cascade|explosion|explode|detonate|proliferat|secondary|melee splash|ancestral call/.test(text)) coverageSignals.push("Area or secondary coverage");
  if (/projectile|shot|arrow|bolt|orb|spark|ball|rain|volley|multiple projectile|greater multiple|gmp|returning projectile/.test(text)) coverageSignals.push("Projectile coverage");
  if (/chain|fork|bounce|ricochet|pierce|split|spell cascade|unleash/.test(text)) coverageSignals.push("Chain, fork, pierce, or bounce coverage");
  if (/minion|summon|totem|ballista|trap|mine|brand/.test(deliveryText)) coverageSignals.push("Multiple-source delivery");
  if (/ignite|bleed|poison|proliferat|contagion|burn/.test(text)) coverageSignals.push("Damage-over-time spread");
  if (/herald of ice|herald of ash|herald of thunder|profane bloom|occultist|chieftain|explode|explosion|corpse explosion|death.?s oath|righteous fire|righteous fire of|vortex|ground effect|proliferat|contagion|proximity shield/.test(deliveryText)) clearSignals.push("Build-wide clear/explosion or persistent-area evidence");
  if (/chain|fork|bounce|ricochet|pierce|split|projectile|spark|nova|volley|greater multiple|gmp|returning/.test(deliveryText)) clearSignals.push("Projectile or chaining density");
  if (/area|aoe|radius|blast|burst|wave|cone|spray|rain|cascade|secondary|splash/.test(deliveryText)) clearSignals.push("Area-of-effect coverage");
  if (/proliferat|contagion|ignite|bleed|poison|burn|damage over time|dot/.test(deliveryText)) clearSignals.push("Persistent or proliferating damage");
  if (/on kill|killed enemy|recently killed|corpse|shatter|freeze|chilled/.test(deliveryText)) clearSignals.push("On-kill, corpse, freeze, or shatter chaining");
  if (/channelled|channeling/.test(deliveryText)) clearSignals.push("Channelled area or sustained-hit coverage");
  if (/triggered|trigger|cast on|when you/.test(deliveryText)) clearSignals.push("Triggered or automated delivery");
  const singleTargetSignals: string[] = ["Aggregate PoB DPS channel" ];
  if (/concentrated effect|focused|single target|penetration|critical damage|more duration|increased critical|multistrike|faster casting|faster attacks/.test(text)) singleTargetSignals.push("Single-target scaling support");
  if (delivery === "totem/ballista") singleTargetSignals.push("Totem/ballista delivery count is modeled separately");
  if (delivery === "minion/summon") singleTargetSignals.push("Minion output is kept separate from player hit DPS");
  if (delivery === "trap" || delivery === "mine") singleTargetSignals.push("Deployment and detonation uptime are kept visible as delivery limits");
  if (delivery === "brand") singleTargetSignals.push("Brand attachment and recall uptime are kept visible as delivery limits");
  if (delivery === "channelled") singleTargetSignals.push("Channel uptime and movement downtime are kept visible as delivery limits");
  if (delivery === "triggered") singleTargetSignals.push("Trigger frequency and source skill uptime are kept visible as delivery limits");
  const evidence = [
    active.length ? `Active main setup: ${active.map((gem) => gem.displayName ?? gem.name).join(", ")}.` : "No active main setup was confidently identified.",
    `Delivery model: ${delivery}.`,
    mainItemEvidence ? `Unique-item delivery evidence: ${mainItemEvidence}.` : "",
    coverageSignals.length ? `Coverage signals: ${unique(coverageSignals).join(", ")}.` : "No direct coverage signal was exported; Clear is estimated conservatively.",
    clearSignals.length ? `Mapping-specific signals: ${unique(clearSignals).join(", ")}.` : "No explicit mapping-specific signal was found beyond damage and speed.",
  ];
  return { delivery, coverageSignals: unique(coverageSignals), clearSignals: unique(clearSignals), singleTargetSignals: unique(singleTargetSignals), evidence: evidence.filter(Boolean), confidence: delivery === "unknown" ? "Low" : mainItemEvidence || coverageSignals.length || clearSignals.length ? "High" : "Low" };
}
