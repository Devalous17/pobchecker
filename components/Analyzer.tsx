"use client";

import { useEffect, useState } from "react";
import type { EngineStatus } from "@/src/features/engine/client";

type Evidence = { kind: string; label: string; detail: string };
type Condition = { id: string; displayName: string; category: string; reliability: string; confidence: string; explanation: string; sourceDetected: boolean; activationRequirement: string; statsAffected: string[]; evidence: Evidence[] };
type Asset = { category: string; name: string; detail: string; iconUrl?: string; attributeColor: string };
type Gem = { name: string; displayName?: string; level?: number; quality?: number; attributeColor: string; detail: string; iconUrl?: string; support: boolean; trigger: boolean; provided: boolean; enabled: boolean; includeInFullDPS: boolean };
type SkillSetup = { id: string; label: string; slot?: string; enabled: boolean; includeInFullDPS: boolean; gems: Gem[] };
type EquippedItem = { id?: string; slot: string; name: string; rarity?: string; baseType?: string; text: string; iconUrl?: string; corrupted?: boolean; links?: string; isFlask: boolean };
type Comparison = { url: string; account?: string; character?: string; league?: string; level?: number; className?: string; source: string; diagnostics: string[] };
type PassiveNode = { id?: string; name: string; type: string; allocated: boolean; x?: number; y?: number; links?: string[] };
type Stats = Record<string, number | string | undefined>;
type Metric = { value: number | null; status: string; confidence: string };
type Timeline = { id: string; label: string; durationSeconds: number; dps: number | null; source: string; assumptions: string[] };
type ScenarioResult = Record<string, Metric> & { timeline?: Timeline[] };
type Report = {
  build: { identity: { name: string; level?: number; className?: string; ascendancy?: string; version?: string }; skills: string[]; items: string[]; sections: string[]; rawXml: string; sources: { category: string; name: string; detail: string }[]; sourceAssets: Asset[]; skillSetups: SkillSetup[]; equippedItems: EquippedItem[]; importedStats: Stats; passiveNodes: PassiveNode[]; treeGraph?: PassiveNode[] };
  conditions: Condition[]; confidence: string; audit: { persistent: number; conditional: number; unverified: number; status: string }; honesty: { score: number; label: string; explanation: string; factors: { label: string; points: number; explanation: string }[] }; topNotables: PassiveNode[]; sourceSummary: { gems: number; items: number; flasks: number; passives: number; ascendancies: number }; recommendations: { title: string; detail: string; conditionId: string }[]; warnings: string[]; assumptions: string[];
};

const example = "https://pobb.in/0oChNQNO2-dg";
const compactNumber = (value: unknown) => {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Unavailable";
  const absolute = Math.abs(value);
  const compact = (amount: number, suffix: string) => `${amount.toFixed(amount >= 100 ? 0 : amount >= 10 ? 1 : 2).replace(/\.0+$|(?<=\.[0-9])0+$/, "")}${suffix}`;
  if (absolute >= 1_000_000_000) return compact(value / 1_000_000_000, "b");
  if (absolute >= 1_000_000) return compact(value / 1_000_000, "m");
  if (absolute >= 1_000) return compact(value / 1_000, "k");
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
};
const percent = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}%` : "Unavailable";

export function Analyzer() {
  const [url, setUrl] = useState(() => typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("build") ?? "" : "");
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function analyze() {
    setLoading(true); setError(""); setReport(null);
    try { const res = await fetch("/api/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url }) }); const body = await res.json(); if (!res.ok) throw new Error(body.error); window.history.replaceState({}, "", `/?build=${encodeURIComponent(url)}`); setReport(body); }
    catch (e) { setError(e instanceof Error ? e.message : "Analysis failed."); }
    finally { setLoading(false); }
  }
  return <>{!report ? <section className="hero"><p className="eyebrow">A second opinion for your PoB numbers</p><h2>Make the <span>conditions</span> visible.</h2><p>Import a Path of Building link and see which parts of the displayed build are sourced, temporary, situational, ramp-dependent—or still unknown.</p><div className="input-row"><label className="sr-only" htmlFor="pob-url">pobb.in URL</label><input id="pob-url" className="url-input" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://pobb.in/..." onKeyDown={e => { if (e.key === "Enter") void analyze(); }} /><button className="button" onClick={() => void analyze()} disabled={loading || !url.trim()}>{loading ? "Reading build…" : "Analyze build"}</button></div><button className="example" onClick={() => setUrl(example)}>Try the example build →</button>{error && <div className="error" role="alert">{error}</div>}<p className="privacy">Only supported pobb.in links are fetched. Results are analysis estimates, not gameplay guarantees.</p></section> : <ReportView report={report} onReset={() => { setReport(null); window.history.replaceState({}, "", "/"); }} />}</>;
}

function ReportView({ report, onReset }: { report: Report; onReset: () => void }) {
  const identity = report.build.identity;
  const rawXml = typeof report.build.rawXml === "string" ? report.build.rawXml : "Raw XML was not returned by the importer. The structured report may be incomplete.";
  const offence = report.conditions.filter(c => c.category === "offence" || c.category === "both");
  const defence = report.conditions.filter(c => c.category === "defence" || c.category === "both");
  return <section className="report">
    <div className="report-head"><div><p className="eyebrow">Honesty build checker</p><h2>{identity.name}</h2><p className="muted">{[identity.className, identity.ascendancy, identity.level && `Level ${identity.level}`, identity.version && `PoB ${identity.version}`].filter(Boolean).join(" · ") || "Identity fields available in export"}</p></div><div className="honesty-score"><span>HONESTY</span><strong>{report.honesty.score}<small>/10</small></strong><em>{report.honesty.label}</em></div></div>
    <div className="grid"><div className="card"><h3>Honesty rating</h3><div className="value">{report.honesty.score}/10</div><div className="metric-note">{report.honesty.explanation}</div></div><div className="card"><h3>Visible conditionals</h3><div className="value">{report.conditions.length}</div><div className="metric-note">{report.audit.persistent} persistent · {report.audit.conditional} conditional · {report.audit.unverified} unverified kept in audit</div></div><div className="card"><h3>Calculation status</h3><div className="value">{report.build.importedStats.source === "pob-calcs" ? "Imported" : "Worker required"}</div><div className="metric-note">Imported PoB snapshot values are shown now. Alternate scenarios require the isolated Headless PoB worker.</div></div></div>
    <ScenarioPanel xml={report.build.rawXml} stats={report.build.importedStats} />
    <CombatSnapshot stats={report.build.importedStats} />
    <TreePreview report={report} />
    <SourceInventory assets={report.build.sourceAssets} skillSetups={report.build.skillSetups} equippedItems={report.build.equippedItems} summary={report.sourceSummary} />
    <PoeNinjaComparisonPanel />
    <div className="section columns"><ConditionGroup title="Offensive conditions" items={offence} /><ConditionGroup title="Defensive conditions" items={defence} /></div>
    <div className="section columns"><div className="card"><h3>Recommendations</h3>{report.recommendations.length ? <ul className="list">{report.recommendations.map(r => <li key={r.conditionId}><strong>{r.title}:</strong> {r.detail}</li>)}</ul> : <p className="muted">No evidence-backed findings yet.</p>}</div><div className="card"><h3>Why this rating</h3>{report.honesty.factors.length ? <ul className="list">{report.honesty.factors.map(f => <li key={f.label}><strong>{f.points}:</strong> {f.label}</li>)}</ul> : <p className="muted">No score deductions were found in the imported condition set.</p>}</div></div>
    <div className="section columns"><div className="card"><h3>Warnings</h3><ul className="list">{report.warnings.map(x => <li key={x}>{x}</li>)}</ul></div><div className="card"><h3>Assumptions</h3><ul className="list">{report.assumptions.map(x => <li key={x}>{x}</li>)}</ul></div></div>
    <details className="diagnostics"><summary>Show raw diagnostic details</summary><pre>{rawXml.slice(0, 12000)}</pre></details><button className="example" onClick={onReset}>← Analyze another build</button>
  </section>;
}

function CombatSnapshot({ stats }: { stats: Stats }) {
  const values: [string, unknown, string, string][] = [
    ["Full PoB DPS", stats.fullDps, "dps", "Imported FullDPS"],
    ["Hit DPS", stats.totalDps, "dps", "PoB TotalDPS for the configured skill"],
    ["Average hit", stats.averageHit, "dps", "Imported AverageHit"],
    ["Life", stats.life, "value", "Imported character stat"],
    ["Effective hit pool", stats.effectiveHealthPool, "value", "Imported TotalEHP"],
    ["Chance to block", stats.block, "percent", "Imported EffectiveBlockChance"],
    ["Chance to spell block", stats.spellBlock, "percent", "Imported EffectiveSpellBlockChance"],
    ["Spell suppression", stats.spellSuppression, "percent", "Additional defensive stat when present"],
  ];
  return <div className="section card"><div className="external-header"><div><h3>Imported PoB stats</h3><p className="muted">Numbers are compacted for readability. Values are shown only when PoB exported them or the worker returned them.</p></div><span className={`source-badge ${stats.source === "pob-calcs" ? "source-live" : "source-offline"}`}>{stats.source === "pob-calcs" ? "POB CALCS" : "NOT IN EXPORT"}</span></div><div className="stat-grid">{values.map(([label, value, kind, note]) => <div className="stat-tile" key={label}><span>{label}</span><strong>{kind === "percent" ? percent(value) : compactNumber(value)}</strong><small>{typeof value === "number" ? note : "Unavailable without calculation engine"}</small></div>)}</div></div>;
}

function PoeNinjaComparisonPanel() {
  const [url, setUrl] = useState(""); const [comparison, setComparison] = useState<Comparison | null>(null); const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
  async function compare() { setLoading(true); setError(""); setComparison(null); try { const response = await fetch("/api/poe-ninja", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url }) }); const body = await response.json(); if (!response.ok) throw new Error(body.error); setComparison(body); } catch (e) { setError(e instanceof Error ? e.message : "Poe.ninja comparison failed."); } finally { setLoading(false); } }
  return <div className="section card"><div className="external-header"><div><h3>Poe.ninja comparison</h3><p className="muted">Provide the exact public character URL when you want a population snapshot. The site never guesses a character from a pobb.in link.</p></div><a className="text-link" href="https://poe.ninja/poe1/builds" target="_blank" rel="noreferrer">Open Poe.ninja ↗</a></div><div className="comparison-input"><label htmlFor="poe-ninja-url">Poe.ninja character URL</label><div><input id="poe-ninja-url" className="url-input" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://poe.ninja/poe1/builds/.../character/..." onKeyDown={(event) => { if (event.key === "Enter") void compare(); }} /><button className="button" onClick={() => void compare()} disabled={loading || !url.trim()}>{loading ? "Reading…" : "Compare"}</button></div></div>{error && <p className="engine-status"><strong>Comparison unavailable:</strong> {error}</p>}{comparison && <div className="comparison-result"><div><strong>{comparison.character ?? "Character"}</strong><span>{[comparison.account, comparison.className, comparison.level && `Level ${comparison.level}`, comparison.league].filter(Boolean).join(" · ")}</span></div>{comparison.diagnostics.map((diagnostic) => <small key={diagnostic}>{diagnostic}</small>)}</div>}</div>;
}

function TreePreview({ report }: { report: Report }) {
  const nodes = report.build.passiveNodes;
  const graph = report.build.treeGraph?.length ? report.build.treeGraph : nodes;
  const positioned = graph.filter(node => Number.isFinite(node.x) && Number.isFinite(node.y));
  const minX = positioned.length ? Math.min(...positioned.map(node => node.x as number)) : 0;
  const maxX = positioned.length ? Math.max(...positioned.map(node => node.x as number)) : 1;
  const minY = positioned.length ? Math.min(...positioned.map(node => node.y as number)) : 0;
  const maxY = positioned.length ? Math.max(...positioned.map(node => node.y as number)) : 1;
  const nodeById = new Map(graph.map(node => [node.id, node]));
  const locate = (node: PassiveNode, index: number) => ({ left: positioned.length ? ((node.x! - minX) / Math.max(maxX - minX, 1)) * 86 + 7 : 50 + Math.cos(index / Math.max(graph.length, 1) * Math.PI * 2) * 36, top: positioned.length ? ((node.y! - minY) / Math.max(maxY - minY, 1)) * 78 + 11 : 50 + Math.sin(index / Math.max(graph.length, 1) * Math.PI * 2) * 36 });
  const locations = new Map(graph.map((node, index) => [node.id ?? node.name, locate(node, index)]));
  const links = graph.flatMap(node => (node.links ?? []).flatMap(linkId => { const target = nodeById.get(linkId); if (!target || !node.id || node.id > linkId) return []; const from = locations.get(node.id); const to = locations.get(linkId); if (!from || !to) return []; const dx = to.left - from.left; const dy = to.top - from.top; return [{ key: `${node.id}-${linkId}`, left: from.left, top: from.top, length: Math.sqrt(dx * dx + dy * dy), angle: Math.atan2(dy, dx) * 180 / Math.PI, allocated: node.allocated && target.allocated }]; }));
  return <div className="section card"><div className="external-header"><div><h3>Passive tree preview</h3><p className="muted">The full PoB tree is shown in the background; allocated nodes and paths are highlighted. Hover a node to see its imported name and type.</p></div><span className="source-badge source-live">{nodes.length} ALLOCATED</span></div><div className="tree-layout"><div className="tree-canvas" aria-label="Full passive tree preview">{links.map(link => <span key={link.key} className={`tree-link ${link.allocated ? "tree-link-allocated" : ""}`} style={{ left: `${link.left}%`, top: `${link.top}%`, width: `${link.length}%`, transform: `rotate(${link.angle}deg)` }} />)}{graph.map((node, index) => { const point = locations.get(node.id ?? node.name)!; return <button type="button" key={`${node.id ?? node.name}-${index}`} className={`tree-point tree-point-${node.type} ${node.allocated ? "tree-point-allocated" : ""}`} style={{ left: `${point.left}%`, top: `${point.top}%` }} title={`${node.name} · ${node.type}${node.allocated ? " · allocated" : ""}`} aria-label={`${node.name}, ${node.type}${node.allocated ? ", allocated" : ""}`}><span>{node.type === "ascendancy" ? "A" : node.type === "keystone" ? "K" : node.type === "notable" ? "N" : "·"}</span></button>; })}{!graph.length && <p className="muted tree-empty">No passive tree data was found in this export.</p>}</div><div className="notable-list">{report.topNotables.length ? report.topNotables.map(node => <div key={node.name}><span className={`node-dot ${node.type}`}></span><strong>{node.name}</strong><small>{node.type} · contribution requires controlled engine comparison</small></div>) : <p className="muted">No named notables were found in the imported tree.</p>}</div></div></div>;
}

function SourceInventory({ assets, skillSetups, equippedItems, summary }: { assets: Asset[]; skillSetups: SkillSetup[]; equippedItems: EquippedItem[]; summary: Report["sourceSummary"] }) {
  const tree = assets.filter(asset => asset.category === "passive" || asset.category === "ascendancy");
  return <div className="section card"><div className="external-header"><div><h3>Build sources</h3><p className="muted">PoB-native skill links and active item slots are shown as imported. poe.ninja artwork is optional enrichment only.</p></div><div className="source-pills"><span>Gems {summary.gems}</span><span>Items {summary.items}</span><span>Flasks {summary.flasks}</span><span>Tree {summary.passives + summary.ascendancies}</span></div></div><SkillSetupPanel setups={skillSetups} /><EquipmentPanel items={equippedItems} /><InventoryGroup title="Passive and ascendancy sources" assets={tree} /></div>;
}

function SkillSetupPanel({ setups }: { setups: SkillSetup[] }) {
  return <div className="inventory-group skill-setups"><h4>Skill gems</h4>{setups.length ? <div className="skill-setup-list">{setups.map((setup) => <div className="skill-setup" key={setup.id}><div className="skill-setup-header"><div><strong>{setup.label}</strong>{setup.slot && <small>{setup.slot}</small>}</div><div className="setup-badges">{setup.includeInFullDPS && <span className="setup-badge setup-badge-main">FULL DPS</span>}{!setup.enabled && <span className="setup-badge">DISABLED</span>}</div></div><div className="gem-list">{setup.gems.map((gem, index) => <details className="gem-row" key={`${setup.id}-${gem.name}-${index}`}><summary><span className={`gem-icon gem-${gem.attributeColor}`}>{gem.iconUrl ? <img src={gem.iconUrl} alt="" /> : <span>◆</span>}</span><span className={`gem-name gem-text-${gem.attributeColor}`}>{gem.displayName ?? gem.name}<small>{gem.name !== gem.displayName ? gem.name : ""}</small></span><span className="gem-tags">{gem.support && <i>Support</i>}{gem.trigger && <i>Trigger</i>}{gem.provided && <i>Provided</i>}{gem.level !== undefined && <b>{gem.level}{gem.quality !== undefined ? ` / ${gem.quality}` : ""}</b>}</span></summary><div className="gem-detail"><strong>{gem.displayName ?? gem.name}</strong><span>{gem.detail}</span><span>{gem.enabled ? "Enabled in imported setup" : "Disabled in imported setup"}</span></div></details>)}</div></div>)}</div> : <p className="muted">No linked skill setups were found in this export.</p>}</div>;
}

function EquipmentPanel({ items }: { items: EquippedItem[] }) {
  const equipment = items.filter((item) => !item.isFlask);
  const flasks = items.filter((item) => item.isFlask);
  return <div className="inventory-group equipment-panel"><h4>Equipment and flasks</h4>{items.length ? <><div className="equipment-subtitle">Equipped items</div><div className="equipment-grid">{equipment.map((item, index) => <EquipmentCard item={item} key={`item-${item.id ?? item.name}-${index}`} />)}</div><div className="equipment-subtitle">Flasks</div><div className="equipment-grid equipment-grid-flasks">{flasks.map((item, index) => <EquipmentCard item={item} key={`flask-${item.id ?? item.name}-${index}`} />)}</div></> : <p className="muted">No active equipment slots were found in this export.</p>}</div>;
}

function EquipmentCard({ item }: { item: EquippedItem }) {
  return <details className="equipment-card"><summary><div className="equipment-art">{item.iconUrl ? <img src={item.iconUrl} alt="" /> : <span>{item.isFlask ? "◈" : "✦"}</span>}</div><div className="equipment-copy"><small>{item.slot}</small><strong>{item.name}</strong><span>{[item.rarity, item.baseType, item.links && `${item.links} links`].filter(Boolean).join(" · ") || "Imported PoB item"}</span></div></summary><div className="equipment-detail"><span>{item.corrupted ? "Corrupted" : "Uncorrupted or not marked"}</span><p>{item.text || "No item text was included in the export."}</p></div></details>;
}

function InventoryGroup({ title, assets }: { title: string; assets: Asset[] }) { return <div className="inventory-group"><h4>{title}</h4>{assets.length ? <div className="asset-grid">{assets.map((asset, index) => <div className="asset-card" key={`${asset.category}-${asset.name}-${index}`}><div className={`asset-icon asset-${asset.attributeColor}`}>{asset.iconUrl ? <img src={asset.iconUrl} alt="" /> : <span>{asset.category === "gem" ? "◆" : asset.category === "flask" ? "◈" : "✦"}</span>}</div><div><strong className={`asset-name asset-text-${asset.attributeColor}`}>{asset.name}</strong><small>{asset.category} · {asset.detail}</small></div></div>)}</div> : <p className="muted">No imported {title.toLowerCase()}.</p>}</div>; }

function ConditionGroup({ title, items }: { title: string; items: Condition[] }) { return <div className="card"><h3>{title}</h3>{items.length ? items.map(c => <details className="condition" key={c.id}><summary><span><span className="condition-name">{c.displayName}</span><span className="condition-sub">{c.sourceDetected ? "Source evidence found" : "Source unverified"}</span></span><span className={`tag ${c.sourceDetected ? "tag-good" : "tag-unknown"}`}>{c.reliability} · {c.confidence}</span></summary><p>{c.explanation}</p><p className="requirement"><strong>Requires:</strong> {c.activationRequirement}</p><p className="requirement"><strong>Affects:</strong> {c.statsAffected.join(", ")}</p><div className="evidence-list">{c.evidence.map((e, index) => <div className="evidence" key={`${e.label}-${index}`}><span>{e.kind}</span><div><strong>{e.label}</strong><small>{e.detail}</small></div></div>)}</div></details>) : <p className="muted">No configured conditions detected in this category.</p>}</div>; }

function ScenarioPanel({ xml, stats }: { xml: string; stats: Stats }) {
  const [loading, setLoading] = useState(false); const [result, setResult] = useState<ScenarioResult | null>(null); const [error, setError] = useState(""); const [encounterSeconds, setEncounterSeconds] = useState(30); const [engineStatus, setEngineStatus] = useState<EngineStatus | null>(null);
  useEffect(() => { let active = true; void fetch("/api/engine/status").then(response => response.json()).then(body => { if (active) setEngineStatus(body as EngineStatus); }).catch(() => { if (active) setEngineStatus({ state: "unreachable", message: "The worker status could not be checked." }); }); return () => { active = false; }; }, []);
  async function run() { setLoading(true); setError(""); try { const response = await fetch("/api/scenarios", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ xml, encounterSeconds }) }); const body = await response.json(); if (!response.ok) { if (body.engine) setEngineStatus(body.engine as EngineStatus); throw new Error(body.error); } setResult(body); setEngineStatus({ state: "ready", message: "The isolated Path of Building worker is ready." }); } catch (e) { setError(e instanceof Error ? e.message : "Scenario calculation unavailable."); } finally { setLoading(false); } }
  const labels: [string, string][] = [["configured", "Conditional DPS (configured)"], ["peak", "Highest valid DPS"], ["burst", "Realistic burst DPS"], ["initial", "Initial boss DPS"], ["sustained", "Sustained boss DPS"], ["mapping", "Mapping DPS"]];
  const workerReady = engineStatus?.state === "ready";
  const workerLabel = engineStatus === null ? "Checking worker…" : workerReady ? "Worker ready" : engineStatus.state === "not-configured" ? "Worker not configured" : "Worker offline";
  return <div className="section card"><div className="scenario-header"><div><div className="scenario-title-row"><h3>Combat scenarios</h3><span className={`engine-state engine-state-${engineStatus?.state ?? "checking"}`}>{workerLabel}</span></div><p className="muted">The imported PoB snapshot is exact. Alternate states appear only after the authoritative Headless PoB worker recalculates them.</p></div><div className="scenario-actions"><label>Encounter seconds<input className="duration-input" type="number" min="1" max="300" value={encounterSeconds} onChange={e => setEncounterSeconds(Number(e.target.value) || 30)} /></label><button className="button scenario-button" onClick={() => void run()} disabled={loading || !workerReady}>{loading ? "Calculating…" : workerReady ? "Run scenarios" : "Worker required"}</button></div></div><div className="scenario-grid scenario-snapshot"><div className="scenario-metric"><span>Imported Full DPS</span><strong>{compactNumber(stats.fullDps)}</strong><small>Exact PoB export snapshot</small></div><div className="scenario-metric"><span>Imported Hit DPS</span><strong>{compactNumber(stats.totalDps)}</strong><small>Exact configured TotalDPS</small></div><div className="scenario-metric"><span>Unconditional DPS</span><strong>Unavailable</strong><small>Requires a recalculation with conditional inputs disabled</small></div></div>{engineStatus && !workerReady && <div className="engine-setup" role="status"><strong>Alternate scenarios are paused.</strong><span>{engineStatus.message}</span><small>For local analysis, start the isolated PoB worker, then set <code>POB_ENGINE_URL=http://127.0.0.1:8080</code> before starting the website. The hosted website also needs a separately deployed worker endpoint; it cannot run LuaJIT inside the web page.</small></div>}{error && <p className="engine-status"><strong>Scenario request failed:</strong> {error}</p>}<div className="scenario-grid">{labels.map(([id, label]) => { const metric = result?.[id]; return <div className="scenario-metric" key={id}><span>{label}</span><strong>{metric?.value === null || metric?.value === undefined ? "Unavailable" : compactNumber(metric.value)}</strong><small>{metric ? `${metric.status} · ${metric.confidence} confidence` : "Requires the authoritative PoB worker"}</small></div>; })}</div>{result?.timeline?.length ? <div className="scenario-timeline"><h4>Encounter timeline</h4>{result.timeline.map((state) => <div className="timeline-row" key={state.id}><span>{state.label}</span><b>{state.durationSeconds.toFixed(1)}s</b><strong>{compactNumber(state.dps)}</strong><small>{state.assumptions.join(" ")}</small></div>)}</div> : null}</div>;
}
