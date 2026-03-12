import type { Bar, IndicatorPoint } from "./types";
export function computeAdvanceDecline(bars: Bar[]): IndicatorPoint[] {
  const result: IndicatorPoint[] = [];
  let cumAD = 0;
  for (const b of bars) {
    if (b.c > b.o) cumAD += b.v;
    else if (b.c < b.o) cumAD -= b.v;
    result.push({ t: b.t, value: cumAD });
  }
  return result;
}
