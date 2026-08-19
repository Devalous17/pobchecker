import type { EngineResponse } from "@/src/features/engine/protocol";
import type { MainSkillCandidateEvidence, NormalizedBuild, SkillGemInfo, SkillSetup } from "@/src/types/domain";

export type ActiveSkillCandidate = {
  setup: SkillSetup;
  gem: SkillGemInfo;
};

export type SkillDpsCalculator = (candidate: ActiveSkillCandidate) => Promise<EngineResponse>;

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

const isActiveDamageGem = (gem: SkillGemInfo) =>
  gem.enabled && !gem.support && !gem.provided && !gem.trigger && !(gem.tags ?? []).some((tag) => tag.toLowerCase() === "support");

export function collectActiveSkillCandidates(build: NormalizedBuild): ActiveSkillCandidate[] {
  return build.skillSetups.flatMap((setup) => setup.enabled
    ? setup.gems.filter(isActiveDamageGem).map((gem) => ({ setup, gem }))
    : []);
}

/**
 * PoB's Include in Full DPS marker is the authoritative imported selection.
 * Keep the marker's aggregate intact; the checked list may intentionally
 * contain more than one setup. The first active gem is used only as the
 * human-readable main-skill identity.
 */
export function selectMainSkillFromPoBMarker(build: NormalizedBuild): NormalizedBuild {
  const candidates = collectActiveSkillCandidates(build);
  const markedSetups = build.skillSetups.filter((setup) => setup.enabled && setup.includeInFullDPS);
  const markerCandidate = build.fullDpsSkill
    ? candidates.find(({ gem }) => [gem.name, gem.displayName].some((name) => normalize(name ?? "") === normalize(build.fullDpsSkill ?? "")))
    : undefined;
  const markedMarkerCandidate = markerCandidate && markedSetups.some((setup) => setup.id === markerCandidate.setup.id) ? markerCandidate : undefined;
  const indexedMarkedCandidate = markedSetups.flatMap((setup) => {
    if (!setup.mainActiveSkillIndex || setup.mainActiveSkillIndex < 1) return [];
    const active = candidates.filter(({ setup: candidateSetup }) => candidateSetup.id === setup.id);
    return active[setup.mainActiveSkillIndex - 1] ? [active[setup.mainActiveSkillIndex - 1]] : [];
  })[0];
  const mainActiveMarkedCandidate = markedSetups.flatMap((setup) => {
    if (!setup.mainActiveSkill) return [];
    const active = candidates.filter(({ setup: candidateSetup }) => candidateSetup.id === setup.id);
    const selected = setup.mainActiveSkillIndex && setup.mainActiveSkillIndex > 0
      ? active[setup.mainActiveSkillIndex - 1]
      : active[0];
    return selected ? [selected] : [];
  })[0];
  const markedCandidate = markedMarkerCandidate ?? mainActiveMarkedCandidate ?? indexedMarkedCandidate ?? candidates.find(({ setup }) => markedSetups.some((marked) => marked.id === setup.id));
  // A stale imported identity must never override an explicit Full DPS setup.
  // Only fall back to the previous identity when PoB supplied no usable
  // marker/setup candidate at all.
  const nonProvidedCandidates = candidates.filter(({ setup }) => !/^(tree|item|passive):/i.test(setup.source ?? ""));
  const selected = markedCandidate ?? nonProvidedCandidates[0] ?? existingCandidate(build, candidates);
  if (!selected) return build;

  return {
    ...build,
    mainSkill: selected.gem.name,
    mainSkillSelection: {
      method: "pob-marker",
      selectedSkill: selected.gem.name,
      selectedSetupId: selected.setup.id,
      selectedSetupLabel: selected.setup.label,
      selectedSetupIndex: selected.setup.engineIndex,
      reason: markedCandidate
        ? `${selected.gem.displayName ?? selected.gem.name} is the PoB-selected active gem from the setup(s) checked Include in Full DPS. The imported FullDPS value is authoritative.`
        : `No explicit Include in Full DPS setup was found; ${selected.gem.displayName ?? selected.gem.name} is retained as the imported skill identity without inventing a replacement DPS value.`,
      comparedCandidates: candidates.map(({ setup, gem }) => ({
        skillName: gem.name,
        displayName: gem.displayName,
        setupId: setup.id,
        setupLabel: setup.label,
        setupIndex: setup.engineIndex,
        status: setup.id === selected.setup.id ? "calculated" : "unavailable",
      })),
      warnings: markedCandidate ? [] : ["No explicit Include in Full DPS setup was found in the imported PoB snapshot."],
    },
  };
}

function scoreEngineResponse(response: EngineResponse, candidate: ActiveSkillCandidate): { value: number; source: string; hitDps?: number } | null {
  // A DPS payload without an explicit selected-skill identity is unsafe here:
  // PoB can return the previous/imported FullDPS group when a requested skill
  // was not actually selected. Never let that stale aggregate rank a candidate.
  if (!response.selectedSkill) return null;
  if (normalize(response.selectedSkill) !== normalize(candidate.gem.name) && normalize(response.selectedSkill) !== normalize(candidate.gem.displayName ?? "")) return null;
  const values: Array<[string, number | null | undefined]> = [
    ["FullDPS", response.offence.fullDPS],
    ["CombinedDPS", response.offence.combinedDPS],
    ["TotalDPS", response.offence.totalDPS],
    ["TotalDotDPS", response.offence.totalDot],
    ["MinionFullDPS", response.minion?.fullDPS],
    ["MinionCombinedDPS", response.minion?.combinedDPS],
    ["MinionDPS", response.minion?.totalDPS],
  ];
  const positive = values.find(([, value]) => typeof value === "number" && Number.isFinite(value) && value > 0);
  return positive ? {
    source: positive[0],
    value: positive[1] as number,
    hitDps: typeof response.offence.totalDPS === "number" && Number.isFinite(response.offence.totalDPS) && response.offence.totalDPS > 0 ? response.offence.totalDPS : undefined,
  } : null;
}

const existingCandidate = (build: NormalizedBuild, candidates: ActiveSkillCandidate[]) => {
  const wanted = normalize(build.mainSkill ?? "");
  return candidates.find(({ gem }) => normalize(gem.name) === wanted || normalize(gem.displayName ?? "") === wanted);
};

const utilityTags = new Set(["movement", "travel", "blink", "aura", "reservation", "curse", "mark", "guard", "stance", "banner", "herald"]);
const damageTags = new Set(["attack", "spell", "projectile", "area", "melee", "minion", "summon", "totem", "trap", "mine", "brand"]);

function scoreHeuristicCandidate(candidate: ActiveSkillCandidate) {
  const tags = new Set((candidate.gem.tags ?? []).map((tag) => tag.toLowerCase()));
  const utility = [...utilityTags].some((tag) => tags.has(tag));
  const supportCount = candidate.setup.gems.filter((gem) => gem.enabled && gem.support && !gem.provided && !gem.trigger).length + (candidate.setup.externalSupportEvidence?.length ?? 0);
  const positiveTagScore = [...damageTags].reduce((score, tag) => score + (tags.has(tag) ? (tag === "projectile" || tag === "attack" || tag === "spell" ? 3 : 2) : 0), 0);
  const metadataScore = candidate.gem.damageModel ? 1 : 0;
  const activeGemScore = tags.has("grants_active_skill") ? 1 : 0;
  const linkScore = Math.min(2, supportCount * 0.25);
  return { candidate, utility, score: positiveTagScore + metadataScore + activeGemScore + linkScore };
}

function chooseHeuristicCandidate(candidates: ActiveSkillCandidate[]) {
  return candidates
    .map(scoreHeuristicCandidate)
    .filter((entry) => !entry.utility && entry.score > 0)
    .sort((left, right) => right.score - left.score)[0]?.candidate;
}

export function recordMainSkillFallback(build: NormalizedBuild, warning: string): NormalizedBuild {
  const candidates = collectActiveSkillCandidates(build);
  const heuristic = chooseHeuristicCandidate(candidates);
  const fallback = heuristic ?? existingCandidate(build, candidates) ?? candidates[0];
  if (!fallback) return build;
  const usedHeuristic = Boolean(heuristic);
  return {
    ...build,
    mainSkill: fallback.gem.name,
    skillSetups: build.skillSetups.map((setup) => ({ ...setup, includeInFullDPS: setup.id === fallback.setup.id, mainActiveSkill: setup.id === fallback.setup.id })),
    damageChannels: build.damageChannels.map((channel) => ({ ...channel, includeInFullDPS: channel.setupId === fallback.setup.id && normalize(channel.skillName) === normalize(fallback.gem.name) })),
    mainSkillSelection: {
      method: "fallback",
      selectedSkill: fallback.gem.name,
      selectedSetupId: fallback.setup.id,
      selectedSetupLabel: fallback.setup.label,
      selectedSetupIndex: fallback.setup.engineIndex,
      reason: usedHeuristic
        ? `${fallback.gem.displayName ?? fallback.gem.name} was selected as the best non-utility active-skill candidate using PoB gem metadata because worker verification was unavailable.`
        : build.mainSkill
          ? "The explicit PoB skill marker was retained because worker verification was unavailable and no metadata-backed damage candidate was available."
          : "The first active skill was retained because worker verification was unavailable and no metadata-backed damage candidate was available.",
      comparedCandidates: candidates.map(({ setup, gem }) => ({ skillName: gem.name, displayName: gem.displayName, setupId: setup.id, setupLabel: setup.label, setupIndex: setup.engineIndex, status: "unavailable" })),
      warnings: [warning, ...(usedHeuristic ? ["The explicit PoB main-skill marker was treated as a hint only; movement and utility skills were excluded from the fallback ranking."] : [])],
    },
  };
}

export async function selectMainSkillByDps(build: NormalizedBuild, calculate: SkillDpsCalculator): Promise<NormalizedBuild> {
  const candidates = collectActiveSkillCandidates(build);
  const comparedCandidates: MainSkillCandidateEvidence[] = [];
  const warnings: string[] = [];

  const results = await Promise.all(candidates.map(async (candidate) => {
    const evidence: MainSkillCandidateEvidence = {
      skillName: candidate.gem.name,
      displayName: candidate.gem.displayName,
      setupId: candidate.setup.id,
      setupLabel: candidate.setup.label,
      setupIndex: candidate.setup.engineIndex,
      status: "unavailable",
    };
    try {
      const response = await calculate(candidate);
      const score = scoreEngineResponse(response, candidate);
      if (!score) {
        evidence.status = "zero";
        comparedCandidates.push(evidence);
        return { candidate, score: null };
      }
      evidence.status = "calculated";
      evidence.dps = score.value;
      evidence.dpsSource = score.source;
      comparedCandidates.push(evidence);
      return { candidate, score };
    } catch {
      evidence.status = "failed";
      comparedCandidates.push(evidence);
      return { candidate, score: null };
    }
  }));

  const ranked = results
    .filter((result): result is typeof result & { score: { value: number; source: string } } => Boolean(result.score))
    .sort((left, right) => right.score.value - left.score.value);
  const best = ranked[0];
  const failedCount = comparedCandidates.filter((candidate) => candidate.status === "failed" || candidate.status === "unavailable").length;
  const zeroCount = comparedCandidates.filter((candidate) => candidate.status === "zero").length;
  const orderedEvidence = candidates.map((candidate) => comparedCandidates.find((entry) => entry.setupId === candidate.setup.id && entry.skillName === candidate.gem.name)).filter((entry): entry is MainSkillCandidateEvidence => Boolean(entry));

  if (best) {
    if (failedCount) warnings.push(`${failedCount} active skill calculation${failedCount === 1 ? " was" : "s were"} unavailable, so the ranking is based only on successful worker results.`);
    if (zeroCount) warnings.push(`${zeroCount} active skill${zeroCount === 1 ? " returned" : "s returned"} no positive DPS and was excluded from the main-skill ranking.`);
    return {
      ...build,
      mainSkill: best.candidate.gem.name,
      skillSetups: build.skillSetups.map((setup) => ({ ...setup, includeInFullDPS: setup.id === best.candidate.setup.id, mainActiveSkill: setup.id === best.candidate.setup.id })),
      damageChannels: build.damageChannels.map((channel) => ({ ...channel, includeInFullDPS: channel.setupId === best.candidate.setup.id && normalize(channel.skillName) === normalize(best.candidate.gem.name) })),
      mainSkillSelection: {
        method: "worker-dps",
        selectedSkill: best.candidate.gem.name,
        selectedSetupId: best.candidate.setup.id,
        selectedSetupLabel: best.candidate.setup.label,
        selectedSetupIndex: best.candidate.setup.engineIndex,
        selectedDps: best.score.value,
        selectedHitDps: best.score.hitDps,
        reason: `${best.candidate.gem.displayName ?? best.candidate.gem.name} returned the highest positive ${best.score.source} across ${candidates.length} enabled active skills.`,
        comparedCandidates: orderedEvidence,
        warnings,
      },
    };
  }

  const heuristic = chooseHeuristicCandidate(candidates);
  const fallback = heuristic ?? existingCandidate(build, candidates) ?? candidates[0];
  if (candidates.length) warnings.push(heuristic
    ? "No positive worker result was available for any active skill; the importer used metadata safeguards instead of trusting the explicit PoB marker."
    : "No positive worker result was available for any active skill; the importer retained its explicit skill marker or first active skill because no metadata-backed damage candidate was available.");
  return {
    ...build,
    mainSkill: fallback?.gem.name ?? build.mainSkill,
    skillSetups: fallback ? build.skillSetups.map((setup) => ({ ...setup, includeInFullDPS: setup.id === fallback.setup.id, mainActiveSkill: setup.id === fallback.setup.id })) : build.skillSetups,
    damageChannels: fallback ? build.damageChannels.map((channel) => ({ ...channel, includeInFullDPS: channel.setupId === fallback.setup.id && normalize(channel.skillName) === normalize(fallback.gem.name) })) : build.damageChannels,
    mainSkillSelection: fallback ? {
      method: "fallback",
      selectedSkill: fallback.gem.name,
      selectedSetupId: fallback.setup.id,
      selectedSetupLabel: fallback.setup.label,
      selectedSetupIndex: fallback.setup.engineIndex,
      reason: heuristic
        ? `${fallback.gem.displayName ?? fallback.gem.name} was selected as the best non-utility active-skill candidate using PoB gem metadata after all worker results were zero or unavailable.`
        : build.mainSkill
          ? "No positive worker result was available, so the explicit PoB skill marker was retained because no metadata-backed damage candidate was available."
          : "No positive worker result or explicit PoB marker was available, so the first active skill was retained because no metadata-backed damage candidate was available.",
      comparedCandidates: orderedEvidence,
      warnings,
    } : undefined,
  };
}
