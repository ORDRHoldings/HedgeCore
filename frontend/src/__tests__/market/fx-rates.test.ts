/**
 * fx-rates.test.ts
 *
 * Unit tests for the /api/market/fx/rates route logic.
 *
 * Tests the pure buildFxRates / buildFallbackRates functions in isolation,
 * matching the pattern used in reportAI.test.ts (test logic, not HTTP layer).
 */

import { buildFxRates, buildFallbackRates } from "../../lib/market/transforms";
import type { FxRateEntry } from "../../lib/market/types";

// ─── buildFxRates ─────────────────────────────────────────────────────────────

describe("buildFxRates", () => {
  const SAMPLE_QUOTE: Record<string, number> = {
    MXN: 20.35,
    EUR: 0.9263,
    GBP: 0.7921,
    JPY: 150.40,
    CAD: 1.437,
    CHF: 0.8981,
    AUD: 1.581,
    CNH: 7.265,
  };

  it("returns 8 rate entries for standard quote", () => {
    const rates = buildFxRates(SAMPLE_QUOTE);
    expect(rates).toHaveLength(8);
  });

  it("returns correct symbols", () => {
    const rates = buildFxRates(SAMPLE_QUOTE);
    const symbols = rates.map((r) => r.symbol);
    expect(symbols).toEqual(["USDMXN", "EURUSD", "GBPUSD", "USDJPY", "USDCAD", "USDCHF", "AUDUSD", "USDCNH"]);
  });

  it("USDMXN mid matches quote directly", () => {
    const rates = buildFxRates(SAMPLE_QUOTE);
    const usdmxn = rates.find((r) => r.symbol === "USDMXN")!;
    expect(usdmxn.mid).toBeCloseTo(20.35, 3);
  });

  it("EURUSD mid is inverted (1/EUR quote)", () => {
    const rates = buildFxRates(SAMPLE_QUOTE);
    const eurusd = rates.find((r) => r.symbol === "EURUSD")!;
    const expected = 1 / 0.9263;
    expect(eurusd.mid).toBeCloseTo(expected, 3);
  });

  it("GBPUSD mid is inverted (1/GBP quote)", () => {
    const rates = buildFxRates(SAMPLE_QUOTE);
    const gbpusd = rates.find((r) => r.symbol === "GBPUSD")!;
    expect(gbpusd.mid).toBeCloseTo(1 / 0.7921, 3);
  });

  it("AUDUSD mid is inverted (1/AUD quote)", () => {
    const rates = buildFxRates(SAMPLE_QUOTE);
    const audusd = rates.find((r) => r.symbol === "AUDUSD")!;
    expect(audusd.mid).toBeCloseTo(1 / 1.581, 3);
  });

  it("bid < mid < ask for every entry", () => {
    const rates = buildFxRates(SAMPLE_QUOTE);
    for (const r of rates) {
      expect(r.bid).toBeLessThan(r.mid);
      expect(r.ask).toBeGreaterThan(r.mid);
    }
  });

  it("spread is symmetric around mid", () => {
    const rates = buildFxRates(SAMPLE_QUOTE);
    for (const r of rates) {
      const halfSpread = (r.ask - r.bid) / 2;
      expect(Math.abs(r.mid - r.bid - halfSpread)).toBeLessThan(0.0001);
    }
  });

  it("all numeric fields are valid numbers", () => {
    const rates = buildFxRates(SAMPLE_QUOTE);
    for (const r of rates) {
      expect(typeof r.bid).toBe("number");
      expect(typeof r.ask).toBe("number");
      expect(typeof r.mid).toBe("number");
      expect(isFinite(r.mid)).toBe(true);
    }
  });

  it("missing CNH key falls back to BIS fallback rate", () => {
    const quoteNoCNH = { ...SAMPLE_QUOTE };
    delete (quoteNoCNH as Record<string, number>)["CNH"];
    const rates = buildFxRates(quoteNoCNH);
    const usdcnh = rates.find((r) => r.symbol === "USDCNH")!;
    expect(usdcnh.mid).toBeGreaterThan(0);
    expect(isFinite(usdcnh.mid)).toBe(true);
  });

  it("empty quote object returns fallback-rate-based entries (not NaN)", () => {
    const rates = buildFxRates({});
    expect(rates).toHaveLength(8);
    for (const r of rates) {
      expect(isFinite(r.mid)).toBe(true);
      expect(r.mid).toBeGreaterThan(0);
    }
  });
});

// ─── buildFallbackRates ───────────────────────────────────────────────────────

describe("buildFallbackRates", () => {
  let rates: FxRateEntry[];
  beforeEach(() => { rates = buildFallbackRates(); });

  it("returns 8 entries", () => {
    expect(rates).toHaveLength(8);
  });

  it("all mids are positive finite numbers", () => {
    for (const r of rates) {
      expect(r.mid).toBeGreaterThan(0);
      expect(isFinite(r.mid)).toBe(true);
    }
  });

  it("USDMXN is roughly 20.35 (BIS calibrated)", () => {
    const r = rates.find((r) => r.symbol === "USDMXN")!;
    expect(r.mid).toBeCloseTo(20.35, 1);
  });

  it("EURUSD is above 1.0 (EUR stronger than USD per BIS calibration)", () => {
    const r = rates.find((r) => r.symbol === "EURUSD")!;
    expect(r.mid).toBeGreaterThan(1.0);
  });

  it("is deterministic (same output on repeated calls)", () => {
    const r1 = buildFallbackRates();
    const r2 = buildFallbackRates();
    expect(r1).toEqual(r2);
  });
});
