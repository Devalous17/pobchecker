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
      const body = await response.json().catch(() => null) as { engineReady?: unknown; diagnostics?: unknown } | null;
      if (!response.ok || body?.engineReady !== true) {
        const diagnostic = Array.isArray(body?.diagnostics) && typeof body.diagnostics[0] === "string" ? body.diagnostics[0] : `The PoB worker responded with HTTP ${response.status}.`;
        return { state: "unreachable", message: `The PoB worker is not ready: ${diagnostic}` };
      }
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
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: unknown } | null;
    const detail = typeof body?.error === "string" ? body.error : `HTTP ${response.status}`;
    throw new Error(`The PoB worker rejected the calculation request: ${detail}`);
  }
  try {
    return engineResponseSchema.parse(await response.json());
  } catch {
    throw new Error("The PoB worker returned an invalid calculation response.");
  }
}
