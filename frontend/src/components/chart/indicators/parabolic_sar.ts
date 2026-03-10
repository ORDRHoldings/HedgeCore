import type { Bar, IndicatorPoint } from "./types";

/**
 * Parabolic SAR (Stop and Reverse)
 *
 * Initial: SAR = lowest low of first 2 bars (uptrend assumed)
 * AF starts at afStart, increments by afStart each new EP, capped at afMax
 * EP = Extreme Point (highest high in uptrend, lowest low in downtrend)
 * SAR(next) = SAR(current) + AF * (EP - SAR(current))
 * Reversal when SAR crosses into the price bar
 */
export function computeParabolicSAR(
  bars: Bar[],
  afStart: number = 0.02,
  afMax: number = 0.2,
): IndicatorPoint[] {
  const result: IndicatorPoint[] = [];
  if (bars.length < 2) return result;

  let isUpTrend = bars[1].c >= bars[0].c;
  let af = afStart;
  let ep = isUpTrend ? bars[0].h : bars[0].l;
  let sar = isUpTrend ? bars[0].l : bars[0].h;

  result.push({ t: bars[0].t, value: sar });

  for (let i = 1; i < bars.length; i++) {
    const prevSar = sar;

    // Calculate new SAR
    sar = prevSar + af * (ep - prevSar);

    if (isUpTrend) {
      // SAR cannot be above the two previous lows
      if (i >= 2) sar = Math.min(sar, bars[i - 1].l, bars[i - 2].l);
      else sar = Math.min(sar, bars[i - 1].l);

      // Check for reversal
      if (sar > bars[i].l) {
        // Reverse to downtrend
        isUpTrend = false;
        sar = ep; // SAR becomes the previous EP
        ep = bars[i].l;
        af = afStart;
      } else {
        // Update EP and AF
        if (bars[i].h > ep) {
          ep = bars[i].h;
          af = Math.min(af + afStart, afMax);
        }
      }
    } else {
      // SAR cannot be below the two previous highs
      if (i >= 2) sar = Math.max(sar, bars[i - 1].h, bars[i - 2].h);
      else sar = Math.max(sar, bars[i - 1].h);

      // Check for reversal
      if (sar < bars[i].h) {
        // Reverse to uptrend
        isUpTrend = true;
        sar = ep; // SAR becomes the previous EP
        ep = bars[i].h;
        af = afStart;
      } else {
        // Update EP and AF
        if (bars[i].l < ep) {
          ep = bars[i].l;
          af = Math.min(af + afStart, afMax);
        }
      }
    }

    result.push({ t: bars[i].t, value: sar });
  }

  return result;
}
