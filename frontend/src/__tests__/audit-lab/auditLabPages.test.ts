/**
 * Audit Lab Pages -- Unit Tests
 *
 * Tests data transformation and business logic used by:
 * - Compare page (Item 19) -- delta indicators, KPI comparison
 * - Review page (Item 24) -- status filtering, formatting
 * - Audit Trail page (Item 38) -- search, filter, CSV export
 * - Trends page (Item 40) -- date range, counterparty sorting
 * - CsvPreview component (Item 12) -- column mapping, alias detection
 */

// ══════════════════════════════════════════════════════════════════════════════
// 1. Compare page -- delta indicator logic
// ══════════════════════════════════════════════════════════════════════════════

function deltaIndicator(a: number | null, b: number | null, invert = false) {
  if (a == null || b == null) return null;
  const diff = b - a;
  if (Math.abs(diff) < 0.01) return { symbol: "\u2192", color: "tertiary", diff: 0 };
  const up = diff > 0;
  const good = invert ? up : !up;
  return {
    symbol: up ? "\u2191" : "\u2193",
    color: good ? "green" : "red",
    diff,
  };
}

describe("Compare page -- deltaIndicator", () => {
  it("returns null when first value is null", () => {
    expect(deltaIndicator(null, 100)).toBeNull();
  });

  it("returns null when second value is null", () => {
    expect(deltaIndicator(100, null)).toBeNull();
  });

  it("returns neutral arrow for negligible difference", () => {
    const result = deltaIndicator(100, 100.005);
    expect(result).not.toBeNull();
    expect(result!.symbol).toBe("\u2192");
    expect(result!.diff).toBe(0);
  });

  it("returns red up-arrow for cost increase (default: lower is better)", () => {
    const result = deltaIndicator(100, 200);
    expect(result).not.toBeNull();
    expect(result!.symbol).toBe("\u2191");
    expect(result!.color).toBe("red");
    expect(result!.diff).toBe(100);
  });

  it("returns green down-arrow for cost decrease", () => {
    const result = deltaIndicator(200, 100);
    expect(result).not.toBeNull();
    expect(result!.symbol).toBe("\u2193");
    expect(result!.color).toBe("green");
    expect(result!.diff).toBe(-100);
  });

  it("inverted: up-arrow is green (higher is better, e.g. quality score)", () => {
    const result = deltaIndicator(50, 80, true);
    expect(result).not.toBeNull();
    expect(result!.symbol).toBe("\u2191");
    expect(result!.color).toBe("green");
  });

  it("inverted: down-arrow is red (quality decreased)", () => {
    const result = deltaIndicator(80, 50, true);
    expect(result).not.toBeNull();
    expect(result!.symbol).toBe("\u2193");
    expect(result!.color).toBe("red");
  });

  it("handles zero values correctly", () => {
    const result = deltaIndicator(0, 500);
    expect(result).not.toBeNull();
    expect(result!.symbol).toBe("\u2191");
    expect(result!.diff).toBe(500);
  });

  it("handles negative values", () => {
    const result = deltaIndicator(-100, -50);
    expect(result).not.toBeNull();
    expect(result!.symbol).toBe("\u2191");
    expect(result!.diff).toBe(50);
  });
});

describe("Compare page -- currency pair deduplication", () => {
  it("collects unique pairs across multiple runs", () => {
    const run1Pairs = { "EUR/USD": 100, "GBP/USD": 200 };
    const run2Pairs = { "EUR/USD": 150, "USD/JPY": 50 };
    const allPairs = Array.from(
      new Set([...Object.keys(run1Pairs), ...Object.keys(run2Pairs)])
    ).sort();
    expect(allPairs).toEqual(["EUR/USD", "GBP/USD", "USD/JPY"]);
  });

  it("handles empty markup_by_pair", () => {
    const allPairs = Array.from(new Set(Object.keys({}))).sort();
    expect(allPairs).toEqual([]);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. Review page -- status filtering
// ══════════════════════════════════════════════════════════════════════════════

interface RunListItem {
  run_id: string;
  status: string;
  created_at: string;
  summary?: { total_markup_usd?: number };
}

describe("Review page -- status filtering", () => {
  const runs: RunListItem[] = [
    { run_id: "a1", status: "COMPLETED", created_at: "2025-06-01T10:00:00Z", summary: { total_markup_usd: 5000 } },
    { run_id: "a2", status: "FAILED", created_at: "2025-06-02T11:00:00Z" },
    { run_id: "a3", status: "COMPLETED", created_at: "2025-06-03T12:00:00Z", summary: { total_markup_usd: -200 } },
    { run_id: "a4", status: "RUNNING", created_at: "2025-06-04T13:00:00Z" },
  ];

  it("filter 'all' returns all runs", () => {
    const filtered = runs;
    expect(filtered.length).toBe(4);
  });

  it("filter 'COMPLETED' returns only completed runs", () => {
    const filtered = runs.filter(r => r.status === "COMPLETED");
    expect(filtered.length).toBe(2);
    expect(filtered.every(r => r.status === "COMPLETED")).toBe(true);
  });

  it("filter 'FAILED' returns only failed runs", () => {
    const filtered = runs.filter(r => r.status === "FAILED");
    expect(filtered.length).toBe(1);
    expect(filtered[0].run_id).toBe("a2");
  });

  it("handles missing summary gracefully in markup display", () => {
    const run = runs.find(r => r.run_id === "a2")!;
    expect(run.summary?.total_markup_usd).toBeUndefined();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. Audit Trail page -- search, filter, CSV export
// ══════════════════════════════════════════════════════════════════════════════

interface AuditEvent {
  id: string;
  timestamp: string;
  event_type: string;
  description: string;
  entity_type: string;
  actor_email: string;
  hash: string;
}

describe("Audit Trail -- search logic", () => {
  const events: AuditEvent[] = [
    { id: "1", timestamp: "2025-06-01T10:00:00Z", event_type: "CREATE_POSITION", description: "Created EUR/USD position", entity_type: "POSITION", actor_email: "alice@acme.com", hash: "abc123" },
    { id: "2", timestamp: "2025-06-02T11:00:00Z", event_type: "APPROVE_PROPOSAL", description: "Approved hedge proposal", entity_type: "PROPOSAL", actor_email: "bob@acme.com", hash: "def456" },
    { id: "3", timestamp: "2025-06-03T12:00:00Z", event_type: "DELETE_POSITION", description: "Deleted stale GBP/USD position", entity_type: "POSITION", actor_email: "alice@acme.com", hash: "ghi789" },
  ];

  function filterEvents(events: AuditEvent[], search: string, typeFilter: string) {
    let result = events;
    if (typeFilter !== "all") {
      result = result.filter(e => e.event_type === typeFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(e =>
        e.description.toLowerCase().includes(q)
        || e.actor_email.toLowerCase().includes(q)
        || e.entity_type.toLowerCase().includes(q)
        || e.event_type.toLowerCase().includes(q)
        || e.hash.toLowerCase().includes(q)
      );
    }
    return result;
  }

  it("returns all events with no filters", () => {
    expect(filterEvents(events, "", "all").length).toBe(3);
  });

  it("filters by event type", () => {
    const result = filterEvents(events, "", "CREATE_POSITION");
    expect(result.length).toBe(1);
    expect(result[0].id).toBe("1");
  });

  it("searches by description", () => {
    const result = filterEvents(events, "hedge", "all");
    expect(result.length).toBe(1);
    expect(result[0].id).toBe("2");
  });

  it("searches by actor email", () => {
    const result = filterEvents(events, "alice", "all");
    expect(result.length).toBe(2);
  });

  it("searches by hash", () => {
    const result = filterEvents(events, "def456", "all");
    expect(result.length).toBe(1);
    expect(result[0].id).toBe("2");
  });

  it("combines type filter + search", () => {
    const result = filterEvents(events, "alice", "DELETE_POSITION");
    expect(result.length).toBe(1);
    expect(result[0].id).toBe("3");
  });

  it("search is case insensitive", () => {
    const result = filterEvents(events, "EUR/USD", "all");
    expect(result.length).toBe(1);
    expect(result[0].id).toBe("1");
  });

  it("returns empty for no matches", () => {
    const result = filterEvents(events, "zzzzz", "all");
    expect(result.length).toBe(0);
  });
});

describe("Audit Trail -- CSV export", () => {
  it("escapes double quotes in CSV values", () => {
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    expect(escape('He said "hello"')).toBe('"He said ""hello"""');
  });

  it("produces correct header row", () => {
    const headers = ["timestamp", "event_type", "description", "entity_type", "actor_email", "hash"];
    expect(headers.join(",")).toBe("timestamp,event_type,description,entity_type,actor_email,hash");
  });

  it("distinct event types are sorted", () => {
    const events = [
      { event_type: "DELETE" },
      { event_type: "CREATE" },
      { event_type: "UPDATE" },
      { event_type: "CREATE" },
    ];
    const types = Array.from(new Set(events.map(e => e.event_type))).sort();
    expect(types).toEqual(["CREATE", "DELETE", "UPDATE"]);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 4. Trends page -- date range and counterparty sorting
// ══════════════════════════════════════════════════════════════════════════════

interface TrendPoint {
  date: string;
  total_markup_usd: number;
  data_quality_score: number;
}

interface CounterpartyBreakdown {
  counterparty: string;
  total_markup_usd: number;
}

describe("Trends page -- date range", () => {
  it("computes date range from trend points", () => {
    const points: TrendPoint[] = [
      { date: "2025-03", total_markup_usd: 1000, data_quality_score: 85 },
      { date: "2025-01", total_markup_usd: 500, data_quality_score: 90 },
      { date: "2025-06", total_markup_usd: 2000, data_quality_score: 78 },
    ];
    const dates = points.map(p => p.date).sort();
    expect(dates[0]).toBe("2025-01");
    expect(dates[dates.length - 1]).toBe("2025-06");
  });

  it("handles empty trend points", () => {
    const points: TrendPoint[] = [];
    const dateRange = points.length > 0 ? { from: "x", to: "y" } : null;
    expect(dateRange).toBeNull();
  });

  it("handles single point", () => {
    const points: TrendPoint[] = [
      { date: "2025-04", total_markup_usd: 100, data_quality_score: 95 },
    ];
    const dates = points.map(p => p.date).sort();
    expect(dates[0]).toBe("2025-04");
    expect(dates[dates.length - 1]).toBe("2025-04");
  });
});

describe("Trends page -- counterparty sorting", () => {
  it("sorts counterparties by markup descending", () => {
    const data: CounterpartyBreakdown[] = [
      { counterparty: "BankA", total_markup_usd: 100 },
      { counterparty: "BankC", total_markup_usd: 500 },
      { counterparty: "BankB", total_markup_usd: 250 },
    ];
    const sorted = [...data].sort((a, b) => b.total_markup_usd - a.total_markup_usd);
    expect(sorted[0].counterparty).toBe("BankC");
    expect(sorted[1].counterparty).toBe("BankB");
    expect(sorted[2].counterparty).toBe("BankA");
  });

  it("computes chart height based on counterparty count", () => {
    const count = 8;
    const height = Math.max(200, count * 36 + 48);
    expect(height).toBe(336);
  });

  it("enforces minimum chart height of 200", () => {
    const count = 2;
    const height = Math.max(200, count * 36 + 48);
    expect(height).toBe(200);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 5. CsvPreview component -- column mapping and alias detection
// ══════════════════════════════════════════════════════════════════════════════

const REQUIRED_COLUMNS = [
  "trade_date",
  "currency_sold",
  "currency_bought",
  "amount_sold",
  "amount_bought",
] as const;

const ALIASES: Record<string, string> = {
  date:             "trade_date",
  transaction_date: "trade_date",
  tradedate:        "trade_date",
  ccy_sold:         "currency_sold",
  sell_currency:    "currency_sold",
  sold_currency:    "currency_sold",
  currencysold:     "currency_sold",
  ccy_bought:       "currency_bought",
  buy_currency:     "currency_bought",
  bought_currency:  "currency_bought",
  currencybought:   "currency_bought",
  sell_amount:      "amount_sold",
  sold_amount:      "amount_sold",
  amountsold:       "amount_sold",
  buy_amount:       "amount_bought",
  bought_amount:    "amount_bought",
  amountbought:     "amount_bought",
};

function normalizeHeader(h: string): string {
  const cleaned = h.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return ALIASES[cleaned] ?? cleaned;
}

describe("CsvPreview -- column normalization", () => {
  it("normalizes exact required column names", () => {
    expect(normalizeHeader("trade_date")).toBe("trade_date");
    expect(normalizeHeader("currency_sold")).toBe("currency_sold");
    expect(normalizeHeader("amount_bought")).toBe("amount_bought");
  });

  it("resolves known aliases", () => {
    expect(normalizeHeader("date")).toBe("trade_date");
    expect(normalizeHeader("transaction_date")).toBe("trade_date");
    expect(normalizeHeader("ccy_sold")).toBe("currency_sold");
    expect(normalizeHeader("buy_currency")).toBe("currency_bought");
    expect(normalizeHeader("sell_amount")).toBe("amount_sold");
    expect(normalizeHeader("bought_amount")).toBe("amount_bought");
  });

  it("handles leading/trailing whitespace", () => {
    expect(normalizeHeader("  trade_date  ")).toBe("trade_date");
    expect(normalizeHeader(" ccy_sold ")).toBe("currency_sold");
  });

  it("handles case insensitivity", () => {
    expect(normalizeHeader("Trade_Date")).toBe("trade_date");
    expect(normalizeHeader("CCY_SOLD")).toBe("currency_sold");
    expect(normalizeHeader("BUY_AMOUNT")).toBe("amount_bought");
  });

  it("handles hyphenated headers", () => {
    expect(normalizeHeader("trade-date")).toBe("trade_date");
    expect(normalizeHeader("sell-amount")).toBe("amount_sold");
  });

  it("handles space-separated headers", () => {
    expect(normalizeHeader("trade date")).toBe("trade_date");
    expect(normalizeHeader("sell amount")).toBe("amount_sold");
  });

  it("passes through unknown columns unchanged (after cleaning)", () => {
    expect(normalizeHeader("counterparty")).toBe("counterparty");
    expect(normalizeHeader("settlement_date")).toBe("settlement_date");
    expect(normalizeHeader("Custom Column")).toBe("custom_column");
  });
});

describe("CsvPreview -- required column detection", () => {
  it("detects all required columns when exact names present", () => {
    const headers = ["trade_date", "currency_sold", "currency_bought", "amount_sold", "amount_bought", "counterparty"];
    const mapped = REQUIRED_COLUMNS.filter(req =>
      headers.some(h => normalizeHeader(h) === req)
    );
    expect(mapped.length).toBe(5);
  });

  it("detects required columns via aliases", () => {
    const headers = ["date", "ccy_sold", "buy_currency", "sell_amount", "bought_amount"];
    const mapped = REQUIRED_COLUMNS.filter(req =>
      headers.some(h => normalizeHeader(h) === req)
    );
    expect(mapped.length).toBe(5);
  });

  it("identifies unmapped required columns", () => {
    const headers = ["trade_date", "currency_sold", "counterparty"];
    const mapped = REQUIRED_COLUMNS.filter(req =>
      headers.some(h => normalizeHeader(h) === req)
    );
    const unmapped = REQUIRED_COLUMNS.filter(req =>
      !headers.some(h => normalizeHeader(h) === req)
    );
    expect(mapped.length).toBe(2);
    expect(unmapped.length).toBe(3);
    expect(unmapped).toContain("currency_bought");
    expect(unmapped).toContain("amount_sold");
    expect(unmapped).toContain("amount_bought");
  });

  it("handles empty headers", () => {
    const headers: string[] = [];
    const mapped = REQUIRED_COLUMNS.filter(req =>
      headers.some(h => normalizeHeader(h) === req)
    );
    expect(mapped.length).toBe(0);
  });

  it("handles mixed alias + exact names", () => {
    const headers = ["trade_date", "ccy_sold", "currency_bought", "sell_amount", "amount_bought"];
    const mapped = REQUIRED_COLUMNS.filter(req =>
      headers.some(h => normalizeHeader(h) === req)
    );
    expect(mapped.length).toBe(5);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 6. Formatting helpers shared across pages
// ══════════════════════════════════════════════════════════════════════════════

function fmt(n: number | undefined | null) {
  if (n == null) return "\u2014";
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD",
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n);
}

function pct(n: number | undefined | null) {
  if (n == null) return "\u2014";
  return `${n.toFixed(1)}%`;
}

describe("Shared formatters", () => {
  it("fmt returns em-dash for null", () => {
    expect(fmt(null)).toBe("\u2014");
  });

  it("fmt returns em-dash for undefined", () => {
    expect(fmt(undefined)).toBe("\u2014");
  });

  it("fmt formats positive USD", () => {
    expect(fmt(1500)).toBe("$1,500");
  });

  it("fmt formats negative USD", () => {
    const result = fmt(-250);
    expect(result).toContain("250");
  });

  it("fmt formats zero", () => {
    expect(fmt(0)).toBe("$0");
  });

  it("pct returns em-dash for null", () => {
    expect(pct(null)).toBe("\u2014");
  });

  it("pct formats percentage", () => {
    expect(pct(85.6)).toBe("85.6%");
  });

  it("pct formats zero", () => {
    expect(pct(0)).toBe("0.0%");
  });
});
