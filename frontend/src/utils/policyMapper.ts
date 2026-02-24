/**
 * policyMapper.ts
 *
 * Bridge functions between wizard UI state and the canonical policy object.
 *
 * Two entry points feed the same canonical model:
 *   - PolicyWizardModal  → WizardAnswers (modal schema, 14 fields)
 *   - ai-policy-wizard   → WizardState   (page schema, 21 fields)
 *
 * Both paths call the same POST /api/policy-ai endpoint, which accepts
 * QuestionnaireAnswers.  The mapping functions here normalize both schemas
 * into QuestionnaireAnswers before the AI call, then assemble the full
 * CanonicalPolicy from the AI result.
 */

import type { CanonicalPolicy, RiskPosture, CompanySize, CashFlowPredictability, PaymentFrequency } from '../types/canonicalPolicy';
import type { AIPolicyResult, AIPolicyRecommendation } from '../app/api/policy-ai/route';
import type { QuestionnaireAnswers } from '../app/api/policy-ai/route';
import { makeCreatedAuditEntry } from '../types/canonicalPolicy';

// ─────────────────────────────────────────────────────────────────────────────
// WizardState (from ai-policy-wizard/page.tsx)
// ─────────────────────────────────────────────────────────────────────────────

export interface WizardState {
  // ── PHASE A: Intent & Scope ──────────────────────────────────────────────
  // A.1 — Policy Intent Classification
  primaryObjective: string;
  regulatoryRegimes: string[];     // IFRS9, ASC815, MiFID2, Basel3, etc.
  boardResolutionRef: string;      // e.g. "FX-2025-003"
  boardStatement: string;
  effectiveFrom: string;           // ISO date
  effectiveUntil: string;          // ISO date
  reviewDueDate: string;           // ISO date
  // A.2 — Portfolio Scope & Currency Universe
  companyType: string;
  industrySector: string;
  annualExposure: string;          // categorical tier e.g. "$50-250M"
  primaryCurrency: string;
  fxCorridors: string[];
  portfolioScope: string;          // CONSOLIDATED | SINGLE_ACCOUNT | MULTI_ACCOUNT | BRANCH_LEVEL
  extendedFlowTypes: string[];     // RECEIVABLE, PAYABLE, INTERCOMPANY, BALANCE_SHEET, DIVIDEND, DEBT_SERVICE
  geographyFocus: string[];        // EM_LATAM, EM_ASIA, EM_EMEA, G10, ALL
  // A.3 — Time Horizon Architecture
  hedgeExperience: string;
  averageTenor: string;
  timeHorizonMonths: number;       // 1–36
  rollingHedge: boolean;
  rollingTenor: string;
  layeredApproach: boolean;

  // ── PHASE B: Exposure & Bucketing ───────────────────────────────────────
  // B.1 — Exposure Classification
  cashFlowVisibility: string;
  cashFlowCertainty: number;       // 0–100 slider
  receivableSplit: number;         // 0–100 slider
  seasonalPatterns: string;
  paymentFrequency: string;        // MONTHLY | QUARTERLY | SEMI_ANNUAL | ANNUAL | IRREGULAR
  avgTransactionSizeUsd: number;
  hasIntercompanyFlows: boolean;
  // B.2 — Netting Rules
  nettingAvailable: boolean;
  netConfirmedForecast: boolean;
  settlementCycleDays: number;     // 1–5
  // B.3 — Materiality Thresholds
  materialityThresholdUsd: number;
  minHedgeSizeUsd: number;
  maxSingleTradeUsd: number;

  // ── PHASE C: Instruments & Eligibility ──────────────────────────────────
  instrumentPreferences: string[];
  // Per-instrument constraints (7 instruments)
  instrAllowed: Record<string, boolean>;
  instrMaxTenorDays: Record<string, number>;
  instrRequiresApproval: Record<string, boolean>;
  instrMaxNotionalUsd: Record<string, number>;
  // C.3 — Tenor ladder
  tenorMinDays: number;
  tenorMaxDays: number;
  rollAllowed: boolean;
  rollWindowDays: number;          // days before expiry

  // ── PHASE D: Constraints & Budgets ──────────────────────────────────────
  // D.1 — Cost & Carry Budget
  premiumBudget: number;           // 0–3 (% of notional)
  maxCarryCostBpsAnnual: number;
  maxOptionPremiumPct: number;
  maxSpreadBps: number;
  // D.2 — Leverage & Margin
  leverageCap: number;             // 1.0–10.0
  marginBudgetUsd: number;
  // D.3 — Concentration Limits
  maxInstrumentConcentrationPct: number;
  maxCounterpartyConcentrationPct: number;
  maxTenorConcentrationPct: number;
  maxCurrencyConcentrationPct: number;
  // D.4 — Risk Controls
  costProtectionPriority: number;  // 0–100 slider
  maxAcceptableLoss: string;

  // ── PHASE E: Scenarios & Stress ─────────────────────────────────────────
  standardStressPack: string;      // MILD | MODERATE | SEVERE | TAIL | CUSTOM
  varConfidence: string;           // "90%", "95%", "99%", "99.5%"
  drawdownTolerance: string;
  backTestWindowDays: number;
  worstCaseFocus: boolean;
  customScenarios: Array<{
    name: string;
    spotShockPct: number;
    volShockPct: number;
    sourceEvent: string;
  }>;
  governanceNotes: string;

  // ── PHASE F/G: Governance & Publish ─────────────────────────────────────
  ifrsCompliance: boolean;
  benchmark: string;
  hedgeRatioTarget: number;        // 0–100 slider
  policyStatus: string;            // DRAFT | REVIEW | APPROVED
}

// ─────────────────────────────────────────────────────────────────────────────
// WizardAnswers (from PolicyWizardModal)
// ─────────────────────────────────────────────────────────────────────────────

export interface WizardAnswers {
  industry: string;
  company_size: CompanySize;
  annual_fx_volume_usd: number;
  primary_currency_pair: string;
  cash_flow_predictability: CashFlowPredictability;
  payment_frequency: PaymentFrequency;
  avg_transaction_size_usd: number;
  has_confirmed_orders: boolean;
  confirmed_to_forecast_ratio: number;
  risk_appetite: RiskPosture;
  cost_sensitivity: 'LOW' | 'MEDIUM' | 'HIGH';
  max_hedge_cost_pct: number;
  time_horizon_months: number;
  hedge_objective: string;
  exclude_ndf: boolean;
  exclude_fwd: boolean;
  board_constraints: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalization helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Map exposure tier string to midpoint USD value */
const EXPOSURE_TIER_TO_USD: Record<string, number> = {
  '<$1M':      500_000,
  '$1-10M':    5_000_000,
  '$10-50M':   25_000_000,
  '$50-250M':  100_000_000,
  '$250M-1B':  500_000_000,
  '>$1B':      2_000_000_000,
};

/** Map USD volume to company size enum */
function volumeToCompanySize(vol: number): CompanySize {
  if (vol < 1_000_000)   return 'MICRO';
  if (vol < 10_000_000)  return 'SMALL';
  if (vol < 50_000_000)  return 'MEDIUM';
  if (vol < 250_000_000) return 'LARGE';
  return 'ENTERPRISE';
}

/** Map certainty slider (0–100) to predictability enum */
function certaintyToPredictability(v: number): CashFlowPredictability {
  if (v < 35) return 'LOW';
  if (v < 70) return 'MEDIUM';
  return 'HIGH';
}

/** Map cost/protection priority slider (0–100) to risk appetite enum
 *  0–35  = cost-focused   = AGGRESSIVE
 *  35–65 = balanced       = MODERATE
 *  65–100 = protection    = CONSERVATIVE
 */
function priorityToRiskAppetite(v: number): RiskPosture {
  if (v < 35) return 'AGGRESSIVE';
  if (v < 65) return 'MODERATE';
  return 'CONSERVATIVE';
}

/** Map premium budget slider (0–3%) to cost sensitivity enum */
function budgetToCostSensitivity(v: number): 'LOW' | 'MEDIUM' | 'HIGH' {
  if (v < 0.5) return 'HIGH';
  if (v < 1.5) return 'MEDIUM';
  return 'LOW';
}

/** Map average tenor string to months */
const TENOR_TO_MONTHS: Record<string, number> = {
  Spot: 1, '1M': 1, '3M': 3, '6M': 6, '12M': 12, '18M+': 18,
};

/** Parse VaR confidence string to number */
function parseVarConfidence(s: string): number {
  return parseFloat(s.replace('%', '')) || 95;
}

// ─────────────────────────────────────────────────────────────────────────────
// Map WizardState (page) → QuestionnaireAnswers (for AI call)
// ─────────────────────────────────────────────────────────────────────────────

export function mapWizardStateToQA(state: WizardState): QuestionnaireAnswers {
  const vol = EXPOSURE_TIER_TO_USD[state.annualExposure] ?? 0;

  const primary_currency_pair =
    state.fxCorridors[0] ??
    (state.primaryCurrency ? `USD/${state.primaryCurrency}` : 'USD/MXN');

  // Derive time horizon: prefer explicit timeHorizonMonths, fall back to averageTenor
  const time_horizon = state.timeHorizonMonths > 0
    ? state.timeHorizonMonths
    : (TENOR_TO_MONTHS[state.averageTenor] ?? 6);

  return {
    // Core 9 fields
    industry:                  state.industrySector || state.companyType || 'Manufacturing',
    company_size:              volumeToCompanySize(vol),
    annual_fx_volume_usd:      vol,
    primary_currency_pair,
    cash_flow_predictability:  certaintyToPredictability(state.cashFlowCertainty),
    risk_appetite:             priorityToRiskAppetite(state.costProtectionPriority),
    cost_sensitivity:          budgetToCostSensitivity(state.premiumBudget),
    time_horizon_months:       time_horizon,
    hedge_objective:           state.primaryObjective || 'Budget certainty and P&L protection.',
    // Extended fields — full wizard context for AI accuracy
    ifrs_compliance:           state.ifrsCompliance || state.regulatoryRegimes?.includes('IFRS9'),
    instrument_preferences:    state.instrumentPreferences,
    rolling_hedge:             state.rollingHedge,
    hedge_ratio_target:        state.hedgeRatioTarget / 100, // slider 0–100 → ratio 0–1
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Map WizardAnswers (modal) → QuestionnaireAnswers (for AI call)
// ─────────────────────────────────────────────────────────────────────────────

export function mapModalAnswersToQA(a: WizardAnswers): QuestionnaireAnswers {
  return {
    industry:                 a.industry || 'Manufacturing',
    company_size:             a.company_size,
    annual_fx_volume_usd:     a.annual_fx_volume_usd || 1_000_000,
    primary_currency_pair:    a.primary_currency_pair || 'USD/MXN',
    cash_flow_predictability: a.cash_flow_predictability,
    risk_appetite:            a.risk_appetite,
    cost_sensitivity:         a.cost_sensitivity,
    time_horizon_months:      a.time_horizon_months,
    hedge_objective:          a.hedge_objective,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Build CanonicalPolicy from WizardState (page) + AI result
// ─────────────────────────────────────────────────────────────────────────────

export function buildCanonicalFromPageState(
  state: WizardState,
  aiResult: AIPolicyResult,
  selectedRec: AIPolicyRecommendation,
  userId: string,
  companyId: string,
  policyName: string,
  policyTag: string,
): CanonicalPolicy {
  const preset = selectedRec.preset;
  const vol    = EXPOSURE_TIER_TO_USD[state.annualExposure] ?? 0;

  const regulatory_flags: string[] = [];
  if (state.ifrsCompliance) regulatory_flags.push('IFRS9', 'ASC815');
  if (state.regulatoryRegimes?.length) {
    for (const r of state.regulatoryRegimes) {
      if (!regulatory_flags.includes(r)) regulatory_flags.push(r);
    }
  }

  return {
    schema_version: '1.0',
    version:        1,
    short_name:     policyTag.toUpperCase() || preset.shortName,
    display_name:   policyName              || preset.name,
    description:    preset.description,
    status:         'DRAFT',

    provenance: {
      source:             'AI_WIZARD',
      entry_point:        'AI_POLICY_PAGE',
      created_by:         userId,
      created_at:         new Date().toISOString(),
      ai_model:           aiResult.fallback ? undefined : 'claude-haiku-4-5',
      ai_confidence:      aiResult.fallback ? 70 : 87,
      preset_basis:       aiResult.nearest_preset_name,
    },

    scope: {
      company_id:    companyId,
      branch_ids:    'ALL',
      currency_pairs: state.fxCorridors.length > 0
        ? state.fxCorridors
        : (state.primaryCurrency ? [`USD/${state.primaryCurrency}`] : []),
      flow_types:    ['CONFIRMED', 'FORECAST'],
    },

    classification: {
      risk_posture:    preset.riskPosture,
      category:        preset.category,
      target_audience: preset.targetAudience,
      industry_sector: state.industrySector || state.companyType,
      company_size:    volumeToCompanySize(vol),
    },

    business_profile: {
      company_type:                state.companyType,
      annual_fx_volume_usd:        vol,
      primary_currency:            state.primaryCurrency,
      primary_currency_pair:       state.fxCorridors[0] ?? `USD/${state.primaryCurrency}`,
      fx_corridors:                state.fxCorridors,
      hedge_experience:            state.hedgeExperience,
      cash_flow_visibility:        state.cashFlowVisibility,
      cash_flow_certainty:         state.cashFlowCertainty,
      cash_flow_predictability:    certaintyToPredictability(state.cashFlowCertainty),
      confirmed_to_forecast_ratio: state.cashFlowCertainty / 100,
      receivable_split:            state.receivableSplit,
      seasonal_patterns:           state.seasonalPatterns,
      average_tenor:               state.averageTenor,
      netting_available:           state.nettingAvailable,
    },

    risk_parameters: {
      risk_appetite:             priorityToRiskAppetite(state.costProtectionPriority),
      cost_sensitivity:          budgetToCostSensitivity(state.premiumBudget),
      max_acceptable_loss:       state.maxAcceptableLoss,
      max_hedge_cost_pct:        state.premiumBudget,
      var_confidence:            parseVarConfidence(state.varConfidence),
      drawdown_tolerance:        state.drawdownTolerance,
      cost_protection_priority:  state.costProtectionPriority,
      time_horizon_months:       TENOR_TO_MONTHS[state.averageTenor] ?? 6,
      premium_budget_pct:        state.premiumBudget,
    },

    objectives: {
      primary_objective:      state.primaryObjective,
      board_statement:        state.boardStatement,
      hedge_ratio_target:     state.hedgeRatioTarget,
      rolling_hedge:          state.rollingHedge,
      rolling_tenor:          state.rollingTenor,
      ifrs_compliance:        state.ifrsCompliance || state.regulatoryRegimes?.includes('IFRS9') || false,
      benchmark:              state.benchmark,
      instrument_preferences: state.instrumentPreferences,
      exclude_ndf:            !state.instrumentPreferences.includes('NDFs') && !state.instrumentPreferences.includes('NDF'),
      exclude_fwd:            !state.instrumentPreferences.includes('Forwards') && !state.instrumentPreferences.includes('Forward'),
    },

    execution_config: preset.policy,

    formula: preset.formula ? {
      notation:      preset.formula,
      plain_english: preset.formulaExplain ?? '',
      rationale:     selectedRec.rationale,
    } : undefined,

    governance: {
      requires_approval: false,
      regulatory_flags:  regulatory_flags.length > 0 ? regulatory_flags : undefined,
    },

    audit_log: [
      makeCreatedAuditEntry(
        userId,
        `Created via AI Policy Wizard (page) — selected "${selectedRec.label}" recommendation (${preset.shortName})`,
      ),
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Build CanonicalPolicy from WizardAnswers (modal) + AI result
// ─────────────────────────────────────────────────────────────────────────────

export function buildCanonicalFromModalAnswers(
  answers: WizardAnswers,
  aiResult: AIPolicyResult,
  selectedRec: AIPolicyRecommendation,
  userId: string,
  companyId: string,
  policyName: string,
  policyTag: string,
): CanonicalPolicy {
  const preset = selectedRec.preset;

  return {
    schema_version: '1.0',
    version:        1,
    short_name:     (policyTag.trim() || preset.shortName).toUpperCase(),
    display_name:   policyName.trim() || preset.name,
    description:    preset.description,
    status:         'DRAFT',

    provenance: {
      source:         'AI_WIZARD',
      entry_point:    'POLICY_WIZARD_MODAL',
      created_by:     userId,
      created_at:     new Date().toISOString(),
      ai_model:       aiResult.fallback ? undefined : 'claude-haiku-4-5',
      ai_confidence:  aiResult.fallback ? 70 : 87,
      preset_basis:   aiResult.nearest_preset_name,
    },

    scope: {
      company_id:    companyId,
      branch_ids:    'ALL',
      currency_pairs: [answers.primary_currency_pair].filter(Boolean),
      flow_types:    ['CONFIRMED', 'FORECAST'],
    },

    classification: {
      risk_posture:    preset.riskPosture,
      category:        preset.category,
      target_audience: preset.targetAudience,
      industry_sector: answers.industry,
      company_size:    answers.company_size,
    },

    business_profile: {
      annual_fx_volume_usd:        answers.annual_fx_volume_usd,
      primary_currency_pair:       answers.primary_currency_pair,
      cash_flow_predictability:    answers.cash_flow_predictability,
      confirmed_to_forecast_ratio: answers.confirmed_to_forecast_ratio,
      payment_frequency:           answers.payment_frequency,
      avg_transaction_size_usd:    answers.avg_transaction_size_usd,
    },

    risk_parameters: {
      risk_appetite:    answers.risk_appetite,
      cost_sensitivity: answers.cost_sensitivity,
      max_hedge_cost_pct: answers.max_hedge_cost_pct,
      time_horizon_months: answers.time_horizon_months,
    },

    objectives: {
      primary_objective:   answers.hedge_objective,
      hedge_objective_text: answers.hedge_objective,
      board_statement:     answers.board_constraints,
      exclude_ndf:         answers.exclude_ndf,
      exclude_fwd:         answers.exclude_fwd,
    },

    execution_config: preset.policy,

    formula: preset.formula ? {
      notation:      preset.formula,
      plain_english: preset.formulaExplain ?? '',
      rationale:     aiResult.explanation,
    } : undefined,

    governance: {
      requires_approval: false,
    },

    audit_log: [
      makeCreatedAuditEntry(
        userId,
        `Created via Policy Wizard Modal — selected "${selectedRec.label}" recommendation (${preset.shortName})`,
      ),
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Build CreateTemplatePayload from CanonicalPolicy (for policyClient)
// ─────────────────────────────────────────────────────────────────────────────

import type { CreateTemplatePayload } from '../api/policyClient';

/**
 * Convert a CanonicalPolicy into the payload accepted by createPolicyTemplate().
 * This bridges the canonical model to the existing backend API.
 *
 * The backend POST /api/v1/policies/templates accepts 6 fields.
 * company_id is derived server-side from the JWT bearer token.
 * Wizard-only metadata (status, provenance, governance) is encoded
 * into the description as a structured suffix so it survives the round-trip.
 */
export function toCreateTemplatePayload(
  canonical: CanonicalPolicy,
): CreateTemplatePayload {
  // Build a structured metadata suffix that survives the description field
  const meta: Record<string, string> = {
    status:      canonical.status ?? 'DRAFT',
    created_by:  canonical.provenance?.created_by ?? 'unknown',
    created_at:  canonical.provenance?.created_at ?? new Date().toISOString(),
    source:      canonical.provenance?.source ?? 'AI_WIZARD',
  };
  if (canonical.provenance?.ai_model) {
    meta['ai_model'] = canonical.provenance.ai_model;
    meta['ai_confidence'] = String(canonical.provenance.ai_confidence ?? 0);
  }
  if (canonical.governance?.requires_approval) {
    meta['requires_approval'] = 'true';
  }
  if (canonical.scope?.company_id && canonical.scope.company_id !== 'unknown') {
    meta['scope_company_id'] = canonical.scope.company_id;
  }

  // Append as a machine-readable suffix separated by a sentinel
  const metaSuffix = '\n\n[ORDR_META:' + Object.entries(meta).map(([k, v]) => `${k}=${v}`).join(';') + ']';
  const baseDescription = canonical.description ?? '';
  const description = baseDescription + metaSuffix;

  return {
    name:         canonical.display_name,
    short_name:   canonical.short_name,
    description,
    risk_posture:  canonical.classification.risk_posture,
    category:      canonical.classification.category,
    config:        canonical.execution_config,
  };
}
