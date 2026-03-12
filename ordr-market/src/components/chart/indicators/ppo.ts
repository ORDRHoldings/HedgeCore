import type { Bar } from "./types";
import { emaFromValues } from "./ema";

export interface PPOPoint { t: number; ppo: number; signal: number; histogram: number; }

export function computePPO(bars: Bar[], fast = 12, slow = 26, signalPeriod = 9): PPOPoint[] {
  const closes = bars.map(b => b.c);
  const emaFast = emaFromValues(closes, fast);
  const emaSlow = emaFromValues(closes, slow);
  const offset = emaFast.length - emaSlow.length;
  const ppoVals = emaSlow.map((s, i) => s > 0 ? (emaFast[i + offset] - s) / s * 100 : 0);
  const signalVals = emaFromValues(ppoVals, signalPeriod);
  const sigOffset = ppoVals.length - signalVals.length;
  return signalVals.map((sig, i) => {
    const ppo = ppoVals[i + sigOffset];
    const barIdx = bars.length - signalVals.length + i;
    return { t: bars[barIdx].t, ppo, signal: sig, histogram: ppo - sig };
  });
}
