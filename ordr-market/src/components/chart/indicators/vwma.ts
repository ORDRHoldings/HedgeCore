import type { Bar, IndicatorPoint } from "./types";

export function computeVWMA(bars: Bar[], period = 20): IndicatorPoint[] {
  const result: IndicatorPoint[] = [];
  for (let i = period - 1; i < bars.length; i++) {
    let sumCV = 0, sumV = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sumCV += bars[j].c * bars[j].v;
      sumV += bars[j].v;
    }
    result.push({ t: bars[i].t, value: sumV > 0 ? sumCV / sumV : bars[i].c });
  }
  return result;
}
