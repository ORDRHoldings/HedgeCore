"use client";

import { useState, useEffect } from "react";
import {
  Globe2, TrendingUp, TrendingDown, Minus, AlertTriangle, ArrowRight,
  Landmark, X, Shield, Activity,
} from "lucide-react";
import type { UserContext } from "@/lib/authContext";
import { dashboardFetch } from "@/lib/api/dashboardClient";

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

/* ─── POLISOPHIC-ready intelligence database ────────────────────────────── */

interface GeoEvent {
  severity: "critical" | "high" | "medium" | "low";
  region: string;
  headline: string;
  impact: string;
  timestamp: string;
}

interface MacroSnapshot {
  label: string;
  value: string;
  trend: "up" | "down" | "flat";
  context: string;
}

interface CentralBankEntry {
  bank: string;
  rate: string;
  direction: "hawkish" | "dovish" | "neutral";
  nextMeeting: string;
  flag: string;
}

const GEO_EVENTS: GeoEvent[] = [
  { severity: "high", region: "LATAM", headline: "Mexico tariff escalation risk elevated after trade review", impact: "MXN -1.2%", timestamp: "2h ago" },
  { severity: "critical", region: "ASIA", headline: "BoJ signals rate hike cycle acceleration amid sticky inflation", impact: "JPY +0.8%", timestamp: "4h ago" },
  { severity: "medium", region: "EMEA", headline: "ECB dovish pivot strengthens as Eurozone PMI contracts", impact: "EUR -0.3%", timestamp: "6h ago" },
  { severity: "low", region: "AMERICAS", headline: "BoC holds; Canadian housing stabilization supports neutral stance", impact: "CAD +0.1%", timestamp: "8h ago" },
  { severity: "high", region: "EM", headline: "Brazil fiscal deficit widening pressures BCB tightening expectations", impact: "BRL -0.9%", timestamp: "10h ago" },
  { severity: "medium", region: "AFRICA", headline: "SARB cautious as rand volatility persists; gold support intact", impact: "ZAR -0.4%", timestamp: "12h ago" },
];

const MACRO_SNAPSHOT: MacroSnapshot[] = [
  { label: "DXY INDEX", value: "104.2", trend: "down", context: "Softening on dovish repricing" },
  { label: "VIX", value: "14.8", trend: "down", context: "Risk-on environment" },
  { label: "US 10Y", value: "4.28%", trend: "up", context: "Term premium rebuilding" },
  { label: "FED FUNDS", value: "4.50%", trend: "flat", context: "Data-dependent hold" },
  { label: "BRENT", value: "$78.4", trend: "up", context: "OPEC+ cuts extended" },
  { label: "GOLD", value: "$2,680", trend: "up", context: "Safe haven bid persists" },
];

const CENTRAL_BANKS: CentralBankEntry[] = [
  { bank: "Federal Reserve", rate: "4.50%", direction: "neutral", nextMeeting: "Mar 18", flag: "🇺🇸" },
  { bank: "ECB", rate: "3.15%", direction: "dovish", nextMeeting: "Apr 03", flag: "🇪🇺" },
  { bank: "Bank of Japan", rate: "0.50%", direction: "hawkish", nextMeeting: "Mar 14", flag: "🇯🇵" },
  { bank: "Banxico", rate: "9.50%", direction: "dovish", nextMeeting: "Mar 27", flag: "🇲🇽" },
  { bank: "BCB (Brazil)", rate: "13.25%", direction: "hawkish", nextMeeting: "Mar 19", flag: "🇧🇷" },
  { bank: "Bank of England", rate: "4.25%", direction: "neutral", nextMeeting: "Mar 20", flag: "🇬🇧" },
];

function severityColor(sev: string): string {
  switch (sev) {
    case "critical": return S.red;
    case "high": return S.amber;
    case "medium": return S.cyan;
    default: return S.green;
  }
}

function directionColor(dir: string): string {
  if (dir === "hawkish") return S.red;
  if (dir === "dovish") return S.green;
  return S.tertiary;
}

interface Props {
  token: string;
  user: UserContext;
  onRemove?: () => void;
}

export default function GeoPoliticalWidget({ token, user, onRemove }: Props) {
  const [activeTab, setActiveTab] = useState<"events" | "macro" | "banks">("events");
  const [time, setTime] = useState("");

  useEffect(() => {
    const update = () => setTime(new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC");
    update();
    const id = setInterval(update, 30_000);
    return () => clearInterval(id);
  }, []);

  const tabs = [
    { key: "events" as const, label: "GEO EVENTS", count: GEO_EVENTS.length },
    { key: "macro" as const, label: "MACRO TAPE", count: MACRO_SNAPSHOT.length },
    { key: "banks" as const, label: "CENTRAL BANKS", count: CENTRAL_BANKS.length },
  ];

  return (
    <div style={{
      background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 6,
      display: "flex", flexDirection: "column", overflow: "hidden", height: "100%",
    }}>
      {/* Header */}
      <div className="widget-drag-handle" style={{
        display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
        borderBottom: `1px solid ${S.rim}`, background: S.bgDeep, flexShrink: 0, cursor: "grab",
      }}>
        <Globe2 size={13} color={S.cyan} style={{ flexShrink: 0 }} />
        <span style={{
          fontFamily: S.fontMono, fontSize: 11, fontWeight: 700,
          letterSpacing: "0.08em", color: S.primary, textTransform: "uppercase",
        }}>
          Geopolitical & Macro
        </span>
        <span style={{
          fontFamily: S.fontMono, fontSize: 8, letterSpacing: "0.1em",
          color: S.amber, background: `color-mix(in srgb, ${S.amber} 10%, transparent)`,
          border: `1px solid color-mix(in srgb, ${S.amber} 30%, transparent)`,
          borderRadius: 3, padding: "1px 5px", textTransform: "uppercase",
        }}>
          POLISOPHIC
        </span>
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary }}>{time}</span>
        {onRemove && (
          <button onClick={onRemove} title="Remove widget" style={{
            background: "none", border: "none", cursor: "pointer",
            color: S.tertiary, display: "flex", alignItems: "center", padding: 2,
          }}>
            <X size={12} />
          </button>
        )}
      </div>

      {/* Tabs */}
      <div style={{
        display: "flex", gap: 0, borderBottom: `1px solid ${S.rim}`, flexShrink: 0,
      }}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
              flex: 1, padding: "6px 10px", fontFamily: S.fontMono, fontSize: 9,
              letterSpacing: "0.06em", fontWeight: 700, cursor: "pointer",
              color: isActive ? S.cyan : S.tertiary,
              background: isActive ? `color-mix(in srgb, ${S.cyan} 6%, transparent)` : "transparent",
              borderBottom: isActive ? `2px solid ${S.cyan}` : "2px solid transparent",
              border: "none", borderRight: `1px solid ${S.soft}`,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
            }}>
              {tab.label}
              <span style={{
                fontSize: 8, color: isActive ? S.cyan : S.tertiary,
                background: isActive
                  ? `color-mix(in srgb, ${S.cyan} 15%, transparent)`
                  : `color-mix(in srgb, ${S.tertiary} 10%, transparent)`,
                padding: "0 4px", borderRadius: 3, fontWeight: 600,
              }}>
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: "auto" }}>

        {/* Events Tab */}
        {activeTab === "events" && (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {GEO_EVENTS.map((evt, i) => (
              <div key={i} style={{
                padding: "10px 12px",
                borderBottom: i < GEO_EVENTS.length - 1 ? `1px solid ${S.soft}` : "none",
                display: "flex", gap: 10, alignItems: "flex-start",
              }}>
                {/* Severity indicator */}
                <div style={{
                  width: 3, minHeight: 36, borderRadius: 2, flexShrink: 0,
                  background: severityColor(evt.severity),
                  marginTop: 2,
                }} />

                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* Meta row */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                    <span style={{
                      fontFamily: S.fontMono, fontSize: 8, fontWeight: 700,
                      letterSpacing: "0.08em", color: severityColor(evt.severity),
                      textTransform: "uppercase",
                    }}>
                      {evt.severity}
                    </span>
                    <span style={{
                      fontFamily: S.fontMono, fontSize: 8, letterSpacing: "0.06em",
                      color: S.cyan,
                      background: `color-mix(in srgb, ${S.cyan} 8%, transparent)`,
                      padding: "0 4px", borderRadius: 2,
                    }}>
                      {evt.region}
                    </span>
                    <div style={{ flex: 1 }} />
                    <span style={{
                      fontFamily: S.fontMono, fontSize: 8, color: S.tertiary,
                    }}>
                      {evt.timestamp}
                    </span>
                  </div>

                  {/* Headline */}
                  <div style={{
                    fontFamily: S.fontUI, fontSize: 11, color: S.primary,
                    lineHeight: 1.4, marginBottom: 3,
                  }}>
                    {evt.headline}
                  </div>

                  {/* Impact */}
                  <div style={{
                    fontFamily: S.fontMono, fontSize: 9, fontWeight: 700,
                    color: evt.impact.includes("-") ? S.red : S.green,
                    display: "flex", alignItems: "center", gap: 4,
                  }}>
                    {evt.impact.includes("-")
                      ? <TrendingDown size={9} />
                      : <TrendingUp size={9} />}
                    {evt.impact}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Macro Tape Tab */}
        {activeTab === "macro" && (
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 0,
          }}>
            {MACRO_SNAPSHOT.map((m, i) => {
              const TIcon = m.trend === "up" ? TrendingUp : m.trend === "down" ? TrendingDown : Minus;
              const tColor = m.trend === "up" ? S.green : m.trend === "down" ? S.red : S.tertiary;
              return (
                <div key={m.label} style={{
                  padding: "12px 14px",
                  borderRight: i % 2 === 0 ? `1px solid ${S.soft}` : "none",
                  borderBottom: i < MACRO_SNAPSHOT.length - 2 ? `1px solid ${S.soft}` : "none",
                  display: "flex", flexDirection: "column", gap: 4,
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{
                      fontFamily: S.fontMono, fontSize: 8, color: S.tertiary,
                      letterSpacing: "0.08em",
                    }}>
                      {m.label}
                    </span>
                    <TIcon size={9} color={tColor} />
                  </div>
                  <div style={{
                    fontFamily: S.fontMono, fontSize: 18, fontWeight: 700,
                    color: S.primary, lineHeight: 1,
                  }}>
                    {m.value}
                  </div>
                  <div style={{
                    fontFamily: S.fontUI, fontSize: 9, color: S.tertiary, lineHeight: 1.3,
                  }}>
                    {m.context}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Central Banks Tab */}
        {activeTab === "banks" && (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {/* Table header */}
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 60px 70px 60px",
              padding: "6px 12px", background: S.bgSub,
              borderBottom: `1px solid ${S.soft}`,
            }}>
              {["INSTITUTION", "RATE", "STANCE", "NEXT"].map((h) => (
                <span key={h} style={{
                  fontFamily: S.fontMono, fontSize: 8, color: S.tertiary,
                  letterSpacing: "0.08em",
                }}>
                  {h}
                </span>
              ))}
            </div>

            {CENTRAL_BANKS.map((cb, i) => (
              <div key={cb.bank} style={{
                display: "grid", gridTemplateColumns: "1fr 60px 70px 60px",
                padding: "8px 12px", alignItems: "center",
                borderBottom: i < CENTRAL_BANKS.length - 1 ? `1px solid ${S.soft}` : "none",
                background: i % 2 === 0 ? "transparent" : S.bgSub,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 12 }}>{cb.flag}</span>
                  <span style={{
                    fontFamily: S.fontUI, fontSize: 10, color: S.primary, fontWeight: 600,
                  }}>
                    {cb.bank}
                  </span>
                </div>
                <span style={{
                  fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, color: S.primary,
                }}>
                  {cb.rate}
                </span>
                <span style={{
                  fontFamily: S.fontMono, fontSize: 9, fontWeight: 700,
                  color: directionColor(cb.direction),
                  textTransform: "uppercase", letterSpacing: "0.04em",
                }}>
                  {cb.direction === "hawkish" ? "▲" : cb.direction === "dovish" ? "▼" : "●"} {cb.direction}
                </span>
                <span style={{
                  fontFamily: S.fontMono, fontSize: 9, color: S.tertiary,
                }}>
                  {cb.nextMeeting}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{
        padding: "5px 12px", borderTop: `1px solid ${S.soft}`, background: S.bgSub,
        fontFamily: S.fontMono, fontSize: 8, color: S.tertiary,
        display: "flex", justifyContent: "space-between", flexShrink: 0,
      }}>
        <span>Source: POLISOPHIC intelligence feed · Institutional macro data</span>
        <span>Informational only</span>
      </div>
    </div>
  );
}
