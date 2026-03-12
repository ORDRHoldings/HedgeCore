import type { Bar, IndicatorPoint } from "./types";
import { emaFromValues } from "./ema";

export function computeEFI(bars: Bar[], period = 13): IndicatorPoint[] {
  const raw = bars.slice(1).map((b, i) => (b.c - bars[i].c) * b.v);
  const smoothed = emaFromValues(raw, period);
  const offset = bars.length - 1 - smoothed.length;
  return smoothed.map((v, i) => ({ t: bars[i + offset + 1].t, value: v }));
}
