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
