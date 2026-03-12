import type { Bar } from "./types";

export interface ChandelierPoint {
  t: number;
  longStop: number;
  shortStop: number;
}

export function computeChandelierExit(bars: Bar[], period = 22, multiplier = 3): ChandelierPoint[] {
  const result: ChandelierPoint[] = [];
  if (bars.length < period + 1) return result;

  for (let i = period; i < bars.length; i++) {
    let atrSum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      atrSum += Math.max(
        bars[j].h - bars[j].l,
        Math.abs(bars[j].h - bars[j - 1].c),
        Math.abs(bars[j].l - bars[j - 1].c),
      );
    }
    const atr = atrSum / period;
    const highest = Math.max(...bars.slice(i - period + 1, i + 1).map((b) => b.h));
    const lowest = Math.min(...bars.slice(i - period + 1, i + 1).map((b) => b.l));
    result.push({
      t: bars[i].t,
      longStop: highest - multiplier * atr,
      shortStop: lowest + multiplier * atr,
    });
  }

  return result;
}
