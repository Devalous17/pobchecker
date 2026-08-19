import { z } from "zod";

export const scenarioConfigSchema = z.object({
  enemyIsBoss: z.enum(["None", "Boss", "Pinnacle", "Uber"]).optional(),
  usePowerCharges: z.boolean().optional(),
  useFrenzyCharges: z.boolean().optional(),
  useEnduranceCharges: z.boolean().optional(),
  conditionEnemyLowLife: z.boolean().optional(),
  conditionKilledRecently: z.boolean().optional(),
  conditionUsingFlask: z.boolean().optional(),
  // Kept for older callers. The worker maps this alias to PoB's current key.
  conditionRecentlyKilled: z.boolean().optional(),
  buffOnslaught: z.boolean().optional(),
  sigilOfPowerStages: z.number().finite().min(0).max(10).optional(),
  frostShieldStages: z.number().finite().min(0).max(10).optional(),
  arcaneCloakUsedRecentlyCheck: z.boolean().optional(),
  conditionEnemyShocked: z.boolean().optional(),
  conditionEnemyChilled: z.boolean().optional(),
  conditionSummonedTotemRecently: z.boolean().optional(),
  conditionShockEffect: z.number().finite().min(0).max(100).optional(),
  conditionHaveTotem: z.boolean().optional(),
  conditionEnemyLightningExposure: z.boolean().optional(),
  conditionHitSpellRecently: z.boolean().optional(),
  conditionEnemyUnnerved: z.boolean().optional(),
  conditionTotemsHitSpellRecently: z.boolean().optional(),
  conditionFocused: z.boolean().optional(),
  conditionAttackedRecently: z.boolean().optional(),
  conditionEnemyChilledEffect: z.number().finite().min(0).max(100).optional(),
  conditionUsedWarcryRecently: z.boolean().optional(),
  TotemsSummoned: z.number().finite().min(0).max(20).optional(),
  conditionCastSpellRecently: z.boolean().optional(),
  buffArcaneSurge: z.boolean().optional(),
  infusedChannellingInfusion: z.boolean().optional(),
  overrideInspirationCharges: z.number().finite().min(0).max(20).optional(),
  playerCursedWithElementalWeakness: z.union([z.boolean(), z.number()]).optional(),
  playerCursedWithConductivity: z.union([z.boolean(), z.number()]).optional(),
  playerCursedWithPunishment: z.union([z.boolean(), z.number()]).optional(),
  playerCursedWithVulnerability: z.union([z.boolean(), z.number()]).optional(),
  playerCursedWithFlammability: z.union([z.boolean(), z.number()]).optional(),
  playerCursedWithFrostbite: z.union([z.boolean(), z.number()]).optional(),
  playerCursedWithTemporalChains: z.union([z.boolean(), z.number()]).optional(),
  playerCursedWithDespair: z.union([z.boolean(), z.number()]).optional(),
  playerCursedWithEnfeeble: z.union([z.boolean(), z.number()]).optional(),
  playerCursedWithWarlordsMark: z.union([z.boolean(), z.number()]).optional(),
  skillPartCalcs: z.number().finite().int().min(1).max(10).optional(),
  skillCount: z.number().finite().int().min(1).max(20).optional(),
  skillName: z.string().min(1).max(120).optional(),
  skillGroupIndex: z.number().finite().int().min(1).max(100).optional(),
  disableGems: z.array(z.string().min(1).max(120)).max(10).optional(),
  resetAllConditions: z.boolean().optional(),
}).strict();

export const engineRequestSchema = z.object({
  xml: z.string().min(1).max(2_000_000),
  scenario: scenarioConfigSchema.default({}),
}).strict();

export const engineResponseSchema = z.object({
  engine: z.object({ name: z.string(), version: z.string(), commit: z.string() }),
  calculated: z.boolean(),
  scenario: scenarioConfigSchema,
  selectedSkill: z.string().optional(),
  offence: z.record(z.string(), z.number().finite().nullable()),
  minion: z.record(z.string(), z.number().finite().nullable()).optional(),
  defence: z.record(z.string(), z.number().finite().nullable()),
  diagnostics: z.array(z.string()),
});

export type EngineRequest = z.infer<typeof engineRequestSchema>;
export type EngineResponse = z.infer<typeof engineResponseSchema>;
