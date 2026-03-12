import type { Bar, IndicatorPoint } from "./types";
export function computeCVD(bars: Bar[]): IndicatorPoint[] {
  const result: IndicatorPoint[] = [];
  let cum = 0;
  for (const b of bars) {
    const hl = b.h - b.l;
    const buyVol = hl > 0 ? b.v * (b.c - b.l) / hl : b.v / 2;
    cum += buyVol - (b.v - buyVol);
    result.push({ t: b.t, value: cum });
  }
  return result;
}
