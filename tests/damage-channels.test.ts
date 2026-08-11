import { describe, expect, it } from "vitest";
import { discoverDamageChannels } from "../src/features/pob/channels";
import type { SkillSetup } from "../src/types/domain";

const setup = (name: string, detail = "Active skill", extra: Partial<SkillSetup["gems"][number]> = {}): SkillSetup => ({
  id: name, label: name, enabled: true, includeInFullDPS: false, gems: [{ name, attributeColor: "unknown", detail, support: false, trigger: false, provided: false, enabled: true, includeInFullDPS: false, ...extra }],
});

describe("universal damage channels", () => {
  it("classifies delivery and damage families without a skill-specific rule", () => {
    const channels = discoverDamageChannels([
      setup("Fireball"), setup("Righteous Fire", "damage over time"), setup("Skeleton Mage"), setup("Ballista Totem"), setup("Seismic Trap"), setup("Ice Mine"), setup("Armageddon Brand"),
    ]);
    expect(channels.map((channel) => channel.kind)).toEqual(["unknown", "damage-over-time", "minion", "totem", "trap", "mine", "brand"]);
  });

  it("preserves exported secondary-part and count evidence", () => {
    const [channel] = discoverDamageChannels([setup("Secondary Burst", "Active skill", { skillPart: 2, skillCount: 4 })]);
    expect(channel).toMatchObject({ kind: "secondary", skillPart: 2, skillCount: 4, confidence: "Medium" });
  });
});
