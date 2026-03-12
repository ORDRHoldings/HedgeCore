import type { Bar, IndicatorPoint } from "./types";

export function computeBBWidth(bars: Bar[], period = 20, stdDev = 2): IndicatorPoint[] {
  const result: IndicatorPoint[] = [];
  for (let i = period - 1; i < bars.length; i++) {
    const slice = bars.slice(i - period + 1, i + 1).map((b) => b.c);
    const mean = slice.reduce((s, v) => s + v, 0) / period;
    const variance = slice.reduce((s, v) => s + (v - mean) ** 2, 0) / period;
    const sd = Math.sqrt(variance);
    const upper = mean + stdDev * sd;
    const lower = mean - stdDev * sd;
    result.push({ t: bars[i].t, value: mean > 0 ? (upper - lower) / mean : 0 });
  }
  return result;
}
