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
  resetAllConditions = true,
}

local function isAllowedValue(key, value)
  return (type(value) == "boolean" or type(value) == "number" or (key == "enemyIsBoss" and type(value) == "string"))
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

local function calculate(request)
  if type(request.xml) ~= "string" or #request.xml < 1 or #request.xml > 2000000 then error("invalid XML size") end
  loadBuildFromXML(request.xml, "PoB Reality Check")
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
  -- BuildModList turns the active config inputs into the modifier lists consumed
  -- by the calculation engine. Changing the XML-backed input table alone does
  -- not recalculate those lists.
  if build.configTab and build.configTab.BuildModList then
    build.configTab:BuildModList()
  end
  if not build.calcsTab then error("PoB calculation tab did not initialise") end
  build.calcsTab:BuildOutput()
  local output = build.calcsTab.mainOutput or {}
  return {
    engine = { name = "Path of Building Community", version = tostring(build.xmlVersion or "unknown"), commit = os.getenv("POB_COMMIT") or "pinned" },
    calculated = true,
    scenario = request.scenario or {},
    offence = { fullDPS = numberOrNil(output.FullDPS), totalDPS = numberOrNil(output.TotalDPS), totalDot = numberOrNil(output.TotalDot), averageDamage = numberOrNil(output.AverageDamage), speed = numberOrNil(output.Speed) },
    defence = { totalEHP = numberOrNil(output.TotalEHP), physicalMaximumHitTaken = numberOrNil(output.PhysicalMaximumHitTaken), elementalMaximumHitTaken = numberOrNil(output.ElementalMaximumHitTaken), chaosMaximumHitTaken = numberOrNil(output.ChaosMaximumHitTaken) },
    diagnostics = { "Calculated by the pinned Path of Building Community headless wrapper." },
  }
end

for line in io.lines() do
  local request = json.decode(line)
  local ok, result = pcall(calculate, request)
  if ok then print(json.encode(result)) else print(json.encode({ error = tostring(result) })) end
  io.stdout:flush()
end
