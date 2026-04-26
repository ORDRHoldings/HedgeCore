"use client";

import { useState, useEffect } from "react";
import { useAuth } from "../../lib/authContext";
import { useRouter } from "next/navigation";
import HelpPanel from "@/components/layout/HelpPanel";
import { POLISOPHIC_HELP } from "@/lib/helpContent";
import { usePlanRedirect } from "@/lib/hooks/usePlanRedirect";
import { PageShell } from "@/components/layout/PageShell";
import { Shield, Activity, Globe, TrendingUp, ChevronRight, Zap, Radio } from "lucide-react";
import { useIsMobile } from "@/lib/hooks/useBreakpoint";

function useRenderTs(): string {
  const [renderTs, setRenderTs] = useState("");
  useEffect(() => { setRenderTs(new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC"); }, []);
  return renderTs;
}

/* ═══════════════════════════════════════════════════════
   Design tokens — White + Navy (matches portfolio-risk)
   ═══════════════════════════════════════════════════════ */

const C = {
  fontUI: "'IBM Plex Sans', -apple-system, sans-serif",
  fontMono: "'IBM Plex Mono', monospace",
  fontHead: "'Manrope', 'IBM Plex Sans', sans-serif",
  pageBg: "#f0f2f7",
  cardBg: "#ffffff",
  cardBgAlt: "#f8fafd",
  headerGradient: "linear-gradient(135deg, #0c1929 0%, #162d50 50%, #1a3a5f 100%)",
  textPrimary: "#0f172a",
  textSecondary: "#475569",
  textTertiary: "#94a3b8",
  textMuted: "#cbd5e1",
  navy: "#0c1929",
  blue: "#1e3a5f",
  blueMid: "#2563eb",
  blueVivid: "#3b82f6",
  blueSky: "#0ea5e9",
  bluePale: "#e8f0fe",
  blueGlow: "rgba(37,99,235,0.12)",
  red: "#ef4444",
  redSoft: "rgba(239,68,68,0.08)",
  amber: "#f59e0b",
  amberSoft: "rgba(245,158,11,0.08)",
  green: "#22c55e",
  greenSoft: "rgba(34,197,94,0.08)",
  border: "#e2e8f0",
  borderLight: "#f1f5f9",
  shadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
  shadowLift: "0 8px 25px rgba(0,0,0,0.08), 0 4px 10px rgba(0,0,0,0.04)",
  radius: 10,
  white: "#fff",
  redDeep: "#dc2626",
  amberDeep: "#d97706",
  greenDeep: "#16a34a",
  redLite: "#fca5a5",
  amberLite: "#fcd34d",
  blueLite: "#93c5fd",
  navyLite: "#0c1e3f",
} as const;

/* ═══════════════════════════════════════════════════════
   Static Data — updated March 2026
   ═══════════════════════════════════════════════════════ */

const RISK_EVENTS = [
  { id: "EVT-2026-0312", ts: "2026-03-12 09:15 UTC", source: "US BLS Employment", region: "USA", category: "MACRO DATA", headline: "US NFP +312K vs +185K consensus; wage growth +4.3% YoY — Fed cut repricing accelerates", rawSignal: "labor_beat", impact: "USD_STRENGTHENING", severity: 81, confidence: 99, alertTriggered: true },
  { id: "EVT-2026-0311", ts: "2026-03-11 14:30 UTC", source: "Banxico Governor", region: "MEX", category: "CENTRAL BANK", headline: "Banxico signals 50bps cut at April meeting; core inflation falling faster than forecast at 3.8% YoY", rawSignal: "dovish_guidance", impact: "MXN_WEAKENING", severity: 74, confidence: 92, alertTriggered: true },
  { id: "EVT-2026-0310", ts: "2026-03-10 18:00 UTC", source: "US Treasury / OFAC", region: "USA", category: "SANCTIONS", headline: "OFAC designates 14 new entities across EM corridors; secondary sanctions on energy intermediaries expanded", rawSignal: "sanctions_expansion", impact: "COUNTERPARTY_RISK", severity: 87, confidence: 97, alertTriggered: true },
  { id: "EVT-2026-0309", ts: "2026-03-09 07:45 UTC", source: "NBS China Data", region: "CHN", category: "MACRO DATA", headline: "China Caixin PMI slips to 47.9 in Feb, fourth consecutive month below 50; property sector drag persists", rawSignal: "pmi_contraction", impact: "EM_CONTAGION_RISK", severity: 73, confidence: 94, alertTriggered: true },
  { id: "EVT-2026-0308", ts: "2026-03-08 12:00 UTC", source: "SHCP Budget Update", region: "MEX", category: "FISCAL", headline: "Mexico revises 2026 deficit to 4.3% of GDP; Pemex receives additional $6B fiscal transfer commitment", rawSignal: "fiscal_deterioration", impact: "SOVEREIGN_SPREAD", severity: 66, confidence: 90, alertTriggered: false },
  { id: "EVT-2026-0307", ts: "2026-03-07 16:20 UTC", source: "Fed Chair Powell", region: "USA", category: "CENTRAL BANK", headline: "Powell reaffirms data-dependent approach; markets now price first cut in September 2026 vs prior June", rawSignal: "hawkish_hold", impact: "RATES_UP", severity: 79, confidence: 96, alertTriggered: true },
  { id: "EVT-2026-0306", ts: "2026-03-06 10:30 UTC", source: "Moody's Sovereign", region: "MEX", category: "CREDIT RATING", headline: "Moody's places Mexico on review for downgrade citing fiscal trajectory and Pemex contingent liabilities", rawSignal: "review_downgrade", impact: "CDS_WIDENING", severity: 77, confidence: 99, alertTriggered: true },
  { id: "EVT-2026-0305", ts: "2026-03-05 08:00 UTC", source: "ECB Rate Decision", region: "EUR", category: "CENTRAL BANK", headline: "ECB cuts deposit rate 25bps to 2.50%; signals further easing as HICP falls to 1.9% target", rawSignal: "dovish_cut", impact: "EUR_WEAKENING", severity: 48, confidence: 99, alertTriggered: false },
  { id: "EVT-2026-0304", ts: "2026-03-04 13:00 UTC", source: "Pentagon / CENTCOM", region: "MENA", category: "GEOPOLITICAL", headline: "Red Sea shipping insurance costs surge 340%; major carriers suspend Suez transits amid escalating attacks", rawSignal: "geopolitical_escalation", impact: "OIL_SUPPLY_RISK", severity: 84, confidence: 95, alertTriggered: true },
  { id: "EVT-2026-0303", ts: "2026-03-03 11:15 UTC", source: "RBI MPC Decision", region: "IND", category: "CENTRAL BANK", headline: "India RBI holds repo at 6.50% as expected; upgrades growth forecast to 7.2% for FY26", rawSignal: "neutral_hold", impact: "INR_STABLE", severity: 28, confidence: 91, alertTriggered: false },
  { id: "EVT-2026-0302", ts: "2026-03-02 09:30 UTC", source: "Lula Cabinet / FAZENDA", region: "BRA", category: "FISCAL", headline: "Brazil supplementary budget adds BRL 95bn in spending; fiscal framework credibility under strain", rawSignal: "fiscal_expansion", impact: "BRL_PRESSURE", severity: 69, confidence: 88, alertTriggered: false },
  { id: "EVT-2026-0301", ts: "2026-03-01 15:45 UTC", source: "BOJ Governor Ueda", region: "JPN", category: "CENTRAL BANK", headline: "BOJ signals potential rate hike to 0.50% at April meeting; JPY strengthens 1.8% on hawkish pivot", rawSignal: "hawkish_pivot", impact: "JPY_STRENGTHENING", severity: 62, confidence: 93, alertTriggered: false },
];

const RISK_SCORES = [
  { dimension: "MXN Exchange Rate Pressure", score: 78, delta: +6, regime: "HIGH", driver: "Banxico dovish + NFP beat + Moody's review" },
  { dimension: "US Interest Rate Trajectory", score: 82, delta: -1, regime: "HIGH", driver: "Powell hawkish hold, NFP beat, Sep cut pricing" },
  { dimension: "Mexico Sovereign Credit Risk", score: 71, delta: +9, regime: "ELEVATED", driver: "Moody's review, deficit 4.3%, Pemex transfers" },
  { dimension: "Middle East Supply Chain Risk", score: 79, delta: +5, regime: "HIGH", driver: "Red Sea disruption, insurance surge 340%" },
  { dimension: "EM Capital Flow Reversal", score: 69, delta: +3, regime: "ELEVATED", driver: "UST yield differential, risk-off rotation" },
  { dimension: "Geopolitical Sanctions Exposure", score: 62, delta: +14, regime: "ELEVATED", driver: "OFAC 14 new entities, energy intermediaries" },
  { dimension: "Mexico Fiscal Stability", score: 64, delta: +8, regime: "ELEVATED", driver: "Deficit 4.3% GDP, Pemex $6B fiscal transfer" },
  { dimension: "Global Liquidity Conditions", score: 72, delta: -2, regime: "ELEVATED", driver: "Fed QT continues, ECB easing partially offsets" },
  { dimension: "China Slowdown Contagion", score: 60, delta: -1, regime: "MODERATE", driver: "PMI 47.9 — 4th month contraction, property drag" },
  { dimension: "Brazil Political Risk", score: 56, delta: +4, regime: "MODERATE", driver: "BRL 95bn supplementary budget, fiscal strain" },
  { dimension: "Counterparty Credit Environment", score: 51, delta: +3, regime: "MODERATE", driver: "IG spreads widening, sanctions compliance cost" },
  { dimension: "ECB Policy Divergence", score: 42, delta: -3, regime: "MODERATE", driver: "ECB cutting into easing cycle; low direct impact" },
];

const MACRO_SCENARIOS = [
  { id: "MSC-A", name: "Soft Landing + MXN Recovery", probability: 18, usdmxnPath: "17.50-18.20", hedgeImplication: "Reduce confirmed hedge ratio to 60%. Opportunistic option layer for downside.", riskScore: 32, horizon: "Q3 2026" },
  { id: "MSC-B", name: "Fed Higher-for-Longer + MXN Drift", probability: 35, usdmxnPath: "19.80-21.50", hedgeImplication: "Maintain 80% NDF program. Extend 3M tenor ladder. Monitor Banxico spread.", riskScore: 70, horizon: "Q2-Q3 2026" },
  { id: "MSC-C", name: "Mexico Fiscal Shock + Downgrade", probability: 18, usdmxnPath: "21.50-25.00", hedgeImplication: "Increase to 90% confirmed, 75% forecast. Board escalation. Counterparty review.", riskScore: 89, horizon: "Q2-Q4 2026" },
  { id: "MSC-D", name: "Global Risk-Off / EM Sell-Off", probability: 12, usdmxnPath: "22.50-27.00", hedgeImplication: "Maximum coverage 95%. Activate contingency swap lines. Daily monitoring.", riskScore: 96, horizon: "Q2 2026" },
  { id: "MSC-E", name: "ECB Easing + EUR Carry Unwind", probability: 8, usdmxnPath: "18.50-19.50", hedgeImplication: "Standard program sufficient. Monitor EUR/MXN cross exposure.", riskScore: 45, horizon: "Q3 2026" },
  { id: "MSC-F", name: "Middle East Escalation + Oil Spike", probability: 7, usdmxnPath: "20.50-23.00", hedgeImplication: "85% confirmed + energy hedges. Shipping cost pass-through review.", riskScore: 92, horizon: "Q2 2026" },
  { id: "MSC-G", name: "China Hard Landing + EM Contagion", probability: 2, usdmxnPath: "24.00-28.00", hedgeImplication: "95% max coverage. Board emergency session. Full stress test.", riskScore: 97, horizon: "Q3-Q4 2026" },
];

const ALERT_RULES = [
  { id: "ALR-001", trigger: "MXN score >= 75", action: "Notify Treasury + Risk; auto-schedule hedge review", status: "FIRED", lastFired: "2026-03-11" },
  { id: "ALR-002", trigger: "Sovereign CDS > 180bps", action: "Escalate to CFO; freeze new FX exposure approvals", status: "ARMED", lastFired: "2026-02-28" },
  { id: "ALR-003", trigger: "FOMC event + score delta > 10", action: "Re-run hedge ladder with updated rate curve", status: "FIRED", lastFired: "2026-03-07" },
  { id: "ALR-004", trigger: "Sanctions event (OFAC)", action: "Counterparty eligibility re-check; halt new trades", status: "FIRED", lastFired: "2026-03-10" },
  { id: "ALR-005", trigger: "Scenario C probability > 25%", action: "Board risk memo; activate contingency protocol", status: "ARMED", lastFired: "—" },
  { id: "ALR-006", trigger: "Middle East score >= 80", action: "Oil hedge review; shipping cost pass-through analysis", status: "ARMED", lastFired: "—" },
  { id: "ALR-007", trigger: "China PMI < 49.0", action: "EM contagion scan; review Asia-linked receivables", status: "FIRED", lastFired: "2026-03-09" },
  { id: "ALR-008", trigger: "Composite score >= 75", action: "Emergency board meeting; full portfolio stress test", status: "ARMED", lastFired: "—" },
];

const HEATMAP_REGIONS = [
  { name: "North America", score: 76, regime: "HIGH", driver: "Fed hawkish hold, NFP beat, MXN pressure" },
  { name: "Western Europe", score: 44, regime: "MODERATE", driver: "ECB easing, HICP at target, growth soft" },
  { name: "Eastern Europe", score: 85, regime: "HIGH", driver: "Ukraine conflict, NATO expansion, energy" },
  { name: "Middle East", score: 82, regime: "HIGH", driver: "Red Sea disruption, oil premium, insurance surge" },
  { name: "East Asia", score: 58, regime: "ELEVATED", driver: "China PMI contraction, BOJ pivot, Taiwan" },
  { name: "Latin America", score: 72, regime: "ELEVATED", driver: "Mexico fiscal, Brazil spending, Banxico" },
  { name: "Sub-Saharan Africa", score: 46, regime: "MODERATE", driver: "Debt distress contained, FX illiquidity" },
  { name: "South & SE Asia", score: 38, regime: "MODERATE", driver: "India stable growth 7.2%, Vietnam flows" },
];

/* ═══════════════════════════════════════════════════════
   Visual Primitives
   ═══════════════════════════════════════════════════════ */

function RegimeBadge({ regime }: { regime: string }) {
  const cfg: Record<string, { color: string; bg: string; glow: string }> = {
    HIGH: { color: C.white, bg: `linear-gradient(135deg, ${C.redDeep}, ${C.red})`, glow: "0 2px 8px rgba(239,68,68,0.3)" },
    ELEVATED: { color: C.white, bg: `linear-gradient(135deg, ${C.amberDeep}, ${C.amber})`, glow: "0 2px 8px rgba(245,158,11,0.3)" },
    MODERATE: { color: C.textSecondary, bg: C.borderLight, glow: "none" },
    LOW: { color: C.white, bg: `linear-gradient(135deg, ${C.greenDeep}, ${C.green})`, glow: "0 2px 8px rgba(34,197,94,0.3)" },
  };
  const { color, bg, glow } = cfg[regime] ?? cfg.MODERATE;
  return (
    <span style={{
      fontFamily: C.fontMono, fontSize: 10, letterSpacing: "0.1em", fontWeight: 700,
      padding: "3px 10px", borderRadius: 20, color, background: bg, boxShadow: glow,
      display: "inline-block", lineHeight: 1.4,
    }}>{regime}</span>
  );
}

function ScoreBar({ score, max = 100 }: { score: number; max?: number }) {
  const pct = (score / max) * 100;
  const grad = score >= 75 ? "linear-gradient(90deg, #ef4444, #dc2626)" : score >= 55 ? "linear-gradient(90deg, #f59e0b, #eab308)" : "linear-gradient(90deg, #22c55e, #16a34a)";
  const color = score >= 75 ? C.red : score >= 55 ? C.amber : C.green;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ width: 80, height: 6, background: C.borderLight, borderRadius: 3, position: "relative" as const, overflow: "hidden" }}>
        <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${pct}%`, background: grad, borderRadius: 3, transition: "width 0.5s" }} />
      </div>
      <span style={{ fontFamily: C.fontMono, fontSize: 13, color, fontWeight: 700, minWidth: 24 }}>{score}</span>
    </div>
  );
}

function Card({ children, style, hover }: { children: React.ReactNode; style?: React.CSSProperties; hover?: boolean }) {
  return (
    <div className={hover ? "o-card-hover" : undefined} style={{
      background: C.cardBg, borderRadius: C.radius, border: `1px solid ${C.border}`,
      boxShadow: C.shadow, overflow: "hidden", ...style,
    }}>{children}</div>
  );
}

/* ═══════════════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════════════ */

export default function Polisophic() {
  const _planAllowed = usePlanRedirect("enterprise");
  const renderTs = useRenderTs();
  const router = useRouter();
  const { user } = useAuth();
  const [tab, setTab] = useState(0);
  const isMobile = useIsMobile();

  if (!_planAllowed) return null;

  const tabDefs = [
    { label: "EVENT FEED", icon: Radio },
    { label: "RISK SCORES", icon: Activity },
    { label: "MACRO SCENARIOS", icon: TrendingUp },
    { label: "ALERT RULES", icon: Zap },
    { label: "RISK HEATMAP", icon: Globe },
    { label: "MY EXPOSURE", icon: Shield },
  ];

  const compositeScore = Math.round(RISK_SCORES.reduce((s, r) => s + r.score, 0) / RISK_SCORES.length);
  const highCount = RISK_SCORES.filter(r => r.regime === "HIGH").length;
  const elevatedCount = RISK_SCORES.filter(r => r.regime === "ELEVATED").length;
  const firedAlerts = ALERT_RULES.filter(r => r.status === "FIRED").length;

  // Branch exposure for My Exposure tab
  const BRANCH_CURRENCY: Record<string, { currency: string; pairs: string[]; regimeKey: string }> = {
    NYC: { currency: "USD", pairs: ["USD/MXN", "USD/GBP"], regimeKey: "US Interest Rate Trajectory" },
    MXC: { currency: "MXN", pairs: ["USD/MXN", "MXN/EUR"], regimeKey: "MXN Exchange Rate Pressure" },
    LDN: { currency: "GBP", pairs: ["GBP/USD", "GBP/EUR"], regimeKey: "US Interest Rate Trajectory" },
  };
  const branchCode = user?.branch?.code?.toUpperCase() ?? "NYC";
  const exposureInfo = BRANCH_CURRENCY[branchCode] ?? BRANCH_CURRENCY["NYC"];
  const relevantScore = RISK_SCORES.find(r => r.dimension === exposureInfo.regimeKey) ?? RISK_SCORES[0];

  return (
    <PageShell icon={Shield} title="Polisophic" breadcrumb={["Dashboard", "Polisophic"]} noPadding>
    <div style={{ minHeight: "100%", display: "flex", flexDirection: "column", background: C.pageBg, fontFamily: C.fontUI, color: C.textPrimary }}>

      <style>{`
        .o-card-hover { transition: all 0.25s cubic-bezier(0.4,0,0.2,1); }
        .o-card-hover:hover { transform: translateY(-3px); box-shadow: ${C.shadowLift} !important; border-color: ${C.blueMid}30 !important; }
        .o-tab-btn { transition: all 0.2s ease; border: none; cursor: pointer; background: transparent; }
        .o-tab-btn:hover { background: rgba(37,99,235,0.06) !important; }
        .o-trow { transition: background 0.15s ease; }
        .o-trow:hover { background: ${C.bluePale} !important; }
        @keyframes pulse-dot { 0%,100%{opacity:1} 50%{opacity:0.4} }
      `}</style>

      {/* ══════════ HEADER ══════════ */}
      <header style={{
        display: "flex", alignItems: "center", gap: 16, height: 64,
        padding: "0 28px", background: C.headerGradient, flexShrink: 0,
      }}>
        <button onClick={() => router.push("/")} style={{
          fontFamily: C.fontMono, fontSize: 11, color: "rgba(255,255,255,0.6)",
          background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
          padding: "6px 14px", cursor: "pointer", borderRadius: 8,
        }}>HOME</button>
        <div style={{ width: 1, height: 32, background: "rgba(255,255,255,0.1)" }} />
        <div>
          <div style={{ fontFamily: C.fontHead, fontSize: 16, fontWeight: 800, color: C.white }}>Polisophic</div>
          <div style={{ fontFamily: C.fontMono, fontSize: 11, color: "rgba(255,255,255,0.4)", letterSpacing: "0.06em" }}>
            POLITICAL & MACRO RISK INTELLIGENCE
          </div>
        </div>
        <div style={{ flex: 1 }} />

        {/* Header KPIs */}
        <div style={{ display: "flex", gap: 8, flexWrap: isMobile ? "wrap" : "nowrap" }}>
        {[
          { label: "COMPOSITE", value: `${compositeScore}`, color: compositeScore >= 70 ? C.redLite : C.amberLite },
          { label: "HIGH DIMS", value: `${highCount}`, color: C.redLite },
          { label: "ELEVATED", value: `${elevatedCount}`, color: C.amberLite },
          { label: "ALERTS", value: `${firedAlerts} FIRED`, color: C.redLite },
          { label: "EVENTS", value: `${RISK_EVENTS.length}`, color: C.blueLite },
        ].map(({ label, value, color }) => (
          <div key={label} style={{
            padding: "8px 14px", background: "rgba(255,255,255,0.04)", borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.06)",
          }}>
            <div style={{ fontFamily: C.fontMono, fontSize: 10, color: "rgba(255,255,255,0.35)", letterSpacing: "0.08em" }}>{label}</div>
            <div style={{ fontFamily: C.fontMono, fontSize: 16, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
          </div>
        ))}
        <span style={{ fontFamily: C.fontMono, fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{renderTs}</span>
        </div>
      </header>

      {/* ══════════ TAB BAR ══════════ */}
      <div style={{
        display: "flex", alignItems: "center", background: C.cardBg,
        borderBottom: `1px solid ${C.border}`, padding: "0 28px", height: 46, flexShrink: 0, gap: 2,
      }}>
        {tabDefs.map((t, i) => {
          const Icon = t.icon;
          const active = tab === i;
          return (
            <button key={i} onClick={() => setTab(i)} className="o-tab-btn" style={{
              fontFamily: C.fontMono, fontSize: 12, fontWeight: active ? 700 : 500,
              padding: "0 16px", height: "100%", display: "flex", alignItems: "center", gap: 6,
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
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{
            fontFamily: C.fontMono, fontSize: 10, fontWeight: 700, padding: "4px 12px", borderRadius: 20,
            color: C.white, background: `linear-gradient(135deg, ${C.redDeep}, ${C.red})`,
            boxShadow: "0 2px 8px rgba(239,68,68,0.3)",
          }}>{firedAlerts} ACTIVE ALERTS</span>
          <span style={{ fontFamily: C.fontMono, fontSize: 10, fontWeight: 600, padding: "4px 12px", borderRadius: 20, color: C.blueMid, background: C.blueGlow }}>STATIC DATA</span>
        </div>
      </div>

      {/* ══════════ CONTENT ══════════ */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
      <div style={{ flex: 1, overflow: "auto", padding: 0 }}>

        {/* ══ TAB 0: EVENT FEED ══ */}
        {tab === 0 && (
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 280px", height: "100%" }}>
            <div style={{ padding: isMobile ? "12px 16px" : "20px 24px", overflow: "auto" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <Radio size={16} color={C.blueMid} />
                <span style={{ fontFamily: C.fontHead, fontSize: 14, fontWeight: 700 }}>Structured Event Feed</span>
                <span style={{ fontFamily: C.fontMono, fontSize: 11, color: C.textTertiary }}>{RISK_EVENTS.length} events · last 12 days</span>
              </div>

              {RISK_EVENTS.map((ev, _i) => {
                const sevColor = ev.severity >= 75 ? C.red : ev.severity >= 55 ? C.amber : C.green;
                return (
                  <Card key={ev.id} style={{ marginBottom: 10, borderLeft: `4px solid ${sevColor}` }}>
                    <div style={{ padding: "14px 18px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" as const }}>
                        <span style={{ fontFamily: C.fontMono, fontSize: 11, color: C.textTertiary }}>{ev.ts}</span>
                        <span style={{ fontFamily: C.fontMono, fontSize: 10, padding: "2px 8px", borderRadius: 20, color: C.blueMid, background: C.blueGlow, fontWeight: 600 }}>{ev.region}</span>
                        <span style={{ fontFamily: C.fontMono, fontSize: 10, padding: "2px 8px", borderRadius: 20, color: C.blueSky, background: `${C.blueSky}12`, fontWeight: 600 }}>{ev.category}</span>
                        {ev.alertTriggered && (
                          <span style={{ fontFamily: C.fontMono, fontSize: 10, padding: "2px 8px", borderRadius: 20, color: C.white, background: `linear-gradient(135deg, ${C.redDeep}, ${C.red})`, fontWeight: 700 }}>
                            ALERT
                          </span>
                        )}
                        <div style={{ flex: 1 }} />
                        <span style={{
                          fontFamily: C.fontMono, fontSize: 12, fontWeight: 800, color: sevColor,
                          padding: "2px 10px", borderRadius: 6, background: ev.severity >= 75 ? C.redSoft : ev.severity >= 55 ? C.amberSoft : C.greenSoft,
                        }}>SEV {ev.severity}</span>
                      </div>

                      <div style={{ fontFamily: C.fontUI, fontSize: 13, fontWeight: 500, color: C.textPrimary, lineHeight: 1.5, marginBottom: 10 }}>
                        {ev.headline}
                      </div>

                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
                        {[
                          { label: "SIGNAL", value: ev.rawSignal, color: C.textSecondary },
                          { label: "IMPACT", value: ev.impact, color: sevColor },
                          { label: "CONF", value: `${ev.confidence}%`, color: C.green },
                          { label: "ID", value: ev.id, color: C.textTertiary },
                        ].map(({ label, value, color }) => (
                          <span key={label} style={{
                            fontFamily: C.fontMono, fontSize: 10, padding: "3px 8px",
                            borderRadius: 6, border: `1px solid ${C.border}`, color: C.textTertiary, background: C.cardBgAlt,
                          }}>
                            {label}: <span style={{ color, fontWeight: 600 }}>{value}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>

            {/* Sidebar */}
            <aside style={{ padding: "20px 16px", background: C.cardBg, overflow: "auto", borderLeft: `1px solid ${C.border}` }}>
              <div style={{ fontFamily: C.fontMono, fontSize: 10, color: C.blueMid, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 12 }}>CURRENT REGIME SIGNALS</div>
              {[
                { label: "USD/MXN Regime", value: "BEARISH MXN", color: C.red },
                { label: "Rate Path (Fed)", value: "HIGHER LONGER", color: C.amber },
                { label: "Rate Path (Banxico)", value: "DOVISH CUT", color: C.amber },
                { label: "EM Risk Sentiment", value: "RISK-OFF BIAS", color: C.amber },
                { label: "Mexico Sovereign", value: "REVIEW DOWNGRADE", color: C.red },
                { label: "Sanctions", value: "ACTIVE EXPANSION", color: C.red },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ padding: "8px 0", borderBottom: `1px solid ${C.borderLight}` }}>
                  <div style={{ fontFamily: C.fontUI, fontSize: 12, color: C.textTertiary }}>{label}</div>
                  <div style={{ fontFamily: C.fontMono, fontSize: 11, fontWeight: 700, color }}>{value}</div>
                </div>
              ))}

              <div style={{ marginTop: 20, paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
                <div style={{ fontFamily: C.fontMono, fontSize: 10, color: C.blueMid, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 10 }}>SOURCE BREAKDOWN</div>
                {[
                  { label: "Central Bank", count: 5, pct: 42 },
                  { label: "Fiscal / Sovereign", count: 3, pct: 25 },
                  { label: "Sanctions / Regulatory", count: 1, pct: 8 },
                  { label: "Macro Data Release", count: 2, pct: 17 },
                  { label: "Geopolitical", count: 1, pct: 8 },
                ].map(({ label, count, pct }) => (
                  <div key={label} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: `1px solid ${C.borderLight}` }}>
                    <span style={{ fontFamily: C.fontUI, fontSize: 12, color: C.textSecondary, flex: 1 }}>{label}</span>
                    <div style={{ width: 40, height: 4, background: C.borderLight, borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: C.blueMid, borderRadius: 2 }} />
                    </div>
                    <span style={{ fontFamily: C.fontMono, fontSize: 11, color: C.textTertiary, width: 16, textAlign: "right" as const }}>{count}</span>
                  </div>
                ))}
              </div>
            </aside>
          </div>
        )}

        {/* ══ TAB 1: RISK SCORES ══ */}
        {tab === 1 && (
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 280px", height: "100%" }}>
            <div style={{ padding: isMobile ? "12px 16px" : "20px 24px", overflow: "auto" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <Activity size={16} color={C.blueMid} />
                <span style={{ fontFamily: C.fontHead, fontSize: 14, fontWeight: 700 }}>Risk Score Matrix</span>
                <span style={{ fontFamily: C.fontMono, fontSize: 11, color: C.textTertiary }}>{RISK_SCORES.length} dimensions · {renderTs}</span>
              </div>

              {/* Composite KPIs */}
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
                {[
                  { label: "COMPOSITE SCORE", value: `${compositeScore}`, sub: "/ 100", color: compositeScore >= 70 ? C.red : C.amber },
                  { label: "HIGH REGIME", value: `${highCount}`, sub: "dimensions", color: C.red },
                  { label: "ELEVATED", value: `${elevatedCount}`, sub: "dimensions", color: C.amber },
                  { label: "AVG 7D CHANGE", value: `+${(RISK_SCORES.reduce((s, r) => s + r.delta, 0) / RISK_SCORES.length).toFixed(1)}`, sub: "points", color: C.red },
                ].map(({ label, value, sub, color }) => (
                  <Card key={label} hover style={{ padding: "14px 16px" }}>
                    <div style={{ fontFamily: C.fontMono, fontSize: 10, color: C.textTertiary, letterSpacing: "0.08em", marginBottom: 6 }}>{label}</div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                      <span style={{ fontFamily: C.fontMono, fontSize: 24, fontWeight: 800, color, lineHeight: 1 }}>{value}</span>
                      <span style={{ fontFamily: C.fontMono, fontSize: 11, color: C.textTertiary }}>{sub}</span>
                    </div>
                  </Card>
                ))}
              </div>

              {/* Score table */}
              <Card>
                <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: C.headerGradient }}>
                      {["RISK DIMENSION", "SCORE", "", "7D DELTA", "REGIME", "PRIMARY DRIVER"].map(h => (
                        <th scope="col" key={h} style={{ padding: "10px 12px", fontFamily: C.fontMono, fontSize: 10, letterSpacing: "0.1em", color: "rgba(255,255,255,0.7)", fontWeight: 600, textAlign: "left" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {RISK_SCORES.slice().sort((a, b) => b.score - a.score).map((row, idx) => (
                      <tr key={row.dimension} className="o-trow" style={{ borderBottom: `1px solid ${C.borderLight}`, background: idx % 2 === 0 ? C.cardBg : C.cardBgAlt }}>
                        <td style={{ padding: "12px 12px", fontFamily: C.fontUI, fontSize: 13, fontWeight: 600, color: C.textPrimary, maxWidth: 200 }}>{row.dimension}</td>
                        <td style={{ padding: "12px 12px" }}><ScoreBar score={row.score} /></td>
                        <td style={{ padding: "12px 4px", width: 60 }}>
                          <div style={{ width: "100%", height: 4, background: C.borderLight, borderRadius: 2, overflow: "hidden" }}>
                            <div style={{ width: `${row.score}%`, height: "100%", background: row.score >= 75 ? `linear-gradient(90deg, ${C.red}, #dc2626)` : row.score >= 55 ? `linear-gradient(90deg, ${C.amber}, #eab308)` : `linear-gradient(90deg, ${C.green}, #16a34a)`, borderRadius: 2 }} />
                          </div>
                        </td>
                        <td style={{ padding: "12px 12px", fontFamily: C.fontMono, fontSize: 13, fontWeight: 700, color: row.delta > 0 ? C.red : C.green }}>
                          {row.delta > 0 ? `+${row.delta}` : `${row.delta}`}
                        </td>
                        <td style={{ padding: "12px 12px" }}><RegimeBadge regime={row.regime} /></td>
                        <td style={{ padding: "12px 12px", fontFamily: C.fontUI, fontSize: 12, color: C.textTertiary }}>{row.driver}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </Card>
            </div>

            {/* Sidebar */}
            <aside style={{ padding: "20px 16px", background: C.cardBg, overflow: "auto", borderLeft: `1px solid ${C.border}` }}>
              <div style={{ fontFamily: C.fontMono, fontSize: 10, color: C.blueMid, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 12 }}>HEDGE IMPLICATIONS</div>
              {[
                { condition: "Score >= 80", implication: "Maximum hedge coverage. Board notification required.", color: C.red, bg: C.redSoft },
                { condition: "Score 55-79", implication: "Standard program. Quarterly review on schedule.", color: C.amber, bg: C.amberSoft },
                { condition: "Score < 55", implication: "Conservative program. Annual review sufficient.", color: C.green, bg: C.greenSoft },
              ].map(({ condition, implication, color, bg }) => (
                <Card key={condition} style={{ padding: "12px 14px", borderLeft: `4px solid ${color}`, marginBottom: 10, background: bg }}>
                  <div style={{ fontFamily: C.fontMono, fontSize: 11, color, fontWeight: 700, marginBottom: 4 }}>{condition}</div>
                  <div style={{ fontFamily: C.fontUI, fontSize: 12, color: C.textSecondary, lineHeight: 1.5 }}>{implication}</div>
                </Card>
              ))}
              <div style={{ marginTop: 12, fontFamily: C.fontMono, fontSize: 11, color: C.textTertiary, lineHeight: 1.6 }}>
                Score: structured event weight x recency decay x confidence
              </div>
            </aside>
          </div>
        )}

        {/* ══ TAB 2: MACRO SCENARIOS ══ */}
        {tab === 2 && (
          <div style={{ padding: isMobile ? "12px 16px" : "20px 24px", overflow: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <TrendingUp size={16} color={C.blueMid} />
              <span style={{ fontFamily: C.fontHead, fontSize: 14, fontWeight: 700 }}>Macro Scenario Tree</span>
              <span style={{ fontFamily: C.fontMono, fontSize: 11, color: C.textTertiary }}>{MACRO_SCENARIOS.length} scenarios · probability = 100%</span>
            </div>

            {/* Probability distribution bar */}
            <Card style={{ padding: "14px 18px", marginBottom: 16 }}>
              <div style={{ fontFamily: C.fontMono, fontSize: 10, color: C.blueMid, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 10 }}>SCENARIO PROBABILITY DISTRIBUTION</div>
              <div style={{ display: "flex", height: 28, borderRadius: 8, overflow: "hidden", gap: 2 }}>
                {MACRO_SCENARIOS.map(sc => {
                  const bg = sc.riskScore >= 80 ? "linear-gradient(180deg, #ef4444, #dc2626)" : sc.riskScore >= 60 ? "linear-gradient(180deg, #f59e0b, #eab308)" : "linear-gradient(180deg, #22c55e, #16a34a)";
                  return (
                    <div key={sc.id} style={{
                      width: `${sc.probability}%`, background: bg,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      minWidth: sc.probability >= 5 ? 30 : 0,
                    }}>
                      {sc.probability >= 5 && <span style={{ fontFamily: C.fontMono, fontSize: 10, color: C.white, fontWeight: 800 }}>{sc.probability}%</span>}
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
                {MACRO_SCENARIOS.map(sc => {
                  const dotColor = sc.riskScore >= 80 ? C.red : sc.riskScore >= 60 ? C.amber : C.green;
                  return (
                    <div key={sc.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <div style={{ width: 8, height: 8, borderRadius: 2, background: dotColor }} />
                      <span style={{ fontFamily: C.fontMono, fontSize: 10, color: C.textTertiary }}>{sc.id}</span>
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* Scenario cards */}
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 14 }}>
              {MACRO_SCENARIOS.map(sc => {
                const barColor = sc.riskScore >= 80 ? C.red : sc.riskScore >= 60 ? C.amber : C.green;
                return (
                  <Card key={sc.id} hover style={{ borderLeft: `4px solid ${barColor}` }}>
                    <div style={{ padding: "16px 18px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                        <div>
                          <div style={{ fontFamily: C.fontMono, fontSize: 11, color: C.textTertiary, marginBottom: 4 }}>{sc.id} · {sc.horizon}</div>
                          <div style={{ fontFamily: C.fontHead, fontSize: 14, fontWeight: 700, color: C.textPrimary, lineHeight: 1.3 }}>{sc.name}</div>
                        </div>
                        <div style={{ textAlign: "right" as const }}>
                          <div style={{ fontFamily: C.fontMono, fontSize: 22, fontWeight: 800, color: barColor, lineHeight: 1 }}>{sc.probability}%</div>
                          <div style={{ fontFamily: C.fontMono, fontSize: 10, color: C.textTertiary }}>PROBABILITY</div>
                        </div>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 8, marginBottom: 10 }}>
                        <div style={{ padding: "8px 10px", background: C.cardBgAlt, borderRadius: 8, border: `1px solid ${C.borderLight}` }}>
                          <div style={{ fontFamily: C.fontMono, fontSize: 10, color: C.textTertiary }}>USD/MXN PATH</div>
                          <div style={{ fontFamily: C.fontMono, fontSize: 14, fontWeight: 700, color: C.textPrimary }}>{sc.usdmxnPath}</div>
                        </div>
                        <div style={{ padding: "8px 10px", background: C.cardBgAlt, borderRadius: 8, border: `1px solid ${C.borderLight}` }}>
                          <div style={{ fontFamily: C.fontMono, fontSize: 10, color: C.textTertiary }}>RISK SCORE</div>
                          <ScoreBar score={sc.riskScore} />
                        </div>
                      </div>

                      <div style={{ padding: "10px 12px", background: `${barColor}08`, borderRadius: 8, border: `1px solid ${barColor}15` }}>
                        <div style={{ fontFamily: C.fontMono, fontSize: 10, color: barColor, fontWeight: 700, letterSpacing: "0.08em", marginBottom: 4 }}>HEDGE IMPLICATION</div>
                        <div style={{ fontFamily: C.fontUI, fontSize: 12, color: C.textSecondary, lineHeight: 1.5 }}>{sc.hedgeImplication}</div>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* ══ TAB 3: ALERT RULES ══ */}
        {tab === 3 && (
          <div style={{ padding: isMobile ? "12px 16px" : "20px 24px", overflow: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <Zap size={16} color={C.blueMid} />
              <span style={{ fontFamily: C.fontHead, fontSize: 14, fontWeight: 700 }}>Alert Rule Registry</span>
              <span style={{ fontFamily: C.fontMono, fontSize: 11, color: C.textTertiary }}>{ALERT_RULES.length} rules · {firedAlerts} active</span>
            </div>

            <Card style={{ marginBottom: 16 }}>
              <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: C.headerGradient }}>
                    {["RULE ID", "TRIGGER CONDITION", "AUTOMATED ACTION", "STATUS", "LAST FIRED"].map(h => (
                      <th scope="col" key={h} style={{ padding: "10px 14px", fontFamily: C.fontMono, fontSize: 10, letterSpacing: "0.1em", color: "rgba(255,255,255,0.7)", fontWeight: 600, textAlign: "left" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ALERT_RULES.map((rule, idx) => (
                    <tr key={rule.id} className="o-trow" style={{ borderBottom: `1px solid ${C.borderLight}`, background: idx % 2 === 0 ? C.cardBg : C.cardBgAlt }}>
                      <td style={{ padding: "12px 14px", fontFamily: C.fontMono, fontSize: 12, color: C.textTertiary, fontWeight: 600 }}>{rule.id}</td>
                      <td style={{ padding: "12px 14px", fontFamily: C.fontMono, fontSize: 12, color: C.textSecondary }}>{rule.trigger}</td>
                      <td style={{ padding: "12px 14px", fontFamily: C.fontUI, fontSize: 12, color: C.textSecondary, lineHeight: 1.4 }}>{rule.action}</td>
                      <td style={{ padding: "12px 14px" }}>
                        <span style={{
                          fontFamily: C.fontMono, fontSize: 10, fontWeight: 700, padding: "3px 12px", borderRadius: 20,
                          color: C.white,
                          background: rule.status === "FIRED" ? `linear-gradient(135deg, ${C.redDeep}, ${C.red})` : `linear-gradient(135deg, ${C.greenDeep}, ${C.green})`,
                          boxShadow: rule.status === "FIRED" ? "0 2px 6px rgba(239,68,68,0.3)" : "0 2px 6px rgba(34,197,94,0.3)",
                        }}>{rule.status}</span>
                      </td>
                      <td style={{ padding: "12px 14px", fontFamily: C.fontMono, fontSize: 12, color: C.textTertiary }}>{rule.lastFired}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </Card>

            {/* Integration flow */}
            <Card style={{ padding: "18px 20px" }}>
              <div style={{ fontFamily: C.fontMono, fontSize: 10, color: C.blueMid, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 14 }}>
                POLISOPHIC → HEDGECORE INTEGRATION PIPELINE
              </div>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 16 }}>
                {[
                  { step: "01", title: "Event Ingested", desc: "Polisophic parses source (CB statement, press release, data feed) and classifies signal with confidence score.", icon: Radio },
                  { step: "02", title: "Score Updated", desc: "Risk dimensions recalculated using structured signal weight x confidence x recency decay function.", icon: Activity },
                  { step: "03", title: "Alert Evaluated", desc: "Rule engine checks thresholds. Fires alert to treasury inbox and optionally triggers HedgeCore re-calculation.", icon: Zap },
                ].map(({ step, title, desc, icon: Icon }) => (
                  <div key={step} style={{ display: "flex", gap: 12 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
                      background: `linear-gradient(135deg, ${C.blueMid}, ${C.blue})`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      boxShadow: "0 2px 8px rgba(37,99,235,0.2)",
                    }}>
                      <Icon size={16} color="#fff" />
                    </div>
                    <div>
                      <div style={{ fontFamily: C.fontMono, fontSize: 10, color: C.blueMid, fontWeight: 700 }}>{step}</div>
                      <div style={{ fontFamily: C.fontHead, fontSize: 13, fontWeight: 700, color: C.textPrimary, marginBottom: 4 }}>{title}</div>
                      <div style={{ fontFamily: C.fontUI, fontSize: 12, color: C.textTertiary, lineHeight: 1.5 }}>{desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {/* ══ TAB 4: RISK HEATMAP ══ */}
        {tab === 4 && (
          <div style={{ padding: isMobile ? "12px 16px" : "20px 24px", overflow: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <Globe size={16} color={C.blueMid} />
              <span style={{ fontFamily: C.fontHead, fontSize: 14, fontWeight: 700 }}>Regional Risk Heatmap</span>
              <span style={{ fontFamily: C.fontMono, fontSize: 11, color: C.textTertiary }}>8 regions · {renderTs}</span>
            </div>

            {/* Grid of region cards */}
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
              {HEATMAP_REGIONS.map(region => {
                const scoreColor = region.score >= 75 ? C.red : region.score >= 55 ? C.amber : C.green;
                const bgGrad = region.score >= 75
                  ? "linear-gradient(135deg, rgba(239,68,68,0.06), rgba(220,38,38,0.02))"
                  : region.score >= 55
                  ? "linear-gradient(135deg, rgba(245,158,11,0.06), rgba(234,179,8,0.02))"
                  : "linear-gradient(135deg, rgba(34,197,94,0.06), rgba(22,163,74,0.02))";
                return (
                  <Card key={region.name} hover style={{ background: bgGrad, borderLeft: `4px solid ${scoreColor}` }}>
                    <div style={{ padding: "14px 16px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                        <div style={{ fontFamily: C.fontHead, fontSize: 13, fontWeight: 700, color: C.textPrimary, lineHeight: 1.2 }}>{region.name}</div>
                        <div style={{
                          fontFamily: C.fontMono, fontSize: 18, fontWeight: 800, color: scoreColor,
                          padding: "2px 8px", borderRadius: 8, background: region.score >= 75 ? C.redSoft : region.score >= 55 ? C.amberSoft : C.greenSoft,
                        }}>{region.score}</div>
                      </div>
                      <RegimeBadge regime={region.regime} />
                      <div style={{ marginTop: 8, height: 6, background: C.borderLight, borderRadius: 3, overflow: "hidden" }}>
                        <div style={{
                          width: `${region.score}%`, height: "100%", borderRadius: 3,
                          background: region.score >= 75 ? "linear-gradient(90deg, #ef4444, #dc2626)" : region.score >= 55 ? "linear-gradient(90deg, #f59e0b, #eab308)" : "linear-gradient(90deg, #22c55e, #16a34a)",
                          transition: "width 0.5s",
                        }} />
                      </div>
                      <div style={{ fontFamily: C.fontUI, fontSize: 11, color: C.textTertiary, marginTop: 8, lineHeight: 1.4 }}>{region.driver}</div>
                    </div>
                  </Card>
                );
              })}
            </div>

            {/* Legend */}
            <Card style={{ padding: "12px 18px", marginBottom: 16, display: "flex", alignItems: "center", gap: 20 }}>
              <span style={{ fontFamily: C.fontMono, fontSize: 10, color: C.textTertiary, letterSpacing: "0.08em" }}>LEGEND</span>
              {[
                { label: "HIGH >= 75", color: C.red },
                { label: "ELEVATED 55-74", color: C.amber },
                { label: "MODERATE < 55", color: C.green },
              ].map(({ label, color }) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 12, height: 12, borderRadius: 3, background: color }} />
                  <span style={{ fontFamily: C.fontMono, fontSize: 11, color }}>{label}</span>
                </div>
              ))}
            </Card>

            {/* Table breakdown */}
            <Card>
              <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, fontFamily: C.fontMono, fontSize: 10, color: C.blueMid, fontWeight: 700, letterSpacing: "0.1em" }}>
                REGIONAL RISK BREAKDOWN
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: C.headerGradient }}>
                    {["REGION", "SCORE", "", "REGIME", "DRIVER", "TREND"].map(h => (
                      <th scope="col" key={h} style={{ padding: "10px 12px", fontFamily: C.fontMono, fontSize: 10, letterSpacing: "0.1em", color: "rgba(255,255,255,0.7)", fontWeight: 600, textAlign: "left" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {HEATMAP_REGIONS.slice().sort((a, b) => b.score - a.score).map((region, idx) => {
                    const trendColor = region.score >= 75 ? C.red : region.score >= 55 ? C.amber : C.green;
                    const trendLabel = region.score >= 75 ? "RISING" : region.score >= 55 ? "WATCH" : "STABLE";
                    return (
                      <tr key={region.name} className="o-trow" style={{ borderBottom: `1px solid ${C.borderLight}`, background: idx % 2 === 0 ? C.cardBg : C.cardBgAlt }}>
                        <td style={{ padding: "12px 12px", fontFamily: C.fontUI, fontSize: 13, fontWeight: 600, color: C.textPrimary }}>{region.name}</td>
                        <td style={{ padding: "12px 12px" }}><ScoreBar score={region.score} /></td>
                        <td style={{ padding: "12px 4px", width: 60 }}>
                          <div style={{ width: "100%", height: 4, background: C.borderLight, borderRadius: 2, overflow: "hidden" }}>
                            <div style={{ width: `${region.score}%`, height: "100%", background: trendColor, borderRadius: 2 }} />
                          </div>
                        </td>
                        <td style={{ padding: "12px 12px" }}><RegimeBadge regime={region.regime} /></td>
                        <td style={{ padding: "12px 12px", fontFamily: C.fontUI, fontSize: 12, color: C.textTertiary }}>{region.driver}</td>
                        <td style={{ padding: "12px 12px" }}>
                          <span style={{ fontFamily: C.fontMono, fontSize: 10, fontWeight: 700, color: trendColor, padding: "2px 8px", borderRadius: 20, background: region.score >= 75 ? C.redSoft : region.score >= 55 ? C.amberSoft : C.greenSoft }}>{trendLabel}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          </div>
        )}

        {/* ══ TAB 5: MY EXPOSURE ══ */}
        {tab === 5 && (
          <div style={{ padding: isMobile ? "12px 16px" : "20px 24px", overflow: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <Shield size={16} color={C.blueMid} />
              <span style={{ fontFamily: C.fontHead, fontSize: 14, fontWeight: 700 }}>My Exposure Risk</span>
              <span style={{ fontFamily: C.fontMono, fontSize: 11, color: C.textTertiary }}>
                {user?.branch?.name ?? "Branch"} · {exposureInfo.currency} · {exposureInfo.pairs.join(", ")}
              </span>
              {!user && <span style={{ fontFamily: C.fontMono, fontSize: 11, color: C.amber, fontWeight: 600 }}>LOGIN FOR PERSONALISED VIEW</span>}
            </div>

            {/* Alert banner */}
            <Card style={{
              marginBottom: 16, borderLeft: `4px solid ${relevantScore.regime === "HIGH" ? C.red : relevantScore.regime === "ELEVATED" ? C.amber : C.blueMid}`,
              background: relevantScore.regime === "HIGH" ? C.redSoft : relevantScore.regime === "ELEVATED" ? C.amberSoft : C.blueGlow,
            }}>
              <div style={{ padding: "16px 20px" }}>
                <div style={{ fontFamily: C.fontMono, fontSize: 10, color: C.textTertiary, letterSpacing: "0.08em", marginBottom: 6 }}>
                  EXPOSURE RISK ALERT · {branchCode} · {exposureInfo.currency}
                </div>
                <div style={{ fontFamily: C.fontHead, fontSize: 15, fontWeight: 700, color: C.textPrimary, marginBottom: 10 }}>
                  Your {exposureInfo.currency} exposure faces {relevantScore.regime} risk
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" as const }}>
                  <ScoreBar score={relevantScore.score} />
                  <RegimeBadge regime={relevantScore.regime} />
                  <span style={{ fontFamily: C.fontUI, fontSize: 13, color: C.textSecondary }}>{relevantScore.dimension}: {relevantScore.driver}</span>
                </div>
              </div>
            </Card>

            {/* Hedge implication */}
            <Card style={{ padding: "16px 20px", marginBottom: 16, background: `linear-gradient(135deg, ${C.bluePale}, #f0f4ff)` }}>
              <div style={{ fontFamily: C.fontMono, fontSize: 10, color: C.blueMid, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 8 }}>
                HEDGE IMPLICATION FOR {exposureInfo.currency}
              </div>
              <div style={{ fontFamily: C.fontUI, fontSize: 13, color: C.textSecondary, lineHeight: 1.7 }}>
                {relevantScore.regime === "HIGH"
                  ? `Maximum hedge coverage recommended (90-95%). Board notification required. Activate contingency swap lines for ${exposureInfo.pairs[0]}. Daily monitoring cadence.`
                  : relevantScore.regime === "ELEVATED"
                  ? `Maintain 80% NDF program. Consider adding tenor extension to ladder for ${exposureInfo.pairs[0]}. Quarterly review accelerated to monthly.`
                  : `Standard hedge program adequate (65-75% coverage). Annual review on schedule. No immediate action required for ${exposureInfo.pairs.join(", ")}.`}
              </div>
            </Card>

            {/* Relevant events */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <Radio size={14} color={C.blueMid} />
              <span style={{ fontFamily: C.fontHead, fontSize: 13, fontWeight: 700 }}>Relevant Events for Your Portfolio</span>
            </div>
            {(RISK_EVENTS.filter(ev =>
              exposureInfo.currency === "USD" ? ev.region === "USA" :
              exposureInfo.currency === "MXN" ? ev.region === "MEX" :
              ev.category === "CENTRAL BANK"
            ).length > 0
              ? RISK_EVENTS.filter(ev =>
                  exposureInfo.currency === "USD" ? ev.region === "USA" :
                  exposureInfo.currency === "MXN" ? ev.region === "MEX" :
                  ev.category === "CENTRAL BANK"
                )
              : RISK_EVENTS.slice(0, 3)
            ).map(ev => {
              const sev = ev.severity >= 75 ? C.red : ev.severity >= 55 ? C.amber : C.green;
              return (
                <Card key={ev.id} style={{ marginBottom: 8, borderLeft: `3px solid ${sev}` }}>
                  <div style={{ padding: "12px 16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" as const }}>
                      <span style={{ fontFamily: C.fontMono, fontSize: 11, color: C.textTertiary }}>{ev.ts}</span>
                      <span style={{ fontFamily: C.fontMono, fontSize: 10, padding: "2px 8px", borderRadius: 20, color: C.blueSky, background: `${C.blueSky}12`, fontWeight: 600 }}>{ev.category}</span>
                      {ev.alertTriggered && <span style={{ fontFamily: C.fontMono, fontSize: 10, padding: "2px 8px", borderRadius: 20, color: C.white, background: `linear-gradient(135deg, ${C.redDeep}, ${C.red})`, fontWeight: 700 }}>ALERT</span>}
                      <span style={{ marginLeft: "auto", fontFamily: C.fontMono, fontSize: 12, color: sev, fontWeight: 700 }}>SEV {ev.severity}</span>
                    </div>
                    <div style={{ fontFamily: C.fontUI, fontSize: 13, color: C.textPrimary, lineHeight: 1.5 }}>{ev.headline}</div>
                  </div>
                </Card>
              );
            })}

            <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end" }}>
              <button onClick={() => router.push("/dashboard")} style={{
                fontFamily: C.fontMono, fontSize: 12, color: C.blueMid,
                border: `1px solid ${C.blueMid}30`, background: C.blueGlow,
                padding: "6px 16px", cursor: "pointer", borderRadius: 8, fontWeight: 600,
              }}>BACK TO DASHBOARD <ChevronRight size={12} style={{ verticalAlign: "middle" }} /></button>
            </div>
          </div>
        )}

      </div>
        <HelpPanel config={POLISOPHIC_HELP} storageKey="polisophic" />
      </div>

      {/* ══════════ FOOTER ══════════ */}
      <footer style={{
        height: 38, display: "flex", alignItems: "center", gap: 12, padding: "0 28px",
        background: C.headerGradient, flexShrink: 0,
        fontFamily: C.fontMono, fontSize: 11, color: "rgba(255,255,255,0.5)",
      }}>
        <span style={{ color: C.white, fontWeight: 700, letterSpacing: "0.04em" }}>ORDR-TERMINAL</span>
        <span style={{ color: "rgba(255,255,255,0.2)" }}>|</span>
        <span>Polisophic Risk Intelligence</span>
        <span style={{ color: "rgba(255,255,255,0.2)" }}>|</span>
        <span>{RISK_EVENTS.length} events · {MACRO_SCENARIOS.length} scenarios · {ALERT_RULES.length} rules</span>
        <span style={{ color: "rgba(255,255,255,0.2)" }}>|</span>
        <span>Composite: {compositeScore}/100</span>
        <div style={{ flex: 1 }} />
        <span style={{ color: "rgba(255,255,255,0.3)" }}>{renderTs}</span>
      </footer>
    </div>
    </PageShell>
  );
}
