import type { Bar } from "./types";
import { emaFromValues } from "./ema";

export interface SMIPoint { t: number; smi: number; signal: number; }

export function computeSMI(bars: Bar[], kPeriod = 13, dPeriod = 25, signalPeriod = 9): SMIPoint[] {
  const mid = bars.map(b => (b.h + b.l) / 2);
  const diff = bars.map((b, i) => b.c - mid[i]);
  const range = bars.map(b => (b.h - b.l) / 2);
  const ema1d = emaFromValues(diff, kPeriod);
  const ema2d = emaFromValues(ema1d, dPeriod);
  const ema1r = emaFromValues(range, kPeriod);
  const ema2r = emaFromValues(ema1r, dPeriod);
  const len = Math.min(ema2d.length, ema2r.length);
  const smiVals = Array.from({ length: len }, (_, i) => {
    const ri = ema2r[ema2r.length - len + i];
    return ri !== 0 ? 100 * ema2d[ema2d.length - len + i] / ri : 0;
  });
  const sigVals = emaFromValues(smiVals, signalPeriod);
  const sigOffset = smiVals.length - sigVals.length;
  return sigVals.map((sig, i) => {
    const barIdx = bars.length - sigVals.length + i;
    return { t: bars[barIdx].t, smi: smiVals[i + sigOffset], signal: sig };
  });
}
