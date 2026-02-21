"use client";

/**
 * PolicyAIBuilder.tsx
 * 3-step questionnaire wizard that uses Claude (via /api/policy-ai) to generate
 * a tailored PolicyConfig for the user's specific company.
 *
 * Steps:
 *   1 — Company Profile (industry, size, volume, predictability, objective)
 *   2 — Risk Preferences (risk appetite, cost sensitivity, time horizon)
 *   3 — AI Result (loading → suggested policy card → apply / save CTAs)
 *
 * Props:
 *   onApply(config)   — populate PolicyForm for this session
 *   onSave(preset)    — call createPolicyTemplate() and persist to DB
 *   onClose()         — collapse/dismiss the wizard
 *   token             — JWT for DB save
 */

import { useState } from "react";
import { Sparkles, ChevronRight, ChevronLeft, Check, X, Save, Zap } from "lucide-react";
import {
  suggestPolicyAI,
  createPolicyTemplate,
  type AIPolicyResult,
  type QuestionnaireAnswers,
} from "@/api/policyClient";
import type { PolicyConfig } from "@/api/types";

// ── Design tokens ─────────────────────────────────────────────────────────────
const S = {
  fontUI:        "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono:      "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  bgDeep:        "var(--bg-deep)",
  bgPanel:       "var(--bg-panel)",
  bgSurface:     "var(--bg-surface,var(--bg-sub))",
  border:        "var(--border-rim)",
  borderSoft:    "var(--border-soft)",
  textPrimary:   "var(--text-primary)",
  textSecondary: "var(--text-secondary)",
  textTertiary:  "var(--text-tertiary)",
  cyan:          "var(--accent-cyan,#22d3ee)",
  amber:         "var(--accent-amber,#fbbf24)",
  green:         "var(--accent-green,#34d399)",
  red:           "var(--accent-red,#f87171)",
  purple:        "#a78bfa",
};

// ── Industry options ──────────────────────────────────────────────────────────
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

// ── Props ─────────────────────────────────────────────────────────────────────
interface PolicyAIBuilderProps {
  onApply:  (config: PolicyConfig) => void;
  onClose:  () => void;
  token?:   string;
}

// ── Wizard state ──────────────────────────────────────────────────────────────
type WizardStep = 1 | 2 | 3;
type WizardStatus = "idle" | "generating" | "done" | "error" | "saved";

const DEFAULT_ANSWERS: QuestionnaireAnswers = {
  industry:                  "",
  company_size:              "MEDIUM",
  annual_fx_volume_usd:      1000000,
  primary_currency_pair:     "USD/MXN",
  cash_flow_predictability:  "MEDIUM",
  risk_appetite:             "MODERATE",
  cost_sensitivity:          "MEDIUM",
  time_horizon_months:       6,
  hedge_objective:           "",
};

// ── Sub-components ────────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      fontFamily: S.fontMono, fontSize: 9, fontWeight: 600,
      letterSpacing: "0.08em", color: S.textTertiary,
      textTransform: "uppercase" as const, display: "block", marginBottom: 5,
    }}>
      {children}
    </span>
  );
}

function Select({
  value, onChange, options, placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        fontFamily: S.fontMono, fontSize: 11, color: S.textPrimary,
        background: S.bgPanel, border: `1px solid ${S.border}`, borderRadius: 3,
        padding: "6px 8px", width: "100%", outline: "none",
      }}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

function RadioGroup({
  value, onChange, options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; desc?: string }[];
}) {
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            style={{
              flex: 1, fontFamily: S.fontMono, fontSize: 10, fontWeight: active ? 700 : 400,
              color: active ? S.cyan : S.textSecondary,
              background: active ? `${S.cyan}12` : "transparent",
              border: `1px solid ${active ? S.cyan : S.border}`,
              borderRadius: 3, padding: "6px 4px", cursor: "pointer",
              textAlign: "center" as const, transition: "all 100ms",
            }}
            title={o.desc}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function PolicyParamChip({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column" as const, gap: 2,
      padding: "6px 10px", background: S.bgDeep, border: `1px solid ${S.border}`,
      borderRadius: 3, minWidth: 80,
    }}>
      <span style={{ fontFamily: S.fontMono, fontSize: 8, color: S.textTertiary, letterSpacing: "0.07em", textTransform: "uppercase" as const }}>{label}</span>
      <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.cyan }}>{value}</span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PolicyAIBuilder({ onApply, onClose, token }: PolicyAIBuilderProps) {
  const [step,    setStep]    = useState<WizardStep>(1);
  const [answers, setAnswers] = useState<QuestionnaireAnswers>(DEFAULT_ANSWERS);
  const [status,  setStatus]  = useState<WizardStatus>("idle");
  const [result,  setResult]  = useState<AIPolicyResult | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  const set = <K extends keyof QuestionnaireAnswers>(
    key: K, value: QuestionnaireAnswers[K],
  ) => setAnswers((prev) => ({ ...prev, [key]: value }));

  const canProceed1 = answers.industry.trim() !== "" && answers.hedge_objective.trim() !== "";
  const canProceed2 = answers.time_horizon_months >= 1;

  async function handleGenerate() {
    setStep(3);
    setStatus("generating");
    try {
      const res = await suggestPolicyAI(answers);
      setResult(res);
      setStatus("done");
    } catch (err: unknown) {
      console.error("[PolicyAIBuilder] generate failed:", err);
      setStatus("error");
    }
  }

  async function handleSave() {
    if (!result || !token) return;
    setSaveErr(null);
    try {
      await createPolicyTemplate({
        name:         result.suggested.name,
        short_name:   result.suggested.shortName,
        description:  result.suggested.description,
        risk_posture: result.suggested.riskPosture,
        category:     result.suggested.category,
        config:       result.suggested.policy,
      }, token);
      setStatus("saved");
    } catch (err: unknown) {
      setSaveErr(err instanceof Error ? err.message : "Save failed");
    }
  }

  function handleApply() {
    if (result) {
      onApply(result.suggested.policy);
      onClose();
    }
  }

  return (
    <div style={{
      background: S.bgPanel, border: `1px solid ${S.cyan}33`,
      borderLeft: `3px solid ${S.cyan}`, borderRadius: 6,
      padding: 0, overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "10px 14px", background: S.bgSurface,
        borderBottom: `1px solid ${S.border}`,
      }}>
        <Sparkles size={13} style={{ color: S.cyan, flexShrink: 0 }} />
        <span style={{
          fontFamily: S.fontMono, fontSize: 11, fontWeight: 700,
          letterSpacing: "0.08em", color: S.textPrimary, textTransform: "uppercase" as const,
        }}>
          AI Policy Builder
        </span>
        {/* Step indicators */}
        <div style={{ display: "flex", gap: 5, marginLeft: 8 }}>
          {([1, 2, 3] as WizardStep[]).map((s) => (
            <div key={s} style={{
              width: 18, height: 18, borderRadius: "50%", display: "flex",
              alignItems: "center", justifyContent: "center",
              fontFamily: S.fontMono, fontSize: 9, fontWeight: 700,
              background: step >= s ? `${S.cyan}20` : "transparent",
              border: `1px solid ${step >= s ? S.cyan : S.border}`,
              color: step >= s ? S.cyan : S.textTertiary,
            }}>
              {step > s ? <Check size={10} /> : s}
            </div>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.textTertiary }}>
          {step === 1 ? "Company Profile" : step === 2 ? "Risk Preferences" : "AI Analysis"}
        </span>
        <button
          type="button"
          onClick={onClose}
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: S.textTertiary, padding: 2, display: "flex", alignItems: "center",
          }}
          title="Close AI Builder"
        >
          <X size={13} />
        </button>
      </div>

      {/* Body */}
      <div style={{ padding: "16px 14px" }}>

        {/* ── Step 1: Company Profile ── */}
        {step === 1 && (
          <div style={{ display: "flex", flexDirection: "column" as const, gap: 14 }}>
            <div>
              <Label>Industry</Label>
              <select
                value={answers.industry}
                onChange={(e) => set("industry", e.target.value)}
                style={{
                  fontFamily: S.fontMono, fontSize: 11, color: S.textPrimary,
                  background: S.bgPanel, border: `1px solid ${S.border}`,
                  borderRadius: 3, padding: "6px 8px", width: "100%",
                }}
              >
                <option value="">— Select industry —</option>
                {INDUSTRY_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>

            <div>
              <Label>Company Size</Label>
              <RadioGroup
                value={answers.company_size}
                onChange={(v) => set("company_size", v as QuestionnaireAnswers["company_size"])}
                options={[
                  { value: "MICRO",      label: "Micro",      desc: "< $1M annual revenue" },
                  { value: "SMALL",      label: "Small",      desc: "$1M–$10M" },
                  { value: "MEDIUM",     label: "Medium",     desc: "$10M–$100M" },
                  { value: "LARGE",      label: "Large",      desc: "$100M–$1B" },
                  { value: "ENTERPRISE", label: "Enterprise", desc: "> $1B" },
                ]}
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <Label>Annual FX Volume (USD)</Label>
                <input
                  type="number"
                  min={0}
                  step={100000}
                  value={answers.annual_fx_volume_usd}
                  onChange={(e) => set("annual_fx_volume_usd", Math.max(0, +e.target.value || 0))}
                  style={{
                    fontFamily: S.fontMono, fontSize: 11, color: S.textPrimary,
                    background: S.bgPanel, border: `1px solid ${S.border}`,
                    borderRadius: 3, padding: "6px 8px", width: "100%",
                  }}
                />
              </div>
              <div>
                <Label>Primary Currency Pair</Label>
                <input
                  type="text"
                  placeholder="e.g. USD/MXN"
                  value={answers.primary_currency_pair}
                  onChange={(e) => set("primary_currency_pair", e.target.value.toUpperCase())}
                  style={{
                    fontFamily: S.fontMono, fontSize: 11, color: S.textPrimary,
                    background: S.bgPanel, border: `1px solid ${S.border}`,
                    borderRadius: 3, padding: "6px 8px", width: "100%",
                  }}
                />
              </div>
            </div>

            <div>
              <Label>Cash Flow Predictability</Label>
              <RadioGroup
                value={answers.cash_flow_predictability}
                onChange={(v) => set("cash_flow_predictability", v as QuestionnaireAnswers["cash_flow_predictability"])}
                options={[
                  { value: "LOW",    label: "Low",    desc: "Highly variable — difficult to forecast" },
                  { value: "MEDIUM", label: "Medium", desc: "Moderate visibility — quarterly forecasts" },
                  { value: "HIGH",   label: "High",   desc: "Predictable — contracted or recurring" },
                ]}
              />
            </div>

            <div>
              <Label>Hedge Objective</Label>
              <textarea
                placeholder="e.g. Protect import margins, lock in budget rate for capex, reduce MXN payroll cost volatility..."
                value={answers.hedge_objective}
                onChange={(e) => set("hedge_objective", e.target.value)}
                rows={2}
                style={{
                  fontFamily: S.fontUI, fontSize: 11, color: S.textPrimary,
                  background: S.bgPanel, border: `1px solid ${S.border}`,
                  borderRadius: 3, padding: "6px 8px", width: "100%",
                  resize: "vertical" as const, outline: "none",
                }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setStep(2)}
                disabled={!canProceed1}
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  fontFamily: S.fontMono, fontSize: 10, fontWeight: 700,
                  letterSpacing: "0.06em", color: canProceed1 ? S.cyan : S.textTertiary,
                  background: canProceed1 ? `${S.cyan}15` : "transparent",
                  border: `1px solid ${canProceed1 ? S.cyan : S.border}`,
                  borderRadius: 3, padding: "7px 14px", cursor: canProceed1 ? "pointer" : "not-allowed",
                  opacity: canProceed1 ? 1 : 0.5, transition: "all 120ms",
                }}
              >
                Next <ChevronRight size={12} />
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2: Risk Preferences ── */}
        {step === 2 && (
          <div style={{ display: "flex", flexDirection: "column" as const, gap: 14 }}>
            <div>
              <Label>Risk Appetite</Label>
              <RadioGroup
                value={answers.risk_appetite}
                onChange={(v) => set("risk_appetite", v as QuestionnaireAnswers["risk_appetite"])}
                options={[
                  { value: "CONSERVATIVE", label: "Conservative", desc: "Protect all exposures; accept lower upside" },
                  { value: "MODERATE",     label: "Moderate",     desc: "Balance cost certainty and market participation" },
                  { value: "AGGRESSIVE",   label: "Aggressive",   desc: "Active positioning; accept FX volatility" },
                ]}
              />
            </div>

            <div>
              <Label>Cost Sensitivity</Label>
              <RadioGroup
                value={answers.cost_sensitivity}
                onChange={(v) => set("cost_sensitivity", v as QuestionnaireAnswers["cost_sensitivity"])}
                options={[
                  { value: "HIGH",   label: "High",   desc: "Spread cost is a critical factor — minimise it" },
                  { value: "MEDIUM", label: "Medium", desc: "Acceptable at market rates" },
                  { value: "LOW",    label: "Low",    desc: "Coverage priority — cost is secondary" },
                ]}
              />
            </div>

            <div>
              <Label>Hedge Time Horizon (months): {answers.time_horizon_months}</Label>
              <input
                type="range"
                min={1}
                max={36}
                step={1}
                value={answers.time_horizon_months}
                onChange={(e) => set("time_horizon_months", +e.target.value)}
                style={{ width: "100%", accentColor: S.cyan }}
              />
              <div style={{
                display: "flex", justifyContent: "space-between",
                fontFamily: S.fontMono, fontSize: 9, color: S.textTertiary, marginTop: 2,
              }}>
                <span>1 month</span>
                <span>12 months</span>
                <span>36 months</span>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <button
                type="button"
                onClick={() => setStep(1)}
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  fontFamily: S.fontMono, fontSize: 10,
                  color: S.textSecondary, background: "transparent",
                  border: `1px solid ${S.border}`,
                  borderRadius: 3, padding: "7px 14px", cursor: "pointer",
                }}
              >
                <ChevronLeft size={12} /> Back
              </button>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={!canProceed2}
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  fontFamily: S.fontMono, fontSize: 10, fontWeight: 700,
                  letterSpacing: "0.06em", color: canProceed2 ? S.cyan : S.textTertiary,
                  background: canProceed2 ? `${S.cyan}15` : "transparent",
                  border: `1px solid ${canProceed2 ? S.cyan : S.border}`,
                  borderRadius: 3, padding: "7px 14px", cursor: canProceed2 ? "pointer" : "not-allowed",
                  opacity: canProceed2 ? 1 : 0.5, transition: "all 120ms",
                }}
              >
                <Sparkles size={11} /> Analyse &amp; Generate
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: AI Result ── */}
        {step === 3 && (
          <div style={{ display: "flex", flexDirection: "column" as const, gap: 14 }}>

            {/* Loading */}
            {status === "generating" && (
              <div style={{
                display: "flex", flexDirection: "column" as const, alignItems: "center",
                gap: 10, padding: "24px 0",
              }}>
                <Sparkles size={22} style={{ color: S.cyan, opacity: 0.8 }} />
                <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.textSecondary }}>
                  Analysing your company profile…
                </span>
                <span style={{ fontFamily: S.fontUI, fontSize: 10, color: S.textTertiary }}>
                  Generating tailored hedge policy
                </span>
              </div>
            )}

            {/* Error */}
            {status === "error" && (
              <div style={{ padding: "16px", textAlign: "center" as const }}>
                <span style={{ fontFamily: S.fontUI, fontSize: 11, color: S.red }}>
                  Analysis failed. Please try again.
                </span>
              </div>
            )}

            {/* Result */}
            {(status === "done" || status === "saved") && result && (
              <>
                {/* Mode badge */}
                {result.fallback && (
                  <div style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "5px 10px", background: `${S.amber}12`,
                    border: `1px solid ${S.amber}44`, borderRadius: 3,
                  }}>
                    <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.amber, letterSpacing: "0.06em" }}>
                      NEAREST MATCH — AI key not configured; closest preset selected
                    </span>
                  </div>
                )}
                {!result.fallback && (
                  <div style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "5px 10px", background: `${S.cyan}12`,
                    border: `1px solid ${S.cyan}44`, borderRadius: 3,
                  }}>
                    <Sparkles size={10} style={{ color: S.cyan }} />
                    <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.cyan, letterSpacing: "0.06em" }}>
                      AI-GENERATED — tailored to your profile
                    </span>
                  </div>
                )}

                {/* Policy name + description */}
                <div>
                  <div style={{ fontFamily: S.fontMono, fontSize: 13, fontWeight: 700, color: S.textPrimary }}>
                    {result.suggested.name}
                  </div>
                  <div style={{ fontFamily: S.fontUI, fontSize: 11, color: S.textSecondary, marginTop: 4, lineHeight: 1.5 }}>
                    {result.suggested.description}
                  </div>
                </div>

                {/* Policy parameters */}
                <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 6 }}>
                  <PolicyParamChip
                    label="Confirmed"
                    value={`${(result.suggested.policy.hedge_ratios.confirmed * 100).toFixed(0)}%`}
                  />
                  <PolicyParamChip
                    label="Forecast"
                    value={`${(result.suggested.policy.hedge_ratios.forecast * 100).toFixed(0)}%`}
                  />
                  <PolicyParamChip
                    label="Spread"
                    value={`${result.suggested.policy.cost_assumptions.spread_bps} bps`}
                  />
                  <PolicyParamChip
                    label="Product"
                    value={result.suggested.policy.execution_product}
                  />
                  <PolicyParamChip
                    label="Min Trade"
                    value={
                      result.suggested.policy.min_trade_size_usd === 0
                        ? "None"
                        : `$${(result.suggested.policy.min_trade_size_usd / 1000).toFixed(0)}k`
                    }
                  />
                  <PolicyParamChip
                    label="Risk"
                    value={result.suggested.riskPosture}
                  />
                </div>

                {/* Rationale */}
                <div style={{
                  padding: "10px 12px", background: S.bgDeep,
                  border: `1px solid ${S.border}`, borderRadius: 3,
                }}>
                  <div style={{ fontFamily: S.fontMono, fontSize: 8, color: S.textTertiary, letterSpacing: "0.07em", textTransform: "uppercase" as const, marginBottom: 5 }}>
                    Rationale
                  </div>
                  <div style={{ fontFamily: S.fontUI, fontSize: 11, color: S.textSecondary, lineHeight: 1.6 }}>
                    {result.explanation}
                  </div>
                </div>

                {/* Save error */}
                {saveErr && (
                  <div style={{ fontFamily: S.fontUI, fontSize: 10, color: S.red }}>{saveErr}</div>
                )}

                {/* Saved confirmation */}
                {status === "saved" && (
                  <div style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "7px 12px", background: `${S.green}12`,
                    border: `1px solid ${S.green}44`, borderRadius: 3,
                  }}>
                    <Check size={11} style={{ color: S.green }} />
                    <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.green, letterSpacing: "0.06em" }}>
                      SAVED — policy template created in your company account
                    </span>
                  </div>
                )}

                {/* CTAs */}
                <div style={{ display: "flex", gap: 8, paddingTop: 4 }}>
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    style={{
                      fontFamily: S.fontMono, fontSize: 10, color: S.textSecondary,
                      background: "transparent", border: `1px solid ${S.border}`,
                      borderRadius: 3, padding: "7px 12px", cursor: "pointer",
                    }}
                  >
                    ← Refine
                  </button>
                  <div style={{ flex: 1 }} />
                  {token && status !== "saved" && (
                    <button
                      type="button"
                      onClick={handleSave}
                      style={{
                        display: "flex", alignItems: "center", gap: 5,
                        fontFamily: S.fontMono, fontSize: 10, fontWeight: 600,
                        letterSpacing: "0.06em", color: S.purple,
                        background: `${S.purple}12`, border: `1px solid ${S.purple}55`,
                        borderRadius: 3, padding: "7px 12px", cursor: "pointer",
                        transition: "all 120ms",
                      }}
                    >
                      <Save size={11} /> Save as My Policy
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleApply}
                    style={{
                      display: "flex", alignItems: "center", gap: 5,
                      fontFamily: S.fontMono, fontSize: 10, fontWeight: 700,
                      letterSpacing: "0.06em", color: S.cyan,
                      background: `${S.cyan}18`, border: `1px solid ${S.cyan}`,
                      borderRadius: 3, padding: "7px 14px", cursor: "pointer",
                      transition: "all 120ms",
                    }}
                  >
                    <Zap size={11} /> Apply to Session
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
