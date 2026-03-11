"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Globe2, TrendingUp, TrendingDown, Minus, X, RefreshCw, ExternalLink,
} from "lucide-react";
import type { UserContext } from "@/lib/authContext";
import type { NewsArticle } from "@/app/api/geo-news/route";

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI:   "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  bgPanel:  "var(--bg-panel)",
  bgDeep:   "var(--bg-deep)",
  bgSub:    "var(--bg-sub)",
  rim:      "var(--border-rim)",
  soft:     "var(--border-soft)",
  primary:  "var(--text-primary)",
  secondary:"var(--text-secondary)",
  tertiary: "var(--text-tertiary)",
  cyan:     "var(--accent-cyan)",
  amber:    "var(--accent-amber)",
  green:    "var(--status-pass,#15803D)",
  red:      "var(--accent-red,#B91C1C)",
} as const;

// ─── Types ────────────────────────────────────────────────────────────────────
interface MacroItem {
  label:   string;
  value:   number;
  display: string;
  maxRef:  number;
  trend:   "up" | "down" | "flat";
  context: string;
  unit:    string;
  note?:   string;
}

interface CentralBankEntry {
  bank:        string;
  rate:        number;
  rateStr:     string;
  direction:   "hawkish" | "dovish" | "neutral";
  nextMeeting: string;
  flag:        string;
}

function daysUntilMeeting(meetingStr: string): number {
  const MONTHS: Record<string, number> = {
    Jan:0, Feb:1, Mar:2, Apr:3, May:4, Jun:5,
    Jul:6, Aug:7, Sep:8, Oct:9, Nov:10, Dec:11,
  };
  const parts = meetingStr.split(" ");
  const month = MONTHS[parts[0] ?? ""] ?? 0;
  const day   = parseInt(parts[1] ?? "1", 10);
  const now   = new Date();
  let target  = new Date(now.getFullYear(), month, day);
  if (target <= now) target = new Date(now.getFullYear() + 1, month, day);
  return Math.ceil((target.getTime() - now.getTime()) / 86_400_000);
}

// ─── Static macro baseline (overridden by live data) ─────────────────────────
const MACRO_BASELINE: MacroItem[] = [
  { label: "DXY INDEX", value: 99.11,  display: "99.11",   maxRef: 120,  trend: "down", context: "USD softening from recent highs",       unit: ""  },
  { label: "VIX",       value: 21.5,   display: "21.5",    maxRef: 45,   trend: "up",   context: "Elevated uncertainty regime",            unit: ""  },
  { label: "US 10Y",    value: 4.26,   display: "4.26%",   maxRef: 6,    trend: "flat", context: "Range-bound amid Fed uncertainty",       unit: "%" },
  { label: "FED FUNDS", value: 4.33,   display: "4.33%",   maxRef: 6,    trend: "flat", context: "FOMC target · data-dependent hold",     unit: "%" },
  { label: "BRENT",     value: 73.50,  display: "$73.50",  maxRef: 120,  trend: "down", context: "OPEC+ balancing demand concerns",        unit: "$" },
  { label: "GOLD",      value: 2870,   display: "$2,870",  maxRef: 3500, trend: "up",   context: "Safe-haven demand persistent",           unit: "$" },
];

const MAX_RATE = 14;
const CENTRAL_BANKS: CentralBankEntry[] = [
  { bank: "Federal Reserve", rate: 4.50, rateStr: "4.50%", direction: "neutral", nextMeeting: "Mar 18", flag: "🇺🇸" },
  { bank: "ECB",             rate: 2.90, rateStr: "2.90%", direction: "dovish",  nextMeeting: "Apr 17", flag: "🇪🇺" },
  { bank: "Bank of Japan",   rate: 0.50, rateStr: "0.50%", direction: "hawkish", nextMeeting: "Mar 19", flag: "🇯🇵" },
  { bank: "Banxico",         rate: 9.50, rateStr: "9.50%", direction: "dovish",  nextMeeting: "Mar 27", flag: "🇲🇽" },
  { bank: "BCB (Brazil)",    rate:13.25, rateStr:"13.25%", direction: "hawkish", nextMeeting: "Mar 19", flag: "🇧🇷" },
  { bank: "Bank of England", rate: 4.50, rateStr: "4.50%", direction: "neutral", nextMeeting: "Mar 20", flag: "🇬🇧" },
];

function directionColor(dir: string): string {
  if (dir === "hawkish") return S.red;
  if (dir === "dovish")  return S.green;
  return S.amber;
}

interface Props {
  token: string;
  user:  UserContext;
  onRemove?: () => void;
}

// ─── Rate comparison chart ────────────────────────────────────────────────────
function RateBarChart({ banks }: { banks: CentralBankEntry[] }) {
  const sorted = [...banks].sort((a, b) => b.rate - a.rate);
  return (
    <div style={{ padding: "12px 14px" }}>
      <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, letterSpacing: "0.1em", marginBottom: 12, display: "flex", justifyContent: "space-between" }}>
        <span>POLICY RATE COMPARISON</span>
        <span>0% ──── {MAX_RATE}%</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        {sorted.map((cb) => {
          const pct   = (cb.rate / MAX_RATE) * 100;
          const color = directionColor(cb.direction);
          return (
            <div key={cb.bank}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 12 }}>{cb.flag}</span>
                  <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.primary }}>
                    {cb.bank.split(" ")[0]}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    {cb.direction === "hawkish" ? "▲" : cb.direction === "dovish" ? "▼" : "●"} {cb.direction}
                  </span>
                  <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.primary, minWidth: 42, textAlign: "right" }}>
                    {cb.rateStr}
                  </span>
                </div>
              </div>
              <div style={{ height: 8, background: S.bgDeep, border: `1px solid ${S.soft}`, borderRadius: 4, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pct}%`, background: `linear-gradient(90deg, ${color}, color-mix(in srgb, ${color} 55%, transparent))`, borderRadius: 4, transition: "width 700ms ease" }} />
              </div>
              <div style={{ fontFamily: S.fontMono, fontSize: 7.5, color: S.tertiary, marginTop: 2, display: "flex", justifyContent: "space-between" }}>
                <span>Next: {cb.nextMeeting}</span>
                <span style={{ color: daysUntilMeeting(cb.nextMeeting) <= 15 ? S.amber : S.tertiary }}>{daysUntilMeeting(cb.nextMeeting)}d</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main widget ──────────────────────────────────────────────────────────────
export default function GeoPoliticalWidget({ token: _token, user: _user, onRemove }: Props) {
  const [activeTab,    setActiveTab]    = useState<"events" | "macro" | "banks">("events");
  const [time,         setTime]         = useState("");

  // Macro state
  const [macroLive,    setMacroLive]    = useState<Record<string, MacroItem>>({});
  const [macroLoading, setMacroLoading] = useState(false);
  const [asOf,         setAsOf]         = useState("");
  const [macroSrc,     setMacroSrc]     = useState<"live" | "fallback">("fallback");

  // News state
  const [news,         setNews]         = useState<NewsArticle[]>([]);
  const [newsLoading,  setNewsLoading]  = useState(false);
  const [newsSrc,      setNewsSrc]      = useState<"yahoo_finance" | "empty" | "error">("empty");
  const [newsTs,       setNewsTs]       = useState(0);

  // Clock
  useEffect(() => {
    const update = () => setTime(new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC");
    update();
    const id = setInterval(update, 30_000);
    return () => clearInterval(id);
  }, []);

  // ── Fetch macro data ────────────────────────────────────────────────────────
  const fetchMacro = useCallback(() => {
    let cancelled = false;
    setMacroLoading(true);
    (async () => {
      try {
        const res = await fetch("/api/market/macro");
        if (!res.ok) return;
        const json = await res.json() as {
          dataSource: string;
          asOf: string;
          macroData: Record<string, MacroItem>;
        };
        if (cancelled) return;
        setMacroSrc(json.dataSource === "live" ? "live" : "fallback");
        setAsOf(json.asOf ?? "");
        const map: Record<string, MacroItem> = {};
        for (const [, item] of Object.entries(json.macroData)) {
          map[item.label] = item;
        }
        setMacroLive(map);
      } catch {
        // keep static
      } finally {
        if (!cancelled) setMacroLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(fetchMacro, [fetchMacro]);

  // ── Fetch news from Yahoo Finance ───────────────────────────────────────────
  const fetchNews = useCallback(() => {
    let cancelled = false;
    setNewsLoading(true);
    (async () => {
      try {
        const res = await fetch("/api/geo-news");
        if (!res.ok) { setNewsSrc("error"); return; }
        const json = await res.json() as {
          articles: NewsArticle[];
          source:   string;
          cachedAt: number;
        };
        if (cancelled) return;
        setNews(json.articles ?? []);
        setNewsSrc(json.source === "yahoo_finance" ? "yahoo_finance" : "empty");
        setNewsTs(json.cachedAt ?? 0);
      } catch {
        if (!cancelled) setNewsSrc("error");
      } finally {
        if (!cancelled) setNewsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(fetchNews, [fetchNews]);

  // Auto-refresh news every 10 min
  useEffect(() => {
    const id = setInterval(fetchNews, 600_000);
    return () => clearInterval(id);
  }, [fetchNews]);

  // Merge live macro over baseline
  const macroSnapshot: MacroItem[] = useMemo(
    () => MACRO_BASELINE.map(item => macroLive[item.label] ?? item),
    [macroLive],
  );

  const newsLive    = newsSrc === "yahoo_finance" && news.length > 0;
  const newsCount   = newsLive ? news.length : 0;

  const tabs = [
    { key: "events" as const, label: "GEO EVENTS",    count: newsLive ? newsCount : "—" },
    { key: "macro"  as const, label: "MACRO TAPE",    count: macroSnapshot.length },
    { key: "banks"  as const, label: "CENTRAL BANKS", count: CENTRAL_BANKS.length },
  ];

  // Format news timestamp
  const newsFetchedAgo = newsTs
    ? (() => {
        const m = Math.floor((Date.now() - newsTs) / 60_000);
        return m < 1 ? "just now" : m < 60 ? `${m}m ago` : `${Math.floor(m / 60)}h ago`;
      })()
    : "";

  return (
    <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 6, display: "flex", flexDirection: "column", overflow: "hidden", height: "100%" }}>

      {/* ── Header ── */}
      <div className="widget-drag-handle" style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderBottom: `1px solid ${S.rim}`, background: S.bgDeep, flexShrink: 0, cursor: "grab" }}>
        <span aria-hidden="true" style={{ fontFamily: "monospace", fontSize: 13, color: S.tertiary, flexShrink: 0, lineHeight: 1, userSelect: "none" }}>⠿</span>
        <Globe2 size={13} color={S.cyan} style={{ flexShrink: 0 }} />
        <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", color: S.primary, textTransform: "uppercase" }}>
          Geopolitical &amp; Macro
        </span>

        {/* Source badge — Yahoo Finance when live, POLISOPHIC otherwise */}
        {newsLive ? (
          <span style={{ fontFamily: S.fontMono, fontSize: 12, letterSpacing: "0.08em", color: S.green, background: `color-mix(in srgb, ${S.green} 10%, transparent)`, border: `1px solid color-mix(in srgb, ${S.green} 25%, transparent)`, borderRadius: 3, padding: "1px 5px" }}>
            ● YAHOO FINANCE
          </span>
        ) : (
          <span style={{ fontFamily: S.fontMono, fontSize: 12, letterSpacing: "0.1em", color: S.amber, background: `color-mix(in srgb, ${S.amber} 10%, transparent)`, border: `1px solid color-mix(in srgb, ${S.amber} 30%, transparent)`, borderRadius: 3, padding: "1px 5px" }}>
            {newsLoading ? "LOADING…" : "POLISOPHIC"}
          </span>
        )}

        <div style={{ flex: 1 }} />

        {/* Macro live badge */}
        {asOf && (
          <span style={{ fontFamily: S.fontMono, fontSize: 12, color: macroSrc === "live" ? S.green : S.tertiary, background: `color-mix(in srgb, ${macroSrc === "live" ? S.green : S.tertiary} 10%, transparent)`, border: `1px solid color-mix(in srgb, ${macroSrc === "live" ? S.green : S.tertiary} 20%, transparent)`, borderRadius: 3, padding: "1px 5px" }}>
            {macroSrc === "live" ? "LIVE · " : ""}{asOf}
          </span>
        )}

        <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>{time.slice(11, 16)} UTC</span>
        {onRemove && (
          <button onClick={onRemove} title="Remove widget" style={{ background: "none", border: "none", cursor: "pointer", color: S.tertiary, display: "flex", alignItems: "center", padding: 2 }}>
            <X size={12} />
          </button>
        )}
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${S.rim}`, flexShrink: 0 }}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{ flex: 1, padding: "6px 10px", fontFamily: S.fontMono, fontSize: 12, letterSpacing: "0.06em", fontWeight: 700, cursor: "pointer", color: isActive ? S.cyan : S.tertiary, background: isActive ? `color-mix(in srgb, ${S.cyan} 6%, transparent)` : "transparent", borderBottom: isActive ? `2px solid ${S.cyan}` : "2px solid transparent", border: "none", borderRight: `1px solid ${S.soft}`, display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
              {tab.label}
              <span style={{ fontSize: 12, color: isActive ? S.cyan : S.tertiary, background: isActive ? `color-mix(in srgb, ${S.cyan} 15%, transparent)` : `color-mix(in srgb, ${S.tertiary} 10%, transparent)`, padding: "0 4px", borderRadius: 3, fontWeight: 600 }}>
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, overflow: "auto" }}>

        {/* ── GEO EVENTS — live Yahoo Finance news feed ────────────────── */}
        {activeTab === "events" && (
          <div style={{ display: "flex", flexDirection: "column" }}>

            {/* Sub-header */}
            <div style={{ padding: "5px 12px", borderBottom: `1px solid ${S.soft}`, background: S.bgSub, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontFamily: S.fontMono, fontSize: 12, letterSpacing: "0.07em", color: newsLive ? S.green : S.tertiary }}>
                {newsLive ? `● LIVE · ${newsCount} articles` : newsLoading ? "○ FETCHING…" : "○ NO DATA"}
              </span>
              {newsFetchedAgo && (
                <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>· updated {newsFetchedAgo}</span>
              )}
              <div style={{ flex: 1 }} />
              <button
                onClick={fetchNews}
                disabled={newsLoading}
                style={{ background: "none", border: "none", cursor: newsLoading ? "default" : "pointer", color: S.tertiary, display: "flex", alignItems: "center", gap: 3, padding: 0, fontFamily: S.fontMono, fontSize: 12 }}
              >
                <RefreshCw size={9} color={S.tertiary} style={{ animation: newsLoading ? "spin 1s linear infinite" : "none" }} />
                REFRESH
              </button>
            </div>

            {/* News list */}
            {newsLoading && news.length === 0 ? (
              <div style={{ padding: "24px 14px", fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, textAlign: "center", letterSpacing: "0.08em" }}>
                Fetching from Yahoo Finance…
              </div>
            ) : news.length > 0 ? (
              news.map((article, i) => (
                <a
                  key={article.uuid}
                  href={article.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: "block", textDecoration: "none", color: "inherit" }}
                >
                  <div
                    style={{
                      padding: "9px 12px",
                      borderBottom: i < news.length - 1 ? `1px solid ${S.soft}` : "none",
                      display: "flex", gap: 10, alignItems: "flex-start",
                      transition: "background 120ms ease",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = `color-mix(in srgb, ${S.cyan} 4%, transparent)`; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  >
                    {/* Left accent bar */}
                    <div style={{ width: 2, minHeight: 32, borderRadius: 1, flexShrink: 0, background: S.cyan, opacity: 0.5, marginTop: 3 }} />

                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Meta row */}
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                        <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 600, color: S.cyan, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                          {article.publisher}
                        </span>
                        <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>·</span>
                        <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>{article.ago}</span>
                        <div style={{ flex: 1 }} />
                        <ExternalLink size={8} color={S.tertiary} />
                      </div>

                      {/* Headline */}
                      <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.primary, lineHeight: 1.45, fontWeight: 500 }}>
                        {article.title}
                      </div>
                    </div>
                  </div>
                </a>
              ))
            ) : (
              <div style={{ padding: "20px 14px", fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, textAlign: "center", lineHeight: 1.8, letterSpacing: "0.06em" }}>
                <div>○ No articles retrieved</div>
                <div style={{ fontSize: 12, marginTop: 4, opacity: 0.7 }}>Yahoo Finance may be unavailable</div>
              </div>
            )}
          </div>
        )}

        {/* ── MACRO TAPE ─────────────────────────────────────────────────── */}
        {activeTab === "macro" && (
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "6px 14px", borderBottom: `1px solid ${S.soft}`, background: S.bgSub, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontFamily: S.fontMono, fontSize: 12, color: macroSrc === "live" ? S.green : S.tertiary, letterSpacing: "0.08em" }}>
                {macroSrc === "live" ? "● YAHOO FINANCE" : "○ REFERENCE DATA"}
              </span>
              {asOf && (
                <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>· EOD {asOf}</span>
              )}
              <div style={{ flex: 1 }} />
              <button
                onClick={fetchMacro}
                disabled={macroLoading}
                style={{ background: "none", border: "none", cursor: macroLoading ? "default" : "pointer", color: S.tertiary, display: "flex", alignItems: "center", gap: 3, padding: 0, fontFamily: S.fontMono, fontSize: 12 }}
              >
                <RefreshCw size={9} color={S.tertiary} style={{ animation: macroLoading ? "spin 1s linear infinite" : "none" }} />
                REFRESH
              </button>
            </div>

            {macroSnapshot.map((m, i) => {
              const TIcon    = m.trend === "up" ? TrendingUp : m.trend === "down" ? TrendingDown : Minus;
              const tColor   = m.trend === "up" ? S.green : m.trend === "down" ? S.red : S.tertiary;
              const barPct   = Math.min((m.value / m.maxRef) * 100, 100);
              const barColor =
                m.label === "VIX"
                  ? m.value > 25 ? S.red  : m.value > 18 ? S.amber : S.green
                  : m.label === "DXY INDEX"
                  ? m.value > 105 ? S.green : m.value > 100 ? S.cyan : S.amber
                  : tColor;

              return (
                <div key={m.label} style={{ padding: "10px 14px", borderBottom: i < macroSnapshot.length - 1 ? `1px solid ${S.soft}` : "none", display: "grid", gridTemplateColumns: "90px 1fr 56px", alignItems: "center", gap: 12 }}>
                  <div>
                    <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, letterSpacing: "0.08em", marginBottom: 3 }}>{m.label}</div>
                    <div style={{ fontFamily: S.fontMono, fontSize: 19, fontWeight: 700, color: S.primary, lineHeight: 1, letterSpacing: "-0.01em" }}>{m.display}</div>
                    {m.note && (
                      <div style={{ fontFamily: S.fontMono, fontSize: 7, color: macroSrc === "live" ? S.green : S.tertiary, marginTop: 2, opacity: 0.8 }}>
                        {macroSrc === "live" ? "●" : "○"} {m.note.split(" as of")[0]}
                      </div>
                    )}
                  </div>
                  <div>
                    <div style={{ height: 7, background: S.bgDeep, border: `1px solid ${S.soft}`, borderRadius: 4, overflow: "hidden", marginBottom: 5 }}>
                      <div style={{ height: "100%", width: `${barPct}%`, background: `linear-gradient(90deg, ${barColor}, color-mix(in srgb, ${barColor} 55%, transparent))`, borderRadius: 4, transition: "width 600ms ease" }} />
                    </div>
                    <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.tertiary, lineHeight: 1.3 }}>{m.context}</div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
                    <TIcon size={15} color={tColor} />
                    <span style={{ fontFamily: S.fontMono, fontSize: 7.5, color: tColor, letterSpacing: "0.06em", textTransform: "uppercase" }}>{m.trend}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── CENTRAL BANKS ─────────────────────────────────────────────── */}
        {activeTab === "banks" && <RateBarChart banks={CENTRAL_BANKS} />}

      </div>

      {/* ── Footer ── */}
      <div style={{ padding: "5px 12px", borderTop: `1px solid ${S.soft}`, background: S.bgSub, fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, display: "flex", justifyContent: "space-between", flexShrink: 0 }}>
        <span>
          Geo: {newsLive ? "Yahoo Finance" : "Simulated"} · Macro: {macroSrc === "live" ? "Yahoo Finance" : "Reference"}
        </span>
        <span>Informational only</span>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
