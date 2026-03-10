import type { Bar, IndicatorPoint } from "./types";

export function computeEMA(bars: Bar[], period: number): IndicatorPoint[] {
  const result: IndicatorPoint[] = [];
  if (bars.length < period) return result;

  const k = 2 / (period + 1);

  // Seed with SMA
  let sum = 0;
  for (let i = 0; i < period; i++) sum += bars[i].c;
  let ema = sum / period;
  result.push({ t: bars[period - 1].t, value: ema });

  for (let i = period; i < bars.length; i++) {
    ema = bars[i].c * k + ema * (1 - k);
    result.push({ t: bars[i].t, value: ema });
  }
  return result;
}

/** EMA from raw values (used by MACD, Keltner) */
export function emaFromValues(values: number[], period: number): number[] {
  if (values.length < period) return [];
  const k = 2 / (period + 1);
  const result: number[] = [];

  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  let ema = sum / period;
  result.push(ema);

  for (let i = period; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
    result.push(ema);
  }
  return result;
}
