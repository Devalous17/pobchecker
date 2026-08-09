-- JSONL bridge around the official Path of Building Community HeadlessWrapper.
-- This file is intentionally data-only: requests cannot execute Lua or choose files.
local json = require("dkjson")
dofile("HeadlessWrapper.lua")

local allowed = {
  enemyIsBoss = true, usePowerCharges = true, useFrenzyCharges = true,
  useEnduranceCharges = true, conditionEnemyLowLife = true,
  conditionRecentlyKilled = true, buffOnslaught = true, sigilOfPowerStages = true,
  frostShieldStages = true, arcaneCloakUsedRecentlyCheck = true,
  conditionEnemyShocked = true, conditionEnemyChilled = true,
}

local function numberOrNil(value)
  return type(value) == "number" and value or nil
end

local function calculate(request)
  if type(request.xml) ~= "string" or #request.xml < 1 or #request.xml > 2000000 then error("invalid XML size") end
  loadBuildFromXML(request.xml, "PoB Reality Check")
  local configSet = build.configTab and build.configTab.configSets and build.configTab.configSets[build.configTab.activeConfigSetId]
  local inputs = configSet and configSet.input or {}
  for key, value in pairs(request.scenario or {}) do
    if allowed[key] and (type(value) == "boolean" or type(value) == "number") then inputs[key] = value end
  end
  build.calcsTab:BuildOutput()
  local output = build.calcsTab.mainOutput or {}
  return {
    engine = { name = "Path of Building Community", version = tostring(build.xmlVersion or "unknown"), commit = os.getenv("POB_COMMIT") or "pinned" },
    calculated = true,
    scenario = request.scenario or {},
    offence = { fullDPS = numberOrNil(output.FullDPS), totalDPS = numberOrNil(output.TotalDPS), totalDot = numberOrNil(output.TotalDot), averageDamage = numberOrNil(output.AverageDamage), speed = numberOrNil(output.Speed) },
    defence = { totalEHP = numberOrNil(output.TotalEHP), physicalMaximumHitTaken = numberOrNil(output.PhysicalMaximumHitTaken), elementalMaximumHitTaken = numberOrNil(output.ElementalMaximumHitTaken), chaosMaximumHitTaken = numberOrNil(output.ChaosMaximumHitTaken) },
    diagnostics = {},
  }
end

for line in io.lines() do
  local request = json.decode(line)
  local ok, result = pcall(calculate, request)
  if ok then print(json.encode(result)) else print(json.encode({ error = tostring(result) })) end
  io.stdout:flush()
end
