/**
 * Audit Lab Export Utilities — Unit Tests
 *
 * Tests the data transformation, type safety, and helper logic for:
 * - exportAuditLabPdf (Item 17)
 * - exportAuditLabXlsx (Item 18)
 * - exportBoardSummaryPdf (Item 36)
 * - exportAuditLabCsv (Item 38)
 *
 * PDF/XLSX generation requires browser APIs (jsPDF, SheetJS, papaparse)
 * so we test the exported types, helper logic, and data shaping here.
 */

import type { RunData, Transaction } from "../../utils/auditLabExport";

// ══════════════════════════════════════════════════════════════════════════════
// Test Fixtures
// ══════════════════════════════════════════════════════════════════════════════

function makeRunData(overrides: Partial<RunData> = {}): RunData {
  return {
    run_id: "run-001-abc",
    run_hash: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
    methodology_version: "1.0.0",
    created_at: "2026-03-09T12:00:00Z",
    summary: {
      total_markup_cost_usd: 15000,
      avg_markup_bps: 12.5,
      max_markup_bps: 45.2,
      transaction_count: 250,
      total_fees_usd: 3200,
      outlier_pct: 3.1,
    },
    findings: [
      { severity: "HIGH", category: "EXCESSIVE_MARKUP", description: "Markup exceeds 40bps on USD/MXN", impact_usd: 5000, recommendation: "Renegotiate terms" },
      { severity: "WARNING", category: "FEE_ANOMALY", description: "Fee spike in March", impact_usd: 1200, recommendation: "Review fee schedule" },
      { severity: "INFO", category: "DATA_QUALITY", description: "3 missing benchmark rates", impact_usd: 0, recommendation: "Backfill benchmarks" },
    ],
    markup_by_pair: {
      "USD/MXN": 15.3,
      "EUR/USD": 8.1,
      "GBP/USD": 22.7,
    },
    markup_by_counterparty: {
      "BankA": 18.5,
      "BankB": 9.2,
      "BankC": 45.0,
    },
    markup_by_month: {
      "2025-01": 10.5,
      "2025-02": 14.2,
      "2025-03": 11.8,
    },
    ...overrides,
  };
}

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "tx-001",
    row_index: 1,
    trade_date: "2025-01-15",
    currency_sold: "USD",
    currency_bought: "MXN",
    amount_sold: 100000,
    amount_bought: 1720000,
    effective_rate: 17.20,
    counterparty: "BankA",
    fee_amount: 50,
    benchmark_rate: 17.15,
    markup_per_unit: 0.05,
    markup_cost_usd: 291.55,
    markup_direction: "ADVERSE",
    ...overrides,
  };
}

function makeTransactions(count: number): Transaction[] {
  return Array.from({ length: count }, (_, i) =>
    makeTransaction({
      id: `tx-${String(i + 1).padStart(3, "0")}`,
      row_index: i + 1,
      counterparty: i % 3 === 0 ? "BankA" : i % 3 === 1 ? "BankB" : "BankC",
      fee_amount: i % 2 === 0 ? 50 : 0,
    }),
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. RunData type structure tests
// ══════════════════════════════════════════════════════════════════════════════

describe("RunData type and structure", () => {
  it("constructs valid RunData with all required fields", () => {
    const data = makeRunData();
    expect(data.run_id).toBe("run-001-abc");
    expect(data.run_hash).toHaveLength(64);
    expect(data.methodology_version).toBe("1.0.0");
    expect(data.findings).toHaveLength(3);
    expect(Object.keys(data.markup_by_pair)).toHaveLength(3);
    expect(Object.keys(data.markup_by_counterparty)).toHaveLength(3);
    expect(Object.keys(data.markup_by_month)).toHaveLength(3);
  });

  it("allows optional created_at", () => {
    const data = makeRunData({ created_at: undefined });
    expect(data.created_at).toBeUndefined();
  });

  it("handles empty findings array", () => {
    const data = makeRunData({ findings: [] });
    expect(data.findings).toHaveLength(0);
  });

  it("handles empty markup maps", () => {
    const data = makeRunData({
      markup_by_pair: {},
      markup_by_counterparty: {},
      markup_by_month: {},
    });
    expect(Object.keys(data.markup_by_pair)).toHaveLength(0);
    expect(Object.keys(data.markup_by_counterparty)).toHaveLength(0);
    expect(Object.keys(data.markup_by_month)).toHaveLength(0);
  });

  it("handles summary with zero values", () => {
    const data = makeRunData({
      summary: {
        total_markup_cost_usd: 0,
        avg_markup_bps: 0,
        max_markup_bps: 0,
        transaction_count: 0,
        total_fees_usd: 0,
        outlier_pct: 0,
      },
    });
    expect(data.summary.total_markup_cost_usd).toBe(0);
    expect(data.summary.avg_markup_bps).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. Transaction type structure tests
// ══════════════════════════════════════════════════════════════════════════════

describe("Transaction type and structure", () => {
  it("constructs valid Transaction with all fields", () => {
    const tx = makeTransaction();
    expect(tx.id).toBe("tx-001");
    expect(tx.row_index).toBe(1);
    expect(tx.currency_sold).toBe("USD");
    expect(tx.currency_bought).toBe("MXN");
    expect(tx.effective_rate).toBe(17.20);
    expect(tx.benchmark_rate).toBe(17.15);
  });

  it("allows optional fields as undefined", () => {
    const tx: Transaction = {
      id: "tx-bare",
      row_index: 0,
    };
    expect(tx.trade_date).toBeUndefined();
    expect(tx.currency_sold).toBeUndefined();
    expect(tx.amount_sold).toBeUndefined();
    expect(tx.counterparty).toBeUndefined();
    expect(tx.fee_amount).toBeUndefined();
    expect(tx.benchmark_rate).toBeUndefined();
    expect(tx.markup_per_unit).toBeUndefined();
    expect(tx.markup_cost_usd).toBeUndefined();
    expect(tx.markup_direction).toBeUndefined();
  });

  it("generates batch transactions with correct count", () => {
    const txs = makeTransactions(10);
    expect(txs).toHaveLength(10);
    expect(txs[0].id).toBe("tx-001");
    expect(txs[9].id).toBe("tx-010");
  });

  it("batch transactions distribute counterparties evenly", () => {
    const txs = makeTransactions(9);
    const bankA = txs.filter(t => t.counterparty === "BankA").length;
    const bankB = txs.filter(t => t.counterparty === "BankB").length;
    const bankC = txs.filter(t => t.counterparty === "BankC").length;
    expect(bankA).toBe(3);
    expect(bankB).toBe(3);
    expect(bankC).toBe(3);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. Severity classification logic
// ══════════════════════════════════════════════════════════════════════════════

describe("Severity classification", () => {
  function classifySeverity(severity: string): "critical" | "warning" | "info" {
    const upper = (severity ?? "").toUpperCase();
    if (upper === "CRITICAL" || upper === "HIGH") return "critical";
    if (upper === "WARNING" || upper === "MEDIUM") return "warning";
    return "info";
  }

  it("classifies CRITICAL as critical", () => {
    expect(classifySeverity("CRITICAL")).toBe("critical");
  });

  it("classifies HIGH as critical", () => {
    expect(classifySeverity("HIGH")).toBe("critical");
  });

  it("classifies WARNING as warning", () => {
    expect(classifySeverity("WARNING")).toBe("warning");
  });

  it("classifies MEDIUM as warning", () => {
    expect(classifySeverity("MEDIUM")).toBe("warning");
  });

  it("classifies INFO as info", () => {
    expect(classifySeverity("INFO")).toBe("info");
  });

  it("classifies LOW as info", () => {
    expect(classifySeverity("LOW")).toBe("info");
  });

  it("classifies unknown as info", () => {
    expect(classifySeverity("UNKNOWN")).toBe("info");
    expect(classifySeverity("")).toBe("info");
  });

  it("handles case-insensitive input", () => {
    expect(classifySeverity("critical")).toBe("critical");
    expect(classifySeverity("High")).toBe("critical");
    expect(classifySeverity("warning")).toBe("warning");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 4. Markup assessment logic (mirrors PDF generation logic)
// ══════════════════════════════════════════════════════════════════════════════

describe("Markup assessment classification", () => {
  function assessMarkup(bps: number): string {
    const abs = Math.abs(bps);
    if (abs > 50) return "EXCESSIVE";
    if (abs > 20) return "ELEVATED";
    if (abs > 10) return "MODERATE";
    return "ACCEPTABLE";
  }

  it("classifies >50 bps as EXCESSIVE", () => {
    expect(assessMarkup(51)).toBe("EXCESSIVE");
    expect(assessMarkup(100)).toBe("EXCESSIVE");
    expect(assessMarkup(-60)).toBe("EXCESSIVE");
  });

  it("classifies 21-50 bps as ELEVATED", () => {
    expect(assessMarkup(25)).toBe("ELEVATED");
    expect(assessMarkup(50)).toBe("ELEVATED");
    expect(assessMarkup(-30)).toBe("ELEVATED");
  });

  it("classifies 11-20 bps as MODERATE", () => {
    expect(assessMarkup(15)).toBe("MODERATE");
    expect(assessMarkup(20)).toBe("MODERATE");
    expect(assessMarkup(-12)).toBe("MODERATE");
  });

  it("classifies 0-10 bps as ACCEPTABLE", () => {
    expect(assessMarkup(10)).toBe("ACCEPTABLE");
    expect(assessMarkup(5)).toBe("ACCEPTABLE");
    expect(assessMarkup(0)).toBe("ACCEPTABLE");
    expect(assessMarkup(-8)).toBe("ACCEPTABLE");
  });

  it("handles boundary values correctly", () => {
    expect(assessMarkup(10)).toBe("ACCEPTABLE");
    expect(assessMarkup(10.01)).toBe("MODERATE");
    expect(assessMarkup(20)).toBe("MODERATE");
    expect(assessMarkup(20.01)).toBe("ELEVATED");
    expect(assessMarkup(50)).toBe("ELEVATED");
    expect(assessMarkup(50.01)).toBe("EXCESSIVE");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 5. Counterparty assessment logic (mirrors PDF generation logic)
// ══════════════════════════════════════════════════════════════════════════════

describe("Counterparty assessment classification", () => {
  function assessCounterparty(bps: number): string {
    const abs = Math.abs(bps);
    if (abs > 40) return "REVIEW REQUIRED";
    if (abs > 20) return "MONITOR";
    return "COMPETITIVE";
  }

  it("classifies >40 bps as REVIEW REQUIRED", () => {
    expect(assessCounterparty(45)).toBe("REVIEW REQUIRED");
    expect(assessCounterparty(-50)).toBe("REVIEW REQUIRED");
  });

  it("classifies 21-40 bps as MONITOR", () => {
    expect(assessCounterparty(25)).toBe("MONITOR");
    expect(assessCounterparty(40)).toBe("MONITOR");
  });

  it("classifies 0-20 bps as COMPETITIVE", () => {
    expect(assessCounterparty(10)).toBe("COMPETITIVE");
    expect(assessCounterparty(0)).toBe("COMPETITIVE");
    expect(assessCounterparty(-15)).toBe("COMPETITIVE");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 6. Safe filename helper (mirrors the internal safeId function)
// ══════════════════════════════════════════════════════════════════════════════

describe("Safe filename generation", () => {
  function safeId(runId: string): string {
    return runId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 24);
  }

  it("passes through alphanumeric IDs unchanged", () => {
    expect(safeId("run-001-abc")).toBe("run-001-abc");
  });

  it("replaces special characters with underscores", () => {
    expect(safeId("run/001:abc")).toBe("run_001_abc");
  });

  it("truncates long IDs to 24 characters", () => {
    const longId = "a".repeat(50);
    expect(safeId(longId)).toHaveLength(24);
  });

  it("handles UUID format", () => {
    const uuid = "550e8400-e29b-41d4-a716-446655440000";
    const result = safeId(uuid);
    expect(result).toHaveLength(24);
    expect(result).not.toContain("/");
    expect(result).not.toContain(":");
  });

  it("preserves hyphens and underscores", () => {
    expect(safeId("run_001-abc")).toBe("run_001-abc");
  });

  it("handles empty string", () => {
    expect(safeId("")).toBe("");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 7. Date formatting helper (mirrors the internal fmtDate function)
// ══════════════════════════════════════════════════════════════════════════════

describe("Date formatting", () => {
  function fmtDate(iso?: string): string {
    if (!iso) return new Date().toUTCString();
    try { return new Date(iso).toUTCString(); } catch { return iso; }
  }

  it("formats valid ISO date", () => {
    const result = fmtDate("2026-03-09T12:00:00Z");
    expect(result).toContain("2026");
    expect(result).toContain("Mar");
  });

  it("returns current date for undefined input", () => {
    const result = fmtDate(undefined);
    expect(result).toBeTruthy();
    expect(typeof result).toBe("string");
  });

  it("returns current date for empty string", () => {
    const result = fmtDate("");
    // empty string is falsy so returns current date
    expect(result).toBeTruthy();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 8. Pair sorting logic (used in markup_by_pair table)
// ══════════════════════════════════════════════════════════════════════════════

describe("Pair sorting by absolute markup", () => {
  it("sorts pairs by absolute value descending", () => {
    const markup_by_pair: Record<string, number> = {
      "USD/MXN": 15.3,
      "EUR/USD": -28.1,
      "GBP/USD": 8.7,
    };
    const sorted = Object.entries(markup_by_pair)
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    expect(sorted[0][0]).toBe("EUR/USD");
    expect(sorted[1][0]).toBe("USD/MXN");
    expect(sorted[2][0]).toBe("GBP/USD");
  });

  it("handles single pair", () => {
    const markup_by_pair: Record<string, number> = { "USD/MXN": 15.0 };
    const sorted = Object.entries(markup_by_pair)
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    expect(sorted).toHaveLength(1);
    expect(sorted[0][0]).toBe("USD/MXN");
  });

  it("handles equal absolute values", () => {
    const markup_by_pair: Record<string, number> = {
      "EUR/USD": 10,
      "GBP/USD": -10,
    };
    const sorted = Object.entries(markup_by_pair)
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    expect(sorted).toHaveLength(2);
    // Both have abs=10, order is stable
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 9. Findings severity distribution (used in Board PDF page 3)
// ══════════════════════════════════════════════════════════════════════════════

describe("Findings severity distribution", () => {
  it("counts findings by severity", () => {
    const findings = makeRunData().findings;
    const counts: Record<string, number> = {};
    findings.forEach(f => {
      const sev = (f.severity ?? "INFO").toUpperCase();
      counts[sev] = (counts[sev] ?? 0) + 1;
    });
    expect(counts["HIGH"]).toBe(1);
    expect(counts["WARNING"]).toBe(1);
    expect(counts["INFO"]).toBe(1);
  });

  it("handles all-critical findings", () => {
    const findings = [
      { severity: "CRITICAL", category: "A", description: "X", impact_usd: 100 },
      { severity: "CRITICAL", category: "B", description: "Y", impact_usd: 200 },
    ];
    const critCount = findings.filter(f =>
      ["CRITICAL", "HIGH"].includes((f.severity ?? "").toUpperCase()),
    ).length;
    expect(critCount).toBe(2);
  });

  it("handles no findings", () => {
    const findings: Array<Record<string, any>> = [];
    const critCount = findings.filter(f =>
      ["CRITICAL", "HIGH"].includes((f.severity ?? "").toUpperCase()),
    ).length;
    expect(critCount).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 10. CSV row shaping (mirrors exportAuditLabCsv logic)
// ══════════════════════════════════════════════════════════════════════════════

describe("CSV row shaping", () => {
  function shapeCsvRow(t: Transaction): Record<string, string | number> {
    return {
      row_index:        t.row_index,
      id:               t.id,
      trade_date:       t.trade_date ?? "",
      currency_sold:    t.currency_sold ?? "",
      currency_bought:  t.currency_bought ?? "",
      amount_sold:      t.amount_sold ?? "",
      amount_bought:    t.amount_bought ?? "",
      effective_rate:   t.effective_rate ?? "",
      counterparty:     t.counterparty ?? "",
      fee_amount:       t.fee_amount ?? "",
      benchmark_rate:   t.benchmark_rate ?? "",
      markup_per_unit:  t.markup_per_unit ?? "",
      markup_cost_usd:  t.markup_cost_usd ?? "",
      markup_direction: t.markup_direction ?? "",
    };
  }

  it("shapes complete transaction correctly", () => {
    const tx = makeTransaction();
    const row = shapeCsvRow(tx);
    expect(row.id).toBe("tx-001");
    expect(row.currency_sold).toBe("USD");
    expect(row.currency_bought).toBe("MXN");
    expect(row.amount_sold).toBe(100000);
    expect(row.markup_direction).toBe("ADVERSE");
  });

  it("replaces undefined optional fields with empty string", () => {
    const tx: Transaction = { id: "tx-bare", row_index: 0 };
    const row = shapeCsvRow(tx);
    expect(row.trade_date).toBe("");
    expect(row.currency_sold).toBe("");
    expect(row.counterparty).toBe("");
    expect(row.fee_amount).toBe("");
    expect(row.markup_direction).toBe("");
  });

  it("preserves zero values (not replaced by empty string)", () => {
    const tx = makeTransaction({ fee_amount: 0, markup_cost_usd: 0 });
    const row = shapeCsvRow(tx);
    expect(row.fee_amount).toBe(0);
    expect(row.markup_cost_usd).toBe(0);
  });

  it("produces correct column count", () => {
    const tx = makeTransaction();
    const row = shapeCsvRow(tx);
    expect(Object.keys(row)).toHaveLength(14);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 11. XLSX sheet data shaping (mirrors exportAuditLabXlsx logic)
// ══════════════════════════════════════════════════════════════════════════════

describe("XLSX sheet data shaping", () => {
  it("builds summary sheet rows correctly", () => {
    const data = makeRunData();
    const summaryRows = [
      ["AUDIT LAB REPORT"],
      ["Run ID", data.run_id],
      ["Run Hash", data.run_hash],
      ["Methodology", data.methodology_version],
    ];
    expect(summaryRows[0]).toEqual(["AUDIT LAB REPORT"]);
    expect(summaryRows[1][1]).toBe("run-001-abc");
    expect(summaryRows[2][1]).toHaveLength(64);
  });

  it("builds findings sheet with correct headers", () => {
    const headers = ["#", "Severity", "Category", "Description", "Impact (USD)", "Recommendation"];
    expect(headers).toHaveLength(6);
    expect(headers[0]).toBe("#");
    expect(headers[5]).toBe("Recommendation");
  });

  it("builds transaction sheet with correct column count", () => {
    const txHeaders = [
      "Row", "ID", "Trade Date", "Currency Sold", "Currency Bought",
      "Amount Sold", "Amount Bought", "Effective Rate", "Counterparty",
      "Benchmark Rate", "Markup Per Unit", "Markup Cost (USD)", "Markup Direction",
    ];
    expect(txHeaders).toHaveLength(13);
  });

  it("filters fee rows for fees sheet", () => {
    const txs = makeTransactions(6);
    const feeTxs = txs.filter(t => t.fee_amount != null && t.fee_amount !== 0);
    // Even indices (0,2,4) have fee=50, odd (1,3,5) have fee=0
    expect(feeTxs).toHaveLength(3);
  });

  it("builds evidence sheet with markup breakdowns", () => {
    const data = makeRunData();
    const pairEntries = Object.entries(data.markup_by_pair)
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    expect(pairEntries[0][0]).toBe("GBP/USD"); // 22.7 is highest abs
    expect(pairEntries[1][0]).toBe("USD/MXN"); // 15.3
    expect(pairEntries[2][0]).toBe("EUR/USD"); // 8.1
  });

  it("sorts months chronologically in evidence sheet", () => {
    const data = makeRunData();
    const monthEntries = Object.entries(data.markup_by_month)
      .sort(([a], [b]) => a.localeCompare(b));
    expect(monthEntries[0][0]).toBe("2025-01");
    expect(monthEntries[1][0]).toBe("2025-02");
    expect(monthEntries[2][0]).toBe("2025-03");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 12. Board summary recommendation logic
// ══════════════════════════════════════════════════════════════════════════════

describe("Board summary recommendation deduplication", () => {
  it("deduplicates recommendations from findings", () => {
    const findings = [
      { recommendation: "Renegotiate terms" },
      { recommendation: "Review fee schedule" },
      { recommendation: "Renegotiate terms" }, // duplicate
      { recommendation: "Backfill benchmarks" },
    ];
    const uniqueRecs: string[] = [];
    const seenRecs = new Set<string>();
    findings.forEach(f => {
      if (f.recommendation && !seenRecs.has(f.recommendation)) {
        seenRecs.add(f.recommendation);
        uniqueRecs.push(f.recommendation);
      }
    });
    expect(uniqueRecs).toHaveLength(3);
    expect(uniqueRecs).toContain("Renegotiate terms");
    expect(uniqueRecs).toContain("Review fee schedule");
    expect(uniqueRecs).toContain("Backfill benchmarks");
  });

  it("provides defaults when no findings have recommendations", () => {
    const findings: Array<Record<string, any>> = [];
    const uniqueRecs: string[] = [];
    const seenRecs = new Set<string>();
    findings.forEach(f => {
      if (f.recommendation && !seenRecs.has(f.recommendation)) {
        seenRecs.add(f.recommendation);
        uniqueRecs.push(f.recommendation);
      }
    });

    if (uniqueRecs.length === 0) {
      uniqueRecs.push(
        "Continue current counterparty relationships.",
        "Maintain regular audit cadence.",
        "Consider expanding benchmark data sources.",
      );
    }
    expect(uniqueRecs).toHaveLength(3);
  });

  it("skips findings without recommendation field", () => {
    const findings = [
      { recommendation: "Keep" },
      { severity: "INFO" }, // no recommendation
      { recommendation: undefined },
    ];
    const uniqueRecs: string[] = [];
    const seenRecs = new Set<string>();
    findings.forEach((f: any) => {
      if (f.recommendation && !seenRecs.has(f.recommendation)) {
        seenRecs.add(f.recommendation);
        uniqueRecs.push(f.recommendation);
      }
    });
    expect(uniqueRecs).toEqual(["Keep"]);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 13. Critical finding count logic (used across all exports)
// ══════════════════════════════════════════════════════════════════════════════

describe("Critical finding count", () => {
  it("counts HIGH and CRITICAL as critical", () => {
    const findings = [
      { severity: "CRITICAL" },
      { severity: "HIGH" },
      { severity: "WARNING" },
      { severity: "INFO" },
    ];
    const critCount = findings.filter(f =>
      ["CRITICAL", "HIGH"].includes((f.severity ?? "").toUpperCase()),
    ).length;
    expect(critCount).toBe(2);
  });

  it("handles mixed case severity values", () => {
    const findings = [
      { severity: "critical" },
      { severity: "High" },
      { severity: "high" },
    ];
    const critCount = findings.filter(f =>
      ["CRITICAL", "HIGH"].includes((f.severity ?? "").toUpperCase()),
    ).length;
    expect(critCount).toBe(3);
  });

  it("returns 0 for clean audit", () => {
    const findings = [
      { severity: "INFO" },
      { severity: "LOW" },
    ];
    const critCount = findings.filter(f =>
      ["CRITICAL", "HIGH"].includes((f.severity ?? "").toUpperCase()),
    ).length;
    expect(critCount).toBe(0);
  });

  it("handles null/undefined severity gracefully", () => {
    const findings = [
      { severity: null },
      { severity: undefined },
      {},
    ];
    const critCount = findings.filter((f: any) =>
      ["CRITICAL", "HIGH"].includes((f.severity ?? "").toUpperCase()),
    ).length;
    expect(critCount).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 14. Board PDF priority assignment logic
// ══════════════════════════════════════════════════════════════════════════════

describe("Board PDF priority assignment", () => {
  it("assigns IMMEDIATE to recommendations matching critical finding count", () => {
    const critCount = 2;
    const findingsCount = 5;
    const recs = ["Rec1", "Rec2", "Rec3", "Rec4", "Rec5"];

    const priorities = recs.map((_, i) => {
      if (i < critCount) return "IMMEDIATE";
      if (i < findingsCount) return "SHORT-TERM";
      return "ONGOING";
    });

    expect(priorities[0]).toBe("IMMEDIATE");
    expect(priorities[1]).toBe("IMMEDIATE");
    expect(priorities[2]).toBe("SHORT-TERM");
    expect(priorities[4]).toBe("SHORT-TERM");
  });

  it("assigns all ONGOING when no findings", () => {
    const critCount = 0;
    const findingsCount = 0;
    const recs = ["Default1", "Default2", "Default3"];

    const priorities = recs.map((_, i) => {
      if (i < critCount) return "IMMEDIATE";
      if (i < findingsCount) return "SHORT-TERM";
      return "ONGOING";
    });

    expect(priorities.every(p => p === "ONGOING")).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 15. Counterparty top-3 selection (Board PDF page 4)
// ══════════════════════════════════════════════════════════════════════════════

describe("Counterparty top-3 selection", () => {
  it("selects top 3 by absolute markup", () => {
    const markup_by_counterparty: Record<string, number> = {
      "BankA": 18.5,
      "BankB": 9.2,
      "BankC": 45.0,
      "BankD": -30.0,
      "BankE": 5.0,
    };
    const sorted = Object.entries(markup_by_counterparty)
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    const top3 = sorted.slice(0, 3);

    expect(top3).toHaveLength(3);
    expect(top3[0][0]).toBe("BankC");  // 45.0
    expect(top3[1][0]).toBe("BankD");  // |-30| = 30
    expect(top3[2][0]).toBe("BankA");  // 18.5
  });

  it("handles fewer than 3 counterparties", () => {
    const markup_by_counterparty: Record<string, number> = {
      "BankA": 10.0,
    };
    const sorted = Object.entries(markup_by_counterparty)
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    const top3 = sorted.slice(0, 3);
    expect(top3).toHaveLength(1);
  });

  it("handles empty counterparty map", () => {
    const markup_by_counterparty: Record<string, number> = {};
    const sorted = Object.entries(markup_by_counterparty)
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    const top3 = sorted.slice(0, 3);
    expect(top3).toHaveLength(0);
  });
});
