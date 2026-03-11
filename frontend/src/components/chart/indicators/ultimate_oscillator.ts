import type { Bar, IndicatorPoint } from "./types";

export function computeUltimateOscillator(bars: Bar[], period1 = 7, period2 = 14, period3 = 28): IndicatorPoint[] {
  const result: IndicatorPoint[] = [];
  if (bars.length < period3 + 1) return result;
  const bp: number[] = [0], tr: number[] = [0];
  for (let i = 1; i < bars.length; i++) {
    const pc = bars[i - 1].c;
    bp.push(bars[i].c - Math.min(bars[i].l, pc));
    tr.push(Math.max(bars[i].h, pc) - Math.min(bars[i].l, pc));
  }
  for (let i = period3; i < bars.length; i++) {
    function sum(arr: number[], p: number): number { return arr.slice(i - p + 1, i + 1).reduce((s, v) => s + v, 0); }
    const tr3 = sum(tr, period3), tr2 = sum(tr, period2), tr1 = sum(tr, period1);
    const bp3 = sum(bp, period3), bp2 = sum(bp, period2), bp1 = sum(bp, period1);
    const a1 = tr1 > 0 ? bp1 / tr1 : 0;
    const a2 = tr2 > 0 ? bp2 / tr2 : 0;
    const a3 = tr3 > 0 ? bp3 / tr3 : 0;
    result.push({ t: bars[i].t, value: 100 * (4 * a1 + 2 * a2 + a3) / 7 });
  }
  return result;
}
