import type { Bar, IndicatorPoint } from "./types";

export type RSISource = "close" | "hlc3" | "hl2" | "ohlc4" | "hl2c3";

function getSource(bar: Bar, source: RSISource): number {
  switch (source) {
    case "hlc3":  return (bar.h + bar.l + bar.c) / 3;
    case "hl2":   return (bar.h + bar.l) / 2;
    case "ohlc4": return (bar.o + bar.h + bar.l + bar.c) / 4;
    case "hl2c3": return (bar.h + bar.l + bar.c * 2) / 4;  // weighted close
    default:      return bar.c;
  }
}

export function computeRSI(
  bars: Bar[],
  period: number = 14,
  source: RSISource = "close",
): IndicatorPoint[] {
  const result: IndicatorPoint[] = [];
  if (bars.length < period + 1) return result;

  let avgGain = 0;
  let avgLoss = 0;

  // Initial average using Wilder seeding (SMA of first period changes)
  for (let i = 1; i <= period; i++) {
    const change = getSource(bars[i], source) - getSource(bars[i - 1], source);
    if (change > 0) avgGain += change;
    else avgLoss += Math.abs(change);
  }
  avgGain /= period;
  avgLoss /= period;

  const rsi0 = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  result.push({ t: bars[period].t, value: rsi0 });

  // Wilder smoothing
  for (let i = period + 1; i < bars.length; i++) {
    const change = getSource(bars[i], source) - getSource(bars[i - 1], source);
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    result.push({ t: bars[i].t, value: rsi });
  }
  return result;
}
