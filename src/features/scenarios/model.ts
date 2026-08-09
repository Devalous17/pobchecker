import type { EngineResponse } from "@/src/features/engine/protocol";

export type ScenarioId = "configured" | "peak" | "burst" | "initial" | "sustained" | "mapping";
export type ResultStatus = "calculated" | "estimated" | "unavailable";

export interface ScenarioProfile { id: ScenarioId; label: string; purpose: string; config: Record<string, boolean>; durationSeconds?: number; }
export interface TimelineState { id: string; label: string; durationSeconds: number; dps: number | null; source: "engine" | "estimate" | "unavailable"; assumptions: string[]; }
export interface ScenarioMetric { value: number | null; unit: "dps" | "seconds" | "percent"; status: ResultStatus; confidence: "High" | "Medium" | "Low" | "Unknown"; includedConditions: string[]; assumptions: string[]; explanation: string; }
export interface ScenarioReport { encounterSeconds: number; configured: ScenarioMetric; peak: ScenarioMetric; burst: ScenarioMetric; initial: ScenarioMetric; sustained: ScenarioMetric; mapping: ScenarioMetric; timeline: TimelineState[]; engine?: EngineResponse["engine"]; }

export const scenarioProfiles: ScenarioProfile[] = [
  { id: "configured", label: "Configured PoB", purpose: "The exact configuration supplied by the imported build.", config: {} },
  { id: "peak", label: "Peak DPS", purpose: "Highest engine-calculated value for the selected compatible conditions.", config: {} },
  { id: "burst", label: "Realistic burst DPS", purpose: "A temporary boss window using only explicitly enabled scenario conditions.", config: { enemyIsBoss: true }, durationSeconds: 5 },
  { id: "initial", label: "Initial boss DPS", purpose: "Opening state before ramp-dependent effects are assumed active.", config: { enemyIsBoss: true, usePowerCharges: false, useFrenzyCharges: false, useEnduranceCharges: false, conditionEnemyLowLife: false, conditionRecentlyKilled: false }, durationSeconds: 3 },
  { id: "sustained", label: "Sustained boss DPS", purpose: "Timeline-weighted encounter average; no universal uptime multiplier.", config: { enemyIsBoss: true }, durationSeconds: 30 },
  { id: "mapping", label: "Mapping DPS", purpose: "Clearing state where recently-killed and flask conditions may be relevant.", config: { conditionRecentlyKilled: true }, durationSeconds: 10 },
];
