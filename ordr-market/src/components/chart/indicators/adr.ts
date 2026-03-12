import type { Bar, IndicatorPoint } from "./types";

export function computeADR(bars: Bar[], period = 14): IndicatorPoint[] {
  const result: IndicatorPoint[] = [];
  for (let i = period - 1; i < bars.length; i++) {
    const avg =
      bars.slice(i - period + 1, i + 1).reduce((s, b) => s + (b.h - b.l), 0) / period;
    result.push({ t: bars[i].t, value: avg });
  }
  return result;
}
