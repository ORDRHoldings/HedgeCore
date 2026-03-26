import type { Bar, BandPoint } from "./types";

/** Source index matches indicatorSchema options: 0=close 1=hlc3 2=hl2 3=ohlc4 4=hl2c3 */
function bbSource(bar: Bar, srcIdx: number): number {
  switch (srcIdx) {
    case 1: return (bar.h + bar.l + bar.c) / 3;
    case 2: return (bar.h + bar.l) / 2;
    case 3: return (bar.o + bar.h + bar.l + bar.c) / 4;
    case 4: return (bar.h + bar.l + 2 * bar.c) / 4;
    default: return bar.c;
  }
}

export function computeBollinger(
  bars: Bar[],
  period: number = 20,
  stdDev: number = 2,
  sourceIdx: number = 0,
): BandPoint[] {
  const result: BandPoint[] = [];
  if (bars.length < period) return result;

  for (let i = period - 1; i < bars.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += bbSource(bars[j], sourceIdx);
    const mean = sum / period;

    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) {
      variance += (bbSource(bars[j], sourceIdx) - mean) ** 2;
    }
    const sd = Math.sqrt(variance / period);

    result.push({
      t: bars[i].t,
      upper: mean + stdDev * sd,
      middle: mean,
      lower: mean - stdDev * sd,
    });
  }
  return result;
}
