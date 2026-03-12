import type { Bar, BandPoint } from "./types";

/**
 * Donchian Channel
 * Upper = Highest High over period
 * Lower = Lowest Low over period
 * Middle = (Upper + Lower) / 2
 */
export function computeDonchian(
  bars: Bar[],
  period: number = 20,
): BandPoint[] {
  const result: BandPoint[] = [];
  if (bars.length < period) return result;

  for (let i = period - 1; i < bars.length; i++) {
    let highestHigh = -Infinity;
    let lowestLow = Infinity;

    for (let j = i - period + 1; j <= i; j++) {
      if (bars[j].h > highestHigh) highestHigh = bars[j].h;
      if (bars[j].l < lowestLow) lowestLow = bars[j].l;
    }

    result.push({
      t: bars[i].t,
      upper: highestHigh,
      lower: lowestLow,
      middle: (highestHigh + lowestLow) / 2,
    });
  }

  return result;
}
