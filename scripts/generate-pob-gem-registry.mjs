import fs from "node:fs";

const source = fs.readFileSync("data/Gems.lua", "utf8");
const records = [];
const blockPattern = /\["([^"]+)"\]\s*=\s*\{([\s\S]*?)(?=\n\s*\["[^\"]+"\]\s*=\s*\{|\n\};?\s*$)/g;
const value = (block, key) => block.match(new RegExp(`\\b${key}\\s*=\\s*"((?:[^"\\\\]|\\\\.)*)"`))?.[1];
const bool = (block, key) => new RegExp(`\\b${key}\\s*=\\s*true`).test(block);
const normalize = (name) => name.toLowerCase().replace(/[^a-z0-9]/g, "");

for (const match of source.matchAll(blockPattern)) {
  const [, key, block] = match;
  const name = value(block, "name");
  const baseTypeName = value(block, "baseTypeName");
  if (!name || (!bool(block, "grants_active_skill") && !bool(block, "support"))) continue;
  const tagsBlock = block.match(/\btags\s*=\s*\{([\s\S]*?)\n\s*\}/)?.[1] ?? "";
  const tags = [...tagsBlock.matchAll(/\b([a-z_]+)\s*=\s*true/g)].map((entry) => entry[1]).sort();
  const delivery = tags.includes("totem") ? "totem" : tags.includes("ballista") ? "ballista" : tags.includes("trap") ? "trap" : tags.includes("mine") ? "mine" : tags.includes("brand") ? "brand" : tags.includes("minion") ? "minion" : tags.includes("trigger") ? "triggered" : tags.includes("attack") ? "attack" : tags.includes("spell") ? "self-cast" : "unknown";
  const damageModel = tags.some((tag) => /damage_over_time|dot|ailment|bleed|burn|poison|ignite/.test(tag)) ? "damage-over-time" : tags.includes("attack") ? "hit" : tags.includes("spell") ? "hit-or-secondary" : "unknown";
  records.push({ key, name, baseTypeName, variantId: value(block, "variantId"), grantedEffectId: value(block, "grantedEffectId"), isActive: bool(block, "grants_active_skill"), isSupport: bool(block, "support"), tags, delivery, damageModel, aliases: [...new Set([name, baseTypeName].filter(Boolean).map(normalize))] });
}

const unique = new Map(records.map((record) => [`${record.key}:${record.name}`, record]));
const output = [...unique.values()].sort((a, b) => a.name.localeCompare(b.name));
fs.writeFileSync("data/pob-gems.json", `${JSON.stringify({ source: "PathOfBuildingCommunity/PathOfBuilding", generatedAt: new Date().toISOString(), count: output.length, activeCount: output.filter((record) => record.isActive).length, supportCount: output.filter((record) => record.isSupport).length, records: output }, null, 2)}\n`);
console.log(`Generated ${output.length} PoB gem records (${output.filter((record) => record.isActive).length} active, ${output.filter((record) => record.isSupport).length} support).`);
