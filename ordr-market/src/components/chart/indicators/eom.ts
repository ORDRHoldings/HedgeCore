import type { Bar, IndicatorPoint } from "./types";

export function computeEOM(bars: Bar[], period = 14): IndicatorPoint[] {
  const result: IndicatorPoint[] = [];
  const raw: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const midMove = (bars[i].h + bars[i].l) / 2 - (bars[i - 1].h + bars[i - 1].l) / 2;
    const boxRatio = bars[i].h !== bars[i].l && bars[i].v > 0 ? (bars[i].v / 1e6) / (bars[i].h - bars[i].l) : 0;
    raw.push(boxRatio !== 0 ? midMove / boxRatio : 0);
  }
  for (let i = period - 1; i < raw.length; i++) {
    const sma = raw.slice(i - period + 1, i + 1).reduce((s, v) => s + v, 0) / period;
    result.push({ t: bars[i + 1].t, value: sma });
  }
  return result;
}
