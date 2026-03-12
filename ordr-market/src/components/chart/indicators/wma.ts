import type { Bar, IndicatorPoint } from "./types";

export function computeWMA(bars: Bar[], period = 20): IndicatorPoint[] {
  const result: IndicatorPoint[] = [];
  const denom = (period * (period + 1)) / 2;
  for (let i = period - 1; i < bars.length; i++) {
    let weighted = 0;
    for (let j = 0; j < period; j++) {
      weighted += bars[i - period + 1 + j].c * (j + 1);
    }
    result.push({ t: bars[i].t, value: weighted / denom });
  }
  return result;
}
