import type { BuildQuality, Condition, Confidence, NormalizedBuild, QualityGrade, QualityRating } from "@/src/types/domain";

const gradeFor = (score: number): QualityGrade => score >= 9 ? "S" : score >= 8 ? "A" : score >= 7 ? "B" : score >= 6 ? "C" : score >= 5 ? "D" : score >= 3 ? "E" : "F";
const labelFor = (score: number) => score >= 9 ? "Exceptional" : score >= 8 ? "Very strong" : score >= 7 ? "Strong" : score >= 6 ? "Functional" : score >= 5 ? "Needs improvement" : score >= 3 ? "Fragile" : "Critical gaps";
const round1 = (score: number) => Math.round(score * 10) / 10;
const rating = (score: number | null, confidence: Confidence, basis: string[]): QualityRating => score === null ? { score: null, grade: "?", label: "Insufficient data", confidence, basis } : { score: round1(score), grade: gradeFor(score), label: labelFor(score), confidence, basis };

// This is an absolute screening curve, not a population percentile. It gives
// useful resolution between broad DPS bands while remaining honest about the
// fact that a real percentile needs a calibrated, league- and skill-aware set.
const offenceOutputScore = (dps: number) => Math.max(1, Math.min(10, 2.3 + (Math.log10(dps) - 5) * 2.3));

function offenceScore(build: NormalizedBuild, conditions: Condition[]): QualityRating {
  const dps = [build.importedStats.fullDps, build.importedStats.totalDps, build.importedStats.averageDps, build.importedStats.totalDotDps, build.importedStats.combinedDps].find((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0);
  if (dps === undefined || !Number.isFinite(dps)) return rating(null, "Unknown", ["No PoB DPS value was exported."]);
  const base = offenceOutputScore(dps);
  const unverified = conditions.filter((condition) => condition.reliability === "Unverified").length;
  const mappingOnly = conditions.filter((condition) => condition.reliability === "Mapping-only").length;
  const reliabilityPenalty = Math.min(1.5, unverified * 0.5) + Math.min(0.5, mappingOnly * 0.25);
  const score = Math.max(1, base - reliabilityPenalty);
  const basisLabel = build.importedStats.fullDps !== undefined && build.importedStats.fullDps > 0
    ? "Full PoB DPS"
    : build.importedStats.totalDps !== undefined && build.importedStats.totalDps > 0
      ? "Hit DPS"
      : build.importedStats.totalDotDps !== undefined && build.importedStats.totalDotDps > 0
        ? "PoB Damage-over-Time DPS"
        : "positive DPS value";
  const basis = [`Imported ${basisLabel}: ${dps.toLocaleString()}.`];
  basis.unshift(`Raw output strength: ${round1(base)}/10 before reliability adjustments.`);
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
  const knownScores = [offence.score, defence.score].filter((value): value is number => value !== null);
  const overallScore = knownScores.length === 2 ? Math.max(1, Math.min(10, Math.min(offence.score!, defence.score!) + Math.abs(offence.score! - defence.score!) / 3)) : knownScores[0] ?? null;
  const overall = rating(overallScore, knownScores.length === 2 ? "Medium" : "Unknown", ["Overall rating uses a weakest-link adjustment so high damage cannot fully hide missing defence.", "This is a build-quality screening score, not a promise that the character survives a specific encounter."]);
  return { overall, offence, defence, assumptions: ["PoB exported values are treated as the imported snapshot.", "Offence uses a continuous absolute screening curve; it is not yet a population percentile.", "Defensive quality prioritizes effective hit pool and the weakest imported maximum-hit value."], limitations: ["Temporary defensive uptime, recovery uptime, movement, boss mechanics, and worker-calculated alternate states are not included in this static rating.", "Run combat scenarios for a more authoritative configured-versus-unconditional comparison."] };
}
