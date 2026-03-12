import type { Bar } from "./types";

export interface AlligatorPoint {
  t: number;
  jaw: number;
  teeth: number;
  lips: number;
}

function computeSMMASeries(closes: number[], period: number): number[] {
  if (closes.length < period) return [];
  const res: number[] = new Array(period - 1).fill(NaN);
  let s = closes.slice(0, period).reduce((a, v) => a + v, 0) / period;
  res.push(s);
  for (let i = period; i < closes.length; i++) {
    s = (s * (period - 1) + closes[i]) / period;
    res.push(s);
  }
  return res;
}

export function computeAlligator(bars: Bar[]): AlligatorPoint[] {
  const medians = bars.map((b) => (b.h + b.l) / 2);
  const jaw = computeSMMASeries(medians, 13);
  const teeth = computeSMMASeries(medians, 8);
  const lips = computeSMMASeries(medians, 5);
  const result: AlligatorPoint[] = [];
  for (let i = 0; i < bars.length; i++) {
    if (isNaN(jaw[i]) || isNaN(teeth[i]) || isNaN(lips[i])) continue;
    result.push({ t: bars[i].t, jaw: jaw[i], teeth: teeth[i], lips: lips[i] });
  }
  return result;
}
