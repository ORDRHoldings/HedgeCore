import type { Bar, IndicatorPoint } from "./types";

/**
 * Commodity Channel Index
 * TP = (H + L + C) / 3
 * CCI = (TP - SMA(TP, period)) / (0.015 * Mean Absolute Deviation)
 */
export function computeCCI(
  bars: Bar[],
  period: number = 20,
): IndicatorPoint[] {
  const result: IndicatorPoint[] = [];
  if (bars.length < period) return result;

  const tp: number[] = bars.map((b) => (b.h + b.l + b.c) / 3);

  for (let i = period - 1; i < bars.length; i++) {
    // SMA of typical price
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sum += tp[j];
    }
    const sma = sum / period;

    // Mean Absolute Deviation
    let madSum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      madSum += Math.abs(tp[j] - sma);
    }
    const mad = madSum / period;

    const cci = mad === 0 ? 0 : (tp[i] - sma) / (0.015 * mad);
    result.push({ t: bars[i].t, value: cci });
  }

  return result;
}
