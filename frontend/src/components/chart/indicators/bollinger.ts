import type { Bar, BandPoint } from "./types";

export function computeBollinger(
  bars: Bar[],
  period: number = 20,
  stdDev: number = 2,
): BandPoint[] {
  const result: BandPoint[] = [];
  if (bars.length < period) return result;

  for (let i = period - 1; i < bars.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += bars[j].c;
    const mean = sum / period;

    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) {
      variance += (bars[j].c - mean) ** 2;
    }
    const sd = Math.sqrt(variance / period);

    result.push({
      t: bars[i].t,
      upper: mean + stdDev * sd,
      middle: mean,
      lower: mean - stdDev * sd,
    });
  }
  return result;
}
