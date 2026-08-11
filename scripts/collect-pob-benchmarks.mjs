#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import zlib from "node:zlib";
import process from "node:process";
import { XMLParser } from "fast-xml-parser";

const DEFAULT_OUTPUT = path.resolve("data/benchmarks/normalized.jsonl");
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  trimValues: true,
});

const asArray = (value) => (value == null ? [] : Array.isArray(value) ? value : [value]);
const attr = (node, name) => node?.[`@_${name}`];
const numberOrNull = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

function isSupportGem(gem) {
  return ["isSupport", "support"].some((key) => attr(gem, key) === "true" || attr(gem, key) === "1");
}

function isInactiveGem(gem) {
  return ["enabled", "active"].some((key) => attr(gem, key) === "false" || attr(gem, key) === "0")
    || ["triggered", "trigger"].some((key) => attr(gem, key) === "true" || attr(gem, key) === "1");
}

function gemName(gem) {
  return String(attr(gem, "nameSpec") || attr(gem, "name") || "").trim();
}

function activeGems(skill) {
  return asArray(skill?.Gem)
    .filter((gem) => gemName(gem) && !isSupportGem(gem) && !isInactiveGem(gem))
    .map(gemName);
}

function deliveryProfile(mainSkill, setupText) {
  const text = `${mainSkill} ${setupText}`.toLowerCase();
  const patterns = [
    ["totem/ballista", /totem|ballista/],
    ["minion/summon", /summon|minion|spectre|animate|golem|herald/],
    ["trap", /trap/],
    ["mine", /mine/],
    ["brand", /brand/],
    ["channelled", /channel|infused channelling/],
    ["attack", /attack|strike|slam|melee|bow|barrage|wander/],
    ["spell", /spell|cast|orb|bolt|nova|blast|storm|reap|exsanguinate/],
  ];
  return patterns.find(([, pattern]) => pattern.test(text))?.[0] || "unknown";
}

function decodeExport(input) {
  const raw = input.trim();
  if (raw.includes("<PathOfBuilding")) return raw;

  const compact = raw.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = compact.padEnd(Math.ceil(compact.length / 4) * 4, "=");
  const encoded = Buffer.from(padded, "base64");
  const decoders = [zlib.inflateRawSync, zlib.inflateSync, zlib.gunzipSync];
  for (const decode of decoders) {
    try {
      const xml = decode(encoded).toString("utf8");
      if (xml.includes("<PathOfBuilding")) return xml;
    } catch {
      // Try the next compatible PoB export format.
    }
  }
  throw new Error("not a Path of Building export");
}

function extractCode(raw) {
  if (raw.includes("<PathOfBuilding")) return raw;
  const match = raw.replace(/\s+/g, " ").match(/eNrt[A-Za-z0-9+/_=-]+/);
  return match?.[0] || raw.trim();
}

function chooseMainSkill(build, skillSetups) {
  const fullDpsSource = String(attr(build.FullDPSSkill, "source") || "").trim();
  const activeNames = skillSetups.flatMap(({ active }) => active);
  if (fullDpsSource) {
    const match = activeNames.find((name) => fullDpsSource.toLowerCase().includes(name.toLowerCase()));
    if (match) return { name: match, evidence: "FullDPSSkill" };
  }

  for (const evidence of ["includeInFullDPS", "mainActiveSkill"]) {
    for (const { skill } of skillSetups) {
      if (attr(skill, evidence) === "true" || attr(skill, evidence) === "1") {
        const match = activeGems(skill)[0];
        if (match) return { name: match, evidence };
      }
    }
  }

  return { name: activeNames[0] || null, evidence: activeNames.length ? "first-active-gem" : "unknown" };
}

function normalize(source, rawInput) {
  const code = extractCode(rawInput);
  const xml = decodeExport(code);
  const root = parser.parse(xml).PathOfBuilding;
  const build = root?.Build || {};
  const skillSetups = asArray(root?.Skills?.SkillSet).flatMap((set) => asArray(set.Skill).map((skill) => ({
    skill,
    gems: asArray(skill.Gem).map(gemName).filter(Boolean),
    active: activeGems(skill),
  })));
  const main = chooseMainSkill(build, skillSetups);
  const mainSetup = skillSetups.find(({ active }) => active.includes(main.name)) || skillSetups[0];
  const activeSkills = [...new Set(skillSetups.flatMap(({ active }) => active))];
  const setupText = skillSetups.map(({ gems }) => gems.join(" ")).join(" ");
  const stats = Object.fromEntries(asArray(build.PlayerStat).map((stat) => [attr(stat, "stat"), numberOrNull(attr(stat, "value"))]));
  const stableHash = crypto.createHash("sha256").update(xml).digest("hex");
  const importedDps = stats.FullDPS || stats.CombinedDPS || stats.TotalDPS || stats.TotalDotDPS || stats.TotalDot || stats.HitDPS || 0;

  return {
    schemaVersion: 1,
    hash: stableHash,
    source,
    identity: {
      name: attr(build, "name") || null,
      className: attr(build, "className") || null,
      ascendancy: attr(build, "ascendClassName") || null,
      level: numberOrNull(attr(build, "level")),
      version: attr(build, "targetVersion") || attr(build, "version") || null,
    },
    mainSkill: main.name,
    mainSkillEvidence: main.evidence,
    delivery: deliveryProfile(main.name || "", mainSetup?.gems?.join(" ") || setupText),
    deliverySource: "inferred",
    activeSkills,
    metrics: {
      importedDps,
      fullDps: stats.FullDPS || 0,
      hitDps: stats.TotalDPS || stats.HitDPS || 0,
      combinedDps: stats.CombinedDPS || 0,
      dotDps: stats.TotalDotDPS || stats.TotalDot || 0,
      totalEhp: stats.TotalEHP || 0,
      speed: stats.Speed || 0,
    },
    labels: { clear: null, bossing: null, defence: null },
  };
}

function collectFiles(inputs) {
  const files = [];
  for (const input of inputs) {
    if (!fs.existsSync(input)) continue;
    const stat = fs.statSync(input);
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(input, { withFileTypes: true })) {
        if (entry.isFile() && /\.(txt|pob|xml)$/i.test(entry.name)) files.push(path.join(input, entry.name));
      }
    } else {
      files.push(input);
    }
  }
  return files;
}

function parseArgs(argv) {
  const inputs = [];
  let output = DEFAULT_OUTPUT;
  let dryRun = false;
  let deliveryOverride = null;
  for (const arg of argv) {
    if (arg === "--dry-run") dryRun = true;
    else if (arg.startsWith("--output=")) output = path.resolve(arg.slice("--output=".length));
    else if (arg.startsWith("--delivery=")) deliveryOverride = arg.slice("--delivery=".length).trim() || null;
    else inputs.push(path.resolve(arg));
  }
  return { inputs, output, dryRun, deliveryOverride };
}

const { inputs, output, dryRun, deliveryOverride } = parseArgs(process.argv.slice(2));
if (!inputs.length) {
  console.error("Usage: node scripts/collect-pob-benchmarks.mjs <file-or-folder> [...] [--dry-run] [--output=path]");
  process.exit(1);
}

const files = collectFiles(inputs);
const records = [];
const errors = [];
for (const file of files) {
  try {
    const record = normalize(path.relative(process.cwd(), file), fs.readFileSync(file, "utf8"));
    if (deliveryOverride) {
      record.delivery = deliveryOverride;
      record.deliverySource = "user-confirmed";
    }
    records.push(record);
  } catch (error) {
    errors.push({ file, error: error instanceof Error ? error.message : String(error) });
  }
}

const unique = [...new Map(records.map((record) => [record.hash, record])).values()];
const existing = !dryRun && fs.existsSync(output)
  ? fs.readFileSync(output, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line))
  : [];
const merged = [...new Map([...existing, ...unique].map((record) => [record.hash, record])).values()];

if (!dryRun) {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${merged.map((record) => JSON.stringify(record)).join("\n")}\n`, "utf8");
}

console.log(JSON.stringify({ files: files.length, decoded: records.length, unique: unique.length, totalRecords: merged.length, output: dryRun ? null : output, errors, groups: Object.fromEntries([...new Set(unique.map((record) => record.delivery))].map((delivery) => [delivery, unique.filter((record) => record.delivery === delivery).length])) }, null, 2));
