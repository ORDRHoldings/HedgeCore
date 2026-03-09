/**
 * Audit Lab Review Queue -- Unit Tests
 *
 * Tests data transformation and business logic used by
 * the Review Queue page (/audit-lab/review):
 * - Confidence color classification
 * - Confidence band bucketing (filter tabs)
 * - Filter logic across all tabs
 * - Amount / rate formatting helpers
 * - Average confidence computation
 * - Tab count aggregation
 * - Optimistic removal
 * - Edge cases (empty items, null fields, boundary values)
 */

// ══════════════════════════════════════════════════════════════════════════════
// Replicated helpers from page.tsx (pure logic, no React dependency)
// ══════════════════════════════════════════════════════════════════════════════

type FilterTab = "all" | "low" | "medium" | "acceptable";

interface ReviewItem {
  id: string;
  row_index: number;
  trade_date: string | null;
  value_date: string | null;
  currency_sold: string | null;
  currency_bought: string | null;
  amount_sold: number | null;
  amount_bought: number | null;
  effective_rate: number | null;
  counterparty: string | null;
  confidence: number;
  flags: string[];
}

function confidenceColor(pct: number): string {
  if (pct < 50) return "red";
  if (pct < 70) return "amber";
  return "green";
}

function confidenceBand(pct: number): FilterTab {
  if (pct < 50) return "low";
  if (pct < 70) return "medium";
  return "acceptable";
}

function filterItems(items: ReviewItem[], tab: FilterTab): ReviewItem[] {
  if (tab === "all") return items;
  return items.filter((i) => confidenceBand(i.confidence * 100) === tab);
}

function fmtAmount(n: number | null | undefined): string {
  if (n == null) return "\u2014";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);
}

function fmtRate(n: number | null | undefined): string {
  if (n == null) return "\u2014";
  return n.toFixed(6);
}

function computeAvgConfidence(items: ReviewItem[]): number {
  if (items.length === 0) return 0;
  const sum = items.reduce((acc, i) => acc + i.confidence, 0);
  return (sum / items.length) * 100;
}

function computeTabCounts(items: ReviewItem[]): Record<FilterTab, number> {
  const counts: Record<FilterTab, number> = { all: items.length, low: 0, medium: 0, acceptable: 0 };
  for (const item of items) {
    const band = confidenceBand(item.confidence * 100);
    counts[band]++;
  }
  return counts;
}

// ══════════════════════════════════════════════════════════════════════════════
// Test fixtures
// ══════════════════════════════════════════════════════════════════════════════

function makeItem(overrides: Partial<ReviewItem> & { id: string; confidence: number }): ReviewItem {
  return {
    row_index: 1,
    trade_date: "2026-01-15",
    value_date: "2026-01-17",
    currency_sold: "EUR",
    currency_bought: "USD",
    amount_sold: 100000,
    amount_bought: 108000,
    effective_rate: 1.08,
    counterparty: "BankA",
    flags: [],
    ...overrides,
  };
}

const FIXTURE_ITEMS: ReviewItem[] = [
  makeItem({ id: "t1", confidence: 0.35, row_index: 1, flags: ["missing_value_date", "rate_deviation"] }),
  makeItem({ id: "t2", confidence: 0.55, row_index: 2, flags: ["counterparty_unknown"] }),
  makeItem({ id: "t3", confidence: 0.65, row_index: 3, counterparty: null, flags: ["counterparty_missing"] }),
  makeItem({ id: "t4", confidence: 0.72, row_index: 4, flags: [] }),
  makeItem({ id: "t5", confidence: 0.78, row_index: 5, flags: ["minor_date_format"] }),
  makeItem({ id: "t6", confidence: 0.40, row_index: 6, flags: ["amount_mismatch", "rate_outlier"] }),
];

// ══════════════════════════════════════════════════════════════════════════════
// 1. Confidence color classification
// ══════════════════════════════════════════════════════════════════════════════

describe("Review Queue -- confidenceColor", () => {
  it("returns red for confidence < 50%", () => {
    expect(confidenceColor(0)).toBe("red");
    expect(confidenceColor(25)).toBe("red");
    expect(confidenceColor(49.9)).toBe("red");
  });

  it("returns amber for confidence 50-69%", () => {
    expect(confidenceColor(50)).toBe("amber");
    expect(confidenceColor(60)).toBe("amber");
    expect(confidenceColor(69.9)).toBe("amber");
  });

  it("returns green for confidence 70%+", () => {
    expect(confidenceColor(70)).toBe("green");
    expect(confidenceColor(80)).toBe("green");
    expect(confidenceColor(100)).toBe("green");
  });

  it("handles boundary at exactly 50", () => {
    expect(confidenceColor(50)).toBe("amber");
  });

  it("handles boundary at exactly 70", () => {
    expect(confidenceColor(70)).toBe("green");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. Confidence band bucketing
// ══════════════════════════════════════════════════════════════════════════════

describe("Review Queue -- confidenceBand", () => {
  it("returns 'low' for < 50%", () => {
    expect(confidenceBand(0)).toBe("low");
    expect(confidenceBand(35)).toBe("low");
    expect(confidenceBand(49)).toBe("low");
  });

  it("returns 'medium' for 50-69%", () => {
    expect(confidenceBand(50)).toBe("medium");
    expect(confidenceBand(55)).toBe("medium");
    expect(confidenceBand(69)).toBe("medium");
  });

  it("returns 'acceptable' for 70%+", () => {
    expect(confidenceBand(70)).toBe("acceptable");
    expect(confidenceBand(78)).toBe("acceptable");
    expect(confidenceBand(100)).toBe("acceptable");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. Filter logic
// ══════════════════════════════════════════════════════════════════════════════

describe("Review Queue -- filterItems", () => {
  it("'all' tab returns all items", () => {
    expect(filterItems(FIXTURE_ITEMS, "all").length).toBe(6);
  });

  it("'low' tab returns items with confidence < 50%", () => {
    const result = filterItems(FIXTURE_ITEMS, "low");
    expect(result.length).toBe(2);
    expect(result.map(r => r.id).sort()).toEqual(["t1", "t6"]);
  });

  it("'medium' tab returns items with confidence 50-69%", () => {
    const result = filterItems(FIXTURE_ITEMS, "medium");
    expect(result.length).toBe(2);
    expect(result.map(r => r.id).sort()).toEqual(["t2", "t3"]);
  });

  it("'acceptable' tab returns items with confidence 70-79%", () => {
    const result = filterItems(FIXTURE_ITEMS, "acceptable");
    expect(result.length).toBe(2);
    expect(result.map(r => r.id).sort()).toEqual(["t4", "t5"]);
  });

  it("returns empty array for empty items", () => {
    expect(filterItems([], "all").length).toBe(0);
    expect(filterItems([], "low").length).toBe(0);
  });

  it("returns empty when no items match filter", () => {
    const highOnly = [makeItem({ id: "h1", confidence: 0.75 })];
    expect(filterItems(highOnly, "low").length).toBe(0);
    expect(filterItems(highOnly, "medium").length).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 4. Amount formatting
// ══════════════════════════════════════════════════════════════════════════════

describe("Review Queue -- fmtAmount", () => {
  it("returns em-dash for null", () => {
    expect(fmtAmount(null)).toBe("\u2014");
  });

  it("returns em-dash for undefined", () => {
    expect(fmtAmount(undefined)).toBe("\u2014");
  });

  it("formats positive integers without decimals", () => {
    expect(fmtAmount(100000)).toBe("100,000");
  });

  it("formats decimal amounts", () => {
    const result = fmtAmount(1234.56);
    expect(result).toBe("1,234.56");
  });

  it("formats zero", () => {
    expect(fmtAmount(0)).toBe("0");
  });

  it("formats negative amounts", () => {
    const result = fmtAmount(-500);
    expect(result).toContain("500");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 5. Rate formatting
// ══════════════════════════════════════════════════════════════════════════════

describe("Review Queue -- fmtRate", () => {
  it("returns em-dash for null", () => {
    expect(fmtRate(null)).toBe("\u2014");
  });

  it("returns em-dash for undefined", () => {
    expect(fmtRate(undefined)).toBe("\u2014");
  });

  it("formats rate to 6 decimal places", () => {
    expect(fmtRate(1.08)).toBe("1.080000");
  });

  it("formats small rate", () => {
    expect(fmtRate(0.006543)).toBe("0.006543");
  });

  it("formats integer rate with trailing zeros", () => {
    expect(fmtRate(1)).toBe("1.000000");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 6. Average confidence computation
// ══════════════════════════════════════════════════════════════════════════════

describe("Review Queue -- computeAvgConfidence", () => {
  it("returns 0 for empty items", () => {
    expect(computeAvgConfidence([])).toBe(0);
  });

  it("computes correct average for single item", () => {
    const items = [makeItem({ id: "s1", confidence: 0.60 })];
    expect(computeAvgConfidence(items)).toBeCloseTo(60.0, 1);
  });

  it("computes correct average for fixture items", () => {
    // (0.35 + 0.55 + 0.65 + 0.72 + 0.78 + 0.40) / 6 = 0.575 -> 57.5%
    const avg = computeAvgConfidence(FIXTURE_ITEMS);
    expect(avg).toBeCloseTo(57.5, 1);
  });

  it("returns 100 for all-perfect confidence", () => {
    const items = [
      makeItem({ id: "p1", confidence: 1.0 }),
      makeItem({ id: "p2", confidence: 1.0 }),
    ];
    expect(computeAvgConfidence(items)).toBeCloseTo(100, 1);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 7. Tab count aggregation
// ══════════════════════════════════════════════════════════════════════════════

describe("Review Queue -- computeTabCounts", () => {
  it("returns all zeros for empty items", () => {
    const counts = computeTabCounts([]);
    expect(counts).toEqual({ all: 0, low: 0, medium: 0, acceptable: 0 });
  });

  it("counts fixture items correctly", () => {
    const counts = computeTabCounts(FIXTURE_ITEMS);
    expect(counts.all).toBe(6);
    expect(counts.low).toBe(2);       // t1 (35%), t6 (40%)
    expect(counts.medium).toBe(2);    // t2 (55%), t3 (65%)
    expect(counts.acceptable).toBe(2); // t4 (72%), t5 (78%)
  });

  it("all count equals sum of band counts", () => {
    const counts = computeTabCounts(FIXTURE_ITEMS);
    expect(counts.all).toBe(counts.low + counts.medium + counts.acceptable);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 8. Optimistic removal logic
// ══════════════════════════════════════════════════════════════════════════════

describe("Review Queue -- optimistic removal", () => {
  it("removes item by id from list", () => {
    const idToRemove = "t3";
    const after = FIXTURE_ITEMS.filter(i => i.id !== idToRemove);
    expect(after.length).toBe(5);
    expect(after.find(i => i.id === idToRemove)).toBeUndefined();
  });

  it("does not remove anything when id not found", () => {
    const after = FIXTURE_ITEMS.filter(i => i.id !== "nonexistent");
    expect(after.length).toBe(6);
  });

  it("removing last item produces empty list", () => {
    const single = [makeItem({ id: "only", confidence: 0.50 })];
    const after = single.filter(i => i.id !== "only");
    expect(after.length).toBe(0);
  });

  it("resolved count increments after removal", () => {
    let resolved = 0;
    const items = [...FIXTURE_ITEMS];
    // Simulate approve
    const idx = items.findIndex(i => i.id === "t1");
    expect(idx).toBeGreaterThanOrEqual(0);
    items.splice(idx, 1);
    resolved++;
    expect(resolved).toBe(1);
    expect(items.length).toBe(5);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 9. Edge cases
// ══════════════════════════════════════════════════════════════════════════════

describe("Review Queue -- edge cases", () => {
  it("item with null currency fields produces em-dash pair display", () => {
    const item = makeItem({ id: "e1", confidence: 0.30, currency_sold: null, currency_bought: null });
    const pair =
      item.currency_sold && item.currency_bought
        ? `${item.currency_sold}/${item.currency_bought}`
        : item.currency_sold || item.currency_bought || "\u2014";
    expect(pair).toBe("\u2014");
  });

  it("item with only sold currency shows just sold", () => {
    const item = makeItem({ id: "e2", confidence: 0.30, currency_sold: "EUR", currency_bought: null });
    const pair =
      item.currency_sold && item.currency_bought
        ? `${item.currency_sold}/${item.currency_bought}`
        : item.currency_sold || item.currency_bought || "\u2014";
    expect(pair).toBe("EUR");
  });

  it("item with both currencies shows pair format", () => {
    const item = makeItem({ id: "e3", confidence: 0.30, currency_sold: "GBP", currency_bought: "JPY" });
    const pair =
      item.currency_sold && item.currency_bought
        ? `${item.currency_sold}/${item.currency_bought}`
        : item.currency_sold || item.currency_bought || "\u2014";
    expect(pair).toBe("GBP/JPY");
  });

  it("confidence at exactly 0 is red/low", () => {
    expect(confidenceColor(0)).toBe("red");
    expect(confidenceBand(0)).toBe("low");
  });

  it("empty flags array produces em-dash in display logic", () => {
    const item = makeItem({ id: "e4", confidence: 0.5, flags: [] });
    const flagsDisplay = item.flags.length > 0 ? item.flags.join(", ") : "\u2014";
    expect(flagsDisplay).toBe("\u2014");
  });

  it("multiple flags are joined with comma-space", () => {
    const item = makeItem({ id: "e5", confidence: 0.3, flags: ["rate_outlier", "amount_mismatch", "stale_date"] });
    const flagsDisplay = item.flags.join(", ");
    expect(flagsDisplay).toBe("rate_outlier, amount_mismatch, stale_date");
  });

  it("confidence boundary 0.499 * 100 = 49.9 is low", () => {
    expect(confidenceBand(0.499 * 100)).toBe("low");
  });

  it("confidence boundary 0.50 * 100 = 50 is medium", () => {
    expect(confidenceBand(0.50 * 100)).toBe("medium");
  });

  it("confidence boundary 0.699 * 100 = 69.9 is medium", () => {
    expect(confidenceBand(0.699 * 100)).toBe("medium");
  });

  it("confidence boundary 0.70 * 100 = 70 is acceptable", () => {
    expect(confidenceBand(0.70 * 100)).toBe("acceptable");
  });
});
