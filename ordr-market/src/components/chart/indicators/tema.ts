import type { Bar, IndicatorPoint } from "./types";
import { emaFromValues } from "./ema";

/**
 * Triple Exponential Moving Average (TEMA)
 * TEMA = 3 * EMA1 - 3 * EMA2 + EMA3
 * where EMA1 = EMA(close), EMA2 = EMA(EMA1), EMA3 = EMA(EMA2)
 */
export function computeTEMA(
  bars: Bar[],
  period: number = 20,
): IndicatorPoint[] {
  const result: IndicatorPoint[] = [];
  const closes = bars.map((b) => b.c);

  const ema1 = emaFromValues(closes, period);
  if (ema1.length < period) return result;

  const ema2 = emaFromValues(ema1, period);
  if (ema2.length < period) return result;

  const ema3 = emaFromValues(ema2, period);
  if (ema3.length === 0) return result;

  // Alignment:
  // ema1[0] corresponds to bar index (period - 1)
  // ema2[0] corresponds to ema1 index (period - 1), which is bar index (2 * period - 2)
  // ema3[0] corresponds to ema2 index (period - 1), which is bar index (3 * period - 3)
  // ema3[i] -> bar index = (3 * period - 3) + i

  const ema3StartBar = 3 * (period - 1);

  for (let i = 0; i < ema3.length; i++) {
    const barIdx = ema3StartBar + i;
    if (barIdx >= bars.length) break;

    // ema2 index for this bar: barIdx - (2 * period - 2) = barIdx - 2*(period-1)
    const e2Idx = barIdx - 2 * (period - 1);
    // ema1 index for this bar: barIdx - (period - 1)
    const e1Idx = barIdx - (period - 1);

    if (e1Idx < 0 || e1Idx >= ema1.length) continue;
    if (e2Idx < 0 || e2Idx >= ema2.length) continue;

    const tema = 3 * ema1[e1Idx] - 3 * ema2[e2Idx] + ema3[i];
    result.push({ t: bars[barIdx].t, value: tema });
  }

  return result;
}
