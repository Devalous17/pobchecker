import { XMLParser } from "fast-xml-parser";
import type { ImportedStats, NormalizedBuild, PassiveNode, SourceAsset, SourceEntry } from "@/src/types/domain";

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", allowBooleanAttributes: true });
const list = (value: unknown) => Array.isArray(value) ? value : value ? [value] : [];
const attributeColor = (name: string): SourceAsset["attributeColor"] => /support|spell|arcane|sigil|frost|punishment|storm|cloak|brand/i.test(name) ? "int" : /attack|projectile|mark|frenzy|grace/i.test(name) ? "dex" : /slam|strike|endurance|rage|determination/i.test(name) ? "str" : "unknown";
// PoB's XML schema is intentionally open-ended; the parser preserves unknown attributes for later rules.
/* eslint-disable @typescript-eslint/no-explicit-any */
export function parsePobXml(xml: string): NormalizedBuild {
  let doc: any; try { doc = parser.parse(xml); } catch { throw new Error("The PoB XML is malformed."); }
  const root = doc?.PathOfBuilding; if (!root) throw new Error("The export is missing its PathOfBuilding root.");
  const build = root.Build ?? {};
  const config = root.Config ?? {};
  const actualSkillRows = list(root.Skills?.SkillSet).flatMap((set: any) => list(set?.Skill));
  const legacySkillRows = list(root.Skills?.Skill);
  const skillRows = actualSkillRows.length ? actualSkillRows : legacySkillRows;
  const gemRows = actualSkillRows.length ? actualSkillRows.flatMap((skill: any) => list(skill?.Gem)) : legacySkillRows.flatMap((skill: any) => list(skill?.Gem).length ? list(skill?.Gem) : [skill]);
  const skills = gemRows.map((x: any) => String(x?.["@_nameSpec"] ?? x?.["@_name"] ?? "Unnamed gem")).filter((name: string) => name !== "Unnamed gem");
  const items = list(root.Items?.Item).map((x: any) => String(x?.["@_name"] ?? "Unnamed item"));
  const configRows = [...list(config.Input), ...list(config.ConfigSet).flatMap((set: any) => list(set?.Input))];
  const configFields = configRows.map((x: any) => ({ name: String(x?.["@_name"] ?? "unknown"), value: String(x?.["@_value"] ?? x?.["@_boolean"] ?? x?.["@_number"] ?? x?.["@_string"] ?? "") }));
  const enabledConfigs = configFields.filter((field) => /^(true|1|yes)$/i.test(field.value)).map((field) => field.name);
  const ascendancy = String(build?.["@_ascendClassName"] ?? "");
  const rawNodes = list(root.TreeView?.Node ?? root.Tree?.Node);
  const activeSpec = list(root.Tree?.Spec).find((spec: any) => String(spec?.["@_id"] ?? "") === String(root.Tree?.["@_activeSpec"] ?? "1")) ?? list(root.Tree?.Spec)[0];
  const allocatedNodeIds = rawNodes.length ? rawNodes.map((x: any) => String(x?.["@_id"] ?? x?.["@_name"] ?? "")) : String(activeSpec?.["@_nodes"] ?? "").split(",").map((id) => id.trim()).filter(Boolean);
  const passiveNodes: PassiveNode[] = rawNodes.length ? rawNodes.map((x: any) => { const name = String(x?.["@_name"] ?? x?.["@_id"] ?? "Unnamed passive"); const rawType = String(x?.["@_type"] ?? "").toLowerCase(); const type = /ascend/.test(rawType) || /conviction of power/.test(name.toLowerCase()) ? "ascendancy" : /keystone/.test(rawType) ? "keystone" : /notable/.test(rawType) ? "notable" : rawType ? "passive" : "unknown"; return { name, type, allocated: x?.["@_allocated"] !== "false" }; }) : allocatedNodeIds.map((id) => ({ name: id, type: "unknown" as const, allocated: true }));
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
  const playerStats = new Map(list(build.PlayerStat).map((stat: any) => [String(stat?.["@_stat"] ?? ""), Number(stat?.["@_value"])]));
  const fullDpsSkill = root.Build?.FullDPSSkill?.["@_source"] ?? root.Build?.FullDPSSkill?.["@_name"];
  const mainSkill = fullDpsSkill ? String(fullDpsSkill).replace(/^\d+x\s+/i, "") : String(skillRows.find((skill: any) => String(skill?.["@_includeInFullDPS"]) === "true")?.Gem?.["@_nameSpec"] ?? skills[0] ?? "");
  const importedStats: ImportedStats = { source: playerStats.size ? "pob-calcs" : "unavailable", fullDps: playerStats.get("FullDPS"), totalDps: playerStats.get("TotalDPS"), averageHit: playerStats.get("AverageHit"), speed: playerStats.get("Speed"), life: playerStats.get("Life"), energyShield: playerStats.get("EnergyShield"), mana: playerStats.get("Mana"), armour: playerStats.get("Armour"), evasion: playerStats.get("Evasion"), block: playerStats.get("EffectiveBlockChance"), spellBlock: playerStats.get("EffectiveSpellBlockChance"), spellSuppression: playerStats.get("EffectiveSpellSuppressionChance"), effectiveHealthPool: playerStats.get("TotalEHP"), physicalMaximumHit: playerStats.get("PhysicalMaximumHitTaken"), elementalMaximumHit: Math.max(playerStats.get("FireMaximumHitTaken") ?? 0, playerStats.get("ColdMaximumHitTaken") ?? 0, playerStats.get("LightningMaximumHitTaken") ?? 0) || undefined, chaosMaximumHit: playerStats.get("ChaosMaximumHitTaken") };
  const identityName = String(build?.["@_name"] ?? "").trim() || mainSkill || "Unnamed build";
  return { identity: { name: identityName, level: Number(build?.["@_level"]) || undefined, className: build?.["@_className"], ascendancy, version: build?.["@_version"] }, rawXml: xml, sections: Object.keys(root), enabledConfigs, configFields, sources, passiveNodes, skills, items, diagnostics: [], sourceAssets, importedStats, allocatedNodeIds, treeVersion: String(activeSpec?.["@_treeVersion"] ?? "") || undefined };
}
