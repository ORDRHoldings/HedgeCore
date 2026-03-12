import type { Bar } from "./types";
import { emaFromValues } from "./ema";

export interface TSIPoint { t: number; tsi: number; signal: number; }

export function computeTSI(bars: Bar[], longPeriod = 25, shortPeriod = 13, signalPeriod = 13): TSIPoint[] {
  const momentum = bars.slice(1).map((b, i) => b.c - bars[i].c);
  const absMom = momentum.map(Math.abs);
  const ema1m = emaFromValues(momentum, shortPeriod);
  const ema2m = emaFromValues(ema1m, longPeriod);
  const ema1a = emaFromValues(absMom, shortPeriod);
  const ema2a = emaFromValues(ema1a, longPeriod);
  const len = Math.min(ema2m.length, ema2a.length);
  const tsiVals = Array.from({ length: len }, (_, i) => {
    const a = ema2a[ema2a.length - len + i];
    return a !== 0 ? 100 * ema2m[ema2m.length - len + i] / a : 0;
  });
  const sigVals = emaFromValues(tsiVals, signalPeriod);
  const sigOffset = tsiVals.length - sigVals.length;
  return sigVals.map((sig, i) => {
    const barIdx = bars.length - sigVals.length + i;
    return { t: bars[barIdx].t, tsi: tsiVals[i + sigOffset], signal: sig };
  });
}
