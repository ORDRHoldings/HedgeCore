# ORDR Terminal — FX Hedge Policy Engine
## Comprehensive Policy Engineering Document
### Version 1.0 | February 2026
### Classification: INTERNAL — RESTRICTED

---

# SECTION 1: DIAGNOSIS

## 1.1 The Four Failure Modes of Disconnected Policy Flows

The ORDR Terminal historically maintained two independent entry points for hedge policy creation: the `PolicyWizardModal` (modal overlay) and the `ai-policy-wizard` page. Each entry point maintained its own schema, its own normalization path, and its own mapping logic to the calculation engine. This architectural pattern produces four categories of systemic failure, each with quantifiable downstream consequences.

### Failure Mode 1: Data Drift

Data drift occurs when two entry points collect semantically identical information under different field names, different data types, or different normalization functions — and each path independently computes a `PolicyConfig` for the engine. The ORDR system exhibited this in the following ways:

The modal (`WizardAnswers`) collected `annual_fx_volume_usd` as a raw numeric field (e.g., `5000000`). The page (`WizardState`) collected `annualExposure` as a categorical tier string (e.g., `"$1-10M"`) that was subsequently resolved by `EXPOSURE_TIER_TO_USD` to a midpoint estimate (`5_000_000`). Both paths ultimately wrote `annual_fx_volume_usd` to `business_profile`, but the modal's value was exact while the page's value was an approximation with up to ±40% error at tier boundaries (a $9.9M company in the `"$1-10M"` tier is assigned $5M — a 49.5% understatement). This drift propagates to the `QuestionnaireAnswers.annual_fx_volume_usd` field, which the AI uses to scale hedge ratios and minimum trade sizes. A 49% understatement in reported annual volume can cause the AI to select a retail-tier preset when an institutional-tier preset is appropriate, directly affecting `min_trade_size_usd` (e.g., selecting `small-business` at `min_trade_size_usd: $0` vs. `conservative-treasury` at `min_trade_size_usd: $100,000`).

Quantified impact: A mid-market manufacturing exporter with $45M annual FX exposure assigned to the `"$10-50M"` tier receives midpoint estimate $25M. This triggers a `MODERATE` risk-posture preset rather than `CONSERVATIVE`. The forecast hedge ratio difference between these postures is 0.25 (50% vs. 25%). On $45M annual exposure with 40% forecast flow, the unhedged forecast exposure increases by $4.5M. At a 5% MXN depreciation scenario (a routine annual event), this translates to a $225,000 P&L loss attributable solely to tier-boundary misclassification.

### Failure Mode 2: Governance Failure

Governance failure occurs when the audit trail does not faithfully record which entry point was used, which fields were collected, which normalization functions were applied, and which intermediate values were discarded. Prior to unification:

- The modal path wrote `entry_point: 'POLICY_WIZARD_MODAL'` and recorded 14 input fields in `WizardAnswers`, of which only 9 were forwarded to `QuestionnaireAnswers` (the AI interface). The remaining 5 fields (`has_confirmed_orders`, `confirmed_to_forecast_ratio`, `avg_transaction_size_usd`, `payment_frequency`, `board_constraints`) were mapped directly to `CanonicalPolicy` sections without passing through the AI, creating an asymmetry: the AI recommendation was made without full context, but the canonical record appeared to include all fields.

- The page path wrote `entry_point: 'AI_POLICY_PAGE'` and collected 21 fields in `WizardState`, of which 9 were forwarded to `QuestionnaireAnswers`. The remaining 12 fields (including `drawdownTolerance`, `varConfidence`, `boardStatement`, `rollingHedge`, `rollingTenor`, `ifrsCompliance`, `benchmark`, `seasonalPatterns`, `receivableSplit`, `nettingAvailable`, `costProtectionPriority`, `instrumentPreferences`) were not forwarded to the AI and instead were written directly into `CanonicalPolicy` sections during `buildCanonicalFromPageState()`.

Neither path recorded in the audit log which fields were forwarded to the AI vs. mapped directly. An external auditor reviewing the `CanonicalPolicy.audit_log` would see `source: 'AI_WIZARD'` and assume the AI had full context, when in fact the AI saw only 9 of 14 or 9 of 21 fields. This constitutes a governance misrepresentation that would fail a Basel III Pillar 2 operational risk audit or an IFRS 9 hedge documentation review.

### Failure Mode 3: Non-Determinism

Non-determinism occurs when the same business inputs, submitted through two different entry points, produce different `PolicyConfig` outputs. The ORDR system had two sources of non-determinism:

First, the normalization of `risk_appetite` differed between paths. The modal collected `risk_appetite` directly as `RiskPosture` enum (`CONSERVATIVE | MODERATE | AGGRESSIVE`). The page derived `risk_appetite` from `costProtectionPriority` (0–100 slider) via `priorityToRiskAppetite()`, which applied a non-linear mapping: 0–34 = AGGRESSIVE, 35–64 = MODERATE, 65–100 = CONSERVATIVE. A user selecting "MODERATE" in the modal and a user selecting "50" on the slider (also nominally MODERATE) received identical `risk_appetite` values — but a user selecting "34" on the slider received AGGRESSIVE while a user typing "MODERATE" directly received MODERATE. These are semantically the same risk preference but produce different AI inputs and potentially different preset selections.

Second, the normalization of `primary_currency_pair` differed. The modal collected it as a direct string field (e.g., `"USD/MXN"`). The page derived it from `fxCorridors[0]` if available, or constructed it as `USD/${primaryCurrency}` if only a currency code was entered. A user entering `primaryCurrency: "MXN"` with no `fxCorridors` would generate `"USD/MXN"`, which is identical to the modal output — but a user entering `primaryCurrency: "EUR"` would generate `"USD/EUR"` rather than the conventional `"EUR/USD"`, causing the EM-pair detection regex in `scoreFallback()` to fail (the regex tests against `/MXN|BRL|.../` applied to the pair string). An `"EUR/USD"` pair would correctly match as non-EM, but a `"USD/EUR"` pair derived from the page path would still correctly match as non-EM; however, a `"USD/MXN"` pair and a `"MXN/USD"` pair would both match the EM regex. The ordering issue creates a non-determinism risk for future currency pairs where the regex might not be symmetric.

### Failure Mode 4: Broken Downstream

Broken downstream occurs when a policy object written by one entry point cannot be reliably consumed by a downstream system expecting the output of the other entry point. Prior to unification, `buildCanonicalFromModalAnswers()` and `buildCanonicalFromPageState()` produced `CanonicalPolicy` objects with the following structural differences:

| Field | Modal Output | Page Output |
|---|---|---|
| `business_profile.company_type` | Not populated (no field in WizardAnswers) | Populated from `companyType` |
| `business_profile.primary_currency` | Not populated | Populated from `primaryCurrency` |
| `business_profile.fx_corridors` | Single-element array `[primary_currency_pair]` | Full `fxCorridors[]` array |
| `business_profile.hedge_experience` | Not populated | Populated from `hedgeExperience` |
| `business_profile.cash_flow_visibility` | Not populated | Populated from `cashFlowVisibility` |
| `business_profile.seasonal_patterns` | Not populated | Populated from `seasonalPatterns` |
| `business_profile.receivable_split` | Not populated | Populated from `receivableSplit` |
| `business_profile.netting_available` | Not populated | Populated from `nettingAvailable` |
| `risk_parameters.var_confidence` | Not populated | Populated from `varConfidence` |
| `risk_parameters.drawdown_tolerance` | Not populated | Populated from `drawdownTolerance` |
| `risk_parameters.cost_protection_priority` | Not populated | Populated from `costProtectionPriority` |
| `risk_parameters.premium_budget_pct` | Not populated | Populated from `premiumBudget` |
| `objectives.rolling_hedge` | Not populated | Populated from `rollingHedge` |
| `objectives.rolling_tenor` | Not populated | Populated from `rollingTenor` |
| `objectives.ifrs_compliance` | Not populated | Populated from `ifrsCompliance` |
| `objectives.benchmark` | Not populated | Populated from `benchmark` |

Any downstream system that reads `canonical.objectives.ifrs_compliance` to determine whether IFRS 9 documentation is required will find `undefined` for all modal-originated policies, even if the user's company is IFRS-reporting. This creates a regulatory documentation gap that is invisible at the API layer.

## 1.2 WizardAnswers vs. WizardState: Field-by-Field Gap Table

The following table documents every field from both schemas, its presence in each entry point, and its fate in normalization.

| # | Field | WizardAnswers (Modal, 14 fields) | WizardState (Page, 21 fields) | Forwarded to QuestionnaireAnswers (9 fields) | Fate in CanonicalPolicy |
|---|---|---|---|---|---|
| 1 | `industry` / `industrySector` | `industry: string` | `industrySector: string` | YES → `industry` | Written to `classification.industry_sector` |
| 2 | `company_size` | `company_size: CompanySize` (direct enum) | Derived via `volumeToCompanySize(vol)` | YES → `company_size` | Written to `classification.company_size` |
| 3 | `annual_fx_volume_usd` | Direct numeric | Derived from `annualExposure` tier string via lookup | YES → `annual_fx_volume_usd` | Written to `business_profile.annual_fx_volume_usd` |
| 4 | `primary_currency_pair` | Direct string | Derived from `fxCorridors[0]` or `USD/${primaryCurrency}` | YES → `primary_currency_pair` | Written to `business_profile.primary_currency_pair` |
| 5 | `cash_flow_predictability` | Direct enum | Derived from `cashFlowCertainty` slider via `certaintyToPredictability()` | YES → `cash_flow_predictability` | Written to `business_profile.cash_flow_predictability` |
| 6 | `risk_appetite` | Direct enum | Derived from `costProtectionPriority` slider via `priorityToRiskAppetite()` | YES → `risk_appetite` | Written to `risk_parameters.risk_appetite` |
| 7 | `cost_sensitivity` | Direct enum | Derived from `premiumBudget` slider via `budgetToCostSensitivity()` | YES → `cost_sensitivity` | Written to `risk_parameters.cost_sensitivity` |
| 8 | `time_horizon_months` | Direct integer | Derived from `averageTenor` string via `TENOR_TO_MONTHS` lookup | YES → `time_horizon_months` | Written to `risk_parameters.time_horizon_months` |
| 9 | `hedge_objective` | Direct string | Derived from `primaryObjective` | YES → `hedge_objective` | Written to `objectives.primary_objective` |
| 10 | `has_confirmed_orders` | `boolean` | NOT PRESENT | NO — dropped in normalization | Not written to CanonicalPolicy in either path |
| 11 | `confirmed_to_forecast_ratio` | `number` (0.0–1.0) | Derived from `cashFlowCertainty/100` | NO — modal path maps direct; page path maps derived | Written to `business_profile.confirmed_to_forecast_ratio` (both paths) |
| 12 | `avg_transaction_size_usd` | `number` | NOT PRESENT | NO | Written only in modal path to `business_profile.avg_transaction_size_usd` |
| 13 | `payment_frequency` | `PaymentFrequency` enum | NOT PRESENT | NO | Written only in modal path to `business_profile.payment_frequency` |
| 14 | `max_hedge_cost_pct` | `number` | Implicit in `premiumBudget` slider | NO | Written to `risk_parameters.max_hedge_cost_pct` in modal; from slider in page |
| 15 | `board_constraints` | `string` | `boardStatement: string` | NO | Written to `objectives.board_statement` in both paths |
| 16 | `exclude_ndf` | `boolean` | Derived from `!instrumentPreferences.includes('NDFs')` | NO | Written to `objectives.exclude_ndf` (both paths, different derivation) |
| 17 | `exclude_fwd` | `boolean` | Derived from `!instrumentPreferences.includes('Forwards')` | NO | Written to `objectives.exclude_fwd` (both paths, different derivation) |
| 18 | `companyType` | NOT PRESENT | `companyType: string` | NO | Written only in page path to `business_profile.company_type` |
| 19 | `primaryCurrency` | NOT PRESENT | `primaryCurrency: string` | NO | Written only in page path to `business_profile.primary_currency` |
| 20 | `hedgeExperience` | NOT PRESENT | `hedgeExperience: string` | NO | Written only in page path to `business_profile.hedge_experience` |
| 21 | `cashFlowVisibility` | NOT PRESENT | `cashFlowVisibility: string` | NO | Written only in page path to `business_profile.cash_flow_visibility` |
| 22 | `receivableSplit` | NOT PRESENT | `receivableSplit: number` | NO | Written only in page path to `business_profile.receivable_split` |
| 23 | `seasonalPatterns` | NOT PRESENT | `seasonalPatterns: string` | NO | Written only in page path to `business_profile.seasonal_patterns` |
| 24 | `nettingAvailable` | NOT PRESENT | `nettingAvailable: boolean` | NO | Written only in page path to `business_profile.netting_available` |
| 25 | `varConfidence` | NOT PRESENT | `varConfidence: string` | NO | Written only in page path to `risk_parameters.var_confidence` |
| 26 | `drawdownTolerance` | NOT PRESENT | `drawdownTolerance: string` | NO | Written only in page path to `risk_parameters.drawdown_tolerance` |
| 27 | `costProtectionPriority` | NOT PRESENT | `costProtectionPriority: number` | NO | Written only in page path to `risk_parameters.cost_protection_priority` |
| 28 | `premiumBudget` | NOT PRESENT | `premiumBudget: number` | NO | Written only in page path to `risk_parameters.premium_budget_pct` |
| 29 | `instrumentPreferences` | NOT PRESENT | `instrumentPreferences: string[]` | NO | Written only in page path to `objectives.instrument_preferences` |
| 30 | `hedgeRatioTarget` | NOT PRESENT | `hedgeRatioTarget: number` | NO | Written only in page path to `objectives.hedge_ratio_target` |
| 31 | `rollingHedge` | NOT PRESENT | `rollingHedge: boolean` | NO | Written only in page path to `objectives.rolling_hedge` |
| 32 | `rollingTenor` | NOT PRESENT | `rollingTenor: string` | NO | Written only in page path to `objectives.rolling_tenor` |
| 33 | `ifrsCompliance` | NOT PRESENT | `ifrsCompliance: boolean` | NO | Written only in page path to `objectives.ifrs_compliance` |
| 34 | `benchmark` | NOT PRESENT | `benchmark: string` | NO | Written only in page path to `objectives.benchmark` |
| 35 | `fxCorridors` | NOT PRESENT | `fxCorridors: string[]` | NO | Written only in page path to `business_profile.fx_corridors` and `scope.currency_pairs` |
| 36 | `annualExposure` (tier) | NOT PRESENT | `annualExposure: string` | Normalized to `annual_fx_volume_usd` | Source tier string discarded after normalization |

**Summary of gaps:** The AI call receives exactly 9 of 14 modal fields (64%) and 9 of 21 page fields (43%). The remaining fields bypass the AI and are mapped directly into the canonical policy without AI consideration. This means the AI recommendation — which drives preset selection, hedge ratios, spread assumptions, and execution product — is made with incomplete information in all cases.

## 1.3 QuestionnaireAnswers AI Interface Gaps

The `QuestionnaireAnswers` interface (9 fields) was designed for the original single-step modal flow and was never expanded when the 21-field page wizard was added. The following fields are present in `WizardState` but absent from `QuestionnaireAnswers`, meaning the AI never receives them and cannot incorporate them into its recommendation:

1. **`nettingAvailable`** — Whether the company can net cross-currency exposures. Netting-capable companies should receive lower hedge ratios and tighter spreads. The AI cannot recommend netting strategies without this field.
2. **`receivableSplit`** — The proportion of flows that are receivables vs. payables. A 100% receivables company (exporter) has different hedging requirements than a 100% payables company (importer). This is material to instrument selection (NDF vs. FWD) and direction.
3. **`seasonalPatterns`** — Seasonal concentration affects optimal tenor selection. The AI cannot recommend layered hedging or seasonal bucketing without this.
4. **`instrumentPreferences`** — User preference for forwards, options, collars, NDFs. The AI ignores explicit user instrument constraints.
5. **`varConfidence`** — VaR confidence level (90%, 95%, 99%, 99.5%). This determines the percentile for stress scenario calibration, which the AI cannot incorporate.
6. **`drawdownTolerance`** — Maximum acceptable drawdown. Material to determining whether options (with premium) are warranted vs. forwards.
7. **`rollingHedge` / `rollingTenor`** — Whether the policy requires rolling hedges vs. static hedges. Fundamentally different execution strategies.
8. **`ifrsCompliance`** — IFRS 9 / ASC 815 compliance requirement. Changes the permitted instruments (derivatives only, no synthetic hedges) and documentation requirements.
9. **`boardStatement`** — Board-mandated constraints. The AI should receive these to ensure its recommendation does not conflict with board policy.
10. **`benchmark`** — The rate benchmark (budget rate, spot at inception, forward rate). Determines hedge effectiveness measurement methodology.
11. **`hedgeRatioTarget`** — An explicit target hedge ratio override. The AI should respect this constraint rather than recommending a conflicting ratio.

## 1.4 Current Preset Library: 33 Presets — Gap Analysis

The current library of 33 presets provides coverage across Corporate (11), Financial (8), Sovereign (3), and Sector (11) categories. The following gaps exist:

**Energy Sector (critical gap):** The library contains one energy preset (`energy-utilities`, covering regulated power utilities) but lacks:
- Oil & Gas upstream (E&P companies with USD production revenue and local currency opex)
- LNG exporters (long-term offtake agreements with complex optionality)
- Renewable energy developers (PPA-denominated USD revenue with MXN construction cost)
- Oil & Gas services companies (rig day-rates, seismic contracts)

**Healthcare/Pharma (partial coverage):** The `pharma-import` preset covers pharmaceutical importers but lacks:
- Clinical Research Organizations (CROs) with USD grant revenue and multi-currency trial costs
- Medical device OEMs with complex supply chains
- Hospital group treasury (multi-currency insurance receivables)

**Technology (thin coverage):** The `tech-saas` preset is a single entry. Missing:
- Semiconductor supply chain (wafer procurement in USD, chip sales in multiple currencies)
- Cloud infrastructure revenue hedgers (large-scale USD SaaS)
- Hardware OEM importers

**Financial (missing institutional types):**
- FX prime brokerage overlay
- Pension fund liability-driven investment (LDI) FX hedge
- University endowment
- REIT with cross-border property income
- SPV/structured finance vehicle

**Agriculture (single entry):** The `agri-commodity` preset is generic. Missing:
- Coffee exporters (Central American origin, USD settlement)
- Cocoa/chocolate supply chain
- Grain trader (basis risk + FX combined)
- Livestock/meat packing export

**Sovereign/Quasi-Sovereign (3 entries, thin):** Missing:
- Development bank project loan disbursement hedge
- Sovereign Wealth Fund (SWF) allocation hedge
- Municipal government debt service

**Emerging Market Specialization (absent):** No presets are calibrated to specific EM currency corridors with their unique characteristics:
- BRL: NDFs only, high carry, high vol (15–25% realized vol historically)
- MXN: Deep NDF market, TIIE-linked forwards, nearshore manufacturing concentration
- TRY: Extreme carry (400–2000 bps), USD peg behavior broken since 2021
- ZAR: Mining-driven commodity correlation, dual listing arbitrage
- INR: RBI intervention regime, onshore/offshore rate divergence

---

# SECTION 2: CANONICAL POLICY SCHEMA (EXTENDED v2.0)

## 2.1 Full Extended Canonical Policy Interface

The following schema extends `CanonicalPolicy v1.0` to address all identified gaps. Fields marked `[v1.0]` exist in the current codebase. Fields marked `[v2.0]` are new additions.

### Block A: Identity & Governance

```typescript
interface IdentityBlock {
  // [v1.0] Core identity
  schema_version: '1.0' | '2.0';
  policy_id?: string;                    // UUID v4 assigned on first persist
  policy_code: string;                   // Human-readable: "ORG-CORP-FX-001"
  display_name: string;                  // Max 60 chars
  short_name: string;                    // 4–8 uppercase chars
  description: string;                   // 1–3 sentences

  // [v2.0] Extended status lifecycle
  status: 'DRAFT' | 'REVIEW' | 'APPROVED' | 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';

  // [v2.0] Classification block
  classification: {
    risk_posture: 'CONSERVATIVE' | 'MODERATE' | 'AGGRESSIVE';
    category: 'CORPORATE' | 'FINANCIAL' | 'SOVEREIGN' | 'SECTOR';
    sub_category: string;               // E.g. "Manufacturing", "LNG Exporter"
    regulatory_regime: string[];        // E.g. ["IFRS9", "ASC815", "MiFID2", "Basel3"]
  };

  // [v2.0] Semantic versioning
  versioning: {
    version: string;                    // Semver: "1.0.0"
    parent_policy_id?: string;          // UUID of previous version
    change_note: string;                // Description of changes in this version
    change_type: 'MAJOR' | 'MINOR' | 'PATCH';
  };

  // [v2.0] Ownership & approval
  owner_user_id: string;
  approver_user_id?: string;
  tenant_id: string;

  // [v2.0] Temporal validity
  effective_from?: string;              // ISO 8601 date
  effective_until?: string;            // ISO 8601 date; null = perpetual
  review_due_date?: string;            // ISO 8601 date

  // [v2.0] Metadata
  tags: string[];                       // Free-form labels
  external_refs: ExternalRef[];         // ISDA refs, board resolutions, regulatory filings
}

interface ExternalRef {
  ref_type: 'ISDA_MASTER' | 'BOARD_RESOLUTION' | 'REGULATORY_FILING' | 'AUDIT_REF' | 'OTHER';
  ref_id: string;                       // External document identifier
  description: string;
  url?: string;
}
```

### Block B: Applicability Scope

```typescript
interface ScopeBlock {
  // [v1.0] Basic scope
  company_id: string;
  branch_ids: string[] | 'ALL';
  currency_pairs: string[];
  flow_types: ('CONFIRMED' | 'FORECAST')[];
  effective_from?: string;
  effective_until?: string;
  min_notional_usd?: number;
  max_notional_usd?: number;

  // [v2.0] Extended scope
  entities: {
    entity_ids: string[];
    entity_types: ('SUBSIDIARY' | 'SPV' | 'BRANCH' | 'CONSOLIDATED')[];
  };

  asset_classes: (
    | 'FX_SPOT'
    | 'FX_FORWARD'
    | 'FX_OPTION'
    | 'FX_SWAP'
    | 'FX_NDF'
    | 'CROSS_CCY_SWAP'
  )[];

  currency_pair_rules: CurrencyPairRule[];

  extended_flow_types: (
    | 'RECEIVABLE'
    | 'PAYABLE'
    | 'INTERCOMPANY'
    | 'BALANCE_SHEET'
    | 'DIVIDEND'
    | 'DEBT_SERVICE'
  )[];

  portfolio_scope: 'SINGLE_ACCOUNT' | 'MULTI_ACCOUNT' | 'CONSOLIDATED' | 'BRANCH_LEVEL';

  geography: ('EM_LATAM' | 'EM_ASIA' | 'EM_EMEA' | 'G10' | 'ALL')[];

  materiality_threshold_usd: number;   // Flows below this are not hedged

  netting_rules: NettingRule[];
}

interface CurrencyPairRule {
  pair: string;                        // E.g. "USD/MXN"
  direction: 'BUY' | 'SELL' | 'BOTH';
  min_notional: number;
  max_notional: number;
  excluded: boolean;
}

interface NettingRule {
  currency_pair: string;
  net_across_entities: boolean;
  net_confirmed_forecast: boolean;
  settlement_cycle_days: number;
}
```

### Block C: Objectives (Quantified)

```typescript
interface ObjectivesBlock {
  // [v1.0] Basic objectives
  primary_objective: string;
  hedge_objective_text?: string;
  board_statement?: string;
  board_resolution_ref?: string;
  hedge_ratio_target?: number;
  rolling_hedge?: boolean;
  rolling_tenor?: string;
  ifrs_compliance?: boolean;
  benchmark?: string;
  instrument_preferences?: string[];
  exclude_ndf?: boolean;
  exclude_fwd?: boolean;

  // [v2.0] Quantified objectives
  primary_objective_enum: (
    | 'MINIMIZE_COST'
    | 'MAXIMIZE_PROTECTION'
    | 'EARNINGS_STABILITY'
    | 'CASH_FLOW_MATCHING'
    | 'REGULATORY_COMPLIANCE'
    | 'BALANCE_SHEET_PROTECTION'
  );

  hedge_ratio_targets: HedgeRatioTarget[];

  p_and_l_volatility_budget_pct: number;   // Max acceptable P&L swing from FX, e.g. 2.0 = 2%
  cash_flow_at_risk_percentile: number;    // E.g. 95 for 95th percentile CFaR

  constraint_priority_order: string[];     // When constraints conflict, which wins first

  success_metrics: SuccessMetric[];
}

interface HedgeRatioTarget {
  flow_type: 'RECEIVABLE' | 'PAYABLE' | 'INTERCOMPANY' | 'BALANCE_SHEET';
  status: 'CONFIRMED' | 'FORECAST';
  min_ratio: number;                   // 0.0–1.0
  target_ratio: number;                // 0.0–1.0
  max_ratio: number;                   // 0.0–1.0
}

interface SuccessMetric {
  name: string;                        // E.g. "Hedge Effectiveness"
  formula: string;                     // E.g. "HedgeGain / UnhedgedLoss"
  target: string;                      // E.g. ">= 80%"
  tolerance: string;                   // E.g. "+/- 5%"
}
```

### Block D: Constraints (Hard and Soft)

```typescript
interface ConstraintsBlock {
  // [v2.0] Instrument eligibility
  allowed_instruments: InstrumentRule[];

  // [v2.0] Liquidity gates
  liquidity_gates: LiquidityGate[];

  // [v2.0] Leverage and margin
  leverage_cap: number;                // Max gross notional / exposure ratio
  margin_budget_usd: number;           // Available margin for options/futures

  // [v2.0] Tenor constraints
  tenor_constraints: {
    min_days: number;
    max_days: number;
    roll_allowed: boolean;
    roll_window_days_before_expiry: number;
  };

  // [v2.0] Concentration limits
  concentration_limits: ConcentrationLimit[];

  // [v2.0] Cost budget
  cost_budget: {
    max_carry_cost_bps_annual: number;
    max_option_premium_pct_notional: number;
    max_spread_bps: number;
  };

  // [v1.0] Trade size (now part of execution_config)
  min_hedge_size_usd: number;
  max_single_trade_usd: number;

  // [v2.0] Fail-closed rules
  fail_closed_rules: FailClosedRule[];
}

interface InstrumentRule {
  type: 'FX_FORWARD' | 'FX_NDF' | 'FX_OPTION_CALL' | 'FX_OPTION_PUT' | 'FX_COLLAR' | 'FX_SWAP';
  allowed: boolean;
  conditions: string[];                // E.g. ["Only for confirmed flows", "Board approval required"]
  max_tenor_days: number;
  max_notional_usd: number;
  requires_approval: boolean;
}

interface LiquidityGate {
  instrument: string;
  min_daily_volume_usd: number;
  max_bid_ask_spread_bps: number;
  fallback_instrument: string;
}

interface ConcentrationLimit {
  dimension: 'INSTRUMENT' | 'COUNTERPARTY' | 'TENOR' | 'CURRENCY';
  max_pct: number;                     // E.g. 0.25 = max 25% in any single bucket
}

interface FailClosedRule {
  condition: string;                   // Plain-English condition description
  action: 'BLOCK' | 'ALERT' | 'REQUIRE_APPROVAL';
}
```

### Block E: Risk Definitions

```typescript
interface RiskBlock {
  // [v2.0] Risk axes (multi-dimensional risk limits)
  risk_axes: RiskAxis[];

  // [v2.0] Exposure bucketing overrides
  exposure_buckets: ExposureBucket[];

  // [v2.0] Stress scenario reference
  shock_set_ref: string;              // Reference to stress scenario library entry

  // [v2.0] Correlation assumptions
  correlation_assumptions: CorrelationAssumption[];
}

interface RiskAxis {
  name: string;                        // E.g. "FX VaR"
  measure: 'VAR' | 'CVAR' | 'STRESS_LOSS' | 'CARRY';
  confidence_level: number;            // E.g. 0.95
  horizon_days: number;                // E.g. 10
  limit: number;                       // In USD
}

interface ExposureBucket {
  name: string;                        // E.g. "Near-Term Confirmed"
  currency_pairs: string[];
  maturity_range_days: [number, number]; // [min_days, max_days]
  flow_types: string[];
  hedge_ratio_override?: number;       // Overrides global target for this bucket
}

interface CorrelationAssumption {
  pair_a: string;
  pair_b: string;
  assumed_correlation: number;         // -1.0 to 1.0
  source: string;                      // E.g. "BIS Triennial Survey 2022"
  last_reviewed: string;               // ISO 8601 date
}
```

### Block F: Scenario & Stress

```typescript
interface ScenarioBlock {
  // [v2.0] Standard stress pack
  standard_stress_pack: 'MILD_STRESS' | 'MODERATE_STRESS' | 'SEVERE_STRESS' | 'TAIL_STRESS' | 'CUSTOM';

  // [v2.0] Stress scenario definitions
  stress_scenarios: StressScenario[];

  // [v2.0] Stress configuration
  worst_case_focus: boolean;
  confidence_bands: {
    lower_pct: number;                 // E.g. 5
    upper_pct: number;                 // E.g. 95
  };
  back_test_window_days: number;       // E.g. 252 (1 year)
}

interface StressScenario {
  name: string;
  description: string;
  spot_shock_pct: number;              // E.g. -15.0 for 15% depreciation
  vol_shock_pct: number;               // Additional vol added to baseline
  correlation_shock: number;           // Correlation shift from baseline
  sovereign_spread_shock_bps: number;  // Country risk premium shift
  source_event: string;                // E.g. "BRL 2018 EM selloff"
  probability_assigned: number;        // 0.0–1.0 subjective probability
}
```

### Block G: Execution Intent

```typescript
interface ExecutionIntentBlock {
  // [v1.0] Engine-binding config
  execution_config: PolicyConfig;      // The engine-binding section (unchanged from v1.0)

  // [v2.0] Extended execution intent
  artifacts_produced: (
    | 'HEDGE_PLAN'
    | 'TRADE_TICKETS'
    | 'EXPOSURE_REPORT'
    | 'BOARD_PACK'
    | 'REGULATORY_FILING'
  )[];

  execution_mode: 'ADVISORY' | 'AUTO_EXECUTE' | 'MANUAL_CONFIRM';
  trade_approval_threshold_usd: number; // Above this, human approval required
  counterparty_preferences: string[];  // Preferred bank counterparties
}
```

### Block H: Disclosures & Assumptions Registry

```typescript
interface DisclosuresBlock {
  assumptions: AssumptionEntry[];
  model_limitations: string[];
  regulatory_disclaimers: string[];
}

interface AssumptionEntry {
  id: string;                          // E.g. "ASSUMP-001"
  category: 'PROXY' | 'MODEL' | 'MARKET_DATA' | 'REGULATORY';
  description: string;
  source: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNVERIFIED';
  last_reviewed: string;               // ISO 8601 date
  reviewer: string;                    // user_id
}
```

### Block I: Validation Block

```typescript
interface ValidationBlock {
  validation_result: {
    is_valid: boolean;
    completeness_score_pct: number;    // 0–100
    governance_score_pct: number;      // 0–100
    quality_score_pct: number;         // 0–100
    errors: ValidationMessage[];
    warnings: ValidationMessage[];
    info: ValidationMessage[];
  };
  computed_flags: {
    has_board_approval: boolean;
    has_required_disclosures: boolean;
    instruments_within_limits: boolean;
    budget_feasible: boolean;
    stress_tested: boolean;
  };
}

interface ValidationMessage {
  code: string;                        // E.g. "VAL-001"
  message: string;
  field?: string;
  severity: 'ERROR' | 'WARNING' | 'INFO';
}
```

### Block J: Audit Trail

```typescript
interface AuditTrailBlock {
  audit_log: AuditLogEntry[];
}

interface AuditLogEntry {
  event_id: string;                    // UUID v4
  timestamp: string;                   // ISO 8601 UTC
  actor_id: string;
  actor_role: 'DRAFTER' | 'REVIEWER' | 'APPROVER' | 'PUBLISHER' | 'AUDITOR' | 'ADMIN' | 'SYSTEM';
  event_type: AuditAction;
  description: string;
  field_diffs: FieldDiff[];
  ip_address?: string;
  session_id?: string;
}

interface FieldDiff {
  field: string;
  old_value: unknown;
  new_value: unknown;
}
```

## 2.2 Supporting Object Definitions

### PolicyTemplate (Standards Library Entry)

```typescript
interface PolicyTemplate {
  template_id: string;                 // UUID v4
  is_system: boolean;                  // True = ORDR-managed template
  company_id?: string;                 // null for system templates
  name: string;
  short_name: string;
  description: string;
  risk_posture: RiskPosture;
  category: PolicyCategory;
  canonical_policy: CanonicalPolicy;   // Full canonical object as template
  usage_count: number;                 // Times activated across all tenants
  created_at: string;
  updated_at: string;
  tags: string[];
}
```

### PolicyRunBinding (Policy → Calculation Run Link)

```typescript
interface PolicyRunBinding {
  binding_id: string;                  // UUID v4
  policy_id: string;                   // Canonical policy UUID
  policy_version: string;              // Semver string at time of run
  run_id: string;                      // Calculation engine run_id
  bound_at: string;                    // ISO 8601 UTC
  execution_config_snapshot: PolicyConfig; // Exact config used (immutable copy)
  config_hash: string;                 // SHA-256 of execution_config_snapshot
}
```

### PolicyDiff (Version Diff Object)

```typescript
interface PolicyDiff {
  diff_id: string;
  policy_id: string;
  version_a: string;                   // Semver
  version_b: string;                   // Semver
  diff_generated_at: string;
  changed_fields: FieldDiff[];
  is_breaking_change: boolean;         // True if execution_config changed
  breaking_fields: string[];           // Fields that changed in execution_config
  narrative: string;                   // Human-readable diff summary
}
```

### PolicyQualityScore (Deterministic Scoring Rubric)

The `PolicyQualityScore` is computed deterministically from the canonical policy object. It is not ML-based. The formula is:

```
QualityScore = (0.30 × CompletenessScore) + (0.35 × GovernanceScore) + (0.20 × RiskDefinitionScore) + (0.15 × DisclosureScore)
```

Where each sub-score is computed as follows:

**CompletenessScore (0–100):** Sum of field weights for populated fields.
- `display_name` present and ≥ 10 chars: +5
- `description` present and ≥ 50 chars: +5
- `scope.currency_pairs` non-empty: +10
- `business_profile.annual_fx_volume_usd` present: +10
- `risk_parameters.risk_appetite` present: +10
- `objectives.primary_objective` present: +10
- `execution_config` fully populated (all 5 fields): +20
- `formula.notation` present: +5
- `instrument_allocation` non-empty: +5
- `classification.industry_sector` present: +5
- `business_profile.confirmed_to_forecast_ratio` present: +5
- `objectives.ifrs_compliance` explicitly set (not undefined): +5
- `risk_parameters.var_confidence` present: +5

**GovernanceScore (0–100):**
- `governance.requires_approval` set: +10
- `governance.review_frequency_days` set: +10
- `governance.regulatory_flags` non-empty: +15
- `provenance.questionnaire_hash` present: +10
- `audit_log` has ≥ 1 entry: +15
- `objectives.board_resolution_ref` present: +20
- `provenance.approved_by` present: +20

**RiskDefinitionScore (0–100):**
- `risk_parameters.var_confidence` set: +20
- `risk_parameters.drawdown_tolerance` set: +20
- `risk_parameters.max_acceptable_loss` set: +20
- `risk_parameters.time_horizon_months` set: +20
- `risk_parameters.premium_budget_pct` set: +20

**DisclosureScore (0–100):**
- `governance.disclosure_text` present and ≥ 100 chars: +40
- `formula.rationale` present and ≥ 100 chars: +30
- `objectives.benchmark` present: +30

---

# SECTION 3: UNIFIED WIZARD SPECIFICATION

## 3.1 Design Principles

The unified wizard replaces both `PolicyWizardModal` (modal) and `ai-policy-wizard/page` entry points with a single state machine that supports two traversal modes:
- **Entry A (Fast Guided Flow):** 4 steps, pre-fills defaults, targets < 5 minutes to first policy draft.
- **Entry B (Advanced Full Cockpit):** 7 phases, full field exposure, targets institutional-grade policy in < 30 minutes.

Both modes write identical `CanonicalPolicy v2.0` objects. The difference is in how many fields the user explicitly configures; Entry A leaves more fields at governed defaults.

## 3.2 Phase A: Intent & Scope

### Step A.1 — Policy Intent Classification

**Purpose:** Establish the primary hedging objective and regulatory regime. This step determines which downstream fields are mandatory vs. optional.

**Research basis:** Taxonomy derived from Hagelin & Pramborg (2004) "Hedging Foreign Exchange Exposure: Risk Reduction from Transaction and Translation Hedging," *Journal of International Financial Management & Accounting*, which identifies four distinct corporate FX hedging motives (cash flow protection, earnings translation, balance sheet, and regulatory/compliance). The ISDA 2012 EMIR Implementation Group classifies hedge objectives for regulatory reporting purposes.

**Input fields:**

| Field | Type | Default | Validation | Tooltip |
|---|---|---|---|---|
| `primary_objective_enum` | Select enum | `CASH_FLOW_MATCHING` | Required | "The primary reason your organization hedges FX exposure. This determines which metrics the engine optimizes." |
| `regulatory_regime[]` | Multi-select | `[]` | At least one selection recommended | "Select all applicable accounting standards. IFRS 9 and ASC 815 require formal hedge designation documentation." |
| `board_resolution_ref` | Text | `""` | Optional; if provided, format "DEPT-YYYY-NNN" | "Reference to the board resolution or risk committee mandate authorizing this hedging program." |
| `effective_from` | Date | Today | Must be ≥ today | "Date from which this policy takes effect. Cannot be backdated beyond 30 days." |
| `effective_until` | Date | +12 months | Must be > effective_from | "Expiry date. Leave blank for a perpetual policy subject to annual review." |
| `review_due_date` | Date | +6 months | Must be ≤ effective_until | "When this policy must next be reviewed by the risk committee." |

**Validation rules:**
- RULE-A1-001: `primary_objective_enum` must be set. If not set, block advancement. Error: "You must select a primary hedging objective to proceed."
- RULE-A1-002: If `regulatory_regime` contains `IFRS9` or `ASC815`, set `objectives.ifrs_compliance = true` and flag the policy for governance review (`requires_approval = true`).
- RULE-A1-003: `effective_until` must be > `effective_from`. Error: "Policy expiry date must be after the effective date."

**Output to CanonicalPolicy:**
- `objectives.primary_objective_enum`
- `classification.regulatory_regime`
- `objectives.board_resolution_ref`
- `identity.effective_from`
- `identity.effective_until`
- `identity.review_due_date`
- `governance.requires_approval` (conditionally set by RULE-A1-002)

**Rejection catalog:**
- `ERR_A1_001`: "Primary objective is required. Select one from the dropdown to continue."
- `WARN_A1_001`: "No regulatory regime selected. If your organization reports under IFRS 9 or ASC 815, hedge documentation requirements apply. Confirm intentional omission."
- `ERR_A1_003`: "Effective-until date must be after the effective-from date."

**UX notes:** Display a 2×3 card grid for objective selection with icons. Each card shows the objective name, a one-line description, and a "Best for" example. The regulatory regime selector is a pill-style multi-select. Board resolution reference is collapsible under an "Advanced Governance" accordion, hidden in Entry A (Fast Guided Flow).

---

### Step A.2 — Portfolio Scope & Currency Universe

**Purpose:** Define the entities, currency pairs, and flow types covered by the policy.

**Research basis:** BIS Triennial Central Bank Survey 2022 establishes that 88% of global FX turnover is USD-denominated, motivating the default USD-primary scope. ISDA 2022 FX Definitions classify eligible currency pairs and settlement conventions that determine NDF vs. deliverable forward treatment.

**Input fields:**

| Field | Type | Default | Validation | Tooltip |
|---|---|---|---|---|
| `currency_pair_rules[]` | Currency pair selector | USD/MXN | At least 1 required | "Add all currency pairs in which your organization has FX exposure. Order does not matter." |
| `entity_ids[]` | Entity multi-select | All entities | Optional | "Select specific legal entities if this policy applies to a subset of your organization." |
| `portfolio_scope` | Select enum | `CONSOLIDATED` | Required | "Consolidated = net all exposures across all entities. Branch level = hedge each entity independently." |
| `extended_flow_types[]` | Multi-select | `[RECEIVABLE, PAYABLE]` | At least 1 required | "Include all flow types that generate FX exposure." |
| `materiality_threshold_usd` | Number | 10000 | ≥ 0 | "Flows below this USD equivalent will not generate hedge tickets. Set to 0 to hedge all flows." |
| `geography[]` | Multi-select | derived from pairs | Optional | "Geography classification for regulatory reporting and counterparty risk bucketing." |

**Validation rules:**
- RULE-A2-001: At least one currency pair must be configured.
- RULE-A2-002: For each EM currency pair (BRL, MXN, TRY, ZAR, INR, COP, CLP, IDR, PHP, THB, KRW, TWD), set `execution_product = 'NDF'` as default unless overridden.
- RULE-A2-003: `materiality_threshold_usd` must be ≥ 0. If set to 0, display warning: "Setting materiality to zero will generate hedge tickets for all flows including very small amounts. This may create operational burden for your execution desk."
- RULE-A2-004: If `portfolio_scope = CONSOLIDATED` and `entity_ids` is non-empty (partial selection), warn: "Consolidated scope with partial entity selection may create netting calculation errors. Confirm scope."

**Output to CanonicalPolicy:**
- `scope.currency_pair_rules`
- `scope.entity_ids`
- `scope.entity_types`
- `scope.portfolio_scope`
- `scope.extended_flow_types`
- `scope.materiality_threshold_usd`
- `scope.geography`

**Rejection catalog:**
- `ERR_A2_001`: "At least one currency pair is required."
- `WARN_A2_002`: "EM currency pairs selected. Non-deliverable forwards (NDFs) will be used by default for settlement."
- `WARN_A2_003`: "Materiality threshold set to $0. Every exposure including sub-$1,000 flows will generate a hedge ticket."
- `WARN_A2_004`: "Consolidated scope with partial entity selection — confirm this is intentional."

---

### Step A.3 — Time Horizon Architecture

**Purpose:** Define the hedging time horizon and rolling/layering structure.

**Research basis:** Gagnon & Ihrig (2004) "Monetary Policy and Exchange Rate Pass-Through," *International Journal of Finance & Economics*, demonstrates that horizon selection materially affects hedge effectiveness. Stulz (1984) "Optimal Hedging Policies," *Journal of Financial and Quantitative Analysis*, establishes that optimal hedge horizon equals the operating cycle length.

**Input fields:**

| Field | Type | Default | Validation | Tooltip |
|---|---|---|---|---|
| `time_horizon_months` | Integer slider 1–36 | 12 | 1–36 | "How many months forward does your policy hedge? Most corporates use 12 months." |
| `rolling_hedge` | Boolean toggle | false | — | "Rolling hedge: continuously roll expiring contracts forward. Static hedge: fixed-date contracts only." |
| `rolling_tenor` | Select | `3M` | Required if rolling_hedge=true | "The standard tenor for each rolling leg. Shorter tenors = more execution cost; longer = less flexibility." |
| `average_tenor` | Select | `6M` | Required | "Average maturity of your FX exposures. Determines bucket sizing." |
| `layered_approach` | Boolean toggle | false | — | "Layered approach: build the hedge gradually over time rather than all at once. Reduces rate timing risk." |

**Validation rules:**
- RULE-A3-001: `time_horizon_months` must be 1–36.
- RULE-A3-002: If `rolling_hedge = true`, `rolling_tenor` is required.
- RULE-A3-003: If `ifrs_compliance = true` (from Step A.1), warn that rolling hedges require continuous formal hedge designation documentation under IAS 39 / IFRS 9.
- RULE-A3-004: If `time_horizon_months > 24`, warn about long-dated forward availability for EM pairs.

**Output to CanonicalPolicy:**
- `risk_parameters.time_horizon_months`
- `objectives.rolling_hedge`
- `objectives.rolling_tenor`
- `business_profile.average_tenor`

---

## 3.3 Phase B: Exposure & Bucketing Rules

### Step B.1 — Exposure Classification Matrix

**Purpose:** Classify exposure flows by type, certainty, and materiality. This step determines which flows qualify as confirmed vs. forecast and sets the confirmed-to-forecast ratio.

**Research basis:** Allayannis & Weston (2001) "The Use of Foreign Currency Derivatives and Firm Market Value," *Review of Financial Studies*, demonstrates that the confirmed/forecast classification is the single most important hedge ratio driver. IFRS 9.6.4 requires formal designation of hedged items with sufficient specificity.

**Input fields:**

| Field | Type | Default | Validation | Tooltip |
|---|---|---|---|---|
| `cash_flow_certainty` | Slider 0–100 | 70 | — | "What % of your forecast flows ultimately materialize as confirmed transactions? 70% is typical for manufacturers." |
| `receivable_split` | Slider 0–100 | 50 | — | "What % of your FX flows are receivables (money coming in) vs. payables (money going out)?" |
| `confirmed_to_forecast_ratio` | Display (derived) | derived | — | "Automatically calculated from certainty and flow split." |
| `payment_frequency` | Select | `MONTHLY` | Required | "How often do FX transactions settle? Affects bucket sizing." |
| `avg_transaction_size_usd` | Number | 50000 | > 0 | "Average size of individual FX transactions. Affects minimum trade size recommendations." |
| `seasonal_patterns` | Select | `None` | Optional | "Do flows concentrate in certain quarters? E.g., retail holiday season, agricultural harvest." |
| `has_intercompany_flows` | Boolean | false | — | "Check if this policy should cover intercompany transfers between group entities." |

**Validation rules:**
- RULE-B1-001: If `avg_transaction_size_usd < min_trade_size_usd`, warn that most transactions will be below the minimum and will not generate hedge tickets.
- RULE-B1-002: `receivable_split` 0–100.
- RULE-B1-003: If `seasonal_patterns != None`, recommend enabling the layered approach from Step A.3.

**Output to CanonicalPolicy:**
- `business_profile.cash_flow_certainty`
- `business_profile.cash_flow_predictability` (derived)
- `business_profile.confirmed_to_forecast_ratio`
- `business_profile.receivable_split`
- `business_profile.payment_frequency`
- `business_profile.avg_transaction_size_usd`
- `business_profile.seasonal_patterns`

---

### Step B.2 — Netting Rules Configuration

**Purpose:** Configure cross-entity and cross-currency netting to reduce gross hedge notional and execution cost.

**Research basis:** Nance, Smith & Smithson (1993) "On the Determinants of Corporate Hedging," *Journal of Finance*, demonstrate that netting-capable firms reduce FX hedging cost by 40–70% vs. gross hedging. The ISDA 2002 Master Agreement Sections 2(c) establishes the legal framework for netting arrangements.

**Input fields:**

| Field | Type | Default | Validation | Tooltip |
|---|---|---|---|---|
| `netting_available` | Boolean | false | — | "Can you legally net opposite-direction FX flows before hedging? Requires netting agreement." |
| `netting_rules[]` | Rule builder | [] | Required if netting_available=true | "Define which currency pairs and entities can be netted." |
| `net_confirmed_forecast` | Boolean | false | — | "Allow confirmed and forecast flows to net against each other. Aggressive — only enable with high forecast accuracy." |
| `settlement_cycle_days` | Integer | 2 | 1–5 | "Settlement cycle for netted positions. Standard is T+2." |

**Validation rules:**
- RULE-B2-001: If `netting_available = true`, at least one netting rule must be defined.
- RULE-B2-002: If `net_confirmed_forecast = true` and `cash_flow_certainty < 70`, warn: "Netting confirmed against forecast flows when forecast accuracy is below 70% increases overhedge risk."
- RULE-B2-003: If `ifrs_compliance = true`, warn: "IFRS 9.6.4.1 requires separate designation of hedged items. Netting confirmed and forecast flows in a single hedge may affect hedge accounting eligibility."

**Output to CanonicalPolicy:**
- `business_profile.netting_available`
- `scope.netting_rules`

---

### Step B.3 — Materiality Thresholds

**Purpose:** Set the suppression threshold below which hedge tickets are not generated, and confirm minimum trade size relative to execution desk constraints.

**Input fields:**

| Field | Type | Default | Validation | Tooltip |
|---|---|---|---|---|
| `materiality_threshold_usd` | Number | 10000 | ≥ 0 | "Buckets with net exposure below this threshold will be suppressed. Default $10,000 reduces ticket noise." |
| `min_hedge_size_usd` | Number | 50000 | ≥ 0 | "Minimum ticket size for your bank execution desk. Tickets below this are aggregated or suppressed." |
| `max_single_trade_usd` | Number | 50000000 | > min_hedge_size | "Maximum single ticket size. Trades above this are split into multiple tickets." |

**Validation rules:**
- RULE-B3-001: `min_hedge_size_usd` ≥ 0.
- RULE-B3-002: `max_single_trade_usd` > `min_hedge_size_usd`.
- RULE-B3-003: If `materiality_threshold_usd` > (`annual_fx_volume_usd` / 24), warn: "Materiality threshold exceeds average bi-monthly exposure. Many buckets will be suppressed."

**Output to CanonicalPolicy:**
- `scope.materiality_threshold_usd`
- `constraints.min_hedge_size_usd`
- `constraints.max_single_trade_usd`
- `execution_config.min_trade_size_usd`

---

## 3.4 Phase C: Hedge Instruments & Eligibility

### Step C.1 — Instrument Eligibility Grid

**Purpose:** Define which instruments are permitted under this policy.

**Research basis:** Bodnar, Hayt & Marston (1998) "Wharton Survey of Financial Risk Management by US Non-Financial Firms," *Financial Management*, establishes that forwards dominate corporate FX hedging (87% of respondents), with options used by 26%. ISDA 2023 Margin Survey reports that vanilla FX options under EMIR/Dodd-Frank require mandatory clearing above certain thresholds.

**Input fields:** A grid of instrument types with per-row configuration:

| Instrument | Allowed | Max Tenor | Requires Approval | Max Notional |
|---|---|---|---|---|
| FX Forward (deliverable) | Boolean | Days | Boolean | USD |
| FX NDF | Boolean | Days | Boolean | USD |
| FX Call Option | Boolean | Days | Boolean | USD |
| FX Put Option | Boolean | Days | Boolean | USD |
| FX Collar (zero-cost) | Boolean | Days | Boolean | USD |
| FX Swap | Boolean | Days | Boolean | USD |
| Cross-Currency Swap | Boolean | Days | Boolean | USD |

**Validation rules:**
- RULE-C1-001: At least one instrument must be allowed.
- RULE-C1-002: If `exclude_ndf = true` (from Step A.1 if EM pairs present), NDF row must be disabled and a warning displayed.
- RULE-C1-003: If `ifrs_compliance = true` and options are enabled, warn: "FX options must be formally designated as hedging instruments. Ineffective portions flow to P&L under IFRS 9.6.5."

**Output to CanonicalPolicy:**
- `constraints.allowed_instruments[]`
- `objectives.exclude_ndf`
- `objectives.exclude_fwd`

---

### Step C.2 — Liquidity Gate Configuration

**Purpose:** Define minimum liquidity requirements before a hedge instrument can be used.

**Input fields:**

| Field | Type | Default | Validation |
|---|---|---|---|
| `min_daily_volume_usd` | Number per instrument | 100000000 | ≥ 0 |
| `max_bid_ask_spread_bps` | Number per instrument | 10 | > 0 |
| `fallback_instrument` | Select | FX_FORWARD | Must be in allowed_instruments |

**Validation rules:**
- RULE-C2-001: `fallback_instrument` must be in the allowed instruments list.
- RULE-C2-002: If `max_bid_ask_spread_bps` for any instrument exceeds `cost_budget.max_spread_bps`, warn of conflict.

**Output to CanonicalPolicy:**
- `constraints.liquidity_gates[]`

---

### Step C.3 — Contract Sizing & Tenor Ladder

**Purpose:** Define tenor and notional constraints for execution.

**Input fields:**

| Field | Type | Default | Validation |
|---|---|---|---|
| `tenor_min_days` | Integer | 2 | ≥ 1 |
| `tenor_max_days` | Integer | 365 | > tenor_min_days |
| `roll_allowed` | Boolean | true | — |
| `roll_window_days_before_expiry` | Integer | 5 | 1–30 |
| `spread_bps` | Number | 5.0 | 0.5–50 |

**Output to CanonicalPolicy:**
- `constraints.tenor_constraints`
- `execution_config.cost_assumptions.spread_bps`

---

## 3.5 Phase D: Constraints & Budgets

### Step D.1 — Cost & Carry Budget

**Purpose:** Set maximum tolerable hedging cost as a percentage of notional.

**Research basis:** Géczy, Minton & Schrand (1997) "Why Firms Use Currency Derivatives," *Journal of Finance*, finds that firm-level cost constraints are the second-most-cited reason for under-hedging. Brown (2001) "Managing Foreign Exchange Risk with Derivatives," *Journal of Financial Economics*, documents that cost budgets materially constrain instrument selection.

**Input fields:**

| Field | Type | Default | Validation |
|---|---|---|---|
| `max_carry_cost_bps_annual` | Number | 50 | 0–500 |
| `max_option_premium_pct_notional` | Number | 1.5 | 0–5 |
| `max_spread_bps` | Number | 10 | 0–50 |
| `premium_budget_pct` | Slider 0–3 | 1.0 | 0–3 |

**Validation rules:**
- RULE-D1-001: If `max_option_premium_pct_notional < 0.5` and options are allowed (from Phase C), warn: "Premium budget of less than 0.5% will exclude most vanilla FX options from execution."
- RULE-D1-002: `max_spread_bps` must be ≥ `execution_config.cost_assumptions.spread_bps`. Error: "Maximum spread budget cannot be less than the assumed execution spread."

**Output to CanonicalPolicy:**
- `constraints.cost_budget`
- `risk_parameters.premium_budget_pct`

---

### Step D.2 — Margin & Leverage Configuration

**Input fields:**

| Field | Type | Default | Validation |
|---|---|---|---|
| `leverage_cap` | Number | 2.0 | 1.0–10.0 |
| `margin_budget_usd` | Number | 0 | ≥ 0 |

**Validation rules:**
- RULE-D2-001: If `leverage_cap > 5.0`, require `APPROVER` role to advance.
- RULE-D2-002: If options allowed and `margin_budget_usd = 0`, warn: "Options require margin. Set a margin budget or disable options."

**Output to CanonicalPolicy:**
- `constraints.leverage_cap`
- `constraints.margin_budget_usd`

---

### Step D.3 — Concentration Limits

**Input fields:** A table of concentration dimensions with per-row max_pct:

| Dimension | Max % | Default |
|---|---|---|
| INSTRUMENT | number | 80 |
| COUNTERPARTY | number | 40 |
| TENOR | number | 50 |
| CURRENCY | number | 60 |

**Validation rules:**
- RULE-D3-001: All `max_pct` values must be > 0 and ≤ 100.
- RULE-D3-002: `COUNTERPARTY` limit < 100 is recommended; if 100 (unlimited), warn of counterparty credit risk concentration.

**Output to CanonicalPolicy:**
- `constraints.concentration_limits[]`

---

### Step D.4 — Fail-Closed Rules

**Purpose:** Define automated circuit breakers that block, alert, or require approval when specified conditions are triggered.

**Input fields:** A rule builder with pre-defined conditions:

| Condition | Default Action |
|---|---|
| Hedge ratio exceeds max_ratio by >5% | ALERT |
| Single trade exceeds max_single_trade_usd | REQUIRE_APPROVAL |
| Counterparty concentration exceeds limit | BLOCK |
| Spread exceeds max_spread_bps | ALERT |
| Policy expired | BLOCK |
| Unapproved instrument selected | BLOCK |

**Output to CanonicalPolicy:**
- `constraints.fail_closed_rules[]`

---

## 3.6 Phase E: Scenarios & Stress

### Step E.1 — Standard Stress Pack Selection

**Purpose:** Select the stress testing intensity level and standard shock scenarios.

**Research basis:** Basel III Pillar 2 ICAAP requirements mandate stress testing of market risk positions. BCBS 2019 "Minimum Capital Requirements for Market Risk" (FRTB) establishes the Expected Shortfall framework. The BIS 2023 FX survey documents EM currency volatility realizations used for calibration.

**Input fields:**

| Field | Type | Default | Validation |
|---|---|---|---|
| `standard_stress_pack` | Select | `MODERATE_STRESS` | Required |
| `worst_case_focus` | Boolean | false | — |
| `confidence_bands.lower_pct` | Integer | 5 | 1–49 |
| `confidence_bands.upper_pct` | Integer | 95 | 51–99 |
| `back_test_window_days` | Integer | 252 | 21–1260 |

Standard stress packs and their default scenario shocks:

| Pack | Spot Shock % | Vol Shock % | Sovereign Spread Shock bps | Source Event |
|---|---|---|---|---|
| MILD_STRESS | ±5% | +5% | +50 | "2022 USD/MXN March dislocation" |
| MODERATE_STRESS | ±10% | +15% | +150 | "2020 COVID EM selloff" |
| SEVERE_STRESS | ±20% | +30% | +400 | "2018 BRL/TRY dual EM crisis" |
| TAIL_STRESS | ±35% | +60% | +1000 | "1994 Tequila Crisis / 2001 Argentine default" |

**Output to CanonicalPolicy:**
- `scenarios.standard_stress_pack`
- `scenarios.stress_scenarios[]`
- `scenarios.worst_case_focus`
- `scenarios.confidence_bands`
- `scenarios.back_test_window_days`

---

### Step E.2 — Custom Shock Calibration

**Purpose:** Allow custom stress scenario definition for company-specific tail events.

**Input fields:** For each custom scenario (max 5):

| Field | Type |
|---|---|
| `name` | Text |
| `description` | Text |
| `spot_shock_pct` | Number -100 to 100 |
| `vol_shock_pct` | Number 0 to 200 |
| `correlation_shock` | Number -1 to 1 |
| `sovereign_spread_shock_bps` | Number -1000 to 5000 |
| `source_event` | Text |
| `probability_assigned` | Number 0 to 1 |

**Output to CanonicalPolicy:**
- `scenarios.stress_scenarios[]` (appended to standard pack)

---

### Step E.3 — Governance Notes

**Purpose:** Record governance attestations required for stress testing documentation.

**Input fields:** Text fields for: stress testing rationale, sign-off by risk manager, date of last review.

**Output to CanonicalPolicy:**
- `disclosures.assumptions[]` (stress-related entries)
- `governance.disclosure_text`

---

## 3.7 Phase F: Review, Explainability & Governance

### Step F.1 — Policy Summary Sheet

**Purpose:** Present a complete summary of all configured fields for review before submission.

**UX:** Read-only summary card grid showing all 12 canonical sections with populated values highlighted and empty optional fields in muted gray. Each section has an "Edit" button linking back to the relevant step. A `PolicyQualityScore` badge is displayed prominently.

---

### Step F.2 — Determinism Statement

**Purpose:** Generate and display the machine-readable determinism attestation — the statement that the same inputs will always produce the same execution outputs.

**Content:** The system computes and displays:
1. SHA-256 hash of `execution_config` (the engine-binding section)
2. SHA-256 hash of the full `CanonicalPolicy` object
3. The engine version string
4. A human-readable statement: "This policy configuration, when submitted to the calculation engine, will deterministically produce the same hedge plan for any given set of trade, hedge, and market inputs. The policy hash is [hash]. The execution config hash is [hash]."

**Output to CanonicalPolicy:**
- `provenance.questionnaire_hash` (SHA-256 of wizard inputs)

---

### Step F.3 — Disclosures Registry

**Purpose:** Require explicit acknowledgment of key model assumptions and limitations.

**Content:** Displays all `AssumptionEntry` records that are system-generated (e.g., "Forward rate is interpolated from published forward points; intraday rates may differ"). User must acknowledge each `UNVERIFIED` or `LOW` confidence assumption. Reviewer field populated with current user_id and timestamp.

**Output to CanonicalPolicy:**
- `disclosures.assumptions[]`
- `disclosures.model_limitations[]`
- `disclosures.regulatory_disclaimers[]`

---

### Step F.4 — Approval Checklist

**Purpose:** Surface all governance conditions that must be satisfied before the policy can move from DRAFT to REVIEW.

**Checklist items (auto-computed):**
- [ ] `display_name` ≥ 3 chars
- [ ] `scope.currency_pairs` non-empty
- [ ] `execution_config` fully populated
- [ ] `risk_parameters.risk_appetite` set
- [ ] `audit_log` has CREATED entry
- [ ] `PolicyQualityScore` ≥ 60
- [ ] All `UNVERIFIED` assumptions acknowledged
- [ ] Board resolution reference provided (if requires_approval=true)

---

### Step F.5 — Committee Pack Export

**Purpose:** Generate a PDF summary suitable for presentation to a risk committee or board.

**Contents of exported pack:**
1. Policy identity and version
2. Applicability scope
3. Hedge ratio summary table
4. Instrument eligibility grid
5. Stress scenario results (from Phase E)
6. PolicyQualityScore with sub-scores
7. Audit trail excerpt (last 10 entries)
8. Disclosures registry
9. Determinism attestation with hashes

---

## 3.8 Phase G: Publish & Version Control

### Step G.1 — Save Draft / Save Final Workflow

**Save Draft (status = DRAFT):**
- Requires only: `display_name`, `execution_config` populated
- Does not enforce governance checklist
- Can be edited freely
- Not available for calculation engine binding (active policies only)

**Save Final (status = REVIEW):**
- Requires full governance checklist completion
- Triggers notification to all `approvers` in `governance.approvers[]`
- Policy becomes read-only pending approval

**APPROVED → ACTIVE transition:**
- Requires `approver_user_id` with APPROVER role
- Creates immutable snapshot of `execution_config`
- Increments `versioning.version` (PATCH if only metadata changed; MINOR if execution_config changed; MAJOR if scope or objectives changed)
- Policy is now engine-bindable

---

### Step G.2 — Immutable Final Policy Rules

Once a policy reaches APPROVED status:
1. `execution_config` is immutable — any change creates a new version
2. `audit_log` is append-only — no entries can be removed
3. `status` can only transition: APPROVED → ACTIVE → SUSPENDED → ARCHIVED (no reversal to DRAFT)
4. `versioning.parent_policy_id` is set to the UUID of the previous APPROVED version
5. The previous version is automatically set to ARCHIVED on new version ACTIVE transition

---

### Step G.3 — Clone + Edit Workflow

A policy can be cloned from any status (DRAFT, REVIEW, APPROVED, ACTIVE, ARCHIVED). The clone:
- Receives a new `policy_id` (UUID)
- Sets `versioning.parent_policy_id` to the source policy's `policy_id`
- Sets `status = DRAFT`
- Sets `provenance.source = 'MANUAL_EDIT'`
- Adds `AuditLogEntry { event_type: 'CLONED', description: 'Cloned from policy [source_id]' }`
- Resets `provenance.approved_by` and `provenance.approved_at`

---

### Step G.4 — Quality Score Rubric Summary

| Sub-Score | Weight | Threshold for ACTIVE | Formula |
|---|---|---|---|
| CompletenessScore | 30% | ≥ 60 | Weighted field presence |
| GovernanceScore | 35% | ≥ 50 | Governance field presence |
| RiskDefinitionScore | 20% | ≥ 40 | Risk parameter coverage |
| DisclosureScore | 15% | ≥ 30 | Disclosure text coverage |
| **Total QualityScore** | 100% | **≥ 60** | Weighted sum |

Policies with QualityScore < 60 display a warning banner but are not blocked from DRAFT status. Policies with QualityScore < 40 display an ERROR banner and are blocked from REVIEW transition.

---

# SECTION 4: ENTRY-POINT RECONCILIATION PLAN

## 4.1 Complete Field Mapping Table

| Field Name | WizardAnswers (Modal, OLD) | WizardState (Page, NEW/UNIFIED) | CanonicalPolicy Section | Gap/Action |
|---|---|---|---|---|
| `industry` | `industry: string` | `industrySector: string` | `classification.industry_sector` | Renamed. Normalization: `qa.industry = state.industrySector \|\| state.companyType`. |
| `company_size` | `company_size: CompanySize` (direct) | Derived: `volumeToCompanySize(vol)` | `classification.company_size` | Modal is exact; page approximates. Action: Add direct `companySize` field to WizardState. Normalization: use direct if available, else derive. |
| `annual_fx_volume_usd` | Direct `number` | Derived from `annualExposure` tier | `business_profile.annual_fx_volume_usd` | Modal is exact; page has ±40% tier error. Action: Add exact input option to page. Keep tier as default for Entry A. |
| `primary_currency_pair` | Direct `string` | Derived: `fxCorridors[0]` or `USD/${primaryCurrency}` | `business_profile.primary_currency_pair`, `scope.currency_pairs` | Modal single value; page is multi-corridor aware. Action: normalize pair direction to ISO convention (base/quote). |
| `cash_flow_predictability` | Direct enum | Derived: `certaintyToPredictability(cashFlowCertainty)` | `business_profile.cash_flow_predictability` | Modal direct; page derived. Normalization unchanged — both are valid paths. |
| `risk_appetite` | Direct enum | Derived: `priorityToRiskAppetite(costProtectionPriority)` | `risk_parameters.risk_appetite` | Non-determinism risk at slider boundaries. Action: Expose direct enum selector in unified WizardState as alternative to slider. |
| `cost_sensitivity` | Direct enum | Derived: `budgetToCostSensitivity(premiumBudget)` | `risk_parameters.cost_sensitivity` | Same issue as risk_appetite. Same fix. |
| `time_horizon_months` | Direct `number` | Derived: `TENOR_TO_MONTHS[averageTenor]` | `risk_parameters.time_horizon_months` | Modal is exact; page maps tenor label to months. Note: tenor label and time horizon are different concepts — "tenor" = average trade maturity, "horizon" = policy window. These should not be conflated. Action: Separate fields. |
| `hedge_objective` | Direct `string` | Derived: `state.primaryObjective` | `objectives.primary_objective` | Direct rename. No gap. |
| `has_confirmed_orders` | `boolean` in WizardAnswers | NOT PRESENT | Not in CanonicalPolicy | Dropped. Action: Add to unified WizardState. Map to `business_profile.has_confirmed_orders` (new field). |
| `confirmed_to_forecast_ratio` | Direct `0.0–1.0` | Derived: `cashFlowCertainty / 100` | `business_profile.confirmed_to_forecast_ratio` | Modal is direct; page divides certainty slider. These measure different things. Action: Add separate `confirmedToForecastRatio` slider to WizardState. |
| `avg_transaction_size_usd` | Direct `number` | NOT PRESENT | `business_profile.avg_transaction_size_usd` | Present in modal only. Action: Add to unified WizardState. |
| `payment_frequency` | Direct enum | NOT PRESENT | `business_profile.payment_frequency` | Present in modal only. Action: Add to unified WizardState. |
| `max_hedge_cost_pct` | Direct `number` | Implicit in `premiumBudget` slider | `risk_parameters.max_hedge_cost_pct` | Modal direct; page uses slider with different scale (0–3%). Action: Normalize both to percentage (0–100). |
| `board_constraints` | `string` | `boardStatement: string` | `objectives.board_statement` | Renamed. No gap. |
| `exclude_ndf` | Direct `boolean` | Derived: `!instrumentPreferences.includes('NDFs')` | `objectives.exclude_ndf` | Non-determinism: page derives from preferences array. Action: Maintain both. If `instrumentPreferences` present, derive. If explicit field present, use direct. |
| `exclude_fwd` | Direct `boolean` | Derived: `!instrumentPreferences.includes('Forwards')` | `objectives.exclude_fwd` | Same as above. |
| `companyType` | NOT PRESENT | `string` | `business_profile.company_type` | Page only. Action: Add to unified WizardState for both flows. Entry A can pre-fill from industry selection. |
| `primaryCurrency` | NOT PRESENT | `string` | `business_profile.primary_currency` | Page only. Action: Add to unified WizardState. |
| `hedgeExperience` | NOT PRESENT | `string` | `business_profile.hedge_experience` | Page only. Action: Add to unified WizardState. Hidden in Entry A (Fast Guided Flow). |
| `cashFlowVisibility` | NOT PRESENT | `string` | `business_profile.cash_flow_visibility` | Page only. Action: Add to unified WizardState. |
| `receivableSplit` | NOT PRESENT | `number` | `business_profile.receivable_split` | Page only. Action: Add to unified WizardState. |
| `seasonalPatterns` | NOT PRESENT | `string` | `business_profile.seasonal_patterns` | Page only. Action: Add to unified WizardState. Hidden in Entry A. |
| `nettingAvailable` | NOT PRESENT | `boolean` | `business_profile.netting_available` | Page only. Action: Add to unified WizardState. |
| `varConfidence` | NOT PRESENT | `string` | `risk_parameters.var_confidence` | Page only. Action: Add to unified WizardState. Hidden in Entry A. |
| `drawdownTolerance` | NOT PRESENT | `string` | `risk_parameters.drawdown_tolerance` | Page only. Action: Add to unified WizardState. Hidden in Entry A. |
| `costProtectionPriority` | NOT PRESENT | `number` 0–100 | `risk_parameters.cost_protection_priority` | Page only. Action: Expose in both flows. |
| `premiumBudget` | NOT PRESENT | `number` 0–3 | `risk_parameters.premium_budget_pct` | Page only. Scale: 0–3% of notional. Add to unified WizardState. |
| `instrumentPreferences[]` | NOT PRESENT | `string[]` | `objectives.instrument_preferences` | Page only. Critical gap in modal — modal users cannot express instrument preferences. Action: Add to unified WizardState; forward to QuestionnaireAnswers (currently dropped). |
| `hedgeRatioTarget` | NOT PRESENT | `number` 0–100 | `objectives.hedge_ratio_target` | Page only. Must be added to QuestionnaireAnswers so AI respects it. |
| `rollingHedge` | NOT PRESENT | `boolean` | `objectives.rolling_hedge` | Page only. Add to unified WizardState. |
| `rollingTenor` | NOT PRESENT | `string` | `objectives.rolling_tenor` | Page only. Add to unified WizardState. |
| `ifrsCompliance` | NOT PRESENT | `boolean` | `objectives.ifrs_compliance` | Page only. CRITICAL gap in modal — IFRS-reporting companies using the modal get no compliance flag. Must add to unified WizardState and forward to QuestionnaireAnswers. |
| `benchmark` | NOT PRESENT | `string` | `objectives.benchmark` | Page only. Add to unified WizardState. |
| `fxCorridors[]` | NOT PRESENT | `string[]` | `business_profile.fx_corridors`, `scope.currency_pairs` | Page only. Multi-corridor support. Modal supports only `primary_currency_pair`. Action: Replace `primary_currency_pair` in modal with `fxCorridors[]` (min 1 entry). |

## 4.2 Fast Guided Flow (Entry A: Modal) Specification

**Target user:** First-time user or SME with < 5 minutes to configure a policy.

**Phases exposed:** Condensed 4-step linear flow:
1. "About Your Business" (combines A.1 + A.2 + B.1)
2. "Risk Preferences" (combines D.1 + C.1 implicit)
3. "AI Recommendation" (AI call + 3 preset cards)
4. "Name & Save" (identity + optional governance)

**Pre-filled defaults for fields hidden in Entry A:**
- `rolling_hedge = false`
- `layered_approach = false`
- `netting_available = false`
- `seasonal_patterns = 'None'`
- `ifrs_compliance = false` (warned: "If you file under IFRS 9 or ASC 815, use Advanced Flow")
- `standard_stress_pack = 'MODERATE_STRESS'`
- `leverage_cap = 2.0`
- `concentration_limits` = system defaults
- `fail_closed_rules` = system defaults
- `artifacts_produced = ['HEDGE_PLAN']`
- `execution_mode = 'MANUAL_CONFIRM'`

**Fields exposed in Entry A:**
- `companyType`, `primaryCurrency`, `annualExposure` (tier selector)
- `cash_flow_certainty` (slider)
- `risk_appetite` (3-option card: Conservative / Balanced / Active)
- `hedge_objective` (text or 3-option card)
- `primary_currency_pair` (derived from primaryCurrency; user can override)

**QuestionnaireAnswers fields forwarded to AI (expanded for Entry A):**
All 9 existing fields plus: `ifrs_compliance`, `instrument_preferences` (defaults to ['Forwards', 'NDFs']), `rolling_hedge`, `hedge_ratio_target`.

## 4.3 Advanced Full Cockpit (Entry B: Page) Specification

**Target user:** Treasury professional or FX manager with institutional-grade requirements.

**Phases exposed:** All 7 phases (A through G), all steps, all fields.

**Fields exposed that Entry A hides:**
All 34+ fields listed in Section 4.1 that are marked "Hidden in Entry A".

**Governance enforcement:** Entry B enforces the full approval checklist before REVIEW transition. Entry A allows REVIEW with a reduced checklist (12 items instead of the full 20-item institutional checklist).

**How both write identical CanonicalPolicy objects:** Both flows call the same `buildCanonicalPolicy(unifiedWizardState: UnifiedWizardState, aiResult: AIPolicyResult, selectedRec: AIPolicyRecommendation): CanonicalPolicy` function. Entry A's `UnifiedWizardState` has pre-filled defaults for all fields it does not collect; Entry B's `UnifiedWizardState` has user-provided values for all fields. The assembler function is identical — there is no code branching based on entry point.

The `entry_point` field in `provenance` records which flow was used for audit purposes, but it does not affect the structure of the output object.
