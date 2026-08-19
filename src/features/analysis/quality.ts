import type { BuildQuality, Condition, Confidence, NormalizedBuild, OverviewRatings, QualityGrade, QualityRating, RatingDpsEvidence } from "@/src/types/domain";
import type { ScenarioReport } from "@/src/features/scenarios/model";
import { inferSkillCapabilities } from "./capabilities";
import type { CapabilityBuild } from "./capabilities";
import { benchmarkDpsScore, benchmarkRecordCount, benchmarkSummary } from "./benchmark";
import { evaluateContentCoverage } from "./content";

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

// DoT has a practical ceiling in PoB-style evaluations: once a build reaches
// the high tens of millions of sustained RF/ignite/bleed/poison DPS, more
// tooltip damage is increasingly rare and does not scale like ordinary hit
// DPS. Keep the lower bands useful, but recognize near-cap DoT as elite.
const dotStrengthScore = (dps: number) => Math.max(1, Math.min(10, dps >= 100_000_000 ? 10 : 4.8 + (Math.log10(dps) - Math.log10(1_000_000)) * 2.5));

const eliteDamageScore = (dps: number, dotDps?: number | null) => dps >= 1_000_000_000 || (typeof dotDps === "number" && dotDps >= 100_000_000);

function calibratedDpsStrengthScore(dps: number, delivery: ReturnType<typeof inferSkillCapabilities>["delivery"]) {
  const absoluteScore = dpsStrengthScore(dps);
  const peer = benchmarkDpsScore(dps, delivery);
  return { score: Math.max(1, Math.min(10, absoluteScore * 0.88 + peer.score * 0.12)), absoluteScore, peerScore: peer.score, peerCount: peer.profile.count };
}

type RatingDpsStats = { fullDps?: number; combinedDps?: number; totalDotDps?: number; totalDps?: number; speed?: number; movementSpeed?: number };

const meaningfulOffenceDps = (stats: RatingDpsStats): { value: number | null; label: string; basis: string } => {
  const hit = positive(stats.totalDps) ? stats.totalDps : null;
  const dot = positive(stats.totalDotDps) ? stats.totalDotDps : null;
  // Prefer the actual damage type that carries the build. A small DoT trace
  // should not displace a much larger hit profile, but a DoT-first build must
  // not be graded against hit-DPS anchors just because TotalDPS is present.
  if (dot !== null && (hit === null || dot > hit * 1.1)) return { value: dot, label: "PoB Damage-over-Time DPS", basis: hit === null ? "No positive Hit DPS was exported, so DoT DPS is authoritative." : `DoT DPS is ${Math.round(dot / hit)}x the Hit DPS; the higher meaningful damage channel is authoritative.` };
  if (positive(stats.fullDps)) return { value: stats.fullDps, label: "Full PoB DPS", basis: dot === null ? "No dominant DoT channel was exported; configured Full DPS is authoritative, including valid multi-source delivery such as totems or ballistas." : `Hit DPS is at least 90% of DoT DPS; configured Full DPS is authoritative for the hit-based delivery setup.` };
  if (positive(stats.combinedDps)) return { value: stats.combinedDps, label: "Combined PoB DPS", basis: "No positive Full DPS was exported; the combined aggregate is used before falling back to a single hit channel." };
  if (hit !== null) return { value: hit, label: "PoB Hit DPS", basis: dot === null ? "No configured Full DPS or combined aggregate was exported, so Hit DPS is authoritative." : `Hit DPS is at least 90% of DoT DPS; the hit profile is authoritative because no configured aggregate was exported.` };
  const fallback = [
    ["Full PoB DPS", stats.fullDps],
    ["Combined PoB DPS", stats.combinedDps],
  ].find(([, value]) => positive(value));
  return fallback && positive(fallback[1]) ? { value: fallback[1], label: String(fallback[0]), basis: "No separate positive hit or DoT channel was exported; the aggregate PoB value is used as a fallback." } : { value: null, label: "No aggregate PoB DPS", basis: "The export did not contain a positive damage value." };
};

function offenceContext(build: CapabilityBuild & { importedStats?: RatingDpsStats }) {
  const capabilities = inferSkillCapabilities(build);
  const coverage = capabilities.coverageSignals;
  const clearSignals = capabilities.clearSignals;
  const dotEvidence = coverage.some((signal) => /damage-over-time/i.test(signal)) || positive(build.importedStats?.totalDotDps);
  const mappingSignals = coverage.filter((signal) => /coverage|spread|multiple-source/i.test(signal)).length + clearSignals.length;
  const clearBonus = Math.min(4.2, mappingSignals * 0.85 + (dotEvidence ? 0.55 : 0));
  const offenceBonus = Math.min(1.25, mappingSignals * 0.22 + (dotEvidence ? 0.35 : 0));
  const dotDps = build.importedStats?.totalDotDps;
  const directDps = positive(build.importedStats?.totalDps) ? build.importedStats.totalDps : undefined;
  const dotScore = positive(dotDps) && (directDps === undefined || dotDps > directDps * 1.1) ? dotStrengthScore(dotDps) : null;
  return { capabilities, dotEvidence, clearBonus, offenceBonus, dotScore, dotDps, directDps };
}

const positive = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;

export function importedRatingDps(build: { importedStats: RatingDpsStats; mainSkillSelection?: { method?: string; selectedSkill?: string; selectedDps?: number } }): RatingDpsEvidence {
  if (build.mainSkillSelection) {
    if (build.mainSkillSelection.method === "pob-marker") {
      const selectedSkill = build.mainSkillSelection.selectedSkill ?? "selected main skill";
      const imported = meaningfulOffenceDps(build.importedStats);
      if (imported.value !== null) {
        return { value: imported.value, label: `${imported.label} · ${selectedSkill}`, origin: "imported", explanation: `${imported.basis} The report rates the skill identified by PoB as ${selectedSkill}; multiple linked or active setups remain a configuration warning, not a reason to discard this imported result.`, differencePercent: 0, verification: "not-run" };
      }
      return { value: null, label: `No positive DPS · ${selectedSkill}`, origin: "unavailable", explanation: `The report identified ${selectedSkill}, but PoB exported no positive Full, Hit, DoT, or Combined DPS channel for that state. The offence grade uses a conservative floor and the configuration warning explains how to correct the export.`, differencePercent: 0, verification: "not-run" };
    }
    if (positive(build.mainSkillSelection.selectedDps)) {
      const selectedSkill = build.mainSkillSelection.selectedSkill ?? "selected main skill";
      return { value: build.mainSkillSelection.selectedDps, label: `${selectedSkill} DPS`, origin: "worker-configured", explanation: `The isolated PoB worker calculated ${selectedSkill}; the rating follows that selected-skill result instead of the stale imported snapshot channel.`, differencePercent: 0, verification: "not-run" };
    }
    const imported = meaningfulOffenceDps(build.importedStats);
    return imported.value !== null
      ? { value: imported.value, label: `${imported.label} · imported snapshot`, origin: "imported", explanation: `The importer identified ${build.mainSkillSelection.selectedSkill ?? "a main skill"}, but the worker did not return a selected-skill DPS value. The exported PoB snapshot remains visible as imported evidence and is not relabeled as the selected skill.`, differencePercent: 0, verification: "not-run" }
      : { value: null, label: "No imported DPS", origin: "unavailable", explanation: `The importer identified ${build.mainSkillSelection.selectedSkill ?? "a main skill"}, but neither the worker nor the PoB snapshot provided a positive DPS value.`, differencePercent: 0, verification: "not-run" };
  }
  const selected = meaningfulOffenceDps(build.importedStats);
  return selected.value !== null
    ? { value: selected.value, label: selected.label, origin: "imported", explanation: `${selected.basis} The rating follows this channel instead of blindly preferring Full DPS.`, differencePercent: 0, verification: "not-run" }
    : { value: null, label: "No aggregate PoB DPS", origin: "unavailable", explanation: "The export did not contain a positive aggregate damage value.", differencePercent: 0, verification: "not-run" };
}

export function scenarioOffenceRating(dps: number | null | undefined, build: CapabilityBuild, conditions: Array<{ reliability: string }>): QualityRating {
  if (typeof dps !== "number" || !Number.isFinite(dps) || dps <= 0) return rating(null, "Unknown", ["The worker did not return a positive corrected damage value."]);
  const context = offenceContext(build);
  const capabilities = context.capabilities;
  const calibration = calibratedDpsStrengthScore(dps, capabilities.delivery);
  const strength = context.dotScore ?? calibration.score;
  const base = eliteDamageScore(dps, context.dotDps) ? 10 : Math.min(10, strength + context.offenceBonus);
  const unverified = conditions.filter((condition) => condition.reliability === "Unverified").length;
  const mappingOnly = conditions.filter((condition) => condition.reliability === "Mapping-only").length;
  const conditional = conditions.filter((condition) => ["Conditional", "Temporary", "Situational", "Ramp-dependent"].includes(condition.reliability)).length;
  const specialDelivery = !["self-cast/attack", "ailment/DoT", "unknown"].includes(capabilities.delivery);
  const confidence: Confidence = unverified || specialDelivery ? "Low" : "Medium";
  const basis = [`Worker-recalculated corrected DPS: ${dps.toLocaleString()}.`, `Corrected output strength: ${round1(base)}/10.`, eliteDamageScore(dps, context.dotDps) ? "Elite damage threshold reached: billion-scale hit DPS or 100m+ sustained DoT is allowed to reach the 10/10 offence ceiling." : context.dotScore !== null ? `DoT calibration: ${context.dotDps!.toLocaleString()} DoT DPS maps to ${round1(context.dotScore)}/10 on a practical 36m ceiling.` : calibrationBasis, benchmarkBasis, `Peer score for ${capabilities.delivery}: ${round1(calibration.peerScore)}/10 across ${calibration.peerCount} builds.`, `Main delivery model: ${capabilities.delivery}.`];
  if (conditional) basis.push(`${conditional} conditional or temporary effect(s) remain visible as assumptions; they reduce confidence, not the raw PoB damage score.`);
  if (unverified) basis.push(`${unverified} unverified condition(s) remain visible and lower confidence until a source is confirmed.`);
  if (mappingOnly) basis.push(`${mappingOnly} mapping-only condition(s) remain visible and are not treated as universal boss evidence.`);
  if (specialDelivery) basis.push("Non-direct delivery is lower-confidence because uptime, placement, AI, and deployment time are not fully modeled; the imported DPS strength is not reduced for that reason.");
  if (context.dotEvidence) basis.push("Damage-over-time evidence is included as an offence archetype; the report does not require all offence to be direct hit DPS.");
  if (context.clearBonus > 0) basis.push(`Mapping and coverage evidence contributes ${round1(context.clearBonus)} points to the context-aware offence view: ${capabilities.coverageSignals.join(", ")}.`);
  basis.push("This is a corrected scenario rating, not a promise of sustained gameplay or a league percentile.");
  return rating(base, confidence, basis);
}

export function buildOverviewRatings(build: CapabilityBuild & { importedStats: RatingDpsStats }, offence: QualityRating, defence: QualityRating, conditions: Array<{ reliability: string }>, rawDps?: number | null): OverviewRatings {
  const context = offenceContext(build);
  const capabilities = context.capabilities;
  const coverageEvidence = capabilities.coverageSignals.length > 0;
  const speed = typeof build.importedStats.speed === "number" && Number.isFinite(build.importedStats.speed) ? build.importedStats.speed : 0;
  const importedMovement = typeof build.importedStats.movementSpeed === "number" && Number.isFinite(build.importedStats.movementSpeed) ? build.importedStats.movementSpeed : 0;
  // PoB exports EffectiveMovementSpeedMod as a multiplier (2.57 means 257%),
  // while some exports provide a direct percentage.
  const movementSpeed = importedMovement > 0 && importedMovement <= 10 ? importedMovement * 100 : importedMovement;
  const speedScore = speed > 8 ? 9 : speed > 5 ? 8 : speed > 3 ? 7 : speed > 1.5 ? 6 : 5;
  const movementScore = movementSpeed >= 180 ? 1 : movementSpeed >= 140 ? 0.75 : movementSpeed >= 110 ? 0.45 : movementSpeed > 0 ? 0.2 : 0;
  const clearSignals = capabilities.clearSignals;
  const signalScore = Math.min(5, clearSignals.length * 1.1 + capabilities.coverageSignals.length * 0.5);
  const rawDpsScore = context.dotScore ?? (typeof rawDps === "number" && Number.isFinite(rawDps) && rawDps > 0 ? calibratedDpsStrengthScore(rawDps, capabilities.delivery).score : offence.score ?? 5);
  const rawClearScore = rawDpsScore * 0.5 + speedScore * 0.1 + movementScore + signalScore + (coverageEvidence ? 0.8 : 0.25);
  // Mapping is not bossing, but it still requires surviving ordinary map
  // contact. Keep clear mechanics independent while preventing a zero-layer
  // glass cannon from receiving a perfect mapping grade from DPS alone.
  const survivabilityCeiling = defence.score === null ? 6.5
    : defence.score <= 2 ? 5.5
      : defence.score <= 4 ? 6.5
        : defence.score <= 6 ? 7.5
          : defence.score <= 7.5 ? 8.5
            : 10;
  const clearScore = Math.max(1, Math.min(10, rawClearScore, survivabilityCeiling));
  const mappingOnly = conditions.filter((condition) => condition.reliability === "Mapping-only").length;
  const bossingScore = Math.max(1, Math.min(10, rawDpsScore - Math.min(0.35, mappingOnly * 0.1)));
  const confidence = offence.confidence === "Low" ? "Low" : "Medium";
  return {
    dps: rating(rawDpsScore, confidence, [context.dotScore !== null ? `Authoritative imported DoT DPS: ${context.dotDps!.toLocaleString()}.` : `Authoritative single-target PoB DPS strength: ${rawDps && rawDps > 0 ? rawDps.toLocaleString() : "Unavailable"}.`, context.dotScore !== null ? `DoT calibration is cap-aware: ${context.dotDps!.toLocaleString()} maps to ${round1(rawDpsScore)}/10, with high-tens-of-millions sustained DoT treated as elite rather than judged by hit-DPS anchors.` : calibrationBasis, benchmarkBasis, "Conditions affect confidence and assumptions, not raw DPS strength."]),
    clear: rating(clearScore, clearSignals.length || coverageEvidence ? "Medium" : "Low", [`Context-aware estimated clear score: ${round1(clearScore)}/10.`, `Mapping evidence: ${clearSignals.length ? clearSignals.join("; ") : "No mapping-specific signals"}.`, `Coverage evidence: ${capabilities.coverageSignals.length ? capabilities.coverageSignals.join("; ") : "none"}.`, movementSpeed > 0 ? `Imported movement speed contributes ${round1(movementScore)} points (${movementSpeed}%).` : "Movement speed was not exported, so the score does not assume fast map traversal.", clearScore < rawClearScore ? `Mapping survivability ceiling: ${round1(survivabilityCeiling)}/10 because imported defence evidence is too weak to support a perfect ordinary-map rating.` : "Defence evidence supports the clear estimate without applying a survivability ceiling.", context.dotEvidence ? "Damage-over-time spread is treated as a mapping archetype rather than discarded as missing hit DPS." : "Clear speed is an estimate from PoB evidence, not a simulated map run."]),
    defence: { ...defence, basis: [...defence.basis, "Defence uses imported PoB hit-pool and maximum-hit evidence."] },
    bossing: rating(bossingScore, confidence, [`Authoritative single-target bossing strength: ${round1(bossingScore)}/10 from ${rawDps && rawDps > 0 ? rawDps.toLocaleString() : "the available PoB DPS"}.`, `Delivery model: ${capabilities.delivery}. ${capabilities.singleTargetSignals.join(" · ")}`, "Conditions affect confidence and assumptions rather than raw damage strength.", "This does not simulate boss mechanics or movement downtime."]),
  };
}

function offenceScore(build: NormalizedBuild, conditions: Condition[]): QualityRating {
  const dpsEvidence = importedRatingDps(build);
  const dps = dpsEvidence.value;
  if (dps === null || !Number.isFinite(dps)) return rating(1, "Low", ["No positive PoB DPS channel was exported for the displayed skill.", "A conservative 1.0/10 floor is shown instead of '?'; configure the intended skill and Include in Full DPS in PoB, then export again.", "This floor is not evidence that the build literally deals zero damage; it represents missing imported offence evidence."]);
  const context = offenceContext(build);
  const capabilities = context.capabilities;
  const calibration = calibratedDpsStrengthScore(dps, capabilities.delivery);
  const strength = context.dotScore ?? calibration.score;
  const base = eliteDamageScore(dps, context.dotDps) ? 10 : Math.min(10, strength + context.offenceBonus);
  const unverified = conditions.filter((condition) => condition.reliability === "Unverified").length;
  const mappingOnly = conditions.filter((condition) => condition.reliability === "Mapping-only").length;
  const reliabilityPenalty = Math.min(1.5, unverified * 0.5) + Math.min(0.5, mappingOnly * 0.25);
  const score = Math.max(1, base - reliabilityPenalty);
  const basisLabel = dpsEvidence.label;
  const basis = [`Imported ${basisLabel}: ${dps.toLocaleString()}.`];
  basis.unshift(`Raw output strength: ${round1(base)}/10 before reliability adjustments.`);
  if (eliteDamageScore(dps, context.dotDps)) basis.push("Elite damage threshold reached: the offence ceiling is 10/10 rather than a compressed 9.x score.");
  basis.push(context.dotScore !== null ? `DoT calibration: ${context.dotDps!.toLocaleString()} DoT DPS maps to ${round1(context.dotScore)}/10 on a practical 36m ceiling.` : calibrationBasis, benchmarkBasis, `Peer score for ${capabilities.delivery}: ${round1(calibration.peerScore)}/10 across ${calibration.peerCount} builds.`);
  if (context.dotScore === null && positive(context.dotDps) && positive(context.directDps)) basis.push(`Hit DPS remains authoritative (${context.directDps.toLocaleString()}); DoT evidence is shown as supporting output because it is not materially higher.`);
  if (unverified) basis.push(`${unverified} configured condition(s) are unverified; a ${round1(Math.min(1.5, unverified * 0.5))}-point reliability adjustment is applied until the source is confirmed.`);
  if (mappingOnly) basis.push(`${mappingOnly} condition(s) are mapping-only; a ${round1(Math.min(0.5, mappingOnly * 0.25))}-point encounter adjustment is applied.`);
  if (context.dotEvidence) basis.push("Damage-over-time output is recognized as a first-class offence archetype alongside hit DPS.");
  if (context.clearBonus > 0) basis.push(`Coverage and mapping context contributes ${round1(context.clearBonus)} points outside raw DPS inflation.`);
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
  const evidenceText = `${build.rawXml} ${build.sources.map((source) => `${source.name} ${source.detail}`).join(" ")} ${build.passiveNodes.map((node) => node.name).join(" ")}`.toLowerCase();
  const chaosImmuneEvidence = /chaos inoculation|chaos inoculation keystone|\bci keystone\b/.test(evidenceText)
    || ((stats.life ?? 0) <= 1 && (stats.energyShield ?? 0) > 0);
  const fireResist = typeof stats.fireResistance === "number" ? stats.fireResistance : 0;
  const damageShiftEvidence = /(?:cold|lightning|fire|physical|elemental) damage (?:taken as|shifted to)|damage taken as (?:fire|cold|lightning|physical|elemental)|taken as fire damage|taken as cold damage|taken as lightning damage/.test(evidenceText);
  const shiftPercentages = [...evidenceText.matchAll(/(\d+)%[^\n]{0,100}?(?:cold|lightning|fire|physical|elemental) damage[^\n]{0,80}?(?:taken as|shifted to)/g)].map((match) => Number(match[1])).filter(Number.isFinite);
  const strongestShiftPercent = shiftPercentages.length ? Math.max(...shiftPercentages) : 0;
  const shiftedElementalBackstop = damageShiftEvidence && fireResist >= 75 && cappedElemental >= 1 && cappedElemental < 3;
  const shiftedResistanceCredit = shiftedElementalBackstop ? Math.min(1.5, (strongestShiftPercent / 50) * 1.5) : 0;
  const effectiveCappedElemental = Math.min(3, cappedElemental + shiftedResistanceCredit);
  const resistanceScore = effectiveCappedElemental + (!chaosImmuneEvidence && typeof stats.chaosResistance === "number" && stats.chaosResistance >= 0 ? 0.5 : 0);
  if (elementalResists.some((value) => typeof value === "number") || typeof stats.chaosResistance === "number") {
    basis.push(`Resistance foundation: ${shiftedElementalBackstop ? `damage-shifted elemental coverage receives proportional capped-fire credit (${strongestShiftPercent || "partial"}% shift)` : `${cappedElemental}/3 elemental resistances capped`}; ${chaosImmuneEvidence ? "Chaos Inoculation makes chaos resistance irrelevant." : `chaos resistance ${typeof stats.chaosResistance === "number" ? `${stats.chaosResistance}%` : "unknown"}.`} Score ${round1(Math.min(3.5, resistanceScore))}/3.5.`);
  }
  if (chaosImmuneEvidence) basis.push("Chaos Inoculation is recognized: chaos damage and chaos resistance are excluded from the defensive penalty.");

  const pool = typeof stats.effectiveHealthPool === "number" && stats.effectiveHealthPool > 0
    ? stats.effectiveHealthPool
    : (stats.life ?? 0) + (stats.energyShield ?? 0);
  const poolScore = continuous(pool, [[4_000, 0.2], [8_000, 0.3], [15_000, 0.45], [30_000, 0.6], [60_000, 0.8], [100_000, 0.9], [150_000, 1]]);
  if (pool > 0) basis.push(`Effective survivability pool: ${pool.toLocaleString()} for ${round1(poolScore)}/1.0.`);

  const defenceText = evidenceText;
  const enduranceEvidence = /endurance charge|endurance charges|physical damage reduction/.test(defenceText)
    || build.configFields.some((field) => /endurance/i.test(field.name) && /^(true|1|yes)$/i.test(field.value));
  const enduranceChargeMatches = [...defenceText.matchAll(/(\d+)\s*(?:maximum\s*)?endurance charges?/g)].map((match) => Number(match[1])).filter(Number.isFinite);
  const enduranceChargeCount = Math.max(stats.enduranceCharges ?? 0, ...enduranceChargeMatches, 0);
  const physicalConversionEvidence = /physical damage (?:from hits )?taken as (?:fire|cold|lightning|elemental)|physical damage converted to|phys(?:ical)? damage taken as/.test(defenceText);
  const juggernautEvidence = /juggernaut/.test(`${defenceText} ${build.identity.ascendancy ?? ""}`);
  const shiftBackstop = shiftedElementalBackstop;

  const mitigationRaw = continuous(Math.max(stats.armour ?? 0, stats.evasion ?? 0), [[2_000, 0.15], [5_000, 0.35], [15_000, 0.75], [30_000, 1.05], [60_000, 1.25]])
    + continuous(stats.block ?? 0, [[25, 0.08], [50, 0.15], [75, 0.2]])
    + continuous(stats.spellBlock ?? 0, [[25, 0.06], [50, 0.11], [75, 0.15]])
    + continuous(stats.spellSuppression ?? 0, [[25, 0.08], [50, 0.14], [100, 0.2]])
    + continuous(Math.max(stats.lifeRegen ?? 0, stats.energyShieldRegen ?? 0, stats.lifeRecoveryRate ?? 0, stats.energyShieldRecoveryRate ?? 0, stats.lifeLeechRate ?? 0, stats.energyShieldLeechRate ?? 0, stats.lifeRecoup ?? 0), [[100, 0.06], [500, 0.15], [2_000, 0.25]])
    + (enduranceEvidence ? 0.25 : 0)
    + (physicalConversionEvidence ? 0.3 : 0)
    + (damageShiftEvidence ? 0.45 : 0)
    + (juggernautEvidence ? 0.3 : 0);
  const mitigationScore = Math.min(1.5, Math.max(0, mitigationRaw));
  const recoveryValues = [stats.lifeRegen, stats.energyShieldRegen, stats.lifeRecoveryRate, stats.energyShieldRecoveryRate, stats.lifeLeechRate, stats.energyShieldLeechRate, stats.lifeRecoup, stats.lifeOnHit, stats.lifeOnKill].filter(positive);
  const strongestRecovery = recoveryValues.length ? Math.max(...recoveryValues) : 0;
  const recoveryPenalty = strongestRecovery > 0 ? strongestRecovery < 100 ? 0.25 : 0 : 0.65;
  if (!recoveryValues.length) basis.push("Recovery gap: no positive regeneration, leech, recoup, on-hit, or on-kill recovery value was exported; strong mitigation does not replace recovery over repeated hits.");
  else if (recoveryPenalty > 0) basis.push(`Recovery is present but limited (${strongestRecovery.toLocaleString()} strongest exported value); a small sustained-hit penalty is applied.`);
  if ((stats.armour ?? 0) > 0 || (stats.evasion ?? 0) > 0 || (stats.block ?? 0) > 0 || (stats.spellBlock ?? 0) > 0 || (stats.spellSuppression ?? 0) > 0) {
    basis.push(`Layered mitigation and avoidance: ${[stats.armour ? `armour ${stats.armour.toLocaleString()}` : "", stats.evasion ? `evasion ${stats.evasion.toLocaleString()}` : "", stats.block ? `block ${stats.block}%` : "", stats.spellBlock ? `spell block ${stats.spellBlock}%` : "", stats.spellSuppression ? `suppression ${stats.spellSuppression}%` : "", enduranceEvidence ? "endurance/damage reduction evidence" : "", physicalConversionEvidence ? "physical damage taken as elemental evidence" : ""].filter(Boolean).join(", ")}; score ${round1(mitigationScore)}/1.5.`);
  }
  if (enduranceEvidence && !((stats.armour ?? 0) > 0 || (stats.evasion ?? 0) > 0 || (stats.block ?? 0) > 0 || (stats.spellBlock ?? 0) > 0 || (stats.spellSuppression ?? 0) > 0)) basis.push("Endurance/damage-reduction evidence contributes to the layered defence score.");
  if (physicalConversionEvidence) basis.push("Physical damage taken as elemental is recognized as an additional physical-hit mitigation layer.");
  if (damageShiftEvidence) basis.push(`Damage shifting is recognized as an elemental mitigation layer${shiftBackstop ? "; the shifted-to-fire backstop is capped" : ""}.`);
  if (juggernautEvidence) basis.push("Juggernaut ascendancy evidence is recognized as additional mitigation and endurance-based reliability.");
  if (enduranceChargeCount >= 8) basis.push(`Exceptional endurance-charge layer detected: ${enduranceChargeCount} charges materially strengthen physical mitigation and sustained defence.`);

  const maxHit = [stats.physicalMaximumHit, stats.elementalMaximumHit, stats.chaosMaximumHit]
    .filter((value, index): value is number => typeof value === "number" && value > 0 && (!chaosImmuneEvidence || index !== 2))
    .sort((a, b) => a - b);
  let maxHitScore = 0;
  let representativeMaxHit = 0;
  if (maxHit.length) {
    const median = maxHit[Math.floor((maxHit.length - 1) / 2)];
    const representative = damageShiftEvidence && shiftBackstop
      ? Math.max(...maxHit)
      : maxHit.length > 1 ? Math.max(median, median * 0.7 + maxHit.at(-1)! * 0.3) : median;
    representativeMaxHit = representative;
    maxHitScore = continuous(representative, [[3_000, 0.5], [8_000, 1], [15_000, 1.7], [30_000, 2.5], [60_000, 3.5], [100_000, 4.3], [200_000, 5]]);
    basis.push(`Primary maximum-hit coverage: ${representative.toLocaleString()} across ${maxHit.length} relevant exported damage types for ${round1(maxHitScore)}/5.0; weakest type ${maxHit[0].toLocaleString()}.${chaosImmuneEvidence ? " Chaos damage is excluded because the build is chaos-immune." : ""}`);
    if (maxHit.length > 1 && maxHit[0] < representative * 0.35) basis.push("One damage type is materially weaker, but it is shown as a coverage caveat rather than replacing the entire defence score.");
  }

  const evidenceCount = [resistanceScore > 0, pool > 0, mitigationScore > 0, maxHit.length > 0].filter(Boolean).length;
  if (!evidenceCount) return rating(null, "Unknown", ["No resistance, survivability-pool, mitigation, or maximum-hit evidence was exported."]);
  const conversionBonus = shiftBackstop ? 1 : damageShiftEvidence ? 0.35 : 0;
  const rawScore = resistanceScore + poolScore + mitigationScore + maxHitScore + conversionBonus - recoveryPenalty;
  const strongResistances = effectiveCappedElemental >= 3 && elementalResists.every((value) => typeof value === "number" && value >= 90);
  const strongChaosResistance = chaosImmuneEvidence || (stats.chaosResistance ?? -100) >= 75;
  const exceptionalMaximumHit = representativeMaxHit >= 200_000;
  const exceptionalRecovery = strongestRecovery >= 5_000;
  const layeredDefenceCount = [
    effectiveCappedElemental >= 3,
    pool >= 100_000,
    maxHitScore >= 4,
    strongestRecovery >= 500,
    (stats.block ?? 0) >= 75 || (stats.spellBlock ?? 0) >= 75,
    (stats.spellSuppression ?? 0) >= 100,
    (stats.armour ?? 0) >= 30_000 || (stats.evasion ?? 0) >= 30_000,
    enduranceChargeCount >= 8,
    (stats.physicalDamageReduction ?? 0) >= 80,
    physicalConversionEvidence || damageShiftEvidence,
    strongResistances,
    strongChaosResistance,
    exceptionalMaximumHit,
    exceptionalRecovery,
  ].filter(Boolean).length;
  const recoveryCeiling = strongestRecovery >= 500 ? 10 : strongestRecovery >= 100 ? 9.6 : strongestRecovery > 0 ? 9.4 : 9.3;
  const hitCeiling = representativeMaxHit >= 100_000 ? 10
    : representativeMaxHit >= 60_000 ? 9.4
    : representativeMaxHit >= 40_000 ? 8.8
    : representativeMaxHit >= 25_000 ? 8.2
    : representativeMaxHit >= 15_000 ? 7.6
    : representativeMaxHit > 0 ? 7.1
    : 6.5;
  const exceptionalTank = enduranceChargeCount >= 12
    && (stats.physicalDamageReduction ?? 0) >= 80
    && pool >= 100_000
    && maxHitScore >= 4
    && strongestRecovery >= 500
    && (effectiveCappedElemental >= 3 || shiftedElementalBackstop);
  const exceptionalLayeredDefence = strongResistances && strongChaosResistance && exceptionalMaximumHit && exceptionalRecovery && pool >= 150_000;
  const layeredCeiling = exceptionalTank || exceptionalLayeredDefence ? 10 : layeredDefenceCount >= 7 ? 9.6 : layeredDefenceCount >= 5 ? 9.5 : 9.4;
  const score = Math.max(1, Math.min(rawScore, recoveryCeiling, hitCeiling, layeredCeiling, 10));
  basis.push(`Defensive layers counted: ${layeredDefenceCount}/13 (resistance quality, pool, maximum hit, recovery, avoidance, suppression, mitigation, endurance, and shifting/conversion evidence).`);
  if (strongResistances) basis.push("Exceptional elemental resistance layer detected: all three elemental resistances are at least 90%.");
  if (strongChaosResistance) basis.push("Strong chaos resistance layer detected: chaos resistance is at least 75% or chaos is irrelevant because of immunity.");
  if (exceptionalMaximumHit) basis.push(`Exceptional maximum-hit coverage detected: representative maximum hit is ${representativeMaxHit.toLocaleString()}.`);
  if (exceptionalRecovery) basis.push(`Exceptional recovery detected: strongest exported recovery layer is ${strongestRecovery.toLocaleString()} per second or equivalent.`);
  if (exceptionalTank) basis.push(`Exceptional tank benchmark reached: ${enduranceChargeCount} endurance charges, ${stats.physicalDamageReduction}% physical damage reduction, high maximum-hit coverage, EHP, capped elemental resistance, and strong recovery.`);
  if (score < rawScore) basis.push(`Defence quality ceiling: ${round1(score)}/10 because maximum-hit and avoidance strength cannot represent sustained survival without stronger recovery and hit coverage.`);
  return rating(score, evidenceCount >= 3 ? "High" : "Medium", [...basis, "Maximum hit is the primary defence signal; capped resistances establish the foundation, while pool, mitigation, recovery, endurance reduction, and physical conversion accumulate toward 10/10.", "Temporary uptime and encounter-specific mechanics are not assumed unless PoB exported them as part of the snapshot."]);
}

export function calculateBuildQuality(build: NormalizedBuild, conditions: Condition[]): BuildQuality {
  const offence = offenceScore(build, conditions);
  const defence = defenceScore(build);
  const ratingDps = importedRatingDps(build);
  const categoryRatings = buildOverviewRatings(build, offence, defence, conditions, ratingDps.value);
  const contentCoverage = evaluateContentCoverage(build, categoryRatings, conditions);
  const knownScores = [offence.score, defence.score, contentCoverage.overall.score].filter((value): value is number => value !== null);
  const weakestScore = knownScores.length ? Math.min(...knownScores) : null;
  const averageScore = knownScores.length ? knownScores.reduce((total, value) => total + value, 0) / knownScores.length : null;
  const overallScore = weakestScore !== null && averageScore !== null ? Math.max(1, Math.min(10, weakestScore + (averageScore - weakestScore) / 2)) : null;
  const overall = rating(overallScore, knownScores.length === 3 ? "Medium" : "Unknown", ["Overall rating uses a weakest-link adjustment across offence, defence, and content breadth.", `Content breadth: ${contentCoverage.viableCount}/${contentCoverage.totalCount} endgame jobs are rated viable or better.`, "This is a build-quality screening score, not a promise that the character survives a specific encounter."]);
  return { overall, offence, defence, categoryRatings, contentCoverage, capabilityProfile: inferSkillCapabilities(build), ratingDps, assumptions: ["PoB exported values are treated as the imported snapshot.", `Offence blends the absolute PoB DPS curve with peer context from ${benchmarkRecordCount} normalized builds; the absolute curve remains dominant.`, "Defence prioritizes representative maximum hit, then adds capped resistances, survivability pool, mitigation, recovery, endurance reduction, and physical conversion evidence.", "Content breadth scores separate endgame jobs so a single-target number cannot stand in for pack clear, wave control, or repeated-hit survival."], limitations: ["Temporary defensive uptime, recovery uptime, movement, boss mechanics, and alternate combat states are not included in this static rating.", "Benchmark records provide peer context, not verified league-wide rankings or human gameplay labels.", "Imported values describe the selected PoB setup; they are not a promise of survival in every map.", ...contentCoverage.limitations] };
}

export function recalculateBuildQuality(quality: BuildQuality, build: CapabilityBuild & { importedStats: RatingDpsStats }, conditions: Array<{ reliability: string }>, scenarios: ScenarioReport): BuildQuality {
  const corrected = scenarios.recommended?.value ?? scenarios.configured.value;
  if (corrected === null || corrected === undefined) return quality;
  const importedEvidence = importedRatingDps(build);
  const imported = importedEvidence.value;
  const differencePercent = imported && imported > 0 ? ((corrected - imported) / imported) * 100 : 0;
  const verification = imported && imported > 0 ? Math.abs(differencePercent) <= 5 ? "matched" : "mismatch" : "not-run";
  const importedAggregateIsAuthoritative = importedEvidence.value !== null && !/\bHit DPS\b/i.test(importedEvidence.label);
  const ratingValue = importedAggregateIsAuthoritative ? importedEvidence.value! : corrected;
  const ratingOrigin = importedAggregateIsAuthoritative ? "imported" : "worker-typical";
  const ratingLabel = importedAggregateIsAuthoritative ? importedEvidence.label : "Typical worker-recalculated PoB DPS";
  const ratingExplanation = importedAggregateIsAuthoritative
    ? "The imported aggregate PoB value remains authoritative; the worker result is shown as a verification comparison."
    : "No aggregate Full/Combined/DoT DPS was exported, so the typical worker-recalculated value drives the rating.";
  const authoritativeOffence = scenarioOffenceRating(ratingValue, build, conditions);
  const authoritativeCategoryRatings = buildOverviewRatings(build, authoritativeOffence, quality.defence, conditions, ratingValue);
  const authoritativeContentCoverage = evaluateContentCoverage(build, authoritativeCategoryRatings, conditions);
  const authoritativeKnownScores = [authoritativeOffence.score, quality.defence.score, authoritativeContentCoverage.overall.score].filter((value): value is number => value !== null);
  const authoritativeWeakestScore = authoritativeKnownScores.length ? Math.min(...authoritativeKnownScores) : null;
  const authoritativeAverageScore = authoritativeKnownScores.length ? authoritativeKnownScores.reduce((total, value) => total + value, 0) / authoritativeKnownScores.length : null;
  const authoritativeOverallScore = authoritativeWeakestScore !== null && authoritativeAverageScore !== null ? Math.max(1, Math.min(10, authoritativeWeakestScore + (authoritativeAverageScore - authoritativeWeakestScore) / 2)) : null;
  const authoritativeOverall = rating(authoritativeOverallScore, authoritativeOffence.confidence === "Low" ? "Low" : "Medium", [importedAggregateIsAuthoritative ? "Overall rating remains anchored to the imported aggregate PoB DPS." : "Overall rating uses the typical worker-recalculated DPS because no aggregate PoB DPS was exported.", `Content breadth remains visible: ${authoritativeContentCoverage.viableCount}/${authoritativeContentCoverage.totalCount} endgame jobs are rated viable or better.`, "Peak valid DPS is displayed separately and does not drive the grade."]);
  return { ...quality, overall: authoritativeOverall, offence: authoritativeOffence, categoryRatings: authoritativeCategoryRatings, contentCoverage: authoritativeContentCoverage, capabilityProfile: inferSkillCapabilities(build), ratingDps: { value: ratingValue, label: ratingLabel, origin: ratingOrigin, explanation: ratingExplanation, importedValue: imported ?? undefined, differencePercent, verification }, assumptions: [...quality.assumptions, importedAggregateIsAuthoritative ? "A positive imported aggregate Full/Combined/DoT DPS remains authoritative in the imported snapshot." : "No positive aggregate DPS was exported, so the offence grade is marked as lower-confidence rather than inventing a value."], limitations: [...quality.limitations, "Totem, ballista, minion, summon uptime, placement, AI, and deployment timing remain lower-confidence until modeled explicitly.", ...authoritativeContentCoverage.limitations] };
}
