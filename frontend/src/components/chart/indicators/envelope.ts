import type { Bar, BandPoint } from "./types";

export function computeEnvelope(bars: Bar[], period = 20, percent = 2.5): BandPoint[] {
  const result: BandPoint[] = [];
  const factor = percent / 100;
  for (let i = period - 1; i < bars.length; i++) {
    const sma = bars.slice(i - period + 1, i + 1).reduce((s, b) => s + b.c, 0) / period;
    result.push({
      t: bars[i].t,
      upper: sma * (1 + factor),
      middle: sma,
      lower: sma * (1 - factor),
    });
  }
  return result;
}
