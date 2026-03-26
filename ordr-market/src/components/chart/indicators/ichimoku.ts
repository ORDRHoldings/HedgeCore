import type { Bar, IchimokuPoint } from "./types";

/**
 * Ichimoku Cloud (Ichimoku Kinko Hyo)
 *
 * Tenkan-sen = (highest high + lowest low) / 2 over tenkanPeriod
 * Kijun-sen  = (highest high + lowest low) / 2 over kijunPeriod
 * Senkou Span A = (Tenkan + Kijun) / 2, displaced kijunPeriod forward
 * Senkou Span B = (highest high + lowest low) / 2 over senkouBPeriod, displaced kijunPeriod forward
 * Chikou Span = Close, displaced kijunPeriod backward
 */
export function computeIchimoku(
  bars: Bar[],
  tenkanPeriod: number = 9,
  kijunPeriod: number = 26,
  senkouBPeriod: number = 52,
): IchimokuPoint[] {
  const result: IchimokuPoint[] = [];
  if (bars.length < senkouBPeriod) return result;

  const midpoint = (bars: Bar[], end: number, period: number): number => {
    let hh = -Infinity;
    let ll = Infinity;
    const start = Math.max(0, end - period + 1);
    for (let j = start; j <= end; j++) {
      if (bars[j].h > hh) hh = bars[j].h;
      if (bars[j].l < ll) ll = bars[j].l;
    }
    return (hh + ll) / 2;
  };

  // Pre-compute Tenkan, Kijun, Senkou B raw values
  const tenkan: (number | null)[] = [];
  const kijun: (number | null)[] = [];
  const senkouBRaw: (number | null)[] = [];

  for (let i = 0; i < bars.length; i++) {
    tenkan.push(i >= tenkanPeriod - 1 ? midpoint(bars, i, tenkanPeriod) : null);
    kijun.push(i >= kijunPeriod - 1 ? midpoint(bars, i, kijunPeriod) : null);
    senkouBRaw.push(i >= senkouBPeriod - 1 ? midpoint(bars, i, senkouBPeriod) : null);
  }

  // Build output points where all components are available
  // Start from senkouBPeriod - 1 so that all base values exist
  const startIdx = senkouBPeriod - 1;

  for (let i = startIdx; i < bars.length; i++) {
    const tenkanVal = tenkan[i];
    const kijunVal = kijun[i];

    if (tenkanVal === null || kijunVal === null) continue;

    // Senkou Span A & B: displaced forward by kijunPeriod from source
    // Both use the same sourceIdx and the same fallback logic for consistency
    const senkouSourceIdx = i - kijunPeriod;

    // Senkou A: (Tenkan + Kijun) / 2 from kijunPeriod bars ago
    const senkouA =
      senkouSourceIdx >= 0 &&
      tenkan[senkouSourceIdx] !== null &&
      kijun[senkouSourceIdx] !== null
        ? ((tenkan[senkouSourceIdx] as number) + (kijun[senkouSourceIdx] as number)) / 2
        : (tenkanVal + kijunVal) / 2;

    // Senkou B: midpoint over senkouBPeriod from kijunPeriod bars ago
    const senkouB =
      senkouSourceIdx >= 0 && senkouBRaw[senkouSourceIdx] !== null
        ? (senkouBRaw[senkouSourceIdx] as number)
        : senkouBRaw[i] !== null
          ? (senkouBRaw[i] as number)
          : (tenkanVal + kijunVal) / 2;

    // Chikou: current close, but displayed `kijunPeriod` bars back.
    // We store the chikou value at the current index for the data point.
    // The displacement is handled by the renderer.
    const chikouIdx = i + kijunPeriod;
    const chikou = chikouIdx < bars.length ? bars[chikouIdx].c : bars[i].c;

    result.push({
      t: bars[i].t,
      tenkan: tenkanVal,
      kijun: kijunVal,
      senkouA,
      senkouB,
      chikou,
    });
  }

  return result;
}
