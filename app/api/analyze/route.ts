import { NextResponse } from "next/server";
import { fetchPobRaw, ImportError } from "@/src/features/import/fetch-raw";
import { decodePobExport } from "@/src/features/pob/decode";
import { parsePobXml } from "@/src/features/pob/parse";
import { detectConditions } from "@/src/features/conditions/registry";
import { buildReport } from "@/src/features/analysis/report";
import { enrichBuildAssets } from "@/src/features/poeninja/assets";
import { enrichPoBGemMetadata } from "@/src/features/pob/gem-data";
import { enrichPoBUniqueMetadata } from "@/src/features/pob/unique-data";
import { selectMainSkillFromPoBMarker } from "@/src/features/pob/main-skill";
import { enrichSocketedSupportEvidence } from "@/src/features/pob/socketed-supports";
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const source = String(body?.source ?? body?.url ?? "").trim();
    if (!source) throw new ImportError("empty", "Paste a pobb.in URL or a Path of Building import code.");
    const isUrl = /^https?:\/\//i.test(source);
    const imported = isUrl ? await fetchPobRaw(source) : { raw: source, fixture: false };
      let build = parsePobXml(decodePobExport(imported.raw));
      build = await enrichPoBGemMetadata(build);
      build = enrichPoBUniqueMetadata(build);
      build = enrichSocketedSupportEvidence(build);
      build = await enrichBuildAssets(build);
    build = selectMainSkillFromPoBMarker(build);
    if (imported.fixture) build.diagnostics.push("Offline example fixture used because the local runtime could not reach pobb.in.");
    if (!isUrl) build.diagnostics.push("Direct Path of Building import code used; no pobb.in request was needed.");
    return NextResponse.json(buildReport(build, detectConditions(build)));
  }
  catch (error) { const status = error instanceof ImportError && error.code === "upstream" ? 502 : 400; return NextResponse.json({ error: error instanceof Error ? error.message : "Analysis failed." }, { status }); }
}
