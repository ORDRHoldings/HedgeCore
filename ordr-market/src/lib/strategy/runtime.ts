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

// ── Crossover tracker (key-stable) ──────────────────────────────────────────
// Uses explicit string keys when provided, falling back to call-order index.
// Explicit keys prevent drift when crossover calls are inside conditionals
// (e.g., `if (cond) api.crossover(a, b, 'rsi_cross')`) — the key stays
// stable regardless of whether the branch executes on every bar.
class CrossoverTracker {
  private history = new Map<string, { a: number; b: number }>();
  private callCount = 0;

  resetBar(): void { this.callCount = 0; }

  crossover(a: number, b: number, key?: string): boolean {
    const k = key ?? `_${this.callCount++}`;
    const prev = this.history.get(k) ?? { a: NaN, b: NaN };
    this.history.set(k, { a, b });
    return !isNaN(prev.a) && prev.a <= prev.b && a > b;
  }

  crossunder(a: number, b: number, key?: string): boolean {
    const k = key ?? `_${this.callCount++}`;
    const prev = this.history.get(k) ?? { a: NaN, b: NaN };
    this.history.set(k, { a, b });
    return !isNaN(prev.a) && prev.a >= prev.b && a < b;
  }
}

// ── Timestamp → index map (built once per run, O(1) lookups) ────────────────
function buildTimeIndex(bars: Bar[]): Map<number, number> {
  const map = new Map<number, number>();
  for (let i = 0; i < bars.length; i++) map.set(bars[i].t, i);
  return map;
}

// ── Series cache ──────────────────────────────────────────────────────────────
class SeriesCache {
  private cache = new Map<string, number[]>();
  private timeIndex: Map<number, number> | null = null;

  private getTimeIndex(bars: Bar[]): Map<number, number> {
    if (!this.timeIndex) this.timeIndex = buildTimeIndex(bars);
    return this.timeIndex;
  }

  get(key: string, bars: Bar[], compute: () => IndicatorPoint[] | number[]): number[] {
    if (this.cache.has(key)) return this.cache.get(key)!;

    const raw = compute();
    const aligned = new Array<number>(bars.length).fill(NaN);

    if (raw.length > 0 && typeof raw[0] === 'number') {
      // ATR returns raw number[] — align from the end
      const offset = bars.length - raw.length;
      (raw as number[]).forEach((v, i) => { aligned[offset + i] = v; });
    } else {
      // IndicatorPoint[] — align by timestamp via O(1) Map lookup
      const tIdx = this.getTimeIndex(bars);
      (raw as IndicatorPoint[]).forEach(pt => {
        const idx = tIdx.get(pt.t);
        if (idx !== undefined) aligned[idx] = pt.value;
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
    const tIdx = this.getTimeIndex(bars);
    compute().forEach(pt => {
      const i = tIdx.get(pt.t);
      if (i !== undefined) { u[i] = pt.upper; m[i] = pt.middle; l[i] = pt.lower; }
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
    const tIdx = this.getTimeIndex(bars);
    compute().forEach(pt => {
      const i = tIdx.get(pt.t);
      if (i !== undefined) { m[i] = pt.macd; s[i] = pt.signal; h[i] = pt.histogram; }
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
    const tIdx = this.getTimeIndex(bars);
    compute().forEach(pt => {
      const i = tIdx.get(pt.t);
      if (i !== undefined) { k[i] = pt.k; d[i] = pt.d; }
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

// ── Pre-built OHLCV arrays (built once, sliced lazily) ────────────────────────
interface OHLCVArrays {
  closes: number[];
  opens: number[];
  highs: number[];
  lows: number[];
  volumes: number[];
}

function buildOHLCVArrays(bars: Bar[]): OHLCVArrays {
  const len = bars.length;
  const closes  = new Array<number>(len);
  const opens   = new Array<number>(len);
  const highs   = new Array<number>(len);
  const lows    = new Array<number>(len);
  const volumes = new Array<number>(len);
  for (let i = 0; i < len; i++) {
    closes[i]  = bars[i].c;
    opens[i]   = bars[i].o;
    highs[i]   = bars[i].h;
    lows[i]    = bars[i].l;
    volumes[i] = bars[i].v;
  }
  return { closes, opens, highs, lows, volumes };
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
  ohlcv?: OHLCVArrays,
): StrategyAPI {
  const bar = bars[index];
  const n = (arr: number[]) => arr[index] ?? NaN;

  // Use pre-built OHLCV arrays with slice instead of rebuilding per bar
  const src = ohlcv ?? buildOHLCVArrays(bars);
  const end = index + 1;

  return {
    close:  bar.c,
    open:   bar.o,
    high:   bar.h,
    low:    bar.l,
    volume: bar.v,
    index,
    time:   bar.t,

    closes:  src.closes.slice(0, end),
    opens:   src.opens.slice(0, end),
    highs:   src.highs.slice(0, end),
    lows:    src.lows.slice(0, end),
    volumes: src.volumes.slice(0, end),

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
      let max = -Infinity;
      for (let i = start; i <= index; i++) if (bars[i].h > max) max = bars[i].h;
      return max;
    },

    lowest: (period: number) => {
      const start = Math.max(0, index - period + 1);
      let min = Infinity;
      for (let i = start; i <= index; i++) if (bars[i].l < min) min = bars[i].l;
      return min;
    },

    crossover:  (a, b, key?) => crossTracker.crossover(a, b, key),
    crossunder: (a, b, key?) => crossTracker.crossunder(a, b, key),

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

export { CrossoverTracker, SeriesCache, buildOHLCVArrays };
export type { OHLCVArrays };
