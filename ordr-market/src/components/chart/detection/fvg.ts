import type { Bar, FVGZone } from "../indicators/types";

/** Detect Fair Value Gaps (3-candle imbalance zones) */
export function detectFVG(bars: Bar[], minGapPct: number = 0.0001): FVGZone[] {
  const gaps: FVGZone[] = [];
  if (bars.length < 3) return gaps;

  for (let i = 2; i < bars.length; i++) {
    const prev = bars[i - 2];
    const mid = bars[i - 1];
    const curr = bars[i];

    // Bullish FVG: candle 3 low > candle 1 high (gap up)
    if (curr.l > prev.h) {
      const gapSize = (curr.l - prev.h) / mid.c;
      if (gapSize >= minGapPct) {
        gaps.push({
          startIndex: i - 2,
          endIndex: i,
          top: curr.l,
          bottom: prev.h,
          type: "bullish",
          t: mid.t,
        });
      }
    }

    // Bearish FVG: candle 3 high < candle 1 low (gap down)
    if (curr.h < prev.l) {
      const gapSize = (prev.l - curr.h) / mid.c;
      if (gapSize >= minGapPct) {
        gaps.push({
          startIndex: i - 2,
          endIndex: i,
          top: prev.l,
          bottom: curr.h,
          type: "bearish",
          t: mid.t,
        });
      }
    }
  }

  return gaps;
}
