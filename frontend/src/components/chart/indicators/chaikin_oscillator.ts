import type { Bar, IndicatorPoint } from "./types";
import { emaFromValues } from "./ema";

function computeADLValues(bars: Bar[]): number[] {
  const result: number[] = [];
  let cumADL = 0;
  for (const b of bars) {
    const clv = (b.h !== b.l) ? ((b.c - b.l) - (b.h - b.c)) / (b.h - b.l) : 0;
    cumADL += clv * b.v;
    result.push(cumADL);
  }
  return result;
}

export function computeChaikinOscillator(bars: Bar[], fastPeriod = 3, slowPeriod = 10): IndicatorPoint[] {
  const adl = computeADLValues(bars);
  const fast = emaFromValues(adl, fastPeriod);
  const slow = emaFromValues(adl, slowPeriod);
  const offset = fast.length - slow.length;
  const result: IndicatorPoint[] = [];
  for (let i = 0; i < slow.length; i++) {
    const barIdx = bars.length - slow.length + i;
    result.push({ t: bars[barIdx].t, value: fast[i + offset] - slow[i] });
  }
  return result;
}
