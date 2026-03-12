import type { Bar, StochasticPoint } from "./types";

/**
 * Stochastic RSI
 * 1. Compute RSI values
 * 2. Apply Stochastic formula to RSI: StochRSI = (RSI - min(RSI)) / (max(RSI) - min(RSI))
 * 3. %K = SMA(StochRSI, kSmooth), %D = SMA(%K, dSmooth)
 */
export function computeStochRSI(
  bars: Bar[],
  rsiPeriod: number = 14,
  stochPeriod: number = 14,
  kSmooth: number = 3,
  dSmooth: number = 3,
): StochasticPoint[] {
  if (bars.length < rsiPeriod + 1) return [];

  // Step 1: Compute RSI values
  const rsiValues: { t: number; rsi: number }[] = [];
  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 1; i <= rsiPeriod; i++) {
    const change = bars[i].c - bars[i - 1].c;
    if (change > 0) avgGain += change;
    else avgLoss += Math.abs(change);
  }
  avgGain /= rsiPeriod;
  avgLoss /= rsiPeriod;

  const rs0 = avgLoss === 0 ? 100 : avgGain / avgLoss;
  rsiValues.push({ t: bars[rsiPeriod].t, rsi: 100 - 100 / (1 + rs0) });

  for (let i = rsiPeriod + 1; i < bars.length; i++) {
    const change = bars[i].c - bars[i - 1].c;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;
    avgGain = (avgGain * (rsiPeriod - 1) + gain) / rsiPeriod;
    avgLoss = (avgLoss * (rsiPeriod - 1) + loss) / rsiPeriod;
    const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    rsiValues.push({ t: bars[i].t, rsi });
  }

  if (rsiValues.length < stochPeriod) return [];

  // Step 2: Apply stochastic formula to RSI
  const stochRaw: number[] = [];
  const stochTimestamps: number[] = [];
  for (let i = stochPeriod - 1; i < rsiValues.length; i++) {
    let minRSI = Infinity;
    let maxRSI = -Infinity;
    for (let j = i - stochPeriod + 1; j <= i; j++) {
      if (rsiValues[j].rsi < minRSI) minRSI = rsiValues[j].rsi;
      if (rsiValues[j].rsi > maxRSI) maxRSI = rsiValues[j].rsi;
    }
    const range = maxRSI - minRSI;
    const stochVal = range === 0 ? 50 : ((rsiValues[i].rsi - minRSI) / range) * 100;
    stochRaw.push(stochVal);
    stochTimestamps.push(rsiValues[i].t);
  }

  if (stochRaw.length < kSmooth) return [];

  // Step 3: %K = SMA(stochRaw, kSmooth)
  const kValues: number[] = [];
  const kTimestamps: number[] = [];
  let kSum = 0;
  for (let i = 0; i < kSmooth; i++) kSum += stochRaw[i];
  for (let i = kSmooth - 1; i < stochRaw.length; i++) {
    if (i >= kSmooth) kSum += stochRaw[i] - stochRaw[i - kSmooth];
    kValues.push(kSum / kSmooth);
    kTimestamps.push(stochTimestamps[i]);
  }

  if (kValues.length < dSmooth) return [];

  // Step 4: %D = SMA(%K, dSmooth)
  const result: StochasticPoint[] = [];
  let dSum = 0;
  for (let i = 0; i < dSmooth; i++) dSum += kValues[i];
  for (let i = dSmooth - 1; i < kValues.length; i++) {
    if (i >= dSmooth) dSum += kValues[i] - kValues[i - dSmooth];
    result.push({
      t: kTimestamps[i],
      k: kValues[i],
      d: dSum / dSmooth,
    });
  }

  return result;
}
