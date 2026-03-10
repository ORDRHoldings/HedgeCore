import type { Bar, IndicatorPoint } from "./types";

export function computeSMA(bars: Bar[], period: number): IndicatorPoint[] {
  const result: IndicatorPoint[] = [];
  if (bars.length < period) return result;

  let sum = 0;
  for (let i = 0; i < period; i++) sum += bars[i].c;
  result.push({ t: bars[period - 1].t, value: sum / period });

  for (let i = period; i < bars.length; i++) {
    sum += bars[i].c - bars[i - period].c;
    result.push({ t: bars[i].t, value: sum / period });
  }
  return result;
}
