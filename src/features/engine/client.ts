import { engineRequestSchema, engineResponseSchema, type EngineRequest, type EngineResponse } from "./protocol";

export class EngineUnavailableError extends Error {}

export async function calculateWithEngine(input: EngineRequest, fetcher: typeof fetch = fetch): Promise<EngineResponse> {
  const request = engineRequestSchema.parse(input);
  const url = process.env.POB_ENGINE_URL;
  if (!url) throw new EngineUnavailableError("The Headless PoB engine is not configured. Phase 3 service foundation is installed, but no engine worker is running.");
  const response = await fetcher(`${url.replace(/\/$/, "")}/calculate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request), signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new EngineUnavailableError(`The Headless PoB engine returned ${response.status}.`);
  return engineResponseSchema.parse(await response.json());
}
