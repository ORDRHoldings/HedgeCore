import type { Bar, IndicatorPoint } from "./types";

/**
 * Money Flow Index (MFI)
 * Typical Price = (H + L + C) / 3
 * Raw Money Flow = TP * Volume
 * Positive MF: sum of raw MF where TP > prev TP
 * Negative MF: sum of raw MF where TP < prev TP
 * MFI = 100 - 100 / (1 + Positive MF / Negative MF)
 */
export function computeMFI(
  bars: Bar[],
  period: number = 14,
): IndicatorPoint[] {
  const result: IndicatorPoint[] = [];
  if (bars.length < period + 1) return result;

  const tp: number[] = bars.map((b) => (b.h + b.l + b.c) / 3);
  const rawMF: number[] = bars.map((b, i) => tp[i] * b.v);

  for (let i = period; i < bars.length; i++) {
    let posMF = 0;
    let negMF = 0;

    for (let j = i - period + 1; j <= i; j++) {
      if (tp[j] > tp[j - 1]) {
        posMF += rawMF[j];
      } else if (tp[j] < tp[j - 1]) {
        negMF += rawMF[j];
      }
      // If TP unchanged, money flow is ignored
    }

    const mfi = negMF === 0 ? 100 : 100 - 100 / (1 + posMF / negMF);
    result.push({ t: bars[i].t, value: mfi });
  }

  return result;
}
