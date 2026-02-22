"use client";

/**
 * AI Policy Wizard  —  /ai-policy-wizard
 *
 * Full-page 5-step wizard for creating a custom hedge policy using
 * AI-driven recommendations.  Mirrors the logic from PolicyWizardModal
 * but as a dedicated page experience with expanded controls.
 *
 * Steps:
 *   1 — Business Profile
 *   2 — Cash Flow Profile
 *   3 — Risk Tolerance & Cost
 *   4 — Policy Objectives
 *   5 — AI Recommendations (3 strategy cards)
 */

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../lib/authContext";
import { useRouter } from "next/navigation";
import EmptyState from "../../components/ui/EmptyState";

// ── Hydration-safe timestamp hook ────────────────────────────────────────────
function useRenderTs(): string {
  const [renderTs, setRenderTs] = useState('');
  useEffect(() => {
    setRenderTs(new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC");
  }, []);
  return renderTs;
}
const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

// ── Design tokens ────────────────────────────────────────────────────────────
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

// ── Constants ────────────────────────────────────────────────────────────────

const STEP_LABELS = [
  "Business Profile",
  "Cash Flow",
  "Risk & Cost",
  "Objectives",
  "AI Recommendations",
] as const;

const COMPANY_TYPES = ["Manufacturer", "Exporter", "Importer", "Services", "Conglomerate", "Financial"] as const;
const CURRENCIES = ["MXN", "USD", "EUR", "GBP", "JPY", "CAD", "BRL", "CNY"] as const;
const FX_EXPOSURE_TIERS = ["<$1M", "$1-10M", "$10-50M", "$50-250M", "$250M-1B", ">$1B"] as const;
const HEDGE_EXPERIENCE = ["None", "Basic (spots/forwards)", "Intermediate (options)", "Advanced (structured)"] as const;
const INDUSTRY_SECTORS = ["Automotive", "Manufacturing", "Mining", "Agriculture", "Technology", "Retail", "Energy", "Financial Services", "Other"] as const;
const FX_CORRIDORS = ["USD/MXN", "EUR/MXN", "GBP/MXN", "JPY/MXN", "USD/EUR", "USD/GBP", "USD/JPY"] as const;
const VISIBILITY_OPTS = ["1 month", "3 months", "6 months", "12 months", "18+ months"] as const;
const SEASONAL_OPTS = ["None", "Quarterly", "Semi-annual", "Annual", "Custom"] as const;
const TENOR_OPTS = ["Spot", "1M", "3M", "6M", "12M", "18M+"] as const;
const MAX_LOSS_OPTS = ["1%", "2%", "5%", "10%", "Unlimited"] as const;
const VAR_CONFIDENCE_OPTS = ["90%", "95%", "99%", "99.5%"] as const;
const DRAWDOWN_OPTS = ["Low (<2%)", "Medium (2-5%)", "High (5-10%)", "Very High (>10%)"] as const;
const PRIMARY_OBJECTIVES = ["Minimize Cost", "Maximize Protection", "Balanced", "Regulatory Compliance"] as const;
const INSTRUMENT_OPTS = ["Forwards", "Vanilla Options", "Collars", "Seagulls", "Participating Forwards", "Cross-Currency Swaps", "NDFs"] as const;
const BENCHMARK_OPTS = ["None", "Budget Rate", "Spot at Inception", "Forward Rate"] as const;

// ── Wizard state interface ───────────────────────────────────────────────────

interface WizardState {
  // Step 1
  companyType: string;
  primaryCurrency: string;
  annualExposure: string;
  hedgeExperience: string;
  industrySector: string;
  fxCorridors: string[];
  // Step 2
  cashFlowVisibility: string;
  cashFlowCertainty: number;
  receivableSplit: number;
  seasonalPatterns: string;
  averageTenor: string;
  nettingAvailable: boolean;
  // Step 3
  maxAcceptableLoss: string;
  premiumBudget: number;
  varConfidence: string;
  drawdownTolerance: string;
  costProtectionPriority: number;
  boardStatement: string;
  // Step 4
  primaryObjective: string;
  instrumentPreferences: string[];
  hedgeRatioTarget: number;
  rollingHedge: boolean;
  rollingTenor: string;
  ifrsCompliance: boolean;
  benchmark: string;
}

const INITIAL_STATE: WizardState = {
  companyType: "",
  primaryCurrency: "",
  annualExposure: "",
  hedgeExperience: "",
  industrySector: "",
  fxCorridors: [],
  cashFlowVisibility: "",
  cashFlowCertainty: 50,
  receivableSplit: 50,
  seasonalPatterns: "",
  averageTenor: "",
  nettingAvailable: false,
  maxAcceptableLoss: "",
  premiumBudget: 1.0,
  varConfidence: "",
  drawdownTolerance: "",
  costProtectionPriority: 50,
  boardStatement: "",
  primaryObjective: "",
  instrumentPreferences: [],
  hedgeRatioTarget: 75,
  rollingHedge: false,
  rollingTenor: "3M",
  ifrsCompliance: false,
  benchmark: "",
};

const DEMO_STATE: Partial<WizardState> = {
  companyType: "Manufacturer",
  primaryCurrency: "MXN",
  annualExposure: "$50-250M",
  hedgeExperience: "Intermediate (options)",
  industrySector: "Manufacturing",
  fxCorridors: ["USD/MXN", "EUR/MXN"],
};

// ── Recommendation data ──────────────────────────────────────────────────────

interface RecommendationData {
  id: string;
  tier: "Conservative" | "Balanced" | "Aggressive";
  policyCode: string;
  hedgeRatio: number;
  instruments: string;
  premiumCost: number;
  varCoverage: number;
  riskLevel: "LOW" | "MODERATE" | "HIGH";
  riskColor: string;
  recommended: boolean;
  allocation: { instrument: string; pct: number }[];
}

const RECOMMENDATIONS: RecommendationData[] = [
  {
    id: "REC-SHIELD",
    tier: "Conservative",
    policyCode: "SHIELD",
    hedgeRatio: 90,
    instruments: "Forwards + Collars",
    premiumCost: 0.8,
    varCoverage: 95,
    riskLevel: "LOW",
    riskColor: S.pass,
    recommended: false,
    allocation: [
      { instrument: "Forwards", pct: 55 },
      { instrument: "Collars", pct: 30 },
      { instrument: "Vanilla Options", pct: 10 },
      { instrument: "NDFs", pct: 5 },
    ],
  },
  {
    id: "REC-BLNC",
    tier: "Balanced",
    policyCode: "BLNC",
    hedgeRatio: 75,
    instruments: "Forwards + Options + Participators",
    premiumCost: 0.5,
    varCoverage: 85,
    riskLevel: "MODERATE",
    riskColor: S.amber,
    recommended: true,
    allocation: [
      { instrument: "Forwards", pct: 40 },
      { instrument: "Vanilla Options", pct: 25 },
      { instrument: "Participating Forwards", pct: 20 },
      { instrument: "Collars", pct: 10 },
      { instrument: "NDFs", pct: 5 },
    ],
  },
  {
    id: "REC-YIELD",
    tier: "Aggressive",
    policyCode: "YIELD",
    hedgeRatio: 50,
    instruments: "Options + Seagulls",
    premiumCost: 0.2,
    varCoverage: 60,
    riskLevel: "HIGH",
    riskColor: S.fail,
    recommended: false,
    allocation: [
      { instrument: "Vanilla Options", pct: 35 },
      { instrument: "Seagulls", pct: 30 },
      { instrument: "Participating Forwards", pct: 20 },
      { instrument: "Forwards", pct: 15 },
    ],
  },
];

// ── Primitives ───────────────────────────────────────────────────────────────

const inputBase: React.CSSProperties = {
  width: "100%",
  padding: "7px 10px",
  border: `1px solid ${S.rim}`,
  background: S.bgSub,
  color: S.primary,
  fontFamily: S.fontUI,
  fontSize: "0.8125rem",
  outline: "none",
  borderRadius: 0,
};

const selectBase: React.CSSProperties = { ...inputBase, cursor: "pointer" };

function FieldLabel({ label, hint }: { label: string; hint?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 5 }}>
      <span style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", letterSpacing: "0.08em", color: S.tertiary }}>{label}</span>
      {hint && <span style={{ fontFamily: S.fontUI, fontSize: "0.6875rem", color: S.tertiary, opacity: 0.65 }}>{hint}</span>}
    </div>
  );
}

function SliderField({
  label,
  hint,
  value,
  onChange,
  min,
  max,
  step,
  format,
}: {
  label: string;
  hint?: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
}) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 5 }}>
        <FieldLabel label={label} hint={hint} />
        <span style={{ fontFamily: S.fontMono, fontSize: "0.8125rem", fontWeight: 700, color: S.cyan }}>{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ width: "100%", accentColor: S.cyan, cursor: "pointer" }}
      />
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: S.fontMono, fontSize: "0.625rem", color: S.tertiary, marginTop: 2 }}>
        <span>{format(min)}</span>
        <span>{format(max)}</span>
      </div>
    </div>
  );
}

function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
      <div
        onClick={() => onChange(!checked)}
        style={{
          width: 36,
          height: 20,
          borderRadius: 10,
          background: checked ? S.cyan : S.rim,
          position: "relative",
          transition: "background 0.15s",
          flexShrink: 0,
          cursor: "pointer",
        }}
      >
        <div style={{
          width: 16,
          height: 16,
          borderRadius: 8,
          background: S.primary,
          position: "absolute",
          top: 2,
          left: checked ? 18 : 2,
          transition: "left 0.15s",
        }} />
      </div>
      <span style={{ fontFamily: S.fontUI, fontSize: "0.8125rem", color: S.secondary }}>{label}</span>
    </label>
  );
}

// ── TopBar ────────────────────────────────────────────────────────────────────

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
      }}>
        ← Home
      </button>
      <span style={{ color: S.rim, userSelect: "none" }}>|</span>
      <span style={{
        fontFamily: S.fontUI, fontSize: "0.8125rem", fontWeight: 700,
        letterSpacing: "0.06em", textTransform: "uppercase", color: S.primary,
      }}>
        AI Policy Wizard
      </span>
      <span style={{
        fontFamily: S.fontMono, fontSize: "0.6875rem", letterSpacing: "0.08em",
        color: S.secondary, padding: "1px 5px", border: `1px solid ${S.rim}`,
      }}>
        POLICY ENGINE
      </span>
      <div style={{ flex: 1 }} />
      <span style={{
        fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary,
        letterSpacing: "0.04em",
      }}>
        AS OF {renderTs}
      </span>
    </header>
  );
}

// ── Step Progress Bar ────────────────────────────────────────────────────────

function StepProgressBar({ current, completed }: { current: number; completed: Set<number> }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "14px 32px", background: S.bgPanel, borderBottom: `1px solid ${S.rim}`,
      gap: 0, flexShrink: 0,
    }}>
      {STEP_LABELS.map((label, i) => {
        const isCompleted = completed.has(i);
        const isCurrent = i === current;
        const isFuture = i > current && !isCompleted;

        return (
          <div key={label} style={{ display: "flex", alignItems: "center", flex: i < STEP_LABELS.length - 1 ? 1 : undefined }}>
            {/* Step circle + label */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 80 }}>
              <div style={{
                width: 28, height: 28, borderRadius: 14,
                display: "flex", alignItems: "center", justifyContent: "center",
                border: `2px solid ${isCurrent ? S.cyan : isCompleted ? S.pass : S.rim}`,
                background: isCurrent
                  ? `color-mix(in srgb, ${S.cyan} 15%, transparent)`
                  : isCompleted
                    ? `color-mix(in srgb, ${S.pass} 12%, transparent)`
                    : "transparent",
                fontFamily: S.fontMono,
                fontSize: "0.6875rem",
                fontWeight: 700,
                color: isCurrent ? S.cyan : isCompleted ? S.pass : S.tertiary,
                transition: "all 0.2s",
              }}>
                {isCompleted ? "\u2713" : i + 1}
              </div>
              <span style={{
                fontFamily: S.fontMono,
                fontSize: "0.625rem",
                letterSpacing: "0.05em",
                color: isCurrent ? S.cyan : isCompleted ? S.pass : S.tertiary,
                textAlign: "center",
                whiteSpace: "nowrap",
              }}>
                {label}
              </span>
            </div>
            {/* Connector line */}
            {i < STEP_LABELS.length - 1 && (
              <div style={{
                flex: 1, height: 2, marginBottom: 18,
                background: isCompleted ? S.pass : i < current ? S.cyan : S.rim,
                marginLeft: 6, marginRight: 6,
                transition: "background 0.2s",
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Step 1: Business Profile ─────────────────────────────────────────────────

function Step1BusinessProfile({
  state,
  onChange,
}: {
  state: WizardState;
  onChange: (patch: Partial<WizardState>) => void;
}) {
  const toggleCorridor = (c: string) => {
    const next = state.fxCorridors.includes(c)
      ? state.fxCorridors.filter((x) => x !== c)
      : [...state.fxCorridors, c];
    onChange({ fxCorridors: next });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 860 }}>
      <p style={{ fontFamily: S.fontUI, fontSize: "0.8125rem", color: S.secondary, margin: 0, lineHeight: 1.6 }}>
        Define your company profile to calibrate the AI policy engine. All fields inform the final recommendation.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
          <FieldLabel label="COMPANY TYPE" />
          <select value={state.companyType} onChange={(e) => onChange({ companyType: e.target.value })} style={selectBase}>
            <option value="">Select type...</option>
            {COMPANY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <FieldLabel label="PRIMARY OPERATING CURRENCY" />
          <select value={state.primaryCurrency} onChange={(e) => onChange({ primaryCurrency: e.target.value })} style={selectBase}>
            <option value="">Select currency...</option>
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
          <FieldLabel label="ANNUAL FX EXPOSURE" />
          <select value={state.annualExposure} onChange={(e) => onChange({ annualExposure: e.target.value })} style={selectBase}>
            <option value="">Select range...</option>
            {FX_EXPOSURE_TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <FieldLabel label="HEDGE EXPERIENCE" />
          <select value={state.hedgeExperience} onChange={(e) => onChange({ hedgeExperience: e.target.value })} style={selectBase}>
            <option value="">Select level...</option>
            {HEDGE_EXPERIENCE.map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
        </div>
      </div>

      <div>
        <FieldLabel label="INDUSTRY SECTOR" />
        <select value={state.industrySector} onChange={(e) => onChange({ industrySector: e.target.value })} style={selectBase}>
          <option value="">Select sector...</option>
          {INDUSTRY_SECTORS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div>
        <FieldLabel label="PRIMARY FX CORRIDORS" hint="select all that apply" />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {FX_CORRIDORS.map((c) => {
            const selected = state.fxCorridors.includes(c);
            return (
              <label key={c} style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "5px 10px", cursor: "pointer",
                border: `1px solid ${selected ? S.cyan : S.rim}`,
                background: selected ? `color-mix(in srgb, ${S.cyan} 8%, transparent)` : "transparent",
                transition: "all 0.12s",
              }}>
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => toggleCorridor(c)}
                  style={{ accentColor: S.cyan, margin: 0 }}
                />
                <span style={{
                  fontFamily: S.fontMono, fontSize: "0.75rem",
                  color: selected ? S.cyan : S.secondary,
                  letterSpacing: "0.04em",
                }}>
                  {c}
                </span>
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Step 2: Cash Flow Profile ────────────────────────────────────────────────

function Step2CashFlow({
  state,
  onChange,
}: {
  state: WizardState;
  onChange: (patch: Partial<WizardState>) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 860 }}>
      <p style={{ fontFamily: S.fontUI, fontSize: "0.8125rem", color: S.secondary, margin: 0, lineHeight: 1.6 }}>
        Describe your FX cash flow characteristics. This shapes tenor selection and hedge layering strategy.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
          <FieldLabel label="CASH FLOW VISIBILITY" hint="how far forward can you project?" />
          <select value={state.cashFlowVisibility} onChange={(e) => onChange({ cashFlowVisibility: e.target.value })} style={selectBase}>
            <option value="">Select horizon...</option>
            {VISIBILITY_OPTS.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div>
          <FieldLabel label="SEASONAL PATTERNS" />
          <select value={state.seasonalPatterns} onChange={(e) => onChange({ seasonalPatterns: e.target.value })} style={selectBase}>
            <option value="">Select pattern...</option>
            {SEASONAL_OPTS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <SliderField
        label="CASH FLOW CERTAINTY"
        hint="how predictable are your FX cash flows?"
        value={state.cashFlowCertainty}
        onChange={(v) => onChange({ cashFlowCertainty: v })}
        min={0}
        max={100}
        step={1}
        format={(v) => `${v}%`}
      />

      <SliderField
        label="RECEIVABLE / PAYABLE SPLIT"
        hint=""
        value={state.receivableSplit}
        onChange={(v) => onChange({ receivableSplit: v })}
        min={0}
        max={100}
        step={1}
        format={(v) => `${v}% Recv / ${100 - v}% Pay`}
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
          <FieldLabel label="AVERAGE TENOR" />
          <select value={state.averageTenor} onChange={(e) => onChange({ averageTenor: e.target.value })} style={selectBase}>
            <option value="">Select tenor...</option>
            {TENOR_OPTS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 4 }}>
          <ToggleField
            label="Netting Available"
            checked={state.nettingAvailable}
            onChange={(v) => onChange({ nettingAvailable: v })}
          />
        </div>
      </div>
    </div>
  );
}

// ── Step 3: Risk Tolerance & Cost ────────────────────────────────────────────

function Step3RiskCost({
  state,
  onChange,
}: {
  state: WizardState;
  onChange: (patch: Partial<WizardState>) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 860 }}>
      <p style={{ fontFamily: S.fontUI, fontSize: "0.8125rem", color: S.secondary, margin: 0, lineHeight: 1.6 }}>
        Define your risk appetite and budget constraints. These parameters drive the protective vs. cost-efficient trade-off.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
          <FieldLabel label="MAXIMUM ACCEPTABLE LOSS" />
          <select value={state.maxAcceptableLoss} onChange={(e) => onChange({ maxAcceptableLoss: e.target.value })} style={selectBase}>
            <option value="">Select threshold...</option>
            {MAX_LOSS_OPTS.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <div>
          <FieldLabel label="VAR CONFIDENCE LEVEL" />
          <select value={state.varConfidence} onChange={(e) => onChange({ varConfidence: e.target.value })} style={selectBase}>
            <option value="">Select confidence...</option>
            {VAR_CONFIDENCE_OPTS.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
      </div>

      <SliderField
        label="PREMIUM BUDGET"
        hint="% of notional"
        value={state.premiumBudget}
        onChange={(v) => onChange({ premiumBudget: v })}
        min={0}
        max={3}
        step={0.1}
        format={(v) => `${v.toFixed(1)}%`}
      />

      <div>
        <FieldLabel label="DRAWDOWN TOLERANCE" />
        <select value={state.drawdownTolerance} onChange={(e) => onChange({ drawdownTolerance: e.target.value })} style={selectBase}>
          <option value="">Select tolerance...</option>
          {DRAWDOWN_OPTS.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      <SliderField
        label="COST vs PROTECTION PRIORITY"
        value={state.costProtectionPriority}
        onChange={(v) => onChange({ costProtectionPriority: v })}
        min={0}
        max={100}
        step={1}
        format={(v) =>
          v <= 25 ? "Pure Cost Savings" :
          v <= 45 ? "Cost-Leaning" :
          v <= 55 ? "Balanced" :
          v <= 75 ? "Protection-Leaning" :
          "Maximum Protection"
        }
      />

      <div>
        <FieldLabel label="BOARD RISK APPETITE STATEMENT" hint="optional" />
        <textarea
          value={state.boardStatement}
          onChange={(e) => onChange({ boardStatement: e.target.value })}
          placeholder="e.g. Board mandates minimum 60% hedge ratio for confirmed exposures per resolution FX-2024-03"
          rows={3}
          style={{ ...inputBase, resize: "vertical" }}
        />
      </div>
    </div>
  );
}

// ── Step 4: Policy Objectives ────────────────────────────────────────────────

function Step4Objectives({
  state,
  onChange,
}: {
  state: WizardState;
  onChange: (patch: Partial<WizardState>) => void;
}) {
  const toggleInstrument = (inst: string) => {
    const next = state.instrumentPreferences.includes(inst)
      ? state.instrumentPreferences.filter((x) => x !== inst)
      : [...state.instrumentPreferences, inst];
    onChange({ instrumentPreferences: next });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 860 }}>
      <p style={{ fontFamily: S.fontUI, fontSize: "0.8125rem", color: S.secondary, margin: 0, lineHeight: 1.6 }}>
        Define the hedge policy objectives and instrument constraints that will shape AI recommendations.
      </p>

      <div>
        <FieldLabel label="PRIMARY OBJECTIVE" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
          {PRIMARY_OBJECTIVES.map((obj) => {
            const selected = state.primaryObjective === obj;
            return (
              <button
                key={obj}
                type="button"
                onClick={() => onChange({ primaryObjective: obj })}
                style={{
                  padding: "10px 12px",
                  border: `1px solid ${selected ? S.cyan : S.rim}`,
                  background: selected ? `color-mix(in srgb, ${S.cyan} 8%, transparent)` : "transparent",
                  cursor: "pointer",
                  fontFamily: S.fontMono,
                  fontSize: "0.6875rem",
                  fontWeight: selected ? 700 : 400,
                  color: selected ? S.cyan : S.secondary,
                  letterSpacing: "0.04em",
                  textAlign: "center",
                  transition: "all 0.12s",
                }}
              >
                {obj}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <FieldLabel label="INSTRUMENT PREFERENCES" hint="select permitted instruments" />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {INSTRUMENT_OPTS.map((inst) => {
            const selected = state.instrumentPreferences.includes(inst);
            return (
              <label key={inst} style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "5px 10px", cursor: "pointer",
                border: `1px solid ${selected ? S.cyan : S.rim}`,
                background: selected ? `color-mix(in srgb, ${S.cyan} 8%, transparent)` : "transparent",
                transition: "all 0.12s",
              }}>
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => toggleInstrument(inst)}
                  style={{ accentColor: S.cyan, margin: 0 }}
                />
                <span style={{
                  fontFamily: S.fontMono, fontSize: "0.6875rem",
                  color: selected ? S.cyan : S.secondary,
                  letterSpacing: "0.04em",
                }}>
                  {inst}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      <SliderField
        label="HEDGE RATIO TARGET"
        value={state.hedgeRatioTarget}
        onChange={(v) => onChange({ hedgeRatioTarget: v })}
        min={0}
        max={100}
        step={5}
        format={(v) => `${v}%`}
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <ToggleField
            label="Rolling Hedge Program"
            checked={state.rollingHedge}
            onChange={(v) => onChange({ rollingHedge: v })}
          />
          {state.rollingHedge && (
            <div>
              <FieldLabel label="ROLLING TENOR" />
              <select value={state.rollingTenor} onChange={(e) => onChange({ rollingTenor: e.target.value })} style={selectBase}>
                {TENOR_OPTS.filter((t) => t !== "Spot").map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <ToggleField
            label="IFRS 9 / ASC 815 Compliance"
            checked={state.ifrsCompliance}
            onChange={(v) => onChange({ ifrsCompliance: v })}
          />
        </div>
      </div>

      <div>
        <FieldLabel label="BENCHMARK" />
        <select value={state.benchmark} onChange={(e) => onChange({ benchmark: e.target.value })} style={selectBase}>
          <option value="">Select benchmark...</option>
          {BENCHMARK_OPTS.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
      </div>
    </div>
  );
}

// ── Step 5: AI Recommendations ───────────────────────────────────────────────

function RecommendationCard({
  rec,
  selected,
  onSelect,
  expandedId,
  onToggleExpand,
}: {
  rec: RecommendationData;
  selected: boolean;
  onSelect: () => void;
  expandedId: string | null;
  onToggleExpand: (id: string) => void;
}) {
  const expanded = expandedId === rec.id;

  return (
    <div style={{
      flex: "1 1 280px",
      border: `1.5px solid ${selected ? S.cyan : rec.recommended ? S.amber : S.rim}`,
      background: selected
        ? `color-mix(in srgb, ${S.cyan} 6%, ${S.bgPanel})`
        : S.bgPanel,
      borderRadius: 3,
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      transition: "border-color 0.15s",
      position: "relative",
    }}>
      {/* Recommended badge */}
      {rec.recommended && (
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 2,
          background: S.amber,
        }} />
      )}

      {/* Header */}
      <div style={{
        padding: "12px 16px",
        background: selected
          ? `color-mix(in srgb, ${S.cyan} 10%, ${S.bgDeep})`
          : S.bgDeep,
        borderBottom: `1px solid ${S.rim}`,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <span style={{
            fontFamily: S.fontMono, fontSize: "0.6875rem",
            letterSpacing: "0.1em", fontWeight: 700,
            color: selected ? S.cyan : S.tertiary,
          }}>
            {rec.tier.toUpperCase()}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {rec.recommended && (
              <span style={{
                fontFamily: S.fontMono, fontSize: "0.5625rem",
                letterSpacing: "0.06em", padding: "1px 5px",
                background: `color-mix(in srgb, ${S.amber} 15%, transparent)`,
                color: S.amber, borderRadius: 2,
              }}>
                RECOMMENDED
              </span>
            )}
            <span style={{
              fontFamily: S.fontMono, fontSize: "0.625rem",
              letterSpacing: "0.06em", padding: "1px 5px",
              borderRadius: 2,
              background: `color-mix(in srgb, ${rec.riskColor} 12%, transparent)`,
              color: rec.riskColor,
            }}>
              {rec.riskLevel}
            </span>
          </div>
        </div>
        <div style={{
          marginTop: 6, fontFamily: S.fontUI, fontSize: "0.875rem",
          fontWeight: 600, color: S.primary,
        }}>
          &ldquo;{rec.policyCode}&rdquo; Policy
        </div>
        <div style={{
          fontFamily: S.fontMono, fontSize: "0.6875rem",
          color: S.tertiary, letterSpacing: "0.04em", marginTop: 2,
        }}>
          {rec.instruments}
        </div>
      </div>

      {/* Stats grid */}
      <div style={{ padding: "12px 16px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {[
          { label: "HEDGE RATIO", value: `${rec.hedgeRatio}%` },
          { label: "PREMIUM COST", value: `${rec.premiumCost}% notl.` },
          { label: "VAR COVERAGE", value: `${rec.varCoverage}%` },
          { label: "RISK", value: rec.riskLevel, color: rec.riskColor },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontFamily: S.fontMono, fontSize: "0.5625rem", letterSpacing: "0.08em", color: S.tertiary }}>{label}</span>
            <span style={{ fontFamily: S.fontMono, fontSize: "0.8125rem", fontWeight: 700, color: color || S.primary }}>{value}</span>
          </div>
        ))}
      </div>

      {/* Expanded: Allocation breakdown */}
      {expanded && (
        <div style={{
          padding: "0 16px 12px",
          borderTop: `1px solid ${S.rim}`,
          paddingTop: 10,
        }}>
          <span style={{
            fontFamily: S.fontMono, fontSize: "0.5625rem",
            letterSpacing: "0.08em", color: S.tertiary,
            display: "block", marginBottom: 6,
          }}>
            INSTRUMENT ALLOCATION
          </span>
          {rec.allocation.map((a) => (
            <div key={a.instrument} style={{
              display: "flex", alignItems: "center", gap: 8,
              marginBottom: 4,
            }}>
              <div style={{
                flex: 1, height: 4, background: S.rim, borderRadius: 2,
                overflow: "hidden",
              }}>
                <div style={{
                  width: `${a.pct}%`, height: "100%",
                  background: S.cyan, borderRadius: 2,
                }} />
              </div>
              <span style={{
                fontFamily: S.fontMono, fontSize: "0.625rem",
                color: S.secondary, minWidth: 30, textAlign: "right",
              }}>
                {a.pct}%
              </span>
              <span style={{
                fontFamily: S.fontUI, fontSize: "0.6875rem",
                color: S.secondary, minWidth: 120,
              }}>
                {a.instrument}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Action footer */}
      <div style={{
        marginTop: "auto",
        padding: "10px 16px",
        borderTop: `1px solid ${S.rim}`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <button
          type="button"
          onClick={onSelect}
          style={{
            fontFamily: S.fontMono, fontSize: "0.6875rem",
            letterSpacing: "0.06em", fontWeight: 700,
            padding: "5px 14px",
            border: `1px solid ${selected ? S.pass : S.cyan}`,
            color: selected ? S.pass : S.cyan,
            background: selected
              ? `color-mix(in srgb, ${S.pass} 8%, transparent)`
              : `color-mix(in srgb, ${S.cyan} 8%, transparent)`,
            cursor: "pointer",
          }}
        >
          {selected ? "\u2713 SELECTED" : "Select & Save"}
        </button>
        <button
          type="button"
          onClick={() => onToggleExpand(rec.id)}
          style={{
            fontFamily: S.fontMono, fontSize: "0.625rem",
            letterSpacing: "0.04em",
            padding: "3px 8px",
            border: `1px solid ${S.rim}`,
            color: S.tertiary,
            background: "transparent",
            cursor: "pointer",
          }}
        >
          {expanded ? "Hide Details" : "View Details"}
        </button>
      </div>
    </div>
  );
}

function Step5Recommendations({
  state,
  selectedRec,
  onSelectRec,
  expandedId,
  onToggleExpand,
}: {
  state: WizardState;
  selectedRec: string | null;
  onSelectRec: (id: string) => void;
  expandedId: string | null;
  onToggleExpand: (id: string) => void;
}) {
  // Build summary from steps 1-4
  const summaryItems: string[] = [];
  if (state.companyType) summaryItems.push(state.companyType);
  if (state.primaryCurrency) summaryItems.push(state.primaryCurrency);
  if (state.annualExposure) summaryItems.push(state.annualExposure);
  if (state.industrySector) summaryItems.push(state.industrySector);
  if (state.primaryObjective) summaryItems.push(state.primaryObjective);
  if (state.hedgeExperience) summaryItems.push(state.hedgeExperience);
  if (state.maxAcceptableLoss) summaryItems.push(`Max Loss: ${state.maxAcceptableLoss}`);
  if (state.varConfidence) summaryItems.push(`VaR: ${state.varConfidence}`);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, width: "100%" }}>
      <p style={{ fontFamily: S.fontUI, fontSize: "0.8125rem", color: S.secondary, margin: 0, lineHeight: 1.6 }}>
        Based on your profile and objectives, the AI engine has generated three strategy recommendations.
        Select one to save as your hedge policy.
      </p>

      {/* 3 Cards */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        {RECOMMENDATIONS.map((rec) => (
          <RecommendationCard
            key={rec.id}
            rec={rec}
            selected={selectedRec === rec.id}
            onSelect={() => onSelectRec(rec.id)}
            expandedId={expandedId}
            onToggleExpand={onToggleExpand}
          />
        ))}
      </div>

      {/* AI Confidence + Summary */}
      <div style={{
        display: "flex", flexWrap: "wrap", alignItems: "center", gap: 14,
        padding: "12px 16px", background: S.bgSub,
        border: `1px solid ${S.rim}`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            fontFamily: S.fontMono, fontSize: "0.625rem",
            letterSpacing: "0.08em", color: S.tertiary,
          }}>
            AI CONFIDENCE
          </span>
          <span style={{
            fontFamily: S.fontMono, fontSize: "0.875rem",
            fontWeight: 700, color: S.pass,
            padding: "2px 8px",
            border: `1px solid ${S.pass}`,
            background: `color-mix(in srgb, ${S.pass} 8%, transparent)`,
          }}>
            87%
          </span>
        </div>
        <span style={{ color: S.rim }}>|</span>
        <div style={{ flex: 1, minWidth: 200 }}>
          <span style={{
            fontFamily: S.fontMono, fontSize: "0.625rem",
            letterSpacing: "0.06em", color: S.tertiary,
          }}>
            BASED ON:{" "}
          </span>
          <span style={{
            fontFamily: S.fontUI, fontSize: "0.75rem",
            color: S.secondary,
          }}>
            {summaryItems.length > 0 ? summaryItems.join(" \u00b7 ") : "Default profile inputs"}
          </span>
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button
          type="button"
          disabled={!selectedRec}
          style={{
            fontFamily: S.fontMono, fontSize: "0.75rem",
            letterSpacing: "0.06em", fontWeight: 700,
            padding: "7px 20px",
            border: `1px solid ${selectedRec ? S.cyan : S.rim}`,
            color: selectedRec ? S.cyan : S.tertiary,
            background: selectedRec
              ? `color-mix(in srgb, ${S.cyan} 8%, transparent)`
              : "transparent",
            cursor: selectedRec ? "pointer" : "not-allowed",
          }}
        >
          Save as Custom Policy
        </button>
        <button
          type="button"
          disabled={!selectedRec}
          style={{
            fontFamily: S.fontMono, fontSize: "0.75rem",
            letterSpacing: "0.06em", fontWeight: 700,
            padding: "7px 20px",
            border: `1px solid ${selectedRec ? S.amber : S.rim}`,
            color: selectedRec ? S.amber : S.tertiary,
            background: selectedRec
              ? `color-mix(in srgb, ${S.amber} 8%, transparent)`
              : "transparent",
            cursor: selectedRec ? "pointer" : "not-allowed",
          }}
        >
          Apply & Run Sandbox
        </button>
      </div>
    </div>
  );
}

// ── Main Page Component ──────────────────────────────────────────────────────

export default function AIPolicyWizardPage() {
  const { isAuthenticated, token, user, isDemoMode } = useAuth();
  const router = useRouter();
  const renderTs = useRenderTs();

  const [step, setStep] = useState(0);
  const [completed, setCompleted] = useState<Set<number>>(new Set());
  const [state, setState] = useState<WizardState>(() =>
    DEMO_MODE || isDemoMode ? { ...INITIAL_STATE, ...DEMO_STATE } : INITIAL_STATE,
  );
  const [selectedRec, setSelectedRec] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const patchState = useCallback((patch: Partial<WizardState>) => {
    setState((prev) => ({ ...prev, ...patch }));
  }, []);

  const goNext = useCallback(() => {
    if (step < STEP_LABELS.length - 1) {
      setCompleted((prev) => new Set(prev).add(step));
      setStep((s) => s + 1);
    }
  }, [step]);

  const goBack = useCallback(() => {
    if (step > 0) {
      setStep((s) => s - 1);
    }
  }, [step]);

  const startOver = useCallback(() => {
    setStep(0);
    setCompleted(new Set());
    setState(DEMO_MODE || isDemoMode ? { ...INITIAL_STATE, ...DEMO_STATE } : INITIAL_STATE);
    setSelectedRec(null);
    setExpandedId(null);
  }, [isDemoMode]);

  const handleToggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  // Auth guard
  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/auth/login");
    }
  }, [isAuthenticated, router]);

  if (!isAuthenticated) return null;

  const isLastStep = step === STEP_LABELS.length - 1;

  // ── Render step content ──────────────────────────────────────────────────

  const renderStepContent = () => {
    switch (step) {
      case 0: return <Step1BusinessProfile state={state} onChange={patchState} />;
      case 1: return <Step2CashFlow state={state} onChange={patchState} />;
      case 2: return <Step3RiskCost state={state} onChange={patchState} />;
      case 3: return <Step4Objectives state={state} onChange={patchState} />;
      case 4: return (
        <Step5Recommendations
          state={state}
          selectedRec={selectedRec}
          onSelectRec={setSelectedRec}
          expandedId={expandedId}
          onToggleExpand={handleToggleExpand}
        />
      );
      default: return null;
    }
  };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      background: S.bgDeep, fontFamily: S.fontUI, color: S.primary,
    }}>
      {/* TopBar: 44px */}
      <TopBar onBack={() => router.push("/")} />

      {/* Step Progress Bar */}
      <StepProgressBar current={step} completed={completed} />

      {/* Main Content */}
      <div style={{
        flex: 1, overflow: "auto", padding: "24px 32px",
        display: "flex", flexDirection: "column",
      }}>
        {/* Step header */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span style={{
              fontFamily: S.fontMono, fontSize: "0.6875rem",
              letterSpacing: "0.06em", color: S.tertiary,
            }}>
              STEP {step + 1} OF {STEP_LABELS.length}
            </span>
            <span style={{ color: S.rim }}>|</span>
            <span style={{
              fontFamily: S.fontUI, fontSize: "0.9375rem",
              fontWeight: 600, color: S.primary,
            }}>
              {STEP_LABELS[step]}
            </span>
          </div>
          <div style={{
            height: 1, background: S.rim, marginTop: 10,
          }} />
        </div>

        {/* Step body */}
        {renderStepContent()}

        {/* Start Over (only on step 5) */}
        {isLastStep && (
          <div style={{ marginTop: 16 }}>
            <button
              type="button"
              onClick={startOver}
              style={{
                fontFamily: S.fontMono, fontSize: "0.6875rem",
                letterSpacing: "0.04em", color: S.tertiary,
                background: "transparent", border: "none",
                cursor: "pointer", padding: "4px 0",
                textDecoration: "underline",
              }}
            >
              Start Over
            </button>
          </div>
        )}
      </div>

      {/* Bottom Action Bar */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 32px", background: S.bgPanel,
        borderTop: `1px solid ${S.rim}`, flexShrink: 0,
      }}>
        <button
          type="button"
          onClick={() => router.push("/policies")}
          style={{
            fontFamily: S.fontMono, fontSize: "0.75rem",
            letterSpacing: "0.04em", color: S.tertiary,
            background: "transparent", border: "none",
            cursor: "pointer", padding: "4px 0",
          }}
        >
          Cancel
        </button>
        <div style={{ display: "flex", gap: 10 }}>
          {step > 0 && (
            <button
              type="button"
              onClick={goBack}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                fontFamily: S.fontMono, fontSize: "0.75rem",
                letterSpacing: "0.06em",
                padding: "6px 16px",
                border: `1px solid ${S.rim}`,
                color: S.secondary,
                background: "transparent",
                cursor: "pointer",
              }}
            >
              ← Back
            </button>
          )}
          {!isLastStep && (
            <button
              type="button"
              onClick={goNext}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                fontFamily: S.fontMono, fontSize: "0.75rem",
                letterSpacing: "0.06em", fontWeight: 700,
                padding: "6px 20px",
                border: `1px solid ${S.cyan}`,
                color: S.cyan,
                background: `color-mix(in srgb, ${S.cyan} 8%, transparent)`,
                cursor: "pointer",
              }}
            >
              Next →
            </button>
          )}
          {isLastStep && (
            <button
              type="button"
              disabled={!selectedRec}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                fontFamily: S.fontMono, fontSize: "0.75rem",
                letterSpacing: "0.06em", fontWeight: 700,
                padding: "6px 20px",
                border: `1px solid ${selectedRec ? S.cyan : S.rim}`,
                color: selectedRec ? S.cyan : S.tertiary,
                background: selectedRec
                  ? `color-mix(in srgb, ${S.cyan} 8%, transparent)`
                  : "transparent",
                cursor: selectedRec ? "pointer" : "not-allowed",
              }}
            >
              Save Policy
            </button>
          )}
        </div>
      </div>

      {/* Footer: 32px */}
      <footer style={{
        height: 32, display: "flex", alignItems: "center", gap: 8,
        padding: "0 20px",
        borderTop: `1px solid ${S.rim}`, background: S.bgPanel,
        fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary,
        letterSpacing: "0.04em", flexShrink: 0,
      }}>
        <span>{renderTs}</span>
        <span style={{ color: S.rim }}>&mdash;</span>
        <span>ORDR &middot; AI Policy Wizard</span>
      </footer>
    </div>
  );
}
