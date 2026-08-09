import { XMLParser } from "fast-xml-parser";
import type {
  EquippedItemInfo,
  ImportedStats,
  NormalizedBuild,
  PassiveNode,
  SkillGemInfo,
  SkillSetup,
  SourceAsset,
  SourceEntry,
} from "@/src/types/domain";

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", allowBooleanAttributes: true });
const list = (value: unknown) => Array.isArray(value) ? value : value ? [value] : [];
const asBool = (value: unknown) => /^(true|1|yes)$/i.test(String(value ?? ""));
const asNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const fallbackGemColors: Record<string, SourceAsset["attributeColor"]> = {
  "Storm Burst": "int", "Storm Burst of Repulsion": "int", "More Duration": "str", "Increased Critical Damage": "int",
  "Lightning Penetration": "int", "Infused Channelling": "int", Inspiration: "dex", Punishment: "str", "Sigil of Power": "int",
  "Frost Shield": "int", "Arcane Cloak": "int", "Assassin's Mark": "int",
};
const knownSupportGems = new Set(["More Duration", "Increased Critical Damage", "Lightning Penetration", "Infused Channelling", "Inspiration"]);

const attributeColor = (name: string, gem?: Record<string, unknown>): SourceAsset["attributeColor"] => {
  const raw = String(gem?.["@_colour"] ?? gem?.["@_color"] ?? gem?.["@_attribute"] ?? "").toLowerCase();
  if (/blue|intelligence|^b$/.test(raw)) return "int";
  if (/green|dexterity|^g$/.test(raw)) return "dex";
  if (/red|strength|^r$/.test(raw)) return "str";
  if (/b.*g|g.*b/.test(raw)) return "hybrid";
  return fallbackGemColors[name.replace(/ support$/i, "")] ?? "unknown";
};

/* eslint-disable @typescript-eslint/no-explicit-any */
const itemTextLines = (item: any): string[] => {
  if (typeof item === "string") return item.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const direct = String(item?.["#text"] ?? "");
  if (direct) return direct.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return [item?.Rarity, item?.Name, item?.BaseType, item?.name, item?.baseType].map((value) => String(value ?? "").trim()).filter(Boolean);
};
const itemEvidence = (item: any) => itemTextLines(item).slice(0, 12).join(" ") || (JSON.stringify(item) ?? "").slice(0, 900);
const itemDisplayName = (item: any) => {
  const direct = String(item?.["@_name"] ?? item?.["@_nameSpec"] ?? item?.Name ?? item?.name ?? "").trim();
  if (direct) return direct;
  const lines = itemTextLines(item);
  const rarityIndex = lines.findIndex((line) => /^rarity\s*:/i.test(line));
  const afterRarity = rarityIndex >= 0 ? lines[rarityIndex + 1] : "";
  const baseType = String(item?.BaseType ?? item?.baseType ?? "").trim();
  return afterRarity || baseType || lines.find((line) => !/^(rarity|item class|requirements|level|quality)\s*:/i.test(line)) || "";
};
const itemRarity = (item: any) => String(item?.["@_rarity"] ?? item?.Rarity ?? "").trim() || undefined;
const itemBaseType = (item: any) => String(item?.["@_baseType"] ?? item?.BaseType ?? item?.baseType ?? "").trim() || undefined;

const gemInfo = (gem: any, skill: any): SkillGemInfo | null => {
  const name = String(gem?.["@_nameSpec"] ?? gem?.["@_name"] ?? "").trim();
  if (!name) return null;
  const displayName = String(gem?.["@_name"] ?? "").trim() || undefined;
  const level = asNumber(gem?.["@_level"]);
  const quality = asNumber(gem?.["@_quality"]);
  const support = asBool(gem?.["@_isSupport"] ?? gem?.["@_support"]) || knownSupportGems.has(displayName ?? name);
  const trigger = asBool(skill?.["@_trigger"] ?? skill?.["@_triggered"] ?? gem?.["@_trigger"] ?? gem?.["@_triggered"]);
  const provided = asBool(gem?.["@_isProvided"] ?? gem?.["@_provided"]) || /item provided/i.test(String(gem?.["@_name"] ?? ""));
  const enabled = gem?.["@_enabled"] === undefined ? asBool(skill?.["@_enabled"] ?? true) : asBool(gem?.["@_enabled"]);
  const includeInFullDPS = asBool(gem?.["@_includeInFullDPS"] ?? skill?.["@_includeInFullDPS"]);
  const color = attributeColor(name, gem);
  const detail = [
    level === undefined ? undefined : `Level ${level}${quality === undefined ? "" : ` / ${quality}% quality`}`,
    support ? "Support gem" : "Active skill",
    trigger ? "Triggered or automated" : undefined,
    provided ? "Provided by an item or passive" : undefined,
    includeInFullDPS ? "Included in Full DPS" : undefined,
  ].filter(Boolean).join(" · ") || "Imported from the PoB skill setup.";
  return { name, displayName, level, quality, attributeColor: color, detail, support, trigger, provided, enabled, includeInFullDPS };
};

const parseSkillSetups = (root: any): SkillSetup[] => {
  const sets = list(root.Skills?.SkillSet);
  const setEntries = sets.length ? sets : [{ "@_id": "legacy", Skill: list(root.Skills?.Skill) }];
  return setEntries.flatMap((set: any, setIndex) => {
    const skills = list(set?.Skill);
    const setupRows = skills.length ? skills : list(root.Skills?.Skill);
    return setupRows.map((skill: any, skillIndex) => {
      const gemRows = list(skill?.Gem).length ? list(skill?.Gem) : [skill];
      const gems = gemRows.map((gem) => gemInfo(gem, skill)).filter((gem): gem is SkillGemInfo => Boolean(gem));
      const slot = String(skill?.["@_slot"] ?? skill?.["@_itemSlot"] ?? "").trim() || undefined;
      const explicitLabel = String(skill?.["@_label"] ?? skill?.["@_name"] ?? "").trim();
      const label = explicitLabel || slot || `Skill setup ${set?.["@_id"] ?? setIndex + 1}.${skillIndex + 1}`;
      return { id: `${set?.["@_id"] ?? setIndex + 1}-${skillIndex + 1}`, label, slot, enabled: skill?.["@_enabled"] === undefined ? true : asBool(skill?.["@_enabled"]), includeInFullDPS: asBool(skill?.["@_includeInFullDPS"]) || gems.some((gem) => gem.includeInFullDPS), gems } satisfies SkillSetup;
    }).filter((setup) => setup.gems.length);
  });
};

const parseEquippedItems = (root: any): EquippedItemInfo[] => {
  const itemRows = list(root.Items?.Item);
  const itemById = new Map(itemRows.map((item: any) => [String(item?.["@_id"] ?? ""), item]));
  const itemSets = list(root.Items?.ItemSet);
  const activeItemSet = itemSets.find((set: any) => String(set?.["@_id"] ?? "") === String(root.Items?.["@_activeItemSet"] ?? "1")) ?? itemSets[0];
  const slots = list(activeItemSet?.Slot);
  const entries = slots.length
    ? slots.map((slot: any) => ({ item: itemById.get(String(slot?.["@_itemId"] ?? "")), slot: String(slot?.["@_name"] ?? slot?.["@_slot"] ?? "Equipped") }))
    : itemRows.map((item: any) => ({ item, slot: String(item?.["@_slot"] ?? "Equipped") }));
  return entries.filter(({ item }) => Boolean(item)).map(({ item, slot }) => {
    const name = itemDisplayName(item);
    const baseType = itemBaseType(item);
    const text = itemEvidence(item);
    const isFlask = /flask/i.test(slot) || /flask/i.test(name) || /flask/i.test(baseType ?? "");
    return { id: String(item?.["@_id"] ?? "") || undefined, slot, name, rarity: itemRarity(item), baseType, text, iconUrl: String(item?.["@_icon"] ?? item?.Icon ?? "").trim() || undefined, corrupted: asBool(item?.["@_corrupted"] ?? item?.Corrupted), links: String(item?.["@_links"] ?? item?.Links ?? "").trim() || undefined, isFlask } satisfies EquippedItemInfo;
  }).filter((item) => item.name);
};

// PoB's XML schema is intentionally open-ended; the parser preserves unknown attributes for later rules.
export function parsePobXml(xml: string): NormalizedBuild {
  let doc: any; try { doc = parser.parse(xml); } catch { throw new Error("The PoB XML is malformed."); }
  const root = doc?.PathOfBuilding; if (!root) throw new Error("The export is missing its PathOfBuilding root.");
  const build = root.Build ?? {};
  const config = root.Config ?? {};
  const skillSetups = parseSkillSetups(root);
  const skillRows = skillSetups.flatMap((setup) => setup.gems);
  const skills = skillRows.map((entry) => entry.name);
  const equippedItems = parseEquippedItems(root);
  const items = equippedItems.filter((item) => !item.isFlask).map((item) => item.name);
  const flasks = equippedItems.filter((item) => item.isFlask).map((item) => item.name);
  const configRows = [...list(config.Input), ...list(config.ConfigSet).flatMap((set: any) => list(set?.Input))];
  const configFields = configRows.map((x: any) => ({ name: String(x?.["@_name"] ?? "unknown"), value: String(x?.["@_value"] ?? x?.["@_boolean"] ?? x?.["@_number"] ?? x?.["@_string"] ?? "") }));
  const enabledConfigs = configFields.filter((field) => /^(true|1|yes)$/i.test(field.value)).map((field) => field.name);
  const ascendancy = String(build?.["@_ascendClassName"] ?? "");
  const rawNodes = list(root.TreeView?.Node ?? root.Tree?.Node);
  const activeSpec = list(root.Tree?.Spec).find((spec: any) => String(spec?.["@_id"] ?? "") === String(root.Tree?.["@_activeSpec"] ?? "1")) ?? list(root.Tree?.Spec)[0];
  const allocatedNodeIds = rawNodes.length ? rawNodes.map((x: any) => String(x?.["@_id"] ?? x?.["@_name"] ?? "")) : String(activeSpec?.["@_nodes"] ?? "").split(",").map((id) => id.trim()).filter(Boolean);
  const passiveNodes: PassiveNode[] = rawNodes.length ? rawNodes.map((x: any) => { const name = String(x?.["@_name"] ?? x?.["@_id"] ?? "Unnamed passive"); const rawType = String(x?.["@_type"] ?? "").toLowerCase(); const type = /ascend/.test(rawType) || /conviction of power/.test(name.toLowerCase()) ? "ascendancy" : /keystone/.test(rawType) ? "keystone" : /notable/.test(rawType) ? "notable" : rawType ? "passive" : "unknown"; return { id: String(x?.["@_id"] ?? "") || undefined, name, type, allocated: x?.["@_allocated"] !== "false", x: asNumber(x?.["@_x"]), y: asNumber(x?.["@_y"]), links: String(x?.["@_links"] ?? "").split(",").map((id) => id.trim()).filter(Boolean) }; }) : allocatedNodeIds.map((id) => ({ id, name: id, type: "unknown" as const, allocated: true }));
  const nodes = passiveNodes.map((node) => node.name);
  const sources: SourceEntry[] = [
    ...skillRows.map((gem) => ({ category: "gem" as const, name: gem.name, detail: gem.detail })),
    ...equippedItems.map((item) => ({ category: item.isFlask ? "flask" as const : "item" as const, name: item.name, detail: `Equipped in ${item.slot}. ${item.text}` })),
    ...nodes.map((name) => ({ category: /conviction of power/i.test(name) ? "ascendancy" as const : "passive" as const, name, detail: "Node listed in the imported tree data." })),
    ...(ascendancy ? [{ category: "ascendancy" as const, name: ascendancy, detail: "Ascendancy recorded on the build." }] : []),
    ...configFields.map((field) => ({ category: "configuration" as const, name: field.name, detail: `Configured value: ${field.value || "present"}` })),
  ];
  const sourceAssets: SourceAsset[] = [
    ...skillRows.map((gem) => ({ category: "gem" as const, name: gem.name, detail: gem.detail, attributeColor: gem.attributeColor })),
    ...equippedItems.map((item) => ({ category: item.isFlask ? "flask" as const : "item" as const, name: item.name, detail: `Equipped in ${item.slot}. ${item.text}`, iconUrl: item.iconUrl, attributeColor: "unknown" as const })),
    ...passiveNodes.filter((node) => node.type !== "passive").map((node) => ({ category: node.type === "ascendancy" ? "ascendancy" as const : "passive" as const, name: node.name, detail: "Allocated tree node in the imported build.", attributeColor: "unknown" as const })),
  ];
  const playerStats = new Map(list(build.PlayerStat).map((stat: any) => [String(stat?.["@_stat"] ?? ""), Number(stat?.["@_value"])]));
  const fullDpsSkill = root.Build?.FullDPSSkill?.["@_source"] ?? root.Build?.FullDPSSkill?.["@_name"];
  const mainSkill = fullDpsSkill ? String(fullDpsSkill).replace(/^\d+x\s+/i, "") : String(skillSetups.find((setup) => setup.includeInFullDPS)?.gems[0]?.name ?? skills[0] ?? "");
  const importedStats: ImportedStats = { source: playerStats.size ? "pob-calcs" : "unavailable", fullDps: playerStats.get("FullDPS"), totalDps: playerStats.get("TotalDPS"), averageDps: playerStats.get("AverageDPS"), averageHit: playerStats.get("AverageHit"), speed: playerStats.get("Speed"), life: playerStats.get("Life"), energyShield: playerStats.get("EnergyShield"), mana: playerStats.get("Mana"), armour: playerStats.get("Armour"), evasion: playerStats.get("Evasion"), block: playerStats.get("EffectiveBlockChance"), spellBlock: playerStats.get("EffectiveSpellBlockChance"), spellSuppression: playerStats.get("EffectiveSpellSuppressionChance"), effectiveHealthPool: playerStats.get("TotalEHP"), physicalMaximumHit: playerStats.get("PhysicalMaximumHitTaken"), elementalMaximumHit: Math.max(playerStats.get("FireMaximumHitTaken") ?? 0, playerStats.get("ColdMaximumHitTaken") ?? 0, playerStats.get("LightningMaximumHitTaken") ?? 0) || undefined, chaosMaximumHit: playerStats.get("ChaosMaximumHitTaken") };
  const identityName = String(build?.["@_name"] ?? "").trim() || mainSkill || "Unnamed build";
  return { identity: { name: identityName, level: asNumber(build?.["@_level"]), className: build?.["@_className"], ascendancy, version: build?.["@_version"] }, rawXml: xml, sections: Object.keys(root), enabledConfigs, configFields, sources, passiveNodes, skills, items: [...items, ...flasks], diagnostics: [], sourceAssets, skillSetups, equippedItems, importedStats, allocatedNodeIds, treeVersion: String(activeSpec?.["@_treeVersion"] ?? "") || undefined };
}
