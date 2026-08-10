import { calculateWithEngine } from "@/src/features/engine/client";
import type { EngineResponse } from "@/src/features/engine/protocol";
import { scenarioProfiles } from "./model";
import { buildScenarioReport } from "./report";

export async function calculateScenarioSet(xml: string, encounterSeconds = 30, fetcher: typeof fetch = fetch) {
  const results: Partial<Record<"configured" | "unconditional" | "peak" | "burst" | "initial" | "mapping", EngineResponse>> = {};
  for (const profile of scenarioProfiles) {
    if (profile.id === "sustained") continue;
    const result = await calculateWithEngine({ xml, scenario: profile.config }, fetcher);
    results[profile.id] = result;
  }
  return buildScenarioReport(results, encounterSeconds);
}
