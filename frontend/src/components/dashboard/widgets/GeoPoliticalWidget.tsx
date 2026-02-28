"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Globe2, TrendingUp, TrendingDown, Minus, X, RefreshCw,
} from "lucide-react";
import type { UserContext } from "@/lib/authContext";

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  bgPanel: "var(--bg-panel)",
  bgDeep: "var(--bg-deep)",
  bgSub: "var(--bg-sub)",
  rim: "var(--border-rim)",
  soft: "var(--border-soft)",
  primary: "var(--text-primary)",
  secondary: "var(--text-secondary)",
  tertiary: "var(--text-tertiary)",
  cyan: "var(--accent-cyan)",
  amber: "var(--accent-amber)",
  green: "var(--status-pass,#15803D)",
  red: "var(--accent-red,#B91C1C)",
} as const;

interface GeoEvent {
  severity: "critical" | "high" | "medium" | "low";
  region: string;
  headline: string;
  impact: string;
  timestamp: string;
}

interface MacroItem {
  label: string;
  value: number;
  display: string;
  maxRef: number;
  trend: "up" | "down" | "flat";
  context: string;
  unit: string;
  note?: string;
}

interface CentralBankEntry {
  bank: string;
  rate: number;
  rateStr: string;
  direction: "hawkish" | "dovish" | "neutral";
  nextMeeting: string;
  flag: string;
  daysToMeeting: number;
}

// ─── Static geo events ───────────────────────────────────────────────────────
const GEO_EVENTS: GeoEvent[] = [
  { severity: "high",     region: "LATAM",   headline: "Mexico tariff escalation risk elevated after US trade review", impact: "MXN -1.2%", timestamp: "2h ago" },
  { severity: "critical", region: "ASIA",    headline: "BoJ signals rate hike acceleration amid persistent wage inflation", impact: "JPY +0.8%", timestamp: "4h ago" },
  { severity: "medium",   region: "EMEA",    headline: "ECB dovish pivot strengthens as Eurozone PMI contracts to 49.2", impact: "EUR -0.3%", timestamp: "6h ago" },
  { severity: "low",      region: "AMERICAS",headline: "BoC holds; Canadian housing stabilization supports neutral stance", impact: "CAD +0.1%", timestamp: "8h ago" },
  { severity: "high",     region: "EM",      headline: "Brazil fiscal deficit widening pressures BCB tightening expectations", impact: "BRL -0.9%", timestamp: "10h ago" },
  { severity: "medium",   region: "AFRICA",  headline: "SARB cautious as rand volatility persists; gold support intact", impact: "ZAR -0.4%", timestamp: "12h ago" },
];

// ─── Static macro baseline (overridden by live API data) ─────────────────────
const MACRO_BASELINE: MacroItem[] = [
  { label: "DXY INDEX", value: 106.62, display: "106.62", maxRef: 120, trend: "up",   context: "USD broad strength elevated",          unit: "" },
  { label: "VIX",       value: 18.21,  display: "18.21",  maxRef: 45,  trend: "up",   context: "Moderate uncertainty",                  unit: "" },
  { label: "US 10Y",    value: 4.42,   display: "4.42%",  maxRef: 6,   trend: "up",   context: "Term premium rebuilding",               unit: "%" },
  { label: "FED FUNDS", value: 4.33,   display: "4.33%",  maxRef: 6,   trend: "flat", context: "FOMC target · data-dependent hold",     unit: "%" },
  { label: "BRENT",     value: 74.74,  display: "$74.74", maxRef: 120, trend: "down", context: "OPEC+ balancing act",                   unit: "$" },
  { label: "GOLD",      value: 2934,   display: "$2,934", maxRef: 3500,trend: "up",   context: "Safe-haven bid dominant",               unit: "$" },
];

const MAX_RATE = 14;
const CENTRAL_BANKS: CentralBankEntry[] = [
  { bank: "Federal Reserve", rate: 4.50, rateStr: "4.50%", direction: "neutral", nextMeeting: "Mar 18", flag: "🇺🇸", daysToMeeting: 19 },
  { bank: "ECB",             rate: 3.15, rateStr: "3.15%", direction: "dovish",  nextMeeting: "Apr 03", flag: "🇪🇺", daysToMeeting: 35 },
  { bank: "Bank of Japan",   rate: 0.50, rateStr: "0.50%", direction: "hawkish", nextMeeting: "Mar 14", flag: "🇯🇵", daysToMeeting: 15 },
  { bank: "Banxico",         rate: 9.50, rateStr: "9.50%", direction: "dovish",  nextMeeting: "Mar 27", flag: "🇲🇽", daysToMeeting: 28 },
  { bank: "BCB (Brazil)",    rate:13.25, rateStr:"13.25%", direction: "hawkish", nextMeeting: "Mar 19", flag: "🇧🇷", daysToMeeting: 20 },
  { bank: "Bank of England", rate: 4.25, rateStr: "4.25%", direction: "neutral", nextMeeting: "Mar 20", flag: "🇬🇧", daysToMeeting: 21 },
];

function severityColor(sev: string): string {
  switch (sev) {
    case "critical": return S.red;
    case "high":     return S.amber;
    case "medium":   return S.cyan;
    default:         return S.green;
  }
}
function directionColor(dir: string): string {
  if (dir === "hawkish") return S.red;
  if (dir === "dovish")  return S.green;
  return S.amber;
}

interface Props {
  token: string;
  user: UserContext;
  onRemove?: () => void;
}

// ─── Rate comparison chart ────────────────────────────────────────────────────
function RateBarChart({ banks }: { banks: CentralBankEntry[] }) {
  const sorted = [...banks].sort((a, b) => b.rate - a.rate);
  return (
    <div style={{ padding: "12px 14px" }}>
      <div
        style={{
          fontFamily: S.fontMono, fontSize: 8, color: S.tertiary,
          letterSpacing: "0.1em", marginBottom: 12,
          display: "flex", justifyContent: "space-between",
        }}
      >
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
                  <span style={{ fontSize: 11 }}>{cb.flag}</span>
                  <span style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, color: S.primary }}>
                    {cb.bank.split(" ")[0]}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontFamily: S.fontMono, fontSize: 8, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    {cb.direction === "hawkish" ? "▲" : cb.direction === "dovish" ? "▼" : "●"} {cb.direction}
                  </span>
                  <span style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, color: S.primary, minWidth: 42, textAlign: "right" }}>
                    {cb.rateStr}
                  </span>
                </div>
              </div>
              <div style={{ height: 8, background: S.bgDeep, border: `1px solid ${S.soft}`, borderRadius: 4, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pct}%`, background: `linear-gradient(90deg, ${color}, color-mix(in srgb, ${color} 55%, transparent))`, borderRadius: 4, transition: "width 700ms ease" }} />
              </div>
              <div style={{ fontFamily: S.fontMono, fontSize: 7.5, color: S.tertiary, marginTop: 2, display: "flex", justifyContent: "space-between" }}>
                <span>Next: {cb.nextMeeting}</span>
                <span style={{ color: cb.daysToMeeting <= 15 ? S.amber : S.tertiary }}>{cb.daysToMeeting}d</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function GeoPoliticalWidget({ token, user, onRemove }: Props) {
  const [activeTab, setActiveTab] = useState<"events" | "macro" | "banks">("events");
  const [time,     setTime]       = useState("");
  const [macroLive, setMacroLive] = useState<Record<string, MacroItem>>({});
  const [macroLoading, setMacroLoading] = useState(false);
  const [asOf,     setAsOf]       = useState<string>("");
  const [dataSource, setDataSource] = useState<"live" | "fallback">("fallback");

  useEffect(() => {
    const update = () => setTime(new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC");
    update();
    const id = setInterval(update, 30_000);
    return () => clearInterval(id);
  }, []);

  // Fetch live macro data from our route
  const fetchMacro = () => {
    let cancelled = false;
    setMacroLoading(true);
    (async () => {
      try {
        const res = await fetch("/api/macro-data");
        if (!res.ok) return;
        const json = await res.json() as {
          dataSource: string;
          asOf: string;
          macroData: Record<string, {
            label: string; value: number; display: string; maxRef: number;
            trend: "up"|"down"|"flat"; context: string; unit: string; note?: string;
          }>;
        };
        if (cancelled) return;
        setDataSource(json.dataSource === "live" ? "live" : "fallback");
        setAsOf(json.asOf ?? "");
        // Build a map keyed by the label we use in MACRO_BASELINE
        const map: Record<string, MacroItem> = {};
        for (const [, item] of Object.entries(json.macroData)) {
          map[item.label] = item;
        }
        setMacroLive(map);
      } catch {
        // Keep static data
      } finally {
        if (!cancelled) setMacroLoading(false);
      }
    })();
    return () => { cancelled = true; };
  };

  useEffect(fetchMacro, []);

  // Merge live data over static baseline
  const macroSnapshot: MacroItem[] = useMemo(() =>
    MACRO_BASELINE.map(item => macroLive[item.label] ?? item),
    [macroLive],
  );

  const criticalCount = GEO_EVENTS.filter(e => e.severity === "critical").length;
  const highCount     = GEO_EVENTS.filter(e => e.severity === "high").length;
  const tabs = [
    { key: "events" as const, label: "GEO EVENTS",    count: GEO_EVENTS.length },
    { key: "macro"  as const, label: "MACRO TAPE",    count: macroSnapshot.length },
    { key: "banks"  as const, label: "CENTRAL BANKS", count: CENTRAL_BANKS.length },
  ];

  return (
    <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 6, display: "flex", flexDirection: "column", overflow: "hidden", height: "100%" }}>
      {/* Header */}
      <div className="widget-drag-handle" style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderBottom: `1px solid ${S.rim}`, background: S.bgDeep, flexShrink: 0, cursor: "grab" }}>
        <span aria-hidden="true" style={{ fontFamily: "monospace", fontSize: 13, color: S.tertiary, cursor: "grab", flexShrink: 0, lineHeight: 1, userSelect: "none" }}>⠿</span>
        <Globe2 size={13} color={S.cyan} style={{ flexShrink: 0 }} />
        <span style={{ fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: S.primary, textTransform: "uppercase" }}>
          Geopolitical &amp; Macro
        </span>
        <span style={{ fontFamily: S.fontMono, fontSize: 8, letterSpacing: "0.1em", color: S.amber, background: `color-mix(in srgb, ${S.amber} 10%, transparent)`, border: `1px solid color-mix(in srgb, ${S.amber} 30%, transparent)`, borderRadius: 3, padding: "1px 5px" }}>
          POLISOPHIC
        </span>
        <span style={{
          fontFamily: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
          fontSize: 8,
          fontWeight: 700,
          letterSpacing: "0.08em",
          color: "var(--accent-amber,#F59E0B)",
          background: "color-mix(in srgb, var(--accent-amber,#F59E0B) 10%, transparent)",
          border: "1px solid color-mix(in srgb, var(--accent-amber,#F59E0B) 30%, transparent)",
          padding: "1px 5px",
          borderRadius: 2,
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}>
          SIM DATA
        </span>
        <div style={{ flex: 1 }} />

        {/* Live/date badge */}
        {asOf && (
          <span style={{ fontFamily: S.fontMono, fontSize: 8, color: dataSource === "live" ? S.green : S.tertiary, background: `color-mix(in srgb, ${dataSource === "live" ? S.green : S.tertiary} 10%, transparent)`, border: `1px solid color-mix(in srgb, ${dataSource === "live" ? S.green : S.tertiary} 20%, transparent)`, borderRadius: 3, padding: "1px 5px" }}>
            {dataSource === "live" ? "LIVE · " : ""}{asOf}
          </span>
        )}

        {criticalCount > 0 && (
          <span style={{ fontFamily: S.fontMono, fontSize: 8, color: S.red, background: `color-mix(in srgb, ${S.red} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${S.red} 25%, transparent)`, borderRadius: 3, padding: "1px 5px" }}>
            ● {criticalCount} CRITICAL
          </span>
        )}
        {highCount > 0 && (
          <span style={{ fontFamily: S.fontMono, fontSize: 8, color: S.amber, background: `color-mix(in srgb, ${S.amber} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${S.amber} 25%, transparent)`, borderRadius: 3, padding: "1px 5px" }}>
            {highCount} HIGH
          </span>
        )}

        <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary }}>{time.slice(11, 16)} UTC</span>
        {onRemove && (
          <button onClick={onRemove} title="Remove widget" style={{ background: "none", border: "none", cursor: "pointer", color: S.tertiary, display: "flex", alignItems: "center", padding: 2 }}>
            <X size={12} />
          </button>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${S.rim}`, flexShrink: 0 }}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{ flex: 1, padding: "6px 10px", fontFamily: S.fontMono, fontSize: 9, letterSpacing: "0.06em", fontWeight: 700, cursor: "pointer", color: isActive ? S.cyan : S.tertiary, background: isActive ? `color-mix(in srgb, ${S.cyan} 6%, transparent)` : "transparent", borderBottom: isActive ? `2px solid ${S.cyan}` : "2px solid transparent", border: "none", borderRight: `1px solid ${S.soft}`, display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
              {tab.label}
              <span style={{ fontSize: 8, color: isActive ? S.cyan : S.tertiary, background: isActive ? `color-mix(in srgb, ${S.cyan} 15%, transparent)` : `color-mix(in srgb, ${S.tertiary} 10%, transparent)`, padding: "0 4px", borderRadius: 3, fontWeight: 600 }}>
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: "auto" }}>

        {/* ── GEO EVENTS ────────────────────────────────────────────────── */}
        {activeTab === "events" && (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {GEO_EVENTS.map((evt, i) => (
              <div key={i} style={{ padding: "10px 12px", borderBottom: i < GEO_EVENTS.length - 1 ? `1px solid ${S.soft}` : "none", display: "flex", gap: 10, alignItems: "flex-start" }}>
                <div style={{ width: 3, minHeight: 40, borderRadius: 2, flexShrink: 0, background: severityColor(evt.severity), boxShadow: `0 0 6px color-mix(in srgb, ${severityColor(evt.severity)} 40%, transparent)`, marginTop: 2 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 3, padding: "1px 5px", background: `color-mix(in srgb, ${severityColor(evt.severity)} 10%, transparent)`, border: `1px solid color-mix(in srgb, ${severityColor(evt.severity)} 20%, transparent)`, borderRadius: 3 }}>
                      <span style={{ width: 4, height: 4, borderRadius: "50%", background: severityColor(evt.severity), display: "inline-block" }} />
                      <span style={{ fontFamily: S.fontMono, fontSize: 7.5, fontWeight: 700, letterSpacing: "0.08em", color: severityColor(evt.severity), textTransform: "uppercase" }}>{evt.severity}</span>
                    </div>
                    <span style={{ fontFamily: S.fontMono, fontSize: 8, letterSpacing: "0.06em", color: S.cyan, background: `color-mix(in srgb, ${S.cyan} 8%, transparent)`, padding: "1px 5px", borderRadius: 2, border: `1px solid color-mix(in srgb, ${S.cyan} 15%, transparent)` }}>{evt.region}</span>
                    <div style={{ flex: 1 }} />
                    <span style={{ fontFamily: S.fontMono, fontSize: 8, color: S.tertiary }}>{evt.timestamp}</span>
                  </div>
                  <div style={{ fontFamily: S.fontUI, fontSize: 11, color: S.primary, lineHeight: 1.4, marginBottom: 5 }}>{evt.headline}</div>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 6px", background: `color-mix(in srgb, ${evt.impact.includes("-") ? S.red : S.green} 10%, transparent)`, border: `1px solid color-mix(in srgb, ${evt.impact.includes("-") ? S.red : S.green} 20%, transparent)`, borderRadius: 3 }}>
                    {evt.impact.includes("-") ? <TrendingDown size={9} color={S.red} /> : <TrendingUp size={9} color={S.green} />}
                    <span style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, color: evt.impact.includes("-") ? S.red : S.green }}>{evt.impact}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── MACRO TAPE ────────────────────────────────────────────────── */}
        {activeTab === "macro" && (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {/* Data source header */}
            <div style={{ padding: "6px 14px", borderBottom: `1px solid ${S.soft}`, background: S.bgSub, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontFamily: S.fontMono, fontSize: 8, color: dataSource === "live" ? S.green : S.tertiary, letterSpacing: "0.08em" }}>
                {dataSource === "live" ? "● ALPHA VANTAGE LIVE" : "○ REFERENCE DATA"}
              </span>
              {asOf && (
                <span style={{ fontFamily: S.fontMono, fontSize: 8, color: S.tertiary }}>
                  · EOD {asOf}
                </span>
              )}
              <div style={{ flex: 1 }} />
              <button
                onClick={fetchMacro}
                disabled={macroLoading}
                style={{ background: "none", border: "none", cursor: macroLoading ? "default" : "pointer", color: S.tertiary, display: "flex", alignItems: "center", gap: 3, padding: 0, fontFamily: S.fontMono, fontSize: 8 }}
              >
                <RefreshCw size={9} color={S.tertiary} style={{ animation: macroLoading ? "spin 1s linear infinite" : "none" }} />
                REFRESH
              </button>
            </div>

            {macroSnapshot.map((m, i) => {
              const TIcon = m.trend === "up" ? TrendingUp : m.trend === "down" ? TrendingDown : Minus;
              const tColor = m.trend === "up" ? S.green : m.trend === "down" ? S.red : S.tertiary;
              const barPct = Math.min((m.value / m.maxRef) * 100, 100);
              const barColor =
                m.label === "VIX"
                  ? m.value > 25 ? S.red : m.value > 18 ? S.amber : S.green
                  : m.label === "DXY INDEX"
                  ? m.value > 105 ? S.green : m.value > 100 ? S.cyan : S.amber
                  : tColor;

              return (
                <div key={m.label} style={{ padding: "10px 14px", borderBottom: i < macroSnapshot.length - 1 ? `1px solid ${S.soft}` : "none", display: "grid", gridTemplateColumns: "90px 1fr 56px", alignItems: "center", gap: 12 }}>
                  {/* Label + value */}
                  <div>
                    <div style={{ fontFamily: S.fontMono, fontSize: 8, color: S.tertiary, letterSpacing: "0.08em", marginBottom: 3 }}>{m.label}</div>
                    <div style={{ fontFamily: S.fontMono, fontSize: 19, fontWeight: 700, color: S.primary, lineHeight: 1, letterSpacing: "-0.01em" }}>{m.display}</div>
                    {m.note && (
                      <div style={{ fontFamily: S.fontMono, fontSize: 7, color: dataSource === "live" ? S.green : S.tertiary, marginTop: 2, opacity: 0.8 }}>
                        {dataSource === "live" ? "●" : "○"} {m.note.split(" as of")[0]}
                      </div>
                    )}
                  </div>

                  {/* Bar + context */}
                  <div>
                    <div style={{ height: 7, background: S.bgDeep, border: `1px solid ${S.soft}`, borderRadius: 4, overflow: "hidden", marginBottom: 5 }}>
                      <div style={{ height: "100%", width: `${barPct}%`, background: `linear-gradient(90deg, ${barColor}, color-mix(in srgb, ${barColor} 55%, transparent))`, borderRadius: 4, transition: "width 600ms ease" }} />
                    </div>
                    <div style={{ fontFamily: S.fontUI, fontSize: 9, color: S.tertiary, lineHeight: 1.3 }}>{m.context}</div>
                  </div>

                  {/* Trend */}
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

      {/* Footer */}
      <div style={{ padding: "5px 12px", borderTop: `1px solid ${S.soft}`, background: S.bgSub, fontFamily: S.fontMono, fontSize: 8, color: S.tertiary, display: "flex", justifyContent: "space-between", flexShrink: 0 }}>
        <span>
          Macro: {dataSource === "live" ? "Alpha Vantage" : "Reference"} · Geo: POLISOPHIC intelligence
        </span>
        <span>Informational only</span>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
