/**
 * reportCalcs.test.ts
 *
 * Comprehensive unit tests for all functions in reportCalcs.ts.
 *
 * Covers:
 * - bucketCoverageRatios: coverage classification per bucket
 * - flowComposition: confirmed/forecast flow breakdown
 * - concentrationAnalysis: peak bucket and HHI
 * - instrumentMix: directional trade counts
 * - scenarioKpis: worst-case, avg reduction, tail risk, efficiency
 * - policyComplianceChecks: 5-check compliance with scoring
 * - cashflowVolatility: std dev and coefficient of variation
 * - vulnerabilityRanking: per-bucket worst-case ranking
 * - riskPostureClassification: CONSERVATIVE/BALANCED/AGGRESSIVE
 * - generateExecutiveNarrative: structured narrative lines
 * - extractExtendedKpis: extended engine data extraction
 * - extendedDataAvailable: null/empty guard
 */

import {
  bucketCoverageRatios,
  flowComposition,
  concentrationAnalysis,
  instrumentMix,
  scenarioKpis,
  policyComplianceChecks,
  cashflowVolatility,
  vulnerabilityRanking,
  riskPostureClassification,
  generateExecutiveNarrative,
  extractExtendedKpis,
  extendedDataAvailable,
} from "../../utils/reportCalcs";
import type {
  ExtendedEngineData,
} from "../../utils/reportCalcs";
import type {
  BucketResult,
  HedgePlanSummary,
  ScenarioTotalResult,
  ScenarioBucketResult,
  PolicyConfig,
} from "../../api/types";

// ── Test Data Factories ──────────────────────────────────────────────────────

function makeBucket(overrides: Partial<BucketResult> = {}): BucketResult {
  return {
    bucket: "2025-01",
    commercial_exposure_mxn: 1000000,
    confirmed_flow_mxn: 600000,
    forecast_flow_mxn: 400000,
    existing_hedges_mxn: 500000,
    hedge_position_mxn: 800000,
    target_signed_mxn: -900000,
    action_mxn: 300000,
    action_usd: 15000,
    action_direction: "SELL_MXN_BUY_USD",
    forward_rate: 20.12,
    carry_note: "",
    friction_usd: 500,
    residual_mxn: 200000,
    suppressed: false,
    ...overrides,
  };
}

function makeSummary(overrides: Partial<HedgePlanSummary> = {}): HedgePlanSummary {
  return {
    total_commercial_exposure_mxn: 5000000,
    total_existing_hedges_mxn: 2000000,
    total_action_mxn: 2000000,
    total_action_usd: 100000,
    total_friction_usd: 25000,
    total_hedge_position_mxn: 4000000,
    total_residual_mxn: 1000000,
    ...overrides,
  };
}

function makePolicy(overrides: Partial<PolicyConfig> = {}): PolicyConfig {
  return {
    bucket_mode: "CALENDAR_MONTH",
    hedge_ratios: { confirmed: 1.0, forecast: 0.5 },
    cost_assumptions: { spread_bps: 5 },
    execution_product: "NDF",
    min_trade_size_usd: 10000,
    ...overrides,
  };
}

function makeScenarioTotal(overrides: Partial<ScenarioTotalResult> = {}): ScenarioTotalResult {
  return {
    sigma: 0.05,
    shocked_spot: 20.5,
    total_unhedged_usd: -50000,
    total_hedged_usd: -20000,
    total_hedge_benefit_usd: 30000,
    ...overrides,
  };
}

function makeScenarioBucket(overrides: Partial<ScenarioBucketResult> = {}): ScenarioBucketResult {
  return {
    bucket: "2025-01",
    sigma: 0.10,
    shocked_spot: 21.0,
    unhedged_usd: -25000,
    hedged_usd: -10000,
    hedge_benefit_usd: 15000,
    ...overrides,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// bucketCoverageRatios
// ═════════════════════════════════════════════════════════════════════════════

describe("bucketCoverageRatios", () => {
  it("classifies hedged/exposure ratio as MATCHED when within 0.95-1.05", () => {
    const buckets = [makeBucket({ commercial_exposure_mxn: 1000000, hedge_position_mxn: 1000000 })];
    const result = bucketCoverageRatios(buckets);
    expect(result).toHaveLength(1);
    expect(result[0].ratio).toBeCloseTo(1.0, 5);
    expect(result[0].status).toBe("MATCHED");
  });

  it("classifies ratio > 1.05 as OVER", () => {
    const buckets = [makeBucket({ commercial_exposure_mxn: 1000000, hedge_position_mxn: 1200000 })];
    const result = bucketCoverageRatios(buckets);
    expect(result[0].ratio).toBeCloseTo(1.2, 5);
    expect(result[0].status).toBe("OVER");
  });

  it("classifies ratio < 0.95 as UNDER", () => {
    const buckets = [makeBucket({ commercial_exposure_mxn: 1000000, hedge_position_mxn: 500000 })];
    const result = bucketCoverageRatios(buckets);
    expect(result[0].ratio).toBeCloseTo(0.5, 5);
    expect(result[0].status).toBe("UNDER");
  });

  it("handles zero exposure gracefully (ratio = 0)", () => {
    const buckets = [makeBucket({ commercial_exposure_mxn: 0, hedge_position_mxn: 0 })];
    const result = bucketCoverageRatios(buckets);
    expect(result[0].ratio).toBe(0);
    expect(result[0].status).toBe("UNDER");
  });

  it("returns empty array for empty input", () => {
    expect(bucketCoverageRatios([])).toEqual([]);
  });

  it("boundary: ratio exactly 1.05 is MATCHED (not OVER)", () => {
    // ratio = 1050000 / 1000000 = 1.05
    const buckets = [makeBucket({ commercial_exposure_mxn: 1000000, hedge_position_mxn: 1050000 })];
    const result = bucketCoverageRatios(buckets);
    expect(result[0].ratio).toBeCloseTo(1.05, 5);
    expect(result[0].status).toBe("MATCHED");
  });

  it("boundary: ratio exactly 0.95 is MATCHED (not UNDER)", () => {
    const buckets = [makeBucket({ commercial_exposure_mxn: 1000000, hedge_position_mxn: 950000 })];
    const result = bucketCoverageRatios(buckets);
    expect(result[0].ratio).toBeCloseTo(0.95, 5);
    expect(result[0].status).toBe("MATCHED");
  });

  it("boundary: ratio 1.050001 is OVER", () => {
    const buckets = [makeBucket({ commercial_exposure_mxn: 1000000, hedge_position_mxn: 1050001 })];
    const result = bucketCoverageRatios(buckets);
    expect(result[0].status).toBe("OVER");
  });

  it("handles negative exposure values correctly (uses abs)", () => {
    const buckets = [makeBucket({ commercial_exposure_mxn: -1000000, hedge_position_mxn: -1000000 })];
    const result = bucketCoverageRatios(buckets);
    expect(result[0].ratio).toBeCloseTo(1.0, 5);
    expect(result[0].status).toBe("MATCHED");
  });

  it("correctly maps bucket names through", () => {
    const buckets = [
      makeBucket({ bucket: "2025-03", commercial_exposure_mxn: 500000, hedge_position_mxn: 500000 }),
      makeBucket({ bucket: "2025-04", commercial_exposure_mxn: 500000, hedge_position_mxn: 250000 }),
    ];
    const result = bucketCoverageRatios(buckets);
    expect(result[0].bucket).toBe("2025-03");
    expect(result[1].bucket).toBe("2025-04");
    expect(result[0].status).toBe("MATCHED");
    expect(result[1].status).toBe("UNDER");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// flowComposition
// ═════════════════════════════════════════════════════════════════════════════

describe("flowComposition", () => {
  it("computes confirmed and forecast totals and percentages", () => {
    const buckets = [
      makeBucket({ confirmed_flow_mxn: 600000, forecast_flow_mxn: 400000 }),
      makeBucket({ confirmed_flow_mxn: 400000, forecast_flow_mxn: 600000 }),
    ];
    const result = flowComposition(buckets);
    expect(result.confirmedTotal).toBe(1000000);
    expect(result.forecastTotal).toBe(1000000);
    expect(result.confirmedPct).toBeCloseTo(0.5, 5);
    expect(result.forecastPct).toBeCloseTo(0.5, 5);
  });

  it("returns zeros for empty bucket array", () => {
    const result = flowComposition([]);
    expect(result.confirmedTotal).toBe(0);
    expect(result.forecastTotal).toBe(0);
    expect(result.confirmedPct).toBe(0);
    expect(result.forecastPct).toBe(0);
  });

  it("handles all-confirmed flows (0% forecast)", () => {
    const buckets = [makeBucket({ confirmed_flow_mxn: 1000000, forecast_flow_mxn: 0 })];
    const result = flowComposition(buckets);
    expect(result.confirmedPct).toBeCloseTo(1.0, 5);
    expect(result.forecastPct).toBeCloseTo(0.0, 5);
  });

  it("handles negative flow values (uses abs)", () => {
    const buckets = [makeBucket({ confirmed_flow_mxn: -800000, forecast_flow_mxn: -200000 })];
    const result = flowComposition(buckets);
    expect(result.confirmedTotal).toBe(800000);
    expect(result.forecastTotal).toBe(200000);
    expect(result.confirmedPct).toBeCloseTo(0.8, 5);
    expect(result.forecastPct).toBeCloseTo(0.2, 5);
  });

  it("percentages sum to 1.0 for non-zero total", () => {
    const buckets = [
      makeBucket({ confirmed_flow_mxn: 750000, forecast_flow_mxn: 250000 }),
      makeBucket({ confirmed_flow_mxn: 300000, forecast_flow_mxn: 700000 }),
    ];
    const result = flowComposition(buckets);
    expect(result.confirmedPct + result.forecastPct).toBeCloseTo(1.0, 10);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// concentrationAnalysis
// ═════════════════════════════════════════════════════════════════════════════

describe("concentrationAnalysis", () => {
  it("identifies peak bucket and computes HHI for multiple buckets", () => {
    const buckets = [
      makeBucket({ bucket: "2025-01", commercial_exposure_mxn: 3000000 }),
      makeBucket({ bucket: "2025-02", commercial_exposure_mxn: 1000000 }),
      makeBucket({ bucket: "2025-03", commercial_exposure_mxn: 1000000 }),
    ];
    const result = concentrationAnalysis(buckets);
    expect(result.peakBucket).toBe("2025-01");
    expect(result.peakAmount).toBe(3000000);
    expect(result.percentOfTotal).toBeCloseTo(0.6, 5);
    // HHI = (3/5)^2 + (1/5)^2 + (1/5)^2 = 0.36 + 0.04 + 0.04 = 0.44
    expect(result.herfindahlIndex).toBeCloseTo(0.44, 3);
  });

  it("returns zeros for empty bucket array", () => {
    const result = concentrationAnalysis([]);
    expect(result.peakBucket).toBe("");
    expect(result.peakAmount).toBe(0);
    expect(result.percentOfTotal).toBe(0);
    expect(result.herfindahlIndex).toBe(0);
  });

  it("single bucket has HHI = 1.0 and 100% concentration", () => {
    const buckets = [makeBucket({ bucket: "2025-06", commercial_exposure_mxn: 2000000 })];
    const result = concentrationAnalysis(buckets);
    expect(result.peakBucket).toBe("2025-06");
    expect(result.percentOfTotal).toBeCloseTo(1.0, 5);
    expect(result.herfindahlIndex).toBeCloseTo(1.0, 5);
  });

  it("equal buckets have HHI = 1/n", () => {
    const buckets = [
      makeBucket({ bucket: "2025-01", commercial_exposure_mxn: 500000 }),
      makeBucket({ bucket: "2025-02", commercial_exposure_mxn: 500000 }),
      makeBucket({ bucket: "2025-03", commercial_exposure_mxn: 500000 }),
      makeBucket({ bucket: "2025-04", commercial_exposure_mxn: 500000 }),
    ];
    const result = concentrationAnalysis(buckets);
    // HHI for 4 equal = 4 * (0.25)^2 = 0.25
    expect(result.herfindahlIndex).toBeCloseTo(0.25, 5);
    expect(result.percentOfTotal).toBeCloseTo(0.25, 5);
  });

  it("handles all-zero exposures", () => {
    const buckets = [
      makeBucket({ bucket: "2025-01", commercial_exposure_mxn: 0 }),
      makeBucket({ bucket: "2025-02", commercial_exposure_mxn: 0 }),
    ];
    const result = concentrationAnalysis(buckets);
    expect(result.herfindahlIndex).toBe(0);
    expect(result.percentOfTotal).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// instrumentMix
// ═════════════════════════════════════════════════════════════════════════════

describe("instrumentMix", () => {
  it("counts sell, buy, and suppressed correctly", () => {
    const buckets = [
      makeBucket({ action_direction: "SELL_MXN_BUY_USD", suppressed: false }),
      makeBucket({ action_direction: "SELL_MXN_BUY_USD", suppressed: false }),
      makeBucket({ action_direction: "BUY_MXN_SELL_USD", suppressed: false }),
      makeBucket({ suppressed: true }),
    ];
    const result = instrumentMix(buckets);
    expect(result.sellCount).toBe(2);
    expect(result.buyCount).toBe(1);
    expect(result.suppressedCount).toBe(1);
    expect(result.netDirectionLabel).toBe("NET SELL MXN");
  });

  it("returns BALANCED when sell == buy count", () => {
    const buckets = [
      makeBucket({ action_direction: "SELL_MXN_BUY_USD", suppressed: false }),
      makeBucket({ action_direction: "BUY_MXN_SELL_USD", suppressed: false }),
    ];
    const result = instrumentMix(buckets);
    expect(result.netDirectionLabel).toBe("BALANCED");
  });

  it("returns NET BUY MXN when buys exceed sells", () => {
    const buckets = [
      makeBucket({ action_direction: "BUY_MXN_SELL_USD", suppressed: false }),
      makeBucket({ action_direction: "BUY_MXN_SELL_USD", suppressed: false }),
      makeBucket({ action_direction: "SELL_MXN_BUY_USD", suppressed: false }),
    ];
    const result = instrumentMix(buckets);
    expect(result.netDirectionLabel).toBe("NET BUY MXN");
  });

  it("returns zeros for empty array", () => {
    const result = instrumentMix([]);
    expect(result.sellCount).toBe(0);
    expect(result.buyCount).toBe(0);
    expect(result.suppressedCount).toBe(0);
    expect(result.netDirectionLabel).toBe("BALANCED");
  });

  it("suppressed buckets do not count as sell or buy", () => {
    const buckets = [
      makeBucket({ action_direction: "SELL_MXN_BUY_USD", suppressed: true }),
      makeBucket({ action_direction: "SELL_MXN_BUY_USD", suppressed: true }),
    ];
    const result = instrumentMix(buckets);
    expect(result.sellCount).toBe(0);
    expect(result.buyCount).toBe(0);
    expect(result.suppressedCount).toBe(2);
  });

  it("handles null action_direction", () => {
    const buckets = [makeBucket({ action_direction: null, suppressed: false })];
    const result = instrumentMix(buckets);
    expect(result.sellCount).toBe(0);
    expect(result.buyCount).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// scenarioKpis
// ═════════════════════════════════════════════════════════════════════════════

describe("scenarioKpis", () => {
  it("computes KPIs from multiple scenario totals", () => {
    const totals = [
      makeScenarioTotal({ sigma: 0.05, total_hedge_benefit_usd: 30000, total_unhedged_usd: -50000, total_hedged_usd: -20000 }),
      makeScenarioTotal({ sigma: -0.05, total_hedge_benefit_usd: 25000, total_unhedged_usd: -45000, total_hedged_usd: -20000 }),
      makeScenarioTotal({ sigma: 0.10, total_hedge_benefit_usd: -5000, total_unhedged_usd: -80000, total_hedged_usd: -85000 }),
    ];
    const summary = makeSummary({ total_friction_usd: 25000 });
    const result = scenarioKpis(totals, summary);

    // worstCaseLoss = min benefit = -5000
    expect(result.worstCaseLoss).toBe(-5000);
    // avgLossReduction = (30000 + 25000 + -5000) / 3 = 16666.67
    expect(result.avgLossReduction).toBeCloseTo(16666.67, 0);
    // efficiencyPerDollar = 16666.67 / 25000 = 0.6667
    expect(result.efficiencyPerDollar).toBeCloseTo(0.6667, 3);
  });

  it("returns zeros for empty totals array", () => {
    const result = scenarioKpis([], makeSummary());
    expect(result.worstCaseLoss).toBe(0);
    expect(result.avgLossReduction).toBe(0);
    expect(result.tailRiskReductionPct).toBe(0);
    expect(result.efficiencyPerDollar).toBe(0);
  });

  it("computes tail risk reduction when sigma >= 0.08 exists", () => {
    const totals = [
      makeScenarioTotal({ sigma: 0.10, total_unhedged_usd: -100000, total_hedged_usd: -40000, total_hedge_benefit_usd: 60000 }),
      makeScenarioTotal({ sigma: -0.10, total_unhedged_usd: -120000, total_hedged_usd: -50000, total_hedge_benefit_usd: 70000 }),
    ];
    const summary = makeSummary({ total_friction_usd: 10000 });
    const result = scenarioKpis(totals, summary);

    // extremes: both sigmas >= 0.08
    // worstUnhedged = min(-100000, -120000) = -120000
    // worstHedged = min(-40000, -50000) = -50000
    // tailRiskReductionPct = 1 - (-50000 / -120000) = 1 - 0.4167 = 0.5833
    expect(result.tailRiskReductionPct).toBeCloseTo(0.5833, 3);
  });

  it("tailRiskReductionPct is 0 when no extreme sigmas exist", () => {
    const totals = [
      makeScenarioTotal({ sigma: 0.03, total_unhedged_usd: -20000, total_hedged_usd: -10000, total_hedge_benefit_usd: 10000 }),
    ];
    const result = scenarioKpis(totals, makeSummary());
    expect(result.tailRiskReductionPct).toBe(0);
  });

  it("efficiencyPerDollar is 0 when friction is 0", () => {
    const totals = [makeScenarioTotal({ total_hedge_benefit_usd: 50000 })];
    const summary = makeSummary({ total_friction_usd: 0 });
    const result = scenarioKpis(totals, summary);
    expect(result.efficiencyPerDollar).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// policyComplianceChecks
// ═════════════════════════════════════════════════════════════════════════════

describe("policyComplianceChecks", () => {
  it("returns ALIGNED (score 100) when all checks pass", () => {
    // Confirmed hedge ratio target met: hedge_position >= confirmed (with 95% tolerance)
    // No over-hedged, no suppressed, no small trades, forecast ratio OK
    const buckets = [
      makeBucket({
        confirmed_flow_mxn: 600000,
        forecast_flow_mxn: 400000,
        commercial_exposure_mxn: 1000000,
        hedge_position_mxn: 800000,
        action_usd: 15000,
        suppressed: false,
      }),
    ];
    const summary = makeSummary({
      total_hedge_position_mxn: 800000,
    });
    const policy = makePolicy({ hedge_ratios: { confirmed: 0.9, forecast: 0.5 }, min_trade_size_usd: 10000 });
    const result = policyComplianceChecks(buckets, summary, policy);
    expect(result.score).toBe(100);
    expect(result.classification).toBe("ALIGNED");
    expect(result.checks.every(c => c.pass)).toBe(true);
  });

  it("flags small trades and returns MINOR DEVIATIONS for 1 failure", () => {
    const buckets = [
      makeBucket({ action_usd: 5000, suppressed: false }),   // below 10000 min
      makeBucket({ action_usd: 15000, suppressed: false }),
      makeBucket({ action_usd: 20000, suppressed: false }),
    ];
    const summary = makeSummary({ total_hedge_position_mxn: 2400000 });
    const policy = makePolicy({ min_trade_size_usd: 10000 });
    const result = policyComplianceChecks(buckets, summary, policy);

    const minTradeCheck = result.checks.find(c => c.label === "Min trade size threshold");
    expect(minTradeCheck?.pass).toBe(false);
    // 4 out of 5 pass = 80, which is >= 80 = MINOR DEVIATIONS
    expect(result.classification).toBe("MINOR DEVIATIONS");
  });

  it("detects over-hedged buckets", () => {
    const buckets = [
      makeBucket({ commercial_exposure_mxn: 1000000, hedge_position_mxn: 1200000 }), // 1.2 > 1.05
    ];
    const summary = makeSummary({ total_hedge_position_mxn: 1200000 });
    const policy = makePolicy();
    const result = policyComplianceChecks(buckets, summary, policy);

    const overCheck = result.checks.find(c => c.label === "No over-hedged buckets");
    expect(overCheck?.pass).toBe(false);
  });

  it("detects suppressed buckets", () => {
    const buckets = [
      makeBucket({ suppressed: true }),
      makeBucket({ suppressed: false }),
    ];
    const summary = makeSummary({ total_hedge_position_mxn: 1600000 });
    const policy = makePolicy();
    const result = policyComplianceChecks(buckets, summary, policy);

    const suppressedCheck = result.checks.find(c => c.label === "No suppressed buckets");
    expect(suppressedCheck?.pass).toBe(false);
  });

  it("returns BREACH when multiple checks fail (score < 80)", () => {
    // Fail: over-hedged, suppressed, small trades => 3 failures out of 5 = 40%
    const buckets = [
      makeBucket({
        commercial_exposure_mxn: 1000000,
        hedge_position_mxn: 1200000,
        action_usd: 5000,
        suppressed: true,
        confirmed_flow_mxn: 100000,
        forecast_flow_mxn: 900000,
      }),
    ];
    const summary = makeSummary({ total_hedge_position_mxn: 0 });
    const policy = makePolicy({ hedge_ratios: { confirmed: 1.0, forecast: 0.5 }, min_trade_size_usd: 10000 });
    const result = policyComplianceChecks(buckets, summary, policy);

    expect(result.score).toBeLessThan(80);
    expect(result.classification).toBe("BREACH");
  });

  it("always has exactly 5 checks", () => {
    const result = policyComplianceChecks([makeBucket()], makeSummary(), makePolicy());
    expect(result.checks).toHaveLength(5);
  });

  it("each check has label, pass (boolean), and detail (string)", () => {
    const result = policyComplianceChecks([makeBucket()], makeSummary(), makePolicy());
    result.checks.forEach(check => {
      expect(typeof check.label).toBe("string");
      expect(typeof check.pass).toBe("boolean");
      expect(typeof check.detail).toBe("string");
      expect(check.label.length).toBeGreaterThan(0);
      expect(check.detail.length).toBeGreaterThan(0);
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// cashflowVolatility
// ═════════════════════════════════════════════════════════════════════════════

describe("cashflowVolatility", () => {
  it("computes stdDev and CV for varied exposures", () => {
    const buckets = [
      makeBucket({ commercial_exposure_mxn: 1000000 }),
      makeBucket({ commercial_exposure_mxn: 2000000 }),
      makeBucket({ commercial_exposure_mxn: 3000000 }),
    ];
    const result = cashflowVolatility(buckets);
    // mean = 2000000, variance = ((1M-2M)^2 + (2M-2M)^2 + (3M-2M)^2) / 3 = 2e12/3
    // stdDev = sqrt(2e12/3) = ~816496.58
    expect(result.stdDev).toBeCloseTo(816496.58, 0);
    // CV = stdDev / mean = 816496.58 / 2000000 = ~0.4082
    expect(result.coefficientOfVariation).toBeCloseTo(0.4082, 3);
  });

  it("returns zeros for empty array", () => {
    const result = cashflowVolatility([]);
    expect(result.stdDev).toBe(0);
    expect(result.coefficientOfVariation).toBe(0);
  });

  it("stdDev is 0 for identical exposures", () => {
    const buckets = [
      makeBucket({ commercial_exposure_mxn: 500000 }),
      makeBucket({ commercial_exposure_mxn: 500000 }),
      makeBucket({ commercial_exposure_mxn: 500000 }),
    ];
    const result = cashflowVolatility(buckets);
    expect(result.stdDev).toBeCloseTo(0, 5);
    expect(result.coefficientOfVariation).toBeCloseTo(0, 5);
  });

  it("single bucket has stdDev 0", () => {
    const result = cashflowVolatility([makeBucket({ commercial_exposure_mxn: 1000000 })]);
    expect(result.stdDev).toBe(0);
    expect(result.coefficientOfVariation).toBe(0);
  });

  it("handles zero-value exposures (CV = 0 when mean = 0)", () => {
    const buckets = [
      makeBucket({ commercial_exposure_mxn: 0 }),
      makeBucket({ commercial_exposure_mxn: 0 }),
    ];
    const result = cashflowVolatility(buckets);
    expect(result.coefficientOfVariation).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// vulnerabilityRanking
// ═════════════════════════════════════════════════════════════════════════════

describe("vulnerabilityRanking", () => {
  it("ranks buckets by worst-case impact at extreme sigmas", () => {
    const totals = [
      makeScenarioTotal({ sigma: 0.10 }),
      makeScenarioTotal({ sigma: -0.10 }),
    ];
    const perBucket: ScenarioBucketResult[] = [
      makeScenarioBucket({ bucket: "2025-01", sigma: 0.10, hedge_benefit_usd: 20000 }),
      makeScenarioBucket({ bucket: "2025-02", sigma: 0.10, hedge_benefit_usd: 10000 }),
      makeScenarioBucket({ bucket: "2025-01", sigma: -0.10, hedge_benefit_usd: 25000 }),
      makeScenarioBucket({ bucket: "2025-02", sigma: -0.10, hedge_benefit_usd: 8000 }),
    ];
    const result = vulnerabilityRanking(perBucket, totals);
    expect(result.length).toBe(2);
    // 2025-01 worst = max(|20000|, |25000|) = 25000 benefit -> bucket value 25000
    // 2025-02 worst = max(|10000|, |8000|) = 10000 benefit -> bucket value 10000
    expect(result[0].bucket).toBe("2025-01");
    expect(result[0].rank).toBe(1);
    expect(result[1].bucket).toBe("2025-02");
    expect(result[1].rank).toBe(2);
  });

  it("returns empty when no extreme sigmas exist", () => {
    const totals = [makeScenarioTotal({ sigma: 0.03 })];
    const perBucket = [makeScenarioBucket({ sigma: 0.03 })];
    const result = vulnerabilityRanking(perBucket, totals);
    expect(result).toEqual([]);
  });

  it("returns empty for empty inputs", () => {
    expect(vulnerabilityRanking([], [])).toEqual([]);
  });

  it("each row has pctOfTotal summing to ~1.0", () => {
    const totals = [makeScenarioTotal({ sigma: 0.10 })];
    const perBucket: ScenarioBucketResult[] = [
      makeScenarioBucket({ bucket: "2025-01", sigma: 0.10, hedge_benefit_usd: 30000 }),
      makeScenarioBucket({ bucket: "2025-02", sigma: 0.10, hedge_benefit_usd: 20000 }),
      makeScenarioBucket({ bucket: "2025-03", sigma: 0.10, hedge_benefit_usd: 10000 }),
    ];
    const result = vulnerabilityRanking(perBucket, totals);
    const totalPct = result.reduce((sum, r) => sum + r.pctOfTotal, 0);
    expect(totalPct).toBeCloseTo(1.0, 5);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// riskPostureClassification
// ═════════════════════════════════════════════════════════════════════════════

describe("riskPostureClassification", () => {
  it("classifies CONSERVATIVE when coverage >= 90% and residual <= 5%", () => {
    const summary = makeSummary({
      total_commercial_exposure_mxn: 5000000,
      total_hedge_position_mxn: 4600000,  // 92%
      total_residual_mxn: 200000,          // 4%
    });
    const result = riskPostureClassification(summary, []);
    expect(result.posture).toBe("CONSERVATIVE");
    expect(result.coveragePct).toBeCloseTo(0.92, 2);
    expect(result.residualPct).toBeCloseTo(0.04, 2);
  });

  it("classifies AGGRESSIVE when coverage < 70%", () => {
    const summary = makeSummary({
      total_commercial_exposure_mxn: 5000000,
      total_hedge_position_mxn: 3000000,  // 60%
      total_residual_mxn: 2000000,        // 40%
    });
    const result = riskPostureClassification(summary, []);
    expect(result.posture).toBe("AGGRESSIVE");
  });

  it("classifies AGGRESSIVE when residual > 20%", () => {
    const summary = makeSummary({
      total_commercial_exposure_mxn: 5000000,
      total_hedge_position_mxn: 4000000,  // 80% coverage
      total_residual_mxn: 1500000,        // 30% residual
    });
    const result = riskPostureClassification(summary, []);
    expect(result.posture).toBe("AGGRESSIVE");
  });

  it("classifies BALANCED for middle range", () => {
    const summary = makeSummary({
      total_commercial_exposure_mxn: 5000000,
      total_hedge_position_mxn: 4000000,  // 80%
      total_residual_mxn: 500000,         // 10%
    });
    const result = riskPostureClassification(summary, []);
    expect(result.posture).toBe("BALANCED");
  });

  it("handles zero total exposure", () => {
    const summary = makeSummary({
      total_commercial_exposure_mxn: 0,
      total_hedge_position_mxn: 0,
      total_residual_mxn: 0,
    });
    const result = riskPostureClassification(summary, []);
    expect(result.coveragePct).toBe(0);
    expect(result.residualPct).toBe(0);
    // coverage < 0.7 => AGGRESSIVE
    expect(result.posture).toBe("AGGRESSIVE");
  });

  it("includes worstCaseReductionPct from scenario data", () => {
    const totals = [
      makeScenarioTotal({ sigma: 0.10, total_unhedged_usd: -100000, total_hedged_usd: -60000, total_hedge_benefit_usd: 40000 }),
    ];
    const summary = makeSummary({
      total_commercial_exposure_mxn: 5000000,
      total_hedge_position_mxn: 4800000,
      total_residual_mxn: 200000,
    });
    const result = riskPostureClassification(summary, totals);
    expect(result.worstCaseReductionPct).toBeGreaterThan(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// generateExecutiveNarrative
// ═════════════════════════════════════════════════════════════════════════════

describe("generateExecutiveNarrative", () => {
  it("produces at least 5 lines for normal data", () => {
    const buckets = [
      makeBucket({ bucket: "2025-01", commercial_exposure_mxn: 2000000 }),
      makeBucket({ bucket: "2025-02", commercial_exposure_mxn: 3000000 }),
    ];
    const totals = [
      makeScenarioTotal({ sigma: 0.10, total_hedge_benefit_usd: -15000 }),
    ];
    const summary = makeSummary();
    const policy = makePolicy();
    const lines = generateExecutiveNarrative(buckets, summary, totals, policy);
    expect(lines.length).toBeGreaterThanOrEqual(5);
  });

  it("first line mentions total exposure", () => {
    const buckets = [makeBucket()];
    const lines = generateExecutiveNarrative(buckets, makeSummary(), [], makePolicy());
    expect(lines[0]).toContain("exposure");
    expect(lines[0]).toContain("MXN");
  });

  it("includes formatted numbers (not raw digits)", () => {
    const summary = makeSummary({ total_commercial_exposure_mxn: 5000000 });
    const lines = generateExecutiveNarrative([makeBucket()], summary, [], makePolicy());
    // fmtMXN(5000000) should produce "5,000,000" not "5000000"
    expect(lines[0]).toContain("5,000,000");
  });

  it("adds policy deviation line when under-covered buckets exist", () => {
    const buckets = [
      makeBucket({ commercial_exposure_mxn: 1000000, hedge_position_mxn: 200000 }), // ratio 0.2 < 0.95
    ];
    const lines = generateExecutiveNarrative(buckets, makeSummary(), [], makePolicy());
    const deviationLine = lines.find(l => l.includes("Policy deviation"));
    expect(deviationLine).toBeDefined();
  });

  it("omits policy deviation line when all buckets matched", () => {
    const buckets = [
      makeBucket({ commercial_exposure_mxn: 1000000, hedge_position_mxn: 1000000 }),
    ];
    const lines = generateExecutiveNarrative(buckets, makeSummary(), [], makePolicy());
    const deviationLine = lines.find(l => l.includes("Policy deviation"));
    expect(deviationLine).toBeUndefined();
  });

  it("includes scenario impact line when totals are provided", () => {
    const totals = [makeScenarioTotal({ sigma: 0.10, total_hedge_benefit_usd: -5000 })];
    const lines = generateExecutiveNarrative([makeBucket()], makeSummary(), totals, makePolicy());
    const scenarioLine = lines.find(l => l.includes("spot shock"));
    expect(scenarioLine).toBeDefined();
  });

  it("returns non-empty result even with minimal data", () => {
    const lines = generateExecutiveNarrative(
      [makeBucket({ commercial_exposure_mxn: 0 })],
      makeSummary({ total_commercial_exposure_mxn: 0, total_residual_mxn: 0, total_friction_usd: 0 }),
      [],
      makePolicy(),
    );
    expect(lines.length).toBeGreaterThanOrEqual(3);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// extractExtendedKpis
// ═════════════════════════════════════════════════════════════════════════════

describe("extractExtendedKpis", () => {
  it("extracts all KPIs from fully populated extended data", () => {
    const extended: ExtendedEngineData = {
      factor_covariance: { condition_number: 12.5, eigenvalues: [1.0, 0.5] },
      margin: { total_im_usd: 50000, margin_by_bucket: { "2025-01": 25000 } },
      liquidity: { total_adv_coverage_pct: 0.85, illiquid_buckets: [] },
      nav_attribution: { fx_delta_contribution: 0.02, total_pnl_usd: 15000 },
      tca: { total_cost_usd: 3000, average_bps: 4.5 },
      waterfall: { steps: [{ label: "Gross", value: 50000 }], net_hedge_benefit_usd: 45000 },
    };
    const kpis = extractExtendedKpis(extended);
    expect(kpis.marginRequired).toBe(50000);
    expect(kpis.liquidityScore).toBeCloseTo(85, 1);
    expect(kpis.tcaBps).toBe(4.5);
    expect(kpis.netHedgeBenefit).toBe(45000);
  });

  it("returns nulls for all-null extended data", () => {
    const extended: ExtendedEngineData = {
      factor_covariance: null,
      margin: null,
      liquidity: null,
      nav_attribution: null,
      tca: null,
      waterfall: null,
    };
    const kpis = extractExtendedKpis(extended);
    expect(kpis.marginRequired).toBeNull();
    expect(kpis.liquidityScore).toBeNull();
    expect(kpis.tcaBps).toBeNull();
    expect(kpis.netHedgeBenefit).toBeNull();
  });

  it("caps liquidity score at 100", () => {
    const extended: ExtendedEngineData = {
      factor_covariance: null,
      margin: null,
      liquidity: { total_adv_coverage_pct: 1.5 },  // 150% -> capped to 100
      nav_attribution: null,
      tca: null,
      waterfall: null,
    };
    const kpis = extractExtendedKpis(extended);
    expect(kpis.liquidityScore).toBe(100);
  });

  it("handles partial data (some null sections)", () => {
    const extended: ExtendedEngineData = {
      factor_covariance: null,
      margin: { total_im_usd: 30000 },
      liquidity: null,
      nav_attribution: null,
      tca: { average_bps: 3.2 },
      waterfall: null,
    };
    const kpis = extractExtendedKpis(extended);
    expect(kpis.marginRequired).toBe(30000);
    expect(kpis.liquidityScore).toBeNull();
    expect(kpis.tcaBps).toBe(3.2);
    expect(kpis.netHedgeBenefit).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// extendedDataAvailable
// ═════════════════════════════════════════════════════════════════════════════

describe("extendedDataAvailable", () => {
  it("returns true when at least one section is non-null", () => {
    const extended: ExtendedEngineData = {
      factor_covariance: { condition_number: 10 },
      margin: null,
      liquidity: null,
      nav_attribution: null,
      tca: null,
      waterfall: null,
    };
    expect(extendedDataAvailable(extended)).toBe(true);
  });

  it("returns false when all sections are null", () => {
    const extended: ExtendedEngineData = {
      factor_covariance: null,
      margin: null,
      liquidity: null,
      nav_attribution: null,
      tca: null,
      waterfall: null,
    };
    expect(extendedDataAvailable(extended)).toBe(false);
  });

  it("returns false for null input", () => {
    expect(extendedDataAvailable(null)).toBe(false);
  });

  it("returns false for undefined input", () => {
    expect(extendedDataAvailable(undefined)).toBe(false);
  });
});
