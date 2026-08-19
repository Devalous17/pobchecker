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
import { discoverDamageChannels } from "./channels";

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
const knownSupportGems = new Set([
  "More Duration", "Increased Critical Damage", "Lightning Penetration", "Infused Channelling", "Inspiration",
  "Spell Cascade", "Spell Echo", "Unleash", "Intensify", "Concentrated Effect", "Controlled Destruction", "Elemental Focus",
  "Greater Multiple Projectiles", "Multiple Projectiles", "Fork", "Chain", "Pierce", "GMP", "LMP", "Minefield", "Trap and Mine Damage",
]);
const supportNamePattern = /support$|spell cascade|spell echo|unleash|intensify|concentrated effect|controlled destruction|elemental focus|multiple projectiles|trap and mine damage|minefield/i;

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
const itemEvidence = (item: any) => itemTextLines(item).slice(0, 24).join("\n") || (JSON.stringify(item) ?? "").slice(0, 1400);
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

const displaySkillId = (value: unknown) => String(value ?? "")
  .replace(/([a-z])([A-Z])/g, "$1 $2")
  .replace(/[_-]+/g, " ")
  .replace(/\s+/g, " ")
  .trim();

const gemInfo = (gem: any, skill: any): SkillGemInfo | null => {
  const source = String(skill?.["@_source"] ?? gem?.["@_source"] ?? "").trim() || undefined;
  const gemId = String(gem?.["@_skillId"] ?? gem?.["@_gemId"] ?? "").trim() || undefined;
  const name = String(gem?.["@_nameSpec"] || gem?.["@_name"] || displaySkillId(gemId) || "").trim();
  if (!name) return null;
  const displayName = String(gem?.["@_name"] ?? "").trim() || undefined;
  const level = asNumber(gem?.["@_level"]);
  const quality = asNumber(gem?.["@_quality"]);
  const support = asBool(gem?.["@_isSupport"] ?? gem?.["@_support"]) || knownSupportGems.has(displayName ?? name) || supportNamePattern.test(displayName ?? name);
  const sourcedFromPassiveOrItem = /^(tree|item|passive):/i.test(source ?? "");
  const hasProvidedSkillMetadata = Boolean(gem?.["@_skillMinion"] || gem?.["@_isGranted"] || gem?.["@_granted"]);
  const trigger = sourcedFromPassiveOrItem || asBool(skill?.["@_trigger"] ?? skill?.["@_triggered"] ?? gem?.["@_trigger"] ?? gem?.["@_triggered"]);
  const provided = sourcedFromPassiveOrItem || hasProvidedSkillMetadata || asBool(gem?.["@_isProvided"] ?? gem?.["@_provided"]) || /item provided/i.test(String(gem?.["@_name"] ?? ""));
  const enabled = gem?.["@_enabled"] === undefined ? asBool(skill?.["@_enabled"] ?? true) : asBool(gem?.["@_enabled"]);
  const includeInFullDPS = asBool(gem?.["@_includeInFullDPS"] ?? skill?.["@_includeInFullDPS"]);
  const skillPart = asNumber(gem?.["@_skillPart"] ?? skill?.["@_skillPart"]);
  const skillCount = asNumber(gem?.["@_count"] ?? skill?.["@_count"]);
  const color = attributeColor(name, gem);
  const detail = [
    level === undefined ? undefined : `Level ${level}${quality === undefined ? "" : ` / ${quality}% quality`}`,
    support ? "Support gem" : "Active skill",
    trigger ? "Triggered or automated" : undefined,
    provided ? "Provided by an item or passive" : undefined,
    includeInFullDPS ? "Included in Full DPS" : undefined,
  ].filter(Boolean).join(" · ") || "Imported from the PoB skill setup.";
  return { name, gemId, source, displayName, level, quality, attributeColor: color, detail, support, trigger, provided, enabled, includeInFullDPS, skillPart, skillCount };
};

const parseSkillSetups = (root: any): SkillSetup[] => {
  const sets = list(root.Skills?.SkillSet);
  const setEntries = sets.length ? sets : [{ "@_id": "legacy", Skill: list(root.Skills?.Skill) }];
  let engineIndex = 0;
  return setEntries.flatMap((set: any, setIndex) => {
    const skills = list(set?.Skill);
    const setupRows = skills.length ? skills : list(root.Skills?.Skill);
    return setupRows.map((skill: any, skillIndex) => {
      const gemRows = list(skill?.Gem).length ? list(skill?.Gem) : [skill];
      const gems = gemRows.map((gem) => gemInfo(gem, skill)).filter((gem): gem is SkillGemInfo => Boolean(gem));
      const slot = String(skill?.["@_slot"] ?? skill?.["@_itemSlot"] ?? "").trim() || undefined;
      const source = String(skill?.["@_source"] ?? "").trim() || undefined;
      const explicitLabel = String(skill?.["@_label"] ?? skill?.["@_name"] ?? "").trim();
      const label = explicitLabel || slot || `Skill setup ${set?.["@_id"] ?? setIndex + 1}.${skillIndex + 1}`;
      const mainActiveSkillIndex = asNumber(skill?.["@_mainActiveSkillCalcs"] ?? skill?.["@_mainActiveSkill"]);
      engineIndex += 1;
      return { id: `${set?.["@_id"] ?? setIndex + 1}-${skillIndex + 1}`, engineIndex, label, slot, source, enabled: skill?.["@_enabled"] === undefined ? true : asBool(skill?.["@_enabled"]), includeInFullDPS: asBool(skill?.["@_includeInFullDPS"]) || gems.some((gem) => gem.includeInFullDPS), mainActiveSkill: mainActiveSkillIndex !== undefined ? mainActiveSkillIndex > 0 : asBool(skill?.["@_mainActiveSkill"]), mainActiveSkillIndex, gems } satisfies SkillSetup;
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
  const damageChannels = discoverDamageChannels(skillSetups);
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
  const passiveNodes: PassiveNode[] = rawNodes.length ? rawNodes.map((x: any) => { const name = String(x?.["@_name"] ?? x?.["@_id"] ?? "Unnamed passive"); const rawType = String(x?.["@_type"] ?? "").toLowerCase(); const type = /ascend/.test(rawType) || /conviction of power/.test(name.toLowerCase()) ? "ascendancy" : /keystone/.test(rawType) ? "keystone" : /notable/.test(rawType) ? "notable" : rawType ? "passive" : "unknown"; return { id: String(x?.["@_id"] ?? "") || undefined, name, type, source: type === "ascendancy" ? "ascendancy" as const : "core-tree" as const, allocated: x?.["@_allocated"] !== "false", x: asNumber(x?.["@_x"]), y: asNumber(x?.["@_y"]), links: String(x?.["@_links"] ?? "").split(",").map((id) => id.trim()).filter(Boolean) }; }) : allocatedNodeIds.map((id) => ({ id, name: id, type: "unknown" as const, source: "unknown" as const, allocated: true }));
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
  const minionStats = new Map(list(build.MinionStat).map((stat: any) => [String(stat?.["@_stat"] ?? ""), Number(stat?.["@_value"])]));
  const fullDpsNode = root.Build?.FullDPSSkill;
  const fullDpsSkill = typeof fullDpsNode === "string"
    ? fullDpsNode
    : [fullDpsNode?.["@_source"], fullDpsNode?.["@_name"], fullDpsNode?.["@_stat"], fullDpsNode?.["#text"]].find((value) => String(value ?? "").trim());
  const fullDpsName = String(fullDpsSkill ?? "").replace(/^\d+x\s+/i, "").trim();
  const activeGems = skillSetups.flatMap((setup) => setup.gems.filter(isActiveSkillGem));
  const activeCandidates = activeGems.map((gem) => gem.name);
  const mainActiveSkill = skillSetups.find((setup) => setup.mainActiveSkill)?.gems.find((gem) => !gem.support && !gem.provided && !gem.trigger);
  const resolvedMainSkill = resolveImportedMainSkill(skillSetups, fullDpsName);
  const mainSkill = resolvedMainSkill.selected?.gem.name || mainActiveSkill?.name || activeCandidates[0] || "";
  const stat = (...names: string[]) => names.map((name) => playerStats.get(name)).find((value) => value !== undefined);
  const minionStat = (...names: string[]) => names.map((name) => minionStats.get(name)).find((value) => value !== undefined);
  const positiveStat = (...names: string[]) => names.map((name) => playerStats.get(name)).find((value) => value !== undefined && Number.isFinite(value) && value > 0);
  const positiveMinionStat = (...names: string[]) => names.map((name) => minionStats.get(name)).find((value) => value !== undefined && Number.isFinite(value) && value > 0);
  const activeMinionLimit = positiveStat("ActiveMinionLimit");
  const aggregateMinionStat = (...names: string[]) => {
    const value = positiveMinionStat(...names);
    return value === undefined ? undefined : value * (activeMinionLimit ?? 1);
  };
  const playerOrMinion = (names: string[], minionNames: string[] = names) => positiveStat(...names) ?? aggregateMinionStat(...minionNames);
  const importedStats: ImportedStats = {
    source: playerStats.size ? "pob-calcs" : "unavailable",
    fullDps: positiveStat("FullDPS") ?? aggregateMinionStat("CombinedDPS"),
    totalDps: playerOrMinion(["TotalDPS"]),
    totalDotDps: playerOrMinion(["TotalDotDPS", "WithDotDPS", "TotalDot"]),
    combinedDps: playerOrMinion(["CombinedDPS"]),
    minionTotalDps: positiveMinionStat("TotalDPS"),
    minionTotalDotDps: positiveMinionStat("TotalDotDPS", "TotalDot"),
    minionCombinedDps: positiveMinionStat("CombinedDPS"),
    minionAverageHit: positiveMinionStat("AverageDamage"),
    minionSpeed: positiveMinionStat("Speed"),
    poisonDps: aggregateMinionStat("PoisonDPS"),
    poisonTotalDps: aggregateMinionStat("WithPoisonDPS"),
    bleedDps: aggregateMinionStat("WithBleedDPS", "BleedDPS"),
    igniteDps: aggregateMinionStat("WithIgniteDPS", "IgniteDPS"),
    averageDps: positiveStat("AverageDPS"),
    averageHit: positiveStat("AverageHit", "AverageDamage") ?? positiveMinionStat("AverageDamage"),
    criticalStrikeChance: stat("CriticalStrikeChance", "CritChance", "EffectiveCritChance"),
    criticalStrikeMultiplier: stat("CriticalStrikeMultiplier", "CritMultiplier"),
    speed: positiveStat("Speed") ?? positiveMinionStat("Speed"),
    movementSpeed: stat("MovementSpeed", "EffectiveMovementSpeed", "EffectiveMovementSpeedMod"),
    activeMinionLimit,
    areaOfEffectRadius: stat("AreaOfEffectRadius", "AreaOfEffectRadiusMetres", "AreaOfEffect"),
    life: stat("Life"),
    energyShield: stat("EnergyShield"),
    mana: stat("Mana"),
    armour: stat("Armour"),
    evasion: stat("Evasion"),
    ward: stat("Ward"),
    block: stat("EffectiveBlockChance", "BlockChance"),
    spellBlock: stat("EffectiveSpellBlockChance", "SpellBlockChance"),
    spellSuppression: stat("EffectiveSpellSuppressionChance", "SpellSuppressionChance"),
    fireResistance: stat("FireResist", "FireResistance", "FireResistOverCap"),
    coldResistance: stat("ColdResist", "ColdResistance", "ColdResistOverCap"),
    lightningResistance: stat("LightningResist", "LightningResistance", "LightningResistOverCap"),
    chaosResistance: stat("ChaosResist", "ChaosResistance", "ChaosResistOverCap"),
    effectiveHealthPool: stat("TotalEHP"),
    physicalMaximumHit: stat("PhysicalMaximumHitTaken"),
    fireMaximumHit: stat("FireMaximumHitTaken"),
    coldMaximumHit: stat("ColdMaximumHitTaken"),
    lightningMaximumHit: stat("LightningMaximumHitTaken"),
    elementalMaximumHit: Math.max(playerStats.get("FireMaximumHitTaken") ?? 0, playerStats.get("ColdMaximumHitTaken") ?? 0, playerStats.get("LightningMaximumHitTaken") ?? 0) || undefined,
    chaosMaximumHit: stat("ChaosMaximumHitTaken"),
    lifeRegen: stat("LifeRegen", "LifeRegenRecovery", "NetLifeRegen"),
    lifeLeechRate: stat("LifeLeechRate", "LifeLeechGainRate"),
    energyShieldRecoveryCap: stat("EnergyShieldRecoveryCap"),
    energyShieldRegen: stat("EnergyShieldRegen", "EnergyShieldRegenRecovery", "NetEnergyShieldRegen"),
    energyShieldLeechRate: stat("EnergyShieldLeechRate", "EnergyShieldLeechGainRate"),
    manaRegen: stat("ManaRegen", "ManaRegenRecovery", "NetManaRegen"),
    manaLeechRate: stat("ManaLeechRate", "ManaLeechGainRate"),
    lifeRecoveryRate: stat("LifeRecoveryRate", "LifeRecharge"),
    energyShieldRecoveryRate: stat("EnergyShieldRecoveryRate", "EnergyShieldRecoveryCap"),
    manaRecoveryRate: stat("ManaRecoveryRate", "ManaRegenRecovery"),
    lifeRecoup: stat("LifeRecoup"),
    manaRecoup: stat("ManaRecoup"),
    lifeOnHit: stat("LifeOnHit"),
    manaOnHit: stat("ManaOnHit"),
    lifeOnKill: stat("LifeOnKill"),
    manaOnKill: stat("ManaOnKill"),
    energyShieldOnHit: stat("EnergyShieldOnHit"),
    energyShieldOnKill: stat("EnergyShieldOnKill"),
    enduranceCharges: stat("EnduranceCharges", "MaximumEnduranceCharges", "EnduranceChargeCount"),
    physicalDamageReduction: stat("PhysicalDamageReduction", "PhysicalDamageReductionPercent"),
  };
  const identityName = String(build?.["@_name"] ?? "").trim() || mainSkill || "Unnamed build";
  return { identity: { name: identityName, level: asNumber(build?.["@_level"]), className: build?.["@_className"], ascendancy, version: build?.["@_version"] }, mainSkill: mainSkill || undefined, fullDpsSkill: fullDpsName || undefined, rawXml: xml, sections: Object.keys(root), enabledConfigs, configFields, sources, passiveNodes, skills, items: [...items, ...flasks], diagnostics: [], sourceAssets, skillSetups, damageChannels, equippedItems, importedStats, allocatedNodeIds, treeVersion: String(activeSpec?.["@_treeVersion"] ?? "") || undefined };
}

const normalizedSkillName = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
const isActiveSkillGem = (gem: SkillGemInfo) => !gem.support && !gem.provided && !gem.trigger;
const matchesSkillName = (gem: SkillGemInfo, name: string) => [gem.name, gem.displayName].some((candidate) => normalizedSkillName(candidate ?? "") === normalizedSkillName(name));

/**
 * Resolves the PoB-selected skill without assuming the first socket group is
 * the main one. This only selects the identity shown beside the imported
 * aggregate FullDPS value; it never recalculates that value.
 */
const resolveImportedMainSkill = (skillSetups: SkillSetup[], fullDpsName: string) => {
  const activeGems = skillSetups.flatMap((setup) => setup.gems.filter(isActiveSkillGem));
  const markedSetups = skillSetups.filter((setup) => setup.enabled && setup.includeInFullDPS);
  const markedCandidates = markedSetups.flatMap((setup) => setup.gems.filter(isActiveSkillGem).map((gem) => ({ setup, gem })));
  const markerCandidate = activeGems.find((gem) => matchesSkillName(gem, fullDpsName));
  const markerInMarkedSetup = markedCandidates.find(({ gem }) => matchesSkillName(gem, fullDpsName));
  const indexedMarkedCandidate = markedSetups.flatMap((setup) => {
    if (!setup.mainActiveSkillIndex || setup.mainActiveSkillIndex < 1) return [];
    const active = setup.gems.filter(isActiveSkillGem);
    const gem = active[setup.mainActiveSkillIndex - 1];
    return gem ? [{ setup, gem }] : [];
  })[0];
  const mainActiveMarkedCandidate = markedSetups.flatMap((setup) => {
    if (!setup.mainActiveSkill) return [];
    const active = setup.gems.filter(isActiveSkillGem);
    const gem = setup.mainActiveSkillIndex && setup.mainActiveSkillIndex > 0
      ? active[setup.mainActiveSkillIndex - 1]
      : active[0];
    return gem ? [{ setup, gem }] : [];
  })[0];
  const mainActiveCandidates = skillSetups
    .filter((setup) => setup.enabled && setup.mainActiveSkill)
    .flatMap((setup) => {
      const active = setup.gems.filter(isActiveSkillGem);
      const gem = setup.mainActiveSkillIndex && setup.mainActiveSkillIndex > 0
        ? active[setup.mainActiveSkillIndex - 1]
        : active[0];
      return gem ? [{ setup, gem }] : [];
    });
  const markerFallback = markerCandidate
    ? { setup: skillSetups.find((setup) => setup.gems.includes(markerCandidate)), gem: markerCandidate }
    : undefined;
  // PoB can mark a Tree/Item-provided trigger as the active calculation skill.
  // It is evidence that the effect exists, not the user's socketed damage skill.
  // Prefer a real gear-socketed candidate when multiple main markers exist.
  const socketedMainActiveCandidate = mainActiveCandidates.find(({ setup }) => !/^(tree|item|passive):/i.test(setup.source ?? ""));
  const selected = markerInMarkedSetup ?? mainActiveMarkedCandidate ?? indexedMarkedCandidate ?? markedCandidates[0] ?? markerFallback ?? socketedMainActiveCandidate ?? mainActiveCandidates[0] ?? skillSetups.flatMap((setup) => setup.gems.filter(isActiveSkillGem).map((gem) => ({ setup, gem })))[0];
  return { selected, activeGems };
};

/** Re-selects the displayed damage skill after PoB gem metadata has been enriched. */
export function refreshDamageSkillIdentity(build: NormalizedBuild): NormalizedBuild {
  const isDamageGem = (gem: SkillGemInfo) => gem.enabled && !gem.support && !gem.provided && !gem.trigger && !(gem.tags ?? []).some((tag) => tag.toLowerCase() === "support");
  const fullDpsSetups = build.skillSetups.filter((setup) => setup.enabled && setup.includeInFullDPS);
  const mainActiveSetup = build.skillSetups.find((setup) => setup.mainActiveSkill);
  const markerCandidate = build.fullDpsSkill
    ? build.skillSetups.flatMap((setup) => setup.gems.filter(isDamageGem)).find((gem) => matchesSkillName(gem, build.fullDpsSkill ?? ""))
    : undefined;
  const markedMarkerCandidate = markerCandidate && fullDpsSetups.some((setup) => setup.gems.includes(markerCandidate)) ? markerCandidate : undefined;
  const indexedMarkedCandidate = fullDpsSetups.flatMap((setup) => {
    if (!setup.mainActiveSkillIndex || setup.mainActiveSkillIndex < 1) return [];
    const active = setup.gems.filter(isDamageGem);
    const gem = active[setup.mainActiveSkillIndex - 1];
    return gem ? [gem] : [];
  })[0];
  const candidates = [
    markedMarkerCandidate,
    indexedMarkedCandidate,
    ...fullDpsSetups.flatMap((setup) => setup.gems.filter(isDamageGem)),
    markerCandidate,
    mainActiveSetup?.gems.find(isDamageGem),
    ...build.skillSetups.flatMap((setup) => setup.gems.filter(isDamageGem)),
  ].filter((gem): gem is SkillGemInfo => Boolean(gem));
  // Once metadata is available, the first candidate is the imported PoB
  // damage setup (Full DPS marker/index first). Do not let an earlier stale
  // identity such as Raise Spectre override that setup merely because it is
  // also an enabled active gem.
  const existing = candidates.find((gem) => matchesSkillName(gem, build.mainSkill ?? ""));
  const ranked = build.skillSetups
    .filter((setup) => setup.enabled && !/^(tree|item|passive):/i.test(setup.source ?? ""))
    .flatMap((setup) => setup.gems.filter(isDamageGem).map((gem) => ({ setup, gem })))
    .sort((left, right) => {
      const score = (entry: { setup: SkillSetup; gem: SkillGemInfo }) => {
        const tags = new Set((entry.gem.tags ?? []).map((tag) => tag.toLowerCase()));
        const damageTags = ["attack", "spell", "projectile", "area", "melee", "minion", "summon", "totem", "trap", "mine", "brand"];
        const supportCount = entry.setup.gems.filter((gem) => gem.enabled && gem.support && !gem.provided && !gem.trigger).length + (entry.setup.externalSupportEvidence?.length ?? 0);
        return damageTags.filter((tag) => tags.has(tag)).length + Math.min(4, supportCount) * 2 + (entry.gem.damageModel ? 1 : 0);
      };
      return score(right) - score(left);
    });
  const explicitCandidate = markedMarkerCandidate ?? indexedMarkedCandidate ?? fullDpsSetups.flatMap((setup) => setup.gems.filter(isDamageGem))[0] ?? markerCandidate;
  const mainSkill = explicitCandidate?.name ?? ranked[0]?.gem.name ?? candidates[0]?.name ?? existing?.name;
  return { ...build, mainSkill, damageChannels: discoverDamageChannels(build.skillSetups) };
}
