import type { Bar } from "./types";

export interface AroonPoint { t: number; up: number; down: number; oscillator: number; }

export function computeAroon(bars: Bar[], period = 25): AroonPoint[] {
  const result: AroonPoint[] = [];
  for (let i = period; i < bars.length; i++) {
    const slice = bars.slice(i - period, i + 1);
    let highIdx = 0, lowIdx = 0;
    for (let j = 1; j <= period; j++) {
      if (slice[j].h >= slice[highIdx].h) highIdx = j;
      if (slice[j].l <= slice[lowIdx].l) lowIdx = j;
    }
    const up = 100 * highIdx / period;
    const down = 100 * lowIdx / period;
    result.push({ t: bars[i].t, up, down, oscillator: up - down });
  }
  return result;
}
