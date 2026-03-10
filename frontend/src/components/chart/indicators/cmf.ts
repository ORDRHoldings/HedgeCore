import type { Bar, IndicatorPoint } from "./types";

/**
 * Chaikin Money Flow (CMF)
 * Money Flow Multiplier = ((C - L) - (H - C)) / (H - L)
 * Money Flow Volume = MFM * Volume
 * CMF = sum(MFV, period) / sum(Volume, period)
 * Range: -1 to +1
 */
export function computeCMF(
  bars: Bar[],
  period: number = 20,
): IndicatorPoint[] {
  const result: IndicatorPoint[] = [];
  if (bars.length < period) return result;

  const mfv: number[] = bars.map((b) => {
    const range = b.h - b.l;
    if (range === 0) return 0;
    const mfm = ((b.c - b.l) - (b.h - b.c)) / range;
    return mfm * b.v;
  });

  let mfvSum = 0;
  let volSum = 0;

  for (let i = 0; i < period; i++) {
    mfvSum += mfv[i];
    volSum += bars[i].v;
  }
  result.push({
    t: bars[period - 1].t,
    value: volSum === 0 ? 0 : mfvSum / volSum,
  });

  for (let i = period; i < bars.length; i++) {
    mfvSum += mfv[i] - mfv[i - period];
    volSum += bars[i].v - bars[i - period].v;
    result.push({
      t: bars[i].t,
      value: volSum === 0 ? 0 : mfvSum / volSum,
    });
  }

  return result;
}
