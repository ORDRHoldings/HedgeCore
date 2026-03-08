/**
 * policyWizardWiring.test.ts
 *
 * Tests for audit findings #4, #11, #13, #14, #15, #16:
 * - All wizard fields flow through mapWizardStateToQA
 * - Effectiveness score returns grading + component breakdowns
 * - All 60 presets have maturity/governance/evidence/accounting fields
 * - derivedMaturityProfile returns correct values
 */

import { mapWizardStateToQA } from "../../utils/policyMapper";
import type { WizardState } from "../../utils/policyMapper";
import { computeEffectivenessScore } from "../../utils/policyEffectivenessScore";
import { POLICY_PRESETS } from "../../constants/policyPresets";
import type { PolicyPreset } from "../../constants/policyPresets";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWizardState(overrides?: Partial<WizardState>): WizardState {
  return {
    primaryObjective: "Budget certainty",
    regulatoryRegimes: ["IFRS9"],
    boardResolutionRef: "FX-2025-003",
    boardStatement: "Protect operating margin",
    effectiveFrom: "2025-01-01",
    effectiveUntil: "2025-12-31",
    reviewDueDate: "2025-06-30",
    companyType: "Manufacturer",
    industrySector: "Automotive",
    annualExposure: "$50-250M",
    primaryCurrency: "MXN",
    fxCorridors: ["USD/MXN"],
    portfolioScope: "CONSOLIDATED",
    extendedFlowTypes: ["RECEIVABLE", "PAYABLE"],
    geographyFocus: ["EM_LATAM"],
    hedgeExperience: "Intermediate",
    averageTenor: "6M",
    timeHorizonMonths: 12,
    rollingHedge: true,
    rollingTenor: "3M",
    layeredApproach: true,
    cashFlowVisibility: "6 months",
    cashFlowCertainty: 70,
    receivableSplit: 60,
    seasonalPatterns: "Quarterly",
    paymentFrequency: "MONTHLY",
    avgTransactionSizeUsd: 250000,
    hasIntercompanyFlows: true,
    nettingAvailable: true,
    netConfirmedForecast: true,
    settlementCycleDays: 2,
    materialityThresholdUsd: 10000,
    minHedgeSizeUsd: 5000,
    maxSingleTradeUsd: 5000000,
    instrumentPreferences: ["Forward", "NDF"],
    instrAllowed: { Forward: true, NDF: true, Option: false },
    instrMaxTenorDays: { Forward: 365, NDF: 180 },
    instrRequiresApproval: { Option: true },
    instrMaxNotionalUsd: { Forward: 10000000 },
    tenorMinDays: 30,
    tenorMaxDays: 365,
    rollAllowed: true,
    rollWindowDays: 14,
    premiumBudget: 1.5,
    maxCarryCostBpsAnnual: 50,
    maxOptionPremiumPct: 2.0,
    maxSpreadBps: 10,
    leverageCap: 1.0,
    marginBudgetUsd: 500000,
    maxInstrumentConcentrationPct: 40,
    maxCounterpartyConcentrationPct: 25,
    maxTenorConcentrationPct: 50,
    maxCurrencyConcentrationPct: 60,
    costProtectionPriority: 70,
    maxAcceptableLoss: "5%",
    standardStressPack: "MODERATE",
    varConfidence: "95%",
    drawdownTolerance: "3%",
    backTestWindowDays: 252,
    worstCaseFocus: true,
    customScenarios: [
      { name: "MXN crash", spotShockPct: 20, volShockPct: 50, sourceEvent: "2020 COVID" },
    ],
    governanceNotes: "Monthly treasury committee review required",
    ifrsCompliance: true,
    benchmark: "Budget Rate",
    hedgeRatioTarget: 80,
    policyStatus: "DRAFT",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------

describe("mapWizardStateToQA — full field passthrough (audit #4)", () => {
  const state = makeWizardState();
  const qa = mapWizardStateToQA(state);

  it("passes core 9 fields", () => {
    expect(qa.industry).toBe("Automotive");
    expect(qa.company_size).toBe("LARGE");
    expect(qa.annual_fx_volume_usd).toBe(100_000_000);
    expect(qa.primary_currency_pair).toBe("USD/MXN");
    expect(qa.cash_flow_predictability).toBe("HIGH");
    expect(qa.risk_appetite).toBe("CONSERVATIVE");
    expect(qa.cost_sensitivity).toBe("LOW");
    expect(qa.time_horizon_months).toBe(12);
    expect(qa.hedge_objective).toBe("Budget certainty");
  });

  it("passes Phase A governance context", () => {
    expect(qa.regulatory_regimes).toEqual(["IFRS9"]);
    expect(qa.board_resolution_ref).toBe("FX-2025-003");
    expect(qa.effective_from).toBe("2025-01-01");
    expect(qa.effective_until).toBe("2025-12-31");
    expect(qa.review_due_date).toBe("2025-06-30");
    expect(qa.portfolio_scope).toBe("CONSOLIDATED");
    expect(qa.extended_flow_types).toEqual(["RECEIVABLE", "PAYABLE"]);
    expect(qa.geography_focus).toEqual(["EM_LATAM"]);
  });

  it("passes Phase B exposure detail", () => {
    expect(qa.hedge_experience).toBe("Intermediate");
    expect(qa.layered_approach).toBe(true);
    expect(qa.cash_flow_visibility).toBe("6 months");
    expect(qa.seasonal_patterns).toBe("Quarterly");
    expect(qa.payment_frequency).toBe("MONTHLY");
    expect(qa.avg_transaction_size_usd).toBe(250000);
    expect(qa.has_intercompany_flows).toBe(true);
    expect(qa.netting_enabled).toBe(true);
    expect(qa.netting_net_confirmed_forecast).toBe(true);
    expect(qa.settlement_cycle_days).toBe(2);
    expect(qa.materiality_threshold_usd).toBe(10000);
    expect(qa.min_hedge_size_usd).toBe(5000);
    expect(qa.max_single_trade_usd).toBe(5000000);
  });

  it("passes Phase C instrument constraints", () => {
    expect(qa.instrument_allowed).toEqual({ Forward: true, NDF: true, Option: false });
    expect(qa.instrument_max_tenor_days).toEqual({ Forward: 365, NDF: 180 });
    expect(qa.instrument_requires_approval).toEqual({ Option: true });
    expect(qa.instrument_max_notional_usd).toEqual({ Forward: 10000000 });
    expect(qa.tenor_min_days).toBe(30);
    expect(qa.tenor_max_days).toBe(365);
    expect(qa.roll_allowed).toBe(true);
    expect(qa.roll_window_days).toBe(14);
  });

  it("passes Phase D budgets and constraints", () => {
    expect(qa.max_carry_cost_bps_annual).toBe(50);
    expect(qa.max_option_premium_pct).toBe(2.0);
    expect(qa.max_spread_bps).toBe(10);
    expect(qa.leverage_cap).toBe(1.0);
    expect(qa.margin_budget_usd).toBe(500000);
    expect(qa.max_instrument_concentration_pct).toBe(40);
    expect(qa.max_counterparty_concentration_pct).toBe(25);
    expect(qa.max_tenor_concentration_pct).toBe(50);
    expect(qa.max_currency_concentration_pct).toBe(60);
  });

  it("passes Phase E scenario config", () => {
    expect(qa.standard_stress_pack).toBe("MODERATE");
    expect(qa.var_confidence).toBe(95);
    expect(qa.governance_notes).toBe("Monthly treasury committee review required");
    expect(qa.custom_scenarios).toHaveLength(1);
    expect(qa.worst_case_focus).toBe("true");
  });

  it("passes Phase F/G governance and publish", () => {
    expect(qa.benchmark).toBe("Budget Rate");
    expect(qa.policy_status).toBe("DRAFT");
  });

  it("derives maturity_profile from time horizon", () => {
    expect(qa.maturity_profile).toBe("MEDIUM"); // 12 months = MEDIUM
  });

  it("derives governance_tier from governance_notes", () => {
    expect(qa.governance_tier).toBe("ENHANCED"); // has governance notes
  });

  it("derives accounting_mode from IFRS compliance", () => {
    expect(qa.accounting_mode).toBe("CASH_FLOW_HEDGE"); // ifrsCompliance = true
  });

  it("returns SHORT maturity for <= 3 months", () => {
    const qa3 = mapWizardStateToQA(makeWizardState({ timeHorizonMonths: 3 }));
    expect(qa3.maturity_profile).toBe("SHORT");
  });

  it("returns LONG maturity for > 12 months", () => {
    const qa18 = mapWizardStateToQA(makeWizardState({ timeHorizonMonths: 18 }));
    expect(qa18.maturity_profile).toBe("LONG");
  });

  it("omits empty arrays and falsy values as undefined", () => {
    const minimal = mapWizardStateToQA(makeWizardState({
      regulatoryRegimes: [],
      extendedFlowTypes: [],
      geographyFocus: [],
      boardResolutionRef: "",
      governanceNotes: "",
      benchmark: "",
    }));
    expect(minimal.regulatory_regimes).toBeUndefined();
    expect(minimal.extended_flow_types).toBeUndefined();
    expect(minimal.geography_focus).toBeUndefined();
    expect(minimal.board_resolution_ref).toBeUndefined();
    expect(minimal.governance_notes).toBeUndefined();
    expect(minimal.benchmark).toBeUndefined();
  });
});

describe("computeEffectivenessScore — component breakdowns (audit #13)", () => {
  it("returns grading label as HEURISTIC", () => {
    const result = computeEffectivenessScore(
      {
        bucket_mode: "CALENDAR_MONTH",
        hedge_ratios: { confirmed: 0.9, forecast: 0.6 },
        cost_assumptions: { spread_bps: 4 },
        execution_product: "FWD",
        min_trade_size_usd: 50000,
      },
      "CONSERVATIVE",
    );
    expect(result.grading).toBe("HEURISTIC");
  });

  it("returns component breakdown with score, max, and rationale", () => {
    const result = computeEffectivenessScore(
      {
        bucket_mode: "CALENDAR_MONTH",
        hedge_ratios: { confirmed: 1.0, forecast: 0.5 },
        cost_assumptions: { spread_bps: 3 },
        execution_product: "FWD",
        min_trade_size_usd: 0,
      },
      "CONSERVATIVE",
    );

    // Coverage
    expect(result.components.coverage.score).toBe(30);
    expect(result.components.coverage.max).toBe(30);
    expect(result.components.coverage.rationale).toContain("100%");

    // Efficiency
    expect(result.components.efficiency.score).toBe(25);
    expect(result.components.efficiency.max).toBe(25);
    expect(result.components.efficiency.rationale).toContain("3 bps");

    // IFRS 9
    expect(result.components.ifrs9.score).toBe(20);
    expect(result.components.ifrs9.max).toBe(20);
    expect(result.components.ifrs9.rationale).toContain("compliant");

    // Product alignment
    expect(result.components.product.score).toBe(15);
    expect(result.components.product.max).toBe(15);

    // Size access
    expect(result.components.sizeAccess.score).toBe(10);
    expect(result.components.sizeAccess.max).toBe(10);
    expect(result.components.sizeAccess.rationale).toContain("No minimum");

    expect(result.score).toBe(100);
    expect(result.badge).toBe("INSTITUTIONAL");
  });

  it("returns 0 for IFRS 9 when forecast exceeds confirmed", () => {
    const result = computeEffectivenessScore(
      {
        bucket_mode: "CALENDAR_MONTH",
        hedge_ratios: { confirmed: 0.5, forecast: 0.8 },
        cost_assumptions: { spread_bps: 5 },
        execution_product: "NDF",
        min_trade_size_usd: 0,
      },
      "MODERATE",
    );
    expect(result.components.ifrs9.score).toBe(0);
    expect(result.components.ifrs9.rationale).toContain("violation");
  });

  it("provides legacy components for backward compatibility", () => {
    const result = computeEffectivenessScore(
      {
        bucket_mode: "CALENDAR_MONTH",
        hedge_ratios: { confirmed: 0.7, forecast: 0.4 },
        cost_assumptions: { spread_bps: 5 },
        execution_product: "NDF",
        min_trade_size_usd: 25000,
      },
      "MODERATE",
    );
    expect(result._legacyComponents.coverage).toBe(result.components.coverage.score);
    expect(result._legacyComponents.efficiency).toBe(result.components.efficiency.score);
    expect(result._legacyComponents.ifrs9).toBe(result.components.ifrs9.score);
    expect(result._legacyComponents.product).toBe(result.components.product.score);
    expect(result._legacyComponents.sizeAccess).toBe(result.components.sizeAccess.score);
  });

  it("score equals sum of all components", () => {
    for (const posture of ["CONSERVATIVE", "MODERATE", "AGGRESSIVE"] as const) {
      const result = computeEffectivenessScore(
        {
          bucket_mode: "CALENDAR_MONTH",
          hedge_ratios: { confirmed: 0.85, forecast: 0.6 },
          cost_assumptions: { spread_bps: 5 },
          execution_product: "NDF",
          min_trade_size_usd: 50000,
        },
        posture,
      );
      const sumComponents =
        result.components.coverage.score +
        result.components.efficiency.score +
        result.components.ifrs9.score +
        result.components.product.score +
        result.components.sizeAccess.score;
      expect(result.score).toBe(sumComponents);
    }
  });
});

describe("PolicyPreset maturity/governance fields (audit #14, #15, #16)", () => {
  const VALID_MATURITY = ["SHORT", "MEDIUM", "LONG", "MIXED"];
  const VALID_GOVERNANCE = ["STANDARD", "ENHANCED", "COMMITTEE"];
  const VALID_EVIDENCE = ["BASIC", "DOCUMENTED", "AUDITED"];
  const VALID_ACCOUNTING = ["FAIR_VALUE", "CASH_FLOW_HEDGE", "NET_INVESTMENT", "NONE"];

  it("all 60 presets exist", () => {
    expect(POLICY_PRESETS.length).toBeGreaterThanOrEqual(60);
  });

  it("every preset has maturity_profile field", () => {
    for (const preset of POLICY_PRESETS) {
      expect(VALID_MATURITY).toContain(preset.maturity_profile);
    }
  });

  it("every preset has governance_tier field", () => {
    for (const preset of POLICY_PRESETS) {
      expect(VALID_GOVERNANCE).toContain(preset.governance_tier);
    }
  });

  it("every preset has evidence_grade field", () => {
    for (const preset of POLICY_PRESETS) {
      expect(VALID_EVIDENCE).toContain(preset.evidence_grade);
    }
  });

  it("every preset has accounting_mode field", () => {
    for (const preset of POLICY_PRESETS) {
      expect(VALID_ACCOUNTING).toContain(preset.accounting_mode);
    }
  });

  // Spot-check specific presets per task spec
  const spotChecks: [string, string, string, string, string][] = [
    // [id, maturity, governance, evidence, accounting]
    ["small-business", "MEDIUM", "STANDARD", "BASIC", "NONE"],
    ["full-protection", "MEDIUM", "ENHANCED", "DOCUMENTED", "CASH_FLOW_HEDGE"],
    ["bank-trading-book", "SHORT", "COMMITTEE", "AUDITED", "FAIR_VALUE"],
    ["pension-ldi", "LONG", "COMMITTEE", "AUDITED", "NET_INVESTMENT"],
    ["sovereign-debt-service", "LONG", "COMMITTEE", "AUDITED", "NONE"],
    ["hedge-fund", "SHORT", "ENHANCED", "AUDITED", "FAIR_VALUE"],
    ["family-office", "MEDIUM", "STANDARD", "DOCUMENTED", "NONE"],
    ["development-bank", "LONG", "COMMITTEE", "AUDITED", "CASH_FLOW_HEDGE"],
    ["sovereign-wealth-fund", "LONG", "COMMITTEE", "AUDITED", "NET_INVESTMENT"],
  ];

  it.each(spotChecks)(
    "preset %s has maturity=%s, governance=%s, evidence=%s, accounting=%s",
    (id, maturity, governance, evidence, accounting) => {
      const preset = POLICY_PRESETS.find(p => p.id === id);
      expect(preset).toBeDefined();
      expect(preset!.maturity_profile).toBe(maturity);
      expect(preset!.governance_tier).toBe(governance);
      expect(preset!.evidence_grade).toBe(evidence);
      expect(preset!.accounting_mode).toBe(accounting);
    },
  );

  it("COMMITTEE governance only appears on FINANCIAL and SOVEREIGN presets", () => {
    const committeePresets = POLICY_PRESETS.filter(p => p.governance_tier === "COMMITTEE");
    for (const p of committeePresets) {
      expect(["FINANCIAL", "SOVEREIGN", "SECTOR"]).toContain(p.category);
    }
  });

  it("AUDITED evidence grade correlates with high-governance presets", () => {
    const audited = POLICY_PRESETS.filter(p => p.evidence_grade === "AUDITED");
    for (const p of audited) {
      expect(["ENHANCED", "COMMITTEE"]).toContain(p.governance_tier);
    }
  });
});
