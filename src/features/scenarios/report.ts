import type { EngineResponse } from "@/src/features/engine/protocol";
import type { ScenarioMetric, ScenarioReport, TimelineState } from "./model";
import { metricFromEngine, metricUnavailable, weightedAverageDps } from "./timeline";

function noEngine(): ScenarioMetric { return metricUnavailable("The Headless PoB engine is unavailable, so no scenario value is shown."); }
const scenarioNames: Record<string, string> = {
  enemyIsBoss: "Pinnacle boss target",
  usePowerCharges: "Power Charges",
  useFrenzyCharges: "Frenzy Charges",
  useEnduranceCharges: "Endurance Charges",
  conditionEnemyLowLife: "Enemy low life",
  conditionKilledRecently: "Recently killed",
  conditionRecentlyKilled: "Recently killed",
  conditionUsingFlask: "Active flasks",
  buffOnslaught: "Onslaught",
  sigilOfPowerStages: "Sigil of Power",
  frostShieldStages: "Frost Shield",
  arcaneCloakUsedRecentlyCheck: "Arcane Cloak",
  conditionEnemyShocked: "Enemy shocked",
  conditionEnemyChilled: "Enemy chilled",
};
function activeConditions(result: EngineResponse | undefined, fallback: string[]): string[] {
  if (!result) return fallback;
  const active = Object.entries(result.scenario).flatMap(([key, value]) => {
    const isActive = typeof value === "boolean" ? value : typeof value === "number" ? value > 0 : value !== "None";
    return isActive && scenarioNames[key] ? [scenarioNames[key]] : [];
  });
  return active.length ? active : fallback;
}
export function buildScenarioReport(results: Partial<Record<"configured" | "unconditional" | "peak" | "burst" | "initial" | "mapping", EngineResponse>>, encounterSeconds: number, timeline: TimelineState[] = []): ScenarioReport {
  const configured = results.configured ? metricFromEngine(results.configured.offence.totalDPS, ["PoB engine configuration"], [], "Authoritative value returned by the pinned PoB engine.") : noEngine();
  const unconditional = results.unconditional ? metricFromEngine(results.unconditional.offence.totalDPS, ["No supported combat conditions", "No custom condition modifiers", "No boss target override"], ["Supported condition inputs are reset to inactive values for this baseline.", "Build-defining passive, item, gem, and ascendancy modifiers remain active."], "Engine-calculated baseline with combat conditions disabled.") : noEngine();
  const peak = results.peak ? metricFromEngine(results.peak.offence.totalDPS, activeConditions(results.peak, ["Peak scenario configuration"]), ["Unsupported or source-unverified imported inputs are explicitly disabled."], "Highest engine-calculated value using only detected compatible sources.") : noEngine();
  const burst = results.burst ? metricFromEngine(results.burst.offence.totalDPS, activeConditions(results.burst, ["Pinnacle boss target", "Burst configuration"]), ["Low-life phase and mapping-only effects are excluded from this practical boss window.", "Burst duration is a scenario assumption, not a guaranteed uptime."], "Engine-calculated temporary boss state.") : noEngine();
  const initial = results.initial ? metricFromEngine(results.initial.offence.totalDPS, activeConditions(results.initial, ["Pinnacle boss target", "Ramp conditions disabled"]), ["Reliable minimum-charge sources remain active; temporary and ramp-dependent flags are disabled for the opening state."], "Engine-calculated opening state.") : noEngine();
  const mapping = results.mapping ? metricFromEngine(results.mapping.offence.totalDPS, activeConditions(results.mapping, ["Mapping configuration"]), ["The target is not treated as a pinnacle boss; sourced flask and recently-killed effects may apply."], "Engine-calculated mapping state.") : noEngine();
  const sustainedValue = weightedAverageDps(timeline, encounterSeconds);
  const hasAssumptions = timeline.some((state) => state.assumptions.length > 0);
  const sustained: ScenarioMetric = sustainedValue === null ? noEngine() : { value: sustainedValue, unit: "dps", status: hasAssumptions || timeline.some((state) => state.source === "estimate") ? "estimated" : "calculated", confidence: timeline.some((state) => state.source !== "engine") ? "Low" : hasAssumptions ? "Medium" : "High", includedConditions: timeline.map((state) => state.label), assumptions: ["Sustained DPS is the sum of each state DPS multiplied by its duration, divided by encounter duration.", ...timeline.flatMap((state) => state.assumptions)], explanation: "Timeline-weighted encounter average." };
  return { encounterSeconds, configured, unconditional, peak, burst, initial, sustained, mapping, timeline, engine: results.configured?.engine ?? results.unconditional?.engine ?? results.peak?.engine };
}
