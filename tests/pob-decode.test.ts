import { describe, expect, it } from "vitest";
import { deflateRawSync } from "node:zlib";
import { decodePobExport } from "../src/features/pob/decode";
describe("PoB decoding", () => { it("decodes raw XML", () => expect(decodePobExport("<PathOfBuilding><Build/></PathOfBuilding>")).toContain("<Build")); it("decodes raw-deflate base64 and base64url", () => { const xml="<PathOfBuilding><Build/></PathOfBuilding>"; const encoded=deflateRawSync(Buffer.from(xml)).toString("base64"); expect(decodePobExport(encoded)).toBe(xml); expect(decodePobExport(encoded.replace(/\+/g,"-").replace(/\//g,"_").replace(/=/g,""))).toBe(xml); }); it("rejects malformed data", () => expect(() => decodePobExport("not-a-build")).toThrow()); });
