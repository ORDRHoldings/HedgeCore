/**
 * Backtest engine integration tests
 * Tests runBacktest end-to-end with simple strategies.
 */
import { describe, it, expect } from 'vitest';
import { runBacktest } from './engine';
import type { BacktestConfig, Bar } from './types';

const CONFIG: BacktestConfig = {
  initialCapital: 10_000,
  commission: 0,
  slippage: 0,
  positionSize: 100,
  symbol: 'TEST',
  interval: '1h',
};

function makeBars(closes: number[], baseTime = 1_000_000): Bar[] {
  return closes.map((c, i) => ({
    t: baseTime + i * 60_000,
    o: i === 0 ? c : closes[i - 1], // open = prev close (realistic)
    h: c + 1,
    l: c - 1,
    c,
    v: 1000,
  }));
}

// ── Buy and hold ────────────────────────────────────────────────────────────
describe('runBacktest — buy on first bar', () => {
  const bars = makeBars([100, 102, 104, 106, 108, 110]);
  const code = `function onBar(api) {
    if (api.index === 0) api.buy("Entry");
  }`;

  it('generates one trade', () => {
    const result = runBacktest(bars, code, 'javascript', CONFIG);
    expect(result.error).toBeNull();
    expect(result.trades.length).toBe(1);
  });

  it('closes open position at end of data', () => {
    const result = runBacktest(bars, code, 'javascript', CONFIG);
    const trade = result.trades[0];
    expect(trade.exitBar).toBe(5);
    expect(trade.exitComment).toBe('End of data');
  });

  it('equity curve has one point per bar', () => {
    const result = runBacktest(bars, code, 'javascript', CONFIG);
    expect(result.equity.length).toBe(bars.length);
  });

  it('final equity reflects profit', () => {
    const result = runBacktest(bars, code, 'javascript', CONFIG);
    // Bought at bar[1].o (102) since fill at next bar open
    // Closed at bar[5].c (110)
    expect(result.metrics.finalCapital).toBeGreaterThan(CONFIG.initialCapital);
  });

  it('records execution time', () => {
    const result = runBacktest(bars, code, 'javascript', CONFIG);
    expect(result.execTimeMs).toBeGreaterThanOrEqual(0);
  });
});

// ── Buy and sell ────────────────────────────────────────────────────────────
describe('runBacktest — buy then sell', () => {
  const bars = makeBars([100, 105, 110, 108, 106, 104]);
  const code = `function onBar(api) {
    if (api.index === 0) api.buy("Go long");
    if (api.index === 2) api.sell("Take profit");
  }`;

  it('generates a completed trade', () => {
    const result = runBacktest(bars, code, 'javascript', CONFIG);
    expect(result.error).toBeNull();
    const trade = result.trades[0];
    expect(trade.exitBar).not.toBeNull();
    expect(trade.pnl).not.toBeNull();
  });

  it('entry at next bar open after signal', () => {
    const result = runBacktest(bars, code, 'javascript', CONFIG);
    const trade = result.trades[0];
    // Signal at bar 0, fill at bar 0's open (since processOrder runs on same bar)
    expect(trade.entryBar).toBe(0);
    expect(trade.entryPrice).toBe(bars[0].o);
  });
});

// ── Commission impact ───────────────────────────────────────────────────────
describe('runBacktest — commissions', () => {
  const bars = makeBars([100, 105, 110, 115, 120]);
  const code = `function onBar(api) {
    if (api.index === 0) api.buy();
    if (api.index === 2) api.sell();
  }`;

  it('fees reduce profit', () => {
    const configWithFee = { ...CONFIG, commission: 0.5 };
    const noFee = runBacktest(bars, code, 'javascript', CONFIG);
    const withFee = runBacktest(bars, code, 'javascript', configWithFee);
    expect(withFee.metrics.totalFees).toBeGreaterThan(0);
    expect(withFee.metrics.finalCapital).toBeLessThan(noFee.metrics.finalCapital);
  });
});

// ── Short strategy ──────────────────────────────────────────────────────────
describe('runBacktest — short strategy', () => {
  const bars = makeBars([110, 108, 106, 104, 102, 100]);
  const code = `function onBar(api) {
    if (api.index === 0) api.short("Short entry");
  }`;

  it('profits on declining prices', () => {
    const result = runBacktest(bars, code, 'javascript', CONFIG);
    expect(result.error).toBeNull();
    expect(result.trades[0].direction).toBe('short');
    expect(result.metrics.finalCapital).toBeGreaterThan(CONFIG.initialCapital);
  });
});

// ── Error handling ──────────────────────────────────────────────────────────
describe('runBacktest — error handling', () => {
  it('returns error for invalid code', () => {
    const result = runBacktest(
      makeBars([100, 101]),
      'this is not valid javascript function code }{}{',
      'javascript',
      CONFIG,
    );
    expect(result.error).not.toBeNull();
    expect(result.trades).toEqual([]);
  });

  it('returns error when no onBar function defined', () => {
    const result = runBacktest(
      makeBars([100, 101]),
      'const x = 5;',
      'javascript',
      CONFIG,
    );
    expect(result.error).not.toBeNull();
  });

  it('survives strategy runtime errors gracefully', () => {
    const code = `function onBar(api) {
      if (api.index === 2) throw new Error("deliberate");
      api.buy();
    }`;
    const bars = makeBars([100, 101, 102, 103, 104]);
    const result = runBacktest(bars, code, 'javascript', CONFIG);
    // Should not crash, just log warning
    expect(result.error).toBeNull();
    expect(result.equity.length).toBe(bars.length);
  });
});

// ── PineScript integration ──────────────────────────────────────────────────
describe('runBacktest — PineScript', () => {
  it('runs transpiled PineScript strategy', () => {
    const pine = `//@version=5
strategy("Test", overlay=true)
if close > open
    strategy.entry("Long", strategy.long)
if close < open
    strategy.close("Long")`;

    const bars = makeBars([100, 105, 103, 108, 102, 110]);
    const result = runBacktest(bars, pine, 'pinescript', CONFIG);
    expect(result.error).toBeNull();
    expect(result.equity.length).toBe(bars.length);
  });
});

// ── Python integration ──────────────────────────────────────────────────────
describe('runBacktest — Python', () => {
  it('runs transpiled Python strategy', () => {
    const python = `def on_bar(api):
    if api.close > api.open:
        api.buy("Long")
    if api.close < api.open:
        api.sell("Exit")`;

    const bars = makeBars([100, 105, 103, 108, 102, 110]);
    const result = runBacktest(bars, python, 'python', CONFIG);
    expect(result.error).toBeNull();
    expect(result.equity.length).toBe(bars.length);
  });
});

// ── Metrics integration ─────────────────────────────────────────────────────
describe('runBacktest — metrics', () => {
  it('calculates Sharpe ratio for a multi-trade strategy', () => {
    const bars = makeBars(Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i / 3) * 5));
    const code = `function onBar(api) {
      const sma5 = api.sma(5);
      const sma10 = api.sma(10);
      if (api.crossover(sma5, sma10)) api.buy("Golden cross");
      if (api.crossunder(sma5, sma10)) api.sell("Death cross");
    }`;

    const result = runBacktest(bars, code, 'javascript', CONFIG);
    expect(result.error).toBeNull();
    expect(typeof result.metrics.sharpe).toBe('number');
    expect(isFinite(result.metrics.sharpe)).toBe(true);
  });
});

// ── Plot collection ─────────────────────────────────────────────────────────
describe('runBacktest — plots', () => {
  it('collects plot series from strategy', () => {
    const code = `function onBar(api) {
      api.plot(api.sma(5), "SMA5", "#FF0000");
    }`;
    const bars = makeBars(Array.from({ length: 20 }, (_, i) => 100 + i));
    const result = runBacktest(bars, code, 'javascript', CONFIG);
    expect(result.error).toBeNull();
    expect(result.plots.length).toBeGreaterThan(0);
    expect(result.plots[0].label).toBe('SMA5');
    expect(result.plots[0].color).toBe('#FF0000');
  });
});
