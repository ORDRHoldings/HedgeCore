/**
 * fx-rates.test.ts
 *
 * Unit tests for the buildFxRates transform function.
 * Hardcoded fallback rates removed — live data only.
 */

import { buildFxRates } from "../../lib/market/transforms";

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

describe("buildFxRates", () => {
  it("returns 8 rate entries for a full quote", () => {
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
    expect(eurusd.mid).toBeCloseTo(1 / 0.9263, 3);
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

  it("all numeric fields are valid finite numbers", () => {
    const rates = buildFxRates(SAMPLE_QUOTE);
    for (const r of rates) {
      expect(typeof r.bid).toBe("number");
      expect(typeof r.ask).toBe("number");
      expect(typeof r.mid).toBe("number");
      expect(isFinite(r.mid)).toBe(true);
    }
  });

  it("missing CNH key omits USDCNH from results", () => {
    const quoteNoCNH = { ...SAMPLE_QUOTE };
    delete (quoteNoCNH as Record<string, number>)["CNH"];
    const rates = buildFxRates(quoteNoCNH);
    expect(rates).toHaveLength(7);
    expect(rates.find((r) => r.symbol === "USDCNH")).toBeUndefined();
  });

  it("empty quote returns empty array (no live data = no rates)", () => {
    const rates = buildFxRates({});
    expect(rates).toHaveLength(0);
  });
});
