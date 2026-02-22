"use client";

/**
 * currency-fx/page.tsx — FX Rates & Forward Curve
 *
 * Displays demo market data: USD/MXN spot rate, forward points by month,
 * implied forward rates, cross rates, and historic crisis shocks.
 * Links to Sandbox for full stress-test analysis.
 */

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSelector } from "react-redux";
import type { RootState } from "@/lib/store";

// ── Design tokens ──────────────────────────────────────────────────────────────
const S = {
  fontUI:   "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  bgDeep:   "var(--bg-deep)",
  bgPanel:  "var(--bg-panel)",
  bgSub:    "var(--bg-sub)",
  rim:      "var(--border-rim)",
  soft:     "var(--border-soft)",
  primary:  "var(--text-primary)",
  secondary:"var(--text-secondary)",
  tertiary: "var(--text-tertiary)",
  cyan:     "var(--accent-cyan)",
  amber:    "var(--accent-amber)",
  pass:     "var(--status-pass,#4ade80)",
  fail:     "var(--accent-red,#f87171)",
} as const;

// ── Static demo market data ────────────────────────────────────────────────────
const DEMO_SPOT = 18.97;
const DEMO_FORWARD_POINTS: Record<string, number> = {
  "2026-03": 0.048,
  "2026-04": 0.091,
  "2026-05": 0.138,
  "2026-06": 0.182,
  "2026-07": 0.225,
  "2026-08": 0.267,
  "2026-09": 0.308,
  "2026-10": 0.349,
  "2026-11": 0.388,
  "2026-12": 0.427,
  "2027-01": 0.464,
  "2027-02": 0.501,
};

const HISTORIC_CRISES = [
  { label: "MXN '94 — Tequila",  shock: -50, desc: "Peso devaluation after NAFTA/reserves collapse" },
  { label: "GFC '08",            shock: -30, desc: "Global Financial Crisis deleveraging" },
  { label: "EZ Debt '11",        shock: -18, desc: "Eurozone sovereign debt contagion" },
  { label: "China '15",          shock: -15, desc: "RMB devaluation / EM sell-off" },
  { label: "Brexit '16",         shock: -12, desc: "GBP shock, EM risk-off spill" },
  { label: "COVID '20",          shock: -25, desc: "Pandemic shock + oil collapse" },
  { label: "TRY '18",            shock: -40, desc: "Turkish lira crisis contagion" },
  { label: "ZAR '20",            shock: -22, desc: "South Africa COVID downgrade" },
  { label: "Fed Hike '22",       shock: -20, desc: "125bps hike cycle, EM outflow" },
];

const CURRENCY_PAIRS = [
  { pair: "USD/MXN", spot: 18.97,  change: +0.12,   vol: "12.4%" },
  { pair: "EUR/MXN", spot: 20.54,  change: -0.08,   vol: "13.1%" },
  { pair: "GBP/MXN", spot: 23.87,  change: +0.22,   vol: "14.3%" },
  { pair: "JPY/MXN", spot:  0.126, change: -0.001,  vol: "15.8%" },
  { pair: "BRL/MXN", spot:  3.42,  change: +0.03,   vol: "18.2%" },
  { pair: "CNY/MXN", spot:  2.61,  change: -0.02,   vol:  "9.6%" },
];

function fmtMonth(ym: string): string {
  const [y, m] = ym.split("-");
  const names = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${names[parseInt(m) - 1]} ${y}`;
}

export default function CurrencyFxPage() {
  const [renderTs, setRenderTs] = useState('');
  useEffect(() => {
    setRenderTs(new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC");
  }, []);

  // Try to read live market from Redux pipeline slice
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const liveMarket = useSelector((s: RootState) => (s as any).pipeline?.market ?? null);
  const spot = (liveMarket?.spot_usdmxn as number) ?? DEMO_SPOT;
  const fwdPoints: Record<string, number> = (liveMarket?.forward_points_by_month as Record<string, number>) ?? DEMO_FORWARD_POINTS;
  const isLive = !!(liveMarket?.spot_usdmxn);

  const buckets = Object.entries(fwdPoints).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div style={{ background: S.bgDeep, minHeight: "100vh", fontFamily: S.fontUI }}>

      {/* ── Page header ── */}
      <div style={{
        padding: "14px 24px",
        borderBottom: `1px solid ${S.rim}`,
        background: S.bgPanel,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: S.tertiary }}>
            FX RATES
          </span>
          <span style={{ color: S.soft }}>·</span>
          <span style={{ fontFamily: S.fontMono, fontSize: 11, letterSpacing: "0.06em", color: S.tertiary }}>
            USD/MXN FORWARD CURVE
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {isLive ? (
            <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.pass }}>● LIVE SNAPSHOT</span>
          ) : (
            <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.amber }}>● DEMO DATA</span>
          )}
          <span suppressHydrationWarning style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary }}>
            {renderTs}
          </span>
        </div>
      </div>

      <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 20 }}>

        {/* ── Spot rate hero KPIs ── */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {[
            { label: "SPOT RATE · USD/MXN",  value: spot.toFixed(4),  sub: "+0.12 · +0.63% · 1D",  subColor: S.pass },
            { label: "IMPLIED VOL · 1Y",      value: "12.4%",          sub: "annualized",             subColor: S.tertiary },
            { label: "NDF BASIS · 12M",       value: fwdPoints["2027-02"] ? `+${(fwdPoints["2027-02"] as number).toFixed(3)}` : "+0.501", sub: "MXN pts", subColor: S.tertiary },
            { label: "SOURCE",                value: "Banxico Fix",    sub: "T+2 · 12:00 CDMX",       subColor: S.tertiary },
          ].map((kpi, i) => (
            <div key={kpi.label} style={{
              background: S.bgPanel,
              border: `1px solid ${S.rim}`,
              borderTop: i === 0 ? `2px solid ${S.cyan}` : `1px solid ${S.rim}`,
              padding: "16px 20px",
              minWidth: 160,
            }}>
              <div style={{ fontFamily: S.fontMono, fontSize: 9, letterSpacing: "0.08em", color: S.tertiary, marginBottom: 6 }}>
                {kpi.label}
              </div>
              <div style={{ fontFamily: S.fontMono, fontSize: i === 0 ? 26 : 20, fontWeight: 700, color: S.primary, lineHeight: 1 }}>
                {kpi.value}
              </div>
              <div style={{ fontFamily: S.fontMono, fontSize: 10, color: kpi.subColor, marginTop: 4 }}>
                {kpi.sub}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>

          {/* ── Forward curve table ── */}
          <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}` }}>
            <div style={{
              padding: "10px 16px", borderBottom: `1px solid ${S.rim}`, background: S.bgSub,
              fontFamily: S.fontMono, fontSize: 10, letterSpacing: "0.08em", color: S.tertiary,
            }}>
              USD/MXN FORWARD CURVE — NDF VANILLA
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${S.soft}` }}>
                  {["BUCKET", "FWD PTS", "ALL-IN RATE", "ANN. BASIS"].map(h => (
                    <th key={h} style={{ padding: "7px 14px", textAlign: "left", fontFamily: S.fontMono, fontSize: 9, letterSpacing: "0.07em", color: S.tertiary, fontWeight: 600 }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {buckets.map(([month, pts], i) => {
                  const fpts = pts as number;
                  const allin = spot + fpts;
                  const monthsOut = i + 1;
                  const annlzd = ((fpts / spot) / (monthsOut / 12) * 100).toFixed(2);
                  return (
                    <tr key={month} style={{
                      borderBottom: `1px solid ${S.soft}`,
                      background: i % 2 === 0 ? "transparent" : `color-mix(in srgb, ${S.rim} 12%, transparent)`,
                    }}>
                      <td style={{ padding: "7px 14px", fontFamily: S.fontMono, fontSize: 11, color: S.cyan }}>{fmtMonth(month)}</td>
                      <td style={{ padding: "7px 14px", fontFamily: S.fontMono, fontSize: 11, color: S.pass }}>+{fpts.toFixed(3)}</td>
                      <td style={{ padding: "7px 14px", fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, color: S.primary }}>{allin.toFixed(4)}</td>
                      <td style={{ padding: "7px 14px", fontFamily: S.fontMono, fontSize: 11, color: S.secondary }}>{annlzd}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ── Right column: cross rates + sandbox CTA ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}` }}>
              <div style={{
                padding: "10px 16px", borderBottom: `1px solid ${S.rim}`, background: S.bgSub,
                fontFamily: S.fontMono, fontSize: 10, letterSpacing: "0.08em", color: S.tertiary,
              }}>
                CROSS RATES vs MXN
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${S.soft}` }}>
                    {["PAIR", "SPOT", "1D CHG", "VOL"].map(h => (
                      <th key={h} style={{ padding: "7px 14px", textAlign: "left", fontFamily: S.fontMono, fontSize: 9, letterSpacing: "0.07em", color: S.tertiary, fontWeight: 600 }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {CURRENCY_PAIRS.map((row, i) => (
                    <tr key={row.pair} style={{
                      borderBottom: `1px solid ${S.soft}`,
                      background: i % 2 === 0 ? "transparent" : `color-mix(in srgb, ${S.rim} 12%, transparent)`,
                    }}>
                      <td style={{ padding: "7px 14px", fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, color: S.cyan }}>{row.pair}</td>
                      <td style={{ padding: "7px 14px", fontFamily: S.fontMono, fontSize: 11, color: S.primary }}>
                        {row.spot.toFixed(row.pair.includes("JPY") ? 3 : 2)}
                      </td>
                      <td style={{ padding: "7px 14px", fontFamily: S.fontMono, fontSize: 11, color: row.change >= 0 ? S.pass : S.fail }}>
                        {row.change >= 0 ? "+" : ""}{row.change.toFixed(row.pair.includes("JPY") ? 3 : 2)}
                      </td>
                      <td style={{ padding: "7px 14px", fontFamily: S.fontMono, fontSize: 11, color: S.secondary }}>{row.vol}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Sandbox CTA */}
            <div style={{
              background: S.bgPanel, border: `1px solid ${S.rim}`, borderLeft: `3px solid ${S.cyan}`,
              padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
            }}>
              <div>
                <div style={{ fontFamily: S.fontUI, fontSize: 13, fontWeight: 600, color: S.primary, marginBottom: 3 }}>
                  Stress-Test Your Portfolio
                </div>
                <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.tertiary }}>
                  Simulate P&L impact of historic crises and custom shocks.
                </div>
              </div>
              <Link href="/sandbox" style={{
                fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.07em",
                color: S.bgPanel, background: S.cyan, padding: "7px 16px", borderRadius: 2,
                textDecoration: "none", whiteSpace: "nowrap", flexShrink: 0,
              }}>
                OPEN SANDBOX →
              </Link>
            </div>
          </div>
        </div>

        {/* ── Historic crisis shocks ── */}
        <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}` }}>
          <div style={{
            padding: "10px 16px", borderBottom: `1px solid ${S.rim}`, background: S.bgSub,
            fontFamily: S.fontMono, fontSize: 10, letterSpacing: "0.08em", color: S.tertiary,
          }}>
            HISTORIC MXN MARKET CRISES — REFERENCE SHOCKS
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)" }}>
            {HISTORIC_CRISES.map((crisis, i) => {
              const implied = spot * (1 + crisis.shock / 100);
              const isNeg = crisis.shock < 0;
              const borderRight = (i % 3 !== 2) ? `1px solid ${S.soft}` : "none";
              return (
                <div key={crisis.label} style={{
                  padding: "11px 16px", borderRight, borderBottom: `1px solid ${S.soft}`,
                  display: "flex", gap: 12, alignItems: "flex-start",
                }}>
                  <div style={{ fontFamily: S.fontMono, fontSize: 13, fontWeight: 700, color: isNeg ? S.fail : S.pass, minWidth: 46, flexShrink: 0 }}>
                    {crisis.shock >= 0 ? "+" : ""}{crisis.shock}%
                  </div>
                  <div>
                    <div style={{ fontFamily: S.fontUI, fontSize: 12, fontWeight: 600, color: S.primary }}>{crisis.label}</div>
                    <div style={{ fontFamily: S.fontUI, fontSize: 11, color: S.tertiary, marginTop: 2 }}>{crisis.desc}</div>
                    <div style={{ fontFamily: S.fontMono, fontSize: 10, color: isNeg ? S.fail : S.pass, marginTop: 3 }}>
                      Implied: {implied.toFixed(2)} USD/MXN
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, textAlign: "center" }}>
          Rates are {isLive ? "from live session snapshot" : "illustrative demo data"} · Banxico official fix · T+2 settlement ·{" "}
          <Link href="/hedgewiki" style={{ color: S.cyan, textDecoration: "none" }}>
            See HedgeWiki for NDF mechanics →
          </Link>
        </div>

      </div>
    </div>
  );
}
