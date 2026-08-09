export type Confidence = "High" | "Medium" | "Low" | "Unknown";
export type Reliability = "Reliable" | "Conditional" | "Situational" | "Temporary" | "Mapping-only" | "Ramp-dependent" | "Unverified" | "Invalid";

export interface BuildIdentity { name: string; level?: number; className?: string; ascendancy?: string; version?: string; }
export interface SourceEntry { category: "gem" | "item" | "passive" | "ascendancy" | "flask" | "configuration"; name: string; detail: string; }
export interface PassiveNode { id?: string; name: string; type: "notable" | "keystone" | "ascendancy" | "passive" | "unknown"; allocated: boolean; x?: number; y?: number; links?: string[]; iconUrl?: string; stats?: string[]; }
export interface TreeGraphNode extends PassiveNode { id: string; }
export interface SourceAsset { category: "gem" | "item" | "flask" | "passive" | "ascendancy"; name: string; detail: string; iconUrl?: string; attributeColor: "int" | "dex" | "str" | "hybrid" | "unknown"; }
export interface ImportedStats { source: "pob-calcs" | "unavailable"; fullDps?: number; totalDps?: number; averageDps?: number; averageHit?: number; speed?: number; life?: number; energyShield?: number; mana?: number; armour?: number; evasion?: number; block?: number; spellBlock?: number; spellSuppression?: number; effectiveHealthPool?: number; physicalMaximumHit?: number; elementalMaximumHit?: number; chaosMaximumHit?: number; }
export interface NormalizedBuild {
  identity: BuildIdentity;
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
  importedStats: ImportedStats;
  allocatedNodeIds: string[];
  treeVersion?: string;
  treeGraph?: TreeGraphNode[];
}
export interface ConditionEvidence { kind: "configuration" | "skill" | "item" | "passive" | "ascendancy" | "xml"; label: string; detail: string; }
export interface Condition {
  id: string; displayName: string; category: "offence" | "defence" | "both"; source?: string; sourceDetected: boolean;
  activationRequirement: string; activationTime?: number; duration?: number; cooldown?: number; rampTime?: number;
  reliability: Reliability; confidence: Confidence; explanation: string; pobField?: string; statsAffected: string[]; evidence: ConditionEvidence[]; configured: boolean; availability: "available" | "conditional" | "unverified" | "unavailable";
}
