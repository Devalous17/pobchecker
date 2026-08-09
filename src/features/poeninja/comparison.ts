import type { PoeNinjaComparison } from "@/src/types/domain";

const allowedHosts = new Set(["poe.ninja", "www.poe.ninja"]);
const profilePattern = /^\/poe1\/(?:builds\/([^/]+)\/character\/([^/]+)\/([^/?#]+)|profile\/([^/]+)\/character\/([^/?#]+))\/?$/i;

export function parsePoeNinjaCharacterUrl(value: string) {
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new Error("Enter a valid Poe.ninja character URL."); }
  if (parsed.protocol !== "https:" || !allowedHosts.has(parsed.hostname.toLowerCase())) throw new Error("Only HTTPS Poe.ninja character URLs are supported.");
  const match = parsed.pathname.match(profilePattern);
  if (!match) throw new Error("Use a Poe.ninja PoE 1 character URL.");
  return { url: parsed.toString(), league: match[1], account: match[2] ?? match[4], character: match[3] ?? match[5] };
}

function meta(html: string, name: string) {
  return html.match(new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']*)["']`, "i"))?.[1] ?? "";
}

export async function fetchPoeNinjaComparison(value: string, fetcher: typeof fetch = fetch): Promise<PoeNinjaComparison> {
  const identity = parsePoeNinjaCharacterUrl(value);
  const response = await fetcher(identity.url, { headers: { "User-Agent": "PoB-Reality-Check/0.1 (+https://pob-reality-check.com)" }, signal: AbortSignal.timeout(7000) });
  if (!response.ok) throw new Error(`Poe.ninja returned ${response.status} for this character.`);
  const html = (await response.text()).slice(0, 2_000_000);
  const description = meta(html, "description");
  const level = Number(description.match(/level\s+(\d+)/i)?.[1]);
  const className = description.match(/level\s+\d+\s+(.+?)\s+in\s+the\s+/i)?.[1];
  return {
    ...identity,
    level: Number.isFinite(level) ? level : undefined,
    className,
    source: "poe-ninja",
    diagnostics: ["Poe.ninja character page resolved.", "Poe.ninja does not expose a stable documented PoE 1 character JSON endpoint for third-party comparison; numeric snapshot fields remain unavailable unless a supported public payload is present."],
  };
}
