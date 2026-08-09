import { XMLParser } from "fast-xml-parser";
import type { ImportedStats, NormalizedBuild, PassiveNode, SourceAsset, SourceEntry } from "@/src/types/domain";

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", allowBooleanAttributes: true });
const list = (value: unknown) => Array.isArray(value) ? value : value ? [value] : [];
const attributeColor = (name: string): SourceAsset["attributeColor"] => /support|spell|arcane|sigil|frost|punishment|storm|cloak/i.test(name) ? "int" : /attack|projectile|mark|frenzy/i.test(name) ? "dex" : /slam|strike|endurance|rage/i.test(name) ? "str" : "unknown";
function findNumber(value: unknown, names: RegExp): number | undefined { if (!value || typeof value !== "object") return undefined; for (const [key, child] of Object.entries(value as Record<string, unknown>)) { if (names.test(key)) { const number = Number(child); if (Number.isFinite(number)) return number; } const nested = findNumber(child, names); if (nested !== undefined) return nested; } return undefined; }
// PoB's XML schema is intentionally open-ended; the parser preserves unknown attributes for later rules.
/* eslint-disable @typescript-eslint/no-explicit-any */
export function parsePobXml(xml: string): NormalizedBuild {
  let doc: any; try { doc = parser.parse(xml); } catch { throw new Error("The PoB XML is malformed."); }
  const root = doc?.PathOfBuilding; if (!root) throw new Error("The export is missing its PathOfBuilding root.");
  const build = root.Build ?? {};
  const config = root.Config ?? {};
  const skillRows = list(root.Skills?.Skill);
  const skills = skillRows.map((x: any) => String(x?.["@_name"] ?? x?.Gem?.["@_name"] ?? "Unnamed skill"));
  const items = list(root.Items?.Item).map((x: any) => String(x?.["@_name"] ?? "Unnamed item"));
  const configFields = list(config.Input).map((x: any) => ({ name: String(x?.["@_name"] ?? "unknown"), value: String(x?.["@_value"] ?? "") }));
  const enabledConfigs = configFields.filter((field) => /^(true|1|yes)$/i.test(field.value)).map((field) => field.name);
  const ascendancy = String(build?.["@_ascendClassName"] ?? "");
  const rawNodes = list(root.TreeView?.Node ?? root.Tree?.Node);
  const passiveNodes: PassiveNode[] = rawNodes.map((x: any) => { const name = String(x?.["@_name"] ?? x?.["@_id"] ?? "Unnamed passive"); const rawType = String(x?.["@_type"] ?? "").toLowerCase(); const type = /ascend/.test(rawType) || /conviction of power/.test(name.toLowerCase()) ? "ascendancy" : /keystone/.test(rawType) ? "keystone" : /notable/.test(rawType) ? "notable" : rawType ? "passive" : "unknown"; return { name, type, allocated: x?.["@_allocated"] !== "false" }; });
  const nodes = passiveNodes.map((node) => node.name);
  const sources: SourceEntry[] = [
    ...skills.map((name) => ({ category: "gem" as const, name, detail: "Skill listed in the imported Skills section." })),
    ...items.map((name) => ({ category: /flask/i.test(name) ? "flask" as const : "item" as const, name, detail: "Item listed in the imported Items section." })),
    ...nodes.map((name) => ({ category: /conviction of power/i.test(name) ? "ascendancy" as const : "passive" as const, name, detail: "Node listed in the imported tree data." })),
    ...(ascendancy ? [{ category: "ascendancy" as const, name: ascendancy, detail: "Ascendancy recorded on the build." }] : []),
    ...configFields.map((field) => ({ category: "configuration" as const, name: field.name, detail: `Configured value: ${field.value || "present"}` })),
  ];
  const sourceAssets: SourceAsset[] = [
    ...skills.map((name) => ({ category: "gem" as const, name, detail: "Gem listed in the imported Skills section.", attributeColor: attributeColor(name) })),
    ...items.map((name) => ({ category: /flask/i.test(name) ? "flask" as const : "item" as const, name, detail: "Item listed in the imported Items section.", attributeColor: "unknown" as const })),
    ...passiveNodes.filter((node) => node.type !== "passive").map((node) => ({ category: node.type === "ascendancy" ? "ascendancy" as const : "passive" as const, name: node.name, detail: "Allocated tree node in the imported build.", attributeColor: "unknown" as const })),
  ];
  const calcs = root.Calcs;
  const importedStats: ImportedStats = { source: calcs && Object.keys(calcs).length ? "pob-calcs" : "unavailable", totalDps: findNumber(calcs, /totaldps|total_dps/i), hitDps: findNumber(calcs, /hitdps|hit_dps/i), life: findNumber(calcs, /^life$/i), energyShield: findNumber(calcs, /energyshield|energy_shield/i), mana: findNumber(calcs, /^mana$/i), armour: findNumber(calcs, /^armour$/i), evasion: findNumber(calcs, /^evasion$/i), block: findNumber(calcs, /^block$/i), spellBlock: findNumber(calcs, /spellblock|spell_block/i), spellSuppression: findNumber(calcs, /spellsuppression|spell_suppression/i), effectiveHealthPool: findNumber(calcs, /effectivehealthpool|effective_health_pool/i) };
  return { identity: { name: String(build?.["@_name"] ?? "Unnamed build"), level: Number(build?.["@_level"]) || undefined, className: build?.["@_className"], ascendancy, version: build?.["@_version"] }, rawXml: xml, sections: Object.keys(root), enabledConfigs, configFields, sources, passiveNodes, skills, items, diagnostics: [], sourceAssets, importedStats };
}
