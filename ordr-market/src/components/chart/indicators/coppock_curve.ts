import type { Bar, IndicatorPoint } from "./types";

export function computeCoppock(bars: Bar[], wmaLen = 10, roc1 = 14, roc2 = 11): IndicatorPoint[] {
  const result: IndicatorPoint[] = [];
  const minLen = Math.max(roc1, roc2) + wmaLen;
  if (bars.length < minLen) return result;
  const roc: number[] = [];
  for (let i = Math.max(roc1, roc2); i < bars.length; i++) {
    const r1 = bars[i - roc1].c > 0 ? (bars[i].c - bars[i - roc1].c) / bars[i - roc1].c * 100 : 0;
    const r2 = bars[i - roc2].c > 0 ? (bars[i].c - bars[i - roc2].c) / bars[i - roc2].c * 100 : 0;
    roc.push(r1 + r2);
  }
  const denom = (wmaLen * (wmaLen + 1)) / 2;
  for (let i = wmaLen - 1; i < roc.length; i++) {
    let weighted = 0;
    for (let j = 0; j < wmaLen; j++) weighted += roc[i - wmaLen + 1 + j] * (j + 1);
    const barIdx = i + Math.max(roc1, roc2);
    result.push({ t: bars[barIdx].t, value: weighted / denom });
  }
  return result;
}
