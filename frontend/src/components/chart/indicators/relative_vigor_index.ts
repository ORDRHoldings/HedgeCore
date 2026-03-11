import type { Bar } from "./types";

export interface RVIPoint { t: number; rvi: number; signal: number; }

function swma4(vals: number[], i: number): number {
  if (i < 3) return 0;
  return (vals[i - 3] + 2 * vals[i - 2] + 2 * vals[i - 1] + vals[i]) / 6;
}

export function computeRVI(bars: Bar[], period = 10): RVIPoint[] {
  const closes = bars.map(b => b.c - b.o);
  const ranges = bars.map(b => b.h - b.l);
  const rviRaw: number[] = [];
  for (let i = 3 + period - 1; i < bars.length; i++) {
    let numSum = 0, denSum = 0;
    for (let j = 0; j < period; j++) {
      numSum += swma4(closes, i - j);
      denSum += swma4(ranges, i - j);
    }
    rviRaw.push(denSum !== 0 ? numSum / denSum : 0);
  }
  const result: RVIPoint[] = [];
  for (let i = 3; i < rviRaw.length; i++) {
    const signal = swma4(rviRaw, i);
    const barIdx = 3 + period - 1 + i;
    if (barIdx < bars.length) result.push({ t: bars[barIdx].t, rvi: rviRaw[i], signal });
  }
  return result;
}
