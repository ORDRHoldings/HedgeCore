import type { Bar, IndicatorPoint } from "./types";
export function computeNetVolume(bars: Bar[], period = 1): IndicatorPoint[] {
  const result: IndicatorPoint[] = [];
  const net = bars.map(b => b.c >= b.o ? b.v : -b.v);
  if (period <= 1) {
    return bars.map((b, i) => ({ t: b.t, value: net[i] }));
  }
  for (let i = period - 1; i < bars.length; i++) {
    const sma = net.slice(i - period + 1, i + 1).reduce((s, v) => s + v, 0) / period;
    result.push({ t: bars[i].t, value: sma });
  }
  return result;
}
