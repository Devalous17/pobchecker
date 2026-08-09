import { z } from "zod";

export const scenarioConfigSchema = z.object({
  enemyIsBoss: z.boolean().optional(),
  usePowerCharges: z.boolean().optional(),
  useFrenzyCharges: z.boolean().optional(),
  useEnduranceCharges: z.boolean().optional(),
  conditionEnemyLowLife: z.boolean().optional(),
  conditionRecentlyKilled: z.boolean().optional(),
  buffOnslaught: z.boolean().optional(),
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
