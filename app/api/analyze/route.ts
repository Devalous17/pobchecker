import { NextResponse } from "next/server";
import { fetchPobRaw, ImportError } from "@/src/features/import/fetch-raw";
import { decodePobExport } from "@/src/features/pob/decode";
import { parsePobXml } from "@/src/features/pob/parse";
import { detectConditions } from "@/src/features/conditions/registry";
import { buildReport } from "@/src/features/analysis/report";
import { enrichBuildAssets } from "@/src/features/poeninja/assets";
import { hydratePassiveNodes } from "@/src/features/pob/tree-data";
import { enrichPoBGemMetadata } from "@/src/features/pob/gem-data";
export async function POST(request: Request) {
  try { const body = await request.json(); const imported = await fetchPobRaw(body?.url); let build = parsePobXml(decodePobExport(imported.raw)); build = await hydratePassiveNodes(build); build = await enrichPoBGemMetadata(build); build = await enrichBuildAssets(build); if (imported.fixture) build.diagnostics.push("Offline example fixture used because the local runtime could not reach pobb.in."); return NextResponse.json(buildReport(build, detectConditions(build))); }
  catch (error) { const status = error instanceof ImportError && error.code === "upstream" ? 502 : 400; return NextResponse.json({ error: error instanceof Error ? error.message : "Analysis failed." }, { status }); }
}
