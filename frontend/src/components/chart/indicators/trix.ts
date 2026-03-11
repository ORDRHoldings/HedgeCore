import type { Bar, IndicatorPoint } from "./types";
import { emaFromValues } from "./ema";

export function computeTRIX(bars: Bar[], period = 18): IndicatorPoint[] {
  const ema1 = emaFromValues(bars.map(b => b.c), period);
  const ema2 = emaFromValues(ema1, period);
  const ema3 = emaFromValues(ema2, period);
  const result: IndicatorPoint[] = [];
  const offset = bars.length - ema3.length;
  for (let i = 1; i < ema3.length; i++) {
    const prev = ema3[i - 1];
    result.push({ t: bars[i + offset].t, value: prev > 0 ? (ema3[i] - prev) / prev * 100 : 0 });
  }
  return result;
}
