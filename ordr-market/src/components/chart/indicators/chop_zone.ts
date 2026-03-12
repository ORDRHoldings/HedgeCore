import type { Bar, IndicatorPoint } from "./types";

export function computeChopZone(bars: Bar[], period = 30): IndicatorPoint[] {
  const result: IndicatorPoint[] = [];
  for (let i = period; i < bars.length; i++) {
    let atrSum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      atrSum += Math.max(
        bars[j].h - bars[j].l,
        j > 0 ? Math.abs(bars[j].h - bars[j - 1].c) : 0,
        j > 0 ? Math.abs(bars[j].l - bars[j - 1].c) : 0
      );
    }
    const atr = atrSum / period;
    const ema = bars.slice(i - period + 1, i + 1).reduce((s, b) => s + b.c, 0) / period;
    const angle = ema > 0 ? Math.atan(atr / ema * 100) * (180 / Math.PI) : 45;
    // Map angle 0-90 to -1 to +1: below 45 = choppy, above 45 = trending
    result.push({ t: bars[i].t, value: (angle - 45) / 45 });
  }
  return result;
}
