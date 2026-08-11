import type { EngineResponse } from "@/src/features/engine/protocol";
import type { AutoConfigurationHint, ScenarioMetric, ScenarioReport, TimelineState } from "./model";
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
  conditionSummonedTotemRecently: "Recently summoned a totem",
  conditionShockEffect: "Shock effect",
  conditionHaveTotem: "Active totem present",
  conditionEnemyLightningExposure: "Enemy lightning exposure",
  conditionHitSpellRecently: "Hit with a spell recently",
  conditionEnemyUnnerved: "Enemy unnerved",
  conditionTotemsHitSpellRecently: "Totems hit with a spell recently",
  conditionFocused: "Focused",
  conditionAttackedRecently: "Attacked recently",
  conditionEnemyChilledEffect: "Enemy chill effect",
  conditionUsedWarcryRecently: "Used a warcry recently",
  TotemsSummoned: "Summoned totems",
  conditionCastSpellRecently: "Cast a spell recently",
  buffArcaneSurge: "Arcane Surge",
  infusedChannellingInfusion: "Infused Channelling infusion",
  overrideInspirationCharges: "Inspiration charges",
  skillPartCalcs: "PoB skill-part index",
  skillCount: "PoB instance/count override",
};
function activeConditions(result: EngineResponse | undefined, fallback: string[]): string[] {
  if (!result) return fallback;
  const active = Object.entries(result.scenario).flatMap(([key, value]) => {
    const isActive = typeof value === "boolean" ? value : typeof value === "number" ? value > 0 : value !== "None";
    return isActive && scenarioNames[key] ? [scenarioNames[key]] : [];
  });
  return active.length ? active : fallback;
}

/** Select the most representative exported channel without confusing hit DPS
 * with the build's total output. FullDPS is PoB's aggregate channel when it is
 * present; CombinedDPS is the next-best aggregate for multi-channel builds.
 * DoT-only builds legitimately export TotalDPS=0. */
export function scenarioDps(result: EngineResponse): { value: number | null; source: string } {
  const candidates: Array<[string, number | null | undefined]> = [
    ["FullDPS", result.offence.fullDPS],
    ["CombinedDPS", result.offence.combinedDPS],
    ["TotalDPS", result.offence.totalDPS],
    ["TotalDotDPS", result.offence.totalDot],
    ["MinionCombinedDPS", result.minion?.combinedDPS],
    ["MinionDPS", result.minion?.totalDPS],
  ];
  const selected = candidates.find(([, value]) => typeof value === "number" && Number.isFinite(value) && value > 0);
  if (!selected) return { value: null, source: "No positive PoB damage channel" };
  // FullDPS/CombinedDPS already represent PoB's aggregate output. When those
  // channels are absent, TotalDPS is the selected skill's per-source channel;
  // multiply it by explicit active totems/ballistas so delivery-source builds
  // are not graded as if only one totem were dealing damage.
  const deliveryCount = typeof result.scenario.TotemsSummoned === "number" && result.scenario.TotemsSummoned > 1 ? result.scenario.TotemsSummoned : 1;
  const aggregate = selected[0] === "FullDPS" || selected[0] === "CombinedDPS";
  return aggregate || deliveryCount === 1
    ? { value: selected[1] as number, source: selected[0] }
    : { value: (selected[1] as number) * deliveryCount, source: `${selected[0]} × ${deliveryCount} active totems/ballistas` };
}

/** Highest valid means the maximum of the boss-appropriate, source-backed
 * states. The imported configured state is deliberately excluded because it
 * may contain unverified or encounter-incompatible PoB inputs. */
export function highestValidResult(results: Partial<Record<"peak" | "burst" | "initial", EngineResponse>>): EngineResponse | undefined {
  return (["peak", "burst", "initial"] as const)
    .map((id) => results[id])
    .filter((result): result is EngineResponse => Boolean(result))
    .sort((left, right) => (scenarioDps(right).value ?? -Infinity) - (scenarioDps(left).value ?? -Infinity))[0];
}

function metricForScenario(result: EngineResponse, includedConditions: string[], assumptions: string[], explanation: string, confidence: ScenarioMetric["confidence"] = "High"): ScenarioMetric {
  const selected = scenarioDps(result);
  const metricExplanation = `${explanation} Selected PoB ${selected.source} for this build's damage channel.`;
  const metric = metricFromEngine(selected.value, includedConditions, assumptions, metricExplanation, result.defence);
  return { ...metric, confidence: metric.value === null ? "Unknown" : confidence, damageChannel: selected.source };
}

export function buildScenarioReport(results: Partial<Record<"configured" | "unconditional" | "recommended" | "peak" | "burst" | "initial" | "mapping", EngineResponse>>, encounterSeconds: number, timeline: TimelineState[] = [], autoConfiguration: AutoConfigurationHint[] = []): ScenarioReport {
  const configured = results.configured ? metricForScenario(results.configured, ["PoB engine configuration"], [], "Authoritative value returned by the pinned PoB engine.") : noEngine();
  const unconditional = results.unconditional ? metricForScenario(results.unconditional, ["No supported combat conditions", "No custom condition modifiers", "No boss target override"], ["Supported condition inputs are reset to inactive values for this baseline.", "Build-defining passive, item, gem, and ascendancy modifiers remain active."], "Engine-calculated baseline with combat conditions disabled.") : noEngine();
  const recommended = results.recommended ? metricForScenario(results.recommended, activeConditions(results.recommended, ["Source-backed recommended configuration"]), ["Missing numeric PoB inputs use bounded median defaults.", "Temporary conditions are shown as an estimate, not guaranteed uptime."], "Engine-calculated source-backed configuration recommended by the analyzer.", "Medium") : noEngine();
  const peak = results.peak ? metricForScenario(results.peak, activeConditions(results.peak, ["Peak scenario configuration"]), ["Unsupported or source-unverified imported inputs are explicitly disabled."], "Highest engine-calculated value using only detected compatible sources.", "Medium") : noEngine();
  const burst = results.burst ? metricForScenario(results.burst, activeConditions(results.burst, ["Pinnacle boss target", "Burst configuration"]), ["Low-life phase and mapping-only effects are excluded from this practical boss window.", "Burst duration is a scenario assumption, not a guaranteed uptime."], "Engine-calculated temporary boss state.", "Medium") : noEngine();
  const initial = results.initial ? metricForScenario(results.initial, activeConditions(results.initial, ["Pinnacle boss target", "Ramp conditions disabled"]), ["Reliable minimum-charge sources remain active; temporary and ramp-dependent flags are disabled for the opening state."], "Engine-calculated opening state.") : noEngine();
  const mapping = results.mapping ? metricForScenario(results.mapping, activeConditions(results.mapping, ["Mapping configuration"]), ["The target is not treated as a pinnacle boss; sourced flask and recently-killed effects may apply."], "Engine-calculated mapping state.", "Medium") : noEngine();
  const sustainedRaw = weightedAverageDps(timeline, encounterSeconds);
  const validPeak = [peak.value, burst.value, initial.value].filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const sustainedValue = sustainedRaw === null ? null : validPeak.length ? Math.min(sustainedRaw, Math.max(...validPeak)) : sustainedRaw;
  const hasAssumptions = timeline.some((state) => state.assumptions.length > 0);
  const sustainedCapNote = sustainedRaw !== null && sustainedValue !== sustainedRaw ? "The weighted average was capped at the highest valid boss state; sustained DPS cannot exceed valid peak DPS." : undefined;
  const sustained: ScenarioMetric = sustainedValue === null ? noEngine() : { value: sustainedValue, unit: "dps", status: hasAssumptions || timeline.some((state) => state.source === "estimate") ? "estimated" : "calculated", confidence: timeline.some((state) => state.source !== "engine") ? "Low" : hasAssumptions ? "Medium" : "High", includedConditions: timeline.map((state) => state.label), assumptions: ["Sustained DPS is the sum of each state DPS multiplied by its duration, divided by encounter duration.", ...(sustainedCapNote ? [sustainedCapNote] : []), ...timeline.flatMap((state) => state.assumptions)], explanation: "Timeline-weighted encounter average." };
  return { encounterSeconds, configured, unconditional, recommended, autoConfiguration, peak, burst, initial, sustained, mapping, timeline, engine: results.configured?.engine ?? results.unconditional?.engine ?? results.recommended?.engine ?? results.peak?.engine };
}
