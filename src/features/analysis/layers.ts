import type {
  BuildLayerAnalysis,
  BuildLayerFinding,
  BuildQuality,
  Condition,
  Confidence,
  LayerSnapshot,
  NormalizedBuild,
  QualityGrade,
  QualityRating,
} from "@/src/types/domain";
import type { ScenarioReport } from "@/src/features/scenarios/model";
import { scenarioOffenceRating } from "./quality";

const gradeFor = (score: number): QualityGrade => score >= 9 ? "S" : score >= 8 ? "A" : score >= 7 ? "B" : score >= 6 ? "C" : score >= 5 ? "D" : score >= 3 ? "E" : "F";
const labelFor = (score: number) => score >= 9 ? "Exceptional" : score >= 8 ? "Very strong" : score >= 7 ? "Strong" : score >= 6 ? "Functional" : score >= 5 ? "Needs improvement" : score >= 3 ? "Fragile" : "Critical gaps";
const round1 = (value: number) => Math.round(value * 10) / 10;
const clamp = (value: number, min = 1, max = 10) => Math.max(min, Math.min(max, value));
const finitePositive = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;
const compactDps = (value: number) => {
  const absolute = Math.abs(value);
  const suffix = absolute >= 1_000_000_000 ? [1_000_000_000, "b"] as const : absolute >= 1_000_000 ? [1_000_000, "m"] as const : absolute >= 1_000 ? [1_000, "k"] as const : [1, ""] as const;
  const scaled = value / suffix[0];
  return `${scaled.toFixed(Math.abs(scaled) >= 100 ? 0 : Math.abs(scaled) >= 10 ? 1 : 2).replace(/\.0+$|(?<=\.[0-9])0+$/, "")}${suffix[1]}`;
};
const rating = (score: number | null, confidence: Confidence, basis: string[]): QualityRating => score === null
  ? { score: null, grade: "?", label: "Insufficient data", confidence, basis }
  : { score: round1(score), grade: gradeFor(score), label: labelFor(score), confidence, basis };

const logarithmicScore = (value: number, low: number, high: number) => clamp(1 + (Math.log10(Math.max(value, low)) - Math.log10(low)) * 9 / (Math.log10(high) - Math.log10(low)));
const dpsValue = (build: NormalizedBuild) => [
  [build.importedStats.fullDps, "Full PoB DPS"],
  [build.importedStats.totalDps, "Hit DPS"],
  [build.importedStats.totalDotDps, "Damage-over-Time DPS"],
  [build.importedStats.combinedDps, "Combined DPS"],
].find(([value]) => finitePositive(value)) as [number, string] | undefined;

function snapshots(value: number | undefined, source: string, conditions: string[], assumptions: string[]): LayerSnapshot[] {
  return [
    { state: "baseline", status: "unavailable", source: "Headless PoB comparison required", conditions: [], assumptions: ["Conditional inputs must be disabled and recalculated by the authoritative worker."] },
    { state: "typical", value, status: value === undefined ? "unavailable" : "calculated", source, conditions, assumptions },
    { state: "peak", status: "unavailable", source: "Headless PoB comparison required", conditions: [], assumptions: ["Peak validity and condition overlap must be recalculated by the authoritative worker."] },
  ];
}

function scenarioSnapshot(state: LayerSnapshot["state"], value: number | null | undefined, source: string, conditions: string[], assumptions: string[]): LayerSnapshot {
  return value === null || value === undefined
    ? { state, status: "unavailable", source: "The worker did not return this value", conditions, assumptions }
    : { state, value, status: "calculated", source, conditions, assumptions };
}

function replaceSnapshot(snapshotsToUpdate: LayerSnapshot[], snapshot: LayerSnapshot): LayerSnapshot[] {
  return snapshotsToUpdate.map((entry) => entry.state === snapshot.state ? snapshot : entry);
}

const defenceKeyForFinding: Record<string, string> = {
  "defence-hit-pool": "totalEHP",
  "defence-physical-hit": "physicalMaximumHitTaken",
  "defence-elemental-hit": "elementalMaximumHitTaken",
  "defence-fire-hit": "fireMaximumHitTaken",
  "defence-cold-hit": "coldMaximumHitTaken",
  "defence-lightning-hit": "lightningMaximumHitTaken",
  "defence-chaos-hit": "chaosMaximumHitTaken",
};

function scenarioAvoidance(defence: Record<string, number | null> | undefined): number | undefined {
  if (!defence) return undefined;
  const values = [defence.block, defence.spellBlock, defence.spellSuppression].filter(finitePositive);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : undefined;
}

function scenarioRecovery(defence: Record<string, number | null> | undefined): number | undefined {
  if (!defence) return undefined;
  const values = [defence.lifeRegen, defence.energyShieldRegen, defence.manaRegen].filter(finitePositive);
  return values.length ? Math.max(...values) : undefined;
}

/**
 * Merge authoritative worker states into the static evidence model. The imported
 * value remains the Typical snapshot; only Baseline and Peak are replaced here.
 * This keeps the report honest when the worker is unavailable or omits a field.
 */
export function applyScenarioSnapshots(analysis: BuildLayerAnalysis, scenarios: ScenarioReport, build?: Pick<NormalizedBuild, "mainSkill" | "skills">, conditions: Array<{ reliability: string }> = []): BuildLayerAnalysis {
  const correctedDps = scenarios.recommended?.value ?? scenarios.peak.value ?? scenarios.configured.value;
  const correctedOffence = correctedDps === null || correctedDps === undefined || !build ? analysis.offence.rating : scenarioOffenceRating(correctedDps, build, conditions);
  const updateFinding = (finding: BuildLayerFinding): BuildLayerFinding => {
    if (finding.id === "offence-main-link" && scenarios.supportContributions?.length) {
      const available = scenarios.supportContributions.some((comparison) => comparison.deltaDps !== null);
      const summary = scenarios.supportContributions.filter((comparison) => comparison.deltaDps !== null).map((comparison) => `${comparison.name}: ${comparison.deltaDps! >= 0 ? "−" : "+"}${compactDps(Math.abs(comparison.deltaDps!))} DPS`).join(" · ");
      return {
        ...finding,
        comparisons: scenarios.supportContributions,
        verdict: available
          ? `Controlled PoB comparisons show the configured damage change when each main-link support is removed: ${summary}.`
          : "The worker attempted controlled support comparisons but did not return comparable damage channels.",
        weaknesses: available ? ["These are isolated support-removal deltas; they do not model support uptime, skill rotation, or replacement gems."] : finding.weaknesses,
      };
    }
    if (finding.id === "offence-curse-package" && scenarios.curseContributions?.length) {
      const available = scenarios.curseContributions.some((comparison) => comparison.deltaDps !== null);
      const summary = scenarios.curseContributions.filter((comparison) => comparison.deltaDps !== null).map((comparison) => `${comparison.name}: ${comparison.deltaDps! >= 0 ? "−" : "+"}${compactDps(Math.abs(comparison.deltaDps!))} DPS`).join(" · ");
      return {
        ...finding,
        comparisons: scenarios.curseContributions,
        verdict: available
          ? `Controlled PoB comparisons show the configured DPS change when each detected curse or mark is removed: ${summary}.`
          : "The worker attempted controlled curse comparisons but did not return comparable damage channels.",
        weaknesses: available ? ["These are isolated removal deltas; real value still depends on application, curse limits, boss penalties, and uptime."] : finding.weaknesses,
      };
    }
    if (finding.id === "offence-damage-output") {
      const baseline = scenarios.unconditional;
      const peak = scenarios.peak;
      const snapshotsWithWorker = replaceSnapshot(finding.snapshots, scenarioSnapshot("baseline", baseline.value, "Headless PoB unconditional TotalDPS", baseline.includedConditions, ["Worker scenario snapshots use PoB TotalDPS; the Typical value remains the imported FullDPS field.", ...baseline.assumptions]));
      return { ...finding, snapshots: replaceSnapshot(snapshotsWithWorker, scenarioSnapshot("peak", peak.value, "Headless PoB peak TotalDPS", peak.includedConditions, ["Worker scenario snapshots use PoB TotalDPS; the Typical value remains the imported FullDPS field.", ...peak.assumptions])) };
    }
    const defenceKey = defenceKeyForFinding[finding.id];
    if (!defenceKey && finding.id !== "defence-avoidance" && finding.id !== "defence-recovery") return finding;
    const baseline = scenarios.unconditional;
    const peak = scenarios.peak;
    const baselineValue = finding.id === "defence-avoidance"
      ? scenarioAvoidance(baseline.defence)
      : finding.id === "defence-recovery"
        ? scenarioRecovery(baseline.defence)
        : baseline.defence?.[defenceKey] ?? undefined;
    const peakValue = finding.id === "defence-avoidance"
      ? scenarioAvoidance(peak.defence)
      : finding.id === "defence-recovery"
        ? scenarioRecovery(peak.defence)
        : peak.defence?.[defenceKey] ?? undefined;
    const baselineSnapshot = scenarioSnapshot("baseline", baselineValue, "Headless PoB baseline defence state", baseline.includedConditions, ["All supported combat condition inputs and custom condition modifiers are disabled.", ...baseline.assumptions]);
    const peakSnapshot = scenarioSnapshot("peak", peakValue, "Headless PoB peak defence state", peak.includedConditions, ["Only the configured peak scenario inputs are enabled.", ...peak.assumptions]);
    return { ...finding, snapshots: replaceSnapshot(replaceSnapshot(finding.snapshots, baselineSnapshot), peakSnapshot) };
  };
  return {
    ...analysis,
    offence: { ...analysis.offence, rating: correctedOffence, findings: analysis.offence.findings.map((finding) => finding.id === "offence-damage-output" ? { ...updateFinding(finding), rating: correctedOffence } : updateFinding(finding)) },
    defence: { ...analysis.defence, findings: analysis.defence.findings.map(updateFinding) },
    assumptions: [...analysis.assumptions, "Baseline and peak snapshots are authoritative states returned by the pinned Headless PoB worker."],
  };
}

function unavailableFinding(id: string, side: "offence" | "defence", category: string, name: string, evidence: string[], conditions: string[], weaknesses: string[], verdict: string, assumptions: string): BuildLayerFinding {
  return { id, side, category, name, rating: rating(null, "Unknown", [assumptions]), evidence, conditions, weaknesses, verdict, snapshots: snapshots(undefined, "No imported value", conditions, [assumptions]) };
}

function offenceLayers(build: NormalizedBuild, conditions: Condition[], quality: BuildQuality): BuildLayerFinding[] {
  const findings: BuildLayerFinding[] = [];
  const [dps, dpsLabel] = dpsValue(build) ?? [];
  const offenceConditions = conditions.filter((condition) => condition.category === "offence" || condition.category === "both");
  const conditionNames = offenceConditions.map((condition) => condition.displayName);
  const conditionalNames = offenceConditions.filter((condition) => condition.reliability !== "Reliable").map((condition) => condition.displayName);

  if (finitePositive(dps)) {
    const rawScore = logarithmicScore(dps, 100_000, 250_000_000);
    findings.push({
      id: "offence-damage-output",
      side: "offence",
      category: "Base damage",
      name: "Configured damage output",
      rating: { ...quality.offence, basis: [`${dpsLabel}: ${dps.toLocaleString()}.`, `Raw output strength: ${round1(rawScore)}/10 before reliability adjustments.`] },
      evidence: [`${dpsLabel}: ${dps.toLocaleString()}`, `Main skill: ${build.mainSkill ?? "Not identified"}`],
      conditions: conditionNames,
      weaknesses: conditionalNames.length ? [`Configured output includes conditions that are not continuously available: ${conditionalNames.join(", ")}.`] : ["The imported configured value is not an unconditional boss result."],
      verdict: conditionalNames.length ? "High configured output with visible conditional dependencies." : "High imported output with no non-reliable offensive condition detected.",
      snapshots: snapshots(dps, `Imported ${dpsLabel}`, conditionNames, ["Typical is the exact imported PoB configuration; it is not a claim of full-fight uptime."]),
    });
  } else {
    findings.push(unavailableFinding("offence-damage-output", "offence", "Base damage", "Configured damage output", [], conditionNames, ["No positive PoB damage field was exported."], "Damage output cannot be graded from the imported snapshot.", "A positive PoB DPS, DoT DPS, or Combined DPS field is required."));
  }

  const mainSetup = build.skillSetups.find((setup) => setup.includeInFullDPS);
  if (mainSetup) {
    const activeGems = mainSetup.gems.filter((gem) => !gem.support && !gem.provided && !gem.trigger);
    findings.push({
      id: "offence-main-link",
      side: "offence",
      category: "Gem-link quality",
      name: "Main damage setup",
      rating: rating(null, "Medium", ["Link contribution requires controlled PoB comparisons with each support removed or replaced."]),
      evidence: [`${mainSetup.gems.length}-gem setup in ${mainSetup.slot ?? mainSetup.label}`, `Active skill: ${activeGems.map((gem) => gem.name).join(", ") || "Unknown"}`, `Supports: ${mainSetup.gems.filter((gem) => gem.support).map((gem) => gem.name).join(", ") || "None detected"}`],
      conditions: [],
      weaknesses: ["Individual support contribution is not estimated without controlled worker comparisons."],
      verdict: "The main link is identified; contribution percentages are deliberately unavailable until comparison runs exist.",
      snapshots: snapshots(undefined, "Controlled support comparison required", [], ["A linked support is not automatically a damage increase in every scenario."]),
    });
  }

  const curses = build.skillSetups.flatMap((setup) => setup.gems).filter((gem) => /mark|curse|punishment|conductivity|flammability|elemental weakness|frostbite|despair|temporal chains|vulnerability/i.test(gem.name));
  if (curses.length) {
    findings.push(unavailableFinding("offence-curse-package", "offence", "Curse effectiveness", "Curse and debuff package", curses.map((gem) => `Source gem: ${gem.name}`), curses.map((gem) => gem.name), ["Application, curse limit, boss penalty, and whole-fight contribution require worker comparisons."], "Curse sources are present, but their effective contribution is not yet calculated.", "The importer can identify sources; it cannot infer application uptime from XML alone."));
  }

  return findings;
}

function defenceLayers(build: NormalizedBuild, conditions: Condition[]): BuildLayerFinding[] {
  const stats = build.importedStats;
  const findings: BuildLayerFinding[] = [];
  const defenceConditions = conditions.filter((condition) => condition.category === "defence" || condition.category === "both");
  const conditionNames = defenceConditions.map((condition) => condition.displayName);
  const temporaryNames = defenceConditions.filter((condition) => condition.reliability !== "Reliable").map((condition) => condition.displayName);

  if (finitePositive(stats.effectiveHealthPool)) {
    findings.push({
      id: "defence-hit-pool",
      side: "defence",
      category: "Life pool",
      name: "Effective hit pool",
      rating: rating(logarithmicScore(stats.effectiveHealthPool, 4_000, 250_000), "High", [`Effective hit pool: ${stats.effectiveHealthPool.toLocaleString()}.`]),
      evidence: [`Effective hit pool: ${stats.effectiveHealthPool.toLocaleString()}`, ...(finitePositive(stats.life) ? [`Life: ${stats.life.toLocaleString()}`] : []), ...(finitePositive(stats.energyShield) ? [`Energy Shield: ${stats.energyShield.toLocaleString()}`] : [])],
      conditions: conditionNames,
      weaknesses: temporaryNames.length ? [`Some defensive conditions may not be active continuously: ${temporaryNames.join(", ")}.`] : ["Effective hit pool does not describe recovery or avoidance after a hit connects."],
      verdict: "Large imported hit pool; maximum-hit and recovery layers still determine one-shot reliability.",
      snapshots: snapshots(stats.effectiveHealthPool, "Imported PoB TotalEHP", conditionNames, ["This is the imported configured state; baseline and peak require controlled worker states."]),
    });
  } else {
    findings.push(unavailableFinding("defence-hit-pool", "defence", "Life pool", "Effective hit pool", [], conditionNames, ["No TotalEHP value was exported."], "Effective hit pool cannot be graded from this export.", "TotalEHP is required for this layer."));
  }

  const elementalLayers: Array<[string, string, number | undefined, string, number | undefined]> = [
    ["defence-fire-hit", "Fire hit defence", stats.fireMaximumHit, "Fire maximum hit", stats.fireResistance],
    ["defence-cold-hit", "Cold hit defence", stats.coldMaximumHit, "Cold maximum hit", stats.coldResistance],
    ["defence-lightning-hit", "Lightning hit defence", stats.lightningMaximumHit, "Lightning maximum hit", stats.lightningResistance],
  ];
  const elementalValues = elementalLayers.map(([, , value]) => value).filter(finitePositive);
  const elementalIsUniform = elementalValues.length === 3 && new Set(elementalValues).size === 1;
  const maxHitLayers: Array<[string, string, number | undefined, string, number | undefined]> = [
    ["defence-physical-hit", "Physical hit defence", stats.physicalMaximumHit, "Physical maximum hit", undefined],
    ...(elementalIsUniform ? [["defence-elemental-hit", "Elemental hit defence", stats.elementalMaximumHit, "Elemental maximum hit", undefined] as [string, string, number | undefined, string, number | undefined]] : elementalLayers),
    ["defence-chaos-hit", "Chaos hit defence", stats.chaosMaximumHit, "Chaos maximum hit", stats.chaosResistance],
  ];
  for (const [id, name, value, label] of maxHitLayers) {
    if (!finitePositive(value)) continue;
    const mitigationEvidence = id === "defence-physical-hit"
      ? [finitePositive(stats.armour) ? `Armour: ${stats.armour.toLocaleString()}` : "Armour was not exported", finitePositive(stats.block) ? `Attack block: ${stats.block}%` : "Attack block was not exported"]
      : [finitePositive(stats.spellBlock) ? `Spell block: ${stats.spellBlock}%` : "Spell block was not exported", finitePositive(stats.spellSuppression) ? `Spell suppression: ${stats.spellSuppression}%` : "Spell suppression was not exported"];
    const resistance = maxHitLayers.find(([layerId]) => layerId === id)?.[4];
    const resistanceEvidence = id === "defence-elemental-hit"
      ? [
        finitePositive(stats.fireResistance) ? `Fire resistance: ${stats.fireResistance}%` : "Fire resistance unavailable",
        finitePositive(stats.coldResistance) ? `Cold resistance: ${stats.coldResistance}%` : "Cold resistance unavailable",
        finitePositive(stats.lightningResistance) ? `Lightning resistance: ${stats.lightningResistance}%` : "Lightning resistance unavailable",
      ]
      : id === "defence-fire-hit" || id === "defence-cold-hit" || id === "defence-lightning-hit"
        ? [finitePositive(resistance) ? `${name.replace(" hit defence", "")} resistance: ${resistance}%` : "Elemental resistance unavailable"]
        : id === "defence-chaos-hit" ? [finitePositive(resistance) ? `Chaos resistance: ${resistance}%` : "Chaos resistance unavailable"] : [];
    findings.push({
      id,
      side: "defence",
      category: name,
      name,
      rating: rating(logarithmicScore(value, 3_000, 60_000), "High", [`${label}: ${value.toLocaleString()}.`]),
      evidence: [`${label}: ${value.toLocaleString()}`, ...resistanceEvidence, ...mitigationEvidence],
      conditions: conditionNames,
      weaknesses: ["Maximum hit is a single damage-type snapshot; it does not prove recovery or repeated-hit survival."],
      verdict: `Imported ${label.toLowerCase()} is ${value.toLocaleString()}; the relevant resistance and weakest state must be considered before calling the layer reliable.`,
      snapshots: snapshots(value, `Imported PoB ${label}`, conditionNames, ["Baseline and peak values require worker recalculations with defensive conditions changed."]),
    });
  }

  const avoidanceValues = [stats.block, stats.spellBlock, stats.spellSuppression].filter(finitePositive);
  if (avoidanceValues.length) {
    const averageAvoidance = avoidanceValues.reduce((sum, value) => sum + value, 0) / avoidanceValues.length;
    findings.push({
      id: "defence-avoidance",
      side: "defence",
      category: "Avoidance",
      name: "Block and spell avoidance",
      rating: rating(clamp(1 + averageAvoidance / 75 * 9), "High", [`Imported avoidance components average ${round1(averageAvoidance)}%; components are shown separately in the report.`]),
      evidence: [finitePositive(stats.block) ? `Attack block: ${stats.block}%` : "Attack block unavailable", finitePositive(stats.spellBlock) ? `Spell block: ${stats.spellBlock}%` : "Spell block unavailable", finitePositive(stats.spellSuppression) ? `Spell suppression: ${stats.spellSuppression}%` : "Spell suppression unavailable"],
      conditions: conditionNames,
      weaknesses: ["Avoidance reduces hit frequency but cannot replace a sufficient maximum hit when an attack connects."],
      verdict: "Avoidance is reported as separate layers; the combined rating is only a screening summary.",
      snapshots: snapshots(averageAvoidance, "Imported PoB avoidance components", conditionNames, ["The average is a presentation aid, not a literal combined chance to avoid damage."]),
    });
  }

  const recoveryValues = [stats.lifeRegen, stats.lifeLeechRate, stats.energyShieldRegen, stats.energyShieldLeechRate, stats.manaRegen, stats.manaLeechRate, stats.lifeRecoup, stats.lifeOnHit, stats.lifeOnKill].filter(finitePositive);
  if (recoveryValues.length) {
    const strongestRecovery = Math.max(...recoveryValues);
    findings.push({
      id: "defence-recovery",
      side: "defence",
      category: "Recovery",
      name: "Recovery package",
      rating: rating(logarithmicScore(strongestRecovery, 10, 10_000), "Medium", [`Strongest imported recovery component: ${strongestRecovery.toLocaleString()} per second or event.`]),
      evidence: [finitePositive(stats.lifeRegen) ? `Life regeneration: ${stats.lifeRegen.toLocaleString()}/s` : "Life regeneration unavailable", finitePositive(stats.energyShieldRegen) ? `Energy Shield regeneration: ${stats.energyShieldRegen.toLocaleString()}/s` : "Energy Shield regeneration unavailable", finitePositive(stats.lifeLeechRate) ? `Life leech: ${stats.lifeLeechRate.toLocaleString()}/s` : "Life leech unavailable", finitePositive(stats.energyShieldLeechRate) ? `Energy Shield leech: ${stats.energyShieldLeechRate.toLocaleString()}/s` : "Energy Shield leech unavailable"],
      conditions: conditionNames,
      weaknesses: ["Recovery requiring attacks, kills, flasks, or a specific state is not treated as disengaged boss recovery."],
      verdict: "Recovery sources are detected separately; uptime and movement dependence remain unresolved until worker scenarios exist.",
      snapshots: snapshots(strongestRecovery, "Imported PoB recovery fields", conditionNames, ["The imported value does not distinguish attacking, moving, kill, and disengaged states yet."]),
    });
  }

  return findings;
}

export function analyzeBuildLayers(build: NormalizedBuild, conditions: Condition[], quality: BuildQuality): BuildLayerAnalysis {
  return {
    offence: { rating: quality.offence, findings: offenceLayers(build, conditions, quality) },
    defence: { rating: quality.defence, findings: defenceLayers(build, conditions) },
    assumptions: ["Layer values come from imported PoB fields and detected source evidence.", "Typical means the imported configured snapshot, not guaranteed combat uptime.", "After Run scenarios, Baseline is the worker's unconditional state and Peak is the worker's source-backed peak state."],
    limitations: ["Layer contribution percentages, condition overlap, recovery while disengaged, and true population percentiles are not calculated in this v1 analyzer."],
  };
}
