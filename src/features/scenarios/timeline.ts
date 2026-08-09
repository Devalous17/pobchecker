import type { ScenarioMetric, TimelineState } from "./model";

export function weightedAverageDps(states: TimelineState[], encounterSeconds: number): number | null {
  if (!Number.isFinite(encounterSeconds) || encounterSeconds <= 0 || states.length === 0) return null;
  if (states.some((state) => state.dps === null || state.durationSeconds < 0)) return null;
  const totalDuration = states.reduce((sum, state) => sum + state.durationSeconds, 0);
  if (totalDuration <= 0 || totalDuration > encounterSeconds) return null;
  return states.reduce((sum, state) => sum + (state.dps as number) * state.durationSeconds, 0) / encounterSeconds;
}

export function metricUnavailable(explanation: string, assumptions: string[] = []): ScenarioMetric { return { value: null, unit: "dps", status: "unavailable", confidence: "Unknown", includedConditions: [], assumptions, explanation }; }
export function metricFromEngine(value: number | null | undefined, includedConditions: string[], assumptions: string[], explanation: string): ScenarioMetric { return value === null || value === undefined ? metricUnavailable("The engine did not return this value.", assumptions) : { value, unit: "dps", status: "calculated", confidence: "High", includedConditions, assumptions, explanation }; }
