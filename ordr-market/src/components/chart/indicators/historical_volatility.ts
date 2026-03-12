import type { Bar, IndicatorPoint } from "./types";

export function computeHistoricalVolatility(bars: Bar[], period = 21): IndicatorPoint[] {
  const result: IndicatorPoint[] = [];
  if (bars.length < period + 1) return result;
  const logReturns = bars.slice(1).map((b, i) => Math.log(b.c / (bars[i].c || 1)));
  for (let i = period - 1; i < logReturns.length; i++) {
    const slice = logReturns.slice(i - period + 1, i + 1);
    const mean = slice.reduce((s, v) => s + v, 0) / period;
    const variance = slice.reduce((s, v) => s + (v - mean) ** 2, 0) / (period - 1);
    result.push({ t: bars[i + 1].t, value: Math.sqrt(variance) * Math.sqrt(252) * 100 });
  }
  return result;
}
