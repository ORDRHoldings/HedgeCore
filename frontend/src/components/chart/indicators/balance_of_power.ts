import type { Bar, IndicatorPoint } from "./types";

export function computeBOP(bars: Bar[], period = 14): IndicatorPoint[] {
  const result: IndicatorPoint[] = [];
  const raw = bars.map(b => b.h !== b.l ? (b.c - b.o) / (b.h - b.l) : 0);
  for (let i = period - 1; i < raw.length; i++) {
    result.push({ t: bars[i].t, value: raw.slice(i - period + 1, i + 1).reduce((s, v) => s + v, 0) / period });
  }
  return result;
}
