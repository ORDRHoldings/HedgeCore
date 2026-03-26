import type { Bar } from "./types";

export interface SuperTrendPoint {
  t: number;
  value: number;
  direction: "up" | "down";
}

export function computeSuperTrend(bars: Bar[], period = 10, multiplier = 3): SuperTrendPoint[] {
  const result: SuperTrendPoint[] = [];
  if (bars.length < period + 1) return result;

  // Compute ATR (Wilder's smoothed)
  const atr: number[] = new Array(bars.length).fill(0);
  for (let i = 1; i < bars.length; i++) {
    const tr = Math.max(
      bars[i].h - bars[i].l,
      Math.abs(bars[i].h - bars[i - 1].c),
      Math.abs(bars[i].l - bars[i - 1].c),
    );
    if (i < period) {
      atr[i] = tr;
    } else if (i === period) {
      let trSum = 0;
      for (let j = 1; j <= period; j++) {
        trSum += Math.max(
          bars[j].h - bars[j].l,
          Math.abs(bars[j].h - bars[j - 1].c),
          Math.abs(bars[j].l - bars[j - 1].c),
        );
      }
      atr[i] = trSum / period;
    } else {
      atr[i] = (atr[i - 1] * (period - 1) + tr) / period;
    }
  }

  let upperBand = 0, lowerBand = 0, superTrend = 0, direction = 1;

  for (let i = period; i < bars.length; i++) {
    const hl2 = (bars[i].h + bars[i].l) / 2;
    const basicUpper = hl2 + multiplier * atr[i];
    const basicLower = hl2 - multiplier * atr[i];
    const finalUpper =
      basicUpper < upperBand || bars[i - 1].c > upperBand ? basicUpper : upperBand;
    const finalLower =
      basicLower > lowerBand || bars[i - 1].c < lowerBand ? basicLower : lowerBand;
    upperBand = finalUpper;
    lowerBand = finalLower;

    if (superTrend === finalUpper && bars[i].c <= finalUpper) {
      direction = -1;
    } else if (superTrend === finalLower && bars[i].c >= finalLower) {
      direction = 1;
    } else if (bars[i].c > finalUpper) {
      direction = 1;
    } else if (bars[i].c < finalLower) {
      direction = -1;
    }

    superTrend = direction === 1 ? finalLower : finalUpper;
    result.push({ t: bars[i].t, value: superTrend, direction: direction === 1 ? "up" : "down" });
  }

  return result;
}
