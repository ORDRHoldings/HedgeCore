import type { Bar, IndicatorPoint } from "./types";
export function computeADL(bars: Bar[]): IndicatorPoint[] {
  const result: IndicatorPoint[] = [];
  let cumADL = 0;
  for (const b of bars) {
    const clv = (b.h !== b.l) ? ((b.c - b.l) - (b.h - b.c)) / (b.h - b.l) : 0;
    cumADL += clv * b.v;
    result.push({ t: b.t, value: cumADL });
  }
  return result;
}
