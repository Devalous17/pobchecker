import { parsePobbUrl } from "./url";
import { examplePobFixture } from "./example-fixture";

const MAX_BYTES = 2_000_000;
const TIMEOUT_MS = 8_000;
export class ImportError extends Error { constructor(public code: string, message: string) { super(message); } }

export async function fetchPobRaw(input: string, fetcher: typeof fetch = fetch) {
  const { buildId, rawUrl } = parsePobbUrl(input);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetcher(rawUrl, { signal: controller.signal, headers: { "User-Agent": "PoB-Reality-Check/0.1 (build-analysis tool)" } });
    if (!response.ok) throw new ImportError("upstream", `pobb.in returned ${response.status}. The build may be private or unavailable.`);
    const length = Number(response.headers.get("content-length") ?? 0);
    if (length > MAX_BYTES) throw new ImportError("too_large", "The build export is larger than the permitted limit.");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.length) throw new ImportError("empty", "The build export was empty.");
    if (bytes.byteLength > MAX_BYTES) throw new ImportError("too_large", "The build export is larger than the permitted limit.");
    return { buildId, raw: new TextDecoder().decode(bytes), fixture: false };
  } catch (error) {
    if (error instanceof ImportError) throw error;
    if ((error as Error).name === "AbortError") throw new ImportError("timeout", "pobb.in did not respond within the time limit.");
    const detail = error instanceof Error ? ` (${error.message})` : "";
    if (buildId === "0oChNQNO2-dg") return { buildId, raw: examplePobFixture, fixture: true };
    throw new ImportError("network", `The build could not be retrieved right now.${detail}`);
  }
  finally { clearTimeout(timer); }
}
