import type { Bar, IndicatorPoint } from "./types";

export function computeMcGinley(bars: Bar[], period = 14): IndicatorPoint[] {
  const result: IndicatorPoint[] = [];
  if (bars.length < period) return result;
  let md = bars.slice(0, period).reduce((s, b) => s + b.c, 0) / period;
  for (let i = period; i < bars.length; i++) {
    const c = bars[i].c;
    const ratio = c / (md || 1);
    md = md + (c - md) / (period * Math.pow(ratio, 4) || 1);
    result.push({ t: bars[i].t, value: md });
  }
  return result;
}
