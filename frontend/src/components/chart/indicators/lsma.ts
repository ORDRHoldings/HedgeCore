import type { Bar, IndicatorPoint } from "./types";

export function computeLSMA(bars: Bar[], period = 25): IndicatorPoint[] {
  const result: IndicatorPoint[] = [];
  for (let i = period - 1; i < bars.length; i++) {
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    for (let j = 0; j < period; j++) {
      sumX += j;
      sumY += bars[i - period + 1 + j].c;
      sumXY += j * bars[i - period + 1 + j].c;
      sumXX += j * j;
    }
    const slope = (period * sumXY - sumX * sumY) / (period * sumXX - sumX * sumX || 1);
    const intercept = (sumY - slope * sumX) / period;
    result.push({ t: bars[i].t, value: intercept + slope * (period - 1) });
  }
  return result;
}
