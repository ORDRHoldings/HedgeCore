import type { Bar, IndicatorPoint } from "./types";

export function computeSMMA(bars: Bar[], period = 14): IndicatorPoint[] {
  const result: IndicatorPoint[] = [];
  if (bars.length < period) return result;
  let smma = bars.slice(0, period).reduce((s, b) => s + b.c, 0) / period;
  result.push({ t: bars[period - 1].t, value: smma });
  for (let i = period; i < bars.length; i++) {
    smma = (smma * (period - 1) + bars[i].c) / period;
    result.push({ t: bars[i].t, value: smma });
  }
  return result;
}
