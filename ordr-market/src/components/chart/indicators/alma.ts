import type { Bar, IndicatorPoint } from "./types";

export function computeALMA(bars: Bar[], period = 9, offset = 0.85, sigma = 6): IndicatorPoint[] {
  const result: IndicatorPoint[] = [];
  const m = Math.floor(offset * (period - 1));
  const s = period / sigma;
  const weights: number[] = [];
  let wSum = 0;
  for (let i = 0; i < period; i++) {
    const w = Math.exp(-((i - m) ** 2) / (2 * s ** 2));
    weights.push(w);
    wSum += w;
  }
  for (let i = period - 1; i < bars.length; i++) {
    let val = 0;
    for (let j = 0; j < period; j++) val += bars[i - period + 1 + j].c * weights[j];
    result.push({ t: bars[i].t, value: val / wSum });
  }
  return result;
}
