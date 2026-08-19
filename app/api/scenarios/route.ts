import { NextResponse } from "next/server";
import { engineRequestSchema } from "@/src/features/engine/protocol";
import { calculateWithEngine, EngineUnavailableError, getEngineStatus } from "@/src/features/engine/client";
import { buildScenarioReport, highestValidResult, scenarioDps } from "@/src/features/scenarios/report";
import { buildAutomaticConfiguration, buildScenarioProfiles } from "@/src/features/scenarios/model";
import type { TimelineState } from "@/src/features/scenarios/model";
import { parsePobXml } from "@/src/features/pob/parse";
import { detectConditions } from "@/src/features/conditions/registry";
export async function POST(request: Request) {
  try {
    const body = await request.json(); const { encounterSeconds: rawEncounterSeconds, disabledAutomatic = [], ...engineBody } = body ?? {}; const parsed = engineRequestSchema.parse(engineBody); const disabledIds = Array.isArray(disabledAutomatic) ? disabledAutomatic.filter((value): value is string => typeof value === "string") : []; const encounterSeconds = Math.min(Math.max(Number(rawEncounterSeconds ?? 30), 1), 300);
    const parsedBuild = parsePobXml(parsed.xml);
    const build = parsed.scenario.skillName ? { ...parsedBuild, mainSkill: parsed.scenario.skillName } : parsedBuild;
    const conditions = detectConditions(build);
    const profiles = buildScenarioProfiles(build, conditions, disabledIds);
    const results: Record<string, Awaited<ReturnType<typeof calculateWithEngine>>> = {};
    for (const profile of profiles) results[profile.id] = await calculateWithEngine({ xml: parsed.xml, scenario: { ...profile.config, ...parsed.scenario } });
    const timeline: TimelineState[] = [];
    const initialSeconds = Math.min(3, encounterSeconds);
    const burstSeconds = Math.min(5, Math.max(encounterSeconds - initialSeconds, 0));
    const remainingSeconds = Math.max(encounterSeconds - initialSeconds - burstSeconds, 0);
    if (initialSeconds && results.initial) timeline.push({ id: "initial", label: "Initial boss state", durationSeconds: initialSeconds, dps: scenarioDps(results.initial).value, source: "engine", assumptions: ["Opening state disables explicitly ramp-dependent configuration inputs."] });
    if (burstSeconds && results.burst) timeline.push({ id: "burst", label: "Realistic burst window", durationSeconds: burstSeconds, dps: scenarioDps(results.burst).value, source: "engine", assumptions: ["Burst duration is an explicit five-second scenario assumption until condition durations are fully resolved."] });
    if (remainingSeconds && results.sustained) timeline.push({ id: "sustained-rest", label: "Sustained source-backed boss state", durationSeconds: remainingSeconds, dps: scenarioDps(results.sustained).value, source: "engine", assumptions: ["The remaining encounter uses a source-backed boss state; imported unverified PoB conditions are not carried into sustained DPS."] });
    const curseNames = [...new Set(build.skillSetups.flatMap((setup) => setup.gems).filter((gem) => /mark|curse|punishment|conductivity|flammability|elemental weakness|frostbite|despair|temporal chains|vulnerability/i.test(gem.name)).map((gem) => gem.name))].slice(0, 10);
    const mainSetup = build.skillSetups.find((setup) => setup.gems.some((gem) => gem.name.toLowerCase().replace(/[^a-z0-9]/g, "") === (build.mainSkill ?? "").toLowerCase().replace(/[^a-z0-9]/g, ""))) ?? build.skillSetups.find((setup) => setup.includeInFullDPS);
    const supportNames = [...new Set((mainSetup?.gems ?? []).filter((gem) => gem.support && gem.enabled && !gem.provided && !gem.trigger).map((gem) => gem.name))].slice(0, 8);
    const configuredDps = results.configured ? scenarioDps(results.configured).value : null;
    const compareDisabledGems = async (names: string[]) => {
      const contributions = [];
      for (const name of names) {
      try {
        const withoutCurse = await calculateWithEngine({ xml: parsed.xml, scenario: { disableGems: [name] } });
        const withoutDps = scenarioDps(withoutCurse).value;
        const comparable = configuredDps !== null && withoutDps !== null;
        contributions.push({
          name,
          withDps: configuredDps,
          withoutDps,
          deltaDps: comparable ? configuredDps - withoutDps : null,
          status: comparable ? "calculated" as const : "unavailable" as const,
          confidence: comparable ? "High" as const : "Unknown" as const,
          explanation: comparable ? `Configured-state comparison with ${name} disabled. This is a controlled PoB delta, not a guaranteed whole-fight uptime value.` : `The worker did not return comparable damage values with ${name} disabled.`,
        });
      } catch {
        contributions.push({ name, withDps: configuredDps, withoutDps: null, deltaDps: null, status: "unavailable" as const, confidence: "Unknown" as const, explanation: `The worker could not complete the controlled comparison with ${name} disabled.` });
      }
      }
      return contributions;
    };
    const curseContributions = await compareDisabledGems(curseNames);
    const supportContributions = await compareDisabledGems(supportNames);
    const automatic = buildAutomaticConfiguration(build, conditions, disabledIds);
    const report = buildScenarioReport({ configured: results.configured, unconditional: results.unconditional, recommended: results.recommended, peak: highestValidResult(results) ?? results.peak, burst: results.burst, initial: results.initial, mapping: results.mapping }, encounterSeconds, timeline, automatic.hints);
    report.curseContributions = curseContributions;
    report.supportContributions = supportContributions;
    return NextResponse.json(report);
  } catch (error) {
    const status = error instanceof EngineUnavailableError ? 503 : 400;
    const engine = error instanceof EngineUnavailableError ? await getEngineStatus() : undefined;
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Scenario calculation failed.",
      code: error instanceof EngineUnavailableError ? "ENGINE_UNAVAILABLE" : "SCENARIO_REQUEST_INVALID",
      engine,
      nextStep: engine?.state === "not-configured"
        ? "Start the isolated PoB worker and configure POB_ENGINE_URL before running scenarios."
        : engine?.state === "unreachable"
          ? "Start or restart the isolated PoB worker, then run the scenarios again."
          : undefined,
    }, { status });
  }
}
