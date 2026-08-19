import type {
  Confidence,
  ContentCapability,
  ContentCapabilityKey,
  ContentCoverage,
  ContentVerdict,
  ImportedStats,
  OverviewRatings,
  QualityGrade,
  QualityRating,
} from "@/src/types/domain";
import { inferSkillCapabilities } from "./capabilities";
import type { CapabilityBuild } from "./capabilities";

type ContentBuild = CapabilityBuild & { importedStats?: Partial<ImportedStats> };
type ContentCondition = { reliability: string };

const clamp = (value: number) => Math.max(1, Math.min(10, value));
const round1 = (value: number) => Math.round(value * 10) / 10;
const gradeFor = (score: number): QualityGrade => score >= 9 ? "S" : score >= 8 ? "A" : score >= 7 ? "B" : score >= 6 ? "C" : score >= 5 ? "D" : score >= 3 ? "E" : "F";
const labelFor = (score: number) => score >= 9 ? "Exceptional" : score >= 8 ? "Very strong" : score >= 7 ? "Strong" : score >= 6 ? "Functional" : score >= 5 ? "Needs improvement" : score >= 3 ? "Fragile" : "Critical gaps";
const rating = (score: number, confidence: Confidence, basis: string[]): QualityRating => {
  const rounded = round1(clamp(score));
  return { score: rounded, grade: gradeFor(rounded), label: labelFor(rounded), confidence, basis };
};
const scoreOf = (value: QualityRating) => value.score ?? 1;

const verdictFor = (score: number): ContentVerdict => score >= 8 ? "Comfortable" : score >= 6 ? "Viable" : score >= 4 ? "Conditional" : "Not evidenced";
const unique = (items: string[]) => [...new Set(items.filter(Boolean))];

function contentConfidence(build: ContentBuild, conditions: ContentCondition[], hasDirectEvidence: boolean): Confidence {
  const capabilities = inferSkillCapabilities(build);
  const unverified = conditions.filter((condition) => condition.reliability === "Unverified").length;
  if (capabilities.confidence === "Low" || !hasDirectEvidence || unverified > 1) return "Low";
  if (unverified || conditions.some((condition) => ["Conditional", "Temporary", "Situational", "Ramp-dependent"].includes(condition.reliability))) return "Medium";
  return "High";
}

function capability(
  key: ContentCapabilityKey,
  label: string,
  score: number,
  build: ContentBuild,
  conditions: ContentCondition[],
  evidence: string[],
  risks: string[],
): ContentCapability {
  const capabilities = inferSkillCapabilities(build);
  const hasDirectEvidence = capabilities.coverageSignals.length > 0 || capabilities.clearSignals.length > 0 || (key === "pinnacle-bosses" && capabilities.singleTargetSignals.length > 1);
  const adjustedRisks = unique([
    ...risks,
    capabilities.delivery === "unknown" ? "The delivery model could not be identified confidently from the export." : "",
    ["totem/ballista", "minion/summon", "trap", "mine", "brand", "channelled", "triggered"].includes(capabilities.delivery)
      ? "Uptime, placement, AI, or deployment time is not fully simulated for this delivery type."
      : "",
    conditions.some((condition) => condition.reliability === "Unverified") ? "Unverified conditions are shown as risk and are not treated as permanent uptime." : "",
  ]);
  const adjustedEvidence = unique([
    `Delivery model: ${capabilities.delivery}.`,
    ...evidence,
  ]);
  const confidence = contentConfidence(build, conditions, hasDirectEvidence);
  const ratingValue = rating(score, confidence, adjustedEvidence);
  return { key, label, rating: ratingValue, verdict: verdictFor(ratingValue.score ?? 1), evidence: adjustedEvidence, risks: adjustedRisks.length ? adjustedRisks : ["No additional caveat was detected in the imported snapshot."] };
}

export function evaluateContentCoverage(
  build: ContentBuild,
  categoryRatings: OverviewRatings,
  conditions: ContentCondition[],
): ContentCoverage {
  const capabilities = inferSkillCapabilities(build);
  const stats = build.importedStats ?? {};
  const offence = scoreOf(categoryRatings.dps);
  const mapping = scoreOf(categoryRatings.clear);
  const defence = scoreOf(categoryRatings.defence);
  const bossing = scoreOf(categoryRatings.bossing);
  const volatility = conditions.filter((condition) => ["Conditional", "Temporary", "Situational", "Ramp-dependent"].includes(condition.reliability)).length;
  const unverified = conditions.filter((condition) => condition.reliability === "Unverified").length;
  const mappingOnly = conditions.filter((condition) => condition.reliability === "Mapping-only").length;
  const reliabilityAdjustment = Math.min(1.35, unverified * 0.45 + volatility * 0.08 + mappingOnly * 0.12);
  const hasCoverageEvidence = capabilities.coverageSignals.length > 0 || capabilities.clearSignals.length > 0;
  const movementSpeed = typeof stats.movementSpeed === "number" && Number.isFinite(stats.movementSpeed)
    ? stats.movementSpeed <= 10 ? stats.movementSpeed * 100 : stats.movementSpeed
    : 0;
  const movementEvidence = movementSpeed > 0 ? `Imported movement speed contributes to ordinary map traversal (${round1(movementSpeed)}%).` : "Movement speed was not exported, so fast map traversal is not assumed.";
  const coverageEvidence = capabilities.coverageSignals.length ? `Coverage evidence: ${capabilities.coverageSignals.join(", ")}.` : "No direct pack-coverage evidence was exported.";
  const directDeliveryRisk = !hasCoverageEvidence ? "Single-target damage is not converted into a perfect mapping claim without pack-coverage evidence." : "";

  const mappingScore = clamp(mapping * 0.55 + defence * 0.3 + offence * 0.15 - reliabilityAdjustment);
  const mappingCapped = hasCoverageEvidence ? mappingScore : Math.min(mappingScore, 7.2);
  const pinnacleScore = clamp(bossing * 0.5 + offence * 0.18 + defence * 0.32 - reliabilityAdjustment * 0.8);
  const invitationScore = clamp(Math.min(mapping, bossing) * 0.38 + offence * 0.2 + defence * 0.42 - reliabilityAdjustment);
  const delveScore = clamp(bossing * 0.28 + defence * 0.45 + mapping * 0.27 - reliabilityAdjustment * 0.75);
  const blightScore = clamp(mapping * 0.5 + defence * 0.3 + offence * 0.2 - reliabilityAdjustment);
  const blightCapped = hasCoverageEvidence ? blightScore : Math.min(blightScore, 6.8);
  const ritualScore = clamp(mapping * 0.35 + defence * 0.4 + offence * 0.25 - reliabilityAdjustment);

  const contentCapabilities = [
    capability("mapping", "T16 mapping", mappingCapped, build, conditions, [
      `Mapping rating blends Mapping ${round1(mapping)}, Defence ${round1(defence)}, and DPS ${round1(offence)}.`,
      coverageEvidence,
      movementEvidence,
    ], [directDeliveryRisk]),
    capability("pinnacle-bosses", "Pinnacle bosses", pinnacleScore, build, conditions, [
      `Bossing rating blends Bossing ${round1(bossing)}, DPS ${round1(offence)}, and Defence ${round1(defence)}.`,
      capabilities.singleTargetSignals.join(" "),
    ], [mappingOnly ? `${mappingOnly} mapping-only condition${mappingOnly === 1 ? " is" : "s are"} not treated as universal boss evidence.` : "", "Boss mechanics, movement downtime, and phase failures are not simulated."].filter(Boolean)),
    capability("invitations", "Invitations", invitationScore, build, conditions, [
      `Invitation rating requires both pack clear and boss readiness: Mapping ${round1(mapping)}, Bossing ${round1(bossing)}, Defence ${round1(defence)}.`,
      "The score is intentionally pulled toward the weaker half of the encounter rather than rewarding a single extreme stat.",
    ], ["Multi-boss mechanics, arena layout, and encounter-specific modifiers are not simulated."]),
    capability("delve", "Delve", delveScore, build, conditions, [
      `Delve rating emphasizes repeated-hit survival ${round1(defence)}, then boss damage ${round1(bossing)} and clear ${round1(mapping)}.`,
      "No fixed depth is claimed; the result describes the imported build's general delve readiness.",
    ], ["Depth scaling, darkness resistance, and route-specific hazards are not exported as a universal target."]),
    capability("blight", "Blight / waves", blightCapped, build, conditions, [
      `Wave-content rating blends pack control ${round1(mapping)}, Defence ${round1(defence)}, and DPS ${round1(offence)}.`,
      hasCoverageEvidence ? coverageEvidence : "The score is capped because the export does not show a clear pack-control mechanic.",
    ], ["Tower placement, lane layout, and map-specific Blight modifiers are not simulated."]),
    capability("ritual", "Ritual / arena waves", ritualScore, build, conditions, [
      `Wave endurance rating blends Defence ${round1(defence)}, clear ${round1(mapping)}, and DPS ${round1(offence)}.`,
      "A build that can maintain damage while moving is favored over a peak-only setup.",
    ], ["Crowd control, arena layout, and reward-risk choices are not simulated."]),
  ];

  const viableCount = contentCapabilities.filter((content) => (content.rating.score ?? 1) >= 6).length;
  const averageScore = contentCapabilities.reduce((total, content) => total + (content.rating.score ?? 1), 0) / contentCapabilities.length;
  const breadthScore = viableCount / contentCapabilities.length * 10;
  const overallScore = clamp(averageScore * 0.72 + breadthScore * 0.28);
  const overall = rating(overallScore, contentCapabilities.some((content) => content.rating.confidence === "Low") ? "Low" : contentCapabilities.some((content) => content.rating.confidence === "Medium") ? "Medium" : "High", [
    `${viableCount}/${contentCapabilities.length} content jobs are rated viable or better (6.0+/10).`,
    `Average per-content readiness is ${round1(averageScore)}/10; breadth contributes ${round1(breadthScore)}/10.`,
    `The content score blends offence, defence, mapping, bossing, delivery evidence, and condition reliability instead of treating DPS as a universal content rating.`,
    capabilities.coverageSignals.length ? `Build coverage evidence: ${capabilities.coverageSignals.join(", ")}.` : "Pack-coverage evidence is limited, so mapping and wave content are capped conservatively.",
  ]);

  return {
    overall,
    viableCount,
    totalCount: contentCapabilities.length,
    capabilities: contentCapabilities,
    basis: [
      "Content breadth is measured as separate readiness ratings, not as a league percentile.",
      "A high DPS number can raise boss readiness while still leaving mapping or wave coverage conditional.",
      "Non-direct delivery types are supported; uptime and deployment uncertainty are shown as caveats instead of being silently treated as zero damage.",
    ],
    limitations: [
      "No static export can guarantee a specific map tier, depth, boss, or encounter modifier.",
      "The model cannot fully simulate player execution, AI, placement, movement, arena mechanics, tower use, or league-specific hazards.",
      "Run the authoritative worker scenarios when available to replace the imported snapshot with time-weighted combat evidence.",
    ],
  };
}
