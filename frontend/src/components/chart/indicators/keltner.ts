import type { Bar, BandPoint } from "./types";
import { emaFromValues } from "./ema";
import { computeATR } from "./atr";

export function computeKeltner(
  bars: Bar[],
  emaPeriod: number = 20,
  atrPeriod: number = 10,
  multiplier: number = 1.5,
): BandPoint[] {
  const closes = bars.map(b => b.c);
  const emaValues = emaFromValues(closes, emaPeriod);
  const atrValues = computeATR(bars, atrPeriod);

  // Align: EMA starts at (emaPeriod-1), ATR starts at (atrPeriod-1)
  const emaStart = emaPeriod - 1;
  const atrStart = atrPeriod - 1;

  const result: BandPoint[] = [];
  for (let i = 0; i < emaValues.length; i++) {
    const barIdx = emaStart + i;
    if (barIdx < atrStart) continue;

    const atrIdx = barIdx - atrStart;
    if (atrIdx >= atrValues.length) break;

    const mid = emaValues[i];
    const atr = atrValues[atrIdx];

    result.push({
      t: bars[barIdx].t,
      upper: mid + multiplier * atr,
      middle: mid,
      lower: mid - multiplier * atr,
    });
  }
  return result;
}
