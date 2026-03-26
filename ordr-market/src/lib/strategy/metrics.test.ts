/**
 * Backtest metrics calculator tests
 * Verifies Sharpe, Sortino, drawdown, win rate, profit factor against known values.
 */
import { describe, it, expect } from 'vitest';
import { calculateMetrics } from './metrics';
import type { Trade, EquityPoint, BacktestConfig } from './types';

const BASE_CONFIG: BacktestConfig = {
  initialCapital: 10_000,
  commission: 0,
  slippage: 0,
  positionSize: 100,
  symbol: 'TEST',
  interval: '1h',
};

function makeTrade(overrides: Partial<Trade>): Trade {
  return {
    id: 't_1',
    direction: 'long',
    entryBar: 0,
    exitBar: 5,
    entryTime: 1_000_000,
    exitTime: 1_300_000,
    entryPrice: 100,
    exitPrice: 110,
    size: 100,
    pnl: 1000,
    pnlPct: 10,
    fees: 0,
    comment: '',
    exitComment: '',
    ...overrides,
  };
}

function makeEquity(values: number[], baseTime = 1_000_000): EquityPoint[] {
  return values.map((v, i) => ({ t: baseTime + i * 60_000, value: v }));
}

// ── No trades ───────────────────────────────────────────────────────────────
describe('calculateMetrics — no trades', () => {
  it('returns zero metrics with no trades', () => {
    const m = calculateMetrics([], makeEquity([10_000]), BASE_CONFIG);
    expect(m.totalTrades).toBe(0);
    expect(m.winRate).toBe(0);
    expect(m.totalReturn).toBe(0);
    expect(m.initialCapital).toBe(10_000);
    expect(m.finalCapital).toBe(10_000);
  });
});

// ── Single winning trade ────────────────────────────────────────────────────
describe('calculateMetrics — single winning trade', () => {
  const trades = [makeTrade({ pnl: 1000, pnlPct: 10 })];
  const equity = makeEquity([10_000, 10_200, 10_500, 10_800, 11_000]);

  it('total return = 10%', () => {
    const m = calculateMetrics(trades, equity, BASE_CONFIG);
    expect(m.totalReturn).toBeCloseTo(10, 1);
    expect(m.totalReturnAbs).toBeCloseTo(1000, 1);
  });

  it('win rate = 100%', () => {
    const m = calculateMetrics(trades, equity, BASE_CONFIG);
    expect(m.winRate).toBeCloseTo(100, 5);
    expect(m.winningTrades).toBe(1);
    expect(m.losingTrades).toBe(0);
  });

  it('no drawdown on purely ascending equity', () => {
    const m = calculateMetrics(trades, equity, BASE_CONFIG);
    expect(m.maxDrawdown).toBe(0);
  });
});

// ── Mixed trades ────────────────────────────────────────────────────────────
describe('calculateMetrics — mixed trades', () => {
  const trades = [
    makeTrade({ id: 't_1', pnl: 500, pnlPct: 5 }),
    makeTrade({ id: 't_2', pnl: -200, pnlPct: -2 }),
    makeTrade({ id: 't_3', pnl: 300, pnlPct: 3 }),
    makeTrade({ id: 't_4', pnl: -100, pnlPct: -1 }),
  ];
  // Equity: 10000 → 10500 → 10300 → 10600 → 10500
  const equity = makeEquity([10_000, 10_500, 10_300, 10_600, 10_500]);

  it('total trades = 4', () => {
    const m = calculateMetrics(trades, equity, BASE_CONFIG);
    expect(m.totalTrades).toBe(4);
  });

  it('winning = 2, losing = 2', () => {
    const m = calculateMetrics(trades, equity, BASE_CONFIG);
    expect(m.winningTrades).toBe(2);
    expect(m.losingTrades).toBe(2);
  });

  it('win rate = 50%', () => {
    const m = calculateMetrics(trades, equity, BASE_CONFIG);
    expect(m.winRate).toBeCloseTo(50, 5);
  });

  it('profit factor = grossProfit / grossLoss', () => {
    const m = calculateMetrics(trades, equity, BASE_CONFIG);
    // Gross profit = 500 + 300 = 800, Gross loss = 200 + 100 = 300
    expect(m.profitFactor).toBeCloseTo(800 / 300, 5);
  });

  it('total return matches equity curve', () => {
    const m = calculateMetrics(trades, equity, BASE_CONFIG);
    expect(m.finalCapital).toBeCloseTo(10_500, 1);
    expect(m.totalReturn).toBeCloseTo(5, 1);
  });

  it('max drawdown is negative', () => {
    const m = calculateMetrics(trades, equity, BASE_CONFIG);
    // Peak at 10500, trough at 10300 → DD = (10300-10500)/10500 ≈ -1.9%
    expect(m.maxDrawdown).toBeLessThan(0);
    expect(m.maxDrawdown).toBeCloseTo(-1.9048, 2);
  });

  it('best and worst trade identified', () => {
    const m = calculateMetrics(trades, equity, BASE_CONFIG);
    expect(m.bestTrade).toBeCloseTo(500, 5);
    expect(m.worstTrade).toBeCloseTo(-200, 5);
  });
});

// ── Consecutive wins/losses ─────────────────────────────────────────────────
describe('calculateMetrics — consecutive streaks', () => {
  const trades = [
    makeTrade({ id: 't1', pnl: 100, pnlPct: 1 }),
    makeTrade({ id: 't2', pnl: 100, pnlPct: 1 }),
    makeTrade({ id: 't3', pnl: 100, pnlPct: 1 }),
    makeTrade({ id: 't4', pnl: -50, pnlPct: -0.5 }),
    makeTrade({ id: 't5', pnl: -50, pnlPct: -0.5 }),
  ];
  const equity = makeEquity([10_000, 10_100, 10_200, 10_300, 10_250, 10_200]);

  it('maxConsecWins = 3', () => {
    const m = calculateMetrics(trades, equity, BASE_CONFIG);
    expect(m.maxConsecWins).toBe(3);
  });

  it('maxConsecLosses = 2', () => {
    const m = calculateMetrics(trades, equity, BASE_CONFIG);
    expect(m.maxConsecLosses).toBe(2);
  });
});

// ── Sharpe/Sortino sanity ───────────────────────────────────────────────────
describe('calculateMetrics — risk-adjusted metrics', () => {
  it('Sharpe is zero for flat equity', () => {
    const equity = makeEquity(Array.from({ length: 20 }, () => 10_000));
    const m = calculateMetrics([], equity, BASE_CONFIG);
    expect(m.sharpe).toBe(0);
    expect(m.sortino).toBe(0);
  });

  it('Sharpe is positive for consistently growing equity', () => {
    const equity = makeEquity(Array.from({ length: 100 }, (_, i) => 10_000 + i * 10));
    const trades = [makeTrade({ pnl: 990, pnlPct: 9.9 })];
    const m = calculateMetrics(trades, equity, BASE_CONFIG);
    expect(m.sharpe).toBeGreaterThan(0);
  });

  it('Calmar = annualReturn / |maxDrawdown|', () => {
    // Only meaningful when there IS a drawdown
    const equity = makeEquity([10_000, 10_500, 10_200, 10_800]);
    const trades = [makeTrade({ pnl: 800, pnlPct: 8 })];
    const m = calculateMetrics(trades, equity, BASE_CONFIG);
    if (m.maxDrawdown < 0) {
      expect(m.calmar).toBeCloseTo(m.annualReturn / Math.abs(m.maxDrawdown), 5);
    }
  });
});

// ── Fees tracking ───────────────────────────────────────────────────────────
describe('calculateMetrics — fees', () => {
  it('sums fees across all trades', () => {
    const trades = [
      makeTrade({ id: 't1', fees: 10 }),
      makeTrade({ id: 't2', fees: 25 }),
      makeTrade({ id: 't3', fees: 15 }),
    ];
    const equity = makeEquity([10_000, 10_500]);
    const m = calculateMetrics(trades, equity, BASE_CONFIG);
    expect(m.totalFees).toBeCloseTo(50, 5);
  });
});

// ── Edge cases ──────────────────────────────────────────────────────────────
describe('calculateMetrics — edge cases', () => {
  it('all losing trades', () => {
    const trades = [
      makeTrade({ id: 't1', pnl: -500, pnlPct: -5 }),
      makeTrade({ id: 't2', pnl: -300, pnlPct: -3 }),
    ];
    const equity = makeEquity([10_000, 9_500, 9_200]);
    const m = calculateMetrics(trades, equity, BASE_CONFIG);
    expect(m.winRate).toBe(0);
    expect(m.profitFactor).toBe(0);
    expect(m.totalReturn).toBeLessThan(0);
  });

  it('break-even trades', () => {
    const trades = [makeTrade({ id: 't1', pnl: 0, pnlPct: 0 })];
    const equity = makeEquity([10_000, 10_000]);
    const m = calculateMetrics(trades, equity, BASE_CONFIG);
    expect(m.breakEvenTrades).toBe(1);
    expect(m.winningTrades).toBe(0);
    expect(m.losingTrades).toBe(0);
  });

  it('single equity point', () => {
    const equity = makeEquity([10_000]);
    const m = calculateMetrics([], equity, BASE_CONFIG);
    expect(m.finalCapital).toBe(10_000);
    expect(m.maxDrawdown).toBe(0);
  });
});
