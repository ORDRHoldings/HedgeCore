import type { Bar, IndicatorPoint, BandPoint } from "./types";

/**
 * Volume-Weighted Average Price (VWAP)
 * Cumulative (TP * Volume) / Cumulative Volume
 * Resets at the start of each day (detected by date change in timestamps).
 */
export function computeVWAP(bars: Bar[]): IndicatorPoint[] {
  const result: IndicatorPoint[] = [];
  if (bars.length === 0) return result;

  let cumTPV = 0;
  let cumVol = 0;
  let prevDate = getDateKey(bars[0].t);

  for (let i = 0; i < bars.length; i++) {
    const dateKey = getDateKey(bars[i].t);

    // Reset on new day
    if (dateKey !== prevDate) {
      cumTPV = 0;
      cumVol = 0;
      prevDate = dateKey;
    }

    const tp = (bars[i].h + bars[i].l + bars[i].c) / 3;
    cumTPV += tp * bars[i].v;
    cumVol += bars[i].v;

    result.push({
      t: bars[i].t,
      value: cumVol === 0 ? tp : cumTPV / cumVol,
    });
  }

  return result;
}

/**
 * VWAP Standard Deviation Bands
 * Upper/lower = VWAP ± mult × cumulative daily SD
 * Same daily-reset logic as computeVWAP.
 */
export function computeVWAPBands(bars: Bar[], mult: number = 1): BandPoint[] {
  const result: BandPoint[] = [];
  if (bars.length === 0) return result;

  let cumTPV = 0;
  let cumVol = 0;
  let cumTPVSq = 0;
  let prevDate = getDateKey(bars[0].t);

  for (let i = 0; i < bars.length; i++) {
    const dateKey = getDateKey(bars[i].t);
    if (dateKey !== prevDate) {
      cumTPV = 0;
      cumVol = 0;
      cumTPVSq = 0;
      prevDate = dateKey;
    }

    const tp = (bars[i].h + bars[i].l + bars[i].c) / 3;
    const v = bars[i].v;
    cumTPV += tp * v;
    cumVol += v;
    cumTPVSq += tp * tp * v;

    const vwap = cumVol === 0 ? tp : cumTPV / cumVol;
    const variance = cumVol === 0 ? 0 : (cumTPVSq / cumVol) - vwap * vwap;
    const sd = Math.sqrt(Math.max(0, variance));

    result.push({
      t: bars[i].t,
      upper: vwap + mult * sd,
      lower: vwap - mult * sd,
      middle: vwap,
    });
  }

  return result;
}

/**
 * Anchored VWAP — cumulative VWAP from a user-selected bar index onward.
 * No daily reset; anchor is fixed at the given bar.
 */
export function computeAnchoredVWAP(bars: Bar[], anchorIndex: number): IndicatorPoint[] {
  const result: IndicatorPoint[] = [];
  const start = Math.max(0, Math.min(anchorIndex, bars.length - 1));
  let cumTPV = 0;
  let cumVol = 0;
  for (let i = start; i < bars.length; i++) {
    const tp = (bars[i].h + bars[i].l + bars[i].c) / 3;
    cumTPV += tp * bars[i].v;
    cumVol += bars[i].v;
    result.push({ t: bars[i].t, value: cumVol === 0 ? tp : cumTPV / cumVol });
  }
  return result;
}

/** Extract YYYY-MM-DD string from unix timestamp (seconds or ms) */
function getDateKey(t: number): string {
  // Handle both seconds and milliseconds timestamps
  const ms = t > 1e12 ? t : t * 1000;
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
}
