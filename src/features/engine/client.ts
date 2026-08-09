import { engineRequestSchema, engineResponseSchema, type EngineRequest, type EngineResponse } from "./protocol";

export type EngineStatus = {
  state: "ready" | "not-configured" | "unreachable";
  message: string;
};

export class EngineUnavailableError extends Error {
  readonly state: Exclude<EngineStatus["state"], "ready">;

  constructor(message: string, state: Exclude<EngineStatus["state"], "ready">) {
    super(message);
    this.name = "EngineUnavailableError";
    this.state = state;
  }
}

const engineUrl = () => process.env.POB_ENGINE_URL?.trim().replace(/\/$/, "") || "";

export async function getEngineStatus(fetcher: typeof fetch = fetch): Promise<EngineStatus> {
  const url = engineUrl();
  if (!url) return { state: "not-configured", message: "The isolated Path of Building worker is not configured for this environment." };
  try {
    const response = await fetcher(`${url}/health`, { method: "GET", signal: AbortSignal.timeout(3_000) });
    if (!response.ok) return { state: "unreachable", message: `The PoB worker responded with HTTP ${response.status}.` };
    return { state: "ready", message: "The isolated Path of Building worker is ready." };
  } catch {
    return { state: "unreachable", message: "The PoB worker endpoint is configured, but it did not respond." };
  }
}

export async function calculateWithEngine(input: EngineRequest, fetcher: typeof fetch = fetch): Promise<EngineResponse> {
  const request = engineRequestSchema.parse(input);
  const url = engineUrl();
  if (!url) throw new EngineUnavailableError("The isolated Path of Building worker is not configured for this environment.", "not-configured");

  let response: Response;
  try {
    response = await fetcher(`${url}/calculate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request), signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new EngineUnavailableError("The PoB worker endpoint is configured, but it did not respond to the calculation request.", "unreachable");
  }
  if (!response.ok) throw new EngineUnavailableError(`The PoB worker returned HTTP ${response.status} for the calculation request.`, "unreachable");
  try {
    return engineResponseSchema.parse(await response.json());
  } catch {
    throw new EngineUnavailableError("The PoB worker returned an invalid calculation response.", "unreachable");
  }
}
