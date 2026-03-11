import type { Bar, IndicatorPoint } from "./types";

export function computeMomentum(bars: Bar[], period = 10): IndicatorPoint[] {
  const result: IndicatorPoint[] = [];
  for (let i = period; i < bars.length; i++) {
    result.push({ t: bars[i].t, value: bars[i].c - bars[i - period].c });
  }
  return result;
}
