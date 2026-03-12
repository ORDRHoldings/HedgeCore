import type { Bar, IndicatorPoint } from "./types";

function bbBands(bars: Bar[], period: number, i: number): { upper: number; lower: number; mid: number } {
  const slice = bars.slice(i - period + 1, i + 1).map(b => b.c);
  const mean = slice.reduce((s, v) => s + v, 0) / period;
  const variance = slice.reduce((s, v) => s + (v - mean) ** 2, 0) / period;
  const sd = Math.sqrt(variance) * 2;
  return { upper: mean + sd, lower: mean - sd, mid: mean };
}

export function computeBBTrend(bars: Bar[], fast = 20, slow = 50): IndicatorPoint[] {
  const result: IndicatorPoint[] = [];
  for (let i = slow - 1; i < bars.length; i++) {
    const f = bbBands(bars, fast, i), s = bbBands(bars, slow, i);
    result.push({ t: bars[i].t, value: f.mid > 0 ? ((f.upper - f.lower) - (s.upper - s.lower)) / f.mid : 0 });
  }
  return result;
}
