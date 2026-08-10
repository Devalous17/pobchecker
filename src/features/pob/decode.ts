import { gunzipSync, inflateRawSync, inflateSync } from "node:zlib";

const MAX_INPUT_CHARS = 3_000_000;
const MAX_XML_BYTES = 8_000_000;

export function decodePobExport(input: string): string {
  const text = input.trim();
  if (text.length > MAX_INPUT_CHARS) throw new Error("The PoB import is larger than the permitted limit.");
  if (text.startsWith("<PathOfBuilding")) return text;
  let bytes: Buffer;
  try {
    const encoded = text.replace(/\s+/g, "");
    const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(encoded.length / 4) * 4, "=");
    bytes = Buffer.from(normalized, "base64");
  } catch { throw new Error("The PoB export is not valid base64."); }
  if (!bytes.length) throw new Error("The PoB export was empty.");
  const options = { maxOutputLength: MAX_XML_BYTES };
  const candidates = [() => inflateRawSync(bytes, options), () => inflateSync(bytes, options), () => gunzipSync(bytes, options)];
  for (const decode of candidates) { try { const xml = decode().toString("utf8"); if (xml.includes("<PathOfBuilding")) return xml; } catch { /* try next format */ } }
  throw new Error("The export could not be decoded as a PoB XML export.");
}
