/**
 * ORDR Market — Strategy Runtime
 * Builds the StrategyAPI context object for each bar.
 * Handles indicator caching, crossover tracking, order queuing.
 */

import type { Bar, StrategyAPI } from './types';
import {
  computeSMA, computeEMA, computeWMA, computeRSI, computeATR,
  computeBollinger, computeMACD, computeStochastic,
} from '@/components/chart/indicators';
import type { IndicatorPoint } from '@/components/chart/indicators';

// ── Crossover tracker (order-stable) ─────────────────────────────────────────
class CrossoverTracker {
  private history = new Map<number, { a: number; b: number }>();
  private callCount = 0;

  resetBar(): void { this.callCount = 0; }

  crossover(a: number, b: number): boolean {
    const key = this.callCount++;
    const prev = this.history.get(key) ?? { a: NaN, b: NaN };
    this.history.set(key, { a, b });
    return !isNaN(prev.a) && prev.a <= prev.b && a > b;
  }

  crossunder(a: number, b: number): boolean {
    const key = this.callCount++;
    const prev = this.history.get(key) ?? { a: NaN, b: NaN };
    this.history.set(key, { a, b });
    return !isNaN(prev.a) && prev.a >= prev.b && a < b;
  }
}

// ── Series cache ──────────────────────────────────────────────────────────────
class SeriesCache {
  private cache = new Map<string, number[]>();

  get(key: string, bars: Bar[], compute: () => IndicatorPoint[] | number[]): number[] {
    if (this.cache.has(key)) return this.cache.get(key)!;

    const raw = compute();
    const aligned = new Array<number>(bars.length).fill(NaN);

    if (raw.length > 0 && typeof raw[0] === 'number') {
      // ATR returns raw number[] — align from the end
      const offset = bars.length - raw.length;
      (raw as number[]).forEach((v, i) => { aligned[offset + i] = v; });
    } else {
      // IndicatorPoint[] — align by timestamp
      (raw as IndicatorPoint[]).forEach(pt => {
        const idx = bars.findIndex(b => b.t === pt.t);
        if (idx >= 0) aligned[idx] = pt.value;
      });
    }

    this.cache.set(key, aligned);
    return aligned;
  }

  getBand(key: string, bars: Bar[], compute: () => { t: number; upper: number; middle: number; lower: number }[]): {
    upper: number[]; middle: number[]; lower: number[];
  } {
    const uk = key + '_u', mk = key + '_m', lk = key + '_l';
    if (this.cache.has(uk)) {
      return { upper: this.cache.get(uk)!, middle: this.cache.get(mk)!, lower: this.cache.get(lk)! };
    }
    const u = new Array<number>(bars.length).fill(NaN);
    const m = new Array<number>(bars.length).fill(NaN);
    const l = new Array<number>(bars.length).fill(NaN);
    compute().forEach(pt => {
      const i = bars.findIndex(b => b.t === pt.t);
      if (i >= 0) { u[i] = pt.upper; m[i] = pt.middle; l[i] = pt.lower; }
    });
    this.cache.set(uk, u); this.cache.set(mk, m); this.cache.set(lk, l);
    return { upper: u, middle: m, lower: l };
  }

  getMacd(key: string, bars: Bar[], compute: () => { t: number; macd: number; signal: number; histogram: number }[]): {
    macd: number[]; signal: number[]; hist: number[];
  } {
    const mk = key + '_m', sk = key + '_s', hk = key + '_h';
    if (this.cache.has(mk)) {
      return { macd: this.cache.get(mk)!, signal: this.cache.get(sk)!, hist: this.cache.get(hk)! };
    }
    const m = new Array<number>(bars.length).fill(NaN);
    const s = new Array<number>(bars.length).fill(NaN);
    const h = new Array<number>(bars.length).fill(NaN);
    compute().forEach(pt => {
      const i = bars.findIndex(b => b.t === pt.t);
      if (i >= 0) { m[i] = pt.macd; s[i] = pt.signal; h[i] = pt.histogram; }
    });
    this.cache.set(mk, m); this.cache.set(sk, s); this.cache.set(hk, h);
    return { macd: m, signal: s, hist: h };
  }

  getStoch(key: string, bars: Bar[], compute: () => { t: number; k: number; d: number }[]): {
    k: number[]; d: number[];
  } {
    const kk = key + '_k', dk = key + '_d';
    if (this.cache.has(kk)) {
      return { k: this.cache.get(kk)!, d: this.cache.get(dk)! };
    }
    const k = new Array<number>(bars.length).fill(NaN);
    const d = new Array<number>(bars.length).fill(NaN);
    compute().forEach(pt => {
      const i = bars.findIndex(b => b.t === pt.t);
      if (i >= 0) { k[i] = pt.k; d[i] = pt.d; }
    });
    this.cache.set(kk, k); this.cache.set(dk, d);
    return { k, d };
  }
}

// ── Order types ───────────────────────────────────────────────────────────────
export type OrderType = 'buy' | 'sell' | 'short' | 'cover' | 'close';
export interface PendingOrder { type: OrderType; comment: string }
export interface PlotCall { value: number; label: string; color: string }
export interface ParamCall { name: string; defaultValue: number }

// ── Runtime state per run ─────────────────────────────────────────────────────
export interface RuntimeState {
  position: 'long' | 'short' | null;
  entryPrice: number | null;
  entryBar: number | null;
  entryTime: number | null;
}

// ── Build context ─────────────────────────────────────────────────────────────
export function buildAPI(
  bars: Bar[],
  index: number,
  state: RuntimeState,
  crossTracker: CrossoverTracker,
  seriesCache: SeriesCache,
  pendingOrders: PendingOrder[],
  pendingPlots: Map<string, PlotCall[]>,
  userParams: Map<string, number>,
): StrategyAPI {
  const bar = bars[index];
  const slice = bars.slice(0, index + 1);
  const n = (arr: number[]) => arr[index] ?? NaN;

  return {
    close:  bar.c,
    open:   bar.o,
    high:   bar.h,
    low:    bar.l,
    volume: bar.v,
    index,
    time:   bar.t,

    closes:  slice.map(b => b.c),
    opens:   slice.map(b => b.o),
    highs:   slice.map(b => b.h),
    lows:    slice.map(b => b.l),
    volumes: slice.map(b => b.v),

    sma: (period: number) => n(seriesCache.get(`sma_${period}`, bars, () => computeSMA(bars, period))),
    ema: (period: number) => n(seriesCache.get(`ema_${period}`, bars, () => computeEMA(bars, period))),
    wma: (period: number) => n(seriesCache.get(`wma_${period}`, bars, () => computeWMA(bars, period))),
    rsi: (period = 14) => n(seriesCache.get(`rsi_${period}`, bars, () => computeRSI(bars, period))),
    atr: (period = 10) => n(seriesCache.get(`atr_${period}`, bars, () => computeATR(bars, period) as unknown as IndicatorPoint[])),

    macd: (fast = 12, slow = 26, signal = 9) => {
      const s = seriesCache.getMacd(`macd_${fast}_${slow}_${signal}`, bars, () => computeMACD(bars, fast, slow, signal));
      return { macd: s.macd[index] ?? NaN, signal: s.signal[index] ?? NaN, hist: s.hist[index] ?? NaN };
    },

    bb: (period = 20, mult = 2) => {
      const s = seriesCache.getBand(`bb_${period}_${mult}`, bars, () => computeBollinger(bars, period, mult));
      return { upper: s.upper[index] ?? NaN, middle: s.middle[index] ?? NaN, lower: s.lower[index] ?? NaN };
    },

    stoch: (kPeriod = 14, dPeriod = 3) => {
      const s = seriesCache.getStoch(`stoch_${kPeriod}_${dPeriod}`, bars, () => computeStochastic(bars, kPeriod, dPeriod));
      return { k: s.k[index] ?? NaN, d: s.d[index] ?? NaN };
    },

    highest: (period: number) => {
      const start = Math.max(0, index - period + 1);
      return Math.max(...bars.slice(start, index + 1).map(b => b.h));
    },

    lowest: (period: number) => {
      const start = Math.max(0, index - period + 1);
      return Math.min(...bars.slice(start, index + 1).map(b => b.l));
    },

    crossover:  (a, b) => crossTracker.crossover(a, b),
    crossunder: (a, b) => crossTracker.crossunder(a, b),

    position:     state.position,
    entryPrice:   state.entryPrice,
    barsInTrade:  state.entryBar !== null ? index - state.entryBar : 0,
    unrealizedPnl: (() => {
      if (!state.position || !state.entryPrice) return 0;
      const diff = state.position === 'long' ? bar.c - state.entryPrice : state.entryPrice - bar.c;
      return diff / state.entryPrice * 100;
    })(),

    buy:            (comment = '') => pendingOrders.push({ type: 'buy', comment }),
    sell:           (comment = '') => pendingOrders.push({ type: 'sell', comment }),
    short:          (comment = '') => pendingOrders.push({ type: 'short', comment }),
    cover:          (comment = '') => pendingOrders.push({ type: 'cover', comment }),
    close_position: (comment = '') => pendingOrders.push({ type: 'close', comment }),

    plot: (value: number, label = 'Series', color = '#2962FF') => {
      if (!pendingPlots.has(label)) pendingPlots.set(label, []);
      pendingPlots.get(label)!.push({ value, label, color });
    },

    param: (name: string, defaultValue: number) => {
      if (!userParams.has(name)) userParams.set(name, defaultValue);
      return userParams.get(name)!;
    },
  };
}

export { CrossoverTracker, SeriesCache };
