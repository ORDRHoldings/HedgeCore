"use client";

/**
 * Policy Builder  —  /ai-policy-wizard
 *
 * Institutional-grade 7-Phase wizard implementing the ORDR Policy Engine
 * whitepaper specification (BlackRock / Bloomberg defensible).
 *
 * Phases:
 *   A — Intent & Scope       (3 steps: A1 Intent, A2 Portfolio, A3 Time Horizon)
 *   B — Exposure & Bucketing (3 steps: B1 Classification, B2 Netting, B3 Materiality)
 *   C — Instruments          (2 steps: C1 Eligibility Grid, C2 Tenor Ladder)
 *   D — Constraints & Budget (2 steps: D1 Cost/Risk Budget, D2 Concentration Limits)
 *   E — Scenarios & Stress   (2 steps: E1 Stress Pack, E2 Custom Scenarios)
 *   F — Governance Review    (1 step:  F1 Policy Summary + Approval Checklist)
 *   G — Publish              (1 step:  G1 Save Draft / Final)
 *
 * Backed by same POST /api/policy-ai and createPolicyTemplate as PolicyWizardModal.
 *
 * References:
 *   BCBS FRTB 2019 §MAR23; ISDA 2002/2022; IFRS 9.6.5; BIS FX Survey 2022;
 *   Journal of Finance Vol.53 No.3 (Allayannis & Weston 1998)
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useAuth } from "../../lib/authContext";
import { useRouter } from "next/navigation";
import HelpPanel from "@/components/layout/HelpPanel";
import { AI_WIZARD_HELP } from "@/lib/helpContent";
import { usePlanRedirect } from "@/lib/hooks/usePlanRedirect";
import {
  suggestPolicyAI,
  createPolicyTemplate,
  type AIPolicyResult,
  type AIPolicyRecommendation,
} from "../../api/policyClient";
import {
  mapWizardStateToQA,
  buildCanonicalFromPageState,
  toCreateTemplatePayload,
  type WizardState,
} from "../../utils/policyMapper";

import { PageShell } from "@/components/layout/PageShell";
import { Shield } from "lucide-react";

// ── Hydration-safe timestamp hook ──────────────────────────────────────────
function useRenderTs(): string {
  const [ts, setTs] = useState('');
  useEffect(() => { setTs(new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC"); }, []);
  return ts;
}

// ── Design tokens ──────────────────────────────────────────────────────────
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
  purple:   "var(--accent-purple,#7C3AED)",
} as const;

// ── Phase / Step Definitions ───────────────────────────────────────────────

const PHASES = [
  { id: "A", label: "Intent & Scope",        color: S.cyan,   steps: ["Policy Intent", "Portfolio Scope", "Time Horizon"] },
  { id: "B", label: "Exposure & Bucketing",  color: S.amber,  steps: ["Exposure Classification", "Netting Rules", "Materiality"] },
  { id: "C", label: "Instruments",           color: S.pass,   steps: ["Eligibility Grid", "Tenor Ladder"] },
  { id: "D", label: "Constraints & Budget",  color: "#E879F9", steps: ["Cost & Risk Budget", "Concentration Limits"] },
  { id: "E", label: "Scenarios & Stress",    color: S.fail,   steps: ["Stress Pack", "Custom Scenarios"] },
  { id: "F", label: "Governance Review",     color: "#818CF8", steps: ["Policy Summary"] },
  { id: "G", label: "Publish",               color: S.pass,   steps: ["Save & Version"] },
] as const;

// Flat step list derived from phases
const ALL_STEPS = PHASES.flatMap((ph) =>
  ph.steps.map((s) => ({ phase: ph.id, phaseLabel: ph.label, phaseColor: ph.color, step: s }))
);
const TOTAL_STEPS = ALL_STEPS.length; // 14 steps

// ── Constants: Currency Universe (CME Futures + Custom) ────────────────────

const CME_CURRENCIES = [
  // Americas
  "MXN", "BRL", "CAD",
  // Europe
  "EUR", "GBP", "CHF", "NOK", "SEK", "PLN", "CZK", "HUF",
  // Asia-Pacific
  "JPY", "AUD", "NZD", "CNY", "CNH", "INR", "KRW", "SGD", "TWD", "THB", "IDR", "PHP",
  // EM EMEA
  "ZAR", "TRY", "ILS", "SAR", "AED",
  // Other G10
  "DKK",
] as const;

const CME_FX_PAIRS = [
  // USD-based
  "USD/MXN","USD/BRL","USD/CAD","USD/EUR","USD/GBP","USD/CHF","USD/JPY","USD/AUD","USD/NZD",
  "USD/CNH","USD/CNY","USD/INR","USD/KRW","USD/SGD","USD/ZAR","USD/TRY","USD/NOK","USD/SEK",
  "USD/PLN","USD/HUF","USD/CZK","USD/ILS","USD/TWD","USD/THB","USD/IDR","USD/PHP","USD/AED","USD/SAR",
  // EUR-crosses
  "EUR/MXN","EUR/GBP","EUR/JPY","EUR/CHF","EUR/AUD","EUR/NOK","EUR/SEK","EUR/PLN","EUR/CZK","EUR/HUF",
  "EUR/TRY","EUR/ZAR",
  // GBP-crosses
  "GBP/JPY","GBP/CHF","GBP/AUD","GBP/MXN","GBP/ZAR",
  // Other majors
  "AUD/JPY","AUD/NZD","AUD/CAD","CAD/JPY","CHF/JPY","NZD/JPY","NZD/USD",
] as const;

const COMPANY_TYPES = ["Manufacturer","Exporter","Importer","Service Provider","Conglomerate","Financial Institution","Hedge Fund","Sovereign / Govt Entity","NGO / Non-Profit","Other"] as const;

const INDUSTRY_SECTORS = [
  "Automotive","Manufacturing","Mining & Resources","Agriculture & Commodities","Technology / SaaS",
  "Semiconductor","Healthcare / Pharma","Retail / E-Commerce","Energy (Oil & Gas)","Renewable Energy",
  "Financial Services","Banking / Treasury","Private Equity / VC","Real Estate","Shipping & Logistics",
  "Construction & Infrastructure","Media & Entertainment","Education","Hospitality & Tourism",
  "Sovereign / Development Bank","Other",
] as const;

const FX_EXPOSURE_TIERS = ["<$1M","$1–10M","$10–50M","$50–250M","$250M–1B",">$1B"] as const;
const HEDGE_EXPERIENCE  = ["None","Basic (spots/forwards)","Intermediate (options/collars)","Advanced (structured products)","Institutional / Dealer"] as const;
const PORTFOLIO_SCOPES  = ["CONSOLIDATED","SINGLE_ACCOUNT","MULTI_ACCOUNT","BRANCH_LEVEL"] as const;
const FLOW_TYPES        = ["RECEIVABLE","PAYABLE","INTERCOMPANY","BALANCE_SHEET","DIVIDEND","DEBT_SERVICE","ROYALTY","CAPEX"] as const;
const GEOGRAPHIES       = ["G10","EM_LATAM","EM_ASIA","EM_EMEA","ALL"] as const;
const TENOR_OPTS        = ["Spot","1M","3M","6M","12M","18M+"] as const;
const VISIBILITY_OPTS   = ["1 month","3 months","6 months","12 months","18+ months"] as const;
const SEASONAL_OPTS     = ["None","Quarterly","Semi-annual","Annual","Custom"] as const;
const PAYMENT_FREQS     = ["MONTHLY","QUARTERLY","SEMI_ANNUAL","ANNUAL","IRREGULAR","DAILY"] as const;
const MAX_LOSS_OPTS     = ["0.5%","1%","2%","5%","10%","Unlimited"] as const;
const VAR_CONFIDENCE_OPTS = ["90%","95%","99%","99.5%"] as const;
const DRAWDOWN_OPTS     = ["Low (<2%)","Medium (2–5%)","High (5–10%)","Very High (>10%)"] as const;
const PRIMARY_OBJECTIVES = [
  "Minimize Cost","Maximize Protection","Earnings Stability",
  "Cash Flow Matching","Regulatory Compliance","Balance Sheet Protection",
] as const;
const REGULATORY_REGIMES = ["IFRS9","ASC815","MiFID2","Basel3","EMIR","Dodd-Frank","FEMA (India)","BACEN (Brazil)","CNBV (Mexico)","None"] as const;
const INSTRUMENTS = [
  { id: "FWD",  label: "FX Forward (Deliverable)", em: false },
  { id: "NDF",  label: "FX NDF (Non-Deliverable)", em: true  },
  { id: "CALL", label: "FX Call Option",            em: false },
  { id: "PUT",  label: "FX Put Option",             em: false },
  { id: "COL",  label: "FX Collar",                 em: false },
  { id: "SWP",  label: "FX Swap",                   em: false },
  { id: "XCS",  label: "Cross-Currency Swap",       em: false },
] as const;
const BENCHMARK_OPTS    = ["None","Budget Rate","Spot at Inception","Forward Rate","WM/Reuters Fix","ECB Reference"] as const;
const STRESS_PACKS      = ["MILD_STRESS","MODERATE_STRESS","SEVERE_STRESS","TAIL_STRESS","CUSTOM"] as const;

// ── Initial State ──────────────────────────────────────────────────────────

const INITIAL_STATE: WizardState = {
  // Phase A
  primaryObjective: "",
  regulatoryRegimes: [],
  boardResolutionRef: "",
  boardStatement: "",
  effectiveFrom: new Date().toISOString().slice(0, 10),
  effectiveUntil: new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10),
  reviewDueDate: new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10),
  companyType: "",
  industrySector: "",
  annualExposure: "",
  primaryCurrency: "",
  fxCorridors: [],
  portfolioScope: "CONSOLIDATED",
  extendedFlowTypes: ["RECEIVABLE", "PAYABLE"],
  geographyFocus: [],
  hedgeExperience: "",
  averageTenor: "",
  timeHorizonMonths: 12,
  rollingHedge: false,
  rollingTenor: "3M",
  layeredApproach: false,
  // Phase B
  cashFlowVisibility: "",
  cashFlowCertainty: 65,
  receivableSplit: 60,
  seasonalPatterns: "",
  paymentFrequency: "",
  avgTransactionSizeUsd: 250000,
  hasIntercompanyFlows: false,
  nettingAvailable: false,
  netConfirmedForecast: false,
  settlementCycleDays: 2,
  materialityThresholdUsd: 10000,
  minHedgeSizeUsd: 50000,
  maxSingleTradeUsd: 25000000,
  // Phase C
  instrumentPreferences: ["FWD"],
  instrAllowed: { FWD: true, NDF: false, CALL: false, PUT: false, COL: false, SWP: false, XCS: false },
  instrMaxTenorDays: { FWD: 365, NDF: 365, CALL: 180, PUT: 180, COL: 180, SWP: 90, XCS: 1825 },
  instrRequiresApproval: { FWD: false, NDF: false, CALL: true, PUT: true, COL: true, SWP: true, XCS: true },
  instrMaxNotionalUsd: { FWD: 50000000, NDF: 25000000, CALL: 10000000, PUT: 10000000, COL: 10000000, SWP: 25000000, XCS: 50000000 },
  tenorMinDays: 1,
  tenorMaxDays: 365,
  rollAllowed: true,
  rollWindowDays: 5,
  // Phase D
  premiumBudget: 1.0,
  maxCarryCostBpsAnnual: 50,
  maxOptionPremiumPct: 1.5,
  maxSpreadBps: 8,
  leverageCap: 1.0,
  marginBudgetUsd: 0,
  maxInstrumentConcentrationPct: 80,
  maxCounterpartyConcentrationPct: 40,
  maxTenorConcentrationPct: 60,
  maxCurrencyConcentrationPct: 70,
  costProtectionPriority: 50,
  maxAcceptableLoss: "",
  // Phase E
  standardStressPack: "MODERATE_STRESS",
  varConfidence: "95%",
  drawdownTolerance: "",
  backTestWindowDays: 252,
  worstCaseFocus: false,
  customScenarios: [],
  governanceNotes: "",
  // Phase F/G
  ifrsCompliance: false,
  benchmark: "",
  hedgeRatioTarget: 75,
  policyStatus: "DRAFT",
};

// ── Primitive UI Components ────────────────────────────────────────────────

const inputBase: React.CSSProperties = {
  width: "100%", padding: "7px 10px",
  border: `1px solid ${S.rim}`, background: S.bgSub,
  color: S.primary, fontFamily: S.fontUI,
  fontSize: "0.8125rem", outline: "none", borderRadius: 0,
};
const selectBase: React.CSSProperties = { ...inputBase, cursor: "pointer" };

function FL({ label, hint, citation }: { label: string; hint?: string; citation?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 5, flexWrap: "wrap" }}>
      <span style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", letterSpacing: "0.08em", color: S.tertiary }}>{label}</span>
      {hint && <span style={{ fontFamily: S.fontUI, fontSize: "0.6875rem", color: S.tertiary, opacity: 0.65 }}>{hint}</span>}
      {citation && <span style={{ fontFamily: S.fontMono, fontSize: "0.5625rem", color: S.purple, opacity: 0.8, letterSpacing: "0.04em" }}>[{citation}]</span>}
    </div>
  );
}

function SliderField({ label, hint, citation, value, onChange, min, max, step, format }: {
  label: string; hint?: string; citation?: string; value: number;
  onChange: (v: number) => void; min: number; max: number; step: number; format: (v: number) => string;
}) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 5, gap: 8 }}>
        <FL label={label} hint={hint} citation={citation} />
        <span style={{ fontFamily: S.fontMono, fontSize: "0.8125rem", fontWeight: 700, color: S.cyan, whiteSpace: "nowrap" }}>{format(value)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ width: "100%", accentColor: S.cyan, cursor: "pointer" }} />
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: S.fontMono, fontSize: "0.625rem", color: S.tertiary, marginTop: 2 }}>
        <span>{format(min)}</span><span>{format(max)}</span>
      </div>
    </div>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
      <div onClick={() => onChange(!checked)} style={{
        width: 36, height: 20, borderRadius: 10, flexShrink: 0, marginTop: 2,
        background: checked ? S.cyan : S.rim, position: "relative", transition: "background 0.15s", cursor: "pointer",
      }}>
        <div style={{ width: 16, height: 16, borderRadius: 8, background: S.primary, position: "absolute", top: 2, left: checked ? 18 : 2, transition: "left 0.15s" }} />
      </div>
      <div>
        <div style={{ fontFamily: S.fontUI, fontSize: "0.8125rem", color: S.secondary }}>{label}</div>
        {hint && <div style={{ fontFamily: S.fontUI, fontSize: "0.6875rem", color: S.tertiary, marginTop: 2 }}>{hint}</div>}
      </div>
    </label>
  );
}

function MultiSelect({ label, hint, citation, options, selected, onChange }: {
  label: string; hint?: string; citation?: string;
  options: readonly string[]; selected: string[]; onChange: (v: string[]) => void;
}) {
  const toggle = (o: string) => {
    onChange(selected.includes(o) ? selected.filter(x => x !== o) : [...selected, o]);
  };
  return (
    <div>
      <FL label={label} hint={hint} citation={citation} />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {options.map((o) => {
          const sel = selected.includes(o);
          return (
            <label key={o} style={{
              display: "flex", alignItems: "center", gap: 5, padding: "4px 9px", cursor: "pointer",
              border: `1px solid ${sel ? S.cyan : S.rim}`,
              background: sel ? `color-mix(in srgb, ${S.cyan} 8%, transparent)` : "transparent",
              transition: "all 0.12s",
            }}>
              <input type="checkbox" checked={sel} onChange={() => toggle(o)} style={{ accentColor: S.cyan, margin: 0 }} />
              <span style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: sel ? S.cyan : S.secondary, letterSpacing: "0.04em" }}>{o}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function ButtonGroup({ label, hint, citation, options, value, onChange, cols = 3 }: {
  label: string; hint?: string; citation?: string; options: readonly string[];
  value: string; onChange: (v: string) => void; cols?: number;
}) {
  return (
    <div>
      <FL label={label} hint={hint} citation={citation} />
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 6 }}>
        {options.map((o) => {
          const sel = value === o;
          return (
            <button key={o} type="button" onClick={() => onChange(o)} style={{
              padding: "8px 10px", border: `1px solid ${sel ? S.cyan : S.rim}`,
              background: sel ? `color-mix(in srgb, ${S.cyan} 10%, transparent)` : "transparent",
              cursor: "pointer", fontFamily: S.fontMono, fontSize: "0.6875rem",
              fontWeight: sel ? 700 : 400, color: sel ? S.cyan : S.secondary,
              letterSpacing: "0.04em", textAlign: "center", transition: "all 0.12s",
            }}>{o}</button>
          );
        })}
      </div>
    </div>
  );
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "8px 0 4px" }}>
      <div style={{ flex: 1, height: 1, background: S.rim }} />
      <span style={{ fontFamily: S.fontMono, fontSize: "0.5625rem", letterSpacing: "0.12em", color: S.tertiary, whiteSpace: "nowrap" }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: S.rim }} />
    </div>
  );
}

function PhaseTag({ phase, color }: { phase: string; color: string }) {
  return (
    <span style={{
      fontFamily: S.fontMono, fontSize: "0.5625rem", letterSpacing: "0.1em",
      padding: "1px 6px", border: `1px solid ${color}`,
      color, background: `color-mix(in srgb, ${color} 10%, transparent)`,
    }}>PHASE {phase}</span>
  );
}

function CitationNote({ text }: { text: string }) {
  return (
    <div style={{ fontFamily: S.fontMono, fontSize: "0.5625rem", color: S.purple, letterSpacing: "0.04em", opacity: 0.8, marginTop: 4 }}>
      ⎈ {text}
    </div>
  );
}

// ── TopBar ─────────────────────────────────────────────────────────────────

function TopBar({ onBack, pct, onHelp, lastSaved, onClearProgress }: {
  onBack: () => void; pct: number; onHelp: () => void;
  lastSaved: string | null; onClearProgress: () => void;
}) {
  const ts = useRenderTs();
  return (
    <header style={{
      display: "flex", alignItems: "center", gap: 12, height: 44,
      padding: "0 20px", background: S.bgPanel, borderBottom: `1px solid ${S.rim}`, flexShrink: 0,
    }}>
      <button onClick={onBack} style={{
        fontFamily: S.fontMono, fontSize: "0.75rem", color: S.tertiary,
        background: "transparent", border: `1px solid ${S.rim}`, padding: "2px 8px", cursor: "pointer",
      }}>← Policies</button>
      <span style={{ color: S.rim }}>|</span>
      <span style={{ fontFamily: S.fontUI, fontSize: "0.8125rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: S.primary }}>
        Policy Builder
      </span>
      <span style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", padding: "1px 5px", border: `1px solid ${S.rim}`, color: S.secondary }}>
        INSTITUTIONAL GRADE · 7 PHASES · WHITEPAPER-BACKED
      </span>
      <div style={{ flex: 1 }} />
      {/* Draft saved indicator */}
      {lastSaved && (
        <span style={{
          fontFamily: S.fontMono, fontSize: "0.5rem", color: S.tertiary,
          letterSpacing: "0.06em", opacity: 0.7,
        }}>
          DRAFT SAVED · {lastSaved}
        </span>
      )}
      {/* Clear progress button */}
      <button
        type="button"
        onClick={onClearProgress}
        style={{
          fontFamily: S.fontMono, fontSize: "0.5625rem", letterSpacing: "0.08em",
          padding: "4px 10px", border: `1px solid ${S.rim}`,
          color: S.tertiary, background: "transparent", cursor: "pointer",
        }}
      >
        CLEAR PROGRESS
      </button>
      {/* Progress meter */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary }}>{Math.round(pct)}%</span>
        <div style={{ width: 80, height: 4, background: S.rim, borderRadius: 2, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${pct}%`, background: S.cyan, transition: "width 0.3s", borderRadius: 2 }} />
        </div>
      </div>
      <button type="button" onClick={onHelp} style={{
        fontFamily: S.fontMono, fontSize: "0.6875rem", letterSpacing: "0.06em",
        padding: "2px 10px", border: `1px solid ${S.rim}`,
        color: S.tertiary, background: "transparent", cursor: "pointer",
      }}>? HELP</button>
      <span style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary }}>{ts}</span>
    </header>
  );
}

// ── Phase Progress Rail ────────────────────────────────────────────────────

function PhaseRail({ stepIdx, onJump }: { stepIdx: number; onJump: (idx: number) => void }) {
  let globalIdx = 0;

  // Build phase start indices
  const phaseStarts: number[] = [];
  let accum = 0;
  for (const ph of PHASES) {
    phaseStarts.push(accum);
    accum += ph.steps.length;
  }

  return (
    <div style={{
      display: "flex", alignItems: "stretch",
      borderBottom: `1px solid ${S.rim}`, background: S.bgPanel, flexShrink: 0, overflowX: "auto",
    }}>
      {PHASES.map((ph, phIdx) => {
        const phaseStartIdx = globalIdx;
        const stepCount = ph.steps.length;
        const activeInPhase = stepIdx >= phaseStartIdx && stepIdx < phaseStartIdx + stepCount;
        const donePhase = stepIdx >= phaseStartIdx + stepCount;
        globalIdx += stepCount;
        return (
          <div
            key={ph.id}
            onClick={() => donePhase ? onJump(phaseStarts[phIdx]) : undefined}
            style={{
              flex: 1, minWidth: 80, padding: "8px 10px",
              borderRight: `1px solid ${S.rim}`,
              borderBottom: `2px solid ${activeInPhase ? ph.color : donePhase ? S.pass : "transparent"}`,
              background: activeInPhase ? `color-mix(in srgb, ${ph.color} 6%, ${S.bgPanel})` : "transparent",
              transition: "all 0.2s",
              cursor: donePhase ? "pointer" : "default",
            }}
          >
            <div style={{ fontFamily: S.fontMono, fontSize: "0.5625rem", letterSpacing: "0.1em", color: activeInPhase ? ph.color : donePhase ? S.pass : S.tertiary }}>
              {donePhase ? "✓ " : ""}{ph.id} · {ph.label}
            </div>
            <div style={{ fontFamily: S.fontMono, fontSize: "0.5rem", color: S.tertiary, marginTop: 2 }}>
              {ph.steps.length} step{ph.steps.length > 1 ? "s" : ""}
              {donePhase && <span style={{ color: S.pass, marginLeft: 4 }}>↩ jump</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Step Header ────────────────────────────────────────────────────────────

function StepHeader({ stepIdx }: { stepIdx: number }) {
  const s = ALL_STEPS[stepIdx];
  if (!s) return null;
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <PhaseTag phase={s.phase} color={s.phaseColor} />
        <span style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary, letterSpacing: "0.04em" }}>
          STEP {stepIdx + 1} / {TOTAL_STEPS}
        </span>
        <span style={{ color: S.rim }}>|</span>
        <span style={{ fontFamily: S.fontUI, fontSize: "0.9375rem", fontWeight: 700, color: S.primary }}>{s.step}</span>
        <span style={{ fontFamily: S.fontUI, fontSize: "0.75rem", color: S.tertiary }}>— {s.phaseLabel}</span>
      </div>
      <div style={{ height: 1, background: S.rim }} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE A STEPS
// ─────────────────────────────────────────────────────────────────────────────

// A1 — Policy Intent
function StepA1({ s, set }: { s: WizardState; set: (p: Partial<WizardState>) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 900 }}>
      <p style={{ fontFamily: S.fontUI, fontSize: "0.8125rem", color: S.secondary, margin: 0, lineHeight: 1.65 }}>
        Define the governing intent of this policy. The objective classification drives instrument eligibility,
        hedge ratio bounds, and governance approval thresholds in all downstream phases.
      </p>
      <CitationNote text="BCBS FRTB 2019 §MAR23 — hedge designation must precede trade inception; IFRS 9.6.2.4 formal documentation requirement" />

      <ButtonGroup label="PRIMARY OBJECTIVE" citation="IFRS 9.6.4.1"
        hint="what is the governing intent of this hedge programme?"
        options={PRIMARY_OBJECTIVES} value={s.primaryObjective} onChange={(v) => set({ primaryObjective: v })} cols={3} />

      <MultiSelect label="REGULATORY REGIMES" citation="MiFID2 Art.29; Dodd-Frank §4r"
        hint="all applicable accounting & regulatory frameworks"
        options={REGULATORY_REGIMES} selected={s.regulatoryRegimes} onChange={(v) => set({ regulatoryRegimes: v })} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
        <div>
          <FL label="EFFECTIVE FROM" citation="IFRS 9.6.4.1(d)" hint="hedge designation date" />
          <input type="date" value={s.effectiveFrom} onChange={(e) => set({ effectiveFrom: e.target.value })} style={inputBase} />
        </div>
        <div>
          <FL label="EFFECTIVE UNTIL" hint="policy expiry date" />
          <input type="date" value={s.effectiveUntil} onChange={(e) => set({ effectiveUntil: e.target.value })} style={inputBase} />
        </div>
        <div>
          <FL label="REVIEW DUE DATE" hint="next committee review" />
          <input type="date" value={s.reviewDueDate} onChange={(e) => set({ reviewDueDate: e.target.value })} style={inputBase} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 14 }}>
        <div>
          <FL label="BOARD RESOLUTION REF" hint="e.g. FX-2025-003" citation="IFRS 9.B6.4.1" />
          <input type="text" value={s.boardResolutionRef} onChange={(e) => set({ boardResolutionRef: e.target.value })}
            placeholder="FX-2025-003" style={inputBase} />
        </div>
        <div>
          <FL label="BOARD RISK APPETITE STATEMENT" hint="optional — plain text extract from board minutes" />
          <textarea value={s.boardStatement} onChange={(e) => set({ boardStatement: e.target.value })}
            placeholder="e.g. Board mandates minimum 70% hedge ratio on confirmed USD/MXN payables per resolution FX-2025-003"
            rows={2} style={{ ...inputBase, resize: "vertical" }} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Toggle label="IFRS 9 / ASC 815 Hedge Accounting"
          hint="Confirmed ratio ≥ 80% required for effectiveness testing (IAS 39 legacy: 80–125%)"
          checked={s.ifrsCompliance} onChange={(v) => set({ ifrsCompliance: v, regulatoryRegimes: v ? [...new Set([...s.regulatoryRegimes, "IFRS9", "ASC815"])] : s.regulatoryRegimes })} />
        <Toggle label="Layered / Sleeve Hedging Programme"
          hint="Multiple partially overlapping hedges added over time to build the target ratio (BIS Paper No.24)"
          checked={s.layeredApproach} onChange={(v) => set({ layeredApproach: v })} />
      </div>
    </div>
  );
}

// A2 — Portfolio Scope
function StepA2({ s, set }: { s: WizardState; set: (p: Partial<WizardState>) => void }) {
  const [customPair, setCustomPair] = useState('');
  const togglePair = (p: string) => set({ fxCorridors: s.fxCorridors.includes(p) ? s.fxCorridors.filter(x => x !== p) : [...s.fxCorridors, p] });
  const addCustom = () => {
    const v = customPair.toUpperCase().replace(/[^A-Z/]/g, '').slice(0, 7);
    if (v.length >= 6 && v.includes('/') && !s.fxCorridors.includes(v)) {
      set({ fxCorridors: [...s.fxCorridors, v] });
      setCustomPair('');
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 900 }}>
      <p style={{ fontFamily: S.fontUI, fontSize: "0.8125rem", color: S.secondary, margin: 0, lineHeight: 1.65 }}>
        Define the portfolio scope, currency universe, and exposure classification. BIS 2022 FX Survey data
        indicates 60% of EM hedging programmes under-specify their currency universe at inception.
      </p>
      <CitationNote text="BIS FX Survey 2022 §3.2; ISDA 2002 Master Agreement §14 (definition of Affected Party)" />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
        <div>
          <FL label="COMPANY TYPE" />
          <select value={s.companyType} onChange={(e) => set({ companyType: e.target.value })} style={selectBase}>
            <option value="">Select...</option>
            {COMPANY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <FL label="INDUSTRY SECTOR" citation="Allayannis & Weston JF 1998 — sector matters for hedge premium" />
          <select value={s.industrySector} onChange={(e) => set({ industrySector: e.target.value })} style={selectBase}>
            <option value="">Select...</option>
            {INDUSTRY_SECTORS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <FL label="ANNUAL FX EXPOSURE" hint="USD equivalent, all currencies" />
          <select value={s.annualExposure} onChange={(e) => set({ annualExposure: e.target.value })} style={selectBase}>
            <option value="">Select range...</option>
            {FX_EXPOSURE_TIERS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
        <div>
          <FL label="FUNCTIONAL CURRENCY" hint="reporting / home currency" />
          <select value={s.primaryCurrency} onChange={(e) => set({ primaryCurrency: e.target.value })} style={selectBase}>
            <option value="">Select currency...</option>
            {CME_CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <FL label="PORTFOLIO SCOPE" />
          <select value={s.portfolioScope} onChange={(e) => set({ portfolioScope: e.target.value })} style={selectBase}>
            {PORTFOLIO_SCOPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <FL label="HEDGE EXPERIENCE LEVEL" />
          <select value={s.hedgeExperience} onChange={(e) => set({ hedgeExperience: e.target.value })} style={selectBase}>
            <option value="">Select level...</option>
            {HEDGE_EXPERIENCE.map(h => <option key={h} value={h}>{h}</option>)}
          </select>
        </div>
      </div>

      <MultiSelect label="EXTENDED FLOW TYPES" hint="all FX-exposed cash flow types in scope"
        options={FLOW_TYPES} selected={s.extendedFlowTypes} onChange={(v) => set({ extendedFlowTypes: v })} />

      <MultiSelect label="GEOGRAPHY FOCUS" hint="primary regions for EM liquidity calibration"
        options={GEOGRAPHIES} selected={s.geographyFocus} onChange={(v) => set({ geographyFocus: v })} />

      <SectionDivider label="FX CURRENCY PAIR UNIVERSE — CME FUTURES + CUSTOM" />
      <div style={{ fontFamily: S.fontUI, fontSize: "0.75rem", color: S.secondary, marginBottom: 4, lineHeight: 1.6 }}>
        Select all currency pairs in scope. CME-listed pairs have established futures liquidity.
        Add custom pairs (e.g. bespoke bilateral agreements) using the input below.
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, maxHeight: 220, overflowY: "auto", padding: "8px", border: `1px solid ${S.rim}` }}>
        {CME_FX_PAIRS.map((p) => {
          const sel = s.fxCorridors.includes(p);
          return (
            <label key={p} style={{
              display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", cursor: "pointer",
              border: `1px solid ${sel ? S.cyan : S.rim}`,
              background: sel ? `color-mix(in srgb, ${S.cyan} 8%, transparent)` : "transparent",
              transition: "all 0.1s",
            }}>
              <input type="checkbox" checked={sel} onChange={() => togglePair(p)} style={{ accentColor: S.cyan, margin: 0 }} />
              <span style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: sel ? S.cyan : S.secondary, letterSpacing: "0.04em" }}>{p}</span>
            </label>
          );
        })}
        {/* Custom pairs already added */}
        {s.fxCorridors.filter(p => !(CME_FX_PAIRS as readonly string[]).includes(p)).map((p) => (
          <label key={p} style={{
            display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", cursor: "pointer",
            border: `1px solid ${S.amber}`, background: `color-mix(in srgb, ${S.amber} 8%, transparent)`,
          }}>
            <input type="checkbox" checked onChange={() => togglePair(p)} style={{ accentColor: S.amber, margin: 0 }} />
            <span style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.amber, letterSpacing: "0.04em" }}>{p} ★</span>
          </label>
        ))}
      </div>
      {/* Custom pair input */}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <div style={{ flex: 1 }}>
          <FL label="ADD CUSTOM PAIR" hint="format: BASE/QUOTE e.g. USD/VND" />
          <input type="text" value={customPair} onChange={(e) => setCustomPair(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && addCustom()}
            placeholder="e.g. USD/VND" style={{ ...inputBase, maxWidth: 200 }} maxLength={7} />
        </div>
        <button type="button" onClick={addCustom} style={{
          marginTop: 20, fontFamily: S.fontMono, fontSize: "0.6875rem", padding: "7px 14px",
          border: `1px solid ${S.amber}`, color: S.amber, background: "transparent", cursor: "pointer",
        }}>+ Add Pair</button>
      </div>
      {s.fxCorridors.length > 0 && (
        <div style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.pass }}>
          ✓ {s.fxCorridors.length} pair{s.fxCorridors.length !== 1 ? "s" : ""} in scope: {s.fxCorridors.join(", ")}
        </div>
      )}
    </div>
  );
}

// A3 — Time Horizon
function StepA3({ s, set }: { s: WizardState; set: (p: Partial<WizardState>) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 900 }}>
      <p style={{ fontFamily: S.fontUI, fontSize: "0.8125rem", color: S.secondary, margin: 0, lineHeight: 1.65 }}>
        Configure the time horizon architecture. Academic research (Géczy, Minton &amp; Schrand JF 1997) shows
        that misalignment between hedge tenor and exposure duration is the primary cause of hedge ineffectiveness.
      </p>
      <CitationNote text="Géczy, Minton & Schrand (1997) JF Vol.52 No.4; IFRS 9.B6.5.4 — hedge ratio documentation; BIS Paper No.24 §4.3" />

      <SliderField label="POLICY HORIZON (MONTHS)" citation="IFRS 9.6.5.4"
        hint="total forward coverage window — typically 12–24M for corporates, 36M for sovereigns"
        value={s.timeHorizonMonths} onChange={(v) => set({ timeHorizonMonths: v })}
        min={1} max={36} step={1} format={(v) => `${v} months`} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
          <FL label="AVERAGE TRANSACTION TENOR" hint="typical forward maturity per trade" />
          <select value={s.averageTenor} onChange={(e) => set({ averageTenor: e.target.value })} style={selectBase}>
            <option value="">Select tenor...</option>
            {TENOR_OPTS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <FL label="BENCHMARK RATE" hint="effectiveness measurement reference" />
          <select value={s.benchmark} onChange={(e) => set({ benchmark: e.target.value })} style={selectBase}>
            <option value="">Select benchmark...</option>
            {BENCHMARK_OPTS.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Toggle label="Rolling Hedge Programme"
          hint="Positions roll forward each period. Suitable for continuous payable/receivable flows (Bodnar, Hayt & Marston 1998 Wharton Survey)"
          checked={s.rollingHedge} onChange={(v) => set({ rollingHedge: v })} />
        {s.rollingHedge && (
          <div>
            <FL label="ROLLING TENOR" />
            <select value={s.rollingTenor} onChange={(e) => set({ rollingTenor: e.target.value })} style={{ ...selectBase, maxWidth: 200 }}>
              {TENOR_OPTS.filter(t => t !== "Spot").map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE B STEPS
// ─────────────────────────────────────────────────────────────────────────────

function StepB1({ s, set }: { s: WizardState; set: (p: Partial<WizardState>) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 900 }}>
      <p style={{ fontFamily: S.fontUI, fontSize: "0.8125rem", color: S.secondary, margin: 0, lineHeight: 1.65 }}>
        Classify your FX exposure profile. Confirmed vs. forecast split drives hedge ratio bounds;
        cash flow predictability determines permissible instruments under IFRS 9.6.4.1(b).
      </p>
      <CitationNote text="IFRS 9.6.4.1(b) — highly probable forecast transaction; BCBS 2019 FRTB §MAR12.1 bucket classification" />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div>
          <FL label="CASH FLOW VISIBILITY HORIZON" hint="how far forward can you project FX flows reliably?" />
          <select value={s.cashFlowVisibility} onChange={(e) => set({ cashFlowVisibility: e.target.value })} style={selectBase}>
            <option value="">Select horizon...</option>
            {VISIBILITY_OPTS.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div>
          <FL label="SEASONAL PATTERNS" hint="affects tenor bucketing and layering strategy" />
          <select value={s.seasonalPatterns} onChange={(e) => set({ seasonalPatterns: e.target.value })} style={selectBase}>
            <option value="">Select pattern...</option>
            {SEASONAL_OPTS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <SliderField label="CASH FLOW CERTAINTY" citation="IFRS 9.B6.3.7"
        hint="0% = fully speculative, 100% = contractually confirmed. Drives CONFIRMED vs FORECAST bucket allocation"
        value={s.cashFlowCertainty} onChange={(v) => set({ cashFlowCertainty: v })}
        min={0} max={100} step={1} format={(v) => `${v}%`} />

      <SliderField label="RECEIVABLE / PAYABLE SPLIT"
        hint="proportion of FX flows that are receivables (inflows). Determines net exposure direction for instrument selection"
        value={s.receivableSplit} onChange={(v) => set({ receivableSplit: v })}
        min={0} max={100} step={1} format={(v) => `${v}% Recv / ${100 - v}% Pay`} />

      {/* Derived display */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, padding: "10px 14px", background: S.bgSub, border: `1px solid ${S.rim}` }}>
        {[
          { label: "CONFIRMED HEDGE BOUND", value: `${Math.round(s.cashFlowCertainty)}%` },
          { label: "FORECAST BUCKET", value: `${100 - Math.round(s.cashFlowCertainty)}%` },
          { label: "NET FLOW TYPE", value: s.receivableSplit > 60 ? "NET RECEIVER" : s.receivableSplit < 40 ? "NET PAYER" : "BALANCED" },
        ].map(({ label, value }) => (
          <div key={label}>
            <div style={{ fontFamily: S.fontMono, fontSize: "0.5625rem", color: S.tertiary, letterSpacing: "0.08em" }}>{label}</div>
            <div style={{ fontFamily: S.fontMono, fontSize: "0.875rem", fontWeight: 700, color: S.cyan, marginTop: 3 }}>{value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
        <div>
          <FL label="PAYMENT FREQUENCY" citation="affects tenor ladder in Phase C" />
          <select value={s.paymentFrequency} onChange={(e) => set({ paymentFrequency: e.target.value })} style={selectBase}>
            <option value="">Select...</option>
            {PAYMENT_FREQS.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
        <div>
          <FL label="AVG TRANSACTION SIZE (USD)" hint="per individual FX trade" />
          <input type="number" value={s.avgTransactionSizeUsd} onChange={(e) => set({ avgTransactionSizeUsd: +e.target.value })}
            min={0} step={10000} style={inputBase} />
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 4 }}>
          <Toggle label="Intercompany FX Flows" hint="affects netting scope in Phase B2"
            checked={s.hasIntercompanyFlows} onChange={(v) => set({ hasIntercompanyFlows: v })} />
        </div>
      </div>
    </div>
  );
}

function StepB2({ s, set }: { s: WizardState; set: (p: Partial<WizardState>) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 900 }}>
      <p style={{ fontFamily: S.fontUI, fontSize: "0.8125rem", color: S.secondary, margin: 0, lineHeight: 1.65 }}>
        Configure netting rules and materiality thresholds. ISDA 2002 §2(c) permits netting of offsetting
        payment obligations within the same netting agreement. Proper netting reduces gross hedge notional
        and associated carry cost.
      </p>
      <CitationNote text="ISDA 2002 §2(c) netting; BCBS SA-CCR (2014) §6 — netting set definition; CLS Bank settlement cycle conventions" />

      <Toggle label="Netting Available"
        hint="Can receivable and payable FX flows in the same currency be netted before hedging? (ISDA §2c)"
        checked={s.nettingAvailable} onChange={(v) => set({ nettingAvailable: v })} />

      {s.nettingAvailable && (
        <>
          <Toggle label="Net Confirmed & Forecast Flows Together"
            hint="Include forecast flows in netting set — requires formal hedge documentation per IFRS 9.6.2.1"
            checked={s.netConfirmedForecast} onChange={(v) => set({ netConfirmedForecast: v })} />
          <div>
            <FL label="SETTLEMENT CYCLE (DAYS)" hint="T+N for net settlement, e.g. T+2 standard for spot FX" />
            <select value={s.settlementCycleDays} onChange={(e) => set({ settlementCycleDays: +e.target.value })} style={{ ...selectBase, maxWidth: 200 }}>
              {[1, 2, 3, 5].map(d => <option key={d} value={d}>T+{d}</option>)}
            </select>
          </div>
        </>
      )}

      <SectionDivider label="MATERIALITY THRESHOLDS" />
      <CitationNote text="BIS CPMI 2020 §4.5 — de minimis hedge sizing; MiFID2 Art.29 — transaction reporting thresholds" />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
        <div>
          <FL label="MATERIALITY THRESHOLD (USD)" hint="flows below this are excluded from hedging (de minimis)" />
          <input type="number" value={s.materialityThresholdUsd} onChange={(e) => set({ materialityThresholdUsd: +e.target.value })}
            min={0} step={1000} style={inputBase} />
        </div>
        <div>
          <FL label="MIN HEDGE SIZE (USD)" hint="smallest permissible individual hedge trade" citation="BCBS SA-CCR" />
          <input type="number" value={s.minHedgeSizeUsd} onChange={(e) => set({ minHedgeSizeUsd: +e.target.value })}
            min={0} step={10000} style={inputBase} />
        </div>
        <div>
          <FL label="MAX SINGLE TRADE (USD)" hint="largest single hedge transaction allowed without board approval" />
          <input type="number" value={s.maxSingleTradeUsd} onChange={(e) => set({ maxSingleTradeUsd: +e.target.value })}
            min={0} step={100000} style={inputBase} />
        </div>
      </div>

      {/* Materiality summary */}
      <div style={{ padding: "10px 14px", background: S.bgSub, border: `1px solid ${S.rim}`, fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.secondary, lineHeight: 1.8 }}>
        <span style={{ color: S.tertiary, letterSpacing: "0.06em" }}>NETTING SUMMARY · </span>
        Netting: <span style={{ color: s.nettingAvailable ? S.pass : S.fail }}>{s.nettingAvailable ? "ON" : "OFF"}</span>
        {s.nettingAvailable && <> · Settlement: <span style={{ color: S.cyan }}>T+{s.settlementCycleDays}</span></>}
        {" · "}De Minimis: <span style={{ color: S.cyan }}>${s.materialityThresholdUsd.toLocaleString()}</span>
        {" · "}Min Trade: <span style={{ color: S.cyan }}>${s.minHedgeSizeUsd.toLocaleString()}</span>
        {" · "}Max Trade: <span style={{ color: S.cyan }}>${s.maxSingleTradeUsd.toLocaleString()}</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE C STEPS
// ─────────────────────────────────────────────────────────────────────────────

function StepC1({ s, set }: { s: WizardState; set: (p: Partial<WizardState>) => void }) {
  const isEM = s.fxCorridors.some(p => /MXN|BRL|TRY|ZAR|INR|IDR|PHP|THB|KRW|COP|CLP|ARS/.test(p));

  const updateInstr = (id: string, field: keyof WizardState, val: boolean | number) => {
    set({ [field]: { ...(s[field] as Record<string, unknown>), [id]: val } });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 900 }}>
      <p style={{ fontFamily: S.fontUI, fontSize: "0.8125rem", color: S.secondary, margin: 0, lineHeight: 1.65 }}>
        Define the instrument eligibility matrix. Each instrument must be explicitly permitted;
        unlisted instruments are fail-closed (not permitted). NDF is mandatory for non-deliverable EM pairs.
      </p>
      <CitationNote text="ISDA 2022 Definitional Booklet §2; EMIR Art.11 — eligibility for EM NDFs; MiFID2 Annex I §C.4" />

      {isEM && (
        <div style={{ padding: "8px 12px", border: `1px solid ${S.amber}`, background: `color-mix(in srgb, ${S.amber} 6%, transparent)`, fontFamily: S.fontUI, fontSize: "0.75rem", color: S.amber }}>
          ⚠ EM currency pair detected — NDF is the primary settlement instrument for non-deliverable currencies (MXN is deliverable; BRL/INR/KRW are NDF-settled)
        </div>
      )}

      {/* Instrument grid */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: S.fontMono, fontSize: "0.6875rem" }}>
          <thead>
            <tr style={{ background: S.bgSub }}>
              {["INSTRUMENT","ALLOWED","MAX TENOR (DAYS)","REQUIRES APPROVAL","MAX NOTIONAL (USD)"].map(h => (
                <th key={h} style={{ padding: "6px 10px", textAlign: "left", borderBottom: `1px solid ${S.rim}`, color: S.tertiary, letterSpacing: "0.06em", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {INSTRUMENTS.map(({ id, label, em }) => {
              const allowed = s.instrAllowed[id] ?? false;
              return (
                <tr key={id} style={{ borderBottom: `1px solid ${S.rim}`, background: allowed ? `color-mix(in srgb, ${S.pass} 3%, transparent)` : "transparent" }}>
                  <td style={{ padding: "8px 10px", color: allowed ? S.primary : S.tertiary, fontWeight: allowed ? 600 : 400 }}>
                    {label}{em && <span style={{ color: S.amber, marginLeft: 4 }}>EM</span>}
                  </td>
                  <td style={{ padding: "8px 10px" }}>
                    <input type="checkbox" checked={allowed}
                      onChange={(e) => {
                        updateInstr(id, "instrAllowed", e.target.checked);
                        if (e.target.checked && !s.instrumentPreferences.includes(id)) {
                          set({ instrumentPreferences: [...s.instrumentPreferences, id] });
                        } else if (!e.target.checked) {
                          set({ instrumentPreferences: s.instrumentPreferences.filter(x => x !== id) });
                        }
                      }}
                      style={{ accentColor: S.pass, cursor: "pointer", width: 16, height: 16 }} />
                  </td>
                  <td style={{ padding: "8px 10px" }}>
                    <input type="number" value={s.instrMaxTenorDays[id] ?? 365} disabled={!allowed}
                      onChange={(e) => updateInstr(id, "instrMaxTenorDays", +e.target.value)}
                      style={{ ...inputBase, maxWidth: 90, opacity: allowed ? 1 : 0.4 }} />
                  </td>
                  <td style={{ padding: "8px 10px" }}>
                    <input type="checkbox" checked={s.instrRequiresApproval[id] ?? false} disabled={!allowed}
                      onChange={(e) => updateInstr(id, "instrRequiresApproval", e.target.checked)}
                      style={{ accentColor: S.amber, cursor: allowed ? "pointer" : "default", width: 16, height: 16, opacity: allowed ? 1 : 0.4 }} />
                  </td>
                  <td style={{ padding: "8px 10px" }}>
                    <input type="number" value={s.instrMaxNotionalUsd[id] ?? 10000000} disabled={!allowed}
                      onChange={(e) => updateInstr(id, "instrMaxNotionalUsd", +e.target.value)}
                      style={{ ...inputBase, maxWidth: 130, opacity: allowed ? 1 : 0.4 }} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.pass }}>
        {s.instrumentPreferences.length > 0
          ? `✓ ${s.instrumentPreferences.length} instrument(s) enabled: ${s.instrumentPreferences.join(", ")}`
          : "⚠ No instruments enabled — at least one required"
        }
      </div>
    </div>
  );
}

function StepC2({ s, set }: { s: WizardState; set: (p: Partial<WizardState>) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 900 }}>
      <p style={{ fontFamily: S.fontUI, fontSize: "0.8125rem", color: S.secondary, margin: 0, lineHeight: 1.65 }}>
        Configure the tenor ladder and cost parameters. Transaction cost calibration follows BIS FX survey
        bid-ask benchmarks: G10 majors 0.5–2 bps, G10 minors 2–5 bps, EM deliverable 4–8 bps, EM NDFs 8–15 bps.
      </p>
      <CitationNote text="BIS FX Survey 2022 Table E.2 — median bid-ask by currency pair; BCBS FRTB §MAR22.29 — tenor bucket definitions" />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 14 }}>
        <div>
          <FL label="MIN TENOR (DAYS)" hint="shortest permissible trade" />
          <input type="number" value={s.tenorMinDays} onChange={(e) => set({ tenorMinDays: +e.target.value })}
            min={1} max={s.tenorMaxDays - 1} style={inputBase} />
        </div>
        <div>
          <FL label="MAX TENOR (DAYS)" hint="longest permissible trade" />
          <input type="number" value={s.tenorMaxDays} onChange={(e) => set({ tenorMaxDays: +e.target.value })}
            min={s.tenorMinDays + 1} max={3650} style={inputBase} />
        </div>
        <div>
          <FL label="ROLL WINDOW (DAYS BEFORE EXPIRY)" hint="close + re-hedge window" />
          <input type="number" value={s.rollWindowDays} onChange={(e) => set({ rollWindowDays: +e.target.value })}
            min={1} max={30} style={inputBase} />
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 4 }}>
          <Toggle label="Roll Allowed" hint="permit pre-expiry roll" checked={s.rollAllowed} onChange={(v) => set({ rollAllowed: v })} />
        </div>
      </div>

      <SliderField label="TRANSACTION COST ASSUMPTION (BPS)"
        hint="spread assumption for hedge cost modelling. BIS benchmark: G10 ~1.5, EM deliverable ~5-8, NDF ~8-15"
        citation="BIS 2022"
        value={s.maxSpreadBps} onChange={(v) => set({ maxSpreadBps: v })}
        min={0.5} max={30} step={0.5} format={(v) => `${v} bps`} />

      <SliderField label="HEDGE RATIO TARGET" citation="IFRS 9.B6.4.2"
        hint="declared target ratio — engine uses this as the optimisation objective. IFRS 9 requires hedge ratio = ratio of actual hedged item to hedging instrument"
        value={s.hedgeRatioTarget} onChange={(v) => set({ hedgeRatioTarget: v })}
        min={0} max={100} step={5} format={(v) => `${v}%`} />
      {(s.hedgeRatioTarget ?? 0) > (s.cashFlowCertainty ?? 100) && (
        <div style={{
          fontFamily: S.fontMono, fontSize: "0.5625rem", letterSpacing: "0.06em",
          padding: "3px 8px", border: `1px solid ${S.fail}`, color: S.fail,
          marginTop: 4, display: "inline-block",
        }}>
          IFRS 9 VIOLATION: FORECAST MUST NOT EXCEED CONFIRMED ({s.cashFlowCertainty}%)
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE D STEPS
// ─────────────────────────────────────────────────────────────────────────────

function StepD1({ s, set }: { s: WizardState; set: (p: Partial<WizardState>) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 900 }}>
      <p style={{ fontFamily: S.fontUI, fontSize: "0.8125rem", color: S.secondary, margin: 0, lineHeight: 1.65 }}>
        Set cost and risk budgets. Premium budget constrains option usage; carry cost cap limits forward point
        expense; the cost/protection priority dial directly maps to the AI hedge ratio recommendation.
      </p>
      <CitationNote text="Wharton Survey 1998 §4 — corporates typically budget 0.5–1.5% premium; ISDA 2022 §8 — option premium settlement terms" />

      <SliderField label="OPTION PREMIUM BUDGET (% OF NOTIONAL)" citation="Wharton 1998"
        hint="maximum acceptable option premium cost per annum as % of hedged notional"
        value={s.premiumBudget} onChange={(v) => set({ premiumBudget: v })}
        min={0} max={3} step={0.1} format={(v) => `${v.toFixed(1)}%`} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div>
          <FL label="MAX CARRY COST (BPS/YEAR)" hint="forward point carry budget — set to 0 for cost-neutral programmes" citation="BIS FX Survey" />
          <input type="number" value={s.maxCarryCostBpsAnnual} onChange={(e) => set({ maxCarryCostBpsAnnual: +e.target.value })}
            min={0} max={500} step={5} style={inputBase} />
        </div>
        <div>
          <FL label="MAX OPTION PREMIUM (% NOTIONAL)" hint="per single option trade cap" />
          <input type="number" value={s.maxOptionPremiumPct} onChange={(e) => set({ maxOptionPremiumPct: +e.target.value })}
            min={0} max={10} step={0.1} style={inputBase} />
        </div>
      </div>

      <SliderField label="COST vs PROTECTION PRIORITY"
        hint="0% = minimize hedge cost (cost-efficient programme), 100% = maximize protection regardless of cost"
        value={s.costProtectionPriority} onChange={(v) => set({ costProtectionPriority: v })}
        min={0} max={100} step={1}
        format={(v) => v <= 20 ? "Pure Cost Savings" : v <= 40 ? "Cost-Leaning" : v <= 60 ? "Balanced" : v <= 80 ? "Protection-Leaning" : "Maximum Protection"} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div>
          <FL label="MAXIMUM ACCEPTABLE LOSS" hint="absolute loss tolerance as % of notional (tail scenario)" />
          <select value={s.maxAcceptableLoss} onChange={(e) => set({ maxAcceptableLoss: e.target.value })} style={selectBase}>
            <option value="">Select threshold...</option>
            {MAX_LOSS_OPTS.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <div>
          <FL label="LEVERAGE CAP" hint="max notional-to-equity ratio (1.0 = no leverage)" citation="Basel III LCR" />
          <input type="number" value={s.leverageCap} onChange={(e) => set({ leverageCap: +e.target.value })}
            min={1} max={10} step={0.1} style={inputBase} />
        </div>
      </div>
    </div>
  );
}

function StepD2({ s, set }: { s: WizardState; set: (p: Partial<WizardState>) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 900 }}>
      <p style={{ fontFamily: S.fontUI, fontSize: "0.8125rem", color: S.secondary, margin: 0, lineHeight: 1.65 }}>
        Define concentration limits. These fail-closed rules prevent portfolio-level risk accumulation
        and are required by Basel III FRTB for HTCS (Held-to-Collect-and-Sell) portfolios.
      </p>
      <CitationNote text="BCBS FRTB 2019 §MAR12 — concentration limits for non-modellable risk factors; Basel III LCR §20(j)" />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        {[
          { key: "maxInstrumentConcentrationPct" as const, label: "MAX INSTRUMENT CONCENTRATION (%)", hint: "% of total portfolio in any single instrument type (e.g. all forwards ≤ 80%)" },
          { key: "maxCounterpartyConcentrationPct" as const, label: "MAX COUNTERPARTY CONCENTRATION (%)", hint: "% of total notional with any single bank/dealer counterparty" },
          { key: "maxTenorConcentrationPct" as const, label: "MAX TENOR BUCKET CONCENTRATION (%)", hint: "% of portfolio maturing within a single calendar month" },
          { key: "maxCurrencyConcentrationPct" as const, label: "MAX CURRENCY CONCENTRATION (%)", hint: "% of portfolio in any single currency pair" },
        ].map(({ key, label, hint }) => (
          <div key={key}>
            <FL label={label} hint={hint} citation="BCBS FRTB §MAR12" />
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="range" min={10} max={100} step={5} value={s[key]}
                onChange={(e) => set({ [key]: +e.target.value })}
                style={{ flex: 1, accentColor: S.cyan }} />
              <span style={{ fontFamily: S.fontMono, fontSize: "0.8125rem", fontWeight: 700, color: S.cyan, minWidth: 40, textAlign: "right" }}>{s[key]}%</span>
            </div>
          </div>
        ))}
      </div>

      {/* Concentration dashboard */}
      <div style={{ padding: "10px 14px", background: S.bgSub, border: `1px solid ${S.rim}` }}>
        <div style={{ fontFamily: S.fontMono, fontSize: "0.5625rem", color: S.tertiary, letterSpacing: "0.1em", marginBottom: 8 }}>CONCENTRATION LIMITS SUMMARY</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
          {[
            { label: "INSTRUMENT", value: s.maxInstrumentConcentrationPct },
            { label: "COUNTERPARTY", value: s.maxCounterpartyConcentrationPct },
            { label: "TENOR", value: s.maxTenorConcentrationPct },
            { label: "CURRENCY", value: s.maxCurrencyConcentrationPct },
          ].map(({ label, value }) => (
            <div key={label}>
              <div style={{ fontFamily: S.fontMono, fontSize: "0.5rem", color: S.tertiary }}>{label}</div>
              <div style={{ fontFamily: S.fontMono, fontSize: "1rem", fontWeight: 700, color: value <= 50 ? S.pass : value <= 75 ? S.amber : S.fail }}>{value}%</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE E STEPS
// ─────────────────────────────────────────────────────────────────────────────

function StepE1({ s, set }: { s: WizardState; set: (p: Partial<WizardState>) => void }) {
  const STRESS_LABELS: Record<string, string> = {
    MILD_STRESS:     "±5% spot shock (normal quarter, VIX 15–20)",
    MODERATE_STRESS: "±15% spot shock (2018 EM crisis, VIX 25–35)",
    SEVERE_STRESS:   "±25% spot shock (2020 COVID selloff, VIX 50+)",
    TAIL_STRESS:     "±40% spot shock (1994 Tequila, 2008 GFC)",
    CUSTOM:          "User-defined scenarios (Phase E2)",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 900 }}>
      <p style={{ fontFamily: S.fontUI, fontSize: "0.8125rem", color: S.secondary, margin: 0, lineHeight: 1.65 }}>
        Select a stress scenario pack. Packs are calibrated to historical FX crises: the 1994 Tequila Crisis
        (MXN -52%), 2018 BRL/TRY crisis (BRL -20%, TRY -28%), 2020 COVID selloff (EM basket -15–25%),
        and the 2022 Russia/Ukraine shock (EUR/USD -15%). Back-testing validates policy survivability.
      </p>
      <CitationNote text="BCBS FRTB 2019 §MAR23.2 — stress VaR requirement; BIS WP No.820 (2020) COVID EM FX stress; IMF WEO 2022" />

      <ButtonGroup label="STANDARD STRESS PACK" citation="BCBS FRTB §MAR23"
        hint="pre-calibrated historical shock scenarios"
        options={STRESS_PACKS} value={s.standardStressPack} onChange={(v) => set({ standardStressPack: v })} cols={3} />

      <div style={{ padding: "8px 12px", border: `1px solid ${S.rim}`, background: S.bgSub, fontFamily: S.fontUI, fontSize: "0.75rem", color: S.secondary, lineHeight: 1.7 }}>
        <strong style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.cyan }}>
          {s.standardStressPack || "MODERATE_STRESS"}</strong>
        {" — "}{STRESS_LABELS[s.standardStressPack] || STRESS_LABELS.MODERATE_STRESS}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
        <div>
          <FL label="VAR CONFIDENCE LEVEL" citation="BCBS §MAR10.3" hint="probability level for VaR computation" />
          <select value={s.varConfidence} onChange={(e) => set({ varConfidence: e.target.value })} style={selectBase}>
            {VAR_CONFIDENCE_OPTS.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div>
          <FL label="DRAWDOWN TOLERANCE" hint="maximum tolerated mark-to-market drawdown" />
          <select value={s.drawdownTolerance} onChange={(e) => set({ drawdownTolerance: e.target.value })} style={selectBase}>
            <option value="">Select...</option>
            {DRAWDOWN_OPTS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div>
          <FL label="BACK-TEST WINDOW (DAYS)" citation="BCBS §MAR32.8" hint="252 = 1 trading year" />
          <input type="number" value={s.backTestWindowDays} onChange={(e) => set({ backTestWindowDays: +e.target.value })}
            min={21} max={1260} step={21} style={inputBase} />
        </div>
      </div>

      <Toggle label="Worst-Case Focus Mode"
        hint="Weight AI recommendation towards maximum protection under the selected stress scenario (overrides cost-sensitivity)"
        checked={s.worstCaseFocus} onChange={(v) => set({ worstCaseFocus: v })} />

      <div>
        <FL label="GOVERNANCE NOTES" hint="risk committee instructions, caveats, model limitations — stored in audit log" />
        <textarea value={s.governanceNotes} onChange={(e) => set({ governanceNotes: e.target.value })}
          placeholder="e.g. Risk committee approval required for tail stress scenarios. Model assumes log-normal FX returns — fat-tail distributions not fully captured."
          rows={3} style={{ ...inputBase, resize: "vertical" }} />
      </div>
    </div>
  );
}

function StepE2({ s, set }: { s: WizardState; set: (p: Partial<WizardState>) => void }) {
  const addScenario = () => {
    if (s.customScenarios.length >= 5) return;
    set({ customScenarios: [...s.customScenarios, { name: `Scenario ${s.customScenarios.length + 1}`, spotShockPct: -15, volShockPct: 10, sourceEvent: "" }] });
  };
  const removeScenario = (i: number) => set({ customScenarios: s.customScenarios.filter((_, j) => j !== i) });
  const updateScenario = (i: number, key: string, val: string | number) => {
    const next = [...s.customScenarios];
    next[i] = { ...next[i], [key]: val };
    set({ customScenarios: next });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 900 }}>
      <p style={{ fontFamily: S.fontUI, fontSize: "0.8125rem", color: S.secondary, margin: 0, lineHeight: 1.65 }}>
        Define up to 5 custom stress scenarios. These supplement the standard pack with company-specific or
        geopolitical shocks relevant to your exposure profile.
      </p>
      <CitationNote text="BCBS FRTB 2019 §MAR23.3 — institution-specific stress scenarios; IMF FSAP methodology 2023" />

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button type="button" onClick={addScenario} disabled={s.customScenarios.length >= 5} style={{
          fontFamily: S.fontMono, fontSize: "0.6875rem", padding: "5px 14px",
          border: `1px solid ${s.customScenarios.length >= 5 ? S.rim : S.cyan}`,
          color: s.customScenarios.length >= 5 ? S.tertiary : S.cyan,
          background: "transparent", cursor: s.customScenarios.length >= 5 ? "not-allowed" : "pointer",
        }}>+ Add Scenario ({s.customScenarios.length}/5)</button>
        <span style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary }}>
          {s.customScenarios.length === 0 ? "No custom scenarios (standard pack applies)" : ""}
        </span>
      </div>

      {s.customScenarios.map((sc, i) => (
        <div key={i} style={{ padding: "14px", border: `1px solid ${S.rim}`, background: S.bgSub }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", letterSpacing: "0.08em", color: S.secondary }}>SCENARIO {i + 1}</span>
            <button type="button" onClick={() => removeScenario(i)} style={{ fontFamily: S.fontMono, fontSize: "0.625rem", color: S.fail, background: "transparent", border: "none", cursor: "pointer" }}>✕ Remove</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 2fr", gap: 10 }}>
            <div>
              <FL label="SCENARIO NAME" />
              <input type="text" value={sc.name} onChange={(e) => updateScenario(i, "name", e.target.value)} style={inputBase} />
            </div>
            <div>
              <FL label="SPOT SHOCK (%)" hint="negative = depreciation" />
              <input type="number" value={sc.spotShockPct} onChange={(e) => updateScenario(i, "spotShockPct", +e.target.value)} min={-80} max={80} style={inputBase} />
            </div>
            <div>
              <FL label="VOL SHOCK (%)" hint="implied vol increase" />
              <input type="number" value={sc.volShockPct} onChange={(e) => updateScenario(i, "volShockPct", +e.target.value)} min={0} max={100} style={inputBase} />
            </div>
            <div>
              <FL label="SOURCE EVENT" hint="e.g. 2018 EM Crisis / Tequila 1994" />
              <input type="text" value={sc.sourceEvent} onChange={(e) => updateScenario(i, "sourceEvent", e.target.value)} placeholder="e.g. 2020 COVID selloff" style={inputBase} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE F — GOVERNANCE REVIEW
// ─────────────────────────────────────────────────────────────────────────────

function StepF1({ s }: { s: WizardState }) {
  const checks = [
    { label: "Primary objective defined",        pass: !!s.primaryObjective },
    { label: "Currency universe specified (≥1 pair)", pass: s.fxCorridors.length > 0 },
    { label: "Hedge ratio target set",            pass: s.hedgeRatioTarget > 0 },
    { label: "At least 1 instrument enabled",    pass: s.instrumentPreferences.length > 0 },
    { label: "Materiality threshold defined",     pass: s.materialityThresholdUsd >= 0 },
    { label: "Stress pack selected",              pass: !!s.standardStressPack },
    { label: "VaR confidence specified",          pass: !!s.varConfidence },
    { label: "Time horizon configured",           pass: s.timeHorizonMonths > 0 },
    { label: "Board statement (IFRS 9.6.4.1)",   pass: !!s.boardStatement || !s.ifrsCompliance },
    { label: "IFRS/regulatory regime documented", pass: s.regulatoryRegimes.length > 0 },
  ];
  const score = checks.filter(c => c.pass).length;
  const pct = Math.round((score / checks.length) * 100);
  const color = pct >= 80 ? S.pass : pct >= 60 ? S.amber : S.fail;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 900 }}>
      <p style={{ fontFamily: S.fontUI, fontSize: "0.8125rem", color: S.secondary, margin: 0, lineHeight: 1.65 }}>
        Policy quality review. The approval checklist validates minimum documentation requirements for
        IFRS 9 hedge accounting and BCBS FRTB market risk reporting. Policies scoring &lt;60% cannot
        advance to APPROVED status.
      </p>
      <CitationNote text="IFRS 9.6.4.1 formal hedge documentation requirements; BCBS FRTB 2019 §MAR23 policy completeness rules" />

      {/* Quality Score */}
      <div style={{ padding: "16px 20px", border: `2px solid ${color}`, background: `color-mix(in srgb, ${color} 6%, ${S.bgPanel})` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <span style={{ fontFamily: S.fontMono, fontSize: "0.875rem", fontWeight: 700, letterSpacing: "0.08em", color }}>
            POLICY QUALITY SCORE
          </span>
          <span style={{ fontFamily: S.fontMono, fontSize: "1.5rem", fontWeight: 700, color }}>{pct}%</span>
        </div>
        <div style={{ height: 6, background: S.rim, borderRadius: 3, overflow: "hidden", marginBottom: 8 }}>
          <div style={{ height: "100%", width: `${pct}%`, background: color, transition: "width 0.4s", borderRadius: 3 }} />
        </div>
        <div style={{ fontFamily: S.fontMono, fontSize: "0.625rem", color: S.tertiary }}>
          {pct >= 80 ? "✓ READY FOR AI ANALYSIS" : pct >= 60 ? "⚠ GAPS DETECTED — AI will use fallback defaults" : "✗ INSUFFICIENT — complete required fields before proceeding"}
        </div>
      </div>

      {/* Checklist */}
      <div style={{ border: `1px solid ${S.rim}` }}>
        <div style={{ padding: "8px 14px", background: S.bgSub, borderBottom: `1px solid ${S.rim}`, fontFamily: S.fontMono, fontSize: "0.5625rem", letterSpacing: "0.1em", color: S.tertiary }}>
          APPROVAL CHECKLIST — {score}/{checks.length} ITEMS PASSED
        </div>
        {checks.map((c, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", borderBottom: i < checks.length - 1 ? `1px solid ${S.rim}` : "none" }}>
            <span style={{ fontFamily: S.fontMono, fontSize: "0.75rem", color: c.pass ? S.pass : S.fail, width: 16 }}>
              {c.pass ? "✓" : "✗"}
            </span>
            <span style={{ fontFamily: S.fontUI, fontSize: "0.8125rem", color: c.pass ? S.secondary : S.tertiary }}>{c.label}</span>
          </div>
        ))}
      </div>

      {/* Policy Summary */}
      <SectionDivider label="POLICY PARAMETER SUMMARY" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        {[
          { label: "OBJECTIVE",      value: s.primaryObjective || "—" },
          { label: "PAIRS",          value: s.fxCorridors.length > 0 ? `${s.fxCorridors.length} pairs` : "—" },
          { label: "HEDGE TARGET",   value: `${s.hedgeRatioTarget}%` },
          { label: "INSTRUMENTS",    value: s.instrumentPreferences.join(", ") || "—" },
          { label: "HORIZON",        value: `${s.timeHorizonMonths}M` },
          { label: "STRESS PACK",    value: s.standardStressPack || "—" },
          { label: "VaR CONF.",      value: s.varConfidence || "—" },
          { label: "SPREAD BPS",     value: `${s.maxSpreadBps} bps` },
          { label: "IFRS 9",         value: s.ifrsCompliance ? "YES" : "NO" },
        ].map(({ label, value }) => (
          <div key={label} style={{ padding: "8px 12px", background: S.bgSub, border: `1px solid ${S.rim}` }}>
            <div style={{ fontFamily: S.fontMono, fontSize: "0.5rem", color: S.tertiary, letterSpacing: "0.1em" }}>{label}</div>
            <div style={{ fontFamily: S.fontMono, fontSize: "0.8125rem", fontWeight: 600, color: S.primary, marginTop: 3 }}>{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE G — AI + SAVE
// ─────────────────────────────────────────────────────────────────────────────

function RecommendationCard({ rec, selected, onSelect, expanded, onToggleExpand }: {
  rec: AIPolicyRecommendation; selected: boolean; onSelect: () => void;
  expanded: boolean; onToggleExpand: () => void;
}) {
  const p = rec.preset;
  const riskColor = p.riskPosture === "CONSERVATIVE" ? S.pass : p.riskPosture === "AGGRESSIVE" ? S.fail : S.amber;
  return (
    <div style={{
      flex: "1 1 260px", border: `1.5px solid ${selected ? S.cyan : S.rim}`,
      background: selected ? `color-mix(in srgb, ${S.cyan} 6%, ${S.bgPanel})` : S.bgPanel,
      borderRadius: 3, display: "flex", flexDirection: "column", overflow: "hidden", transition: "border-color 0.15s",
    }}>
      <div style={{ padding: "12px 16px", background: selected ? `color-mix(in srgb, ${S.cyan} 10%, ${S.bgDeep})` : S.bgDeep, borderBottom: `1px solid ${S.rim}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <span style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", letterSpacing: "0.1em", fontWeight: 700, color: selected ? S.cyan : S.tertiary }}>{rec.label.toUpperCase()}</span>
          <span style={{ fontFamily: S.fontMono, fontSize: "0.625rem", padding: "1px 5px", borderRadius: 2, background: `color-mix(in srgb, ${riskColor} 12%, transparent)`, color: riskColor }}>{p.riskPosture}</span>
        </div>
        <div style={{ marginTop: 6, fontFamily: S.fontUI, fontSize: "0.875rem", fontWeight: 600, color: S.primary }}>&ldquo;{p.shortName}&rdquo; Policy</div>
        <div style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary, marginTop: 2 }}>{p.name}</div>
      </div>
      <div style={{ padding: "12px 16px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {[
          { label: "CONF HEDGE", value: `${Math.round(p.policy.hedge_ratios.confirmed * 100)}%` },
          { label: "FCST HEDGE", value: `${Math.round(p.policy.hedge_ratios.forecast  * 100)}%` },
          { label: "SPREAD",     value: `${p.policy.cost_assumptions.spread_bps} bps` },
          { label: "PRODUCT",    value: p.policy.execution_product },
        ].map(({ label, value }) => (
          <div key={label} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontFamily: S.fontMono, fontSize: "0.5625rem", letterSpacing: "0.08em", color: S.tertiary }}>{label}</span>
            <span style={{ fontFamily: S.fontMono, fontSize: "0.8125rem", fontWeight: 700, color: S.primary }}>{value}</span>
          </div>
        ))}
      </div>
      {expanded && (
        <div style={{ padding: "0 16px 12px", borderTop: `1px solid ${S.rim}`, paddingTop: 10 }}>
          <span style={{ fontFamily: S.fontMono, fontSize: "0.5625rem", letterSpacing: "0.08em", color: S.tertiary, display: "block", marginBottom: 6 }}>RATIONALE</span>
          <p style={{ fontFamily: S.fontUI, fontSize: "0.75rem", color: S.secondary, margin: 0, lineHeight: 1.6 }}>{rec.rationale}</p>
        </div>
      )}
      <div style={{ marginTop: "auto", padding: "10px 16px", borderTop: `1px solid ${S.rim}`, display: "flex", justifyContent: "space-between" }}>
        <button type="button" onClick={onSelect} style={{
          fontFamily: S.fontMono, fontSize: "0.6875rem", letterSpacing: "0.06em", fontWeight: 700, padding: "5px 14px",
          border: `1px solid ${selected ? S.pass : S.cyan}`, color: selected ? S.pass : S.cyan,
          background: selected ? `color-mix(in srgb, ${S.pass} 8%, transparent)` : `color-mix(in srgb, ${S.cyan} 8%, transparent)`, cursor: "pointer",
        }}>{selected ? "✓ SELECTED" : "Select"}</button>
        <button type="button" onClick={onToggleExpand} style={{
          fontFamily: S.fontMono, fontSize: "0.625rem", padding: "3px 8px", border: `1px solid ${S.rim}`, color: S.tertiary, background: "transparent", cursor: "pointer",
        }}>{expanded ? "Hide" : "Rationale"}</button>
      </div>
    </div>
  );
}

function StepG1({
  s, aiResult, aiLoading, aiError, selectedRecId, onSelect,
  expandedId, onToggleExpand, policyName, setPolicyName, policyTag, setPolicyTag,
  saving, saved, saveError, onSave, onApply, onStartOver, policyStatus, setPolicyStatus,
}: {
  s: WizardState;
  aiResult: AIPolicyResult | null;
  aiLoading: boolean;
  aiError: string;
  selectedRecId: string | null;
  onSelect: (id: string) => void;
  expandedId: string | null;
  onToggleExpand: (id: string) => void;
  policyName: string; setPolicyName: (v: string) => void;
  policyTag: string;  setPolicyTag: (v: string) => void;
  saving: boolean; saved: boolean; saveError: string;
  onSave: (status: string) => void;
  onApply: () => void;
  onStartOver: () => void;
  policyStatus: string; setPolicyStatus: (v: string) => void;
}) {
  // Auto-populate policy name when a recommendation is selected and name is empty
  useEffect(() => {
    if (selectedRecId && !policyName.trim() && aiResult?.recommendations) {
      const idx = aiResult.recommendations.findIndex(
        (_, i) => `${aiResult.recommendations[i].preset.shortName}-${i}` === selectedRecId
      );
      const rec = aiResult.recommendations[idx >= 0 ? idx : 0];
      if (rec) {
        const dateStr = new Date().toISOString().slice(0, 10);
        setPolicyName(`${rec.preset?.name ?? 'Custom Policy'} — ${dateStr}`);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRecId, aiResult]);

  if (aiLoading) return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, minHeight: 280 }}>
      <div style={{ fontFamily: S.fontMono, fontSize: "0.625rem", color: S.cyan, letterSpacing: "0.12em" }}>ANALYZING PROFILE…</div>
      <div style={{ display: "flex", gap: 6 }}>{[0,1,2].map(i => (
        <div key={i} style={{ width: 8, height: 8, borderRadius: 4, background: S.cyan, opacity: 0.3, animation: `pulse 1.2s ease-in-out ${i * 0.4}s infinite` }} />
      ))}</div>
      <p style={{ fontFamily: S.fontUI, fontSize: "0.75rem", color: S.secondary, textAlign: "center", maxWidth: 360, margin: 0, lineHeight: 1.6 }}>
        The AI engine is generating recommendations calibrated to your {s.fxCorridors.length > 0 ? s.fxCorridors.join(", ") : "FX"} profile
        using IFRS 9, BCBS FRTB, and BIS FX Survey benchmarks.
      </p>
    </div>
  );
  if (aiError) return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.fail }}>AI ANALYSIS FAILED</div>
      <p style={{ fontFamily: S.fontUI, fontSize: "0.8125rem", color: S.secondary, margin: 0 }}>{aiError}</p>
    </div>
  );
  if (!aiResult) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", letterSpacing: "0.08em", color: S.cyan }}>
          {aiResult.fallback ? "PRESET MATCH" : "AI RECOMMENDATIONS"} — SELECT ONE TO SAVE
        </span>
        {!aiResult.fallback && (
          <span style={{ fontFamily: S.fontMono, fontSize: "0.5625rem", padding: "1px 6px", border: `1px solid ${S.pass}`, color: S.pass }}>CLAUDE AI</span>
        )}
        {aiResult.fallback && (
          <span style={{ fontFamily: S.fontMono, fontSize: "0.5rem", padding: "1px 6px", border: `1px solid ${S.amber}`, color: S.amber }}>RULE-BASED · NO AI</span>
        )}
      </div>

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        {aiResult.recommendations.map((rec, i) => {
          const recId = `${rec.preset.shortName}-${i}`;
          return (
            <RecommendationCard key={recId} rec={rec}
              selected={selectedRecId === recId} onSelect={() => onSelect(recId)}
              expanded={expandedId === recId} onToggleExpand={() => onToggleExpand(recId)} />
          );
        })}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 16px", background: S.bgSub, border: `1px solid ${S.rim}`, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontFamily: S.fontMono, fontSize: "0.625rem", color: S.tertiary }}>{aiResult.fallback ? "MATCH" : "AI CONFIDENCE"}</span>
          <span style={{ fontFamily: S.fontMono, fontSize: "0.875rem", fontWeight: 700, color: S.pass, padding: "2px 8px", border: `1px solid ${S.pass}`, background: `color-mix(in srgb, ${S.pass} 8%, transparent)` }}>
            {aiResult.fallback ? "PRESET" : "HIGH"}
          </span>
        </div>
        <span style={{ color: S.rim }}>|</span>
        <span style={{ fontFamily: S.fontMono, fontSize: "0.625rem", color: S.tertiary }}>NEAREST: </span>
        <span style={{ fontFamily: S.fontUI, fontSize: "0.75rem", color: S.secondary }}>{aiResult.nearest_preset_name ?? "—"}</span>
        <span style={{ color: S.rim }}>|</span>
        <span style={{ fontFamily: S.fontMono, fontSize: "0.625rem", color: S.tertiary }}>CORRIDORS: </span>
        <span style={{ fontFamily: S.fontMono, fontSize: "0.75rem", color: S.cyan }}>{s.fxCorridors.join(", ") || "—"}</span>
      </div>

      {/* Policy naming + status + save */}
      {selectedRecId && (
        <div style={{ borderTop: `1px solid ${S.rim}`, paddingTop: 16, display: "flex", flexDirection: "column", gap: 14 }}>
          {/* POLICY NAME — most prominent, full width */}
          <div>
            <FL label="POLICY NAME *" hint="descriptive name for this policy template" />
            <input
              type="text"
              value={policyName}
              onChange={e => setPolicyName(e.target.value)}
              placeholder="e.g. Q1 2026 Conservative EM Hedge"
              style={{
                ...inputBase,
                fontSize: "0.9375rem",
                fontWeight: 600,
                border: `1px solid ${!policyName.trim() && saveError ? S.fail : S.rim}`,
              }}
            />
            {!policyName.trim() && saveError && (
              <div style={{ fontFamily: S.fontMono, fontSize: "0.5625rem", color: S.fail, marginTop: 3, letterSpacing: "0.06em" }}>
                POLICY NAME IS REQUIRED
              </div>
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <FL label="TAG" hint="short identifier ≤20 chars" />
              <input type="text" value={policyTag} onChange={e => setPolicyTag(e.target.value)}
                placeholder="e.g. q1-em-cons" style={inputBase} maxLength={20} />
            </div>
            <div>
              <FL label="SAVE AS" hint="DRAFT or REVIEW" />
              <select value={policyStatus} onChange={e => setPolicyStatus(e.target.value)} style={selectBase}>
                <option value="DRAFT">DRAFT — editable</option>
                <option value="REVIEW">REVIEW — awaiting approval</option>
              </select>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            {saved ? (
              <span style={{ fontFamily: S.fontMono, fontSize: "0.75rem", color: S.pass, letterSpacing: "0.06em" }}>
                ✓ POLICY SAVED AS {policyStatus} — visible in Policy Library
              </span>
            ) : (
              <>
                <button type="button" onClick={() => onSave("DRAFT")}
                  disabled={saving || !policyName.trim()} style={{
                    fontFamily: S.fontMono, fontSize: "0.75rem", letterSpacing: "0.06em", fontWeight: 700,
                    padding: "6px 18px", border: `1px solid ${policyName.trim() ? S.rim : S.rim}`,
                    color: policyName.trim() ? S.secondary : S.tertiary,
                    background: "transparent", cursor: saving || !policyName.trim() ? "not-allowed" : "pointer",
                  }}>
                  {saving ? "SAVING…" : "↓ SAVE DRAFT"}
                </button>
                <button type="button" onClick={() => onSave("REVIEW")}
                  disabled={saving || !policyName.trim()} style={{
                    fontFamily: S.fontMono, fontSize: "0.75rem", letterSpacing: "0.06em", fontWeight: 700,
                    padding: "6px 18px", border: `1px solid ${policyName.trim() ? S.amber : S.rim}`,
                    color: policyName.trim() ? S.amber : S.tertiary,
                    background: policyName.trim() ? `color-mix(in srgb, ${S.amber} 8%, transparent)` : "transparent",
                    cursor: saving || !policyName.trim() ? "not-allowed" : "pointer",
                  }}>
                  {saving ? "SAVING…" : "↑ SUBMIT FOR REVIEW"}
                </button>
              </>
            )}
            <button type="button" onClick={onApply} style={{
              fontFamily: S.fontMono, fontSize: "0.75rem", letterSpacing: "0.06em", fontWeight: 700,
              padding: "6px 18px", border: `1px solid ${S.cyan}`, color: S.cyan,
              background: `color-mix(in srgb, ${S.cyan} 8%, transparent)`, cursor: "pointer",
            }}>⚡ APPLY TO SESSION</button>
            {saveError && <span style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.fail }}>{saveError}</span>}
          </div>
        </div>
      )}

      <button type="button" onClick={onStartOver} style={{
        alignSelf: "flex-start", fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary,
        background: "transparent", border: "none", cursor: "pointer", padding: "4px 0", textDecoration: "underline",
      }}>↺ Start Over</button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

// ── Per-step validation ────────────────────────────────────────────────────
function validateStep(idx: number, s: WizardState): string | null {
  switch (idx) {
    case 0: // A1 — Intent
      if (!s.primaryObjective.trim()) return 'Select a primary hedge objective to continue.';
      return null;
    case 1: // A2 — Portfolio Scope
      if (!s.companyType.trim()) return 'Select a company type to continue.';
      if (!s.primaryCurrency.trim()) return 'Select a primary currency to continue.';
      return null;
    case 2: // A3 — Time Horizon
      if (!s.hedgeExperience.trim()) return "Select your team's hedging experience level to continue.";
      if (!s.averageTenor.trim()) return 'Select an average hedge tenor to continue.';
      return null;
    case 3: // B1 — Exposure Classification
      if (!s.cashFlowVisibility.trim()) return 'Select cash flow visibility horizon to continue.';
      if (!s.seasonalPatterns.trim()) return 'Select a seasonal pattern to continue.';
      if (!s.paymentFrequency.trim()) return 'Select payment frequency to continue.';
      return null;
    case 4: // B2 — Netting Rules (optional phase — no hard block)
      return null;
    case 5: // C1 — Instrument Eligibility
      if (!Object.values(s.instrAllowed).some(Boolean)) return 'Enable at least one instrument to continue.';
      return null;
    case 6: // C2 — Tenor Ladder (optional)
      return null;
    case 7: // D1 — Cost & Risk Budget
      if (!s.maxAcceptableLoss.trim()) return 'Select a maximum acceptable loss threshold to continue.';
      // IFRS 9.6.4.1(b): hedge ratio target (forecast) must not exceed confirmed cash flow certainty
      if ((s.hedgeRatioTarget ?? 0) > (s.cashFlowCertainty ?? 100)) {
        return 'IFRS 9.6.4.1(b): forecast hedge ratio cannot exceed confirmed ratio — lower hedge ratio target or increase cash flow certainty (Phase B1)';
      }
      return null;
    case 8: // D2 — Concentration Limits (optional)
      return null;
    case 9: // E1 — Stress Pack
      if (!s.standardStressPack) return 'Select a stress testing pack to continue.';
      if (!s.drawdownTolerance.trim()) return 'Select a drawdown tolerance to continue.';
      return null;
    case 10: // E2 — Custom Scenarios (optional)
      return null;
    case 11: // F1 — Governance Review
      // Warn but don't block — governance is advisory
      return null;
    default:
      return null;
  }
}

const WIZARD_STORAGE_KEY = 'ai_wizard_state_v1';

export default function AIPolicyWizardPage() {
  const _planAllowed = usePlanRedirect("professional");
  const { isAuthenticated, token, user } = useAuth();
  const router = useRouter();

  const [stepIdx, setStepIdx] = useState(0);
  const [completed, setCompleted] = useState<Set<number>>(new Set());
  const [state, setState] = useState<WizardState>(INITIAL_STATE);
  const [stepError, setStepError] = useState<string | null>(null);

  const [aiResult, setAiResult]     = useState<AIPolicyResult | null>(null);
  const [aiLoading, setAiLoading]   = useState(false);
  const [aiError, setAiError]       = useState('');
  const [selectedRecId, setSelectedRecId] = useState<string | null>(null);
  const [expandedId, setExpandedId]       = useState<string | null>(null);

  const [policyName, setPolicyName] = useState('');
  const [policyTag, setPolicyTag]   = useState('');
  const [policyStatus, setPolicyStatus] = useState('DRAFT');
  const [saving, setSaving]         = useState(false);
  const [saved, setSaved]           = useState(false);
  const [saveError, setSaveError]   = useState('');

  // localStorage persistence
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load saved state on mount
  useEffect(() => {
    try {
      const storedJson = localStorage.getItem(WIZARD_STORAGE_KEY);
      if (storedJson) {
        const parsed = JSON.parse(storedJson) as Partial<typeof INITIAL_STATE>;
        setState(prev => ({ ...prev, ...parsed }));
      }
    } catch { /* ignore parse errors */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-save state on every change (debounced 500ms)
  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      try {
        localStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify(state));
        setLastSaved(new Date().toLocaleTimeString());
      } catch { /* ignore quota errors */ }
    }, 500);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [state]);

  const pct = useMemo(() => Math.round(((stepIdx + (saved ? 1 : 0)) / TOTAL_STEPS) * 100), [stepIdx, saved]);

  const activePanelSection = useMemo(() => {
    // Map wizard phase letters to help panel section IDs
    const phaseMap: Record<string, string> = {
      'A': 'overview',
      'B': 'exposure',
      'C': 'instruments',
      'D': 'constraints',
      'E': 'governance',
      'F': 'governance',
      'G': 'publish',
    };
    const currentStep = ALL_STEPS?.[stepIdx];
    const phase = currentStep?.phase ?? 'A';
    return phaseMap[phase] ?? 'overview';
  }, [stepIdx]);

  const patchState = useCallback((patch: Partial<WizardState>) => {
    setState(prev => ({ ...prev, ...patch }));
    setStepError(null); // clear step error on any field change
  }, []);

  useEffect(() => { if (!isAuthenticated) router.push('/auth/login'); }, [isAuthenticated, router]);

  // Clear step error when navigating between steps
  useEffect(() => { setStepError(null); }, [stepIdx]);

  // Redirect to policies after successful save (2s delay so user sees the confirmation)
  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => router.push('/policies'), 2000);
    return () => clearTimeout(t);
  }, [saved, router]);

  // Warn if company context is missing
  const companyIdMissing = isAuthenticated && !user?.company?.id;

  const IS_LAST = stepIdx === TOTAL_STEPS - 1;

  // ── Navigate forward / back ───────────────────────────────────────────────

  const goNext = useCallback(async () => {
    if (stepIdx >= TOTAL_STEPS - 1) return;

    // Hard validation gate
    const err = validateStep(stepIdx, state);
    if (err) { setStepError(err); return; }
    setStepError(null);

    const nextStep = stepIdx + 1;
    setCompleted(prev => new Set(prev).add(stepIdx));
    setStepIdx(nextStep);

    if (nextStep === TOTAL_STEPS - 1) {
      // Phase G — trigger AI
      setAiLoading(true);
      setAiError('');
      setAiResult(null);
      setSelectedRecId(null);
      setSaved(false);
      setSaveError('');
      try {
        const qa = mapWizardStateToQA(state);
        const result = await suggestPolicyAI(qa);
        setAiResult(result);
        // UX-POLICY-2: Do NOT auto-select — analyst must explicitly choose a recommendation
        // before the save button becomes available, preventing accidental saves.
      } catch (e) {
        const errMsg = (e as {response?: {data?: {detail?: string}}})?.response?.data?.detail
          ?? (e instanceof Error ? e.message : String(e));
        setAiError(`AI analysis failed: ${errMsg}`);
      } finally {
        setAiLoading(false);
      }
    }
  }, [stepIdx, state]);

  const goBack = useCallback(() => { if (stepIdx > 0) setStepIdx(s => s - 1); }, [stepIdx]);

  const startOver = useCallback(() => {
    setStepIdx(0); setCompleted(new Set()); setState(INITIAL_STATE);
    setAiResult(null); setAiLoading(false); setAiError('');
    setSelectedRecId(null); setExpandedId(null);
    setPolicyName(''); setPolicyTag(''); setSaved(false); setSaveError('');
  }, []);

  const handleClearProgress = useCallback(() => {
    localStorage.removeItem(WIZARD_STORAGE_KEY);
    setLastSaved(null);
    setState(INITIAL_STATE);
    setStepIdx(0);
    setCompleted(new Set());
    setAiResult(null); setAiLoading(false); setAiError('');
    setSelectedRecId(null); setExpandedId(null);
    setPolicyName(''); setPolicyTag(''); setSaved(false); setSaveError('');
  }, []);

  // ── Save policy ────────────────────────────────────────────────────────────

  const handleSave = useCallback(async (status: string) => {
    if (!aiResult || !policyName.trim() || !selectedRecId) {
      setSaveError('Select a recommendation and provide a policy name before saving.');
      return;
    }
    if (!token) { setSaveError('Not authenticated — please log in and try again.'); return; }

    const userId    = user?.id ?? 'system';
    // UX-POLICY-3: Block save if company context is missing — orphaned policy is unacceptable
    const companyId = user?.company?.id;
    if (!companyId) {
      setSaveError('Company context is unavailable — cannot save policy without a valid company. Please log out and log back in.');
      return;
    }

    // Parse index from recId format "${shortName}-{i}"
    const idxFromId = parseInt(selectedRecId.split('-').pop() ?? '0', 10);
    const idx = Number.isFinite(idxFromId) && idxFromId >= 0 && idxFromId < aiResult.recommendations.length
      ? idxFromId : 0;
    const selectedRec = aiResult.recommendations[idx];
    setSaving(true); setSaveError('');
    try {
      const canonical = buildCanonicalFromPageState(
        state, aiResult, selectedRec,
        userId, companyId!,
        policyName.trim(), policyTag.trim(),
      );
      // Apply the status chosen by the user in the UI
      // SEC-POLICY-1: Wizard may only produce DRAFT or REVIEW — never elevated statuses
      const safeStatus: "DRAFT" | "REVIEW" = (status === "REVIEW") ? "REVIEW" : "DRAFT";
      canonical.status = safeStatus;
      const payload = toCreateTemplatePayload(canonical);
      await createPolicyTemplate(payload, token);
      setSaved(true);
    } catch (e: unknown) {
      const detail = (e as {response?: {data?: {detail?: string}}})?.response?.data?.detail;
      const status_code = (e as {response?: {status?: number}})?.response?.status;
      if (status_code === 401) {
        setSaveError('Authentication expired — please log in again and retry.');
      } else if (status_code === 422) {
        setSaveError(`Validation error from server: ${detail ?? 'check required fields'}`);
      } else {
        setSaveError(`Save failed: ${detail ?? String(e)}`);
      }
    } finally {
      setSaving(false);
    }
  }, [aiResult, selectedRecId, policyName, policyTag, token, state, user]);

  const handleApply = useCallback(() => { router.push('/policies'); }, [router]);

  if (!_planAllowed || !isAuthenticated) return null;

  // ── Render step by index ───────────────────────────────────────────────────

  const renderStep = () => {
    const s = state;
    const set = patchState;
    switch (stepIdx) {
      // Phase A
      case 0:  return <StepA1 s={s} set={set} />;
      case 1:  return <StepA2 s={s} set={set} />;
      case 2:  return <StepA3 s={s} set={set} />;
      // Phase B
      case 3:  return <StepB1 s={s} set={set} />;
      case 4:  return <StepB2 s={s} set={set} />;
      // Phase C
      case 5:  return <StepC1 s={s} set={set} />;
      case 6:  return <StepC2 s={s} set={set} />;
      // Phase D
      case 7:  return <StepD1 s={s} set={set} />;
      case 8:  return <StepD2 s={s} set={set} />;
      // Phase E
      case 9:  return <StepE1 s={s} set={set} />;
      case 10: return <StepE2 s={s} set={set} />;
      // Phase F
      case 11: return <StepF1 s={s} />;
      // Phase G
      case 12: return (
        <StepG1
          s={s} aiResult={aiResult} aiLoading={aiLoading} aiError={aiError}
          selectedRecId={selectedRecId} onSelect={setSelectedRecId}
          expandedId={expandedId} onToggleExpand={(id) => setExpandedId(prev => prev === id ? null : id)}
          policyName={policyName} setPolicyName={setPolicyName}
          policyTag={policyTag}   setPolicyTag={setPolicyTag}
          saving={saving} saved={saved} saveError={saveError}
          onSave={handleSave} onApply={handleApply} onStartOver={startOver}
          policyStatus={policyStatus} setPolicyStatus={setPolicyStatus}
        />
      );
      default: return null;
    }
  };

  const canNext = !IS_LAST;

  return (
    <PageShell icon={Shield} title="Policy Builder" breadcrumb={["Dashboard","Policy Builder"]}>
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: 'auto', minWidth: 0, fontFamily: S.fontUI, color: S.primary }}>
      <TopBar
        onBack={() => router.push('/policies')}
        pct={pct}
        onHelp={() => {}}
        lastSaved={lastSaved}
        onClearProgress={handleClearProgress}
      />
      <PhaseRail stepIdx={stepIdx} onJump={(idx) => { setStepIdx(idx); setStepError(null); }} />

      {/* ── Company context warning ── */}
      {companyIdMissing && (
        <div style={{
          background: `color-mix(in srgb, ${S.amber} 8%, transparent)`,
          border: `1px solid color-mix(in srgb, ${S.amber} 25%, transparent)`,
          borderLeft: `3px solid ${S.amber}`,
          padding: "8px 24px", flexShrink: 0,
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <span style={{ fontFamily: S.fontMono, fontSize: "0.625rem", letterSpacing: "0.1em", color: S.amber, fontWeight: 700 }}>⚠ NO COMPANY CONTEXT</span>
          <span style={{ fontFamily: S.fontUI, fontSize: "0.75rem", color: S.secondary }}>
            Your account is not linked to a company. Policies saved here will be unscoped and may not appear in the Policy Library. Contact your admin.
          </span>
        </div>
      )}

      {/* ── Saved redirect notice ── */}
      {saved && (
        <div style={{
          background: `color-mix(in srgb, ${S.pass} 8%, transparent)`,
          border: `1px solid color-mix(in srgb, ${S.pass} 25%, transparent)`,
          padding: "8px 24px", flexShrink: 0,
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <span style={{ fontFamily: S.fontMono, fontSize: "0.625rem", letterSpacing: "0.1em", color: S.pass, fontWeight: 700 }}>✓ POLICY SAVED</span>
          <span style={{ fontFamily: S.fontUI, fontSize: "0.75rem", color: S.secondary }}>
            Redirecting you to the Policy Library…
          </span>
        </div>
      )}

      {/* Main scroll area */}
      <div style={{ flex: 1, overflow: "auto", padding: "24px 32px", display: "flex", flexDirection: "column" }}>
        <StepHeader stepIdx={stepIdx} />
        {renderStep()}
      </div>

      {/* ── Step validation error bar ── */}
      {stepError && (
        <div style={{
          background: `color-mix(in srgb, ${S.fail} 8%, transparent)`,
          border: `1px solid color-mix(in srgb, ${S.fail} 25%, transparent)`,
          borderLeft: `3px solid ${S.fail}`,
          padding: "8px 24px", flexShrink: 0,
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <span style={{ fontFamily: S.fontMono, fontSize: "0.625rem", letterSpacing: "0.1em", color: S.fail, fontWeight: 700 }}>REQUIRED</span>
          <span style={{ fontFamily: S.fontUI, fontSize: "0.75rem", color: S.secondary }}>{stepError}</span>
        </div>
      )}

      {/* Bottom Action Bar */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 32px", background: S.bgPanel, borderTop: `1px solid ${S.rim}`, flexShrink: 0,
      }}>
        <button type="button" onClick={() => router.push('/policies')} style={{
          fontFamily: S.fontMono, fontSize: "0.75rem", color: S.tertiary, background: "transparent", border: "none", cursor: "pointer",
        }}>Cancel</button>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontFamily: S.fontMono, fontSize: "0.625rem", color: S.tertiary, letterSpacing: "0.06em" }}>
            {ALL_STEPS[stepIdx]?.phase && `PHASE ${ALL_STEPS[stepIdx].phase} · `}STEP {stepIdx + 1}/{TOTAL_STEPS}
          </span>
          {stepIdx > 0 && !aiLoading && (
            <button type="button" onClick={goBack} style={{
              fontFamily: S.fontMono, fontSize: "0.75rem", letterSpacing: "0.06em",
              padding: "6px 16px", border: `1px solid ${S.rim}`, color: S.secondary, background: "transparent", cursor: "pointer",
            }}>← Back</button>
          )}
          {canNext && (
            <button type="button" onClick={goNext} disabled={aiLoading} style={{
              fontFamily: S.fontMono, fontSize: "0.75rem", letterSpacing: "0.06em", fontWeight: 700,
              padding: "6px 20px",
              border: `1px solid ${stepError ? S.fail : S.cyan}`,
              color: stepError ? S.fail : S.cyan,
              background: `color-mix(in srgb, ${stepError ? S.fail : S.cyan} 8%, transparent)`,
              cursor: aiLoading ? "not-allowed" : "pointer",
              transition: "all 0.12s",
            }}>
              {stepIdx === TOTAL_STEPS - 2 ? "✦ ANALYZE WITH AI →" : "Next →"}
            </button>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer style={{
        height: 32, display: "flex", alignItems: "center", gap: 8, padding: "0 20px",
        borderTop: `1px solid ${S.rim}`, background: S.bgPanel,
        fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary, letterSpacing: "0.04em", flexShrink: 0,
      }}>
        <span>ORDR · Policy Builder · Institutional Grade</span>
        <span style={{ color: S.rim }}>—</span>
        <span style={{ color: S.purple }}>IFRS 9 · BCBS FRTB · ISDA 2022 · BIS FX Survey 2022</span>
      </footer>

    </div>
    <HelpPanel config={AI_WIZARD_HELP} storageKey="ai-wizard" activeSection={activePanelSection} />
    </PageShell>
  );
}
