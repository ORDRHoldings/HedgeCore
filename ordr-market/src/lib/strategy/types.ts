/**
 * ORDR Market — Strategy & Backtest Types
 */

import type { Bar } from '@/components/chart/indicators';

export type { Bar };

export type Language = 'javascript' | 'pinescript' | 'python';

// ── Strategy definition ───────────────────────────────────────────────────────
export interface StrategyMeta {
  id: string;
  name: string;
  description: string;
  authorId: string;
  authorName: string;
  language: Language;
  code: string;
  createdAt: number;
  updatedAt: number;
  tags: string[];
  visibility: 'private' | 'public' | 'marketplace';
  // Marketplace fields
  price: number;          // one-time price in credits (0 = free)
  priceMonthly: number;   // monthly subscription price in credits
  subscribers: number;
  // Last backtest snapshot
  lastBacktest?: BacktestMetrics;
}

// ── Backtest configuration ────────────────────────────────────────────────────
export interface BacktestConfig {
  initialCapital: number;   // USD
  commission: number;       // % per side, e.g. 0.1 = 0.1%
  slippage: number;         // % per side
  positionSize: number;     // % of capital per trade, 100 = full Kelly
  symbol: string;
  interval: string;
}

export const DEFAULT_CONFIG: BacktestConfig = {
  initialCapital: 10_000,
  commission: 0.1,
  slippage: 0.0,
  positionSize: 100,
  symbol: 'EURUSD',
  interval: '30m',
};

// ── Trade record ──────────────────────────────────────────────────────────────
export interface Trade {
  id: string;
  direction: 'long' | 'short';
  entryBar: number;         // bar index
  exitBar: number | null;
  entryTime: number;        // unix ms
  exitTime: number | null;
  entryPrice: number;
  exitPrice: number | null;
  size: number;             // units
  pnl: number | null;       // USD
  pnlPct: number | null;    // %
  fees: number;             // USD
  comment: string;
  exitComment: string;
}

// ── Backtest result ───────────────────────────────────────────────────────────
export interface EquityPoint {
  t: number;    // unix ms
  value: number; // USD
}

export interface PlotSeries {
  label: string;
  color: string;
  points: { t: number; value: number }[];
}

export interface BacktestResult {
  trades: Trade[];
  equity: EquityPoint[];
  metrics: BacktestMetrics;
  plots: PlotSeries[];
  error: string | null;
  barCount: number;
  execTimeMs: number;
}

// ── Backtest metrics ──────────────────────────────────────────────────────────
export interface BacktestMetrics {
  // Returns
  totalReturn: number;      // %
  totalReturnAbs: number;   // USD
  annualReturn: number;     // %
  // Risk
  maxDrawdown: number;      // % (negative)
  maxDrawdownAbs: number;   // USD (negative)
  maxDrawdownDuration: number; // bars
  // Risk-adjusted
  sharpe: number;
  sortino: number;
  calmar: number;
  // Trade statistics
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  breakEvenTrades: number;
  winRate: number;          // %
  profitFactor: number;
  // Per-trade
  avgTrade: number;         // USD
  avgWin: number;           // USD
  avgLoss: number;          // USD
  bestTrade: number;        // USD
  worstTrade: number;       // USD
  avgTradeDuration: number; // bars
  maxConsecWins: number;
  maxConsecLosses: number;
  // Capital
  initialCapital: number;
  finalCapital: number;
  totalFees: number;
  maxExposure: number;      // % of capital at peak
}

export const EMPTY_METRICS: BacktestMetrics = {
  totalReturn: 0, totalReturnAbs: 0, annualReturn: 0,
  maxDrawdown: 0, maxDrawdownAbs: 0, maxDrawdownDuration: 0,
  sharpe: 0, sortino: 0, calmar: 0,
  totalTrades: 0, winningTrades: 0, losingTrades: 0, breakEvenTrades: 0,
  winRate: 0, profitFactor: 0,
  avgTrade: 0, avgWin: 0, avgLoss: 0, bestTrade: 0, worstTrade: 0,
  avgTradeDuration: 0, maxConsecWins: 0, maxConsecLosses: 0,
  initialCapital: 0, finalCapital: 0, totalFees: 0, maxExposure: 0,
};

// ── Strategy API (exposed to user code) ───────────────────────────────────────
export interface StrategyAPI {
  // Current bar
  close: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  index: number;
  time: number;

  // Historical series (immutable slices to current bar)
  closes: number[];
  opens: number[];
  highs: number[];
  lows: number[];
  volumes: number[];

  // Technical analysis — return value at current bar
  sma(period: number): number;
  ema(period: number): number;
  wma(period: number): number;
  rsi(period?: number): number;
  atr(period?: number): number;
  macd(fast?: number, slow?: number, signal?: number): { macd: number; signal: number; hist: number };
  bb(period?: number, mult?: number): { upper: number; middle: number; lower: number };
  stoch(kPeriod?: number, dPeriod?: number): { k: number; d: number };
  highest(period: number): number;
  lowest(period: number): number;

  // Cross detection (order-stable across bars)
  crossover(a: number, b: number): boolean;
  crossunder(a: number, b: number): boolean;

  // Position state
  position: 'long' | 'short' | null;
  entryPrice: number | null;
  unrealizedPnl: number;
  barsInTrade: number;

  // Order placement
  buy(comment?: string): void;
  sell(comment?: string): void;
  short(comment?: string): void;
  cover(comment?: string): void;
  close_position(comment?: string): void;

  // Chart overlays
  plot(value: number, label?: string, color?: string): void;

  // Parameters (for PineScript input.* declarations)
  param(name: string, defaultValue: number): number;
}
