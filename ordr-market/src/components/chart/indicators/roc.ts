import type { Bar, IndicatorPoint } from "./types";

export function computeROC(bars: Bar[], period = 9): IndicatorPoint[] {
  const result: IndicatorPoint[] = [];
  for (let i = period; i < bars.length; i++) {
    const prev = bars[i - period].c;
    result.push({ t: bars[i].t, value: prev > 0 ? (bars[i].c - prev) / prev * 100 : 0 });
  }
  return result;
}
