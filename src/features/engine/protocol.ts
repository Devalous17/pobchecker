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
  offence: z.record(z.string(), z.number().finite().nullable()),
  defence: z.record(z.string(), z.number().finite().nullable()),
  diagnostics: z.array(z.string()),
});

export type EngineRequest = z.infer<typeof engineRequestSchema>;
export type EngineResponse = z.infer<typeof engineResponseSchema>;
