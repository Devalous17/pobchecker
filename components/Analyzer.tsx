"use client";

import { useState } from "react";

type Evidence = { kind: string; label: string; detail: string };
type Condition = { id: string; displayName: string; category: string; reliability: string; confidence: string; explanation: string; sourceDetected: boolean; activationRequirement: string; statsAffected: string[]; evidence: Evidence[] };
type Asset = { category: string; name: string; detail: string; iconUrl?: string; attributeColor: string };
type PassiveNode = { id?: string; name: string; type: string; allocated: boolean; x?: number; y?: number; links?: string[] };
type Stats = Record<string, number | string | undefined>;
type Metric = { value: number | null; status: string; confidence: string };
type Report = {
  build: { identity: { name: string; level?: number; className?: string; ascendancy?: string; version?: string }; skills: string[]; items: string[]; sections: string[]; rawXml: string; sources: { category: string; name: string; detail: string }[]; sourceAssets: Asset[]; importedStats: Stats; passiveNodes: PassiveNode[] };
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
  const offence = report.conditions.filter(c => c.category === "offence" || c.category === "both");
  const defence = report.conditions.filter(c => c.category === "defence" || c.category === "both");
  return <section className="report">
    <div className="report-head"><div><p className="eyebrow">Honesty build checker</p><h2>{identity.name}</h2><p className="muted">{[identity.className, identity.ascendancy, identity.level && `Level ${identity.level}`, identity.version && `PoB ${identity.version}`].filter(Boolean).join(" · ") || "Identity fields available in export"}</p></div><div className="honesty-score"><span>HONESTY</span><strong>{report.honesty.score}<small>/10</small></strong><em>{report.honesty.label}</em></div></div>
    <div className="grid"><div className="card"><h3>Honesty rating</h3><div className="value">{report.honesty.score}/10</div><div className="metric-note">{report.honesty.explanation}</div></div><div className="card"><h3>Visible conditionals</h3><div className="value">{report.conditions.length}</div><div className="metric-note">{report.audit.persistent} persistent · {report.audit.conditional} conditional · {report.audit.unverified} unverified kept in audit</div></div><div className="card"><h3>Calculation status</h3><div className="value">{report.build.importedStats.source === "pob-calcs" ? "Imported" : "Worker required"}</div><div className="metric-note">Imported PoB snapshot values are shown now. Alternate scenarios require the isolated Headless PoB worker.</div></div></div>
    <CombatSnapshot stats={report.build.importedStats} />
    <TreePreview report={report} />
    <SourceInventory assets={report.build.sourceAssets} summary={report.sourceSummary} />
    <div className="section card"><div className="external-header"><div><h3>Poe.ninja comparison</h3><p className="muted">Poe.ninja can be useful as a population reference, but its displayed DPS is not a substitute for this build’s controlled PoB scenarios.</p></div><a className="text-link" href="https://poe.ninja/poe1/builds" target="_blank" rel="noreferrer">Open Poe.ninja ↗</a></div><div className="comparison-callout"><span className="comparison-mark">?</span><div><strong>Character snapshot not automatically matched</strong><span>A pobb.in link does not contain a Poe.ninja account or character identity. We will only compare a profile when you explicitly provide one—we never guess the match.</span></div></div></div>
    <ScenarioPanel xml={report.build.rawXml} stats={report.build.importedStats} />
    <div className="section columns"><ConditionGroup title="Offensive conditions" items={offence} /><ConditionGroup title="Defensive conditions" items={defence} /></div>
    <div className="section columns"><div className="card"><h3>Recommendations</h3>{report.recommendations.length ? <ul className="list">{report.recommendations.map(r => <li key={r.conditionId}><strong>{r.title}:</strong> {r.detail}</li>)}</ul> : <p className="muted">No evidence-backed findings yet.</p>}</div><div className="card"><h3>Why this rating</h3>{report.honesty.factors.length ? <ul className="list">{report.honesty.factors.map(f => <li key={f.label}><strong>{f.points}:</strong> {f.label}</li>)}</ul> : <p className="muted">No score deductions were found in the imported condition set.</p>}</div></div>
    <div className="section columns"><div className="card"><h3>Warnings</h3><ul className="list">{report.warnings.map(x => <li key={x}>{x}</li>)}</ul></div><div className="card"><h3>Assumptions</h3><ul className="list">{report.assumptions.map(x => <li key={x}>{x}</li>)}</ul></div></div>
    <details className="diagnostics"><summary>Show raw diagnostic details</summary><pre>{report.build.rawXml.slice(0, 12000)}</pre></details><button className="example" onClick={onReset}>← Analyze another build</button>
  </section>;
}

function CombatSnapshot({ stats }: { stats: Stats }) {
  const values: [string, unknown, string, string][] = [
    ["Full PoB DPS", stats.fullDps, "dps", "Imported FullDPS"],
    ["Hit DPS", stats.totalDps, "dps", "PoB TotalDPS for the configured skill"],
    ["Average DPS", stats.averageDps, "dps", "Only shown when PoB exports AverageDPS"],
    ["Average hit", stats.averageHit, "dps", "Imported AverageHit"],
    ["Life", stats.life, "value", "Imported character stat"],
    ["Effective hit pool", stats.effectiveHealthPool, "value", "Imported TotalEHP"],
    ["Chance to block", stats.block, "percent", "Imported EffectiveBlockChance"],
    ["Chance to spell block", stats.spellBlock, "percent", "Imported EffectiveSpellBlockChance"],
    ["Spell suppression", stats.spellSuppression, "percent", "Additional defensive stat when present"],
  ];
  return <div className="section card"><div className="external-header"><div><h3>Imported PoB stats</h3><p className="muted">Numbers are compacted for readability. Values are shown only when PoB exported them or the worker returned them.</p></div><span className={`source-badge ${stats.source === "pob-calcs" ? "source-live" : "source-offline"}`}>{stats.source === "pob-calcs" ? "POB CALCS" : "NOT IN EXPORT"}</span></div><div className="stat-grid">{values.map(([label, value, kind, note]) => <div className="stat-tile" key={label}><span>{label}</span><strong>{kind === "percent" ? percent(value) : compactNumber(value)}</strong><small>{typeof value === "number" ? note : kind === "dps" && label === "Average DPS" ? "No separate AverageDPS field was exported" : "Unavailable without calculation engine"}</small></div>)}</div></div>;
}

function TreePreview({ report }: { report: Report }) {
  const nodes = report.build.passiveNodes;
  const positioned = nodes.filter(node => Number.isFinite(node.x) && Number.isFinite(node.y));
  const minX = positioned.length ? Math.min(...positioned.map(node => node.x as number)) : 0;
  const maxX = positioned.length ? Math.max(...positioned.map(node => node.x as number)) : 1;
  const minY = positioned.length ? Math.min(...positioned.map(node => node.y as number)) : 0;
  const maxY = positioned.length ? Math.max(...positioned.map(node => node.y as number)) : 1;
  const nodeById = new Map(nodes.map(node => [node.id, node]));
  const locate = (node: PassiveNode, index: number) => ({ left: positioned.length ? ((node.x! - minX) / Math.max(maxX - minX, 1)) * 86 + 7 : 50 + Math.cos(index / Math.max(nodes.length, 1) * Math.PI * 2) * 36, top: positioned.length ? ((node.y! - minY) / Math.max(maxY - minY, 1)) * 78 + 11 : 50 + Math.sin(index / Math.max(nodes.length, 1) * Math.PI * 2) * 36 });
  const locations = new Map(nodes.map((node, index) => [node.id ?? node.name, locate(node, index)]));
  const links = nodes.flatMap(node => (node.links ?? []).flatMap(linkId => { const target = nodeById.get(linkId); if (!target || !node.id || node.id > linkId) return []; const from = locations.get(node.id); const to = locations.get(linkId); if (!from || !to) return []; const dx = to.left - from.left; const dy = to.top - from.top; return [{ key: `${node.id}-${linkId}`, left: from.left, top: from.top, length: Math.sqrt(dx * dx + dy * dy), angle: Math.atan2(dy, dx) * 180 / Math.PI }]; }));
  return <div className="section card"><div className="external-header"><div><h3>Passive tree preview</h3><p className="muted">This is the allocated PoB tree, positioned from the official PoB tree data. Hover a node to see its imported name and type.</p></div><span className="source-badge source-live">{nodes.length} NODES</span></div><div className="tree-layout"><div className="tree-canvas" aria-label="Allocated passive tree preview">{links.map(link => <span key={link.key} className="tree-link" style={{ left: `${link.left}%`, top: `${link.top}%`, width: `${link.length}%`, transform: `rotate(${link.angle}deg)` }} />)}{nodes.map((node, index) => { const point = locations.get(node.id ?? node.name)!; return <button type="button" key={`${node.id ?? node.name}-${index}`} className={`tree-point tree-point-${node.type}`} style={{ left: `${point.left}%`, top: `${point.top}%` }} title={`${node.name} · ${node.type}`} aria-label={`${node.name}, ${node.type}`}><span>{node.type === "ascendancy" ? "A" : node.type === "keystone" ? "K" : node.type === "notable" ? "N" : "·"}</span></button>; })}{!nodes.length && <p className="muted tree-empty">No allocated tree nodes were found in this export.</p>}</div><div className="notable-list">{report.topNotables.length ? report.topNotables.map(node => <div key={node.name}><span className={`node-dot ${node.type}`}></span><strong>{node.name}</strong><small>{node.type} · contribution requires controlled engine comparison</small></div>) : <p className="muted">No named notables were found in the imported tree.</p>}</div></div></div>;
}

function SourceInventory({ assets, summary }: { assets: Asset[]; summary: Report["sourceSummary"] }) {
  const gems = assets.filter(asset => asset.category === "gem");
  const equipment = assets.filter(asset => asset.category === "item" || asset.category === "flask");
  const tree = assets.filter(asset => asset.category === "passive" || asset.category === "ascendancy");
  return <div className="section card"><div className="external-header"><div><h3>Source inventory</h3><p className="muted">Equipment, skill gems, and passive sources are separated so the damage setup is easy to audit.</p></div><div className="source-pills"><span>Gems {summary.gems}</span><span>Items {summary.items}</span><span>Flasks {summary.flasks}</span><span>Tree {summary.passives + summary.ascendancies}</span></div></div><InventoryGroup title="Skill gems" assets={gems} /><InventoryGroup title="Equipment and flasks" assets={equipment} /><InventoryGroup title="Passive and ascendancy sources" assets={tree} /></div>;
}

function InventoryGroup({ title, assets }: { title: string; assets: Asset[] }) { return <div className="inventory-group"><h4>{title}</h4>{assets.length ? <div className="asset-grid">{assets.map((asset, index) => <div className="asset-card" key={`${asset.category}-${asset.name}-${index}`}><div className={`asset-icon asset-${asset.attributeColor}`}>{asset.iconUrl ? <img src={asset.iconUrl} alt="" /> : <span>{asset.category === "gem" ? "◆" : asset.category === "flask" ? "◈" : "✦"}</span>}</div><div><strong className={`asset-name asset-text-${asset.attributeColor}`}>{asset.name}</strong><small>{asset.category} · {asset.detail}</small></div></div>)}</div> : <p className="muted">No imported {title.toLowerCase()}.</p>}</div>; }

function ConditionGroup({ title, items }: { title: string; items: Condition[] }) { return <div className="card"><h3>{title}</h3>{items.length ? items.map(c => <details className="condition" key={c.id}><summary><span><span className="condition-name">{c.displayName}</span><span className="condition-sub">{c.sourceDetected ? "Source evidence found" : "Source unverified"}</span></span><span className={`tag ${c.sourceDetected ? "tag-good" : "tag-unknown"}`}>{c.reliability} · {c.confidence}</span></summary><p>{c.explanation}</p><p className="requirement"><strong>Requires:</strong> {c.activationRequirement}</p><p className="requirement"><strong>Affects:</strong> {c.statsAffected.join(", ")}</p><div className="evidence-list">{c.evidence.map((e, index) => <div className="evidence" key={`${e.label}-${index}`}><span>{e.kind}</span><div><strong>{e.label}</strong><small>{e.detail}</small></div></div>)}</div></details>) : <p className="muted">No configured conditions detected in this category.</p>}</div>; }

function ScenarioPanel({ xml, stats }: { xml: string; stats: Stats }) {
  const [loading, setLoading] = useState(false); const [result, setResult] = useState<Record<string, Metric> | null>(null); const [error, setError] = useState(""); const [encounterSeconds, setEncounterSeconds] = useState(30);
  async function run() { setLoading(true); setError(""); try { const response = await fetch("/api/scenarios", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ xml, encounterSeconds }) }); const body = await response.json(); if (!response.ok) throw new Error(body.error); setResult(body); } catch (e) { setError(e instanceof Error ? e.message : "Scenario calculation unavailable."); } finally { setLoading(false); } }
  const labels: [string, string][] = [["configured", "Conditional DPS (configured)"], ["peak", "Highest valid DPS"], ["burst", "Realistic burst DPS"], ["initial", "Initial boss DPS"], ["sustained", "Sustained boss DPS"], ["mapping", "Mapping DPS"]];
  return <div className="section card"><div className="scenario-header"><div><h3>Combat scenarios</h3><p className="muted">The imported PoB snapshot is exact. Alternate states appear only after the authoritative Headless PoB worker recalculates them.</p></div><div className="scenario-actions"><label>Encounter seconds<input className="duration-input" type="number" min="1" max="300" value={encounterSeconds} onChange={e => setEncounterSeconds(Number(e.target.value) || 30)} /></label><button className="button scenario-button" onClick={() => void run()} disabled={loading}>{loading ? "Calculating…" : "Run scenarios"}</button></div></div><div className="scenario-grid scenario-snapshot"><div className="scenario-metric"><span>Imported Full DPS</span><strong>{compactNumber(stats.fullDps)}</strong><small>Exact PoB export snapshot</small></div><div className="scenario-metric"><span>Imported Hit DPS</span><strong>{compactNumber(stats.totalDps)}</strong><small>Exact configured TotalDPS</small></div><div className="scenario-metric"><span>Unconditional DPS</span><strong>Unavailable</strong><small>Requires a recalculation with conditional inputs disabled</small></div></div>{error && <p className="engine-status"><strong>Engine unavailable:</strong> {error}</p>}<div className="scenario-grid">{labels.map(([id, label]) => { const metric = result?.[id]; return <div className="scenario-metric" key={id}><span>{label}</span><strong>{metric?.value === null || metric?.value === undefined ? "Unavailable" : compactNumber(metric.value)}</strong><small>{metric ? `${metric.status} · ${metric.confidence} confidence` : "Requires Headless PoB worker"}</small></div>; })}</div></div>;
}
