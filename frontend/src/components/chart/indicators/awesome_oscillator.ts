import type { Bar, IndicatorPoint } from "./types";

export function computeAO(bars: Bar[]): IndicatorPoint[] {
  const result: IndicatorPoint[] = [];
  if (bars.length < 34) return result;
  const median = bars.map(b => (b.h + b.l) / 2);
  function sma(vals: number[], n: number, i: number): number {
    return vals.slice(i - n + 1, i + 1).reduce((s, v) => s + v, 0) / n;
  }
  for (let i = 33; i < bars.length; i++) {
    result.push({ t: bars[i].t, value: sma(median, 5, i) - sma(median, 34, i) });
  }
  return result;
}
