import type { NormalizedBuild, PassiveNode, SourceAsset, SourceEntry } from "@/src/types/domain";

const cache = new Map<string, string>();
const treeUrl = (version: string) => `https://raw.githubusercontent.com/PathOfBuildingCommunity/PathOfBuilding/dev/src/TreeData/${version.replace(".", "_")}/tree.lua`;

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
  return { id, name, type, allocated: true, x: center ? center.x + Math.cos(angle) * radius : undefined, y: center ? center.y + Math.sin(angle) * radius : undefined, links };
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
    const groups = parseGroups(lua!);
    const constants = parseConstants(lua!);
    const resolved = build.allocatedNodeIds.map((id) => parseNodeRecord(lua!, id, groups, constants) ?? { id, name: id, type: "unknown" as const, allocated: true });
    const names = new Map(build.passiveNodes.map((node, index) => [node.name, resolved[index]?.name ?? node.name]));
    const passiveNodes = resolved;
    const sources: SourceEntry[] = build.sources.map((source) => source.category === "passive" || source.category === "ascendancy" ? { ...source, name: names.get(source.name) ?? source.name } : source);
    const sourceAssets: SourceAsset[] = build.sourceAssets.map((asset) => asset.category === "passive" || asset.category === "ascendancy" ? { ...asset, name: names.get(asset.name) ?? asset.name } : asset);
    return { ...build, passiveNodes, sources, sourceAssets };
  } catch { return build; }
}
