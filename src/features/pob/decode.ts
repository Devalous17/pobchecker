import { gunzipSync, inflateRawSync, inflateSync } from "node:zlib";

export function decodePobExport(input: string): string {
  const text = input.trim();
  if (text.startsWith("<PathOfBuilding")) return text;
  let bytes: Buffer;
  try {
    const normalized = text.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(text.length / 4) * 4, "=");
    bytes = Buffer.from(normalized, "base64");
  } catch { throw new Error("The PoB export is not valid base64."); }
  if (!bytes.length) throw new Error("The PoB export was empty.");
  const candidates = [() => inflateRawSync(bytes), () => inflateSync(bytes), () => gunzipSync(bytes)];
  for (const decode of candidates) { try { const xml = decode().toString("utf8"); if (xml.includes("<PathOfBuilding")) return xml; } catch { /* try next format */ } }
  throw new Error("The export could not be decoded as a PoB XML export.");
}
