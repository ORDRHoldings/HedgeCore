/**
 * ORDR Market — Backtest Engine
 * Executes user strategy code bar-by-bar and records trades + equity curve.
 */

import type { Bar, BacktestConfig, BacktestResult, Trade, EquityPoint, PlotSeries } from './types';
import { EMPTY_METRICS } from './types';
import { calculateMetrics } from './metrics';
import { buildAPI, CrossoverTracker, SeriesCache, buildOHLCVArrays } from './runtime';
import type { RuntimeState, PendingOrder } from './runtime';
import { transpile } from './transpile';
import { sanitizeCode } from './sanitize';

// ── ID generator ──────────────────────────────────────────────────────────────
let tradeCounter = 0;
function nextId() { return `t_${++tradeCounter}_${Date.now().toString(36)}`; }

// ── Build user function from code ─────────────────────────────────────────────
function buildStrategyFn(jsCode: string): (api: unknown) => void {
  // Wrap in IIFE to support both function declarations and top-level code
  const wrapped = `
    "use strict";
    ${jsCode}
    if (typeof onBar === 'function') { __callOnBar = onBar; }
    else if (typeof on_bar === 'function') { __callOnBar = on_bar; }
  `;
  try {
    // eslint-disable-next-line no-new-func
    const factory = new Function(`
      let __callOnBar;
      ${wrapped}
      return __callOnBar;
    `);
    const fn = factory();
    if (typeof fn === 'function') return fn;
    throw new Error('Strategy must define a function named "onBar" (JS/Pine) or "on_bar" (Python).');
  } catch (e) {
    throw new Error(`Strategy parse error: ${String(e)}`);
  }
}

// ── Process a pending order ───────────────────────────────────────────────────
function processOrder(
  order: PendingOrder,
  bar: Bar,
  barIndex: number,
  state: RuntimeState,
  trades: Trade[],
  capital: { value: number },
  config: BacktestConfig,
): void {
  const feeRate = (config.commission + config.slippage) / 100;
  const fillPrice = bar.o; // fill at next bar open (standard backtest assumption)

  const openLong  = state.position === 'long';
  const openShort = state.position === 'short';
  const isFlat    = state.position === null;

  const closePos = (exitComment: string) => {
    if (state.position === null || state.entryPrice === null) return;
    const last = trades[trades.length - 1];
    if (!last || last.exitBar !== null) return;
    const rawPnl = state.position === 'long'
      ? (fillPrice - state.entryPrice) * last.size
      : (state.entryPrice - fillPrice) * last.size;
    const exitFee = fillPrice * last.size * feeRate;
    last.exitBar     = barIndex;
    last.exitTime    = bar.t;
    last.exitPrice   = fillPrice;
    last.fees       += exitFee;
    last.pnl         = rawPnl - last.fees;
    last.pnlPct      = (last.pnl / (state.entryPrice * last.size)) * 100;
    last.exitComment = exitComment;
    capital.value   += last.pnl;
    state.position   = null;
    state.entryPrice = null;
    state.entryBar   = null;
    state.entryTime  = null;
  };

  const openPos = (direction: 'long' | 'short', comment: string) => {
    const posCapital = capital.value * (config.positionSize / 100);
    const size       = posCapital / fillPrice;
    const entryFee   = fillPrice * size * feeRate;
    const trade: Trade = {
      id: nextId(), direction, entryBar: barIndex, exitBar: null,
      entryTime: bar.t, exitTime: null, entryPrice: fillPrice, exitPrice: null,
      size, pnl: null, pnlPct: null, fees: entryFee, comment, exitComment: '',
    };
    trades.push(trade);
    state.position  = direction;
    state.entryPrice = fillPrice;
    state.entryBar   = barIndex;
    state.entryTime  = bar.t;
  };

  switch (order.type) {
    case 'buy':
      if (openShort) closePos(order.comment || 'Cover');
      if (isFlat || openShort) openPos('long', order.comment || 'Buy');
      break;
    case 'sell':
      if (openLong) closePos(order.comment || 'Sell');
      break;
    case 'short':
      if (openLong) closePos(order.comment || 'Exit Long');
      if (isFlat || openLong) openPos('short', order.comment || 'Short');
      break;
    case 'cover':
      if (openShort) closePos(order.comment || 'Cover');
      break;
    case 'close':
      if (!isFlat) closePos(order.comment || 'Close');
      break;
  }
}

// ── Equity at current bar ─────────────────────────────────────────────────────
function calcEquity(
  capital: { value: number },
  state: RuntimeState,
  bar: Bar,
  trades: Trade[],
): number {
  if (!state.position || !state.entryPrice) return capital.value;
  const last = trades[trades.length - 1];
  if (!last) return capital.value;
  const unrealizedRaw = state.position === 'long'
    ? (bar.c - state.entryPrice) * last.size
    : (state.entryPrice - bar.c) * last.size;
  return capital.value + unrealizedRaw;
}

// ── Main backtest function ────────────────────────────────────────────────────
export function runBacktest(
  bars: Bar[],
  code: string,
  language: 'javascript' | 'pinescript' | 'python',
  config: BacktestConfig,
  userParams: Map<string, number> = new Map(),
): BacktestResult {
  const t0 = performance.now();

  // 0. Sanitize raw code before any processing
  const sanity = sanitizeCode(code);
  if (!sanity.ok) {
    return makeErrorResult(sanity.error!, config);
  }

  // 1. Transpile non-JS code
  let jsCode: string;
  try {
    jsCode = transpile(code, language);
  } catch (e) {
    return makeErrorResult(String(e), config);
  }

  // 1b. Sanitize transpiled output (catches patterns introduced by transpiler)
  const postSanity = sanitizeCode(jsCode);
  if (!postSanity.ok) {
    return makeErrorResult(`Transpiled code failed validation: ${postSanity.error}`, config);
  }

  // 2. Compile strategy function
  let stratFn: (api: unknown) => void;
  try {
    stratFn = buildStrategyFn(jsCode);
  } catch (e) {
    return makeErrorResult(String(e), config);
  }

  // 3. Initialize state
  const state: RuntimeState = { position: null, entryPrice: null, entryBar: null, entryTime: null };
  const capital = { value: config.initialCapital };
  const trades: Trade[] = [];
  const equity: EquityPoint[] = [];
  const plotsMap = new Map<string, PlotSeries>();
  const crossTracker = new CrossoverTracker();
  const seriesCache  = new SeriesCache();
  const ohlcv        = buildOHLCVArrays(bars);

  // 4. Bar loop
  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    const pendingOrders: PendingOrder[] = [];
    const pendingPlots  = new Map<string, { value: number; label: string; color: string }[]>();

    crossTracker.resetBar();

    const api = buildAPI(bars, i, state, crossTracker, seriesCache, pendingOrders, pendingPlots, userParams, ohlcv);

    try {
      stratFn(api);
    } catch (e) {
      console.warn(`Strategy error at bar ${i}:`, e);
    }

    // Process orders
    for (const order of pendingOrders) {
      processOrder(order, bar, i, state, trades, capital, config);
    }

    // Collect plots
    pendingPlots.forEach((calls, label) => {
      if (!plotsMap.has(label)) {
        plotsMap.set(label, { label, color: calls[0]?.color ?? '#2962FF', points: [] });
      }
      const series = plotsMap.get(label)!;
      calls.forEach(c => series.points.push({ t: bar.t, value: c.value }));
      if (calls[0]?.color) series.color = calls[0].color;
    });

    // Record equity
    equity.push({ t: bar.t, value: calcEquity(capital, state, bar, trades) });
  }

  // 5. Close any open position at last bar
  if (state.position !== null && trades.length > 0) {
    const lastBar = bars[bars.length - 1];
    const last = trades[trades.length - 1];
    if (last.exitBar === null) {
      const fee = lastBar.c * last.size * ((config.commission + config.slippage) / 100);
      const rawPnl = state.position === 'long'
        ? (lastBar.c - last.entryPrice) * last.size
        : (last.entryPrice - lastBar.c) * last.size;
      last.exitBar = bars.length - 1;
      last.exitTime = lastBar.t;
      last.exitPrice = lastBar.c;
      last.fees += fee;
      last.pnl = rawPnl - last.fees;
      last.pnlPct = (last.pnl / (last.entryPrice * last.size)) * 100;
      last.exitComment = 'End of data';
      capital.value += last.pnl;
    }
  }

  // 6. Metrics
  const metrics = calculateMetrics(trades, equity, config);

  return {
    trades,
    equity,
    metrics,
    plots: Array.from(plotsMap.values()),
    error: null,
    barCount: bars.length,
    execTimeMs: Math.round(performance.now() - t0),
  };
}

function makeErrorResult(error: string, config: BacktestConfig): BacktestResult {
  return {
    trades: [], equity: [],
    metrics: { ...EMPTY_METRICS, initialCapital: config.initialCapital, finalCapital: config.initialCapital },
    plots: [], error, barCount: 0, execTimeMs: 0,
  };
}
