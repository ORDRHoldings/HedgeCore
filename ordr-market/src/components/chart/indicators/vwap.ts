import type { Bar, IndicatorPoint } from "./types";

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

/** Extract YYYY-MM-DD string from unix timestamp (seconds or ms) */
function getDateKey(t: number): string {
  // Handle both seconds and milliseconds timestamps
  const ms = t > 1e12 ? t : t * 1000;
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
}
