import type { Bar, IndicatorPoint } from "./types";
import { emaFromValues } from "./ema";
export function computeCVI(bars: Bar[], period = 14): IndicatorPoint[] {
  // Delta per bar
  const deltas = bars.map(b => {
    const hl = b.h - b.l;
    const buyVol = hl > 0 ? b.v * (b.c - b.l) / hl : b.v / 2;
    return buyVol - (b.v - buyVol);
  });
  // Normalize by volume
  const volRatios = bars.map((b, i) => b.v > 0 ? deltas[i] / b.v : 0);
  const smoothed = emaFromValues(volRatios, period);
  const offset = bars.length - smoothed.length;
  return smoothed.map((v, i) => ({ t: bars[i + offset].t, value: v * 100 }));
}
