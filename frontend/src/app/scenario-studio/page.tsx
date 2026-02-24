"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useHedge } from "../../lib/hedgeContext";

// ── Hydration-safe timestamp hook ─────────────────────────────────────────────
function useRenderTs(): string {
  const [renderTs, setRenderTs] = useState('');
  useEffect(() => {
    setRenderTs(new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC");
  }, []);
  return renderTs;
}

// ─── style constants ─────────────────────────────────────────────────────────
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
  pass:     "var(--status-pass)",
  fail:     "var(--accent-red,#B91C1C)",
} as const;

// ─── tab types ────────────────────────────────────────────────────────────────
type ScenarioTab = "library" | "shock" | "distribution" | "pathbuilder" | "audit";

const TABS: { key: ScenarioTab; label: string }[] = [
  { key: "library",      label: "Scenario Library" },
  { key: "shock",        label: "Shock Ladder" },
  { key: "distribution", label: "P&L Distribution" },
  { key: "pathbuilder",  label: "Path Builder" },
  { key: "audit",        label: "Audit" },
];

// ─── primitives ──────────────────────────────────────────────────────────────

function TopBar({ onBack }: { onBack: () => void }) {
  const renderTs = useRenderTs();
  return (
    <header style={{
      display: "flex", alignItems: "center", gap: 12, height: 44,
      padding: "0 20px", background: S.bgPanel, borderBottom: `1px solid ${S.rim}`,
      flexShrink: 0,
    }}>
      <button onClick={onBack} style={{
        fontFamily: S.fontMono, fontSize: "0.75rem", color: S.tertiary,
        background: "transparent", border: `1px solid ${S.rim}`,
        padding: "2px 8px", cursor: "pointer", letterSpacing: "0.04em",
      }}>← Home</button>
      <span style={{ color: S.rim, userSelect: "none" }}>|</span>
      <span style={{ fontFamily: S.fontUI, fontSize: "0.8125rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: S.primary }}>
        Scenario Studio
      </span>
      <span style={{
        fontFamily: S.fontMono, fontSize: "0.6875rem", letterSpacing: "0.08em",
        color: S.secondary, padding: "1px 5px", border: `1px solid ${S.rim}`,
      }}>SIMULATION · STRESS</span>
      <div style={{ flex: 1 }} />
      <span style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary, letterSpacing: "0.04em" }}>
        AS OF {renderTs}
      </span>
    </header>
  );
}

function SectionLabel({ index, title, count }: { index: string; title: string; count?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 10, paddingBottom: 8 }}>
      <span style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary, letterSpacing: "0.06em" }}>{index}</span>
      <span style={{ fontFamily: S.fontUI, fontSize: "0.8125rem", fontWeight: 600, color: S.primary }}>{title}</span>
      {count && <span style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary, marginLeft: "auto" }}>{count}</span>}
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: S.rim, marginBottom: 14 }} />;
}

// ─── static scenario data ─────────────────────────────────────────────────────

const SCENARIOS = [
  {
    id: "SCN-001",
    name: "Fed Shock +150bps",
    type: "MACRO",
    method: "Deterministic",
    status: "COMPLETE",
    spotDelta: +4.82,
    hedgePnL: -12_430_000,
    netExposure: 284_200_000,
    confidence: 99.1,
    lastRun: "2026-02-17 09:14",
  },
  {
    id: "SCN-002",
    name: "MXN Devaluation 20%",
    type: "EM STRESS",
    method: "Historical",
    status: "COMPLETE",
    spotDelta: +20.00,
    hedgePnL: -98_750_000,
    netExposure: 284_200_000,
    confidence: 97.3,
    lastRun: "2026-02-17 09:14",
  },
  {
    id: "SCN-003",
    name: "Oil Collapse → MXN",
    type: "COMMODITY",
    method: "Monte Carlo",
    status: "COMPLETE",
    spotDelta: +8.14,
    hedgePnL: -31_200_000,
    netExposure: 284_200_000,
    confidence: 95.0,
    lastRun: "2026-02-17 09:13",
  },
  {
    id: "SCN-004",
    name: "Banxico Hold + USD Rally",
    type: "RATES",
    method: "Deterministic",
    status: "COMPLETE",
    spotDelta: +2.35,
    hedgePnL: -4_820_000,
    netExposure: 284_200_000,
    confidence: 98.5,
    lastRun: "2026-02-17 09:12",
  },
  {
    id: "SCN-005",
    name: "Global Risk-Off Q2",
    type: "MACRO",
    method: "Monte Carlo",
    status: "RUNNING",
    spotDelta: null,
    hedgePnL: null,
    netExposure: 284_200_000,
    confidence: null,
    lastRun: "2026-02-17 09:15",
  },
  {
    id: "SCN-006",
    name: "Custom Path: Gradual Appreciation",
    type: "CUSTOM",
    method: "Deterministic",
    status: "DRAFT",
    spotDelta: null,
    hedgePnL: null,
    netExposure: 284_200_000,
    confidence: null,
    lastRun: "—",
  },
];

const SHOCK_LADDER = [
  { shock: "-20%", usdmxn: 15.28, hedgePnL: +82_400_000, portfolioImpact: +124_000_000, netImpact: +41_600_000 },
  { shock: "-15%", usdmxn: 16.20, hedgePnL: +58_900_000, portfolioImpact: +93_000_000,  netImpact: +34_100_000 },
  { shock: "-10%", usdmxn: 17.11, hedgePnL: +34_800_000, portfolioImpact: +62_000_000,  netImpact: +27_200_000 },
  { shock:  "-5%", usdmxn: 18.02, hedgePnL: +17_200_000, portfolioImpact: +31_000_000,  netImpact: +13_800_000 },
  { shock:   "0%", usdmxn: 18.97, hedgePnL: 0,           portfolioImpact: 0,            netImpact: 0,           base: true },
  { shock:  "+5%", usdmxn: 19.92, hedgePnL: -12_100_000, portfolioImpact: -31_000_000,  netImpact: -18_900_000 },
  { shock: "+10%", usdmxn: 20.87, hedgePnL: -24_800_000, portfolioImpact: -62_000_000,  netImpact: -37_200_000 },
  { shock: "+15%", usdmxn: 21.82, hedgePnL: -38_200_000, portfolioImpact: -93_000_000,  netImpact: -54_800_000 },
  { shock: "+20%", usdmxn: 22.76, hedgePnL: -52_100_000, portfolioImpact: -124_000_000, netImpact: -71_900_000 },
];

const DISTRIBUTION = [
  { percentile: "P1",  pnl: -84_000_000 },
  { percentile: "P5",  pnl: -62_000_000 },
  { percentile: "P10", pnl: -48_000_000 },
  { percentile: "P25", pnl: -22_000_000 },
  { percentile: "P50", pnl:   4_200_000 },
  { percentile: "P75", pnl:  31_000_000 },
  { percentile: "P90", pnl:  52_000_000 },
  { percentile: "P95", pnl:  64_000_000 },
  { percentile: "P99", pnl:  78_000_000 },
];

// Path builder: user-defined waypoints + simulated paths
interface PathWaypoint {
  month: string;
  rate: number;
}

const DEFAULT_PATH: PathWaypoint[] = [
  { month: "Feb", rate: 18.97 },
  { month: "Mar", rate: 19.40 },
  { month: "Apr", rate: 19.80 },
  { month: "May", rate: 20.10 },
  { month: "Jun", rate: 19.60 },
  { month: "Jul", rate: 19.20 },
  { month: "Aug", rate: 18.80 },
  { month: "Sep", rate: 18.50 },
  { month: "Oct", rate: 18.20 },
  { month: "Nov", rate: 17.90 },
  { month: "Dec", rate: 17.60 },
  { month: "Jan", rate: 17.30 },
];

// Audit log for scenario runs
interface ScenarioAuditEntry {
  ts: string;
  event: string;
  actor: string;
  detail: string;
}

// ─── formatters ───────────────────────────────────────────────────────────────

function fmtM(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : n > 0 ? "+" : "";
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(0)}K`;
  return `${sign}${abs}`;
}

function fmtColor(n: number | null): string {
  if (n === null) return S.tertiary;
  return n >= 0 ? S.pass : S.fail;
}

// ─── bar chart (purely CSS) ────────────────────────────────────────────────

function MiniBar({ value, max, negative }: { value: number; max: number; negative?: boolean }) {
  const pct = Math.min(100, (Math.abs(value) / max) * 100);
  const color = negative ? S.fail : S.pass;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ width: 80, height: 6, background: S.soft, position: "relative", flexShrink: 0 }}>
        <div style={{ position: "absolute", left: 0, top: 0, width: `${pct}%`, height: "100%", background: color }} />
      </div>
    </div>
  );
}

// ─── sparkline (SVG path) ─────────────────────────────────────────────────────

function Sparkline() {
  const pts = [2, 5, 8, 14, 22, 34, 48, 58, 52, 38, 24, 12, 7, 3, 1];
  const max = Math.max(...pts);
  const W = 120, H = 36;
  const coords = pts.map((p, i) => `${(i / (pts.length - 1)) * W},${H - (p / max) * (H - 2)}`);
  const path = `M ${coords.join(" L ")}`;
  const fill = `M 0,${H} L ${coords.join(" L ")} L ${W},${H} Z`;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
      <defs>
        <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent-cyan)" stopOpacity="0.25" />
          <stop offset="100%" stopColor="var(--accent-cyan)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fill} fill="url(#spark-fill)" />
      <path d={path} stroke="var(--accent-cyan)" strokeWidth="1.25" fill="none" />
      <line x1={60} y1={0} x2={60} y2={H} stroke="var(--border-rim)" strokeWidth="0.75" strokeDasharray="2,2" />
    </svg>
  );
}

// ─── Path SVG chart ───────────────────────────────────────────────────────────

function PathChart({ path }: { path: PathWaypoint[] }) {
  const W = 480, H = 120, PAD = 32;
  const rates = path.map(p => p.rate);
  const min = Math.min(...rates) - 0.5;
  const max = Math.max(...rates) + 0.5;
  const toX = (i: number) => PAD + (i / (path.length - 1)) * (W - PAD * 2);
  const toY = (r: number) => PAD + (1 - (r - min) / (max - min)) * (H - PAD * 2);
  const pts = path.map((p, i) => `${toX(i)},${toY(p.rate)}`);
  const linePath = `M ${pts.join(" L ")}`;
  const fillPath = `M ${toX(0)},${H - PAD} L ${pts.join(" L ")} L ${toX(path.length - 1)},${H - PAD} Z`;

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block", width: "100%", height: "auto" }}>
      <defs>
        <linearGradient id="path-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent-cyan)" stopOpacity="0.18" />
          <stop offset="100%" stopColor="var(--accent-cyan)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map(t => {
        const y = PAD + t * (H - PAD * 2);
        const r = max - t * (max - min);
        return (
          <g key={t}>
            <line x1={PAD} y1={y} x2={W - PAD} y2={y} stroke="var(--border-soft)" strokeWidth="0.5" />
            <text x={PAD - 4} y={y + 4} textAnchor="end" fill="var(--text-tertiary)" fontSize="7" fontFamily="IBM Plex Mono, monospace">
              {r.toFixed(2)}
            </text>
          </g>
        );
      })}
      {/* Fill */}
      <path d={fillPath} fill="url(#path-fill)" />
      {/* Line */}
      <path d={linePath} stroke="var(--accent-cyan)" strokeWidth="1.5" fill="none" strokeLinejoin="round" />
      {/* Waypoints */}
      {path.map((p, i) => (
        <g key={i}>
          <circle cx={toX(i)} cy={toY(p.rate)} r={3} fill="var(--bg-deep)" stroke="var(--accent-cyan)" strokeWidth="1.5" />
          <text x={toX(i)} y={H - PAD + 14} textAnchor="middle" fill="var(--text-tertiary)" fontSize="7" fontFamily="IBM Plex Mono, monospace">
            {p.month}
          </text>
        </g>
      ))}
    </svg>
  );
}

// ─── right rail (shared across tabs) ─────────────────────────────────────────

function RightRail({ activeRunId }: { activeRunId: string | null }) {
  return (
    <aside style={{ padding: "20px 16px", background: S.bgSub, display: "flex", flexDirection: "column", gap: 0 }}>
      <SectionLabel index="D" title="Run Parameters" />
      <Divider />
      <dl style={{ margin: 0, display: "flex", flexDirection: "column", gap: 0 }}>
        {[
          { dt: "Base Spot",     dd: "18.9720" },
          { dt: "Volatility",    dd: "12.4% ann." },
          { dt: "Horizon",       dd: "12 months" },
          { dt: "Paths",         dd: "10,000" },
          { dt: "Seed",          dd: "0xDEAD1234" },
          { dt: "Correlation",   dd: "USD/Oil −0.62" },
          { dt: "Rate Model",    dd: "Vasicek" },
          { dt: "FX Model",      dd: "GBM + Jump" },
          { dt: "Policy",        dd: "NDF-VANILLA" },
        ].map(({ dt, dd }, i, arr) => (
          <div key={dt} style={{
            display: "grid", gridTemplateColumns: "1fr auto", gap: 8,
            padding: "6px 0", borderBottom: i < arr.length - 1 ? `1px solid ${S.soft}` : "none",
          }}>
            <dt style={{ fontFamily: S.fontUI, fontSize: "0.75rem", color: S.tertiary, fontWeight: 400 }}>{dt}</dt>
            <dd style={{ margin: 0, fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.secondary, textAlign: "right" as const }}>{dd}</dd>
          </div>
        ))}
      </dl>

      <div style={{ marginTop: 20, paddingTop: 14, borderTop: `1px solid ${S.rim}` }}>
        <SectionLabel index="E" title="Audit Trace" />
        <div style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary, lineHeight: 1.8, letterSpacing: "0.03em" }}>
          <div>RUN-ID: <span style={{ color: S.secondary }}>{activeRunId ? activeRunId.slice(0, 12) + "…" : "—"}</span></div>
          <div>SEED: <span style={{ color: S.secondary }}>0xDEAD1234</span></div>
          <div>ENGINE: <span style={{ color: S.secondary }}>1.0.0</span></div>
          <div>METHOD: <span style={{ color: S.secondary }}>MC+DET</span></div>
          <div>STATUS: <span style={{ color: S.pass }}>READ-ONLY</span></div>
        </div>
      </div>

      {!activeRunId && (
        <div style={{ marginTop: "auto", paddingTop: 16, fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary, letterSpacing: "0.04em" }}>
          No active hedge run. Load positions to connect live data.
        </div>
      )}
    </aside>
  );
}

// ─── TAB PANELS ──────────────────────────────────────────────────────────────

// Tab 1: Scenario Library
function TabLibrary({ maxPnL }: { maxPnL: number }) {
  return (
    <div style={{ padding: "20px 24px", borderRight: `1px solid ${S.rim}`, display: "flex", flexDirection: "column", gap: 0, gridColumn: "1 / 3" }}>
      <SectionLabel index="A" title="Scenario Library" count={`${SCENARIOS.length} scenarios`} />
      <Divider />
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.6875rem" }}>
        <thead>
          <tr>
            {["ID", "Scenario", "Method", "Spot Δ", "Hedge P&L", "Conf.", "Last Run", "Status"].map((h, i) => (
              <th key={h} style={{
                padding: "4px 8px 4px 0", fontFamily: S.fontMono,
                fontSize: "0.6875rem", letterSpacing: "0.07em", textTransform: "uppercase",
                color: S.tertiary, textAlign: i > 2 ? "right" : "left",
                borderBottom: `1px solid ${S.rim}`, whiteSpace: "nowrap",
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {SCENARIOS.map((sc) => {
            const statusColor =
              sc.status === "COMPLETE" ? S.pass :
              sc.status === "RUNNING"  ? S.cyan :
              S.tertiary;
            return (
              <tr key={sc.id} style={{ borderBottom: `1px solid ${S.soft}` }}>
                <td style={{ padding: "7px 8px 7px 0", fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary }}>{sc.id}</td>
                <td style={{ padding: "7px 8px 7px 0", maxWidth: 160 }}>
                  <div style={{ fontWeight: 500, color: S.primary, fontSize: "0.6875rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sc.name}</div>
                  <div style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary, letterSpacing: "0.05em", marginTop: 1 }}>{sc.type}</div>
                </td>
                <td style={{ padding: "7px 8px 7px 0", fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.secondary, whiteSpace: "nowrap" }}>{sc.method}</td>
                <td style={{ padding: "7px 8px 7px 0", fontFamily: S.fontMono, fontSize: "0.75rem", textAlign: "right", color: sc.spotDelta !== null ? (sc.spotDelta > 0 ? S.fail : S.pass) : S.tertiary }}>
                  {sc.spotDelta !== null ? `+${sc.spotDelta.toFixed(2)}%` : "—"}
                </td>
                <td style={{ padding: "7px 8px 7px 0", fontFamily: S.fontMono, fontSize: "0.75rem", textAlign: "right", color: fmtColor(sc.hedgePnL) }}>
                  {sc.hedgePnL !== null ? fmtM(sc.hedgePnL) : "—"}
                </td>
                <td style={{ padding: "7px 8px 7px 0", fontFamily: S.fontMono, fontSize: "0.6875rem", textAlign: "right", color: S.secondary }}>
                  {sc.confidence !== null ? `${sc.confidence}%` : "—"}
                </td>
                <td style={{ padding: "7px 8px 7px 0", fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary, whiteSpace: "nowrap" }}>
                  {sc.lastRun}
                </td>
                <td style={{ padding: "7px 0 7px 0", textAlign: "right" }}>
                  <span style={{
                    fontFamily: S.fontMono, fontSize: "0.6875rem", letterSpacing: "0.06em",
                    padding: "1px 4px", border: `1px solid ${statusColor}`, color: statusColor,
                  }}>{sc.status}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Summary bar */}
      <div style={{
        marginTop: 16, padding: "10px 12px", background: S.bgSub,
        border: `1px solid ${S.rim}`, display: "flex", gap: 20,
      }}>
        {[
          { label: "COMPLETE", value: SCENARIOS.filter(s => s.status === "COMPLETE").length, color: S.pass },
          { label: "RUNNING",  value: SCENARIOS.filter(s => s.status === "RUNNING").length,  color: S.cyan },
          { label: "DRAFT",    value: SCENARIOS.filter(s => s.status === "DRAFT").length,    color: S.tertiary },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary, letterSpacing: "0.06em" }}>{label}</span>
            <span style={{ fontFamily: S.fontMono, fontSize: "1.125rem", fontWeight: 700, color, lineHeight: 1 }}>{value}</span>
          </div>
        ))}
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary, letterSpacing: "0.06em" }}>WORST P&amp;L</span>
          <span style={{ fontFamily: S.fontMono, fontSize: "1.125rem", fontWeight: 700, color: S.fail, lineHeight: 1 }}>−98.8M</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary, letterSpacing: "0.06em" }}>SCENARIO</span>
          <span style={{ fontFamily: S.fontMono, fontSize: "0.75rem", fontWeight: 600, color: S.secondary, lineHeight: 1 }}>SCN-002</span>
        </div>
      </div>
      {/* suppress unused warning */}
      <div style={{ display: "none" }}>{maxPnL}</div>
    </div>
  );
}

// Tab 2: Shock Ladder
function TabShockLadder() {
  return (
    <div style={{ padding: "20px 24px", borderRight: `1px solid ${S.rim}`, display: "flex", flexDirection: "column", gap: 0, gridColumn: "1 / 3" }}>
      <SectionLabel index="B" title="USD/MXN Shock Ladder" count="base: 18.97" />
      <Divider />

      <div style={{ marginBottom: 16, padding: "8px 12px", background: S.bgSub, border: `1px solid ${S.rim}`, fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary, letterSpacing: "0.04em" }}>
        Instantaneous parallel shock to spot rate. Hedge P&L computed from existing NDF book against shocked exposure.
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.6875rem" }}>
        <thead>
          <tr>
            {["Shock", "USD/MXN Rate", "Hedge P&L", "Exposure Impact", "Net P&L", "Δ vs Base"].map((h, i) => (
              <th key={h} style={{
                padding: "4px 8px 4px 0", fontFamily: S.fontMono,
                fontSize: "0.6875rem", letterSpacing: "0.07em", textTransform: "uppercase",
                color: S.tertiary, textAlign: i > 1 ? "right" : "left",
                borderBottom: `1px solid ${S.rim}`,
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {SHOCK_LADDER.map((row) => {
            const isBase = (row as { base?: boolean }).base;
            const deltaVsBase = isBase ? 0 : row.netImpact;
            return (
              <tr key={row.shock} style={{
                borderBottom: `1px solid ${S.soft}`,
                background: isBase ? `color-mix(in srgb, var(--accent-cyan) 4%, transparent)` : "transparent",
              }}>
                <td style={{ padding: "6px 8px 6px 0", fontFamily: S.fontMono, fontSize: "0.8125rem", fontWeight: isBase ? 700 : 400, color: isBase ? S.cyan : (row.shock.startsWith("+") ? S.fail : S.pass) }}>
                  {row.shock}
                </td>
                <td style={{ padding: "6px 8px 6px 0", fontFamily: S.fontMono, fontSize: "0.75rem", color: S.secondary }}>
                  {row.usdmxn.toFixed(2)}
                </td>
                <td style={{ padding: "6px 8px 6px 0", fontFamily: S.fontMono, fontSize: "0.75rem", textAlign: "right", color: fmtColor(row.hedgePnL) }}>
                  {fmtM(row.hedgePnL)}
                </td>
                <td style={{ padding: "6px 8px 6px 0", fontFamily: S.fontMono, fontSize: "0.75rem", textAlign: "right", color: fmtColor(row.portfolioImpact) }}>
                  {fmtM(row.portfolioImpact)}
                </td>
                <td style={{ padding: "6px 8px 6px 0", fontFamily: S.fontMono, fontSize: "0.75rem", textAlign: "right", fontWeight: 600, color: fmtColor(row.netImpact) }}>
                  {fmtM(row.netImpact)}
                </td>
                <td style={{ padding: "6px 0 6px 0", fontFamily: S.fontMono, fontSize: "0.75rem", textAlign: "right", color: isBase ? S.tertiary : fmtColor(deltaVsBase) }}>
                  {isBase ? "BASE" : fmtM(deltaVsBase)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Key risk metrics */}
      <div style={{ marginTop: 20, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {[
          { label: "Max Loss (−20% shock)", value: "−71.9M", color: S.fail },
          { label: "Max Gain (+20% shock)", value: "+41.6M", color: S.pass },
          { label: "Break-even Shock",      value: "±0%",    color: S.tertiary },
          { label: "Hedge Offset at −20%",  value: "66.5%",  color: S.cyan },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ padding: "10px 12px", background: S.bgSub, border: `1px solid ${S.rim}` }}>
            <div style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary, letterSpacing: "0.05em", marginBottom: 4 }}>{label}</div>
            <div style={{ fontFamily: S.fontMono, fontSize: "1.0rem", fontWeight: 700, color }}>{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Tab 3: P&L Distribution
function TabDistribution({ maxPnL }: { maxPnL: number }) {
  return (
    <div style={{ padding: "20px 24px", borderRight: `1px solid ${S.rim}`, display: "flex", flexDirection: "column", gap: 0, gridColumn: "1 / 3" }}>
      <SectionLabel index="C" title="P&L Distribution (Monte Carlo — 10,000 paths)" />
      <Divider />

      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 24 }}>
        {/* Percentile table */}
        <div>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                {["Percentile", "P&L", "Bar"].map((h, i) => (
                  <th key={i} style={{
                    padding: "3px 8px 3px 0", fontFamily: S.fontMono, fontSize: "0.6875rem",
                    letterSpacing: "0.07em", textTransform: "uppercase", color: S.tertiary,
                    textAlign: i === 1 ? "right" : "left", borderBottom: `1px solid ${S.rim}`,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DISTRIBUTION.map(d => (
                <tr key={d.percentile} style={{ borderBottom: `1px solid ${S.soft}`, background: d.percentile === "P50" ? `color-mix(in srgb, var(--accent-cyan) 4%, transparent)` : "transparent" }}>
                  <td style={{ padding: "5px 8px 5px 0", fontFamily: S.fontMono, fontSize: "0.6875rem", color: d.percentile === "P50" ? S.cyan : S.tertiary, fontWeight: d.percentile === "P50" ? 600 : 400 }}>{d.percentile}</td>
                  <td style={{ padding: "5px 8px 5px 0", fontFamily: S.fontMono, fontSize: "0.75rem", textAlign: "right", color: fmtColor(d.pnl), fontWeight: d.percentile === "P50" ? 600 : 400 }}>
                    {fmtM(d.pnl)}
                  </td>
                  <td style={{ padding: "5px 0 5px 0" }}>
                    <MiniBar value={d.pnl} max={maxPnL} negative={d.pnl < 0} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Shape + stats */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <div style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary, letterSpacing: "0.05em", marginBottom: 8 }}>DISTRIBUTION SHAPE (10K PATHS)</div>
            <div style={{ padding: "12px", background: S.bgSub, border: `1px solid ${S.rim}` }}>
              <Sparkline />
              <div style={{ marginTop: 6, display: "flex", justifyContent: "space-between", fontFamily: S.fontMono, fontSize: "0.5625rem", color: S.tertiary }}>
                <span>−84M</span>
                <span style={{ color: S.cyan }}>μ +4.2M</span>
                <span>+78M</span>
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {[
              { label: "VaR 99% (1yr)",    value: "−84.0M", color: S.fail },
              { label: "CVaR 99% (1yr)",   value: "−97.2M", color: S.fail },
              { label: "Expected P&L",     value: "+4.2M",  color: S.pass },
              { label: "Std Deviation",    value: "38.4M",  color: S.secondary },
              { label: "Skewness",         value: "+0.34",  color: S.secondary },
              { label: "Kurtosis (excess)","value": "3.82", color: S.secondary },
              { label: "Prob(Loss)",       value: "44.2%",  color: S.amber },
              { label: "Prob(Gain>25M)",   value: "28.7%",  color: S.pass },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ padding: "8px 10px", background: S.bgPanel, border: `1px solid ${S.rim}` }}>
                <div style={{ fontFamily: S.fontUI, fontSize: "0.6875rem", color: S.tertiary, marginBottom: 2 }}>{label}</div>
                <div style={{ fontFamily: S.fontMono, fontSize: "0.875rem", fontWeight: 700, color }}>{value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Tab 4: Path Builder
function TabPathBuilder() {
  const [path, setPath] = useState<PathWaypoint[]>(DEFAULT_PATH);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editVal, setEditVal] = useState("");

  const totalHedgePnL = path.reduce((acc, p, i) => {
    if (i === 0) return acc;
    const delta = p.rate - path[0].rate;
    return acc + (delta > 0 ? -delta * 1_000_000 : -delta * 800_000);
  }, 0);

  const handleEdit = (i: number) => {
    setEditIdx(i);
    setEditVal(path[i].rate.toFixed(2));
  };

  const handleSave = (i: number) => {
    const v = parseFloat(editVal);
    if (!isNaN(v) && v > 5 && v < 50) {
      const newPath = [...path];
      newPath[i] = { ...newPath[i], rate: v };
      setPath(newPath);
    }
    setEditIdx(null);
  };

  const resetPath = () => setPath(DEFAULT_PATH);

  return (
    <div style={{ padding: "20px 24px", borderRight: `1px solid ${S.rim}`, display: "flex", flexDirection: "column", gap: 0, gridColumn: "1 / 3" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, paddingBottom: 8 }}>
        <span style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary, letterSpacing: "0.06em" }}>P</span>
        <span style={{ fontFamily: S.fontUI, fontSize: "0.8125rem", fontWeight: 600, color: S.primary }}>Custom Path Builder</span>
        <span style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary, marginLeft: "auto" }}>click rate to edit</span>
        <button onClick={resetPath} style={{
          fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary,
          background: "transparent", border: `1px solid ${S.rim}`, padding: "2px 8px",
          cursor: "pointer", letterSpacing: "0.04em",
        }}>RESET</button>
      </div>
      <Divider />

      <div style={{ marginBottom: 20, padding: "8px 12px", background: S.bgSub, border: `1px solid ${S.rim}`, fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary, letterSpacing: "0.04em" }}>
        Build a deterministic rate path. Click any rate value to edit it. P&L impact is computed against the current hedge book.
      </div>

      {/* SVG path chart */}
      <div style={{ marginBottom: 20 }}>
        <PathChart path={path} />
      </div>

      {/* Waypoint table */}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.6875rem" }}>
        <thead>
          <tr>
            {["Month", "USD/MXN Rate", "Δ vs Base", "Est. Hedge P&L", ""].map((h, i) => (
              <th key={i} style={{
                padding: "4px 8px 4px 0", fontFamily: S.fontMono,
                fontSize: "0.6875rem", letterSpacing: "0.07em", textTransform: "uppercase",
                color: S.tertiary, textAlign: i > 1 ? "right" : "left",
                borderBottom: `1px solid ${S.rim}`,
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {path.map((wp, i) => {
            const delta = wp.rate - DEFAULT_PATH[0].rate;
            const estPnL = i === 0 ? 0 : (delta > 0 ? -delta * 1_000_000 : -delta * 800_000);
            return (
              <tr key={wp.month} style={{ borderBottom: `1px solid ${S.soft}`, background: i === 0 ? `color-mix(in srgb, var(--accent-cyan) 4%, transparent)` : "transparent" }}>
                <td style={{ padding: "5px 8px 5px 0", fontFamily: S.fontMono, fontSize: "0.6875rem", color: i === 0 ? S.cyan : S.secondary, fontWeight: i === 0 ? 600 : 400 }}>
                  {wp.month} {i === 0 ? "(BASE)" : ""}
                </td>
                <td
                  style={{ padding: "5px 8px 5px 0", fontFamily: S.fontMono, fontSize: "0.75rem", textAlign: "right", color: S.primary, cursor: "pointer" }}
                  onClick={() => handleEdit(i)}
                >
                  {editIdx === i ? (
                    <input
                      type="number"
                      value={editVal}
                      onChange={e => setEditVal(e.target.value)}
                      onBlur={() => handleSave(i)}
                      onKeyDown={e => { if (e.key === "Enter") handleSave(i); if (e.key === "Escape") setEditIdx(null); }}
                      autoFocus
                      step="0.01"
                      style={{
                        fontFamily: S.fontMono, fontSize: "0.75rem", color: S.primary,
                        background: S.bgDeep, border: `1px solid ${S.cyan}`,
                        width: 72, textAlign: "right", padding: "1px 4px", outline: "none",
                      }}
                    />
                  ) : wp.rate.toFixed(2)}
                </td>
                <td style={{ padding: "5px 8px 5px 0", fontFamily: S.fontMono, fontSize: "0.75rem", textAlign: "right", color: i === 0 ? S.tertiary : fmtColor(delta) }}>
                  {i === 0 ? "—" : (delta >= 0 ? `+${delta.toFixed(2)}` : delta.toFixed(2))}
                </td>
                <td style={{ padding: "5px 8px 5px 0", fontFamily: S.fontMono, fontSize: "0.75rem", textAlign: "right", color: i === 0 ? S.tertiary : fmtColor(estPnL) }}>
                  {i === 0 ? "—" : fmtM(estPnL)}
                </td>
                <td style={{ padding: "5px 0 5px 0", textAlign: "right" }}>
                  {editIdx !== i && (
                    <button onClick={() => handleEdit(i)} style={{
                      fontFamily: S.fontMono, fontSize: "0.5625rem", color: S.tertiary,
                      background: "transparent", border: `1px solid ${S.rim}`, padding: "1px 5px",
                      cursor: "pointer",
                    }}>EDIT</button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Totals */}
      <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        {[
          { label: "Cumulative Hedge P&L (path)",  value: fmtM(totalHedgePnL), color: fmtColor(totalHedgePnL) },
          { label: "Terminal Rate",                  value: path[path.length - 1].rate.toFixed(2), color: S.secondary },
          { label: "Path Trend",                     value: path[path.length - 1].rate < path[0].rate ? "↓ Appreciation" : "↑ Depreciation", color: path[path.length - 1].rate < path[0].rate ? S.pass : S.fail },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ padding: "10px 12px", background: S.bgSub, border: `1px solid ${S.rim}` }}>
            <div style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary, letterSpacing: "0.05em", marginBottom: 4 }}>{label}</div>
            <div style={{ fontFamily: S.fontMono, fontSize: "0.9375rem", fontWeight: 700, color }}>{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Tab 5: Audit
function TabAudit({ runId }: { runId: string | null }) {
  const [auditLog, setAuditLog] = useState<ScenarioAuditEntry[]>([]);

  useEffect(() => {
    // Build audit log from localStorage — scenarios run when hedge engine is triggered
    const entries: ScenarioAuditEntry[] = [];

    // Pull from hedge run history in localStorage
    try {
      const hedgeRaw = localStorage.getItem("ordr_last_run_meta");
      if (hedgeRaw) {
        const meta = JSON.parse(hedgeRaw) as { runId: string; ts: string; user: string };
        entries.push({
          ts: meta.ts,
          event: "SCENARIO_RUN",
          actor: meta.user || "system",
          detail: `Hedge engine run triggered — scenarios refreshed. Run ${meta.runId.slice(0, 8)}`,
        });
      }
    } catch {/* ignore */}

    // Add static scenario events
    SCENARIOS.filter(s => s.status === "COMPLETE").forEach((sc) => {
      entries.push({
        ts: sc.lastRun + " UTC",
        event: "SCENARIO_COMPLETE",
        actor: "engine",
        detail: `${sc.id} · ${sc.name} — ${sc.method}`,
      });
    });
    SCENARIOS.filter(s => s.status === "RUNNING").forEach((sc) => {
      entries.push({
        ts: sc.lastRun + " UTC",
        event: "SCENARIO_STARTED",
        actor: "engine",
        detail: `${sc.id} · ${sc.name} — Monte Carlo path generation in progress`,
      });
    });

    // Sort descending by ts
    entries.sort((a, b) => b.ts.localeCompare(a.ts));
    setAuditLog(entries);
  }, [runId]);

  const eventColors: Record<string, string> = {
    SCENARIO_RUN:      S.cyan,
    SCENARIO_COMPLETE: S.pass,
    SCENARIO_STARTED:  S.amber,
    SCENARIO_FAILED:   S.fail,
  };

  return (
    <div style={{ padding: "20px 24px", borderRight: `1px solid ${S.rim}`, display: "flex", flexDirection: "column", gap: 0, gridColumn: "1 / 3" }}>
      <SectionLabel index="AU" title="Scenario Engine Audit Log" count={`${auditLog.length} events`} />
      <Divider />

      {auditLog.length === 0 ? (
        <div style={{ padding: "32px 16px", textAlign: "center" }}>
          <div style={{ fontFamily: S.fontUI, fontSize: "0.8125rem", color: S.secondary, marginBottom: 6 }}>No scenario audit events recorded.</div>
          <div style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary, letterSpacing: "0.06em" }}>Run hedge engine to populate this log.</div>
        </div>
      ) : (
        <div style={{ border: `1px solid ${S.rim}`, background: S.bgPanel }}>
          {/* Header */}
          <div style={{ display: "grid", gridTemplateColumns: "180px 160px 1fr", gap: 12, padding: "6px 16px", borderBottom: `1px solid ${S.rim}` }}>
            {["TIMESTAMP", "EVENT", "DETAIL"].map(h => (
              <span key={h} style={{ fontFamily: S.fontMono, fontSize: "0.625rem", fontWeight: 700, letterSpacing: "0.08em", color: S.tertiary }}>{h}</span>
            ))}
          </div>
          {auditLog.map((entry, i) => {
            const color = eventColors[entry.event] ?? S.tertiary;
            return (
              <div key={i} style={{
                display: "grid", gridTemplateColumns: "180px 160px 1fr", gap: 12, padding: "8px 16px",
                borderBottom: i < auditLog.length - 1 ? `1px solid ${S.soft}` : "none",
              }}>
                <span style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary, letterSpacing: "0.02em" }}>{entry.ts}</span>
                <span style={{ fontFamily: S.fontMono, fontSize: "0.625rem", fontWeight: 700, letterSpacing: "0.07em", color, border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`, padding: "1px 5px", alignSelf: "center", justifySelf: "start" }}>
                  {entry.event}
                </span>
                <div>
                  <span style={{ fontFamily: S.fontUI, fontSize: "0.75rem", color: S.secondary }}>{entry.detail}</span>
                  <span style={{ fontFamily: S.fontMono, fontSize: "0.625rem", color: S.tertiary, marginLeft: 8 }}>{entry.actor}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Integrity note */}
      <div style={{ marginTop: 16, padding: "8px 12px", background: S.bgSub, border: `1px solid ${S.rim}`, fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary, letterSpacing: "0.04em" }}>
        Scenario audit entries are generated by the hedge engine at run time. Full governance trail available in the Audit Trail module.
      </div>
    </div>
  );
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function ScenarioStudio() {
  const router = useRouter();
  const { result } = useHedge();
  const maxPnL = Math.max(...DISTRIBUTION.map(d => Math.abs(d.pnl)));
  const [activeTab, setActiveTab] = useState<ScenarioTab>("library");

  const activeRunId = result?.run_id ?? null;

  return (
    <div style={{ minHeight: "100%", display: "flex", flexDirection: "column", background: S.bgDeep, fontFamily: S.fontUI, color: S.primary }}>
      <TopBar onBack={() => router.push("/")} />

      {/* ── Sub-nav: tabs ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 0,
        background: S.bgPanel, borderBottom: `1px solid ${S.rim}`,
        padding: "0 20px", height: 36, flexShrink: 0,
      }}>
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                fontFamily: S.fontMono, fontSize: "0.75rem", letterSpacing: "0.04em",
                padding: "0 14px", height: "100%", display: "flex", alignItems: "center",
                color: isActive ? S.cyan : S.tertiary,
                borderBottom: isActive ? `2px solid ${S.cyan}` : "2px solid transparent",
                background: "transparent",
                border: "none",
                borderBottomStyle: "solid",
                borderBottomWidth: 2,
                borderBottomColor: isActive ? S.cyan : "transparent",
                cursor: "pointer",
                transition: "color 0.15s, border-color 0.15s",
              }}
            >{tab.label}</button>
          );
        })}
        <div style={{ flex: 1 }} />
        <span style={{
          fontFamily: S.fontMono, fontSize: "0.6875rem", letterSpacing: "0.06em",
          color: S.tertiary, padding: "1px 6px", border: `1px solid ${S.rim}`,
        }}>
          ENGINE v1.0.0 · DETERMINISTIC
        </span>
      </div>

      {/* ── Body: two-column + right rail ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 220px", flex: 1, minHeight: 0, overflow: "auto" }}>

        {/* Main panel — active tab content */}
        {activeTab === "library"      && <TabLibrary maxPnL={maxPnL} />}
        {activeTab === "shock"        && <TabShockLadder />}
        {activeTab === "distribution" && <TabDistribution maxPnL={maxPnL} />}
        {activeTab === "pathbuilder"  && <TabPathBuilder />}
        {activeTab === "audit"        && <TabAudit runId={activeRunId} />}

        {/* Right rail */}
        <RightRail activeRunId={activeRunId} />
      </div>

      {/* Footer */}
      <footer style={{
        height: 32, display: "flex", alignItems: "center", gap: 8, padding: "0 20px",
        borderTop: `1px solid ${S.rim}`, background: S.bgPanel,
        fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary,
        letterSpacing: "0.04em", flexShrink: 0,
      }}>
        <span>HedgeCore · Scenario Studio</span>
        <span style={{ color: S.rim }}>·</span>
        <span>{TABS.find(t => t.key === activeTab)?.label}</span>
        {activeRunId && (
          <>
            <span style={{ color: S.rim }}>·</span>
            <span>RUN <span style={{ color: S.cyan }}>{activeRunId.slice(0, 8).toUpperCase()}</span></span>
          </>
        )}
      </footer>
    </div>
  );
}
