import type { SkillGemInfo, SkillSetup } from "@/src/types/domain";

export type DamageChannelKind = "hit" | "damage-over-time" | "combined" | "secondary" | "minion" | "totem" | "trap" | "mine" | "brand" | "unknown";

export interface DamageChannel {
  id: string;
  skillName: string;
  label: string;
  setupId: string;
  setupLabel: string;
  engineIndex?: number;
  kind: DamageChannelKind;
  active: boolean;
  includeInFullDPS: boolean;
  skillPart?: number;
  skillCount?: number;
  evidence: string[];
  confidence: "High" | "Medium" | "Low";
}

const kindFor = (skill: SkillGemInfo, setup: SkillSetup): { kind: DamageChannelKind; evidence: string[]; confidence: DamageChannel["confidence"] } => {
  // Classify the active gem itself. Scanning every gem in the socket group
  // makes a single Totem/DoT support mislabel unrelated active skills.
  const text = `${skill.name} ${skill.displayName ?? ""} ${setup.label} ${skill.detail}`;
  const tags = (skill.tags ?? []).map((tag) => tag.toLowerCase().replace(/-/g, "_")).join(" ");
  const taggedText = `${tags} ${text}`;
  const evidence: string[] = [];
  if (/minion|summon|skeleton|zombie|spectre|golem|absolution|animate|spider|sentinel|srs/i.test(taggedText)) { evidence.push(tags ? `PoB tags identify a minion/summon channel: ${tags}.` : "The skill or setup identifies a minion/summon channel."); return { kind: "minion", evidence, confidence: tags ? "High" : "Medium" }; }
  if (/totem|ballista/i.test(taggedText)) { evidence.push(tags ? `PoB tags identify a totem/ballista channel: ${tags}.` : "The skill or setup identifies a totem/ballista channel."); return { kind: "totem", evidence, confidence: tags ? "High" : "High" }; }
  if (/trap/i.test(taggedText)) { evidence.push(tags ? `PoB tags identify a trap delivery channel: ${tags}.` : "The skill identifies a trap delivery channel."); return { kind: "trap", evidence, confidence: "High" }; }
  if (/mine/i.test(taggedText)) { evidence.push(tags ? `PoB tags identify a mine delivery channel: ${tags}.` : "The skill identifies a mine delivery channel."); return { kind: "mine", evidence, confidence: "High" }; }
  if (/brand/i.test(taggedText)) { evidence.push(tags ? `PoB tags identify a brand channel: ${tags}.` : "The skill identifies a brand channel."); return { kind: "brand", evidence, confidence: "High" }; }
  if (skill.skillPart !== undefined || skill.skillCount !== undefined) { evidence.push("PoB exported an explicit skill part or count for this channel."); return { kind: "secondary", evidence, confidence: "Medium" }; }
  if (/ignite|bleed|poison|burn|wither|decay|essence drain|caustic|righteous fire|contagion|damage_over_time|damage over time|dot/i.test(taggedText)) { evidence.push(tags ? `PoB tags identify a damage-over-time channel: ${tags}.` : "The skill or setup contains a damage-over-time indicator."); return { kind: "damage-over-time", evidence, confidence: tags ? "High" : "Medium" }; }
  evidence.push("Active non-support gem discovered; exact hit/DoT composition remains a PoB worker result.");
  return { kind: "unknown", evidence, confidence: "Low" };
};

export function discoverDamageChannels(setups: SkillSetup[]): DamageChannel[] {
  return setups.flatMap((setup) => setup.gems
    .filter((skill) => skill.enabled && !skill.support && !skill.provided && !skill.trigger)
    .map((skill, index) => {
      const classification = kindFor(skill, setup);
      return {
        id: `${setup.id}:${skill.name}:${index + 1}`,
        skillName: skill.name,
        label: skill.displayName ?? skill.name,
        setupId: setup.id,
        setupLabel: setup.label,
        engineIndex: setup.engineIndex,
        kind: classification.kind,
        active: skill.enabled,
        includeInFullDPS: setup.includeInFullDPS || skill.includeInFullDPS,
        skillPart: skill.skillPart,
        skillCount: skill.skillCount,
        evidence: classification.evidence,
        confidence: classification.confidence,
      } satisfies DamageChannel;
    }));
}
