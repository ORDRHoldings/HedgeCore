import type { Bar, IndicatorPoint } from "./types";

/**
 * On-Balance Volume (OBV)
 * If close > prev close: OBV += volume
 * If close < prev close: OBV -= volume
 * If close == prev close: OBV unchanged
 */
export function computeOBV(bars: Bar[]): IndicatorPoint[] {
  const result: IndicatorPoint[] = [];
  if (bars.length === 0) return result;

  let obv = 0;
  result.push({ t: bars[0].t, value: obv });

  for (let i = 1; i < bars.length; i++) {
    if (bars[i].c > bars[i - 1].c) {
      obv += bars[i].v;
    } else if (bars[i].c < bars[i - 1].c) {
      obv -= bars[i].v;
    }
    result.push({ t: bars[i].t, value: obv });
  }

  return result;
}
