import type { Bar, IndicatorPoint } from "./types";

export function computeDPO(bars: Bar[], period = 21): IndicatorPoint[] {
  const result: IndicatorPoint[] = [];
  const shift = Math.floor(period / 2) + 1;
  for (let i = period + shift - 1; i < bars.length; i++) {
    const smaIdx = i - shift;
    const sma = bars.slice(smaIdx - period + 1, smaIdx + 1).reduce((s, b) => s + b.c, 0) / period;
    result.push({ t: bars[i].t, value: bars[i].c - sma });
  }
  return result;
}
