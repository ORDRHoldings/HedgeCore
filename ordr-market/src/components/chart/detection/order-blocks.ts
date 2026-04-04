import type { Bar, OrderBlock } from "../indicators/types";

/**
 * Detect Smart Money Concept order blocks.
 *
 * Bullish OB:  Last bearish candle before a ≥3-bar bullish impulse.
 *              Zone = [candle low, candle high].
 * Bearish OB:  Last bullish candle before a ≥3-bar bearish impulse.
 *              Zone = [candle low, candle high].
 */
export function detectOrderBlocks(bars: Bar[], impulseLen = 3): OrderBlock[] {
  if (bars.length < impulseLen + 2) return [];

  const blocks: OrderBlock[] = [];

  for (let i = 1; i < bars.length - impulseLen; i++) {
    // Check for bullish impulse starting at i+1
    let bullImpulse = true;
    let bearImpulse = true;
    for (let k = 0; k < impulseLen; k++) {
      if (bars[i + 1 + k].c <= bars[i + k].c) bullImpulse = false;
      if (bars[i + 1 + k].c >= bars[i + k].c) bearImpulse = false;
    }

    const prev = bars[i];
    const isBearish = prev.c < prev.o;
    const isBullish = prev.c > prev.o;

    if (bullImpulse && isBearish) {
      // Bullish order block: bearish candle before bullish impulse
      // Only add if not already added at same bar
      if (!blocks.find(b => b.barIndex === i && b.type === "bullish")) {
        blocks.push({
          barIndex: i,
          t: prev.t,
          top: Math.max(prev.o, prev.c),
          bottom: Math.min(prev.o, prev.c),
          type: "bullish",
          breached: false,
        });
      }
    }

    if (bearImpulse && isBullish) {
      // Bearish order block: bullish candle before bearish impulse
      if (!blocks.find(b => b.barIndex === i && b.type === "bearish")) {
        blocks.push({
          barIndex: i,
          t: prev.t,
          top: Math.max(prev.o, prev.c),
          bottom: Math.min(prev.o, prev.c),
          type: "bearish",
          breached: false,
        });
      }
    }
  }

  // Mark breached blocks: price has traded through the zone
  const lastClose = bars[bars.length - 1].c;
  for (const ob of blocks) {
    if (ob.type === "bullish" && lastClose < ob.bottom) ob.breached = true;
    if (ob.type === "bearish" && lastClose > ob.top) ob.breached = true;
  }

  // Return only last 20 unbreached blocks (most recent are most relevant)
  return blocks
    .filter(b => !b.breached)
    .slice(-20);
}
