import type { Bar, TrendLine } from "../indicators/types";

/** Auto-detect trendlines from swing highs/lows */
export function detectTrendlines(
  bars: Bar[],
  lookback: number = 5,
  minTouches: number = 2,
  touchThreshold: number = 0.002,  // 0.2% proximity counts as touch
): TrendLine[] {
  if (bars.length < lookback * 2 + 1) return [];

  // Find swing points
  const swingHighs: { idx: number; price: number; t: number }[] = [];
  const swingLows: { idx: number; price: number; t: number }[] = [];

  for (let i = lookback; i < bars.length - lookback; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = 1; j <= lookback; j++) {
      if (bars[i].h <= bars[i - j].h || bars[i].h <= bars[i + j].h) isHigh = false;
      if (bars[i].l >= bars[i - j].l || bars[i].l >= bars[i + j].l) isLow = false;
    }
    if (isHigh) swingHighs.push({ idx: i, price: bars[i].h, t: bars[i].t });
    if (isLow) swingLows.push({ idx: i, price: bars[i].l, t: bars[i].t });
  }

  const lines: TrendLine[] = [];

  // Uptrend lines: connect swing lows
  for (let i = 0; i < swingLows.length - 1; i++) {
    for (let j = i + 1; j < swingLows.length; j++) {
      if (swingLows[j].price <= swingLows[i].price) continue; // must slope up

      const slope = (swingLows[j].price - swingLows[i].price) / (swingLows[j].idx - swingLows[i].idx);
      let touches = 2;

      // Count additional touches
      for (let k = 0; k < swingLows.length; k++) {
        if (k === i || k === j) continue;
        const expected = swingLows[i].price + slope * (swingLows[k].idx - swingLows[i].idx);
        if (Math.abs(swingLows[k].price - expected) / expected < touchThreshold) {
          touches++;
        }
      }

      if (touches >= minTouches) {
        lines.push({
          x1: swingLows[i].t, y1: swingLows[i].price,
          x2: swingLows[j].t, y2: swingLows[j].price,
          touches, direction: "up",
        });
      }
    }
  }

  // Downtrend lines: connect swing highs
  for (let i = 0; i < swingHighs.length - 1; i++) {
    for (let j = i + 1; j < swingHighs.length; j++) {
      if (swingHighs[j].price >= swingHighs[i].price) continue; // must slope down

      const slope = (swingHighs[j].price - swingHighs[i].price) / (swingHighs[j].idx - swingHighs[i].idx);
      let touches = 2;

      for (let k = 0; k < swingHighs.length; k++) {
        if (k === i || k === j) continue;
        const expected = swingHighs[i].price + slope * (swingHighs[k].idx - swingHighs[i].idx);
        if (Math.abs(swingHighs[k].price - expected) / expected < touchThreshold) {
          touches++;
        }
      }

      if (touches >= minTouches) {
        lines.push({
          x1: swingHighs[i].t, y1: swingHighs[i].price,
          x2: swingHighs[j].t, y2: swingHighs[j].price,
          touches, direction: "down",
        });
      }
    }
  }

  // Return top lines by touch count
  return lines.sort((a, b) => b.touches - a.touches).slice(0, 6);
}
