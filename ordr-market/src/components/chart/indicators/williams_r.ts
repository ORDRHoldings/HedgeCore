import type { Bar, IndicatorPoint } from "./types";

/**
 * Williams %R
 * %R = (Highest High - Close) / (Highest High - Lowest Low) * -100
 * Range: -100 to 0
 */
export function computeWilliamsR(
  bars: Bar[],
  period: number = 14,
): IndicatorPoint[] {
  const result: IndicatorPoint[] = [];
  if (bars.length < period) return result;

  for (let i = period - 1; i < bars.length; i++) {
    let highestHigh = -Infinity;
    let lowestLow = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      if (bars[j].h > highestHigh) highestHigh = bars[j].h;
      if (bars[j].l < lowestLow) lowestLow = bars[j].l;
    }
    const range = highestHigh - lowestLow;
    const wr = range === 0 ? -50 : ((highestHigh - bars[i].c) / range) * -100;
    result.push({ t: bars[i].t, value: wr });
  }

  return result;
}
