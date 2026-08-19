import type { NormalizedBuild } from "@/src/types/domain";
import localRegistry from "@/data/pob-unique-items.json";

type UniqueRecord = (typeof localRegistry.items)[number];
const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
const byName = new Map<string, UniqueRecord>(localRegistry.items.map((item) => [item.normalizedName, item]));

/** Adds PoB's local unique modifiers to imported items before archetype detection. */
export function enrichPoBUniqueMetadata(build: NormalizedBuild): NormalizedBuild {
  const equippedItems = build.equippedItems.map((item) => {
    const record = byName.get(normalize(item.name));
    if (!record) return item;
    const existing = item.text.trim();
    const missing = record.modifiers.filter((modifier) => !existing.includes(modifier.replace(/^\{[^}]+\}/, "")));
    const text = [...new Set([existing, ...missing].filter(Boolean))].join(" ");
    return {
      ...item,
      baseType: item.baseType || record.baseType,
      text,
      rarity: item.rarity || "Unique",
    };
  });
  return { ...build, equippedItems };
}

export function getLocalUniqueRecord(name: string) {
  return byName.get(normalize(name));
}
