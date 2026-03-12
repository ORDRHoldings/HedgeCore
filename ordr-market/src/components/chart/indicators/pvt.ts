import type { Bar, IndicatorPoint } from "./types";
export function computePVT(bars: Bar[]): IndicatorPoint[] {
  const result: IndicatorPoint[] = [];
  let pvt = 0;
  for (let i = 1; i < bars.length; i++) {
    const pctChange = bars[i-1].c > 0 ? (bars[i].c - bars[i-1].c) / bars[i-1].c : 0;
    pvt += pctChange * bars[i].v;
    result.push({ t: bars[i].t, value: pvt });
  }
  return result;
}
