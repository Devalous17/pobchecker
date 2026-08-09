import { afterEach, describe, expect, it, vi } from "vitest";
import { parsePobXml } from "../src/features/pob/parse";
import { hydratePassiveNodes } from "../src/features/pob/tree-data";

const treeLua = `return {
    ["groups"]= {
        [37]= {
            ["x"]= 100,
            ["y"]= 200,
            ["nodes"]= {
                "1",
                "2"
            }
        }
    },
    ["nodes"]= {
        [1]= {
            ["skill"]= 1,
            ["name"]= "Test Notable",
            ["isNotable"]= true,
            ["group"]= 37,
            ["orbit"]= 0,
            ["orbitIndex"]= 0,
            ["out"]= { "2" },
            ["stats"]= { "10% increased Damage" }
        },
        [2]= {
            ["skill"]= 2,
            ["name"]= "Test Passive",
            ["group"]= 37,
            ["orbit"]= 0,
            ["orbitIndex"]= 0,
            ["out"]= {}
        }
    },
    ["jewelSlots"]= {},
    ["constants"]= {
        ["skillsPerOrbit"] = { 1 },
        ["orbitRadii"] = { 0 }
    }
}`;

afterEach(() => vi.restoreAllMocks());

describe("official passive tree hydration", () => {
  it("hydrates the full graph and highlights allocated nodes", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(treeLua, { status: 200 })));
    const build = parsePobXml(`<PathOfBuilding><Build/><Skills/><Items/><Config/><Tree><Spec id="1" treeVersion="3_29" nodes="1"/></Tree></PathOfBuilding>`);
    const hydrated = await hydratePassiveNodes(build);
    expect(hydrated.treeGraph).toHaveLength(2);
    expect(hydrated.treeGraph?.find((node) => node.id === "1")).toMatchObject({ name: "Test Notable", allocated: true, stats: ["10% increased Damage"] });
    expect(hydrated.treeGraph?.find((node) => node.id === "2")?.allocated).toBe(false);
  });
});
