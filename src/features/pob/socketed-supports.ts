import type { NormalizedBuild, SkillSetup } from "@/src/types/domain";

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

function supportLines(text: string) {
  return text.split(/\r?\n/).map((line) => line.trim()).filter((line) => /supported by/i.test(line));
}

/**
 * Finds support gems supplied by equipped-item modifiers. These are not
 * represented as ordinary Gem rows, so raw socket counts under-report the
 * effective link (especially for rare gloves and support rings).
 */
export function externalSupportEvidence(build: NormalizedBuild, setup: SkillSetup): string[] {
  const targetSlot = normalize(setup.slot ?? "");
  if (!targetSlot) return [];
  const evidence = build.equippedItems.flatMap((item) => {
    const lines = supportLines(item.text);
    if (!lines.length) return [];
    const direct = normalize(item.slot) === targetSlot && lines.some((line) => /socketed (?:gems|spells|skills).*supported by/i.test(line));
    const targeted = lines.some((line) => {
      const match = line.match(/skills? socketed in (?:your )?([a-z ]+?)\s+(?:are|is) supported by/i);
      return match ? normalize(match[1]) === targetSlot : false;
    });
    return direct || targeted ? lines : [];
  });
  return [...new Set(evidence)];
}

export function enrichSocketedSupportEvidence(build: NormalizedBuild): NormalizedBuild {
  const skillSetups = build.skillSetups.map((setup) => {
    const external = externalSupportEvidence(build, setup);
    const socketedGems = setup.gems.filter((gem) => gem.enabled && !gem.provided).length;
    return { ...setup, externalSupportEvidence: external, effectiveLinkCount: socketedGems + external.length };
  });
  return { ...build, skillSetups };
}
