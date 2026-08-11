import type { NormalizedBuild, SourceAsset } from "@/src/types/domain";
import { refreshDamageSkillIdentity } from "./parse";

type GemMetadata = { color: SourceAsset["attributeColor"]; tags: string[]; requirements: string };
const cache = new Map<string, Map<string, GemMetadata>>();
const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
const escapeLua = (value: string) => value.replace(/\\"/g, '"');

function parseGemData(lua: string): Map<string, GemMetadata> {
  const result = new Map<string, GemMetadata>();
  const blocks = lua.matchAll(/\["[^"]+"\]\s*=\s*\{([\s\S]*?)(?=\n\s*\["[^"]+"\]\s*=\s*\{|\n\};?\s*$)/g);
  for (const match of blocks) {
    const block = match[1];
    const name = block.match(/\bname\s*=\s*"((?:[^"\\]|\\.)*)"/)?.[1];
    if (!name) continue;
    const tagsBlock = block.match(/\btags\s*=\s*\{([\s\S]*?)\n\s*\}/)?.[1] ?? "";
    const tags = [...tagsBlock.matchAll(/\b([a-z_]+)\s*=\s*true/g)].map((tag) => tag[1]);
    const colors = [tags.includes("intelligence") ? "int" : undefined, tags.includes("dexterity") ? "dex" : undefined, tags.includes("strength") ? "str" : undefined].filter(Boolean) as SourceAsset["attributeColor"][];
    const color = colors.length > 1 ? "hybrid" : colors[0] ?? "unknown";
    const reqStr = block.match(/\breqStr\s*=\s*(\d+)/)?.[1] ?? "0";
    const reqDex = block.match(/\breqDex\s*=\s*(\d+)/)?.[1] ?? "0";
    const reqInt = block.match(/\breqInt\s*=\s*(\d+)/)?.[1] ?? "0";
    const requirements = `STR ${reqStr} · DEX ${reqDex} · INT ${reqInt}`;
    const metadata = { color, tags, requirements };
    result.set(normalize(escapeLua(name)), metadata);
    const baseType = block.match(/\bbaseTypeName\s*=\s*"((?:[^"\\]|\\.)*)"/)?.[1];
    if (baseType) result.set(normalize(escapeLua(baseType)), metadata);
  }
  return result;
}

export async function enrichPoBGemMetadata(build: NormalizedBuild): Promise<NormalizedBuild> {
  const url = process.env.POB_GEM_DATA_URL ?? "https://raw.githubusercontent.com/PathOfBuildingCommunity/PathOfBuilding/dev/src/Data/Gems.lua";
  try {
    let metadata = cache.get(url);
    if (!metadata) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        const response = await fetch(url, { signal: controller.signal, headers: { "User-Agent": "PoB-Reality-Check/0.1 (+https://pob-reality-check.com)" } });
        if (!response.ok) return build;
        metadata = parseGemData(await response.text());
        cache.set(url, metadata);
      } finally { clearTimeout(timeout); }
    }
    const apply = (gem: typeof build.skillSetups[number]["gems"][number]) => {
      const match = metadata?.get(normalize(gem.name)) ?? metadata?.get(normalize(gem.displayName ?? ""));
      if (!match) return gem;
      return { ...gem, attributeColor: match.color === "unknown" ? gem.attributeColor : match.color, metadataSource: "pob" as const, tags: match.tags, detail: `${gem.detail} · PoB tags: ${match.tags.filter((tag) => !/^grants_/.test(tag)).join(", ") || "none"} · ${match.requirements}` };
    };
    const skillSetups = build.skillSetups.map((setup) => ({ ...setup, gems: setup.gems.map(apply) }));
    const gemByName = new Map(skillSetups.flatMap((setup) => setup.gems.map((gem) => [normalize(gem.name), gem])));
    const sourceAssets = build.sourceAssets.map((asset) => { if (asset.category !== "gem") return asset; const gem = gemByName.get(normalize(asset.name)); return gem ? { ...asset, attributeColor: gem.attributeColor, detail: gem.detail } : asset; });
    const metadataAwareSkillSetups = skillSetups.map((setup) => ({ ...setup, gems: setup.gems.map((gem) => ({ ...gem, support: gem.support || (gem.tags ?? []).some((tag) => tag.toLowerCase() === "support") })) }));
    return refreshDamageSkillIdentity({ ...build, skillSetups: metadataAwareSkillSetups, sourceAssets });
  } catch { return build; }
}

export function parsePoBGemDataForTest(lua: string) { return parseGemData(lua); }
