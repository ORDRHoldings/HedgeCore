import type { Bar, ADXPoint } from "./types";

/**
 * Average Directional Index (ADX) with +DI and -DI
 * Uses Wilder's smoothing method.
 *
 * +DM = H - prevH (if > 0 and > -(L - prevL)), else 0
 * -DM = prevL - L (if > 0 and > H - prevH), else 0
 * TR = max(H-L, |H-prevC|, |L-prevC|)
 * Smoothed +DI = 100 * smoothed(+DM) / smoothed(TR)
 * DX = |+DI - -DI| / (+DI + -DI) * 100
 * ADX = Wilder smoothed DX
 */
export function computeADX(
  bars: Bar[],
  period: number = 14,
): ADXPoint[] {
  const result: ADXPoint[] = [];
  if (bars.length < period * 2 + 1) return result;

  // Compute raw +DM, -DM, TR
  const plusDM: number[] = [];
  const minusDM: number[] = [];
  const tr: number[] = [];

  for (let i = 1; i < bars.length; i++) {
    const upMove = bars[i].h - bars[i - 1].h;
    const downMove = bars[i - 1].l - bars[i].l;

    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);

    tr.push(
      Math.max(
        bars[i].h - bars[i].l,
        Math.abs(bars[i].h - bars[i - 1].c),
        Math.abs(bars[i].l - bars[i - 1].c),
      ),
    );
  }

  if (plusDM.length < period) return result;

  // Wilder smooth: first value = sum of first `period`, then smooth = prev - prev/period + current
  let smoothPlusDM = 0;
  let smoothMinusDM = 0;
  let smoothTR = 0;

  for (let i = 0; i < period; i++) {
    smoothPlusDM += plusDM[i];
    smoothMinusDM += minusDM[i];
    smoothTR += tr[i];
  }

  // First +DI/-DI
  const diValues: { plusDI: number; minusDI: number; t: number }[] = [];

  const pdi0 = smoothTR === 0 ? 0 : (smoothPlusDM / smoothTR) * 100;
  const mdi0 = smoothTR === 0 ? 0 : (smoothMinusDM / smoothTR) * 100;
  diValues.push({ plusDI: pdi0, minusDI: mdi0, t: bars[period].t });

  for (let i = period; i < plusDM.length; i++) {
    smoothPlusDM = smoothPlusDM - smoothPlusDM / period + plusDM[i];
    smoothMinusDM = smoothMinusDM - smoothMinusDM / period + minusDM[i];
    smoothTR = smoothTR - smoothTR / period + tr[i];

    const pdi = smoothTR === 0 ? 0 : (smoothPlusDM / smoothTR) * 100;
    const mdi = smoothTR === 0 ? 0 : (smoothMinusDM / smoothTR) * 100;
    diValues.push({ plusDI: pdi, minusDI: mdi, t: bars[i].t });
  }

  // DX values
  const dxValues: number[] = diValues.map((d) => {
    const sum = d.plusDI + d.minusDI;
    return sum === 0 ? 0 : (Math.abs(d.plusDI - d.minusDI) / sum) * 100;
  });

  if (dxValues.length < period) return result;

  // ADX = Wilder smooth of DX
  let adxSum = 0;
  for (let i = 0; i < period; i++) adxSum += dxValues[i];
  let adx = adxSum / period;

  result.push({
    t: diValues[period - 1].t,
    adx,
    plusDI: diValues[period - 1].plusDI,
    minusDI: diValues[period - 1].minusDI,
  });

  for (let i = period; i < dxValues.length; i++) {
    adx = (adx * (period - 1) + dxValues[i]) / period;
    result.push({
      t: diValues[i].t,
      adx,
      plusDI: diValues[i].plusDI,
      minusDI: diValues[i].minusDI,
    });
  }

  return result;
}
