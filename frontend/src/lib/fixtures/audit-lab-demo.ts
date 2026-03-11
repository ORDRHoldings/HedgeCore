/**
 * Static sample dataset for the public Audit Lab demo.
 * No API calls — all data is hardcoded.
 */
export const DEMO_DATASET = {
  name: "Sample Corporation \u2014 Q4 2025 FX Audit",
  periods: [
    { label: "Q3 2025", start: "2025-07-01", end: "2025-09-30" },
    { label: "Q4 2025", start: "2025-10-01", end: "2025-12-31" },
  ],
  positions: [
    { currency: "EUR", amount: 5_000_000, hedgedAmount: 3_500_000, rate: 1.0847, hedgeRate: 1.0920, maturity: "2026-03-15" },
    { currency: "GBP", amount: 2_000_000, hedgedAmount: 1_400_000, rate: 1.2710, hedgeRate: 1.2680, maturity: "2026-06-30" },
    { currency: "JPY", amount: 500_000_000, hedgedAmount: 350_000_000, rate: 149.50, hedgeRate: 148.80, maturity: "2026-01-31" },
  ],
  auditResults: {
    totalExposureUsd: 11_200_000,
    hedgedExposureUsd: 7_840_000,
    coverageRatio: 0.70,
    markupBps: 12,
    unhedgedVarianceUsd: 168_000,
    totalCostBps: 28,
  },
};
