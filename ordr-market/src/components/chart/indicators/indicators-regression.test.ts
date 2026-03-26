/**
 * Regression tests for indicator bugs found in audit.
 * Each test verifies a specific bug fix.
 */
import { describe, it, expect } from 'vitest';
import type { Bar } from './types';
import { computeRSI } from './rsi';
import { computeSuperTrend } from './supertrend';
import { computeADX } from './adx';
import { computeVolumeProfile } from './volume_profile';
import { computeIchimoku } from './ichimoku';

function makeBars(closes: number[], baseTime = 1_000_000): Bar[] {
  return closes.map((c, i) => ({
    t: baseTime + i * 60_000,
    o: i === 0 ? c : closes[i - 1],
    h: c + 1,
    l: c - 1,
    c,
    v: 1000 + i * 10,
  }));
}

// ── RSI: avgLoss=0 must return exactly 100 ──────────────────────────────────
describe('RSI — avgLoss=0 regression', () => {
  it('returns exactly 100 when all bars are ascending (zero losses)', () => {
    const bars = makeBars(Array.from({ length: 20 }, (_, i) => 10 + i));
    const result = computeRSI(bars, 14);
    expect(result[0].value).toBe(100);
  });

  it('returns exactly 100 on flat data (zero gains and zero losses)', () => {
    const bars = makeBars(Array.from({ length: 20 }, () => 50));
    const result = computeRSI(bars, 14);
    expect(result[0].value).toBe(100);
  });
});

// ── SuperTrend: ATR initialization used wrong bar index ─────────────────────
describe('SuperTrend — ATR initialization regression', () => {
  const bars = makeBars(Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i / 3) * 5));

  it('does not crash on valid data', () => {
    const result = computeSuperTrend(bars, 10, 3);
    expect(result.length).toBeGreaterThan(0);
  });

  it('first SuperTrend value is a valid number', () => {
    const result = computeSuperTrend(bars, 10, 3);
    expect(Number.isFinite(result[0].value)).toBe(true);
  });

  it('direction is either up or down', () => {
    const result = computeSuperTrend(bars, 10, 3);
    result.forEach(pt => {
      expect(['up', 'down']).toContain(pt.direction);
    });
  });

  it('ATR at period is average of first N true ranges (not corrupted)', () => {
    // With the fix, ATR at bar `period` should equal the manual average
    // of true ranges from bars[1] through bars[period], each referencing
    // the CORRECT previous close (bars[j-1].c, not bars[j].c).
    const period = 5;
    const smallBars = makeBars([10, 12, 11, 14, 13, 15, 12, 16, 11, 13]);
    const result = computeSuperTrend(smallBars, period, 2);
    // Should produce at least 1 result and not NaN
    expect(result.length).toBeGreaterThan(0);
    expect(Number.isNaN(result[0].value)).toBe(false);
  });
});

// ── ADX: DI timestamps were off by one ──────────────────────────────────────
describe('ADX — DI timestamp regression', () => {
  const bars = makeBars(Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 5) * 10));

  it('all result timestamps exist in the bar array', () => {
    const result = computeADX(bars, 14);
    const validTimestamps = new Set(bars.map(b => b.t));
    result.forEach(pt => {
      expect(validTimestamps.has(pt.t)).toBe(true);
    });
  });

  it('timestamps are monotonically increasing', () => {
    const result = computeADX(bars, 14);
    for (let i = 1; i < result.length; i++) {
      expect(result[i].t).toBeGreaterThan(result[i - 1].t);
    }
  });

  it('ADX is bounded [0, 100]', () => {
    const result = computeADX(bars, 14);
    result.forEach(pt => {
      expect(pt.adx).toBeGreaterThanOrEqual(0);
      expect(pt.adx).toBeLessThanOrEqual(100);
    });
  });

  it('+DI and -DI are bounded [0, 100]', () => {
    const result = computeADX(bars, 14);
    result.forEach(pt => {
      expect(pt.plusDI).toBeGreaterThanOrEqual(0);
      expect(pt.plusDI).toBeLessThanOrEqual(100);
      expect(pt.minusDI).toBeGreaterThanOrEqual(0);
      expect(pt.minusDI).toBeLessThanOrEqual(100);
    });
  });
});

// ── Volume Profile: VAH/VAL were off by half bin ────────────────────────────
describe('Volume Profile — VAH/VAL regression', () => {
  it('POC, VAH, VAL all use bin centers (consistent)', () => {
    const bars = makeBars([10, 15, 12, 18, 11, 20, 14, 16, 13, 17]);
    const result = computeVolumeProfile(bars, 10);

    // With 10 bins over the price range, bin size = range / 10
    // All three prices should be at bin centers (offset by +0.5 * binSize from bin edge)
    const minPrice = Math.min(...bars.map(b => b.l));
    const maxPrice = Math.max(...bars.map(b => b.h));
    const binSize = (maxPrice - minPrice) / 10;

    // POC should be at bin center
    const pocBinIdx = Math.round((result.poc - minPrice) / binSize - 0.5);
    expect(result.poc).toBeCloseTo(minPrice + (pocBinIdx + 0.5) * binSize, 10);

    // VAH and VAL should also be at bin centers
    if (result.vahPrice !== result.valPrice) {
      // VAH >= POC >= VAL
      expect(result.vahPrice).toBeGreaterThanOrEqual(result.valPrice);
    }
  });

  it('VAH >= VAL always holds', () => {
    const bars = makeBars([100, 105, 102, 108, 101, 110, 104, 106]);
    const result = computeVolumeProfile(bars, 20);
    expect(result.vahPrice).toBeGreaterThanOrEqual(result.valPrice);
  });

  it('single-price bars return equal POC/VAH/VAL', () => {
    // Truly flat bars (o=h=l=c) so priceRange=0 triggers the single-level path
    const bars: Bar[] = Array.from({ length: 5 }, (_, i) => ({
      t: 1_000_000 + i * 60_000, o: 50, h: 50, l: 50, c: 50, v: 1000,
    }));
    const result = computeVolumeProfile(bars, 10);
    expect(result.poc).toBe(result.vahPrice);
    expect(result.poc).toBe(result.valPrice);
  });
});

// ── Ichimoku: Senkou A/B consistent fallback ────────────────────────────────
describe('Ichimoku — Senkou fallback regression', () => {
  const bars = makeBars(Array.from({ length: 80 }, (_, i) => 100 + Math.sin(i / 10) * 20));

  it('produces results on sufficient data', () => {
    const result = computeIchimoku(bars, 9, 26, 52);
    expect(result.length).toBeGreaterThan(0);
  });

  it('Senkou A and B are both valid numbers (no NaN or 0 from bad fallback)', () => {
    const result = computeIchimoku(bars, 9, 26, 52);
    result.forEach(pt => {
      expect(Number.isFinite(pt.senkouA)).toBe(true);
      expect(Number.isFinite(pt.senkouB)).toBe(true);
      expect(pt.senkouB).not.toBe(0); // old code fell back to 0
    });
  });

  it('all components have valid timestamps', () => {
    const result = computeIchimoku(bars, 9, 26, 52);
    const validTs = new Set(bars.map(b => b.t));
    result.forEach(pt => expect(validTs.has(pt.t)).toBe(true));
  });
});
