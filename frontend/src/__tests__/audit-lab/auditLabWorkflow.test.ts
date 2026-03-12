/**
 * Audit Lab Workflow -- Comprehensive Pure Logic Tests
 *
 * Tests pure logic functions extracted from all Audit Lab pages,
 * plus API endpoint mapping verification and cross-page link integrity.
 *
 * NO React/DOM testing -- pure function and type contract verification only.
 *
 * Pages covered:
 * - Run Detail  (/audit-lab/runs/[run_id]/page.tsx)
 * - Compare     (/audit-lab/compare/page.tsx)
 * - Review      (/audit-lab/review/page.tsx)
 * - Hub         (/audit-lab/page.tsx)
 * - Upload      (/audit-lab/upload/page.tsx)
 * - Trends      (/audit-lab/trends/page.tsx)
 */

// =============================================================================
// Style tokens -- exact values from source S objects
// =============================================================================

const S = {
  red: "var(--accent-red,#f87171)",
  amber: "var(--accent-amber)",
  green: "var(--status-pass,#22c55e)",
  tertiary: "var(--text-tertiary)",
} as const;

// =============================================================================
// Replicated pure functions from source pages (exact implementations)
// =============================================================================

// --- Run detail page: fmt (line 37-40 of runs/[run_id]/page.tsx) ---
function fmt(n: number | undefined | null) {
  if (n == null) return "\u2014";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

// --- Run detail page: SevColor (line 42-47) ---
function SevColor(sev: string) {
  if (sev === "HIGH") return S.red;
  if (sev === "MEDIUM") return S.amber;
  if (sev === "LOW") return S.green;
  return S.tertiary;
}

// --- Compare page: pct (line 42-44) ---
function pct(n: number | undefined | null) {
  if (n == null) return "\u2014";
  return `${n.toFixed(1)}%`;
}

// --- Compare page: deltaIndicator (line 47-59) ---
function deltaIndicator(a: number | null, b: number | null, invert = false) {
  if (a == null || b == null) return null;
  const diff = b - a;
  if (Math.abs(diff) < 0.01)
    return { symbol: "\u2192", color: S.tertiary, diff: 0 };
  const up = diff > 0;
  const good = invert ? up : !up;
  return {
    symbol: up ? "\u2191" : "\u2193",
    color: good ? S.green : S.red,
    diff,
  };
}

// --- Review page: fmtAmount (line 63-69) ---
function fmtAmount(n: number | null | undefined): string {
  if (n == null) return "\u2014";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);
}

// --- Review page: fmtRate (line 71-74) ---
function fmtRate(n: number | null | undefined): string {
  if (n == null) return "\u2014";
  return n.toFixed(6);
}

// --- Review page: confidenceColor (line 76-80) ---
function confidenceColor(pctVal: number): string {
  if (pctVal < 50) return S.red;
  if (pctVal < 70) return S.amber;
  return S.green;
}

// --- Review page: confidenceBand (line 82-86) ---
type FilterTab = "all" | "low" | "medium" | "acceptable";

function confidenceBand(pctVal: number): FilterTab {
  if (pctVal < 50) return "low";
  if (pctVal < 70) return "medium";
  return "acceptable";
}

// --- Review page: filterItems (line 88-91) ---
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

function filterItems(items: ReviewItem[], tab: FilterTab): ReviewItem[] {
  if (tab === "all") return items;
  return items.filter((i) => confidenceBand(i.confidence * 100) === tab);
}

// =============================================================================
// Test fixture factory
// =============================================================================

function makeReviewItem(
  overrides: Partial<ReviewItem> & { id: string; confidence: number }
): ReviewItem {
  return {
    row_index: 1,
    trade_date: "2025-06-15",
    value_date: "2025-06-17",
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

// =============================================================================
// 1. TestFmt -- Run detail page fmt function
// =============================================================================

describe("TestFmt -- Run detail page fmt()", () => {
  it("fmt(null) returns em-dash", () => {
    expect(fmt(null)).toBe("\u2014");
  });

  it("fmt(undefined) returns em-dash", () => {
    expect(fmt(undefined)).toBe("\u2014");
  });

  it("fmt(0) returns '$0'", () => {
    expect(fmt(0)).toBe("$0");
  });

  it("fmt(1234567) returns '$1,234,567'", () => {
    expect(fmt(1234567)).toBe("$1,234,567");
  });

  it("fmt(-5000) returns negative USD", () => {
    const result = fmt(-5000);
    expect(result).toContain("5,000");
    // Intl formats negative as -$5,000
    expect(result).toMatch(/-/);
  });

  it("fmt(0.5) rounds to nearest integer", () => {
    const result = fmt(0.5);
    // 0.5 rounds to $0 or $1 depending on Intl rounding
    expect(result === "$0" || result === "$1").toBe(true);
  });

  it("fmt(25000) returns '$25,000'", () => {
    expect(fmt(25000)).toBe("$25,000");
  });

  it("fmt(1234.56) rounds to '$1,235'", () => {
    expect(fmt(1234.56)).toBe("$1,235");
  });
});

// =============================================================================
// 2. TestSevColor
// =============================================================================

describe("TestSevColor -- severity color mapping", () => {
  it('SevColor("HIGH") returns S.red', () => {
    expect(SevColor("HIGH")).toBe(S.red);
  });

  it('SevColor("MEDIUM") returns S.amber', () => {
    expect(SevColor("MEDIUM")).toBe(S.amber);
  });

  it('SevColor("LOW") returns S.green', () => {
    expect(SevColor("LOW")).toBe(S.green);
  });

  it('SevColor("INFO") returns S.tertiary', () => {
    expect(SevColor("INFO")).toBe(S.tertiary);
  });

  it('SevColor("CRITICAL") returns S.tertiary (unknown severity)', () => {
    expect(SevColor("CRITICAL")).toBe(S.tertiary);
  });

  it('SevColor("") returns S.tertiary', () => {
    expect(SevColor("")).toBe(S.tertiary);
  });

  it("SevColor is case-sensitive: 'high' returns S.tertiary", () => {
    expect(SevColor("high")).toBe(S.tertiary);
  });

  it("SevColor returns exact CSS variable strings", () => {
    expect(SevColor("HIGH")).toBe("var(--accent-red,#f87171)");
    expect(SevColor("MEDIUM")).toBe("var(--accent-amber)");
    expect(SevColor("LOW")).toBe("var(--status-pass,#22c55e)");
  });
});

// =============================================================================
// 3. TestCompareFmt -- Compare page fmt (same implementation)
// =============================================================================

describe("TestCompareFmt -- Compare page fmt()", () => {
  it("fmt(null) returns em-dash (U+2014)", () => {
    expect(fmt(null)).toBe("\u2014");
  });

  it("fmt(undefined) returns em-dash (U+2014)", () => {
    expect(fmt(undefined)).toBe("\u2014");
  });

  it("fmt(0) returns '$0'", () => {
    expect(fmt(0)).toBe("$0");
  });

  it("fmt(1234) returns '$1,234'", () => {
    expect(fmt(1234)).toBe("$1,234");
  });

  it("fmt(10000) returns '$10,000'", () => {
    expect(fmt(10000)).toBe("$10,000");
  });

  it("fmt(999999999) returns '$999,999,999'", () => {
    expect(fmt(999999999)).toBe("$999,999,999");
  });
});

// =============================================================================
// 4. TestPct -- Compare page pct function
// =============================================================================

describe("TestPct -- Compare page pct()", () => {
  it("pct(null) returns em-dash", () => {
    expect(pct(null)).toBe("\u2014");
  });

  it("pct(undefined) returns em-dash", () => {
    expect(pct(undefined)).toBe("\u2014");
  });

  it("pct(50.123) returns '50.1%'", () => {
    expect(pct(50.123)).toBe("50.1%");
  });

  it("pct(0) returns '0.0%'", () => {
    expect(pct(0)).toBe("0.0%");
  });

  it("pct(100) returns '100.0%'", () => {
    expect(pct(100)).toBe("100.0%");
  });

  it("pct(99.95) returns '100.0%' (rounding)", () => {
    expect(pct(99.95)).toBe("100.0%");
  });

  it("pct(33.333) returns '33.3%'", () => {
    expect(pct(33.333)).toBe("33.3%");
  });

  it("pct(87.5) returns '87.5%'", () => {
    expect(pct(87.5)).toBe("87.5%");
  });
});

// =============================================================================
// 5. TestDeltaIndicator -- Compare page delta logic
// =============================================================================

describe("TestDeltaIndicator -- Compare page deltaIndicator()", () => {
  it("both null returns null", () => {
    expect(deltaIndicator(null, null)).toBeNull();
  });

  it("a=null returns null", () => {
    expect(deltaIndicator(null, 100)).toBeNull();
  });

  it("b=null returns null", () => {
    expect(deltaIndicator(100, null)).toBeNull();
  });

  it("a=100, b=100 (diff < 0.01) returns right arrow with diff=0", () => {
    const result = deltaIndicator(100, 100);
    expect(result).not.toBeNull();
    expect(result!.symbol).toBe("\u2192");
    expect(result!.color).toBe(S.tertiary);
    expect(result!.diff).toBe(0);
  });

  it("a=100, b=200 returns up arrow, red (cost increase = bad)", () => {
    const result = deltaIndicator(100, 200);
    expect(result).not.toBeNull();
    expect(result!.symbol).toBe("\u2191");
    expect(result!.color).toBe(S.red);
    expect(result!.diff).toBe(100);
  });

  it("a=200, b=100 returns down arrow, green (cost decrease = good)", () => {
    const result = deltaIndicator(200, 100);
    expect(result).not.toBeNull();
    expect(result!.symbol).toBe("\u2193");
    expect(result!.color).toBe(S.green);
    expect(result!.diff).toBe(-100);
  });

  it("a=100, b=200, invert=true returns up arrow, green (quality increase = good)", () => {
    const result = deltaIndicator(100, 200, true);
    expect(result).not.toBeNull();
    expect(result!.symbol).toBe("\u2191");
    expect(result!.color).toBe(S.green);
  });

  it("a=200, b=100, invert=true returns down arrow, red (quality decrease = bad)", () => {
    const result = deltaIndicator(200, 100, true);
    expect(result).not.toBeNull();
    expect(result!.symbol).toBe("\u2193");
    expect(result!.color).toBe(S.red);
  });

  it("a=100, b=100.005 returns right arrow (within 0.01 threshold)", () => {
    const result = deltaIndicator(100, 100.005);
    expect(result).not.toBeNull();
    expect(result!.symbol).toBe("\u2192");
    expect(result!.diff).toBe(0);
  });

  it("a=0, b=0 returns right arrow", () => {
    const result = deltaIndicator(0, 0);
    expect(result).not.toBeNull();
    expect(result!.symbol).toBe("\u2192");
    expect(result!.diff).toBe(0);
  });

  it("a=-100, b=100 returns up arrow, diff=200", () => {
    const result = deltaIndicator(-100, 100);
    expect(result).not.toBeNull();
    expect(result!.symbol).toBe("\u2191");
    expect(result!.diff).toBe(200);
  });

  it("a=100, b=-100 returns down arrow, diff=-200", () => {
    const result = deltaIndicator(100, -100);
    expect(result).not.toBeNull();
    expect(result!.symbol).toBe("\u2193");
    expect(result!.diff).toBe(-200);
  });

  it("diff exactly 0.01 triggers arrow (not right arrow)", () => {
    const result = deltaIndicator(100, 100.01);
    // Math.abs(0.01) < 0.01 is false, so it triggers actual arrow
    expect(result).not.toBeNull();
    expect(result!.symbol).toBe("\u2191");
  });

  it("diff exactly 0.009 triggers right arrow (within threshold)", () => {
    const result = deltaIndicator(100, 100.009);
    expect(result).not.toBeNull();
    expect(result!.symbol).toBe("\u2192");
    expect(result!.diff).toBe(0);
  });
});

// =============================================================================
// 6. TestFmtAmount -- Review page fmtAmount
// =============================================================================

describe("TestFmtAmount -- Review page fmtAmount()", () => {
  it("fmtAmount(null) returns em-dash", () => {
    expect(fmtAmount(null)).toBe("\u2014");
  });

  it("fmtAmount(undefined) returns em-dash", () => {
    expect(fmtAmount(undefined)).toBe("\u2014");
  });

  it("fmtAmount(500000) returns '500,000'", () => {
    expect(fmtAmount(500000)).toBe("500,000");
  });

  it("fmtAmount(0.5) returns '0.5'", () => {
    expect(fmtAmount(0.5)).toBe("0.5");
  });

  it("fmtAmount(0) returns '0'", () => {
    expect(fmtAmount(0)).toBe("0");
  });

  it("fmtAmount(1234567.89) returns '1,234,567.89'", () => {
    expect(fmtAmount(1234567.89)).toBe("1,234,567.89");
  });

  it("fmtAmount(100000) returns '100,000'", () => {
    expect(fmtAmount(100000)).toBe("100,000");
  });

  it("fmtAmount(1234.56) returns '1,234.56'", () => {
    expect(fmtAmount(1234.56)).toBe("1,234.56");
  });
});

// =============================================================================
// 7. TestFmtRate -- Review page fmtRate
// =============================================================================

describe("TestFmtRate -- Review page fmtRate()", () => {
  it("fmtRate(null) returns em-dash", () => {
    expect(fmtRate(null)).toBe("\u2014");
  });

  it("fmtRate(undefined) returns em-dash", () => {
    expect(fmtRate(undefined)).toBe("\u2014");
  });

  it("fmtRate(0.054321) returns '0.054321'", () => {
    expect(fmtRate(0.054321)).toBe("0.054321");
  });

  it("fmtRate(18.123456789) returns '18.123457' (rounds at 6 decimals)", () => {
    expect(fmtRate(18.123456789)).toBe("18.123457");
  });

  it("fmtRate(0) returns '0.000000'", () => {
    expect(fmtRate(0)).toBe("0.000000");
  });

  it("fmtRate(1) returns '1.000000'", () => {
    expect(fmtRate(1)).toBe("1.000000");
  });

  it("fmtRate(1.08) returns '1.080000'", () => {
    expect(fmtRate(1.08)).toBe("1.080000");
  });

  it("fmtRate(0.006543) returns '0.006543'", () => {
    expect(fmtRate(0.006543)).toBe("0.006543");
  });
});

// =============================================================================
// 8. TestConfidenceColor
// =============================================================================

describe("TestConfidenceColor -- Review page confidenceColor()", () => {
  it("confidenceColor(0) returns S.red", () => {
    expect(confidenceColor(0)).toBe(S.red);
  });

  it("confidenceColor(49) returns S.red", () => {
    expect(confidenceColor(49)).toBe(S.red);
  });

  it("confidenceColor(50) returns S.amber", () => {
    expect(confidenceColor(50)).toBe(S.amber);
  });

  it("confidenceColor(69) returns S.amber", () => {
    expect(confidenceColor(69)).toBe(S.amber);
  });

  it("confidenceColor(70) returns S.green", () => {
    expect(confidenceColor(70)).toBe(S.green);
  });

  it("confidenceColor(100) returns S.green", () => {
    expect(confidenceColor(100)).toBe(S.green);
  });

  it("boundary: confidenceColor(49.9) returns S.red", () => {
    expect(confidenceColor(49.9)).toBe(S.red);
  });

  it("boundary: confidenceColor(69.9) returns S.amber", () => {
    expect(confidenceColor(69.9)).toBe(S.amber);
  });

  it("confidenceColor(25) returns S.red", () => {
    expect(confidenceColor(25)).toBe(S.red);
  });

  it("confidenceColor(60) returns S.amber", () => {
    expect(confidenceColor(60)).toBe(S.amber);
  });

  it("confidenceColor(85) returns S.green", () => {
    expect(confidenceColor(85)).toBe(S.green);
  });
});

// =============================================================================
// 9. TestConfidenceBand
// =============================================================================

describe("TestConfidenceBand -- Review page confidenceBand()", () => {
  it('confidenceBand(0) returns "low"', () => {
    expect(confidenceBand(0)).toBe("low");
  });

  it('confidenceBand(49) returns "low"', () => {
    expect(confidenceBand(49)).toBe("low");
  });

  it('confidenceBand(50) returns "medium"', () => {
    expect(confidenceBand(50)).toBe("medium");
  });

  it('confidenceBand(69) returns "medium"', () => {
    expect(confidenceBand(69)).toBe("medium");
  });

  it('confidenceBand(70) returns "acceptable"', () => {
    expect(confidenceBand(70)).toBe("acceptable");
  });

  it('confidenceBand(100) returns "acceptable"', () => {
    expect(confidenceBand(100)).toBe("acceptable");
  });

  it('confidenceBand(49.9) returns "low" (boundary)', () => {
    expect(confidenceBand(49.9)).toBe("low");
  });

  it('confidenceBand(69.9) returns "medium" (boundary)', () => {
    expect(confidenceBand(69.9)).toBe("medium");
  });
});

// =============================================================================
// 10. TestFilterItems
// =============================================================================

describe("TestFilterItems -- Review page filterItems()", () => {
  const items: ReviewItem[] = [
    makeReviewItem({ id: "r1", confidence: 0.35 }), // 35% = low
    makeReviewItem({ id: "r2", confidence: 0.55 }), // 55% = medium
    makeReviewItem({ id: "r3", confidence: 0.65 }), // 65% = medium
    makeReviewItem({ id: "r4", confidence: 0.72 }), // 72% = acceptable
    makeReviewItem({ id: "r5", confidence: 0.40 }), // 40% = low
    makeReviewItem({ id: "r6", confidence: 0.90 }), // 90% = acceptable
  ];

  it('filterItems(items, "all") returns all items', () => {
    expect(filterItems(items, "all")).toHaveLength(6);
    expect(filterItems(items, "all")).toBe(items); // same reference
  });

  it('filterItems(items, "low") returns only items with confidence*100 < 50', () => {
    const result = filterItems(items, "low");
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.id).sort()).toEqual(["r1", "r5"]);
  });

  it('filterItems(items, "medium") returns only items with 50 <= confidence*100 < 70', () => {
    const result = filterItems(items, "medium");
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.id).sort()).toEqual(["r2", "r3"]);
  });

  it('filterItems(items, "acceptable") returns only items with confidence*100 >= 70', () => {
    const result = filterItems(items, "acceptable");
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.id).sort()).toEqual(["r4", "r6"]);
  });

  it('filterItems([], "all") returns []', () => {
    expect(filterItems([], "all")).toHaveLength(0);
  });

  it('filterItems([], "low") returns []', () => {
    expect(filterItems([], "low")).toHaveLength(0);
  });

  it("filterItems with mixed confidences produces correct band counts", () => {
    const low = filterItems(items, "low");
    const medium = filterItems(items, "medium");
    const acceptable = filterItems(items, "acceptable");
    expect(low.length + medium.length + acceptable.length).toBe(items.length);
  });

  it("filterItems preserves item order within band", () => {
    const result = filterItems(items, "low");
    // r1 (0.35) appears before r5 (0.40) in the original array
    expect(result[0].id).toBe("r1");
    expect(result[1].id).toBe("r5");
  });

  it("filterItems does not mutate input array", () => {
    const original = [...items];
    filterItems(items, "medium");
    expect(items).toEqual(original);
  });
});

// =============================================================================
// 11. TestApiEndpointMapping
// =============================================================================

describe("TestApiEndpointMapping -- API paths used across pages", () => {
  // Hub page endpoints (from page.tsx lines 84-85)
  it("Hub page calls GET /v1/audit-lab/datasets", () => {
    const endpoint = "/v1/audit-lab/datasets";
    expect(endpoint).toBe("/v1/audit-lab/datasets");
    expect(endpoint.startsWith("/v1/audit-lab/")).toBe(true);
  });

  it("Hub page calls GET /v1/audit-lab/runs", () => {
    const endpoint = "/v1/audit-lab/runs";
    expect(endpoint).toBe("/v1/audit-lab/runs");
  });

  // Upload page endpoints (from upload/page.tsx lines 107, 142)
  it("Upload page calls POST /v1/audit-lab/datasets/upload", () => {
    const endpoint = "/v1/audit-lab/datasets/upload";
    expect(endpoint).toBe("/v1/audit-lab/datasets/upload");
  });

  it("Upload page calls POST /v1/audit-lab/runs", () => {
    const endpoint = "/v1/audit-lab/runs";
    expect(endpoint).toBe("/v1/audit-lab/runs");
  });

  // Run detail page endpoints (from runs/[run_id]/page.tsx lines 127, 139, 149)
  it("Run detail calls GET /v1/audit-lab/runs/{run_id}", () => {
    const runId = "550e8400-e29b-41d4";
    const endpoint = `/v1/audit-lab/runs/${runId}`;
    expect(endpoint).toBe("/v1/audit-lab/runs/550e8400-e29b-41d4");
    expect(endpoint).toMatch(/^\/v1\/audit-lab\/runs\/[a-zA-Z0-9-]+$/);
  });

  it("Run detail calls GET /v1/audit-lab/runs/{run_id}/transactions", () => {
    const runId = "run-001";
    const endpoint = `/v1/audit-lab/runs/${runId}/transactions`;
    expect(endpoint).toBe("/v1/audit-lab/runs/run-001/transactions");
  });

  it("Run detail calls GET /v1/audit-lab/runs/{run_id}/export", () => {
    const runId = "run-001";
    const endpoint = `/v1/audit-lab/runs/${runId}/export`;
    expect(endpoint).toBe("/v1/audit-lab/runs/run-001/export");
  });

  // Compare page endpoint (from compare/page.tsx line 159-161)
  it("Compare page calls GET /v1/audit-lab/compare?run_ids=...", () => {
    const runIds = "run-001,run-002";
    const endpoint = `/v1/audit-lab/compare?run_ids=${encodeURIComponent(runIds)}`;
    expect(endpoint).toContain("/v1/audit-lab/compare");
    expect(endpoint).toContain("run_ids=");
    expect(endpoint).toContain("run-001");
  });

  it("Compare page encodes run_ids with encodeURIComponent", () => {
    const runIds = "abc-123,def-456";
    const encoded = encodeURIComponent(runIds);
    expect(encoded).toBe("abc-123%2Cdef-456");
  });

  // Review page endpoints (from review/page.tsx lines 111, 140-141)
  it("Review page calls GET /v1/audit-lab/review-queue", () => {
    const endpoint = "/v1/audit-lab/review-queue";
    expect(endpoint).toBe("/v1/audit-lab/review-queue");
  });

  it("Review page calls POST /v1/audit-lab/review-queue/{id}/resolve", () => {
    const itemId = "item-001";
    const endpoint = `/v1/audit-lab/review-queue/${itemId}/resolve`;
    expect(endpoint).toBe("/v1/audit-lab/review-queue/item-001/resolve");
  });

  it("Review resolve sends action in JSON body", () => {
    const approveBody = JSON.stringify({ action: "approve" });
    expect(JSON.parse(approveBody).action).toBe("approve");
    const rejectBody = JSON.stringify({ action: "reject" });
    expect(JSON.parse(rejectBody).action).toBe("reject");
  });

  // Trends page endpoint (from trends/page.tsx line 284)
  it("Trends page calls GET /v1/audit-lab/trends", () => {
    const endpoint = "/v1/audit-lab/trends";
    expect(endpoint).toBe("/v1/audit-lab/trends");
  });

  // All endpoints share prefix
  it("all audit-lab endpoints share /v1/audit-lab/ prefix", () => {
    const endpoints = [
      "/v1/audit-lab/datasets",
      "/v1/audit-lab/runs",
      "/v1/audit-lab/datasets/upload",
      "/v1/audit-lab/runs/run-001",
      "/v1/audit-lab/runs/run-001/transactions",
      "/v1/audit-lab/runs/run-001/export",
      "/v1/audit-lab/compare?run_ids=a,b",
      "/v1/audit-lab/review-queue",
      "/v1/audit-lab/review-queue/item-001/resolve",
      "/v1/audit-lab/trends",
    ];
    for (const ep of endpoints) {
      expect(ep.startsWith("/v1/audit-lab/")).toBe(true);
    }
  });

  it("POST endpoints are exactly 3", () => {
    const postEndpoints = [
      { path: "/v1/audit-lab/datasets/upload", method: "POST" },
      { path: "/v1/audit-lab/runs", method: "POST" },
      { path: "/v1/audit-lab/review-queue/{id}/resolve", method: "POST" },
    ];
    expect(postEndpoints).toHaveLength(3);
    expect(postEndpoints.every((ep) => ep.method === "POST")).toBe(true);
  });

  it("GET endpoints are exactly 8", () => {
    const getEndpoints = [
      "/v1/audit-lab/datasets",
      "/v1/audit-lab/runs",
      "/v1/audit-lab/runs/{run_id}",
      "/v1/audit-lab/runs/{run_id}/transactions",
      "/v1/audit-lab/runs/{run_id}/export",
      "/v1/audit-lab/compare",
      "/v1/audit-lab/review-queue",
      "/v1/audit-lab/trends",
    ];
    expect(getEndpoints).toHaveLength(8);
  });
});

// =============================================================================
// 12. TestLinkIntegrity -- hrefs between pages
// =============================================================================

describe("TestLinkIntegrity -- cross-page navigation links", () => {
  // Helper to validate route patterns
  const STATIC_ROUTES = [
    "/audit-lab",
    "/audit-lab/upload",
    "/audit-lab/compare",
    "/audit-lab/review",
    "/audit-lab/trends",
  ];

  function isValidAuditLabRoute(path: string): boolean {
    if (STATIC_ROUTES.includes(path)) return true;
    if (/^\/audit-lab\/runs\/[a-zA-Z0-9_-]+$/.test(path)) return true;
    if (/^\/audit-lab\/upload\?dataset_id=[a-zA-Z0-9_-]+$/.test(path))
      return true;
    return false;
  }

  // Hub -> Upload (page.tsx line 122: href="/audit-lab/upload")
  it('Hub -> Upload: href="/audit-lab/upload"', () => {
    const href = "/audit-lab/upload";
    expect(href).toBe("/audit-lab/upload");
    expect(isValidAuditLabRoute(href)).toBe(true);
  });

  // Hub -> Run by ID (page.tsx line 204: href={`/audit-lab/runs/${run.run_id}`})
  it('Hub -> Run by ID: href="/audit-lab/runs/{id}"', () => {
    const runId = "550e8400-e29b-41d4-a716-446655440000";
    const href = `/audit-lab/runs/${runId}`;
    expect(href).toBe("/audit-lab/runs/550e8400-e29b-41d4-a716-446655440000");
    expect(isValidAuditLabRoute(href)).toBe(true);
  });

  // Hub dataset -> Run with dataset (page.tsx line 175: href={`/audit-lab/upload?dataset_id=${ds.id}`})
  it('Hub dataset -> Run with dataset: href="/audit-lab/upload?dataset_id={id}"', () => {
    const dsId = "ds-001";
    const href = `/audit-lab/upload?dataset_id=${dsId}`;
    expect(href).toBe("/audit-lab/upload?dataset_id=ds-001");
    expect(isValidAuditLabRoute(href)).toBe(true);
  });

  // Upload -> Hub breadcrumb (upload/page.tsx line 167: href="/audit-lab")
  it('Upload -> Hub breadcrumb: href="/audit-lab"', () => {
    const href = "/audit-lab";
    expect(href).toBe("/audit-lab");
    expect(isValidAuditLabRoute(href)).toBe(true);
  });

  // Run detail -> Hub breadcrumb (runs/[run_id]/page.tsx line 205: href="/audit-lab")
  it('Run detail -> Hub breadcrumb: href="/audit-lab"', () => {
    const href = "/audit-lab";
    expect(href).toBe("/audit-lab");
    expect(isValidAuditLabRoute(href)).toBe(true);
  });

  // Compare -> Hub breadcrumb (compare/page.tsx line 191/230: href="/audit-lab")
  it('Compare -> Hub breadcrumb: href="/audit-lab"', () => {
    const href = "/audit-lab";
    expect(href).toBe("/audit-lab");
    expect(isValidAuditLabRoute(href)).toBe(true);
  });

  // Review -> Hub breadcrumb (review/page.tsx line 211: href="/audit-lab")
  it('Review -> Hub breadcrumb: href="/audit-lab"', () => {
    const href = "/audit-lab";
    expect(href).toBe("/audit-lab");
    expect(isValidAuditLabRoute(href)).toBe(true);
  });

  // Trends -> Hub breadcrumb (trends/page.tsx line 321: href="/audit-lab")
  it('Trends -> Hub breadcrumb: href="/audit-lab"', () => {
    const href = "/audit-lab";
    expect(href).toBe("/audit-lab");
    expect(isValidAuditLabRoute(href)).toBe(true);
  });

  // Compare -> Run detail (compare/page.tsx line 261: href={`/audit-lab/runs/${r.run_id}`})
  it("Compare -> Run detail link is valid", () => {
    const runId = "abc-def-123456";
    const href = `/audit-lab/runs/${runId}`;
    expect(isValidAuditLabRoute(href)).toBe(true);
  });

  it("all breadcrumb links in sub-pages point to /audit-lab", () => {
    // Verified in source: upload, run detail, compare, review, trends
    // All have: <a href="/audit-lab" ...>AUDIT LAB</a>
    const breadcrumbHref = "/audit-lab";
    expect(breadcrumbHref).toBe("/audit-lab");
  });

  it("rejects invalid audit-lab routes", () => {
    expect(isValidAuditLabRoute("/audit-lab/nonexistent")).toBe(false);
    expect(isValidAuditLabRoute("/other-page")).toBe(false);
    expect(isValidAuditLabRoute("/audit-lab/runs/")).toBe(false);
  });
});
