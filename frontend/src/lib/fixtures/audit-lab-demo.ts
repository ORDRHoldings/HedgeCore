/**
 * Static sample dataset for the public Audit Lab demo.
 * No API calls — all data is hardcoded here.
 * Keep in sync with the demo page narrative callouts.
 */

export const DEMO_DATASET = {
  name: "Sample Corporation — Q4 2025 FX Audit",
  period: "Q4 2025 (Oct – Dec)",
  tradeCount: 94,

  // KPI summary
  auditResults: {
    totalExposureUsd: 11_200_000,
    hedgedExposureUsd: 7_840_000,
    coverageRatio: 0.70,
    markupBps: 23,
    totalMarkupUsd: 186_400,
    totalFeesUsd: 22_100,
    totalCostUsd: 208_500,
    dataQualityScore: 91,
  },

  // Used by MarkupByMonthChart — positive = adverse (red), negative = favorable (green)
  markupByMonth: {
    "2025-10": 68_200,
    "2025-11": 71_400,
    "2025-12": 46_800,
  } as Record<string, number>,

  // Used by CounterpartyMatrix — spread_classification is required by that component
  transactions: [
    // HSBC — worst performer
    { id: "t1",  row_index: 1,  trade_date: "2025-10-03", currency_sold: "EUR", currency_bought: "USD", amount_sold: 800_000,   amount_bought: 872_400,   effective_rate: 1.0905, benchmark_rate: 1.0870, markup_cost_usd: 2_800, markup_direction: "ADVERSE", markup_bps: 32, counterparty: "HSBC",         spread_classification: "ADVERSE"   },
    { id: "t2",  row_index: 2,  trade_date: "2025-10-08", currency_sold: "GBP", currency_bought: "USD", amount_sold: 500_000,   amount_bought: 631_500,   effective_rate: 1.2630, benchmark_rate: 1.2710, markup_cost_usd: 4_000, markup_direction: "ADVERSE", markup_bps: 63, counterparty: "HSBC",         spread_classification: "ADVERSE"   },
    { id: "t3",  row_index: 3,  trade_date: "2025-10-14", currency_sold: "EUR", currency_bought: "USD", amount_sold: 1_200_000, amount_bought: 1_308_000, effective_rate: 1.0900, benchmark_rate: 1.0847, markup_cost_usd: 6_360, markup_direction: "ADVERSE", markup_bps: 49, counterparty: "HSBC",         spread_classification: "ADVERSE"   },
    { id: "t4",  row_index: 4,  trade_date: "2025-11-02", currency_sold: "EUR", currency_bought: "USD", amount_sold: 600_000,   amount_bought: 653_820,   effective_rate: 1.0897, benchmark_rate: 1.0847, markup_cost_usd: 3_000, markup_direction: "ADVERSE", markup_bps: 50, counterparty: "HSBC",         spread_classification: "ADVERSE"   },
    // Deutsche Bank — best performer
    { id: "t5",  row_index: 5,  trade_date: "2025-10-05", currency_sold: "EUR", currency_bought: "USD", amount_sold: 2_000_000, amount_bought: 2_172_000, effective_rate: 1.0860, benchmark_rate: 1.0847, markup_cost_usd: 2_600, markup_direction: "ADVERSE", markup_bps: 13, counterparty: "Deutsche Bank", spread_classification: "FAVORABLE" },
    { id: "t6",  row_index: 6,  trade_date: "2025-11-10", currency_sold: "GBP", currency_bought: "USD", amount_sold: 800_000,   amount_bought: 1_017_600, effective_rate: 1.2720, benchmark_rate: 1.2710, markup_cost_usd: 800,   markup_direction: "ADVERSE", markup_bps: 10, counterparty: "Deutsche Bank", spread_classification: "FAVORABLE" },
    { id: "t7",  row_index: 7,  trade_date: "2025-12-04", currency_sold: "EUR", currency_bought: "USD", amount_sold: 1_500_000, amount_bought: 1_629_750, effective_rate: 1.0865, benchmark_rate: 1.0847, markup_cost_usd: 2_700, markup_direction: "ADVERSE", markup_bps: 12, counterparty: "Deutsche Bank", spread_classification: "FAVORABLE" },
    { id: "t8",  row_index: 8,  trade_date: "2025-12-15", currency_sold: "EUR", currency_bought: "USD", amount_sold: 900_000,   amount_bought: 978_300,   effective_rate: 1.0870, benchmark_rate: 1.0847, markup_cost_usd: 2_070, markup_direction: "ADVERSE", markup_bps: 23, counterparty: "Deutsche Bank", spread_classification: "FAVORABLE" },
    // Barclays — mid performer
    { id: "t9",  row_index: 9,  trade_date: "2025-10-20", currency_sold: "EUR", currency_bought: "USD", amount_sold: 700_000,   amount_bought: 762_300,   effective_rate: 1.0890, benchmark_rate: 1.0847, markup_cost_usd: 3_010, markup_direction: "ADVERSE", markup_bps: 43, counterparty: "Barclays",      spread_classification: "ADVERSE"   },
    { id: "t10", row_index: 10, trade_date: "2025-11-18", currency_sold: "GBP", currency_bought: "USD", amount_sold: 400_000,   amount_bought: 507_360,   effective_rate: 1.2684, benchmark_rate: 1.2710, markup_cost_usd: 1_040, markup_direction: "ADVERSE", markup_bps: 26, counterparty: "Barclays",      spread_classification: "ADVERSE"   },
    { id: "t11", row_index: 11, trade_date: "2025-12-02", currency_sold: "EUR", currency_bought: "USD", amount_sold: 550_000,   amount_bought: 598_806,   effective_rate: 1.0887, benchmark_rate: 1.0847, markup_cost_usd: 2_200, markup_direction: "ADVERSE", markup_bps: 40, counterparty: "Barclays",      spread_classification: "ADVERSE"   },
  ],

  // Pre-written audit findings
  findings: [
    {
      id: "f1",
      finding_type: "MARKUP_EXCESS",
      severity: "HIGH",
      currency_pair: "EUR/USD",
      counterparty: "HSBC",
      amount_usd: 89_600,
      narrative: "HSBC charged an average of 49 bps above the mid-market rate on EUR/USD trades — 3.8x the rate observed from Deutsche Bank on identical settlement conditions.",
    },
    {
      id: "f2",
      finding_type: "FEE_OPACITY",
      severity: "MEDIUM",
      currency_pair: "GBP/USD",
      counterparty: "HSBC",
      amount_usd: 22_100,
      narrative: "Explicit settlement fees were not itemised separately in 6 of 14 GBP/USD trade confirmations. Estimated fee embedded in rate: $22,100. Confidence: MEDIUM — request itemised fee schedules from counterparty.",
    },
    {
      id: "f3",
      finding_type: "COUNTERPARTY_DIVERGENCE",
      severity: "LOW",
      currency_pair: null,
      counterparty: null,
      amount_usd: 74_800,
      narrative: "Switching the 8 HSBC EUR/USD trades to Deutsche Bank's observed rate for the same period would have saved an estimated $74,800 — with no change to settlement timeline or credit terms.",
    },
  ],

  // Static trust signals shown in the demo footer
  trustSignals: [
    { label: "Deterministic methodology", detail: "Same inputs always produce same outputs. No model drift." },
    { label: "SHA-256 audit chain", detail: "Every result is cryptographically fingerprinted. Tamper-evident by design." },
    { label: "Evidence binder export", detail: "Download a court-ready JSON package with all hashes and source data." },
  ],
};

/** Counterparty-level aggregates derived from transactions — used for narrative callouts */
export function getDemoCounterpartyStats() {
  const byCounterparty: Record<string, { totalCost: number; tradeCount: number; bpsSum: number }> = {};
  for (const t of DEMO_DATASET.transactions) {
    const cp = t.counterparty;
    if (!byCounterparty[cp]) byCounterparty[cp] = { totalCost: 0, tradeCount: 0, bpsSum: 0 };
    byCounterparty[cp].totalCost  += t.markup_cost_usd;
    byCounterparty[cp].tradeCount += 1;
    byCounterparty[cp].bpsSum     += t.markup_bps;
  }
  return Object.entries(byCounterparty).map(([name, d]) => ({
    name,
    totalCostUsd: d.totalCost,
    tradeCount:   d.tradeCount,
    avgBps:       Math.round(d.bpsSum / d.tradeCount),
  })).sort((a, b) => b.avgBps - a.avgBps);
}
