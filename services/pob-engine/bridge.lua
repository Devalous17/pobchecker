-- JSONL bridge around the official Path of Building Community HeadlessWrapper.
-- This file is intentionally data-only: requests cannot execute Lua or choose files.
local json = require("dkjson")
dofile("HeadlessWrapper.lua")

local allowed = {
  enemyIsBoss = true, usePowerCharges = true, useFrenzyCharges = true,
  useEnduranceCharges = true, conditionEnemyLowLife = true,
  conditionKilledRecently = true, conditionRecentlyKilled = true,
  conditionUsingFlask = true, buffOnslaught = true, sigilOfPowerStages = true,
  frostShieldStages = true, arcaneCloakUsedRecentlyCheck = true,
  conditionEnemyShocked = true, conditionEnemyChilled = true,
  conditionSummonedTotemRecently = true, conditionShockEffect = true,
  conditionHaveTotem = true, conditionEnemyLightningExposure = true,
  conditionHitSpellRecently = true, conditionEnemyUnnerved = true,
  conditionTotemsHitSpellRecently = true, conditionFocused = true,
  conditionAttackedRecently = true, conditionEnemyChilledEffect = true,
  conditionUsedWarcryRecently = true, TotemsSummoned = true,
  conditionCastSpellRecently = true, buffArcaneSurge = true,
  infusedChannellingInfusion = true, overrideInspirationCharges = true,
  playerCursedWithElementalWeakness = true, playerCursedWithConductivity = true,
  playerCursedWithPunishment = true, playerCursedWithVulnerability = true,
  playerCursedWithFlammability = true, playerCursedWithFrostbite = true,
  playerCursedWithTemporalChains = true, playerCursedWithDespair = true,
  playerCursedWithEnfeeble = true, playerCursedWithWarlordsMark = true,
  skillPartCalcs = true,
  skillCount = true,
  skillName = true,
  skillGroupIndex = true,
  disableGems = true,
  resetAllConditions = true,
}

local function isAllowedValue(key, value)
  if key == "disableGems" then
    if type(value) ~= "table" or #value > 10 then return false end
    for _, name in ipairs(value) do if type(name) ~= "string" or #name < 1 or #name > 120 then return false end end
    return true
  end
  return (type(value) == "boolean" or type(value) == "number" or ((key == "enemyIsBoss" or key == "skillName") and type(value) == "string"))
end

local function disableGems(names)
  if type(names) ~= "table" or not build.skillsTab or not build.skillsTab.socketGroupList then return end
  local wanted = {}
  for _, name in ipairs(names) do wanted[string.lower(name)] = true end
  for _, socketGroup in ipairs(build.skillsTab.socketGroupList) do
    for _, gem in ipairs(socketGroup.gemList or {}) do
      local gemName = string.lower(gem.nameSpec or gem.name or "")
      if wanted[gemName] then gem.enabled = false end
    end
  end
end

-- Some exports (especially those copied from Poe.ninja) retain a stale
-- CalcsTab skill_number that points at the first utility setup. PoB itself
-- marks the intended damage setup with includeInFullDPS="true". Prefer that
-- explicit source-of-truth marker for scenario calculations.
local function selectImportedFullDpsGroup()
  if not build.skillsTab or not build.skillsTab.socketGroupList or not build.calcsTab then return nil end
  local function selectGroup(index)
    local socketGroup = build.skillsTab.socketGroupList[index]
    if not socketGroup or not socketGroup.enabled then return nil end
    build.mainSocketGroup = index
    socketGroup.includeInFullDPS = true
    build.calcsTab.input.skill_number = index
    socketGroup.mainActiveSkillCalcs = socketGroup.mainActiveSkill or socketGroup.mainActiveSkillCalcs or 1
    return index, (socketGroup.label and socketGroup.label ~= "" and socketGroup.label) or socketGroup.slot or tostring(index)
  end
  for index, socketGroup in ipairs(build.skillsTab.socketGroupList) do
    if socketGroup.enabled and socketGroup.includeInFullDPS then
      return selectGroup(index)
    end
  end
  -- Poe.ninja exports normally omit includeInFullDPS, but retain PoB's
  -- selected Build.mainSocketGroup and mainActiveSkill metadata.
  local importedMainGroup = tonumber(build.mainSocketGroup)
  if importedMainGroup then
    local selectedIndex, selectedLabel = selectGroup(importedMainGroup)
    if selectedIndex then return selectedIndex, selectedLabel end
  end
  return nil
end

local function setSelectedSkillPart(socketGroupIndex, skillPart, skillCount)
  if not socketGroupIndex or type(skillPart) ~= "number" then return nil end
  local socketGroup = build.skillsTab and build.skillsTab.socketGroupList and build.skillsTab.socketGroupList[socketGroupIndex]
  if not socketGroup then return end
  local activeSkillNumber = socketGroup.mainActiveSkillCalcs or socketGroup.mainActiveSkill or 1
  local activeCount = 0
  for _, gem in ipairs(socketGroup.gemList or {}) do
    local grantedEffect = gem.grantedEffect or (gem.gemData and gem.gemData.grantedEffect)
    if grantedEffect and not grantedEffect.support then
      activeCount = activeCount + 1
      if activeCount == activeSkillNumber then
        gem.skillPart = skillPart
        gem.skillPartCalcs = skillPart
        if type(skillCount) == "number" then gem.count = skillCount end
        return gem.nameSpec
      end
    end
  end
  return nil
end

-- Select an active gem already present in the imported PoB. This is deliberately
-- name-and-group based: callers cannot inject a new gem or arbitrary Lua, and
-- every calculation remains authoritative to the imported build data.
local function selectSkillByName(skillName, skillGroupIndex)
  if type(skillName) ~= "string" or skillName == "" or not build.skillsTab or not build.skillsTab.socketGroupList or not build.calcsTab then return nil end
  local wanted = string.lower(skillName)
  local firstIndex = tonumber(skillGroupIndex)
  local function inspect(index, socketGroup)
    if not socketGroup or not socketGroup.enabled then return nil end
    local activeSkillNumber = 0
    for _, gem in ipairs(socketGroup.gemList or {}) do
      local grantedEffect = gem.grantedEffect or (gem.gemData and gem.gemData.grantedEffect)
      if grantedEffect and not grantedEffect.support then
        activeSkillNumber = activeSkillNumber + 1
        local candidate = string.lower(gem.nameSpec or gem.name or "")
        if candidate == wanted then
          build.mainSocketGroup = index
          socketGroup.includeInFullDPS = true
          build.calcsTab.input.skill_number = index
          socketGroup.mainActiveSkillCalcs = activeSkillNumber
          socketGroup.mainActiveSkill = activeSkillNumber
          return index, (socketGroup.label and socketGroup.label ~= "" and socketGroup.label) or socketGroup.slot or tostring(index), gem.nameSpec or gem.name
        end
      end
    end
    return nil
  end
  if firstIndex then
    local index, label, gemName = inspect(firstIndex, build.skillsTab.socketGroupList[firstIndex])
    if index then return index, label, gemName end
  end
  for index, socketGroup in ipairs(build.skillsTab.socketGroupList) do
    local selectedIndex, selectedLabel, gemName = inspect(index, socketGroup)
    if selectedIndex then return selectedIndex, selectedLabel, gemName end
  end
  return nil
end

local function resetConditions(configSet)
  local input = configSet.input or {}
  for key, value in pairs(input) do
    local isCondition = key == "enemyIsBoss"
      or key:match("^[Cc]ondition")
      or key:match("^[Bb]uff")
      or key:match("^[Uu]se")
      or key:match("^[Oo]verride")
      or key:match("^[Mm]ultiplier")
      or key:match("[Ss]tages?$")
      or key:match("[Rr]ecently")
      or key:match("[Cc]ursed")
      or key:match("[Ee]xposure")
      or key:match("^playerCursed")
      or key:match("^map")
    if isCondition then
      if key == "enemyIsBoss" then input[key] = "None"
      elseif type(value) == "boolean" then input[key] = false
      elseif type(value) == "number" then input[key] = 0
      else input[key] = "None" end
    end
  end
  for _, customMod in pairs(configSet.customModsList or {}) do customMod.enabled = false end
end

local function numberOrNil(value)
  return type(value) == "number" and value or nil
end

local function outputNumber(output, ...)
  for index = 1, select("#", ...) do
    local value = output[select(index, ...)]
    if type(value) == "number" then return value end
  end
  return nil
end

local function maximumNumber(...)
  local maximum = nil
  for index = 1, select("#", ...) do
    local value = select(index, ...)
    if type(value) == "number" and (maximum == nil or value > maximum) then maximum = value end
  end
  return maximum
end

local function calculate(request)
  if type(request.xml) ~= "string" or #request.xml < 1 or #request.xml > 2000000 then error("invalid XML size") end
  loadBuildFromXML(request.xml, "PoB Reality Check")
  local selectedFullDpsIndex, selectedFullDpsGroup = selectImportedFullDpsGroup()
  local selectedSkillName
  if request.scenario and request.scenario.skillName then
    local selectedIndex, selectedLabel, gemName = selectSkillByName(request.scenario.skillName, request.scenario.skillGroupIndex)
    if selectedIndex then
      selectedFullDpsIndex = selectedIndex
      selectedFullDpsGroup = selectedLabel
      selectedSkillName = gemName
    end
  end
  local configSet = build.configTab and build.configTab.configSets and build.configTab.configSets[build.configTab.activeConfigSetId]
  local inputs = configSet and configSet.input or {}
  if request.scenario and request.scenario.resetAllConditions and configSet then resetConditions(configSet) end
  for key, value in pairs(request.scenario or {}) do
    if allowed[key] and isAllowedValue(key, value) then inputs[key] = value end
  end
  -- PoB renamed this input in current releases; accept the app's legacy alias too.
  if request.scenario and request.scenario.conditionRecentlyKilled ~= nil then
    inputs.conditionKilledRecently = request.scenario.conditionRecentlyKilled
  end
  local selectedSkillPartGem
  if request.scenario and request.scenario.skillPartCalcs ~= nil then
    selectedSkillPartGem = setSelectedSkillPart(selectedFullDpsIndex, request.scenario.skillPartCalcs, request.scenario.skillCount)
  end
  disableGems(request.scenario and request.scenario.disableGems)
  -- BuildModList turns the active config inputs into the modifier lists consumed
  -- by the calculation engine. Changing the XML-backed input table alone does
  -- not recalculate those lists.
  if build.configTab and build.configTab.BuildModList then
    build.configTab:BuildModList()
  end
  if not build.calcsTab then error("PoB calculation tab did not initialise") end
  build.calcsTab:BuildOutput()
  local output = build.calcsTab.mainOutput or {}
  local fireMaximumHit = outputNumber(output, "FireMaximumHitTaken")
  local coldMaximumHit = outputNumber(output, "ColdMaximumHitTaken")
  local lightningMaximumHit = outputNumber(output, "LightningMaximumHitTaken")
  local elementalMaximumHit = outputNumber(output, "ElementalMaximumHitTaken") or maximumNumber(fireMaximumHit, coldMaximumHit, lightningMaximumHit)
  local minionOutput = output.Minion or {}
  local minion = {}
  local hasMinionOutput = false
  local function copyMinion(key, value)
    if type(value) == "number" then
      minion[key] = value
      hasMinionOutput = true
    end
  end
  copyMinion("fullDPS", numberOrNil(minionOutput.FullDPS))
  copyMinion("combinedDPS", numberOrNil(minionOutput.CombinedDPS))
  copyMinion("totalDPS", numberOrNil(minionOutput.TotalDPS))
  copyMinion("totalDot", numberOrNil(minionOutput.TotalDot))
  copyMinion("averageDamage", numberOrNil(minionOutput.AverageDamage))
  copyMinion("speed", numberOrNil(minionOutput.Speed))
  copyMinion("attackSpeed", numberOrNil(minionOutput.AttackSpeed))
  copyMinion("castSpeed", numberOrNil(minionOutput.CastSpeed))
  local diagnostics = {
    "Calculated by the pinned Path of Building Community headless wrapper.",
  }
  if selectedFullDpsGroup then
    table.insert(diagnostics, "Selected imported Full DPS setup: " .. selectedFullDpsGroup)
  else
    table.insert(diagnostics, "No Full DPS or imported main socket group was found; PoB's imported skill selection was retained.")
  end
  if selectedSkillName then
    table.insert(diagnostics, "Selected active gem: " .. selectedSkillName)
  end
  if selectedSkillPartGem then
    table.insert(diagnostics, "Selected skill part " .. tostring(request.scenario.skillPartCalcs) .. " for " .. selectedSkillPartGem)
  end
  return {
    engine = { name = "Path of Building Community", version = tostring(build.xmlVersion or "unknown"), commit = os.getenv("POB_COMMIT") or "pinned" },
    calculated = true,
    scenario = request.scenario or {},
    offence = { fullDPS = numberOrNil(output.FullDPS), combinedDPS = numberOrNil(output.CombinedDPS), totalDPS = numberOrNil(output.TotalDPS), totalDot = numberOrNil(output.TotalDotDPS or output.TotalDot), averageDamage = numberOrNil(output.AverageDamage), speed = numberOrNil(output.Speed), attackSpeed = numberOrNil(output.AttackSpeed), castSpeed = numberOrNil(output.CastSpeed) },
    minion = hasMinionOutput and minion or nil,
    defence = {
      totalEHP = outputNumber(output, "TotalEHP"),
      life = outputNumber(output, "Life", "LifeTotal"),
      energyShield = outputNumber(output, "EnergyShield", "EnergyShieldTotal"),
      mana = outputNumber(output, "Mana", "ManaTotal"),
      armour = outputNumber(output, "Armour"),
      evasion = outputNumber(output, "Evasion", "EvasionRating"),
      block = outputNumber(output, "EffectiveBlockChance", "BlockChance"),
      spellBlock = outputNumber(output, "EffectiveSpellBlockChance", "SpellBlockChance"),
      spellSuppression = outputNumber(output, "SpellSuppressionChance", "SpellSuppression"),
      fireResistance = outputNumber(output, "FireResist", "FireResistance"),
      coldResistance = outputNumber(output, "ColdResist", "ColdResistance"),
      lightningResistance = outputNumber(output, "LightningResist", "LightningResistance"),
      chaosResistance = outputNumber(output, "ChaosResist", "ChaosResistance"),
      physicalMaximumHitTaken = outputNumber(output, "PhysicalMaximumHitTaken"),
      elementalMaximumHitTaken = elementalMaximumHit,
      fireMaximumHitTaken = fireMaximumHit,
      coldMaximumHitTaken = coldMaximumHit,
      lightningMaximumHitTaken = lightningMaximumHit,
      chaosMaximumHitTaken = outputNumber(output, "ChaosMaximumHitTaken"),
      lifeRegen = outputNumber(output, "LifeRegen", "LifeRegenRecovery"),
      energyShieldRegen = outputNumber(output, "EnergyShieldRegen", "EnergyShieldRegenRecovery"),
      manaRegen = outputNumber(output, "ManaRegen", "ManaRegenRecovery"),
    },
    diagnostics = diagnostics,
  }
end

for line in io.lines() do
  local request = json.decode(line)
  local ok, result = pcall(calculate, request)
  if ok then print(json.encode(result)) else print(json.encode({ error = tostring(result) })) end
  io.stdout:flush()
end
