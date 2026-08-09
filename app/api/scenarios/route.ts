import { NextResponse } from "next/server";
import { engineRequestSchema } from "@/src/features/engine/protocol";
import { calculateWithEngine, EngineUnavailableError } from "@/src/features/engine/client";
import { buildScenarioReport } from "@/src/features/scenarios/report";
import { scenarioProfiles } from "@/src/features/scenarios/model";
import type { TimelineState } from "@/src/features/scenarios/model";
export async function POST(request: Request) {
  try {
    const body = await request.json(); const { encounterSeconds: rawEncounterSeconds, ...engineBody } = body ?? {}; const parsed = engineRequestSchema.parse(engineBody); const encounterSeconds = Math.min(Math.max(Number(rawEncounterSeconds ?? 30), 1), 300);
    const results: Record<string, Awaited<ReturnType<typeof calculateWithEngine>>> = {};
    for (const profile of scenarioProfiles) results[profile.id] = await calculateWithEngine({ xml: parsed.xml, scenario: { ...parsed.scenario, ...profile.config } });
    const timeline: TimelineState[] = [];
    const initialSeconds = Math.min(3, encounterSeconds);
    const burstSeconds = Math.min(5, Math.max(encounterSeconds - initialSeconds, 0));
    const remainingSeconds = Math.max(encounterSeconds - initialSeconds - burstSeconds, 0);
    if (initialSeconds && results.initial) timeline.push({ id: "initial", label: "Initial boss state", durationSeconds: initialSeconds, dps: results.initial.offence.totalDPS ?? null, source: "engine", assumptions: ["Opening state disables explicitly ramp-dependent configuration inputs."] });
    if (burstSeconds && results.burst) timeline.push({ id: "burst", label: "Realistic burst window", durationSeconds: burstSeconds, dps: results.burst.offence.totalDPS ?? null, source: "engine", assumptions: ["Burst duration is an explicit five-second scenario assumption until condition durations are fully resolved."] });
    if (remainingSeconds && results.configured) timeline.push({ id: "configured-rest", label: "Configured state after burst", durationSeconds: remainingSeconds, dps: results.configured.offence.totalDPS ?? null, source: "engine", assumptions: ["The configured PoB state is used for the remaining encounter time; cooldown and reactivation transitions are not yet modeled."] });
    return NextResponse.json(buildScenarioReport({ configured: results.configured, peak: results.peak, burst: results.burst, initial: results.initial, mapping: results.mapping }, encounterSeconds, timeline));
  } catch (error) { const status = error instanceof EngineUnavailableError ? 503 : 400; return NextResponse.json({ error: error instanceof Error ? error.message : "Scenario calculation failed." }, { status }); }
}
