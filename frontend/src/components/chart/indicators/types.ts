export interface Bar {
  t: number;  // unix timestamp
  o: number;  // open
  h: number;  // high
  l: number;  // low
  c: number;  // close
  v: number;  // volume
}

export interface IndicatorPoint {
  t: number;
  value: number;
}

export interface BandPoint {
  t: number;
  upper: number;
  middle: number;
  lower: number;
}

export interface MACDPoint {
  t: number;
  macd: number;
  signal: number;
  histogram: number;
}

export interface SRLevel {
  price: number;
  strength: number;  // touch count
  type: "support" | "resistance";
}

export interface FVGZone {
  startIndex: number;
  endIndex: number;
  top: number;
  bottom: number;
  type: "bullish" | "bearish";
  t: number;  // timestamp of the middle candle
}

export interface TrendLine {
  x1: number;  // timestamp
  y1: number;  // price
  x2: number;
  y2: number;
  touches: number;
  direction: "up" | "down";
}

export interface StochasticPoint {
  t: number;
  k: number;
  d: number;
}

export interface ADXPoint {
  t: number;
  adx: number;
  plusDI: number;
  minusDI: number;
}

export interface IchimokuPoint {
  t: number;
  tenkan: number;
  kijun: number;
  senkouA: number;
  senkouB: number;
  chikou: number;
}

export interface VolumeProfileLevel {
  price: number;
  volume: number;
  buyVolume: number;
  sellVolume: number;
  percentage: number;
}

export interface VolumeProfileData {
  levels: VolumeProfileLevel[];
  poc: number;
  vahPrice: number;
  valPrice: number;
  totalVolume: number;
}

export interface PivotPointData {
  pp: number;
  r1: number;
  r2: number;
  r3: number;
  s1: number;
  s2: number;
  s3: number;
}
