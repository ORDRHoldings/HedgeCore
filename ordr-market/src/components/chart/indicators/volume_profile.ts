import type { Bar, VolumeProfileData, VolumeProfileLevel } from "./types";

/**
 * Volume Profile
 * Distributes total volume into price bins across the visible range.
 * Finds POC (Point of Control) = price level with highest volume.
 * Value Area = 70% of total volume centered around POC.
 *
 * Buy volume estimated when close >= open (bullish bar contributes to buy).
 * Sell volume estimated when close < open (bearish bar contributes to sell).
 */
export function computeVolumeProfile(
  bars: Bar[],
  numLevels: number = 50,
): VolumeProfileData {
  const empty: VolumeProfileData = {
    levels: [],
    poc: 0,
    vahPrice: 0,
    valPrice: 0,
    totalVolume: 0,
  };

  if (bars.length === 0 || numLevels < 1) return empty;

  // Find price range
  let minPrice = Infinity;
  let maxPrice = -Infinity;

  for (const bar of bars) {
    if (bar.l < minPrice) minPrice = bar.l;
    if (bar.h > maxPrice) maxPrice = bar.h;
  }

  const priceRange = maxPrice - minPrice;
  if (priceRange === 0) {
    // All bars at same price
    const totalVol = bars.reduce((s, b) => s + b.v, 0);
    const buyVol = bars.filter((b) => b.c >= b.o).reduce((s, b) => s + b.v, 0);
    return {
      levels: [
        {
          price: minPrice,
          volume: totalVol,
          buyVolume: buyVol,
          sellVolume: totalVol - buyVol,
          percentage: 100,
        },
      ],
      poc: minPrice,
      vahPrice: minPrice,
      valPrice: minPrice,
      totalVolume: totalVol,
    };
  }

  const binSize = priceRange / numLevels;

  // Initialize bins
  const bins: { volume: number; buyVolume: number; sellVolume: number }[] = [];
  for (let i = 0; i < numLevels; i++) {
    bins.push({ volume: 0, buyVolume: 0, sellVolume: 0 });
  }

  let totalVolume = 0;

  // Distribute each bar's volume across the bins its range covers
  for (const bar of bars) {
    const isBullish = bar.c >= bar.o;
    const startBin = Math.max(0, Math.floor((bar.l - minPrice) / binSize));
    const endBin = Math.min(numLevels - 1, Math.floor((bar.h - minPrice) / binSize));
    const coveredBins = endBin - startBin + 1;
    const volPerBin = bar.v / coveredBins;

    for (let b = startBin; b <= endBin; b++) {
      bins[b].volume += volPerBin;
      if (isBullish) bins[b].buyVolume += volPerBin;
      else bins[b].sellVolume += volPerBin;
    }

    totalVolume += bar.v;
  }

  // Find POC (bin with maximum volume)
  let pocIdx = 0;
  let maxVol = 0;
  for (let i = 0; i < bins.length; i++) {
    if (bins[i].volume > maxVol) {
      maxVol = bins[i].volume;
      pocIdx = i;
    }
  }

  // Build levels with percentage
  const levels: VolumeProfileLevel[] = bins.map((bin, i) => ({
    price: minPrice + (i + 0.5) * binSize,
    volume: bin.volume,
    buyVolume: bin.buyVolume,
    sellVolume: bin.sellVolume,
    percentage: totalVolume === 0 ? 0 : (bin.volume / totalVolume) * 100,
  }));

  // Value Area: 70% of total volume, expanding outward from POC
  const vaThreshold = totalVolume * 0.7;
  let vaVolume = bins[pocIdx].volume;
  let vaLow = pocIdx;
  let vaHigh = pocIdx;

  while (vaVolume < vaThreshold && (vaLow > 0 || vaHigh < numLevels - 1)) {
    const lowerVol = vaLow > 0 ? bins[vaLow - 1].volume : -1;
    const upperVol = vaHigh < numLevels - 1 ? bins[vaHigh + 1].volume : -1;

    if (lowerVol >= upperVol && vaLow > 0) {
      vaLow--;
      vaVolume += bins[vaLow].volume;
    } else if (vaHigh < numLevels - 1) {
      vaHigh++;
      vaVolume += bins[vaHigh].volume;
    } else if (vaLow > 0) {
      vaLow--;
      vaVolume += bins[vaLow].volume;
    } else {
      break;
    }
  }

  return {
    levels,
    poc: minPrice + (pocIdx + 0.5) * binSize,
    vahPrice: minPrice + (vaHigh + 1) * binSize,
    valPrice: minPrice + vaLow * binSize,
    totalVolume,
  };
}
