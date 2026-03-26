/**
 * Indicator verification tests
 * Reference values hand-calculated or verified against standard formulas.
 */
import { describe, it, expect } from 'vitest';
import type { Bar } from './types';
import { computeSMA } from './sma';
import { computeEMA, emaFromValues } from './ema';
import { computeRSI } from './rsi';
import { computeMACD } from './macd';
import { computeBollinger } from './bollinger';
import { computeATR } from './atr';
import { computeStochastic } from './stochastic';
import { computeWMA } from './wma';

// ── Test fixture: 20 bars of synthetic OHLCV data ──────────────────────────
function makeBars(closes: number[], baseTime = 1_000_000): Bar[] {
  return closes.map((c, i) => ({
    t: baseTime + i * 60_000,
    o: c - 0.5,
    h: c + 1,
    l: c - 1,
    c,
    v: 1000 + i * 10,
  }));
}

// Simple ascending closes: 10, 11, 12, ..., 29
const ASC_CLOSES = Array.from({ length: 20 }, (_, i) => 10 + i);
const ASC_BARS = makeBars(ASC_CLOSES);

// Flat closes: all 100
const FLAT_BARS = makeBars(Array.from({ length: 20 }, () => 100));

// Zigzag: 10, 20, 10, 20, ...
const ZIG_CLOSES = Array.from({ length: 20 }, (_, i) => (i % 2 === 0 ? 10 : 20));
const ZIG_BARS = makeBars(ZIG_CLOSES);

// ── SMA ─────────────────────────────────────────────────────────────────────
describe('computeSMA', () => {
  it('returns empty for insufficient bars', () => {
    expect(computeSMA(ASC_BARS.slice(0, 2), 5)).toEqual([]);
  });

  it('computes correct SMA-5 on ascending data', () => {
    const result = computeSMA(ASC_BARS, 5);
    // First SMA-5: avg(10,11,12,13,14) = 12
    expect(result[0].value).toBeCloseTo(12, 10);
    // Second: avg(11,12,13,14,15) = 13
    expect(result[1].value).toBeCloseTo(13, 10);
    // Last: avg(25,26,27,28,29) = 27
    expect(result[result.length - 1].value).toBeCloseTo(27, 10);
    expect(result.length).toBe(16); // 20 - 5 + 1
  });

  it('SMA-1 equals close prices', () => {
    const result = computeSMA(ASC_BARS, 1);
    expect(result.length).toBe(20);
    result.forEach((pt, i) => expect(pt.value).toBeCloseTo(ASC_CLOSES[i], 10));
  });

  it('flat data SMA equals the constant', () => {
    const result = computeSMA(FLAT_BARS, 10);
    result.forEach(pt => expect(pt.value).toBeCloseTo(100, 10));
  });

  it('timestamps align with last bar in window', () => {
    const result = computeSMA(ASC_BARS, 5);
    expect(result[0].t).toBe(ASC_BARS[4].t);
  });
});

// ── EMA ─────────────────────────────────────────────────────────────────────
describe('computeEMA', () => {
  it('returns empty for insufficient bars', () => {
    expect(computeEMA(ASC_BARS.slice(0, 2), 5)).toEqual([]);
  });

  it('first EMA value equals SMA seed', () => {
    const ema = computeEMA(ASC_BARS, 5);
    const sma = computeSMA(ASC_BARS, 5);
    expect(ema[0].value).toBeCloseTo(sma[0].value, 10);
  });

  it('EMA on flat data equals constant', () => {
    const result = computeEMA(FLAT_BARS, 5);
    result.forEach(pt => expect(pt.value).toBeCloseTo(100, 10));
  });

  it('EMA follows ascending data upward', () => {
    const result = computeEMA(ASC_BARS, 5);
    for (let i = 1; i < result.length; i++) {
      expect(result[i].value).toBeGreaterThan(result[i - 1].value);
    }
  });

  it('EMA lags behind price in trending market', () => {
    const result = computeEMA(ASC_BARS, 5);
    // EMA should be below close for ascending data
    result.forEach((pt, i) => {
      const barIdx = 4 + i; // EMA starts at bar index 4
      expect(pt.value).toBeLessThanOrEqual(ASC_BARS[barIdx].c);
    });
  });
});

describe('emaFromValues', () => {
  it('matches computeEMA output', () => {
    const values = ASC_CLOSES;
    const fromValues = emaFromValues(values, 5);
    const fromBars = computeEMA(ASC_BARS, 5);
    expect(fromValues.length).toBe(fromBars.length);
    fromValues.forEach((v, i) => expect(v).toBeCloseTo(fromBars[i].value, 10));
  });
});

// ── RSI ─────────────────────────────────────────────────────────────────────
describe('computeRSI', () => {
  it('returns empty for insufficient bars', () => {
    expect(computeRSI(ASC_BARS.slice(0, 5), 14)).toEqual([]);
  });

  it('RSI = 100 for purely ascending data (no losses)', () => {
    // All changes positive => avgLoss = 0 => RSI = 100 (direct guard)
    const result = computeRSI(ASC_BARS, 14);
    expect(result[0].value).toBe(100);
  });

  it('RSI is bounded [0, 100]', () => {
    const result = computeRSI(ZIG_BARS, 5);
    result.forEach(pt => {
      expect(pt.value).toBeGreaterThanOrEqual(0);
      expect(pt.value).toBeLessThanOrEqual(100);
    });
  });

  it('RSI = 100 on flat data (avgLoss=0 guard)', () => {
    // Flat data: all changes = 0 => avgGain = 0, avgLoss = 0
    // Guard: avgLoss === 0 => RSI = 100 directly
    const result = computeRSI(FLAT_BARS, 14);
    expect(result[0].value).toBe(100);
  });

  it('zigzag data RSI is near 50', () => {
    const result = computeRSI(ZIG_BARS, 4);
    // Roughly balanced gains and losses
    result.forEach(pt => {
      expect(pt.value).toBeGreaterThan(20);
      expect(pt.value).toBeLessThan(80);
    });
  });

  it('output length = bars.length - period', () => {
    const period = 14;
    const result = computeRSI(ASC_BARS, period);
    expect(result.length).toBe(ASC_BARS.length - period);
  });
});

// ── MACD ────────────────────────────────────────────────────────────────────
describe('computeMACD', () => {
  const LONG_BARS = makeBars(Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 5) * 10));

  it('returns empty for insufficient bars', () => {
    expect(computeMACD(ASC_BARS, 12, 26, 9)).toEqual([]);
  });

  it('histogram = macd - signal', () => {
    const result = computeMACD(LONG_BARS, 12, 26, 9);
    result.forEach(pt => {
      expect(pt.histogram).toBeCloseTo(pt.macd - pt.signal, 10);
    });
  });

  it('flat data MACD line is zero', () => {
    const flatBars = makeBars(Array.from({ length: 60 }, () => 50));
    const result = computeMACD(flatBars, 12, 26, 9);
    result.forEach(pt => {
      expect(pt.macd).toBeCloseTo(0, 8);
      expect(pt.signal).toBeCloseTo(0, 8);
    });
  });

  it('timestamps are valid bar timestamps', () => {
    const result = computeMACD(LONG_BARS, 12, 26, 9);
    const allTimestamps = new Set(LONG_BARS.map(b => b.t));
    result.forEach(pt => expect(allTimestamps.has(pt.t)).toBe(true));
  });
});

// ── Bollinger Bands ─────────────────────────────────────────────────────────
describe('computeBollinger', () => {
  it('returns empty for insufficient bars', () => {
    expect(computeBollinger(ASC_BARS.slice(0, 5), 20)).toEqual([]);
  });

  it('middle band = SMA', () => {
    const bb = computeBollinger(ASC_BARS, 5, 2);
    const sma = computeSMA(ASC_BARS, 5);
    expect(bb.length).toBe(sma.length);
    bb.forEach((pt, i) => expect(pt.middle).toBeCloseTo(sma[i].value, 10));
  });

  it('upper > middle > lower', () => {
    const result = computeBollinger(ZIG_BARS, 5, 2);
    result.forEach(pt => {
      expect(pt.upper).toBeGreaterThan(pt.middle);
      expect(pt.middle).toBeGreaterThan(pt.lower);
    });
  });

  it('flat data: upper = middle = lower (zero stddev)', () => {
    const result = computeBollinger(FLAT_BARS, 5, 2);
    result.forEach(pt => {
      expect(pt.upper).toBeCloseTo(pt.middle, 10);
      expect(pt.lower).toBeCloseTo(pt.middle, 10);
    });
  });

  it('bands are symmetric around middle', () => {
    const result = computeBollinger(ZIG_BARS, 5, 2);
    result.forEach(pt => {
      expect(pt.upper - pt.middle).toBeCloseTo(pt.middle - pt.lower, 10);
    });
  });
});

// ── ATR ─────────────────────────────────────────────────────────────────────
describe('computeATR', () => {
  it('returns empty for insufficient bars', () => {
    expect(computeATR(ASC_BARS.slice(0, 1), 10)).toEqual([]);
  });

  it('ATR is always positive', () => {
    const result = computeATR(ASC_BARS, 5);
    result.forEach(v => expect(v).toBeGreaterThan(0));
  });

  it('ATR on constant-range bars is consistent', () => {
    // All bars have h = c+1, l = c-1, so range = 2
    // True range also considers prev close gaps
    const result = computeATR(FLAT_BARS, 5);
    // For flat bars: h-l=2, |h-prevC|=1, |l-prevC|=1 => TR=2
    result.forEach(v => expect(v).toBeCloseTo(2, 5));
  });

  it('output length = bars.length - period + 1 (after initial seed)', () => {
    const period = 5;
    const result = computeATR(ASC_BARS, period);
    expect(result.length).toBe(ASC_BARS.length - period + 1);
  });

  it('first ATR value = average of first N true ranges', () => {
    const period = 5;
    const result = computeATR(ASC_BARS, period);
    // Manually compute first 5 true ranges
    const trs = [ASC_BARS[0].h - ASC_BARS[0].l]; // first bar
    for (let i = 1; i < period; i++) {
      const tr = Math.max(
        ASC_BARS[i].h - ASC_BARS[i].l,
        Math.abs(ASC_BARS[i].h - ASC_BARS[i - 1].c),
        Math.abs(ASC_BARS[i].l - ASC_BARS[i - 1].c),
      );
      trs.push(tr);
    }
    const expected = trs.reduce((a, b) => a + b, 0) / period;
    expect(result[0]).toBeCloseTo(expected, 10);
  });
});

// ── Stochastic ──────────────────────────────────────────────────────────────
describe('computeStochastic', () => {
  it('returns empty for insufficient bars', () => {
    expect(computeStochastic(ASC_BARS.slice(0, 3), 14)).toEqual([]);
  });

  it('%K is bounded [0, 100]', () => {
    const result = computeStochastic(ZIG_BARS, 5, 3);
    result.forEach(pt => {
      expect(pt.k).toBeGreaterThanOrEqual(0);
      expect(pt.k).toBeLessThanOrEqual(100);
    });
  });

  it('%D is bounded [0, 100]', () => {
    const result = computeStochastic(ZIG_BARS, 5, 3);
    result.forEach(pt => {
      expect(pt.d).toBeGreaterThanOrEqual(0);
      expect(pt.d).toBeLessThanOrEqual(100);
    });
  });

  it('purely ascending data: %K near 100', () => {
    const result = computeStochastic(ASC_BARS, 5, 3);
    // Close is always near the high of the lookback window
    result.forEach(pt => expect(pt.k).toBeGreaterThan(80));
  });

  it('flat data: %K = 50 (range = 0 guard)', () => {
    const result = computeStochastic(FLAT_BARS, 5, 3);
    result.forEach(pt => expect(pt.k).toBeCloseTo(50, 5));
  });
});

// ── WMA ─────────────────────────────────────────────────────────────────────
describe('computeWMA', () => {
  it('returns empty for insufficient bars', () => {
    expect(computeWMA(ASC_BARS.slice(0, 2), 5)).toEqual([]);
  });

  it('WMA-1 equals close prices', () => {
    const result = computeWMA(ASC_BARS, 1);
    expect(result.length).toBe(20);
    result.forEach((pt, i) => expect(pt.value).toBeCloseTo(ASC_CLOSES[i], 10));
  });

  it('flat data WMA equals constant', () => {
    const result = computeWMA(FLAT_BARS, 5);
    result.forEach(pt => expect(pt.value).toBeCloseTo(100, 10));
  });

  it('WMA weights recent data more heavily', () => {
    // For ascending data, WMA > SMA because recent (higher) values have more weight
    const wma = computeWMA(ASC_BARS, 5);
    const sma = computeSMA(ASC_BARS, 5);
    wma.forEach((pt, i) => {
      expect(pt.value).toBeGreaterThanOrEqual(sma[i].value);
    });
  });

  it('WMA-3 hand-calculated', () => {
    // WMA-3 of [10, 11, 12]: (10*1 + 11*2 + 12*3) / (1+2+3) = (10+22+36)/6 = 68/6 ≈ 11.333
    const result = computeWMA(ASC_BARS, 3);
    expect(result[0].value).toBeCloseTo(68 / 6, 10);
  });
});
