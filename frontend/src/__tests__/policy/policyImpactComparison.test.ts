/**
 * Policy Impact Comparison — Math Tests
 *
 * Validates the kernel-level impact computations used in the
 * PolicyCompareModal's impact analysis feature.
 *
 * These formulas mirror the v1 kernel logic:
 * - hedge_target = exposure x ratio (confirmed or forecast)
 * - suppression = target > 0 && target < min_trade_size -> SUPPRESSED
 * - friction = target x spread_bps / 10000
 * - net_notional = target - friction (if not suppressed)
 */

// ── Helpers ──────────────────────────────────────────────────────────────────

interface PolicyConfig {
  hedge_ratios: { confirmed: number; forecast: number };
  cost_assumptions: { spread_bps: number };
  min_trade_size_usd: number;
  execution_product: "NDF" | "FWD";
  bucket_mode: string;
}

function computeHedgeTarget(exposure: number, ratio: number): number {
  return exposure * ratio;
}

function computeSuppression(
  target: number,
  minTradeSize: number
): "SUPPRESSED" | "NO HEDGE" | "ACTIVE" {
  if (target === 0) return "NO HEDGE";
  if (target > 0 && target < minTradeSize) return "SUPPRESSED";
  return "ACTIVE";
}

function computeFriction(
  target: number,
  spreadBps: number,
  minTradeSize: number
): number {
  if (target > 0 && target < minTradeSize) return 0; // suppressed
  return (target * spreadBps) / 10000;
}

function computeNetNotional(
  target: number,
  spreadBps: number,
  minTradeSize: number
): number {
  if (target > 0 && target < minTradeSize) return 0; // suppressed
  const friction = (target * spreadBps) / 10000;
  return Math.max(0, target - friction);
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("A. Hedge Target Computation", () => {
  test("confirmed ratio applied to exposure", () => {
    expect(computeHedgeTarget(1000000, 0.8)).toBe(800000);
  });
  test("forecast ratio applied to exposure", () => {
    expect(computeHedgeTarget(1000000, 0.5)).toBe(500000);
  });
  test("zero exposure -> zero target", () => {
    expect(computeHedgeTarget(0, 0.8)).toBe(0);
  });
  test("100% ratio -> full exposure", () => {
    expect(computeHedgeTarget(500000, 1.0)).toBe(500000);
  });
  test("zero ratio -> zero target", () => {
    expect(computeHedgeTarget(1000000, 0)).toBe(0);
  });
});

describe("B. Suppression Detection", () => {
  test("target above min trade -> ACTIVE", () => {
    expect(computeSuppression(100000, 50000)).toBe("ACTIVE");
  });
  test("target below min trade -> SUPPRESSED", () => {
    expect(computeSuppression(20000, 50000)).toBe("SUPPRESSED");
  });
  test("target equal to min trade -> ACTIVE", () => {
    expect(computeSuppression(50000, 50000)).toBe("ACTIVE");
  });
  test("zero target -> NO HEDGE", () => {
    expect(computeSuppression(0, 50000)).toBe("NO HEDGE");
  });
  test("min trade = 0 -> never suppressed", () => {
    expect(computeSuppression(100, 0)).toBe("ACTIVE");
  });
  test("small exposure with SME preset (min=0) -> ACTIVE", () => {
    expect(computeSuppression(50, 0)).toBe("ACTIVE");
  });
});

describe("C. Friction Computation", () => {
  test("standard spread on $1M target", () => {
    // 5 bps on $1M = $500
    expect(computeFriction(1000000, 5, 0)).toBe(500);
  });
  test("high spread on $500k target", () => {
    // 25 bps on $500k = $1,250
    expect(computeFriction(500000, 25, 0)).toBe(1250);
  });
  test("zero spread -> zero friction", () => {
    expect(computeFriction(1000000, 0, 0)).toBe(0);
  });
  test("suppressed target -> zero friction", () => {
    expect(computeFriction(20000, 5, 50000)).toBe(0);
  });
  test("4 bps on $100k", () => {
    expect(computeFriction(100000, 4, 0)).toBe(40);
  });
});

describe("D. Net Notional", () => {
  test("$1M target at 5bps -> net = $999,500", () => {
    expect(computeNetNotional(1000000, 5, 0)).toBe(999500);
  });
  test("suppressed -> net = 0", () => {
    expect(computeNetNotional(20000, 5, 50000)).toBe(0);
  });
  test("zero spread -> net = target", () => {
    expect(computeNetNotional(500000, 0, 0)).toBe(500000);
  });
});

describe("E. Full Policy Impact Scenario", () => {
  const policies: PolicyConfig[] = [
    {
      hedge_ratios: { confirmed: 1.0, forecast: 1.0 },
      cost_assumptions: { spread_bps: 4 },
      min_trade_size_usd: 50000,
      execution_product: "FWD",
      bucket_mode: "CALENDAR_MONTH",
    },
    {
      hedge_ratios: { confirmed: 0.8, forecast: 0.5 },
      cost_assumptions: { spread_bps: 25 },
      min_trade_size_usd: 0,
      execution_product: "NDF",
      bucket_mode: "CALENDAR_MONTH",
    },
  ];

  test("$1M confirmed exposure -- Full Protection vs SME", () => {
    const exposure = 1000000;
    // Full Protection: target = 1M, active, friction = $400, net = $999,600
    const t1 = computeHedgeTarget(
      exposure,
      policies[0].hedge_ratios.confirmed
    );
    expect(t1).toBe(1000000);
    expect(computeSuppression(t1, policies[0].min_trade_size_usd)).toBe(
      "ACTIVE"
    );
    expect(
      computeFriction(
        t1,
        policies[0].cost_assumptions.spread_bps,
        policies[0].min_trade_size_usd
      )
    ).toBe(400);

    // SME: target = 800k, active, friction = $2,000, net = $798,000
    const t2 = computeHedgeTarget(
      exposure,
      policies[1].hedge_ratios.confirmed
    );
    expect(t2).toBe(800000);
    expect(computeSuppression(t2, policies[1].min_trade_size_usd)).toBe(
      "ACTIVE"
    );
    expect(
      computeFriction(
        t2,
        policies[1].cost_assumptions.spread_bps,
        policies[1].min_trade_size_usd
      )
    ).toBe(2000);
  });

  test("$10k confirmed exposure -- Full Protection suppressed, SME active", () => {
    const exposure = 10000;
    // Full Protection: target = 10k, SUPPRESSED (below 50k min)
    const t1 = computeHedgeTarget(
      exposure,
      policies[0].hedge_ratios.confirmed
    );
    expect(t1).toBe(10000);
    expect(computeSuppression(t1, policies[0].min_trade_size_usd)).toBe(
      "SUPPRESSED"
    );

    // SME: target = 8k, ACTIVE (no min trade size)
    const t2 = computeHedgeTarget(
      exposure,
      policies[1].hedge_ratios.confirmed
    );
    expect(t2).toBe(8000);
    expect(computeSuppression(t2, policies[1].min_trade_size_usd)).toBe(
      "ACTIVE"
    );
  });

  test("forecast exposure shows forecast ratio, not confirmed", () => {
    const exposure = 1000000;
    const t1 = computeHedgeTarget(
      exposure,
      policies[0].hedge_ratios.forecast
    );
    expect(t1).toBe(1000000); // Full Protection: 100% forecast
    const t2 = computeHedgeTarget(
      exposure,
      policies[1].hedge_ratios.forecast
    );
    expect(t2).toBe(500000); // SME: 50% forecast
  });
});

describe("F. Edge Cases", () => {
  test("very small exposure with high min trade -> suppressed", () => {
    expect(computeSuppression(1, 1000000)).toBe("SUPPRESSED");
  });
  test("fractional bps", () => {
    expect(computeFriction(1000000, 1.5, 0)).toBe(150);
  });
  test("target exactly at min trade boundary -> ACTIVE", () => {
    // Target = min_trade_size means NOT suppressed (>=, not >)
    expect(computeSuppression(50000, 50000)).toBe("ACTIVE");
  });
});
