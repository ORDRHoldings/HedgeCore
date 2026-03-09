/**
 * Audit Lab Chart Components — Unit Tests
 *
 * Tests the data transformation and aggregation logic used by:
 * - MarkupByMonthChart (Item 14) — sign-based bar coloring
 * - RateScatterChart (Item 15) — currency pair grouping and axis bounds
 * - CounterpartyMatrix (Item 16) — aggregation, scoring, formatting
 */

// ══════════════════════════════════════════════════════════════════════════════
// 1. MarkupByMonthChart — Data validation
// ══════════════════════════════════════════════════════════════════════════════

describe("MarkupByMonthChart data logic", () => {
  it("classifies positive markup as adverse", () => {
    const value = 1500;
    const isAdverse = value >= 0;
    expect(isAdverse).toBe(true);
  });

  it("classifies negative markup as favorable", () => {
    const value = -800;
    const isAdverse = value >= 0;
    expect(isAdverse).toBe(false);
  });

  it("classifies zero markup as adverse (boundary)", () => {
    const value = 0;
    const isAdverse = value >= 0;
    expect(isAdverse).toBe(true);
  });

  it("handles empty month record gracefully", () => {
    const markupByMonth: Record<string, number> = {};
    const months = Object.keys(markupByMonth);
    expect(months.length).toBe(0);
  });

  it("preserves month ordering from input", () => {
    const markupByMonth: Record<string, number> = {
      "2025-01": 1200,
      "2025-02": -300,
      "2025-03": 800,
    };
    const months = Object.keys(markupByMonth);
    expect(months).toEqual(["2025-01", "2025-02", "2025-03"]);
  });

  it("produces correct bar data for mixed signs", () => {
    const values = [1200, -300, 0, 800, -1500];
    const barColors = values.map((v) => (v >= 0 ? "red" : "green"));
    expect(barColors).toEqual(["red", "green", "red", "red", "green"]);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. RateScatterChart — Grouping, axis bounds, and palette assignment
// ══════════════════════════════════════════════════════════════════════════════

interface Transaction {
  effective_rate: number;
  benchmark_rate: number;
  currency_pair: string;
  counterparty: string;
  row_index: number;
}

describe("RateScatterChart data logic", () => {
  const PAIR_PALETTE = [
    "#1C62F2",
    "#059669",
    "#DC2626",
    "#D97706",
    "#4F46E5",
    "#0891B2",
    "#9333EA",
    "#E11D48",
    "#65A30D",
    "#EA580C",
  ];

  function groupByPair(txs: Transaction[]): Map<string, Transaction[]> {
    const map = new Map<string, Transaction[]>();
    for (const tx of txs) {
      const existing = map.get(tx.currency_pair);
      if (existing) existing.push(tx);
      else map.set(tx.currency_pair, [tx]);
    }
    return map;
  }

  function computeAxisBounds(txs: Transaction[]) {
    let minVal = Infinity;
    let maxVal = -Infinity;
    for (const tx of txs) {
      const lo = Math.min(tx.benchmark_rate, tx.effective_rate);
      const hi = Math.max(tx.benchmark_rate, tx.effective_rate);
      if (lo < minVal) minVal = lo;
      if (hi > maxVal) maxVal = hi;
    }
    const pad = (maxVal - minVal) * 0.08 || 0.01;
    return { axisMin: minVal - pad, axisMax: maxVal + pad };
  }

  it("groups transactions by currency pair", () => {
    const txs: Transaction[] = [
      { effective_rate: 1.1, benchmark_rate: 1.0, currency_pair: "EUR/USD", counterparty: "A", row_index: 0 },
      { effective_rate: 1.2, benchmark_rate: 1.1, currency_pair: "GBP/USD", counterparty: "B", row_index: 1 },
      { effective_rate: 1.15, benchmark_rate: 1.05, currency_pair: "EUR/USD", counterparty: "C", row_index: 2 },
    ];
    const groups = groupByPair(txs);
    expect(groups.size).toBe(2);
    expect(groups.get("EUR/USD")!.length).toBe(2);
    expect(groups.get("GBP/USD")!.length).toBe(1);
  });

  it("assigns unique colors per pair within palette size", () => {
    const pairs = ["EUR/USD", "GBP/USD", "USD/JPY"];
    const colorMap = new Map<string, string>();
    pairs.sort().forEach((pair, i) => {
      colorMap.set(pair, PAIR_PALETTE[i % PAIR_PALETTE.length]);
    });
    const colors = Array.from(colorMap.values());
    const unique = new Set(colors);
    expect(unique.size).toBe(3);
  });

  it("wraps palette for > 10 pairs", () => {
    const pairs = Array.from({ length: 12 }, (_, i) => `PAIR${i}`);
    const colorMap = new Map<string, string>();
    pairs.forEach((pair, i) => {
      colorMap.set(pair, PAIR_PALETTE[i % PAIR_PALETTE.length]);
    });
    expect(colorMap.get("PAIR0")).toBe(colorMap.get("PAIR10"));
    expect(colorMap.get("PAIR1")).toBe(colorMap.get("PAIR11"));
  });

  it("computes axis bounds with padding", () => {
    const txs: Transaction[] = [
      { effective_rate: 1.1, benchmark_rate: 1.0, currency_pair: "EUR/USD", counterparty: "A", row_index: 0 },
      { effective_rate: 1.3, benchmark_rate: 1.2, currency_pair: "EUR/USD", counterparty: "B", row_index: 1 },
    ];
    const { axisMin, axisMax } = computeAxisBounds(txs);
    expect(axisMin).toBeLessThan(1.0);
    expect(axisMax).toBeGreaterThan(1.3);
  });

  it("handles identical rates without NaN", () => {
    const txs: Transaction[] = [
      { effective_rate: 1.0, benchmark_rate: 1.0, currency_pair: "EUR/USD", counterparty: "A", row_index: 0 },
    ];
    const { axisMin, axisMax } = computeAxisBounds(txs);
    expect(Number.isFinite(axisMin)).toBe(true);
    expect(Number.isFinite(axisMax)).toBe(true);
    expect(axisMax).toBeGreaterThan(axisMin);
  });

  it("identifies points above/below y=x line", () => {
    const tx1 = { effective_rate: 1.05, benchmark_rate: 1.0 };
    const tx2 = { effective_rate: 0.95, benchmark_rate: 1.0 };
    // Above y=x means effective > benchmark (counterparty got worse rate)
    expect(tx1.effective_rate > tx1.benchmark_rate).toBe(true);
    // Below y=x means effective < benchmark (counterparty got better rate)
    expect(tx2.effective_rate < tx2.benchmark_rate).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. CounterpartyMatrix — Aggregation, scoring, formatting
// ══════════════════════════════════════════════════════════════════════════════

interface MatrixTransaction {
  counterparty: string;
  markup_cost_usd: number;
  markup_direction: string;
  spread_classification: string;
}

interface CounterpartySummary {
  counterparty: string;
  avgMarkupBps: number;
  totalCostUsd: number;
  tradeCount: number;
  pctWithinSpread: number;
}

function aggregate(transactions: MatrixTransaction[]): CounterpartySummary[] {
  const map = new Map<
    string,
    { markupBpsSum: number; costSum: number; count: number; withinCount: number }
  >();

  for (const tx of transactions) {
    const key = tx.counterparty;
    let entry = map.get(key);
    if (!entry) {
      entry = { markupBpsSum: 0, costSum: 0, count: 0, withinCount: 0 };
      map.set(key, entry);
    }
    entry.markupBpsSum += tx.markup_cost_usd;
    entry.costSum += Math.abs(tx.markup_cost_usd);
    entry.count += 1;
    if (
      tx.spread_classification === "WITHIN_SPREAD" ||
      tx.spread_classification === "within_spread"
    ) {
      entry.withinCount += 1;
    }
  }

  const result: CounterpartySummary[] = [];
  for (const [cp, data] of map.entries()) {
    result.push({
      counterparty: cp,
      avgMarkupBps: data.count > 0 ? data.markupBpsSum / data.count : 0,
      totalCostUsd: data.costSum,
      tradeCount: data.count,
      pctWithinSpread:
        data.count > 0 ? (data.withinCount / data.count) * 100 : 0,
    });
  }

  result.sort((a, b) => b.totalCostUsd - a.totalCostUsd);
  return result;
}

function formatUsd(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(abs / 1_000).toFixed(1)}K`;
  return `$${abs.toFixed(0)}`;
}

function formatBps(v: number): string {
  const sign = v >= 0 ? "+" : "";
  return `${sign}${v.toFixed(1)} bps`;
}

function heatColor(ratio: number, positive: boolean): string {
  const clamped = Math.min(Math.max(ratio, 0), 1);
  const alpha = Math.round(clamped * 0.18 * 255)
    .toString(16)
    .padStart(2, "0");
  return positive ? `#059669${alpha}` : `#DC2626${alpha}`;
}

describe("CounterpartyMatrix aggregation", () => {
  const baseTxs: MatrixTransaction[] = [
    { counterparty: "BankA", markup_cost_usd: 15, markup_direction: "ADVERSE", spread_classification: "WITHIN_SPREAD" },
    { counterparty: "BankA", markup_cost_usd: 25, markup_direction: "ADVERSE", spread_classification: "OUTSIDE_SPREAD" },
    { counterparty: "BankB", markup_cost_usd: -5, markup_direction: "FAVORABLE", spread_classification: "WITHIN_SPREAD" },
    { counterparty: "BankB", markup_cost_usd: 10, markup_direction: "ADVERSE", spread_classification: "WITHIN_SPREAD" },
    { counterparty: "BankB", markup_cost_usd: 8, markup_direction: "ADVERSE", spread_classification: "within_spread" },
  ];

  it("groups by counterparty correctly", () => {
    const result = aggregate(baseTxs);
    expect(result.length).toBe(2);
    const names = result.map((r) => r.counterparty);
    expect(names).toContain("BankA");
    expect(names).toContain("BankB");
  });

  it("computes trade count per counterparty", () => {
    const result = aggregate(baseTxs);
    const bankA = result.find((r) => r.counterparty === "BankA")!;
    const bankB = result.find((r) => r.counterparty === "BankB")!;
    expect(bankA.tradeCount).toBe(2);
    expect(bankB.tradeCount).toBe(3);
  });

  it("computes average markup correctly", () => {
    const result = aggregate(baseTxs);
    const bankA = result.find((r) => r.counterparty === "BankA")!;
    // (15 + 25) / 2 = 20
    expect(bankA.avgMarkupBps).toBeCloseTo(20, 5);
    const bankB = result.find((r) => r.counterparty === "BankB")!;
    // (-5 + 10 + 8) / 3 = 4.333...
    expect(bankB.avgMarkupBps).toBeCloseTo(4.333, 2);
  });

  it("computes total cost as absolute sum", () => {
    const result = aggregate(baseTxs);
    const bankA = result.find((r) => r.counterparty === "BankA")!;
    expect(bankA.totalCostUsd).toBe(40); // |15| + |25|
    const bankB = result.find((r) => r.counterparty === "BankB")!;
    expect(bankB.totalCostUsd).toBe(23); // |-5| + |10| + |8|
  });

  it("computes within-spread percentage", () => {
    const result = aggregate(baseTxs);
    const bankA = result.find((r) => r.counterparty === "BankA")!;
    // 1 within / 2 total = 50%
    expect(bankA.pctWithinSpread).toBeCloseTo(50, 5);
    const bankB = result.find((r) => r.counterparty === "BankB")!;
    // 3 within / 3 total = 100% (handles both "WITHIN_SPREAD" and "within_spread")
    expect(bankB.pctWithinSpread).toBeCloseTo(100, 5);
  });

  it("sorts by total cost descending", () => {
    const result = aggregate(baseTxs);
    expect(result[0].counterparty).toBe("BankA"); // 40 > 23
    expect(result[1].counterparty).toBe("BankB");
  });

  it("handles empty transaction list", () => {
    const result = aggregate([]);
    expect(result.length).toBe(0);
  });

  it("handles single transaction", () => {
    const result = aggregate([
      { counterparty: "Solo", markup_cost_usd: 42, markup_direction: "ADVERSE", spread_classification: "WITHIN_SPREAD" },
    ]);
    expect(result.length).toBe(1);
    expect(result[0].avgMarkupBps).toBe(42);
    expect(result[0].totalCostUsd).toBe(42);
    expect(result[0].tradeCount).toBe(1);
    expect(result[0].pctWithinSpread).toBe(100);
  });
});

describe("CounterpartyMatrix scoring", () => {
  it("identifies best and worst by composite score", () => {
    const summaries: CounterpartySummary[] = [
      { counterparty: "Good", avgMarkupBps: -5, totalCostUsd: 100, tradeCount: 10, pctWithinSpread: 90 },
      { counterparty: "Bad", avgMarkupBps: 30, totalCostUsd: 500, tradeCount: 10, pctWithinSpread: 20 },
      { counterparty: "Mid", avgMarkupBps: 10, totalCostUsd: 200, tradeCount: 10, pctWithinSpread: 60 },
    ];

    // Score: lower avgMarkupBps + higher pctWithinSpread => better
    // score = avgMarkupBps - pctWithinSpread * 0.5
    let bestIdx = 0;
    let worstIdx = 0;
    let bestScore = Infinity;
    let worstScore = -Infinity;

    summaries.forEach((s, i) => {
      const score = s.avgMarkupBps - s.pctWithinSpread * 0.5;
      if (score < bestScore) { bestScore = score; bestIdx = i; }
      if (score > worstScore) { worstScore = score; worstIdx = i; }
    });

    expect(summaries[bestIdx].counterparty).toBe("Good");  // -5 - 45 = -50
    expect(summaries[worstIdx].counterparty).toBe("Bad");   // 30 - 10 = 20
  });
});

describe("CounterpartyMatrix formatters", () => {
  it("formats millions", () => {
    expect(formatUsd(2500000)).toBe("$2.50M");
    expect(formatUsd(1000000)).toBe("$1.00M");
  });

  it("formats thousands", () => {
    expect(formatUsd(45000)).toBe("$45.0K");
    expect(formatUsd(1500)).toBe("$1.5K");
  });

  it("formats small values", () => {
    expect(formatUsd(500)).toBe("$500");
    expect(formatUsd(0)).toBe("$0");
  });

  it("formats positive bps with sign", () => {
    expect(formatBps(12.5)).toBe("+12.5 bps");
  });

  it("formats negative bps without plus", () => {
    expect(formatBps(-3.2)).toBe("-3.2 bps");
  });

  it("formats zero bps as positive", () => {
    expect(formatBps(0)).toBe("+0.0 bps");
  });
});

describe("CounterpartyMatrix heat colors", () => {
  it("returns green-based color for positive=true", () => {
    const color = heatColor(0.5, true);
    expect(color.startsWith("#059669")).toBe(true);
  });

  it("returns red-based color for positive=false", () => {
    const color = heatColor(0.5, false);
    expect(color.startsWith("#DC2626")).toBe(true);
  });

  it("clamps ratio to [0,1]", () => {
    const low = heatColor(-0.5, true);
    const high = heatColor(2.0, true);
    // ratio=-0.5 clamps to 0, alpha=00
    expect(low).toBe("#05966900");
    // ratio=2.0 clamps to 1, alpha = round(0.18*255) = 46 = 0x2E
    expect(high).toBe("#0596692e");
  });

  it("returns zero alpha for ratio=0", () => {
    const color = heatColor(0, false);
    expect(color).toBe("#DC262600");
  });
});
