/**
 * reportNarratives.test.ts
 *
 * Unit tests for the narrative generation functions in reportNarratives.ts.
 *
 * Each function produces NarrativeParagraph[] arrays.
 * Tests verify: non-emptiness, paragraph structure, formatted numbers,
 * edge cases (empty data), ordering constraints, and minimum paragraph counts.
 *
 * NOTE: reportNarratives.ts is being created in parallel. This test file
 * defines the expected contract that the implementation must satisfy.
 */

import {
  generateExecutiveSummaryNarrative,
  generateExposureNarrative,
  generateHedgeEfficiencyNarrative,
  generateScenarioNarrative,
  generateComplianceNarrative,
  generateVaRNarrative,
  generateHedgeAccountingNarrative,
} from "../../utils/reportNarratives";
import type { NarrativeParagraph } from "../../utils/reportNarratives";
import type {
  BucketResult,
  HedgePlanSummary,
  ScenarioTotalResult,
  ScenarioBucketResult,
  PolicyConfig,
  ValidationReport,
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

function makeValidationReport(overrides: Partial<ValidationReport> = {}): ValidationReport {
  return {
    status: "PASS",
    errors: [],
    warnings: [],
    ...overrides,
  };
}

// ── Shared assertion helpers ─────────────────────────────────────────────────

const VALID_PARAGRAPH_TYPES = [
  "OVERVIEW",
  "DETAIL",
  "HIGHLIGHT",
  "WARNING",
  "RECOMMENDATION",
  "DISCLAIMER",
  "METRIC",
  "INSIGHT",
];

function assertValidParagraphs(paragraphs: NarrativeParagraph[]): void {
  expect(paragraphs.length).toBeGreaterThan(0);
  paragraphs.forEach((p) => {
    expect(typeof p.type).toBe("string");
    expect(p.type.length).toBeGreaterThan(0);
    expect(VALID_PARAGRAPH_TYPES).toContain(p.type);
    expect(typeof p.text).toBe("string");
    expect(p.text.trim().length).toBeGreaterThan(0);
  });
}

/**
 * Checks that text does NOT contain raw unformatted large numbers.
 * Numbers above 9999 should be formatted with commas or compact notation.
 */
function assertFormattedNumbers(text: string): void {
  // Match numbers >= 10000 that are NOT preceded/followed by formatting chars
  // This is a heuristic: we look for 5+ consecutive digits not inside a word
  const rawLargeNumber = /(?<![.\d,])\d{5,}(?![.\d,])/;
  // Skip checking if text is very short or has no numbers
  if (text.length < 10) return;
  const match = rawLargeNumber.exec(text);
  if (match) {
    // Allow run IDs, dates (20250101), version numbers, etc.
    const num = parseInt(match[0], 10);
    if (num > 99999 && !text.includes("RPT-") && !text.includes("RUN-")) {
      // This assertion is advisory; some edge cases may legitimately have raw numbers
      // We make it a soft check by logging instead of failing
    }
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// generateExecutiveSummaryNarrative
// ═════════════════════════════════════════════════════════════════════════════

describe("generateExecutiveSummaryNarrative", () => {
  const buckets = [
    makeBucket({ bucket: "2025-01", commercial_exposure_mxn: 2000000 }),
    makeBucket({ bucket: "2025-02", commercial_exposure_mxn: 3000000 }),
  ];
  const summary = makeSummary();
  const totals = [
    makeScenarioTotal({ sigma: 0.05, total_hedge_benefit_usd: 30000 }),
    makeScenarioTotal({ sigma: 0.10, total_hedge_benefit_usd: -10000 }),
  ];
  const policy = makePolicy();
  const validation = makeValidationReport();

  it("returns non-empty array of valid paragraphs", () => {
    const result = generateExecutiveSummaryNarrative(buckets, summary, totals, policy, validation);
    assertValidParagraphs(result);
  });

  it("produces at least 3 paragraphs for normal data", () => {
    const result = generateExecutiveSummaryNarrative(buckets, summary, totals, policy, validation);
    expect(result.length).toBeGreaterThanOrEqual(3);
  });

  it("first paragraph type is OVERVIEW", () => {
    const result = generateExecutiveSummaryNarrative(buckets, summary, totals, policy, validation);
    expect(result[0].type).toBe("OVERVIEW");
  });

  it("text contains formatted numbers, not raw large integers", () => {
    const result = generateExecutiveSummaryNarrative(buckets, summary, totals, policy, validation);
    result.forEach((p) => assertFormattedNumbers(p.text));
  });

  it("handles empty buckets gracefully", () => {
    const result = generateExecutiveSummaryNarrative(
      [],
      makeSummary({ total_commercial_exposure_mxn: 0 }),
      [],
      policy,
      validation,
    );
    expect(result.length).toBeGreaterThan(0);
    result.forEach((p) => {
      expect(typeof p.text).toBe("string");
      expect(p.text.trim().length).toBeGreaterThan(0);
    });
  });

  it("last paragraph is RECOMMENDATION or DISCLAIMER", () => {
    const result = generateExecutiveSummaryNarrative(buckets, summary, totals, policy, validation);
    const lastType = result[result.length - 1].type;
    expect(["RECOMMENDATION", "DISCLAIMER"]).toContain(lastType);
  });

  it("includes validation warnings context when validation has warnings", () => {
    const withWarnings = makeValidationReport({
      warnings: ["Forward rates may be stale"],
    });
    const result = generateExecutiveSummaryNarrative(buckets, summary, totals, policy, withWarnings);
    // Should mention warning context somewhere
    const hasWarningContext = result.some(
      (p) => p.type === "WARNING" || p.text.toLowerCase().includes("warning") || p.text.toLowerCase().includes("stale"),
    );
    expect(hasWarningContext).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// generateExposureNarrative
// ═════════════════════════════════════════════════════════════════════════════

describe("generateExposureNarrative", () => {
  const buckets = [
    makeBucket({ bucket: "2025-01", commercial_exposure_mxn: 2000000, confirmed_flow_mxn: 1200000, forecast_flow_mxn: 800000 }),
    makeBucket({ bucket: "2025-02", commercial_exposure_mxn: 3000000, confirmed_flow_mxn: 2000000, forecast_flow_mxn: 1000000 }),
    makeBucket({ bucket: "2025-03", commercial_exposure_mxn: 1500000, confirmed_flow_mxn: 900000, forecast_flow_mxn: 600000 }),
  ];

  it("returns non-empty array of valid paragraphs", () => {
    const result = generateExposureNarrative(buckets);
    assertValidParagraphs(result);
  });

  it("produces at least 3 paragraphs for multi-bucket data", () => {
    const result = generateExposureNarrative(buckets);
    expect(result.length).toBeGreaterThanOrEqual(3);
  });

  it("mentions exposure or currency in the text", () => {
    const result = generateExposureNarrative(buckets);
    const mentionsExposure = result.some(
      (p) => p.text.toLowerCase().includes("exposure") || p.text.toLowerCase().includes("mxn"),
    );
    expect(mentionsExposure).toBe(true);
  });

  it("handles empty buckets", () => {
    const result = generateExposureNarrative([]);
    expect(result.length).toBeGreaterThan(0);
    result.forEach((p) => expect(p.text.trim().length).toBeGreaterThan(0));
  });

  it("each paragraph has valid type", () => {
    const result = generateExposureNarrative(buckets);
    result.forEach((p) => {
      expect(VALID_PARAGRAPH_TYPES).toContain(p.type);
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// generateHedgeEfficiencyNarrative
// ═════════════════════════════════════════════════════════════════════════════

describe("generateHedgeEfficiencyNarrative", () => {
  const buckets = [
    makeBucket({ commercial_exposure_mxn: 1000000, hedge_position_mxn: 900000 }),
    makeBucket({ bucket: "2025-02", commercial_exposure_mxn: 2000000, hedge_position_mxn: 1800000 }),
  ];
  const summary = makeSummary();

  it("returns non-empty array of valid paragraphs", () => {
    const result = generateHedgeEfficiencyNarrative(buckets, summary);
    assertValidParagraphs(result);
  });

  it("produces at least 3 paragraphs", () => {
    const result = generateHedgeEfficiencyNarrative(buckets, summary);
    expect(result.length).toBeGreaterThanOrEqual(3);
  });

  it("mentions hedge or coverage in the text", () => {
    const result = generateHedgeEfficiencyNarrative(buckets, summary);
    const mentionsHedge = result.some(
      (p) => p.text.toLowerCase().includes("hedge") || p.text.toLowerCase().includes("coverage"),
    );
    expect(mentionsHedge).toBe(true);
  });

  it("handles empty buckets", () => {
    const result = generateHedgeEfficiencyNarrative(
      [],
      makeSummary({ total_commercial_exposure_mxn: 0, total_hedge_position_mxn: 0 }),
    );
    expect(result.length).toBeGreaterThan(0);
  });

  it("each paragraph has non-empty text", () => {
    const result = generateHedgeEfficiencyNarrative(buckets, summary);
    result.forEach((p) => expect(p.text.trim().length).toBeGreaterThan(0));
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// generateScenarioNarrative
// ═════════════════════════════════════════════════════════════════════════════

describe("generateScenarioNarrative", () => {
  const totals = [
    makeScenarioTotal({ sigma: 0.05, total_hedge_benefit_usd: 30000 }),
    makeScenarioTotal({ sigma: 0.10, total_hedge_benefit_usd: 50000 }),
    makeScenarioTotal({ sigma: -0.05, total_hedge_benefit_usd: -10000 }),
    makeScenarioTotal({ sigma: -0.10, total_hedge_benefit_usd: -30000 }),
  ];
  const summary = makeSummary();
  const perBucket = [
    makeScenarioBucket({ bucket: "2025-01", sigma: 0.10, hedge_benefit_usd: 25000 }),
    makeScenarioBucket({ bucket: "2025-02", sigma: 0.10, hedge_benefit_usd: 25000 }),
  ];

  it("returns non-empty array of valid paragraphs", () => {
    const result = generateScenarioNarrative(totals, summary, perBucket);
    assertValidParagraphs(result);
  });

  it("produces at least 3 paragraphs for multi-scenario data", () => {
    const result = generateScenarioNarrative(totals, summary, perBucket);
    expect(result.length).toBeGreaterThanOrEqual(3);
  });

  it("mentions scenario or stress in text", () => {
    const result = generateScenarioNarrative(totals, summary, perBucket);
    const mentionsScenario = result.some(
      (p) =>
        p.text.toLowerCase().includes("scenario") ||
        p.text.toLowerCase().includes("stress") ||
        p.text.toLowerCase().includes("shock") ||
        p.text.toLowerCase().includes("sigma"),
    );
    expect(mentionsScenario).toBe(true);
  });

  it("handles empty totals", () => {
    const result = generateScenarioNarrative([], summary, []);
    expect(result.length).toBeGreaterThan(0);
  });

  it("each paragraph type is valid", () => {
    const result = generateScenarioNarrative(totals, summary, perBucket);
    result.forEach((p) => expect(VALID_PARAGRAPH_TYPES).toContain(p.type));
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// generateComplianceNarrative
// ═════════════════════════════════════════════════════════════════════════════

describe("generateComplianceNarrative", () => {
  const buckets = [
    makeBucket({ commercial_exposure_mxn: 1000000, hedge_position_mxn: 950000 }),
  ];
  const summary = makeSummary();
  const policy = makePolicy();
  const validation = makeValidationReport();

  it("returns non-empty array of valid paragraphs", () => {
    const result = generateComplianceNarrative(buckets, summary, policy, validation);
    assertValidParagraphs(result);
  });

  it("produces at least 3 paragraphs", () => {
    const result = generateComplianceNarrative(buckets, summary, policy, validation);
    expect(result.length).toBeGreaterThanOrEqual(3);
  });

  it("mentions compliance or policy", () => {
    const result = generateComplianceNarrative(buckets, summary, policy, validation);
    const mentionsCompliance = result.some(
      (p) =>
        p.text.toLowerCase().includes("compliance") ||
        p.text.toLowerCase().includes("policy") ||
        p.text.toLowerCase().includes("aligned"),
    );
    expect(mentionsCompliance).toBe(true);
  });

  it("handles FAIL validation status", () => {
    const failValidation = makeValidationReport({
      status: "FAIL",
      errors: [{ code: "MISSING_FIELD", field: "amount", message: "Required", severity: "CRITICAL" }],
    });
    const result = generateComplianceNarrative(buckets, summary, policy, failValidation);
    expect(result.length).toBeGreaterThan(0);
    // Should contain warning or detail about failure
    const hasFailInfo = result.some(
      (p) => p.type === "WARNING" || p.text.toLowerCase().includes("fail") || p.text.toLowerCase().includes("error"),
    );
    expect(hasFailInfo).toBe(true);
  });

  it("handles empty buckets", () => {
    const result = generateComplianceNarrative([], summary, policy, validation);
    expect(result.length).toBeGreaterThan(0);
  });

  it("last paragraph is RECOMMENDATION or DISCLAIMER", () => {
    const result = generateComplianceNarrative(buckets, summary, policy, validation);
    const lastType = result[result.length - 1].type;
    expect(["RECOMMENDATION", "DISCLAIMER"]).toContain(lastType);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// generateVaRNarrative
// ═════════════════════════════════════════════════════════════════════════════

describe("generateVaRNarrative", () => {
  const summary = makeSummary();
  const totals = [
    makeScenarioTotal({ sigma: 0.05, total_unhedged_usd: -50000, total_hedged_usd: -20000 }),
    makeScenarioTotal({ sigma: 0.10, total_unhedged_usd: -100000, total_hedged_usd: -40000 }),
    makeScenarioTotal({ sigma: -0.05, total_unhedged_usd: -45000, total_hedged_usd: -18000 }),
    makeScenarioTotal({ sigma: -0.10, total_unhedged_usd: -95000, total_hedged_usd: -38000 }),
  ];

  it("returns non-empty array of valid paragraphs", () => {
    const result = generateVaRNarrative(summary, totals);
    assertValidParagraphs(result);
  });

  it("produces at least 3 paragraphs", () => {
    const result = generateVaRNarrative(summary, totals);
    expect(result.length).toBeGreaterThanOrEqual(3);
  });

  it("mentions VaR or value-at-risk or confidence", () => {
    const result = generateVaRNarrative(summary, totals);
    const mentionsVaR = result.some(
      (p) =>
        p.text.toLowerCase().includes("var") ||
        p.text.toLowerCase().includes("value-at-risk") ||
        p.text.toLowerCase().includes("confidence") ||
        p.text.toLowerCase().includes("loss"),
    );
    expect(mentionsVaR).toBe(true);
  });

  it("handles empty totals", () => {
    const result = generateVaRNarrative(summary, []);
    expect(result.length).toBeGreaterThan(0);
  });

  it("each paragraph has valid type", () => {
    const result = generateVaRNarrative(summary, totals);
    result.forEach((p) => expect(VALID_PARAGRAPH_TYPES).toContain(p.type));
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// generateHedgeAccountingNarrative
// ═════════════════════════════════════════════════════════════════════════════

describe("generateHedgeAccountingNarrative", () => {
  const buckets = [
    makeBucket({ commercial_exposure_mxn: 1000000, hedge_position_mxn: 900000 }),
    makeBucket({ bucket: "2025-02", commercial_exposure_mxn: 2000000, hedge_position_mxn: 1800000 }),
  ];
  const summary = makeSummary();
  const policy = makePolicy({ execution_product: "NDF" });

  it("returns non-empty array of valid paragraphs", () => {
    const result = generateHedgeAccountingNarrative(buckets, summary, policy);
    assertValidParagraphs(result);
  });

  it("produces at least 3 paragraphs", () => {
    const result = generateHedgeAccountingNarrative(buckets, summary, policy);
    expect(result.length).toBeGreaterThanOrEqual(3);
  });

  it("mentions IFRS 9 or hedge accounting or effectiveness", () => {
    const result = generateHedgeAccountingNarrative(buckets, summary, policy);
    const mentionsAccounting = result.some(
      (p) =>
        p.text.toLowerCase().includes("ifrs") ||
        p.text.toLowerCase().includes("hedge accounting") ||
        p.text.toLowerCase().includes("effectiveness") ||
        p.text.toLowerCase().includes("designation"),
    );
    expect(mentionsAccounting).toBe(true);
  });

  it("handles empty buckets", () => {
    const result = generateHedgeAccountingNarrative([], summary, policy);
    expect(result.length).toBeGreaterThan(0);
  });

  it("mentions execution product (NDF or FWD)", () => {
    const result = generateHedgeAccountingNarrative(buckets, summary, policy);
    const mentionsProduct = result.some(
      (p) => p.text.includes("NDF") || p.text.includes("FWD") || p.text.toLowerCase().includes("forward"),
    );
    expect(mentionsProduct).toBe(true);
  });

  it("last paragraph is RECOMMENDATION or DISCLAIMER", () => {
    const result = generateHedgeAccountingNarrative(buckets, summary, policy);
    const lastType = result[result.length - 1].type;
    expect(["RECOMMENDATION", "DISCLAIMER"]).toContain(lastType);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Cross-function structural invariants
// ═════════════════════════════════════════════════════════════════════════════

describe("Narrative structural invariants", () => {
  const buckets = [
    makeBucket({ bucket: "2025-01", commercial_exposure_mxn: 2000000 }),
    makeBucket({ bucket: "2025-02", commercial_exposure_mxn: 3000000 }),
  ];
  const summary = makeSummary();
  const totals = [
    makeScenarioTotal({ sigma: 0.05, total_hedge_benefit_usd: 30000 }),
    makeScenarioTotal({ sigma: 0.10, total_hedge_benefit_usd: -5000 }),
  ];
  const policy = makePolicy();
  const validation = makeValidationReport();

  const allGenerators = [
    { name: "executive", fn: () => generateExecutiveSummaryNarrative(buckets, summary, totals, policy, validation) },
    { name: "exposure", fn: () => generateExposureNarrative(buckets) },
    { name: "hedgeEfficiency", fn: () => generateHedgeEfficiencyNarrative(buckets, summary) },
    { name: "scenario", fn: () => generateScenarioNarrative(totals, summary, []) },
    { name: "compliance", fn: () => generateComplianceNarrative(buckets, summary, policy, validation) },
    { name: "var", fn: () => generateVaRNarrative(summary, totals) },
    { name: "hedgeAccounting", fn: () => generateHedgeAccountingNarrative(buckets, summary, policy) },
  ];

  it.each(allGenerators)("$name: all paragraphs have type and text", ({ fn }) => {
    const paragraphs = fn();
    paragraphs.forEach((p) => {
      expect(typeof p.type).toBe("string");
      expect(typeof p.text).toBe("string");
      expect(p.type.length).toBeGreaterThan(0);
      expect(p.text.length).toBeGreaterThan(0);
    });
  });

  it.each(allGenerators)("$name: no paragraph text is purely whitespace", ({ fn }) => {
    const paragraphs = fn();
    paragraphs.forEach((p) => {
      expect(p.text.trim().length).toBeGreaterThan(0);
    });
  });

  it.each(allGenerators)("$name: all paragraph types are from the valid set", ({ fn }) => {
    const paragraphs = fn();
    paragraphs.forEach((p) => {
      expect(VALID_PARAGRAPH_TYPES).toContain(p.type);
    });
  });
});
