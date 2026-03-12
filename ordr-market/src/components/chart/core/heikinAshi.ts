/**
 * heikinAshi.ts -- Transform standard OHLC bars to Heikin Ashi
 *
 * HA Close = (O + H + L + C) / 4
 * HA Open  = (prev HA Open + prev HA Close) / 2   (first bar: (O + C) / 2)
 * HA High  = max(H, HA Open, HA Close)
 * HA Low   = min(L, HA Open, HA Close)
 *
 * Timestamp (t) and volume (v) are preserved from the original bars.
 */
import type { Bar } from "../indicators/types";

export function computeHeikinAshi(bars: Bar[]): Bar[] {
  if (bars.length === 0) return [];

  const result: Bar[] = new Array(bars.length);

  // First bar
  const first = bars[0];
  const haClose0 = (first.o + first.h + first.l + first.c) / 4;
  const haOpen0 = (first.o + first.c) / 2;
  result[0] = {
    t: first.t,
    o: haOpen0,
    h: Math.max(first.h, haOpen0, haClose0),
    l: Math.min(first.l, haOpen0, haClose0),
    c: haClose0,
    v: first.v,
  };

  // Subsequent bars
  for (let i = 1; i < bars.length; i++) {
    const bar = bars[i];
    const prev = result[i - 1];
    const haClose = (bar.o + bar.h + bar.l + bar.c) / 4;
    const haOpen = (prev.o + prev.c) / 2;
    result[i] = {
      t: bar.t,
      o: haOpen,
      h: Math.max(bar.h, haOpen, haClose),
      l: Math.min(bar.l, haOpen, haClose),
      c: haClose,
      v: bar.v,
    };
  }

  return result;
}
