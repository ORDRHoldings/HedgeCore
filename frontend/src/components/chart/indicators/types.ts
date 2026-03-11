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

export interface SuperTrendPoint { t: number; value: number; direction: "up" | "down"; }
export interface ChandelierPoint { t: number; longStop: number; shortStop: number; }
export interface ChandeKrollPoint { t: number; stop1: number; stop2: number; }
export interface AlligatorPoint { t: number; jaw: number; teeth: number; lips: number; }
export interface ZigzagPoint { t: number; price: number; barIndex: number; direction: "up" | "down"; }
export interface FibLevel { ratio: number; price: number; label: string; }
export interface AutoFibData { t: number; high: number; low: number; levels: FibLevel[]; isUptrend: boolean; }
export interface MARibbonData { period: number; color: string; points: IndicatorPoint[]; }
export interface BullBearPoint { t: number; bull: number; bear: number; }
export interface KlingerPoint { t: number; kvo: number; signal: number; }
export interface PPOPoint { t: number; ppo: number; signal: number; histogram: number; }
export interface RVIPoint { t: number; rvi: number; signal: number; }
export interface SMIPoint { t: number; smi: number; signal: number; }
export interface TSIPoint { t: number; tsi: number; signal: number; }
export interface VortexPoint { t: number; viPlus: number; viMinus: number; }
export interface AroonPoint { t: number; up: number; down: number; oscillator: number; }
