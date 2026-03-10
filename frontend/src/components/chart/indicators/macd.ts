import type { Bar, MACDPoint } from "./types";
import { emaFromValues } from "./ema";

export function computeMACD(
  bars: Bar[],
  fast: number = 12,
  slow: number = 26,
  signal: number = 9,
): MACDPoint[] {
  const closes = bars.map(b => b.c);
  if (closes.length < slow + signal) return [];

  const emaFast = emaFromValues(closes, fast);
  const emaSlow = emaFromValues(closes, slow);

  // Align: emaFast starts at index (fast-1), emaSlow at (slow-1)
  const offset = slow - fast;
  const macdLine: number[] = [];
  for (let i = 0; i < emaSlow.length; i++) {
    macdLine.push(emaFast[i + offset] - emaSlow[i]);
  }

  const signalLine = emaFromValues(macdLine, signal);

  const result: MACDPoint[] = [];
  const signalOffset = signal - 1;
  const barOffset = slow - 1 + signalOffset;

  for (let i = 0; i < signalLine.length; i++) {
    const macdVal = macdLine[i + signalOffset];
    const sigVal = signalLine[i];
    result.push({
      t: bars[barOffset + i].t,
      macd: macdVal,
      signal: sigVal,
      histogram: macdVal - sigVal,
    });
  }
  return result;
}
