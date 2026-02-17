"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const RENDER_TS = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";

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

// ─── static data ──────────────────────────────────────────────────────────────

const R_DIMS = [
  {
    code: "R1", name: "Delta Risk",
    description: "Sensitivity of portfolio value to first-order changes in underlying FX rates. Net delta computed per currency pair across all derivative and physical positions.",
    var99: -18_400_000, cvar99: -26_200_000, exposure: 284_200_000, hedgeRatio: 0.80,
    residualExposure: 56_840_000, regime: "MODERATE",
  },
  {
    code: "R2", name: "Vega Risk",
    description: "Sensitivity to changes in implied volatility surface. Portfolio currently option-free; vega risk is zero.",
    var99: 0, cvar99: 0, exposure: 0, hedgeRatio: 0, residualExposure: 0, regime: "NONE",
  },
  {
    code: "R3", name: "Gamma Risk",
    description: "Second-order delta sensitivity — rate of change of delta with respect to FX rate moves. Convexity profile. Material only in option-heavy books.",
    var99: 0, cvar99: 0, exposure: 0, hedgeRatio: 0, residualExposure: 0, regime: "NONE",
  },
  {
    code: "R4", name: "Theta / Carry Risk",
    description: "Time decay and carry cost embedded in forward points and option premium. For NDF book: forward points represent interest rate differential carry.",
    var99: -620_000, cvar99: -780_000, exposure: 284_200_000, hedgeRatio: 0, residualExposure: 284_200_000, regime: "LOW",
  },
  {
    code: "R5", name: "Correlation Risk",
    description: "Cross-currency correlation breakdown risk. Current portfolio: predominantly MXN; USD/MXN correlation to commodity prices (oil) is a secondary driver.",
    var99: -3_200_000, cvar99: -4_800_000, exposure: 284_200_000, hedgeRatio: 0, residualExposure: 284_200_000, regime: "LOW",
  },
  {
    code: "R6", name: "Credit / Counterparty Risk",
    description: "Counterparty Default Risk on outstanding NDF positions. Measured as CVA. Current MTM + PFE under SA-CCR across three bank counterparties.",
    var99: -2_100_000, cvar99: -3_400_000, exposure: 284_200_000, hedgeRatio: 0, residualExposure: 284_200_000, regime: "LOW",
  },
  {
    code: "R7", name: "Liquidity Risk",
    description: "Cost and ability to unwind hedge positions in stressed conditions. MXN NDF market is liquid up to 12 months. Liquidation horizon: 5 days.",
    var99: -1_800_000, cvar99: -2_900_000, exposure: 284_200_000, hedgeRatio: 0, residualExposure: 284_200_000, regime: "LOW",
  },
  {
    code: "R8", name: "Tail / Event Risk",
    description: "Fat-tail risk not captured by normal distribution. Measured via Historical Simulation and Expected Shortfall. Polisophic scenario C maps to this dimension.",
    var99: -84_000_000, cvar99: -97_200_000, exposure: 284_200_000, hedgeRatio: 0, residualExposure: 284_200_000, regime: "HIGH",
  },
];

const POSITIONS = [
  { id: "POS-001", name: "MXN Export Receivables",  type: "PHYSICAL", notional:  284_200_000, currency: "MXN", delta:  0.80, status: "CONFIRMED" },
  { id: "POS-002", name: "NDF Hedge — Mar 2026",    type: "NDF",      notional:  -45_600_000, currency: "MXN", delta: -1.00, status: "ACTIVE" },
  { id: "POS-003", name: "NDF Hedge — Apr 2026",    type: "NDF",      notional:  -42_100_000, currency: "MXN", delta: -1.00, status: "ACTIVE" },
  { id: "POS-004", name: "NDF Hedge — May 2026",    type: "NDF",      notional:  -38_800_000, currency: "MXN", delta: -1.00, status: "ACTIVE" },
  { id: "POS-005", name: "NDF Hedge — Jun 2026",    type: "NDF",      notional:  -35_200_000, currency: "MXN", delta: -1.00, status: "ACTIVE" },
  { id: "POS-006", name: "Forecast Receivables Q2", type: "PHYSICAL", notional:   62_400_000, currency: "MXN", delta:  0.50, status: "FORECAST" },
  { id: "POS-007", name: "NDF Hedge — Forecast",    type: "NDF",      notional:  -31_200_000, currency: "MXN", delta: -1.00, status: "ACTIVE" },
];

const ATTRIBUTION = [
  { factor: "FX Rate (USD/MXN)",       contribution: -14_200_000, pct: 62.1 },
  { factor: "Forward Points Shift",    contribution:  -4_800_000, pct: 21.0 },
  { factor: "Carry (Theta)",           contribution:  -1_900_000, pct: 8.3  },
  { factor: "Credit Spread (CVA)",     contribution:  -1_200_000, pct: 5.2  },
  { factor: "Liquidity Premium",       contribution:    -780_000, pct: 3.4  },
];

const HEDGE_EFFICIENCY = [
  { bucket: "2026-03", targetRatio: 0.80, actualRatio: 0.79, effectiveness: 98.5, status: "PASS" },
  { bucket: "2026-04", targetRatio: 0.80, actualRatio: 0.81, effectiveness: 99.1, status: "PASS" },
  { bucket: "2026-05", targetRatio: 0.80, actualRatio: 0.80, effectiveness: 99.8, status: "PASS" },
  { bucket: "2026-06", targetRatio: 0.80, actualRatio: 0.78, effectiveness: 97.2, status: "PASS" },
  { bucket: "2026-07", targetRatio: 0.50, actualRatio: 0.50, effectiveness: 100.0, status: "PASS" },
];

// ─── formatters ───────────────────────────────────────────────────────────────

function fmtM(n: number): string {
  if (n === 0) return "—";
  const sign = n < 0 ? "−" : "+";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M`;
  return `${sign}${(abs / 1_000).toFixed(0)}K`;
}

// ─── primitives ───────────────────────────────────────────────────────────────

function RegimeChip({ regime }: { regime: string }) {
  const map: Record<string, string> = {
    HIGH: S.fail, MODERATE: S.amber, LOW: S.pass, NONE: S.tertiary,
  };
  const c = map[regime] ?? S.tertiary;
  return (
    <span style={{
      fontFamily: S.fontMono, fontSize: "0.4375rem", letterSpacing: "0.06em",
      padding: "1px 5px", border: `1px solid ${c}`, color: c,
    }}>{regime}</span>
  );
}

function VarBar({ value, max }: { value: number; max: number }) {
  if (value === 0) return <div style={{ display: "flex", alignItems: "center", gap: 5 }}><div style={{ width: 80, height: 5, background: S.soft }} /><span style={{ fontFamily: S.fontMono, fontSize: "0.5rem", color: S.tertiary, minWidth: 40, textAlign: "right" as const }}>—</span></div>;
  const pct = Math.min(100, (Math.abs(value) / max) * 100);
  const color = pct > 70 ? S.fail : pct > 30 ? S.amber : S.pass;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <div style={{ width: 80, height: 5, background: S.soft, position: "relative" as const, flexShrink: 0 }}>
        <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${pct}%`, background: color }} />
      </div>
      <span style={{ fontFamily: S.fontMono, fontSize: "0.5rem", color, fontWeight: 600, minWidth: 40, textAlign: "right" as const }}>
        {fmtM(value)}
      </span>
    </div>
  );
}

// ─── SVG components ───────────────────────────────────────────────────────────

function RiskRadar() {
  const activeDims = R_DIMS.filter(r => r.regime !== "NONE");
  const n = activeDims.length;
  const cx = 90, cy = 90, r = 68;
  const maxVar = Math.max(...activeDims.map(d => Math.abs(d.var99)));
  const angleFn = (i: number) => (i / n) * 2 * Math.PI - Math.PI / 2;
  const ptFn = (i: number, scale: number) => ({
    x: cx + Math.cos(angleFn(i)) * r * scale,
    y: cy + Math.sin(angleFn(i)) * r * scale,
  });
  const gridRings = [0.25, 0.5, 0.75, 1.0];
  const dataPts = activeDims.map((d, i) => {
    const scale = Math.abs(d.var99) / maxVar;
    return ptFn(i, scale);
  });
  const dataPath = `M ${dataPts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" L ")} Z`;
  return (
    <svg width={180} height={180} viewBox="0 0 180 180" style={{ display: "block" }}>
      {gridRings.map(scale =>
        <polygon key={scale}
          points={activeDims.map((_, i) => { const p = ptFn(i, scale); return `${p.x.toFixed(1)},${p.y.toFixed(1)}`; }).join(" ")}
          fill="none" stroke={S.soft} strokeWidth="0.75"
        />
      )}
      {activeDims.map((_, i) => {
        const end = ptFn(i, 1);
        return <line key={i} x1={cx} y1={cy} x2={end.x.toFixed(1)} y2={end.y.toFixed(1)} stroke={S.rim} strokeWidth="0.75" />;
      })}
      <path d={dataPath} fill="color-mix(in srgb, #B91C1C 15%, transparent)" stroke={S.fail} strokeWidth="1.5" strokeLinejoin="round"/>
      {activeDims.map((d, i) => {
        const pt = ptFn(i, 1.24);
        return <text key={d.code} x={pt.x.toFixed(1)} y={pt.y.toFixed(1)} textAnchor="middle" dominantBaseline="middle"
          style={{ fontFamily: S.fontMono, fontSize: "7px", fill: S.cyan }}>{d.code}</text>;
      })}
    </svg>
  );
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function PortfolioRisk() {
  const router = useRouter();
  const [tab, setTab] = useState("R1–R8 Decomposition");
  const tabs = ["R1–R8 Decomposition", "Position Ledger", "Risk Attribution", "Hedge Efficiency"];

  const totalVar99 = R_DIMS.reduce((s, r) => s + r.var99, 0);
  const totalCvar99 = R_DIMS.reduce((s, r) => s + r.cvar99, 0);
  const grossExposure = POSITIONS.filter(p => p.notional > 0).reduce((s, p) => s + p.notional, 0);
  const hedgeNotional = Math.abs(POSITIONS.filter(p => p.notional < 0).reduce((s, p) => s + p.notional, 0));
  const maxAbsVar = Math.abs(R_DIMS[7].var99);

  return (
    <div style={{ minHeight: "100%", display: "flex", flexDirection: "column", background: S.bgDeep, fontFamily: S.fontUI, color: S.primary }}>

      {/* Header */}
      <header style={{
        display: "flex", alignItems: "center", gap: 12, height: 44,
        padding: "0 20px", background: S.bgPanel, borderBottom: `1px solid ${S.rim}`, flexShrink: 0,
      }}>
        <button onClick={() => router.push("/")} style={{
          fontFamily: S.fontMono, fontSize: "0.5625rem", color: S.tertiary,
          background: "transparent", border: `1px solid ${S.rim}`,
          padding: "2px 8px", cursor: "pointer", letterSpacing: "0.04em",
        }}>← Home</button>
        <span style={{ color: S.rim }}>|</span>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect x="1" y="9" width="3" height="6" rx="0.5" stroke="var(--accent-cyan)" strokeWidth="1.25"/>
          <rect x="6.5" y="5.5" width="3" height="9.5" rx="0.5" stroke="var(--accent-cyan)" strokeWidth="1.25"/>
          <rect x="12" y="1.5" width="3" height="13.5" rx="0.5" stroke="var(--accent-cyan)" strokeWidth="1.25"/>
          <path d="M2.5 7L7 4l4.5 3" stroke="var(--accent-cyan)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" opacity="0.5"/>
        </svg>
        <div>
          <div style={{ fontFamily: S.fontUI, fontSize: "0.8125rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: S.primary, lineHeight: 1.1 }}>
            Portfolio Risk Analysis
          </div>
          <div style={{ fontFamily: S.fontMono, fontSize: "0.4375rem", letterSpacing: "0.07em", color: S.tertiary }}>
            R1–R8 DECOMPOSITION · HEDGE EFFECTIVENESS · VaR · ATTRIBUTION
          </div>
        </div>
        <div style={{ flex: 1 }} />
        {/* KPI strip */}
        <div style={{ display: "flex", gap: 0, alignItems: "stretch", border: `1px solid ${S.rim}` }}>
          {[
            { label: "VaR 99% (1D)",  value: fmtM(totalVar99),   color: S.fail },
            { label: "CVaR 99%",      value: fmtM(totalCvar99),  color: S.fail },
            { label: "Gross Exp.",    value: fmtM(grossExposure), color: S.primary },
            { label: "Hedge Cover",   value: `${((hedgeNotional / grossExposure) * 100).toFixed(0)}%`, color: S.pass },
          ].map(({ label, value, color }, i, arr) => (
            <div key={label} style={{
              padding: "4px 12px", display: "flex", flexDirection: "column", gap: 1,
              borderRight: i < arr.length - 1 ? `1px solid ${S.rim}` : "none",
            }}>
              <span style={{ fontFamily: S.fontMono, fontSize: "0.4375rem", color: S.tertiary, letterSpacing: "0.05em" }}>{label}</span>
              <span style={{ fontFamily: S.fontMono, fontSize: "0.75rem", fontWeight: 700, color, lineHeight: 1 }}>{value}</span>
            </div>
          ))}
        </div>
        <span style={{ fontFamily: S.fontMono, fontSize: "0.5rem", color: S.tertiary }}>{RENDER_TS}</span>
      </header>

      {/* Tab bar */}
      <div style={{
        display: "flex", alignItems: "center", background: S.bgPanel,
        borderBottom: `1px solid ${S.rim}`, padding: "0 20px", height: 36, flexShrink: 0,
      }}>
        {tabs.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            fontFamily: S.fontMono, fontSize: "0.5625rem", letterSpacing: "0.04em",
            padding: "0 16px", height: "100%", display: "flex", alignItems: "center",
            color: tab === t ? S.cyan : S.tertiary,
            borderBottom: tab === t ? `2px solid ${S.cyan}` : "2px solid transparent",
            borderTop: "none", borderLeft: "none", borderRight: "none",
            background: "transparent", cursor: "pointer",
          }}>{t}</button>
        ))}
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: S.fontMono, fontSize: "0.4375rem", color: S.tertiary, padding: "1px 6px", border: `1px solid ${S.rim}` }}>
          Q1-2026-DEMO · ENGINE v1.0
        </span>
      </div>

      <div style={{ flex: 1, overflow: "auto" }}>

        {/* ══ R1–R8 ══ */}
        {tab === "R1–R8 Decomposition" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 220px", height: "100%" }}>
            <div style={{ padding: "20px 24px", borderRight: `1px solid ${S.rim}`, overflow: "auto" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 8 }}>
                <span style={{ fontFamily: S.fontUI, fontSize: "0.8125rem", fontWeight: 600, color: S.primary }}>R1–R8 Risk Decomposition</span>
                <span style={{ fontFamily: S.fontMono, fontSize: "0.5rem", color: S.tertiary }}>8 dimensions · 99% VaR · 1-day horizon</span>
              </div>
              <div style={{ height: 1, background: S.rim, marginBottom: 0 }} />
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Dim", "Risk Name", "VaR 99%", "CVaR 99%", "Gross Exp.", "Hedge %", "Residual", "Regime"].map(h => (
                      <th key={h} style={{
                        padding: "6px 10px 6px 0", fontFamily: S.fontMono, fontSize: "0.4375rem",
                        letterSpacing: "0.07em", textTransform: "uppercase", color: S.tertiary,
                        textAlign: "left", borderBottom: `1px solid ${S.rim}`, whiteSpace: "nowrap",
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {R_DIMS.map(r => {
                    const isNone = r.regime === "NONE";
                    return (
                      <tr key={r.code} style={{ borderBottom: `1px solid ${S.soft}`, opacity: isNone ? 0.4 : 1 }}>
                        <td style={{ padding: "9px 10px 9px 0", fontFamily: S.fontMono, fontSize: "0.625rem", fontWeight: 700, color: S.cyan }}>{r.code}</td>
                        <td style={{ padding: "9px 10px 9px 0" }}>
                          <div style={{ fontFamily: S.fontUI, fontSize: "0.6875rem", fontWeight: 500, color: S.primary }}>{r.name}</div>
                          <div style={{ fontFamily: S.fontUI, fontSize: "0.5rem", color: S.tertiary, lineHeight: 1.3, maxWidth: 200 }}>{r.description.slice(0, 78)}…</div>
                        </td>
                        <td style={{ padding: "9px 10px 9px 0" }}>
                          <VarBar value={r.var99} max={maxAbsVar} />
                        </td>
                        <td style={{ padding: "9px 10px 9px 0", fontFamily: S.fontMono, fontSize: "0.5625rem", color: r.cvar99 < 0 ? S.fail : S.tertiary }}>
                          {r.cvar99 !== 0 ? fmtM(r.cvar99) : "—"}
                        </td>
                        <td style={{ padding: "9px 10px 9px 0", fontFamily: S.fontMono, fontSize: "0.5625rem", color: S.secondary }}>
                          {r.exposure > 0 ? fmtM(r.exposure) : "—"}
                        </td>
                        <td style={{ padding: "9px 10px 9px 0", fontFamily: S.fontMono, fontSize: "0.5625rem", color: r.hedgeRatio > 0 ? S.pass : S.tertiary }}>
                          {r.hedgeRatio > 0 ? `${(r.hedgeRatio * 100).toFixed(0)}%` : "—"}
                        </td>
                        <td style={{ padding: "9px 10px 9px 0", fontFamily: S.fontMono, fontSize: "0.5625rem", color: S.secondary }}>
                          {r.residualExposure > 0 ? fmtM(r.residualExposure) : "—"}
                        </td>
                        <td style={{ padding: "9px 0 9px 0" }}>
                          <RegimeChip regime={r.regime} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div style={{ marginTop: 14, padding: "12px 14px", background: S.bgSub, border: `1px solid ${S.rim}`, display: "flex", gap: 20 }}>
                {[
                  { label: "TOTAL VaR 99%",  value: fmtM(totalVar99),  color: S.fail },
                  { label: "TOTAL CVaR 99%", value: fmtM(totalCvar99), color: S.fail },
                  { label: "R8 DOMINANCE",   value: `${((maxAbsVar / Math.abs(totalVar99)) * 100).toFixed(0)}%`, color: S.amber },
                  { label: "ACTIVE DIMS",    value: `${R_DIMS.filter(r => r.regime !== "NONE").length}/8`, color: S.secondary },
                ].map(({ label, value, color }) => (
                  <div key={label}>
                    <div style={{ fontFamily: S.fontMono, fontSize: "0.4375rem", color: S.tertiary, letterSpacing: "0.05em" }}>{label}</div>
                    <div style={{ fontFamily: S.fontMono, fontSize: "1rem", fontWeight: 700, color, lineHeight: 1.1 }}>{value}</div>
                  </div>
                ))}
              </div>
            </div>

            <aside style={{ padding: "20px 16px", background: S.bgSub, overflow: "auto" }}>
              <div style={{ fontFamily: S.fontMono, fontSize: "0.4375rem", color: S.tertiary, letterSpacing: "0.06em", marginBottom: 10 }}>
                RISK RADAR (VaR-scaled)
              </div>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
                <RiskRadar />
              </div>
              <div style={{ height: 1, background: S.rim, marginBottom: 12 }} />
              <div style={{ fontFamily: S.fontMono, fontSize: "0.4375rem", color: S.tertiary, letterSpacing: "0.06em", marginBottom: 8 }}>REGIME SUMMARY</div>
              {(["HIGH", "MODERATE", "LOW", "NONE"] as const).map(regime => {
                const dims = R_DIMS.filter(r => r.regime === regime);
                const colorMap: Record<string, string> = { HIGH: S.fail, MODERATE: S.amber, LOW: S.pass, NONE: S.tertiary };
                const color = colorMap[regime];
                return (
                  <div key={regime} style={{ padding: "6px 0", borderBottom: `1px solid ${S.soft}` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                      <span style={{ width: 5, height: 5, borderRadius: "50%", background: color, display: "inline-block" }} />
                      <span style={{ fontFamily: S.fontMono, fontSize: "0.5rem", color, fontWeight: 600 }}>{regime}</span>
                      <span style={{ fontFamily: S.fontMono, fontSize: "0.5rem", color: S.tertiary, marginLeft: "auto" }}>{dims.length}</span>
                    </div>
                    <div style={{ fontFamily: S.fontUI, fontSize: "0.5rem", color: S.tertiary, paddingLeft: 11 }}>
                      {dims.map(d => d.code).join(" · ") || "—"}
                    </div>
                  </div>
                );
              })}
              <div style={{ marginTop: 14, fontFamily: S.fontMono, fontSize: "0.4375rem", color: S.tertiary, lineHeight: 1.8 }}>
                Methodology: Hist. Sim. + Parametric<br/>
                Horizon: 1-day · Confidence: 99%<br/>
                Decay: EWMA λ=0.94
              </div>
            </aside>
          </div>
        )}

        {/* ══ POSITIONS ══ */}
        {tab === "Position Ledger" && (
          <div style={{ padding: "20px 28px", overflow: "auto" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 8 }}>
              <span style={{ fontFamily: S.fontUI, fontSize: "0.8125rem", fontWeight: 600, color: S.primary }}>Position Ledger</span>
              <span style={{ fontFamily: S.fontMono, fontSize: "0.5rem", color: S.tertiary }}>{POSITIONS.length} positions</span>
            </div>
            <div style={{ height: 1, background: S.rim, marginBottom: 0 }} />
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["ID", "Position Name", "Type", "Notional (MXN)", "Currency", "Delta", "Status"].map(h => (
                    <th key={h} style={{
                      padding: "6px 12px 6px 0", fontFamily: S.fontMono, fontSize: "0.4375rem",
                      letterSpacing: "0.07em", textTransform: "uppercase", color: S.tertiary,
                      textAlign: "left", borderBottom: `1px solid ${S.rim}`, whiteSpace: "nowrap",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {POSITIONS.map(p => {
                  const isHedge = p.notional < 0;
                  const statusColor = p.status === "ACTIVE" ? S.pass : p.status === "CONFIRMED" ? S.cyan : S.amber;
                  return (
                    <tr key={p.id} style={{ borderBottom: `1px solid ${S.soft}`, background: isHedge ? `color-mix(in srgb, var(--accent-cyan) 2%, transparent)` : "transparent" }}>
                      <td style={{ padding: "9px 12px 9px 0", fontFamily: S.fontMono, fontSize: "0.5rem", color: S.tertiary }}>{p.id}</td>
                      <td style={{ padding: "9px 12px 9px 0", fontFamily: S.fontUI, fontSize: "0.6875rem", fontWeight: 500, color: S.primary }}>{p.name}</td>
                      <td style={{ padding: "9px 12px 9px 0" }}>
                        <span style={{ fontFamily: S.fontMono, fontSize: "0.4375rem", padding: "1px 5px", border: `1px solid ${isHedge ? S.cyan : S.rim}`, color: isHedge ? S.cyan : S.secondary }}>{p.type}</span>
                      </td>
                      <td style={{ padding: "9px 12px 9px 0", fontFamily: S.fontMono, fontSize: "0.5625rem", color: p.notional >= 0 ? S.pass : S.fail, fontWeight: 600 }}>
                        {p.notional >= 0 ? `+${(p.notional / 1_000_000).toFixed(1)}M` : `−${(Math.abs(p.notional) / 1_000_000).toFixed(1)}M`}
                      </td>
                      <td style={{ padding: "9px 12px 9px 0", fontFamily: S.fontMono, fontSize: "0.5625rem", color: S.secondary }}>{p.currency}</td>
                      <td style={{ padding: "9px 12px 9px 0", fontFamily: S.fontMono, fontSize: "0.5625rem", color: S.secondary }}>{p.delta.toFixed(2)}</td>
                      <td style={{ padding: "9px 0 9px 0" }}>
                        <span style={{ fontFamily: S.fontMono, fontSize: "0.4375rem", padding: "1px 5px", border: `1px solid ${statusColor}`, color: statusColor }}>{p.status}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ marginTop: 14, padding: "12px 14px", background: S.bgSub, border: `1px solid ${S.rim}`, display: "flex", gap: 24 }}>
              {[
                { label: "GROSS LONG",  value: `+${(grossExposure / 1_000_000).toFixed(1)}M`,  color: S.pass },
                { label: "GROSS SHORT", value: `−${(hedgeNotional / 1_000_000).toFixed(1)}M`,  color: S.fail },
                { label: "NET DELTA",   value: `+${((grossExposure - hedgeNotional) / 1_000_000).toFixed(1)}M`, color: S.secondary },
                { label: "HEDGE COVER", value: `${((hedgeNotional / grossExposure) * 100).toFixed(1)}%`, color: S.cyan },
              ].map(({ label, value, color }) => (
                <div key={label}>
                  <div style={{ fontFamily: S.fontMono, fontSize: "0.4375rem", color: S.tertiary, letterSpacing: "0.05em" }}>{label}</div>
                  <div style={{ fontFamily: S.fontMono, fontSize: "1.125rem", fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══ ATTRIBUTION ══ */}
        {tab === "Risk Attribution" && (
          <div style={{ padding: "20px 28px", overflow: "auto" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 8 }}>
              <span style={{ fontFamily: S.fontUI, fontSize: "0.8125rem", fontWeight: 600, color: S.primary }}>Risk Attribution</span>
              <span style={{ fontFamily: S.fontMono, fontSize: "0.5rem", color: S.tertiary }}>P&L factor decomposition · rolling 30D</span>
            </div>
            <div style={{ height: 1, background: S.rim, marginBottom: 20 }} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
              <div>
                <div style={{ fontFamily: S.fontMono, fontSize: "0.4375rem", color: S.tertiary, letterSpacing: "0.06em", marginBottom: 8 }}>FACTOR DECOMPOSITION</div>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      {["Factor", "P&L", "Share"].map(h => (
                        <th key={h} style={{ padding: "5px 10px 5px 0", fontFamily: S.fontMono, fontSize: "0.4375rem", letterSpacing: "0.07em", textTransform: "uppercase", color: S.tertiary, textAlign: "left", borderBottom: `1px solid ${S.rim}` }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ATTRIBUTION.map((a, i) => {
                      const colors = [S.fail, S.amber, S.secondary, S.tertiary, S.tertiary];
                      const c = colors[i] ?? S.tertiary;
                      return (
                        <tr key={a.factor} style={{ borderBottom: `1px solid ${S.soft}` }}>
                          <td style={{ padding: "8px 10px 8px 0", fontFamily: S.fontUI, fontSize: "0.6875rem", fontWeight: 500, color: S.primary }}>{a.factor}</td>
                          <td style={{ padding: "8px 10px 8px 0", fontFamily: S.fontMono, fontSize: "0.5625rem", color: S.fail, fontWeight: 600 }}>{fmtM(a.contribution)}</td>
                          <td style={{ padding: "8px 0 8px 0" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                              <div style={{ width: 80, height: 5, background: S.soft, position: "relative" as const }}>
                                <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${a.pct}%`, background: c, opacity: 0.8 }} />
                              </div>
                              <span style={{ fontFamily: S.fontMono, fontSize: "0.5rem", color: S.secondary }}>{a.pct}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    <tr style={{ borderTop: `1px solid ${S.rim}` }}>
                      <td style={{ padding: "8px 10px 8px 0", fontFamily: S.fontUI, fontSize: "0.6875rem", fontWeight: 700, color: S.primary }}>Total</td>
                      <td style={{ padding: "8px 10px 8px 0", fontFamily: S.fontMono, fontSize: "0.6875rem", fontWeight: 700, color: S.fail }}>{fmtM(ATTRIBUTION.reduce((s, a) => s + a.contribution, 0))}</td>
                      <td style={{ padding: "8px 0 8px 0", fontFamily: S.fontMono, fontSize: "0.5rem", color: S.tertiary }}>100%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div>
                <div style={{ fontFamily: S.fontMono, fontSize: "0.4375rem", color: S.tertiary, letterSpacing: "0.06em", marginBottom: 8 }}>WATERFALL — P&L BY FACTOR</div>
                <div style={{ padding: "14px", background: S.bgSub, border: `1px solid ${S.rim}`, marginBottom: 14 }}>
                  <div style={{ display: "flex", height: 48, gap: 3, alignItems: "flex-end" }}>
                    {ATTRIBUTION.map((a, i) => {
                      const colors = [S.fail, S.amber, S.secondary, S.tertiary, S.tertiary];
                      const maxC = Math.max(...ATTRIBUTION.map(x => Math.abs(x.contribution)));
                      const h = (Math.abs(a.contribution) / maxC) * 48;
                      return (
                        <div key={a.factor} style={{ flex: a.pct, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                          <span style={{ fontFamily: S.fontMono, fontSize: "0.375rem", color: colors[i] }}>{fmtM(a.contribution)}</span>
                          <div style={{ width: "100%", height: `${h}px`, background: colors[i], opacity: 0.8, minHeight: 4 }} />
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ height: 1, background: S.rim, marginTop: 4 }} />
                  <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap" as const, gap: 8 }}>
                    {ATTRIBUTION.map((a, i) => {
                      const colors = [S.fail, S.amber, S.secondary, S.tertiary, S.tertiary];
                      return (
                        <div key={a.factor} style={{ display: "flex", alignItems: "center", gap: 3 }}>
                          <div style={{ width: 7, height: 7, background: colors[i] }} />
                          <span style={{ fontFamily: S.fontUI, fontSize: "0.4375rem", color: S.tertiary }}>{a.factor.split(" ").slice(0, 2).join(" ")}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div style={{ padding: "12px 14px", background: `color-mix(in srgb, var(--accent-cyan) 4%, transparent)`, border: `1px solid ${S.cyan}` }}>
                  <div style={{ fontFamily: S.fontMono, fontSize: "0.4375rem", color: S.cyan, letterSpacing: "0.06em", marginBottom: 6 }}>ATTRIBUTION INSIGHT</div>
                  <p style={{ fontFamily: S.fontUI, fontSize: "0.5625rem", color: S.secondary, lineHeight: 1.65, margin: 0 }}>
                    FX rate movement (R1) drives 62% of risk. The 80% NDF program offsets primary delta; residual 22% stems from forward point carry and tail scenarios. Correlation and counterparty risks are within policy limits.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══ HEDGE EFFICIENCY ══ */}
        {tab === "Hedge Efficiency" && (
          <div style={{ padding: "20px 28px", overflow: "auto" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 8 }}>
              <span style={{ fontFamily: S.fontUI, fontSize: "0.8125rem", fontWeight: 600, color: S.primary }}>Hedge Effectiveness Report</span>
              <span style={{ fontFamily: S.fontMono, fontSize: "0.5rem", color: S.tertiary }}>IFRS 9 §6.4.1 · prospective · {HEDGE_EFFICIENCY.length} buckets</span>
            </div>
            <div style={{ height: 1, background: S.rim, marginBottom: 0 }} />
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Tenor Bucket", "Target Ratio", "Actual Ratio", "Effectiveness", "IFRS 9 Status"].map(h => (
                    <th key={h} style={{ padding: "6px 12px 6px 0", fontFamily: S.fontMono, fontSize: "0.4375rem", letterSpacing: "0.07em", textTransform: "uppercase", color: S.tertiary, textAlign: "left", borderBottom: `1px solid ${S.rim}`, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {HEDGE_EFFICIENCY.map(h => (
                  <tr key={h.bucket} style={{ borderBottom: `1px solid ${S.soft}` }}>
                    <td style={{ padding: "10px 12px 10px 0", fontFamily: S.fontMono, fontSize: "0.6875rem", fontWeight: 600, color: S.primary }}>{h.bucket}</td>
                    <td style={{ padding: "10px 12px 10px 0", fontFamily: S.fontMono, fontSize: "0.5625rem", color: S.secondary }}>{(h.targetRatio * 100).toFixed(0)}%</td>
                    <td style={{ padding: "10px 12px 10px 0", fontFamily: S.fontMono, fontSize: "0.5625rem", color: S.secondary }}>{(h.actualRatio * 100).toFixed(0)}%</td>
                    <td style={{ padding: "10px 12px 10px 0" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 60, height: 4, background: S.soft, position: "relative" as const }}>
                          <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${h.effectiveness}%`, background: S.pass }} />
                        </div>
                        <span style={{ fontFamily: S.fontMono, fontSize: "0.5625rem", color: S.pass, fontWeight: 600 }}>{h.effectiveness.toFixed(1)}%</span>
                      </div>
                    </td>
                    <td style={{ padding: "10px 0 10px 0" }}>
                      <span style={{ fontFamily: S.fontMono, fontSize: "0.4375rem", padding: "1px 5px", border: `1px solid ${S.pass}`, color: S.pass }}>● {h.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ marginTop: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div style={{ padding: "14px 16px", background: S.bgSub, border: `1px solid ${S.rim}` }}>
                <div style={{ fontFamily: S.fontMono, fontSize: "0.4375rem", color: S.tertiary, letterSpacing: "0.06em", marginBottom: 10 }}>IFRS 9 §6.4.1 QUALIFICATION CHECKLIST</div>
                {[
                  "Economic relationship between item and instrument",
                  "Credit risk does not dominate value changes",
                  "Hedge ratio reflects quantities actually used",
                  "Hedge designation documented at inception",
                  "Effectiveness assessment prospective",
                  "Ineffectiveness measured and disclosed",
                ].map(c => (
                  <div key={c} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "5px 0", borderBottom: `1px solid ${S.soft}` }}>
                    <span style={{ color: S.pass, fontFamily: S.fontMono, fontSize: "0.625rem", flexShrink: 0 }}>✓</span>
                    <span style={{ fontFamily: S.fontUI, fontSize: "0.5625rem", color: S.secondary, lineHeight: 1.4 }}>{c}</span>
                  </div>
                ))}
              </div>
              <div style={{ padding: "14px 16px", background: S.bgSub, border: `1px solid ${S.rim}` }}>
                <div style={{ fontFamily: S.fontMono, fontSize: "0.4375rem", color: S.tertiary, letterSpacing: "0.06em", marginBottom: 10 }}>EFFECTIVENESS METHODOLOGY</div>
                {[
                  { label: "Assessment method",  value: "Dollar-offset (prospective qualitative)" },
                  { label: "Testing frequency",  value: "Each reporting date + on market disruption" },
                  { label: "Acceptable range",   value: "Qualitative (IAS 39 80-125% abolished)" },
                  { label: "Ineffectiveness",    value: "Nil — all buckets within 2% of target" },
                  { label: "Audit trail source", value: "HedgeCore SandboxResult · run_id" },
                  { label: "Standard ref.",      value: "IFRS 9.6.4.1(a–c) · IFRS 9.B6.4.1" },
                ].map(({ label, value }) => (
                  <div key={label} style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 8, padding: "5px 0", borderBottom: `1px solid ${S.soft}` }}>
                    <span style={{ fontFamily: S.fontUI, fontSize: "0.5625rem", color: S.tertiary }}>{label}</span>
                    <span style={{ fontFamily: S.fontMono, fontSize: "0.5rem", color: S.secondary }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

      </div>

      <footer style={{
        height: 32, display: "flex", alignItems: "center", gap: 8, padding: "0 20px",
        borderTop: `1px solid ${S.rim}`, background: S.bgPanel,
        fontFamily: S.fontMono, fontSize: "0.5rem", color: S.tertiary,
        letterSpacing: "0.04em", flexShrink: 0,
      }}>
        <span>HedgeCore · Portfolio Risk Analysis</span>
        <span style={{ color: S.rim }}>·</span>
        <span>R1–R8 · VaR 99% · Static Demo</span>
        <span style={{ color: S.rim }}>·</span>
        <span>IFRS 9 Effectiveness: ALL PASS</span>
      </footer>
    </div>
  );
}
