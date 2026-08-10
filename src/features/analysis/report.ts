import type { Condition, NormalizedBuild } from "@/src/types/domain";
import { calculateHonestyScore } from "./honesty";

export function buildReport(build: NormalizedBuild, conditions: Condition[]) {
  const unverified = conditions.filter((condition) => condition.reliability === "Unverified").length;
  const persistent = conditions.filter((condition) => condition.availability === "available").length;
  const conditional = conditions.filter((condition) => condition.availability === "conditional").length;
  const recommendations = conditions.flatMap((condition) => {
    if (condition.id === "frenzy-charges" && condition.availability === "unavailable") return [{ title: "Frenzy Charges appear unsupported", detail: "Frenzy Charges are configured, but no generator was found in the imported source inventory. Related configured damage should be reviewed as unavailable until a generator is confirmed.", conditionId: condition.id }];
    if (condition.id === "recently-killed") return [{ title: "Recently-killed damage is encounter-limited", detail: "This condition is relevant to mapping and add phases, but should not be assumed for an isolated pinnacle boss.", conditionId: condition.id }];
    if (condition.id === "enemy-low-life") return [{ title: "Low-life damage is phase-dependent", detail: "Punishment supports the condition, but the enemy must reach its low-life phase before the benefit applies.", conditionId: condition.id }];
    if (condition.id.includes("recently-") && condition.category === "defence") return [{ title: `${condition.displayName} is trigger-dependent`, detail: condition.activationRequirement, conditionId: condition.id }];
    return [];
  });
  const sourceSummary = { gems: build.sources.filter((source) => source.category === "gem").length, items: build.sources.filter((source) => source.category === "item").length, flasks: build.sources.filter((source) => source.category === "flask").length, passives: build.sources.filter((source) => source.category === "passive").length, ascendancies: build.sources.filter((source) => source.category === "ascendancy").length };
  const honesty = calculateHonestyScore(build, conditions);
  const visibleConditions = conditions.filter((condition) => condition.availability !== "unavailable" && condition.reliability !== "Unverified");
  // Core-tree notables are already visible in the tree graph. Keep the compact
  // source summary focused on the ascendancy nodes that materially define the
  // character, rather than presenting a noisy list of every allocated notable.
  const topNotables = [...new Map(build.passiveNodes.filter((node) => node.type === "ascendancy").map((node) => [node.name, node])).values()].slice(0, 5);
  return { build, conditions: visibleConditions, auditedConditions: conditions, sourceSummary, honesty, topNotables, recommendations, confidence: unverified ? "Low" : conditions.length ? "Medium" : "Unknown", audit: { persistent, conditional, unverified, status: unverified ? "Needs review" : "Evidence-backed" }, warnings: ["Imported PoB values are exact snapshots; alternate combat states are calculated separately by the isolated worker and carry their own status and confidence.", ...(unverified ? [`${unverified} configured condition(s) have no source evidence in the imported data. They are kept in the audit but hidden from the main conditional-effects list.`] : []), ...build.diagnostics], assumptions: ["The imported XML is the user-selected Path of Building state.", "A source-backed condition can still be temporary or encounter-limited.", "Configured conditions are not treated as guaranteed gameplay availability."] };
}
