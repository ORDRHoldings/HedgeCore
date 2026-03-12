import type { Bar } from "./types";

export interface VortexPoint { t: number; viPlus: number; viMinus: number; }

export function computeVortex(bars: Bar[], period = 14): VortexPoint[] {
  const result: VortexPoint[] = [];
  for (let i = period; i < bars.length; i++) {
    let vmPlus = 0, vmMinus = 0, trSum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      vmPlus += Math.abs(bars[j].h - bars[j - 1].l);
      vmMinus += Math.abs(bars[j].l - bars[j - 1].h);
      trSum += Math.max(bars[j].h - bars[j].l, Math.abs(bars[j].h - bars[j - 1].c), Math.abs(bars[j].l - bars[j - 1].c));
    }
    result.push({ t: bars[i].t, viPlus: trSum > 0 ? vmPlus / trSum : 0, viMinus: trSum > 0 ? vmMinus / trSum : 0 });
  }
  return result;
}
