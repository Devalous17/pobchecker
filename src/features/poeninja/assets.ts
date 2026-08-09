import type { SourceAsset } from "@/src/types/domain";

type GemLine = { name?: string; icon?: string };
const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Uses poe.ninja's documented SkillGem item-overview surface only for artwork.
 * Character/build endpoints are intentionally not used here.
 */
export async function enrichGemAssets(assets: SourceAsset[]): Promise<SourceAsset[]> {
  const gemAssets = assets.filter((asset) => asset.category === "gem");
  if (!gemAssets.length) return assets;
  const league = process.env.POE_NINJA_LEAGUE ?? "Keepers";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(`https://poe.ninja/api/data/itemoverview?league=${encodeURIComponent(league)}&type=SkillGem&language=en`, { signal: controller.signal, headers: { "User-Agent": "PoB-Reality-Check/0.1 (+https://pob-reality-check.com)" } });
    if (!response.ok) return assets;
    const payload = await response.json() as { lines?: GemLine[] };
    const byName = new Map((payload.lines ?? []).filter((line) => line.name && line.icon).map((line) => [normalize(line.name!), line.icon!]));
    return assets.map((asset) => asset.category === "gem" ? { ...asset, iconUrl: byName.get(normalize(asset.name)) } : asset);
  } catch { return assets; }
  finally { clearTimeout(timeout); }
}
