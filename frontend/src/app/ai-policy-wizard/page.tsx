"use client";

/**
 * AI Policy Wizard  —  /ai-policy-wizard
 *
 * Full-page 5-step wizard for creating a custom hedge policy.
 * Uses the SAME AI backend (POST /api/policy-ai) and save path
 * (createPolicyTemplate) as PolicyWizardModal — both entry points
 * now write an identical CanonicalPolicy object.
 *
 * Steps:
 *   1 — Business Profile
 *   2 — Cash Flow
 *   3 — Risk & Cost
 *   4 — Objectives
 *   5 — AI Recommendations  ← real AI call, not hardcoded
 */

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../lib/authContext";
import { useRouter } from "next/navigation";
import EmptyState from "../../components/ui/EmptyState";
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

// ── Hydration-safe timestamp hook ────────────────────────────────────────────
function useRenderTs(): string {
  const [renderTs, setRenderTs] = useState('');
  useEffect(() => {
    setRenderTs(new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC");
  }, []);
  return renderTs;
}

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

// ── Initial state ────────────────────────────────────────────────────────────

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
  label, hint, value, onChange, min, max, step, format,
}: {
  label: string; hint?: string; value: number; onChange: (v: number) => void;
  min: number; max: number; step: number; format: (v: number) => string;
}) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 5 }}>
        <FieldLabel label={label} hint={hint} />
        <span style={{ fontFamily: S.fontMono, fontSize: "0.8125rem", fontWeight: 700, color: S.cyan }}>{format(value)}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
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

function ToggleField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
      <div
        onClick={() => onChange(!checked)}
        style={{
          width: 36, height: 20, borderRadius: 10,
          background: checked ? S.cyan : S.rim,
          position: "relative", transition: "background 0.15s", flexShrink: 0, cursor: "pointer",
        }}
      >
        <div style={{
          width: 16, height: 16, borderRadius: 8, background: S.primary,
          position: "absolute", top: 2, left: checked ? 18 : 2, transition: "left 0.15s",
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
        ← Policies
      </button>
      <span style={{ color: S.rim, userSelect: "none" }}>|</span>
      <span style={{ fontFamily: S.fontUI, fontSize: "0.8125rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: S.primary }}>
        AI Policy Wizard
      </span>
      <span style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", letterSpacing: "0.08em", color: S.secondary, padding: "1px 5px", border: `1px solid ${S.rim}` }}>
        POLICY ENGINE
      </span>
      <div style={{ flex: 1 }} />
      <span style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary, letterSpacing: "0.04em" }}>
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
        const isCurrent   = i === current;
        return (
          <div key={label} style={{ display: "flex", alignItems: "center", flex: i < STEP_LABELS.length - 1 ? 1 : undefined }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 80 }}>
              <div style={{
                width: 28, height: 28, borderRadius: 14,
                display: "flex", alignItems: "center", justifyContent: "center",
                border: `2px solid ${isCurrent ? S.cyan : isCompleted ? S.pass : S.rim}`,
                background: isCurrent
                  ? `color-mix(in srgb, ${S.cyan} 15%, transparent)`
                  : isCompleted ? `color-mix(in srgb, ${S.pass} 12%, transparent)` : "transparent",
                fontFamily: S.fontMono, fontSize: "0.6875rem", fontWeight: 700,
                color: isCurrent ? S.cyan : isCompleted ? S.pass : S.tertiary,
                transition: "all 0.2s",
              }}>
                {isCompleted ? "✓" : i + 1}
              </div>
              <span style={{
                fontFamily: S.fontMono, fontSize: "0.625rem", letterSpacing: "0.05em",
                color: isCurrent ? S.cyan : isCompleted ? S.pass : S.tertiary,
                textAlign: "center", whiteSpace: "nowrap",
              }}>
                {label}
              </span>
            </div>
            {i < STEP_LABELS.length - 1 && (
              <div style={{
                flex: 1, height: 2, marginBottom: 18,
                background: isCompleted ? S.pass : i < current ? S.cyan : S.rim,
                marginLeft: 6, marginRight: 6, transition: "background 0.2s",
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Step 1: Business Profile ─────────────────────────────────────────────────

function Step1BusinessProfile({ state, onChange }: { state: WizardState; onChange: (p: Partial<WizardState>) => void }) {
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
                display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", cursor: "pointer",
                border: `1px solid ${selected ? S.cyan : S.rim}`,
                background: selected ? `color-mix(in srgb, ${S.cyan} 8%, transparent)` : "transparent",
                transition: "all 0.12s",
              }}>
                <input type="checkbox" checked={selected} onChange={() => toggleCorridor(c)} style={{ accentColor: S.cyan, margin: 0 }} />
                <span style={{ fontFamily: S.fontMono, fontSize: "0.75rem", color: selected ? S.cyan : S.secondary, letterSpacing: "0.04em" }}>{c}</span>
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Step 2: Cash Flow ────────────────────────────────────────────────────────

function Step2CashFlow({ state, onChange }: { state: WizardState; onChange: (p: Partial<WizardState>) => void }) {
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
      <SliderField label="CASH FLOW CERTAINTY" hint="how predictable are your FX cash flows?"
        value={state.cashFlowCertainty} onChange={(v) => onChange({ cashFlowCertainty: v })}
        min={0} max={100} step={1} format={(v) => `${v}%`} />
      <SliderField label="RECEIVABLE / PAYABLE SPLIT" hint=""
        value={state.receivableSplit} onChange={(v) => onChange({ receivableSplit: v })}
        min={0} max={100} step={1} format={(v) => `${v}% Recv / ${100 - v}% Pay`} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
          <FieldLabel label="AVERAGE TENOR" />
          <select value={state.averageTenor} onChange={(e) => onChange({ averageTenor: e.target.value })} style={selectBase}>
            <option value="">Select tenor...</option>
            {TENOR_OPTS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 4 }}>
          <ToggleField label="Netting Available" checked={state.nettingAvailable} onChange={(v) => onChange({ nettingAvailable: v })} />
        </div>
      </div>
    </div>
  );
}

// ── Step 3: Risk Tolerance & Cost ────────────────────────────────────────────

function Step3RiskCost({ state, onChange }: { state: WizardState; onChange: (p: Partial<WizardState>) => void }) {
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
      <SliderField label="PREMIUM BUDGET" hint="% of notional"
        value={state.premiumBudget} onChange={(v) => onChange({ premiumBudget: v })}
        min={0} max={3} step={0.1} format={(v) => `${v.toFixed(1)}%`} />
      <div>
        <FieldLabel label="DRAWDOWN TOLERANCE" />
        <select value={state.drawdownTolerance} onChange={(e) => onChange({ drawdownTolerance: e.target.value })} style={selectBase}>
          <option value="">Select tolerance...</option>
          {DRAWDOWN_OPTS.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>
      <SliderField label="COST vs PROTECTION PRIORITY"
        value={state.costProtectionPriority} onChange={(v) => onChange({ costProtectionPriority: v })}
        min={0} max={100} step={1}
        format={(v) =>
          v <= 25 ? "Pure Cost Savings" :
          v <= 45 ? "Cost-Leaning" :
          v <= 55 ? "Balanced" :
          v <= 75 ? "Protection-Leaning" :
          "Maximum Protection"
        } />
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

function Step4Objectives({ state, onChange }: { state: WizardState; onChange: (p: Partial<WizardState>) => void }) {
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
              <button key={obj} type="button" onClick={() => onChange({ primaryObjective: obj })} style={{
                padding: "10px 12px",
                border: `1px solid ${selected ? S.cyan : S.rim}`,
                background: selected ? `color-mix(in srgb, ${S.cyan} 8%, transparent)` : "transparent",
                cursor: "pointer", fontFamily: S.fontMono, fontSize: "0.6875rem",
                fontWeight: selected ? 700 : 400,
                color: selected ? S.cyan : S.secondary,
                letterSpacing: "0.04em", textAlign: "center", transition: "all 0.12s",
              }}>
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
                display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", cursor: "pointer",
                border: `1px solid ${selected ? S.cyan : S.rim}`,
                background: selected ? `color-mix(in srgb, ${S.cyan} 8%, transparent)` : "transparent",
                transition: "all 0.12s",
              }}>
                <input type="checkbox" checked={selected} onChange={() => toggleInstrument(inst)} style={{ accentColor: S.cyan, margin: 0 }} />
                <span style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: selected ? S.cyan : S.secondary, letterSpacing: "0.04em" }}>{inst}</span>
              </label>
            );
          })}
        </div>
      </div>
      <SliderField label="HEDGE RATIO TARGET"
        value={state.hedgeRatioTarget} onChange={(v) => onChange({ hedgeRatioTarget: v })}
        min={0} max={100} step={5} format={(v) => `${v}%`} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <ToggleField label="Rolling Hedge Program" checked={state.rollingHedge} onChange={(v) => onChange({ rollingHedge: v })} />
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
          <ToggleField label="IFRS 9 / ASC 815 Compliance" checked={state.ifrsCompliance} onChange={(v) => onChange({ ifrsCompliance: v })} />
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
  rec, selected, onSelect, expanded, onToggleExpand,
}: {
  rec: AIPolicyRecommendation; selected: boolean; onSelect: () => void;
  expanded: boolean; onToggleExpand: () => void;
}) {
  const p = rec.preset;
  const riskColor = p.riskPosture === "CONSERVATIVE" ? S.pass : p.riskPosture === "AGGRESSIVE" ? S.fail : S.amber;

  return (
    <div style={{
      flex: "1 1 280px",
      border: `1.5px solid ${selected ? S.cyan : S.rim}`,
      background: selected ? `color-mix(in srgb, ${S.cyan} 6%, ${S.bgPanel})` : S.bgPanel,
      borderRadius: 3, display: "flex", flexDirection: "column", overflow: "hidden",
      transition: "border-color 0.15s", position: "relative",
    }}>
      {/* Header */}
      <div style={{
        padding: "12px 16px",
        background: selected ? `color-mix(in srgb, ${S.cyan} 10%, ${S.bgDeep})` : S.bgDeep,
        borderBottom: `1px solid ${S.rim}`,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <span style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", letterSpacing: "0.1em", fontWeight: 700, color: selected ? S.cyan : S.tertiary }}>
            {rec.label.toUpperCase()}
          </span>
          <span style={{
            fontFamily: S.fontMono, fontSize: "0.625rem", letterSpacing: "0.06em", padding: "1px 5px",
            borderRadius: 2, background: `color-mix(in srgb, ${riskColor} 12%, transparent)`, color: riskColor,
          }}>
            {p.riskPosture}
          </span>
        </div>
        <div style={{ marginTop: 6, fontFamily: S.fontUI, fontSize: "0.875rem", fontWeight: 600, color: S.primary }}>
          &ldquo;{p.shortName}&rdquo; Policy
        </div>
        <div style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary, letterSpacing: "0.04em", marginTop: 2 }}>
          {p.name}
        </div>
      </div>

      {/* Stats grid */}
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

      {/* Rationale */}
      {expanded && (
        <div style={{ padding: "0 16px 12px", borderTop: `1px solid ${S.rim}`, paddingTop: 10 }}>
          <span style={{ fontFamily: S.fontMono, fontSize: "0.5625rem", letterSpacing: "0.08em", color: S.tertiary, display: "block", marginBottom: 6 }}>
            RATIONALE
          </span>
          <p style={{ fontFamily: S.fontUI, fontSize: "0.75rem", color: S.secondary, margin: 0, lineHeight: 1.6 }}>
            {rec.rationale}
          </p>
        </div>
      )}

      {/* Action footer */}
      <div style={{ marginTop: "auto", padding: "10px 16px", borderTop: `1px solid ${S.rim}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <button type="button" onClick={onSelect} style={{
          fontFamily: S.fontMono, fontSize: "0.6875rem", letterSpacing: "0.06em", fontWeight: 700,
          padding: "5px 14px",
          border: `1px solid ${selected ? S.pass : S.cyan}`,
          color: selected ? S.pass : S.cyan,
          background: selected ? `color-mix(in srgb, ${S.pass} 8%, transparent)` : `color-mix(in srgb, ${S.cyan} 8%, transparent)`,
          cursor: "pointer",
        }}>
          {selected ? "✓ SELECTED" : "Select"}
        </button>
        <button type="button" onClick={onToggleExpand} style={{
          fontFamily: S.fontMono, fontSize: "0.625rem", letterSpacing: "0.04em",
          padding: "3px 8px", border: `1px solid ${S.rim}`, color: S.tertiary,
          background: "transparent", cursor: "pointer",
        }}>
          {expanded ? "Hide" : "Rationale"}
        </button>
      </div>
    </div>
  );
}

function Step5Recommendations({
  aiResult, selectedRecId, onSelect, expandedId, onToggleExpand,
}: {
  aiResult: AIPolicyResult;
  selectedRecId: string | null;
  onSelect: (id: string) => void;
  expandedId: string | null;
  onToggleExpand: (id: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, width: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", letterSpacing: "0.08em", color: S.cyan }}>
          {aiResult.fallback ? "PRESET MATCHED" : "AI RECOMMENDATIONS"} — SELECT ONE TO SAVE
        </span>
        {!aiResult.fallback && (
          <span style={{
            fontFamily: S.fontMono, fontSize: "0.5625rem", padding: "1px 6px",
            border: `1px solid ${S.pass}`, color: S.pass, letterSpacing: "0.06em",
          }}>
            CLAUDE AI
          </span>
        )}
      </div>

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        {aiResult.recommendations.map((rec, i) => {
          const recId = `${rec.preset.shortName}-${i}`;
          return (
            <RecommendationCard
              key={recId}
              rec={rec}
              selected={selectedRecId === recId}
              onSelect={() => onSelect(recId)}
              expanded={expandedId === recId}
              onToggleExpand={() => onToggleExpand(recId)}
            />
          );
        })}
      </div>

      {/* AI confidence + basis */}
      <div style={{
        display: "flex", flexWrap: "wrap", alignItems: "center", gap: 14,
        padding: "12px 16px", background: S.bgSub, border: `1px solid ${S.rim}`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontFamily: S.fontMono, fontSize: "0.625rem", letterSpacing: "0.08em", color: S.tertiary }}>
            {aiResult.fallback ? "MATCH SCORE" : "AI CONFIDENCE"}
          </span>
          <span style={{
            fontFamily: S.fontMono, fontSize: "0.875rem", fontWeight: 700, color: S.pass,
            padding: "2px 8px", border: `1px solid ${S.pass}`,
            background: `color-mix(in srgb, ${S.pass} 8%, transparent)`,
          }}>
            {aiResult.fallback ? "PRESET" : "87%"}
          </span>
        </div>
        <span style={{ color: S.rim }}>|</span>
        <div style={{ flex: 1, minWidth: 200 }}>
          <span style={{ fontFamily: S.fontMono, fontSize: "0.625rem", letterSpacing: "0.06em", color: S.tertiary }}>NEAREST PRESET: </span>
          <span style={{ fontFamily: S.fontUI, fontSize: "0.75rem", color: S.secondary }}>
            {aiResult.nearest_preset_name ?? "—"}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── AI loading + error states ─────────────────────────────────────────────────

function AILoading() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, minHeight: 280 }}>
      <div style={{ fontFamily: S.fontMono, fontSize: "0.625rem", color: S.cyan, letterSpacing: "0.12em" }}>
        ANALYZING PROFILE…
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            width: 8, height: 8, borderRadius: 4,
            background: S.cyan,
            opacity: 0.3,
            animation: `pulse 1.2s ease-in-out ${i * 0.4}s infinite`,
          }} />
        ))}
      </div>
      <p style={{ fontFamily: S.fontUI, fontSize: "0.75rem", color: S.secondary, textAlign: "center", maxWidth: 320, margin: 0, lineHeight: 1.6 }}>
        The AI engine is generating tailored hedge policy recommendations based on your company profile and objectives.
      </p>
    </div>
  );
}

function AIError({ message, onBack }: { message: string; onBack: () => void }) {
  return (
    <div style={{ padding: "20px 0", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.fail, letterSpacing: "0.06em" }}>
        AI ANALYSIS FAILED
      </div>
      <p style={{ fontFamily: S.fontUI, fontSize: "0.8125rem", color: S.secondary, margin: 0, lineHeight: 1.6 }}>
        {message}
      </p>
      <button type="button" onClick={onBack} style={{
        alignSelf: "flex-start", fontFamily: S.fontMono, fontSize: "0.75rem",
        padding: "4px 14px", border: `1px solid ${S.rim}`, color: S.secondary,
        background: "transparent", cursor: "pointer",
      }}>
        ← Back to Objectives
      </button>
    </div>
  );
}

// ── Main Page Component ──────────────────────────────────────────────────────

export default function AIPolicyWizardPage() {
  const { isAuthenticated, token, user } = useAuth();
  const router = useRouter();
  const renderTs = useRenderTs();

  const [step, setStep]           = useState(0);
  const [completed, setCompleted] = useState<Set<number>>(new Set());
  const [state, setState]         = useState<WizardState>(INITIAL_STATE);

  // AI step state
  const [aiResult, setAiResult]     = useState<AIPolicyResult | null>(null);
  const [aiLoading, setAiLoading]   = useState(false);
  const [aiError, setAiError]       = useState<string>('');

  // Selection state (Step 5)
  const [selectedRecId, setSelectedRecId] = useState<string | null>(null);
  const [expandedId, setExpandedId]       = useState<string | null>(null);

  // Save state
  const [policyName, setPolicyName] = useState('');
  const [policyTag, setPolicyTag]   = useState('');
  const [saving, setSaving]         = useState(false);
  const [saved, setSaved]           = useState(false);
  const [saveError, setSaveError]   = useState('');

  const patchState = useCallback((patch: Partial<WizardState>) => {
    setState((prev) => ({ ...prev, ...patch }));
  }, []);

  // Auth guard
  useEffect(() => {
    if (!isAuthenticated) router.push('/auth/login');
  }, [isAuthenticated, router]);

  // ── Step navigation ────────────────────────────────────────────────────────

  const goNext = useCallback(async () => {
    if (step < STEP_LABELS.length - 2) {
      // Steps 0–3: just advance
      setCompleted((prev) => new Set(prev).add(step));
      setStep((s) => s + 1);
    } else if (step === STEP_LABELS.length - 2) {
      // Step 3 → 4: trigger AI call
      setCompleted((prev) => new Set(prev).add(step));
      setStep(STEP_LABELS.length - 1);
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
        // Pre-fill policy name from first recommendation
        if (result.recommendations[0]) {
          setPolicyName(result.recommendations[0].preset.name);
          setPolicyTag(result.recommendations[0].preset.shortName.toLowerCase());
        }
      } catch (e: unknown) {
        setAiError(`AI analysis failed. ${String(e)}`);
      } finally {
        setAiLoading(false);
      }
    }
  }, [step, state]);

  const goBack = useCallback(() => {
    if (step > 0) setStep((s) => s - 1);
  }, [step]);

  const startOver = useCallback(() => {
    setStep(0);
    setCompleted(new Set());
    setState(INITIAL_STATE);
    setAiResult(null);
    setAiLoading(false);
    setAiError('');
    setSelectedRecId(null);
    setExpandedId(null);
    setPolicyName('');
    setPolicyTag('');
    setSaved(false);
    setSaveError('');
  }, []);

  // ── Save policy ────────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (!aiResult || !policyName.trim() || !selectedRecId) return;
    if (!token) { setSaveError('Not authenticated'); return; }

    const selectedIdx  = aiResult.recommendations.findIndex(
      (r, i) => `${r.preset.shortName}-${i}` === selectedRecId,
    );
    const selectedRec  = aiResult.recommendations[selectedIdx >= 0 ? selectedIdx : 0];

    setSaving(true);
    setSaveError('');
    try {
      const canonical = buildCanonicalFromPageState(
        state,
        aiResult,
        selectedRec,
        user?.id ?? 'unknown',
        user?.company?.id ?? 'unknown',
        policyName.trim(),
        policyTag.trim(),
      );
      const payload = toCreateTemplatePayload(canonical);
      await createPolicyTemplate(payload, token);
      setSaved(true);
    } catch (e: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setSaveError(`Save failed: ${(e as any)?.response?.data?.detail ?? String(e)}`);
    } finally {
      setSaving(false);
    }
  }, [aiResult, selectedRecId, policyName, policyTag, token, state, user]);

  const handleApply = useCallback(() => {
    if (!aiResult || !selectedRecId) return;
    const selectedIdx = aiResult.recommendations.findIndex(
      (r, i) => `${r.preset.shortName}-${i}` === selectedRecId,
    );
    const selectedRec = aiResult.recommendations[selectedIdx >= 0 ? selectedIdx : 0];
    // Navigate to Position Desk with policy applied via URL param (future enhancement)
    // For now, redirect to policies page
    void selectedRec;
    router.push('/policies');
  }, [aiResult, selectedRecId, router]);

  if (!isAuthenticated) return null;

  const isLastStep = step === STEP_LABELS.length - 1;

  // ── Render step content ──────────────────────────────────────────────────

  const renderStepContent = () => {
    switch (step) {
      case 0: return <Step1BusinessProfile state={state} onChange={patchState} />;
      case 1: return <Step2CashFlow        state={state} onChange={patchState} />;
      case 2: return <Step3RiskCost        state={state} onChange={patchState} />;
      case 3: return <Step4Objectives      state={state} onChange={patchState} />;
      case 4:
        if (aiLoading) return <AILoading />;
        if (aiError)   return <AIError message={aiError} onBack={() => setStep(3)} />;
        if (!aiResult) return null;
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <Step5Recommendations
              aiResult={aiResult}
              selectedRecId={selectedRecId}
              onSelect={setSelectedRecId}
              expandedId={expandedId}
              onToggleExpand={(id) => setExpandedId(prev => prev === id ? null : id)}
            />

            {/* Policy naming & save */}
            {selectedRecId && (
              <div style={{ borderTop: `1px solid ${S.rim}`, paddingTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
                  <div>
                    <FieldLabel label="POLICY NAME *" hint="descriptive name for this policy" />
                    <input type="text" value={policyName} onChange={e => setPolicyName(e.target.value)}
                      placeholder="e.g. Q1 2026 Conservative Hedge" style={inputBase} />
                  </div>
                  <div>
                    <FieldLabel label="TAG" hint="short identifier" />
                    <input type="text" value={policyTag} onChange={e => setPolicyTag(e.target.value)}
                      placeholder="e.g. q1-cons" style={inputBase} maxLength={20} />
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  {saved ? (
                    <span style={{ fontFamily: S.fontMono, fontSize: "0.75rem", color: S.pass, letterSpacing: "0.06em" }}>
                      ✓ POLICY SAVED — visible in Policy Library
                    </span>
                  ) : (
                    <button type="button" onClick={handleSave}
                      disabled={saving || !policyName.trim()}
                      style={{
                        fontFamily: S.fontMono, fontSize: "0.75rem", letterSpacing: "0.06em", fontWeight: 700,
                        padding: "6px 18px",
                        border: `1px solid ${policyName.trim() ? S.amber : S.rim}`,
                        color: policyName.trim() ? S.amber : S.tertiary,
                        background: policyName.trim() ? `color-mix(in srgb, ${S.amber} 8%, transparent)` : "transparent",
                        cursor: saving || !policyName.trim() ? "not-allowed" : "pointer",
                      }}>
                      {saving ? "SAVING…" : "SAVE POLICY"}
                    </button>
                  )}
                  <button type="button" onClick={handleApply}
                    style={{
                      fontFamily: S.fontMono, fontSize: "0.75rem", letterSpacing: "0.06em", fontWeight: 700,
                      padding: "6px 18px", border: `1px solid ${S.cyan}`, color: S.cyan,
                      background: `color-mix(in srgb, ${S.cyan} 8%, transparent)`, cursor: "pointer",
                    }}>
                    ⚡ APPLY TO SESSION
                  </button>
                  {saveError && (
                    <span style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.fail }}>
                      {saveError}
                    </span>
                  )}
                </div>
              </div>
            )}

            <button type="button" onClick={startOver} style={{
              alignSelf: "flex-start", fontFamily: S.fontMono, fontSize: "0.6875rem",
              letterSpacing: "0.04em", color: S.tertiary, background: "transparent",
              border: "none", cursor: "pointer", padding: "4px 0", textDecoration: "underline",
            }}>
              Start Over
            </button>
          </div>
        );
      default: return null;
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: S.bgDeep, fontFamily: S.fontUI, color: S.primary }}>
      <TopBar onBack={() => router.push('/policies')} />
      <StepProgressBar current={step} completed={completed} />

      {/* Main content */}
      <div style={{ flex: 1, overflow: "auto", padding: "24px 32px", display: "flex", flexDirection: "column" }}>
        {/* Step header */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", letterSpacing: "0.06em", color: S.tertiary }}>
              STEP {step + 1} OF {STEP_LABELS.length}
            </span>
            <span style={{ color: S.rim }}>|</span>
            <span style={{ fontFamily: S.fontUI, fontSize: "0.9375rem", fontWeight: 600, color: S.primary }}>
              {STEP_LABELS[step]}
            </span>
          </div>
          <div style={{ height: 1, background: S.rim, marginTop: 10 }} />
        </div>
        {renderStepContent()}
      </div>

      {/* Bottom Action Bar */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 32px", background: S.bgPanel, borderTop: `1px solid ${S.rim}`, flexShrink: 0,
      }}>
        <button type="button" onClick={() => router.push('/policies')} style={{
          fontFamily: S.fontMono, fontSize: "0.75rem", letterSpacing: "0.04em", color: S.tertiary,
          background: "transparent", border: "none", cursor: "pointer", padding: "4px 0",
        }}>
          Cancel
        </button>
        <div style={{ display: "flex", gap: 10 }}>
          {step > 0 && !aiLoading && (
            <button type="button" onClick={goBack} style={{
              display: "flex", alignItems: "center", gap: 5,
              fontFamily: S.fontMono, fontSize: "0.75rem", letterSpacing: "0.06em",
              padding: "6px 16px", border: `1px solid ${S.rim}`, color: S.secondary,
              background: "transparent", cursor: "pointer",
            }}>
              ← Back
            </button>
          )}
          {!isLastStep && (
            <button type="button" onClick={goNext} style={{
              display: "flex", alignItems: "center", gap: 5,
              fontFamily: S.fontMono, fontSize: "0.75rem", letterSpacing: "0.06em", fontWeight: 700,
              padding: "6px 20px", border: `1px solid ${S.cyan}`, color: S.cyan,
              background: `color-mix(in srgb, ${S.cyan} 8%, transparent)`, cursor: "pointer",
            }}>
              {step === STEP_LABELS.length - 2 ? "✦ ANALYZE WITH AI" : "Next →"}
            </button>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer style={{
        height: 32, display: "flex", alignItems: "center", gap: 8, padding: "0 20px",
        borderTop: `1px solid ${S.rim}`, background: S.bgPanel,
        fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary,
        letterSpacing: "0.04em", flexShrink: 0,
      }}>
        <span>{renderTs}</span>
        <span style={{ color: S.rim }}>&mdash;</span>
        <span>ORDR · AI Policy Wizard</span>
      </footer>
    </div>
  );
}
