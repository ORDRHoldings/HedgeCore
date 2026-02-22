"use client";

/**
 * PolicyWizardModal.tsx
 * 5-step AI-powered policy creation wizard.
 *
 * Steps:
 *   1 — Business Profile
 *   2 — Cash Flow Characteristics
 *   3 — Risk & Cost Preferences
 *   4 — Objectives & Constraints
 *   5 — AI Recommendations (3 cards)
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

// ── Design tokens ─────────────────────────────────────────────────────────────
const S = {
  fontUI:        "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono:      "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  bgDeep:        "var(--bg-deep)",
  bgPanel:       "var(--bg-panel)",
  bgSub:         "var(--bg-sub,var(--bg-panel))",
  border:        "var(--border-rim)",
  borderSoft:    "var(--border-soft)",
  primary:       "var(--text-primary)",
  secondary:     "var(--text-secondary)",
  tertiary:      "var(--text-tertiary)",
  cyan:          "var(--accent-cyan,#22d3ee)",
  amber:         "var(--accent-amber,#fbbf24)",
  green:         "var(--status-pass,#34d399)",
  red:           "var(--accent-red,#f87171)",
  purple:        "#a78bfa",
} as const;

// ── Industry options (reused from PolicyAIBuilder) ────────────────────────────
const INDUSTRY_OPTIONS = [
  "Technology / SaaS", "Manufacturing", "Retail / E-Commerce", "Pharma / Healthcare",
  "Agriculture / Commodity", "Automotive Supply Chain", "Airline / Aviation",
  "Shipping / Logistics", "Mining / Natural Resources", "Construction / Infrastructure",
  "Media / Entertainment", "Energy / Utilities", "Real Estate / Property",
  "Hospitality / Tourism", "Import / Export Trader", "NGO / Non-Profit",
  "Family Office", "Hedge Fund", "VC / Growth Equity", "Insurance",
  "Asset Management", "Banking / Financial Services", "Education / Institutions",
  "Sovereign / Government", "Other",
];

// ── Questionnaire answers type ────────────────────────────────────────────────
interface WizardAnswers {
  // Step 1: Business Profile
  industry: string;
  company_size: 'MICRO' | 'SMALL' | 'MEDIUM' | 'LARGE' | 'ENTERPRISE';
  annual_fx_volume_usd: number;
  primary_currency_pair: string;
  // Step 2: Cash Flow Characteristics
  cash_flow_predictability: 'LOW' | 'MEDIUM' | 'HIGH';
  payment_frequency: 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'IRREGULAR';
  avg_transaction_size_usd: number;
  has_confirmed_orders: boolean;
  confirmed_to_forecast_ratio: number;
  // Step 3: Risk & Cost Preferences
  risk_appetite: 'CONSERVATIVE' | 'MODERATE' | 'AGGRESSIVE';
  cost_sensitivity: 'LOW' | 'MEDIUM' | 'HIGH';
  max_hedge_cost_pct: number;
  time_horizon_months: number;
  // Step 4: Objectives & Constraints
  hedge_objective: string;
  exclude_ndf: boolean;
  exclude_fwd: boolean;
  board_constraints: string;
}

const EMPTY_ANSWERS: WizardAnswers = {
  industry: '',
  company_size: 'MEDIUM',
  annual_fx_volume_usd: 0,
  primary_currency_pair: 'USD/MXN',
  cash_flow_predictability: 'MEDIUM',
  payment_frequency: 'MONTHLY',
  avg_transaction_size_usd: 0,
  has_confirmed_orders: true,
  confirmed_to_forecast_ratio: 0.6,
  risk_appetite: 'MODERATE',
  cost_sensitivity: 'MEDIUM',
  max_hedge_cost_pct: 1.0,
  time_horizon_months: 6,
  hedge_objective: 'Budget certainty and P&L protection against adverse FX moves.',
  exclude_ndf: false,
  exclude_fwd: false,
  board_constraints: '',
};

// ── Helper components ─────────────────────────────────────────────────────────

function FieldLabel({ label, hint }: { label: string; hint?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 5 }}>
      <span style={{ fontFamily: S.fontMono, fontSize: '0.5rem', letterSpacing: '0.08em', color: S.tertiary }}>{label}</span>
      {hint && <span style={{ fontFamily: S.fontUI, fontSize: '0.5625rem', color: S.tertiary, opacity: 0.7 }}>{hint}</span>}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '7px 10px',
  border: `1px solid var(--border-rim)`,
  background: S.bgSub, color: S.primary,
  fontFamily: S.fontUI, fontSize: '0.8125rem', outline: 'none',
};

const selectStyle: React.CSSProperties = { ...inputStyle, cursor: 'pointer' };

function ChoiceButton({ label, desc, selected, onClick }: { label: string; desc?: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex', flexDirection: 'column', gap: 3,
        padding: '10px 14px', border: `1px solid ${selected ? S.cyan : S.border}`,
        background: selected ? `color-mix(in srgb, ${S.cyan} 8%, ${S.bgPanel})` : S.bgSub,
        cursor: 'pointer', textAlign: 'left', transition: 'all 0.12s',
      }}
    >
      <span style={{ fontFamily: S.fontMono, fontSize: '0.625rem', fontWeight: 700, color: selected ? S.cyan : S.primary, letterSpacing: '0.05em' }}>{label}</span>
      {desc && <span style={{ fontFamily: S.fontUI, fontSize: '0.625rem', color: S.secondary }}>{desc}</span>}
    </button>
  );
}

// ── Risk posture colour ───────────────────────────────────────────────────────
function riskColor(posture: PolicyPreset['riskPosture']): string {
  if (posture === 'CONSERVATIVE') return S.green;
  if (posture === 'AGGRESSIVE')   return S.red;
  return S.amber;
}

// ── Recommendation Card ───────────────────────────────────────────────────────
function RecommendationCard({ rec, selected, onSelect, isFallback }: {
  rec: AIPolicyRecommendation;
  selected: boolean;
  onSelect: () => void;
  isFallback: boolean;
}) {
  const p = rec.preset;
  return (
    <div
      onClick={onSelect}
      style={{
        flex: '1 1 0', minWidth: 200,
        border: `1.5px solid ${selected ? S.cyan : S.border}`,
        background: selected ? `color-mix(in srgb, ${S.cyan} 6%, ${S.bgPanel})` : S.bgSub,
        cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 0,
        transition: 'border-color 0.15s',
        borderRadius: 3,
        overflow: 'hidden',
      }}
    >
      {/* Card header */}
      <div style={{ padding: '10px 14px', background: selected ? `color-mix(in srgb, ${S.cyan} 10%, ${S.bgDeep})` : S.bgDeep, borderBottom: `1px solid ${S.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontFamily: S.fontMono, fontSize: '0.4375rem', letterSpacing: '0.1em', color: selected ? S.cyan : S.tertiary, fontWeight: 700 }}>
            {rec.label}{isFallback && rec.label === 'AI Custom' ? ' (PRESET)' : ''}
          </span>
          <span style={{ fontFamily: S.fontMono, fontSize: '0.4375rem', padding: '1px 5px', borderRadius: 2, background: `color-mix(in srgb, ${riskColor(p.riskPosture)} 12%, transparent)`, color: riskColor(p.riskPosture), letterSpacing: '0.06em' }}>
            {p.riskPosture}
          </span>
        </div>
        <div style={{ marginTop: 4, fontFamily: S.fontUI, fontSize: '0.8125rem', fontWeight: 600, color: S.primary }}>{p.name}</div>
        <div style={{ fontFamily: S.fontMono, fontSize: '0.4375rem', color: S.tertiary, letterSpacing: '0.05em', marginTop: 2 }}>{p.shortName} · {p.category}</div>
      </div>

      {/* Policy parameters */}
      <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {[
            { label: 'CONFIRMED', value: `${Math.round(p.policy.hedge_ratios.confirmed * 100)}%` },
            { label: 'FORECAST',  value: `${Math.round(p.policy.hedge_ratios.forecast  * 100)}%` },
            { label: 'SPREAD',    value: `${p.policy.cost_assumptions.spread_bps} bps` },
            { label: 'PRODUCT',   value: p.policy.execution_product },
          ].map(({ label, value }) => (
            <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <span style={{ fontFamily: S.fontMono, fontSize: '0.4rem', letterSpacing: '0.08em', color: S.tertiary }}>{label}</span>
              <span style={{ fontFamily: S.fontMono, fontSize: '0.625rem', fontWeight: 700, color: S.primary }}>{value}</span>
            </div>
          ))}
        </div>
        <p style={{ fontFamily: S.fontUI, fontSize: '0.625rem', color: S.secondary, lineHeight: 1.5, margin: '4px 0 0', flexGrow: 1 }}>
          {rec.rationale.slice(0, 160)}{rec.rationale.length > 160 ? '…' : ''}
        </p>
      </div>

      {/* Selected indicator */}
      {selected && (
        <div style={{ padding: '6px 14px', background: `color-mix(in srgb, ${S.cyan} 12%, transparent)`, borderTop: `1px solid ${S.border}`, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Check size={10} color={S.cyan} />
          <span style={{ fontFamily: S.fontMono, fontSize: '0.4375rem', color: S.cyan, letterSpacing: '0.06em' }}>SELECTED</span>
        </div>
      )}
    </div>
  );
}

// ── Step progress indicator ───────────────────────────────────────────────────
function StepBar({ current, total }: { current: number; total: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      {Array.from({ length: total }, (_, i) => (
        <div key={i} style={{
          height: 3, flex: 1, borderRadius: 2,
          background: i < current ? S.cyan : i === current ? `color-mix(in srgb, ${S.cyan} 40%, transparent)` : S.borderSoft,
          transition: 'background 0.2s',
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
  const isAdmin = user?.roles?.some(r => ['admin', 'cfo', 'ceo'].includes(r)) ?? false;

  const [step, setStep]             = useState(0);
  const [answers, setAnswers]       = useState<WizardAnswers>(EMPTY_ANSWERS);
  const [aiResult, setAiResult]     = useState<AIPolicyResult | null>(null);
  const [aiLoading, setAiLoading]   = useState(false);
  const [aiError, setAiError]       = useState('');
  const [selectedIdx, setSelectedIdx] = useState<number>(0);
  const [policyName, setPolicyName] = useState('');
  const [policyTag, setPolicyTag]   = useState('');
  const [publishCompany, setPublishCompany] = useState(false);
  const [saving, setSaving]         = useState(false);
  const [saved, setSaved]           = useState(false);
  const [saveError, setSaveError]   = useState('');

  const set = <K extends keyof WizardAnswers>(key: K, value: WizardAnswers[K]) =>
    setAnswers(a => ({ ...a, [key]: value }));

  const handleClose = () => {
    setStep(0); setAnswers(EMPTY_ANSWERS); setAiResult(null);
    setAiLoading(false); setAiError(''); setSelectedIdx(0);
    setPolicyName(''); setPolicyTag(''); setSaved(false); setSaveError('');
    onClose();
  };

  // ── Step navigation ────────────────────────────────────────────────────────

  const goNext = useCallback(async () => {
    if (step < TOTAL_STEPS - 2) {
      setStep(s => s + 1);
    } else if (step === TOTAL_STEPS - 2) {
      // Move to step 5 (AI results) — trigger AI call
      setStep(TOTAL_STEPS - 1);
      setAiLoading(true); setAiError(''); setAiResult(null); setSelectedIdx(0);
      try {
        const result = await suggestPolicyAI({
          industry: answers.industry || 'Manufacturing',
          company_size: answers.company_size,
          annual_fx_volume_usd: answers.annual_fx_volume_usd || 1000000,
          primary_currency_pair: answers.primary_currency_pair || 'USD/MXN',
          cash_flow_predictability: answers.cash_flow_predictability,
          risk_appetite: answers.risk_appetite,
          cost_sensitivity: answers.cost_sensitivity,
          time_horizon_months: answers.time_horizon_months,
          hedge_objective: answers.hedge_objective,
        });
        setAiResult(result);
        setPolicyName(result.suggested.name);
        setPolicyTag(result.suggested.shortName.toLowerCase());
      } catch (e: unknown) {
        setAiError(`AI analysis failed: ${String(e)}`);
      } finally {
        setAiLoading(false);
      }
    }
  }, [step, answers]);

  const goBack = useCallback(() => {
    if (step > 0) setStep(s => s - 1);
  }, [step]);

  // ── Save policy ────────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (!aiResult || !policyName.trim()) return;
    const recs = aiResult.recommendations;
    const selected = recs[selectedIdx] ?? recs[0];
    setSaving(true); setSaveError('');
    try {
      const tmpl = await createPolicyTemplate({
        name: policyName.trim(),
        short_name: (policyTag.trim() || policyName.trim().slice(0, 6)).toUpperCase(),
        description: selected.rationale.slice(0, 200),
        risk_posture: selected.preset.riskPosture,
        category: selected.preset.category,
        config: selected.preset.policy,
      }, token);
      setSaved(true);
      onSaved?.(tmpl);
    } catch (e: unknown) {
      setSaveError(`Save failed: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }, [aiResult, selectedIdx, policyName, policyTag, token, onSaved]);

  const handleApply = useCallback(() => {
    if (!aiResult) return;
    const recs = aiResult.recommendations;
    const selected = recs[selectedIdx] ?? recs[0];
    onApply?.(selected.preset.policy);
    handleClose();
  }, [aiResult, selectedIdx, onApply, handleClose]);

  // ── Render steps ───────────────────────────────────────────────────────────

  const renderStep = () => {
    switch (step) {
      // ── STEP 1: Business Profile ──────────────────────────────────────────
      case 0:
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={{ fontFamily: S.fontUI, fontSize: '0.8125rem', color: S.secondary, margin: 0, lineHeight: 1.6 }}>
              Tell us about your business to help us tailor the hedge policy recommendation.
            </p>
            <div>
              <FieldLabel label="INDUSTRY" />
              <select value={answers.industry} onChange={e => set('industry', e.target.value)} style={selectStyle}>
                <option value="">Select industry…</option>
                {INDUSTRY_OPTIONS.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
            <div>
              <FieldLabel label="COMPANY SIZE" hint="helps calibrate minimum trade sizes" />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
                {(['MICRO', 'SMALL', 'MEDIUM', 'LARGE', 'ENTERPRISE'] as const).map(s => (
                  <ChoiceButton key={s} label={s} selected={answers.company_size === s} onClick={() => set('company_size', s)} />
                ))}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <FieldLabel label="ANNUAL FX VOLUME (USD)" hint="approximate" />
                <input type="number" min={0} style={inputStyle} value={answers.annual_fx_volume_usd || ''} onChange={e => set('annual_fx_volume_usd', +e.target.value)} placeholder="e.g. 5000000" />
              </div>
              <div>
                <FieldLabel label="PRIMARY CURRENCY PAIR" />
                <input type="text" style={inputStyle} value={answers.primary_currency_pair} onChange={e => set('primary_currency_pair', e.target.value)} placeholder="e.g. USD/MXN" />
              </div>
            </div>
          </div>
        );

      // ── STEP 2: Cash Flow Characteristics ────────────────────────────────
      case 1:
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={{ fontFamily: S.fontUI, fontSize: '0.8125rem', color: S.secondary, margin: 0, lineHeight: 1.6 }}>
              Describe the nature and predictability of your foreign currency cash flows.
            </p>
            <div>
              <FieldLabel label="CASH FLOW PREDICTABILITY" hint="how certain are your FX flows?" />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                {([
                  { v: 'LOW',    d: 'Highly variable, hard to forecast' },
                  { v: 'MEDIUM', d: 'Somewhat predictable with seasonal variation' },
                  { v: 'HIGH',   d: 'Highly predictable, contracted orders' },
                ] as const).map(({ v, d }) => (
                  <ChoiceButton key={v} label={v} desc={d} selected={answers.cash_flow_predictability === v} onClick={() => set('cash_flow_predictability', v)} />
                ))}
              </div>
            </div>
            <div>
              <FieldLabel label="PAYMENT FREQUENCY" />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                {(['WEEKLY', 'MONTHLY', 'QUARTERLY', 'IRREGULAR'] as const).map(f => (
                  <ChoiceButton key={f} label={f} selected={answers.payment_frequency === f} onClick={() => set('payment_frequency', f)} />
                ))}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <FieldLabel label="AVG TRANSACTION SIZE (USD)" />
                <input type="number" min={0} style={inputStyle} value={answers.avg_transaction_size_usd || ''} onChange={e => set('avg_transaction_size_usd', +e.target.value)} placeholder="e.g. 250000" />
              </div>
              <div>
                <FieldLabel label="CONFIRMED / FORECAST RATIO" hint="0.0–1.0" />
                <input type="number" min={0} max={1} step={0.05} style={inputStyle} value={answers.confirmed_to_forecast_ratio} onChange={e => set('confirmed_to_forecast_ratio', +e.target.value)} />
                <span style={{ fontFamily: S.fontMono, fontSize: '0.5rem', color: S.tertiary, marginTop: 3, display: 'block' }}>
                  {Math.round(answers.confirmed_to_forecast_ratio * 100)}% confirmed, {Math.round((1 - answers.confirmed_to_forecast_ratio) * 100)}% forecast
                </span>
              </div>
            </div>
          </div>
        );

      // ── STEP 3: Risk & Cost Preferences ──────────────────────────────────
      case 2:
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={{ fontFamily: S.fontUI, fontSize: '0.8125rem', color: S.secondary, margin: 0, lineHeight: 1.6 }}>
              Define your organization's risk tolerance and acceptable hedging costs.
            </p>
            <div>
              <FieldLabel label="RISK APPETITE" hint="how much FX volatility can your P&L absorb?" />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                {([
                  { v: 'CONSERVATIVE', d: 'Maximize protection, accept higher hedge cost' },
                  { v: 'MODERATE',     d: 'Balance protection vs cost efficiency' },
                  { v: 'AGGRESSIVE',   d: 'Minimize hedge cost, accept FX exposure' },
                ] as const).map(({ v, d }) => (
                  <ChoiceButton key={v} label={v} desc={d} selected={answers.risk_appetite === v} onClick={() => set('risk_appetite', v)} />
                ))}
              </div>
            </div>
            <div>
              <FieldLabel label="COST SENSITIVITY" hint="how important is minimizing hedge transaction cost?" />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                {([
                  { v: 'LOW',    d: 'Cost is secondary to risk reduction' },
                  { v: 'MEDIUM', d: 'Balance cost and coverage' },
                  { v: 'HIGH',   d: 'Minimize cost, tighten spreads' },
                ] as const).map(({ v, d }) => (
                  <ChoiceButton key={v} label={v} desc={d} selected={answers.cost_sensitivity === v} onClick={() => set('cost_sensitivity', v)} />
                ))}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <FieldLabel label="MAX HEDGE COST (% OF NOTIONAL)" hint="e.g. 1.0 = 1%" />
                <input type="number" min={0} max={10} step={0.1} style={inputStyle} value={answers.max_hedge_cost_pct} onChange={e => set('max_hedge_cost_pct', +e.target.value)} />
              </div>
              <div>
                <FieldLabel label="HEDGE TIME HORIZON (MONTHS)" />
                <select value={answers.time_horizon_months} onChange={e => set('time_horizon_months', +e.target.value)} style={selectStyle}>
                  {[3, 6, 9, 12, 18, 24, 36].map(m => <option key={m} value={m}>{m} months</option>)}
                </select>
              </div>
            </div>
          </div>
        );

      // ── STEP 4: Objectives & Constraints ─────────────────────────────────
      case 3:
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={{ fontFamily: S.fontUI, fontSize: '0.8125rem', color: S.secondary, margin: 0, lineHeight: 1.6 }}>
              Define your primary hedge objectives and any board-mandated constraints.
            </p>
            <div>
              <FieldLabel label="PRIMARY HEDGE OBJECTIVE" hint="what does hedging need to achieve?" />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
                {[
                  'P&L stability and earnings protection',
                  'Budget certainty for planning purposes',
                  'Cash flow matching for debt service',
                  'Regulatory compliance and reporting',
                ].map(obj => (
                  <ChoiceButton key={obj} label={obj} selected={answers.hedge_objective === obj} onClick={() => set('hedge_objective', obj)} />
                ))}
              </div>
              <textarea
                value={answers.hedge_objective}
                onChange={e => set('hedge_objective', e.target.value)}
                placeholder="Or describe your objective in detail…"
                rows={2}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </div>
            <div>
              <FieldLabel label="INSTRUMENT EXCLUSIONS" hint="instruments you cannot or prefer not to use" />
              <div style={{ display: 'flex', gap: 12 }}>
                {[
                  { key: 'exclude_ndf' as const, label: 'Exclude NDFs' },
                  { key: 'exclude_fwd' as const, label: 'Exclude FWDs' },
                ].map(({ key, label }) => (
                  <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontFamily: S.fontUI, fontSize: '0.8125rem', color: S.secondary }}>
                    <input type="checkbox" checked={answers[key]} onChange={e => set(key, e.target.checked)} style={{ accentColor: S.cyan }} />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <FieldLabel label="BOARD-MANDATED CONSTRAINTS (optional)" hint="any specific policy requirements from governance" />
              <textarea
                value={answers.board_constraints}
                onChange={e => set('board_constraints', e.target.value)}
                placeholder="e.g. Must hedge at least 70% of confirmed flows per board resolution FX-2024-03"
                rows={3}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </div>
          </div>
        );

      // ── STEP 5: AI Recommendations ────────────────────────────────────────
      case 4:
        if (aiLoading) {
          return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, minHeight: 200 }}>
              <Sparkles size={28} color={S.cyan} style={{ animation: 'spin 2s linear infinite' }} />
              <div style={{ fontFamily: S.fontMono, fontSize: '0.625rem', color: S.cyan, letterSpacing: '0.1em' }}>ANALYZING YOUR PROFILE…</div>
              <p style={{ fontFamily: S.fontUI, fontSize: '0.75rem', color: S.secondary, textAlign: 'center', maxWidth: 320 }}>
                Our AI is generating tailored hedge policy recommendations based on your inputs.
              </p>
            </div>
          );
        }

        if (aiError) {
          return (
            <div style={{ padding: '20px 0', textAlign: 'center' }}>
              <p style={{ fontFamily: S.fontMono, fontSize: '0.625rem', color: S.red, letterSpacing: '0.06em' }}>{aiError}</p>
              <button type="button" onClick={() => { setStep(3); }} style={{ fontFamily: S.fontMono, fontSize: '0.5625rem', padding: '4px 14px', border: `1px solid ${S.border}`, color: S.secondary, background: 'transparent', cursor: 'pointer', marginTop: 12 }}>
                ← Back to Objectives
              </button>
            </div>
          );
        }

        if (!aiResult) return null;

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Sparkles size={14} color={S.cyan} />
              <span style={{ fontFamily: S.fontMono, fontSize: '0.5rem', letterSpacing: '0.08em', color: S.cyan }}>
                {aiResult.fallback ? 'PRESET MATCHED' : 'AI RECOMMENDATIONS'} — SELECT ONE
              </span>
            </div>

            {/* 3 recommendation cards */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
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
            <div style={{ borderTop: `1px solid ${S.border}`, paddingTop: 16, display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
              <div>
                <FieldLabel label="POLICY NAME *" hint="descriptive name for this policy" />
                <input type="text" value={policyName} onChange={e => setPolicyName(e.target.value)} placeholder="e.g. Q1 2026 Conservative Hedge" style={inputStyle} />
              </div>
              <div>
                <FieldLabel label="TAG" hint="short tag for quick reference" />
                <input type="text" value={policyTag} onChange={e => setPolicyTag(e.target.value)} placeholder="e.g. q1-2026" style={inputStyle} maxLength={20} />
              </div>
            </div>

            {/* Admin publish option */}
            {isAdmin && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={publishCompany} onChange={e => setPublishCompany(e.target.checked)} style={{ accentColor: S.amber }} />
                <span style={{ fontFamily: S.fontUI, fontSize: '0.8125rem', color: S.secondary }}>
                  Publish company-wide (admin)
                </span>
                <span style={{ fontFamily: S.fontMono, fontSize: '0.4375rem', color: S.amber, padding: '1px 5px', border: `1px solid ${S.amber}`, letterSpacing: '0.06em' }}>ADMIN</span>
              </label>
            )}

            {/* Save/apply buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              {saved ? (
                <span style={{ fontFamily: S.fontMono, fontSize: '0.5625rem', color: S.green, letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Check size={12} /> POLICY SAVED
                </span>
              ) : (
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving || !policyName.trim()}
                  style={{ fontFamily: S.fontMono, fontSize: '0.5625rem', letterSpacing: '0.06em', fontWeight: 700, padding: '5px 16px', border: `1px solid ${policyName.trim() ? S.amber : S.border}`, color: policyName.trim() ? S.amber : S.tertiary, background: policyName.trim() ? `color-mix(in srgb, ${S.amber} 8%, transparent)` : 'transparent', cursor: saving || !policyName.trim() ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <Save size={11} />
                  {saving ? 'SAVING…' : 'SAVE POLICY'}
                </button>
              )}
              <button
                type="button"
                onClick={handleApply}
                style={{ fontFamily: S.fontMono, fontSize: '0.5625rem', letterSpacing: '0.06em', fontWeight: 700, padding: '5px 16px', border: `1px solid ${S.cyan}`, color: S.cyan, background: `color-mix(in srgb, ${S.cyan} 8%, transparent)`, cursor: 'pointer' }}
              >
                ⚡ APPLY TO SESSION
              </button>
              {saveError && <span style={{ fontFamily: S.fontMono, fontSize: '0.5rem', color: S.red }}>{saveError}</span>}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  const stepTitles = [
    'Business Profile',
    'Cash Flow Characteristics',
    'Risk & Cost Preferences',
    'Objectives & Constraints',
    'AI Recommendations',
  ];

  const isLastBeforeAI = step === TOTAL_STEPS - 2;
  const isAIStep       = step === TOTAL_STEPS - 1;
  const canProceed     = step === 0 ? !!answers.industry : true;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={`Policy Wizard — ${stepTitles[step]}`}
      subtitle={`Step ${step + 1} of ${TOTAL_STEPS}`}
      width="lg"
      footer={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <StepBar current={step} total={TOTAL_STEPS} />
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            {step > 0 && !isAIStep && (
              <button
                type="button"
                onClick={goBack}
                style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: S.fontMono, fontSize: '0.5625rem', letterSpacing: '0.06em', padding: '5px 14px', border: `1px solid ${S.border}`, color: S.secondary, background: 'transparent', cursor: 'pointer' }}
              >
                <ChevronLeft size={12} /> BACK
              </button>
            )}
            {!isAIStep && (
              <button
                type="button"
                onClick={goNext}
                disabled={!canProceed}
                style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: S.fontMono, fontSize: '0.5625rem', letterSpacing: '0.06em', fontWeight: 700, padding: '5px 18px', border: `1px solid ${canProceed ? S.cyan : S.border}`, color: canProceed ? S.cyan : S.tertiary, background: canProceed ? `color-mix(in srgb, ${S.cyan} 8%, transparent)` : 'transparent', cursor: canProceed ? 'pointer' : 'not-allowed' }}
              >
                {isLastBeforeAI ? (
                  <><Sparkles size={11} /> ANALYZE WITH AI</>
                ) : (
                  <>NEXT <ChevronRight size={12} /></>
                )}
              </button>
            )}
            {isAIStep && (
              <button
                type="button"
                onClick={handleClose}
                style={{ fontFamily: S.fontMono, fontSize: '0.5625rem', letterSpacing: '0.06em', padding: '5px 14px', border: `1px solid ${S.border}`, color: S.secondary, background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
              >
                <X size={11} /> CLOSE
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
