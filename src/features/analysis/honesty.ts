import type { Condition, NormalizedBuild } from "@/src/types/domain";

export interface HonestyFactor { label: string; points: number; explanation: string; conditionId?: string; }
export function calculateHonestyScore(build: NormalizedBuild, conditions: Condition[]) {
  const factors: HonestyFactor[] = [];
  for (const condition of conditions) {
    if (condition.reliability === "Unverified") factors.push({ label: `${condition.displayName} has no verified source`, points: -2, explanation: "The condition is enabled in PoB but no matching generator or source was found in the imported build.", conditionId: condition.id });
    if (condition.reliability === "Mapping-only") factors.push({ label: `${condition.displayName} is encounter-limited`, points: -1, explanation: "This condition can be valid for mapping or add phases but should not be treated as universal boss uptime.", conditionId: condition.id });
  }
  if (build.passiveNodes.length === 0) factors.push({ label: "Passive tree data unavailable", points: -1, explanation: "The imported XML did not expose enough tree data for structural verification." });
  const score = Math.max(1, Math.min(10, 10 + factors.reduce((total, factor) => total + factor.points, 0)));
  return { score, label: score >= 8 ? "High transparency" : score >= 5 ? "Needs review" : "Low transparency", factors, explanation: "This score measures how well configured combat conditions are supported and disclosed. It does not measure build power or player skill." };
}
