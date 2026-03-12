import type { Bar } from "./types";
import { emaFromValues } from "./ema";

export interface KlingerPoint { t: number; kvo: number; signal: number; }

export function computeKlinger(bars: Bar[], shortPeriod = 34, longPeriod = 55, signalPeriod = 13): KlingerPoint[] {
  if (bars.length < longPeriod + signalPeriod) return [];
  const vf: number[] = [0];
  let prevCM = bars[0].h - bars[0].l;
  for (let i = 1; i < bars.length; i++) {
    const trend = (bars[i].h + bars[i].l + bars[i].c) > (bars[i - 1].h + bars[i - 1].l + bars[i - 1].c) ? 1 : -1;
    const dm = bars[i].h - bars[i].l;
    const prevTrend = bars[i - 1].c > (i >= 2 ? bars[i - 2].c : bars[i - 1].c) ? 1 : -1;
    const cm = trend === prevTrend ? prevCM + dm : dm;
    prevCM = cm;
    vf.push(bars[i].v * Math.abs(2 * (dm / (cm || 1)) - 1) * trend * 100);
  }
  const emaShort = emaFromValues(vf, shortPeriod);
  const emaLong  = emaFromValues(vf, longPeriod);
  const offset = emaShort.length - emaLong.length;
  const kvoVals = emaLong.map((v, i) => emaShort[i + offset] - v);
  const signalVals = emaFromValues(kvoVals, signalPeriod);
  const sigOffset = kvoVals.length - signalVals.length;
  return signalVals.map((sig, i) => {
    const barIdx = bars.length - signalVals.length + i;
    return { t: bars[barIdx].t, kvo: kvoVals[i + sigOffset], signal: sig };
  });
}
