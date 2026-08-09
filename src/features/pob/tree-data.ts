import type { NormalizedBuild, PassiveNode, SourceAsset, SourceEntry } from "@/src/types/domain";

const cache = new Map<string, string>();
const treeUrl = (version: string) => `https://raw.githubusercontent.com/PathOfBuildingCommunity/PathOfBuilding/dev/src/TreeData/${version.replace(".", "_")}/tree.lua`;

function parseNodeRecord(lua: string, id: string): PassiveNode | undefined {
  const start = lua.indexOf(`\n        [${id}]= {`);
  if (start < 0) return undefined;
  const end = lua.indexOf("\n        [", start + 12);
  const block = lua.slice(start, end < 0 ? start + 3000 : end);
  const name = block.match(/\["name"\]= "((?:[^"\\]|\\.)*)"/)?.[1];
  if (!name) return undefined;
  const type = /\["ascendancyName"\]=/.test(block) ? "ascendancy" : /\["isKeystone"\]= true/.test(block) ? "keystone" : /\["isNotable"\]= true/.test(block) ? "notable" : "passive";
  return { name, type, allocated: true };
}

export async function hydratePassiveNodes(build: NormalizedBuild): Promise<NormalizedBuild> {
  if (!build.allocatedNodeIds.length || !build.treeVersion) return build;
  const version = build.treeVersion.replace(/^v/, "").replace(/\./g, "_");
  try {
    let lua = cache.get(version);
    if (!lua) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      try { const response = await fetch(treeUrl(version), { signal: controller.signal, headers: { "User-Agent": "PoB-Reality-Check/0.1 (+https://pob-reality-check.com)" } }); if (!response.ok) return build; lua = await response.text(); cache.set(version, lua); }
      finally { clearTimeout(timeout); }
    }
    const resolved = build.allocatedNodeIds.map((id) => parseNodeRecord(lua!, id) ?? { name: id, type: "unknown" as const, allocated: true });
    const names = new Map(build.passiveNodes.map((node, index) => [node.name, resolved[index]?.name ?? node.name]));
    const passiveNodes = resolved;
    const sources: SourceEntry[] = build.sources.map((source) => source.category === "passive" || source.category === "ascendancy" ? { ...source, name: names.get(source.name) ?? source.name } : source);
    const sourceAssets: SourceAsset[] = build.sourceAssets.map((asset) => asset.category === "passive" || asset.category === "ascendancy" ? { ...asset, name: names.get(asset.name) ?? asset.name } : asset);
    return { ...build, passiveNodes, sources, sourceAssets };
  } catch { return build; }
}
