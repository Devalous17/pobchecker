import { describe, expect, it } from "vitest";
import { parsePobXml } from "../src/features/pob/parse";

describe("PoB skill and equipment import", () => {
  it("preserves linked gem setup metadata instead of flattening skills", () => {
    const build = parsePobXml(`<PathOfBuilding><Build level="90"/><Skills><SkillSet id="1"><Skill enabled="true" includeInFullDPS="true" slot="Body Armour"><Gem nameSpec="Arcane Cloak" name="Arcane Cloak" level="20" quality="23" colour="B"/><Gem nameSpec="Inspiration" name="Inspiration" level="20" quality="20" colour="G" isSupport="true"/></Skill></SkillSet></Skills></PathOfBuilding>`);
    expect(build.skillSetups).toHaveLength(1);
    expect(build.skillSetups[0]).toMatchObject({ label: "Body Armour", slot: "Body Armour", includeInFullDPS: true });
    expect(build.skillSetups[0].gems[0]).toMatchObject({ name: "Arcane Cloak", level: 20, quality: 23, attributeColor: "int", support: false });
    expect(build.skillSetups[0].gems[1]).toMatchObject({ name: "Inspiration", quality: 20, attributeColor: "dex", support: true });
  });

  it("imports only active item-set slots and separates flasks", () => {
    const build = parsePobXml(`<PathOfBuilding><Build/><Items activeItemSet="2"><Item id="helmet" name="The Crown" rarity="UNIQUE" baseType="Regicide Mask">Rarity: UNIQUE\nThe Crown</Item><Item id="flask" name="Diamond Flask" baseType="Diamond Flask"/><ItemSet id="1"><Slot name="Helmet" itemId="helmet"/></ItemSet><ItemSet id="2"><Slot name="Helmet" itemId="helmet"/><Slot name="Flask 1" itemId="flask"/></ItemSet></Items></PathOfBuilding>`);
    expect(build.equippedItems).toHaveLength(2);
    expect(build.equippedItems[0]).toMatchObject({ slot: "Helmet", name: "The Crown", isFlask: false, rarity: "UNIQUE", baseType: "Regicide Mask" });
    expect(build.equippedItems[1]).toMatchObject({ slot: "Flask 1", name: "Diamond Flask", isFlask: true });
    expect(build.sourceAssets.filter((asset) => asset.category === "item")).toHaveLength(1);
    expect(build.sourceAssets.filter((asset) => asset.category === "flask")).toHaveLength(1);
  });

  it("ignores active slots that reference a missing item instead of crashing", () => {
    const build = parsePobXml(`<PathOfBuilding><Build/><Items activeItemSet="1"><ItemSet id="1"><Slot name="Body Armour" itemId="missing"/></ItemSet></Items></PathOfBuilding>`);
    expect(build.equippedItems).toEqual([]);
  });
});
