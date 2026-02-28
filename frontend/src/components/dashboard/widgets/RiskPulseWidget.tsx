"use client";

import { useEffect, useState, useCallback } from "react";
import { RefreshCw, X, AlertTriangle, Newspaper, Calendar } from "lucide-react";
import type { UserContext } from "@/lib/authContext";
import type { FxNewsArticle, EconEvent, RiskScore } from "@/lib/market/types";

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
  green:     "var(--status-pass,#34d399)",
  red:       "var(--accent-red,#f87171)",
} as const;

const POLL_MS = 60_000;

function computeRiskScore(news: FxNewsArticle[], events: EconEvent[]): RiskScore {
  const now = Date.now();
  const h24 = 24 * 60 * 60 * 1000;
  const newsCount24h = news.filter((a) => now - a.datetime * 1000 < h24).length;
  const highImpact = events.filter((e) => e.impact === "high").length;
  const mediumImpact = events.filter((e) => e.impact === "medium").length;
  const score = newsCount24h * 1.0 + highImpact * 3.0 + mediumImpact * 1.5;
  const level: RiskScore["level"] = score >= 8 ? "HIGH" : score >= 3 ? "MEDIUM" : "LOW";
  return { score: parseFloat(score.toFixed(1)), level, newsCount24h, highImpact, mediumImpact };
}

interface Props {
  token: string;
  user: UserContext;
  onRemove?: () => void;
}

export default function RiskPulseWidget({ onRemove }: Props) {
  const [riskScore, setRiskScore] = useState<RiskScore | null>(null);
  const [lastFetch, setLastFetch] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setFetching(true);
    setError(null);
    try {
      const [newsRes, calRes] = await Promise.all([
        fetch("/api/market/news/fx"),
        fetch("/api/market/calendar/econ"),
      ]);

      const newsJson = await newsRes.json() as { articles?: FxNewsArticle[] };
      const calJson  = await calRes.json() as { events?: EconEvent[] };

      const news   = newsJson.articles ?? [];
      const events = calJson.events ?? [];

      setRiskScore(computeRiskScore(news, events));
      setLastFetch(new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }));
    } catch (err) {
      setError(String(err));
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, POLL_MS);
    return () => clearInterval(id);
  }, [fetchData]);

  const levelColor = riskScore
    ? riskScore.level === "HIGH" ? S.red : riskScore.level === "MEDIUM" ? S.amber : S.green
    : S.tertiary;

  const levelBg = riskScore
    ? riskScore.level === "HIGH"
      ? "color-mix(in srgb, var(--accent-red,#f87171) 12%, transparent)"
      : riskScore.level === "MEDIUM"
      ? "color-mix(in srgb, var(--accent-amber,#F59E0B) 12%, transparent)"
      : "color-mix(in srgb, var(--status-pass,#34d399) 12%, transparent)"
    : "transparent";

  const scorePct = riskScore ? Math.min((riskScore.score / 15) * 100, 100) : 0;

  return (
    <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 6, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 200 }}>
      {/* Header */}
      <div className="widget-drag-handle" style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderBottom: `1px solid ${S.rim}`, background: S.bgDeep, flexShrink: 0, cursor: "grab" }}>
        <span aria-hidden="true" style={{ fontFamily: "monospace", fontSize: 13, color: S.tertiary, cursor: "grab", flexShrink: 0, lineHeight: 1, userSelect: "none" }}>⠿</span>
        <AlertTriangle size={12} color={S.amber} />
        <span style={{ fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: S.primary, flex: 1, textTransform: "uppercase" }}>
          Risk Pulse
        </span>
        {lastFetch && (
          <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary }}>{lastFetch}</span>
        )}
        <button onClick={fetchData} disabled={fetching} title="Refresh" style={{ background: "transparent", border: "none", cursor: fetching ? "default" : "pointer", padding: 2, display: "flex", alignItems: "center", opacity: fetching ? 0.4 : 1 }}>
          <RefreshCw size={11} color={S.tertiary} />
        </button>
        {onRemove && (
          <button onClick={onRemove} title="Remove widget" style={{ background: "transparent", border: "none", cursor: "pointer", padding: 2, display: "flex", alignItems: "center" }}>
            <X size={12} color={S.tertiary} />
          </button>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, padding: "16px 16px 12px", display: "flex", flexDirection: "column", gap: 16 }}>
        {error ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.red }}>FETCH ERROR</span>
            <span style={{ fontFamily: S.fontUI, fontSize: 11, color: S.tertiary, textAlign: "center" }}>{error}</span>
            <button onClick={fetchData} style={{ fontFamily: S.fontMono, fontSize: 9, color: S.cyan, background: "transparent", border: `1px solid ${S.cyan}`, padding: "3px 10px", cursor: "pointer" }}>RETRY</button>
          </div>
        ) : !riskScore ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary }}>LOADING…</span>
          </div>
        ) : (
          <>
            {/* Score + Level */}
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <span style={{ fontFamily: S.fontMono, fontSize: 36, fontWeight: 700, color: levelColor, lineHeight: 1 }}>
                  {riskScore.score.toFixed(1)}
                </span>
                <span style={{ fontFamily: S.fontMono, fontSize: 8, color: S.tertiary, letterSpacing: "0.08em" }}>RISK SCORE</span>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  background: levelBg,
                  border: `1px solid ${levelColor}`,
                  borderRadius: 3, padding: "4px 10px",
                  marginBottom: 10,
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: levelColor, flexShrink: 0 }} />
                  <span style={{ fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, color: levelColor, letterSpacing: "0.1em" }}>
                    {riskScore.level}
                  </span>
                </div>
                {/* Gauge bar */}
                <div style={{ height: 6, background: S.bgSub, borderRadius: 3, overflow: "hidden", border: `1px solid ${S.soft}` }}>
                  <div style={{
                    height: "100%",
                    width: `${scorePct}%`,
                    background: levelColor,
                    borderRadius: 3,
                    transition: "width 600ms ease",
                  }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
                  <span style={{ fontFamily: S.fontMono, fontSize: 8, color: S.green }}>LOW</span>
                  <span style={{ fontFamily: S.fontMono, fontSize: 8, color: S.amber }}>MED</span>
                  <span style={{ fontFamily: S.fontMono, fontSize: 8, color: S.red }}>HIGH</span>
                </div>
              </div>
            </div>

            {/* Breakdown */}
            <div style={{ borderTop: `1px solid ${S.soft}`, paddingTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary, letterSpacing: "0.08em", textTransform: "uppercase" }}>Breakdown</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <BreakdownRow icon={<Newspaper size={10} color={S.secondary} />} label="FX news (24h)" value={riskScore.newsCount24h} weight="×1.0" />
                <BreakdownRow icon={<Calendar size={10} color={S.red} />} label="High-impact events" value={riskScore.highImpact} weight="×3.0" color={S.red} />
                <BreakdownRow icon={<Calendar size={10} color={S.amber} />} label="Medium-impact events" value={riskScore.mediumImpact} weight="×1.5" color={S.amber} />
              </div>
            </div>

            {/* Formula note */}
            <div style={{ fontFamily: S.fontMono, fontSize: 8, color: S.tertiary, borderTop: `1px solid ${S.soft}`, paddingTop: 8 }}>
              score = news×1 + high×3 + med×1.5 · LOW&lt;3 / MED 3–8 / HIGH≥8
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function BreakdownRow({ icon, label, value, weight, color }: {
  icon: React.ReactNode;
  label: string;
  value: number;
  weight: string;
  color?: string;
}) {
  const S2 = { fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)", fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)", secondary: "var(--text-secondary)", tertiary: "var(--text-tertiary)", primary: "var(--text-primary)" };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {icon}
      <span style={{ fontFamily: S2.fontUI, fontSize: 11, color: S2.secondary, flex: 1 }}>{label}</span>
      <span style={{ fontFamily: S2.fontMono, fontSize: 12, fontWeight: 700, color: color ?? S2.primary }}>{value}</span>
      <span style={{ fontFamily: S2.fontMono, fontSize: 9, color: S2.tertiary, minWidth: 30, textAlign: "right" }}>{weight}</span>
    </div>
  );
}
