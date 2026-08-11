import type { BuildQuality, Condition, Confidence, NormalizedBuild, OverviewRatings, QualityGrade, QualityRating, RatingDpsEvidence } from "@/src/types/domain";
import type { ScenarioReport } from "@/src/features/scenarios/model";
import { inferSkillCapabilities } from "./capabilities";
import type { CapabilityBuild } from "./capabilities";
import { benchmarkDpsScore, benchmarkRecordCount, benchmarkSummary } from "./benchmark";

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

const benchmarkBasis = `Peer calibration: ${benchmarkSummary}. Absolute DPS remains dominant; peer context supplies a 12% adjustment.`;

function calibratedDpsStrengthScore(dps: number, delivery: ReturnType<typeof inferSkillCapabilities>["delivery"]) {
  const absoluteScore = dpsStrengthScore(dps);
  const peer = benchmarkDpsScore(dps, delivery);
  return { score: Math.max(1, Math.min(10, absoluteScore * 0.88 + peer.score * 0.12)), absoluteScore, peerScore: peer.score, peerCount: peer.profile.count };
}

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

export function scenarioOffenceRating(dps: number | null | undefined, build: CapabilityBuild, conditions: Array<{ reliability: string }>): QualityRating {
  if (typeof dps !== "number" || !Number.isFinite(dps) || dps <= 0) return rating(null, "Unknown", ["The worker did not return a positive corrected damage value."]);
  const capabilities = inferSkillCapabilities(build);
  const calibration = calibratedDpsStrengthScore(dps, capabilities.delivery);
  const base = calibration.score;
  const unverified = conditions.filter((condition) => condition.reliability === "Unverified").length;
  const mappingOnly = conditions.filter((condition) => condition.reliability === "Mapping-only").length;
  const conditional = conditions.filter((condition) => ["Conditional", "Temporary", "Situational", "Ramp-dependent"].includes(condition.reliability)).length;
  const specialDelivery = capabilities.delivery === "totem/ballista" || capabilities.delivery === "minion/summon" || capabilities.delivery === "trap" || capabilities.delivery === "mine" || capabilities.delivery === "brand";
  const confidence: Confidence = unverified || specialDelivery ? "Low" : "Medium";
  const basis = [`Worker-recalculated corrected DPS: ${dps.toLocaleString()}.`, `Corrected output strength: ${round1(base)}/10.`, calibrationBasis, benchmarkBasis, `Peer score for ${capabilities.delivery}: ${round1(calibration.peerScore)}/10 across ${calibration.peerCount} builds.`, `Main delivery model: ${capabilities.delivery}.`];
  if (conditional) basis.push(`${conditional} conditional or temporary effect(s) remain visible as assumptions; they reduce confidence, not the raw PoB damage score.`);
  if (unverified) basis.push(`${unverified} unverified condition(s) remain visible and lower confidence until a source is confirmed.`);
  if (mappingOnly) basis.push(`${mappingOnly} mapping-only condition(s) remain visible and are not treated as universal boss evidence.`);
  if (specialDelivery) basis.push("Non-direct delivery is lower-confidence because uptime, placement, AI, and deployment time are not fully modeled; the imported DPS strength is not reduced for that reason.");
  basis.push("This is a corrected scenario rating, not a promise of sustained gameplay or a league percentile.");
  return rating(base, confidence, basis);
}

export function buildOverviewRatings(build: CapabilityBuild & { importedStats: RatingDpsStats }, offence: QualityRating, defence: QualityRating, conditions: Array<{ reliability: string }>, rawDps?: number | null): OverviewRatings {
  const capabilities = inferSkillCapabilities(build);
  const coverageEvidence = capabilities.coverageSignals.length > 0;
  const speed = typeof build.importedStats.speed === "number" && Number.isFinite(build.importedStats.speed) ? build.importedStats.speed : 0;
  const speedScore = speed > 8 ? 9 : speed > 5 ? 8 : speed > 3 ? 7 : speed > 1.5 ? 6 : 5;
  const rawDpsScore = typeof rawDps === "number" && Number.isFinite(rawDps) && rawDps > 0 ? calibratedDpsStrengthScore(rawDps, capabilities.delivery).score : offence.score ?? 5;
  const clearScore = Math.max(1, Math.min(10, rawDpsScore * 0.75 + speedScore * 0.1 + (coverageEvidence ? 1.5 : 0.5)));
  const mappingOnly = conditions.filter((condition) => condition.reliability === "Mapping-only").length;
  const bossingScore = Math.max(1, Math.min(10, rawDpsScore - Math.min(0.35, mappingOnly * 0.1)));
  const confidence = offence.confidence === "Low" ? "Low" : "Medium";
  return {
    dps: rating(rawDpsScore, confidence, [`Authoritative single-target PoB DPS strength: ${rawDps && rawDps > 0 ? rawDps.toLocaleString() : "Unavailable"}.`, calibrationBasis, benchmarkBasis, "Conditions affect confidence and assumptions, not raw DPS strength."]),
    clear: rating(clearScore, coverageEvidence ? "Medium" : "Low", [`Estimated clear score: ${round1(clearScore)}/10.`, coverageEvidence ? capabilities.evidence[2] : "No direct area-clear evidence was exported; the estimate leans on single-target DPS and speed.", "Clear speed is an estimate from PoB evidence, not a simulated map run."]),
    defence: { ...defence, basis: [...defence.basis, "Defence uses imported PoB hit-pool and maximum-hit evidence."] },
    bossing: rating(bossingScore, confidence, [`Authoritative single-target bossing strength: ${round1(bossingScore)}/10 from ${rawDps && rawDps > 0 ? rawDps.toLocaleString() : "the available PoB DPS"}.`, `Delivery model: ${capabilities.delivery}. ${capabilities.singleTargetSignals.join(" · ")}`, "Conditions affect confidence and assumptions rather than raw damage strength.", "This does not simulate boss mechanics or movement downtime."]),
  };
}

function offenceScore(build: NormalizedBuild, conditions: Condition[]): QualityRating {
  const dpsEvidence = importedRatingDps(build);
  const dps = dpsEvidence.value;
  if (dps === null || !Number.isFinite(dps)) return rating(null, "Unknown", ["No PoB DPS value was exported."]);
  const capabilities = inferSkillCapabilities(build);
  const calibration = calibratedDpsStrengthScore(dps, capabilities.delivery);
  const base = calibration.score;
  const unverified = conditions.filter((condition) => condition.reliability === "Unverified").length;
  const mappingOnly = conditions.filter((condition) => condition.reliability === "Mapping-only").length;
  const reliabilityPenalty = Math.min(1.5, unverified * 0.5) + Math.min(0.5, mappingOnly * 0.25);
  const score = Math.max(1, base - reliabilityPenalty);
  const basisLabel = dpsEvidence.label;
  const basis = [`Imported ${basisLabel}: ${dps.toLocaleString()}.`];
  basis.unshift(`Raw output strength: ${round1(base)}/10 before reliability adjustments.`);
  basis.push(calibrationBasis, benchmarkBasis, `Peer score for ${capabilities.delivery}: ${round1(calibration.peerScore)}/10 across ${calibration.peerCount} builds.`);
  if (unverified) basis.push(`${unverified} configured condition(s) are unverified; a ${round1(Math.min(1.5, unverified * 0.5))}-point reliability adjustment is applied until the source is confirmed.`);
  if (mappingOnly) basis.push(`${mappingOnly} condition(s) are mapping-only; a ${round1(Math.min(0.5, mappingOnly * 0.25))}-point encounter adjustment is applied.`);
  basis.push("This is an absolute screening curve, not a league-wide percentile; population ranking requires calibrated league-, skill-, and content-aware data.");
  return rating(score, "Medium", basis);
}

function defenceScore(build: NormalizedBuild): QualityRating {
  const stats = build.importedStats;
  const basis: string[] = [];
  const continuous = (value: number, thresholds: Array<[number, number]>) => {
    if (value <= 0) return 0;
    if (value <= thresholds[0][0]) return thresholds[0][1] * Math.max(0, value / thresholds[0][0]);
    for (let index = 1; index < thresholds.length; index += 1) {
      const [previousValue, previousScore] = thresholds[index - 1];
      const [currentValue, currentScore] = thresholds[index];
      if (value <= currentValue) {
        const position = (Math.log10(value) - Math.log10(previousValue)) / (Math.log10(currentValue) - Math.log10(previousValue));
        return previousScore + (currentScore - previousScore) * Math.max(0, Math.min(1, position));
      }
    }
    return thresholds.at(-1)?.[1] ?? 0;
  };

  // Resistances establish the floor. Capped elemental resistance is worth
  // three points, and non-negative chaos resistance supplies the final half
  // point of the minimum defensive foundation.
  const elementalResists = [stats.fireResistance, stats.coldResistance, stats.lightningResistance];
  const cappedElemental = elementalResists.filter((value) => typeof value === "number" && value >= 75).length;
  const resistanceScore = cappedElemental + (typeof stats.chaosResistance === "number" && stats.chaosResistance >= 0 ? 0.5 : 0);
  if (elementalResists.some((value) => typeof value === "number") || typeof stats.chaosResistance === "number") {
    basis.push(`Resistance foundation: ${cappedElemental}/3 elemental resistances capped; chaos resistance ${typeof stats.chaosResistance === "number" ? `${stats.chaosResistance}%` : "unknown"}. Score ${round1(Math.min(3.5, resistanceScore))}/3.5.`);
  }

  const pool = typeof stats.effectiveHealthPool === "number" && stats.effectiveHealthPool > 0
    ? stats.effectiveHealthPool
    : (stats.life ?? 0) + (stats.energyShield ?? 0);
  const poolScore = continuous(pool, [[4_000, 0.2], [8_000, 0.3], [15_000, 0.45], [30_000, 0.6], [60_000, 0.8], [100_000, 0.9], [150_000, 1]]);
  if (pool > 0) basis.push(`Effective survivability pool: ${pool.toLocaleString()} for ${round1(poolScore)}/1.0.`);

  const defenceText = `${build.rawXml} ${build.sources.map((source) => `${source.name} ${source.detail}`).join(" ")}`.toLowerCase();
  const enduranceEvidence = /endurance charge|endurance charges|physical damage reduction/.test(defenceText)
    || build.configFields.some((field) => /endurance/i.test(field.name) && /^(true|1|yes)$/i.test(field.value));
  const physicalConversionEvidence = /physical damage (?:from hits )?taken as (?:fire|cold|lightning|elemental)|physical damage converted to|phys(?:ical)? damage taken as/.test(defenceText);

  const mitigationRaw = continuous(Math.max(stats.armour ?? 0, stats.evasion ?? 0), [[2_000, 0.15], [5_000, 0.35], [15_000, 0.75], [30_000, 1.05], [60_000, 1.25]])
    + continuous(stats.block ?? 0, [[25, 0.08], [50, 0.15], [75, 0.2]])
    + continuous(stats.spellBlock ?? 0, [[25, 0.06], [50, 0.11], [75, 0.15]])
    + continuous(stats.spellSuppression ?? 0, [[25, 0.08], [50, 0.14], [100, 0.2]])
    + continuous(Math.max(stats.lifeRegen ?? 0, stats.energyShieldRegen ?? 0, stats.lifeRecoveryRate ?? 0, stats.energyShieldRecoveryRate ?? 0, stats.lifeLeechRate ?? 0, stats.energyShieldLeechRate ?? 0, stats.lifeRecoup ?? 0), [[100, 0.06], [500, 0.15], [2_000, 0.25]])
    + (enduranceEvidence ? 0.25 : 0)
    + (physicalConversionEvidence ? 0.3 : 0);
  const mitigationScore = Math.min(1.5, Math.max(0, mitigationRaw));
  if ((stats.armour ?? 0) > 0 || (stats.evasion ?? 0) > 0 || (stats.block ?? 0) > 0 || (stats.spellBlock ?? 0) > 0 || (stats.spellSuppression ?? 0) > 0) {
    basis.push(`Layered mitigation and avoidance: ${[stats.armour ? `armour ${stats.armour.toLocaleString()}` : "", stats.evasion ? `evasion ${stats.evasion.toLocaleString()}` : "", stats.block ? `block ${stats.block}%` : "", stats.spellBlock ? `spell block ${stats.spellBlock}%` : "", stats.spellSuppression ? `suppression ${stats.spellSuppression}%` : "", enduranceEvidence ? "endurance/damage reduction evidence" : "", physicalConversionEvidence ? "physical damage taken as elemental evidence" : ""].filter(Boolean).join(", ")}; score ${round1(mitigationScore)}/1.5.`);
  }
  if (enduranceEvidence && !((stats.armour ?? 0) > 0 || (stats.evasion ?? 0) > 0 || (stats.block ?? 0) > 0 || (stats.spellBlock ?? 0) > 0 || (stats.spellSuppression ?? 0) > 0)) basis.push("Endurance/damage-reduction evidence contributes to the layered defence score.");
  if (physicalConversionEvidence) basis.push("Physical damage taken as elemental is recognized as an additional physical-hit mitigation layer.");

  const maxHit = [stats.physicalMaximumHit, stats.elementalMaximumHit, stats.chaosMaximumHit].filter((value): value is number => typeof value === "number" && value > 0).sort((a, b) => a - b);
  let maxHitScore = 0;
  if (maxHit.length) {
    const median = maxHit[Math.floor((maxHit.length - 1) / 2)];
    const representative = maxHit.length > 1 ? Math.max(median, median * 0.7 + maxHit.at(-1)! * 0.3) : median;
    maxHitScore = continuous(representative, [[3_000, 0.5], [8_000, 1], [15_000, 1.7], [30_000, 2.5], [60_000, 3.5], [100_000, 4.3], [200_000, 5]]);
    basis.push(`Primary maximum-hit coverage: ${representative.toLocaleString()} across ${maxHit.length} exported damage types for ${round1(maxHitScore)}/5.0; weakest type ${maxHit[0].toLocaleString()}.`);
    if (maxHit.length > 1 && maxHit[0] < representative * 0.35) basis.push("One damage type is materially weaker, but it is shown as a coverage caveat rather than replacing the entire defence score.");
  }

  const evidenceCount = [resistanceScore > 0, pool > 0, mitigationScore > 0, maxHit.length > 0].filter(Boolean).length;
  if (!evidenceCount) return rating(null, "Unknown", ["No resistance, survivability-pool, mitigation, or maximum-hit evidence was exported."]);
  const score = Math.max(1, Math.min(10, resistanceScore + poolScore + mitigationScore + maxHitScore));
  return rating(score, evidenceCount >= 3 ? "High" : "Medium", [...basis, "Maximum hit is the primary defence signal; capped resistances establish the foundation, while pool, mitigation, recovery, endurance reduction, and physical conversion accumulate toward 10/10.", "Temporary uptime and encounter-specific mechanics are not assumed unless PoB exported them as part of the snapshot."]);
}

export function calculateBuildQuality(build: NormalizedBuild, conditions: Condition[]): BuildQuality {
  const offence = offenceScore(build, conditions);
  const defence = defenceScore(build);
  const ratingDps = importedRatingDps(build);
  const categoryRatings = buildOverviewRatings(build, offence, defence, conditions, ratingDps.value);
  const knownScores = [offence.score, defence.score].filter((value): value is number => value !== null);
  const overallScore = knownScores.length === 2 ? Math.max(1, Math.min(10, Math.min(offence.score!, defence.score!) + Math.abs(offence.score! - defence.score!) / 3)) : knownScores[0] ?? null;
  const overall = rating(overallScore, knownScores.length === 2 ? "Medium" : "Unknown", ["Overall rating uses a weakest-link adjustment so high damage cannot fully hide missing defence.", "This is a build-quality screening score, not a promise that the character survives a specific encounter."]);
  return { overall, offence, defence, categoryRatings, capabilityProfile: inferSkillCapabilities(build), ratingDps, assumptions: ["PoB exported values are treated as the imported snapshot.", `Offence blends the absolute PoB DPS curve with peer context from ${benchmarkRecordCount} normalized builds; the absolute curve remains dominant.`, "Defence prioritizes representative maximum hit, then adds capped resistances, survivability pool, mitigation, recovery, endurance reduction, and physical conversion evidence."], limitations: ["Temporary defensive uptime, recovery uptime, movement, boss mechanics, and worker-calculated alternate states are not included in this static rating.", "Benchmark records provide peer context, not verified league-wide rankings or human gameplay labels.", "Run combat scenarios for a more authoritative configured-versus-unconditional comparison."] };
}

export function recalculateBuildQuality(quality: BuildQuality, build: CapabilityBuild & { importedStats: RatingDpsStats }, conditions: Array<{ reliability: string }>, scenarios: ScenarioReport): BuildQuality {
  const corrected = scenarios.recommended?.value ?? scenarios.configured.value;
  if (corrected === null || corrected === undefined) return quality;
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
  const authoritativeOffence = scenarioOffenceRating(ratingValue, build, conditions);
  const authoritativeKnownScores = [authoritativeOffence.score, quality.defence.score].filter((value): value is number => value !== null);
  const authoritativeOverallScore = authoritativeKnownScores.length === 2 ? Math.max(1, Math.min(10, Math.min(authoritativeOffence.score!, quality.defence.score!) + Math.abs(authoritativeOffence.score! - quality.defence.score!) / 3)) : authoritativeKnownScores[0] ?? null;
  const authoritativeOverall = rating(authoritativeOverallScore, authoritativeOffence.confidence === "Low" ? "Low" : "Medium", [importedAggregateIsAuthoritative ? "Overall rating remains anchored to the imported aggregate PoB DPS." : "Overall rating uses the typical worker-recalculated DPS because no aggregate PoB DPS was exported.", "Peak valid DPS is displayed separately and does not drive the grade."]);
  return { ...quality, overall: authoritativeOverall, offence: authoritativeOffence, categoryRatings: buildOverviewRatings(build, authoritativeOffence, quality.defence, conditions, ratingValue), capabilityProfile: inferSkillCapabilities(build), ratingDps: { value: ratingValue, label: ratingLabel, origin: ratingOrigin, explanation: ratingExplanation, importedValue: imported ?? undefined, differencePercent, verification }, assumptions: [...quality.assumptions, importedAggregateIsAuthoritative ? "A positive imported aggregate Full/Combined/DoT DPS remains authoritative after worker verification." : "After scenario recalculation, the typical worker state supplies the rating because the export lacks an aggregate DPS value."], limitations: [...quality.limitations, "Totem, ballista, minion, summon uptime, placement, AI, and deployment timing remain lower-confidence until modeled explicitly."] };
}
