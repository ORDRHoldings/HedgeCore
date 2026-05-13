"use client";

/**
 * PolicyWizardModal.tsx
 *
 * 5-step AI-powered policy creation wizard — modal entry point.
 *
 * UNIFIED with ai-policy-wizard/page.tsx:
 *   ▸ Same WizardState schema (21 fields) from src/utils/policyMapper.ts
 *   ▸ Same 4 input steps (Business Profile, Cash Flow, Risk & Cost, Objectives)
 *   ▸ Same AI call: mapWizardStateToQA → suggestPolicyAI
 *   ▸ Same save path: buildCanonicalFromPageState → toCreateTemplatePayload → createPolicyTemplate
 *   ▸ Same CanonicalPolicy output — identical execution_config given identical inputs
 *
 * Both entry points are now UI skins over the same canonical model.
 * Entry Point B (/ai-policy-wizard page) uses the same WizardState + mappers.
 *
 * Steps:
 *   1 — Business Profile
 *   2 — Cash Flow
 *   3 — Risk & Cost
 *   4 — Objectives
 *   5 — AI Recommendations (3 strategy cards)
 *
 * Props:
 *   open       — modal visibility
 *   onClose    — close/dismiss callback
 *   token      — JWT for saving policy to DB
 *   onApply    — apply selected policy to session
 *   onSaved    — called after successful DB save with new template
 */

import { useState, useCallback } from "react";
import { Sparkles, ChevronRight, ChevronLeft, Check, X, Save } from "lucide-react";
import Modal from "@/components/shared/Modal";
import {
  suggestPolicyAI,
  createPolicyTemplate,
  type AIPolicyResult,
  type AIPolicyRecommendation,
} from "@/api/policyClient";
import type { PolicyTemplate } from "@/api/policyClient";
import type { PolicyConfig } from "@/api/types";
import type { PolicyPreset } from "@/constants/policyPresets";
import { useAuth } from "@/lib/authContext";
import {
  mapWizardStateToQA,
  buildCanonicalFromPageState,
  toCreateTemplatePayload,
  type WizardState,
} from "@/utils/policyMapper";

// ── Design tokens ─────────────────────────────────────────────────────────────
const S = {
  fontUI:     "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono:   "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  bgDeep:     "var(--bg-deep)",
  bgPanel:    "var(--bg-panel)",
  bgSub:      "var(--bg-sub,var(--bg-panel))",
  border:     "var(--border-rim)",
  borderSoft: "var(--border-soft)",
  primary:    "var(--text-primary)",
  secondary:  "var(--text-secondary)",
  tertiary:   "var(--text-tertiary)",
  cyan:       "var(--accent-cyan,#22d3ee)",
  amber:      "var(--accent-amber,#fbbf24)",
  green:      "var(--status-pass,#34d399)",
  red:        "var(--accent-red,#f87171)",
} as const;

// ── Unified constants (same as ai-policy-wizard/page.tsx) ─────────────────────
const COMPANY_TYPES   = ["Manufacturer","Exporter","Importer","Services","Conglomerate","Financial"] as const;
const CURRENCIES      = ["MXN","USD","EUR","GBP","JPY","CAD","BRL","CNY"] as const;
const EXPOSURE_TIERS  = ["<$1M","$1-10M","$10-50M","$50-250M","$250M-1B",">$1B"] as const;
const HEDGE_EXP       = ["None","Basic (spots/forwards)","Intermediate (options)","Advanced (structured)"] as const;
const INDUSTRY_SECTORS= ["Automotive","Manufacturing","Mining","Agriculture","Technology","Retail","Energy","Financial Services","Other"] as const;
const FX_CORRIDORS    = ["USD/MXN","EUR/MXN","GBP/MXN","JPY/MXN","USD/EUR","USD/GBP","USD/JPY"] as const;
const VISIBILITY_OPTS = ["1 month","3 months","6 months","12 months","18+ months"] as const;
const SEASONAL_OPTS   = ["None","Quarterly","Semi-annual","Annual","Custom"] as const;
const TENOR_OPTS      = ["Spot","1M","3M","6M","12M","18M+"] as const;
const MAX_LOSS_OPTS   = ["1%","2%","5%","10%","Unlimited"] as const;
const VAR_CONF_OPTS   = ["90%","95%","99%","99.5%"] as const;
const DRAWDOWN_OPTS   = ["Low (<2%)","Medium (2-5%)","High (5-10%)","Very High (>10%)"] as const;
const OBJECTIVES      = ["Minimize Cost","Maximize Protection","Balanced","Regulatory Compliance"] as const;
const INSTRUMENT_OPTS = ["Forwards","Vanilla Options","Collars","Seagulls","Participating Forwards","Cross-Currency Swaps","NDFs"] as const;
const BENCHMARK_OPTS  = ["None","Budget Rate","Spot at Inception","Forward Rate"] as const;

// ── Initial state (unified, blank) ────────────────────────────────────────────
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
  cashFlowCertainty: 50,
  receivableSplit: 50,
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
  instrumentPreferences: [],
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
  varConfidence: "",
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

// ── Shared primitives ─────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "7px 10px",
  border: `1px solid var(--border-rim)`,
  background: S.bgSub, color: S.primary,
  fontFamily: S.fontUI, fontSize: "0.8125rem", outline: "none",
};

const selectStyle: React.CSSProperties = { ...inputStyle, cursor: "pointer" };

function FieldLabel({ label, hint }: { label: string; hint?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 5 }}>
      <span style={{ fontFamily: S.fontMono, fontSize: "0.75rem", letterSpacing: "0.08em", color: S.tertiary }}>{label}</span>
      {hint && <span style={{ fontFamily: S.fontUI, fontSize: "0.75rem", color: S.tertiary, opacity: 0.7 }}>{hint}</span>}
    </div>
  );
}

function ChoiceButton({ label, desc, selected, onClick }: { label: string; desc?: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex", flexDirection: "column", gap: 3,
        padding: "8px 10px", border: `1px solid ${selected ? S.cyan : S.border}`,
        background: selected ? `color-mix(in srgb, ${S.cyan} 8%, ${S.bgPanel})` : S.bgSub,
        cursor: "pointer", textAlign: "left", transition: "all 0.12s",
      }}
    >
      <span style={{ fontFamily: S.fontMono, fontSize: "0.75rem", fontWeight: 700, color: selected ? S.cyan : S.primary, letterSpacing: "0.05em" }}>{label}</span>
      {desc && <span style={{ fontFamily: S.fontUI, fontSize: "0.75rem", color: S.secondary }}>{desc}</span>}
    </button>
  );
}

function SliderField({ label, hint, value, onChange, min, max, step, format }: {
  label: string; hint?: string; value: number; onChange: (v: number) => void;
  min: number; max: number; step: number; format: (v: number) => string;
}) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
        <FieldLabel label={label} hint={hint} />
        <span style={{ fontFamily: S.fontMono, fontSize: "0.8125rem", fontWeight: 700, color: S.cyan }}>{format(value)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ width: "100%", accentColor: S.cyan, cursor: "pointer" }}
      />
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: S.fontMono, fontSize: "0.75rem", color: S.tertiary, marginTop: 2 }}>
        <span>{format(min)}</span><span>{format(max)}</span>
      </div>
    </div>
  );
}

function MultiCheck({ options, selected, onChange }: {
  options: readonly string[]; selected: string[]; onChange: (v: string[]) => void;
}) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {options.map(o => {
        const on = selected.includes(o);
        return (
          <button key={o} type="button"
            onClick={() => onChange(on ? selected.filter(s => s !== o) : [...selected, o])}
            style={{
              padding: "5px 10px", fontFamily: S.fontMono, fontSize: "0.75rem",
              letterSpacing: "0.04em", border: `1px solid ${on ? S.cyan : S.border}`,
              background: on ? `color-mix(in srgb, ${S.cyan} 8%, ${S.bgPanel})` : S.bgSub,
              color: on ? S.cyan : S.secondary, cursor: "pointer",
            }}
          >{o}</button>
        );
      })}
    </div>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
      <div onClick={() => onChange(!checked)}
        style={{
          width: 32, height: 18, borderRadius: 9,
          background: checked ? S.cyan : S.border,
          position: "relative", transition: "background 0.15s", flexShrink: 0,
        }}
      >
        <div style={{
          width: 14, height: 14, borderRadius: 7, background: S.primary,
          position: "absolute", top: 2, left: checked ? 16 : 2, transition: "left 0.15s",
        }} />
      </div>
      <span style={{ fontFamily: S.fontUI, fontSize: "0.8125rem", color: S.secondary }}>{label}</span>
    </label>
  );
}

// ── Risk posture color ────────────────────────────────────────────────────────
function riskColor(posture: PolicyPreset["riskPosture"]): string {
  if (posture === "CONSERVATIVE") return S.green;
  if (posture === "AGGRESSIVE")   return S.red;
  return S.amber;
}

// ── Recommendation Card ───────────────────────────────────────────────────────
function RecommendationCard({ rec, selected, onSelect, isFallback }: {
  rec: AIPolicyRecommendation; selected: boolean; onSelect: () => void; isFallback: boolean;
}) {
  const p = rec.preset;
  return (
    <div onClick={onSelect} style={{
      flex: "1 1 0", minWidth: 180,
      border: `1.5px solid ${selected ? S.cyan : S.border}`,
      background: selected ? `color-mix(in srgb, ${S.cyan} 6%, ${S.bgPanel})` : S.bgSub,
      cursor: "pointer", display: "flex", flexDirection: "column",
      transition: "border-color 0.15s", borderRadius: 2, overflow: "hidden",
    }}>
      <div style={{ padding: "9px 12px", background: selected ? `color-mix(in srgb, ${S.cyan} 10%, ${S.bgDeep})` : S.bgDeep, borderBottom: `1px solid ${S.border}` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
          <span style={{ fontFamily: S.fontMono, fontSize: "0.75rem", letterSpacing: "0.1em", color: selected ? S.cyan : S.tertiary, fontWeight: 700 }}>
            {rec.label}{isFallback && rec.label === "AI Custom" ? " (PRESET)" : ""}
          </span>
          <span style={{ fontFamily: S.fontMono, fontSize: "0.75rem", padding: "1px 5px", borderRadius: 2, background: `color-mix(in srgb, ${riskColor(p.riskPosture)} 12%, transparent)`, color: riskColor(p.riskPosture), letterSpacing: "0.06em" }}>
            {p.riskPosture}
          </span>
        </div>
        <div style={{ marginTop: 3, fontFamily: S.fontUI, fontSize: "0.75rem", fontWeight: 600, color: S.primary }}>{p.name}</div>
        <div style={{ fontFamily: S.fontMono, fontSize: "0.75rem", color: S.tertiary, letterSpacing: "0.05em", marginTop: 2 }}>{p.shortName} · {p.category}</div>
      </div>
      <div style={{ padding: "9px 12px", display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
          {[
            { label: "CONFIRMED", value: `${Math.round(p.policy.hedge_ratios.confirmed * 100)}%` },
            { label: "FORECAST",  value: `${Math.round(p.policy.hedge_ratios.forecast  * 100)}%` },
            { label: "SPREAD",    value: `${p.policy.cost_assumptions.spread_bps} bps` },
            { label: "PRODUCT",   value: p.policy.execution_product },
          ].map(({ label, value }) => (
            <div key={label} style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <span style={{ fontFamily: S.fontMono, fontSize: "0.75rem", letterSpacing: "0.08em", color: S.tertiary }}>{label}</span>
              <span style={{ fontFamily: S.fontMono, fontSize: "0.75rem", fontWeight: 700, color: S.primary }}>{value}</span>
            </div>
          ))}
        </div>
        <p style={{ fontFamily: S.fontUI, fontSize: "0.75rem", color: S.secondary, lineHeight: 1.5, margin: "3px 0 0", flexGrow: 1 }}>
          {rec.rationale.slice(0, 160)}{rec.rationale.length > 160 ? "…" : ""}
        </p>
      </div>
      {selected && (
        <div style={{ padding: "5px 12px", background: `color-mix(in srgb, ${S.cyan} 12%, transparent)`, borderTop: `1px solid ${S.border}`, display: "flex", alignItems: "center", gap: 5 }}>
          <Check size={9} color={S.cyan} />
          <span style={{ fontFamily: S.fontMono, fontSize: "0.75rem", color: S.cyan, letterSpacing: "0.06em" }}>SELECTED</span>
        </div>
      )}
    </div>
  );
}

// ── Step progress bar ─────────────────────────────────────────────────────────
function StepBar({ current, total }: { current: number; total: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      {Array.from({ length: total }, (_, i) => (
        <div key={i} style={{
          height: 3, flex: 1, borderRadius: 2,
          background: i < current ? S.cyan : i === current ? `color-mix(in srgb, ${S.cyan} 40%, transparent)` : S.borderSoft,
          transition: "background 0.2s",
        }} />
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
interface Props {
  open: boolean;
  onClose: () => void;
  token?: string;
  onApply?: (config: PolicyConfig) => void;
  onSaved?: (template: PolicyTemplate) => void;
}

const TOTAL_STEPS = 5;

export default function PolicyWizardModal({ open, onClose, token, onApply, onSaved }: Props) {
  const { user } = useAuth();
  const isAdmin = user?.roles?.some(r => ["admin", "cfo", "ceo"].includes(r)) ?? false;

  const [step, setStep]               = useState(0);
  const [state, setState]             = useState<WizardState>(INITIAL_STATE);
  const [aiResult, setAiResult]       = useState<AIPolicyResult | null>(null);
  const [aiLoading, setAiLoading]     = useState(false);
  const [aiError, setAiError]         = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [policyName, setPolicyName]   = useState("");
  const [policyTag, setPolicyTag]     = useState("");
  const [publishCompany, setPublishCompany] = useState(false);
  const [saving, setSaving]           = useState(false);
  const [saved, setSaved]             = useState(false);
  const [saveError, setSaveError]     = useState("");

  /** Partial-update helper — same ergonomics as the page's setState pattern */
  const set = <K extends keyof WizardState>(key: K, value: WizardState[K]) =>
    setState(s => ({ ...s, [key]: value }));

  const handleClose = useCallback(() => {
    setStep(0); setState(INITIAL_STATE); setAiResult(null);
    setAiLoading(false); setAiError(""); setSelectedIdx(0);
    setPolicyName(""); setPolicyTag(""); setSaved(false); setSaveError("");
    onClose();
  }, [onClose]);

  // ── Step navigation ──────────────────────────────────────────────────────

  const goNext = useCallback(async () => {
    if (step < TOTAL_STEPS - 2) {
      setStep(s => s + 1);
    } else if (step === TOTAL_STEPS - 2) {
      // Step 4 → 5: trigger AI call with unified mapper
      setStep(TOTAL_STEPS - 1);
      setAiLoading(true); setAiError(""); setAiResult(null); setSelectedIdx(0);
      try {
        const qa = mapWizardStateToQA(state);
        const result = await suggestPolicyAI(qa, token);
        setAiResult(result);
        setPolicyName(result.suggested.name);
        setPolicyTag(result.suggested.shortName.toLowerCase());
      } catch (e: unknown) {
        setAiError(`AI analysis failed: ${String(e)}`);
      } finally {
        setAiLoading(false);
      }
    }
  }, [step, state, token]);

  const goBack = useCallback(() => {
    if (step > 0) setStep(s => s - 1);
  }, [step]);

  // ── Save policy (canonical path — identical to page entry point) ─────────

  const handleSave = useCallback(async () => {
    if (!aiResult || !policyName.trim()) return;
    const recs     = aiResult.recommendations;
    const selected = recs[selectedIdx] ?? recs[0];
    const userId    = user?.id ?? "unknown";
    const companyId = user?.company?.id ?? "unknown";

    setSaving(true); setSaveError("");
    try {
      const canonical = buildCanonicalFromPageState(
        state,
        aiResult,
        selected,
        userId,
        companyId,
        policyName.trim(),
        policyTag.trim(),
      );
      const payload = toCreateTemplatePayload(canonical);
      const tmpl    = await createPolicyTemplate(payload, token);
      setSaved(true);
      onSaved?.(tmpl);
    } catch (e: unknown) {
      setSaveError(`Save failed: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }, [aiResult, selectedIdx, policyName, policyTag, state, token, user, onSaved]);

  const handleApply = useCallback(() => {
    if (!aiResult) return;
    const recs     = aiResult.recommendations;
    const selected = recs[selectedIdx] ?? recs[0];
    onApply?.(selected.preset.policy);
    handleClose();
  }, [aiResult, selectedIdx, onApply, handleClose]);

  // ── Render steps ─────────────────────────────────────────────────────────

  const renderStep = () => {
    switch (step) {

      // ── STEP 1: Business Profile (same fields as page Step 1) ─────────────
      case 0:
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <p style={{ fontFamily: S.fontUI, fontSize: "0.8125rem", color: S.secondary, margin: 0, lineHeight: 1.6 }}>
              Tell us about your organization to tailor the hedge policy recommendation.
            </p>

            {/* Company Type */}
            <div>
              <FieldLabel label="COMPANY TYPE" />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 5 }}>
                {COMPANY_TYPES.map(t => (
                  <ChoiceButton key={t} label={t} selected={state.companyType === t} onClick={() => set("companyType", t)} />
                ))}
              </div>
            </div>

            {/* Primary currency + Annual exposure */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <FieldLabel label="PRIMARY OPERATING CURRENCY" />
                <select value={state.primaryCurrency} onChange={e => set("primaryCurrency", e.target.value)} style={selectStyle}>
                  <option value="">Select…</option>
                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <FieldLabel label="ANNUAL FX EXPOSURE" />
                <select value={state.annualExposure} onChange={e => set("annualExposure", e.target.value)} style={selectStyle}>
                  <option value="">Select tier…</option>
                  {EXPOSURE_TIERS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>

            {/* Hedge experience + Industry */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <FieldLabel label="HEDGE EXPERIENCE" />
                <select value={state.hedgeExperience} onChange={e => set("hedgeExperience", e.target.value)} style={selectStyle}>
                  <option value="">Select…</option>
                  {HEDGE_EXP.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
              <div>
                <FieldLabel label="INDUSTRY SECTOR" />
                <select value={state.industrySector} onChange={e => set("industrySector", e.target.value)} style={selectStyle}>
                  <option value="">Select…</option>
                  {INDUSTRY_SECTORS.map(i => <option key={i} value={i}>{i}</option>)}
                </select>
              </div>
            </div>

            {/* FX Corridors */}
            <div>
              <FieldLabel label="FX CORRIDORS" hint="select all applicable" />
              <MultiCheck options={FX_CORRIDORS} selected={state.fxCorridors} onChange={v => set("fxCorridors", v)} />
            </div>
          </div>
        );

      // ── STEP 2: Cash Flow (same fields as page Step 2) ───────────────────
      case 1:
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <p style={{ fontFamily: S.fontUI, fontSize: "0.8125rem", color: S.secondary, margin: 0, lineHeight: 1.6 }}>
              Describe the nature and predictability of your foreign-currency cash flows.
            </p>

            {/* Visibility + Seasonal */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <FieldLabel label="CASH FLOW VISIBILITY HORIZON" />
                <select value={state.cashFlowVisibility} onChange={e => set("cashFlowVisibility", e.target.value)} style={selectStyle}>
                  <option value="">Select…</option>
                  {VISIBILITY_OPTS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <FieldLabel label="SEASONAL PATTERNS" />
                <select value={state.seasonalPatterns} onChange={e => set("seasonalPatterns", e.target.value)} style={selectStyle}>
                  <option value="">Select…</option>
                  {SEASONAL_OPTS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            </div>

            {/* Certainty slider */}
            <SliderField
              label="CASH FLOW CERTAINTY" hint="how predictable are your FX flows?"
              value={state.cashFlowCertainty} onChange={v => set("cashFlowCertainty", v)}
              min={0} max={100} step={5} format={v => `${v}%`}
            />

            {/* Receivable split */}
            <SliderField
              label="RECEIVABLE / PAYABLE SPLIT" hint="0% = all payables, 100% = all receivables"
              value={state.receivableSplit} onChange={v => set("receivableSplit", v)}
              min={0} max={100} step={5} format={v => `${v}% rec / ${100 - v}% pay`}
            />

            {/* Tenor + Netting */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <FieldLabel label="AVERAGE TRANSACTION TENOR" />
                <select value={state.averageTenor} onChange={e => set("averageTenor", e.target.value)} style={selectStyle}>
                  <option value="">Select…</option>
                  {TENOR_OPTS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 2 }}>
                <ToggleRow label="Netting available" checked={state.nettingAvailable} onChange={v => set("nettingAvailable", v)} />
              </div>
            </div>
          </div>
        );

      // ── STEP 3: Risk & Cost (same fields as page Step 3) ─────────────────
      case 2:
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <p style={{ fontFamily: S.fontUI, fontSize: "0.8125rem", color: S.secondary, margin: 0, lineHeight: 1.6 }}>
              Define your organization's risk tolerance and acceptable hedging costs.
            </p>

            {/* Max acceptable loss + VaR confidence */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <FieldLabel label="MAX ACCEPTABLE LOSS" />
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {MAX_LOSS_OPTS.map(o => (
                    <ChoiceButton key={o} label={o} selected={state.maxAcceptableLoss === o} onClick={() => set("maxAcceptableLoss", o)} />
                  ))}
                </div>
              </div>
              <div>
                <FieldLabel label="VaR CONFIDENCE LEVEL" />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
                  {VAR_CONF_OPTS.map(o => (
                    <ChoiceButton key={o} label={o} selected={state.varConfidence === o} onClick={() => set("varConfidence", o)} />
                  ))}
                </div>
              </div>
            </div>

            {/* Drawdown tolerance */}
            <div>
              <FieldLabel label="DRAWDOWN TOLERANCE" />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 5 }}>
                {DRAWDOWN_OPTS.map(o => (
                  <ChoiceButton key={o} label={o.split(" ")[0]} desc={o} selected={state.drawdownTolerance === o} onClick={() => set("drawdownTolerance", o)} />
                ))}
              </div>
            </div>

            {/* Premium budget slider */}
            <SliderField
              label="PREMIUM BUDGET (% OF NOTIONAL)"
              value={state.premiumBudget} onChange={v => set("premiumBudget", v)}
              min={0} max={3} step={0.1} format={v => `${v.toFixed(1)}%`}
            />

            {/* Cost vs Protection priority slider */}
            <SliderField
              label="COST vs PROTECTION PRIORITY"
              hint="0 = minimize cost, 100 = maximize protection"
              value={state.costProtectionPriority} onChange={v => set("costProtectionPriority", v)}
              min={0} max={100} step={5} format={v => v < 35 ? "Cost-focused" : v < 65 ? "Balanced" : "Protection-first"}
            />

            {/* Board statement */}
            <div>
              <FieldLabel label="BOARD RISK STATEMENT (optional)" />
              <textarea
                value={state.boardStatement}
                onChange={e => set("boardStatement", e.target.value)}
                placeholder="e.g. Board resolution FX-2024-03 requires minimum 70% hedge coverage on confirmed flows"
                rows={2}
                style={{ ...inputStyle, resize: "vertical" }}
              />
            </div>
          </div>
        );

      // ── STEP 4: Objectives (same fields as page Step 4) ──────────────────
      case 3:
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <p style={{ fontFamily: S.fontUI, fontSize: "0.8125rem", color: S.secondary, margin: 0, lineHeight: 1.6 }}>
              Define your primary hedge objective and instrument preferences.
            </p>

            {/* Primary objective */}
            <div>
              <FieldLabel label="PRIMARY HEDGE OBJECTIVE" />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 5 }}>
                {OBJECTIVES.map(o => (
                  <ChoiceButton key={o} label={o} selected={state.primaryObjective === o} onClick={() => set("primaryObjective", o)} />
                ))}
              </div>
            </div>

            {/* Instrument preferences */}
            <div>
              <FieldLabel label="INSTRUMENT PREFERENCES" hint="select all acceptable" />
              <MultiCheck options={INSTRUMENT_OPTS} selected={state.instrumentPreferences} onChange={v => set("instrumentPreferences", v)} />
            </div>

            {/* Hedge ratio target slider */}
            <SliderField
              label="ADVISORY HEDGE RATIO TARGET"
              hint="does not override AI output"
              value={state.hedgeRatioTarget} onChange={v => set("hedgeRatioTarget", v)}
              min={0} max={100} step={5} format={v => `${v}%`}
            />

            {/* Rolling hedge + Benchmark */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <ToggleRow label="Rolling hedge programme" checked={state.rollingHedge} onChange={v => set("rollingHedge", v)} />
                {state.rollingHedge && (
                  <div>
                    <FieldLabel label="ROLLING TENOR" />
                    <select value={state.rollingTenor} onChange={e => set("rollingTenor", e.target.value)} style={selectStyle}>
                      {["1M","3M","6M","12M"].map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                )}
                <ToggleRow label="IFRS 9 / ASC 815 compliance required" checked={state.ifrsCompliance} onChange={v => set("ifrsCompliance", v)} />
              </div>
              <div>
                <FieldLabel label="BENCHMARK" />
                <select value={state.benchmark} onChange={e => set("benchmark", e.target.value)} style={selectStyle}>
                  <option value="">Select…</option>
                  {BENCHMARK_OPTS.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
            </div>
          </div>
        );

      // ── STEP 5: AI Recommendations ────────────────────────────────────────
      case 4:
        if (aiLoading) {
          return (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, minHeight: 200 }}>
              <Sparkles size={26} color={S.cyan} style={{ animation: "spin 2s linear infinite" }} />
              <div style={{ fontFamily: S.fontMono, fontSize: "0.75rem", color: S.cyan, letterSpacing: "0.1em" }}>ANALYZING YOUR PROFILE…</div>
              <p style={{ fontFamily: S.fontUI, fontSize: "0.75rem", color: S.secondary, textAlign: "center", maxWidth: 300 }}>
                The AI is generating tailored hedge policy recommendations based on your inputs.
              </p>
            </div>
          );
        }

        if (aiError) {
          return (
            <div style={{ padding: "20px 0", textAlign: "center" }}>
              <p style={{ fontFamily: S.fontMono, fontSize: "0.75rem", color: S.red, letterSpacing: "0.06em" }}>{aiError}</p>
              <button type="button" onClick={() => setStep(3)}
                style={{ fontFamily: S.fontMono, fontSize: "0.75rem", padding: "4px 14px", border: `1px solid ${S.border}`, color: S.secondary, background: "transparent", cursor: "pointer", marginTop: 12 }}
              >
                ← Back to Objectives
              </button>
            </div>
          );
        }

        if (!aiResult) return null;

        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Sparkles size={13} color={S.cyan} />
              <span style={{ fontFamily: S.fontMono, fontSize: "0.75rem", letterSpacing: "0.08em", color: S.cyan }}>
                {aiResult.fallback ? "PRESET MATCHED" : "AI RECOMMENDATIONS"} — SELECT ONE
              </span>
            </div>

            {/* 3 recommendation cards */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {aiResult.recommendations.map((rec, i) => (
                <RecommendationCard
                  key={i}
                  rec={rec}
                  selected={selectedIdx === i}
                  onSelect={() => {
                    setSelectedIdx(i);
                    setPolicyName(rec.preset.name);
                    setPolicyTag(rec.preset.shortName.toLowerCase());
                  }}
                  isFallback={aiResult.fallback}
                />
              ))}
            </div>

            {/* Policy naming */}
            <div style={{ borderTop: `1px solid ${S.border}`, paddingTop: 14, display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
              <div>
                <FieldLabel label="POLICY NAME *" hint="descriptive name" />
                <input type="text" value={policyName} onChange={e => setPolicyName(e.target.value)}
                  placeholder="e.g. Q1 2026 Conservative Hedge" style={inputStyle} />
              </div>
              <div>
                <FieldLabel label="SHORT TAG" hint="4–8 chars" />
                <input type="text" value={policyTag} onChange={e => setPolicyTag(e.target.value)}
                  placeholder="e.g. CONS-Q1" style={inputStyle} maxLength={12} />
              </div>
            </div>

            {/* Admin publish option */}
            {isAdmin && (
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input type="checkbox" checked={publishCompany} onChange={e => setPublishCompany(e.target.checked)} style={{ accentColor: S.amber }} />
                <span style={{ fontFamily: S.fontUI, fontSize: "0.8125rem", color: S.secondary }}>Publish company-wide (admin)</span>
                <span style={{ fontFamily: S.fontMono, fontSize: "0.75rem", color: S.amber, padding: "1px 5px", border: `1px solid ${S.amber}`, letterSpacing: "0.06em" }}>ADMIN</span>
              </label>
            )}

            {/* Save / Apply */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              {saved ? (
                <span style={{ fontFamily: S.fontMono, fontSize: "0.75rem", color: S.green, letterSpacing: "0.06em", display: "flex", alignItems: "center", gap: 5 }}>
                  <Check size={11} /> POLICY SAVED
                </span>
              ) : (
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving || !policyName.trim()}
                  style={{
                    fontFamily: S.fontMono, fontSize: "0.75rem", letterSpacing: "0.06em", fontWeight: 700,
                    padding: "5px 16px",
                    border: `1px solid ${policyName.trim() ? S.amber : S.border}`,
                    color: policyName.trim() ? S.amber : S.tertiary,
                    background: policyName.trim() ? `color-mix(in srgb, ${S.amber} 8%, transparent)` : "transparent",
                    cursor: saving || !policyName.trim() ? "not-allowed" : "pointer",
                    display: "flex", alignItems: "center", gap: 6,
                  }}
                >
                  <Save size={10} />
                  {saving ? "SAVING…" : "SAVE POLICY"}
                </button>
              )}
              <button
                type="button"
                onClick={handleApply}
                style={{
                  fontFamily: S.fontMono, fontSize: "0.75rem", letterSpacing: "0.06em", fontWeight: 700,
                  padding: "5px 16px", border: `1px solid ${S.cyan}`,
                  color: S.cyan, background: `color-mix(in srgb, ${S.cyan} 8%, transparent)`,
                  cursor: "pointer",
                }}
              >
                ⚡ APPLY TO SESSION
              </button>
              {saveError && <span style={{ fontFamily: S.fontMono, fontSize: "0.75rem", color: S.red }}>{saveError}</span>}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  // ── Step metadata ─────────────────────────────────────────────────────────
  const stepTitles = [
    "Business Profile",
    "Cash Flow",
    "Risk & Cost",
    "Objectives",
    "AI Recommendations",
  ];

  const isLastBeforeAI = step === TOTAL_STEPS - 2;
  const isAIStep       = step === TOTAL_STEPS - 1;
  // Step 1 requires company type or industry sector; other input steps always proceed-able
  const canProceed     = step === 0 ? (!!state.companyType || !!state.industrySector) : true;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={`Policy Wizard — ${stepTitles[step]}`}
      subtitle={`Step ${step + 1} of ${TOTAL_STEPS}`}
      width="lg"
      footer={
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <StepBar current={step} total={TOTAL_STEPS} />
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            {step > 0 && !isAIStep && (
              <button
                type="button"
                onClick={goBack}
                style={{ display: "flex", alignItems: "center", gap: 5, fontFamily: S.fontMono, fontSize: "0.75rem", letterSpacing: "0.06em", padding: "5px 14px", border: `1px solid ${S.border}`, color: S.secondary, background: "transparent", cursor: "pointer" }}
              >
                <ChevronLeft size={11} /> BACK
              </button>
            )}
            {!isAIStep && (
              <button
                type="button"
                onClick={goNext}
                disabled={!canProceed}
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  fontFamily: S.fontMono, fontSize: "0.75rem", letterSpacing: "0.06em", fontWeight: 700,
                  padding: "5px 18px",
                  border: `1px solid ${canProceed ? S.cyan : S.border}`,
                  color: canProceed ? S.cyan : S.tertiary,
                  background: canProceed ? `color-mix(in srgb, ${S.cyan} 8%, transparent)` : "transparent",
                  cursor: canProceed ? "pointer" : "not-allowed",
                }}
              >
                {isLastBeforeAI ? (
                  <><Sparkles size={10} /> ANALYZE WITH AI</>
                ) : (
                  <>NEXT <ChevronRight size={11} /></>
                )}
              </button>
            )}
            {isAIStep && (
              <button
                type="button"
                onClick={handleClose}
                style={{ fontFamily: S.fontMono, fontSize: "0.75rem", letterSpacing: "0.06em", padding: "5px 14px", border: `1px solid ${S.border}`, color: S.secondary, background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}
              >
                <X size={10} /> CLOSE
              </button>
            )}
          </div>
        </div>
      }
    >
      {renderStep()}
    </Modal>
  );
}
