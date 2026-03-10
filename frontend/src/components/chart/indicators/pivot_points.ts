import type { Bar, PivotPointData } from "./types";

/**
 * Classic Pivot Points
 * PP = (High + Low + Close) / 3
 * R1 = 2 * PP - Low
 * S1 = 2 * PP - High
 * R2 = PP + (High - Low)
 * S2 = PP - (High - Low)
 * R3 = High + 2 * (PP - Low)
 * S3 = Low - 2 * (High - PP)
 *
 * Each bar produces a PivotPointData computed from that bar's OHLC.
 * Typically used on daily bars to project intraday levels.
 */
export function computePivotPoints(bars: Bar[]): PivotPointData[] {
  const result: PivotPointData[] = [];
  if (bars.length === 0) return result;

  for (let i = 0; i < bars.length; i++) {
    const h = bars[i].h;
    const l = bars[i].l;
    const c = bars[i].c;

    const pp = (h + l + c) / 3;
    const range = h - l;

    result.push({
      pp,
      r1: 2 * pp - l,
      r2: pp + range,
      r3: h + 2 * (pp - l),
      s1: 2 * pp - h,
      s2: pp - range,
      s3: l - 2 * (h - pp),
    });
  }

  return result;
}
