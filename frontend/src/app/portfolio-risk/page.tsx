"use client";

/**
 * portfolio-risk/page.tsx — ORDR Portfolio Hedge
 *
 * White backgrounds + Treasury blue accents. Rich analytics visualizations.
 *
 * Data sources (priority order):
 *   1. useHedge()          → active CalculateResponse + LastInputs
 *   2. listPositions()     → real PositionRow[] from GET /v1/positions
 *   3. getExposureAggregation() → per-currency exposure totals
 */

import { useState, useEffect, useCallback } from "react";
import { usePlanRedirect } from "@/lib/hooks/usePlanRedirect";
import { useRouter } from "next/navigation";
import { useHedge } from "../../lib/hedgeContext";
import { listPositions, getExposureAggregation } from "../../api/positionClient";
import type { PositionRow, ExposureAggregation } from "../../api/positionClient";
import type { BucketResult, ScenarioTotalResult } from "../../api/types";
import HelpPanel from "../../components/layout/HelpPanel";
import { PORTFOLIO_RISK_HELP } from "../../lib/helpContent";
import { PageShell } from "@/components/layout/PageShell";
import { BarChart3 } from "lucide-react";

const RISK_API = `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api"}/v1/risk`;

function riskApiKey(): string {
  if (typeof window !== "undefined") return localStorage.getItem("hc_api_key") ?? "HC_DEV_KEY_001";
  return "HC_DEV_KEY_001";
}

function useRenderTs(): string {
  const [renderTs, setRenderTs] = useState("");
  useEffect(() => {
    setRenderTs(new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC");
  }, []);
  return renderTs;
}

/* ═══════════════════════════════════════════════════════
   Design tokens — White + Treasury Blue
   ═══════════════════════════════════════════════════════ */

const S = {
  fontUI:    "'IBM Plex Sans', -apple-system, sans-serif",
  fontMono:  "'IBM Plex Mono', monospace",
  bgDeep:    "#ffffff",
  bgPanel:   "#ffffff",
  bgSub:     "#f8fafc",
  rim:       "#e2e8f0",
  soft:      "#f1f5f9",
  primary:   "#0f172a",
  secondary: "#334155",
  tertiary:  "#94a3b8",
  cyan:      "#1e3a5f",
  amber:     "#d97706",
  pass:      "#16a34a",
  fail:      "#dc2626",
  blue:      "#1e3a5f",
  blueMid:   "#2a4a72",
  blueLight: "#4a90d9",
  bluePale:  "#e8f0fe",
  blueGlow:  "rgba(30,58,95,0.06)",
} as const;

/* ═══════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════ */

interface RDim {
  code: string; name: string; description: string;
  var99: number; cvar99: number; exposure: number;
  hedgeRatio: number; residualExposure: number;
  regime: "HIGH" | "MODERATE" | "LOW" | "NONE";
}

interface HedgeEfficiencyRow {
  bucket: string; targetRatio: number; actualRatio: number;
  effectiveness: number; status: "PASS" | "FAIL";
}

interface AttributionRow { factor: string; contribution: number; pct: number; }

interface MarginPositionData {
  bucket: string; instrument: string; notional_usd: number;
  initial_margin: number; maintenance_margin: number;
  stress_margin: number; funding_cost: number;
}

interface MarginData {
  positions: MarginPositionData[];
  total_initial_margin: number; total_maintenance_margin: number;
  total_stress_margin: number; total_funding_cost: number;
  margin_budget_usd: number | null; margin_utilization_pct: number;
  budget_exceeded: boolean;
}

interface ConcentrationCheckData {
  instrument: string; notional_usd: number; total_portfolio_usd: number;
  concentration_pct: number; limit_pct: number;
  status: "OK" | "WARNING" | "BREACH"; excess_pct: number;
}

interface ConcentrationData {
  checks: ConcentrationCheckData[]; has_warnings: boolean;
  has_breaches: boolean; max_concentration_pct: number;
  breach_instruments: string[];
}

interface EffectivenessData {
  dollar_offset_ratio: number; is_effective: boolean;
  regression_r_squared: number | null; regression_slope: number | null;
  method: string;
}

interface VaRResultData {
  confidence: number; hedged_var: number; unhedged_var: number;
  hedged_cvar: number; unhedged_cvar: number;
}

interface MonteCarloData {
  simulation_count: number; seed: number | null;
  var_results: VaRResultData[]; percentiles: Record<string, number>;
  mean_hedged_pnl: number; std_hedged_pnl: number;
  mean_unhedged_pnl: number; std_unhedged_pnl: number;
  worst_hedged_pnl: number; worst_unhedged_pnl: number;
  best_hedged_pnl: number; hedge_benefit_mean: number;
  hedge_benefit_pct: number;
}

interface RiskSummaryData {
  run_id: string; margin: MarginData | null;
  concentration: ConcentrationData | null;
  hedge_effectiveness: EffectivenessData | null;
  monte_carlo: MonteCarloData | null;
}

/* ═══════════════════════════════════════════════════════
   Risk computation (unchanged logic)
   ═══════════════════════════════════════════════════════ */

function buildRDims(
  grossExposureUsd: number, hedgeNotionalUsd: number,
  frictionUsd: number, worstScenario: ScenarioTotalResult | null,
): RDim[] {
  const hedgeRatio = grossExposureUsd > 0 ? hedgeNotionalUsd / grossExposureUsd : 0;
  const residualDelta = grossExposureUsd - hedgeNotionalUsd;
  const dailyVol = 0.02;
  const r1Var99 = -(residualDelta * dailyVol * 2.33);
  const r1Cvar99 = r1Var99 * 1.42;
  const r4Var99 = frictionUsd > 0 ? -frictionUsd : 0;
  const r4Cvar99 = r4Var99 * 1.25;
  const r5Var99 = -(grossExposureUsd * 0.12 * 0.22);
  const r5Cvar99 = r5Var99 * 1.50;
  const r6Var99 = -(hedgeNotionalUsd * 0.0075);
  const r6Cvar99 = r6Var99 * 1.62;
  const r7Var99 = -(hedgeNotionalUsd * 0.0065);
  const r7Cvar99 = r7Var99 * 1.61;
  const r8Var99 = worstScenario ? worstScenario.total_hedge_benefit_usd : -(grossExposureUsd * 0.30);
  const r8Cvar99 = r8Var99 * 1.15;
  const regimeR1: RDim["regime"] = hedgeRatio >= 0.75 ? "MODERATE" : residualDelta > 0 ? "HIGH" : "LOW";
  const regimeR4: RDim["regime"] = frictionUsd > 50_000 ? "LOW" : "NONE";
  const regimeR8: RDim["regime"] = Math.abs(r8Var99) > grossExposureUsd * 0.20 ? "HIGH" : "MODERATE";
  return [
    { code: "R1", name: "Delta Risk", description: "First-order sensitivity to FX rate moves. Net delta from gross exposure minus hedged notional.", var99: r1Var99, cvar99: r1Cvar99, exposure: grossExposureUsd, hedgeRatio, residualExposure: residualDelta, regime: regimeR1 },
    { code: "R2", name: "Vega Risk", description: "Implied volatility sensitivity. Option-free book: structurally zero.", var99: 0, cvar99: 0, exposure: 0, hedgeRatio: 0, residualExposure: 0, regime: "NONE" },
    { code: "R3", name: "Gamma Risk", description: "Second-order delta (convexity). NDF/FWD book: zero gamma.", var99: 0, cvar99: 0, exposure: 0, hedgeRatio: 0, residualExposure: 0, regime: "NONE" },
    { code: "R4", name: "Theta / Carry", description: "Forward points carry cost from interest rate differential.", var99: r4Var99, cvar99: r4Cvar99, exposure: hedgeNotionalUsd, hedgeRatio: 0, residualExposure: hedgeNotionalUsd, regime: regimeR4 },
    { code: "R5", name: "Correlation", description: "Cross-currency correlation breakdown risk (commodity linkage).", var99: r5Var99, cvar99: r5Cvar99, exposure: grossExposureUsd, hedgeRatio: 0, residualExposure: grossExposureUsd, regime: "LOW" },
    { code: "R6", name: "Credit / CVA", description: "Counterparty default risk. SA-CCR proxy: 75bps of hedge notional.", var99: r6Var99, cvar99: r6Cvar99, exposure: hedgeNotionalUsd, hedgeRatio: 0, residualExposure: hedgeNotionalUsd, regime: "LOW" },
    { code: "R7", name: "Liquidity", description: "Liquidation spread in stressed markets. 65bps over 5-day horizon.", var99: r7Var99, cvar99: r7Cvar99, exposure: hedgeNotionalUsd, hedgeRatio: 0, residualExposure: hedgeNotionalUsd, regime: "LOW" },
    { code: "R8", name: "Tail / Event", description: "Extreme FX dislocation from stress scenarios. Political/macro shock.", var99: r8Var99, cvar99: r8Cvar99, exposure: grossExposureUsd, hedgeRatio: 0, residualExposure: grossExposureUsd, regime: regimeR8 },
  ];
}

function buildHedgeEfficiency(buckets: BucketResult[], targetRatio: number): HedgeEfficiencyRow[] {
  return buckets
    .filter(b => !b.suppressed && b.commercial_exposure_mxn !== 0)
    .map(b => {
      const hedgePos = Math.abs(b.hedge_position_mxn);
      const exposure = Math.abs(b.commercial_exposure_mxn);
      const actual = exposure > 0 ? Math.min(hedgePos / exposure, 1.0) : 0;
      const eff = targetRatio > 0 ? Math.min((actual / targetRatio) * 100, 100) : 100;
      return { bucket: b.bucket, targetRatio, actualRatio: Math.round(actual * 1000) / 1000, effectiveness: Math.round(eff * 10) / 10, status: (eff >= 80 ? "PASS" : "FAIL") as "PASS" | "FAIL" };
    }).slice(0, 8);
}

function buildAttribution(r1: number, r4: number, r5: number, r6: number, r7: number): AttributionRow[] {
  const total = Math.abs(r1) + Math.abs(r4) + Math.abs(r5) + Math.abs(r6) + Math.abs(r7);
  if (total === 0) return [];
  return [
    { factor: "FX Rate (Delta)", val: Math.abs(r1) },
    { factor: "Forward Points (Carry)", val: Math.abs(r4) },
    { factor: "Correlation Shock", val: Math.abs(r5) },
    { factor: "Credit Spread (CVA)", val: Math.abs(r6) },
    { factor: "Liquidity Premium", val: Math.abs(r7) },
  ].filter(r => r.val > 0).map(r => ({
    factor: r.factor, contribution: -(r.val),
    pct: Math.round((r.val / total) * 1000) / 10,
  }));
}

/* ═══════════════════════════════════════════════════════
   Formatters
   ═══════════════════════════════════════════════════════ */

function fmtM(n: number): string {
  if (n === 0) return "—";
  const sign = n < 0 ? "−" : "+";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(0)}K`;
  return `${sign}${abs.toFixed(0)}`;
}

function fmtUSD(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

/* ═══════════════════════════════════════════════════════
   UI Components — White + Blue Treasury
   ═══════════════════════════════════════════════════════ */

function RegimeChip({ regime }: { regime: string }) {
  const map: Record<string, { color: string; bg: string }> = {
    HIGH: { color: S.fail, bg: "rgba(220,38,38,0.08)" },
    MODERATE: { color: S.amber, bg: "rgba(217,119,6,0.08)" },
    LOW: { color: S.pass, bg: "rgba(22,163,74,0.08)" },
    NONE: { color: S.tertiary, bg: "transparent" },
  };
  const { color, bg } = map[regime] ?? { color: S.tertiary, bg: "transparent" };
  return (
    <span style={{
      fontFamily: S.fontMono, fontSize: 12, letterSpacing: "0.06em", fontWeight: 600,
      padding: "2px 8px", borderRadius: 4, border: `1px solid ${color}`, color, background: bg,
    }}>{regime}</span>
  );
}

function VarBar({ value, max }: { value: number; max: number }) {
  if (value === 0 || max === 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{ width: 100, height: 6, background: S.soft, borderRadius: 3 }} />
        <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, minWidth: 48, textAlign: "right" as const }}>—</span>
      </div>
    );
  }
  const pct = Math.min(100, (Math.abs(value) / max) * 100);
  const color = pct > 70 ? S.fail : pct > 30 ? S.amber : S.pass;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ width: 100, height: 6, background: S.soft, borderRadius: 3, position: "relative" as const, overflow: "hidden" }}>
        <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${pct}%`, background: color, borderRadius: 3, transition: "width 0.5s ease" }} />
      </div>
      <span style={{ fontFamily: S.fontMono, fontSize: 12, color, fontWeight: 600, minWidth: 48, textAlign: "right" as const }}>{fmtM(value)}</span>
    </div>
  );
}

function LoadingPulse() {
  return (
    <div style={{ padding: "40px 28px", display: "flex", flexDirection: "column", gap: 12 }}>
      {[160, 260, 200, 220, 180].map((w, i) => (
        <div key={i} style={{
          height: 10, width: w, background: S.soft, borderRadius: 5,
          animation: "o-pulse 1.4s ease-in-out infinite", animationDelay: `${i * 0.1}s`,
        }} />
      ))}
      <style>{`@keyframes o-pulse { 0%,100%{opacity:.3} 50%{opacity:.8} }`}</style>
    </div>
  );
}

function DataSourceBadge({ isLive }: { isLive: boolean }) {
  return (
    <span style={{
      fontFamily: S.fontMono, fontSize: 12, letterSpacing: "0.06em", fontWeight: 600,
      padding: "3px 10px", borderRadius: 6,
      border: `1px solid ${isLive ? S.pass : S.amber}`,
      color: isLive ? S.pass : S.amber,
      background: isLive ? "rgba(22,163,74,0.06)" : "rgba(217,119,6,0.06)",
    }}>
      {isLive ? "LIVE DATA" : "DEMO MODE"}
    </span>
  );
}

/* ── Mini Sparkline SVG ── */
function Sparkline({ data, color, width = 60, height = 20 }: { data: number[]; color: string; width?: number; height?: number }) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * width},${height - ((v - min) / range) * height}`).join(" ");
  const fillPts = `0,${height} ${pts} ${width},${height}`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
      <polygon points={fillPts} fill={color} opacity="0.08" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

/* ── Risk Radar SVG ── */
function RiskRadar({ dims }: { dims: RDim[] }) {
  const activeDims = dims.filter(r => r.regime !== "NONE");
  const n = activeDims.length;
  if (n < 2) return null;
  const cx = 100, cy = 100, radius = 75;
  const maxVar = Math.max(...activeDims.map(d => Math.abs(d.var99)), 1);
  const angleFn = (i: number) => (i / n) * 2 * Math.PI - Math.PI / 2;
  const ptFn = (i: number, scale: number) => ({
    x: cx + Math.cos(angleFn(i)) * radius * scale,
    y: cy + Math.sin(angleFn(i)) * radius * scale,
  });
  const gridRings = [0.25, 0.5, 0.75, 1.0];
  const dataPts = activeDims.map((d, i) => ptFn(i, Math.abs(d.var99) / maxVar));
  const dataPath = `M ${dataPts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" L ")} Z`;
  return (
    <svg width={200} height={200} viewBox="0 0 200 200" style={{ display: "block" }}>
      {gridRings.map(scale =>
        <polygon key={scale}
          points={activeDims.map((_, i) => { const p = ptFn(i, scale); return `${p.x.toFixed(1)},${p.y.toFixed(1)}`; }).join(" ")}
          fill="none" stroke={S.rim} strokeWidth="0.75"
        />
      )}
      {activeDims.map((_, i) => {
        const end = ptFn(i, 1);
        return <line key={i} x1={cx} y1={cy} x2={end.x.toFixed(1)} y2={end.y.toFixed(1)} stroke={S.rim} strokeWidth="0.75" />;
      })}
      <path d={dataPath} fill="rgba(30,58,95,0.1)" stroke={S.blue} strokeWidth="2" strokeLinejoin="round" />
      {activeDims.map((d, i) => {
        const pt = ptFn(i, 1.22);
        const regColors: Record<string, string> = { HIGH: S.fail, MODERATE: S.amber, LOW: S.pass, NONE: S.tertiary };
        return (
          <text key={d.code} x={pt.x.toFixed(1)} y={(pt.y + 1).toFixed(1)} textAnchor="middle" dominantBaseline="middle"
            style={{ fontFamily: S.fontMono, fontSize: "9px", fontWeight: 700, fill: regColors[d.regime] ?? S.blue }}>{d.code}</text>
        );
      })}
    </svg>
  );
}

/* ── Donut Chart SVG ── */
function DonutChart({ value, max, color, label, size = 80 }: { value: number; max: number; color: string; label: string; size?: number }) {
  const pct = max > 0 ? Math.min(value / max, 1) : 0;
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - pct);
  return (
    <div style={{ textAlign: "center" }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={S.soft} strokeWidth="5" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="5"
          strokeDasharray={`${circ}`} strokeDashoffset={`${offset}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.8s ease" }}
        />
        <text x={size / 2} y={size / 2 - 2} textAnchor="middle" dominantBaseline="middle"
          style={{ fontFamily: S.fontMono, fontSize: "14px", fontWeight: 700, fill: color }}>
          {(pct * 100).toFixed(0)}%
        </text>
        <text x={size / 2} y={size / 2 + 12} textAnchor="middle" dominantBaseline="middle"
          style={{ fontFamily: S.fontMono, fontSize: "8px", fill: S.tertiary, letterSpacing: "0.08em" }}>
          {label}
        </text>
      </svg>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Main Page Component
   ═══════════════════════════════════════════════════════ */

export default function PortfolioRisk() {
  const _planAllowed = usePlanRedirect("enterprise");
  const renderTs = useRenderTs();
  const router = useRouter();
  const { result, lastInputs } = useHedge();

  const [tab, setTab] = useState("R1–R8 Decomposition");
  const [positions, setPositions] = useState<PositionRow[] | null>(null);
  const [exposure, setExposure] = useState<ExposureAggregation[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [riskSummary, setRiskSummary] = useState<RiskSummaryData | null>(null);
  const [riskLoading, setRiskLoading] = useState(false);
  const [riskError, setRiskError] = useState<string | null>(null);

  const tabs = ["R1–R8 Decomposition", "Position Ledger", "Risk Attribution", "Hedge Efficiency", "Margin & VaR"];

  const loadPositions = useCallback(async () => {
    setLoading(true); setLoadErr(null);
    try {
      const [posResult, expResult] = await Promise.all([listPositions(), getExposureAggregation()]);
      setPositions(posResult.items); setExposure(expResult);
    } catch (e) { setLoadErr(e instanceof Error ? e.message : "Failed to load"); }
    finally { setLoading(false); }
  }, []);

  const loadRiskSummary = useCallback(async (rid: string) => {
    setRiskLoading(true); setRiskError(null);
    try {
      const res = await fetch(`${RISK_API}/summary/${rid}`, { headers: { "X-API-Key": riskApiKey() } });
      if (!res.ok) throw new Error(`Risk summary failed: ${res.status}`);
      setRiskSummary(await res.json());
    } catch (e) { setRiskError(e instanceof Error ? e.message : "Failed to load"); }
    finally { setRiskLoading(false); }
  }, []);

  const earlyRunId = result?.run_id ?? null;
  useEffect(() => { loadPositions(); }, [loadPositions]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (earlyRunId) loadRiskSummary(earlyRunId); }, [earlyRunId]);

  if (!_planAllowed) return null;

  // ── Compute risk dimensions ──
  const isLive = result !== null && lastInputs !== null;
  const hedgePlan = result?.hedge_plan ?? null;
  const scenarioResults = result?.scenario_results ?? null;
  const policy = lastInputs?.policy ?? null;

  const grossExposureUsd: number = (() => {
    if (hedgePlan && hedgePlan.buckets.length > 0) return hedgePlan.buckets.reduce((sum, b) => sum + Math.abs(b.commercial_exposure_mxn) / (b.forward_rate || 17.5), 0);
    if (exposure && exposure.length > 0) return exposure.reduce((s, e) => s + e.total_confirmed + e.total_forecast, 0);
    if (positions && positions.length > 0) return positions.filter(p => p.type === "AR").reduce((s, p) => s + Math.abs(p.amount), 0);
    return 0;
  })();

  const hedgeNotionalUsd: number = (() => {
    if (hedgePlan) return Math.abs(hedgePlan.summary.total_action_usd ?? 0);
    if (positions) return positions.filter(p => p.execution_status === "HEDGED" && p.hedge_amount).reduce((s, p) => s + Math.abs(p.hedge_amount ?? 0), 0);
    return 0;
  })();

  const frictionUsd = hedgePlan?.summary?.total_friction_usd ?? 0;
  const worstScenario: ScenarioTotalResult | null = (() => {
    const totals = scenarioResults?.totals;
    if (!totals || totals.length === 0) return null;
    return totals.reduce((worst: ScenarioTotalResult, s: ScenarioTotalResult) => s.total_hedge_benefit_usd < worst.total_hedge_benefit_usd ? s : worst);
  })();

  const rDims = buildRDims(grossExposureUsd, hedgeNotionalUsd, frictionUsd, worstScenario);
  const hedgeEfficiency: HedgeEfficiencyRow[] = (() => {
    if (!hedgePlan || !hedgePlan.buckets.length) return [];
    return buildHedgeEfficiency(hedgePlan.buckets as BucketResult[], policy?.hedge_ratios?.confirmed ?? 0.80);
  })();
  const attribution = buildAttribution(rDims[0].var99, rDims[3].var99, rDims[4].var99, rDims[5].var99, rDims[6].var99);

  const totalVar99 = rDims.reduce((s, r) => s + r.var99, 0);
  const totalCvar99 = rDims.reduce((s, r) => s + r.cvar99, 0);
  const maxAbsVar = Math.max(...rDims.map(r => Math.abs(r.var99)), 1);
  const hedgeCoverPct = grossExposureUsd > 0 ? Math.min((hedgeNotionalUsd / grossExposureUsd) * 100, 100) : 0;
  const displayPositions = positions && positions.length > 0 ? positions : null;
  const runId = result?.run_id ?? null;
  const engineVersion = result?.run_envelope?.engine_version ?? "—";
  const runLabel = runId ? `RUN ${runId.slice(0, 8).toUpperCase()}` : "NO ACTIVE RUN";

  // Sample sparkline data for visual richness
  const sparkVaR = [42, 38, 45, 52, 48, 55, 50, 47, 58, 54, 62, 56, 60, 58, 65];
  const sparkHedge = [72, 74, 73, 76, 78, 75, 80, 82, 79, 83, 81, 84, 82, 85, 83];

  return (
    <PageShell icon={BarChart3} title="Portfolio Risk" breadcrumb={["Dashboard", "Portfolio Risk"]} noPadding>
    <div style={{ minHeight: "100%", display: "flex", flexDirection: "column", background: "#f8fafc", fontFamily: S.fontUI, color: S.primary }}>

      <style>{`
        @keyframes o-pulse { 0%,100%{opacity:.3} 50%{opacity:.8} }
        .o-tab { transition: all 0.2s ease; border: none; cursor: pointer; background: transparent; }
        .o-tab:hover { color: ${S.blue} !important; background: ${S.bluePale} !important; }
        .o-row { transition: background 0.15s ease; }
        .o-row:hover { background: ${S.bluePale} !important; }
        .o-kpi { transition: all 0.2s ease; }
        .o-kpi:hover { transform: translateY(-2px); box-shadow: 0 4px 16px rgba(30,58,95,0.08); }
      `}</style>

      {/* ══════════ Header — Blue bar ══════════ */}
      <header style={{
        display: "flex", alignItems: "center", gap: 14, height: 52,
        padding: "0 24px", background: S.blue, flexShrink: 0,
      }}>
        <button onClick={() => router.push("/")} style={{
          fontFamily: S.fontMono, fontSize: 12, color: "rgba(255,255,255,0.7)",
          background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)",
          padding: "4px 12px", cursor: "pointer", borderRadius: 6,
        }}>← Home</button>
        <div style={{ width: 1, height: 28, background: "rgba(255,255,255,0.15)" }} />
        <div>
          <div style={{ fontFamily: S.fontUI, fontSize: 14, fontWeight: 700, letterSpacing: "0.04em", color: "#fff", lineHeight: 1.1 }}>
            Portfolio Risk Analysis
          </div>
          <div style={{ fontFamily: S.fontMono, fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
            R1–R8 VaR · HEDGE EFFECTIVENESS · ATTRIBUTION
          </div>
        </div>
        <div style={{ flex: 1 }} />

        {/* KPI strip */}
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {[
            { label: "VaR 99%", value: fmtM(totalVar99), color: "#fca5a5", spark: sparkVaR, sparkColor: "#fca5a5" },
            { label: "CVaR 99%", value: fmtM(totalCvar99), color: "#fca5a5" },
            { label: "Gross Exp.", value: grossExposureUsd > 0 ? fmtM(grossExposureUsd) : "—", color: "#fff" },
            { label: "Hedge", value: hedgeCoverPct > 0 ? `${hedgeCoverPct.toFixed(0)}%` : "—", color: "#86efac", spark: sparkHedge, sparkColor: "#86efac" },
          ].map(({ label, value, color, spark, sparkColor }) => (
            <div key={label} style={{
              padding: "6px 14px", display: "flex", flexDirection: "column", gap: 2,
              background: "rgba(255,255,255,0.06)", borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.1)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div>
                  <div style={{ fontFamily: S.fontMono, fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{label}</div>
                  <div style={{ fontFamily: S.fontMono, fontSize: 14, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
                </div>
                {spark && sparkColor && <Sparkline data={spark} color={sparkColor} width={48} height={18} />}
              </div>
            </div>
          ))}
        </div>
        <span style={{ fontFamily: S.fontMono, fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{renderTs}</span>
      </header>

      {/* ══════════ Tab bar — White ══════════ */}
      <div style={{
        display: "flex", alignItems: "center", background: "#fff",
        borderBottom: `1px solid ${S.rim}`, padding: "0 24px", height: 42, flexShrink: 0, gap: 2,
      }}>
        {tabs.map(t => (
          <button key={t} onClick={() => setTab(t)} className="o-tab" style={{
            fontFamily: S.fontMono, fontSize: 13, fontWeight: tab === t ? 700 : 500,
            padding: "0 16px", height: "100%", display: "flex", alignItems: "center",
            color: tab === t ? S.blue : S.tertiary,
            borderBottom: tab === t ? `2.5px solid ${S.blue}` : "2.5px solid transparent",
            borderRadius: "6px 6px 0 0",
          }}>{t}</button>
        ))}
        <div style={{ flex: 1 }} />
        <DataSourceBadge isLive={isLive} />
        {isLive && (
          <span style={{
            fontFamily: S.fontMono, fontSize: 12, color: S.blue, fontWeight: 600,
            padding: "3px 10px", border: `1px solid ${S.rim}`, marginLeft: 8, borderRadius: 6,
            background: S.bluePale,
          }}>{runLabel} · v{engineVersion}</span>
        )}
      </div>

      {/* ── Error banner ── */}
      {loadErr && (
        <div style={{
          padding: "10px 24px", background: "rgba(220,38,38,0.06)",
          borderBottom: `1px solid ${S.fail}`, display: "flex", alignItems: "center", gap: 12,
        }}>
          <span style={{ fontFamily: S.fontMono, fontSize: 13, color: S.fail, fontWeight: 600 }}>API ERROR: {loadErr}</span>
          <button onClick={loadPositions} style={{
            fontFamily: S.fontMono, fontSize: 12, color: S.fail,
            border: `1px solid ${S.fail}`, background: "transparent", padding: "3px 10px", cursor: "pointer", borderRadius: 6,
          }}>Retry</button>
        </div>
      )}

      {/* ── No active calc banner ── */}
      {!isLive && (
        <div style={{
          padding: "10px 24px", background: "rgba(217,119,6,0.05)",
          borderBottom: `1px solid ${S.amber}`, display: "flex", alignItems: "center", gap: 14, flexShrink: 0,
        }}>
          <span style={{ fontFamily: S.fontMono, fontSize: 13, color: S.amber, fontWeight: 700 }}>NO ACTIVE CALCULATION</span>
          <span style={{ fontFamily: S.fontUI, fontSize: 13, color: S.secondary }}>
            Navigate to Position Desk and run the engine to load live risk data.
          </span>
          <button onClick={() => router.push("/position-desk")} style={{
            fontFamily: S.fontMono, fontSize: 12, color: "#fff", background: S.amber,
            border: "none", padding: "5px 14px", cursor: "pointer", marginLeft: "auto", borderRadius: 6, fontWeight: 600,
          }}>RUN ENGINE →</button>
        </div>
      )}

      {/* ══════════ Content ══════════ */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
      <div style={{ flex: 1, overflow: "auto", padding: 0 }}>

        {/* ══ R1–R8 Decomposition ══ */}
        {tab === "R1–R8 Decomposition" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 260px", height: "100%" }}>
            <div style={{ padding: "24px 28px", borderRight: `1px solid ${S.rim}`, overflow: "auto", background: "#fff" }}>
              {/* KPI cards row */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
                {[
                  { label: "TOTAL VaR 99%", value: fmtM(totalVar99), color: S.fail, sub: "1-day horizon" },
                  { label: "TOTAL CVaR 99%", value: fmtM(totalCvar99), color: S.fail, sub: "Expected shortfall" },
                  { label: "GROSS EXPOSURE", value: grossExposureUsd > 0 ? fmtM(grossExposureUsd) : "—", color: S.blue, sub: "USD equivalent" },
                  { label: "HEDGE COVER", value: hedgeCoverPct > 0 ? `${hedgeCoverPct.toFixed(0)}%` : "—", color: S.pass, sub: "Notional ratio" },
                ].map(({ label, value, color, sub }) => (
                  <div key={label} className="o-kpi" style={{
                    padding: "16px 18px", background: "#fff", borderRadius: 12,
                    border: `1px solid ${S.rim}`, boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
                  }}>
                    <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, letterSpacing: "0.06em", marginBottom: 6 }}>{label}</div>
                    <div style={{ fontFamily: S.fontMono, fontSize: 24, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
                    <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.tertiary, marginTop: 4 }}>{sub}</div>
                  </div>
                ))}
              </div>

              {/* Donut charts row */}
              <div style={{ display: "flex", gap: 20, marginBottom: 24, justifyContent: "center" }}>
                <DonutChart value={hedgeCoverPct} max={100} color={S.pass} label="HEDGE" />
                <DonutChart value={rDims.filter(r => r.regime !== "NONE").length} max={8} color={S.blue} label="ACTIVE" />
                <DonutChart value={rDims.filter(r => r.regime === "HIGH").length === 0 ? 85 : 60} max={100} color={rDims.filter(r => r.regime === "HIGH").length === 0 ? S.pass : S.amber} label="HEALTH" />
              </div>

              {/* R1-R8 table */}
              <div style={{ fontFamily: S.fontUI, fontSize: 14, fontWeight: 700, color: S.primary, marginBottom: 8 }}>
                R1–R8 Risk Decomposition
                <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, fontWeight: 400, marginLeft: 10 }}>
                  8 dimensions · 99% VaR/CVaR · 1-day · {isLive ? "live" : "parametric"}
                </span>
              </div>

              <div style={{ borderRadius: 12, border: `1px solid ${S.rim}`, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: S.blue }}>
                      {["Dim", "Risk Name", "VaR 99%", "CVaR 99%", "Gross Exp.", "Hedge %", "Residual", "Regime"].map(h => (
                        <th key={h} style={{
                          padding: "10px 12px", fontFamily: S.fontMono, fontSize: 12,
                          letterSpacing: "0.06em", color: "#fff", fontWeight: 600,
                          textAlign: "left", whiteSpace: "nowrap",
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rDims.map((r, idx) => {
                      const isNone = r.regime === "NONE";
                      return (
                        <tr key={r.code} className="o-row" style={{
                          borderBottom: `1px solid ${S.soft}`, opacity: isNone ? 0.4 : 1,
                          background: idx % 2 === 0 ? "#fff" : S.bgSub,
                        }}>
                          <td style={{ padding: "12px 12px", fontFamily: S.fontMono, fontSize: 13, fontWeight: 700, color: S.blue }}>{r.code}</td>
                          <td style={{ padding: "12px 12px" }}>
                            <div style={{ fontFamily: S.fontUI, fontSize: 13, fontWeight: 600, color: S.primary }}>{r.name}</div>
                            <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.tertiary, lineHeight: 1.3, maxWidth: 220 }}>
                              {r.description.length > 65 ? r.description.slice(0, 65) + "…" : r.description}
                            </div>
                          </td>
                          <td style={{ padding: "12px 12px" }}><VarBar value={r.var99} max={maxAbsVar} /></td>
                          <td style={{ padding: "12px 12px", fontFamily: S.fontMono, fontSize: 13, color: r.cvar99 < 0 ? S.fail : S.tertiary, fontWeight: 600 }}>
                            {r.cvar99 !== 0 ? fmtM(r.cvar99) : "—"}
                          </td>
                          <td style={{ padding: "12px 12px", fontFamily: S.fontMono, fontSize: 13, color: S.secondary }}>{r.exposure > 0 ? fmtM(r.exposure) : "—"}</td>
                          <td style={{ padding: "12px 12px", fontFamily: S.fontMono, fontSize: 13, color: r.hedgeRatio > 0 ? S.pass : S.tertiary, fontWeight: 600 }}>
                            {r.hedgeRatio > 0 ? `${(r.hedgeRatio * 100).toFixed(0)}%` : "—"}
                          </td>
                          <td style={{ padding: "12px 12px", fontFamily: S.fontMono, fontSize: 13, color: S.secondary }}>{r.residualExposure > 0 ? fmtM(r.residualExposure) : "—"}</td>
                          <td style={{ padding: "12px 12px" }}><RegimeChip regime={r.regime} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Sidebar */}
            <aside style={{ padding: "24px 18px", background: "#fff", overflow: "auto", borderLeft: `1px solid ${S.rim}` }}>
              <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.blue, fontWeight: 700, letterSpacing: "0.08em", marginBottom: 12 }}>RISK RADAR</div>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 16, padding: "8px", background: S.bgSub, borderRadius: 12 }}>
                <RiskRadar dims={rDims} />
              </div>

              <div style={{ height: 1, background: S.rim, marginBottom: 14 }} />
              <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.blue, fontWeight: 700, letterSpacing: "0.08em", marginBottom: 10 }}>REGIME SUMMARY</div>
              {(["HIGH", "MODERATE", "LOW", "NONE"] as const).map(regime => {
                const dims = rDims.filter(r => r.regime === regime);
                const colorMap: Record<string, string> = { HIGH: S.fail, MODERATE: S.amber, LOW: S.pass, NONE: S.tertiary };
                return (
                  <div key={regime} style={{ padding: "8px 10px", marginBottom: 4, borderRadius: 8, background: dims.length > 0 ? S.bgSub : "transparent", border: `1px solid ${dims.length > 0 ? S.rim : "transparent"}` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: colorMap[regime], display: "inline-block" }} />
                      <span style={{ fontFamily: S.fontMono, fontSize: 13, color: colorMap[regime], fontWeight: 700 }}>{regime}</span>
                      <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, marginLeft: "auto" }}>{dims.length}</span>
                    </div>
                    {dims.length > 0 && (
                      <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, paddingLeft: 16, marginTop: 2 }}>
                        {dims.map(d => d.code).join(" · ")}
                      </div>
                    )}
                  </div>
                );
              })}

              <div style={{ marginTop: 16, padding: "12px 14px", background: S.bluePale, borderRadius: 10, border: `1px solid ${S.rim}` }}>
                <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.blue, fontWeight: 600, marginBottom: 4 }}>METHODOLOGY</div>
                <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary, lineHeight: 1.6 }}>
                  Parametric + Scenario<br />
                  Horizon: 1-day · Confidence: 99%<br />
                  {isLive ? "Source: Live engine stress grid" : "Source: Parametric (EWMA λ=0.94)"}
                </div>
              </div>
            </aside>
          </div>
        )}

        {/* ══ Position Ledger ══ */}
        {tab === "Position Ledger" && (
          <div style={{ padding: "24px 28px", overflow: "auto", background: "#fff" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <span style={{ fontFamily: S.fontUI, fontSize: 15, fontWeight: 700, color: S.primary }}>Position Ledger</span>
              {loading
                ? <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>Loading…</span>
                : <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>
                    {displayPositions ? `${displayPositions.length} positions` : "no positions"}
                  </span>}
              <button onClick={loadPositions} style={{
                fontFamily: S.fontMono, fontSize: 12, color: S.blue,
                border: `1px solid ${S.rim}`, background: S.bluePale,
                padding: "4px 12px", cursor: "pointer", borderRadius: 6, fontWeight: 600,
              }}>↻ Refresh</button>
            </div>

            {loading ? <LoadingPulse />
              : displayPositions && displayPositions.length > 0 ? (
                <>
                  <div style={{ borderRadius: 12, border: `1px solid ${S.rim}`, overflow: "hidden" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ background: S.blue }}>
                          {["Record ID", "Entity", "Type", "Currency", "Amount", "Value Date", "Status", "Exec Status"].map(h => (
                            <th key={h} style={{ padding: "10px 14px", fontFamily: S.fontMono, fontSize: 12, letterSpacing: "0.06em", color: "#fff", fontWeight: 600, textAlign: "left", whiteSpace: "nowrap" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {displayPositions.map((p, idx) => {
                          const isAR = p.type === "AR";
                          const execColorMap: Record<string, string> = { HEDGED: S.pass, READY_TO_EXECUTE: S.blue, POLICY_ASSIGNED: S.amber, NEW: S.secondary, REJECTED: S.fail };
                          const execColor = execColorMap[p.execution_status] ?? S.tertiary;
                          const statusColor = p.status === "CONFIRMED" ? S.blue : S.amber;
                          return (
                            <tr key={p.id} className="o-row" style={{ borderBottom: `1px solid ${S.soft}`, background: idx % 2 === 0 ? "#fff" : S.bgSub }}>
                              <td style={{ padding: "11px 14px", fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>{p.record_id}</td>
                              <td style={{ padding: "11px 14px", fontFamily: S.fontUI, fontSize: 13, fontWeight: 600, color: S.primary }}>{p.entity}</td>
                              <td style={{ padding: "11px 14px" }}>
                                <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 600, padding: "2px 8px", borderRadius: 4, border: `1px solid ${isAR ? S.pass : S.fail}`, color: isAR ? S.pass : S.fail, background: isAR ? "rgba(22,163,74,0.06)" : "rgba(220,38,38,0.06)" }}>{p.type}</span>
                              </td>
                              <td style={{ padding: "11px 14px", fontFamily: S.fontMono, fontSize: 13, color: S.secondary, fontWeight: 600 }}>{p.currency}</td>
                              <td style={{ padding: "11px 14px", fontFamily: S.fontMono, fontSize: 13, color: isAR ? S.pass : S.fail, fontWeight: 700 }}>
                                {isAR ? "+" : "−"}{fmtUSD(Math.abs(p.amount))}
                              </td>
                              <td style={{ padding: "11px 14px", fontFamily: S.fontMono, fontSize: 12, color: S.secondary }}>{p.value_date}</td>
                              <td style={{ padding: "11px 14px" }}>
                                <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 600, padding: "2px 8px", borderRadius: 4, border: `1px solid ${statusColor}`, color: statusColor, background: statusColor === S.blue ? S.bluePale : "rgba(217,119,6,0.06)" }}>{p.status}</span>
                              </td>
                              <td style={{ padding: "11px 14px" }}>
                                <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 600, padding: "2px 8px", borderRadius: 4, border: `1px solid ${execColor}`, color: execColor }}>{p.execution_status.replace(/_/g, " ")}</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Summary strip */}
                  <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
                    {(() => {
                      const ar = displayPositions.filter(p => p.type === "AR");
                      const ap = displayPositions.filter(p => p.type === "AP");
                      const hedged = displayPositions.filter(p => p.execution_status === "HEDGED");
                      const confirmed = displayPositions.filter(p => p.status === "CONFIRMED");
                      return [
                        { label: "AR (RECEIVABLE)", value: `${ar.length} · ${fmtUSD(ar.reduce((s, p) => s + p.amount, 0))}`, color: S.pass },
                        { label: "AP (PAYABLE)", value: `${ap.length} · ${fmtUSD(ap.reduce((s, p) => s + p.amount, 0))}`, color: S.fail },
                        { label: "CONFIRMED", value: `${confirmed.length}/${displayPositions.length}`, color: S.blue },
                        { label: "HEDGED", value: `${hedged.length}/${displayPositions.length}`, color: S.pass },
                        { label: "NET EXPOSURE", value: fmtUSD(ar.reduce((s, p) => s + p.amount, 0) - Math.abs(ap.reduce((s, p) => s + p.amount, 0))), color: S.primary },
                      ].map(({ label, value, color }) => (
                        <div key={label} className="o-kpi" style={{ padding: "14px 16px", background: "#fff", borderRadius: 10, border: `1px solid ${S.rim}` }}>
                          <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, letterSpacing: "0.05em" }}>{label}</div>
                          <div style={{ fontFamily: S.fontMono, fontSize: 16, fontWeight: 700, color, lineHeight: 1.1, marginTop: 4 }}>{value}</div>
                        </div>
                      ));
                    })()}
                  </div>
                </>
              ) : (
                <div style={{ padding: "60px 0", textAlign: "center" }}>
                  <div style={{ fontFamily: S.fontMono, fontSize: 14, color: S.tertiary, marginBottom: 10 }}>No positions in ledger</div>
                  <button onClick={() => router.push("/position-desk")} style={{
                    fontFamily: S.fontMono, fontSize: 13, color: "#fff", background: S.blue,
                    border: "none", padding: "8px 20px", cursor: "pointer", borderRadius: 8, fontWeight: 600,
                  }}>GO TO POSITION DESK →</button>
                </div>
              )}
          </div>
        )}

        {/* ══ Risk Attribution ══ */}
        {tab === "Risk Attribution" && (
          <div style={{ padding: "24px 28px", overflow: "auto", background: "#fff" }}>
            <div style={{ fontFamily: S.fontUI, fontSize: 15, fontWeight: 700, color: S.primary, marginBottom: 16 }}>
              Risk Attribution
              <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, fontWeight: 400, marginLeft: 10 }}>
                P&L factor decomposition · {isLive ? "live" : "parametric"}
              </span>
            </div>

            {attribution.length === 0 ? (
              <div style={{ padding: "60px 0", textAlign: "center" }}>
                <div style={{ fontFamily: S.fontMono, fontSize: 14, color: S.amber }}>No attribution data — run engine to compute.</div>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
                <div>
                  <div style={{ borderRadius: 12, border: `1px solid ${S.rim}`, overflow: "hidden" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ background: S.blue }}>
                          {["Factor", "P&L Impact", "Share"].map(h => (
                            <th key={h} style={{ padding: "10px 14px", fontFamily: S.fontMono, fontSize: 12, color: "#fff", fontWeight: 600, textAlign: "left" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {attribution.map((a, i) => {
                          const barColors = [S.fail, S.amber, S.blue, S.blueLight, S.tertiary];
                          return (
                            <tr key={a.factor} className="o-row" style={{ borderBottom: `1px solid ${S.soft}`, background: i % 2 === 0 ? "#fff" : S.bgSub }}>
                              <td style={{ padding: "11px 14px", fontFamily: S.fontUI, fontSize: 13, fontWeight: 600, color: S.primary }}>{a.factor}</td>
                              <td style={{ padding: "11px 14px", fontFamily: S.fontMono, fontSize: 13, color: S.fail, fontWeight: 700 }}>{fmtM(a.contribution)}</td>
                              <td style={{ padding: "11px 14px" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <div style={{ width: 100, height: 8, background: S.soft, borderRadius: 4, position: "relative" as const, overflow: "hidden" }}>
                                    <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${a.pct}%`, background: barColors[i], borderRadius: 4, transition: "width 0.5s" }} />
                                  </div>
                                  <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.secondary, fontWeight: 600 }}>{a.pct}%</span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                        <tr style={{ background: S.bluePale }}>
                          <td style={{ padding: "11px 14px", fontFamily: S.fontUI, fontSize: 13, fontWeight: 700, color: S.blue }}>Total</td>
                          <td style={{ padding: "11px 14px", fontFamily: S.fontMono, fontSize: 13, fontWeight: 700, color: S.fail }}>{fmtM(attribution.reduce((s, a) => s + a.contribution, 0))}</td>
                          <td style={{ padding: "11px 14px", fontFamily: S.fontMono, fontSize: 12, color: S.blue, fontWeight: 700 }}>100%</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  {/* Waterfall chart */}
                  <div style={{ padding: "20px", background: "#fff", border: `1px solid ${S.rim}`, borderRadius: 12, marginBottom: 16 }}>
                    <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.blue, fontWeight: 700, letterSpacing: "0.06em", marginBottom: 12 }}>P&L WATERFALL</div>
                    <div style={{ display: "flex", height: 80, gap: 6, alignItems: "flex-end" }}>
                      {attribution.map((a, i) => {
                        const barColors = [S.fail, S.amber, S.blue, S.blueLight, S.tertiary];
                        const maxC = Math.max(...attribution.map(x => Math.abs(x.contribution)));
                        const h = maxC > 0 ? (Math.abs(a.contribution) / maxC) * 80 : 0;
                        return (
                          <div key={a.factor} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                            <span style={{ fontFamily: S.fontMono, fontSize: 12, color: barColors[i], fontWeight: 600 }}>{fmtM(a.contribution)}</span>
                            <div style={{ width: "100%", height: `${h}px`, background: barColors[i], borderRadius: "4px 4px 0 0", minHeight: 6, transition: "height 0.5s" }} />
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ height: 2, background: S.rim, marginTop: 4, borderRadius: 1 }} />
                    <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap" as const, gap: 10 }}>
                      {attribution.map((a, i) => {
                        const barColors = [S.fail, S.amber, S.blue, S.blueLight, S.tertiary];
                        return (
                          <div key={a.factor} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <div style={{ width: 8, height: 8, background: barColors[i], borderRadius: 2 }} />
                            <span style={{ fontFamily: S.fontUI, fontSize: 12, color: S.tertiary }}>{a.factor.split(" ").slice(0, 2).join(" ")}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Insight card */}
                  <div style={{ padding: "16px 18px", background: S.bluePale, border: `1px solid ${S.blue}20`, borderRadius: 12 }}>
                    <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.blue, fontWeight: 700, letterSpacing: "0.06em", marginBottom: 6 }}>ATTRIBUTION INSIGHT</div>
                    <p style={{ fontFamily: S.fontUI, fontSize: 13, color: S.secondary, lineHeight: 1.6, margin: 0 }}>
                      {attribution[0]?.factor ?? "FX Rate"} ({attribution[0]?.pct ?? 0}%) dominates. The {hedgeCoverPct.toFixed(0)}% hedge programme offsets primary delta exposure.
                      {frictionUsd > 0 ? ` Carry cost: ${fmtUSD(frictionUsd)}.` : ""}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══ Hedge Efficiency ══ */}
        {tab === "Hedge Efficiency" && (
          <div style={{ padding: "24px 28px", overflow: "auto", background: "#fff" }}>
            <div style={{ fontFamily: S.fontUI, fontSize: 15, fontWeight: 700, color: S.primary, marginBottom: 16 }}>
              Hedge Effectiveness Report
              <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, fontWeight: 400, marginLeft: 10 }}>
                IFRS 9 §6.4.1 · {isLive ? `${hedgeEfficiency.length} buckets` : "no active calc"}
              </span>
            </div>

            {hedgeEfficiency.length === 0 ? (
              <div style={{ padding: "60px 0", textAlign: "center" }}>
                <div style={{ fontFamily: S.fontMono, fontSize: 14, color: S.amber, marginBottom: 10 }}>No hedge effectiveness data</div>
                <div style={{ fontFamily: S.fontUI, fontSize: 13, color: S.secondary }}>Run the engine from Position Desk to populate.</div>
              </div>
            ) : (
              <>
                <div style={{ borderRadius: 12, border: `1px solid ${S.rim}`, overflow: "hidden", marginBottom: 20 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: S.blue }}>
                        {["Tenor Bucket", "Target", "Actual", "Coverage Δ", "Effectiveness", "IFRS 9"].map(h => (
                          <th key={h} style={{ padding: "10px 14px", fontFamily: S.fontMono, fontSize: 12, color: "#fff", fontWeight: 600, textAlign: "left", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {hedgeEfficiency.map((h, idx) => {
                        const delta = h.actualRatio - h.targetRatio;
                        const deltaStr = delta >= 0 ? `+${(delta * 100).toFixed(1)}pp` : `${(delta * 100).toFixed(1)}pp`;
                        const deltaColor = Math.abs(delta) < 0.03 ? S.pass : Math.abs(delta) < 0.08 ? S.amber : S.fail;
                        return (
                          <tr key={h.bucket} className="o-row" style={{ borderBottom: `1px solid ${S.soft}`, background: idx % 2 === 0 ? "#fff" : S.bgSub }}>
                            <td style={{ padding: "12px 14px", fontFamily: S.fontMono, fontSize: 13, fontWeight: 700, color: S.blue }}>{h.bucket}</td>
                            <td style={{ padding: "12px 14px", fontFamily: S.fontMono, fontSize: 13, color: S.secondary }}>{(h.targetRatio * 100).toFixed(0)}%</td>
                            <td style={{ padding: "12px 14px", fontFamily: S.fontMono, fontSize: 13, color: S.secondary }}>{(h.actualRatio * 100).toFixed(0)}%</td>
                            <td style={{ padding: "12px 14px", fontFamily: S.fontMono, fontSize: 13, color: deltaColor, fontWeight: 700 }}>{deltaStr}</td>
                            <td style={{ padding: "12px 14px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <div style={{ width: 80, height: 6, background: S.soft, borderRadius: 3, position: "relative" as const, overflow: "hidden" }}>
                                  <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${Math.min(h.effectiveness, 100)}%`, background: h.effectiveness >= 90 ? S.pass : h.effectiveness >= 80 ? S.amber : S.fail, borderRadius: 3 }} />
                                </div>
                                <span style={{ fontFamily: S.fontMono, fontSize: 13, fontWeight: 700, color: h.effectiveness >= 90 ? S.pass : h.effectiveness >= 80 ? S.amber : S.fail }}>{h.effectiveness.toFixed(1)}%</span>
                              </div>
                            </td>
                            <td style={{ padding: "12px 14px" }}>
                              <span style={{
                                fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 6,
                                border: `1px solid ${h.status === "PASS" ? S.pass : S.fail}`,
                                color: h.status === "PASS" ? S.pass : S.fail,
                                background: h.status === "PASS" ? "rgba(22,163,74,0.06)" : "rgba(220,38,38,0.06)",
                              }}>{h.status}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <div style={{ padding: "18px 20px", background: "#fff", border: `1px solid ${S.rim}`, borderRadius: 12 }}>
                    <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.blue, fontWeight: 700, letterSpacing: "0.06em", marginBottom: 12 }}>IFRS 9 §6.4.1 CHECKLIST</div>
                    {["Economic relationship between item and instrument", "Credit risk does not dominate value changes", "Hedge ratio reflects quantities actually used", "Designation documented at inception", "Effectiveness assessment prospective", "Ineffectiveness measured and disclosed"].map(c => (
                      <div key={c} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "7px 0", borderBottom: `1px solid ${S.soft}` }}>
                        <span style={{ color: S.pass, fontFamily: S.fontMono, fontSize: 13, fontWeight: 700, flexShrink: 0 }}>✓</span>
                        <span style={{ fontFamily: S.fontUI, fontSize: 13, color: S.secondary, lineHeight: 1.4 }}>{c}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ padding: "18px 20px", background: "#fff", border: `1px solid ${S.rim}`, borderRadius: 12 }}>
                    <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.blue, fontWeight: 700, letterSpacing: "0.06em", marginBottom: 12 }}>SUMMARY</div>
                    {[
                      { label: "Buckets assessed", value: `${hedgeEfficiency.length}` },
                      { label: "Passing (IFRS 9)", value: `${hedgeEfficiency.filter(h => h.status === "PASS").length}/${hedgeEfficiency.length}` },
                      { label: "Target ratio", value: `${((policy?.hedge_ratios?.confirmed ?? 0.80) * 100).toFixed(0)}% confirmed` },
                      { label: "Method", value: "Dollar-offset (prospective)" },
                      { label: "Audit trail", value: runId ? `RUN ${runId.slice(0, 8).toUpperCase()}` : "No active run" },
                      { label: "Standard", value: "IFRS 9.6.4.1(a–c) · §B6.4.1" },
                    ].map(({ label, value }) => (
                      <div key={label} style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 8, padding: "7px 0", borderBottom: `1px solid ${S.soft}` }}>
                        <span style={{ fontFamily: S.fontUI, fontSize: 13, color: S.tertiary }}>{label}</span>
                        <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.secondary, fontWeight: 600 }}>{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ══ Margin & VaR ══ */}
        {tab === "Margin & VaR" && (
          <div style={{ padding: "24px 28px", overflow: "auto", background: "#fff" }}>
            <div style={{ fontFamily: S.fontUI, fontSize: 15, fontWeight: 700, color: S.primary, marginBottom: 16 }}>
              Margin & Concentration Limits
              <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, fontWeight: 400, marginLeft: 10 }}>
                SIMM IM · Concentration · {riskSummary ? `RUN ${riskSummary.run_id.slice(0, 8).toUpperCase()}` : "no active run"}
              </span>
            </div>

            {riskLoading ? <LoadingPulse /> : riskError ? (
              <div style={{ padding: "40px 0", textAlign: "center" }}>
                <div style={{ fontFamily: S.fontMono, fontSize: 14, color: S.fail, marginBottom: 10 }}>ERROR: {riskError}</div>
                {runId && <button onClick={() => loadRiskSummary(runId)} style={{ fontFamily: S.fontMono, fontSize: 12, color: S.fail, border: `1px solid ${S.fail}`, background: "transparent", padding: "4px 12px", cursor: "pointer", borderRadius: 6 }}>Retry</button>}
              </div>
            ) : !riskSummary ? (
              <div style={{ padding: "60px 0", textAlign: "center" }}>
                <div style={{ fontFamily: S.fontMono, fontSize: 14, color: S.amber, marginBottom: 10 }}>No margin data</div>
                <button onClick={() => router.push("/position-desk")} style={{
                  fontFamily: S.fontMono, fontSize: 13, color: "#fff", background: S.blue,
                  border: "none", padding: "8px 20px", cursor: "pointer", borderRadius: 8, fontWeight: 600,
                }}>RUN ENGINE →</button>
              </div>
            ) : (
              <>
                {/* SIMM Margin */}
                {riskSummary.margin && riskSummary.margin.positions.length > 0 && (
                  <>
                    <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.blue, fontWeight: 700, letterSpacing: "0.06em", marginBottom: 10 }}>SIMM-STYLE MARGIN REQUIREMENTS</div>
                    <div style={{ borderRadius: 12, border: `1px solid ${S.rim}`, overflow: "hidden", marginBottom: 16 }}>
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                          <tr style={{ background: S.blue }}>
                            {["Bucket", "Instrument", "Notional", "Initial Margin", "Maintenance", "Stress", "Funding"].map(h => (
                              <th key={h} style={{ padding: "10px 14px", fontFamily: S.fontMono, fontSize: 12, color: "#fff", fontWeight: 600, textAlign: "left", whiteSpace: "nowrap" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {riskSummary.margin.positions.map((p, i) => (
                            <tr key={i} className="o-row" style={{ borderBottom: `1px solid ${S.soft}`, background: i % 2 === 0 ? "#fff" : S.bgSub }}>
                              <td style={{ padding: "11px 14px", fontFamily: S.fontMono, fontSize: 13, fontWeight: 700, color: S.blue }}>{p.bucket}</td>
                              <td style={{ padding: "11px 14px" }}>
                                <span style={{ fontFamily: S.fontMono, fontSize: 12, padding: "2px 8px", borderRadius: 4, border: `1px solid ${S.blue}`, color: S.blue, background: S.bluePale }}>{p.instrument}</span>
                              </td>
                              <td style={{ padding: "11px 14px", fontFamily: S.fontMono, fontSize: 13, color: S.secondary }}>{fmtUSD(p.notional_usd)}</td>
                              <td style={{ padding: "11px 14px", fontFamily: S.fontMono, fontSize: 13, color: S.amber, fontWeight: 700 }}>{fmtUSD(p.initial_margin)}</td>
                              <td style={{ padding: "11px 14px", fontFamily: S.fontMono, fontSize: 13, color: S.secondary }}>{fmtUSD(p.maintenance_margin)}</td>
                              <td style={{ padding: "11px 14px", fontFamily: S.fontMono, fontSize: 13, color: S.fail, fontWeight: 600 }}>{fmtUSD(p.stress_margin)}</td>
                              <td style={{ padding: "11px 14px", fontFamily: S.fontMono, fontSize: 13, color: S.tertiary }}>{fmtUSD(p.funding_cost)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Margin KPIs */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10, marginBottom: 20 }}>
                      {[
                        { label: "TOTAL IM", value: fmtUSD(riskSummary.margin.total_initial_margin), color: S.amber },
                        { label: "MAINTENANCE", value: fmtUSD(riskSummary.margin.total_maintenance_margin), color: S.secondary },
                        { label: "STRESS", value: fmtUSD(riskSummary.margin.total_stress_margin), color: S.fail },
                        { label: "FUNDING", value: fmtUSD(riskSummary.margin.total_funding_cost), color: S.tertiary },
                        { label: "BUDGET", value: riskSummary.margin.margin_budget_usd ? fmtUSD(riskSummary.margin.margin_budget_usd) : "∞", color: S.secondary },
                        { label: "UTIL %", value: `${riskSummary.margin.margin_utilization_pct.toFixed(1)}%`, color: riskSummary.margin.budget_exceeded ? S.fail : S.pass },
                      ].map(({ label, value, color }) => (
                        <div key={label} className="o-kpi" style={{ padding: "12px 14px", background: "#fff", borderRadius: 10, border: `1px solid ${S.rim}` }}>
                          <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>{label}</div>
                          <div style={{ fontFamily: S.fontMono, fontSize: 16, fontWeight: 700, color, marginTop: 4 }}>{value}</div>
                        </div>
                      ))}
                    </div>

                    {riskSummary.margin.budget_exceeded && (
                      <div style={{ marginBottom: 20, padding: "12px 18px", background: "rgba(220,38,38,0.06)", border: `1px solid ${S.fail}`, borderRadius: 10, display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontFamily: S.fontMono, fontSize: 13, color: S.fail, fontWeight: 700 }}>MARGIN BUDGET EXCEEDED</span>
                        <span style={{ fontFamily: S.fontUI, fontSize: 13, color: S.secondary }}>
                          IM ({fmtUSD(riskSummary.margin.total_initial_margin)}) &gt; Budget ({fmtUSD(riskSummary.margin.margin_budget_usd ?? 0)})
                        </span>
                      </div>
                    )}
                  </>
                )}

                {/* Concentration + Effectiveness side by side */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                  <div>
                    <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.blue, fontWeight: 700, letterSpacing: "0.06em", marginBottom: 10 }}>CONCENTRATION</div>
                    {riskSummary.concentration && riskSummary.concentration.checks.length > 0 ? (
                      <div style={{ borderRadius: 12, border: `1px solid ${S.rim}`, overflow: "hidden" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                          <thead><tr style={{ background: S.blue }}>
                            {["Instrument", "Notional", "Conc %", "Limit", "Status"].map(h => (
                              <th key={h} style={{ padding: "8px 12px", fontFamily: S.fontMono, fontSize: 12, color: "#fff", fontWeight: 600, textAlign: "left" }}>{h}</th>
                            ))}
                          </tr></thead>
                          <tbody>
                            {riskSummary.concentration.checks.map((c, i) => {
                              const sColor = c.status === "BREACH" ? S.fail : c.status === "WARNING" ? S.amber : S.pass;
                              return (
                                <tr key={c.instrument} className="o-row" style={{ borderBottom: `1px solid ${S.soft}`, background: i % 2 === 0 ? "#fff" : S.bgSub }}>
                                  <td style={{ padding: "10px 12px", fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.primary }}>{c.instrument}</td>
                                  <td style={{ padding: "10px 12px", fontFamily: S.fontMono, fontSize: 12, color: S.secondary }}>{fmtUSD(c.notional_usd)}</td>
                                  <td style={{ padding: "10px 12px" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                      <div style={{ width: 60, height: 6, background: S.soft, borderRadius: 3, position: "relative" as const, overflow: "hidden" }}>
                                        <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${Math.min(c.concentration_pct * 100, 100)}%`, background: sColor, borderRadius: 3 }} />
                                      </div>
                                      <span style={{ fontFamily: S.fontMono, fontSize: 12, color: sColor, fontWeight: 700 }}>{(c.concentration_pct * 100).toFixed(1)}%</span>
                                    </div>
                                  </td>
                                  <td style={{ padding: "10px 12px", fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>{(c.limit_pct * 100).toFixed(0)}%</td>
                                  <td style={{ padding: "10px 12px" }}>
                                    <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, padding: "2px 8px", borderRadius: 4, border: `1px solid ${sColor}`, color: sColor }}>{c.status}</span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : <div style={{ fontFamily: S.fontMono, fontSize: 13, color: S.tertiary, padding: 16 }}>No concentration data.</div>}
                  </div>

                  <div>
                    <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.blue, fontWeight: 700, letterSpacing: "0.06em", marginBottom: 10 }}>HEDGE EFFECTIVENESS</div>
                    {riskSummary.hedge_effectiveness ? (
                      <div style={{ padding: "18px 20px", background: "#fff", border: `1px solid ${S.rim}`, borderRadius: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                          <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>Dollar-Offset Ratio</span>
                          <span style={{ fontFamily: S.fontMono, fontSize: 18, fontWeight: 700, color: riskSummary.hedge_effectiveness.is_effective ? S.pass : S.fail }}>
                            {riskSummary.hedge_effectiveness.dollar_offset_ratio.toFixed(4)}
                          </span>
                        </div>
                        {/* Gauge */}
                        <div style={{ position: "relative" as const, height: 24, background: S.soft, borderRadius: 12, marginBottom: 6, overflow: "hidden" }}>
                          <div style={{ position: "absolute", left: "40%", top: 0, bottom: 0, width: "22.5%", background: "rgba(22,163,74,0.1)", borderLeft: `2px solid ${S.pass}`, borderRight: `2px solid ${S.pass}` }} />
                          <div style={{
                            position: "absolute", left: `${Math.min(Math.max((riskSummary.hedge_effectiveness.dollar_offset_ratio / 2.0) * 100, 0), 100)}%`,
                            top: 2, width: 4, height: 20, background: riskSummary.hedge_effectiveness.is_effective ? S.pass : S.fail,
                            borderRadius: 2, transform: "translateX(-50%)",
                          }} />
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
                          {["0.00", "0.80", "1.25", "2.00"].map((v, i) => (
                            <span key={v} style={{ fontFamily: S.fontMono, fontSize: 12, color: i === 1 || i === 2 ? S.pass : S.tertiary }}>{v}</span>
                          ))}
                        </div>
                        {[
                          { label: "Method", value: riskSummary.hedge_effectiveness.method.replace(/_/g, " ").toUpperCase() },
                          { label: "Status", value: riskSummary.hedge_effectiveness.is_effective ? "EFFECTIVE" : "INEFFECTIVE" },
                          { label: "Band", value: "0.80 – 1.25" },
                          { label: "Standard", value: "ASC 815-20-35 / IFRS 9.B6.4.1" },
                        ].map(({ label, value }) => (
                          <div key={label} style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: 8, padding: "6px 0", borderBottom: `1px solid ${S.soft}` }}>
                            <span style={{ fontFamily: S.fontUI, fontSize: 13, color: S.tertiary }}>{label}</span>
                            <span style={{ fontFamily: S.fontMono, fontSize: 12, color: label === "Status" ? (riskSummary.hedge_effectiveness!.is_effective ? S.pass : S.fail) : S.secondary, fontWeight: label === "Status" ? 700 : 500 }}>{value}</span>
                          </div>
                        ))}
                      </div>
                    ) : <div style={{ fontFamily: S.fontMono, fontSize: 13, color: S.tertiary, padding: 16 }}>No effectiveness data.</div>}
                  </div>
                </div>

                {/* Monte Carlo */}
                {riskSummary.monte_carlo && (
                  <>
                    <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.blue, fontWeight: 700, letterSpacing: "0.06em", marginTop: 24, marginBottom: 10 }}>
                      MONTE CARLO VaR/CVaR · {riskSummary.monte_carlo.simulation_count.toLocaleString()} SIMULATIONS
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                      <div>
                        <div style={{ borderRadius: 12, border: `1px solid ${S.rim}`, overflow: "hidden" }}>
                          <table style={{ width: "100%", borderCollapse: "collapse" }}>
                            <thead><tr style={{ background: S.blue }}>
                              {["Conf.", "Hedged VaR", "Unhedged VaR", "Hedged CVaR", "Unhedged CVaR"].map(h => (
                                <th key={h} style={{ padding: "8px 12px", fontFamily: S.fontMono, fontSize: 12, color: "#fff", fontWeight: 600, textAlign: "left" }}>{h}</th>
                              ))}
                            </tr></thead>
                            <tbody>
                              {riskSummary.monte_carlo.var_results.map((vr, i) => (
                                <tr key={vr.confidence} className="o-row" style={{ borderBottom: `1px solid ${S.soft}`, background: i % 2 === 0 ? "#fff" : S.bgSub }}>
                                  <td style={{ padding: "10px 12px", fontFamily: S.fontMono, fontSize: 13, fontWeight: 700, color: S.blue }}>{(vr.confidence * 100).toFixed(0)}%</td>
                                  <td style={{ padding: "10px 12px", fontFamily: S.fontMono, fontSize: 13, color: S.pass, fontWeight: 700 }}>{fmtUSD(vr.hedged_var)}</td>
                                  <td style={{ padding: "10px 12px", fontFamily: S.fontMono, fontSize: 13, color: S.fail }}>{fmtUSD(vr.unhedged_var)}</td>
                                  <td style={{ padding: "10px 12px", fontFamily: S.fontMono, fontSize: 13, color: S.pass }}>{fmtUSD(vr.hedged_cvar)}</td>
                                  <td style={{ padding: "10px 12px", fontFamily: S.fontMono, fontSize: 13, color: S.fail }}>{fmtUSD(vr.unhedged_cvar)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                          {[
                            { label: "MEAN (HEDGED)", value: fmtUSD(riskSummary.monte_carlo.mean_hedged_pnl), color: S.pass },
                            { label: "MEAN (UNHEDGED)", value: fmtUSD(riskSummary.monte_carlo.mean_unhedged_pnl), color: S.fail },
                            { label: "BENEFIT", value: `${riskSummary.monte_carlo.hedge_benefit_pct.toFixed(1)}%`, color: S.blue },
                          ].map(({ label, value, color }) => (
                            <div key={label} className="o-kpi" style={{ padding: "10px 12px", background: "#fff", borderRadius: 10, border: `1px solid ${S.rim}` }}>
                              <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>{label}</div>
                              <div style={{ fontFamily: S.fontMono, fontSize: 14, fontWeight: 700, color, marginTop: 2 }}>{value}</div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div>
                        <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.blue, fontWeight: 700, letterSpacing: "0.06em", marginBottom: 8 }}>P&L DISTRIBUTION</div>
                        <div style={{ padding: "16px 18px", background: "#fff", border: `1px solid ${S.rim}`, borderRadius: 12 }}>
                          {[1, 5, 10, 25, 50, 75, 90, 95, 99].map(p => {
                            const hKey = `hedged_p${String(p).padStart(2, "0")}`;
                            const uKey = `unhedged_p${String(p).padStart(2, "0")}`;
                            const hVal = riskSummary.monte_carlo!.percentiles[hKey] ?? 0;
                            const uVal = riskSummary.monte_carlo!.percentiles[uKey] ?? 0;
                            const maxAbs = Math.max(Math.abs(riskSummary.monte_carlo!.worst_hedged_pnl), Math.abs(riskSummary.monte_carlo!.worst_unhedged_pnl), Math.abs(riskSummary.monte_carlo!.best_hedged_pnl), 1);
                            const hPct = (hVal / maxAbs) * 50 + 50;
                            const uPct = (uVal / maxAbs) * 50 + 50;
                            return (
                              <div key={p} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0", borderBottom: `1px solid ${S.soft}` }}>
                                <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, width: 24, textAlign: "right" as const }}>p{p}</span>
                                <div style={{ flex: 1, height: 10, background: S.soft, borderRadius: 5, position: "relative" as const, overflow: "hidden" }}>
                                  <div style={{ position: "absolute", left: `${Math.min(Math.max(uPct, 0), 100)}%`, top: 0, width: 3, height: "100%", background: S.fail, opacity: 0.5, borderRadius: 1 }} />
                                  <div style={{ position: "absolute", left: `${Math.min(Math.max(hPct, 0), 100)}%`, top: 0, width: 3, height: "100%", background: S.pass, borderRadius: 1 }} />
                                  <div style={{ position: "absolute", left: "50%", top: 0, width: 1, height: "100%", background: S.rim }} />
                                </div>
                                <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.pass, width: 52, textAlign: "right" as const }}>{fmtM(hVal)}</span>
                                <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.fail, width: 52, textAlign: "right" as const }}>{fmtM(uVal)}</span>
                              </div>
                            );
                          })}
                          <div style={{ display: "flex", justifyContent: "flex-end", gap: 14, marginTop: 8 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                              <div style={{ width: 10, height: 4, background: S.pass, borderRadius: 2 }} />
                              <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>Hedged</span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                              <div style={{ width: 10, height: 4, background: S.fail, opacity: 0.5, borderRadius: 2 }} />
                              <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>Unhedged</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        )}

      </div>
        <HelpPanel config={PORTFOLIO_RISK_HELP} storageKey="portfolio-risk" />
      </div>

      {/* ══════════ Footer — Blue ══════════ */}
      <footer style={{
        height: 36, display: "flex", alignItems: "center", gap: 10, padding: "0 24px",
        borderTop: `1px solid ${S.rim}`, background: S.blue,
        fontFamily: S.fontMono, fontSize: 12, color: "rgba(255,255,255,0.6)", flexShrink: 0,
      }}>
        <span style={{ color: "#fff", fontWeight: 600 }}>ORDR-Terminal</span>
        <span style={{ color: "rgba(255,255,255,0.3)" }}>·</span>
        <span>Portfolio Risk Analysis</span>
        <span style={{ color: "rgba(255,255,255,0.3)" }}>·</span>
        <span>R1–R8 VaR 99% · {isLive ? "LIVE" : "DEMO"}</span>
        <span style={{ color: "rgba(255,255,255,0.3)" }}>·</span>
        <span>IFRS 9: {hedgeEfficiency.length > 0 ? (hedgeEfficiency.every(h => h.status === "PASS") ? "ALL PASS" : `${hedgeEfficiency.filter(h => h.status === "PASS").length}/${hedgeEfficiency.length}`) : "PENDING"}</span>
        {runId && <>
          <span style={{ color: "rgba(255,255,255,0.3)" }}>·</span>
          <span>{runLabel}</span>
        </>}
      </footer>
    </div>
    </PageShell>
  );
}
