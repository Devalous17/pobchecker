import { describe, expect, it } from "vitest";
import { parsePobXml } from "../src/features/pob/parse";

describe("PoB skill and equipment import", () => {
  it("uses the exported FullDPSSkill as the primary build skill", () => {
    const build = parsePobXml(`<PathOfBuilding><Build><FullDPSSkill source="Righteous Fire"/></Build><Skills><SkillSet id="1"><Skill slot="Helmet"><Gem nameSpec="Herald of Ash" name="Herald of Ash"/></Skill></SkillSet><SkillSet id="2"><Skill slot="Body Armour"><Gem nameSpec="Righteous Fire" name="Righteous Fire"/></Skill></SkillSet></Skills></PathOfBuilding>`);
    expect(build.mainSkill).toBe("Righteous Fire");
  });

  it("uses PoB's mainActiveSkill flag when FullDPSSkill is absent", () => {
    const build = parsePobXml(`<PathOfBuilding><Build><PlayerStat stat="TotalDPS" value="0"/><PlayerStat stat="TotalDotDPS" value="14768527"/></Build><Skills><SkillSet id="1"><Skill slot="Helmet"><Gem nameSpec="Herald of Ash" name="Herald of Ash"/></Skill><Skill slot="Body Armour" mainActiveSkill="1"><Gem nameSpec="Righteous Fire" name="Righteous Fire"/></Skill></SkillSet></Skills></PathOfBuilding>`);
    expect(build.mainSkill).toBe("Righteous Fire");
    expect(build.skillSetups.find((setup) => setup.mainActiveSkill)?.label).toBe("Body Armour");
    expect(build.importedStats.totalDotDps).toBe(14768527);
  });

  it("prefers the setup marked for Full DPS over a stale utility FullDPSSkill value", () => {
    const build = parsePobXml(`<PathOfBuilding><Build><FullDPSSkill source="1x Decoy Totem"/></Build><Skills><SkillSet id="1"><Skill slot="Weapon 2"><Gem nameSpec="Decoy Totem" name="Decoy Totem"/></Skill><Skill slot="Body Armour" includeInFullDPS="true"><Gem nameSpec="Storm Burst of Repulsion" name="Storm Burst"/></Skill></SkillSet></Skills></PathOfBuilding>`);
    expect(build.mainSkill).toBe("Storm Burst of Repulsion");
  });

  it("uses FullDPSSkill stat when the export leaves source empty", () => {
    const build = parsePobXml(`<PathOfBuilding><Build><FullDPSSkill stat="4x Storm Burst of Repulsion" source="" /></Build><Skills><SkillSet id="1"><Skill slot="Weapon 2"><Gem nameSpec="Decoy Totem" name="Decoy Totem" /></Skill><Skill slot="Body Armour"><Gem nameSpec="Storm Burst of Repulsion" name="Storm Burst" /></Skill></SkillSet></Skills></PathOfBuilding>`);
    expect(build.mainSkill).toBe("Storm Burst of Repulsion");
  });

  it("preserves linked gem setup metadata instead of flattening skills", () => {
    const build = parsePobXml(`<PathOfBuilding><Build level="90"/><Skills><SkillSet id="1"><Skill enabled="true" includeInFullDPS="true" slot="Body Armour"><Gem nameSpec="Arcane Cloak" name="Arcane Cloak" level="20" quality="23" colour="B"/><Gem nameSpec="Inspiration" name="Inspiration" level="20" quality="20" colour="G" isSupport="true"/></Skill></SkillSet></Skills></PathOfBuilding>`);
    expect(build.skillSetups).toHaveLength(1);
    expect(build.skillSetups[0]).toMatchObject({ label: "Body Armour", slot: "Body Armour", includeInFullDPS: true });
    expect(build.skillSetups[0].gems[0]).toMatchObject({ name: "Arcane Cloak", level: 20, quality: 23, attributeColor: "int", support: false });
    expect(build.skillSetups[0].gems[1]).toMatchObject({ name: "Inspiration", quality: 20, attributeColor: "dex", support: true });
    expect(build.skillSetups[0].engineIndex).toBe(1);
  });

  it("preserves imported skill part and minion count metadata", () => {
    const build = parsePobXml(`<PathOfBuilding><Build/><Skills><SkillSet id="1"><Skill slot="Helmet" mainActiveSkill="1"><Gem nameSpec="Summon Skeletons" name="Summon Skeletons" skillPart="2" count="6"/></Skill></SkillSet></Skills></PathOfBuilding>`);
    expect(build.skillSetups[0].gems[0]).toMatchObject({ name: "Summon Skeletons", skillPart: 2, skillCount: 6 });
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

  it("keeps PoB defensive and recovery stats typed for relevant-state display", () => {
    const build = parsePobXml(`<PathOfBuilding><Build><PlayerStat stat="Life" value="4000"/><PlayerStat stat="EnergyShield" value="1200"/><PlayerStat stat="Armour" value="8500"/><PlayerStat stat="Evasion" value="0"/><PlayerStat stat="LifeRegen" value="125.5"/><PlayerStat stat="LifeLeechRate" value="250"/><PlayerStat stat="EnergyShieldRegen" value="30"/><PlayerStat stat="ManaRegen" value="42"/><PlayerStat stat="ManaLeechRate" value="18"/><PlayerStat stat="EffectiveBlockChance" value="67"/><PlayerStat stat="EffectiveSpellBlockChance" value="75"/></Build></PathOfBuilding>`);
    expect(build.importedStats).toMatchObject({ life: 4000, energyShield: 1200, armour: 8500, lifeRegen: 125.5, lifeLeechRate: 250, energyShieldRegen: 30, manaRegen: 42, manaLeechRate: 18, block: 67, spellBlock: 75 });
    expect(build.importedStats.evasion).toBe(0);
  });
});
