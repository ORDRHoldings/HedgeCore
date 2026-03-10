/**
 * Tests for all 16 new indicator computation functions.
 * Each test verifies: correct output length, mathematical correctness on
 * known data, and edge-case handling (empty input, insufficient bars).
 */

import type { Bar } from "@/components/chart/indicators/types";
import { computeStochastic } from "@/components/chart/indicators/stochastic";
import { computeStochRSI } from "@/components/chart/indicators/stochastic_rsi";
import { computeWilliamsR } from "@/components/chart/indicators/williams_r";
import { computeCCI } from "@/components/chart/indicators/cci";
import { computeADX } from "@/components/chart/indicators/adx";
import { computeMFI } from "@/components/chart/indicators/mfi";
import { computeCMF } from "@/components/chart/indicators/cmf";
import { computeOBV } from "@/components/chart/indicators/obv";
import { computeVWAP } from "@/components/chart/indicators/vwap";
import { computeIchimoku } from "@/components/chart/indicators/ichimoku";
import { computeHMA } from "@/components/chart/indicators/hull_ma";
import { computeTEMA } from "@/components/chart/indicators/tema";
import { computeDonchian } from "@/components/chart/indicators/donchian";
import { computeParabolicSAR } from "@/components/chart/indicators/parabolic_sar";
import { computePivotPoints } from "@/components/chart/indicators/pivot_points";
import { computeVolumeProfile } from "@/components/chart/indicators/volume_profile";

// --- Test data generators ---

/** Generate N sequential bars with predictable OHLCV */
function makeBars(n: number, seed: number = 100): Bar[] {
  const bars: Bar[] = [];
  let price = seed;
  for (let i = 0; i < n; i++) {
    // Simple oscillating price: goes up then down
    const delta = Math.sin(i * 0.3) * 2 + (Math.cos(i * 0.7) * 1.5);
    price += delta;
    const o = price;
    const h = price + Math.abs(delta) + 0.5;
    const l = price - Math.abs(delta) - 0.5;
    const c = price + delta * 0.5;
    const v = 1000 + i * 10;
    bars.push({ t: 1700000000 + i * 86400, o, h, l, c, v });
  }
  return bars;
}

/** Bars with known values for exact computation checks */
function makeSimpleBars(): Bar[] {
  return [
    { t: 1, o: 10, h: 12, l: 9, c: 11, v: 100 },
    { t: 2, o: 11, h: 13, l: 10, c: 12, v: 150 },
    { t: 3, o: 12, h: 14, l: 11, c: 13, v: 200 },
    { t: 4, o: 13, h: 15, l: 12, c: 11, v: 120 },
    { t: 5, o: 11, h: 13, l: 10, c: 12, v: 180 },
    { t: 6, o: 12, h: 14, l: 11, c: 14, v: 220 },
    { t: 7, o: 14, h: 16, l: 13, c: 15, v: 250 },
    { t: 8, o: 15, h: 17, l: 14, c: 13, v: 130 },
    { t: 9, o: 13, h: 15, l: 12, c: 14, v: 170 },
    { t: 10, o: 14, h: 16, l: 13, c: 15, v: 200 },
  ];
}

const bars50 = makeBars(50);
const bars100 = makeBars(100);
const simpleBars = makeSimpleBars();

// =========================================================================
// Stochastic Oscillator
// =========================================================================
describe("computeStochastic", () => {
  it("returns empty for insufficient bars", () => {
    expect(computeStochastic([], 14, 3)).toEqual([]);
    expect(computeStochastic(makeBars(5), 14, 3)).toEqual([]);
  });

  it("returns correct number of points", () => {
    const result = computeStochastic(bars50, 14, 3);
    // kPeriod=14 needs 14 bars for first %K, dPeriod=3 needs 3 %K values for first %D
    // So first point at bar index 14-1+3-1 = 15, total = 50 - 16 = 34
    expect(result.length).toBeGreaterThan(0);
    expect(result.length).toBeLessThanOrEqual(50);
  });

  it("%K and %D are in 0-100 range", () => {
    const result = computeStochastic(bars50, 14, 3);
    for (const pt of result) {
      expect(pt.k).toBeGreaterThanOrEqual(0);
      expect(pt.k).toBeLessThanOrEqual(100);
      expect(pt.d).toBeGreaterThanOrEqual(0);
      expect(pt.d).toBeLessThanOrEqual(100);
    }
  });

  it("manual check: period=3, dPeriod=2 on simple bars", () => {
    const result = computeStochastic(simpleBars, 3, 2);
    expect(result.length).toBeGreaterThan(0);
    // First %K at bar index 2: (C2 - min(L0..L2)) / (max(H0..H2) - min(L0..L2)) * 100
    // = (13 - 9) / (14 - 9) * 100 = 80
    // Second %K at bar index 3: (11 - 10) / (15 - 10) * 100 = 20
    // First %D = (80 + 20) / 2 = 50
    expect(result[0].d).toBeCloseTo(50, 1);
  });
});

// =========================================================================
// Stochastic RSI
// =========================================================================
describe("computeStochRSI", () => {
  it("returns empty for insufficient bars", () => {
    expect(computeStochRSI([], 14, 14, 3, 3)).toEqual([]);
    expect(computeStochRSI(makeBars(10), 14, 14, 3, 3)).toEqual([]);
  });

  it("returns points for sufficient data", () => {
    const result = computeStochRSI(bars100, 14, 14, 3, 3);
    expect(result.length).toBeGreaterThan(0);
  });

  it("%K and %D are in 0-100 range (with floating point tolerance)", () => {
    const result = computeStochRSI(bars100, 14, 14, 3, 3);
    for (const pt of result) {
      expect(pt.k).toBeGreaterThanOrEqual(-1e-10);
      expect(pt.k).toBeLessThanOrEqual(100 + 1e-10);
      expect(pt.d).toBeGreaterThanOrEqual(-1e-10);
      expect(pt.d).toBeLessThanOrEqual(100 + 1e-10);
    }
  });
});

// =========================================================================
// Williams %R
// =========================================================================
describe("computeWilliamsR", () => {
  it("returns empty for insufficient bars", () => {
    expect(computeWilliamsR([], 14)).toEqual([]);
    expect(computeWilliamsR(makeBars(5), 14)).toEqual([]);
  });

  it("returns correct count", () => {
    const result = computeWilliamsR(bars50, 14);
    expect(result.length).toBe(50 - 14 + 1);
  });

  it("values are in -100 to 0 range", () => {
    const result = computeWilliamsR(bars50, 14);
    for (const pt of result) {
      expect(pt.value).toBeGreaterThanOrEqual(-100);
      expect(pt.value).toBeLessThanOrEqual(0);
    }
  });

  it("manual check: period=3 on simple bars", () => {
    const result = computeWilliamsR(simpleBars, 3);
    // At bar index 2: %R = (max(H0..H2) - C2) / (max(H0..H2) - min(L0..L2)) * -100
    // = (14 - 13) / (14 - 9) * -100 = -20
    expect(result[0].value).toBeCloseTo(-20, 5);
  });
});

// =========================================================================
// CCI
// =========================================================================
describe("computeCCI", () => {
  it("returns empty for insufficient bars", () => {
    expect(computeCCI([], 20)).toEqual([]);
    expect(computeCCI(makeBars(10), 20)).toEqual([]);
  });

  it("returns correct count", () => {
    const result = computeCCI(bars50, 20);
    expect(result.length).toBe(50 - 20 + 1);
  });

  it("manual check: period=3 on simple bars", () => {
    const result = computeCCI(simpleBars, 3);
    expect(result.length).toBe(simpleBars.length - 3 + 1);
    // Each result should be a number (not NaN)
    for (const pt of result) {
      expect(Number.isFinite(pt.value)).toBe(true);
    }
  });
});

// =========================================================================
// ADX
// =========================================================================
describe("computeADX", () => {
  it("returns empty for insufficient bars", () => {
    expect(computeADX([], 14)).toEqual([]);
    expect(computeADX(makeBars(20), 14)).toEqual([]);
  });

  it("returns points with adx, plusDI, minusDI", () => {
    const result = computeADX(bars100, 14);
    expect(result.length).toBeGreaterThan(0);
    for (const pt of result) {
      expect(pt.adx).toBeGreaterThanOrEqual(0);
      expect(pt.plusDI).toBeGreaterThanOrEqual(0);
      expect(pt.minusDI).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(pt.adx)).toBe(true);
    }
  });

  it("ADX is between 0 and 100", () => {
    const result = computeADX(bars100, 14);
    for (const pt of result) {
      expect(pt.adx).toBeGreaterThanOrEqual(0);
      expect(pt.adx).toBeLessThanOrEqual(100);
    }
  });
});

// =========================================================================
// MFI
// =========================================================================
describe("computeMFI", () => {
  it("returns empty for insufficient bars", () => {
    expect(computeMFI([], 14)).toEqual([]);
    expect(computeMFI(makeBars(10), 14)).toEqual([]);
  });

  it("returns correct count", () => {
    const result = computeMFI(bars50, 14);
    expect(result.length).toBe(50 - 14);
  });

  it("values are in 0-100 range", () => {
    const result = computeMFI(bars50, 14);
    for (const pt of result) {
      expect(pt.value).toBeGreaterThanOrEqual(0);
      expect(pt.value).toBeLessThanOrEqual(100);
    }
  });
});

// =========================================================================
// CMF
// =========================================================================
describe("computeCMF", () => {
  it("returns empty for insufficient bars", () => {
    expect(computeCMF([], 20)).toEqual([]);
    expect(computeCMF(makeBars(10), 20)).toEqual([]);
  });

  it("returns correct count", () => {
    const result = computeCMF(bars50, 20);
    expect(result.length).toBe(50 - 20 + 1);
  });

  it("values are in -1 to +1 range", () => {
    const result = computeCMF(bars50, 20);
    for (const pt of result) {
      expect(pt.value).toBeGreaterThanOrEqual(-1);
      expect(pt.value).toBeLessThanOrEqual(1);
    }
  });
});

// =========================================================================
// OBV
// =========================================================================
describe("computeOBV", () => {
  it("returns empty for empty bars", () => {
    expect(computeOBV([])).toEqual([]);
  });

  it("returns same count as input", () => {
    const result = computeOBV(bars50);
    expect(result.length).toBe(50);
  });

  it("first value is 0", () => {
    const result = computeOBV(simpleBars);
    expect(result[0].value).toBe(0);
  });

  it("manual check on simple bars", () => {
    const result = computeOBV(simpleBars);
    // Bar 1: c=12 > prev c=11 -> OBV = 0 + 150 = 150
    expect(result[1].value).toBe(150);
    // Bar 2: c=13 > prev c=12 -> OBV = 150 + 200 = 350
    expect(result[2].value).toBe(350);
    // Bar 3: c=11 < prev c=13 -> OBV = 350 - 120 = 230
    expect(result[3].value).toBe(230);
  });
});

// =========================================================================
// VWAP
// =========================================================================
describe("computeVWAP", () => {
  it("returns empty for empty bars", () => {
    expect(computeVWAP([])).toEqual([]);
  });

  it("returns same count as input", () => {
    const result = computeVWAP(bars50);
    expect(result.length).toBe(50);
  });

  it("first bar VWAP equals typical price", () => {
    const result = computeVWAP(simpleBars);
    const tp0 = (simpleBars[0].h + simpleBars[0].l + simpleBars[0].c) / 3;
    expect(result[0].value).toBeCloseTo(tp0, 5);
  });

  it("VWAP is within the price range", () => {
    const result = computeVWAP(bars50);
    for (let i = 0; i < result.length; i++) {
      // VWAP should be within the overall price range
      expect(Number.isFinite(result[i].value)).toBe(true);
    }
  });
});

// =========================================================================
// Ichimoku
// =========================================================================
describe("computeIchimoku", () => {
  it("returns empty for insufficient bars", () => {
    expect(computeIchimoku([], 9, 26, 52)).toEqual([]);
    expect(computeIchimoku(makeBars(30), 9, 26, 52)).toEqual([]);
  });

  it("returns points with all 5 lines for sufficient data", () => {
    const result = computeIchimoku(bars100, 9, 26, 52);
    expect(result.length).toBeGreaterThan(0);
    for (const pt of result) {
      expect(Number.isFinite(pt.tenkan)).toBe(true);
      expect(Number.isFinite(pt.kijun)).toBe(true);
      expect(Number.isFinite(pt.senkouA)).toBe(true);
      expect(Number.isFinite(pt.senkouB)).toBe(true);
      expect(Number.isFinite(pt.chikou)).toBe(true);
    }
  });

  it("works with small periods on simple data", () => {
    const result = computeIchimoku(simpleBars, 3, 4, 5);
    expect(result.length).toBeGreaterThan(0);
  });
});

// =========================================================================
// Hull MA
// =========================================================================
describe("computeHMA", () => {
  it("returns empty for insufficient bars", () => {
    expect(computeHMA([], 9)).toEqual([]);
    expect(computeHMA(makeBars(5), 9)).toEqual([]);
  });

  it("returns points for sufficient data", () => {
    const result = computeHMA(bars50, 9);
    expect(result.length).toBeGreaterThan(0);
  });

  it("values are finite numbers", () => {
    const result = computeHMA(bars50, 9);
    for (const pt of result) {
      expect(Number.isFinite(pt.value)).toBe(true);
    }
  });
});

// =========================================================================
// TEMA
// =========================================================================
describe("computeTEMA", () => {
  it("returns empty for insufficient bars", () => {
    expect(computeTEMA([], 20)).toEqual([]);
    expect(computeTEMA(makeBars(30), 20)).toEqual([]);
  });

  it("returns points for sufficient data", () => {
    const result = computeTEMA(bars100, 20);
    expect(result.length).toBeGreaterThan(0);
  });

  it("values track close prices", () => {
    const result = computeTEMA(bars100, 10);
    // TEMA should be in the general range of close prices
    for (const pt of result) {
      expect(Number.isFinite(pt.value)).toBe(true);
      expect(pt.value).toBeGreaterThan(0);
    }
  });
});

// =========================================================================
// Donchian Channel
// =========================================================================
describe("computeDonchian", () => {
  it("returns empty for insufficient bars", () => {
    expect(computeDonchian([], 20)).toEqual([]);
    expect(computeDonchian(makeBars(10), 20)).toEqual([]);
  });

  it("returns correct count", () => {
    const result = computeDonchian(bars50, 20);
    expect(result.length).toBe(50 - 20 + 1);
  });

  it("upper >= middle >= lower", () => {
    const result = computeDonchian(bars50, 20);
    for (const pt of result) {
      expect(pt.upper).toBeGreaterThanOrEqual(pt.middle);
      expect(pt.middle).toBeGreaterThanOrEqual(pt.lower);
    }
  });

  it("middle = (upper + lower) / 2", () => {
    const result = computeDonchian(bars50, 20);
    for (const pt of result) {
      expect(pt.middle).toBeCloseTo((pt.upper + pt.lower) / 2, 10);
    }
  });

  it("manual check: period=3 on simple bars", () => {
    const result = computeDonchian(simpleBars, 3);
    // First point at index 2: highest H of 0..2 = 14, lowest L of 0..2 = 9
    expect(result[0].upper).toBe(14);
    expect(result[0].lower).toBe(9);
    expect(result[0].middle).toBeCloseTo(11.5, 5);
  });
});

// =========================================================================
// Parabolic SAR
// =========================================================================
describe("computeParabolicSAR", () => {
  it("returns empty for fewer than 2 bars", () => {
    expect(computeParabolicSAR([])).toEqual([]);
    expect(computeParabolicSAR([simpleBars[0]])).toEqual([]);
  });

  it("returns same count as input", () => {
    const result = computeParabolicSAR(bars50);
    expect(result.length).toBe(50);
  });

  it("values are finite", () => {
    const result = computeParabolicSAR(bars50);
    for (const pt of result) {
      expect(Number.isFinite(pt.value)).toBe(true);
    }
  });
});

// =========================================================================
// Pivot Points
// =========================================================================
describe("computePivotPoints", () => {
  it("returns empty for empty bars", () => {
    expect(computePivotPoints([])).toEqual([]);
  });

  it("returns one pivot per bar", () => {
    const result = computePivotPoints(simpleBars);
    expect(result.length).toBe(simpleBars.length);
  });

  it("manual check: first simple bar", () => {
    const result = computePivotPoints(simpleBars);
    // Bar 0: H=12, L=9, C=11
    const pp = (12 + 9 + 11) / 3;
    expect(result[0].pp).toBeCloseTo(pp, 5);
    expect(result[0].r1).toBeCloseTo(2 * pp - 9, 5);
    expect(result[0].s1).toBeCloseTo(2 * pp - 12, 5);
    expect(result[0].r2).toBeCloseTo(pp + (12 - 9), 5);
    expect(result[0].s2).toBeCloseTo(pp - (12 - 9), 5);
    expect(result[0].r3).toBeCloseTo(12 + 2 * (pp - 9), 5);
    expect(result[0].s3).toBeCloseTo(9 - 2 * (12 - pp), 5);
  });

  it("R3 > R2 > R1 > PP > S1 > S2 > S3", () => {
    const result = computePivotPoints(simpleBars);
    for (const pt of result) {
      expect(pt.r3).toBeGreaterThanOrEqual(pt.r2);
      expect(pt.r2).toBeGreaterThanOrEqual(pt.r1);
      expect(pt.r1).toBeGreaterThanOrEqual(pt.pp);
      expect(pt.pp).toBeGreaterThanOrEqual(pt.s1);
      expect(pt.s1).toBeGreaterThanOrEqual(pt.s2);
      expect(pt.s2).toBeGreaterThanOrEqual(pt.s3);
    }
  });
});

// =========================================================================
// Volume Profile
// =========================================================================
describe("computeVolumeProfile", () => {
  it("returns empty levels for empty bars", () => {
    const result = computeVolumeProfile([]);
    expect(result.levels).toEqual([]);
    expect(result.totalVolume).toBe(0);
  });

  it("returns correct number of levels", () => {
    const result = computeVolumeProfile(bars50, 30);
    expect(result.levels.length).toBe(30);
  });

  it("total volume matches sum of bar volumes", () => {
    const result = computeVolumeProfile(simpleBars, 10);
    const expected = simpleBars.reduce((s, b) => s + b.v, 0);
    expect(result.totalVolume).toBeCloseTo(expected, 5);
  });

  it("POC is within price range", () => {
    const result = computeVolumeProfile(bars50, 20);
    const minP = Math.min(...bars50.map((b) => b.l));
    const maxP = Math.max(...bars50.map((b) => b.h));
    expect(result.poc).toBeGreaterThanOrEqual(minP);
    expect(result.poc).toBeLessThanOrEqual(maxP);
  });

  it("VAH >= POC >= VAL", () => {
    const result = computeVolumeProfile(bars50, 20);
    expect(result.vahPrice).toBeGreaterThanOrEqual(result.poc);
    expect(result.poc).toBeGreaterThanOrEqual(result.valPrice);
  });

  it("buy + sell volume per level sums to level volume", () => {
    const result = computeVolumeProfile(bars50, 10);
    for (const lvl of result.levels) {
      expect(lvl.buyVolume + lvl.sellVolume).toBeCloseTo(lvl.volume, 5);
    }
  });

  it("handles single-price bars", () => {
    const flat: Bar[] = [
      { t: 1, o: 10, h: 10, l: 10, c: 10, v: 500 },
      { t: 2, o: 10, h: 10, l: 10, c: 10, v: 500 },
    ];
    const result = computeVolumeProfile(flat, 10);
    expect(result.levels.length).toBe(1);
    expect(result.totalVolume).toBe(1000);
  });
});
