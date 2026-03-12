import type { Bar, IndicatorPoint } from "./types";

export function computeChoppiness(bars: Bar[], period = 14): IndicatorPoint[] {
  const result: IndicatorPoint[] = [];
  for (let i = period; i < bars.length; i++) {
    let atrSum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      atrSum += Math.max(bars[j].h - bars[j].l, Math.abs(bars[j].h - bars[j - 1].c), Math.abs(bars[j].l - bars[j - 1].c));
    }
    const highest = Math.max(...bars.slice(i - period + 1, i + 1).map(b => b.h));
    const lowest  = Math.min(...bars.slice(i - period + 1, i + 1).map(b => b.l));
    const range = highest - lowest;
    const chop = range > 0 ? 100 * Math.log10(atrSum / range) / Math.log10(period) : 50;
    result.push({ t: bars[i].t, value: Math.max(0, Math.min(100, chop)) });
  }
  return result;
}
