import type { EngineResponse } from "@/src/features/engine/protocol";
import type { Condition, NormalizedBuild } from "@/src/types/domain";

export type ScenarioId = "configured" | "unconditional" | "peak" | "burst" | "initial" | "sustained" | "mapping";
export type ResultStatus = "calculated" | "estimated" | "unavailable";

export type ScenarioConfig = Record<string, boolean | number | string>;
export interface ScenarioProfile { id: ScenarioId; label: string; purpose: string; config: ScenarioConfig; durationSeconds?: number; }
export interface TimelineState { id: string; label: string; durationSeconds: number; dps: number | null; source: "engine" | "estimate" | "unavailable"; assumptions: string[]; }
export interface ScenarioMetric { value: number | null; unit: "dps" | "seconds" | "percent"; status: ResultStatus; confidence: "High" | "Medium" | "Low" | "Unknown"; includedConditions: string[]; assumptions: string[]; explanation: string; }
export interface ScenarioReport { encounterSeconds: number; configured: ScenarioMetric; unconditional: ScenarioMetric; peak: ScenarioMetric; burst: ScenarioMetric; initial: ScenarioMetric; sustained: ScenarioMetric; mapping: ScenarioMetric; timeline: TimelineState[]; engine?: EngineResponse["engine"]; }

const configured = (build: NormalizedBuild, ...names: string[]) => build.configFields.find((field) => names.includes(field.name));
const hasSource = (conditions: Condition[], id: string) => conditions.find((condition) => condition.id === id)?.sourceDetected === true;
const hasKnownCondition = (conditions: Condition[], id: string) => {
  const condition = conditions.find((entry) => entry.id === id);
  return Boolean(condition && (condition.sourceDetected || condition.configured));
};
const numberInput = (build: NormalizedBuild, ...names: string[]) => {
  const value = Number(configured(build, ...names)?.value);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
};

function sourcedCombatState(build: NormalizedBuild, conditions: Condition[], options: { includeLowLife?: boolean; includeKilled?: boolean; includeBoss?: boolean } = {}): ScenarioConfig {
  // Alternate scenarios must reset known inputs first. Otherwise an unsupported
  // checkbox from the imported XML would silently leak into the calculation.
  const config: ScenarioConfig = {
    usePowerCharges: false,
    useFrenzyCharges: false,
    useEnduranceCharges: false,
    buffOnslaught: false,
    conditionUsingFlask: false,
    conditionEnemyLowLife: false,
    conditionKilledRecently: false,
    sigilOfPowerStages: 0,
    frostShieldStages: 0,
    arcaneCloakUsedRecentlyCheck: false,
    conditionEnemyShocked: false,
    conditionEnemyChilled: false,
  };
  if (options.includeBoss !== undefined) config.enemyIsBoss = options.includeBoss ? "Pinnacle" : "None";
  if (hasSource(conditions, "power-charges")) config.usePowerCharges = true;
  if (hasSource(conditions, "frenzy-charges")) config.useFrenzyCharges = true;
  if (hasSource(conditions, "endurance-charges")) config.useEnduranceCharges = true;
  if (hasSource(conditions, "onslaught")) config.buffOnslaught = true;
  if (hasSource(conditions, "flasks")) config.conditionUsingFlask = true;
  if (options.includeLowLife && hasSource(conditions, "enemy-low-life")) config.conditionEnemyLowLife = true;
  if (options.includeKilled && hasKnownCondition(conditions, "recently-killed")) config.conditionKilledRecently = true;
  const sigilStages = numberInput(build, "sigilOfPowerStages");
  if (hasSource(conditions, "sigil-of-power") && sigilStages !== undefined) config.sigilOfPowerStages = sigilStages;
  const frostStages = numberInput(build, "frostShieldStages");
  if (hasSource(conditions, "frost-shield") && frostStages !== undefined) config.frostShieldStages = frostStages;
  if (hasSource(conditions, "arcane-cloak")) config.arcaneCloakUsedRecentlyCheck = true;
  if (hasSource(conditions, "enemy-shocked")) config.conditionEnemyShocked = true;
  if (hasSource(conditions, "enemy-chilled")) config.conditionEnemyChilled = true;
  return config;
}

export function buildScenarioProfiles(build: NormalizedBuild, conditions: Condition[]): ScenarioProfile[] {
  const peak = sourcedCombatState(build, conditions, { includeBoss: true, includeLowLife: true, includeKilled: true });
  const burst = sourcedCombatState(build, conditions, { includeBoss: true });
  const initial: ScenarioConfig = { enemyIsBoss: "Pinnacle", useFrenzyCharges: false, conditionEnemyLowLife: false, conditionKilledRecently: false, conditionUsingFlask: false, buffOnslaught: false, sigilOfPowerStages: 0, frostShieldStages: 0, arcaneCloakUsedRecentlyCheck: false };
  // Conviction of Power and other reliable minimum-charge sources remain in the opening state.
  if (hasSource(conditions, "power-charges") && conditions.find((entry) => entry.id === "power-charges")?.reliability === "Reliable") initial.usePowerCharges = true;
  else initial.usePowerCharges = false;
  if (hasSource(conditions, "endurance-charges") && conditions.find((entry) => entry.id === "endurance-charges")?.reliability === "Reliable") initial.useEnduranceCharges = true;
  else initial.useEnduranceCharges = false;
  const mapping = sourcedCombatState(build, conditions, { includeBoss: false, includeKilled: true });
  mapping.conditionEnemyLowLife = false;
  return [
    { id: "configured", label: "Configured PoB", purpose: "The exact configuration supplied by the imported build.", config: {} },
    { id: "unconditional", label: "Unconditional DPS", purpose: "Baseline engine calculation with supported combat conditions and custom condition modifiers disabled.", config: { resetAllConditions: true, enemyIsBoss: "None" } },
    { id: "peak", label: "Peak DPS", purpose: "Highest engine-calculated value for compatible conditions with detected sources.", config: peak },
    { id: "burst", label: "Realistic burst DPS", purpose: "A practical boss window excluding mapping-only and low-life phase conditions.", config: burst, durationSeconds: 5 },
    { id: "initial", label: "Initial boss DPS", purpose: "Opening state: reliable baseline sources remain, while ramp and temporary states are inactive.", config: initial, durationSeconds: 3 },
    { id: "sustained", label: "Sustained boss DPS", purpose: "Timeline-weighted encounter average; no universal uptime multiplier.", config: { enemyIsBoss: "Pinnacle" }, durationSeconds: 30 },
    { id: "mapping", label: "Mapping DPS", purpose: "Clearing state where sourced flask and recently-killed effects may apply.", config: mapping, durationSeconds: 10 },
  ];
}

export const scenarioProfiles: ScenarioProfile[] = [
  { id: "configured", label: "Configured PoB", purpose: "The exact configuration supplied by the imported build.", config: {} },
  { id: "peak", label: "Peak DPS", purpose: "Highest engine-calculated value for compatible conditions with detected sources.", config: {} },
  { id: "burst", label: "Realistic burst DPS", purpose: "A practical boss window excluding mapping-only and low-life phase conditions.", config: { enemyIsBoss: "Pinnacle" }, durationSeconds: 5 },
  { id: "initial", label: "Initial boss DPS", purpose: "Opening state before temporary effects are active.", config: { enemyIsBoss: "Pinnacle" }, durationSeconds: 3 },
  { id: "sustained", label: "Sustained boss DPS", purpose: "Timeline-weighted encounter average; no universal uptime multiplier.", config: { enemyIsBoss: "Pinnacle" }, durationSeconds: 30 },
  { id: "mapping", label: "Mapping DPS", purpose: "Clearing state where sourced flask and recently-killed effects may apply.", config: { enemyIsBoss: "None" }, durationSeconds: 10 },
];
