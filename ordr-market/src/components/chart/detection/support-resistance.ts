import type { Bar, SRLevel } from "../indicators/types";

/** Auto-detect support and resistance levels from pivot highs/lows */
export function detectSupportResistance(
  bars: Bar[],
  lookback: number = 5,
  clusterThreshold: number = 0.001,  // 0.1% price proximity = same level
): SRLevel[] {
  if (bars.length < lookback * 2 + 1) return [];

  const pivots: { price: number; type: "high" | "low" }[] = [];

  // Find pivot highs and lows
  for (let i = lookback; i < bars.length - lookback; i++) {
    let isHigh = true;
    let isLow = true;

    for (let j = 1; j <= lookback; j++) {
      if (bars[i].h <= bars[i - j].h || bars[i].h <= bars[i + j].h) isHigh = false;
      if (bars[i].l >= bars[i - j].l || bars[i].l >= bars[i + j].l) isLow = false;
    }

    if (isHigh) pivots.push({ price: bars[i].h, type: "high" });
    if (isLow) pivots.push({ price: bars[i].l, type: "low" });
  }

  // Cluster nearby pivots
  const levels: SRLevel[] = [];
  const used = new Set<number>();

  for (let i = 0; i < pivots.length; i++) {
    if (used.has(i)) continue;

    let sumPrice = pivots[i].price;
    let count = 1;
    let supports = pivots[i].type === "low" ? 1 : 0;
    let resistances = pivots[i].type === "high" ? 1 : 0;

    for (let j = i + 1; j < pivots.length; j++) {
      if (used.has(j)) continue;
      const dist = Math.abs(pivots[j].price - pivots[i].price) / pivots[i].price;
      if (dist < clusterThreshold) {
        sumPrice += pivots[j].price;
        count++;
        used.add(j);
        if (pivots[j].type === "low") supports++;
        else resistances++;
      }
    }
    used.add(i);

    if (count >= 2) {  // Only show levels touched 2+ times
      levels.push({
        price: sumPrice / count,
        strength: count,
        type: supports >= resistances ? "support" : "resistance",
      });
    }
  }

  return levels.sort((a, b) => b.strength - a.strength).slice(0, 10);  // Top 10
}
