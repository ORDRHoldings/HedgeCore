import type { Bar } from "./types";
import { emaFromValues } from "./ema";

export interface BullBearPoint { t: number; bull: number; bear: number; }

export function computeBullBearPower(bars: Bar[], period = 13): BullBearPoint[] {
  const result: BullBearPoint[] = [];
  if (bars.length < period) return result;
  const emaVals = emaFromValues(bars.map(b => b.c), period);
  const offset = bars.length - emaVals.length;
  for (let i = 0; i < emaVals.length; i++) {
    const barIdx = i + offset;
    result.push({ t: bars[barIdx].t, bull: bars[barIdx].h - emaVals[i], bear: bars[barIdx].l - emaVals[i] });
  }
  return result;
}
