import type { Bar, IndicatorPoint } from "./types";
import { emaFromValues } from "./ema";

export function computeDEMA(bars: Bar[], period = 20): IndicatorPoint[] {
  const result: IndicatorPoint[] = [];
  if (bars.length < period * 2) return result;
  const k = 2 / (period + 1);
  let ema1 = bars.slice(0, period).reduce((s, b) => s + b.c, 0) / period;
  const ema1s: number[] = [ema1];
  for (let i = period; i < bars.length; i++) {
    ema1 = bars[i].c * k + ema1 * (1 - k);
    ema1s.push(ema1);
  }
  // EMA of EMA1
  const ema2s = emaFromValues(ema1s, period);
  const offset = ema1s.length - ema2s.length;
  for (let i = 0; i < ema2s.length; i++) {
    const idx = i + offset + (period - 1);
    if (idx >= bars.length) break;
    result.push({ t: bars[idx].t, value: 2 * ema1s[i + offset] - ema2s[i] });
  }
  return result;
}
