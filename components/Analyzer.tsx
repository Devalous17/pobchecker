"use client";

/* The rating tiles expose hover/focus explanations without acting as controls. */
/* eslint-disable jsx-a11y/no-noninteractive-tabindex */

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { EngineStatus } from "@/src/features/engine/client";
import type { ScenarioReport } from "@/src/features/scenarios/model";
import { applyScenarioSnapshots } from "@/src/features/analysis/layers";
import { recalculateBuildQuality } from "@/src/features/analysis/quality";
import { curseFields } from "@/src/features/scenarios/model";
import type { BuildLayerAnalysis, BuildLayerFinding, BuildQuality, LayerSnapshotState } from "@/src/types/domain";
import type { DamageChannel } from "@/src/features/pob/channels";

type Evidence = { kind: string; label: string; detail: string };
type Condition = { id: string; displayName: string; category: string; reliability: string; confidence: string; explanation: string; sourceDetected: boolean; activationRequirement: string; statsAffected: string[]; evidence: Evidence[] };
type Asset = { category: string; name: string; detail: string; iconUrl?: string; attributeColor: string };
type Gem = { name: string; displayName?: string; level?: number; quality?: number; attributeColor: string; detail: string; iconUrl?: string; support: boolean; trigger: boolean; provided: boolean; enabled: boolean; includeInFullDPS: boolean; skillPart?: number; skillCount?: number };
type SkillSetup = { id: string; engineIndex?: number; label: string; slot?: string; enabled: boolean; includeInFullDPS: boolean; mainActiveSkill?: boolean; gems: Gem[] };
type EquippedItem = { id?: string; slot: string; name: string; rarity?: string; baseType?: string; text: string; iconUrl?: string; corrupted?: boolean; links?: string; isFlask: boolean };
type Comparison = { url: string; account?: string; character?: string; league?: string; level?: number; className?: string; source: string; diagnostics: string[] };
type PassiveNode = { id?: string; name: string; type: string; allocated: boolean; x?: number; y?: number; links?: string[] };
type Stats = Record<string, number | string | undefined>;
type Metric = { value: number | null; status: string; confidence: string; damageChannel?: string; includedConditions?: string[]; assumptions?: string[]; explanation?: string; defence?: Record<string, number | null> };
type Timeline = { id: string; label: string; durationSeconds: number; dps: number | null; source: string; assumptions: string[] };
type ScenarioResult = Record<string, Metric> & { timeline?: Timeline[]; recommended?: Metric; autoConfiguration?: { id: string; label: string; value: string; reason: string; confidence: string }[] };
type ReportTab = "overview" | "offence" | "defence" | "conditions" | "comparison";
type Report = {
  mainSkill?: string;
  build: { identity: { name: string; level?: number; className?: string; ascendancy?: string; version?: string }; mainSkill?: string; skills: string[]; items: string[]; sections: string[]; rawXml: string; sources: { category: string; name: string; detail: string }[]; sourceAssets: Asset[]; skillSetups: SkillSetup[]; damageChannels: DamageChannel[]; equippedItems: EquippedItem[]; importedStats: Stats; passiveNodes: PassiveNode[]; treeGraph?: PassiveNode[] };
  conditions: Condition[]; auditedConditions: Condition[]; confidence: string; audit: { persistent: number; conditional: number; unverified: number; status: string }; honesty: { score: number; label: string; explanation: string; factors: { label: string; points: number; explanation: string }[] }; quality: BuildQuality; layers: BuildLayerAnalysis; topNotables: PassiveNode[]; sourceSummary: { gems: number; items: number; flasks: number; passives: number; ascendancies: number }; recommendations: { title: string; detail: string; conditionId: string }[]; warnings: string[]; assumptions: string[];
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

function TabbedAnalyzer() {
  const [source, setSource] = useState(() => typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("build") ?? "" : "");
  const [sourceType, setSourceType] = useState<"url" | "code">("url");
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function analyze() {
    setLoading(true); setError(""); setReport(null);
    try {
      const response = await fetch("/api/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ source }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      window.history.replaceState({}, "", sourceType === "url" ? `/?build=${encodeURIComponent(source)}` : "/");
      setReport(body as Report);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Analysis failed."); }
    finally { setLoading(false); }
  }
  if (report) return <ReportView report={report} onReset={() => { setReport(null); window.history.replaceState({}, "", "/"); }} />;
  return <section className="hero"><p className="eyebrow">A combat-quality report for your PoB build</p><h2>See how good your build is <span>in reality.</span></h2><p>Import a supported pobb.in link or paste the compressed Path of Building import code from PoE Ninja. Get a transparent 1–10 score, S–F grades, combat scenarios, and the conditions behind every result.</p><div className="import-mode-tabs" role="tablist" aria-label="Build import type"><button type="button" role="tab" aria-selected={sourceType === "url"} className={sourceType === "url" ? "active" : ""} onClick={() => setSourceType("url")}>pobb.in URL</button><button type="button" role="tab" aria-selected={sourceType === "code"} className={sourceType === "code" ? "active" : ""} onClick={() => setSourceType("code")}>PoB import code</button></div><div className="input-row"><label className="sr-only" htmlFor="pob-source">{sourceType === "url" ? "pobb.in URL" : "Path of Building import code"}</label>{sourceType === "url" ? <input id="pob-source" className="url-input" value={source} onChange={event => setSource(event.target.value)} placeholder="https://pobb.in/..." onKeyDown={event => { if (event.key === "Enter") void analyze(); }} /> : <textarea id="pob-source" className="url-input import-code-input" value={source} onChange={event => setSource(event.target.value)} placeholder="eNrt..." rows={5} />}<button className="button" onClick={() => void analyze()} disabled={loading || !source.trim()}>{loading ? "Analyzing…" : "Analyze build"}</button></div>{sourceType === "code" ? <p className="import-help">Paste the full PoB export code, including the leading <code>eNrt</code> or similar compressed text. It is decoded on the server; no external build page is fetched.</p> : <button className="example" onClick={() => setSource(example)}>Try the example build →</button>}{error && <div className="error" role="alert">{error}</div>}<p className="privacy">Only supported pobb.in links are fetched. Direct PoB codes do not contact PoE accounts. Results are analysis estimates, not gameplay guarantees.</p></section>;
}

export function Analyzer() {
  const [source, setSource] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<ReportTab>("overview");
  const [showRatingReveal, setShowRatingReveal] = useState(false);
  const [ratingRevealExiting, setRatingRevealExiting] = useState(false);

  useEffect(() => {
    const existingBuild = new URLSearchParams(window.location.search).get("build");
    if (!existingBuild) return;
    const timer = window.setTimeout(() => setSource(existingBuild), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!showRatingReveal) return;
    const exitTimer = window.setTimeout(() => setRatingRevealExiting(true), 2600);
    const hideTimer = window.setTimeout(() => setShowRatingReveal(false), 3000);
    const dismissOnOutsideClick = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-rating-reveal]")) return;
      setRatingRevealExiting(true);
      window.setTimeout(() => setShowRatingReveal(false), 300);
    };
    document.addEventListener("pointerdown", dismissOnOutsideClick);
    return () => {
      window.clearTimeout(exitTimer);
      window.clearTimeout(hideTimer);
      document.removeEventListener("pointerdown", dismissOnOutsideClick);
    };
  }, [showRatingReveal]);

  async function analyze() {
    setLoading(true);
    setError("");
    setReport(null);
    setShowRatingReveal(false);
    setRatingRevealExiting(false);
    try {
      const response = await fetch("/api/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ source }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      const sourceLooksLikeUrl = /^https?:\/\//i.test(source.trim());
      window.history.replaceState({}, "", sourceLooksLikeUrl ? `/?build=${encodeURIComponent(source)}` : "/");
      setReport(body as Report);
      setShowRatingReveal(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Analysis failed.");
    } finally {
      setLoading(false);
    }
  }

  const content = report ? <ReportView report={report} onReset={() => { setReport(null); setShowRatingReveal(false); setActiveTab("overview"); window.history.replaceState({}, "", "/"); }} activeTab={activeTab} setActiveTab={setActiveTab} /> : <section className="hero" id="analyze">
    <p className="eyebrow">A combat-quality report for your PoB build</p>
    <h2>See how good your build is <span>in reality.</span></h2>
    <p>Paste a <strong>correctly configured <code>pobb.in</code> export from your own Path of Building</strong>. That is the most accurate source because it preserves your selected skills, gear, passives, conditions, and exported DPS. PoE Ninja import code is supported as a fallback, but it may be incomplete.</p>
    <div className="import-source-callout" role="note" aria-label="Recommended build source"><strong>Recommended: your own pobb.in export</strong><span><b>Most accurate</b> · configured PoB values first · PoE Ninja code is fallback reference data</span></div>
    <div className="input-row input-row-import">
      <label className="sr-only" htmlFor="pob-source">pobb.in URL or Path of Building import code</label>
      <textarea id="pob-source" className="url-input import-code-input" value={source} onChange={event => setSource(event.target.value)} placeholder="https://pobb.in/... or eNrt..." rows={4} onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") void analyze(); }} />
      <button className="button" onClick={() => void analyze()} disabled={loading || !source.trim()}>{loading ? "Analyzing…" : "Analyze build"}</button>
    </div>
    <p className="import-help">Automatic format detection · pobb.in exports are preferred · direct PoB codes are accepted as a fallback.</p>
    <button className="example" onClick={() => setSource(example)}>Try the example build →</button>
    {error && <div className="error" role="alert">{error}</div>}
    <p className="privacy">Only supported pobb.in links are fetched. Direct PoB codes do not contact PoE accounts. Results are analysis estimates, not gameplay guarantees.</p>
  </section>;

  return <><FigmaChrome report={report} source={source} setSource={setSource} loading={loading} onAnalyze={() => void analyze()} onReset={() => { setReport(null); setShowRatingReveal(false); setActiveTab("overview"); window.history.replaceState({}, "", "/"); }} activeTab={activeTab} setActiveTab={setActiveTab} />{report && showRatingReveal && <FigmaRatingReveal report={report} exiting={ratingRevealExiting} onDismiss={() => { setRatingRevealExiting(true); window.setTimeout(() => setShowRatingReveal(false), 300); }} />}{content}</>;
}
void TabbedAnalyzer;

function LegacyAnalyzer() {
  const [source, setSource] = useState(() => typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("build") ?? "" : "");
  const [sourceType, setSourceType] = useState<"url" | "code">("url");
  const url = source;
  const setUrl = setSource;
  void setSourceType;
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function analyze() {
    setLoading(true); setError(""); setReport(null);
    try { const res = await fetch("/api/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ source }) }); const body = await res.json(); if (!res.ok) throw new Error(body.error); window.history.replaceState({}, "", sourceType === "url" ? `/?build=${encodeURIComponent(source)}` : "/"); setReport(body); }
    catch (e) { setError(e instanceof Error ? e.message : "Analysis failed."); }
    finally { setLoading(false); }
  }
  return <>{!report ? <section className="hero"><p className="eyebrow">A second opinion for your PoB numbers</p><h2>Make the <span>conditions</span> visible.</h2><p>Import a Path of Building link and see which parts of the displayed build are sourced, temporary, situational, ramp-dependent—or still unknown.</p><div className="input-row"><label className="sr-only" htmlFor="pob-url">pobb.in URL</label><input id="pob-url" className="url-input" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://pobb.in/..." onKeyDown={e => { if (e.key === "Enter") void analyze(); }} /><button className="button" onClick={() => void analyze()} disabled={loading || !url.trim()}>{loading ? "Reading build…" : "Analyze build"}</button></div><button className="example" onClick={() => setUrl(example)}>Try the example build →</button>{error && <div className="error" role="alert">{error}</div>}<p className="privacy">Only supported pobb.in links are fetched. Results are analysis estimates, not gameplay guarantees.</p></section> : <ReportView report={report} onReset={() => { setReport(null); window.history.replaceState({}, "", "/"); }} />}</>;
}
void LegacyAnalyzer;

const ScenarioResultContext = createContext<ScenarioReport | null>(null);

function FigmaRatingReveal({ report, exiting, onDismiss }: { report: Report; exiting: boolean; onDismiss: () => void }) {
  const ratings = [
    ["Overall", report.quality.overall],
    ["Offence", report.quality.offence],
    ["Defence", report.quality.defence],
  ] as const;

  return <div className="rating-reveal-layer" aria-live="assertive">
    <section className={`rating-reveal-card ${exiting ? "is-exiting" : ""}`} data-rating-reveal role="status" aria-label="Build rating">
      <div className="rating-reveal-head">
        <div>
          <span>BUILD ANALYZED</span>
          <strong>Reality check complete</strong>
        </div>
        <button type="button" onClick={onDismiss} aria-label="Dismiss build rating">×</button>
      </div>
      <p>{report.mainSkill ?? report.build.identity.name} has been scored across offence, defence, and conditional risk.</p>
      <div className="rating-reveal-grid">
        {ratings.map(([label, rating]) => <div className={`rating-reveal-score ${label === "Defence" ? "defence" : ""}`} key={label}>
          <span>{rating.grade}</span>
          <strong>{rating.score === null ? "?" : rating.score.toFixed(1)}<small>/10</small></strong>
          <em>{label}</em>
        </div>)}
      </div>
      <small className="rating-reveal-hint">Click anywhere outside to continue</small>
    </section>
  </div>;
}

function ReportView({ report, onReset, activeTab, setActiveTab }: { report: Report; onReset: () => void; activeTab?: ReportTab; setActiveTab?: (tab: ReportTab) => void }) {
  const [scenarioResult, setScenarioResult] = useState<ScenarioReport | null>(null);
  const quality = scenarioResult ? recalculateBuildQuality(report.quality, report.build, report.conditions.map((condition) => ({ reliability: condition.reliability })), scenarioResult) : report.quality;
  const ratingText = (rating: BuildQuality["overall"]) => rating.score === null ? "?" : `${rating.score.toFixed(1)}/10`;
  void quality;
  void ratingText;
  return <ScenarioResultContext.Provider value={scenarioResult}><FigmaReportView report={report} onReset={onReset} scenarioResult={scenarioResult} onScenarioResult={setScenarioResult} activeTab={activeTab ?? "overview"} setActiveTab={setActiveTab ?? (() => undefined)} /></ScenarioResultContext.Provider>;
  return <><section className="quality-hero"><div><p className="eyebrow">Build quality overview</p><h2>How good is this build?</h2><p className="muted">A weakest-link rating based on imported PoB offence, effective hit pool, maximum-hit evidence, and configured-condition risk. It is a transparent screening score, not a universal tier list.</p></div><div className="quality-overall"><span>{scenarioResult ? "CORRECTED OVERALL" : "OVERALL"}</span><strong>{ratingText(quality.overall)}</strong><b>{quality.overall.grade}</b><em>{quality.overall.label}</em></div><div className="quality-breakdown"><div><span>OFFENCE</span><strong>{ratingText(quality.offence)}</strong><b>{quality.offence.grade}</b></div><div><span>DEFENCE</span><strong>{ratingText(quality.defence)}</strong><b>{quality.defence.grade}</b></div></div><div className="quality-rating-dps"><span>RATING DPS SOURCE</span><strong>{quality.ratingDps.value === null ? "Unavailable" : compactNumber(quality.ratingDps.value)}</strong><small>{quality.ratingDps.label} · {quality.ratingDps.origin.replace("worker-", "worker ")}</small>{quality.ratingDps.differencePercent !== undefined && <em className={`quality-verification quality-verification-${quality.ratingDps.verification}`}>{quality.ratingDps.verification === "matched" ? "Matches imported PoB" : `PoB comparison: ${quality.ratingDps.differencePercent >= 0 ? "+" : ""}${quality.ratingDps.differencePercent.toFixed(1)}%`}</em>}</div><div className="quality-basis"><strong>Why this score</strong>{quality.overall.basis.map((item) => <span key={item}>{item}</span>)}<span>{quality.ratingDps.explanation}</span></div></section><ModernReportView report={report} onReset={onReset} scenarioResult={scenarioResult} onScenarioResult={setScenarioResult} /> </>;
}

const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const hasUniformElementalMaximumHit = (stats: Stats) => {
  const values = [stats.fireMaximumHit, stats.coldMaximumHit, stats.lightningMaximumHit].filter((value): value is number => isNumber(value) && value > 0);
  return values.length === 3 && new Set(values).size === 1;
};
const statRows = (stats: Stats, rows: { key: string; label: string; tone?: string; format?: "number" | "percent" }[]) => rows.filter((row) => isNumber(stats[row.key]) && stats[row.key] !== 0).map((row) => ({ ...row, value: row.format === "percent" ? percent(stats[row.key]) : compactNumber(stats[row.key]) }));
const importedDps = (value: unknown) => isNumber(value) && value > 0 ? compactNumber(value) : "Not exported";

const reportTabs: Array<{ id: ReportTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "offence", label: "Offence" },
  { id: "defence", label: "Defence" },
  { id: "conditions", label: "Config & Conditions" },
  { id: "comparison", label: "Poe.ninja" },
];

type ConfigToggleCondition = Pick<Condition, "id" | "displayName" | "category" | "sourceDetected" | "reliability" | "confidence" | "explanation" | "activationRequirement" | "evidence" | "statsAffected">;

function ConfigConditionList({ title, items, disabledIds, onToggle }: { title: string; items: ConfigToggleCondition[]; disabledIds: string[]; onToggle: (id: string) => void }) {
  return <section className="config-condition-section"><div className="config-condition-heading"><div><span>{title}</span><strong>{items.length} detected</strong></div><small>Source-backed effects can be tested in the worker.</small></div>{items.length ? <div className="config-condition-list">{items.map((condition) => { const canToggle = condition.sourceDetected; const enabled = canToggle && !disabledIds.includes(condition.id); return <article className={`config-condition-card ${enabled ? "is-enabled" : "is-disabled"}`} key={condition.id}><div className="config-condition-main"><span className="figma-condition-dot" /><strong>{condition.displayName}</strong><small>{condition.reliability} · {condition.confidence}</small></div><button type="button" className={`config-toggle ${enabled ? "is-on" : "is-off"}`} aria-pressed={enabled} disabled={!canToggle} onClick={() => onToggle(condition.id)}>{canToggle ? (enabled ? "ON" : "OFF") : "UNVERIFIED"}</button><p>{condition.explanation}</p><small className="config-condition-evidence">{canToggle ? `Source: ${condition.evidence[0]?.label ?? "Imported build evidence"}` : "No source-backed activation found; excluded from automatic scenarios."}</small></article>; })}</div> : <p className="muted">No detected conditions in this category.</p>}</section>;
}

function FigmaConditionsTabV2({ report, scenarioResult, onScenarioResult }: { report: Report; scenarioResult: ScenarioReport | null; onScenarioResult: (result: ScenarioReport) => void }) {
  const [disabledConditions, setDisabledConditions] = useState<string[]>([]);
  const [runRequest, setRunRequest] = useState(0);
  const [pendingChanges, setPendingChanges] = useState(false);
  const curseToggles: ConfigToggleCondition[] = Object.entries(curseFields).flatMap(([gemName, field]) => {
    const gem = report.build.skillSetups.flatMap((setup) => setup.gems).find((entry) => entry.enabled && entry.name.toLowerCase().includes(gemName));
    if (!gem) return [];
    const category = /enfeeble|temporal chains|warlord|mark of submission/i.test(gemName) ? "defence" : "offence";
    return [{ id: `curse-${field}`, displayName: gem.displayName ?? gem.name, category, sourceDetected: true, reliability: "Conditional", confidence: "High", explanation: "This enabled curse gem is available to the worker as a direct PoB condition. Toggle it off to measure the calculated damage or defensive difference without the curse.", activationRequirement: "The curse must be applied and remain effective on the target.", evidence: [{ kind: "skill", label: gem.displayName ?? gem.name, detail: "Enabled curse gem found in the imported skill setup." }], statsAffected: category === "defence" ? ["damage taken", "control"] : ["damage"] }];
  });
  const detected = [...report.conditions.filter((condition) => condition.category === "offence" || condition.category === "defence" || condition.category === "both"), ...curseToggles].filter((condition, index, all) => all.findIndex((candidate) => candidate.id === condition.id) === index);
  const offence = detected.filter((condition) => condition.category === "offence" || condition.category === "both");
  const defence = detected.filter((condition) => condition.category === "defence" || condition.category === "both");
  const toggle = (id: string) => { setDisabledConditions((current) => current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]); setPendingChanges(true); };
  const calculate = () => { setPendingChanges(false); setRunRequest((value) => value + 1); };
  return <><FigmaPanel title="Configuration & conditions" eyebrow="Choose what the worker should include" className="figma-page-panel config-page-panel"><p className="figma-explainer">Turn source-backed offence and defence conditions on or off, then recalculate. Imported PoB snapshot values stay unchanged; the calculated combat states below show the effect of your selected setup. Curses are included as direct toggles.</p><div className="config-toolbar"><div><strong>{detected.filter((condition) => condition.sourceDetected && !disabledConditions.includes(condition.id)).length} conditions enabled</strong><small>{pendingChanges ? "Changes waiting to be recalculated" : scenarioResult ? "Showing the last worker result" : "No worker result yet"}</small></div><button type="button" className="button" onClick={calculate}>{pendingChanges ? "Recalculate changes" : "Calculate selected setup"}</button></div><ConfigConditionList title="Offence · damage" items={offence} disabledIds={disabledConditions} onToggle={toggle} /><ConfigConditionList title="Defence · survivability" items={defence} disabledIds={disabledConditions} onToggle={toggle} /></FigmaPanel><FigmaPanel title="Calculated result" eyebrow="Your selected conditions" className="figma-page-panel"><ScenarioPanelV2 xml={report.build.rawXml} stats={report.build.importedStats} channels={report.build.damageChannels} onResult={onScenarioResult} runRequest={runRequest} disabledAutomatic={disabledConditions} onDisabledAutomaticChange={(ids) => { setDisabledConditions(ids); setPendingChanges(false); }} /><div className="figma-timeline-list">{scenarioResult?.timeline?.map((state) => <div key={state.id}><strong>{state.label}</strong><span>{state.durationSeconds.toFixed(1)}s</span><b>{state.dps === null ? "Unavailable" : compactNumber(state.dps)}</b><p>{state.assumptions.join(" · ") || "Engine-calculated state"}</p></div>)}</div></FigmaPanel></>;
}

function FigmaChrome({ report, source, setSource, loading, onAnalyze, onReset, activeTab, setActiveTab }: { report: Report | null; source: string; setSource: (value: string) => void; loading: boolean; onAnalyze: () => void; onReset: () => void; activeTab: ReportTab; setActiveTab: (tab: ReportTab) => void }) {
  const identity = report?.build.identity;
  return <>
    <div className="utility-bar figma-utility-bar"><span>pob-reality-check.com</span><nav aria-label="Utility navigation"><a href="https://www.pathofexile.com" target="_blank" rel="noreferrer">Path of Exile</a><a href="https://poe.ninja/poe1/builds" target="_blank" rel="noreferrer">Poe.ninja</a></nav></div>
    <header className="mainbar figma-mainbar">
      <button type="button" className="brand-lockup brand-home-button" onClick={onReset} aria-label="Return to PoB Reality Check home"><div className="brand-crest">P</div><div><div className="brand-name">PoB Reality Check</div><div className="brand-subtitle">PoB ceiling - combat reality</div></div></button>
      <nav className="main-tabs figma-report-tabs" aria-label="Report navigation">
        {reportTabs.map((tab) => <button key={tab.id} type="button" className={report && activeTab === tab.id ? "active" : ""} disabled={!report} onClick={() => setActiveTab(tab.id)}>{tab.label}</button>)}
      </nav>
      <div className="header-analyze"><label htmlFor="header-pob-source" className="sr-only">pobb.in URL or PoB import code</label><input id="header-pob-source" className="poe-input" value={source} onChange={(event) => setSource(event.target.value)} placeholder="pobb.in/... or PoB code" onKeyDown={(event) => { if (event.key === "Enter") onAnalyze(); }} /><button type="button" className="poe-btn poe-btn-gold" onClick={onAnalyze} disabled={loading || !source.trim()}>{loading ? "Reading..." : "Analyse"}</button></div>
      <span className="engine-chip figma-game-chip">POE 1</span>
    </header>
    <div className="tool-strip figma-subbar"><span className="tool-label">BUILD ANALYZER</span>{identity ? <><span className="tool-status">◆</span><span className="figma-subbar-skill">{report.mainSkill ?? identity.name}</span><span className="tool-status">◆</span><span className="tool-hint">{[identity.ascendancy ?? identity.className, identity.level && `LV${identity.level}`, identity.version].filter(Boolean).join(" · ")}</span></> : <span className="tool-status">◆ IMPORT A BUILD TO OPEN THE REPORT</span>}<span className="tool-spacer" />{report && <span className="tool-hint">Overview · Settings · Save Log · Export</span>}</div>
  </>;
}

function FigmaPanel({ title, eyebrow, children, className = "" }: { title: string; eyebrow?: string; children: ReactNode; className?: string }) {
  return <section className={`figma-frame ${className}`}><div className="figma-panel-heading"><span className="figma-rule" /><div>{eyebrow && <p>{eyebrow}</p>}<h2>{title}</h2></div><span className="figma-rule" /></div>{children}</section>;
}

function FigmaScore({ label, rating, emphasis = "gold", icon }: { label: string; rating: BuildQuality["overall"]; emphasis?: "gold" | "blue"; icon?: string }) {
  return <div className={`figma-score figma-score-${emphasis} ${label.toLowerCase().startsWith("overall") ? "figma-score-overall" : ""}`}><i className="figma-score-icon" aria-hidden="true">{icon}</i><span>{rating.grade}</span><strong>{rating.score === null ? "?" : rating.score.toFixed(1)}<small>/10</small></strong><em>{label}</em></div>;
}

function FigmaStatTile({ label, value, tone = "gold", icon = "•", source }: { label: string; value: string; tone?: string; icon?: string; source?: string }) {
  return <div className={`figma-stat-tile tone-${tone}`}><span className="figma-stat-icon">{icon}</span><small>{label}</small><strong>{value}</strong>{source && <em>{source}</em>}</div>;
}

function figmaStatIcon(tone = "gold", label = "") {
  if (tone === "fire" || /fire/i.test(label)) return "🔥";
  if (tone === "cold" || /cold/i.test(label)) return "❄";
  if (tone === "lightning" || /lightning/i.test(label)) return "⚡";
  if (tone === "chaos" || /chaos/i.test(label)) return "◉";
  if (tone === "life" || /life/i.test(label)) return "♥";
  if (tone === "energy" || /energy shield|es /i.test(label)) return "●";
  if (tone === "mana" || /mana/i.test(label)) return "◌";
  if (tone === "armour" || /armour/i.test(label)) return "◈";
  if (tone === "evasion" || /evasion/i.test(label)) return "◆";
  if (tone === "block" || tone === "spell" || /block/i.test(label)) return "⬟";
  if (tone === "suppression" || /suppression/i.test(label)) return "⛨";
  if (tone === "physical" || /physical/i.test(label)) return "✦";
  if (tone === "gold" || /critical|average|speed|damage/i.test(label)) return "✧";
  return "•";
}

function FigmaRows({ rows }: { rows: { label: string; value: string; tone?: string }[] }) {
  return <div className="figma-rows">{rows.map((row) => <div className="figma-row" key={row.label}><span className={`figma-row-label tone-label-${row.tone ?? "gold"}`}><i aria-hidden="true">{figmaStatIcon(row.tone, row.label)}</i>{row.label}</span><strong className={`tone-text-${row.tone ?? "gold"}`}>{row.value}</strong></div>)}</div>;
}

function scenarioValue(result: ScenarioReport | null, key: keyof ScenarioReport) {
  const metric = result?.[key];
  if (!metric || typeof metric !== "object" || !("value" in metric)) return "Unavailable";
  const value = metric.value;
  return isNumber(value) ? compactNumber(value) : "Unavailable";
}

function StaticQualityOverview({ report }: { report: Report }) {
  const reviewCount = report.conditions.filter((condition) => !condition.sourceDetected || condition.reliability !== "Reliable").length;
  const evidenceCount = report.conditions.filter((condition) => condition.sourceDetected).length;
  return <FigmaPanel title="Build quality overview" eyebrow="Honest imported snapshot" className="figma-quality-panel">
    <div className="figma-quality-grid">
      <div className="figma-quality-copy">
        <span className="figma-verdict-kicker">THE REALITY CHECK</span>
        <h1>How good is this build?</h1>
        <p>This rating uses the damage, defence, and conditions actually present in the imported Path of Building snapshot. It does not invent alternate combat scenarios.</p>
        <ul>{report.quality.overall.basis.slice(0, 3).map((item) => <li key={item}>{item}</li>)}</ul>
      </div>
      <FigmaScore label="Overall build" rating={report.quality.overall} icon="◉" />
      <div className="figma-score-stack"><FigmaScore label="Offence" rating={report.quality.offence} icon="⚔" /><FigmaScore label="Defence" rating={report.quality.defence} emphasis="blue" icon="◈" /></div>
    </div>
    <FigmaOverviewRatingGrid ratings={report.quality.categoryRatings} />
    <div className="figma-reality-proof"><div><span>RATING DPS</span><strong>{report.quality.ratingDps.value === null ? "Unavailable" : compactNumber(report.quality.ratingDps.value)}</strong><small>{report.quality.ratingDps.label}</small></div><div><span>CONDITIONS WITH EVIDENCE</span><strong>{evidenceCount}</strong><small>Source-backed effects found in the build</small></div><div><span>NEEDS REVIEW</span><strong>{reviewCount}</strong><small>Temporary, situational, or unverified dependencies</small></div></div>
  </FigmaPanel>;
}

function numericStat(stats: Stats, key: string) {
  const value = stats[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function TargetMetric({ label, current, target, suffix = "", note }: { label: string; current: number | null; target: number; suffix?: string; note: string }) {
  const gap = current === null ? null : Math.max(0, target - current);
  return <div className={`figma-target-metric ${current !== null && current >= target ? "is-met" : "is-gap"}`}><div><strong>{label}</strong><span>{current === null ? "Unavailable" : `${compactNumber(current)}${suffix}`}</span></div><small>Starting target: {compactNumber(target)}{suffix}</small><p>{current === null ? "This value was not exported by PoB." : gap !== null && gap > 0 ? `Improve by about ${compactNumber(gap)}${suffix} to reach the starting target.` : "Target reached in the imported snapshot."}</p><em>{note}</em></div>;
}

function RatingExplanation({ title, rating }: { title: string; rating: BuildQuality["offence"] }) {
  return <FigmaPanel title={`Why this ${title.toLowerCase()} grade?`} eyebrow="Transparent grading" className="figma-page-panel figma-explanation-panel"><p className="figma-explainer">The grade is evidence-based. It uses imported PoB values and lowers confidence when the result depends on temporary, conditional, or unverified effects.</p><ul className="figma-proof-list">{rating.basis.slice(0, 6).map((item) => <li key={item}>{item}</li>)}</ul></FigmaPanel>;
}

function OffenceTips({ report }: { report: Report }) {
  const dps = numericStat(report.build.importedStats, "fullDps");
  return <FigmaPanel title="General offence tips" eyebrow="Practical normal T16 starting point" className="figma-page-panel figma-tips-panel"><p className="figma-explainer">These are conservative coaching targets for ordinary white Tier 16 mapping. They are not guarantees for juiced maps, bosses, invitations, or dangerous map mods.</p><div className="figma-target-grid"><TargetMetric label="Configured PoB DPS" current={dps} target={5_000_000} note="A practical starting floor for comfortable normal-map clear; mechanics and uptime still matter." /></div><ul className="figma-tip-list"><li>Use the correctly configured main skill and make sure the exported FullDPS represents the setup you actually play.</li><li>Improve uptime before chasing a larger tooltip: movement, range, targeting, coverage, and ramp time can matter more than peak damage.</li><li>Keep conditional damage visible in the conditions tab. A curse, exposure, charge, flask, or “recently” effect is not permanent damage.</li><li>For bosses, prioritize reliable single-target delivery and survival over a number that only exists with every temporary effect active.</li></ul></FigmaPanel>;
}

function DefenceTips({ report }: { report: Report }) {
  const stats = report.build.importedStats;
  const elementalMaximum = ["fireMaximumHit", "coldMaximumHit", "lightningMaximumHit"].map((key) => numericStat(stats, key)).filter((value): value is number => value !== null);
  const elementalHit = elementalMaximum.length ? Math.min(...elementalMaximum) : null;
  return <FigmaPanel title="General defence tips" eyebrow="Practical normal T16 starting points" className="figma-page-panel figma-tips-panel"><p className="figma-explainer">These are starting targets for ordinary white Tier 16 maps, not universal guarantees. Rare mods, altars, damage conversion, critical hits, and league mechanics can demand much more.</p><div className="figma-target-grid"><TargetMetric label="Elemental resistance" current={numericStat(stats, "fireResistance") !== null && numericStat(stats, "coldResistance") !== null && numericStat(stats, "lightningResistance") !== null ? Math.min(numericStat(stats, "fireResistance")!, numericStat(stats, "coldResistance")!, numericStat(stats, "lightningResistance")!) : null} target={75} suffix="%" note="Fire, cold, and lightning should all reach the normal cap." /><TargetMetric label="Chaos resistance" current={numericStat(stats, "chaosResistance")} target={0} suffix="%" note="Non-negative chaos resistance is a useful minimum; higher is safer." /><TargetMetric label="Physical maximum hit" current={numericStat(stats, "physicalMaximumHit")} target={10_000} note="A rough ordinary-map starting point before armour, conversion, and map mods." /><TargetMetric label="Elemental maximum hit" current={elementalHit} target={20_000} note="Uses the weakest exported fire, cold, or lightning maximum-hit value." /><TargetMetric label="Chaos maximum hit" current={numericStat(stats, "chaosMaximumHit")} target={10_000} note="Chaos resistance and maximum hit should be considered together." /><TargetMetric label="Spell suppression" current={numericStat(stats, "spellSuppression")} target={100} suffix="%" note="Full suppression is a strong, easy-to-read mapping goal when the build uses this layer." /></div><ul className="figma-tip-list"><li>Fix the largest red gap first: uncapped resistance, very low maximum hit, or a missing recovery layer usually matters more than small DPS gains.</li><li>Build at least two reliable defensive layers: a hit pool plus mitigation, avoidance, block, suppression, recovery, conversion, or damage reduction.</li><li>Do not count a guard skill, flask, charge, or “recently” effect as permanent unless the build can keep it active reliably.</li><li>Maximum hit is not the same as immunity. Recovery, ailment protection, movement, and dangerous map modifiers still matter.</li></ul></FigmaPanel>;
}

function StaticOverviewTab({ report }: { report: Report }) {
  const stats = report.build.importedStats;
  const defenceRows = statRows(stats, [{ key: "physicalMaximumHit", label: "Physical maximum hit", tone: "physical" }, { key: "fireMaximumHit", label: "Fire maximum hit", tone: "fire" }, { key: "coldMaximumHit", label: "Cold maximum hit", tone: "cold" }, { key: "lightningMaximumHit", label: "Lightning maximum hit", tone: "lightning" }, { key: "chaosMaximumHit", label: "Chaos maximum hit", tone: "chaos" }]).map((row) => ({ label: row.label, value: row.value, tone: row.tone }));
  return <><StaticQualityOverview report={report} /><div className="figma-two-column"><FigmaPanel title="Offence summary" eyebrow="Imported damage output" className="figma-summary-panel"><div className="figma-key-stat-grid"><FigmaStatTile label="Configured PoB DPS" value={importedDps(stats.fullDps)} tone="damage" icon="⚡" source="Imported" /><FigmaStatTile label="Hit DPS" value={importedDps(stats.totalDps)} tone="damage" icon="✦" source="Imported" /><FigmaStatTile label="Average hit" value={importedDps(stats.averageHit)} tone="gold" icon="◌" source="Imported" /><FigmaStatTile label="Attack / cast speed" value={importedDps(stats.speed)} tone="gold" icon="↯" source="Imported" /></div></FigmaPanel><FigmaPanel title="Defence summary" eyebrow="Imported survivability" className="figma-summary-panel"><div className="figma-stat-grid"><FigmaStatTile label="Life" value={stats.life ? compactNumber(stats.life) : "Not exported"} tone="life" icon="♥" source="Imported" /><FigmaStatTile label="Effective hit pool" value={stats.effectiveHealthPool ? compactNumber(stats.effectiveHealthPool) : "Not exported"} tone="ehp" icon="◉" source="Imported" /><FigmaStatTile label="Energy shield" value={stats.energyShield ? compactNumber(stats.energyShield) : "Not exported"} tone="energy" icon="●" source="Imported" /><FigmaStatTile label="Mana" value={stats.mana ? compactNumber(stats.mana) : "Not exported"} tone="mana" icon="◌" source="Imported" /></div><h3 className="figma-subheading">Maximum hit</h3><FigmaRows rows={defenceRows} /></FigmaPanel></div><FigmaPanel title="Imported Path of Building snapshot" eyebrow="Exact source data" className="figma-snapshot-panel"><div className="figma-snapshot-head"><div><h1>{report.mainSkill ?? report.build.identity.name}</h1><p>{[report.build.identity.ascendancy ?? report.build.identity.className, report.build.identity.level && `Level ${report.build.identity.level}`, report.build.identity.version].filter(Boolean).join("  ·  ")}</p></div><div className="figma-inline-badges"><span>EXACT IMPORTS</span><span>{report.audit.conditional} CONDITIONAL EFFECTS</span>{report.audit.unverified > 0 && <span>{report.audit.unverified} UNVERIFIED</span>}</div></div></FigmaPanel><FigmaPanel title="Build loadout" eyebrow="Imported equipment and socket groups" className="figma-loadout-panel"><BuildLoadoutPanel skillSetups={report.build.skillSetups} equippedItems={report.build.equippedItems} summary={report.sourceSummary} /></FigmaPanel></>;
}

function StaticOffenceTab({ report }: { report: Report }) {
  const stats = report.build.importedStats;
  const mainChannel = report.build.damageChannels.find((channel) => channel.active && channel.includeInFullDPS) ?? report.build.damageChannels.find((channel) => channel.active);
  return <><FigmaPanel title="Offence" eyebrow="Imported damage output" className="figma-page-panel"><div className="figma-active-skill"><span>ACTIVE SKILL</span><strong>{mainChannel?.label ?? report.mainSkill ?? "Main skill not identified"}</strong><span className="figma-status-badge">IMPORTED SETUP</span></div><div className="figma-key-stat-grid"><FigmaStatTile label="Configured PoB DPS" value={importedDps(stats.fullDps)} tone="damage" icon="⚡" source="Exact imported snapshot" /><FigmaStatTile label="Hit DPS" value={importedDps(stats.totalDps)} tone="damage" icon="✦" source="Exact imported TotalDPS" /><FigmaStatTile label="Average hit" value={importedDps(stats.averageHit)} tone="gold" icon="◌" source="Imported AverageHit" /><FigmaStatTile label="Attack / cast speed" value={importedDps(stats.speed)} tone="gold" icon="↯" source="Imported PoB speed" /></div><h3 className="figma-subheading">Imported damage conditions</h3><ConditionTable title="" items={report.conditions.filter((condition) => condition.category === "offence" || condition.category === "both")} /></FigmaPanel><FigmaPanel title="Skill setups" eyebrow="Imported socket groups" className="figma-page-panel"><SkillSetupPanel setups={report.build.skillSetups} /></FigmaPanel><OffenceTips report={report} /><RatingExplanation title="offence" rating={report.quality.offence} /></>;
}

function StaticDefenceTab({ report }: { report: Report }) {
  const stats = report.build.importedStats;
  return <><DefenceGoals /><FigmaPanel title="Defence" eyebrow="Imported survivability" className="figma-page-panel"><div className="figma-defence-grid"><DefenceInspector stats={stats} /><div className="figma-defence-notice"><strong>Imported defence evidence</strong><p>These values come directly from the selected PoB snapshot. Temporary skills, flasks, charges, conditional block, guard skills, charges, and other temporary effects remain labeled as review items; nothing is recalculated here.</p>{report.conditions.filter((condition) => condition.category === "defence" || condition.category === "both").map((condition) => <div className="figma-condition-row" key={condition.id}><span>{condition.displayName}</span><b>{condition.reliability} · {condition.confidence}</b></div>)}</div></div></FigmaPanel><DefenceTips report={report} /><RatingExplanation title="defence" rating={report.quality.defence} /></>;
}

function StaticConditionsTab({ report }: { report: Report }) {
  return <><FigmaPanel title="Imported conditions" eyebrow="What the build export actually shows" className="figma-page-panel"><p className="figma-explainer">Conditions are listed as evidence for the rating. They are not toggled or recalculated in the public report.</p><ConditionTable title="Offence conditions" items={report.conditions.filter((condition) => condition.category === "offence" || condition.category === "both")} /><ConditionTable title="Defence conditions" items={report.conditions.filter((condition) => condition.category === "defence" || condition.category === "both")} /></FigmaPanel><FigmaPanel title="Recommendations" eyebrow="Practical next checks" className="figma-page-panel"><div className="figma-condition-grid">{report.recommendations.map((recommendation) => <div className="figma-condition-card" key={recommendation.conditionId}><strong>{recommendation.title}</strong><p>{recommendation.detail}</p></div>)}</div></FigmaPanel></>;
}

function FigmaReportView({ report: inputReport, onReset, scenarioResult, onScenarioResult, activeTab, setActiveTab }: { report: Report; onReset: () => void; scenarioResult: ScenarioReport | null; onScenarioResult: (result: ScenarioReport) => void; activeTab: ReportTab; setActiveTab: (tab: ReportTab) => void }) {
  const correctedQuality = scenarioResult ? recalculateBuildQuality(inputReport.quality, inputReport.build, inputReport.conditions.map((condition) => ({ reliability: condition.reliability })), scenarioResult) : inputReport.quality;
  const report = scenarioResult ? { ...inputReport, quality: correctedQuality } : inputReport;
  const tabProps = { report, scenarioResult, onScenarioResult };
  return <main id="report" className="figma-workbench">
    {activeTab === "overview" && <StaticOverviewTab report={report} />}
    {activeTab === "offence" && <StaticOffenceTab report={report} />}
    {activeTab === "defence" && <StaticDefenceTab report={report} />}
    {activeTab === "conditions" && <StaticConditionsTab report={report} />}
    {activeTab === "comparison" && <FigmaComparisonTab report={report} />}
    <button type="button" className="figma-reset-link" onClick={onReset}>Analyse another build</button>
    <span className="sr-only" aria-live="polite">Current report tab: {reportTabs.find((tab) => tab.id === activeTab)?.label}</span>
    <button type="button" className="sr-only" onClick={() => setActiveTab("overview")}>Return to overview</button>
  </main>;
}

function FigmaOverviewRatingGrid({ ratings }: { ratings: BuildQuality["categoryRatings"] }) {
  const entries: Array<[keyof typeof ratings, string]> = [["dps", "DPS"], ["clear", "Clear"], ["defence", "Defence"], ["bossing", "Bossing"]];
  const explanations: Record<string, string> = {
    DPS: "Rates the damage output PoB reports for the selected main skill, with confidence reduced when the result depends on temporary or unverified conditions.",
    Clear: "Rates how well the build can cover normal packs through area damage, secondary effects, movement, and on-kill support.",
    Defence: "Rates the build's ability to survive hits using effective hit pool, maximum hits, mitigation, avoidance, recovery, and reliability.",
    Bossing: "Rates practical single-target delivery, including uptime, ramp time, condition requirements, and whether the setup suits pinnacle bosses.",
  };
  const delivery = ratings.bossing.basis.find((item) => item.startsWith("Delivery model:"))?.replace("Delivery model: ", "").split(".")[0] ?? "Not identified";
  const clearEvidence = ratings.clear.basis[1] ?? "No direct coverage evidence";
  return <><div className="figma-overview-rating-grid" aria-label="Main skill ratings">{entries.map(([key, label]) => { const item = ratings[key]; return <div className="figma-overview-rating" key={key} tabIndex={0} title={explanations[label]}><span>{label}</span><strong>{item.score === null ? "?" : item.score.toFixed(1)}</strong><b>{item.grade}</b><small>{item.confidence} confidence</small>{key === "clear" && <em>{item.basis[1]}</em>}{key === "bossing" && <em>{item.basis[1]}</em>}<div className="figma-rating-tooltip" role="tooltip">{explanations[label]}</div></div>; })}</div><div className="figma-capability-rail" aria-label="Detected main build capabilities"><div><span>MAIN DELIVERY</span><strong>{delivery}</strong></div><div><span>CLEAR EVIDENCE</span><strong>{clearEvidence}</strong></div><div><span>RATING SCOPE</span><strong>Selected main setup · PoB-backed</strong></div></div></>;
}

function FigmaQualityOverviewLegacy({ report }: { report: Report }) {
  return <FigmaPanel title="Build quality overview" eyebrow="Build quality overview" className="figma-quality-panel"><div className="figma-quality-grid"><div className="figma-quality-copy"><h1>How good is this build?</h1><p>A weakest-link rating derived from imported PoB offence, effective hit pool, maximum-hit evidence, and configured-condition risk. This is a transparent screening score, not a promise that a character survives every encounter.</p><ul>{report.quality.overall.basis.slice(0, 3).map((item) => <li key={item}>{item}</li>)}</ul></div><FigmaScore label="Overall" rating={report.quality.overall} /><div className="figma-score-stack"><FigmaScore label="Offence" rating={report.quality.offence} /><FigmaScore label="Defence" rating={report.quality.defence} emphasis="blue" /></div></div><div className="figma-rating-source"><span>RATING DPS</span><strong>{report.quality.ratingDps.value === null ? "Unavailable" : compactNumber(report.quality.ratingDps.value)}</strong><small>{report.quality.ratingDps.label} · {report.quality.ratingDps.origin.replace("worker-", "worker ")}</small></div><FigmaOverviewRatingGrid ratings={report.quality.categoryRatings} /></FigmaPanel>;
}

void FigmaQualityOverviewLegacy;

function FigmaQualityOverview({ report, scenarioResult = null, onCalculate }: { report: Report; scenarioResult?: ScenarioReport | null; onCalculate?: () => void }) {
  type ScenarioKey = "configured" | "peak" | "burst" | "sustained" | "unconditional";
  const liveScenarioResult = useContext(ScenarioResultContext);
  scenarioResult = scenarioResult ?? liveScenarioResult;
  const [selectedScenario, setSelectedScenario] = useState<ScenarioKey>("configured");
  const scenarioMetricValue = (key: keyof ScenarioReport) => {
    const metric = scenarioResult?.[key];
    if (!metric || typeof metric !== "object" || !("value" in metric)) return null;
    return isNumber(metric.value) ? metric.value : null;
  };
  const configuredValue = isNumber(report.build.importedStats.fullDps) ? report.build.importedStats.fullDps : null;
  const scenarioCards: Array<{ key: ScenarioKey; label: string; value: number | null; source: string; detail: string }> = [
    { key: "configured", label: "Configured PoB", value: configuredValue, source: "Imported snapshot", detail: "Every condition selected in the export" },
    { key: "peak", label: "Highest valid", value: scenarioMetricValue("peak"), source: "Evidence-backed state", detail: "Compatible sourced conditions only" },
    { key: "burst", label: "Realistic burst", value: scenarioMetricValue("burst"), source: "Practical boss window", detail: "Temporary effects with activation limits" },
    { key: "sustained", label: "Sustained boss", value: scenarioMetricValue("sustained"), source: "Timeline estimate", detail: "Time-weighted across the encounter" },
    { key: "unconditional", label: "Unconditional", value: scenarioMetricValue("unconditional"), source: "Baseline state", detail: "Supported conditions disabled" },
  ];
  const selected = scenarioCards.find((card) => card.key === selectedScenario) ?? scenarioCards[0];
  const peakValue = scenarioMetricValue("peak");
  const realityRatio = configuredValue && peakValue !== null && configuredValue > 0 ? Math.max(0, Math.min(1, peakValue / configuredValue)) : null;
  const difference = configuredValue && peakValue !== null && configuredValue > 0 ? Math.round((1 - peakValue / configuredValue) * 100) : null;
  const reviewCount = report.conditions.filter((condition) => !condition.sourceDetected || condition.reliability !== "Reliable").length;
  const detectedCount = report.conditions.filter((condition) => condition.sourceDetected).length;
  return <FigmaPanel title="Build quality overview" eyebrow="The PoB claim versus the fight you can actually sustain" className="figma-quality-panel">
    <div className="figma-quality-grid">
      <div className="figma-quality-copy">
        <span className="figma-verdict-kicker">THE REALITY CHECK</span>
        <h1>How good is this build in reality?</h1>
        <p>Path of Building shows a configured snapshot. PoB Reality Check separates that ceiling from the damage and defence your build can support during an actual encounter.</p>
        <div className="figma-verdict-line"><span>THIS REPORT MEASURES</span><strong>Power - reliability - survivability</strong></div>
        <ul>{report.quality.overall.basis.slice(0, 3).map((item) => <li key={item}>{item}</li>)}</ul>
      </div>
      <FigmaScore label="Overall build" rating={report.quality.overall} icon="★" />
      <div className="figma-score-stack"><FigmaScore label="Offence" rating={report.quality.offence} icon="⚔" /><FigmaScore label="Defence" rating={report.quality.defence} emphasis="blue" icon="◈" /></div>
    </div>
    <div className="figma-subsection-heading figma-rating-heading"><div><span>HOW THE SCORE IS BUILT</span><strong>Performance across real combat jobs</strong></div><small>Hover a category to see what it measures</small></div>
    <FigmaOverviewRatingGrid ratings={report.quality.categoryRatings} />
    <div className="figma-reality-ladder" aria-label="Combat reality scenarios">
      <div className="figma-subsection-heading"><div><span>THE NUMBER THAT MATTERS</span><strong>Choose a combat state</strong></div><div className="figma-scenario-heading-actions"><small>{scenarioResult ? "Worker states loaded" : "Run scenarios to separate the PoB ceiling"}</small>{onCalculate && <button type="button" className="button figma-overview-calculate" onClick={onCalculate}>Calculate scenarios</button>}</div></div>
      <div className="figma-scenario-selector" role="tablist" aria-label="Combat reality scenarios">{scenarioCards.map((card) => <button type="button" role="tab" aria-selected={selectedScenario === card.key} className={`figma-scenario-card ${selectedScenario === card.key ? "active" : ""} ${card.value === null ? "unavailable" : ""}`} key={card.key} onClick={() => setSelectedScenario(card.key)}><span>{card.label}</span><strong>{card.value === null ? "-" : compactNumber(card.value)}</strong><small>{card.source}</small></button>)}</div>
      <div className="figma-selected-scenario"><div><span>SELECTED STATE</span><strong>{selected.label}</strong><p>{selected.detail}</p></div><b>{selected.value === null ? "Worker required" : compactNumber(selected.value)}</b></div>
    </div>
    <div className="figma-reality-proof"><div><span>POB CEILING USED FOR RATING</span><strong>{report.quality.ratingDps.value === null ? "Unavailable" : compactNumber(report.quality.ratingDps.value)}</strong><small>{report.quality.ratingDps.label} - {report.quality.ratingDps.origin.replace("worker-", "worker ")}</small></div><div><span>CONDITIONS WITH EVIDENCE</span><strong>{detectedCount}</strong><small>Source-backed effects found in the build</small></div><div><span>NEEDS REVIEW</span><strong>{reviewCount}</strong><small>Temporary, situational, ramping, or unverified dependencies</small></div></div>
    <div className="figma-reality-gap"><div><span>CONFIGURED CEILING</span><strong>{configuredValue === null ? "Unavailable" : compactNumber(configuredValue)}</strong></div><div className="figma-reality-track" aria-label="Configured versus highest valid DPS"><span style={{ width: realityRatio === null ? "0%" : `${realityRatio * 100}%` }} /></div><div><span>HIGHEST VALID</span><strong>{peakValue === null ? "Worker required" : compactNumber(peakValue)}</strong></div><p>{difference === null ? "Run the authoritative worker to measure how much of the configured state survives the reality check." : `The evidence-backed peak is ${difference}% below the configured PoB ceiling.`}</p></div>
    <div className="figma-rating-source"><span>RATING SCOPE</span><strong>{report.quality.ratingDps.value === null ? "Unavailable" : compactNumber(report.quality.ratingDps.value)}</strong><small>Ratings are anchored to imported PoB output, then tempered by defence and conditional risk.</small></div>
  </FigmaPanel>;
}

function FigmaOverviewTab({ report, scenarioResult, onScenarioResult }: { report: Report; scenarioResult: ScenarioReport | null; onScenarioResult: (result: ScenarioReport) => void }) {
  const [scenarioRunRequest, setScenarioRunRequest] = useState(0);
  const stats = report.build.importedStats;
  const qualityStats = [
    ["Configured PoB DPS", importedDps(stats.fullDps), "damage", "⚡", "Imported"],
    ["Highest valid DPS", scenarioValue(scenarioResult, "peak"), "damage", "✕", "Worker state"],
    ["Sustained boss DPS", scenarioValue(scenarioResult, "sustained"), "damage", "◒", "Timeline estimate"],
    ["Unconditional DPS", scenarioValue(scenarioResult, "unconditional"), "damage", "ϟ", "All supported conditions off"],
  ] as const;
  const defenceStats = [
    ["Life", stats.life ? compactNumber(stats.life) : "Not exported", "life", "♥", "Imported"],
    ["Effective hit pool", stats.effectiveHealthPool ? compactNumber(stats.effectiveHealthPool) : "Not exported", "ehp", "◉", "Imported"],
    ["Energy shield", stats.energyShield ? compactNumber(stats.energyShield) : "Not exported", "energy", "●", "Imported"],
    ["Mana", stats.mana ? compactNumber(stats.mana) : "Not exported", "mana", "◌", "Imported"],
  ] as const;
  const keyStats = [
    ...qualityStats,
    ["Attack / cast speed", importedDps(stats.speed), "gold", "✧", "Imported"],
    ["Average hit", importedDps(stats.averageHit), "gold", "✧", "Imported"],
  ] as const;
  const defenceRows = statRows(stats, [{ key: "physicalMaximumHit", label: "Physical maximum hit", tone: "physical" }, { key: "fireMaximumHit", label: "Fire maximum hit", tone: "fire" }, { key: "coldMaximumHit", label: "Cold maximum hit", tone: "cold" }, { key: "lightningMaximumHit", label: "Lightning maximum hit", tone: "lightning" }, { key: "chaosMaximumHit", label: "Chaos maximum hit", tone: "chaos" }]).map((row) => ({ label: row.label, value: row.value, tone: row.tone }));
  return <><FigmaQualityOverview report={report} onCalculate={() => setScenarioRunRequest((value) => value + 1)} /><div className="figma-two-column"><FigmaPanel title="Offence summary" eyebrow="Damage output" className="figma-summary-panel"><h3 className="figma-subheading figma-subheading-first">Key stats</h3><div className="figma-key-stat-grid">{keyStats.map(([label, value, tone, icon, source]) => <FigmaStatTile key={label} label={label} value={value} tone={tone} icon={icon} source={source} />)}</div></FigmaPanel><FigmaPanel title="Defence summary" eyebrow="Survivability" className="figma-summary-panel"><div className="figma-stat-grid">{defenceStats.map(([label, value, tone, icon, source]) => <FigmaStatTile key={label} label={label} value={value} tone={tone} icon={icon} source={source} />)}</div><h3 className="figma-subheading">Maximum hit</h3><FigmaRows rows={defenceRows} /></FigmaPanel></div><FigmaPanel title="Imported Path of Building snapshot" eyebrow="Exact source data" className="figma-snapshot-panel"><div className="figma-snapshot-head"><div><h1>{report.mainSkill ?? report.build.identity.name}</h1><p>{[report.build.identity.ascendancy ?? report.build.identity.className, report.build.identity.level && `Level ${report.build.identity.level}`, report.build.identity.version].filter(Boolean).join("  ·  ")}</p></div><div className="figma-inline-badges"><span>EXACT IMPORTS</span><span>{report.audit.conditional} CONDITIONAL EFFECTS</span>{report.audit.unverified > 0 && <span>{report.audit.unverified} UNVERIFIED</span>}</div></div><div className="figma-snapshot-rail"><FigmaStatTile label="Configured PoB DPS" value={importedDps(stats.fullDps)} tone="damage" icon="⚡" source="Imported" /><FigmaStatTile label="Hit DPS" value={importedDps(stats.totalDps)} tone="damage" icon="✦" source="Imported" /><FigmaStatTile label="Average hit" value={importedDps(stats.averageHit)} tone="gold" icon="◌" source="Imported" /><FigmaStatTile label="Attack / cast speed" value={importedDps(stats.speed)} tone="gold" icon="↯" source="Imported" /></div></FigmaPanel><FigmaPanel title="Combat scenarios" eyebrow="Timeline analysis" className="figma-combat-panel"><ScenarioPanelV2 xml={report.build.rawXml} stats={stats} channels={report.build.damageChannels} onResult={onScenarioResult} runRequest={scenarioRunRequest} /></FigmaPanel><FigmaPanel title="Build loadout" eyebrow="Imported equipment and socket groups" className="figma-loadout-panel"><BuildLoadoutPanel skillSetups={report.build.skillSetups} equippedItems={report.build.equippedItems} summary={report.sourceSummary} /></FigmaPanel></>;
}

function FigmaOffenceTab({ report, scenarioResult, onScenarioResult }: { report: Report; scenarioResult: ScenarioReport | null; onScenarioResult: (result: ScenarioReport) => void }) {
  const stats = report.build.importedStats;
  const mainChannel = report.build.damageChannels.find((channel) => channel.active && channel.includeInFullDPS) ?? report.build.damageChannels.find((channel) => channel.active);
  const offenceConditions = report.conditions.filter((condition) => condition.category === "offence" || condition.category === "both");
  const conditionColumns = [offenceConditions.filter((_, index) => index % 2 === 0), offenceConditions.filter((_, index) => index % 2 === 1)];
  return <><FigmaPanel title="Offence" eyebrow="Damage output" className="figma-page-panel"><div className="figma-active-skill"><span>ACTIVE SKILL</span><strong>{mainChannel?.label ?? report.mainSkill ?? "Main skill not identified"}</strong><span className="figma-status-badge">{mainChannel ? "IMPORTED SETUP" : "UNAVAILABLE"}</span></div><FigmaStatTile label="Configured PoB DPS" value={importedDps(stats.fullDps)} tone="damage" icon="⚡" source="Exact imported snapshot" /><FigmaStatTile label="Hit DPS" value={importedDps(stats.totalDps)} tone="damage" icon="✦" source="Exact imported TotalDPS" /><FigmaStatTile label="Average hit" value={importedDps(stats.averageHit)} tone="gold" icon="◌" source="Imported AverageHit" /><FigmaStatTile label="Attack / cast speed" value={importedDps(stats.speed)} tone="gold" icon="↯" source="Imported PoB speed" /><h3 className="figma-subheading">Damage conditions</h3><div className="figma-offence-condition-columns">{conditionColumns.map((items, index) => <ConditionTable key={index} title="" items={items} />)}</div></FigmaPanel><FigmaPanel title="Skill setups" eyebrow="Imported socket groups" className="figma-page-panel"><SkillSetupPanel setups={report.build.skillSetups} /></FigmaPanel><FigmaPanel title="Damage channels" eyebrow="Supported active skills" className="figma-page-panel"><DamageChannelPanel xml={report.build.rawXml} channels={report.build.damageChannels} /></FigmaPanel><FigmaPanel title="Scenario lab" eyebrow="Recalculate a selected state" className="figma-page-panel"><ScenarioPanelV2 xml={report.build.rawXml} stats={stats} channels={report.build.damageChannels} onResult={onScenarioResult} /></FigmaPanel><span className="sr-only">Scenario result loaded: {scenarioResult ? "yes" : "not yet"}</span></>;
}

function DefenceGoals() {
  return <section className="figma-defence-goals" aria-label="Defence goals"><div><span>DEFENCE GOALS</span><strong>What to improve or attain</strong></div><div className="figma-defence-goal-grid"><div><b>Maximum hit</b><span>Higher is better</span><small>Build the largest possible hit pool against each damage type.</small></div><div><b>Elemental resistance</b><span>75% cap</span><small>Fire, cold, and lightning resistance should reach at least 75%.</small></div></div></section>;
}

function FigmaDefenceTab({ report, scenarioResult }: { report: Report; scenarioResult: ScenarioReport | null; onScenarioResult: (result: ScenarioReport) => void }) {
  const stats = report.build.importedStats;
  return <><FigmaPanel title="Defence" eyebrow="Survivability" className="figma-page-panel"><div className="figma-defence-grid"><DefenceInspector stats={stats} /><div className="figma-defence-notice"><strong>Baseline / typical / peak</strong><p>Temporary guard skills, flasks, charges, and conditional block are kept separate from normally available defence. Run scenarios to load authoritative alternate states.</p>{report.conditions.filter((condition) => condition.category === "defence" || condition.category === "both").slice(0, 8).map((condition) => <div className="figma-condition-row" key={condition.id}><span>{condition.displayName}</span><b>{condition.reliability} · {condition.confidence}</b></div>)}</div></div></FigmaPanel><LayerAnalysisPanel analysis={report.layers} scenarios={scenarioResult} build={report.build} conditions={report.conditions} /></>;
}

function FigmaConditionsTab({ report, scenarioResult, onScenarioResult }: { report: Report; scenarioResult: ScenarioReport | null; onScenarioResult: (result: ScenarioReport) => void }) {
  return <><FigmaPanel title="Automatic configuration" eyebrow="Only source-backed conditions are enabled" className="figma-page-panel"><p className="figma-explainer">The analyzer resets the imported configuration, then re-enables conditions supported by the build. Unknown inputs remain visible as risks rather than being silently assumed.</p><div className="figma-condition-grid">{report.conditions.filter((condition) => condition.category === "offence" || condition.category === "defence" || condition.category === "both").map((condition) => <div className="figma-condition-card" key={condition.id}><div><span className="figma-condition-dot" /> <strong>{condition.displayName}</strong></div><b>{condition.reliability}</b><em>{condition.confidence}</em><p>{condition.explanation}</p></div>)}</div><ConditionTable title="" items={report.conditions.filter((condition) => condition.category === "offence" || condition.category === "both")} /></FigmaPanel><FigmaPanel title="Encounter timeline" eyebrow="State changes across the encounter" className="figma-page-panel"><ScenarioPanelV2 xml={report.build.rawXml} stats={report.build.importedStats} channels={report.build.damageChannels} onResult={onScenarioResult} /><div className="figma-timeline-list">{scenarioResult?.timeline?.map((state) => <div key={state.id}><strong>{state.label}</strong><span>{state.durationSeconds.toFixed(1)}s</span><b>{state.dps === null ? "Unavailable" : compactNumber(state.dps)}</b><p>{state.assumptions.join(" · ") || "Engine-calculated state"}</p></div>)}</div></FigmaPanel></>;
}
void FigmaConditionsTab;

function FigmaComparisonTab({ report }: { report: Report }) {
  return <><FigmaPanel title="Poe.ninja" eyebrow="Population reference" className="figma-page-panel"><PoeNinjaComparisonPanel /></FigmaPanel><FigmaPanel title="Imported build reference" eyebrow="What this report knows" className="figma-page-panel"><div className="figma-ninja-grid"><FigmaRows rows={[{ label: "Build identity", value: report.build.identity.name }, { label: "Main skill", value: report.mainSkill ?? "Not identified" }, { label: "Imported gems", value: String(report.sourceSummary.gems) }, { label: "Imported items", value: String(report.sourceSummary.items) }]} /><div className="figma-reference-note"><strong>Reference-only comparison</strong><p>A pobb.in export does not prove a Poe.ninja account match. Provide a public character URL explicitly; the application will never guess the identity or invent numeric Poe.ninja values.</p></div></div></FigmaPanel></>;
}

function ModernReportView({ report: inputReport, onReset, scenarioResult, onScenarioResult }: { report: Report; onReset: () => void; scenarioResult: ScenarioReport | null; onScenarioResult: (result: ScenarioReport) => void }) {
  const correctedQuality = scenarioResult ? recalculateBuildQuality(inputReport.quality, inputReport.build, inputReport.conditions.map((condition) => ({ reliability: condition.reliability })), scenarioResult) : inputReport.quality;
  const report = scenarioResult ? { ...inputReport, quality: correctedQuality } : inputReport;
  const stats = report.build.importedStats;
  const normalizedMainSkill = (report.build.mainSkill ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const mainSetup = report.build.skillSetups.find((setup) => setup.includeInFullDPS) ?? report.build.skillSetups.find((setup) => setup.gems.some((gem) => (gem.displayName ?? gem.name).toLowerCase().replace(/[^a-z0-9]/g, "") === normalizedMainSkill)) ?? report.build.skillSetups.find((setup) => setup.mainActiveSkill) ?? report.build.skillSetups[0];
  const damageGems = mainSetup?.gems.filter((gem) => gem.enabled && !gem.support && !gem.provided && !gem.trigger) ?? [];
  const mainSkill = damageGems.find((gem) => normalizedMainSkill && (gem.displayName ?? gem.name).toLowerCase().replace(/[^a-z0-9]/g, "") === normalizedMainSkill) ?? damageGems[0];
  const mainSkillLabel = mainSkill?.name ?? mainSkill?.displayName ?? report.build.mainSkill ?? report.build.identity.name;
  const offenceConditions = report.conditions.filter((condition) => condition.category === "offence" || condition.category === "both");
  const defenceConditions = report.conditions.filter((condition) => condition.category === "defence" || condition.category === "both");
  const overviewStats = statRows(stats, [
    { key: "fullDps", label: "Configured PoB DPS", tone: "damage" },
    { key: "totalDps", label: "Hit DPS", tone: "damage" },
    { key: "totalDotDps", label: "DoT DPS", tone: "damage" },
    { key: "speed", label: "Attack/Cast speed", tone: "damage" },
    { key: "effectiveHealthPool", label: "Effective hit pool", tone: "defence" },
    { key: "life", label: "Life", tone: "life" },
    { key: "energyShield", label: "Energy Shield", tone: "energy" },
    { key: "mana", label: "Mana", tone: "mana" },
  ]);
  return <main id="report" className="modern-report">
    <section className="build-overview panel-frame">
      <div className="build-overview-identity"><p className="eyebrow">Imported Path of Building snapshot</p><h2>{mainSkillLabel}</h2><p className="build-subtitle">{[report.build.identity.ascendancy ?? report.build.identity.className, report.build.identity.level && `Level ${report.build.identity.level}`, report.build.identity.version && `PoB ${report.build.identity.version}`].filter(Boolean).join(" · ") || "Build identity available in export"}</p><div className="main-skill-line">{mainSkill?.iconUrl && <img src={mainSkill.iconUrl} alt="" />}{mainSkill ? <span><b>Main skill</b><strong>{mainSkillLabel}</strong><small>{mainSetup?.gems.length ?? 0}-gem setup{mainSetup?.includeInFullDPS ? " · included in Full DPS" : ""}</small></span> : <span><b>Main skill</b><strong>Not identified</strong><small>No linked setup was marked for Full DPS</small></span>}</div></div><div className="build-overview-rating"><span>BUILD QUALITY</span><strong>{report.quality.overall.score === null ? "?" : `${report.quality.overall.score}/10`}</strong><b>{report.quality.overall.grade}</b><small>{report.quality.overall.label}</small></div>
      <div className="overview-stat-rail">{overviewStats.map((row) => <div className={`overview-stat tone-${row.tone ?? "neutral"}`} key={row.key}><span>{row.label}</span><strong>{row.value}</strong><small>{row.key === "fullDps" ? "Imported configured state" : row.key === "totalDps" ? "Imported TotalDPS" : row.key === "totalDotDps" ? "Imported TotalDotDPS" : "Imported PoB stat"}</small></div>)}{!overviewStats.length && <div className="overview-empty">No calculated snapshot values were exported.</div>}</div>
      <div className="overview-flags"><span className="overview-flag flag-info">Configured values are exact imports</span>{report.audit.conditional > 0 && <span className="overview-flag flag-warning">{report.audit.conditional} conditional effect{report.audit.conditional === 1 ? "" : "s"} detected</span>}{report.audit.unverified > 0 && <span className="overview-flag flag-danger">{report.audit.unverified} unverified condition{report.audit.unverified === 1 ? "" : "s"}</span>}</div>
    </section>

    <LayerAnalysisPanel analysis={report.layers} scenarios={scenarioResult} build={report.build} conditions={report.conditions} />

    <div className="report-workbench">
      <div className="report-main-column">
        <section className="tool-panel damage-panel"><div className="tool-panel-heading"><div><p className="eyebrow">Damage output</p><h3>Offence</h3><p>Configured PoB values first; scenario values appear after the isolated worker recalculates the build.</p></div><span className="panel-mark panel-mark-damage">DAMAGE</span></div><ImportedStatsPanel title="PoB damage snapshot" description="These are exported values, not a claim about sustained gameplay." stats={stats} kind="offence" /><DamageChannelPanel xml={report.build.rawXml} channels={report.build.damageChannels} /><ScenarioPanelV2 xml={report.build.rawXml} stats={stats} channels={report.build.damageChannels} onResult={onScenarioResult} /><SkillLab xml={report.build.rawXml} setups={report.build.skillSetups} channels={report.build.damageChannels} /><ConditionTable title="Damage conditions" items={offenceConditions} /></section>
        <section className="tool-panel defence-panel"><div className="tool-panel-heading"><div><p className="eyebrow">Survivability</p><h3>Defence</h3><p>Only non-zero imported stats are shown. Temporary effects remain visible as conditions rather than being treated as permanent power.</p></div><span className="panel-mark panel-mark-defence">SURVIVE</span></div><DefenceInspector stats={stats} /><ConditionTable title="Defensive conditions" items={defenceConditions} /></section>
      </div>
      <aside className="report-side-column"><AnalysisRail report={report} /><PoeNinjaComparisonPanel /></aside>
    </div>

    <AnalysisDetails report={report} onReset={onReset} />
  </main>;
}

const snapshotLabels: Array<[LayerSnapshotState, string]> = [["baseline", "Baseline"], ["typical", "Typical"], ["peak", "Peak"]];

function LayerAnalysisPanel({ analysis, scenarios, build, conditions }: { analysis: BuildLayerAnalysis; scenarios: ScenarioReport | null; build?: { mainSkill?: string; skills: string[]; skillSetups: SkillSetup[] }; conditions?: { reliability: string }[] }) {
  const effectiveAnalysis = scenarios ? applyScenarioSnapshots(analysis, scenarios, build, conditions) : analysis;
  return <section className="layer-analyzer panel-frame"><div className="layer-analyzer-header"><div><p className="eyebrow">Build layer analyzer</p><h3>Why the build performs this way</h3><p>Baseline disables supported combat conditions and guard inputs. Typical is the imported PoB configuration. Peak enables only the detected, source-backed scenario inputs that can overlap.</p></div><span className="layer-analyzer-badge">{scenarios ? "WORKER STATES LOADED" : "RUN SCENARIOS TO COMPARE"}</span></div><div className="layer-columns"><LayerColumn title="Offence layers" side="offence" group={effectiveAnalysis.offence} /><LayerColumn title="Defence layers" side="defence" group={effectiveAnalysis.defence} /></div><div className="layer-analyzer-notes"><strong>Current limitations</strong>{effectiveAnalysis.limitations.map((limitation) => <span key={limitation}>{limitation}</span>)}</div></section>;
}

function LayerColumn({ title, side, group }: { title: string; side: "offence" | "defence"; group: BuildLayerAnalysis["offence"] }) {
  return <section className={`layer-column layer-column-${side}`}><div className="layer-column-heading"><div><h4>{title}</h4><span>{group.findings.length} layers evaluated</span></div><div className="layer-column-rating"><strong>{group.rating.score === null ? "?" : `${group.rating.score.toFixed(1)}/10`}</strong><b>{group.rating.grade}</b></div></div><div className="layer-finding-list">{group.findings.map((finding) => <LayerFindingCard finding={finding} key={finding.id} />)}</div></section>;
}

function LayerFindingCard({ finding }: { finding: BuildLayerFinding }) {
  return <article className="layer-finding"><div className="layer-finding-heading"><div><span>{finding.category}</span><h5>{finding.name}</h5></div><div className="layer-finding-rating"><strong>{finding.rating.score === null ? "?" : `${finding.rating.score.toFixed(1)}`}</strong><b>{finding.rating.grade}</b></div></div><p className="layer-verdict">{finding.verdict}</p><div className="layer-snapshots">{snapshotLabels.map(([state, label]) => { const snapshot = finding.snapshots.find((entry) => entry.state === state); return <div className={`layer-snapshot layer-snapshot-${state}`} key={state}><span>{label}</span><strong>{snapshot?.status === "calculated" && snapshot.value !== undefined ? compactNumber(snapshot.value) : "—"}</strong><small>{snapshot?.status === "calculated" ? snapshot.source : "Worker required"}</small></div>; })}</div><details className="layer-evidence"><summary>Evidence and failure conditions</summary><div><h6>Evidence</h6><ul>{finding.evidence.length ? finding.evidence.map((item) => <li key={item}>{item}</li>) : <li>No direct evidence was exported.</li>}</ul><h6>Conditions</h6><p>{finding.conditions.length ? finding.conditions.join(" · ") : "No additional conditions detected."}</p><h6>Weakness</h6><ul>{finding.weaknesses.map((item) => <li key={item}>{item}</li>)}</ul></div></details></article>;
}

function DefenceInspector({ stats }: { stats: Stats }) {
  if (!hasUniformElementalMaximumHit(stats)) stats = { ...stats, elementalMaximumHit: undefined };
  const groups = [
    { title: "Survivability", rows: statRows(stats, [{ key: "effectiveHealthPool", label: "Effective hit pool", tone: "ehp" }, { key: "life", label: "Life", tone: "life" }, { key: "energyShield", label: "Energy Shield", tone: "energy" }, { key: "mana", label: "Mana", tone: "mana" }]) },
    { title: "Maximum hit", rows: statRows(stats, [{ key: "physicalMaximumHit", label: "Physical", tone: "physical" }, { key: "fireMaximumHit", label: "Fire", tone: "fire" }, { key: "coldMaximumHit", label: "Cold", tone: "cold" }, { key: "lightningMaximumHit", label: "Lightning", tone: "lightning" }, { key: "elementalMaximumHit", label: "Elemental summary", tone: "lightning" }, { key: "chaosMaximumHit", label: "Chaos", tone: "chaos" }]) },
    { title: "Resistances", rows: statRows(stats, [{ key: "fireResistance", label: "Fire resistance", tone: "fire", format: "percent" }, { key: "coldResistance", label: "Cold resistance", tone: "cold", format: "percent" }, { key: "lightningResistance", label: "Lightning resistance", tone: "lightning", format: "percent" }, { key: "chaosResistance", label: "Chaos resistance", tone: "chaos", format: "percent" }]) },
    { title: "Avoidance", rows: statRows(stats, [{ key: "evasion", label: "Evasion rating", tone: "evasion" }, { key: "block", label: "Attack block", tone: "block", format: "percent" }, { key: "spellBlock", label: "Spell block", tone: "spell" }, { key: "spellSuppression", label: "Spell suppression", tone: "suppression", format: "percent" }]) },
    { title: "Mitigation", rows: statRows(stats, [{ key: "armour", label: "Armour", tone: "armour" }]) },
    { title: "Recovery", rows: statRows(stats, [{ key: "lifeRegen", label: "Life regeneration", tone: "life" }, { key: "lifeLeechRate", label: "Life leech", tone: "life" }, { key: "energyShieldRegen", label: "Energy Shield regeneration", tone: "energy" }, { key: "energyShieldLeechRate", label: "Energy Shield leech", tone: "energy" }, { key: "manaRegen", label: "Mana regeneration", tone: "mana" }, { key: "manaLeechRate", label: "Mana leech", tone: "mana" }, { key: "lifeRecoup", label: "Life recoup", tone: "life" }, { key: "lifeOnHit", label: "Life on hit", tone: "life" }, { key: "lifeOnKill", label: "Life on kill", tone: "life" }]) },
  ].filter((group) => group.rows.length);
  return <div className="defence-groups">{groups.length ? groups.map((group) => <section className="defence-group" key={group.title}><h4>{group.title}</h4><div className="defence-row-list">{group.rows.map((row) => <div className={`defence-row tone-${row.tone ?? "neutral"}`} key={row.key}><span className="defence-row-label"><i aria-hidden="true">{figmaStatIcon(row.tone, row.label)}</i>{row.label}</span><strong>{row.value}</strong></div>)}</div></section>) : <div className="stats-empty">No defensive calculation values were exported by this build.</div>}</div>;
}

function ConditionTable({ title, items }: { title: string; items: Condition[] }) {
  return <section className="condition-table"><div className="condition-table-heading"><h4>{title}</h4><span>{items.length} detected</span></div>{items.length ? <div className="condition-compact-list">{items.map((condition) => <details className="condition-compact" key={condition.id}><summary><span className={`condition-state state-${condition.reliability.toLowerCase().replace(/[^a-z]+/g, "-")}`}></span><strong>{condition.displayName}</strong><em>{condition.reliability}</em><small>{condition.confidence}</small></summary><div><p>{condition.explanation}</p><p><b>Requires:</b> {condition.activationRequirement}</p>{condition.evidence[0] && <p><b>Evidence:</b> {condition.evidence[0].label} — {condition.evidence[0].detail}</p>}</div></details>)}</div> : <p className="muted">No configured conditions detected.</p>}</section>;
}

function AnalysisRail({ report }: { report: Report }) {
  const strengths = report.conditions.filter((condition) => condition.sourceDetected && (condition.reliability === "Reliable" || condition.reliability === "Conditional")).slice(0, 4);
  const weaknesses = report.recommendations.slice(0, 4);
  return <section className="analysis-rail tool-panel"><div className="tool-panel-heading"><div><p className="eyebrow">Reality check</p><h3>Build signals</h3></div></div><div className="rail-section"><h4>Strengths</h4>{strengths.length ? strengths.map((condition) => <div className="rail-row rail-positive" key={condition.id}><span>✓</span><strong>{condition.displayName}</strong><small>{condition.reliability}</small></div>) : <p className="muted">No reliable strengths were isolated from the imported evidence.</p>}</div><div className="rail-section"><h4>Weaknesses</h4>{weaknesses.length ? weaknesses.map((recommendation) => <div className="rail-row rail-warning" key={recommendation.conditionId}><span>!</span><strong>{recommendation.title}</strong><small>{recommendation.detail}</small></div>) : <p className="muted">No evidence-backed weaknesses were found.</p>}</div><div className="rail-section"><h4>Confidence</h4><div className="rail-confidence"><strong>{report.confidence}</strong><span>{report.audit.conditional} conditional · {report.audit.unverified} unverified</span></div></div></section>;
}

function AnalysisDetails({ report, onReset }: { report: Report; onReset: () => void }) {
  const rawXml = typeof report.build.rawXml === "string" ? report.build.rawXml : "Raw XML was not returned.";
  return <section className="analysis-details"><div className="analysis-detail-grid"><section className="tool-panel"><div className="tool-panel-heading"><div><p className="eyebrow">Evidence</p><h3>Warnings and assumptions</h3></div></div><div className="detail-columns"><div><h4>Warnings</h4><ul className="compact-list">{report.warnings.map((item) => <li key={item}>{item}</li>)}</ul></div><div><h4>Assumptions</h4><ul className="compact-list">{report.assumptions.map((item) => <li key={item}>{item}</li>)}</ul></div></div></section><section className="tool-panel"><div className="tool-panel-heading"><div><p className="eyebrow">Analysis</p><h3>Recommendations</h3></div></div>{report.recommendations.length ? <ul className="compact-list recommendation-list">{report.recommendations.map((recommendation) => <li key={recommendation.conditionId}><strong>{recommendation.title}:</strong> {recommendation.detail}</li>)}</ul> : <p className="muted">No evidence-backed recommendations yet.</p>}</section></div><details className="diagnostics"><summary>Show raw PoB diagnostic details</summary><pre>{rawXml.slice(0, 12000)}</pre></details><button className="example" onClick={onReset}>← Analyze another build</button></section>;
}

function LegacyReportView({ report, onReset }: { report: Report; onReset: () => void }) {
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
    <PoeNinjaComparisonPanel />
    <div className="section report-bottom-grid"><div className="card"><h3>Recommendations</h3>{report.recommendations.length ? <ul className="list">{report.recommendations.map(r => <li key={r.conditionId}><strong>{r.title}:</strong> {r.detail}</li>)}</ul> : <p className="muted">No evidence-backed findings yet.</p>}</div><div className="card"><h3>Why this rating</h3>{report.honesty.factors.length ? <ul className="list">{report.honesty.factors.map(f => <li key={f.label}><strong>{f.points}:</strong> {f.label}</li>)}</ul> : <p className="muted">No score deductions were found in the imported condition set.</p>}</div><div className="card"><h3>Warnings</h3><ul className="list">{report.warnings.map(x => <li key={x}>{x}</li>)}</ul></div><div className="card"><h3>Assumptions</h3><ul className="list">{report.assumptions.map(x => <li key={x}>{x}</li>)}</ul></div></div>
    <details className="diagnostics"><summary>Show raw diagnostic details</summary><pre>{rawXml.slice(0, 12000)}</pre></details><button className="example" onClick={onReset}>← Analyze another build</button>
  </section>;
}
void LegacyReportView;

function DamageChannelPanel({ xml, channels }: { xml: string; channels: DamageChannel[] }) {
  const [loading, setLoading] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, Record<string, number | null>>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  if (!channels.length) return null;
  async function calculateChannel(channel: DamageChannel) {
    setLoading(channel.id); setErrors((current) => ({ ...current, [channel.id]: "" }));
    try {
      const scenario: Record<string, string | number> = { skillName: channel.skillName, ...(channel.engineIndex ? { skillGroupIndex: channel.engineIndex } : {}) };
      if (channel.skillPart !== undefined) scenario.skillPartCalcs = channel.skillPart;
      if (channel.skillCount !== undefined) scenario.skillCount = channel.skillCount;
      const response = await fetch("/api/calculate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ xml, scenario }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "The channel could not be calculated.");
      setResults((current) => ({ ...current, [channel.id]: body.offence ?? {} }));
    } catch (error) {
      setErrors((current) => ({ ...current, [channel.id]: error instanceof Error ? error.message : "The channel could not be calculated." }));
    } finally { setLoading(null); }
  }
  const channelValue = (output: Record<string, number | null> | undefined, key: string) => output?.[key] === null || output?.[key] === undefined ? "—" : compactNumber(output[key] as number);
  return <section className="damage-channel-panel" aria-label="Discovered damage channels"><div className="skill-lab-heading"><div><p className="eyebrow">Universal damage model</p><h4>Discovered damage channels</h4><p>Each active damage source is kept separate. The worker remains authoritative for its actual output.</p></div><span>{channels.length} found</span></div><div className="damage-channel-grid">{channels.map((channel) => { const output = results[channel.id]; return <div className={`damage-channel-card damage-channel-${channel.kind}`} key={channel.id}><div><strong>{channel.skillName}</strong><span>{channel.kind.replace(/-/g, " ")}{channel.includeInFullDPS ? " · included in Full DPS" : ""}</span></div><small>{channel.setupLabel}{channel.skillPart !== undefined ? ` · part ${channel.skillPart}` : ""}{channel.skillCount !== undefined ? ` · count ${channel.skillCount}` : ""}</small><em>{channel.confidence} confidence · {channel.evidence[0]}</em><button type="button" className="damage-channel-button" onClick={() => void calculateChannel(channel)} disabled={loading !== null}>{loading === channel.id ? "Calculating…" : "Calculate channel"}</button>{errors[channel.id] && <small className="damage-channel-error">{errors[channel.id]}</small>}{output && <div className="damage-channel-output"><span>Full {channelValue(output, "fullDPS")}</span><span>Hit {channelValue(output, "totalDPS")}</span><span>DoT {channelValue(output, "totalDot")}</span><span>Combined {channelValue(output, "combinedDPS")}</span></div>}</div>; })}</div></section>;
}

function ImportedStatsPanel({ title, description, stats, kind }: { title: string; description: string; stats: Stats; kind: "offence" | "defence" }) {
  if (kind === "defence" && !hasUniformElementalMaximumHit(stats)) stats = { ...stats, elementalMaximumHit: undefined };
  type StatRow = { label: string; value: unknown; kind: "dps" | "value" | "percent" | "rate"; note: string };
  const allValues: StatRow[] = kind === "offence"
    ? [{ label: "Full PoB DPS", value: stats.fullDps, kind: "dps", note: "Imported FullDPS" }, { label: "Hit DPS", value: stats.totalDps, kind: "dps", note: "Imported TotalDPS" }, { label: "Damage-over-Time DPS", value: stats.totalDotDps, kind: "dps", note: "Imported TotalDotDPS" }, { label: "Combined DPS", value: stats.combinedDps, kind: "dps", note: "Imported CombinedDPS" }, { label: "Average hit", value: stats.averageHit, kind: "dps", note: "Imported AverageHit" }, { label: "Attack/Cast speed", value: stats.speed, kind: "rate", note: "PoB Speed: attack/cast speed" }]
    : [
      { label: "Life", value: stats.life, kind: "value", note: "Imported Life" },
      { label: "Energy Shield", value: stats.energyShield, kind: "value", note: "Imported EnergyShield" },
      { label: "Armour", value: stats.armour, kind: "value", note: "Imported Armour" },
      { label: "Evasion", value: stats.evasion, kind: "value", note: "Imported Evasion" },
      { label: "Mana", value: stats.mana, kind: "value", note: "Imported Mana" },
      { label: "Ward", value: stats.ward, kind: "value", note: "Imported Ward" },
      { label: "Effective hit pool", value: stats.effectiveHealthPool, kind: "value", note: "Imported TotalEHP" },
      { label: "Chance to block", value: stats.block, kind: "percent", note: "Imported block chance" },
      { label: "Chance to spell block", value: stats.spellBlock, kind: "percent", note: "Imported spell block chance" },
      { label: "Spell suppression", value: stats.spellSuppression, kind: "percent", note: "Imported suppression chance" },
      { label: "Physical maximum hit", value: stats.physicalMaximumHit, kind: "value", note: "Imported physical maximum hit" },
      { label: "Fire maximum hit", value: stats.fireMaximumHit, kind: "value", note: "Imported fire maximum hit" },
      { label: "Cold maximum hit", value: stats.coldMaximumHit, kind: "value", note: "Imported cold maximum hit" },
      { label: "Lightning maximum hit", value: stats.lightningMaximumHit, kind: "value", note: "Imported lightning maximum hit" },
      { label: "Elemental maximum hit", value: stats.elementalMaximumHit, kind: "value", note: "Highest imported elemental maximum hit" },
      { label: "Chaos maximum hit", value: stats.chaosMaximumHit, kind: "value", note: "Imported chaos maximum hit" },
      { label: "Fire resistance", value: stats.fireResistance, kind: "percent", note: "Imported fire resistance" },
      { label: "Cold resistance", value: stats.coldResistance, kind: "percent", note: "Imported cold resistance" },
      { label: "Lightning resistance", value: stats.lightningResistance, kind: "percent", note: "Imported lightning resistance" },
      { label: "Chaos resistance", value: stats.chaosResistance, kind: "percent", note: "Imported chaos resistance" },
      { label: "Life regeneration", value: stats.lifeRegen, kind: "rate", note: "Imported LifeRegen per second" },
      { label: "Life leech", value: stats.lifeLeechRate, kind: "rate", note: "Imported LifeLeechRate" },
      { label: "Recoverable Energy Shield", value: stats.energyShieldRecoveryCap, kind: "rate", note: "Imported EnergyShieldRecoveryCap" },
      { label: "Energy Shield regeneration", value: stats.energyShieldRegen, kind: "rate", note: "Imported EnergyShieldRegen per second" },
      { label: "Energy Shield leech", value: stats.energyShieldLeechRate, kind: "rate", note: "Imported EnergyShieldLeechRate" },
      { label: "Mana regeneration", value: stats.manaRegen, kind: "rate", note: "Imported ManaRegen per second" },
      { label: "Mana leech", value: stats.manaLeechRate, kind: "rate", note: "Imported ManaLeechRate" },
      { label: "Life recovery rate", value: stats.lifeRecoveryRate, kind: "percent", note: "Imported LifeRecoveryRate" },
      { label: "Energy Shield recovery rate", value: stats.energyShieldRecoveryRate, kind: "percent", note: "Imported EnergyShieldRecoveryRate" },
      { label: "Mana recovery rate", value: stats.manaRecoveryRate, kind: "percent", note: "Imported ManaRecoveryRate" },
      { label: "Life recoup", value: stats.lifeRecoup, kind: "rate", note: "Imported LifeRecoup" },
      { label: "Mana recoup", value: stats.manaRecoup, kind: "rate", note: "Imported ManaRecoup" },
      { label: "Life on hit", value: stats.lifeOnHit, kind: "rate", note: "Imported LifeOnHit" },
      { label: "Mana on hit", value: stats.manaOnHit, kind: "rate", note: "Imported ManaOnHit" },
      { label: "Life on kill", value: stats.lifeOnKill, kind: "rate", note: "Imported LifeOnKill" },
      { label: "Mana on kill", value: stats.manaOnKill, kind: "rate", note: "Imported ManaOnKill" },
      { label: "Energy Shield on hit", value: stats.energyShieldOnHit, kind: "rate", note: "Imported EnergyShieldOnHit" },
      { label: "Energy Shield on kill", value: stats.energyShieldOnKill, kind: "rate", note: "Imported EnergyShieldOnKill" },
    ];
  const values = allValues.filter(({ value }) => typeof value === "number" && Number.isFinite(value) && value !== 0);
  return <div className={`imported-stats imported-stats-${kind}`}><div className="imported-stats-header"><div><h4>{title}</h4><p>{description}</p></div><span className={`source-badge ${stats.source === "pob-calcs" ? "source-live" : "source-offline"}`}>{stats.source === "pob-calcs" ? "POB CALCS" : "NOT IN EXPORT"}</span></div>{values.length ? <div className="stat-grid">{values.map(({ label, value, kind: valueKind, note }) => <div className="stat-tile" key={label}><span>{label}</span><strong>{valueKind === "percent" ? percent(value) : compactNumber(value)}</strong><small>{note}</small></div>)}</div> : <div className="stats-empty">No imported {kind} values were found in this PoB export.</div>}</div>;
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
  return <div className="section card"><div className="external-header"><div><h3>Passive tree preview</h3><p className="muted">A fixed PoB-style viewport of the imported tree. Allocated nodes and paths are highlighted; hover any node for its imported name and type. The viewport does not zoom or pan, so the layout stays stable.</p><div className="tree-legend" aria-label="Passive tree legend"><span><i className="tree-legend-dot tree-legend-allocated"></i>Allocated</span><span><i className="tree-legend-dot tree-legend-notable"></i>Notable</span><span><i className="tree-legend-dot tree-legend-keystone"></i>Keystone</span><span><i className="tree-legend-dot tree-legend-ascendancy"></i>Ascendancy</span></div></div><span className="source-badge source-live">{nodes.length} ALLOCATED</span></div><div className="tree-layout"><div className="tree-canvas" aria-label="Full passive tree preview">{links.map(link => <span key={link.key} className={`tree-link ${link.allocated ? "tree-link-allocated" : ""}`} style={{ left: `${link.left}%`, top: `${link.top}%`, width: `${link.length}%`, transform: `rotate(${link.angle}deg)` }} />)}{graph.map((node, index) => { const point = locations.get(node.id ?? node.name)!; return <button type="button" key={`${node.id ?? node.name}-${index}`} className={`tree-point tree-point-${node.type} ${node.allocated ? "tree-point-allocated" : ""}`} style={{ left: `${point.left}%`, top: `${point.top}%` }} title={`${node.name} · ${node.type}${node.allocated ? " · allocated" : ""}`} aria-label={`${node.name}, ${node.type}${node.allocated ? ", allocated" : ""}`}><span>{node.type === "ascendancy" ? "A" : node.type === "keystone" ? "K" : node.type === "notable" ? "N" : "·"}</span></button>; })}{!graph.length && <p className="muted tree-empty">No passive tree data was found in this export.</p>}</div><div><div className="tree-list-heading"><span>Ascendancy sources</span><small>Only ascendancy nodes are summarized here.</small></div><div className="notable-list">{report.topNotables.length ? report.topNotables.map(node => <div key={node.name}><span className={`node-dot ${node.type}`}></span><strong>{node.name}</strong><small>ascendancy · contribution requires controlled engine comparison</small></div>) : <p className="muted">No allocated ascendancy nodes were found in the imported tree.</p>}</div></div></div></div>;
}
void TreePreview;

function SourceInventory({ skillSetups, equippedItems, summary }: { skillSetups: SkillSetup[]; equippedItems: EquippedItem[]; summary: Report["sourceSummary"] }) {
  return <BuildLoadoutPanel skillSetups={skillSetups} equippedItems={equippedItems} summary={summary} />;
}
void SourceInventory;

const loadoutKey = (value: string | undefined) => {
  const text = (value ?? "").toLowerCase();
  if (/weapon\s*1\s*swap|main\s*hand\s*swap/.test(text)) return "weapon-1-swap";
  if (/weapon\s*2\s*swap|off\s*hand\s*swap/.test(text)) return "weapon-2-swap";
  if (/weapon\s*1|main\s*hand/.test(text)) return "weapon-1";
  if (/weapon\s*2|off\s*hand/.test(text)) return "weapon-2";
  if (/weapon|main hand|off hand|shield|bow|quiver|wand|staff|sceptre|dagger|claw|mace|sword|axe/.test(text)) return "weapon";
  if (/helmet|helm|head/.test(text)) return "helmet";
  if (/body|chest|armour/.test(text)) return "body";
  if (/glove|hand/.test(text)) return "gloves";
  if (/boot|foot/.test(text)) return "boots";
  if (/ring/.test(text)) return "ring";
  if (/amulet|neck/.test(text)) return "amulet";
  return text.replace(/[^a-z]+/g, "");
};

function BuildLoadoutPanel({ skillSetups, equippedItems, summary }: { skillSetups: SkillSetup[]; equippedItems: EquippedItem[]; summary: Report["sourceSummary"] }) {
  const equipment = equippedItems.filter((item) => !item.isFlask);
  const flasks = equippedItems.filter((item) => item.isFlask);
  const linked = (item: EquippedItem) => skillSetups.filter((setup) => setup.slot && loadoutKey(setup.slot) === loadoutKey(item.slot));
  const assigned = new Set(skillSetups.filter((setup) => equipment.some((item) => linked(item).includes(setup))).map((setup) => setup.id));
  const unassigned = skillSetups.filter((setup) => !assigned.has(setup.id));
  return <section className="section tool-panel loadout-panel"><div className="tool-panel-heading"><div><p className="eyebrow">Character build</p><h3>Build loadout</h3><p>Equipment and its PoB skill socket groups are shown together. Hover or focus an item or gem for imported details.</p></div><div className="loadout-counts"><span>{summary.items} items</span><span>{summary.gems} gems</span><span>{summary.flasks} flasks</span></div></div>{equipment.length ? <div className="loadout-grid">{equipment.map((item, index) => { const setups = linked(item); return <article className="loadout-slot" key={`${item.id ?? item.name}-${index}`}><div className="loadout-slot-title"><span>{item.slot}</span><b>{setups.length ? `${setups.length} socket group${setups.length === 1 ? "" : "s"}` : "No linked setup detected"}</b></div><EquipmentCard item={item} />{setups.length ? <div className="socket-groups">{setups.map((setup) => <div className="socket-group" key={setup.id}><div className="socket-group-heading"><strong>{setup.label}</strong>{setup.includeInFullDPS && <span>MAIN DPS</span>}</div><div className="socket-gem-list">{setup.gems.map((gem, gemIndex) => <GemChip gem={gem} key={`${setup.id}-${gem.name}-${gemIndex}`} />)}</div></div>)}</div> : null}</article>; })}</div> : <div className="stats-empty">No equipped equipment slots were found in this export.</div>}{flasks.length ? <section className="loadout-flasks"><div className="loadout-subheading"><h4>Flasks</h4><span>Temporary sources are audited separately</span></div><div className="flask-grid">{flasks.map((item, index) => <EquipmentCard item={item} key={`flask-${item.id ?? item.name}-${index}`} />)}</div></section> : null}{unassigned.length ? <details className="unassigned-setups"><summary>Other skill setups <span>{unassigned.length}</span></summary><div className="unassigned-gems">{unassigned.map((setup) => <div className="socket-group" key={setup.id}><div className="socket-group-heading"><strong>{setup.label}</strong>{setup.includeInFullDPS && <span>MAIN DPS</span>}</div><div className="socket-gem-list">{setup.gems.map((gem, index) => <GemChip gem={gem} key={`${setup.id}-${gem.name}-${index}`} />)}</div></div>)}</div></details> : null}</section>;
}

function GemChip({ gem }: { gem: Gem }) {
  const name = gem.displayName ?? gem.name;
  const metadata = [gem.level !== undefined ? `Level ${gem.level}` : "", gem.quality !== undefined ? `Quality ${gem.quality}%` : "", gem.support ? "Support" : "Active skill", gem.trigger ? "Triggered" : ""].filter(Boolean).join(" · ");
  return <span className="gem-chip-wrap" role="button" tabIndex={0} aria-label={`${name} gem details`}><span className={`gem-chip gem-${gem.attributeColor}`}><span className={`gem-icon gem-${gem.attributeColor}`}>{gem.iconUrl ? <img src={gem.iconUrl} alt="" /> : <span>◆</span>}</span><span className={`gem-text-${gem.attributeColor}`}>{name}</span>{gem.level !== undefined && <small>{gem.level}{gem.quality !== undefined ? ` / ${gem.quality}` : ""}</small>}</span><span className="gem-chip-tooltip" role="tooltip"><strong>{name}</strong><span>{metadata}</span><p>{gem.detail}</p></span></span>;
}

function SkillSetupPanel({ setups }: { setups: SkillSetup[] }) {
  return <div className="inventory-group skill-setups">
    <h4>Skill gems</h4>
    {setups.length ? <div className="skill-setup-list">{setups.map((setup) => <div className="skill-setup" key={setup.id}>
      <div className="skill-setup-header"><div><strong>{setup.label}</strong>{setup.slot && <small>{setup.slot}</small>}</div><div className="setup-badges">{setup.includeInFullDPS && <span className="setup-badge setup-badge-main">FULL DPS</span>}{!setup.enabled && <span className="setup-badge">DISABLED</span>}</div></div>
      <div className="gem-list">{setup.gems.map((gem, index) => {
        const name = gem.displayName ?? gem.name;
        const secondaryName = gem.displayName && gem.name !== gem.displayName ? gem.name : "";
        const metadata = [gem.level !== undefined ? `Level ${gem.level}` : "", gem.quality !== undefined ? `Quality ${gem.quality}%` : "", gem.support ? "Support" : "Active skill", gem.trigger ? "Triggered" : ""].filter(Boolean).join(" · ");
        return <div className="gem-row-wrap" key={`${setup.id}-${gem.name}-${index}`}>
          <details className="gem-row">
            <summary><span className={`gem-icon gem-${gem.attributeColor}`}>{gem.iconUrl ? <img src={gem.iconUrl} alt="" /> : <span>◆</span>}</span><span className={`gem-name gem-text-${gem.attributeColor}`}>{name}<small>{secondaryName}</small></span><span className="gem-tags">{gem.support && <i>Support</i>}{gem.trigger && <i>Trigger</i>}{gem.provided && <i>Provided</i>}{gem.level !== undefined && <b>{gem.level}{gem.quality !== undefined ? ` / ${gem.quality}` : ""}</b>}</span></summary>
            <div className="gem-detail"><strong>{name}</strong><span>{gem.detail}</span><span>{gem.enabled ? "Enabled in imported setup" : "Disabled in imported setup"}</span></div>
          </details>
          <div className="gem-hover-tooltip" role="tooltip"><strong>{name}</strong><span>{metadata}</span><p>{gem.detail}</p><small>Click to keep this detail open · hover or focus for a quick view</small></div>
        </div>;
      })}</div>
    </div>)}</div> : <p className="muted">No linked skill setups were found in this export.</p>}
  </div>;
}
void SkillSetupPanel;
void LegacySkillSetupPanel;

function LegacySkillSetupPanel({ setups }: { setups: SkillSetup[] }) {
  return <div className="inventory-group skill-setups"><h4>Skill gems</h4>{setups.length ? <div className="skill-setup-list">{setups.map((setup) => <div className="skill-setup" key={setup.id}><div className="skill-setup-header"><div><strong>{setup.label}</strong>{setup.slot && <small>{setup.slot}</small>}</div><div className="setup-badges">{setup.includeInFullDPS && <span className="setup-badge setup-badge-main">FULL DPS</span>}{!setup.enabled && <span className="setup-badge">DISABLED</span>}</div></div><div className="gem-list">{setup.gems.map((gem, index) => <details className="gem-row" key={`${setup.id}-${gem.name}-${index}`}><summary><span className={`gem-icon gem-${gem.attributeColor}`}>{gem.iconUrl ? <img src={gem.iconUrl} alt="" /> : <span>◆</span>}</span><span className={`gem-name gem-text-${gem.attributeColor}`}>{gem.displayName ?? gem.name}<small>{gem.name !== gem.displayName ? gem.name : ""}</small></span><span className="gem-tags">{gem.support && <i>Support</i>}{gem.trigger && <i>Trigger</i>}{gem.provided && <i>Provided</i>}{gem.level !== undefined && <b>{gem.level}{gem.quality !== undefined ? ` / ${gem.quality}` : ""}</b>}</span></summary><div className="gem-detail"><strong>{gem.displayName ?? gem.name}</strong><span>{gem.detail}</span><span>{gem.enabled ? "Enabled in imported setup" : "Disabled in imported setup"}</span></div></details>)}</div></div>)}</div> : <p className="muted">No linked skill setups were found in this export.</p>}</div>;
}

function EquipmentPanel({ items }: { items: EquippedItem[] }) {
  const equipment = items.filter((item) => !item.isFlask);
  const weaponSwap = equipment.filter((item) => /swap/i.test(item.slot));
  const socketed = equipment.filter((item) => /socket/i.test(item.slot) && !weaponSwap.includes(item));
  const primary = equipment.filter((item) => !weaponSwap.includes(item) && !socketed.includes(item));
  const flasks = items.filter((item) => item.isFlask);
  const section = (title: string, rows: EquippedItem[], className = "") => rows.length ? <div className={`inventory-subsection ${className}`}><div className="equipment-subtitle"><span>{title}</span><b>{rows.length}</b></div><div className={`equipment-grid ${title === "Primary equipment" ? "equipment-slot-grid" : ""}`}>{rows.map((item, index) => <EquipmentCard item={item} key={`${title}-${item.id ?? item.name}-${index}`} />)}</div></div> : null;
  return <div className="inventory-group equipment-panel"><h4>Equipment and flasks</h4>{items.length ? <>{section("Primary equipment", primary)}{section("Weapon swap · alternate PoB slots", weaponSwap, "equipment-subsection-secondary")}{section("Socketed jewels", socketed, "equipment-subsection-secondary")}{flasks.length ? <div className="inventory-subsection"><div className="equipment-subtitle"><span>Flasks</span><b>{flasks.length}</b></div><div className="equipment-grid equipment-grid-flasks">{flasks.map((item, index) => <EquipmentCard item={item} key={`flask-${item.id ?? item.name}-${index}`} />)}</div></div> : <p className="muted">No active flasks were found.</p>}</> : <p className="muted">No active equipment slots were found in this export.</p>}</div>;
}
void EquipmentPanel;

function EquipmentCard({ item }: { item: EquippedItem }) {
  const text = item.text || "No item text was included in the export.";
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const preview = lines.filter((line) => !/^(rarity|item class|requirements|level|quality)\s*:/i.test(line) && line !== item.name).slice(0, 2);
  const detailLines = lines.filter((line) => line !== item.name);
  const slotText = item.slot.toLowerCase();
  const glyph = item.isFlask ? "◈" : /weapon|sceptre|wand|staff|bow|dagger|claw|sword|axe|mace|shield/.test(slotText) ? "⚔" : /helmet|helm/.test(slotText) ? "◉" : /body|armour/.test(slotText) ? "⬟" : /glove/.test(slotText) ? "✤" : /boot/.test(slotText) ? "⌁" : /ring|amulet/.test(slotText) ? "◇" : /jewel/.test(slotText) ? "✹" : "✦";
  const rarityClass = (item.rarity ?? "unknown").toLowerCase().replace(/[^a-z]+/g, "-");
  const metadata = [item.slot, item.rarity, item.baseType, item.links && `${item.links} links`].filter(Boolean).join(" · ");
  return <div className="equipment-card-wrap">
    <details className={`equipment-card rarity-${rarityClass}`}>
      <summary><div className="equipment-art">{item.iconUrl ? <img src={item.iconUrl} alt={`${item.name} artwork`} /> : <span>{glyph}</span>}<i>{item.isFlask ? "FLASK" : item.rarity ?? "ITEM"}</i></div><div className="equipment-copy"><small>{item.slot}</small><strong>{item.name}</strong><span>{[item.baseType, item.links && `${item.links} links`].filter(Boolean).join(" · ") || "Imported PoB item"}</span>{preview.map((line) => <span className="equipment-preview" key={line}>{line}</span>)}<b className="equipment-inspect-hint">View imported stats</b></div></summary>
      <div className="equipment-detail"><span>{item.corrupted ? "Corrupted" : "Imported PoB text"}</span><div className="equipment-detail-lines">{detailLines.map((line, index) => <p key={`${line}-${index}`} className={/implicit|enchant|fractured|crafted|damage|resistance|energy shield|armour|evasion/i.test(line) ? "item-modifier" : ""}>{line}</p>)}</div></div>
    </details>
    <div className="equipment-hover-tooltip" role="tooltip"><strong>{item.name}</strong><span>{metadata || "Imported PoB item"}</span><p>{text}</p><small>Click the item to keep this detail open · hover or focus for a quick view</small></div>
  </div>;
}
void LegacyEquipmentCard;

function LegacyEquipmentCard({ item }: { item: EquippedItem }) {
  const preview = item.text.split(/\r?\n/).filter((line) => line.trim() && !/^(rarity|item class|requirements|level|quality)\s*:/i.test(line.trim()) && line.trim() !== item.name).slice(0, 2);
  return <details className="equipment-card"><summary><div className="equipment-art">{item.iconUrl ? <img src={item.iconUrl} alt="" /> : <span>{item.isFlask ? "◈" : "✦"}</span>}</div><div className="equipment-copy"><small>{item.slot}</small><strong>{item.name}</strong><span>{[item.rarity, item.baseType, item.links && `${item.links} links`].filter(Boolean).join(" · ") || "Imported PoB item"}</span>{preview.map((line) => <span className="equipment-preview" key={line}>{line}</span>)}</div></summary><div className="equipment-detail"><span>{item.corrupted ? "Corrupted" : "Uncorrupted or not marked"}</span><p>{item.text || "No item text was included in the export."}</p></div></details>;
}

function ConditionGroup({ title, items }: { title: string; items: Condition[] }) { return <div className="condition-group">{title && <h3>{title}</h3>}{items.length ? items.map(c => <details className="condition" key={c.id}><summary><span><span className="condition-name">{c.displayName}</span><span className="condition-sub">{c.sourceDetected ? "Source evidence found" : "Source unverified"}</span></span><span className={`tag ${c.sourceDetected ? "tag-good" : "tag-unknown"}`}>{c.reliability} · {c.confidence}</span></summary><p>{c.explanation}</p><p className="requirement"><strong>Requires:</strong> {c.activationRequirement}</p><p className="requirement"><strong>Affects:</strong> {c.statsAffected.join(", ")}</p><div className="evidence-list">{c.evidence.map((e, index) => <div className="evidence" key={`${e.label}-${index}`}><span>{e.kind}</span><div><strong>{e.label}</strong><small>{e.detail}</small></div></div>)}</div></details>) : <p className="muted">No configured conditions detected in this category.</p>}</div>; }

function ScenarioPanelV2({ xml, stats, channels = [], onResult, runRequest = 0, disabledAutomatic: controlledDisabledAutomatic, onDisabledAutomaticChange }: { xml: string; stats: Stats; channels?: DamageChannel[]; onResult?: (result: ScenarioReport) => void; runRequest?: number; disabledAutomatic?: string[]; onDisabledAutomaticChange?: (ids: string[]) => void }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScenarioResult | null>(null);
  const [error, setError] = useState("");
  const [encounterSeconds, setEncounterSeconds] = useState(30);
  const [engineStatus, setEngineStatus] = useState<EngineStatus | null>(null);
  const [localDisabledAutomatic, setLocalDisabledAutomatic] = useState<string[]>([]);
  const disabledAutomatic = controlledDisabledAutomatic ?? localDisabledAutomatic;
  const updateDisabledAutomatic = onDisabledAutomaticChange ?? setLocalDisabledAutomatic;
  const [skillPart, setSkillPart] = useState("");
  const [skillCount, setSkillCount] = useState("");
  const [totemsSummoned, setTotemsSummoned] = useState("");
  const onResultRef = useRef(onResult);
  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);
  const hasTotemChannel = channels.some((channel) => channel.kind === "totem");
  useEffect(() => {
    let active = true;
    void fetch("/api/engine/status").then(response => response.json()).then(body => { if (active) setEngineStatus(body as EngineStatus); }).catch(() => { if (active) setEngineStatus({ state: "unreachable", message: "The worker status could not be checked." }); });
    return () => { active = false; };
  }, []);
  const run = useCallback(async (nextDisabled = disabledAutomatic) => {
    setLoading(true); setError("");
    try {
      const scenarioOverrides = { ...(skillPart ? { skillPartCalcs: Number(skillPart) } : {}), ...(totemsSummoned ? { TotemsSummoned: Number(totemsSummoned) } : {}) };
      const response = await fetch("/api/scenarios", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ xml, encounterSeconds, disabledAutomatic: nextDisabled, scenario: scenarioOverrides }) });
      const body = await response.json();
      if (!response.ok) { if (body.engine) setEngineStatus(body.engine as EngineStatus); throw new Error(body.error); }
      setResult(body); onResultRef.current?.(body as ScenarioReport); setEngineStatus({ state: "ready", message: "The isolated Path of Building worker is ready." });
    } catch (e) { setError(e instanceof Error ? e.message : "Scenario calculation unavailable."); }
    finally { setLoading(false); }
  }, [disabledAutomatic, encounterSeconds, skillPart, totemsSummoned, xml]);
  useEffect(() => {
    if (runRequest <= 0) return;
    const timer = window.setTimeout(() => void run(), 0);
    return () => window.clearTimeout(timer);
  }, [runRequest, run]);
  const labels: [string, string][] = [["configured", "Imported snapshot"], ["recommended", "Typical combat DPS"], ["peak", "Peak valid DPS"], ["burst", "Realistic burst DPS"], ["initial", "Opening boss DPS"], ["sustained", "Sustained boss DPS"], ["mapping", "Mapping DPS"]];
  const workerReady = engineStatus?.state === "ready";
  const workerLabel = engineStatus === null ? "Checking worker..." : workerReady ? "Worker ready" : engineStatus.state === "not-configured" ? "Worker not configured" : "Worker offline";
  const metricValue = (metric: Metric | undefined) => metric?.value === null || metric?.value === undefined ? "Unavailable" : compactNumber(metric.value);
  const metricStatus = (metric: Metric | undefined) => metric ? `${metric.status} · ${metric.confidence} confidence` : "Requires the authoritative PoB worker";
  return <div className="section card scenario-panel">
    <div className="scenario-header">
      <div><div className="scenario-title-row"><h3>Combat scenarios</h3><span className={`engine-state engine-state-${engineStatus?.state ?? "checking"}`}>{workerLabel}</span></div><p className="muted">The imported PoB snapshot is exact. Alternate states are recalculated by the isolated Headless PoB worker.</p></div>
      <div className="scenario-actions"><label><span>Encounter length</span><div><input className="duration-input" type="number" min="1" max="300" value={encounterSeconds} onChange={e => setEncounterSeconds(Number(e.target.value) || 30)} /><b>seconds</b></div></label><label title="Advanced PoB override. This selects an alternate calculation part such as an explosion, stage, or secondary effect."><span>Damage mode part</span><div><input className="duration-input" type="number" min="1" max="10" placeholder="Auto" value={skillPart} onChange={e => setSkillPart(e.target.value)} /><b>part</b></div></label><label title="Advanced PoB override. This is skill instances, hits, projectiles, or other PoB count—not automatically your totem count."><span>Skill instances / hits</span><div><input className="duration-input" type="number" min="1" max="20" placeholder="Auto" value={skillCount} onChange={e => setSkillCount(e.target.value)} /><b>count</b></div></label><button className="button scenario-button" onClick={() => void run()} disabled={loading || !workerReady}>{loading ? "Calculating..." : workerReady ? "Run scenarios" : "Worker required"}</button></div>
    </div>
    {result?.autoConfiguration?.length ? <button type="button" className="scenario-config-reset" onClick={() => { const next = disabledAutomatic.length ? [] : result.autoConfiguration!.map((hint) => hint.id); updateDisabledAutomatic(next); void run(next); }} disabled={loading}>{disabledAutomatic.length ? "Use automatic suggestions" : "Test without automatic suggestions"}</button> : null}

    <details className="scenario-advanced"><summary>Advanced PoB mode <small>Optional — most builds should leave this on Auto</small></summary><div className="scenario-advanced-explainer"><p><strong>Damage mode = which branch?</strong> It selects an alternate branch of the skill calculation, such as Storm Burst orb tick versus Max Duration Explode, a stage, or a secondary effect.</p>{hasTotemChannel ? <p><strong>Active totems = how many delivery sources?</strong> Totems and Ballistas use this same control. Enter the number that are actually contributing; for your setup, enter 4 when four totems are active.</p> : null}<p><strong>PoB calculates effect counts automatically.</strong> Orb, projectile, hit, trap, mine, and similar counts stay on the imported skill setup unless PoB explicitly exported a separate override.</p><p className="scenario-advanced-warning">Leave this section on Auto for normal imports. Only set a value when you are matching a specific PoB calculation panel.</p></div><div className="scenario-advanced-fields">{hasTotemChannel ? <label title="Number of active Totems or Ballistas contributing to the scenario."><span>Active totems / ballistas</span><input className="duration-input" type="number" min="0" max="20" placeholder="Auto" value={totemsSummoned} onChange={e => setTotemsSummoned(e.target.value)} /></label> : null}<label title="Which alternate damage mode/branch PoB should calculate."><span>Damage mode</span><input className="duration-input" type="number" min="1" max="10" placeholder="Auto" value={skillPart} onChange={e => setSkillPart(e.target.value)} /></label><button type="button" className="button" onClick={() => void run()} disabled={loading || !workerReady}>{loading ? "Recalculate" : "Apply advanced mode"}</button></div></details>
    <div className="scenario-block-label">Imported PoB snapshot</div>
    <div className="scenario-grid scenario-snapshot"><div className="scenario-metric scenario-metric-imported"><span>Full PoB DPS</span><strong>{importedDps(stats.fullDps)}</strong><small>{isNumber(stats.fullDps) && stats.fullDps > 0 ? "Exact exported aggregate FullDPS" : "PoB did not export an aggregate FullDPS value"}</small></div><div className="scenario-metric scenario-metric-imported"><span>Hit DPS</span><strong>{importedDps(stats.totalDps)}</strong><small>Exact exported TotalDPS channel</small></div>{isNumber(stats.totalDotDps) && stats.totalDotDps !== 0 ? <div className="scenario-metric scenario-metric-imported"><span>Damage-over-Time DPS</span><strong>{importedDps(stats.totalDotDps)}</strong><small>Exact exported TotalDotDPS channel</small></div> : null}<div className="scenario-metric scenario-metric-baseline"><span>Unconditional DPS</span><strong>{metricValue(result?.unconditional)}</strong><small>{result?.unconditional ? "All supported combat conditions disabled" : "Run scenarios to calculate the baseline"}</small></div></div>
    {engineStatus && !workerReady && <div className="engine-setup" role="status"><strong>Alternate scenarios are paused.</strong><span>{engineStatus.message}</span><small>For local analysis, start the isolated PoB worker, then set <code>POB_ENGINE_URL=http://127.0.0.1:8080</code> before starting the website. The hosted website also needs a separately deployed worker endpoint; it cannot run LuaJIT inside the web page.</small></div>}
    {error && <p className="engine-status"><strong>Scenario request failed:</strong> {error}</p>}
    <div className="scenario-block-label scenario-block-label-derived">Derived combat states</div>
    <div className="scenario-grid scenario-grid-derived">{labels.map(([id, label]) => { const metric = result?.[id]; return <div className={`scenario-metric scenario-metric-${id}`} key={id}><span>{label}</span><strong>{metricValue(metric)}</strong><small>{metricStatus(metric)}</small>{metric && (metric.damageChannel || metric.includedConditions?.length) ? <em>{[metric.damageChannel ? `Channel: ${metric.damageChannel}` : null, ...(metric.includedConditions ?? [])].filter(Boolean).join(" · ")}</em> : null}{metric?.assumptions?.length ? <i>{metric.assumptions[0]}</i> : null}</div>; })}</div>
    {result?.autoConfiguration?.length ? <div className="auto-config-panel"><div className="scenario-block-label">Automatic configuration</div><p className="muted">The analyzer resets poe.ninja’s incomplete state, then enables only build-supported effects. Missing numeric inputs use bounded median defaults.</p><div className="auto-config-list">{result.autoConfiguration.map((hint) => <div className="auto-config-row" key={hint.id}><span className="auto-config-toggle">ON</span><strong>{hint.label}</strong><b>{hint.value}</b><small>{hint.confidence} confidence · {hint.reason}</small></div>)}</div></div> : null}
    {result?.timeline?.length ? <div className="scenario-timeline"><h4>Encounter timeline</h4>{result.timeline.map((state) => <div className="timeline-row" key={state.id}><span>{state.label}</span><b>{state.durationSeconds.toFixed(1)}s</b><strong>{compactNumber(state.dps)}</strong><small>{state.assumptions.join(" ")}</small></div>)}</div> : null}
  </div>;
}

type SkillLabResult = {
  offence: Record<string, number | null>;
  minion?: Record<string, number | null>;
  diagnostics: string[];
};

function SkillLab({ xml, setups, channels }: { xml: string; setups: SkillSetup[]; channels: DamageChannel[] }) {
  const selectable = setups.flatMap((setup) => setup.gems
    .filter((gem) => gem.enabled && !gem.support)
    .map((gem) => ({ setup, gem })));
  const main = selectable.find(({ setup }) => setup.includeInFullDPS) ?? selectable[0];
  const [selected, setSelected] = useState(main ? `${main.setup.engineIndex ?? main.setup.id}:${main.gem.name}` : "");
  const [result, setResult] = useState<SkillLabResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const selectedEntry = selectable.find(({ setup, gem }) => `${setup.engineIndex ?? setup.id}:${gem.name}` === selected);
  const selectedChannel = channels.find((channel) => channel.setupId === selectedEntry?.setup.id && channel.skillName === selectedEntry?.gem.name);

  async function calculate() {
    if (!selectedEntry) return;
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/calculate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ xml, scenario: { skillName: selectedEntry.gem.name, skillGroupIndex: selectedEntry.setup.engineIndex } }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "The selected skill could not be calculated.");
      setResult(body as SkillLabResult);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The selected skill could not be calculated."); }
    finally { setLoading(false); }
  }

  const value = (group: Record<string, number | null> | undefined, key: string) => group?.[key] === null || group?.[key] === undefined ? "Unavailable" : compactNumber(group[key]);
  const speed = (group: Record<string, number | null> | undefined) => group?.attackSpeed !== null && group?.attackSpeed !== undefined ? compactNumber(group.attackSpeed) : group?.castSpeed !== null && group?.castSpeed !== undefined ? compactNumber(group.castSpeed) : value(group, "speed");
  return <section className="skill-lab">
    <div className="skill-lab-heading"><div><p className="eyebrow">PoB skill lab</p><h4>Compare active gems</h4><p>Choose an active gem already present in this export. PoB recalculates that setup; supports and conditions remain those in the imported build.</p></div><span>{selectable.length} selectable</span></div>
    {selectable.length ? <div className="skill-lab-controls"><label htmlFor="skill-lab-select">Active skill<select id="skill-lab-select" value={selected} onChange={(event) => { setSelected(event.target.value); setResult(null); }}>{selectable.map(({ setup, gem }) => <option key={`${setup.engineIndex ?? setup.id}:${gem.name}`} value={`${setup.engineIndex ?? setup.id}:${gem.name}`}>{setup.label} · {gem.displayName ?? gem.name}{setup.includeInFullDPS ? " · main" : ""}</option>)}</select></label><button className="button" onClick={() => void calculate()} disabled={loading || !selectedEntry}>{loading ? "Calculating..." : "Calculate selected skill"}</button></div> : <p className="muted">No enabled active gems were found in the imported setups.</p>}
    {selectedEntry && <p className="skill-lab-selection">Selected: <strong>{selectedEntry.gem.displayName ?? selectedEntry.gem.name}</strong> in {selectedEntry.setup.label}{selectedChannel ? ` · ${selectedChannel.kind.replace(/-/g, " ")} channel · ${selectedChannel.confidence} confidence` : ""}{selectedEntry.gem.skillCount ? ` · imported count ${selectedEntry.gem.skillCount}` : ""}</p>}
    {error && <p className="engine-status"><strong>Skill calculation failed:</strong> {error}</p>}
    {result && <><div className="skill-lab-results">{[["Full DPS", value(result.offence, "fullDPS")], ["Hit DPS", value(result.offence, "totalDPS")], ["DoT DPS", value(result.offence, "totalDot")], ["Average hit", value(result.offence, "averageDamage")], ["Attack/Cast speed", speed(result.offence)]].map(([label, metric]) => <div className="skill-lab-metric" key={label}><span>{label}</span><strong>{metric}</strong><small>Authoritative PoB output</small></div>)}{result.minion && [result.minion.combinedDPS, result.minion.totalDPS, result.minion.speed].some((metric) => metric !== null && metric !== undefined) && <div className="skill-lab-minion"><span>Minion output</span><strong>{value(result.minion, "combinedDPS") !== "Unavailable" ? value(result.minion, "combinedDPS") : value(result.minion, "totalDPS")} DPS</strong><small>Minion DPS and speed are reported separately from player output · speed {speed(result.minion)}</small></div>}</div><details className="skill-lab-diagnostics"><summary>Calculation details</summary>{result.diagnostics.map((diagnostic, index) => <span key={`${diagnostic}-${index}`}>{diagnostic}</span>)}</details></>}
  </section>;
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
