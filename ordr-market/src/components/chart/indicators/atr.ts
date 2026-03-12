import type { Bar } from "./types";

/** Average True Range -- used by Keltner Channel */
export function computeATR(bars: Bar[], period: number = 10): number[] {
  if (bars.length < 2) return [];

  const trueRanges: number[] = [];
  trueRanges.push(bars[0].h - bars[0].l); // first bar: just range

  for (let i = 1; i < bars.length; i++) {
    const tr = Math.max(
      bars[i].h - bars[i].l,
      Math.abs(bars[i].h - bars[i - 1].c),
      Math.abs(bars[i].l - bars[i - 1].c),
    );
    trueRanges.push(tr);
  }

  // Smoothed ATR (Wilder's method)
  const atr: number[] = [];
  if (trueRanges.length < period) return atr;

  let sum = 0;
  for (let i = 0; i < period; i++) sum += trueRanges[i];
  let current = sum / period;
  atr.push(current);

  for (let i = period; i < trueRanges.length; i++) {
    current = (current * (period - 1) + trueRanges[i]) / period;
    atr.push(current);
  }
  return atr;
}
