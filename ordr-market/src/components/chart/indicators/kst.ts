import type { Bar, IndicatorPoint } from "./types";

export function computeKST(bars: Bar[]): IndicatorPoint[] {
  const rocPeriods = [10, 15, 20, 30];
  const smaPeriods = [10, 10, 10, 15];
  const weights = [1, 2, 3, 4];
  const minLen = 30 + 15;
  if (bars.length < minLen) return [];
  function roc(idx: number, n: number): number {
    return idx >= n && bars[idx - n].c > 0 ? (bars[idx].c - bars[idx - n].c) / bars[idx - n].c * 100 : 0;
  }
  const result: IndicatorPoint[] = [];
  for (let i = 44; i < bars.length; i++) { // 30+15-1
    let kst = 0;
    for (let k = 0; k < 4; k++) {
      let smaTot = 0;
      for (let j = 0; j < smaPeriods[k]; j++) {
        smaTot += roc(i - j, rocPeriods[k]);
      }
      kst += (smaTot / smaPeriods[k]) * weights[k];
    }
    result.push({ t: bars[i].t, value: kst });
  }
  return result;
}
