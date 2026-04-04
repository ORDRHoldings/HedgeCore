import type { Bar, LiquidityZone } from "../indicators/types";

/**
 * Detect liquidity zones (equal highs / equal lows).
 *
 * Equal Highs (EQH) → buy-side liquidity: clusters of swing highs within
 *   `tolerancePct` of each other.  Price will likely sweep this level to
 *   grab stop orders placed above highs.
 *
 * Equal Lows (EQL) → sell-side liquidity: clusters of swing lows within
 *   tolerancePct.
 */
export function detectLiquidityZones(
  bars: Bar[],
  lookback   = 50,
  minCluster = 2,
  tolerancePct = 0.003,   // 0.3 %
): LiquidityZone[] {
  if (bars.length < 5) return [];

  const slice = bars.slice(-lookback);
  const zones: LiquidityZone[] = [];

  // Collect swing highs and lows (simple 2-bar left/right pivot)
  const swingHighs: { idx: number; price: number }[] = [];
  const swingLows:  { idx: number; price: number }[] = [];

  for (let i = 2; i < slice.length - 2; i++) {
    const h = slice[i].h;
    const l = slice[i].l;
    if (h > slice[i-1].h && h > slice[i-2].h && h > slice[i+1].h && h > slice[i+2].h) {
      swingHighs.push({ idx: bars.length - lookback + i, price: h });
    }
    if (l < slice[i-1].l && l < slice[i-2].l && l < slice[i+1].l && l < slice[i+2].l) {
      swingLows.push({ idx: bars.length - lookback + i, price: l });
    }
  }

  // Cluster swing highs
  const usedHigh = new Set<number>();
  for (let i = 0; i < swingHighs.length; i++) {
    if (usedHigh.has(i)) continue;
    const cluster = [swingHighs[i]];
    for (let j = i + 1; j < swingHighs.length; j++) {
      if (usedHigh.has(j)) continue;
      const diff = Math.abs(swingHighs[j].price - swingHighs[i].price) / swingHighs[i].price;
      if (diff <= tolerancePct) { cluster.push(swingHighs[j]); usedHigh.add(j); }
    }
    if (cluster.length >= minCluster) {
      const avgPrice = cluster.reduce((s, c) => s + c.price, 0) / cluster.length;
      const minIdx = Math.min(...cluster.map(c => c.idx));
      zones.push({
        price: avgPrice,
        top: avgPrice * (1 + tolerancePct / 2),
        bottom: avgPrice * (1 - tolerancePct / 2),
        type: "buy-side",
        strength: cluster.length,
        startIndex: minIdx,
        t: bars[minIdx]?.t ?? 0,
      });
    }
  }

  // Cluster swing lows
  const usedLow = new Set<number>();
  for (let i = 0; i < swingLows.length; i++) {
    if (usedLow.has(i)) continue;
    const cluster = [swingLows[i]];
    for (let j = i + 1; j < swingLows.length; j++) {
      if (usedLow.has(j)) continue;
      const diff = Math.abs(swingLows[j].price - swingLows[i].price) / swingLows[i].price;
      if (diff <= tolerancePct) { cluster.push(swingLows[j]); usedLow.add(j); }
    }
    if (cluster.length >= minCluster) {
      const avgPrice = cluster.reduce((s, c) => s + c.price, 0) / cluster.length;
      const minIdx = Math.min(...cluster.map(c => c.idx));
      zones.push({
        price: avgPrice,
        top: avgPrice * (1 + tolerancePct / 2),
        bottom: avgPrice * (1 - tolerancePct / 2),
        type: "sell-side",
        strength: cluster.length,
        startIndex: minIdx,
        t: bars[minIdx]?.t ?? 0,
      });
    }
  }

  return zones;
}
