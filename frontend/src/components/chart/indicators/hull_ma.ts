import type { Bar, IndicatorPoint } from "./types";

/**
 * Hull Moving Average (HMA)
 * HMA = WMA(2 * WMA(n/2) - WMA(n), sqrt(n))
 *
 * Provides a fast, smooth moving average with reduced lag.
 */
export function computeHMA(
  bars: Bar[],
  period: number = 9,
): IndicatorPoint[] {
  const result: IndicatorPoint[] = [];
  if (bars.length < period) return result;

  const closes = bars.map((b) => b.c);
  const halfPeriod = Math.max(1, Math.floor(period / 2));
  const sqrtPeriod = Math.max(1, Math.round(Math.sqrt(period)));

  // WMA(n/2) of close
  const wmaHalf = wmaFromValues(closes, halfPeriod);
  // WMA(n) of close
  const wmaFull = wmaFromValues(closes, period);

  // Align: wmaHalf starts at index halfPeriod-1, wmaFull starts at index period-1
  // Difference series: 2*WMA(n/2) - WMA(n)
  // wmaFull[0] corresponds to bar index period-1
  // wmaHalf at same bar index: wmaHalf[period-1 - (halfPeriod-1)] = wmaHalf[period - halfPeriod]
  const diff: number[] = [];
  const diffStartBarIdx = period - 1;

  for (let i = 0; i < wmaFull.length; i++) {
    const barIdx = diffStartBarIdx + i;
    const halfIdx = barIdx - (halfPeriod - 1); // index into wmaHalf
    if (halfIdx < 0 || halfIdx >= wmaHalf.length) continue;
    diff.push(2 * wmaHalf[halfIdx] - wmaFull[i]);
  }

  // WMA(sqrt(n)) of diff series
  const hmaValues = wmaFromValues(diff, sqrtPeriod);

  // Map back to timestamps
  const hmaStartBarIdx = diffStartBarIdx + sqrtPeriod - 1;
  for (let i = 0; i < hmaValues.length; i++) {
    const barIdx = hmaStartBarIdx + i;
    if (barIdx < bars.length) {
      result.push({ t: bars[barIdx].t, value: hmaValues[i] });
    }
  }

  return result;
}

/**
 * Weighted Moving Average from raw values.
 * WMA = sum(value[i] * weight[i]) / sum(weights)
 * where weight[i] = i+1 (most recent has highest weight).
 */
function wmaFromValues(values: number[], period: number): number[] {
  if (values.length < period || period < 1) return [];

  const result: number[] = [];
  const weightSum = (period * (period + 1)) / 2;

  for (let i = period - 1; i < values.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += values[i - period + 1 + j] * (j + 1);
    }
    result.push(sum / weightSum);
  }

  return result;
}
