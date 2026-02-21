"use client";

import { useState } from "react";
import { useAuth } from "../../lib/authContext";
import { useRouter } from "next/navigation";
import EmptyState from "../../components/ui/EmptyState";

const RENDER_TS = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";
const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

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

const RISK_EVENTS = [
  {
    id: "EVT-2026-0214",
    ts: "2026-02-14 18:32 UTC",
    source: "Banxico Monetary Statement",
    region: "MEX",
    category: "CENTRAL BANK",
    headline: "Banxico holds rate at 10.25%; signals two cuts in H1 2026 pending inflation trajectory",
    rawSignal: "dovish_rate_guidance",
    impact: "MXN_WEAKENING",
    severity: 72,
    confidence: 91,
    alertTriggered: true,
  },
  {
    id: "EVT-2026-0213",
    ts: "2026-02-13 14:10 UTC",
    source: "US Treasury / OFAC",
    region: "USA",
    category: "SANCTIONS",
    headline: "New secondary sanctions designations targeting energy sector counterparties in three EM corridors",
    rawSignal: "sanctions_expansion",
    impact: "COUNTERPARTY_RISK",
    severity: 85,
    confidence: 97,
    alertTriggered: true,
  },
  {
    id: "EVT-2026-0212",
    ts: "2026-02-12 09:00 UTC",
    source: "SHCP Budget Revision",
    region: "MEX",
    category: "FISCAL",
    headline: "Mexico revises 2026 deficit target to 4.1% of GDP; Pemex bond guarantees extended",
    rawSignal: "fiscal_deterioration",
    impact: "SOVEREIGN_SPREAD",
    severity: 61,
    confidence: 88,
    alertTriggered: false,
  },
  {
    id: "EVT-2026-0211",
    ts: "2026-02-11 16:45 UTC",
    source: "Fed FOMC Minutes",
    region: "USA",
    category: "CENTRAL BANK",
    headline: "FOMC minutes show persistent hawkish dissent; rate cut timeline pushed to Q3 2026",
    rawSignal: "hawkish_hold",
    impact: "USD_STRENGTHENING",
    severity: 78,
    confidence: 95,
    alertTriggered: true,
  },
  {
    id: "EVT-2026-0210",
    ts: "2026-02-10 11:20 UTC",
    source: "S&P Sovereign Action",
    region: "MEX",
    category: "CREDIT RATING",
    headline: "S&P revises Mexico outlook to Negative; affirms BBB rating citing fiscal slippage",
    rawSignal: "outlook_negative",
    impact: "CDS_WIDENING",
    severity: 69,
    confidence: 99,
    alertTriggered: true,
  },
  {
    id: "EVT-2026-0209",
    ts: "2026-02-09 08:00 UTC",
    source: "US CPI Release (BLS)",
    region: "USA",
    category: "MACRO DATA",
    headline: "US CPI +0.4% MoM, 3.2% YoY — above consensus 3.0%; core services remain sticky",
    rawSignal: "inflation_beat",
    impact: "RATES_UP",
    severity: 55,
    confidence: 99,
    alertTriggered: false,
  },
];

const RISK_SCORES = [
  { dimension: "MXN Exchange Rate Pressure",       score: 74, delta: +8,  regime: "ELEVATED",  driver: "Banxico dovish + USD hawkish" },
  { dimension: "Mexico Sovereign Credit Risk",      score: 62, delta: +5,  regime: "MODERATE",  driver: "S&P outlook negative, Pemex" },
  { dimension: "US Interest Rate Trajectory",       score: 80, delta: -3,  regime: "HIGH",      driver: "FOMC delay, CPI beat" },
  { dimension: "Geopolitical Sanctions Spillover",  score: 55, delta: +12, regime: "MODERATE",  driver: "OFAC expansion, EM corridors" },
  { dimension: "EM Capital Flow Reversal Risk",     score: 67, delta: +4,  regime: "ELEVATED",  driver: "UST yield / risk-off signals" },
  { dimension: "Mexico Fiscal Stability",           score: 58, delta: +6,  regime: "MODERATE",  driver: "Deficit 4.1%, energy transfers" },
  { dimension: "Counterparty Credit Environment",   score: 48, delta: +2,  regime: "MODERATE",  driver: "IG spreads widening modestly" },
  { dimension: "Global Liquidity Conditions",       score: 71, delta: -2,  regime: "ELEVATED",  driver: "QT pace, Fed balance sheet" },
];

const MACRO_SCENARIOS = [
  {
    id: "MSC-A",
    name: "Soft Landing + MXN Stabilisation",
    probability: 28,
    usdmxnPath: "17.80–18.50",
    hedgeImplication: "Reduce confirmed hedge ratio to 65%. Opportunistic option layer.",
    riskScore: 35,
    horizon: "Q2 2026",
  },
  {
    id: "MSC-B",
    name: "Fed Higher-for-Longer + MXN Drift",
    probability: 42,
    usdmxnPath: "19.50–21.00",
    hedgeImplication: "Maintain 80% NDF program. Add 3M tenor extension to ladder.",
    riskScore: 68,
    horizon: "Q2–Q3 2026",
  },
  {
    id: "MSC-C",
    name: "Mexico Fiscal Shock + EM Sell-Off",
    probability: 19,
    usdmxnPath: "21.00–24.50",
    hedgeImplication: "Increase to 90% confirmed, 70% forecast. Board escalation required.",
    riskScore: 88,
    horizon: "Q2–Q4 2026",
  },
  {
    id: "MSC-D",
    name: "Global Risk-Off / USD Rally",
    probability: 11,
    usdmxnPath: "22.00–26.00",
    hedgeImplication: "Maximum coverage 95%. Activate contingency swap lines.",
    riskScore: 96,
    horizon: "Q2 2026",
  },
];

const ALERT_RULES = [
  { id: "ALR-001", trigger: "MXN score ≥ 75",          action: "Notify Treasury + Risk; auto-schedule hedge review",   status: "ARMED",     lastFired: "—" },
  { id: "ALR-002", trigger: "Sovereign CDS > 180bps",   action: "Escalate to CFO; freeze new FX exposure approvals",    status: "ARMED",     lastFired: "2026-01-22" },
  { id: "ALR-003", trigger: "FOMC event + score Δ > 10",action: "Re-run hedge ladder with updated rate curve",          status: "FIRED",     lastFired: "2026-02-11" },
  { id: "ALR-004", trigger: "Sanctions event (OFAC)",   action: "Counterparty eligibility re-check; halt new trades",   status: "FIRED",     lastFired: "2026-02-13" },
  { id: "ALR-005", trigger: "Scenario C probability > 25%", action: "Board risk memo; activate contingency protocol", status: "ARMED",     lastFired: "—" },
];

// ─── primitives ───────────────────────────────────────────────────────────────

function RegimeChip({ regime }: { regime: string }) {
  const map: Record<string, { color: string; border: string }> = {
    HIGH:     { color: S.fail,    border: S.fail },
    ELEVATED: { color: S.amber,   border: S.amber },
    MODERATE: { color: S.secondary, border: S.rim },
    LOW:      { color: S.pass,    border: S.pass },
  };
  const { color, border } = map[regime] ?? map.MODERATE;
  return (
    <span style={{
      fontFamily: S.fontMono, fontSize: "0.4375rem", letterSpacing: "0.06em",
      padding: "1px 5px", border: `1px solid ${border}`, color,
    }}>{regime}</span>
  );
}

function ScoreBar({ score, max = 100 }: { score: number; max?: number }) {
  const pct = (score / max) * 100;
  const color = score >= 75 ? S.fail : score >= 55 ? S.amber : S.pass;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ width: 64, height: 5, background: S.soft, position: "relative" as const, flexShrink: 0 }}>
        <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${pct}%`, background: color, transition: "width 0.3s" }} />
      </div>
      <span style={{ fontFamily: S.fontMono, fontSize: "0.5rem", color, fontWeight: 600, minWidth: 20 }}>{score}</span>
    </div>
  );
}

function TopBar({ onBack, tab, setTab }: { onBack: () => void; tab: string; setTab: (t: string) => void }) {
  const tabs = ["Event Feed", "Risk Scores", "Macro Scenarios", "Alert Rules", "My Exposure Risk"];
  return (
    <>
      <header style={{
        display: "flex", alignItems: "center", gap: 12, height: 44,
        padding: "0 20px", background: S.bgPanel, borderBottom: `1px solid ${S.rim}`, flexShrink: 0,
      }}>
        <button onClick={onBack} style={{
          fontFamily: S.fontMono, fontSize: "0.5625rem", color: S.tertiary,
          background: "transparent", border: `1px solid ${S.rim}`,
          padding: "2px 8px", cursor: "pointer", letterSpacing: "0.04em",
        }}>← Home</button>
        <span style={{ color: S.rim }}>|</span>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="6.5" stroke="var(--accent-cyan)" strokeWidth="1.25"/>
          <path d="M8 4v4l2.5 2.5" stroke="var(--accent-cyan)" strokeWidth="1.25" strokeLinecap="round"/>
          <path d="M3.5 8h1M11.5 8h1M8 3.5v-1M8 13.5v-1" stroke="var(--accent-cyan)" strokeWidth="1" strokeLinecap="round" opacity="0.5"/>
        </svg>
        <div>
          <div style={{ fontFamily: S.fontUI, fontSize: "0.8125rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: S.primary, lineHeight: 1.1 }}>
            Polisophic
          </div>
          <div style={{ fontFamily: S.fontMono, fontSize: "0.4375rem", letterSpacing: "0.07em", color: S.tertiary }}>
            POLITICAL & MACRO RISK INTELLIGENCE
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontFamily: S.fontMono, fontSize: "0.4375rem", padding: "1px 6px", border: `1px solid ${S.fail}`, color: S.fail, background: `color-mix(in srgb, var(--accent-red,#B91C1C) 8%, transparent)` }}>
            ● 4 ACTIVE ALERTS
          </span>
          {DEMO_MODE ? (
            <span style={{ fontFamily: S.fontMono, fontSize: "0.4375rem", padding: "1px 6px", border: `1px solid ${S.rim}`, color: S.tertiary }}>
              LIVE FEED DEMO
            </span>
          ) : (
            <span style={{ fontFamily: S.fontMono, fontSize: "0.4375rem", padding: "1px 6px", border: `1px solid ${S.amber}`, color: S.amber }}>
              FEED DISCONNECTED
            </span>
          )}
          <span style={{ fontFamily: S.fontMono, fontSize: "0.5rem", color: S.tertiary }}>{RENDER_TS}</span>
        </div>
      </header>

      {/* tab bar */}
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
          {RISK_EVENTS.length} events · {MACRO_SCENARIOS.length} scenarios · engine v1.0
        </span>
      </div>
    </>
  );
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function Polisophic() {
  const router = useRouter();
  const { user } = useAuth();
  const [tab, setTab] = useState("Event Feed");

  // Branch exposure mapping for My Exposure Risk tab
  const BRANCH_CURRENCY: Record<string, { currency: string; pairs: string[]; regimeKey: string }> = {
    NYC: { currency: "USD", pairs: ["USD/MXN", "USD/GBP"], regimeKey: "US Interest Rate Trajectory" },
    MXC: { currency: "MXN", pairs: ["USD/MXN", "MXN/EUR"], regimeKey: "MXN Exchange Rate Pressure" },
    LDN: { currency: "GBP", pairs: ["GBP/USD", "GBP/EUR"], regimeKey: "GBP Trade Uncertainty" },
  };
  const branchCode = user?.branch?.code?.toUpperCase() ?? "NYC";
  const exposureInfo = BRANCH_CURRENCY[branchCode] ?? BRANCH_CURRENCY["NYC"];
  const relevantScore = RISK_SCORES.find(r => r.dimension === exposureInfo.regimeKey) ?? RISK_SCORES[0];
  const currencyFilterMap: Record<string, string[]> = {
    USD: ["USA", "USA"],
    MXN: ["MEX"],
    GBP: [],
  };
  const relevantEvents = RISK_EVENTS.filter(ev =>
    exposureInfo.currency === "USD" ? ev.region === "USA" :
    exposureInfo.currency === "MXN" ? ev.region === "MEX" :
    ev.category === "CENTRAL BANK"
  );

  return (
    <div style={{ minHeight: "100%", display: "flex", flexDirection: "column", background: S.bgDeep, fontFamily: S.fontUI, color: S.primary }}>
      <TopBar onBack={() => router.push("/")} tab={tab} setTab={setTab} />

      <div style={{ flex: 1, overflow: "auto" }}>

        {/* ══════════ EVENT FEED ══════════ */}
        {tab === "Event Feed" && !DEMO_MODE && (
          <div style={{ padding: "60px 28px" }}>
            <EmptyState
              type="empty"
              title="No risk events"
              message="Connect a risk intelligence feed to receive structured geopolitical and macro event data."
            />
          </div>
        )}
        {tab === "Event Feed" && DEMO_MODE && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 260px", height: "100%" }}>

            {/* Main feed */}
            <div style={{ padding: "20px 24px", borderRight: `1px solid ${S.rim}`, overflow: "auto" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 8 }}>
                <span style={{ fontFamily: S.fontUI, fontSize: "0.8125rem", fontWeight: 600, color: S.primary }}>Structured Event Feed</span>
                <span style={{ fontFamily: S.fontMono, fontSize: "0.5rem", color: S.tertiary }}>{RISK_EVENTS.length} events · last 7 days</span>
                <span style={{ marginLeft: "auto", fontFamily: S.fontMono, fontSize: "0.4375rem", color: S.amber }}>
                  ● AUTO-INGESTED · PENDING LIVE INTEGRATION
                </span>
              </div>
              <div style={{ height: 1, background: S.rim, marginBottom: 0 }} />

              {RISK_EVENTS.map((ev, i) => {
                const severityColor = ev.severity >= 75 ? S.fail : ev.severity >= 55 ? S.amber : S.secondary;
                return (
                  <div key={ev.id} style={{
                    padding: "14px 0",
                    borderBottom: i < RISK_EVENTS.length - 1 ? `1px solid ${S.soft}` : "none",
                  }}>
                    {/* meta strip */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" as const }}>
                      <span style={{ fontFamily: S.fontMono, fontSize: "0.4375rem", color: S.tertiary }}>{ev.ts}</span>
                      <span style={{ color: S.rim }}>·</span>
                      <span style={{
                        fontFamily: S.fontMono, fontSize: "0.4375rem", padding: "1px 4px",
                        border: `1px solid ${S.rim}`, color: S.tertiary, letterSpacing: "0.05em",
                      }}>{ev.region}</span>
                      <span style={{
                        fontFamily: S.fontMono, fontSize: "0.4375rem", padding: "1px 4px",
                        border: `1px solid ${S.cyan}`, color: S.cyan, letterSpacing: "0.05em",
                      }}>{ev.category}</span>
                      {ev.alertTriggered && (
                        <span style={{
                          fontFamily: S.fontMono, fontSize: "0.4375rem", padding: "1px 5px",
                          border: `1px solid ${S.fail}`, color: S.fail,
                          background: `color-mix(in srgb, var(--accent-red,#B91C1C) 6%, transparent)`,
                        }}>⚡ ALERT TRIGGERED</span>
                      )}
                      <span style={{ marginLeft: "auto", fontFamily: S.fontMono, fontSize: "0.5rem", color: severityColor, fontWeight: 600 }}>
                        SEV {ev.severity}
                      </span>
                    </div>

                    {/* headline */}
                    <div style={{ fontFamily: S.fontUI, fontSize: "0.75rem", fontWeight: 500, color: S.primary, lineHeight: 1.45, marginBottom: 8 }}>
                      {ev.headline}
                    </div>

                    {/* structured signals */}
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
                      <div style={{
                        fontFamily: S.fontMono, fontSize: "0.4375rem", padding: "2px 7px",
                        border: `1px solid ${S.soft}`, color: S.tertiary, letterSpacing: "0.04em",
                      }}>
                        RAW SIGNAL: <span style={{ color: S.secondary }}>{ev.rawSignal}</span>
                      </div>
                      <div style={{
                        fontFamily: S.fontMono, fontSize: "0.4375rem", padding: "2px 7px",
                        border: `1px solid ${S.soft}`, color: S.tertiary, letterSpacing: "0.04em",
                      }}>
                        IMPACT: <span style={{ color: severityColor }}>{ev.impact}</span>
                      </div>
                      <div style={{
                        fontFamily: S.fontMono, fontSize: "0.4375rem", padding: "2px 7px",
                        border: `1px solid ${S.soft}`, color: S.tertiary, letterSpacing: "0.04em",
                      }}>
                        CONF: <span style={{ color: S.pass }}>{ev.confidence}%</span>
                      </div>
                      <div style={{
                        fontFamily: S.fontMono, fontSize: "0.4375rem", padding: "2px 7px",
                        border: `1px solid ${S.soft}`, color: S.tertiary, letterSpacing: "0.04em",
                      }}>
                        ID: <span style={{ color: S.tertiary }}>{ev.id}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Right: Regime summary */}
            <aside style={{ padding: "20px 16px", background: S.bgSub, overflow: "auto" }}>
              <div style={{ fontFamily: S.fontMono, fontSize: "0.4375rem", color: S.tertiary, letterSpacing: "0.06em", marginBottom: 10 }}>
                CURRENT REGIME SIGNALS
              </div>
              {[
                { label: "USD/MXN Regime",       value: "BEARISH MXN",  color: S.fail },
                { label: "Rate Path (Fed)",       value: "HIGHER LONGER", color: S.amber },
                { label: "Rate Path (Banxico)",   value: "DOVISH",        color: S.amber },
                { label: "EM Risk Sentiment",     value: "RISK-OFF BIAS", color: S.amber },
                { label: "Mexico Sovereign",      value: "NEGATIVE WTG",  color: S.amber },
                { label: "Sanctions Environment", value: "ACTIVE RISK",   color: S.fail },
              ].map(({ label, value, color }, i, arr) => (
                <div key={label} style={{
                  display: "flex", flexDirection: "column", gap: 2, padding: "8px 0",
                  borderBottom: i < arr.length - 1 ? `1px solid ${S.soft}` : "none",
                }}>
                  <span style={{ fontFamily: S.fontUI, fontSize: "0.5625rem", color: S.tertiary }}>{label}</span>
                  <span style={{ fontFamily: S.fontMono, fontSize: "0.625rem", fontWeight: 700, color, letterSpacing: "0.03em" }}>{value}</span>
                </div>
              ))}

              <div style={{ marginTop: 20, paddingTop: 14, borderTop: `1px solid ${S.rim}` }}>
                <div style={{ fontFamily: S.fontMono, fontSize: "0.4375rem", color: S.tertiary, letterSpacing: "0.06em", marginBottom: 10 }}>
                  SOURCE CATEGORIES
                </div>
                {[
                  { label: "Central Bank", count: 2 },
                  { label: "Fiscal / Sovereign", count: 2 },
                  { label: "Sanctions / Regulatory", count: 1 },
                  { label: "Macro Data Release", count: 1 },
                ].map(({ label, count }) => (
                  <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: `1px solid ${S.soft}` }}>
                    <span style={{ fontFamily: S.fontUI, fontSize: "0.5rem", color: S.secondary }}>{label}</span>
                    <span style={{ fontFamily: S.fontMono, fontSize: "0.5rem", color: S.tertiary }}>{count}</span>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: "auto", paddingTop: 14, fontFamily: S.fontMono, fontSize: "0.4375rem", color: S.tertiary, letterSpacing: "0.04em" }}>
                Live ingestion pending · Static demo
              </div>
            </aside>
          </div>
        )}

        {/* ══════════ RISK SCORES ══════════ */}
        {tab === "Risk Scores" && !DEMO_MODE && (
          <div style={{ padding: "60px 28px" }}>
            <EmptyState
              type="empty"
              title="No risk scores"
              message="Connect a risk intelligence feed to see multi-dimensional risk score data."
            />
          </div>
        )}
        {tab === "Risk Scores" && DEMO_MODE && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 240px", height: "100%" }}>
            <div style={{ padding: "20px 24px", borderRight: `1px solid ${S.rim}`, overflow: "auto" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 8 }}>
                <span style={{ fontFamily: S.fontUI, fontSize: "0.8125rem", fontWeight: 600, color: S.primary }}>Risk Score Matrix</span>
                <span style={{ fontFamily: S.fontMono, fontSize: "0.5rem", color: S.tertiary }}>8 dimensions · as of {RENDER_TS}</span>
              </div>
              <div style={{ height: 1, background: S.rim, marginBottom: 0 }} />
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Risk Dimension", "Score", "Δ 7D", "Regime", "Primary Driver"].map((h, i) => (
                      <th key={h} style={{
                        padding: "6px 12px 6px 0", fontFamily: S.fontMono, fontSize: "0.4375rem",
                        letterSpacing: "0.07em", textTransform: "uppercase", color: S.tertiary,
                        textAlign: "left", borderBottom: `1px solid ${S.rim}`, whiteSpace: "nowrap",
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {RISK_SCORES.sort((a, b) => b.score - a.score).map((row, i) => (
                    <tr key={row.dimension} style={{ borderBottom: `1px solid ${S.soft}` }}>
                      <td style={{ padding: "10px 12px 10px 0", fontFamily: S.fontUI, fontSize: "0.6875rem", fontWeight: 500, color: S.primary }}>
                        {row.dimension}
                      </td>
                      <td style={{ padding: "10px 12px 10px 0" }}>
                        <ScoreBar score={row.score} />
                      </td>
                      <td style={{ padding: "10px 12px 10px 0", fontFamily: S.fontMono, fontSize: "0.5625rem", color: row.delta > 0 ? S.fail : S.pass }}>
                        {row.delta > 0 ? `+${row.delta}` : `${row.delta}`}
                      </td>
                      <td style={{ padding: "10px 12px 10px 0" }}>
                        <RegimeChip regime={row.regime} />
                      </td>
                      <td style={{ padding: "10px 0 10px 0", fontFamily: S.fontUI, fontSize: "0.5625rem", color: S.tertiary }}>
                        {row.driver}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Composite */}
              <div style={{ marginTop: 16, padding: "12px 16px", background: S.bgSub, border: `1px solid ${S.rim}`, display: "flex", gap: 24 }}>
                {[
                  { label: "COMPOSITE RISK SCORE", value: Math.round(RISK_SCORES.reduce((s, r) => s + r.score, 0) / RISK_SCORES.length), unit: "/ 100" },
                  { label: "HIGH REGIME DIMS", value: RISK_SCORES.filter(r => r.regime === "HIGH").length, unit: "dims" },
                  { label: "ELEVATED DIMS",    value: RISK_SCORES.filter(r => r.regime === "ELEVATED").length, unit: "dims" },
                  { label: "AVG 7D CHANGE",    value: `+${(RISK_SCORES.reduce((s, r) => s + r.delta, 0) / RISK_SCORES.length).toFixed(1)}`, unit: "pts" },
                ].map(({ label, value, unit }) => (
                  <div key={label} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ fontFamily: S.fontMono, fontSize: "0.4375rem", color: S.tertiary, letterSpacing: "0.05em" }}>{label}</span>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                      <span style={{ fontFamily: S.fontMono, fontSize: "1.25rem", fontWeight: 700, color: S.primary, lineHeight: 1 }}>{value}</span>
                      <span style={{ fontFamily: S.fontMono, fontSize: "0.5rem", color: S.tertiary }}>{unit}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <aside style={{ padding: "20px 16px", background: S.bgSub, overflow: "auto" }}>
              <div style={{ fontFamily: S.fontMono, fontSize: "0.4375rem", color: S.tertiary, letterSpacing: "0.06em", marginBottom: 10 }}>
                HEDGE IMPLICATIONS
              </div>
              {[
                { condition: "Score ≥ 80", implication: "Maximum hedge coverage · Board notification", color: S.fail },
                { condition: "Score 55–79", implication: "Standard program · Quarterly review", color: S.amber },
                { condition: "Score < 55", implication: "Conservative program · Annual review", color: S.pass },
              ].map(({ condition, implication, color }, i) => (
                <div key={condition} style={{ padding: "10px 10px", background: S.bgPanel, border: `1px solid ${S.rim}`, borderLeft: `3px solid ${color}`, marginBottom: 8 }}>
                  <div style={{ fontFamily: S.fontMono, fontSize: "0.4375rem", color, letterSpacing: "0.05em", marginBottom: 3 }}>{condition}</div>
                  <div style={{ fontFamily: S.fontUI, fontSize: "0.5625rem", color: S.secondary, lineHeight: 1.4 }}>{implication}</div>
                </div>
              ))}
              <div style={{ marginTop: 12, fontFamily: S.fontMono, fontSize: "0.4375rem", color: S.tertiary, letterSpacing: "0.04em" }}>
                Score methodology: Structured event weight × recency decay × confidence
              </div>
            </aside>
          </div>
        )}

        {/* ══════════ MACRO SCENARIOS ══════════ */}
        {tab === "Macro Scenarios" && !DEMO_MODE && (
          <div style={{ padding: "60px 28px" }}>
            <EmptyState
              type="empty"
              title="No macro scenarios"
              message="Connect a risk intelligence feed to see macro scenario projections and probability trees."
            />
          </div>
        )}
        {tab === "Macro Scenarios" && DEMO_MODE && (
          <div style={{ padding: "20px 28px", overflow: "auto" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 8 }}>
              <span style={{ fontFamily: S.fontUI, fontSize: "0.8125rem", fontWeight: 600, color: S.primary }}>Macro Scenario Tree</span>
              <span style={{ fontFamily: S.fontMono, fontSize: "0.5rem", color: S.tertiary }}>4 scenarios · probability sums to 100%</span>
            </div>
            <div style={{ height: 1, background: S.rim, marginBottom: 20 }} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {MACRO_SCENARIOS.map(sc => {
                const barColor = sc.riskScore >= 80 ? S.fail : sc.riskScore >= 60 ? S.amber : S.pass;
                return (
                  <div key={sc.id} style={{
                    padding: "16px 18px", background: S.bgPanel,
                    border: `1px solid ${S.rim}`,
                    borderLeft: `3px solid ${barColor}`,
                    position: "relative" as const,
                  }}>
                    {/* probability badge */}
                    <div style={{ position: "absolute", top: 14, right: 16, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                      <span style={{ fontFamily: S.fontMono, fontSize: "1.5rem", fontWeight: 700, color: barColor, lineHeight: 1 }}>{sc.probability}%</span>
                      <span style={{ fontFamily: S.fontMono, fontSize: "0.4375rem", color: S.tertiary }}>PROBABILITY</span>
                    </div>
                    <div style={{ fontFamily: S.fontMono, fontSize: "0.4375rem", color: S.tertiary, letterSpacing: "0.05em", marginBottom: 4 }}>{sc.id} · {sc.horizon}</div>
                    <div style={{ fontFamily: S.fontUI, fontSize: "0.8125rem", fontWeight: 700, color: S.primary, marginBottom: 10, maxWidth: "68%", lineHeight: 1.3 }}>
                      {sc.name}
                    </div>
                    <div style={{ height: 1, background: S.rim, marginBottom: 10 }} />
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <div style={{ display: "flex", gap: 8 }}>
                        <span style={{ fontFamily: S.fontMono, fontSize: "0.4375rem", color: S.tertiary, width: 80, flexShrink: 0 }}>USD/MXN PATH</span>
                        <span style={{ fontFamily: S.fontMono, fontSize: "0.5625rem", color: S.primary, fontWeight: 600 }}>{sc.usdmxnPath}</span>
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <span style={{ fontFamily: S.fontMono, fontSize: "0.4375rem", color: S.tertiary, width: 80, flexShrink: 0 }}>RISK SCORE</span>
                        <ScoreBar score={sc.riskScore} />
                      </div>
                      <div style={{ marginTop: 8, padding: "8px 10px", background: S.bgSub, border: `1px solid ${S.soft}` }}>
                        <div style={{ fontFamily: S.fontMono, fontSize: "0.4375rem", color: S.tertiary, letterSpacing: "0.05em", marginBottom: 4 }}>HEDGE IMPLICATION</div>
                        <div style={{ fontFamily: S.fontUI, fontSize: "0.6rem", color: S.secondary, lineHeight: 1.5 }}>{sc.hedgeImplication}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Probability bar */}
            <div style={{ marginTop: 20, padding: "14px 16px", background: S.bgSub, border: `1px solid ${S.rim}` }}>
              <div style={{ fontFamily: S.fontMono, fontSize: "0.4375rem", color: S.tertiary, letterSpacing: "0.06em", marginBottom: 8 }}>SCENARIO PROBABILITY DISTRIBUTION</div>
              <div style={{ display: "flex", height: 20, gap: 0, border: `1px solid ${S.rim}`, overflow: "hidden" }}>
                {MACRO_SCENARIOS.map((sc, i) => {
                  const barColor = sc.riskScore >= 80 ? S.fail : sc.riskScore >= 60 ? S.amber : S.pass;
                  return (
                    <div key={sc.id} style={{
                      width: `${sc.probability}%`, background: barColor,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      opacity: 0.75,
                      borderRight: i < MACRO_SCENARIOS.length - 1 ? `1px solid ${S.rim}` : "none",
                    }}>
                      <span style={{ fontFamily: S.fontMono, fontSize: "0.375rem", color: S.bgDeep, fontWeight: 700 }}>{sc.probability}%</span>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", gap: 16, marginTop: 6 }}>
                {MACRO_SCENARIOS.map(sc => (
                  <div key={sc.id} style={{ fontFamily: S.fontMono, fontSize: "0.4375rem", color: S.tertiary }}>{sc.id}: {sc.name.split(" ").slice(0, 2).join(" ")}…</div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ══════════ ALERT RULES ══════════ */}
        {tab === "Alert Rules" && !DEMO_MODE && (
          <div style={{ padding: "60px 28px" }}>
            <EmptyState
              type="empty"
              title="No alert rules"
              message="Configure a risk intelligence feed to define and manage alert rules."
            />
          </div>
        )}
        {tab === "Alert Rules" && DEMO_MODE && (
          <div style={{ padding: "20px 28px", overflow: "auto" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 8 }}>
              <span style={{ fontFamily: S.fontUI, fontSize: "0.8125rem", fontWeight: 600, color: S.primary }}>Alert Rule Registry</span>
              <span style={{ fontFamily: S.fontMono, fontSize: "0.5rem", color: S.tertiary }}>{ALERT_RULES.length} rules configured</span>
            </div>
            <div style={{ height: 1, background: S.rim, marginBottom: 0 }} />
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Rule ID", "Trigger Condition", "Automated Action", "Status", "Last Fired"].map(h => (
                    <th key={h} style={{
                      padding: "6px 12px 6px 0", fontFamily: S.fontMono, fontSize: "0.4375rem",
                      letterSpacing: "0.07em", textTransform: "uppercase", color: S.tertiary,
                      textAlign: "left", borderBottom: `1px solid ${S.rim}`, whiteSpace: "nowrap",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ALERT_RULES.map((rule, i) => {
                  const statusColor = rule.status === "FIRED" ? S.fail : S.pass;
                  return (
                    <tr key={rule.id} style={{ borderBottom: `1px solid ${S.soft}` }}>
                      <td style={{ padding: "10px 12px 10px 0", fontFamily: S.fontMono, fontSize: "0.5rem", color: S.tertiary }}>{rule.id}</td>
                      <td style={{ padding: "10px 12px 10px 0", fontFamily: S.fontMono, fontSize: "0.5625rem", color: S.secondary }}>{rule.trigger}</td>
                      <td style={{ padding: "10px 12px 10px 0", fontFamily: S.fontUI, fontSize: "0.6rem", color: S.secondary, lineHeight: 1.4 }}>{rule.action}</td>
                      <td style={{ padding: "10px 12px 10px 0" }}>
                        <span style={{
                          fontFamily: S.fontMono, fontSize: "0.4375rem", padding: "1px 5px",
                          border: `1px solid ${statusColor}`, color: statusColor,
                          background: `color-mix(in srgb, ${statusColor} 8%, transparent)`,
                        }}>● {rule.status}</span>
                      </td>
                      <td style={{ padding: "10px 0 10px 0", fontFamily: S.fontMono, fontSize: "0.5rem", color: S.tertiary }}>{rule.lastFired}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div style={{ marginTop: 24, padding: "16px 18px", background: S.bgSub, border: `1px solid ${S.rim}` }}>
              <div style={{ fontFamily: S.fontMono, fontSize: "0.4375rem", color: S.tertiary, letterSpacing: "0.06em", marginBottom: 10 }}>
                HOW POLISOPHIC ALERTS INTEGRATE WITH HEDGECORE
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                {[
                  { step: "01", title: "Event Ingested", desc: "Polisophic parses source (CB statement, press release, data feed) and classifies signal." },
                  { step: "02", title: "Score Updated", desc: "Risk dimensions recalculated using structured signal weight × confidence × recency decay." },
                  { step: "03", title: "Alert Evaluated", desc: "Rule engine checks thresholds. Fires alert to treasury inbox and optionally to HedgeCore engine." },
                ].map(({ step, title, desc }) => (
                  <div key={step} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontFamily: S.fontMono, fontSize: "0.75rem", fontWeight: 700, color: S.cyan }}>{step}</span>
                      <span style={{ fontFamily: S.fontUI, fontSize: "0.625rem", fontWeight: 600, color: S.primary }}>{title}</span>
                    </div>
                    <p style={{ fontFamily: S.fontUI, fontSize: "0.5625rem", color: S.secondary, lineHeight: 1.6, margin: 0 }}>{desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ======= MY EXPOSURE RISK TAB ======= */}
        {tab === "My Exposure Risk" && (
          <div style={{ padding: "20px 28px", overflow: "auto" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 8 }}>
              <span style={{ fontFamily: S.fontUI, fontSize: "0.8125rem", fontWeight: 600, color: S.primary }}>
                My Exposure Risk
              </span>
              <span style={{ fontFamily: S.fontMono, fontSize: "0.5rem", color: S.tertiary }}>
                {user?.branch?.name ?? "Branch"} · {exposureInfo.currency} exposure · {exposureInfo.pairs.join(", ")}
              </span>
              {!user && (
                <span style={{ fontFamily: S.fontMono, fontSize: "0.4375rem", color: S.amber }}>
                  LOGIN TO SEE PERSONALISED RISK
                </span>
              )}
            </div>
            <div style={{ height: 1, background: S.rim, marginBottom: 20 }} />

            {/* Risk alert banner */}
            <div style={{
              padding: "16px 20px",
              marginBottom: 20,
              border: `1px solid ${relevantScore.regime === "HIGH" ? S.fail : relevantScore.regime === "ELEVATED" ? S.amber : S.cyan}`,
              borderLeft: `4px solid ${relevantScore.regime === "HIGH" ? S.fail : relevantScore.regime === "ELEVATED" ? S.amber : S.cyan}`,
              background: relevantScore.regime === "HIGH"
                ? "color-mix(in srgb,var(--accent-red,#B91C1C) 8%,transparent)"
                : relevantScore.regime === "ELEVATED"
                ? "color-mix(in srgb,var(--accent-amber) 8%,transparent)"
                : "color-mix(in srgb,var(--accent-cyan) 8%,transparent)",
            }}>
              <div style={{ fontFamily: S.fontMono, fontSize: "0.4375rem", color: S.tertiary, letterSpacing: "0.07em", marginBottom: 6 }}>
                EXPOSURE RISK ALERT · {branchCode} BRANCH · {exposureInfo.currency}
              </div>
              <div style={{ fontFamily: S.fontUI, fontSize: "0.875rem", fontWeight: 600, color: S.primary, marginBottom: 8 }}>
                Your {exposureInfo.currency} exposure is facing {relevantScore.regime} risk
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" as const }}>
                <ScoreBar score={relevantScore.score} />
                <RegimeChip regime={relevantScore.regime} />
                <span style={{ fontFamily: S.fontUI, fontSize: "0.5625rem", color: S.secondary, flex: 1 }}>
                  {relevantScore.dimension}: {relevantScore.driver}
                </span>
              </div>
            </div>

            {/* Hedge implication */}
            <div style={{ padding: "14px 16px", background: S.bgSub, border: `1px solid ${S.rim}`, marginBottom: 20 }}>
              <div style={{ fontFamily: S.fontMono, fontSize: "0.4375rem", color: S.tertiary, letterSpacing: "0.06em", marginBottom: 8 }}>
                HEDGE IMPLICATION FOR {exposureInfo.currency} EXPOSURE
              </div>
              <div style={{ fontFamily: S.fontUI, fontSize: "0.6875rem", color: S.secondary, lineHeight: 1.6 }}>
                {relevantScore.regime === "HIGH"
                  ? `Maximum hedge coverage recommended (90-95%). Board notification required. Activate contingency swap lines for ${exposureInfo.pairs[0]}.`
                  : relevantScore.regime === "ELEVATED"
                  ? `Maintain 80% NDF program. Consider adding tenor extension to ladder for ${exposureInfo.pairs[0]}. Quarterly review scheduled.`
                  : `Standard hedge program adequate (65-75% coverage). Annual review on schedule. No immediate action required for ${exposureInfo.pairs.join(", ")}.`
                }
              </div>
            </div>

            {/* Relevant events */}
            <div style={{ fontFamily: S.fontUI, fontSize: "0.75rem", fontWeight: 600, color: S.primary, marginBottom: 8 }}>
              Relevant Events for Your Portfolio
            </div>
            <div style={{ height: 1, background: S.rim, marginBottom: 0 }} />
            {(relevantEvents.length > 0 ? relevantEvents : RISK_EVENTS.slice(0, 3)).map((ev, i, arr) => {
              const sev = ev.severity >= 75 ? S.fail : ev.severity >= 55 ? S.amber : S.secondary;
              return (
                <div key={ev.id} style={{ padding: "12px 0", borderBottom: i < arr.length - 1 ? `1px solid ${S.soft}` : "none" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5, flexWrap: "wrap" as const }}>
                    <span style={{ fontFamily: S.fontMono, fontSize: "0.4375rem", color: S.tertiary }}>{ev.ts}</span>
                    <span style={{ fontFamily: S.fontMono, fontSize: "0.4375rem", padding: "1px 4px", border: `1px solid ${S.cyan}`, color: S.cyan }}>{ev.category}</span>
                    {ev.alertTriggered && (
                      <span style={{ fontFamily: S.fontMono, fontSize: "0.4375rem", padding: "1px 5px", border: `1px solid ${S.fail}`, color: S.fail }}>ALERT</span>
                    )}
                    <span style={{ marginLeft: "auto", fontFamily: S.fontMono, fontSize: "0.5rem", color: sev, fontWeight: 600 }}>SEV {ev.severity}</span>
                  </div>
                  <div style={{ fontFamily: S.fontUI, fontSize: "0.6875rem", color: S.primary, lineHeight: 1.45 }}>{ev.headline}</div>
                </div>
              );
            })}

            {/* Back link */}
            <div style={{ marginTop: 24, display: "flex", justifyContent: "flex-end" }}>
              <a href="/dashboard" style={{
                fontFamily: S.fontMono, fontSize: "0.5rem", letterSpacing: "0.06em",
                padding: "4px 10px", border: `1px solid ${S.rim}`, color: S.tertiary,
                textDecoration: "none",
              }}>
                Back to Dashboard
              </a>
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
        <span>HedgeCore · Polisophic</span>
        <span style={{ color: S.rim }}>·</span>
        <span>Political & Macro Risk Intelligence Engine</span>
        <span style={{ color: S.rim }}>·</span>
        <span>{DEMO_MODE ? "Static Demo" : "Feed disconnected"} · {RENDER_TS}</span>
      </footer>
    </div>
  );
}
