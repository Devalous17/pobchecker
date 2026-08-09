import type { EngineResponse } from "@/src/features/engine/protocol";
import type { ScenarioMetric, ScenarioReport, TimelineState } from "./model";
import { metricFromEngine, metricUnavailable, weightedAverageDps } from "./timeline";

function noEngine(): ScenarioMetric { return metricUnavailable("The Headless PoB engine is unavailable, so no scenario value is shown."); }
export function buildScenarioReport(results: Partial<Record<"configured" | "peak" | "burst" | "initial" | "mapping", EngineResponse>>, encounterSeconds: number, timeline: TimelineState[] = []): ScenarioReport {
  const configured = results.configured ? metricFromEngine(results.configured.offence.totalDPS, ["PoB engine configuration"], [], "Authoritative value returned by the pinned PoB engine.") : noEngine();
  const peak = results.peak ? metricFromEngine(results.peak.offence.totalDPS, ["Peak scenario configuration"], [], "Highest value returned by the engine for the requested peak configuration.") : noEngine();
  const burst = results.burst ? metricFromEngine(results.burst.offence.totalDPS, ["Boss target", "Burst configuration"], ["Burst duration is a scenario assumption, not a guaranteed uptime."], "Engine-calculated temporary burst state.") : noEngine();
  const initial = results.initial ? metricFromEngine(results.initial.offence.totalDPS, ["Boss target", "Ramp conditions disabled"], ["Charges and explicitly ramp-dependent flags were disabled for the opening state."], "Engine-calculated opening state.") : noEngine();
  const mapping = results.mapping ? metricFromEngine(results.mapping.offence.totalDPS, ["Mapping configuration"], ["Recently-killed effects are only represented when the scenario enables them."], "Engine-calculated mapping state.") : noEngine();
  const sustainedValue = weightedAverageDps(timeline, encounterSeconds);
  const sustained: ScenarioMetric = sustainedValue === null ? noEngine() : { value: sustainedValue, unit: "dps", status: timeline.some((state) => state.source === "estimate") ? "estimated" : "calculated", confidence: timeline.some((state) => state.source !== "engine") ? "Low" : "High", includedConditions: timeline.map((state) => state.label), assumptions: ["Sustained DPS is the sum of each state DPS multiplied by its duration, divided by encounter duration."], explanation: "Timeline-weighted encounter average." };
  return { encounterSeconds, configured, peak, burst, initial, sustained, mapping, timeline, engine: results.configured?.engine ?? results.peak?.engine };
}
