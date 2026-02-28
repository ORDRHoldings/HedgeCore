"use client";

/**
 * RiskPulseWidget — Institutional Risk Pulse (BlackRock/Bloomberg standard)
 *
 * Data: /api/market/risk-pulse  (30s cache)
 *       /api/market/news/fx     (5m cache, categorized client-side)
 *       /api/market/risk-pulse/insight (5m cache, deterministic)
 *
 * Sections: Header · Score Hero · Gauge · Factor Table · News Tabs · Insight · Footer
 */

import { useEffect, useState, useCallback } from "react";
import { RefreshCw, X, AlertTriangle } from "lucide-react";
import type { UserContext } from "@/lib/authContext";
import type { RiskPulseSnapshot, RiskInsight, PulseNewsItem, RiskFactor, RiskRegime } from "@/lib/market/types";
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
  Crisis:   "#ff2222",
};

const QUALITY_COLOR: Record<string, string> = {
  LIVE:     S.green,
  PARTIAL:  S.amber,
  STALE:    S.amber,
  FALLBACK: S.red,
};

// ── News categorisation ───────────────────────────────────────────────────────

const GEO_KW = ["war","conflict","sanction","russia","ukraine","china","taiwan","iran","geopolit","military","nato","opec","strait","tensions"];
const CB_KW  = ["fed","fomc","ecb","boe","boj","central bank","rate cut","rate hike","interest rate","hawkish","dovish","powell","lagarde","bailey","monetary policy","quantitative"];

function categorise(a: FxNewsArticle): "geo" | "macro" | "cb" {
  const t = (a.headline + " " + a.summary).toLowerCase();
  if (CB_KW.some((k) => t.includes(k)))  return "cb";
  if (GEO_KW.some((k) => t.includes(k))) return "geo";
  return "macro";
}

function relTime(unixSec: number): string {
  const s = Math.floor(Date.now() / 1000) - unixSec;
  if (s < 120)    return "<2m ago";
  if (s < 3600)   return `${Math.floor(s / 60)}m ago`;
  if (s < 86400)  return `${Math.floor(s / 3600)}h ago`;
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
  const zColor = f.zscore > 1 ? S.red : f.zscore > 0 ? S.amber : S.green;
  const trendSymbol = f.trend === "up" ? "▲" : f.trend === "down" ? "▼" : "─";
  const trendColor  = f.trend === "up" ? S.red : f.trend === "down" ? S.green : S.tertiary;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 64px 36px 52px 28px 36px", alignItems: "center", gap: 4, padding: "3px 0", borderBottom: `1px solid ${S.soft}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary, letterSpacing: "0.06em" }}>{f.label}</span>
        <span style={{ fontSize: 8, color: trendColor }}>{trendSymbol}</span>
      </div>
      <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.primary, textAlign: "right" }}>{f.display}</span>
      <span style={{ fontFamily: S.fontMono, fontSize: 9, color: zColor, textAlign: "right" }}>
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

function NewsTab({ items }: { items: PulseNewsItem[] }) {
  if (items.length === 0) {
    return (
      <div style={{ padding: "12px 0", textAlign: "center" }}>
        <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary }}>NO ITEMS</span>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {items.slice(0, 5).map((item) => (
        <a
          key={item.id}
          href={item.url || "#"}
          target="_blank"
          rel="noopener noreferrer"
          style={{ textDecoration: "none", display: "block" }}
        >
          <div style={{ padding: "5px 0", borderBottom: `1px solid ${S.soft}` }}>
            <div style={{ fontFamily: S.fontUI, fontSize: 11, color: S.primary, lineHeight: 1.35, marginBottom: 2 }}>
              {item.headline}
            </div>
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
  const [snapshot, setSnapshot] = useState<RiskPulseSnapshot | null>(null);
  const [insight,  setInsight]  = useState<RiskInsight | null>(null);
  const [articles, setArticles] = useState<PulseNewsItem[]>([]);
  const [activeTab, setActiveTab] = useState<"geo" | "macro" | "cb">("macro");
  const [fetching,  setFetching]  = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setFetching(true);
    setError(null);
    try {
      const [snapRes, newsRes, insRes] = await Promise.all([
        fetch("/api/market/risk-pulse"),
        fetch("/api/market/news/fx"),
        fetch("/api/market/risk-pulse/insight"),
      ]);

      const snapJson = await snapRes.json() as { snapshot?: RiskPulseSnapshot };
      const newsJson = await newsRes.json() as { articles?: FxNewsArticle[] };
      const insJson  = await insRes.json()  as { insight?: RiskInsight };

      if (snapJson.snapshot) setSnapshot(snapJson.snapshot);
      if (insJson.insight)   setInsight(insJson.insight);

      const raw = newsJson.articles ?? [];
      setArticles(raw.map((a) => ({ ...a, tab: categorise(a) })));

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

  // ── Derived ──────────────────────────────────────────────────────────────────

  const regime   = snapshot?.regime ?? "Guarded";
  const regColor = REGIME_COLOR[regime];
  const qualColor = snapshot ? (QUALITY_COLOR[snapshot.quality] ?? S.tertiary) : S.tertiary;
  const tabItems  = articles.filter((a) => a.tab === activeTab);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 6, display: "flex", flexDirection: "column", overflow: "hidden", height: "100%", minHeight: 420 }}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div
        className="widget-drag-handle"
        style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 10px", borderBottom: `1px solid ${S.rim}`, background: S.bgDeep, flexShrink: 0, cursor: "grab" }}
      >
        <span aria-hidden="true" style={{ fontFamily: "monospace", fontSize: 13, color: S.tertiary, flexShrink: 0, userSelect: "none" }}>⠿</span>
        <AlertTriangle size={11} color={S.amber} />
        <span style={{ fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: S.primary, flex: 1, textTransform: "uppercase" }}>
          Risk Pulse
        </span>
        {snapshot && (
          <span style={{ fontFamily: S.fontMono, fontSize: 8, color: qualColor, border: `1px solid ${qualColor}`, padding: "1px 5px", borderRadius: 2 }}>
            {snapshot.quality}
          </span>
        )}
        {lastFetch && (
          <span style={{ fontFamily: S.fontMono, fontSize: 8, color: S.tertiary }}>{lastFetch}</span>
        )}
        <button onClick={fetchAll} disabled={fetching} title="Refresh" style={{ background: "transparent", border: "none", cursor: fetching ? "default" : "pointer", padding: 2, display: "flex", alignItems: "center", opacity: fetching ? 0.4 : 1 }}>
          <RefreshCw size={10} color={S.tertiary} style={{ animation: fetching ? "spin 1s linear infinite" : "none" }} />
        </button>
        {onRemove && (
          <button onClick={onRemove} title="Remove" style={{ background: "transparent", border: "none", cursor: "pointer", padding: 2, display: "flex", alignItems: "center" }}>
            <X size={11} color={S.tertiary} />
          </button>
        )}
      </div>

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px 12px", display: "flex", flexDirection: "column", gap: 12 }}>

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
            {/* ── Score Hero ──────────────────────────────────────────────── */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12, paddingBottom: 10, borderBottom: `1px solid ${S.soft}` }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                  <span style={{ fontFamily: S.fontMono, fontSize: 40, fontWeight: 800, color: regColor, lineHeight: 1, letterSpacing: "-0.02em" }}>
                    {snapshot.score.toFixed(1)}
                  </span>
                  <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.tertiary }}>/10</span>
                  {snapshot.deltaScore !== null && (
                    <span style={{
                      fontFamily: S.fontMono, fontSize: 9, fontWeight: 700,
                      color: snapshot.deltaScore > 0 ? S.red : snapshot.deltaScore < 0 ? S.green : S.tertiary,
                      background: "color-mix(in srgb, currentColor 10%, transparent)",
                      border: `1px solid currentColor`,
                      padding: "1px 5px", borderRadius: 2,
                    }}>
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

            {/* ── Score Gauge ──────────────────────────────────────────────── */}
            <div>
              <div style={{ position: "relative", height: 8, borderRadius: 4, overflow: "hidden", background: `linear-gradient(to right, ${S.green} 0%, ${S.cyan} 20%, ${S.amber} 50%, ${S.red} 80%, #ff2222 100%)`, opacity: 0.35 }}>
              </div>
              <div style={{ position: "relative", marginTop: -8, height: 8 }}>
                <div style={{
                  position: "absolute", top: -1,
                  left: `calc(${Math.min(snapshot.score / 10, 0.98) * 100}% - 3px)`,
                  width: 6, height: 10, background: regColor, borderRadius: 2,
                  transition: "left 600ms ease",
                }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5 }}>
                {["LOW","GUARDED","ELEVATED","HIGH","CRISIS"].map((lbl, i) => (
                  <span key={lbl} style={{ fontFamily: S.fontMono, fontSize: 7, color: i === ["LOW","GUARDED","ELEVATED","HIGH","CRISIS"].indexOf(regime.toUpperCase()) ? regColor : S.tertiary, letterSpacing: "0.05em" }}>
                    {lbl}
                  </span>
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
              {snapshot.factors.map((f) => (
                <FactorRow key={f.id} f={f} regColor={regColor} />
              ))}
              <div style={{ display: "flex", gap: 12, marginTop: 6 }}>
                <span style={{ fontFamily: S.fontMono, fontSize: 8, color: S.tertiary }}>
                  news 24h: <span style={{ color: S.secondary }}>{snapshot.newsCount24h}</span>
                </span>
                <span style={{ fontFamily: S.fontMono, fontSize: 8, color: S.tertiary }}>
                  high-impact events: <span style={{ color: snapshot.highImpactEvents > 0 ? S.red : S.secondary }}>{snapshot.highImpactEvents}</span>
                </span>
              </div>
            </div>

            {/* ── Global News Intelligence ──────────────────────────────────── */}
            <div style={{ borderTop: `1px solid ${S.soft}`, paddingTop: 10 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                  Global News Intelligence
                </span>
                <div style={{ display: "flex", gap: 2 }}>
                  {(["geo","macro","cb"] as const).map((tab) => {
                    const count = articles.filter((a) => a.tab === tab).length;
                    const isActive = activeTab === tab;
                    return (
                      <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        style={{
                          fontFamily: S.fontMono, fontSize: 8, fontWeight: isActive ? 700 : 400,
                          color: isActive ? S.primary : S.tertiary,
                          background: isActive ? S.bgSub : "transparent",
                          border: `1px solid ${isActive ? S.rim : "transparent"}`,
                          padding: "2px 7px", borderRadius: 2, cursor: "pointer",
                          textTransform: "uppercase", letterSpacing: "0.08em",
                        }}
                      >
                        {tab.toUpperCase()} {count > 0 && <span style={{ color: isActive ? S.cyan : S.tertiary }}>({count})</span>}
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
                  <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary, letterSpacing: "0.1em", textTransform: "uppercase" }}>AI Insight</span>
                  <span style={{ fontFamily: S.fontMono, fontSize: 7, color: S.tertiary, border: `1px solid ${S.soft}`, padding: "1px 4px", borderRadius: 2 }}>
                    {insight.ai_assisted ? "AI" : "RULE"}
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, background: S.bgDeep, border: `1px solid ${S.soft}`, borderRadius: 4, padding: "8px 10px" }}>
                  <div>
                    <span style={{ fontFamily: S.fontMono, fontSize: 8, color: S.cyan, letterSpacing: "0.08em", textTransform: "uppercase" }}>What Changed</span>
                    <p style={{ fontFamily: S.fontUI, fontSize: 11, color: S.secondary, margin: "3px 0 0", lineHeight: 1.5 }}>{insight.summary}</p>
                  </div>
                  <div>
                    <span style={{ fontFamily: S.fontMono, fontSize: 8, color: S.cyan, letterSpacing: "0.08em", textTransform: "uppercase" }}>Why It Matters</span>
                    <p style={{ fontFamily: S.fontUI, fontSize: 11, color: S.secondary, margin: "3px 0 0", lineHeight: 1.5 }}>{insight.rationale}</p>
                  </div>
                  <div>
                    <span style={{ fontFamily: S.fontMono, fontSize: 8, color: S.cyan, letterSpacing: "0.08em", textTransform: "uppercase" }}>Watchlist 24h</span>
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
                Score = Σ(weight × impact) × 10 · Factors: VIX, US10Y, DXY, VIX σ, Gold, Brent, Press ·
                Z-scores vs {snapshot.factors[0]?.zscore !== undefined ? "rolling" : "calibrated"} baselines ·
                Data: Yahoo Finance + Finnhub · 30s cache ·
                Not investment advice
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
