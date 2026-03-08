/**
 * canonicalPolicy.ts
 *
 * Single source-of-truth type for ORDR Terminal FX hedge policies.
 *
 * DESIGN PRINCIPLES
 * ─────────────────
 * 1. Both entry points (PolicyWizardModal and ai-policy-wizard/page) write
 *    the same CanonicalPolicy object — no divergence.
 * 2. `execution_config` is the ONLY section consumed by the calculation
 *    engine. It maps 1-to-1 with the existing PolicyConfig from api/types.ts.
 * 3. All other sections are governance metadata: audit-ready, versionable,
 *    defensible to bank risk committees and external auditors.
 * 4. The object is immutable once status reaches APPROVED. Any edit creates
 *    a new version with parent_id pointing to the previous version.
 *
 * v1.0 — ORDR Terminal Policy Engine
 */

import type { PolicyConfig } from '../api/types';

// ─────────────────────────────────────────────────────────────────────────────
// Sub-types
// ─────────────────────────────────────────────────────────────────────────────

export type PolicyStatus =
  | 'DRAFT'
  | 'REVIEW'
  | 'APPROVED'
  | 'ACTIVE'
  | 'ARCHIVED';

export type RiskPosture = 'CONSERVATIVE' | 'MODERATE' | 'AGGRESSIVE';
export type PolicyCategory = 'CORPORATE' | 'FINANCIAL' | 'SOVEREIGN' | 'SECTOR';
export type CompanySize = 'MICRO' | 'SMALL' | 'MEDIUM' | 'LARGE' | 'ENTERPRISE';
export type CashFlowPredictability = 'LOW' | 'MEDIUM' | 'HIGH';
export type PaymentFrequency = 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'IRREGULAR';

export type AuditAction =
  | 'CREATED'
  | 'UPDATED'
  | 'STATUS_CHANGED'
  | 'ACTIVATED'
  | 'DEACTIVATED'
  | 'CLONED'
  | 'APPROVED'
  | 'REJECTED';

export interface AuditLogEntry {
  timestamp: string;            // ISO 8601 UTC
  actor_id: string;             // user_id
  action: AuditAction;
  field_diffs?: { field: string; old_value: unknown; new_value: unknown }[];
  comment?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Canonical Policy Interface
// ─────────────────────────────────────────────────────────────────────────────

export interface CanonicalPolicy {

  // ── 1. IDENTITY & VERSION LINEAGE ─────────────────────────────────────────
  schema_version: '1.0';
  /** UUID assigned on first save. Null while in DRAFT before first persist. */
  policy_id?: string;
  /** UUID of policy this was cloned/derived from. */
  parent_id?: string | null;
  /** Monotonically increasing integer per policy lineage (1, 2, 3…). */
  version: number;
  /** 4–8 uppercase chars, unique per company. E.g. "BLNC-Q1". */
  short_name: string;
  /** Human-readable name, max 60 chars. */
  display_name: string;
  /** 1–3 sentence description for the policy card grid. */
  description: string;
  status: PolicyStatus;

  // ── 2. PROVENANCE ─────────────────────────────────────────────────────────
  provenance: {
    source: 'AI_WIZARD' | 'PRESET_ACTIVATION' | 'MANUAL_EDIT' | 'API_IMPORT';
    entry_point:
      | 'POLICY_WIZARD_MODAL'
      | 'AI_POLICY_PAGE'
      | 'API'
      | 'ADMIN_CONSOLE';
    created_by: string;           // user_id
    created_at: string;           // ISO 8601 UTC
    approved_by?: string;
    approved_at?: string;
    /** Model used for AI recommendations, e.g. "claude-haiku-4-5" */
    ai_model?: string;
    /** 0–100 confidence score from AI or preset scoring function */
    ai_confidence?: number;
    /** short_name of the preset this policy was derived from */
    preset_basis?: string;
    /** SHA-256 of the WizardAnswers JSON submitted to the AI */
    questionnaire_hash?: string;
  };

  // ── 3. APPLICABILITY SCOPE ────────────────────────────────────────────────
  scope: {
    company_id: string;
    /** "ALL" = company-wide; array of branch UUIDs otherwise */
    branch_ids: string[] | 'ALL';
    /** Empty array = all currency pairs */
    currency_pairs: string[];
    flow_types: ('CONFIRMED' | 'FORECAST')[];
    /** ISO 8601 date. Null = effective immediately. */
    effective_from?: string;
    /** ISO 8601 date. Null = perpetual. */
    effective_until?: string;
    /** Suppress policy application below this notional threshold (USD) */
    min_notional_usd?: number;
    /** Cap. Null = unlimited. */
    max_notional_usd?: number;
  };

  // ── 4. CLASSIFICATION ─────────────────────────────────────────────────────
  classification: {
    risk_posture: RiskPosture;
    category: PolicyCategory;
    /** E.g. "Mid-cap manufacturer with EM exposure" */
    target_audience: string;
    industry_sector?: string;
    company_size?: CompanySize;
  };

  // ── 5. BUSINESS PROFILE (Steps 1–2 of wizard) ────────────────────────────
  business_profile: {
    /** Manufacturer / Exporter / Importer / Services / Conglomerate / Financial */
    company_type?: string;
    /** Annual FX notional in USD */
    annual_fx_volume_usd?: number;
    /** Functional currency, e.g. "MXN" */
    primary_currency?: string;
    /** Primary traded currency pair, e.g. "USD/MXN" */
    primary_currency_pair?: string;
    /** All currency pairs with FX exposure, e.g. ["USD/MXN", "EUR/MXN"] */
    fx_corridors?: string[];
    /** None / Basic / Intermediate / Advanced */
    hedge_experience?: string;
    /** Forward-looking horizon, e.g. "12 months" */
    cash_flow_visibility?: string;
    /** 0–100 slider value */
    cash_flow_certainty?: number;
    /** Normalized enum for AI prompt */
    cash_flow_predictability?: CashFlowPredictability;
    /** Fraction of FX flows that are contractually confirmed (0.0–1.0) */
    confirmed_to_forecast_ratio?: number;
    /** 0–100: percentage of flows that are receivables (rest = payables) */
    receivable_split?: number;
    /** None / Quarterly / Semi-annual / Annual / Custom */
    seasonal_patterns?: string;
    /** Spot / 1M / 3M / 6M / 12M / 18M+ */
    average_tenor?: string;
    netting_available?: boolean;
    payment_frequency?: PaymentFrequency;
    avg_transaction_size_usd?: number;
  };

  // ── 6. RISK & COST PARAMETERS (Step 3 of wizard) ─────────────────────────
  risk_parameters: {
    risk_appetite: RiskPosture;
    cost_sensitivity: 'LOW' | 'MEDIUM' | 'HIGH';
    /** E.g. "2%", "5%", "Unlimited" */
    max_acceptable_loss?: string;
    /** Maximum hedge premium as % of notional, e.g. 1.0 = 1% */
    max_hedge_cost_pct?: number;
    /** VaR confidence level as integer, e.g. 95 (for 95%) */
    var_confidence?: number;
    /** E.g. "Low (<2%)", "Medium (2-5%)" */
    drawdown_tolerance?: string;
    /** 0 = pure cost savings, 100 = maximum protection */
    cost_protection_priority?: number;
    time_horizon_months?: number;
    /** Premium budget as % of notional (slider 0–3) */
    premium_budget_pct?: number;
  };

  // ── 7. OBJECTIVES & CONSTRAINTS (Step 4 of wizard) ───────────────────────
  objectives: {
    /** E.g. "Budget certainty", "P&L stability" */
    primary_objective: string;
    /** Free-text override / supplement to primary_objective */
    hedge_objective_text?: string;
    /** Board risk appetite statement */
    board_statement?: string;
    /** Reference to board resolution, e.g. "FX-2024-03" */
    board_resolution_ref?: string;
    /** Advisory target (does not override AI output). 0–100%. */
    hedge_ratio_target?: number;
    rolling_hedge?: boolean;
    /** E.g. "3M", "6M" */
    rolling_tenor?: string;
    /** IFRS 9 / ASC 815 hedge accounting compliance required */
    ifrs_compliance?: boolean;
    /** E.g. "Budget Rate", "Spot at Inception", "Forward Rate" */
    benchmark?: string;
    /** E.g. ["Forwards", "Vanilla Options", "Collars"] */
    instrument_preferences?: string[];
    exclude_ndf?: boolean;
    exclude_fwd?: boolean;
  };

  // ── 8. EXECUTION CONFIG — ENGINE-BINDING ──────────────────────────────────
  /**
   * This section is the PolicyConfig from src/api/types.ts.
   * It is the ONLY section consumed by POST /api/v1/calculate.
   * All other sections are metadata / context.
   * Use toPolicyConfig() to extract this for the calculation engine.
   */
  execution_config: PolicyConfig;

  // ── 8b. NETTING POLICY ───────────────────────────────────────────────────
  netting_policy?: {
    enabled: boolean;
    net_confirmed_forecast: boolean;
    settlement_cycle_days: number;
  };

  // ── 8c. INSTRUMENT POLICY ──────────────────────────────────────────────
  instrument_policy?: {
    allowed_types: string[];
    max_tenor_days: Record<string, number>;
    requires_approval: Record<string, boolean>;
    max_notional_usd: Record<string, number>;
  };

  // ── 8d. SCENARIO POLICY ───────────────────────────────────────────────
  scenario_policy?: {
    stress_pack: string;
    var_confidence: number;
    drawdown_tolerance_pct: number;
    custom_scenarios: Array<{
      name: string;
      spotShockPct: number;
      volShockPct: number;
      sourceEvent: string;
    }>;
  };

  // ── 8e. GOVERNANCE DEPTH ──────────────────────────────────────────────
  governance_tier?: string;
  maturity_profile?: string;
  accounting_mode?: string;

  // ── 9. FORMULA & EXPLANATION ──────────────────────────────────────────────
  formula?: {
    /** Mathematical notation string (LaTeX-compatible) */
    notation: string;
    /** Non-technical explanation for treasury team */
    plain_english: string;
    /** 2–3 sentence rationale from AI or analyst */
    rationale: string;
  };

  // ── 10. INSTRUMENT ALLOCATION (from AI Step 5 recommendations) ────────────
  instrument_allocation?: {
    instrument: string;           // "Forwards", "Collars", "NDFs", etc.
    weight_pct: number;           // 0–100; weights should sum to 100
    rationale?: string;
  }[];

  // ── 11. GOVERNANCE & DISCLOSURES ──────────────────────────────────────────
  governance: {
    /** If true, policy must pass REVIEW → APPROVED before activation */
    requires_approval: boolean;
    /** Number of approver signatures required */
    approval_quorum?: number;
    /** user_ids authorized to approve this policy */
    approvers?: string[];
    /** How often the policy should be reviewed, in days (e.g. 90 = quarterly) */
    review_frequency_days?: number;
    /** Risk disclosure statement for audit documentation */
    disclosure_text?: string;
    /** E.g. ["IFRS9", "ASC815", "MiFID2", "Basel3"] */
    regulatory_flags?: string[];
  };

  // ── 12. AUDIT TRAIL (append-only, embedded in policy object) ──────────────
  /**
   * Events are appended — never removed or overwritten.
   * The first entry is always action: "CREATED".
   */
  audit_log: AuditLogEntry[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract the engine-binding execution config from a canonical policy.
 * This is what POST /api/v1/calculate accepts as the `policy` field.
 */
export function toPolicyConfig(canonical: CanonicalPolicy): PolicyConfig {
  return canonical.execution_config;
}

/**
 * Validate a canonical policy object.
 * Returns a list of validation errors (empty = valid).
 */
export function validateCanonicalPolicy(
  policy: CanonicalPolicy,
): string[] {
  const errors: string[] = [];

  // Identity
  if (!policy.short_name || policy.short_name.length < 2) {
    errors.push('short_name must be at least 2 characters');
  }
  if (!policy.display_name || policy.display_name.length < 3) {
    errors.push('display_name must be at least 3 characters');
  }

  // Execution config — binding validation
  const ec = policy.execution_config;
  if (!ec) {
    errors.push('execution_config is required');
  } else {
    const conf = ec.hedge_ratios?.confirmed;
    const fcst = ec.hedge_ratios?.forecast;
    if (conf === undefined || conf < 0 || conf > 1) {
      errors.push('execution_config.hedge_ratios.confirmed must be 0.0–1.0');
    }
    if (fcst === undefined || fcst < 0 || fcst > 1) {
      errors.push('execution_config.hedge_ratios.forecast must be 0.0–1.0');
    }
    if (fcst !== undefined && conf !== undefined && fcst > conf) {
      errors.push(
        'forecast hedge ratio should not exceed confirmed hedge ratio (hedge accounting convention)',
      );
    }
    const spread = ec.cost_assumptions?.spread_bps;
    if (spread === undefined || spread < 0.5 || spread > 50) {
      errors.push('execution_config.cost_assumptions.spread_bps must be 0.5–50 bps');
    }
    if (!['NDF', 'FWD'].includes(ec.execution_product)) {
      errors.push('execution_config.execution_product must be "NDF" or "FWD"');
    }
    if (ec.min_trade_size_usd < 0) {
      errors.push('execution_config.min_trade_size_usd must be ≥ 0');
    }
  }

  // Risk parameters
  if (!policy.risk_parameters?.risk_appetite) {
    errors.push('risk_parameters.risk_appetite is required');
  }

  // Objectives
  if (!policy.objectives?.primary_objective) {
    errors.push('objectives.primary_objective is required');
  }

  // Scope
  if (!policy.scope?.company_id) {
    errors.push('scope.company_id is required');
  }

  // Provenance
  if (!policy.provenance?.created_by) {
    errors.push('provenance.created_by is required');
  }

  // Audit log
  if (!policy.audit_log || policy.audit_log.length === 0) {
    errors.push('audit_log must have at least one entry (CREATED)');
  }

  return errors;
}

/**
 * Create a minimal CREATED audit log entry.
 */
export function makeCreatedAuditEntry(
  actorId: string,
  comment?: string,
): AuditLogEntry {
  return {
    timestamp: new Date().toISOString(),
    actor_id: actorId,
    action: 'CREATED',
    comment,
  };
}

/**
 * Append an audit event to a canonical policy (returns new object — immutable).
 */
export function appendAuditEvent(
  policy: CanonicalPolicy,
  entry: Omit<AuditLogEntry, 'timestamp'>,
): CanonicalPolicy {
  return {
    ...policy,
    audit_log: [
      ...policy.audit_log,
      { ...entry, timestamp: new Date().toISOString() },
    ],
  };
}
