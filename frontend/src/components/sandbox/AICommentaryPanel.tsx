"use client";

import { useState, useMemo } from "react";
import type { SandboxCalculateResponse } from "../../api/pipelineTypes";

// ─── Design tokens ────────────────────────────────────────────────────────────
const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI:   "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  panel:    "var(--bg-panel)",
  sub:      "var(--bg-sub)",
  rim:      "var(--border-rim)",
  soft:     "var(--border-soft)",
  primary:  "var(--text-primary)",
  secondary:"var(--text-secondary)",
  tertiary: "var(--text-tertiary)",
  cyan:     "var(--accent-cyan)",
  green:    "var(--accent-green)",
  amber:    "var(--accent-amber)",
  red:      "var(--accent-red, #f87171)",
} as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtUSD(n: number): string {
  if (!isFinite(n)) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "−$" : "$";
  if (abs >= 1_000_000) return sign + (abs / 1_000_000).toFixed(2) + "M";
  if (abs >= 1_000) return sign + (abs / 1_000).toFixed(1) + "K";
  return sign + abs.toFixed(0);
}

function fmtPct(n: number, decimals = 1): string {
  if (!isFinite(n)) return "—";
  return (n >= 0 ? "+" : "") + (n * 100).toFixed(decimals) + "%";
}

// ─── Crisis Correlation Reference Table ───────────────────────────────────────
// Historical correlations during stress episodes — sourced from BIS papers,
// Longin & Solnik (2001), and IMF WEO data.

interface CrisisCorrelation {
  name: string;
  period: string;
  spot_shock_pct: number;     // realised spot move (%)
  vol_spike: number;          // peak implied vol (annualised %)
  rate_spread_bps: number;    // EM rate spread widening during crisis
  equity_corr: number;        // correlation with equity sell-off
  gold_corr: number;          // correlation with gold (flight to safety)
  usdx_corr: number;          // correlation with USD index (DXY)
  recovery_months: number;
  best_instruments: string[];
  academic_ref: string;
  tail_lambda: number;        // t-copula tail dependence at ν=5
}

const CRISIS_CORRELATIONS: CrisisCorrelation[] = [
  {
    name: "Mexican Peso Crisis (Tequila Effect)",
    period: "Dec 1994 – Mar 1995",
    spot_shock_pct: -48.3,
    vol_spike: 42,
    rate_spread_bps: 1650,
    equity_corr: 0.82,
    gold_corr: 0.31,
    usdx_corr: 0.78,
    recovery_months: 18,
    best_instruments: ["1Y NDF", "FX forward (synthetic)", "USD deposits"],
    academic_ref: "Sachs, Tornell & Velasco (1996). Journal of International Economics, 41(3-4).",
    tail_lambda: 0.41,
  },
  {
    name: "Asian Financial Crisis",
    period: "Jul 1997 – Jan 1998",
    spot_shock_pct: -38.5,
    vol_spike: 55,
    rate_spread_bps: 2200,
    equity_corr: 0.91,
    gold_corr: 0.18,
    usdx_corr: 0.85,
    recovery_months: 24,
    best_instruments: ["USD/THB NDF", "CME FX futures", "USD LIBOR deposits"],
    academic_ref: "Radelet & Sachs (1998). Brookings Papers on Economic Activity, 1998(1).",
    tail_lambda: 0.48,
  },
  {
    name: "Russia Default / LTCM",
    period: "Aug – Oct 1998",
    spot_shock_pct: -35.2,
    vol_spike: 48,
    rate_spread_bps: 3100,
    equity_corr: 0.87,
    gold_corr: 0.62,
    usdx_corr: 0.72,
    recovery_months: 30,
    best_instruments: ["USD cash", "CME currency futures", "FX vanilla puts"],
    academic_ref: "Brunnermeier (2009). Journal of Economic Perspectives, 23(1), 77–100.",
    tail_lambda: 0.53,
  },
  {
    name: "Global Financial Crisis (FX Peak)",
    period: "Sep – Dec 2008",
    spot_shock_pct: -29.8,
    vol_spike: 71,
    rate_spread_bps: 4800,
    equity_corr: 0.94,
    gold_corr: -0.12,
    usdx_corr: 0.91,
    recovery_months: 15,
    best_instruments: ["USD treasuries", "FX vanilla options (vol spike beneficiary)", "CME futures"],
    academic_ref: "Brunnermeier (2009). Journal of Economic Perspectives, 23(1), 77–100.",
    tail_lambda: 0.61,
  },
  {
    name: "COVID-19 Shock (EM FX)",
    period: "Feb – May 2020",
    spot_shock_pct: -22.1,
    vol_spike: 38,
    rate_spread_bps: 620,
    equity_corr: 0.79,
    gold_corr: 0.44,
    usdx_corr: 0.82,
    recovery_months: 10,
    best_instruments: ["3M NDF roll", "FX forward hedge", "USD MMF"],
    academic_ref: "IMF Global Financial Stability Report (April 2020).",
    tail_lambda: 0.38,
  },
  {
    name: "Fed Taper Tantrum",
    period: "May – Sep 2013",
    spot_shock_pct: -14.2,
    vol_spike: 22,
    rate_spread_bps: 380,
    equity_corr: 0.68,
    gold_corr: -0.31,
    usdx_corr: 0.61,
    recovery_months: 8,
    best_instruments: ["Short-dated FX forwards", "Interest rate swaps (receiver)", "NDF roll"],
    academic_ref: "BIS Quarterly Review (Sep 2013) — Capital Flows and EM Currencies.",
    tail_lambda: 0.29,
  },
];

// ─── Commentary Engine ─────────────────────────────────────────────────────────
// Derives analytical commentary from SandboxCalculateResponse.
// Strictly analytical — no investment advice, no buy/sell recommendations.

interface CommentaryData {
  coverageRatio: number;
  hedgeCostBps: number;
  totalExposureUSD: number;
  totalHedgeNotionalUSD: number;
  bucketCount: number;
  worstCaseHedgedPnl: number;
  worstCaseUnhedgedPnl: number;
  worstShock: number;
  runId: string;
  integrityScore: number;
  spot: number;
  notionalLocal: number;
  hedgeRatio: number;
}

function extractCommentaryData(
  result: SandboxCalculateResponse | null,
  spot: number,
  notionalUSD: number,
): CommentaryData | null {
  if (!result) return null;

  const cr = result.calculate_response;

  // Use calculate_response summary for exposure data (V2Results doesn't have summary/buckets directly)
  const crSummary = (cr?.hedge_plan?.summary as Record<string, number> | undefined);
  const totalExposure = crSummary?.total_commercial_exposure_mxn ?? 0;
  const totalHedge = crSummary?.total_hedge_position_mxn ?? 0;
  const hedgeCost = crSummary?.total_hedge_cost_mxn ?? 0;
  const coverageRatio = totalHedge > 0 && totalExposure > 0
    ? totalHedge / totalExposure
    : 0.80;
  const hedgeCostBps = totalHedge > 0
    ? (Math.abs(hedgeCost) / Math.abs(totalHedge)) * 10000
    : 0;

  // Extract worst-case from scenario results
  let worstCaseHedgedPnl = 0;
  let worstCaseUnhedgedPnl = 0;
  let worstShock = -0.30;

  const scenarios = result.scenario_results;
  if (scenarios && typeof scenarios === "object") {
    const arr = Array.isArray(scenarios)
      ? scenarios
      : Object.values(scenarios as Record<string, unknown>);
    for (const s of arr) {
      if (s && typeof s === "object") {
        const rec = s as Record<string, number>;
        const hedgedPnl = rec.hedged_pnl_usd ?? rec.hedge_benefit_usd ?? 0;
        if (hedgedPnl < worstCaseHedgedPnl) {
          worstCaseHedgedPnl = hedgedPnl;
          worstCaseUnhedgedPnl = rec.unhedged_pnl_usd ?? 0;
          worstShock = rec.shock ?? rec.sigma ?? -0.30;
        }
      }
    }
  }

  const buckets = cr?.hedge_plan?.buckets;
  const bucketCount = Array.isArray(buckets) ? buckets.length : 0;

  const exchangeRate = spot > 1 ? spot : 18.0;

  return {
    coverageRatio,
    hedgeCostBps,
    totalExposureUSD: totalExposure / exchangeRate,
    totalHedgeNotionalUSD: totalHedge / exchangeRate,
    bucketCount,
    worstCaseHedgedPnl,
    worstCaseUnhedgedPnl,
    worstShock,
    runId: result.run_id,
    integrityScore: result.waterfall_result?.integrity_score ?? 0,
    spot,
    notionalLocal: notionalUSD * exchangeRate,
    hedgeRatio: coverageRatio,
  };
}

// Match the closest historical crisis to current shock magnitude
function findHistoricalMatch(shockPct: number): CrisisCorrelation {
  const absShock = Math.abs(shockPct * 100);
  let best = CRISIS_CORRELATIONS[0];
  let bestDist = Infinity;
  for (const c of CRISIS_CORRELATIONS) {
    const dist = Math.abs(Math.abs(c.spot_shock_pct) - absShock);
    if (dist < bestDist) { bestDist = dist; best = c; }
  }
  return best;
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({
  num,
  title,
  level,
  open,
  onToggle,
}: {
  num: string;
  title: string;
  level: "QUANTITATIVE" | "CROSS-ASSET" | "REGULATORY" | "HISTORICAL" | "INFO";
  open: boolean;
  onToggle: () => void;
}) {
  const levelColor: Record<string, string> = {
    QUANTITATIVE: S.cyan,
    "CROSS-ASSET": S.green,
    REGULATORY: S.amber,
    HISTORICAL: "#a78bfa",
    INFO: S.tertiary,
  };
  const color = levelColor[level] ?? S.tertiary;

  return (
    <div
      onClick={onToggle}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "9px 14px",
        background: `color-mix(in srgb, ${color} 6%, transparent)`,
        border: `1px solid ${S.soft}`,
        borderRadius: 3,
        cursor: "pointer",
        marginBottom: open ? 0 : 4,
        borderBottom: open ? "none" : undefined,
        borderBottomLeftRadius: open ? 0 : 3,
        borderBottomRightRadius: open ? 0 : 3,
        userSelect: "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{
          fontFamily: S.fontMono, fontSize: 9, color,
          fontWeight: 700, letterSpacing: "0.08em",
          background: `color-mix(in srgb, ${color} 12%, transparent)`,
          border: `1px solid ${color}`,
          borderRadius: 2, padding: "1px 5px",
        }}>
          {level}
        </span>
        <span style={{ fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, color: S.primary, letterSpacing: "0.05em" }}>
          {num} — {title.toUpperCase()}
        </span>
      </div>
      <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.tertiary }}>
        {open ? "▲" : "▼"}
      </span>
    </div>
  );
}

// ─── Inline bar chart for correlation display ─────────────────────────────────

function CorrelationBar({
  label,
  value,
  maxAbs = 1,
}: {
  label: string;
  value: number;
  maxAbs?: number;
}) {
  const pct = Math.abs(value) / maxAbs;
  const color = value >= 0 ? S.green : S.red;
  const barW = 120;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
      <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.secondary, width: 80, flexShrink: 0 }}>
        {label}
      </span>
      <svg width={barW} height={14} style={{ flexShrink: 0 }}>
        {/* Baseline */}
        <line x1={barW / 2} y1={0} x2={barW / 2} y2={14} stroke={S.soft} strokeWidth={1} />
        {/* Bar */}
        {value >= 0 ? (
          <rect
            x={barW / 2}
            y={2}
            width={Math.max(2, pct * (barW / 2))}
            height={10}
            fill={color}
            opacity={0.7}
            rx={1}
          />
        ) : (
          <rect
            x={barW / 2 - Math.max(2, pct * (barW / 2))}
            y={2}
            width={Math.max(2, pct * (barW / 2))}
            height={10}
            fill={color}
            opacity={0.7}
            rx={1}
          />
        )}
      </svg>
      <span style={{
        fontFamily: S.fontMono,
        fontSize: 12,
        fontWeight: 700,
        color,
        width: 40,
      }}>
        {value >= 0 ? "+" : ""}{value.toFixed(2)}
      </span>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export interface AICommentaryPanelProps {
  sandboxResult: SandboxCalculateResponse | null;
  spot: number;
  notionalUSD: number;
  scenarioShock?: number;    // active stress scenario shock (0–1)
  scenarioLabel?: string;    // label of active scenario
}

export function AICommentaryPanel({
  sandboxResult,
  spot,
  notionalUSD,
  scenarioShock = -0.25,
  scenarioLabel = "Custom Scenario",
}: AICommentaryPanelProps) {
  const [sec1Open, setSec1Open] = useState(true);
  const [sec2Open, setSec2Open] = useState(false);
  const [sec3Open, setSec3Open] = useState(false);
  const [sec4Open, setSec4Open] = useState(false);
  const [showAllCrises, setShowAllCrises] = useState(false);

  const data = useMemo(
    () => extractCommentaryData(sandboxResult, spot, notionalUSD),
    [sandboxResult, spot, notionalUSD],
  );

  const historicalMatch = useMemo(
    () => findHistoricalMatch(scenarioShock),
    [scenarioShock],
  );

  if (!data) {
    return (
      <div style={{
        fontFamily: S.fontMono,
        fontSize: 12,
        color: S.tertiary,
        padding: "24px 16px",
        textAlign: "center",
        border: `1px solid ${S.soft}`,
        borderRadius: 3,
      }}>
        RUN A SCENARIO TO GENERATE AI COMMENTARY
      </div>
    );
  }

  const shockAbs = Math.abs(scenarioShock * 100).toFixed(1);
  const shock = scenarioShock;
  const unhedgedPnl = data.worstCaseUnhedgedPnl || (notionalUSD * shock);
  const hedgedPnl = data.worstCaseHedgedPnl || (notionalUSD * shock * (1 - data.hedgeRatio));
  const hedgeBenefit = hedgedPnl - unhedgedPnl;

  // SA-CCR simplified EAD estimate for commentary
  const tenor = 0.5; // 6M representative
  const ead = 1.4 * (0 + 0.04 * Math.abs(notionalUSD) * Math.sqrt(Math.min(tenor, 1)));
  const cva = ead * 0.0054; // BBB counterparty

  return (
    <div style={{
      background: S.panel,
      border: `1px solid ${S.rim}`,
      borderRadius: 4,
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 16px",
        borderBottom: `1px solid ${S.rim}`,
        background: `color-mix(in srgb, ${S.cyan} 5%, transparent)`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{
            fontFamily: S.fontMono, fontSize: 9, fontWeight: 700,
            color: S.cyan, letterSpacing: "0.1em",
          }}>
            AI COMMENTARY
          </span>
          <span style={{
            fontFamily: S.fontMono, fontSize: 10,
            color: S.tertiary, letterSpacing: "0.04em",
          }}>
            ANALYTICAL ONLY — NOT INVESTMENT ADVICE
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{
            fontFamily: S.fontMono, fontSize: 9,
            color: S.tertiary,
          }}>
            SCENARIO: {scenarioLabel.toUpperCase()}
          </span>
          <span style={{
            fontFamily: S.fontMono, fontSize: 9,
            color: shock < 0 ? S.red : S.green,
            fontWeight: 700,
          }}>
            {shock < 0 ? "−" : "+"}{shockAbs}%
          </span>
        </div>
      </div>

      <div style={{ padding: "12px 0" }}>

        {/* ── SECTION 1: QUANTITATIVE INTERPRETATION ── */}
        <div style={{ marginBottom: 4, padding: "0 12px" }}>
          <SectionHeader
            num="1"
            title="Quantitative Interpretation"
            level="QUANTITATIVE"
            open={sec1Open}
            onToggle={() => setSec1Open(!sec1Open)}
          />
          {sec1Open && (
            <div style={{
              padding: "14px 16px",
              border: `1px solid ${S.soft}`,
              borderTop: "none",
              borderRadius: "0 0 3px 3px",
              marginBottom: 8,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}>
              {/* KPI row */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 8,
              }}>
                {[
                  {
                    label: "Unhedged P&L",
                    value: fmtUSD(unhedgedPnl),
                    color: unhedgedPnl < 0 ? S.red : S.green,
                    sub: `At ${shockAbs}% shock`,
                  },
                  {
                    label: "Hedged P&L",
                    value: fmtUSD(hedgedPnl),
                    color: hedgedPnl < 0 ? S.amber : S.green,
                    sub: `Coverage: ${(data.coverageRatio * 100).toFixed(0)}%`,
                  },
                  {
                    label: "Hedge Benefit",
                    value: fmtUSD(Math.abs(hedgeBenefit)),
                    color: S.cyan,
                    sub: `${Math.abs(hedgedPnl) > 0 ? ((1 - Math.abs(hedgedPnl) / Math.abs(unhedgedPnl || 1)) * 100).toFixed(0) : "0"}% reduction`,
                  },
                ].map(({ label, value, color, sub }) => (
                  <div key={label} style={{
                    padding: "10px 12px",
                    background: S.sub,
                    border: `1px solid ${S.soft}`,
                    borderRadius: 3,
                  }}>
                    <div style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary, marginBottom: 4, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                      {label}
                    </div>
                    <div style={{ fontFamily: S.fontMono, fontSize: 16, fontWeight: 700, color }}>
                      {value}
                    </div>
                    <div style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, marginTop: 2 }}>
                      {sub}
                    </div>
                  </div>
                ))}
              </div>

              {/* Analytical narrative */}
              <p style={{
                fontFamily: S.fontUI,
                fontSize: 13,
                color: S.secondary,
                lineHeight: 1.65,
                margin: 0,
              }}>
                At a{" "}
                <span style={{ color: shock < 0 ? S.red : S.green, fontWeight: 700, fontFamily: S.fontMono }}>
                  {shock < 0 ? "−" : "+"}{shockAbs}%
                </span>{" "}
                spot rate shock — calibrated to the{" "}
                <strong style={{ color: S.primary }}>{historicalMatch.name}</strong>{" "}
                precedent — the unhedged portfolio would experience a mark-to-market loss of{" "}
                <strong style={{ color: S.red }}>{fmtUSD(unhedgedPnl)}</strong>.
                Under the current hedge plan with a{" "}
                <span style={{ fontFamily: S.fontMono, color: S.cyan, fontWeight: 700 }}>
                  {(data.coverageRatio * 100).toFixed(0)}%
                </span>{" "}
                coverage ratio, the hedged outcome is{" "}
                <strong style={{ color: hedgedPnl < 0 ? S.amber : S.green }}>{fmtUSD(hedgedPnl)}</strong>,
                representing a hedge effectiveness of approximately{" "}
                <span style={{ fontFamily: S.fontMono, fontWeight: 700, color: S.cyan }}>
                  {Math.abs(unhedgedPnl) > 0
                    ? ((1 - Math.abs(hedgedPnl) / Math.abs(unhedgedPnl)) * 100).toFixed(1)
                    : "0"}%
                </span>.
                This is{" "}
                {data.coverageRatio >= 0.80 && data.coverageRatio <= 1.25
                  ? <span style={{ color: S.green }}>within the IFRS 9.6.4.1 effectiveness band (80–125%)</span>
                  : <span style={{ color: S.red }}>outside the IFRS 9.6.4.1 effectiveness band (80–125%)</span>
                }.
              </p>

              {/* Hedge cost analysis */}
              <div style={{
                background: S.sub,
                border: `1px solid ${S.soft}`,
                borderRadius: 3,
                padding: "10px 14px",
              }}>
                <div style={{
                  fontFamily: S.fontMono, fontSize: 9, fontWeight: 700,
                  color: S.tertiary, letterSpacing: "0.08em", textTransform: "uppercase",
                  marginBottom: 8,
                }}>
                  Hedge Cost Decomposition
                </div>
                {[
                  {
                    label: "Forward Point Carry Cost",
                    value: fmtUSD(notionalUSD * data.hedgeCostBps / 10000),
                    sub: `${data.hedgeCostBps.toFixed(1)} bps annualised`,
                    color: data.hedgeCostBps > 200 ? S.red : data.hedgeCostBps > 100 ? S.amber : S.secondary,
                  },
                  {
                    label: "Execution Spread Estimate",
                    value: fmtUSD(notionalUSD * 0.0004),
                    sub: "~4 bps bid/ask (NDF mid-market)",
                    color: S.secondary,
                  },
                  {
                    label: "Opportunity Cost (carry benefit forgone)",
                    value: fmtUSD(Math.abs(hedgeBenefit) * 0.05),
                    sub: "5% of hedge benefit at risk",
                    color: S.tertiary,
                  },
                ].map(({ label, value, sub, color }) => (
                  <div key={label} style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    padding: "5px 0",
                    borderBottom: `1px solid ${S.soft}`,
                  }}>
                    <div>
                      <span style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary }}>{label}</span>
                      <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary, marginLeft: 8 }}>{sub}</span>
                    </div>
                    <span style={{ fontFamily: S.fontMono, fontSize: 13, fontWeight: 700, color }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── SECTION 2: CROSS-ASSET CORRELATIONS ── */}
        <div style={{ marginBottom: 4, padding: "0 12px" }}>
          <SectionHeader
            num="2"
            title="Cross-Asset Correlations"
            level="CROSS-ASSET"
            open={sec2Open}
            onToggle={() => setSec2Open(!sec2Open)}
          />
          {sec2Open && (
            <div style={{
              padding: "14px 16px",
              border: `1px solid ${S.soft}`,
              borderTop: "none",
              borderRadius: "0 0 3px 3px",
              marginBottom: 8,
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}>
              <p style={{
                fontFamily: S.fontUI, fontSize: 13, color: S.secondary,
                lineHeight: 1.65, margin: 0,
              }}>
                Based on the{" "}
                <strong style={{ color: S.primary }}>{historicalMatch.name}</strong>{" "}
                historical analogue, the following cross-asset correlations were observed during the
                crisis episode. Per Longin &amp; Solnik (2001), tail correlations during stress episodes
                systematically exceed unconditional correlations — the t-Copula tail dependence
                coefficient λ = {historicalMatch.tail_lambda.toFixed(2)} (ν=5 d.f.) indicates substantial
                joint tail risk with equity markets.
              </p>

              {/* Correlation bars */}
              <div style={{
                background: S.sub,
                border: `1px solid ${S.soft}`,
                borderRadius: 3,
                padding: "12px 14px",
              }}>
                <div style={{
                  fontFamily: S.fontMono, fontSize: 9, fontWeight: 700,
                  color: S.tertiary, letterSpacing: "0.08em",
                  textTransform: "uppercase", marginBottom: 10,
                }}>
                  Crisis Episode Correlations — {historicalMatch.name.split("(")[0].trim()}
                </div>
                <CorrelationBar label="vs. Equities" value={historicalMatch.equity_corr} />
                <CorrelationBar label="vs. Gold (XAU)" value={historicalMatch.gold_corr} />
                <CorrelationBar label="vs. USD Index" value={historicalMatch.usdx_corr} />
                <CorrelationBar label="Tail λ (t-Copula)" value={historicalMatch.tail_lambda} />
              </div>

              {/* Analytic paragraph */}
              <p style={{
                fontFamily: S.fontUI, fontSize: 13, color: S.secondary,
                lineHeight: 1.65, margin: 0,
              }}>
                A correlation of{" "}
                <span style={{ fontFamily: S.fontMono, fontWeight: 700, color: S.amber }}>
                  {historicalMatch.equity_corr.toFixed(2)}
                </span>{" "}
                with equity markets during this episode reflects the "risk-off" dynamic where capital
                flight from EM simultaneously pressures EM FX and local equity benchmarks. The{" "}
                <span style={{ fontFamily: S.fontMono, fontWeight: 700, color: S.cyan }}>
                  USD index correlation ({historicalMatch.usdx_corr.toFixed(2)})
                </span>{" "}
                confirms the dominant USD safe-haven dynamic: as USD strengthens, the quote currency
                (here, local EM) weakens proportionally. Note that gold correlation was{" "}
                <span style={{ fontFamily: S.fontMono, color: historicalMatch.gold_corr > 0 ? S.green : S.red }}>
                  {historicalMatch.gold_corr >= 0 ? "positive" : "negative"} ({historicalMatch.gold_corr.toFixed(2)})
                </span>{" "}
                — gold's flight-to-safety premium{" "}
                {historicalMatch.gold_corr > 0
                  ? "was active, providing natural diversification benefit for USD-long portfolios"
                  : "was not a key driver; the crisis was primarily a liquidity event rather than a solvency/systemic event"}.
              </p>

              {/* Vol spike analysis */}
              <div style={{
                background: S.sub,
                border: `1px solid ${S.soft}`,
                borderRadius: 3,
                padding: "10px 14px",
              }}>
                <div style={{
                  fontFamily: S.fontMono, fontSize: 9, fontWeight: 700,
                  color: S.tertiary, letterSpacing: "0.08em",
                  textTransform: "uppercase", marginBottom: 8,
                }}>
                  Volatility Regime Analysis (GARCH Implications)
                </div>
                {[
                  {
                    label: "Peak Implied Vol (crisis)",
                    value: `${historicalMatch.vol_spike}%`,
                    color: S.red,
                    ref: "Historical intraday peak",
                  },
                  {
                    label: "EM Rate Spread Widening",
                    value: `${historicalMatch.rate_spread_bps} bps`,
                    color: S.amber,
                    ref: "vs. UST benchmark",
                  },
                  {
                    label: "t-Copula Tail Dependence",
                    value: `λ = ${historicalMatch.tail_lambda.toFixed(2)}`,
                    color: S.cyan,
                    ref: "ν=5, Longin-Solnik methodology",
                  },
                  {
                    label: "Current Scenario Vol Multiple",
                    value: `${(historicalMatch.vol_spike / 12).toFixed(1)}× normal`,
                    color: historicalMatch.vol_spike > 30 ? S.red : S.amber,
                    ref: "Normal FX vol ≈ 10–12% annualised",
                  },
                ].map(({ label, value, color, ref }) => (
                  <div key={label} style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    padding: "5px 0",
                    borderBottom: `1px solid ${S.soft}`,
                  }}>
                    <div>
                      <span style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary }}>{label}</span>
                      <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary, marginLeft: 8 }}>[{ref}]</span>
                    </div>
                    <span style={{ fontFamily: S.fontMono, fontSize: 13, fontWeight: 700, color }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── SECTION 3: REGULATORY PERSPECTIVE ── */}
        <div style={{ marginBottom: 4, padding: "0 12px" }}>
          <SectionHeader
            num="3"
            title="Regulatory Perspective"
            level="REGULATORY"
            open={sec3Open}
            onToggle={() => setSec3Open(!sec3Open)}
          />
          {sec3Open && (
            <div style={{
              padding: "14px 16px",
              border: `1px solid ${S.soft}`,
              borderTop: "none",
              borderRadius: "0 0 3px 3px",
              marginBottom: 8,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}>
              {/* IFRS 9 */}
              <div style={{
                background: S.sub,
                border: `1px solid ${S.soft}`,
                borderRadius: 3,
                padding: "10px 14px",
              }}>
                <div style={{
                  fontFamily: S.fontMono, fontSize: 9, fontWeight: 700,
                  color: S.amber, letterSpacing: "0.08em", textTransform: "uppercase",
                  marginBottom: 8,
                }}>
                  IFRS 9 Hedge Accounting Implications
                </div>
                <p style={{
                  fontFamily: S.fontUI, fontSize: 13, color: S.secondary,
                  lineHeight: 1.65, margin: "0 0 8px",
                }}>
                  The current{" "}
                  <span style={{ fontFamily: S.fontMono, fontWeight: 700, color: S.cyan }}>
                    {(data.coverageRatio * 100).toFixed(1)}%
                  </span>{" "}
                  hedge coverage ratio{" "}
                  {data.coverageRatio >= 0.80 && data.coverageRatio <= 1.25
                    ? <span style={{ color: S.green }}>satisfies the IFRS 9.6.4.1 effectiveness criterion (80–125%)</span>
                    : <span style={{ color: S.red }}>falls outside the IFRS 9.6.4.1 effectiveness band (80–125%) — re-designation may be required</span>
                  }.
                  Under IFRS 9 Chapter 6, qualifying cash flow hedge relationships recognise fair value
                  changes in OCI, which defers P&amp;L volatility into equity reserves until the hedged
                  forecast transaction affects profit or loss. A{" "}
                  <span style={{ fontFamily: S.fontMono, color: shock < 0 ? S.red : S.green }}>
                    {shockAbs}% adverse rate move
                  </span>{" "}
                  of this magnitude would generate an OCI movement of approximately{" "}
                  <strong style={{ color: S.amber }}>{fmtUSD(Math.abs(unhedgedPnl) * data.coverageRatio)}</strong>{" "}
                  before tax, offset by the fair value gain on the hedging instrument.
                </p>
              </div>

              {/* EMIR margins */}
              {Math.abs(unhedgedPnl) > 10000 && (
                <div style={{
                  background: S.sub,
                  border: `1px solid ${S.soft}`,
                  borderRadius: 3,
                  padding: "10px 14px",
                }}>
                  <div style={{
                    fontFamily: S.fontMono, fontSize: 9, fontWeight: 700,
                    color: S.amber, letterSpacing: "0.08em", textTransform: "uppercase",
                    marginBottom: 8,
                  }}>
                    EMIR Article 11 — Margining Implications
                  </div>
                  <p style={{
                    fontFamily: S.fontUI, fontSize: 13, color: S.secondary,
                    lineHeight: 1.65, margin: 0,
                  }}>
                    At a {shockAbs}% shock magnitude, EMIR Article 11(1) variation margin (VM)
                    obligations on bilateral OTC FX derivatives become material. Under EMIR
                    Refit (EU 2019/834), VM must be exchanged daily for financial counterparties
                    and non-financial counterparties above the clearing threshold. The shocked
                    MTM value of the NDF/FWD hedge would generate a VM call of approximately{" "}
                    <strong style={{ color: S.amber }}>
                      {fmtUSD(Math.abs(hedgedPnl) * data.hedgeRatio)}
                    </strong>{" "}
                    under this scenario. Initial Margin under EMIR (BCBS-IOSCO Phase 6, Sep
                    2022) applies for entities with AANA ≥ EUR 8B. Collateral must be
                    high-quality liquid assets (HQLA) segregated at a third-party custodian.
                  </p>
                </div>
              )}

              {/* SA-CCR / CVA */}
              <div style={{
                background: S.sub,
                border: `1px solid ${S.soft}`,
                borderRadius: 3,
                padding: "10px 14px",
              }}>
                <div style={{
                  fontFamily: S.fontMono, fontSize: 9, fontWeight: 700,
                  color: S.tertiary, letterSpacing: "0.08em", textTransform: "uppercase",
                  marginBottom: 8,
                }}>
                  SA-CCR &amp; CVA Capital Estimates (BCBS 279)
                </div>
                {[
                  {
                    label: "SA-CCR EAD",
                    sub: "1.4 × (0 + 0.04 × |N| × √min(T,1)), T=0.5",
                    value: fmtUSD(ead),
                    ref: "BCBS 279 §167",
                    color: S.amber,
                  },
                  {
                    label: "CVA Charge (BBB, 0.54% × EAD)",
                    sub: "Standardised CVA capital",
                    value: fmtUSD(cva),
                    ref: "IFRS 9 B6.4.11",
                    color: S.red,
                  },
                  {
                    label: "FX Supervisory Factor",
                    sub: "Single-currency pair, BCBS §165",
                    value: "4.00%",
                    ref: "BCBS 279 §165",
                    color: S.secondary,
                  },
                  {
                    label: "Alpha Factor",
                    sub: "Regulatory constant",
                    value: "1.40×",
                    ref: "BCBS §74",
                    color: S.secondary,
                  },
                  {
                    label: "EMIR Art 11(1) IM Trigger",
                    sub: "AANA ≥ EUR 8B threshold",
                    value: Math.abs(unhedgedPnl) > 50_000 ? "POTENTIAL TRIGGER" : "Below threshold",
                    ref: "EMIR Art 11(1)",
                    color: Math.abs(unhedgedPnl) > 50_000 ? S.amber : S.green,
                  },
                ].map(({ label, sub, value, ref, color }) => (
                  <div key={label} style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    padding: "5px 0",
                    borderBottom: `1px solid ${S.soft}`,
                  }}>
                    <div>
                      <span style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary }}>{label}</span>
                      <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary, marginLeft: 8 }}>{sub}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontFamily: S.fontMono, fontSize: 13, fontWeight: 700, color }}>{value}</span>
                      <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary }}>[{ref}]</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── SECTION 4: HISTORICAL ANALOGUE ── */}
        <div style={{ marginBottom: 4, padding: "0 12px" }}>
          <SectionHeader
            num="4"
            title="Historical Analogue"
            level="HISTORICAL"
            open={sec4Open}
            onToggle={() => setSec4Open(!sec4Open)}
          />
          {sec4Open && (
            <div style={{
              padding: "14px 16px",
              border: `1px solid ${S.soft}`,
              borderTop: "none",
              borderRadius: "0 0 3px 3px",
              marginBottom: 8,
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}>
              {/* Primary match */}
              <div style={{
                background: S.sub,
                border: `1px solid ${S.soft}`,
                borderRadius: 3,
                padding: "12px 14px",
              }}>
                <div style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  marginBottom: 10,
                  gap: 10,
                }}>
                  <div>
                    <div style={{ fontFamily: S.fontMono, fontSize: 14, fontWeight: 700, color: S.primary, marginBottom: 2 }}>
                      {historicalMatch.name}
                    </div>
                    <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.tertiary }}>
                      {historicalMatch.period}
                    </div>
                  </div>
                  <div style={{
                    fontFamily: S.fontMono, fontSize: 16, fontWeight: 700,
                    color: historicalMatch.spot_shock_pct < 0 ? S.red : S.green,
                    flexShrink: 0,
                  }}>
                    {historicalMatch.spot_shock_pct > 0 ? "+" : ""}{historicalMatch.spot_shock_pct.toFixed(1)}%
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                  {[
                    {
                      label: "Realised Spot Change",
                      value: `${historicalMatch.spot_shock_pct.toFixed(1)}%`,
                      color: historicalMatch.spot_shock_pct < 0 ? S.red : S.green,
                    },
                    {
                      label: "Current Scenario Shock",
                      value: `${shock < 0 ? "−" : "+"}${shockAbs}%`,
                      color: shock < 0 ? S.red : S.green,
                    },
                    {
                      label: "Delta vs Historical",
                      value: `${(Math.abs(shock * 100) - Math.abs(historicalMatch.spot_shock_pct) >= 0 ? "+" : "")}${(Math.abs(shock * 100) - Math.abs(historicalMatch.spot_shock_pct)).toFixed(1)}%`,
                      color: Math.abs(Math.abs(shock * 100) - Math.abs(historicalMatch.spot_shock_pct)) < 5 ? S.green : S.amber,
                    },
                    {
                      label: "Historical Recovery",
                      value: `${historicalMatch.recovery_months} months`,
                      color: S.secondary,
                    },
                  ].map(({ label, value, color }) => (
                    <div key={label} style={{
                      padding: "8px 10px",
                      background: `color-mix(in srgb, ${S.rim} 20%, transparent)`,
                      borderRadius: 2,
                    }}>
                      <div style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary, marginBottom: 4, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                        {label}
                      </div>
                      <div style={{ fontFamily: S.fontMono, fontSize: 14, fontWeight: 700, color }}>
                        {value}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Best instruments */}
                <div style={{ marginBottom: 10 }}>
                  <div style={{
                    fontFamily: S.fontMono, fontSize: 9, fontWeight: 700,
                    color: S.tertiary, letterSpacing: "0.08em",
                    textTransform: "uppercase", marginBottom: 6,
                  }}>
                    Historically Effective Instruments
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {historicalMatch.best_instruments.map((inst) => (
                      <span key={inst} style={{
                        fontFamily: S.fontMono, fontSize: 11,
                        color: S.cyan,
                        background: `color-mix(in srgb, ${S.cyan} 8%, transparent)`,
                        border: `1px solid ${S.cyan}`,
                        borderRadius: 2, padding: "2px 8px",
                      }}>
                        {inst}
                      </span>
                    ))}
                  </div>
                </div>

                <p style={{
                  fontFamily: S.fontUI, fontSize: 13, color: S.secondary,
                  lineHeight: 1.65, margin: "0 0 10px",
                }}>
                  The current scenario shock of{" "}
                  <span style={{ color: shock < 0 ? S.red : S.green, fontWeight: 700, fontFamily: S.fontMono }}>
                    {shock < 0 ? "−" : "+"}{shockAbs}%
                  </span>{" "}
                  is most analogous to the{" "}
                  <strong style={{ color: S.primary }}>{historicalMatch.name}</strong> ({historicalMatch.period}),
                  which saw a realised move of{" "}
                  <span style={{ color: S.amber, fontWeight: 700 }}>
                    {historicalMatch.spot_shock_pct.toFixed(1)}%
                  </span>.
                  Recovery took approximately{" "}
                  <strong style={{ color: S.primary }}>{historicalMatch.recovery_months} months</strong>.
                  The{" "}
                  {Math.abs(Math.abs(shock * 100) - Math.abs(historicalMatch.spot_shock_pct)) < 5
                    ? "close match suggests strong calibration relevance"
                    : `${Math.abs(Math.abs(shock * 100) - Math.abs(historicalMatch.spot_shock_pct)).toFixed(0)}pp difference indicates a ${Math.abs(shock * 100) < Math.abs(historicalMatch.spot_shock_pct) ? "milder" : "more severe"} variant of this crisis type`}.
                </p>

                {/* Academic citation */}
                <div style={{
                  padding: "6px 10px",
                  background: `color-mix(in srgb, ${S.rim} 30%, transparent)`,
                  borderRadius: 2,
                  borderLeft: `2px solid ${S.cyan}`,
                }}>
                  <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary, letterSpacing: "0.04em" }}>
                    ACADEMIC REFERENCE:{" "}
                  </span>
                  <span style={{ fontFamily: S.fontUI, fontSize: 11, color: S.secondary, fontStyle: "italic" }}>
                    {historicalMatch.academic_ref}
                  </span>
                </div>
              </div>

              {/* Show all crises toggle */}
              <div>
                <button
                  onClick={() => setShowAllCrises(!showAllCrises)}
                  style={{
                    fontFamily: S.fontMono, fontSize: 10,
                    color: S.cyan, background: "transparent",
                    border: `1px solid ${S.soft}`, borderRadius: 2,
                    padding: "4px 12px", cursor: "pointer",
                  }}
                >
                  {showAllCrises ? "▲ Hide" : "▼ Show"} all {CRISIS_CORRELATIONS.length} historical crises
                </button>
              </div>

              {showAllCrises && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {CRISIS_CORRELATIONS.filter(c => c !== historicalMatch).map((crisis) => (
                    <div key={crisis.name} style={{
                      padding: "8px 12px",
                      background: S.sub,
                      border: `1px solid ${S.soft}`,
                      borderRadius: 3,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}>
                      <div>
                        <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 600, color: S.secondary }}>
                          {crisis.name}
                        </div>
                        <div style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary }}>
                          {crisis.period} · Vol peak: {crisis.vol_spike}% · Recovery: {crisis.recovery_months}mo
                        </div>
                      </div>
                      <div style={{
                        fontFamily: S.fontMono, fontSize: 14, fontWeight: 700,
                        color: crisis.spot_shock_pct < 0 ? S.red : S.green,
                      }}>
                        {crisis.spot_shock_pct > 0 ? "+" : ""}{crisis.spot_shock_pct.toFixed(1)}%
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Disclaimer ── */}
        <div style={{
          margin: "8px 12px 0",
          padding: "10px 14px",
          background: `color-mix(in srgb, ${S.amber} 4%, transparent)`,
          border: `1px solid color-mix(in srgb, ${S.amber} 30%, transparent)`,
          borderRadius: 3,
        }}>
          <p style={{
            fontFamily: S.fontMono, fontSize: 10, color: S.tertiary,
            lineHeight: 1.6, margin: 0, letterSpacing: "0.02em",
          }}>
            <strong style={{ color: S.amber }}>DISCLAIMER:</strong>{" "}
            This commentary is generated algorithmically for analytical purposes only. It does not
            constitute investment advice, financial advice, or a solicitation to buy or sell any
            financial instrument. Past crisis scenarios are not predictive of future events. All
            regulatory thresholds shown are indicative and simplified — consult qualified legal,
            accounting, and risk management professionals before making any hedging or investment
            decisions. SA-CCR, CVA, and IFRS 9 calculations are approximations; actual regulatory
            capital requirements depend on entity classification, counterparty details, and applicable
            jurisdiction.
          </p>
        </div>
      </div>
    </div>
  );
}
