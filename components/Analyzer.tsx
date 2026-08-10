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
type Metric = { value: number | null; status: string; confidence: string; includedConditions?: string[]; assumptions?: string[]; explanation?: string };
type Timeline = { id: string; label: string; durationSeconds: number; dps: number | null; source: string; assumptions: string[] };
type ScenarioResult = Record<string, Metric> & { timeline?: Timeline[] };
type Report = {
  build: { identity: { name: string; level?: number; className?: string; ascendancy?: string; version?: string }; skills: string[]; items: string[]; sections: string[]; rawXml: string; sources: { category: string; name: string; detail: string }[]; sourceAssets: Asset[]; skillSetups: SkillSetup[]; equippedItems: EquippedItem[]; importedStats: Stats; passiveNodes: PassiveNode[]; treeGraph?: PassiveNode[] };
  conditions: Condition[]; auditedConditions: Condition[]; confidence: string; audit: { persistent: number; conditional: number; unverified: number; status: string }; honesty: { score: number; label: string; explanation: string; factors: { label: string; points: number; explanation: string }[] }; topNotables: PassiveNode[]; sourceSummary: { gems: number; items: number; flasks: number; passives: number; ascendancies: number }; recommendations: { title: string; detail: string; conditionId: string }[]; warnings: string[]; assumptions: string[];
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
    <div className="grid report-summary-grid"><div className="card summary-card summary-card-honesty"><h3>Honesty / inflation risk</h3><div className="value">{report.honesty.score}/10</div><div className="metric-note">{report.honesty.explanation}</div></div><div className="card summary-card summary-card-conditions"><h3>Condition audit</h3><div className="value">{report.auditedConditions.length}</div><div className="metric-note">{offence.length} offence entries · {defence.length} defence entries · {report.audit.unverified} unverified entries reviewed separately</div></div><div className="card summary-card"><h3>Calculation status</h3><div className="value">{report.build.importedStats.source === "pob-calcs" ? "Imported" : "Worker required"}</div><div className="metric-note">Imported PoB snapshot values are shown now. Alternate scenarios require the isolated Headless PoB worker.</div></div></div>
    <div className="report-columns">
      <section className="report-column report-column-offence"><div className="report-column-header"><div><span className="report-column-kicker">OFFENCE · DAMAGE OUTPUT</span><h3>Offence</h3><p>What the build can deal, which conditions raise it, and how far the configured number depends on them.</p></div><span className="report-column-mark">DAMAGE</span></div><ImportedStatsPanel title="Imported PoB offence" description="Exact offensive values exported by Path of Building." stats={report.build.importedStats} kind="offence" /><ScenarioPanelV2 xml={report.build.rawXml} stats={report.build.importedStats} /><div className="column-conditions"><div className="column-subheading"><h4>Damage conditions</h4><span>{offence.length} detected</span></div><ConditionGroup title="" items={offence} /></div></section>
      <section className="report-column report-column-defence"><div className="report-column-header"><div><span className="report-column-kicker">DEFENCE · SURVIVABILITY</span><h3>Defence</h3><p>What the character can normally survive, what is temporary, and which protections require an active setup.</p></div><span className="report-column-mark">SURVIVE</span></div><ImportedStatsPanel title="Imported PoB defence" description="Exact defensive values exported by Path of Building." stats={report.build.importedStats} kind="defence" /><div className="column-conditions"><div className="column-subheading"><h4>Defensive conditions</h4><span>{defence.length} detected</span></div><ConditionGroup title="" items={defence} /></div></section>
    </div>
    <TreePreview report={report} />
    <SourceInventory skillSetups={report.build.skillSetups} equippedItems={report.build.equippedItems} summary={report.sourceSummary} />
    <PoeNinjaComparisonPanel />
    <div className="section report-bottom-grid"><div className="card"><h3>Recommendations</h3>{report.recommendations.length ? <ul className="list">{report.recommendations.map(r => <li key={r.conditionId}><strong>{r.title}:</strong> {r.detail}</li>)}</ul> : <p className="muted">No evidence-backed findings yet.</p>}</div><div className="card"><h3>Why this rating</h3>{report.honesty.factors.length ? <ul className="list">{report.honesty.factors.map(f => <li key={f.label}><strong>{f.points}:</strong> {f.label}</li>)}</ul> : <p className="muted">No score deductions were found in the imported condition set.</p>}</div><div className="card"><h3>Warnings</h3><ul className="list">{report.warnings.map(x => <li key={x}>{x}</li>)}</ul></div><div className="card"><h3>Assumptions</h3><ul className="list">{report.assumptions.map(x => <li key={x}>{x}</li>)}</ul></div></div>
    <details className="diagnostics"><summary>Show raw diagnostic details</summary><pre>{rawXml.slice(0, 12000)}</pre></details><button className="example" onClick={onReset}>← Analyze another build</button>
  </section>;
}

function ImportedStatsPanel({ title, description, stats, kind }: { title: string; description: string; stats: Stats; kind: "offence" | "defence" }) {
  const values: [string, unknown, "dps" | "value" | "percent", string][] = kind === "offence"
    ? [["Full PoB DPS", stats.fullDps, "dps", "Imported FullDPS"], ["Hit DPS", stats.totalDps, "dps", "Imported TotalDPS"], ["Average hit", stats.averageHit, "dps", "Imported AverageHit"]]
    : [["Life", stats.life, "value", "Imported character stat"], ["Effective hit pool", stats.effectiveHealthPool, "value", "Imported TotalEHP"], ["Chance to block", stats.block, "percent", "Imported EffectiveBlockChance"], ["Chance to spell block", stats.spellBlock, "percent", "Imported EffectiveSpellBlockChance"], ["Spell suppression", stats.spellSuppression, "percent", "Additional defensive stat when present"]];
  return <div className={`imported-stats imported-stats-${kind}`}><div className="imported-stats-header"><div><h4>{title}</h4><p>{description}</p></div><span className={`source-badge ${stats.source === "pob-calcs" ? "source-live" : "source-offline"}`}>{stats.source === "pob-calcs" ? "POB CALCS" : "NOT IN EXPORT"}</span></div><div className="stat-grid">{values.map(([label, value, valueKind, note]) => <div className="stat-tile" key={label}><span>{label}</span><strong>{valueKind === "percent" ? percent(value) : compactNumber(value)}</strong><small>{typeof value === "number" ? note : "Unavailable without calculation engine"}</small></div>)}</div></div>;
}

function PoeNinjaComparisonPanel() {
  const [url, setUrl] = useState(""); const [comparison, setComparison] = useState<Comparison | null>(null); const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
  async function compare() { setLoading(true); setError(""); setComparison(null); try { const response = await fetch("/api/poe-ninja", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url }) }); const body = await response.json(); if (!response.ok) throw new Error(body.error); setComparison(body); } catch (e) { setError(e instanceof Error ? e.message : "Poe.ninja comparison failed."); } finally { setLoading(false); } }
  return <div className="section card comparison-panel"><div className="external-header"><div><h3>Poe.ninja population reference</h3><p className="muted">Use this as a public identity and league reference. Your PoB XML and controlled worker remain the authority for damage and defence numbers.</p></div><a className="text-link" href="https://poe.ninja/poe1/builds" target="_blank" rel="noreferrer">Open Poe.ninja ↗</a></div><div className="comparison-input"><label htmlFor="poe-ninja-url">Public Poe.ninja character URL</label><div><input id="poe-ninja-url" className="url-input" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://poe.ninja/poe1/builds/.../character/..." onKeyDown={(event) => { if (event.key === "Enter") void compare(); }} /><button className="button" onClick={() => void compare()} disabled={loading || !url.trim()}>{loading ? "Resolving…" : "Resolve reference"}</button></div></div>{error && <p className="engine-status"><strong>Reference unavailable:</strong> {error}</p>}{comparison && <div className="comparison-result"><div className="comparison-identity"><strong>{comparison.character ?? "Character"}</strong><span>{[comparison.account, comparison.className, comparison.level && `Level ${comparison.level}`, comparison.league].filter(Boolean).join(" · ")}</span><b>PUBLIC PAGE RESOLVED</b></div><div className="comparison-limit"><strong>Reference-only mode</strong><span>The current public Poe.ninja build page does not provide a stable documented numeric character payload for third-party tools. No DPS or defence values are invented here.</span></div><a className="text-link" href={comparison.url} target="_blank" rel="noreferrer">Open resolved character page ↗</a></div>}</div>;
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
  return <div className="section card"><div className="external-header"><div><h3>Passive tree preview</h3><p className="muted">The full PoB tree is shown in the background; allocated nodes and paths are highlighted. Hover a node to see its imported name and type.</p></div><span className="source-badge source-live">{nodes.length} ALLOCATED</span></div><div className="tree-layout"><div className="tree-canvas" aria-label="Full passive tree preview">{links.map(link => <span key={link.key} className={`tree-link ${link.allocated ? "tree-link-allocated" : ""}`} style={{ left: `${link.left}%`, top: `${link.top}%`, width: `${link.length}%`, transform: `rotate(${link.angle}deg)` }} />)}{graph.map((node, index) => { const point = locations.get(node.id ?? node.name)!; return <button type="button" key={`${node.id ?? node.name}-${index}`} className={`tree-point tree-point-${node.type} ${node.allocated ? "tree-point-allocated" : ""}`} style={{ left: `${point.left}%`, top: `${point.top}%` }} title={`${node.name} · ${node.type}${node.allocated ? " · allocated" : ""}`} aria-label={`${node.name}, ${node.type}${node.allocated ? ", allocated" : ""}`}><span>{node.type === "ascendancy" ? "A" : node.type === "keystone" ? "K" : node.type === "notable" ? "N" : "·"}</span></button>; })}{!graph.length && <p className="muted tree-empty">No passive tree data was found in this export.</p>}</div><div><div className="tree-list-heading"><span>Ascendancy sources</span><small>Only ascendancy nodes are summarized here.</small></div><div className="notable-list">{report.topNotables.length ? report.topNotables.map(node => <div key={node.name}><span className={`node-dot ${node.type}`}></span><strong>{node.name}</strong><small>ascendancy · contribution requires controlled engine comparison</small></div>) : <p className="muted">No allocated ascendancy nodes were found in the imported tree.</p>}</div></div></div></div>;
}

function SourceInventory({ skillSetups, equippedItems, summary }: { skillSetups: SkillSetup[]; equippedItems: EquippedItem[]; summary: Report["sourceSummary"] }) {
  return <div className="section card"><div className="external-header"><div><h3>Imported build inventory</h3><p className="muted">These are the active skill links and equipped PoB item slots used as evidence for the audit. The tree panel contains the full graph and its dedicated ascendancy summary.</p></div><div className="source-pills"><span>Gems {summary.gems}</span><span>Equipped items {summary.items}</span><span>Flasks {summary.flasks}</span></div></div><SkillSetupPanel setups={skillSetups} /><EquipmentPanel items={equippedItems} /></div>;
}

function SkillSetupPanel({ setups }: { setups: SkillSetup[] }) {
  return <div className="inventory-group skill-setups"><h4>Skill gems</h4>{setups.length ? <div className="skill-setup-list">{setups.map((setup) => <div className="skill-setup" key={setup.id}><div className="skill-setup-header"><div><strong>{setup.label}</strong>{setup.slot && <small>{setup.slot}</small>}</div><div className="setup-badges">{setup.includeInFullDPS && <span className="setup-badge setup-badge-main">FULL DPS</span>}{!setup.enabled && <span className="setup-badge">DISABLED</span>}</div></div><div className="gem-list">{setup.gems.map((gem, index) => <details className="gem-row" key={`${setup.id}-${gem.name}-${index}`}><summary><span className={`gem-icon gem-${gem.attributeColor}`}>{gem.iconUrl ? <img src={gem.iconUrl} alt="" /> : <span>◆</span>}</span><span className={`gem-name gem-text-${gem.attributeColor}`}>{gem.displayName ?? gem.name}<small>{gem.name !== gem.displayName ? gem.name : ""}</small></span><span className="gem-tags">{gem.support && <i>Support</i>}{gem.trigger && <i>Trigger</i>}{gem.provided && <i>Provided</i>}{gem.level !== undefined && <b>{gem.level}{gem.quality !== undefined ? ` / ${gem.quality}` : ""}</b>}</span></summary><div className="gem-detail"><strong>{gem.displayName ?? gem.name}</strong><span>{gem.detail}</span><span>{gem.enabled ? "Enabled in imported setup" : "Disabled in imported setup"}</span></div></details>)}</div></div>)}</div> : <p className="muted">No linked skill setups were found in this export.</p>}</div>;
}

function EquipmentPanel({ items }: { items: EquippedItem[] }) {
  const equipment = items.filter((item) => !item.isFlask);
  const weaponSwap = equipment.filter((item) => /swap/i.test(item.slot));
  const socketed = equipment.filter((item) => /socket/i.test(item.slot) && !weaponSwap.includes(item));
  const primary = equipment.filter((item) => !weaponSwap.includes(item) && !socketed.includes(item));
  const flasks = items.filter((item) => item.isFlask);
  const section = (title: string, rows: EquippedItem[], className = "") => rows.length ? <div className={`inventory-subsection ${className}`}><div className="equipment-subtitle"><span>{title}</span><b>{rows.length}</b></div><div className="equipment-grid">{rows.map((item, index) => <EquipmentCard item={item} key={`${title}-${item.id ?? item.name}-${index}`} />)}</div></div> : null;
  return <div className="inventory-group equipment-panel"><h4>Equipment and flasks</h4>{items.length ? <>{section("Primary equipment", primary)}{section("Weapon swap · alternate PoB slots", weaponSwap, "equipment-subsection-secondary")}{section("Socketed jewels", socketed, "equipment-subsection-secondary")}{flasks.length ? <div className="inventory-subsection"><div className="equipment-subtitle"><span>Flasks</span><b>{flasks.length}</b></div><div className="equipment-grid equipment-grid-flasks">{flasks.map((item, index) => <EquipmentCard item={item} key={`flask-${item.id ?? item.name}-${index}`} />)}</div></div> : <p className="muted">No active flasks were found.</p>}</> : <p className="muted">No active equipment slots were found in this export.</p>}</div>;
}

function EquipmentCard({ item }: { item: EquippedItem }) {
  const preview = item.text.split(/\r?\n/).filter((line) => line.trim() && !/^(rarity|item class|requirements|level|quality)\s*:/i.test(line.trim()) && line.trim() !== item.name).slice(0, 2);
  return <details className="equipment-card"><summary><div className="equipment-art">{item.iconUrl ? <img src={item.iconUrl} alt="" /> : <span>{item.isFlask ? "◈" : "✦"}</span>}</div><div className="equipment-copy"><small>{item.slot}</small><strong>{item.name}</strong><span>{[item.rarity, item.baseType, item.links && `${item.links} links`].filter(Boolean).join(" · ") || "Imported PoB item"}</span>{preview.map((line) => <span className="equipment-preview" key={line}>{line}</span>)}</div></summary><div className="equipment-detail"><span>{item.corrupted ? "Corrupted" : "Uncorrupted or not marked"}</span><p>{item.text || "No item text was included in the export."}</p></div></details>;
}

function ConditionGroup({ title, items }: { title: string; items: Condition[] }) { return <div className="condition-group">{title && <h3>{title}</h3>}{items.length ? items.map(c => <details className="condition" key={c.id}><summary><span><span className="condition-name">{c.displayName}</span><span className="condition-sub">{c.sourceDetected ? "Source evidence found" : "Source unverified"}</span></span><span className={`tag ${c.sourceDetected ? "tag-good" : "tag-unknown"}`}>{c.reliability} · {c.confidence}</span></summary><p>{c.explanation}</p><p className="requirement"><strong>Requires:</strong> {c.activationRequirement}</p><p className="requirement"><strong>Affects:</strong> {c.statsAffected.join(", ")}</p><div className="evidence-list">{c.evidence.map((e, index) => <div className="evidence" key={`${e.label}-${index}`}><span>{e.kind}</span><div><strong>{e.label}</strong><small>{e.detail}</small></div></div>)}</div></details>) : <p className="muted">No configured conditions detected in this category.</p>}</div>; }

function ScenarioPanelV2({ xml, stats }: { xml: string; stats: Stats }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScenarioResult | null>(null);
  const [error, setError] = useState("");
  const [encounterSeconds, setEncounterSeconds] = useState(30);
  const [engineStatus, setEngineStatus] = useState<EngineStatus | null>(null);
  useEffect(() => {
    let active = true;
    void fetch("/api/engine/status").then(response => response.json()).then(body => { if (active) setEngineStatus(body as EngineStatus); }).catch(() => { if (active) setEngineStatus({ state: "unreachable", message: "The worker status could not be checked." }); });
    return () => { active = false; };
  }, []);
  async function run() {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/scenarios", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ xml, encounterSeconds }) });
      const body = await response.json();
      if (!response.ok) { if (body.engine) setEngineStatus(body.engine as EngineStatus); throw new Error(body.error); }
      setResult(body); setEngineStatus({ state: "ready", message: "The isolated Path of Building worker is ready." });
    } catch (e) { setError(e instanceof Error ? e.message : "Scenario calculation unavailable."); }
    finally { setLoading(false); }
  }
  const labels: [string, string][] = [["configured", "Highest Configured DPS"], ["peak", "Highest Valid DPS"], ["burst", "Realistic Burst DPS"], ["initial", "Initial Boss DPS"], ["sustained", "Sustained Boss DPS"], ["mapping", "Mapping DPS"]];
  const workerReady = engineStatus?.state === "ready";
  const workerLabel = engineStatus === null ? "Checking worker..." : workerReady ? "Worker ready" : engineStatus.state === "not-configured" ? "Worker not configured" : "Worker offline";
  const metricValue = (metric: Metric | undefined) => metric?.value === null || metric?.value === undefined ? "Unavailable" : compactNumber(metric.value);
  const metricStatus = (metric: Metric | undefined) => metric ? `${metric.status} · ${metric.confidence} confidence` : "Requires the authoritative PoB worker";
  return <div className="section card scenario-panel">
    <div className="scenario-header">
      <div><div className="scenario-title-row"><h3>Combat scenarios</h3><span className={`engine-state engine-state-${engineStatus?.state ?? "checking"}`}>{workerLabel}</span></div><p className="muted">The imported PoB snapshot is exact. Alternate states are recalculated by the isolated Headless PoB worker.</p></div>
      <div className="scenario-actions"><label><span>Encounter length</span><div><input className="duration-input" type="number" min="1" max="300" value={encounterSeconds} onChange={e => setEncounterSeconds(Number(e.target.value) || 30)} /><b>seconds</b></div></label><button className="button scenario-button" onClick={() => void run()} disabled={loading || !workerReady}>{loading ? "Calculating..." : workerReady ? "Run scenarios" : "Worker required"}</button></div>
    </div>
    <div className="scenario-block-label">Imported PoB snapshot</div>
    <div className="scenario-grid scenario-snapshot"><div className="scenario-metric scenario-metric-imported"><span>Full PoB DPS</span><strong>{compactNumber(stats.fullDps)}</strong><small>Exact exported FullDPS</small></div><div className="scenario-metric scenario-metric-imported"><span>Hit DPS</span><strong>{compactNumber(stats.totalDps)}</strong><small>Exact exported TotalDPS</small></div><div className="scenario-metric scenario-metric-baseline"><span>Unconditional DPS</span><strong>{metricValue(result?.unconditional)}</strong><small>{result?.unconditional ? "All supported combat conditions disabled" : "Run scenarios to calculate the baseline"}</small></div></div>
    {engineStatus && !workerReady && <div className="engine-setup" role="status"><strong>Alternate scenarios are paused.</strong><span>{engineStatus.message}</span><small>For local analysis, start the isolated PoB worker, then set <code>POB_ENGINE_URL=http://127.0.0.1:8080</code> before starting the website. The hosted website also needs a separately deployed worker endpoint; it cannot run LuaJIT inside the web page.</small></div>}
    {error && <p className="engine-status"><strong>Scenario request failed:</strong> {error}</p>}
    <div className="scenario-block-label scenario-block-label-derived">Derived combat states</div>
    <div className="scenario-grid scenario-grid-derived">{labels.map(([id, label]) => { const metric = result?.[id]; return <div className={`scenario-metric scenario-metric-${id}`} key={id}><span>{label}</span><strong>{metricValue(metric)}</strong><small>{metricStatus(metric)}</small>{metric?.includedConditions?.length ? <em>{metric.includedConditions.join(" · ")}</em> : null}{metric?.assumptions?.length ? <i>{metric.assumptions[0]}</i> : null}</div>; })}</div>
    {result?.timeline?.length ? <div className="scenario-timeline"><h4>Encounter timeline</h4>{result.timeline.map((state) => <div className="timeline-row" key={state.id}><span>{state.label}</span><b>{state.durationSeconds.toFixed(1)}s</b><strong>{compactNumber(state.dps)}</strong><small>{state.assumptions.join(" ")}</small></div>)}</div> : null}
  </div>;
}

export function ScenarioPanel({ xml, stats }: { xml: string; stats: Stats }) {
  const [loading, setLoading] = useState(false); const [result, setResult] = useState<ScenarioResult | null>(null); const [error, setError] = useState(""); const [encounterSeconds, setEncounterSeconds] = useState(30); const [engineStatus, setEngineStatus] = useState<EngineStatus | null>(null);
  useEffect(() => { let active = true; void fetch("/api/engine/status").then(response => response.json()).then(body => { if (active) setEngineStatus(body as EngineStatus); }).catch(() => { if (active) setEngineStatus({ state: "unreachable", message: "The worker status could not be checked." }); }); return () => { active = false; }; }, []);
  async function run() { setLoading(true); setError(""); try { const response = await fetch("/api/scenarios", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ xml, encounterSeconds }) }); const body = await response.json(); if (!response.ok) { if (body.engine) setEngineStatus(body.engine as EngineStatus); throw new Error(body.error); } setResult(body); setEngineStatus({ state: "ready", message: "The isolated Path of Building worker is ready." }); } catch (e) { setError(e instanceof Error ? e.message : "Scenario calculation unavailable."); } finally { setLoading(false); } }
  const labels: [string, string][] = [["configured", "Highest Configured DPS"], ["peak", "Highest Valid DPS"], ["burst", "Realistic Burst DPS"], ["initial", "Initial Boss DPS"], ["sustained", "Sustained Boss DPS"], ["mapping", "Mapping DPS"]];
  const workerReady = engineStatus?.state === "ready";
  const workerLabel = engineStatus === null ? "Checking worker…" : workerReady ? "Worker ready" : engineStatus.state === "not-configured" ? "Worker not configured" : "Worker offline";
  return <div className="section card"><div className="scenario-header"><div><div className="scenario-title-row"><h3>Combat scenarios</h3><span className={`engine-state engine-state-${engineStatus?.state ?? "checking"}`}>{workerLabel}</span></div><p className="muted">The imported PoB snapshot is exact. Alternate states appear only after the authoritative Headless PoB worker recalculates them.</p></div><div className="scenario-actions"><label>Encounter seconds<input className="duration-input" type="number" min="1" max="300" value={encounterSeconds} onChange={e => setEncounterSeconds(Number(e.target.value) || 30)} /></label><button className="button scenario-button" onClick={() => void run()} disabled={loading || !workerReady}>{loading ? "Calculating…" : workerReady ? "Run scenarios" : "Worker required"}</button></div></div><div className="scenario-grid scenario-snapshot"><div className="scenario-metric"><span>Imported Full DPS</span><strong>{compactNumber(stats.fullDps)}</strong><small>Exact PoB export snapshot</small></div><div className="scenario-metric"><span>Imported Hit DPS</span><strong>{compactNumber(stats.totalDps)}</strong><small>Exact configured TotalDPS</small></div><div className="scenario-metric"><span>Unconditional DPS</span><strong>Unavailable</strong><small>Requires a recalculation with conditional inputs disabled</small></div></div>{engineStatus && !workerReady && <div className="engine-setup" role="status"><strong>Alternate scenarios are paused.</strong><span>{engineStatus.message}</span><small>For local analysis, start the isolated PoB worker, then set <code>POB_ENGINE_URL=http://127.0.0.1:8080</code> before starting the website. The hosted website also needs a separately deployed worker endpoint; it cannot run LuaJIT inside the web page.</small></div>}{error && <p className="engine-status"><strong>Scenario request failed:</strong> {error}</p>}<div className="scenario-grid">{labels.map(([id, label]) => { const metric = result?.[id]; return <div className="scenario-metric" key={id}><span>{label}</span><strong>{metric?.value === null || metric?.value === undefined ? "Unavailable" : compactNumber(metric.value)}</strong><small>{metric ? `${metric.status} · ${metric.confidence} confidence` : "Requires the authoritative PoB worker"}</small></div>; })}</div>{result?.timeline?.length ? <div className="scenario-timeline"><h4>Encounter timeline</h4>{result.timeline.map((state) => <div className="timeline-row" key={state.id}><span>{state.label}</span><b>{state.durationSeconds.toFixed(1)}s</b><strong>{compactNumber(state.dps)}</strong><small>{state.assumptions.join(" ")}</small></div>)}</div> : null}</div>;
}
