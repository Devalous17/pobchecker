import type { BuildQuality, Condition, Confidence, NormalizedBuild, OverviewRatings, QualityGrade, QualityRating, RatingDpsEvidence } from "@/src/types/domain";
import type { ScenarioReport } from "@/src/features/scenarios/model";
import { inferSkillCapabilities } from "./capabilities";
import type { CapabilityBuild } from "./capabilities";

const gradeFor = (score: number): QualityGrade => score >= 9 ? "S" : score >= 8 ? "A" : score >= 7 ? "B" : score >= 6 ? "C" : score >= 5 ? "D" : score >= 3 ? "E" : "F";
const labelFor = (score: number) => score >= 9 ? "Exceptional" : score >= 8 ? "Very strong" : score >= 7 ? "Strong" : score >= 6 ? "Functional" : score >= 5 ? "Needs improvement" : score >= 3 ? "Fragile" : "Critical gaps";
const round1 = (score: number) => Math.round(score * 10) / 10;
const rating = (score: number | null, confidence: Confidence, basis: string[]): QualityRating => score === null ? { score: null, grade: "?", label: "Insufficient data", confidence, basis } : { score: round1(score), grade: gradeFor(score), label: labelFor(score), confidence, basis };

// Absolute PoB-DPS calibration anchors. These are deliberately content-neutral:
// the score measures raw damage strength, while confidence and conditions explain
// whether the exported number is likely to be realized in combat.
export const DPS_CALIBRATION_ANCHORS = [
  { dps: 100_000, score: 2.3, label: "100k DPS" },
  { dps: 1_000_000, score: 4.6, label: "1m DPS" },
  { dps: 10_000_000, score: 6.9, label: "10m DPS" },
  { dps: 100_000_000, score: 9.2, label: "100m DPS" },
  { dps: 1_000_000_000, score: 10, label: "1b DPS cap" },
] as const;

export const dpsStrengthScore = (dps: number) => Math.max(1, Math.min(10, DPS_CALIBRATION_ANCHORS[0].score + (Math.log10(dps) - Math.log10(DPS_CALIBRATION_ANCHORS[0].dps)) * 2.3));
const calibrationBasis = `Absolute DPS calibration: ${DPS_CALIBRATION_ANCHORS.slice(0, 4).map((anchor) => `${anchor.label} = ${anchor.score}/10`).join(" · ")}.`;

const scenarioSkillPenalty = (build: Pick<NormalizedBuild, "mainSkill" | "skills">) => /totem|ballista|minion|summon|skeleton|zombie|spectre|golem|absolution|srs/i.test(`${build.mainSkill ?? ""} ${build.skills.join(" ")}`) ? 0.35 : 0;

const positive = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;
type RatingDpsStats = { fullDps?: number; combinedDps?: number; totalDotDps?: number; totalDps?: number; speed?: number };

export function importedRatingDps(build: { importedStats: RatingDpsStats }): RatingDpsEvidence {
  const candidates: Array<[string, unknown]> = [
    ["Full PoB DPS", build.importedStats.fullDps],
    ["Combined PoB DPS", build.importedStats.combinedDps],
    ["PoB Damage-over-Time DPS", build.importedStats.totalDotDps],
    ["PoB Hit DPS fallback", build.importedStats.totalDps],
  ];
  const selected = candidates.find(([, value]) => positive(value));
  return selected
    ? { value: selected[1] as number, label: selected[0], origin: "imported", explanation: "This exported aggregate value is the primary DPS source for the initial rating.", differencePercent: 0, verification: "not-run" }
    : { value: null, label: "No aggregate PoB DPS", origin: "unavailable", explanation: "The export did not contain a positive aggregate damage value; run the worker to calculate one.", differencePercent: 0, verification: "not-run" };
}

export function scenarioOffenceRating(dps: number | null | undefined, build: Pick<NormalizedBuild, "mainSkill" | "skills">, conditions: Array<{ reliability: string }>): QualityRating {
  if (typeof dps !== "number" || !Number.isFinite(dps) || dps <= 0) return rating(null, "Unknown", ["The worker did not return a positive corrected damage value."]);
  const base = dpsStrengthScore(dps);
  const unverified = conditions.filter((condition) => condition.reliability === "Unverified").length;
  const mappingOnly = conditions.filter((condition) => condition.reliability === "Mapping-only").length;
  const conditional = conditions.filter((condition) => ["Conditional", "Temporary", "Situational", "Ramp-dependent"].includes(condition.reliability)).length;
  const conditionalPenalty = Math.min(1.2, conditional * 0.08);
  const reliabilityPenalty = Math.min(1.5, unverified * 0.5) + Math.min(0.5, mappingOnly * 0.25) + conditionalPenalty + scenarioSkillPenalty(build);
  const score = Math.max(1, base - reliabilityPenalty);
  const specialSkill = scenarioSkillPenalty(build) > 0;
  const confidence: Confidence = specialSkill ? "Low" : "Medium";
  const basis = [`Worker-recalculated corrected DPS: ${dps.toLocaleString()}.`, `Corrected output strength: ${round1(base)}/10 before scenario adjustments.`, calibrationBasis];
  if (conditional) basis.push(`${conditional} temporary or conditional effect(s) reduce the practical score by ${round1(conditionalPenalty)} points.`);
  if (unverified) basis.push(`${unverified} unverified condition(s) remain penalized until a source is confirmed.`);
  if (mappingOnly) basis.push(`${mappingOnly} mapping-only condition(s) are excluded from universal boss confidence.`);
  if (specialSkill) basis.push("Totem, ballista, minion, or summon output is treated as lower-confidence because uptime, placement, AI, and deployment time are not fully modeled.");
  basis.push("This is a corrected scenario rating, not a promise of sustained gameplay or a league percentile.");
  return rating(score, confidence, basis);
}

export function buildOverviewRatings(build: CapabilityBuild & { importedStats: RatingDpsStats }, offence: QualityRating, defence: QualityRating, conditions: Array<{ reliability: string }>, rawDps?: number | null): OverviewRatings {
  const capabilities = inferSkillCapabilities(build);
  const coverageEvidence = capabilities.coverageSignals.length > 0;
  const speed = typeof build.importedStats.speed === "number" && Number.isFinite(build.importedStats.speed) ? build.importedStats.speed : 0;
  const speedScore = speed > 8 ? 9 : speed > 5 ? 8 : speed > 3 ? 7 : speed > 1.5 ? 6 : 5;
  const rawDpsScore = typeof rawDps === "number" && Number.isFinite(rawDps) && rawDps > 0 ? dpsStrengthScore(rawDps) : offence.score ?? 5;
  const clearScore = Math.max(1, Math.min(10, rawDpsScore * 0.75 + speedScore * 0.1 + (coverageEvidence ? 1.5 : 0.5)));
  const mappingOnly = conditions.filter((condition) => condition.reliability === "Mapping-only").length;
  const bossingScore = Math.max(1, Math.min(10, rawDpsScore - Math.min(0.35, mappingOnly * 0.1)));
  const confidence = offence.confidence === "Low" ? "Low" : "Medium";
  return {
    dps: rating(rawDpsScore, confidence, [`Authoritative single-target PoB DPS strength: ${rawDps && rawDps > 0 ? rawDps.toLocaleString() : "Unavailable"}.`, calibrationBasis, "Conditions affect confidence and assumptions, not raw DPS strength."]),
    clear: rating(clearScore, coverageEvidence ? "Medium" : "Low", [`Estimated clear score: ${round1(clearScore)}/10.`, coverageEvidence ? capabilities.evidence[2] : "No direct area-clear evidence was exported; the estimate leans on single-target DPS and speed.", "Clear speed is an estimate from PoB evidence, not a simulated map run."]),
    defence: { ...defence, basis: [...defence.basis, "Defence uses imported PoB hit-pool and maximum-hit evidence."] },
    bossing: rating(bossingScore, confidence, [`Authoritative single-target bossing strength: ${round1(bossingScore)}/10 from ${rawDps && rawDps > 0 ? rawDps.toLocaleString() : "the available PoB DPS"}.`, `Delivery model: ${capabilities.delivery}. ${capabilities.singleTargetSignals.join(" · ")}`, "Conditions affect confidence and assumptions rather than raw damage strength.", "This does not simulate boss mechanics or movement downtime."]),
  };
}

function offenceScore(build: NormalizedBuild, conditions: Condition[]): QualityRating {
  const dpsEvidence = importedRatingDps(build);
  const dps = dpsEvidence.value;
  if (dps === null || !Number.isFinite(dps)) return rating(null, "Unknown", ["No PoB DPS value was exported."]);
  const base = dpsStrengthScore(dps);
  const unverified = conditions.filter((condition) => condition.reliability === "Unverified").length;
  const mappingOnly = conditions.filter((condition) => condition.reliability === "Mapping-only").length;
  const reliabilityPenalty = Math.min(1.5, unverified * 0.5) + Math.min(0.5, mappingOnly * 0.25);
  const score = Math.max(1, base - reliabilityPenalty);
  const basisLabel = dpsEvidence.label;
  const basis = [`Imported ${basisLabel}: ${dps.toLocaleString()}.`];
  basis.unshift(`Raw output strength: ${round1(base)}/10 before reliability adjustments.`);
  basis.push(calibrationBasis);
  if (unverified) basis.push(`${unverified} configured condition(s) are unverified; a ${round1(Math.min(1.5, unverified * 0.5))}-point reliability adjustment is applied until the source is confirmed.`);
  if (mappingOnly) basis.push(`${mappingOnly} condition(s) are mapping-only; a ${round1(Math.min(0.5, mappingOnly * 0.25))}-point encounter adjustment is applied.`);
  basis.push("This is an absolute screening curve, not a league-wide percentile; population ranking requires calibrated league-, skill-, and content-aware data.");
  return rating(score, "Medium", basis);
}

function defenceScore(build: NormalizedBuild): QualityRating {
  const stats = build.importedStats;
  const basis: string[] = [];
  const primary: number[] = [];
  if (typeof stats.effectiveHealthPool === "number" && stats.effectiveHealthPool > 0) {
    const score = stats.effectiveHealthPool >= 150_000 ? 10 : stats.effectiveHealthPool >= 100_000 ? 9 : stats.effectiveHealthPool >= 60_000 ? 8 : stats.effectiveHealthPool >= 30_000 ? 7 : stats.effectiveHealthPool >= 15_000 ? 6 : stats.effectiveHealthPool >= 8_000 ? 5 : stats.effectiveHealthPool >= 4_000 ? 4 : 2;
    primary.push(score); basis.push(`Effective hit pool: ${stats.effectiveHealthPool.toLocaleString()}.`);
  }
  const maxHit = [stats.physicalMaximumHit, stats.elementalMaximumHit, stats.chaosMaximumHit].filter((value): value is number => typeof value === "number" && value > 0);
  if (maxHit.length) {
    const weakestMaxHit = Math.min(...maxHit);
    const score = weakestMaxHit >= 50_000 ? 10 : weakestMaxHit >= 30_000 ? 9 : weakestMaxHit >= 20_000 ? 8 : weakestMaxHit >= 12_000 ? 7 : weakestMaxHit >= 8_000 ? 6 : weakestMaxHit >= 5_000 ? 5 : weakestMaxHit >= 3_000 ? 4 : 2;
    primary.push(score); basis.push(`Weakest imported maximum hit: ${weakestMaxHit.toLocaleString()}.`);
  }
  if (typeof stats.block === "number" && stats.block > 0) basis.push(`Attack block: ${stats.block}%.`);
  if (typeof stats.spellBlock === "number" && stats.spellBlock > 0) basis.push(`Spell block: ${stats.spellBlock}%.`);
  if (typeof stats.lifeRegen === "number" && stats.lifeRegen > 0) basis.push(`Life regeneration: ${stats.lifeRegen.toLocaleString()}/s.`);
  if (typeof stats.energyShieldRegen === "number" && stats.energyShieldRegen > 0) basis.push(`Energy Shield regeneration: ${stats.energyShieldRegen.toLocaleString()}/s.`);
  if (!primary.length) return rating(null, "Unknown", ["No effective hit pool or maximum-hit value was exported."]);
  return rating(Math.max(1, Math.min(...primary)), "Medium", [...basis, "The weakest major defensive measure limits this screening grade; temporary worker states are not included yet."]);
}

export function calculateBuildQuality(build: NormalizedBuild, conditions: Condition[]): BuildQuality {
  const offence = offenceScore(build, conditions);
  const defence = defenceScore(build);
  const ratingDps = importedRatingDps(build);
  const categoryRatings = buildOverviewRatings(build, offence, defence, conditions, ratingDps.value);
  const knownScores = [offence.score, defence.score].filter((value): value is number => value !== null);
  const overallScore = knownScores.length === 2 ? Math.max(1, Math.min(10, Math.min(offence.score!, defence.score!) + Math.abs(offence.score! - defence.score!) / 3)) : knownScores[0] ?? null;
  const overall = rating(overallScore, knownScores.length === 2 ? "Medium" : "Unknown", ["Overall rating uses a weakest-link adjustment so high damage cannot fully hide missing defence.", "This is a build-quality screening score, not a promise that the character survives a specific encounter."]);
  return { overall, offence, defence, categoryRatings, capabilityProfile: inferSkillCapabilities(build), ratingDps, assumptions: ["PoB exported values are treated as the imported snapshot.", "Offence uses a continuous absolute screening curve; it is not yet a population percentile.", "Defensive quality prioritizes effective hit pool and the weakest imported maximum-hit value."], limitations: ["Temporary defensive uptime, recovery uptime, movement, boss mechanics, and worker-calculated alternate states are not included in this static rating.", "Run combat scenarios for a more authoritative configured-versus-unconditional comparison."] };
}

export function recalculateBuildQuality(quality: BuildQuality, build: CapabilityBuild & { importedStats: RatingDpsStats }, conditions: Array<{ reliability: string }>, scenarios: ScenarioReport): BuildQuality {
  const corrected = scenarios.recommended?.value ?? scenarios.configured.value;
  if (corrected === null || corrected === undefined) return quality;
  const offence = scenarioOffenceRating(corrected, build, conditions);
  const importedEvidence = importedRatingDps(build);
  const imported = importedEvidence.value;
  const differencePercent = imported && imported > 0 ? ((corrected - imported) / imported) * 100 : 0;
  const verification = imported && imported > 0 ? Math.abs(differencePercent) <= 5 ? "matched" : "mismatch" : "not-run";
  const importedAggregateIsAuthoritative = importedEvidence.value !== null && importedEvidence.label !== "PoB Hit DPS fallback";
  const ratingValue = importedAggregateIsAuthoritative ? importedEvidence.value! : corrected;
  const ratingOrigin = importedAggregateIsAuthoritative ? "imported" : "worker-typical";
  const ratingLabel = importedAggregateIsAuthoritative ? importedEvidence.label : "Typical worker-recalculated PoB DPS";
  const ratingExplanation = importedAggregateIsAuthoritative
    ? "The imported aggregate PoB value remains authoritative; the worker result is shown as a verification comparison."
    : "No aggregate Full/Combined/DoT DPS was exported, so the typical worker-recalculated value drives the rating.";
  const authoritativeOffence = importedAggregateIsAuthoritative ? scenarioOffenceRating(ratingValue, build, conditions) : offence;
  const authoritativeKnownScores = [authoritativeOffence.score, quality.defence.score].filter((value): value is number => value !== null);
  const authoritativeOverallScore = authoritativeKnownScores.length === 2 ? Math.max(1, Math.min(10, Math.min(authoritativeOffence.score!, quality.defence.score!) + Math.abs(authoritativeOffence.score! - quality.defence.score!) / 3)) : authoritativeKnownScores[0] ?? null;
  const authoritativeOverall = rating(authoritativeOverallScore, authoritativeOffence.confidence === "Low" ? "Low" : "Medium", [importedAggregateIsAuthoritative ? "Overall rating remains anchored to the imported aggregate PoB DPS." : "Overall rating uses the typical worker-recalculated DPS because no aggregate PoB DPS was exported.", "Peak valid DPS is displayed separately and does not drive the grade."]);
  return { ...quality, overall: authoritativeOverall, offence: authoritativeOffence, categoryRatings: buildOverviewRatings(build, authoritativeOffence, quality.defence, conditions, ratingValue), capabilityProfile: inferSkillCapabilities(build), ratingDps: { value: ratingValue, label: ratingLabel, origin: ratingOrigin, explanation: ratingExplanation, importedValue: imported ?? undefined, differencePercent, verification }, assumptions: [...quality.assumptions, importedAggregateIsAuthoritative ? "A positive imported aggregate Full/Combined/DoT DPS remains authoritative after worker verification." : "After scenario recalculation, the typical worker state supplies the rating because the export lacks an aggregate DPS value."], limitations: [...quality.limitations, "Totem, ballista, minion, summon uptime, placement, AI, and deployment timing remain lower-confidence until modeled explicitly."] };
}
