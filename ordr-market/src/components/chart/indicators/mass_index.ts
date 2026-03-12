import type { Bar, IndicatorPoint } from "./types";
import { emaFromValues } from "./ema";

export function computeMassIndex(bars: Bar[], emaPeriod = 9, sumPeriod = 25): IndicatorPoint[] {
  const hl = bars.map(b => b.h - b.l);
  const ema1 = emaFromValues(hl, emaPeriod);
  const ema2 = emaFromValues(ema1, emaPeriod);
  const offset1 = hl.length - ema1.length;
  const offset2 = ema1.length - ema2.length;
  const ratio: number[] = ema2.map((e2, i) => e2 > 0 ? ema1[i + offset2] / e2 : 1);
  const result: IndicatorPoint[] = [];
  for (let i = sumPeriod - 1; i < ratio.length; i++) {
    const sum = ratio.slice(i - sumPeriod + 1, i + 1).reduce((s, v) => s + v, 0);
    const barIdx = i + offset1 + offset2;
    if (barIdx < bars.length) result.push({ t: bars[barIdx].t, value: sum });
  }
  return result;
}
