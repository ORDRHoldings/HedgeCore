"use client";

import { useEffect, useState } from "react";
import {
  DollarSign, TrendingUp, TrendingDown, Minus, X, ArrowUpRight, ArrowDownRight,
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

/* ─── USD exposure intelligence - static reference with live fetch overlay ── */

interface UsdMetric {
  label: string;
  value: string;
  subValue: string;
  trend: "up" | "down" | "flat";
  color: string;
}

interface CurrencyPairRow {
  pair: string;
  spot: string;
  change24h: number;
  vol1m: string;
  forwardPts: string;
  carryBps: string;
}

const USD_METRICS: UsdMetric[] = [
  { label: "DXY INDEX", value: "104.2", subValue: "vs. basket of 6 majors", trend: "down", color: S.cyan },
  { label: "USD REAL YIELD", value: "1.48%", subValue: "10Y TIPS breakeven", trend: "up", color: S.green },
  { label: "FED FUNDS RATE", value: "4.50%", subValue: "Target range: 4.25-4.50", trend: "flat", color: S.amber },
  { label: "FED NEXT MOVE", value: "HOLD", subValue: "72% probability via CME", trend: "flat", color: S.tertiary },
];

const CURRENCY_PAIRS: CurrencyPairRow[] = [
  { pair: "EUR/USD", spot: "1.0842", change24h: 0.08, vol1m: "7.2%", forwardPts: "-12.4", carryBps: "135" },
  { pair: "USD/JPY", spot: "149.80", change24h: -0.22, vol1m: "9.8%", forwardPts: "+24.6", carryBps: "400" },
  { pair: "GBP/USD", spot: "1.2645", change24h: 0.14, vol1m: "7.8%", forwardPts: "-8.2", carryBps: "25" },
  { pair: "USD/MXN", spot: "17.28", change24h: -0.45, vol1m: "11.2%", forwardPts: "+180", carryBps: "500" },
  { pair: "USD/BRL", spot: "5.12", change24h: -0.31, vol1m: "13.4%", forwardPts: "+240", carryBps: "875" },
  { pair: "USD/CAD", spot: "1.3520", change24h: 0.05, vol1m: "6.1%", forwardPts: "+4.8", carryBps: "125" },
  { pair: "USD/ZAR", spot: "18.92", change24h: -0.62, vol1m: "15.8%", forwardPts: "+95", carryBps: "300" },
  { pair: "EUR/MXN", spot: "18.74", change24h: -0.38, vol1m: "12.5%", forwardPts: "+192", carryBps: "635" },
];

/* ─── USD strength dial data ─────────────────────────────────────────────── */

interface StrengthBar {
  label: string;
  vs: string;
  strength: number; // -100 to +100 (positive = USD stronger)
}

const STRENGTH_BARS: StrengthBar[] = [
  { label: "EUR", vs: "EUR/USD", strength: 15 },
  { label: "JPY", vs: "USD/JPY", strength: 42 },
  { label: "GBP", vs: "GBP/USD", strength: 8 },
  { label: "MXN", vs: "USD/MXN", strength: -18 },
  { label: "BRL", vs: "USD/BRL", strength: 25 },
  { label: "CAD", vs: "USD/CAD", strength: 12 },
  { label: "ZAR", vs: "USD/ZAR", strength: 35 },
];

interface Props {
  token: string;
  user: UserContext;
  onRemove?: () => void;
}

export default function UsdExposureRadarWidget({ token, user, onRemove }: Props) {
  const [activeView, setActiveView] = useState<"overview" | "pairs" | "strength">("overview");
  const [time, setTime] = useState("");

  useEffect(() => {
    const update = () => setTime(new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC");
    update();
    const id = setInterval(update, 30_000);
    return () => clearInterval(id);
  }, []);

  const views = [
    { key: "overview" as const, label: "USD OVERVIEW" },
    { key: "pairs" as const, label: "FX MATRIX" },
    { key: "strength" as const, label: "USD STRENGTH" },
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
        <div style={{
          width: 18, height: 18, borderRadius: "50%",
          background: `linear-gradient(135deg, #22D3EE, #3B82F6)`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <DollarSign size={10} color="#fff" strokeWidth={2.5} />
        </div>
        <span style={{
          fontFamily: S.fontMono, fontSize: 11, fontWeight: 700,
          letterSpacing: "0.08em", color: S.primary, textTransform: "uppercase",
        }}>
          USD Exposure Radar
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
        {views.map((v) => {
          const isActive = activeView === v.key;
          return (
            <button key={v.key} onClick={() => setActiveView(v.key)} style={{
              flex: 1, padding: "6px 10px", fontFamily: S.fontMono, fontSize: 9,
              letterSpacing: "0.06em", fontWeight: 700, cursor: "pointer",
              color: isActive ? S.cyan : S.tertiary,
              background: isActive ? `color-mix(in srgb, ${S.cyan} 6%, transparent)` : "transparent",
              borderBottom: isActive ? `2px solid ${S.cyan}` : "2px solid transparent",
              border: "none",
            }}>
              {v.label}
            </button>
          );
        })}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: "auto" }}>

        {/* Overview Tab */}
        {activeView === "overview" && (
          <div style={{ padding: 0 }}>
            {/* Key metrics grid */}
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 0,
            }}>
              {USD_METRICS.map((m, i) => {
                const TIcon = m.trend === "up" ? TrendingUp : m.trend === "down" ? TrendingDown : Minus;
                const tColor = m.trend === "up" ? S.green : m.trend === "down" ? S.red : S.tertiary;
                return (
                  <div key={m.label} style={{
                    padding: "14px 14px 12px",
                    borderRight: i % 2 === 0 ? `1px solid ${S.soft}` : "none",
                    borderBottom: i < 2 ? `1px solid ${S.soft}` : "none",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{
                        fontFamily: S.fontMono, fontSize: 8, color: S.tertiary,
                        letterSpacing: "0.08em",
                      }}>
                        {m.label}
                      </span>
                      <TIcon size={9} color={tColor} />
                    </div>
                    <div style={{
                      fontFamily: S.fontMono, fontSize: 22, fontWeight: 700,
                      color: m.color, lineHeight: 1, marginBottom: 4,
                    }}>
                      {m.value}
                    </div>
                    <div style={{
                      fontFamily: S.fontUI, fontSize: 9, color: S.tertiary, lineHeight: 1.3,
                    }}>
                      {m.subValue}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Mini strength summary */}
            <div style={{ padding: "10px 14px", borderTop: `1px solid ${S.soft}` }}>
              <div style={{
                fontFamily: S.fontMono, fontSize: 8, color: S.tertiary,
                letterSpacing: "0.08em", marginBottom: 8,
              }}>
                USD POSITIONING VS MAJORS
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {STRENGTH_BARS.slice(0, 5).map((sb) => (
                  <div key={sb.label} style={{
                    display: "flex", alignItems: "center", gap: 4,
                    padding: "3px 8px", background: S.bgSub,
                    border: `1px solid ${S.soft}`, borderRadius: 3,
                  }}>
                    <span style={{
                      fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, color: S.secondary,
                    }}>
                      {sb.label}
                    </span>
                    {sb.strength > 0 ? (
                      <ArrowUpRight size={9} color={S.green} />
                    ) : sb.strength < 0 ? (
                      <ArrowDownRight size={9} color={S.red} />
                    ) : (
                      <Minus size={9} color={S.tertiary} />
                    )}
                    <span style={{
                      fontFamily: S.fontMono, fontSize: 8, fontWeight: 700,
                      color: sb.strength > 0 ? S.green : sb.strength < 0 ? S.red : S.tertiary,
                    }}>
                      {sb.strength > 0 ? "+" : ""}{sb.strength}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* FX Matrix Tab */}
        {activeView === "pairs" && (
          <div>
            {/* Table header */}
            <div style={{
              display: "grid", gridTemplateColumns: "80px 70px 55px 50px 50px 50px",
              padding: "6px 12px", background: S.bgSub,
              borderBottom: `1px solid ${S.soft}`,
            }}>
              {["PAIR", "SPOT", "24H %", "1M VOL", "FWD PTS", "CARRY"].map((h) => (
                <span key={h} style={{
                  fontFamily: S.fontMono, fontSize: 8, color: S.tertiary,
                  letterSpacing: "0.06em",
                }}>
                  {h}
                </span>
              ))}
            </div>

            {CURRENCY_PAIRS.map((cp, i) => (
              <div key={cp.pair} style={{
                display: "grid", gridTemplateColumns: "80px 70px 55px 50px 50px 50px",
                padding: "7px 12px", alignItems: "center",
                borderBottom: i < CURRENCY_PAIRS.length - 1 ? `1px solid ${S.soft}` : "none",
                background: i % 2 === 0 ? "transparent" : S.bgSub,
              }}>
                <span style={{
                  fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, color: S.cyan,
                }}>
                  {cp.pair}
                </span>
                <span style={{
                  fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, color: S.primary,
                }}>
                  {cp.spot}
                </span>
                <span style={{
                  fontFamily: S.fontMono, fontSize: 9, fontWeight: 700,
                  color: cp.change24h >= 0 ? S.green : S.red,
                  display: "flex", alignItems: "center", gap: 2,
                }}>
                  {cp.change24h >= 0 ? "+" : ""}{cp.change24h.toFixed(2)}%
                </span>
                <span style={{
                  fontFamily: S.fontMono, fontSize: 9, color: S.secondary,
                }}>
                  {cp.vol1m}
                </span>
                <span style={{
                  fontFamily: S.fontMono, fontSize: 9, color: S.secondary,
                }}>
                  {cp.forwardPts}
                </span>
                <span style={{
                  fontFamily: S.fontMono, fontSize: 9, color: S.amber,
                }}>
                  {cp.carryBps}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* USD Strength Tab */}
        {activeView === "strength" && (
          <div style={{ padding: "12px 14px" }}>
            <div style={{
              fontFamily: S.fontMono, fontSize: 8, color: S.tertiary,
              letterSpacing: "0.08em", marginBottom: 12,
              display: "flex", justifyContent: "space-between",
            }}>
              <span>USD STRENGTH INDEX (30D ROLLING)</span>
              <span>WEAK ◄ ─── ► STRONG</span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {STRENGTH_BARS.map((sb) => {
                const normalized = (sb.strength + 100) / 200; // 0 to 1
                const barLeft = Math.min(normalized, 0.5) * 100;
                const barWidth = Math.abs(normalized - 0.5) * 100;
                const isPositive = sb.strength > 0;
                const barColor = isPositive ? S.green : S.red;

                return (
                  <div key={sb.label}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                      <span style={{
                        fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, color: S.secondary,
                      }}>
                        USD/{sb.label}
                      </span>
                      <span style={{
                        fontFamily: S.fontMono, fontSize: 10, fontWeight: 700,
                        color: barColor,
                      }}>
                        {sb.strength > 0 ? "+" : ""}{sb.strength}
                      </span>
                    </div>
                    {/* Bar visualization */}
                    <div style={{
                      height: 8, background: S.bgDeep, border: `1px solid ${S.soft}`,
                      borderRadius: 2, overflow: "hidden", position: "relative",
                    }}>
                      {/* Center line */}
                      <div style={{
                        position: "absolute", left: "50%", top: 0, bottom: 0,
                        width: 1, background: S.tertiary, opacity: 0.4,
                      }} />
                      {/* Bar */}
                      <div style={{
                        position: "absolute",
                        left: isPositive ? "50%" : `${barLeft}%`,
                        width: `${barWidth}%`,
                        top: 0, bottom: 0,
                        background: barColor,
                        opacity: 0.7,
                        borderRadius: 1,
                        transition: "all 400ms ease",
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{
        padding: "5px 12px", borderTop: `1px solid ${S.soft}`, background: S.bgSub,
        fontFamily: S.fontMono, fontSize: 8, color: S.tertiary,
        display: "flex", justifyContent: "space-between", flexShrink: 0,
      }}>
        <span>BIS-calibrated reference data · Delayed 15min</span>
        <span>Not investment advice</span>
      </div>
    </div>
  );
}
