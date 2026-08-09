import { z } from "zod";

const id = "[A-Za-z0-9_-]+";
export const supportedPobbUrl = z.string().trim().url().refine((value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "pobb.in" &&
      (new RegExp(`^/${id}/?$`).test(url.pathname) || new RegExp(`^/u/[^/]+/${id}/?$`).test(url.pathname));
  } catch { return false; }
}, "Use an https://pobb.in/{id} or https://pobb.in/u/{username}/{id} link.");

export function parsePobbUrl(value: string) {
  const url = new URL(supportedPobbUrl.parse(value));
  const parts = url.pathname.split("/").filter(Boolean);
  const buildId = parts.at(-1)!;
  return { buildId, rawUrl: `https://pobb.in/${parts.join("/")}/raw` };
}
