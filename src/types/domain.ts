export type Confidence = "High" | "Medium" | "Low" | "Unknown";
export type Reliability = "Reliable" | "Conditional" | "Situational" | "Temporary" | "Mapping-only" | "Ramp-dependent" | "Unverified" | "Invalid";
export type QualityGrade = "S" | "A" | "B" | "C" | "D" | "E" | "F";

export interface BuildIdentity { name: string; level?: number; className?: string; ascendancy?: string; version?: string; }
export interface SourceEntry { category: "gem" | "item" | "passive" | "ascendancy" | "flask" | "configuration"; name: string; detail: string; }
export interface PassiveNode { id?: string; name: string; type: "notable" | "keystone" | "ascendancy" | "passive" | "unknown"; allocated: boolean; x?: number; y?: number; links?: string[]; iconUrl?: string; stats?: string[]; source?: "core-tree" | "cluster-jewel" | "ascendancy" | "unknown"; }
export interface TreeGraphNode extends PassiveNode { id: string; }
export interface SourceAsset { category: "gem" | "item" | "flask" | "passive" | "ascendancy"; name: string; detail: string; iconUrl?: string; attributeColor: "int" | "dex" | "str" | "hybrid" | "unknown"; }
export interface SkillGemInfo {
  name: string;
  displayName?: string;
  level?: number;
  quality?: number;
  attributeColor: SourceAsset["attributeColor"];
  detail: string;
  iconUrl?: string;
  support: boolean;
  trigger: boolean;
  provided: boolean;
  enabled: boolean;
  includeInFullDPS: boolean;
  metadataSource?: "pob" | "xml" | "unknown";
  tags?: string[];
  skillPart?: number;
  skillCount?: number;
}
export interface SkillSetup {
  id: string;
  engineIndex?: number;
  label: string;
  slot?: string;
  enabled: boolean;
  includeInFullDPS: boolean;
  mainActiveSkill?: boolean;
  gems: SkillGemInfo[];
}
export type { DamageChannel, DamageChannelKind } from "@/src/features/pob/channels";
export type { SkillCapabilityProfile } from "@/src/features/analysis/capabilities";
export interface EquippedItemInfo {
  id?: string;
  slot: string;
  name: string;
  rarity?: string;
  baseType?: string;
  text: string;
  iconUrl?: string;
  corrupted?: boolean;
  links?: string;
  isFlask: boolean;
}
export interface ImportedStats {
  source: "pob-calcs" | "unavailable";
  fullDps?: number;
  totalDps?: number;
  totalDotDps?: number;
  combinedDps?: number;
  averageDps?: number;
  averageHit?: number;
  criticalStrikeChance?: number;
  criticalStrikeMultiplier?: number;
  speed?: number;
  life?: number;
  energyShield?: number;
  mana?: number;
  armour?: number;
  evasion?: number;
  ward?: number;
  block?: number;
  spellBlock?: number;
  spellSuppression?: number;
  fireResistance?: number;
  coldResistance?: number;
  lightningResistance?: number;
  chaosResistance?: number;
  effectiveHealthPool?: number;
  physicalMaximumHit?: number;
  fireMaximumHit?: number;
  coldMaximumHit?: number;
  lightningMaximumHit?: number;
  elementalMaximumHit?: number;
  chaosMaximumHit?: number;
  lifeRegen?: number;
  lifeLeechRate?: number;
  energyShieldRecoveryCap?: number;
  energyShieldRegen?: number;
  energyShieldLeechRate?: number;
  manaRegen?: number;
  manaLeechRate?: number;
  lifeRecoveryRate?: number;
  energyShieldRecoveryRate?: number;
  manaRecoveryRate?: number;
  lifeRecoup?: number;
  manaRecoup?: number;
  lifeOnHit?: number;
  manaOnHit?: number;
  lifeOnKill?: number;
  manaOnKill?: number;
  energyShieldOnHit?: number;
  energyShieldOnKill?: number;
  enduranceCharges?: number;
}
export interface QualityRating { score: number | null; grade: QualityGrade | "?"; label: string; confidence: Confidence; basis: string[]; }
export interface RatingDpsEvidence { value: number | null; label: string; origin: "imported" | "worker-typical" | "worker-configured" | "unavailable"; explanation: string; importedValue?: number; differencePercent: number; verification: "not-run" | "matched" | "mismatch"; }
export type OverviewRatingKey = "dps" | "clear" | "defence" | "bossing";
export type OverviewRatings = Record<OverviewRatingKey, QualityRating>;
export interface BuildQuality { overall: QualityRating; offence: QualityRating; defence: QualityRating; categoryRatings: OverviewRatings; capabilityProfile: import("@/src/features/analysis/capabilities").SkillCapabilityProfile; ratingDps: RatingDpsEvidence; assumptions: string[]; limitations: string[]; }
export type LayerSide = "offence" | "defence";
export type LayerSnapshotState = "baseline" | "typical" | "peak";
export interface LayerSnapshot {
  state: LayerSnapshotState;
  value?: number;
  status: "calculated" | "unavailable";
  source: string;
  conditions: string[];
  assumptions: string[];
}
export interface BuildLayerFinding {
  id: string;
  side: LayerSide;
  category: string;
  name: string;
  rating: QualityRating;
  evidence: string[];
  conditions: string[];
  weaknesses: string[];
  verdict: string;
  snapshots: LayerSnapshot[];
  comparisons?: {
    name: string;
    withDps: number | null;
    withoutDps: number | null;
    deltaDps: number | null;
    status: "calculated" | "estimated" | "unavailable";
    confidence: Confidence;
    explanation: string;
  }[];
}
export interface BuildLayerGroup {
  rating: QualityRating;
  findings: BuildLayerFinding[];
}
export interface BuildLayerAnalysis {
  offence: BuildLayerGroup;
  defence: BuildLayerGroup;
  assumptions: string[];
  limitations: string[];
}
export interface NormalizedBuild {
  identity: BuildIdentity;
  mainSkill?: string;
  rawXml: string;
  sections: string[];
  enabledConfigs: string[];
  configFields: { name: string; value: string }[];
  sources: SourceEntry[];
  passiveNodes: PassiveNode[];
  skills: string[];
  items: string[];
  diagnostics: string[];
  sourceAssets: SourceAsset[];
  skillSetups: SkillSetup[];
  damageChannels: import("@/src/features/pob/channels").DamageChannel[];
  equippedItems: EquippedItemInfo[];
  importedStats: ImportedStats;
  allocatedNodeIds: string[];
  treeVersion?: string;
  treeGraph?: TreeGraphNode[];
}
export interface PoeNinjaComparison {
  url: string;
  account?: string;
  character?: string;
  league?: string;
  level?: number;
  className?: string;
  skills?: string[];
  items?: string[];
  stats?: Record<string, number | string | null>;
  source: "poe-ninja" | "unavailable";
  diagnostics: string[];
}
export interface ConditionEvidence { kind: "configuration" | "skill" | "item" | "passive" | "ascendancy" | "xml"; label: string; detail: string; }
export interface Condition {
  id: string; displayName: string; category: "offence" | "defence" | "both"; source?: string; sourceDetected: boolean;
  activationRequirement: string; activationTime?: number; duration?: number; cooldown?: number; rampTime?: number;
  reliability: Reliability; confidence: Confidence; explanation: string; pobField?: string; statsAffected: string[]; evidence: ConditionEvidence[]; configured: boolean; availability: "available" | "conditional" | "unverified" | "unavailable";
}
