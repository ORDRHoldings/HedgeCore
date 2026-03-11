import type { Bar, IndicatorPoint } from "./types";

export function computeFisher(bars: Bar[], period = 9): IndicatorPoint[] {
  const result: IndicatorPoint[] = [];
  for (let i = period - 1; i < bars.length; i++) {
    const slice = bars.slice(i - period + 1, i + 1);
    const highest = Math.max(...slice.map(b => b.h));
    const lowest  = Math.min(...slice.map(b => b.l));
    const hl2 = (bars[i].h + bars[i].l) / 2;
    let x = highest !== lowest ? 2 * (hl2 - lowest) / (highest - lowest) - 1 : 0;
    x = Math.max(-0.999, Math.min(0.999, x)); // prevent log(0)
    result.push({ t: bars[i].t, value: 0.5 * Math.log((1 + x) / (1 - x)) });
  }
  return result;
}
