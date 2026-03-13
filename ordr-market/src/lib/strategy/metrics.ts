/**
 * ORDR Market — Backtest Metrics Calculator
 * Computes all standard quant metrics from trade history and equity curve.
 */

import type { Trade, EquityPoint, BacktestConfig, BacktestMetrics } from './types';

function safe(n: number, fallback = 0): number {
  return isFinite(n) ? n : fallback;
}

export function calculateMetrics(
  trades: Trade[],
  equity: EquityPoint[],
  config: BacktestConfig,
): BacktestMetrics {
  const initialCapital = config.initialCapital;
  const finalCapital   = equity.length > 0 ? equity[equity.length - 1].value : initialCapital;

  // ── Closed trades only ─────────────────────────────────────────────────────
  const closed = trades.filter(t => t.pnl !== null);
  const wins   = closed.filter(t => (t.pnl ?? 0) > 0);
  const losses = closed.filter(t => (t.pnl ?? 0) < 0);
  const even   = closed.filter(t => (t.pnl ?? 0) === 0);

  // ── Returns ────────────────────────────────────────────────────────────────
  const totalReturnAbs = finalCapital - initialCapital;
  const totalReturn    = safe((totalReturnAbs / initialCapital) * 100);

  // Annualized return (CAGR) — estimate based on bar count
  const barsPerYear = 252 * 8 * 2; // ~approx for 30m bars, good-enough estimate
  const years = equity.length / barsPerYear;
  const annualReturn = years > 0
    ? safe(((Math.pow(finalCapital / initialCapital, 1 / years) - 1) * 100))
    : totalReturn;

  // ── Drawdown ───────────────────────────────────────────────────────────────
  let peak = initialCapital;
  let maxDD = 0;
  let maxDDAbs = 0;
  let drawdownStart = 0;
  let maxDDDuration = 0;
  let ddStartBar = 0;

  equity.forEach((pt, i) => {
    if (pt.value > peak) {
      peak = pt.value;
      ddStartBar = i;
    }
    const dd    = (pt.value - peak) / peak * 100;
    const ddAbs = pt.value - peak;
    if (dd < maxDD) {
      maxDD    = dd;
      maxDDAbs = ddAbs;
      maxDDDuration = i - ddStartBar;
      drawdownStart = ddStartBar;
    }
  });

  // ── Sharpe / Sortino ───────────────────────────────────────────────────────
  const returns: number[] = [];
  for (let i = 1; i < equity.length; i++) {
    returns.push((equity[i].value - equity[i - 1].value) / equity[i - 1].value);
  }

  const meanReturn = returns.length > 0 ? returns.reduce((s, r) => s + r, 0) / returns.length : 0;
  const stdDev = returns.length > 1
    ? Math.sqrt(returns.reduce((s, r) => s + Math.pow(r - meanReturn, 2), 0) / (returns.length - 1))
    : 0;
  const downside = returns.filter(r => r < 0);
  const downsideStd = downside.length > 1
    ? Math.sqrt(downside.reduce((s, r) => s + Math.pow(r, 2), 0) / (downside.length - 1))
    : 0;

  const annFactor  = Math.sqrt(barsPerYear);
  const sharpe  = safe(stdDev > 0 ? (meanReturn / stdDev) * annFactor : 0);
  const sortino = safe(downsideStd > 0 ? (meanReturn / downsideStd) * annFactor : 0);
  const calmar  = safe(maxDD < 0 ? annualReturn / Math.abs(maxDD) : 0);

  // ── Trade stats ────────────────────────────────────────────────────────────
  const winRate      = closed.length > 0 ? (wins.length / closed.length) * 100 : 0;
  const grossProfit  = wins.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const grossLoss    = Math.abs(losses.reduce((s, t) => s + (t.pnl ?? 0), 0));
  const profitFactor = safe(grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0);

  const avgTrade = closed.length > 0 ? totalReturnAbs / closed.length : 0;
  const avgWin   = wins.length > 0   ? grossProfit / wins.length : 0;
  const avgLoss  = losses.length > 0 ? -grossLoss / losses.length : 0;
  const bestTrade  = closed.length > 0 ? Math.max(...closed.map(t => t.pnl ?? 0)) : 0;
  const worstTrade = closed.length > 0 ? Math.min(...closed.map(t => t.pnl ?? 0)) : 0;

  const avgDuration = closed.length > 0
    ? closed.reduce((s, t) => s + ((t.exitBar ?? t.entryBar) - t.entryBar), 0) / closed.length
    : 0;

  // Consecutive wins/losses
  let maxConsecWins = 0, maxConsecLosses = 0;
  let curW = 0, curL = 0;
  for (const t of closed) {
    if ((t.pnl ?? 0) > 0) { curW++; curL = 0; maxConsecWins = Math.max(maxConsecWins, curW); }
    else if ((t.pnl ?? 0) < 0) { curL++; curW = 0; maxConsecLosses = Math.max(maxConsecLosses, curL); }
    else { curW = 0; curL = 0; }
  }

  const totalFees = trades.reduce((s, t) => s + t.fees, 0);
  const maxExposure = equity.length > 0 ? (Math.max(...equity.map(e => e.value)) / initialCapital - 1) * 100 : 0;

  void drawdownStart; // used implicitly

  return {
    totalReturn,
    totalReturnAbs,
    annualReturn,
    maxDrawdown:         safe(maxDD),
    maxDrawdownAbs:      safe(maxDDAbs),
    maxDrawdownDuration: maxDDDuration,
    sharpe,
    sortino,
    calmar,
    totalTrades:    closed.length,
    winningTrades:  wins.length,
    losingTrades:   losses.length,
    breakEvenTrades: even.length,
    winRate:        safe(winRate),
    profitFactor:   safe(profitFactor),
    avgTrade:       safe(avgTrade),
    avgWin:         safe(avgWin),
    avgLoss:        safe(avgLoss),
    bestTrade:      safe(bestTrade),
    worstTrade:     safe(worstTrade),
    avgTradeDuration: safe(avgDuration),
    maxConsecWins,
    maxConsecLosses,
    initialCapital,
    finalCapital:   safe(finalCapital, initialCapital),
    totalFees:      safe(totalFees),
    maxExposure:    safe(maxExposure),
  };
}
