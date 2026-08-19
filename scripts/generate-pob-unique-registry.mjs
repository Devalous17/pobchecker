import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname.replace(/^\/+([A-Z]:)/, "$1");
const sourceDir = join(root, "data", "uniques");
const outputPath = join(root, "data", "pob-unique-items.json");

const files = [
  "amulet.lua", "axe.lua", "belt.lua", "body.lua", "boots.lua", "bow.lua",
  "claw.lua", "dagger.lua", "fishing.lua", "flask.lua", "gloves.lua",
  "graft.lua", "helmet.lua", "jewel.lua", "mace.lua", "quiver.lua",
  "ring.lua", "shield.lua", "staff.lua", "sword.lua", "tincture.lua", "wand.lua",
];

const deliveryRules = [
  ["totem", /\btotem\b/i],
  ["ballista", /\bballista\b/i],
  ["trap", /\btraps?\b/i],
  ["mine", /\bmines?\b|detonat(?:e|es|ed|ing)\b/i],
  ["brand", /\bbrands?\b/i],
  ["minion", /\bminions?\b|\bcompanions?\b/i],
  ["triggered", /\btrigger(?:s|ed|ing)?\b|when you (?:attack|cast|hit|kill)/i],
];

const normalize = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Small forward-compatibility layer for live-league uniques that may land in
// PoB's repository after the checked-out data snapshot. These remain local and
// are replaced by the canonical PoB record when it becomes available.
const supplemental = [
  {
    name: "Forbidden Shako", normalizedName: normalize("Forbidden Shako"), baseType: "Great Crown", slot: "helmet",
    modifiers: ["Socketed Gems are Supported by Level (1-10) <random Support Gem>", "Socketed Gems are Supported by Level (25-35) <random Support Gem>"],
    text: "Socketed Gems are Supported by Level (1-10) <random Support Gem> Socketed Gems are Supported by Level (25-35) <random Support Gem>",
    archetypeHints: [], supportNames: ["random Support Gem"], grantedSkills: [], socketedSupport: true, grantsSkill: false, altersSockets: true, supportCount: 2,
  },
  {
    name: "Pearl of Tsoatha", normalizedName: normalize("Pearl of Tsoatha"), baseType: "Prismatic Ring", slot: "ring",
    modifiers: ["Skills Socketed in your Boots are Supported by level 20 <random Support Gem>"],
    text: "Skills Socketed in your Boots are Supported by level 20 <random Support Gem>",
    archetypeHints: [], supportNames: ["random Support Gem"], grantedSkills: [], socketedSupport: true, grantsSkill: false, altersSockets: true, supportCount: 1,
  },
];

function parseFile(file, text) {
  const records = [];
  const blocks = text.match(/\[\[([\s\S]*?)\]\]/g) ?? [];
  for (const block of blocks) {
    const lines = block.slice(2, -2).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (!lines.length) continue;
    const name = lines[0].replace(/^\{[^}]+\}/, "").trim();
    if (!name || name.startsWith("--")) continue;
    const baseType = lines[1]?.replace(/^\{[^}]+\}/, "").trim() ?? "";
    const modifiers = lines.slice(2).filter((line) => !/^(Variant|League|Source|Upgrade|Requires|LevelReq|Implicits|Limited|DropLevel|Weight|Key|Tags):/i.test(line));
    const textValue = modifiers.join(" ");
    const hints = [...new Set(deliveryRules.filter(([, rule]) => rule.test(textValue)).map(([kind]) => kind))];
    const supportMatches = [...textValue.matchAll(/supported by (?:level \d+ )?([^.;]+)/gi)].map((match) => match[1].trim());
    const grantedSkills = [...textValue.matchAll(/grants (?:level \d+ )?([^.;]+?) skill/gi)].map((match) => match[1].trim());
    const socketedSupport = /socketed (?:gems?|minion gems?) are supported by/i.test(textValue);
    const grantsSkill = /\bgrants (?:level \d+ )?.+ skill\b/i.test(textValue);
    const altersSockets = /socketed|additional support|extra support|has no sockets|links? to/i.test(textValue);
    records.push({
      name,
      normalizedName: normalize(name),
      baseType,
      slot: file.replace(/\.lua$/, ""),
      modifiers,
      text: textValue,
      archetypeHints: hints,
      supportNames: [...new Set(supportMatches)],
      grantedSkills: [...new Set(grantedSkills)],
      socketedSupport,
      grantsSkill,
      altersSockets,
    });
  }
  return records;
}

const records = [];
for (const file of files) {
  const text = await readFile(join(sourceDir, file), "utf8");
  records.push(...parseFile(file, text));
}
records.push(...supplemental);

const index = {};
for (const record of records) {
  const existing = index[record.normalizedName];
  if (!existing) index[record.normalizedName] = record;
  else {
    existing.modifiers = [...new Set([...existing.modifiers, ...record.modifiers])];
    existing.text = existing.modifiers.join(" ");
    existing.archetypeHints = [...new Set([...existing.archetypeHints, ...record.archetypeHints])];
    existing.supportNames = [...new Set([...existing.supportNames, ...record.supportNames])];
    existing.grantedSkills = [...new Set([...existing.grantedSkills, ...record.grantedSkills])];
    existing.socketedSupport ||= record.socketedSupport;
    existing.grantsSkill ||= record.grantsSkill;
    existing.altersSockets ||= record.altersSockets;
  }
}

const output = {
  source: "PathOfBuildingCommunity/PathOfBuilding src/Data/Uniques",
  generatedAt: new Date().toISOString(),
  count: Object.keys(index).length,
  items: Object.values(index).sort((a, b) => a.name.localeCompare(b.name)),
};
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(`Generated ${output.count} unique item records at ${outputPath}`);
