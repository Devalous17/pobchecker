import type { NormalizedBuild, PassiveNode, SourceAsset, SourceEntry, TreeGraphNode } from "@/src/types/domain";

const cache = new Map<string, string>();
const treeUrl = (version: string) => `https://raw.githubusercontent.com/PathOfBuildingCommunity/PathOfBuilding/dev/src/TreeData/${version.replace(".", "_")}/tree.lua`;
const treeMirrorUrl = (version: string) => `https://cdn.jsdelivr.net/gh/PathOfBuildingCommunity/PathOfBuilding@dev/src/TreeData/${version.replace(".", "_")}/tree.lua`;

type GroupPosition = { x: number; y: number };
type TreeConstants = { skillsPerOrbit: number[]; orbitRadii: number[] };

function parseNumberList(block: string, key: string): number[] {
  const match = block.match(new RegExp(`\\["${key}"\\]= \\{([\\s\\S]*?)\\}`));
  return [...(match?.[1] ?? "").matchAll(/-?\d+(?:\.\d+)?/g)].map((item) => Number(item[0]));
}

function parseGroups(lua: string): Map<number, GroupPosition> {
  const groupsStart = lua.indexOf('\n    ["groups"]= {');
  const nodesStart = lua.indexOf('\n    ["nodes"]= {', groupsStart);
  if (groupsStart < 0 || nodesStart < 0) return new Map();
  const section = lua.slice(groupsStart, nodesStart);
  const byNode = new Map<number, GroupPosition>();
  const groupBlocks = [...section.matchAll(/\n {8}\[(\d+)\]= \{([\s\S]*?)(?=\n {8}\[\d+\]= \{|$)/g)];
  for (const match of groupBlocks) {
    const x = Number(match[2].match(/\["x"\]= (-?\d+(?:\.\d+)?)/)?.[1]);
    const y = Number(match[2].match(/\["y"\]= (-?\d+(?:\.\d+)?)/)?.[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    for (const nodeId of match[2].matchAll(/"(\d+)"/g)) byNode.set(Number(nodeId[1]), { x, y });
  }
  return byNode;
}

function parseConstants(lua: string): TreeConstants {
  const constants = lua.slice(lua.lastIndexOf('\n    ["constants"]= {'));
  return { skillsPerOrbit: parseNumberList(constants, "skillsPerOrbit"), orbitRadii: parseNumberList(constants, "orbitRadii") };
}

function nodeIdsFromTree(lua: string): string[] {
  const nodesStart = lua.indexOf('\n    ["nodes"]= {');
  const jewelsStart = lua.indexOf('\n    ["jewelSlots"]= {', nodesStart);
  if (nodesStart < 0) return [];
  const section = lua.slice(nodesStart, jewelsStart < 0 ? undefined : jewelsStart);
  return [...section.matchAll(/\n\x20{8}\[(\d+)\]= \{/g)].map((match) => match[1]);
}

function parseNodeRecord(lua: string, id: string, groups: Map<number, GroupPosition>, constants: TreeConstants): PassiveNode | undefined {
  const start = lua.indexOf(`\n        [${id}]= {`);
  if (start < 0) return undefined;
  const end = lua.indexOf("\n        [", start + 12);
  const block = lua.slice(start, end < 0 ? start + 3000 : end);
  const name = block.match(/\["name"\]= "((?:[^"\\]|\\.)*)"/)?.[1];
  if (!name) return undefined;
  const type = /\["ascendancyName"\]=/.test(block) ? "ascendancy" : /\["isKeystone"\]= true/.test(block) ? "keystone" : /\["isNotable"\]= true/.test(block) ? "notable" : "passive";
  const group = Number(block.match(/\["group"\]= (\d+)/)?.[1]);
  const orbit = Number(block.match(/\["orbit"\]= (\d+)/)?.[1]);
  const orbitIndex = Number(block.match(/\["orbitIndex"\]= (\d+)/)?.[1]);
  const center = groups.get(Number.isFinite(group) ? group : -1);
  const slots = constants.skillsPerOrbit[orbit] || 1;
  const radius = constants.orbitRadii[orbit] || 0;
  const angle = slots === 1 ? 0 : (orbitIndex / slots) * Math.PI * 2;
  const linksBlock = block.match(/\["out"\]= \{([\s\S]*?)\}/)?.[1] ?? "";
  const links = [...linksBlock.matchAll(/"(\d+)"/g)].map((item) => item[1]);
  const statsBlock = block.match(/\["stats"\]= \{([\s\S]*?)\}/)?.[1] ?? "";
  const stats = [...statsBlock.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((item) => item[1]);
  return { id, name, type, source: type === "ascendancy" ? "ascendancy" : "core-tree", allocated: true, x: center ? center.x + Math.cos(angle) * radius : undefined, y: center ? center.y + Math.sin(angle) * radius : undefined, links, stats };
}

export async function hydratePassiveNodes(build: NormalizedBuild): Promise<NormalizedBuild> {
  if (!build.allocatedNodeIds.length || !build.treeVersion) return build;
  const version = build.treeVersion.replace(/^v/, "").replace(/\./g, "_");
  try {
    let lua = cache.get(version);
    let usedVersion = version;
    if (!lua) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      try {
        const candidates = [...new Set([version, process.env.POB_TREE_FALLBACK_VERSION ?? "3_29"])];
        for (const candidate of candidates) {
          for (const url of [treeUrl(candidate), treeMirrorUrl(candidate)]) {
            const response = await fetch(url, { signal: controller.signal, headers: { "User-Agent": "PoB-Reality-Check/0.1 (+https://pob-reality-check.com)" } });
            if (!response.ok) continue;
            lua = await response.text(); usedVersion = candidate; cache.set(version, lua); break;
          }
          if (lua) break;
        }
        if (!lua) return { ...build, diagnostics: [...build.diagnostics, `Official passive tree data was unavailable for ${version}.`] };
      }
      finally { clearTimeout(timeout); }
    }
    const groups = parseGroups(lua!);
    const constants = parseConstants(lua!);
    const resolved = build.allocatedNodeIds.map((id) => parseNodeRecord(lua!, id, groups, constants) ?? { id, name: id, type: "unknown" as const, source: "unknown" as const, allocated: true });
    const allocatedIds = new Set(build.allocatedNodeIds);
    const treeGraph: TreeGraphNode[] = nodeIdsFromTree(lua!).map((id) => parseNodeRecord(lua!, id, groups, constants)).filter((node): node is PassiveNode & { id: string } => Boolean(node?.id)).map((node) => ({ ...node, allocated: allocatedIds.has(node.id) }));
    const names = new Map(build.passiveNodes.map((node, index) => [node.name, resolved[index]?.name ?? node.name]));
    const passiveNodes = resolved;
    const details = new Map(resolved.map((node) => [node.name, node.stats?.join(" ") ?? ""]));
    const sources: SourceEntry[] = build.sources.map((source) => source.category === "passive" || source.category === "ascendancy" ? { ...source, name: names.get(source.name) ?? source.name, detail: `${source.detail} ${details.get(names.get(source.name) ?? source.name) ?? ""}`.trim() } : source);
    const sourceAssets: SourceAsset[] = build.sourceAssets.map((asset) => asset.category === "passive" || asset.category === "ascendancy" ? { ...asset, name: names.get(asset.name) ?? asset.name, detail: `${asset.detail} ${details.get(names.get(asset.name) ?? asset.name) ?? ""}`.trim() } : asset);
    return { ...build, passiveNodes, sources, sourceAssets, treeGraph, diagnostics: usedVersion === version ? build.diagnostics : [...build.diagnostics, `Passive tree preview used official fallback data ${usedVersion}; node contribution labels remain version-sensitive.`] };
  } catch { return { ...build, diagnostics: [...build.diagnostics, `Passive tree hydration failed for ${version}; the report is showing only imported allocated nodes.`] }; }
}
