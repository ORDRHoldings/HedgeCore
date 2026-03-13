/**
 * ORDR Market — Strategy Store
 * Persist user strategies + seed marketplace catalog.
 */

import type { StrategyMeta } from './types';

const STRATEGIES_KEY  = 'ordr_strategies';
const SUBSCRIBED_KEY  = 'ordr_subscriptions';

// ── Marketplace seed data ─────────────────────────────────────────────────────
export const MARKETPLACE_STRATEGIES: StrategyMeta[] = [
  {
    id: 'mkt_001',
    name: 'Pro EMA Cascade',
    description: 'Triple EMA cascade with volatility filter. Entries on alignment, exits on divergence.',
    authorId: 'user_pro_01', authorName: 'ProAlgo',
    language: 'javascript',
    code: '', // code hidden for paid strategies
    createdAt: Date.now() - 86400000 * 60,
    updatedAt: Date.now() - 86400000 * 5,
    tags: ['trend', 'ema', 'filter'],
    visibility: 'marketplace',
    price: 0, priceMonthly: 490, subscribers: 312,
    lastBacktest: {
      totalReturn: 47.3, totalReturnAbs: 4730, annualReturn: 38.1,
      maxDrawdown: -9.8, maxDrawdownAbs: -980, maxDrawdownDuration: 42,
      sharpe: 2.21, sortino: 3.04, calmar: 3.89,
      totalTrades: 187, winningTrades: 118, losingTrades: 69, breakEvenTrades: 0,
      winRate: 63.1, profitFactor: 2.34,
      avgTrade: 25.3, avgWin: 68.4, avgLoss: -41.2,
      bestTrade: 412, worstTrade: -198, avgTradeDuration: 12, maxConsecWins: 9, maxConsecLosses: 4,
      initialCapital: 10000, finalCapital: 14730, totalFees: 234, maxExposure: 100,
    },
  },
  {
    id: 'mkt_002',
    name: 'Momentum Alpha',
    description: 'Breakout momentum system. Combines ATR expansion, RSI momentum, and volume confirmation.',
    authorId: 'user_pro_01', authorName: 'ProAlgo',
    language: 'pinescript',
    code: '',
    createdAt: Date.now() - 86400000 * 45,
    updatedAt: Date.now() - 86400000 * 2,
    tags: ['momentum', 'breakout', 'volume'],
    visibility: 'marketplace',
    price: 1900, priceMonthly: 890, subscribers: 89,
    lastBacktest: {
      totalReturn: 61.2, totalReturnAbs: 6120, annualReturn: 52.8,
      maxDrawdown: -14.2, maxDrawdownAbs: -1420, maxDrawdownDuration: 67,
      sharpe: 1.98, sortino: 2.61, calmar: 3.72,
      totalTrades: 143, winningTrades: 82, losingTrades: 61, breakEvenTrades: 0,
      winRate: 57.3, profitFactor: 1.91,
      avgTrade: 42.8, avgWin: 102.3, avgLoss: -58.7,
      bestTrade: 634, worstTrade: -312, avgTradeDuration: 18, maxConsecWins: 7, maxConsecLosses: 5,
      initialCapital: 10000, finalCapital: 16120, totalFees: 178, maxExposure: 100,
    },
  },
  {
    id: 'mkt_003',
    name: 'Mean Revert FX',
    description: 'Bollinger Band mean reversion tuned for major FX pairs. High win rate, tight drawdown.',
    authorId: 'user_pro_01', authorName: 'ProAlgo',
    language: 'javascript',
    code: '',
    createdAt: Date.now() - 86400000 * 30,
    updatedAt: Date.now() - 86400000 * 1,
    tags: ['mean-reversion', 'fx', 'bollinger'],
    visibility: 'marketplace',
    price: 0, priceMonthly: 290, subscribers: 541,
    lastBacktest: {
      totalReturn: 28.9, totalReturnAbs: 2890, annualReturn: 24.1,
      maxDrawdown: -6.4, maxDrawdownAbs: -640, maxDrawdownDuration: 28,
      sharpe: 2.87, sortino: 4.12, calmar: 3.77,
      totalTrades: 284, winningTrades: 198, losingTrades: 86, breakEvenTrades: 0,
      winRate: 69.7, profitFactor: 2.78,
      avgTrade: 10.2, avgWin: 22.1, avgLoss: -19.8,
      bestTrade: 198, worstTrade: -124, avgTradeDuration: 7, maxConsecWins: 14, maxConsecLosses: 3,
      initialCapital: 10000, finalCapital: 12890, totalFees: 342, maxExposure: 100,
    },
  },
  {
    id: 'mkt_004',
    name: 'MACD Divergence Pro',
    description: 'Advanced MACD divergence detector with multi-timeframe confirmation.',
    authorId: 'user_pro_01', authorName: 'ProAlgo',
    language: 'python',
    code: '',
    createdAt: Date.now() - 86400000 * 20,
    updatedAt: Date.now() - 86400000 * 3,
    tags: ['macd', 'divergence', 'multi-tf'],
    visibility: 'marketplace',
    price: 2900, priceMonthly: 1190, subscribers: 47,
    lastBacktest: {
      totalReturn: 83.4, totalReturnAbs: 8340, annualReturn: 71.8,
      maxDrawdown: -18.9, maxDrawdownAbs: -1890, maxDrawdownDuration: 89,
      sharpe: 1.74, sortino: 2.38, calmar: 3.80,
      totalTrades: 98, winningTrades: 56, losingTrades: 42, breakEvenTrades: 0,
      winRate: 57.1, profitFactor: 2.04,
      avgTrade: 85.1, avgWin: 198.2, avgLoss: -97.4,
      bestTrade: 1240, worstTrade: -478, avgTradeDuration: 28, maxConsecWins: 6, maxConsecLosses: 5,
      initialCapital: 10000, finalCapital: 18340, totalFees: 124, maxExposure: 100,
    },
  },
  {
    id: 'mkt_005',
    name: 'ADX Trend Filter',
    description: 'EMA crossover with ADX trend strength filter. Only trades in strong trending conditions.',
    authorId: 'user_demo_01', authorName: 'DemoTrader',
    language: 'javascript',
    code: '',
    createdAt: Date.now() - 86400000 * 15,
    updatedAt: Date.now() - 86400000 * 2,
    tags: ['adx', 'trend', 'filter', 'ema'],
    visibility: 'marketplace',
    price: 0, priceMonthly: 0, subscribers: 1203,
    lastBacktest: {
      totalReturn: 34.6, totalReturnAbs: 3460, annualReturn: 29.2,
      maxDrawdown: -11.3, maxDrawdownAbs: -1130, maxDrawdownDuration: 54,
      sharpe: 1.82, sortino: 2.44, calmar: 2.58,
      totalTrades: 156, winningTrades: 92, losingTrades: 64, breakEvenTrades: 0,
      winRate: 59.0, profitFactor: 1.87,
      avgTrade: 22.2, avgWin: 54.8, avgLoss: -36.2,
      bestTrade: 387, worstTrade: -248, avgTradeDuration: 15, maxConsecWins: 8, maxConsecLosses: 4,
      initialCapital: 10000, finalCapital: 13460, totalFees: 195, maxExposure: 100,
    },
  },
  {
    id: 'mkt_006',
    name: 'Stochastic Swing',
    description: 'Stochastic RSI swing trade system. 4H and daily aligned.',
    authorId: 'user_demo_01', authorName: 'DemoTrader',
    language: 'pinescript',
    code: '',
    createdAt: Date.now() - 86400000 * 10,
    updatedAt: Date.now() - 86400000 * 1,
    tags: ['stochastic', 'swing', 'fx'],
    visibility: 'marketplace',
    price: 0, priceMonthly: 190, subscribers: 678,
    lastBacktest: {
      totalReturn: 22.7, totalReturnAbs: 2270, annualReturn: 18.9,
      maxDrawdown: -7.8, maxDrawdownAbs: -780, maxDrawdownDuration: 35,
      sharpe: 2.14, sortino: 3.01, calmar: 2.42,
      totalTrades: 218, winningTrades: 148, losingTrades: 70, breakEvenTrades: 0,
      winRate: 67.9, profitFactor: 2.42,
      avgTrade: 10.4, avgWin: 24.2, avgLoss: -22.1,
      bestTrade: 224, worstTrade: -148, avgTradeDuration: 9, maxConsecWins: 11, maxConsecLosses: 4,
      initialCapital: 10000, finalCapital: 12270, totalFees: 272, maxExposure: 100,
    },
  },
];

// ── User strategy CRUD ────────────────────────────────────────────────────────
function loadAll(): StrategyMeta[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(STRATEGIES_KEY) ?? '[]') as StrategyMeta[];
  } catch { return []; }
}

function saveAll(strategies: StrategyMeta[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STRATEGIES_KEY, JSON.stringify(strategies));
}

export function saveStrategy(strategy: StrategyMeta): void {
  const all = loadAll();
  const idx = all.findIndex(s => s.id === strategy.id);
  if (idx >= 0) all[idx] = strategy;
  else all.push(strategy);
  saveAll(all);
}

export function loadStrategy(id: string): StrategyMeta | null {
  return loadAll().find(s => s.id === id) ?? null;
}

export function listUserStrategies(userId: string): StrategyMeta[] {
  return loadAll().filter(s => s.authorId === userId);
}

export function deleteStrategy(id: string): void {
  saveAll(loadAll().filter(s => s.id !== id));
}

export function newStrategyId(): string {
  return 'strat_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ── Subscription management ───────────────────────────────────────────────────
function loadSubs(): string[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(SUBSCRIBED_KEY) ?? '[]'); } catch { return []; }
}

export function isSubscribed(strategyId: string): boolean {
  return loadSubs().includes(strategyId);
}

export function subscribe(strategyId: string): void {
  const subs = loadSubs();
  if (!subs.includes(strategyId)) {
    subs.push(strategyId);
    localStorage.setItem(SUBSCRIBED_KEY, JSON.stringify(subs));
  }
}

export function unsubscribe(strategyId: string): void {
  localStorage.setItem(SUBSCRIBED_KEY, JSON.stringify(loadSubs().filter(id => id !== strategyId)));
}
