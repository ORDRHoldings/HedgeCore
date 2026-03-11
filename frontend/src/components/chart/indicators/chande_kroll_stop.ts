import type { Bar } from "./types";

export interface ChandeKrollPoint {
  t: number;
  stop1: number;
  stop2: number;
}

export function computeChandeKrollStop(bars: Bar[], p = 10, q = 9, x = 1.5): ChandeKrollPoint[] {
  const result: ChandeKrollPoint[] = [];
  const minLen = p + q;
  if (bars.length < minLen) return result;

  // Compute ATR(p) using Wilder's smoothing
  const atr: number[] = new Array(bars.length).fill(0);
  for (let i = 1; i < bars.length; i++) {
    const tr = Math.max(
      bars[i].h - bars[i].l,
      Math.abs(bars[i].h - bars[i - 1].c),
      Math.abs(bars[i].l - bars[i - 1].c),
    );
    atr[i] = i < p ? tr : (atr[i - 1] * (p - 1) + tr) / p;
  }

  // First stop lines
  const firstHigh: number[] = [];
  const firstLow: number[] = [];
  for (let i = p - 1; i < bars.length; i++) {
    const highest = Math.max(...bars.slice(i - p + 1, i + 1).map((b) => b.h));
    const lowest = Math.min(...bars.slice(i - p + 1, i + 1).map((b) => b.l));
    firstHigh.push(highest - x * atr[i]);
    firstLow.push(lowest + x * atr[i]);
  }

  for (let i = q - 1; i < firstHigh.length; i++) {
    const stop1 = Math.max(...firstHigh.slice(i - q + 1, i + 1));
    const stop2 = Math.min(...firstLow.slice(i - q + 1, i + 1));
    const barIdx = i + (p - 1);
    result.push({ t: bars[barIdx].t, stop1, stop2 });
  }

  return result;
}
