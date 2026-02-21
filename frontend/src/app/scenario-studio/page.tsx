"use client";

import { useRouter } from "next/navigation";

const RENDER_TS = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";

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

// ─── primitives ──────────────────────────────────────────────────────────────

function TopBar({ onBack }: { onBack: () => void }) {
  return (
    <header style={{
      display: "flex", alignItems: "center", gap: 12, height: 44,
      padding: "0 20px", background: S.bgPanel, borderBottom: `1px solid ${S.rim}`,
      flexShrink: 0,
    }}>
      <button onClick={onBack} style={{
        fontFamily: S.fontMono, fontSize: "0.5625rem", color: S.tertiary,
        background: "transparent", border: `1px solid ${S.rim}`,
        padding: "2px 8px", cursor: "pointer", letterSpacing: "0.04em",
      }}>← Home</button>
      <span style={{ color: S.rim, userSelect: "none" }}>|</span>
      <span style={{ fontFamily: S.fontUI, fontSize: "0.8125rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: S.primary }}>
        Scenario Studio
      </span>
      <span style={{
        fontFamily: S.fontMono, fontSize: "0.4375rem", letterSpacing: "0.08em",
        color: S.secondary, padding: "1px 5px", border: `1px solid ${S.rim}`,
      }}>SIMULATION · STRESS</span>
      <div style={{ flex: 1 }} />
      <span style={{ fontFamily: S.fontMono, fontSize: "0.5rem", color: S.tertiary, letterSpacing: "0.04em" }}>
        AS OF {RENDER_TS}
      </span>
    </header>
  );
}

function SectionLabel({ index, title, count }: { index: string; title: string; count?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 10, paddingBottom: 8 }}>
      <span style={{ fontFamily: S.fontMono, fontSize: "0.5rem", color: S.tertiary, letterSpacing: "0.06em" }}>{index}</span>
      <span style={{ fontFamily: S.fontUI, fontSize: "0.8125rem", fontWeight: 600, color: S.primary }}>{title}</span>
      {count && <span style={{ fontFamily: S.fontMono, fontSize: "0.5rem", color: S.tertiary, marginLeft: "auto" }}>{count}</span>}
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
  // Simulated MC distribution shape
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
      {/* median marker */}
      <line x1={60} y1={0} x2={60} y2={H} stroke="var(--border-rim)" strokeWidth="0.75" strokeDasharray="2,2" />
    </svg>
  );
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function ScenarioStudio() {
  const router = useRouter();
  const maxPnL = Math.max(...DISTRIBUTION.map(d => Math.abs(d.pnl)));

  return (
    <div style={{ minHeight: "100%", display: "flex", flexDirection: "column", background: S.bgDeep, fontFamily: S.fontUI, color: S.primary }}>
      <TopBar onBack={() => router.push("/")} />

      {/* ── Sub-nav: tabs ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 0,
        background: S.bgPanel, borderBottom: `1px solid ${S.rim}`,
        padding: "0 20px", height: 36, flexShrink: 0,
      }}>
        {["Scenario Library", "Shock Ladder", "P&L Distribution", "Path Builder", "Audit"].map((tab, i) => (
          <div key={tab} style={{
            fontFamily: S.fontMono, fontSize: "0.5625rem", letterSpacing: "0.04em",
            padding: "0 14px", height: "100%", display: "flex", alignItems: "center",
            color: i === 0 ? S.cyan : S.tertiary,
            borderBottom: i === 0 ? `2px solid ${S.cyan}` : "2px solid transparent",
            cursor: "default",
          }}>{tab}</div>
        ))}
        <div style={{ flex: 1 }} />
        <span style={{
          fontFamily: S.fontMono, fontSize: "0.4375rem", letterSpacing: "0.06em",
          color: S.tertiary, padding: "1px 6px", border: `1px solid ${S.rim}`,
        }}>
          ENGINE v1.0.0 · DETERMINISTIC
        </span>
      </div>

      {/* ── Body: three-column layout ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 220px", flex: 1, minHeight: 0, overflow: "auto" }}>

        {/* COL 1: Scenario Library */}
        <div style={{ padding: "20px 24px", borderRight: `1px solid ${S.rim}`, display: "flex", flexDirection: "column", gap: 0 }}>
          <SectionLabel index="A" title="Scenario Library" count={`${SCENARIOS.length} scenarios`} />
          <Divider />
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.6875rem" }}>
            <thead>
              <tr>
                {["ID", "Scenario", "Method", "Spot Δ", "Hedge P&L", "Conf.", "Status"].map((h, i) => (
                  <th key={h} style={{
                    padding: "4px 8px 4px 0", fontFamily: S.fontMono,
                    fontSize: "0.4375rem", letterSpacing: "0.07em", textTransform: "uppercase",
                    color: S.tertiary, textAlign: i > 2 ? "right" : "left",
                    borderBottom: `1px solid ${S.rim}`, whiteSpace: "nowrap",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SCENARIOS.map((sc, i) => {
                const statusColor =
                  sc.status === "COMPLETE" ? S.pass :
                  sc.status === "RUNNING"  ? S.cyan :
                  S.tertiary;
                return (
                  <tr key={sc.id} style={{ borderBottom: `1px solid ${S.soft}` }}>
                    <td style={{ padding: "7px 8px 7px 0", fontFamily: S.fontMono, fontSize: "0.5rem", color: S.tertiary }}>{sc.id}</td>
                    <td style={{ padding: "7px 8px 7px 0", maxWidth: 150 }}>
                      <div style={{ fontWeight: 500, color: S.primary, fontSize: "0.6875rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sc.name}</div>
                      <div style={{ fontFamily: S.fontMono, fontSize: "0.4375rem", color: S.tertiary, letterSpacing: "0.05em", marginTop: 1 }}>{sc.type}</div>
                    </td>
                    <td style={{ padding: "7px 8px 7px 0", fontFamily: S.fontMono, fontSize: "0.5rem", color: S.secondary, whiteSpace: "nowrap" }}>{sc.method}</td>
                    <td style={{ padding: "7px 8px 7px 0", fontFamily: S.fontMono, fontSize: "0.5625rem", textAlign: "right", color: sc.spotDelta !== null ? (sc.spotDelta > 0 ? S.fail : S.pass) : S.tertiary }}>
                      {sc.spotDelta !== null ? `+${sc.spotDelta.toFixed(2)}%` : "—"}
                    </td>
                    <td style={{ padding: "7px 8px 7px 0", fontFamily: S.fontMono, fontSize: "0.5625rem", textAlign: "right", color: fmtColor(sc.hedgePnL) }}>
                      {sc.hedgePnL !== null ? fmtM(sc.hedgePnL) : "—"}
                    </td>
                    <td style={{ padding: "7px 8px 7px 0", fontFamily: S.fontMono, fontSize: "0.5rem", textAlign: "right", color: S.secondary }}>
                      {sc.confidence !== null ? `${sc.confidence}%` : "—"}
                    </td>
                    <td style={{ padding: "7px 0 7px 0", textAlign: "right" }}>
                      <span style={{
                        fontFamily: S.fontMono, fontSize: "0.4375rem", letterSpacing: "0.06em",
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
                <span style={{ fontFamily: S.fontMono, fontSize: "0.4375rem", color: S.tertiary, letterSpacing: "0.06em" }}>{label}</span>
                <span style={{ fontFamily: S.fontMono, fontSize: "1.125rem", fontWeight: 700, color, lineHeight: 1 }}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* COL 2: Shock Ladder + Distribution */}
        <div style={{ padding: "20px 24px", borderRight: `1px solid ${S.rim}`, display: "flex", flexDirection: "column", gap: 24 }}>

          {/* Shock Ladder */}
          <div>
            <SectionLabel index="B" title="USD/MXN Shock Ladder" count="base: 18.97" />
            <Divider />
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.6875rem" }}>
              <thead>
                <tr>
                  {["Shock", "Rate", "Hedge P&L", "Exp Impact", "Net Impact"].map((h, i) => (
                    <th key={h} style={{
                      padding: "4px 8px 4px 0", fontFamily: S.fontMono,
                      fontSize: "0.4375rem", letterSpacing: "0.07em", textTransform: "uppercase",
                      color: S.tertiary, textAlign: i > 1 ? "right" : "left",
                      borderBottom: `1px solid ${S.rim}`,
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SHOCK_LADDER.map((row) => {
                  const isBase = (row as { base?: boolean }).base;
                  return (
                    <tr key={row.shock} style={{
                      borderBottom: `1px solid ${S.soft}`,
                      background: isBase ? `color-mix(in srgb, var(--accent-cyan) 4%, transparent)` : "transparent",
                    }}>
                      <td style={{ padding: "5px 8px 5px 0", fontFamily: S.fontMono, fontSize: "0.5625rem", fontWeight: isBase ? 700 : 400, color: isBase ? S.cyan : (row.shock.startsWith("+") ? S.fail : S.pass) }}>
                        {row.shock}
                      </td>
                      <td style={{ padding: "5px 8px 5px 0", fontFamily: S.fontMono, fontSize: "0.5625rem", color: S.secondary }}>
                        {row.usdmxn.toFixed(2)}
                      </td>
                      <td style={{ padding: "5px 8px 5px 0", fontFamily: S.fontMono, fontSize: "0.5625rem", textAlign: "right", color: fmtColor(row.hedgePnL) }}>
                        {fmtM(row.hedgePnL)}
                      </td>
                      <td style={{ padding: "5px 8px 5px 0", fontFamily: S.fontMono, fontSize: "0.5625rem", textAlign: "right", color: fmtColor(row.portfolioImpact) }}>
                        {fmtM(row.portfolioImpact)}
                      </td>
                      <td style={{ padding: "5px 0 5px 0", fontFamily: S.fontMono, fontSize: "0.5625rem", textAlign: "right", fontWeight: 600, color: fmtColor(row.netImpact) }}>
                        {fmtM(row.netImpact)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* P&L Distribution */}
          <div>
            <SectionLabel index="C" title="P&L Distribution (Monte Carlo)" count="10,000 paths" />
            <Divider />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {/* Percentile table */}
              <table style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Pctl", "P&L", ""].map((h, i) => (
                      <th key={i} style={{
                        padding: "3px 8px 3px 0", fontFamily: S.fontMono, fontSize: "0.4375rem",
                        letterSpacing: "0.07em", textTransform: "uppercase", color: S.tertiary,
                        textAlign: i === 1 ? "right" : "left", borderBottom: `1px solid ${S.rim}`,
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {DISTRIBUTION.map(d => (
                    <tr key={d.percentile} style={{ borderBottom: `1px solid ${S.soft}` }}>
                      <td style={{ padding: "4px 8px 4px 0", fontFamily: S.fontMono, fontSize: "0.5rem", color: S.tertiary }}>{d.percentile}</td>
                      <td style={{ padding: "4px 8px 4px 0", fontFamily: S.fontMono, fontSize: "0.5625rem", textAlign: "right", color: fmtColor(d.pnl), fontWeight: d.percentile === "P50" ? 600 : 400 }}>
                        {fmtM(d.pnl)}
                      </td>
                      <td style={{ padding: "4px 0 4px 0" }}>
                        <MiniBar value={d.pnl} max={maxPnL} negative={d.pnl < 0} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {/* Shape preview */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontFamily: S.fontMono, fontSize: "0.4375rem", color: S.tertiary, letterSpacing: "0.05em" }}>DISTRIBUTION SHAPE</div>
                <div style={{ padding: "10px", background: S.bgSub, border: `1px solid ${S.rim}` }}>
                  <Sparkline />
                  <div style={{ marginTop: 6, display: "flex", justifyContent: "space-between", fontFamily: S.fontMono, fontSize: "0.4rem", color: S.tertiary }}>
                    <span>−84M</span>
                    <span style={{ color: S.cyan }}>μ +4.2M</span>
                    <span>+78M</span>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {[
                    { label: "VaR 99%",  value: "−84.0M" },
                    { label: "CVaR 99%", value: "−97.2M" },
                    { label: "Skewness", value: "+0.34" },
                    { label: "Kurtosis", value: "3.82" },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontFamily: S.fontUI, fontSize: "0.5625rem", color: S.tertiary }}>{label}</span>
                      <span style={{ fontFamily: S.fontMono, fontSize: "0.5625rem", color: S.secondary }}>{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* COL 3: Right rail */}
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
              { dt: "Dataset",       dd: "Q1-2026-DEMO" },
              { dt: "Policy",        dd: "NDF-VANILLA" },
            ].map(({ dt, dd }, i, arr) => (
              <div key={dt} style={{
                display: "grid", gridTemplateColumns: "1fr auto", gap: 8,
                padding: "6px 0", borderBottom: i < arr.length - 1 ? `1px solid ${S.soft}` : "none",
              }}>
                <dt style={{ fontFamily: S.fontUI, fontSize: "0.5625rem", color: S.tertiary, fontWeight: 400 }}>{dt}</dt>
                <dd style={{ margin: 0, fontFamily: S.fontMono, fontSize: "0.5rem", color: S.secondary, textAlign: "right" as const }}>{dd}</dd>
              </div>
            ))}
          </dl>

          <div style={{ marginTop: 20, paddingTop: 14, borderTop: `1px solid ${S.rim}` }}>
            <SectionLabel index="E" title="Audit Trace" />
            <div style={{ fontFamily: S.fontMono, fontSize: "0.5rem", color: S.tertiary, lineHeight: 1.8, letterSpacing: "0.03em" }}>
              <div>RUN-ID: <span style={{ color: S.secondary }}>—</span></div>
              <div>SNAP-HASH: <span style={{ color: S.secondary }}>—</span></div>
              <div>SEED: <span style={{ color: S.secondary }}>0xDEAD1234</span></div>
              <div>ENGINE: <span style={{ color: S.secondary }}>1.0.0</span></div>
              <div>METHOD: <span style={{ color: S.secondary }}>MC+DET</span></div>
              <div>STATUS: <span style={{ color: S.pass }}>READ-ONLY</span></div>
            </div>
          </div>

          <div style={{ marginTop: "auto", paddingTop: 16, fontFamily: S.fontMono, fontSize: "0.4375rem", color: S.tertiary, letterSpacing: "0.04em" }}>
            Static demo data · Engine pending
          </div>
        </aside>

      </div>

      {/* Footer */}
      <footer style={{
        height: 32, display: "flex", alignItems: "center", gap: 8, padding: "0 20px",
        borderTop: `1px solid ${S.rim}`, background: S.bgPanel,
        fontFamily: S.fontMono, fontSize: "0.5rem", color: S.tertiary,
        letterSpacing: "0.04em", flexShrink: 0,
      }}>
        <span>HedgeCore · Scenario Studio</span>
        <span style={{ color: S.rim }}>·</span>
        <span>Static Demo · Not for production use</span>
      </footer>
    </div>
  );
}
