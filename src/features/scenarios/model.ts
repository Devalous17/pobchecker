import type { EngineResponse } from "@/src/features/engine/protocol";
import type { Condition, NormalizedBuild } from "@/src/types/domain";

export type ScenarioId = "configured" | "unconditional" | "recommended" | "peak" | "burst" | "initial" | "sustained" | "mapping";
export type ResultStatus = "calculated" | "estimated" | "unavailable";

export type ScenarioConfig = Record<string, boolean | number | string | string[]>;
export interface ScenarioProfile { id: ScenarioId; label: string; purpose: string; config: ScenarioConfig; durationSeconds?: number; }
export interface TimelineState { id: string; label: string; durationSeconds: number; dps: number | null; source: "engine" | "estimate" | "unavailable"; assumptions: string[]; }
export interface ScenarioMetric { value: number | null; unit: "dps" | "seconds" | "percent"; status: ResultStatus; confidence: "High" | "Medium" | "Low" | "Unknown"; includedConditions: string[]; assumptions: string[]; explanation: string; damageChannel?: string; defence?: EngineResponse["defence"]; }
export interface ScenarioContribution { name: string; withDps: number | null; withoutDps: number | null; deltaDps: number | null; status: ResultStatus; confidence: "High" | "Medium" | "Low" | "Unknown"; explanation: string; }
export interface AutoConfigurationHint { id: string; label: string; value: string; reason: string; confidence: "High" | "Medium" | "Low"; }
export interface ScenarioReport { encounterSeconds: number; configured: ScenarioMetric; unconditional: ScenarioMetric; recommended?: ScenarioMetric; autoConfiguration?: AutoConfigurationHint[]; peak: ScenarioMetric; burst: ScenarioMetric; initial: ScenarioMetric; sustained: ScenarioMetric; mapping: ScenarioMetric; timeline: TimelineState[]; curseContributions?: ScenarioContribution[]; supportContributions?: ScenarioContribution[]; engine?: EngineResponse["engine"]; }

const configured = (build: NormalizedBuild, ...names: string[]) => build.configFields.find((field) => names.includes(field.name));
const hasSource = (conditions: Condition[], id: string) => conditions.find((condition) => condition.id === id)?.sourceDetected === true;
const hasKnownCondition = (conditions: Condition[], id: string) => {
  const condition = conditions.find((entry) => entry.id === id);
  return Boolean(condition && (condition.sourceDetected || condition.configured));
};
const sourcePatterns: Record<string, RegExp> = {
  "enemy-low-life": /punishment|culling strike/i,
  "enemy-shocked": /shock|shocked|lightning damage/i,
  "enemy-chilled": /chill|chilled|frost shield|cold damage/i,
  "totem-present": /totem|totems/i,
  "recently-summoned-totem": /totem|totems/i,
  "totems-hit-spell-recently": /totem|spell/i,
  "flasks": /flask/i,
  "sigil-of-power": /sigil of power/i,
  "frost-shield": /frost shield/i,
  "arcane-cloak": /arcane cloak/i,
  "arcane-surge": /arcane surge/i,
  "infused-channelling": /infused channelling|storm barrier/i,
  "focused": /focus/i,
};
const enabledGemNames = (build: NormalizedBuild) => build.skillSetups.flatMap((setup) => setup.gems).filter((gem) => gem.enabled).map((gem) => gem.name);
const sourceBacked = (build: NormalizedBuild, id: string) => {
  const pattern = sourcePatterns[id];
  if (!pattern) return false;
  const skillNames = enabledGemNames(build);
  const skillOnly = new Set(["sigil-of-power", "frost-shield", "arcane-cloak", "arcane-surge", "infused-channelling", "focused"]);
  if (skillOnly.has(id) && !skillNames.some((name) => pattern.test(name))) return false;
  return build.sources.some((entry) => entry.category !== "configuration" && pattern.test(`${entry.name} ${entry.detail}`));
};
const hasSourceOrEvidence = (build: NormalizedBuild, conditions: Condition[], id: string) => hasSource(conditions, id) || sourceBacked(build, id);
const numberInput = (build: NormalizedBuild, ...names: string[]) => {
  const value = Number(configured(build, ...names)?.value);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
};
const numberInputOr = (build: NormalizedBuild, fallback: number, ...names: string[]) => numberInput(build, ...names) ?? fallback;
const hasConfig = (build: NormalizedBuild, name: string) => /^(true|1|yes)$/i.test(configured(build, name)?.value ?? "");
const curseFields: Record<string, string> = {
  "elemental weakness": "playerCursedWithElementalWeakness", conductivity: "playerCursedWithConductivity", punishment: "playerCursedWithPunishment",
  vulnerability: "playerCursedWithVulnerability", flammability: "playerCursedWithFlammability", frostbite: "playerCursedWithFrostbite",
  "temporal chains": "playerCursedWithTemporalChains", despair: "playerCursedWithDespair", enfeeble: "playerCursedWithEnfeeble", "warlord's mark": "playerCursedWithWarlordsMark",
};

function recommendedConfiguration(build: NormalizedBuild, conditions: Condition[], disabledIds: string[] = []): { config: ScenarioConfig; hints: AutoConfigurationHint[] } {
  const config = sourcedCombatState(build, conditions, { includeBoss: true });
  const hints: AutoConfigurationHint[] = [];
  const add = (id: string, label: string, value: string, reason: string, confidence: AutoConfigurationHint["confidence"]) => hints.push({ id, label, value, reason, confidence });
  const skillNames = enabledGemNames(build).join(" ").toLowerCase();
  const hasPowerEvidence = hasSource(conditions, "power-charges") || hasConfig(build, "usePowerCharges") || build.passiveNodes.some((node) => /conviction of power|power charge/i.test(node.name));
  if (hasPowerEvidence) { config.usePowerCharges = true; add("power-charges", "Power charges", "On", "Charges are supported by the tree or imported setup.", "High"); }
  if (hasSourceOrEvidence(build, conditions, "enemy-shocked")) { config.conditionEnemyShocked = true; config.conditionShockEffect = Math.min(15, numberInputOr(build, 15, "conditionShockEffect")); add("shock", "Enemy shocked", `${config.conditionShockEffect}%`, "Lightning damage is present; missing shock values use a bounded 15% estimate.", "Medium"); }
  if (hasSourceOrEvidence(build, conditions, "enemy-chilled")) { config.conditionEnemyChilled = true; config.conditionEnemyChilledEffect = Math.min(15, numberInputOr(build, 15, "conditionEnemyChilledEffect")); add("chill", "Enemy chilled", `${config.conditionEnemyChilledEffect}%`, "A chill source is present; the estimate is capped at 15%.", "Medium"); }
  if (hasSourceOrEvidence(build, conditions, "totem-present")) { config.conditionHaveTotem = true; config.conditionSummonedTotemRecently = true; config.TotemsSummoned = Math.min(6, numberInputOr(build, 6, "TotemsSummoned")); add("totems", "Totem present", `${config.TotemsSummoned} totems`, "The build contains a totem setup; six is used when the count is missing.", "High"); }
  if (hasSourceOrEvidence(build, conditions, "sigil-of-power")) { config.sigilOfPowerStages = Math.min(4, numberInputOr(build, 4, "sigilOfPowerStages")); add("sigil", "Sigil of Power", `${config.sigilOfPowerStages} stages`, "Sigil is present; the practical estimate is capped at four stages.", "Medium"); }
  if (hasSourceOrEvidence(build, conditions, "frost-shield")) { config.frostShieldStages = Math.min(4, numberInputOr(build, 4, "frostShieldStages")); add("frost-shield", "Frost Shield", `${config.frostShieldStages} stages`, "Frost Shield is present; four stages is used for the burst estimate.", "Medium"); }
  if (hasSourceOrEvidence(build, conditions, "infused-channelling")) { config.infusedChannellingInfusion = true; add("infusion", "Infused Channelling", "On", "The main setup contains Infused Channelling.", "High"); }
  if (hasSourceOrEvidence(build, conditions, "arcane-cloak")) { config.arcaneCloakUsedRecentlyCheck = true; add("arcane-cloak", "Arcane Cloak", "Recently used", "Arcane Cloak is present, but this remains temporary.", "Medium"); }
  if (hasSourceOrEvidence(build, conditions, "focused")) { config.conditionFocused = true; add("focused", "Focused", "On", "A Focus source is present; uptime remains cooldown-limited.", "Medium"); }
  if (hasSourceOrEvidence(build, conditions, "enemy-lightning-exposure")) { config.conditionEnemyLightningExposure = true; add("exposure", "Lightning exposure", "On", "An explicit exposure source was found.", "High"); }
  if (hasSourceOrEvidence(build, conditions, "enemy-unnerved")) { config.conditionEnemyUnnerved = true; add("unnerve", "Enemy unnerved", "On", "An explicit Unnerve source was found.", "High"); }
  if (skillNames.includes("inspiration")) { config.overrideInspirationCharges = Math.min(5, numberInputOr(build, 5, "overrideInspirationCharges")); add("inspiration", "Inspiration charges", `${config.overrideInspirationCharges}`, "Inspiration is present; five charges is used when the export omits the override.", "Medium"); }
  for (const [gemName, field] of Object.entries(curseFields)) if (skillNames.includes(gemName)) { config[field] = 1; add(`curse-${field}`, gemName, "On", "An enabled curse gem is present; only source-backed curses are re-enabled.", "High"); }
  const disabled = new Set(disabledIds);
  const disable = (id: string, fields: string[]) => { if (disabled.has(id)) for (const field of fields) delete config[field]; };
  disable("power-charges", ["usePowerCharges"]);
  disable("shock", ["conditionEnemyShocked", "conditionShockEffect"]);
  disable("chill", ["conditionEnemyChilled", "conditionEnemyChilledEffect"]);
  disable("totems", ["conditionHaveTotem", "conditionSummonedTotemRecently", "TotemsSummoned"]);
  disable("sigil", ["sigilOfPowerStages"]);
  disable("frost-shield", ["frostShieldStages"]);
  disable("infusion", ["infusedChannellingInfusion"]);
  disable("arcane-cloak", ["arcaneCloakUsedRecentlyCheck"]);
  disable("focused", ["conditionFocused"]);
  disable("exposure", ["conditionEnemyLightningExposure"]);
  disable("unnerve", ["conditionEnemyUnnerved"]);
  disable("inspiration", ["overrideInspirationCharges"]);
  for (const field of Object.values(curseFields)) disable(`curse-${field}`, [field]);
  // Keep disabled suggestions in the response so the UI can restore them in
  // one click after comparing the recalculated state.
  return { config, hints };
}

function sourcedCombatState(build: NormalizedBuild, conditions: Condition[], options: { includeLowLife?: boolean; includeKilled?: boolean; includeBoss?: boolean } = {}): ScenarioConfig {
  // Alternate scenarios must reset known inputs first. Otherwise an unsupported
  // checkbox from the imported XML would silently leak into the calculation.
  const config: ScenarioConfig = {
    resetAllConditions: true,
    usePowerCharges: false,
    useFrenzyCharges: false,
    useEnduranceCharges: false,
    buffOnslaught: false,
    conditionUsingFlask: false,
    conditionEnemyLowLife: false,
    conditionKilledRecently: false,
    sigilOfPowerStages: 0,
    frostShieldStages: 0,
    arcaneCloakUsedRecentlyCheck: false,
    conditionEnemyShocked: false,
    conditionEnemyChilled: false,
    conditionSummonedTotemRecently: false,
    conditionHaveTotem: false,
    conditionEnemyLightningExposure: false,
    conditionHitSpellRecently: false,
    conditionEnemyUnnerved: false,
    conditionTotemsHitSpellRecently: false,
    conditionFocused: false,
    conditionAttackedRecently: false,
    conditionUsedWarcryRecently: false,
    conditionCastSpellRecently: false,
    buffArcaneSurge: false,
    infusedChannellingInfusion: false,
  };
  if (options.includeBoss !== undefined) config.enemyIsBoss = options.includeBoss ? "Pinnacle" : "None";
  if (hasSource(conditions, "power-charges")) config.usePowerCharges = true;
  if (hasSource(conditions, "frenzy-charges")) config.useFrenzyCharges = true;
  if (hasSource(conditions, "endurance-charges")) config.useEnduranceCharges = true;
  if (hasSource(conditions, "onslaught")) config.buffOnslaught = true;
  if (hasSourceOrEvidence(build, conditions, "flasks")) config.conditionUsingFlask = true;
  if (options.includeLowLife && hasSourceOrEvidence(build, conditions, "enemy-low-life")) config.conditionEnemyLowLife = true;
  if (options.includeKilled && hasKnownCondition(conditions, "recently-killed")) config.conditionKilledRecently = true;
  const sigilStages = numberInput(build, "sigilOfPowerStages");
  if (hasSourceOrEvidence(build, conditions, "sigil-of-power") && sigilStages !== undefined) config.sigilOfPowerStages = sigilStages;
  const frostStages = numberInput(build, "frostShieldStages");
  if (hasSourceOrEvidence(build, conditions, "frost-shield") && frostStages !== undefined) config.frostShieldStages = frostStages;
  if (hasSourceOrEvidence(build, conditions, "arcane-cloak")) config.arcaneCloakUsedRecentlyCheck = true;
  if (hasSourceOrEvidence(build, conditions, "enemy-shocked")) config.conditionEnemyShocked = true;
  if (hasSourceOrEvidence(build, conditions, "enemy-chilled")) config.conditionEnemyChilled = true;
  if (hasSourceOrEvidence(build, conditions, "recently-summoned-totem")) config.conditionSummonedTotemRecently = true;
  if (hasSourceOrEvidence(build, conditions, "totem-present")) config.conditionHaveTotem = true;
  if (hasSource(conditions, "enemy-lightning-exposure")) config.conditionEnemyLightningExposure = true;
  if (hasSource(conditions, "recently-hit-spell")) config.conditionHitSpellRecently = true;
  if (hasSource(conditions, "enemy-unnerved")) config.conditionEnemyUnnerved = true;
  if (hasSource(conditions, "totems-hit-spell-recently")) config.conditionTotemsHitSpellRecently = true;
  if (hasSourceOrEvidence(build, conditions, "focused")) config.conditionFocused = true;
  if (hasSource(conditions, "recently-attacked")) config.conditionAttackedRecently = true;
  if (hasSource(conditions, "recently-cast-spell")) config.conditionCastSpellRecently = true;
  if (hasSourceOrEvidence(build, conditions, "arcane-surge")) config.buffArcaneSurge = true;
  if (hasSourceOrEvidence(build, conditions, "infused-channelling")) config.infusedChannellingInfusion = true;
  const chilledEffect = numberInput(build, "conditionEnemyChilledEffect");
  if (hasSource(conditions, "enemy-chilled") && chilledEffect !== undefined) config.conditionEnemyChilledEffect = chilledEffect;
  const shockEffect = numberInput(build, "conditionShockEffect");
  if (hasSource(conditions, "enemy-shocked") && shockEffect !== undefined) config.conditionShockEffect = shockEffect;
  const summonedTotems = numberInput(build, "TotemsSummoned");
  if (hasSource(conditions, "totem-present") && summonedTotems !== undefined) config.TotemsSummoned = summonedTotems;
  const inspirationCharges = numberInput(build, "overrideInspirationCharges");
  if (hasSource(conditions, "infused-channelling") && inspirationCharges !== undefined) config.overrideInspirationCharges = inspirationCharges;
  const mainChannel = build.damageChannels.find((channel) => channel.active && channel.includeInFullDPS) ?? build.damageChannels.find((channel) => channel.active);
  const importedSkillPart = numberInput(build, "skillPartCalcs");
  const importedSkillCount = numberInput(build, "skillCount");
  const selectedSkillPart = mainChannel?.skillPart ?? importedSkillPart;
  const selectedSkillCount = mainChannel?.skillCount ?? importedSkillCount;
  if (selectedSkillPart !== undefined) config.skillPartCalcs = selectedSkillPart;
  if (selectedSkillCount !== undefined) config.skillCount = selectedSkillCount;
  return config;
}

export function buildScenarioProfiles(build: NormalizedBuild, conditions: Condition[], disabledAutomatic: string[] = []): ScenarioProfile[] {
  const automatic = recommendedConfiguration(build, conditions, disabledAutomatic);
  const peak = sourcedCombatState(build, conditions, { includeBoss: true, includeLowLife: true, includeKilled: true });
  const burst = sourcedCombatState(build, conditions, { includeBoss: true });
  const initial: ScenarioConfig = { resetAllConditions: true, enemyIsBoss: "Pinnacle", useFrenzyCharges: false, conditionEnemyLowLife: false, conditionKilledRecently: false, conditionUsingFlask: false, buffOnslaught: false, sigilOfPowerStages: 0, frostShieldStages: 0, arcaneCloakUsedRecentlyCheck: false };
  // Conviction of Power and other reliable minimum-charge sources remain in the opening state.
  if (hasSource(conditions, "power-charges") && conditions.find((entry) => entry.id === "power-charges")?.reliability === "Reliable") initial.usePowerCharges = true;
  else initial.usePowerCharges = false;
  if (hasSource(conditions, "endurance-charges") && conditions.find((entry) => entry.id === "endurance-charges")?.reliability === "Reliable") initial.useEnduranceCharges = true;
  else initial.useEnduranceCharges = false;
  const mapping = sourcedCombatState(build, conditions, { includeBoss: false, includeKilled: true });
  mapping.conditionEnemyLowLife = false;
  return [
    { id: "configured", label: "Configured PoB", purpose: "The exact configuration supplied by the imported build.", config: {} },
    { id: "unconditional", label: "Unconditional DPS", purpose: "Baseline engine calculation with supported combat conditions and custom condition modifiers disabled.", config: { resetAllConditions: true, enemyIsBoss: "None" } },
    { id: "recommended", label: "Recommended configuration", purpose: "Source-backed combat state with bounded median values for missing PoB inputs.", config: automatic.config },
    { id: "peak", label: "Peak DPS", purpose: "Highest engine-calculated value for compatible conditions with detected sources.", config: peak },
    { id: "burst", label: "Realistic burst DPS", purpose: "A practical boss window excluding mapping-only and low-life phase conditions.", config: burst, durationSeconds: 5 },
    { id: "initial", label: "Initial boss DPS", purpose: "Opening state: reliable baseline sources remain, while ramp and temporary states are inactive.", config: initial, durationSeconds: 3 },
    { id: "sustained", label: "Sustained boss DPS", purpose: "Timeline-weighted encounter average using the source-backed boss state rather than the imported configured state.", config: sourcedCombatState(build, conditions, { includeBoss: true }), durationSeconds: 30 },
    { id: "mapping", label: "Mapping DPS", purpose: "Clearing state where sourced flask and recently-killed effects may apply.", config: mapping, durationSeconds: 10 },
  ];
}

export function buildAutomaticConfiguration(build: NormalizedBuild, conditions: Condition[], disabledAutomatic: string[] = []) {
  return recommendedConfiguration(build, conditions, disabledAutomatic);
}

export const scenarioProfiles: ScenarioProfile[] = [
  { id: "configured", label: "Configured PoB", purpose: "The exact configuration supplied by the imported build.", config: {} },
  { id: "peak", label: "Peak DPS", purpose: "Highest engine-calculated value for compatible conditions with detected sources.", config: {} },
  { id: "burst", label: "Realistic burst DPS", purpose: "A practical boss window excluding mapping-only and low-life phase conditions.", config: { enemyIsBoss: "Pinnacle" }, durationSeconds: 5 },
  { id: "initial", label: "Initial boss DPS", purpose: "Opening state before temporary effects are active.", config: { enemyIsBoss: "Pinnacle" }, durationSeconds: 3 },
  { id: "sustained", label: "Sustained boss DPS", purpose: "Timeline-weighted encounter average; no universal uptime multiplier.", config: { enemyIsBoss: "Pinnacle" }, durationSeconds: 30 },
  { id: "mapping", label: "Mapping DPS", purpose: "Clearing state where sourced flask and recently-killed effects may apply.", config: { enemyIsBoss: "None" }, durationSeconds: 10 },
];
