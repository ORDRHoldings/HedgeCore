import type { Bar, IndicatorPoint } from "./types";

export function computeCorrelation(bars: Bar[], period = 20): IndicatorPoint[] {
  const result: IndicatorPoint[] = [];
  if (bars.length < period * 2) return result;
  for (let i = period * 2 - 1; i < bars.length; i++) {
    const x = bars.slice(i - period * 2 + 1, i - period + 1).map((b) => b.c);
    const y = bars.slice(i - period + 1, i + 1).map((b) => b.c);
    const mx = x.reduce((s, v) => s + v, 0) / period;
    const my = y.reduce((s, v) => s + v, 0) / period;
    let num = 0, dx2 = 0, dy2 = 0;
    for (let j = 0; j < period; j++) {
      num += (x[j] - mx) * (y[j] - my);
      dx2 += (x[j] - mx) ** 2;
      dy2 += (y[j] - my) ** 2;
    }
    const corr = dx2 * dy2 > 0 ? num / Math.sqrt(dx2 * dy2) : 0;
    result.push({ t: bars[i].t, value: Math.max(-1, Math.min(1, corr)) });
  }
  return result;
}
