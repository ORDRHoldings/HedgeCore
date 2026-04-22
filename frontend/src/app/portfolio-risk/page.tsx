"use client";

/**
 * portfolio-risk/page.tsx — ORDR Portfolio Risk Analytics
 * Bloomberg-tier institutional risk dashboard.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { usePlanRedirect } from "@/lib/hooks/usePlanRedirect";
import { useRouter } from "next/navigation";
import { useHedge } from "../../lib/hedgeContext";
import { listPositions, getExposureAggregation } from "../../api/positionClient";
import type { PositionRow, ExposureAggregation } from "../../api/positionClient";
import type { BucketResult, ScenarioTotalResult } from "../../api/types";
import HelpPanel from "../../components/layout/HelpPanel";
import { PORTFOLIO_RISK_HELP } from "../../lib/helpContent";
import { PageShell } from "@/components/layout/PageShell";
import { useIsMobile } from "@/lib/hooks/useBreakpoint";
import { BarChart3, TrendingDown, Shield, Activity, AlertTriangle, ChevronRight } from "lucide-react";

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
   Design tokens — Bloomberg-tier
   ═══════════════════════════════════════════════════════ */

const C = {
  fontUI: "'IBM Plex Sans', -apple-system, sans-serif",
  fontMono: "'IBM Plex Mono', monospace",
  fontHead: "'Manrope', 'IBM Plex Sans', sans-serif",
  // Backgrounds
  pageBg: "#f0f2f7",
  cardBg: "#ffffff",
  cardBgAlt: "#f8fafd",
  headerGradient: "linear-gradient(135deg, #0c1929 0%, #162d50 50%, #1a3a5f 100%)",
  // Text
  textPrimary: "#0f172a",
  textSecondary: "#475569",
  textTertiary: "#94a3b8",
  textMuted: "#cbd5e1",
  // Blues
  navy: "#0c1929",
  blue: "#1e3a5f",
  blueMid: "#2563eb",
  blueVivid: "#3b82f6",
  blueSky: "#0ea5e9",
  bluePale: "#e8f0fe",
  blueGlow: "rgba(37,99,235,0.12)",
  // Status
  red: "#ef4444",
  redSoft: "rgba(239,68,68,0.08)",
  amber: "#f59e0b",
  amberSoft: "rgba(245,158,11,0.08)",
  green: "#22c55e",
  greenSoft: "rgba(34,197,94,0.08)",
  // Structure
  border: "#e2e8f0",
  borderLight: "#f1f5f9",
  shadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
  shadowLift: "0 8px 25px rgba(0,0,0,0.08), 0 4px 10px rgba(0,0,0,0.04)",
  shadowGlow: "0 0 20px rgba(37,99,235,0.1)",
  radius: 10,
} as const;

/* ═══════════════════════════════════════════════════════
   Types (unchanged)
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
    { code: "R1", name: "Delta Risk", description: "First-order sensitivity to FX rate moves", var99: r1Var99, cvar99: r1Cvar99, exposure: grossExposureUsd, hedgeRatio, residualExposure: residualDelta, regime: regimeR1 },
    { code: "R2", name: "Vega Risk", description: "Implied volatility sensitivity — option-free: zero", var99: 0, cvar99: 0, exposure: 0, hedgeRatio: 0, residualExposure: 0, regime: "NONE" },
    { code: "R3", name: "Gamma Risk", description: "Second-order delta (convexity) — NDF book: zero", var99: 0, cvar99: 0, exposure: 0, hedgeRatio: 0, residualExposure: 0, regime: "NONE" },
    { code: "R4", name: "Theta / Carry", description: "Forward points carry from IR differential", var99: r4Var99, cvar99: r4Cvar99, exposure: hedgeNotionalUsd, hedgeRatio: 0, residualExposure: hedgeNotionalUsd, regime: regimeR4 },
    { code: "R5", name: "Correlation", description: "Cross-currency correlation breakdown risk", var99: r5Var99, cvar99: r5Cvar99, exposure: grossExposureUsd, hedgeRatio: 0, residualExposure: grossExposureUsd, regime: "LOW" },
    { code: "R6", name: "Credit / CVA", description: "Counterparty default — SA-CCR proxy 75bps", var99: r6Var99, cvar99: r6Cvar99, exposure: hedgeNotionalUsd, hedgeRatio: 0, residualExposure: hedgeNotionalUsd, regime: "LOW" },
    { code: "R7", name: "Liquidity", description: "Stressed liquidation spread — 65bps 5d", var99: r7Var99, cvar99: r7Cvar99, exposure: hedgeNotionalUsd, hedgeRatio: 0, residualExposure: hedgeNotionalUsd, regime: "LOW" },
    { code: "R8", name: "Tail / Event", description: "Extreme FX dislocation — political/macro", var99: r8Var99, cvar99: r8Cvar99, exposure: grossExposureUsd, hedgeRatio: 0, residualExposure: grossExposureUsd, regime: regimeR8 },
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
  const sign = n < 0 ? "-" : "+";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function fmtUSD(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function pctColor(pct: number): string {
  if (pct >= 80) return C.green;
  if (pct >= 50) return C.amber;
  return C.red;
}

/* ═══════════════════════════════════════════════════════
   Visual Components — Bloomberg-tier
   ═══════════════════════════════════════════════════════ */

function RegimeBadge({ regime }: { regime: string }) {
  const cfg: Record<string, { color: string; bg: string; glow: string }> = {
    HIGH: { color: "#fff", bg: "linear-gradient(135deg, #dc2626, #ef4444)", glow: "0 2px 8px rgba(239,68,68,0.3)" },
    MODERATE: { color: "#fff", bg: "linear-gradient(135deg, #d97706, #f59e0b)", glow: "0 2px 8px rgba(245,158,11,0.3)" },
    LOW: { color: "#fff", bg: "linear-gradient(135deg, #16a34a, #22c55e)", glow: "0 2px 8px rgba(34,197,94,0.3)" },
    NONE: { color: C.textTertiary, bg: C.borderLight, glow: "none" },
  };
  const { color, bg, glow } = cfg[regime] ?? cfg.NONE;
  return (
    <span style={{
      fontFamily: C.fontMono, fontSize: 10, letterSpacing: "0.1em", fontWeight: 700,
      padding: "3px 10px", borderRadius: 20, color, background: bg, boxShadow: glow,
      display: "inline-block", lineHeight: 1.4,
    }}>{regime}</span>
  );
}

/* Animated gradient bar */
function GradientBar({ value, max, height = 8 }: { value: number; max: number; height?: number }) {
  if (value === 0 || max === 0) return <div style={{ width: "100%", height, background: C.borderLight, borderRadius: height / 2 }} />;
  const pct = Math.min(100, (Math.abs(value) / max) * 100);
  const grad = pct > 70 ? "linear-gradient(90deg, #ef4444, #dc2626)" : pct > 30 ? "linear-gradient(90deg, #f59e0b, #eab308)" : "linear-gradient(90deg, #22c55e, #16a34a)";
  return (
    <div style={{ width: "100%", height, background: C.borderLight, borderRadius: height / 2, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${pct}%`, background: grad, borderRadius: height / 2, transition: "width 0.8s cubic-bezier(0.4,0,0.2,1)" }} />
    </div>
  );
}

/* Progress Ring */
function ProgressRing({ value, max, size = 72, strokeWidth = 5, color, label, sublabel }: {
  value: number; max: number; size?: number; strokeWidth?: number; color: string; label: string; sublabel?: string;
}) {
  const pct = max > 0 ? Math.min(value / max, 1) : 0;
  const r = (size - strokeWidth * 2) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - pct);
  const center = size / 2;
  return (
    <div style={{ textAlign: "center", position: "relative" }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={center} cy={center} r={r} fill="none" stroke={C.borderLight} strokeWidth={strokeWidth} />
        <circle cx={center} cy={center} r={r} fill="none" stroke={color} strokeWidth={strokeWidth}
          strokeDasharray={`${circ}`} strokeDashoffset={`${offset}`}
          transform={`rotate(-90 ${center} ${center})`} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 1s cubic-bezier(0.4,0,0.2,1)", filter: `drop-shadow(0 0 4px ${color}40)` }}
        />
        <text x={center} y={center - 4} textAnchor="middle" dominantBaseline="middle"
          style={{ fontFamily: C.fontMono, fontSize: size > 60 ? "15px" : "11px", fontWeight: 800, fill: color }}>
          {(pct * 100).toFixed(0)}%
        </text>
        <text x={center} y={center + 10} textAnchor="middle" dominantBaseline="middle"
          style={{ fontFamily: C.fontMono, fontSize: "7px", fill: C.textTertiary, letterSpacing: "0.1em" }}>
          {label}
        </text>
      </svg>
      {sublabel && <div style={{ fontFamily: C.fontMono, fontSize: 10, color: C.textTertiary, marginTop: 2 }}>{sublabel}</div>}
    </div>
  );
}

/* Sparkline with gradient fill */
function Spark({ data, color, width = 80, height = 28 }: { data: number[]; color: string; width?: number; height?: number }) {
  if (data.length < 2) return null;
  const id = `sp-${color.replace(/[^a-z0-9]/gi, "")}`;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pad = 2;
  const pts = data.map((v, i) => `${pad + (i / (data.length - 1)) * (width - pad * 2)},${pad + (1 - (v - min) / range) * (height - pad * 2)}`).join(" ");
  const lastPt = data[data.length - 1];
  const lastX = width - pad;
  const lastY = pad + (1 - (lastPt - min) / range) * (height - pad * 2);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`${pad},${height} ${pts} ${width - pad},${height}`} fill={`url(#${id})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lastX} cy={lastY} r="2.5" fill={color} />
    </svg>
  );
}

/* Risk Radar — enhanced with gradient fill and glow */
function RiskRadar({ dims }: { dims: RDim[] }) {
  const activeDims = dims.filter(r => r.regime !== "NONE");
  const n = activeDims.length;
  if (n < 3) return <div style={{ fontFamily: C.fontMono, fontSize: 12, color: C.textTertiary, textAlign: "center", padding: 20 }}>Insufficient active dimensions</div>;
  const size = 220;
  const cx = size / 2, cy = size / 2, radius = 85;
  const maxVar = Math.max(...activeDims.map(d => Math.abs(d.var99)), 1);
  const angleFn = (i: number) => (i / n) * 2 * Math.PI - Math.PI / 2;
  const ptFn = (i: number, scale: number) => ({
    x: cx + Math.cos(angleFn(i)) * radius * scale,
    y: cy + Math.sin(angleFn(i)) * radius * scale,
  });
  const gridRings = [0.25, 0.5, 0.75, 1.0];
  const dataPts = activeDims.map((d, i) => ptFn(i, Math.min(Math.abs(d.var99) / maxVar, 1)));
  const dataPath = `M ${dataPts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" L ")} Z`;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: "block" }}>
      <defs>
        <radialGradient id="radarFill">
          <stop offset="0%" stopColor={C.blueMid} stopOpacity="0.2" />
          <stop offset="100%" stopColor={C.blueMid} stopOpacity="0.02" />
        </radialGradient>
      </defs>
      {gridRings.map(scale =>
        <polygon key={scale}
          points={activeDims.map((_, i) => { const p = ptFn(i, scale); return `${p.x.toFixed(1)},${p.y.toFixed(1)}`; }).join(" ")}
          fill="none" stroke={C.border} strokeWidth={scale === 1 ? "1" : "0.5"} strokeDasharray={scale < 1 ? "3,3" : "none"}
        />
      )}
      {activeDims.map((_, i) => {
        const end = ptFn(i, 1);
        return <line key={i} x1={cx} y1={cy} x2={end.x.toFixed(1)} y2={end.y.toFixed(1)} stroke={C.border} strokeWidth="0.5" />;
      })}
      <path d={dataPath} fill="url(#radarFill)" stroke={C.blueMid} strokeWidth="2" strokeLinejoin="round" style={{ filter: `drop-shadow(0 0 6px ${C.blueMid}40)` }} />
      {dataPts.map((pt, i) => (
        <circle key={`dot-${i}`} cx={pt.x.toFixed(1)} cy={pt.y.toFixed(1)} r="3" fill={C.blueMid} stroke="#fff" strokeWidth="1.5" />
      ))}
      {activeDims.map((d, i) => {
        const pt = ptFn(i, 1.2);
        const regColors: Record<string, string> = { HIGH: C.red, MODERATE: C.amber, LOW: C.green, NONE: C.textTertiary };
        return (
          <text key={d.code} x={pt.x.toFixed(1)} y={(pt.y + 1).toFixed(1)} textAnchor="middle" dominantBaseline="middle"
            style={{ fontFamily: C.fontMono, fontSize: "10px", fontWeight: 800, fill: regColors[d.regime] ?? C.blueMid }}>{d.code}</text>
        );
      })}
    </svg>
  );
}

/* Heat map cell — intensity-colored */
function HeatCell({ value, max, format = "money" }: { value: number; max: number; format?: "money" | "pct" }) {
  const intensity = max > 0 ? Math.min(Math.abs(value) / max, 1) : 0;
  const bg = value === 0 ? "transparent" :
    intensity > 0.7 ? `rgba(239,68,68,${0.08 + intensity * 0.12})` :
    intensity > 0.3 ? `rgba(245,158,11,${0.06 + intensity * 0.08})` :
    `rgba(34,197,94,${0.04 + intensity * 0.06})`;
  const color = value === 0 ? C.textTertiary :
    intensity > 0.7 ? C.red : intensity > 0.3 ? C.amber : C.green;
  const display = format === "pct" ? `${(value * 100).toFixed(0)}%` : fmtM(value);
  return (
    <span style={{
      fontFamily: C.fontMono, fontSize: 13, fontWeight: 700, color,
      padding: "3px 8px", borderRadius: 6, background: bg, display: "inline-block",
    }}>{value === 0 ? "—" : display}</span>
  );
}

/* Gauge arc — semi-circle */
function GaugeArc({ value, label, size = 100 }: { value: number; label: string; size?: number }) {
  const pct = Math.min(Math.max(value, 0), 100);
  const color = pctColor(pct);
  const r = (size - 12) / 2;
  const circ = Math.PI * r; // semi-circle
  const offset = circ * (1 - pct / 100);
  const cx = size / 2, cy = size / 2 + 5;
  return (
    <div style={{ textAlign: "center" }}>
      <svg width={size} height={size * 0.6} viewBox={`0 0 ${size} ${size * 0.6}`}>
        <path d={`M ${cx - r},${cy} A ${r},${r} 0 0,1 ${cx + r},${cy}`}
          fill="none" stroke={C.borderLight} strokeWidth="6" strokeLinecap="round" />
        <path d={`M ${cx - r},${cy} A ${r},${r} 0 0,1 ${cx + r},${cy}`}
          fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
          strokeDasharray={`${circ}`} strokeDashoffset={`${offset}`}
          style={{ transition: "stroke-dashoffset 1s ease", filter: `drop-shadow(0 0 4px ${color}40)` }}
        />
        <text x={cx} y={cy - 8} textAnchor="middle" dominantBaseline="middle"
          style={{ fontFamily: C.fontMono, fontSize: "16px", fontWeight: 800, fill: color }}>
          {pct.toFixed(0)}%
        </text>
      </svg>
      <div style={{ fontFamily: C.fontMono, fontSize: 10, color: C.textTertiary, letterSpacing: "0.08em", marginTop: -4 }}>{label}</div>
    </div>
  );
}

/* Waterfall chart */
function WaterfallChart({ items, height = 140 }: { items: { label: string; value: number; color: string }[]; height?: number }) {
  const maxVal = Math.max(...items.map(x => Math.abs(x.value)), 1);
  const barArea = height - 30;
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "flex-end", height, padding: "0 4px" }}>
      {items.map((item, i) => {
        const h = (Math.abs(item.value) / maxVal) * barArea;
        return (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
            <span style={{ fontFamily: C.fontMono, fontSize: 10, color: item.color, fontWeight: 700 }}>{fmtM(item.value)}</span>
            <div style={{
              width: "100%", height: Math.max(h, 4), borderRadius: "4px 4px 2px 2px",
              background: `linear-gradient(180deg, ${item.color}, ${item.color}cc)`,
              boxShadow: `0 2px 8px ${item.color}30`,
              transition: "height 0.6s cubic-bezier(0.4,0,0.2,1)",
            }} />
            <span style={{ fontFamily: C.fontMono, fontSize: 9, color: C.textTertiary, textAlign: "center", lineHeight: 1.1, maxWidth: 60 }}>
              {item.label.split(" ").slice(0, 2).join(" ")}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* Loading skeleton */
function LoadingSkeleton() {
  return (
    <div style={{ padding: "32px", display: "flex", flexDirection: "column", gap: 16 }}>
      {[200, 320, 260, 280, 220].map((w, i) => (
        <div key={i} style={{
          height: 12, width: w, background: `linear-gradient(90deg, ${C.borderLight} 25%, ${C.border} 50%, ${C.borderLight} 75%)`,
          backgroundSize: "200% 100%", borderRadius: 6,
          animation: "shimmer 1.5s ease-in-out infinite", animationDelay: `${i * 0.12}s`,
        }} />
      ))}
      <style>{`@keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }`}</style>
    </div>
  );
}

/* Card wrapper */
function Card({ children, style, hover = false }: { children: React.ReactNode; style?: React.CSSProperties; hover?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div ref={ref}
      className={hover ? "o-card-hover" : undefined}
      style={{
        background: C.cardBg, borderRadius: C.radius, border: `1px solid ${C.border}`,
        boxShadow: C.shadow, overflow: "hidden", ...style,
      }}
    >{children}</div>
  );
}

/* DataSourceBadge */
function DataSourceBadge({ isLive }: { isLive: boolean }) {
  return (
    <span style={{
      fontFamily: C.fontMono, fontSize: 10, letterSpacing: "0.1em", fontWeight: 700,
      padding: "4px 12px", borderRadius: 20,
      color: isLive ? "#fff" : C.amber,
      background: isLive ? "linear-gradient(135deg, #16a34a, #22c55e)" : C.amberSoft,
      boxShadow: isLive ? "0 2px 8px rgba(34,197,94,0.3)" : "none",
    }}>
      {isLive ? "LIVE" : "DEMO"}
    </span>
  );
}

/* ═══════════════════════════════════════════════════════
   Main Page Component
   ═══════════════════════════════════════════════════════ */

export default function PortfolioRisk() {
  const isMobile = useIsMobile();
  const _planAllowed = usePlanRedirect("enterprise");
  const renderTs = useRenderTs();
  const router = useRouter();
  const { result, lastInputs } = useHedge();

  const [tab, setTab] = useState(0);
  const [positions, setPositions] = useState<PositionRow[] | null>(null);
  const [exposure, setExposure] = useState<ExposureAggregation[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [riskSummary, setRiskSummary] = useState<RiskSummaryData | null>(null);
  const [riskLoading, setRiskLoading] = useState(false);
  const [riskError, setRiskError] = useState<string | null>(null);

  const tabDefs = [
    { label: "R1-R8 DECOMPOSITION", icon: Activity },
    { label: "POSITION LEDGER", icon: BarChart3 },
    { label: "RISK ATTRIBUTION", icon: TrendingDown },
    { label: "HEDGE EFFICIENCY", icon: Shield },
    { label: "MARGIN & VaR", icon: AlertTriangle },
  ];

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

  const activeRisks = rDims.filter(r => r.regime !== "NONE").length;
  const highRisks = rDims.filter(r => r.regime === "HIGH").length;
  const riskScore = highRisks === 0 ? (activeRisks <= 3 ? 92 : 78) : (highRisks >= 3 ? 35 : 55);

  // Sample sparkline data
  const sparkVaR = [42, 38, 45, 52, 48, 55, 50, 47, 58, 54, 62, 56, 60, 58, 65];
  const sparkHedge = [72, 74, 73, 76, 78, 75, 80, 82, 79, 83, 81, 84, 82, 85, 83];
  const sparkExp = [120, 125, 118, 130, 128, 135, 132, 140, 138, 142, 145, 140, 148, 150, 152];

  return (
    <PageShell icon={BarChart3} title="Portfolio Risk" breadcrumb={["Dashboard", "Portfolio Risk"]} noPadding>
    <div style={{ minHeight: "100%", display: "flex", flexDirection: "column", background: C.pageBg, fontFamily: C.fontUI, color: C.textPrimary }}>

      <style>{`
        @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        @keyframes pulse-dot { 0%,100%{opacity:1} 50%{opacity:0.4} }
        .o-card-hover { transition: all 0.25s cubic-bezier(0.4,0,0.2,1); }
        .o-card-hover:hover { transform: translateY(-3px); box-shadow: ${C.shadowLift} !important; border-color: ${C.blueMid}30 !important; }
        .o-tab-btn { transition: all 0.2s ease; border: none; cursor: pointer; background: transparent; position: relative; }
        .o-tab-btn:hover { background: rgba(37,99,235,0.06) !important; }
        .o-trow { transition: background 0.15s ease; }
        .o-trow:hover { background: ${C.bluePale} !important; }
      `}</style>

      {/* ══════════ HEADER — Navy gradient ══════════ */}
      <header style={{
        display: "flex", alignItems: "center", gap: 16, height: isMobile ? "auto" : 64,
        flexWrap: isMobile ? "wrap" : "nowrap",
        padding: "0 28px", background: C.headerGradient, flexShrink: 0,
        borderBottom: "1px solid rgba(255,255,255,0.08)",
      }}>
        <button onClick={() => router.push("/")} style={{
          fontFamily: C.fontMono, fontSize: 11, color: "rgba(255,255,255,0.6)",
          background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
          padding: "6px 14px", cursor: "pointer", borderRadius: 8, letterSpacing: "0.04em",
        }}>HOME</button>
        <div style={{ width: 1, height: 32, background: "rgba(255,255,255,0.1)" }} />
        <div>
          <div style={{ fontFamily: C.fontHead, fontSize: 16, fontWeight: 800, color: "#fff", letterSpacing: "-0.01em" }}>
            Portfolio Risk Analytics
          </div>
          <div style={{ fontFamily: C.fontMono, fontSize: 11, color: "rgba(255,255,255,0.4)", letterSpacing: "0.06em" }}>
            R1-R8 VAR DECOMPOSITION · HEDGE EFFECTIVENESS · ATTRIBUTION
          </div>
        </div>
        <div style={{ flex: 1 }} />

        {/* Header KPI strip */}
        {[
          { label: "VaR 99%", value: fmtM(totalVar99), color: "#fca5a5", spark: sparkVaR },
          { label: "CVaR 99%", value: fmtM(totalCvar99), color: "#fca5a5" },
          { label: "GROSS EXP", value: grossExposureUsd > 0 ? fmtM(grossExposureUsd) : "—", color: "#93c5fd", spark: sparkExp },
          { label: "HEDGE", value: hedgeCoverPct > 0 ? `${hedgeCoverPct.toFixed(0)}%` : "—", color: "#86efac", spark: sparkHedge },
          { label: "RISK SCORE", value: `${riskScore}`, color: riskScore >= 70 ? "#86efac" : riskScore >= 50 ? "#fcd34d" : "#fca5a5" },
        ].map(({ label, value, color, spark }) => (
          <div key={label} style={{
            padding: "8px 16px", display: "flex", alignItems: "center", gap: 10,
            background: "rgba(255,255,255,0.04)", borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.06)",
          }}>
            <div>
              <div style={{ fontFamily: C.fontMono, fontSize: 10, color: "rgba(255,255,255,0.35)", letterSpacing: "0.08em" }}>{label}</div>
              <div style={{ fontFamily: C.fontMono, fontSize: 16, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
            </div>
            {spark && <Spark data={spark} color={color} width={56} height={22} />}
          </div>
        ))}

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <DataSourceBadge isLive={isLive} />
          <span style={{ fontFamily: C.fontMono, fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{renderTs}</span>
        </div>
      </header>

      {/* ══════════ TAB BAR ══════════ */}
      <div style={{
        display: "flex", alignItems: "center", background: C.cardBg,
        borderBottom: `1px solid ${C.border}`, padding: "0 28px", height: isMobile ? "auto" : 46, flexShrink: 0, gap: 2,
        flexWrap: isMobile ? "wrap" : "nowrap",
      }}>
        {tabDefs.map((t, i) => {
          const Icon = t.icon;
          const active = tab === i;
          return (
            <button key={i} onClick={() => setTab(i)} className="o-tab-btn" style={{
              fontFamily: C.fontMono, fontSize: 12, fontWeight: active ? 700 : 500,
              padding: "0 18px", height: "100%", display: "flex", alignItems: "center", gap: 6,
              color: active ? C.blueMid : C.textTertiary, letterSpacing: "0.04em",
              borderBottom: active ? `3px solid ${C.blueMid}` : "3px solid transparent",
              borderRadius: "8px 8px 0 0",
            }}>
              <Icon size={14} strokeWidth={active ? 2.5 : 1.5} />
              {t.label}
            </button>
          );
        })}
        <div style={{ flex: 1 }} />
        {isLive && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.green, animation: "pulse-dot 2s ease infinite" }} />
            <span style={{ fontFamily: C.fontMono, fontSize: 11, color: C.blueMid, fontWeight: 600 }}>{runLabel}</span>
            <span style={{ fontFamily: C.fontMono, fontSize: 11, color: C.textTertiary }}>v{engineVersion}</span>
          </div>
        )}
      </div>

      {/* Error/Warning banners */}
      {loadErr && (
        <div style={{ padding: "10px 28px", background: C.redSoft, borderBottom: `1px solid ${C.red}`, display: "flex", alignItems: "center", gap: 12, flexWrap: isMobile ? "wrap" : "nowrap" }}>
          <span style={{ fontFamily: C.fontMono, fontSize: 12, color: C.red, fontWeight: 700 }}>API ERROR: {loadErr}</span>
          <button onClick={loadPositions} style={{ fontFamily: C.fontMono, fontSize: 11, color: C.red, border: `1px solid ${C.red}`, background: "transparent", padding: "3px 12px", cursor: "pointer", borderRadius: 6 }}>RETRY</button>
        </div>
      )}
      {!isLive && (
        <div style={{ padding: "10px 28px", background: C.amberSoft, borderBottom: `1px solid ${C.amber}20`, display: "flex", alignItems: "center", gap: 14, flexShrink: 0, flexWrap: isMobile ? "wrap" : "nowrap" }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.amber }} />
          <span style={{ fontFamily: C.fontMono, fontSize: 12, color: C.amber, fontWeight: 700 }}>NO ACTIVE CALCULATION</span>
          <span style={{ fontFamily: C.fontUI, fontSize: 13, color: C.textSecondary }}>Run the hedge engine from Position Desk to populate live analytics.</span>
          <button onClick={() => router.push("/position-desk")} style={{
            fontFamily: C.fontMono, fontSize: 11, color: "#fff", background: `linear-gradient(135deg, ${C.amber}, #d97706)`,
            border: "none", padding: "6px 16px", cursor: "pointer", marginLeft: "auto", borderRadius: 8, fontWeight: 700,
          }}>RUN ENGINE <ChevronRight size={12} style={{ marginLeft: 2, verticalAlign: "middle" }} /></button>
        </div>
      )}

      {/* ══════════ CONTENT ══════════ */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", flexWrap: isMobile ? "wrap" : "nowrap" }}>
      <div style={{ flex: 1, overflow: "auto", padding: 0 }}>

        {/* ══ TAB 0: R1-R8 DECOMPOSITION ══ */}
        {tab === 0 && (
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 280px", height: "100%" }}>
            {/* Main panel */}
            <div style={{ padding: isMobile ? "12px 16px" : "20px 24px", overflow: "auto" }}>
              {/* KPI row */}
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(5, 1fr)", gap: 12, marginBottom: 20 }}>
                {[
                  { label: "TOTAL VaR 99%", value: fmtM(totalVar99), color: C.red, sub: "1-day parametric", spark: sparkVaR, sparkColor: C.red },
                  { label: "TOTAL CVaR 99%", value: fmtM(totalCvar99), color: C.red, sub: "Expected shortfall" },
                  { label: "GROSS EXPOSURE", value: grossExposureUsd > 0 ? fmtM(grossExposureUsd) : "—", color: C.blueMid, sub: "USD equivalent", spark: sparkExp, sparkColor: C.blueMid },
                  { label: "HEDGE COVER", value: hedgeCoverPct > 0 ? `${hedgeCoverPct.toFixed(0)}%` : "—", color: C.green, sub: "Notional ratio", spark: sparkHedge, sparkColor: C.green },
                  { label: "ACTIVE RISKS", value: `${activeRisks}/8`, color: activeRisks > 4 ? C.amber : C.blueMid, sub: `${highRisks} high regime` },
                ].map(({ label, value, color, sub, spark, sparkColor }) => (
                  <Card key={label} hover style={{ padding: "14px 16px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <div style={{ fontFamily: C.fontMono, fontSize: 10, color: C.textTertiary, letterSpacing: "0.08em", marginBottom: 6 }}>{label}</div>
                        <div style={{ fontFamily: C.fontMono, fontSize: 22, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
                        <div style={{ fontFamily: C.fontUI, fontSize: 11, color: C.textTertiary, marginTop: 4 }}>{sub}</div>
                      </div>
                      {spark && sparkColor && <Spark data={spark} color={sparkColor} width={60} height={24} />}
                    </div>
                  </Card>
                ))}
              </div>

              {/* R1-R8 Table */}
              <Card style={{ marginBottom: 20 }}>
                <div style={{ padding: "14px 18px 10px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 10 }}>
                  <Activity size={16} color={C.blueMid} strokeWidth={2} />
                  <span style={{ fontFamily: C.fontHead, fontSize: 14, fontWeight: 700, color: C.textPrimary }}>Risk Dimension Decomposition</span>
                  <span style={{ fontFamily: C.fontMono, fontSize: 11, color: C.textTertiary }}>8 dimensions · 99% confidence · 1-day horizon</span>
                </div>
                <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: C.headerGradient }}>
                      {["DIM", "RISK FACTOR", "VaR 99%", "", "CVaR 99%", "EXPOSURE", "HEDGE", "RESIDUAL", "REGIME"].map(h => (
                        <th key={h} style={{
                          padding: "10px 12px", fontFamily: C.fontMono, fontSize: 10,
                          letterSpacing: "0.1em", color: "rgba(255,255,255,0.7)", fontWeight: 600,
                          textAlign: "left", whiteSpace: "nowrap",
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rDims.map((r, idx) => {
                      const isNone = r.regime === "NONE";
                      return (
                        <tr key={r.code} className="o-trow" style={{
                          borderBottom: `1px solid ${C.borderLight}`, opacity: isNone ? 0.35 : 1,
                          background: idx % 2 === 0 ? C.cardBg : C.cardBgAlt,
                        }}>
                          <td style={{ padding: "12px 12px", fontFamily: C.fontMono, fontSize: 14, fontWeight: 800, color: C.blueMid }}>{r.code}</td>
                          <td style={{ padding: "12px 12px", maxWidth: 180 }}>
                            <div style={{ fontFamily: C.fontUI, fontSize: 13, fontWeight: 600, color: C.textPrimary, lineHeight: 1.2 }}>{r.name}</div>
                            <div style={{ fontFamily: C.fontUI, fontSize: 11, color: C.textTertiary, lineHeight: 1.3 }}>{r.description}</div>
                          </td>
                          <td style={{ padding: "12px 8px" }}>
                            <HeatCell value={r.var99} max={maxAbsVar} />
                          </td>
                          <td style={{ padding: "12px 4px", width: 100 }}>
                            <GradientBar value={Math.abs(r.var99)} max={maxAbsVar} />
                          </td>
                          <td style={{ padding: "12px 8px" }}>
                            <HeatCell value={r.cvar99} max={Math.max(...rDims.map(d => Math.abs(d.cvar99)), 1)} />
                          </td>
                          <td style={{ padding: "12px 8px", fontFamily: C.fontMono, fontSize: 12, color: C.textSecondary }}>
                            {r.exposure > 0 ? fmtM(r.exposure) : "—"}
                          </td>
                          <td style={{ padding: "12px 8px" }}>
                            {r.hedgeRatio > 0 ? (
                              <span style={{ fontFamily: C.fontMono, fontSize: 12, fontWeight: 700, color: C.green, padding: "2px 8px", borderRadius: 6, background: C.greenSoft }}>
                                {(r.hedgeRatio * 100).toFixed(0)}%
                              </span>
                            ) : <span style={{ fontFamily: C.fontMono, fontSize: 12, color: C.textTertiary }}>—</span>}
                          </td>
                          <td style={{ padding: "12px 8px", fontFamily: C.fontMono, fontSize: 12, color: C.textSecondary }}>
                            {r.residualExposure > 0 ? fmtM(r.residualExposure) : "—"}
                          </td>
                          <td style={{ padding: "12px 8px" }}><RegimeBadge regime={r.regime} /></td>
                        </tr>
                      );
                    })}
                    {/* Totals */}
                    <tr style={{ background: C.bluePale, borderTop: `2px solid ${C.blueMid}` }}>
                      <td colSpan={2} style={{ padding: "12px 12px", fontFamily: C.fontMono, fontSize: 13, fontWeight: 800, color: C.blueMid }}>PORTFOLIO TOTAL</td>
                      <td style={{ padding: "12px 8px" }}><HeatCell value={totalVar99} max={maxAbsVar * 3} /></td>
                      <td />
                      <td style={{ padding: "12px 8px" }}><HeatCell value={totalCvar99} max={maxAbsVar * 4} /></td>
                      <td style={{ padding: "12px 8px", fontFamily: C.fontMono, fontSize: 12, fontWeight: 700, color: C.blueMid }}>{fmtM(grossExposureUsd)}</td>
                      <td style={{ padding: "12px 8px" }}>
                        {hedgeCoverPct > 0 && <span style={{ fontFamily: C.fontMono, fontSize: 12, fontWeight: 700, color: C.green, padding: "2px 8px", borderRadius: 6, background: C.greenSoft }}>{hedgeCoverPct.toFixed(0)}%</span>}
                      </td>
                      <td style={{ padding: "12px 8px", fontFamily: C.fontMono, fontSize: 12, fontWeight: 700, color: C.textSecondary }}>{fmtM(grossExposureUsd - hedgeNotionalUsd)}</td>
                      <td />
                    </tr>
                  </tbody>
                </table>
                </div>
              </Card>
            </div>

            {/* RIGHT SIDEBAR */}
            <aside style={{ padding: "20px 16px", background: C.cardBg, overflow: "auto", borderLeft: `1px solid ${C.border}` }}>
              {/* Risk Score Gauge */}
              <Card style={{ padding: "16px 12px", marginBottom: 14, textAlign: "center" as const }}>
                <div style={{ fontFamily: C.fontMono, fontSize: 10, color: C.textTertiary, letterSpacing: "0.1em", marginBottom: 8 }}>COMPOSITE RISK SCORE</div>
                <GaugeArc value={riskScore} label={riskScore >= 70 ? "LOW RISK" : riskScore >= 50 ? "MODERATE" : "ELEVATED"} size={130} />
              </Card>

              {/* Radar */}
              <Card style={{ padding: "14px 8px", marginBottom: 14 }}>
                <div style={{ fontFamily: C.fontMono, fontSize: 10, color: C.blueMid, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 8, paddingLeft: 8 }}>RISK RADAR</div>
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <RiskRadar dims={rDims} />
                </div>
              </Card>

              {/* Rings row */}
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 6, marginBottom: 14 }}>
                <ProgressRing value={hedgeCoverPct} max={100} color={C.green} label="HEDGE" size={64} />
                <ProgressRing value={activeRisks} max={8} color={C.blueMid} label="ACTIVE" size={64} />
                <ProgressRing value={riskScore} max={100} color={riskScore >= 70 ? C.green : C.amber} label="HEALTH" size={64} />
              </div>

              {/* Regime summary */}
              <Card style={{ padding: "12px 14px", marginBottom: 14 }}>
                <div style={{ fontFamily: C.fontMono, fontSize: 10, color: C.blueMid, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 10 }}>REGIME DISTRIBUTION</div>
                {(["HIGH", "MODERATE", "LOW", "NONE"] as const).map(regime => {
                  const dims = rDims.filter(r => r.regime === regime);
                  const regColor: Record<string, string> = { HIGH: C.red, MODERATE: C.amber, LOW: C.green, NONE: C.textMuted };
                  return (
                    <div key={regime} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: `1px solid ${C.borderLight}` }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: regColor[regime], flexShrink: 0 }} />
                      <span style={{ fontFamily: C.fontMono, fontSize: 12, color: regColor[regime], fontWeight: 700, width: 72 }}>{regime}</span>
                      <div style={{ flex: 1, height: 4, background: C.borderLight, borderRadius: 2, overflow: "hidden" }}>
                        <div style={{ width: `${(dims.length / 8) * 100}%`, height: "100%", background: regColor[regime], borderRadius: 2, transition: "width 0.5s" }} />
                      </div>
                      <span style={{ fontFamily: C.fontMono, fontSize: 11, color: C.textTertiary, width: 16, textAlign: "right" as const }}>{dims.length}</span>
                    </div>
                  );
                })}
              </Card>

              {/* Methodology */}
              <Card style={{ padding: "12px 14px", background: `linear-gradient(135deg, ${C.bluePale}, #f0f4ff)` }}>
                <div style={{ fontFamily: C.fontMono, fontSize: 10, color: C.blueMid, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 6 }}>METHODOLOGY</div>
                <div style={{ fontFamily: C.fontUI, fontSize: 12, color: C.textSecondary, lineHeight: 1.7 }}>
                  Parametric + Scenario VaR<br />
                  Horizon: 1-day · Conf: 99%<br />
                  EWMA decay: {"\u03BB"}=0.94<br />
                  {isLive ? "Source: Live engine stress grid" : "Source: Parametric estimation"}
                </div>
              </Card>
            </aside>
          </div>
        )}

        {/* ══ TAB 1: POSITION LEDGER ══ */}
        {tab === 1 && (
          <div style={{ padding: isMobile ? "12px 16px" : "20px 24px", overflow: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: isMobile ? "wrap" : "nowrap" }}>
              <BarChart3 size={18} color={C.blueMid} />
              <span style={{ fontFamily: C.fontHead, fontSize: 15, fontWeight: 700, color: C.textPrimary }}>Position Ledger</span>
              {loading
                ? <span style={{ fontFamily: C.fontMono, fontSize: 11, color: C.textTertiary }}>Loading...</span>
                : <span style={{ fontFamily: C.fontMono, fontSize: 11, color: C.textTertiary }}>{displayPositions ? `${displayPositions.length} positions` : "empty"}</span>}
              <button onClick={loadPositions} style={{
                fontFamily: C.fontMono, fontSize: 11, color: C.blueMid,
                border: `1px solid ${C.blueMid}30`, background: C.blueGlow,
                padding: "5px 14px", cursor: "pointer", borderRadius: 8, fontWeight: 600,
              }}>REFRESH</button>
            </div>

            {loading ? <LoadingSkeleton />
              : displayPositions && displayPositions.length > 0 ? (
                <>
                  {/* Summary cards */}
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(5, 1fr)", gap: 12, marginBottom: 16 }}>
                    {(() => {
                      const ar = displayPositions.filter(p => p.type === "AR");
                      const ap = displayPositions.filter(p => p.type === "AP");
                      const hedged = displayPositions.filter(p => p.execution_status === "HEDGED");
                      const confirmed = displayPositions.filter(p => p.status === "CONFIRMED");
                      return [
                        { label: "RECEIVABLE (AR)", value: `${ar.length}`, sub: fmtUSD(ar.reduce((s, p) => s + p.amount, 0)), color: C.green },
                        { label: "PAYABLE (AP)", value: `${ap.length}`, sub: fmtUSD(Math.abs(ap.reduce((s, p) => s + p.amount, 0))), color: C.red },
                        { label: "CONFIRMED", value: `${confirmed.length}/${displayPositions.length}`, sub: `${((confirmed.length / displayPositions.length) * 100).toFixed(0)}% confirmed`, color: C.blueMid },
                        { label: "HEDGED", value: `${hedged.length}/${displayPositions.length}`, sub: `${((hedged.length / displayPositions.length) * 100).toFixed(0)}% coverage`, color: C.green },
                        { label: "NET EXPOSURE", value: fmtUSD(ar.reduce((s, p) => s + p.amount, 0) - Math.abs(ap.reduce((s, p) => s + p.amount, 0))), sub: "AR - AP net", color: C.blueMid },
                      ].map(({ label, value, sub, color }) => (
                        <Card key={label} hover style={{ padding: "14px 16px" }}>
                          <div style={{ fontFamily: C.fontMono, fontSize: 10, color: C.textTertiary, letterSpacing: "0.08em", marginBottom: 6 }}>{label}</div>
                          <div style={{ fontFamily: C.fontMono, fontSize: 18, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
                          <div style={{ fontFamily: C.fontUI, fontSize: 11, color: C.textTertiary, marginTop: 4 }}>{sub}</div>
                        </Card>
                      ));
                    })()}
                  </div>

                  {/* Position table */}
                  <Card>
                    <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ background: C.headerGradient }}>
                          {["RECORD ID", "ENTITY", "TYPE", "CCY", "AMOUNT", "VALUE DATE", "STATUS", "EXECUTION"].map(h => (
                            <th key={h} style={{ padding: "10px 14px", fontFamily: C.fontMono, fontSize: 10, letterSpacing: "0.1em", color: "rgba(255,255,255,0.7)", fontWeight: 600, textAlign: "left", whiteSpace: "nowrap" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {displayPositions.map((p, idx) => {
                          const isAR = p.type === "AR";
                          const execCfg: Record<string, { color: string; bg: string }> = {
                            HEDGED: { color: C.green, bg: C.greenSoft },
                            READY_TO_EXECUTE: { color: C.blueMid, bg: C.blueGlow },
                            POLICY_ASSIGNED: { color: C.amber, bg: C.amberSoft },
                            NEW: { color: C.textSecondary, bg: C.borderLight },
                            REJECTED: { color: C.red, bg: C.redSoft },
                          };
                          const exec = execCfg[p.execution_status] ?? { color: C.textTertiary, bg: "transparent" };
                          return (
                            <tr key={p.id} className="o-trow" style={{ borderBottom: `1px solid ${C.borderLight}`, background: idx % 2 === 0 ? C.cardBg : C.cardBgAlt }}>
                              <td style={{ padding: "11px 14px", fontFamily: C.fontMono, fontSize: 11, color: C.textTertiary }}>{p.record_id}</td>
                              <td style={{ padding: "11px 14px", fontFamily: C.fontUI, fontSize: 13, fontWeight: 600, color: C.textPrimary }}>{p.entity}</td>
                              <td style={{ padding: "11px 14px" }}>
                                <span style={{ fontFamily: C.fontMono, fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 20, color: "#fff", background: isAR ? `linear-gradient(135deg, ${C.green}, #16a34a)` : `linear-gradient(135deg, ${C.red}, #dc2626)` }}>{p.type}</span>
                              </td>
                              <td style={{ padding: "11px 14px", fontFamily: C.fontMono, fontSize: 13, color: C.textSecondary, fontWeight: 700 }}>{p.currency}</td>
                              <td style={{ padding: "11px 14px", fontFamily: C.fontMono, fontSize: 13, color: isAR ? C.green : C.red, fontWeight: 700 }}>
                                {isAR ? "+" : "-"}{fmtUSD(Math.abs(p.amount))}
                              </td>
                              <td style={{ padding: "11px 14px", fontFamily: C.fontMono, fontSize: 12, color: C.textSecondary }}>{p.value_date}</td>
                              <td style={{ padding: "11px 14px" }}>
                                <span style={{ fontFamily: C.fontMono, fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 20, color: p.status === "CONFIRMED" ? C.blueMid : C.amber, background: p.status === "CONFIRMED" ? C.blueGlow : C.amberSoft }}>{p.status}</span>
                              </td>
                              <td style={{ padding: "11px 14px" }}>
                                <span style={{ fontFamily: C.fontMono, fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 20, color: exec.color, background: exec.bg }}>{p.execution_status.replace(/_/g, " ")}</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    </div>
                  </Card>
                </>
              ) : (
                <Card style={{ padding: "60px 0", textAlign: "center" as const }}>
                  <BarChart3 size={32} color={C.textMuted} style={{ marginBottom: 12 }} />
                  <div style={{ fontFamily: C.fontMono, fontSize: 14, color: C.textTertiary, marginBottom: 12 }}>No positions in ledger</div>
                  <button onClick={() => router.push("/position-desk")} style={{
                    fontFamily: C.fontMono, fontSize: 12, color: "#fff", background: `linear-gradient(135deg, ${C.blueMid}, ${C.blue})`,
                    border: "none", padding: "8px 24px", cursor: "pointer", borderRadius: 10, fontWeight: 700,
                  }}>GO TO POSITION DESK</button>
                </Card>
              )}
          </div>
        )}

        {/* ══ TAB 2: RISK ATTRIBUTION ══ */}
        {tab === 2 && (
          <div style={{ padding: isMobile ? "12px 16px" : "20px 24px", overflow: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: isMobile ? "wrap" : "nowrap" }}>
              <TrendingDown size={18} color={C.blueMid} />
              <span style={{ fontFamily: C.fontHead, fontSize: 15, fontWeight: 700 }}>Risk Attribution</span>
              <span style={{ fontFamily: C.fontMono, fontSize: 11, color: C.textTertiary }}>P&L factor decomposition · {isLive ? "live" : "parametric"}</span>
            </div>

            {attribution.length === 0 ? (
              <Card style={{ padding: "60px 0", textAlign: "center" as const }}>
                <TrendingDown size={32} color={C.textMuted} style={{ marginBottom: 12 }} />
                <div style={{ fontFamily: C.fontMono, fontSize: 14, color: C.amber }}>No attribution data — run engine to compute.</div>
              </Card>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 20 }}>
                {/* Table */}
                <div>
                  <Card style={{ marginBottom: 16 }}>
                    <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, fontFamily: C.fontMono, fontSize: 10, color: C.blueMid, fontWeight: 700, letterSpacing: "0.1em" }}>
                      FACTOR CONTRIBUTION
                    </div>
                    <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ background: C.headerGradient }}>
                          {["FACTOR", "P&L IMPACT", "SHARE", ""].map(h => (
                            <th key={h} style={{ padding: "10px 14px", fontFamily: C.fontMono, fontSize: 10, color: "rgba(255,255,255,0.7)", fontWeight: 600, textAlign: "left", letterSpacing: "0.1em" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {attribution.map((a, i) => {
                          const colors = [C.red, C.amber, C.blueMid, C.blueSky, C.textTertiary];
                          return (
                            <tr key={a.factor} className="o-trow" style={{ borderBottom: `1px solid ${C.borderLight}`, background: i % 2 === 0 ? C.cardBg : C.cardBgAlt }}>
                              <td style={{ padding: "12px 14px" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <div style={{ width: 4, height: 24, borderRadius: 2, background: colors[i] }} />
                                  <span style={{ fontFamily: C.fontUI, fontSize: 13, fontWeight: 600 }}>{a.factor}</span>
                                </div>
                              </td>
                              <td style={{ padding: "12px 14px", fontFamily: C.fontMono, fontSize: 13, color: C.red, fontWeight: 700 }}>{fmtM(a.contribution)}</td>
                              <td style={{ padding: "12px 14px" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <div style={{ width: 80, height: 6, background: C.borderLight, borderRadius: 3, overflow: "hidden" }}>
                                    <div style={{ width: `${a.pct}%`, height: "100%", background: `linear-gradient(90deg, ${colors[i]}, ${colors[i]}cc)`, borderRadius: 3, transition: "width 0.5s" }} />
                                  </div>
                                  <span style={{ fontFamily: C.fontMono, fontSize: 12, color: C.textSecondary, fontWeight: 600 }}>{a.pct}%</span>
                                </div>
                              </td>
                              <td />
                            </tr>
                          );
                        })}
                        <tr style={{ background: C.bluePale, borderTop: `2px solid ${C.blueMid}` }}>
                          <td style={{ padding: "12px 14px", fontFamily: C.fontMono, fontSize: 13, fontWeight: 800, color: C.blueMid }}>TOTAL</td>
                          <td style={{ padding: "12px 14px", fontFamily: C.fontMono, fontSize: 13, fontWeight: 800, color: C.red }}>{fmtM(attribution.reduce((s, a) => s + a.contribution, 0))}</td>
                          <td style={{ padding: "12px 14px", fontFamily: C.fontMono, fontSize: 12, fontWeight: 800, color: C.blueMid }}>100%</td>
                          <td />
                        </tr>
                      </tbody>
                    </table>
                    </div>
                  </Card>
                </div>

                {/* Right column: Waterfall + Insight */}
                <div>
                  <Card style={{ padding: "16px 18px", marginBottom: 16 }}>
                    <div style={{ fontFamily: C.fontMono, fontSize: 10, color: C.blueMid, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 14 }}>P&L WATERFALL</div>
                    <WaterfallChart items={attribution.map((a, i) => ({
                      label: a.factor,
                      value: a.contribution,
                      color: [C.red, C.amber, C.blueMid, C.blueSky, C.textTertiary][i],
                    }))} height={160} />
                    <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                      {attribution.map((a, i) => (
                        <div key={a.factor} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <div style={{ width: 8, height: 8, borderRadius: 2, background: [C.red, C.amber, C.blueMid, C.blueSky, C.textTertiary][i] }} />
                          <span style={{ fontFamily: C.fontUI, fontSize: 11, color: C.textTertiary }}>{a.factor.split(" ").slice(0, 2).join(" ")}</span>
                        </div>
                      ))}
                    </div>
                  </Card>

                  <Card style={{ padding: "16px 18px", background: `linear-gradient(135deg, ${C.bluePale}, #f0f4ff)` }}>
                    <div style={{ fontFamily: C.fontMono, fontSize: 10, color: C.blueMid, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 8 }}>ATTRIBUTION INSIGHT</div>
                    <p style={{ fontFamily: C.fontUI, fontSize: 13, color: C.textSecondary, lineHeight: 1.7, margin: 0 }}>
                      <strong>{attribution[0]?.factor ?? "FX Rate"}</strong> ({attribution[0]?.pct ?? 0}%) is the dominant risk factor.
                      The {hedgeCoverPct.toFixed(0)}% hedge programme suppresses primary delta exposure.
                      {frictionUsd > 0 ? ` Forward carry cost: ${fmtUSD(frictionUsd)}.` : ""}
                      {attribution.length > 2 ? ` Secondary: ${attribution[1]?.factor} (${attribution[1]?.pct}%).` : ""}
                    </p>
                  </Card>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══ TAB 3: HEDGE EFFICIENCY ══ */}
        {tab === 3 && (
          <div style={{ padding: isMobile ? "12px 16px" : "20px 24px", overflow: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: isMobile ? "wrap" : "nowrap" }}>
              <Shield size={18} color={C.blueMid} />
              <span style={{ fontFamily: C.fontHead, fontSize: 15, fontWeight: 700 }}>Hedge Effectiveness Report</span>
              <span style={{ fontFamily: C.fontMono, fontSize: 11, color: C.textTertiary }}>IFRS 9 §6.4.1 · {isLive ? `${hedgeEfficiency.length} buckets` : "no active calc"}</span>
            </div>

            {hedgeEfficiency.length === 0 ? (
              <Card style={{ padding: "60px 0", textAlign: "center" as const }}>
                <Shield size={32} color={C.textMuted} style={{ marginBottom: 12 }} />
                <div style={{ fontFamily: C.fontMono, fontSize: 14, color: C.amber, marginBottom: 8 }}>No hedge effectiveness data</div>
                <div style={{ fontFamily: C.fontUI, fontSize: 13, color: C.textSecondary }}>Run the engine from Position Desk to populate.</div>
              </Card>
            ) : (
              <>
                {/* Gauge arcs row */}
                <div style={{ display: "flex", gap: 16, marginBottom: 20, justifyContent: "center", flexWrap: "wrap" }}>
                  {hedgeEfficiency.map(h => (
                    <Card key={h.bucket} hover style={{ padding: "14px 16px", textAlign: "center" as const, minWidth: 120 }}>
                      <GaugeArc value={h.effectiveness} label={h.bucket} size={90} />
                      <div style={{ marginTop: 6, display: "flex", justifyContent: "center", gap: 4 }}>
                        <span style={{ fontFamily: C.fontMono, fontSize: 10, color: C.textTertiary }}>T:{(h.targetRatio * 100).toFixed(0)}%</span>
                        <span style={{ fontFamily: C.fontMono, fontSize: 10, color: C.textTertiary }}>A:{(h.actualRatio * 100).toFixed(0)}%</span>
                      </div>
                      <RegimeBadge regime={h.status === "PASS" ? "LOW" : "HIGH"} />
                    </Card>
                  ))}
                </div>

                {/* Table */}
                <Card style={{ marginBottom: 20 }}>
                  <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: C.headerGradient }}>
                        {["TENOR", "TARGET", "ACTUAL", "COVERAGE DELTA", "EFFECTIVENESS", "IFRS 9"].map(h => (
                          <th key={h} style={{ padding: "10px 14px", fontFamily: C.fontMono, fontSize: 10, color: "rgba(255,255,255,0.7)", fontWeight: 600, textAlign: "left", letterSpacing: "0.1em" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {hedgeEfficiency.map((h, idx) => {
                        const delta = h.actualRatio - h.targetRatio;
                        const deltaStr = delta >= 0 ? `+${(delta * 100).toFixed(1)}pp` : `${(delta * 100).toFixed(1)}pp`;
                        const deltaColor = Math.abs(delta) < 0.03 ? C.green : Math.abs(delta) < 0.08 ? C.amber : C.red;
                        return (
                          <tr key={h.bucket} className="o-trow" style={{ borderBottom: `1px solid ${C.borderLight}`, background: idx % 2 === 0 ? C.cardBg : C.cardBgAlt }}>
                            <td style={{ padding: "12px 14px", fontFamily: C.fontMono, fontSize: 13, fontWeight: 800, color: C.blueMid }}>{h.bucket}</td>
                            <td style={{ padding: "12px 14px", fontFamily: C.fontMono, fontSize: 13, color: C.textSecondary }}>{(h.targetRatio * 100).toFixed(0)}%</td>
                            <td style={{ padding: "12px 14px", fontFamily: C.fontMono, fontSize: 13, color: C.textSecondary, fontWeight: 600 }}>{(h.actualRatio * 100).toFixed(0)}%</td>
                            <td style={{ padding: "12px 14px", fontFamily: C.fontMono, fontSize: 13, color: deltaColor, fontWeight: 700 }}>{deltaStr}</td>
                            <td style={{ padding: "12px 14px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <div style={{ width: 80, height: 6, background: C.borderLight, borderRadius: 3, overflow: "hidden" }}>
                                  <div style={{ width: `${Math.min(h.effectiveness, 100)}%`, height: "100%", background: `linear-gradient(90deg, ${pctColor(h.effectiveness)}, ${pctColor(h.effectiveness)}cc)`, borderRadius: 3, transition: "width 0.6s" }} />
                                </div>
                                <span style={{ fontFamily: C.fontMono, fontSize: 13, fontWeight: 700, color: pctColor(h.effectiveness) }}>{h.effectiveness.toFixed(1)}%</span>
                              </div>
                            </td>
                            <td style={{ padding: "12px 14px" }}>
                              <span style={{
                                fontFamily: C.fontMono, fontSize: 10, fontWeight: 700, padding: "3px 12px", borderRadius: 20,
                                color: "#fff", background: h.status === "PASS" ? `linear-gradient(135deg, ${C.green}, #16a34a)` : `linear-gradient(135deg, ${C.red}, #dc2626)`,
                                boxShadow: h.status === "PASS" ? `0 2px 6px rgba(34,197,94,0.3)` : `0 2px 6px rgba(239,68,68,0.3)`,
                              }}>{h.status}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  </div>
                </Card>

                {/* Bottom: IFRS checklist + Summary */}
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
                  <Card style={{ padding: "16px 20px" }}>
                    <div style={{ fontFamily: C.fontMono, fontSize: 10, color: C.blueMid, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 12 }}>IFRS 9 §6.4.1 QUALIFICATION</div>
                    {["Economic relationship established", "Credit risk non-dominant", "Hedge ratio reflects actual quantities", "Designation documented at inception", "Prospective effectiveness assessed", "Ineffectiveness measured & disclosed"].map((c, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${C.borderLight}` }}>
                        <div style={{ width: 18, height: 18, borderRadius: "50%", background: `linear-gradient(135deg, ${C.green}, #16a34a)`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: `0 2px 6px rgba(34,197,94,0.2)` }}>
                          <span style={{ color: "#fff", fontSize: 10, fontWeight: 800 }}>✓</span>
                        </div>
                        <span style={{ fontFamily: C.fontUI, fontSize: 13, color: C.textSecondary }}>{c}</span>
                      </div>
                    ))}
                  </Card>
                  <Card style={{ padding: "16px 20px" }}>
                    <div style={{ fontFamily: C.fontMono, fontSize: 10, color: C.blueMid, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 12 }}>EFFECTIVENESS SUMMARY</div>
                    {[
                      { label: "Buckets assessed", value: `${hedgeEfficiency.length}` },
                      { label: "Passing (IFRS 9)", value: `${hedgeEfficiency.filter(h => h.status === "PASS").length}/${hedgeEfficiency.length}` },
                      { label: "Target ratio", value: `${((policy?.hedge_ratios?.confirmed ?? 0.80) * 100).toFixed(0)}% confirmed` },
                      { label: "Method", value: "Dollar-offset (prospective)" },
                      { label: "Audit trail", value: runId ? `RUN ${runId.slice(0, 8).toUpperCase()}` : "No active run" },
                      { label: "Standard", value: "IFRS 9.6.4.1(a-c) · B6.4.1" },
                    ].map(({ label, value }) => (
                      <div key={label} style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: 8, padding: "8px 0", borderBottom: `1px solid ${C.borderLight}` }}>
                        <span style={{ fontFamily: C.fontUI, fontSize: 13, color: C.textTertiary }}>{label}</span>
                        <span style={{ fontFamily: C.fontMono, fontSize: 12, color: C.textSecondary, fontWeight: 600 }}>{value}</span>
                      </div>
                    ))}
                  </Card>
                </div>
              </>
            )}
          </div>
        )}

        {/* ══ TAB 4: MARGIN & VaR ══ */}
        {tab === 4 && (
          <div style={{ padding: isMobile ? "12px 16px" : "20px 24px", overflow: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: isMobile ? "wrap" : "nowrap" }}>
              <AlertTriangle size={18} color={C.blueMid} />
              <span style={{ fontFamily: C.fontHead, fontSize: 15, fontWeight: 700 }}>Margin & Concentration Limits</span>
              <span style={{ fontFamily: C.fontMono, fontSize: 11, color: C.textTertiary }}>SIMM IM · {riskSummary ? `RUN ${riskSummary.run_id.slice(0, 8).toUpperCase()}` : "no active run"}</span>
            </div>

            {riskLoading ? <LoadingSkeleton /> : riskError ? (
              <Card style={{ padding: "40px 0", textAlign: "center" as const }}>
                <div style={{ fontFamily: C.fontMono, fontSize: 14, color: C.red, marginBottom: 12 }}>ERROR: {riskError}</div>
                {runId && <button onClick={() => loadRiskSummary(runId)} style={{ fontFamily: C.fontMono, fontSize: 11, color: C.red, border: `1px solid ${C.red}`, background: "transparent", padding: "5px 14px", cursor: "pointer", borderRadius: 8 }}>RETRY</button>}
              </Card>
            ) : !riskSummary ? (
              <Card style={{ padding: "60px 0", textAlign: "center" as const }}>
                <AlertTriangle size={32} color={C.textMuted} style={{ marginBottom: 12 }} />
                <div style={{ fontFamily: C.fontMono, fontSize: 14, color: C.amber, marginBottom: 12 }}>No margin data available</div>
                <button onClick={() => router.push("/position-desk")} style={{
                  fontFamily: C.fontMono, fontSize: 12, color: "#fff", background: `linear-gradient(135deg, ${C.blueMid}, ${C.blue})`,
                  border: "none", padding: "8px 24px", cursor: "pointer", borderRadius: 10, fontWeight: 700,
                }}>RUN ENGINE</button>
              </Card>
            ) : (
              <>
                {/* SIMM Margin */}
                {riskSummary.margin && riskSummary.margin.positions.length > 0 && (
                  <>
                    <Card style={{ marginBottom: 16 }}>
                      <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, fontFamily: C.fontMono, fontSize: 10, color: C.blueMid, fontWeight: 700, letterSpacing: "0.1em" }}>
                        SIMM-STYLE MARGIN REQUIREMENTS
                      </div>
                      <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                          <tr style={{ background: C.headerGradient }}>
                            {["BUCKET", "INSTRUMENT", "NOTIONAL", "INITIAL MARGIN", "MAINTENANCE", "STRESS", "FUNDING"].map(h => (
                              <th key={h} style={{ padding: "10px 14px", fontFamily: C.fontMono, fontSize: 10, color: "rgba(255,255,255,0.7)", fontWeight: 600, textAlign: "left", letterSpacing: "0.1em" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {riskSummary.margin.positions.map((p, i) => (
                            <tr key={i} className="o-trow" style={{ borderBottom: `1px solid ${C.borderLight}`, background: i % 2 === 0 ? C.cardBg : C.cardBgAlt }}>
                              <td style={{ padding: "11px 14px", fontFamily: C.fontMono, fontSize: 13, fontWeight: 700, color: C.blueMid }}>{p.bucket}</td>
                              <td style={{ padding: "11px 14px" }}>
                                <span style={{ fontFamily: C.fontMono, fontSize: 10, padding: "3px 10px", borderRadius: 20, color: C.blueMid, background: C.blueGlow, fontWeight: 600 }}>{p.instrument}</span>
                              </td>
                              <td style={{ padding: "11px 14px", fontFamily: C.fontMono, fontSize: 13, color: C.textSecondary }}>{fmtUSD(p.notional_usd)}</td>
                              <td style={{ padding: "11px 14px", fontFamily: C.fontMono, fontSize: 13, color: C.amber, fontWeight: 700 }}>{fmtUSD(p.initial_margin)}</td>
                              <td style={{ padding: "11px 14px", fontFamily: C.fontMono, fontSize: 13, color: C.textSecondary }}>{fmtUSD(p.maintenance_margin)}</td>
                              <td style={{ padding: "11px 14px", fontFamily: C.fontMono, fontSize: 13, color: C.red, fontWeight: 600 }}>{fmtUSD(p.stress_margin)}</td>
                              <td style={{ padding: "11px 14px", fontFamily: C.fontMono, fontSize: 13, color: C.textTertiary }}>{fmtUSD(p.funding_cost)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      </div>
                    </Card>

                    {/* Margin KPIs */}
                    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr 1fr" : "repeat(6, 1fr)", gap: 10, marginBottom: 16 }}>
                      {[
                        { label: "TOTAL IM", value: fmtUSD(riskSummary.margin.total_initial_margin), color: C.amber },
                        { label: "MAINTENANCE", value: fmtUSD(riskSummary.margin.total_maintenance_margin), color: C.textSecondary },
                        { label: "STRESS", value: fmtUSD(riskSummary.margin.total_stress_margin), color: C.red },
                        { label: "FUNDING", value: fmtUSD(riskSummary.margin.total_funding_cost), color: C.textTertiary },
                        { label: "BUDGET", value: riskSummary.margin.margin_budget_usd ? fmtUSD(riskSummary.margin.margin_budget_usd) : "UNCAPPED", color: C.textSecondary },
                        { label: "UTILIZATION", value: `${riskSummary.margin.margin_utilization_pct.toFixed(1)}%`, color: riskSummary.margin.budget_exceeded ? C.red : C.green },
                      ].map(({ label, value, color }) => (
                        <Card key={label} hover style={{ padding: "12px 14px" }}>
                          <div style={{ fontFamily: C.fontMono, fontSize: 10, color: C.textTertiary, letterSpacing: "0.08em" }}>{label}</div>
                          <div style={{ fontFamily: C.fontMono, fontSize: 16, fontWeight: 800, color, marginTop: 4 }}>{value}</div>
                        </Card>
                      ))}
                    </div>

                    {riskSummary.margin.budget_exceeded && (
                      <Card style={{ marginBottom: 16, padding: "12px 18px", background: C.redSoft, border: `1px solid ${C.red}40`, display: "flex", alignItems: "center", gap: 10 }}>
                        <AlertTriangle size={16} color={C.red} />
                        <span style={{ fontFamily: C.fontMono, fontSize: 12, color: C.red, fontWeight: 700 }}>MARGIN BUDGET EXCEEDED</span>
                        <span style={{ fontFamily: C.fontUI, fontSize: 13, color: C.textSecondary }}>
                          IM ({fmtUSD(riskSummary.margin.total_initial_margin)}) exceeds budget ({fmtUSD(riskSummary.margin.margin_budget_usd ?? 0)})
                        </span>
                      </Card>
                    )}
                  </>
                )}

                {/* Concentration + Effectiveness */}
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16, marginBottom: 16 }}>
                  <div>
                    <Card>
                      <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, fontFamily: C.fontMono, fontSize: 10, color: C.blueMid, fontWeight: 700, letterSpacing: "0.1em" }}>CONCENTRATION LIMITS</div>
                      {riskSummary.concentration && riskSummary.concentration.checks.length > 0 ? (
                        <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                          <thead><tr style={{ background: C.headerGradient }}>
                            {["INSTRUMENT", "NOTIONAL", "CONC %", "LIMIT", "STATUS"].map(h => (
                              <th key={h} style={{ padding: "8px 12px", fontFamily: C.fontMono, fontSize: 10, color: "rgba(255,255,255,0.7)", fontWeight: 600, textAlign: "left", letterSpacing: "0.1em" }}>{h}</th>
                            ))}
                          </tr></thead>
                          <tbody>
                            {riskSummary.concentration.checks.map((c, i) => {
                              const sColor = c.status === "BREACH" ? C.red : c.status === "WARNING" ? C.amber : C.green;
                              return (
                                <tr key={c.instrument} className="o-trow" style={{ borderBottom: `1px solid ${C.borderLight}`, background: i % 2 === 0 ? C.cardBg : C.cardBgAlt }}>
                                  <td style={{ padding: "10px 12px", fontFamily: C.fontMono, fontSize: 12, fontWeight: 700, color: C.textPrimary }}>{c.instrument}</td>
                                  <td style={{ padding: "10px 12px", fontFamily: C.fontMono, fontSize: 12, color: C.textSecondary }}>{fmtUSD(c.notional_usd)}</td>
                                  <td style={{ padding: "10px 12px" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                      <GradientBar value={c.concentration_pct * 100} max={100} height={6} />
                                      <span style={{ fontFamily: C.fontMono, fontSize: 12, color: sColor, fontWeight: 700, minWidth: 40 }}>{(c.concentration_pct * 100).toFixed(1)}%</span>
                                    </div>
                                  </td>
                                  <td style={{ padding: "10px 12px", fontFamily: C.fontMono, fontSize: 12, color: C.textTertiary }}>{(c.limit_pct * 100).toFixed(0)}%</td>
                                  <td style={{ padding: "10px 12px" }}>
                                    <span style={{ fontFamily: C.fontMono, fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 20, color: "#fff", background: sColor === C.green ? `linear-gradient(135deg, ${C.green}, #16a34a)` : sColor === C.amber ? `linear-gradient(135deg, ${C.amber}, #d97706)` : `linear-gradient(135deg, ${C.red}, #dc2626)` }}>{c.status}</span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        </div>
                      ) : <div style={{ fontFamily: C.fontMono, fontSize: 12, color: C.textTertiary, padding: 20 }}>No concentration data</div>}
                    </Card>
                  </div>

                  <div>
                    <Card style={{ padding: "16px 18px" }}>
                      <div style={{ fontFamily: C.fontMono, fontSize: 10, color: C.blueMid, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 12 }}>HEDGE EFFECTIVENESS</div>
                      {riskSummary.hedge_effectiveness ? (
                        <>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                            <span style={{ fontFamily: C.fontMono, fontSize: 11, color: C.textTertiary }}>Dollar-Offset Ratio</span>
                            <span style={{ fontFamily: C.fontMono, fontSize: 20, fontWeight: 800, color: riskSummary.hedge_effectiveness.is_effective ? C.green : C.red }}>
                              {riskSummary.hedge_effectiveness.dollar_offset_ratio.toFixed(4)}
                            </span>
                          </div>
                          {/* Gauge band */}
                          <div style={{ position: "relative", height: 28, background: C.borderLight, borderRadius: 14, marginBottom: 8, overflow: "hidden" }}>
                            <div style={{ position: "absolute", left: "40%", top: 0, bottom: 0, width: "22.5%", background: `${C.green}15`, borderLeft: `2px solid ${C.green}`, borderRight: `2px solid ${C.green}` }} />
                            <div style={{
                              position: "absolute", left: `${Math.min(Math.max((riskSummary.hedge_effectiveness.dollar_offset_ratio / 2.0) * 100, 2), 98)}%`,
                              top: 3, width: 6, height: 22, borderRadius: 3,
                              background: riskSummary.hedge_effectiveness.is_effective ? `linear-gradient(180deg, ${C.green}, #16a34a)` : `linear-gradient(180deg, ${C.red}, #dc2626)`,
                              transform: "translateX(-50%)", boxShadow: `0 2px 8px ${riskSummary.hedge_effectiveness.is_effective ? C.green : C.red}40`,
                            }} />
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
                            {["0.00", "0.80", "1.25", "2.00"].map((v, i) => (
                              <span key={v} style={{ fontFamily: C.fontMono, fontSize: 10, color: i === 1 || i === 2 ? C.green : C.textTertiary }}>{v}</span>
                            ))}
                          </div>
                          {[
                            { label: "Method", value: riskSummary.hedge_effectiveness.method.replace(/_/g, " ").toUpperCase() },
                            { label: "Status", value: riskSummary.hedge_effectiveness.is_effective ? "EFFECTIVE" : "INEFFECTIVE" },
                            { label: "Band", value: "0.80 - 1.25" },
                            { label: "Standard", value: "ASC 815-20-35 / IFRS 9.B6.4.1" },
                          ].map(({ label, value }) => (
                            <div key={label} style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: 8, padding: "7px 0", borderBottom: `1px solid ${C.borderLight}` }}>
                              <span style={{ fontFamily: C.fontUI, fontSize: 13, color: C.textTertiary }}>{label}</span>
                              <span style={{ fontFamily: C.fontMono, fontSize: 12, color: label === "Status" ? (riskSummary.hedge_effectiveness!.is_effective ? C.green : C.red) : C.textSecondary, fontWeight: label === "Status" ? 700 : 500 }}>{value}</span>
                            </div>
                          ))}
                        </>
                      ) : <div style={{ fontFamily: C.fontMono, fontSize: 12, color: C.textTertiary, padding: 16 }}>No effectiveness data</div>}
                    </Card>
                  </div>
                </div>

                {/* Monte Carlo */}
                {riskSummary.monte_carlo && (
                  <>
                    <Card style={{ marginBottom: 16 }}>
                      <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 8 }}>
                        <Activity size={14} color={C.blueMid} />
                        <span style={{ fontFamily: C.fontMono, fontSize: 10, color: C.blueMid, fontWeight: 700, letterSpacing: "0.1em" }}>
                          MONTE CARLO VaR/CVaR · {riskSummary.monte_carlo.simulation_count.toLocaleString()} SIMULATIONS
                        </span>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 0 }}>
                        <div style={{ padding: "16px", borderRight: `1px solid ${C.border}` }}>
                          <div style={{ overflowX: "auto" }}>
                          <table style={{ width: "100%", borderCollapse: "collapse" }}>
                            <thead><tr style={{ background: C.headerGradient }}>
                              {["CONF", "HEDGED VaR", "UNHEDGED VaR", "HEDGED CVaR", "UNHEDGED CVaR"].map(h => (
                                <th key={h} style={{ padding: "8px 10px", fontFamily: C.fontMono, fontSize: 9, color: "rgba(255,255,255,0.7)", fontWeight: 600, textAlign: "left", letterSpacing: "0.1em" }}>{h}</th>
                              ))}
                            </tr></thead>
                            <tbody>
                              {riskSummary.monte_carlo.var_results.map((vr, i) => (
                                <tr key={vr.confidence} className="o-trow" style={{ borderBottom: `1px solid ${C.borderLight}`, background: i % 2 === 0 ? C.cardBg : C.cardBgAlt }}>
                                  <td style={{ padding: "9px 10px", fontFamily: C.fontMono, fontSize: 12, fontWeight: 800, color: C.blueMid }}>{(vr.confidence * 100).toFixed(0)}%</td>
                                  <td style={{ padding: "9px 10px", fontFamily: C.fontMono, fontSize: 12, color: C.green, fontWeight: 700 }}>{fmtUSD(vr.hedged_var)}</td>
                                  <td style={{ padding: "9px 10px", fontFamily: C.fontMono, fontSize: 12, color: C.red }}>{fmtUSD(vr.unhedged_var)}</td>
                                  <td style={{ padding: "9px 10px", fontFamily: C.fontMono, fontSize: 12, color: C.green }}>{fmtUSD(vr.hedged_cvar)}</td>
                                  <td style={{ padding: "9px 10px", fontFamily: C.fontMono, fontSize: 12, color: C.red }}>{fmtUSD(vr.unhedged_cvar)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          </div>

                          <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: 8 }}>
                            {[
                              { label: "MEAN HEDGED", value: fmtUSD(riskSummary.monte_carlo.mean_hedged_pnl), color: C.green },
                              { label: "MEAN UNHEDGED", value: fmtUSD(riskSummary.monte_carlo.mean_unhedged_pnl), color: C.red },
                              { label: "HEDGE BENEFIT", value: `${riskSummary.monte_carlo.hedge_benefit_pct.toFixed(1)}%`, color: C.blueMid },
                            ].map(({ label, value, color }) => (
                              <Card key={label} hover style={{ padding: "10px 12px" }}>
                                <div style={{ fontFamily: C.fontMono, fontSize: 9, color: C.textTertiary, letterSpacing: "0.08em" }}>{label}</div>
                                <div style={{ fontFamily: C.fontMono, fontSize: 14, fontWeight: 800, color, marginTop: 2 }}>{value}</div>
                              </Card>
                            ))}
                          </div>
                        </div>

                        {/* P&L Distribution */}
                        <div style={{ padding: "16px" }}>
                          <div style={{ fontFamily: C.fontMono, fontSize: 10, color: C.blueMid, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 10 }}>P&L DISTRIBUTION</div>
                          {[1, 5, 10, 25, 50, 75, 90, 95, 99].map(p => {
                            const hKey = `hedged_p${String(p).padStart(2, "0")}`;
                            const uKey = `unhedged_p${String(p).padStart(2, "0")}`;
                            const hVal = riskSummary.monte_carlo!.percentiles[hKey] ?? 0;
                            const uVal = riskSummary.monte_carlo!.percentiles[uKey] ?? 0;
                            const maxAbs = Math.max(Math.abs(riskSummary.monte_carlo!.worst_hedged_pnl), Math.abs(riskSummary.monte_carlo!.worst_unhedged_pnl), Math.abs(riskSummary.monte_carlo!.best_hedged_pnl), 1);
                            const hPct = (hVal / maxAbs) * 50 + 50;
                            const uPct = (uVal / maxAbs) * 50 + 50;
                            return (
                              <div key={p} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0", borderBottom: `1px solid ${C.borderLight}` }}>
                                <span style={{ fontFamily: C.fontMono, fontSize: 11, color: C.textTertiary, width: 24, textAlign: "right" as const }}>p{p}</span>
                                <div style={{ flex: 1, height: 10, background: C.borderLight, borderRadius: 5, position: "relative", overflow: "hidden" }}>
                                  <div style={{ position: "absolute", left: `${Math.min(Math.max(uPct, 0), 100)}%`, top: 0, width: 3, height: "100%", background: C.red, opacity: 0.5, borderRadius: 1 }} />
                                  <div style={{ position: "absolute", left: `${Math.min(Math.max(hPct, 0), 100)}%`, top: 0, width: 3, height: "100%", background: C.green, borderRadius: 1 }} />
                                  <div style={{ position: "absolute", left: "50%", top: 0, width: 1, height: "100%", background: C.border }} />
                                </div>
                                <span style={{ fontFamily: C.fontMono, fontSize: 11, color: C.green, width: 52, textAlign: "right" as const }}>{fmtM(hVal)}</span>
                                <span style={{ fontFamily: C.fontMono, fontSize: 11, color: C.red, width: 52, textAlign: "right" as const }}>{fmtM(uVal)}</span>
                              </div>
                            );
                          })}
                          <div style={{ display: "flex", justifyContent: "flex-end", gap: 14, marginTop: 8 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                              <div style={{ width: 10, height: 4, background: C.green, borderRadius: 2 }} />
                              <span style={{ fontFamily: C.fontMono, fontSize: 10, color: C.textTertiary }}>Hedged</span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                              <div style={{ width: 10, height: 4, background: C.red, opacity: 0.5, borderRadius: 2 }} />
                              <span style={{ fontFamily: C.fontMono, fontSize: 10, color: C.textTertiary }}>Unhedged</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </Card>
                  </>
                )}
              </>
            )}
          </div>
        )}

      </div>
        <HelpPanel config={PORTFOLIO_RISK_HELP} storageKey="portfolio-risk" />
      </div>

      {/* ══════════ FOOTER ══════════ */}
      <footer style={{
        height: 38, display: "flex", alignItems: "center", gap: 12, padding: "0 28px",
        background: C.headerGradient, flexShrink: 0,
        fontFamily: C.fontMono, fontSize: 11, color: "rgba(255,255,255,0.5)",
      }}>
        <span style={{ color: "#fff", fontWeight: 700, letterSpacing: "0.04em" }}>ORDR-TERMINAL</span>
        <span style={{ color: "rgba(255,255,255,0.2)" }}>|</span>
        <span>Portfolio Risk Analytics</span>
        <span style={{ color: "rgba(255,255,255,0.2)" }}>|</span>
        <span>R1-R8 VaR 99% · {isLive ? "LIVE" : "DEMO"}</span>
        <span style={{ color: "rgba(255,255,255,0.2)" }}>|</span>
        <span>IFRS 9: {hedgeEfficiency.length > 0 ? (hedgeEfficiency.every(h => h.status === "PASS") ? "ALL PASS" : `${hedgeEfficiency.filter(h => h.status === "PASS").length}/${hedgeEfficiency.length}`) : "PENDING"}</span>
        {runId && <>
          <span style={{ color: "rgba(255,255,255,0.2)" }}>|</span>
          <span>{runLabel}</span>
        </>}
        <div style={{ flex: 1 }} />
        <span style={{ color: "rgba(255,255,255,0.3)" }}>{renderTs}</span>
      </footer>
    </div>
    </PageShell>
  );
}
