import { NextResponse } from "next/server";
import { engineRequestSchema } from "@/src/features/engine/protocol";
import { calculateWithEngine, EngineUnavailableError } from "@/src/features/engine/client";
import { buildScenarioReport } from "@/src/features/scenarios/report";
import { scenarioProfiles } from "@/src/features/scenarios/model";
export async function POST(request: Request) {
  try {
    const body = await request.json(); const { encounterSeconds: rawEncounterSeconds, ...engineBody } = body ?? {}; const parsed = engineRequestSchema.parse(engineBody); const encounterSeconds = Math.min(Math.max(Number(rawEncounterSeconds ?? 30), 1), 300);
    const results: Record<string, Awaited<ReturnType<typeof calculateWithEngine>>> = {};
    for (const profile of scenarioProfiles) results[profile.id] = await calculateWithEngine({ xml: parsed.xml, scenario: { ...parsed.scenario, ...profile.config } });
    return NextResponse.json(buildScenarioReport({ configured: results.configured, peak: results.peak, burst: results.burst, initial: results.initial, mapping: results.mapping }, encounterSeconds));
  } catch (error) { const status = error instanceof EngineUnavailableError ? 503 : 400; return NextResponse.json({ error: error instanceof Error ? error.message : "Scenario calculation failed." }, { status }); }
}
