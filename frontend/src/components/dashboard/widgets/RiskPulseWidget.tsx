"use client";

/**
 * RiskPulseWidget — Institutional Risk Pulse v2
 *
 * v2 changes:
 *   - GEO/NEWS weight raised 5%→20%, OIL SHOCK raised 10%→20% (40% combined).
 *   - geo_news input = Claude Haiku geo_risk_score 0–10 (not a news count).
 *   - Geo Intelligence panel: shows Claude's top events, market implications,
 *     oil/USD impact signals. Full-width alert banner when geo score ≥ 6.
 *   - Insight (summary/rationale/watchlist) now Claude-powered when API key set.
 *
 * Data: /api/market/risk-pulse  (30s)  — snapshot + GeoIntelligence
 *       /api/market/news/fx     (5m)   — article feed, categorised client-side
 *       /api/market/risk-pulse/insight (5m) — Claude or template insight
 */

import { useEffect, useState, useCallback } from "react";
import { RefreshCw, X, AlertTriangle, Zap } from "lucide-react";
import type { UserContext } from "@/lib/authContext";
import type {
  RiskPulseSnapshot,
  RiskInsight,
  PulseNewsItem,
  RiskFactor,
  RiskRegime,
  GeoIntelligence,
} from "@/lib/market/types";
import type { FxNewsArticle } from "@/lib/market/types";

// ── Style constants ───────────────────────────────────────────────────────────

const S = {
  fontMono:  "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI:    "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  bgPanel:   "var(--bg-panel)",
  bgDeep:    "var(--bg-deep)",
  bgSub:     "var(--bg-sub)",
  rim:       "var(--border-rim)",
  soft:      "var(--border-soft)",
  primary:   "var(--text-primary)",
  secondary: "var(--text-secondary)",
  tertiary:  "var(--text-tertiary)",
  cyan:      "var(--accent-cyan)",
  amber:     "var(--accent-amber,#F59E0B)",
  green:     "var(--status-pass,#22c55e)",
  red:       "var(--accent-red,#ef4444)",
} as const;

const REGIME_COLOR: Record<RiskRegime, string> = {
  Low:      S.green,
  Guarded:  S.cyan,
  Elevated: S.amber,
  High:     S.red,
  Crisis:   "#ff2020",
};

const QUALITY_COLOR: Record<string, string> = {
  LIVE: S.green, PARTIAL: S.amber, STALE: S.amber, FALLBACK: S.red,
};

// ── News categorisation ───────────────────────────────────────────────────────

const GEO_KW = ["war","conflict","sanction","russia","ukraine","china","taiwan","iran","israel","hezbollah","hamas","houthi","geopolit","military","nato","opec","strait","airstrike","bomb","missile","attack"];
const CB_KW  = ["fed","fomc","ecb","boe","boj","central bank","rate cut","rate hike","interest rate","hawkish","dovish","powell","lagarde","bailey","monetary policy","quantitative","inflation target"];

function categorise(a: FxNewsArticle): "geo" | "macro" | "cb" {
  const t = (a.headline + " " + a.summary).toLowerCase();
  if (CB_KW.some((k) => t.includes(k)))  return "cb";
  if (GEO_KW.some((k) => t.includes(k))) return "geo";
  return "macro";
}

function relTime(unixSec: number): string {
  const s = Math.floor(Date.now() / 1000) - unixSec;
  if (s < 120)   return "<2m ago";
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null;
  const W = 88, H = 22;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = H - (v / 10) * H;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const line = pts.join(" ");
  const area = `0,${H} ${line} ${W},${H}`;
  return (
    <svg width={W} height={H} aria-hidden="true" style={{ overflow: "visible", display: "block" }}>
      <polygon points={area} fill={color} opacity={0.08} />
      <polyline points={line} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ImpactBar({ impact, color }: { impact: number; color: string }) {
  return (
    <div style={{ width: 48, height: 3, background: S.bgSub, borderRadius: 2, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${impact * 100}%`, background: color, borderRadius: 2 }} />
    </div>
  );
}

function FactorRow({ f, regColor }: { f: RiskFactor; regColor: string }) {
  const zColor      = f.zscore > 1.5 ? S.red : f.zscore > 0.5 ? S.amber : f.zscore < -0.5 ? S.green : S.secondary;
  const trendSymbol = f.trend === "up" ? "▲" : f.trend === "down" ? "▼" : "─";
  const trendColor  = f.trend === "up" ? S.red : f.trend === "down" ? S.green : S.tertiary;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 64px 36px 52px 28px 36px", alignItems: "center", gap: 4, padding: "3px 0", borderBottom: `1px solid ${S.soft}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary, letterSpacing: "0.04em" }}>{f.label}</span>
        <span style={{ fontSize: 8, color: trendColor }}>{trendSymbol}</span>
      </div>
      <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.primary, textAlign: "right" }}>{f.display}</span>
      <span style={{ fontFamily: S.fontMono, fontSize: 9, color: zColor, textAlign: "right", fontWeight: Math.abs(f.zscore) > 2 ? 700 : 400 }}>
        {f.zscore > 0 ? "+" : ""}{f.zscore.toFixed(1)}
      </span>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <ImpactBar impact={f.impact} color={f.impact > 0.6 ? S.red : f.impact > 0.35 ? S.amber : regColor} />
      </div>
      <span style={{ fontFamily: S.fontMono, fontSize: 8, color: S.tertiary, textAlign: "right" }}>{(f.weight * 100).toFixed(0)}%</span>
      <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.secondary, textAlign: "right" }}>{(f.contribution * 10).toFixed(1)}</span>
    </div>
  );
}

function GeoAlertPanel({ geo }: { geo: GeoIntelligence }) {
  const isAlert  = geo.geo_risk_score >= 6;
  const color    = isAlert ? S.red : S.amber;
  const bgColor  = `color-mix(in srgb, ${color} 8%, transparent)`;
  const oilIcon  = geo.oil_impact === "bullish" ? "▲" : geo.oil_impact === "bearish" ? "▼" : "─";
  const usdIcon  = geo.usd_impact === "strengthening" ? "▲" : geo.usd_impact === "weakening" ? "▼" : "─";

  return (
    <div style={{ background: bgColor, border: `1px solid ${color}`, borderRadius: 4, padding: "8px 10px", display: "flex", flexDirection: "column", gap: 7 }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {isAlert && <Zap size={11} color={color} />}
        <span style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, color, letterSpacing: "0.1em", flex: 1 }}>
          {isAlert ? "GEO ALERT" : "GEO INTELLIGENCE"}
        </span>
        <span style={{ fontFamily: S.fontMono, fontSize: 8, color: color, border: `1px solid ${color}`, padding: "1px 5px", borderRadius: 2 }}>
          {geo.source === "claude" ? "CLAUDE" : "RULE"}
        </span>
        <span style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, color }}>
          {geo.geo_risk_score.toFixed(1)}/10
        </span>
        <span style={{ fontFamily: S.fontMono, fontSize: 8, color: S.tertiary }}>
          {geo.regime.toUpperCase()}
        </span>
      </div>

      {/* Top events */}
      {geo.top_events.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {geo.top_events.map((ev, i) => (
            <div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
              <span style={{ fontFamily: S.fontMono, fontSize: 9, color, flexShrink: 0, marginTop: 1 }}>{"▸"}</span>
              <span style={{ fontFamily: S.fontUI, fontSize: 11, color: S.primary, lineHeight: 1.4 }}>{ev}</span>
            </div>
          ))}
        </div>
      )}

      {/* Market implications */}
      {geo.market_implications && (
        <p style={{ fontFamily: S.fontUI, fontSize: 11, color: S.secondary, margin: 0, lineHeight: 1.5 }}>
          {geo.market_implications}
        </p>
      )}

      {/* Oil / USD signals */}
      <div style={{ display: "flex", gap: 10 }}>
        <span style={{ fontFamily: S.fontMono, fontSize: 9, color: geo.oil_impact === "bullish" ? S.red : S.tertiary }}>
          OIL {oilIcon} {geo.oil_impact.toUpperCase()}
        </span>
        <span style={{ fontFamily: S.fontMono, fontSize: 9, color: geo.usd_impact === "strengthening" ? S.green : S.tertiary }}>
          USD {usdIcon} {geo.usd_impact.toUpperCase()}
        </span>
        <span style={{ fontFamily: S.fontMono, fontSize: 8, color: S.tertiary, marginLeft: "auto" }}>
          conf: {geo.confidence}
        </span>
      </div>
    </div>
  );
}

function NewsTab({ items }: { items: PulseNewsItem[] }) {
  if (items.length === 0) {
    return <div style={{ padding: "10px 0", textAlign: "center" }}><span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary }}>NO ITEMS</span></div>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      {items.slice(0, 5).map((item) => (
        <a key={item.id} href={item.url || "#"} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", display: "block" }}>
          <div style={{ padding: "4px 0", borderBottom: `1px solid ${S.soft}` }}>
            <div style={{ fontFamily: S.fontUI, fontSize: 11, color: S.primary, lineHeight: 1.35, marginBottom: 2 }}>{item.headline}</div>
            <div style={{ display: "flex", gap: 8 }}>
              <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.cyan }}>{item.source}</span>
              <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary }}>{relTime(item.datetime)}</span>
            </div>
          </div>
        </a>
      ))}
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  token: string;
  user:  UserContext;
  onRemove?: () => void;
}

// ── Widget ────────────────────────────────────────────────────────────────────

export default function RiskPulseWidget({ onRemove }: Props) {
  const [snapshot,  setSnapshot]  = useState<RiskPulseSnapshot | null>(null);
  const [geo,       setGeo]       = useState<GeoIntelligence | null>(null);
  const [insight,   setInsight]   = useState<RiskInsight | null>(null);
  const [articles,  setArticles]  = useState<PulseNewsItem[]>([]);
  const [activeTab, setActiveTab] = useState<"geo" | "macro" | "cb">("geo");
  const [fetching,  setFetching]  = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setFetching(true);
    setError(null);
    try {
      // Both requests in parallel — insight is now part of the pulse response
      const [pulseRes, newsRes] = await Promise.all([
        fetch("/api/market/risk-pulse"),
        fetch("/api/market/news/fx"),
      ]);

      const pulseJson = await pulseRes.json() as { snapshot?: RiskPulseSnapshot; geo?: GeoIntelligence; insight?: RiskInsight };
      const newsJson  = await newsRes.json()  as { articles?: FxNewsArticle[] };

      if (pulseJson.snapshot) setSnapshot(pulseJson.snapshot);
      if (pulseJson.geo)      setGeo(pulseJson.geo);
      if (pulseJson.insight)  setInsight(pulseJson.insight);

      const raw = newsJson.articles ?? [];
      const categorised = raw.map((a) => ({ ...a, tab: categorise(a) }));
      setArticles(categorised);

      // Auto-select tab with most content
      const geoCnt   = categorised.filter((a) => a.tab === "geo").length;
      const macroCnt = categorised.filter((a) => a.tab === "macro").length;
      const cbCnt    = categorised.filter((a) => a.tab === "cb").length;
      if (geoCnt >= macroCnt && geoCnt >= cbCnt) setActiveTab("geo");
      else if (cbCnt > macroCnt) setActiveTab("cb");
      else setActiveTab("macro");

      setLastFetch(new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    } catch (err) {
      setError(String(err));
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const id = setInterval(fetchAll, 60_000);
    return () => clearInterval(id);
  }, [fetchAll]);

  const regime   = snapshot?.regime ?? "Guarded";
  const regColor = REGIME_COLOR[regime];
  const qualColor = snapshot ? (QUALITY_COLOR[snapshot.quality] ?? S.tertiary) : S.tertiary;
  const tabItems  = articles.filter((a) => a.tab === activeTab);
  const showGeoAlert = geo && geo.geo_risk_score >= 3;

  return (
    <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 6, display: "flex", flexDirection: "column", overflow: "hidden", height: "100%", minHeight: 480 }}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="widget-drag-handle" style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 10px", borderBottom: `1px solid ${S.rim}`, background: S.bgDeep, flexShrink: 0, cursor: "grab" }}>
        <span aria-hidden="true" style={{ fontFamily: "monospace", fontSize: 13, color: S.tertiary, flexShrink: 0, userSelect: "none" }}>⠿</span>
        <AlertTriangle size={11} color={S.amber} />
        <span style={{ fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: S.primary, flex: 1, textTransform: "uppercase" }}>Risk Pulse</span>
        {snapshot && (
          <span style={{ fontFamily: S.fontMono, fontSize: 8, color: qualColor, border: `1px solid ${qualColor}`, padding: "1px 5px", borderRadius: 2 }}>
            {snapshot.quality}
          </span>
        )}
        {geo && (
          <span style={{ fontFamily: S.fontMono, fontSize: 8, color: geo.source === "claude" ? S.cyan : S.tertiary, border: `1px solid currentColor`, padding: "1px 5px", borderRadius: 2 }}>
            {geo.source === "claude" ? "CLAUDE" : "RULE"}
          </span>
        )}
        {lastFetch && <span style={{ fontFamily: S.fontMono, fontSize: 8, color: S.tertiary }}>{lastFetch}</span>}
        <button onClick={fetchAll} disabled={fetching} title="Refresh" style={{ background: "transparent", border: "none", cursor: fetching ? "default" : "pointer", padding: 2, display: "flex", alignItems: "center", opacity: fetching ? 0.4 : 1 }}>
          <RefreshCw size={10} color={S.tertiary} />
        </button>
        {onRemove && (
          <button onClick={onRemove} title="Remove" style={{ background: "transparent", border: "none", cursor: "pointer", padding: 2, display: "flex", alignItems: "center" }}>
            <X size={11} color={S.tertiary} />
          </button>
        )}
      </div>

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px 14px", display: "flex", flexDirection: "column", gap: 12 }}>

        {error ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.red }}>FETCH ERROR</span>
            <span style={{ fontFamily: S.fontUI, fontSize: 11, color: S.tertiary, textAlign: "center" }}>{error}</span>
            <button onClick={fetchAll} style={{ fontFamily: S.fontMono, fontSize: 9, color: S.cyan, background: "transparent", border: `1px solid ${S.cyan}`, padding: "3px 10px", cursor: "pointer" }}>RETRY</button>
          </div>
        ) : !snapshot ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, letterSpacing: "0.1em" }}>LOADING…</span>
          </div>
        ) : (
          <>
            {/* ── Geo Intelligence panel (shown when geo risk ≥ 3) ──────── */}
            {showGeoAlert && geo && <GeoAlertPanel geo={geo} />}

            {/* ── Score Hero ──────────────────────────────────────────────── */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12, paddingBottom: 10, borderBottom: `1px solid ${S.soft}` }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                  <span style={{ fontFamily: S.fontMono, fontSize: 40, fontWeight: 800, color: regColor, lineHeight: 1, letterSpacing: "-0.02em" }}>
                    {snapshot.score.toFixed(1)}
                  </span>
                  <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.tertiary }}>/10</span>
                  {snapshot.deltaScore !== null && (
                    <span style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, color: snapshot.deltaScore > 0 ? S.red : snapshot.deltaScore < 0 ? S.green : S.tertiary, border: "1px solid currentColor", padding: "1px 5px", borderRadius: 2 }}>
                      {snapshot.deltaScore > 0 ? "+" : ""}{snapshot.deltaScore.toFixed(1)}
                    </span>
                  )}
                </div>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 5, background: `color-mix(in srgb, ${regColor} 12%, transparent)`, border: `1px solid ${regColor}`, borderRadius: 3, padding: "3px 8px", width: "fit-content" }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: regColor, flexShrink: 0 }} />
                  <span style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, color: regColor, letterSpacing: "0.1em" }}>
                    {regime.toUpperCase()}
                  </span>
                </div>
              </div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "flex-end", paddingTop: 4 }}>
                <Sparkline data={snapshot.sparkline} color={regColor} />
                <span style={{ fontFamily: S.fontMono, fontSize: 7, color: S.tertiary, marginTop: 3 }}>last {snapshot.sparkline.length} readings</span>
              </div>
            </div>

            {/* ── Gauge ───────────────────────────────────────────────────── */}
            <div>
              <div style={{ position: "relative", height: 8, borderRadius: 4, overflow: "hidden", background: `linear-gradient(to right, ${S.green} 0%, ${S.cyan} 20%, ${S.amber} 50%, ${S.red} 80%, #ff2020 100%)`, opacity: 0.35 }} />
              <div style={{ position: "relative", marginTop: -8, height: 8 }}>
                <div style={{ position: "absolute", top: -1, left: `calc(${Math.min(snapshot.score / 10, 0.98) * 100}% - 3px)`, width: 6, height: 10, background: regColor, borderRadius: 2, transition: "left 600ms ease" }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5 }}>
                {(["LOW","GUARDED","ELEVATED","HIGH","CRISIS"] as const).map((lbl) => (
                  <span key={lbl} style={{ fontFamily: S.fontMono, fontSize: 7, color: lbl === regime.toUpperCase() ? regColor : S.tertiary, letterSpacing: "0.04em" }}>{lbl}</span>
                ))}
              </div>
            </div>

            {/* ── Factor Breakdown ─────────────────────────────────────────── */}
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 64px 36px 52px 28px 36px", gap: 4, padding: "4px 0", borderBottom: `1px solid ${S.rim}`, marginBottom: 2 }}>
                {["FACTOR","VALUE","Z","IMPACT","WT","CTRIB"].map((h) => (
                  <span key={h} style={{ fontFamily: S.fontMono, fontSize: 7, color: S.tertiary, letterSpacing: "0.08em", textAlign: h === "FACTOR" ? "left" : "right" }}>{h}</span>
                ))}
              </div>
              {snapshot.factors.map((f) => <FactorRow key={f.id} f={f} regColor={regColor} />)}
              <div style={{ display: "flex", gap: 12, marginTop: 6 }}>
                <span style={{ fontFamily: S.fontMono, fontSize: 8, color: S.tertiary }}>
                  geo intel: <span style={{ color: geo ? REGIME_COLOR[geo.regime] : S.secondary }}>{geo?.geo_risk_score.toFixed(1) ?? "—"}/10</span>
                </span>
                <span style={{ fontFamily: S.fontMono, fontSize: 8, color: S.tertiary }}>
                  high-impact events: <span style={{ color: snapshot.highImpactEvents > 0 ? S.red : S.secondary }}>{snapshot.highImpactEvents}</span>
                </span>
              </div>
            </div>

            {/* ── Global News Feed ─────────────────────────────────────────── */}
            <div style={{ borderTop: `1px solid ${S.soft}`, paddingTop: 10 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary, letterSpacing: "0.1em" }}>GLOBAL NEWS</span>
                <div style={{ display: "flex", gap: 2 }}>
                  {(["geo","macro","cb"] as const).map((tab) => {
                    const count = articles.filter((a) => a.tab === tab).length;
                    const isActive = activeTab === tab;
                    return (
                      <button key={tab} onClick={() => setActiveTab(tab)} style={{ fontFamily: S.fontMono, fontSize: 8, fontWeight: isActive ? 700 : 400, color: isActive ? S.primary : S.tertiary, background: isActive ? S.bgSub : "transparent", border: `1px solid ${isActive ? S.rim : "transparent"}`, padding: "2px 7px", borderRadius: 2, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                        {tab.toUpperCase()}{count > 0 && <span style={{ color: isActive ? S.cyan : S.tertiary }}> ({count})</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
              <NewsTab items={tabItems} />
            </div>

            {/* ── AI Insight ────────────────────────────────────────────────── */}
            {insight && (
              <div style={{ borderTop: `1px solid ${S.soft}`, paddingTop: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                  <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary, letterSpacing: "0.1em" }}>AI INSIGHT</span>
                  <span style={{ fontFamily: S.fontMono, fontSize: 7, color: insight.ai_assisted ? S.cyan : S.tertiary, border: `1px solid currentColor`, padding: "1px 4px", borderRadius: 2 }}>
                    {insight.ai_assisted ? "CLAUDE" : "RULE"}
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, background: S.bgDeep, border: `1px solid ${S.soft}`, borderRadius: 4, padding: "8px 10px" }}>
                  <div>
                    <span style={{ fontFamily: S.fontMono, fontSize: 8, color: S.cyan, letterSpacing: "0.08em" }}>WHAT CHANGED</span>
                    <p style={{ fontFamily: S.fontUI, fontSize: 11, color: S.secondary, margin: "3px 0 0", lineHeight: 1.5 }}>{insight.summary}</p>
                  </div>
                  <div>
                    <span style={{ fontFamily: S.fontMono, fontSize: 8, color: S.cyan, letterSpacing: "0.08em" }}>WHY IT MATTERS</span>
                    <p style={{ fontFamily: S.fontUI, fontSize: 11, color: S.secondary, margin: "3px 0 0", lineHeight: 1.5 }}>{insight.rationale}</p>
                  </div>
                  <div>
                    <span style={{ fontFamily: S.fontMono, fontSize: 8, color: S.cyan, letterSpacing: "0.08em" }}>WATCHLIST 24H</span>
                    <ul style={{ margin: "3px 0 0", padding: "0 0 0 14px" }}>
                      {insight.watchlist.map((item, i) => (
                        <li key={i} style={{ fontFamily: S.fontUI, fontSize: 11, color: S.secondary, lineHeight: 1.5 }}>{item}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {/* ── Footer ───────────────────────────────────────────────────── */}
            <div style={{ borderTop: `1px solid ${S.soft}`, paddingTop: 8 }}>
              <p style={{ fontFamily: S.fontMono, fontSize: 7, color: S.tertiary, margin: 0, lineHeight: 1.6 }}>
                Score = Σ(weight×impact)×10 · GEO/NEWS 20% + OIL SHOCK 20% + EQUITY 18% + RATES 12% + VOL 12% + CREDIT 10% + USD 8% ·
                Geo: Claude Haiku (Finnhub general+forex, 5m cache) · Market: Yahoo Finance + Finnhub · 30s snapshot · Not investment advice
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
