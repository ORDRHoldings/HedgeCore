import type { Bar, IndicatorPoint } from "./types";

export function computeCMO(bars: Bar[], period = 14): IndicatorPoint[] {
  const result: IndicatorPoint[] = [];
  for (let i = period; i < bars.length; i++) {
    let sumUp = 0, sumDown = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const diff = bars[j].c - bars[j - 1].c;
      if (diff > 0) sumUp += diff; else sumDown += Math.abs(diff);
    }
    const denom = sumUp + sumDown;
    result.push({ t: bars[i].t, value: denom > 0 ? 100 * (sumUp - sumDown) / denom : 0 });
  }
  return result;
}
