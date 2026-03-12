import type { Bar, StochasticPoint } from "./types";

/**
 * Stochastic Oscillator (%K / %D)
 * %K = (Close - Lowest Low) / (Highest High - Lowest Low) * 100
 * %D = SMA(%K, dPeriod)
 */
export function computeStochastic(
  bars: Bar[],
  kPeriod: number = 14,
  dPeriod: number = 3,
): StochasticPoint[] {
  if (bars.length < kPeriod) return [];

  // Compute raw %K values
  const rawK: number[] = [];
  for (let i = kPeriod - 1; i < bars.length; i++) {
    let lowestLow = Infinity;
    let highestHigh = -Infinity;
    for (let j = i - kPeriod + 1; j <= i; j++) {
      if (bars[j].l < lowestLow) lowestLow = bars[j].l;
      if (bars[j].h > highestHigh) highestHigh = bars[j].h;
    }
    const range = highestHigh - lowestLow;
    const k = range === 0 ? 50 : ((bars[i].c - lowestLow) / range) * 100;
    rawK.push(k);
  }

  // %D = SMA of %K over dPeriod
  const result: StochasticPoint[] = [];
  if (rawK.length < dPeriod) return result;

  let dSum = 0;
  for (let i = 0; i < dPeriod; i++) dSum += rawK[i];

  for (let i = dPeriod - 1; i < rawK.length; i++) {
    if (i >= dPeriod) {
      dSum += rawK[i] - rawK[i - dPeriod];
    }
    const barIndex = kPeriod - 1 + i;
    result.push({
      t: bars[barIndex].t,
      k: rawK[i],
      d: dSum / dPeriod,
    });
  }

  return result;
}
