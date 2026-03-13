/**
 * ORDR Market — Technical Analysis Calculations
 * Pure functions for indicator computation on OHLCV bar data.
 */

export interface BarData {
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

// ── SMA ──────────────────────────────────────────────────────────────────────
export function calcSMA(closes: number[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length < period) return result;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += closes[i];
  result[period - 1] = sum / period;
  for (let i = period; i < closes.length; i++) {
    sum += closes[i] - closes[i - period];
    result[i] = sum / period;
  }
  return result;
}

// ── EMA ──────────────────────────────────────────────────────────────────────
export function calcEMA(closes: number[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length < period) return result;
  const k = 2 / (period + 1);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += closes[i];
  let ema = sum / period;
  result[period - 1] = ema;
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
    result[i] = ema;
  }
  return result;
}

// ── Bollinger Bands ──────────────────────────────────────────────────────────
export function calcBB(closes: number[], period: number, mult: number): {
  upper: (number | null)[];
  middle: (number | null)[];
  lower: (number | null)[];
} {
  const middle = calcSMA(closes, period);
  const upper: (number | null)[] = new Array(closes.length).fill(null);
  const lower: (number | null)[] = new Array(closes.length).fill(null);
  for (let i = period - 1; i < closes.length; i++) {
    const m = middle[i]!;
    let sumSq = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sumSq += (closes[j] - m) ** 2;
    }
    const std = Math.sqrt(sumSq / period);
    upper[i] = m + mult * std;
    lower[i] = m - mult * std;
  }
  return { upper, middle, lower };
}

// ── RSI ──────────────────────────────────────────────────────────────────────
export function calcRSI(closes: number[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length < period + 1) return result;
  let gainSum = 0, lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const delta = closes[i] - closes[i - 1];
    if (delta > 0) gainSum += delta; else lossSum -= delta;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  result[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < closes.length; i++) {
    const delta = closes[i] - closes[i - 1];
    const gain = delta > 0 ? delta : 0;
    const loss = delta < 0 ? -delta : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return result;
}

// ── MACD ─────────────────────────────────────────────────────────────────────
export function calcMACD(closes: number[], fast: number, slow: number, sig: number): {
  macd: (number | null)[];
  signal: (number | null)[];
  histogram: (number | null)[];
} {
  const emaFast = calcEMA(closes, fast);
  const emaSlow = calcEMA(closes, slow);
  const macdLine: (number | null)[] = new Array(closes.length).fill(null);
  const macdVals: number[] = [];
  const macdIdxs: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (emaFast[i] !== null && emaSlow[i] !== null) {
      macdLine[i] = emaFast[i]! - emaSlow[i]!;
      macdVals.push(macdLine[i]!);
      macdIdxs.push(i);
    }
  }
  const sigEma = calcEMA(macdVals, sig);
  const signal: (number | null)[] = new Array(closes.length).fill(null);
  const histogram: (number | null)[] = new Array(closes.length).fill(null);
  for (let j = 0; j < sigEma.length; j++) {
    if (sigEma[j] !== null) {
      const idx = macdIdxs[j];
      signal[idx] = sigEma[j];
      histogram[idx] = macdLine[idx]! - sigEma[j]!;
    }
  }
  return { macd: macdLine, signal, histogram };
}

// ── VWAP ─────────────────────────────────────────────────────────────────────
export function calcVWAP(bars: BarData[]): (number | null)[] {
  const result: (number | null)[] = [];
  let cumPV = 0, cumV = 0;
  for (const b of bars) {
    const tp = (b.h + b.l + b.c) / 3;
    cumPV += tp * b.v;
    cumV += b.v;
    result.push(cumV > 0 ? cumPV / cumV : null);
  }
  return result;
}

// ── HMA (Hull Moving Average) ────────────────────────────────────────────────
export function calcHMA(closes: number[], period: number): (number | null)[] {
  const half = Math.floor(period / 2);
  const sqrtP = Math.floor(Math.sqrt(period));
  const wmaHalf = calcEMA(closes, half);
  const wmaFull = calcEMA(closes, period);
  const diff: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (wmaHalf[i] !== null && wmaFull[i] !== null) {
      diff.push(2 * wmaHalf[i]! - wmaFull[i]!);
    } else {
      diff.push(closes[i]);
    }
  }
  return calcEMA(diff, sqrtP);
}
