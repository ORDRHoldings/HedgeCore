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

export interface OrderBlock {
  barIndex: number;
  t: number;
  top: number;
  bottom: number;
  type: "bullish" | "bearish";
  breached: boolean;
}

export interface LiquidityZone {
  price: number;
  top: number;
  bottom: number;
  type: "buy-side" | "sell-side";
  strength: number;  // number of swing points in cluster
  startIndex: number;
  t: number;
}

export interface TrendLine {
  x1: number;  // timestamp
  y1: number;  // price
  x2: number;
  y2: number;
  touches: number;
  direction: "up" | "down";
}

export interface SwingPoint {
  idx: number;     // bar index
  t: number;       // timestamp
  price: number;   // high (for swing highs) or low (for swing lows)
  type: "high" | "low";
  label: "HH" | "LH" | "HL" | "LL";  // structure classification
}

export interface StructureEvent {
  idx: number;     // bar index where break occurred
  t: number;       // timestamp
  price: number;   // level that was broken
  kind: "BOS" | "CHoCH";
  direction: "bullish" | "bearish";
}

export interface MarketStructureData {
  swings: SwingPoint[];
  events: StructureEvent[];
}

// ── Divergence Engine ─────────────────────────────────────────────────────────

export interface DivergenceLine {
  idx1: number;     // bar index of first pivot
  idx2: number;     // bar index of second pivot
  price1: number;   // price high/low at idx1
  price2: number;   // price high/low at idx2
  osc1: number;     // oscillator value at idx1
  osc2: number;     // oscillator value at idx2
  kind: "regular" | "hidden";
  direction: "bullish" | "bearish";
  /** Absolute % price move between the two pivots */
  pctMove: number;
}

// ── Chart Patterns ────────────────────────────────────────────────────────────

export type PatternType =
  | "doubleTop" | "doubleBottom"
  | "headAndShoulders" | "inverseHeadAndShoulders"
  | "bullFlag" | "bearFlag"
  | "ascendingTriangle" | "descendingTriangle" | "symmetricTriangle"
  | "risingWedge" | "fallingWedge";

export interface ChartPattern {
  type: PatternType;
  direction: "bullish" | "bearish";
  /** Detection confidence 0–1 */
  confidence: number;
  startIdx: number;
  endIdx: number;
  /** Annotated key points (peaks, troughs, neckline touches) */
  keyPoints: { idx: number; price: number; label: string }[];
  /** Horizontal neckline price level */
  neckline?: number;
  /** Projected price target */
  target?: number;
  /** Suggested stop level */
  stop?: number;
  /** True when price has confirmed the break */
  confirmed: boolean;
}

export interface ChartPatternData {
  patterns: ChartPattern[];
}

// ── Volatility Cone ───────────────────────────────────────────────────────────

export interface VolatilityConeData {
  /** Bar index from which to project (last visible bar or last computed bar) */
  anchorIdx: number;
  /** Close price at the anchor bar */
  anchorPrice: number;
  /** Annualized historical volatility as decimal (e.g. 0.20 = 20%) */
  annualHV: number;
  /** How many bars map to one year (252 daily, 52 weekly, 12 monthly) */
  barsPerYear: number;
  /** Number of bars to project forward */
  forwardBars: number;
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

// ── Sub-pane data bundles (points + config passed as one object) ───────────────

export interface RSISubPane {
  points: IndicatorPoint[];
  signal: IndicatorPoint[];   // EMA of RSI (empty when signalPeriod === 0)
  obLevel: number;            // overbought level (default 70)
  osLevel: number;            // oversold level (default 30)
  period: number;
  divergences?: DivergenceLine[];
}

export interface StochSubPane {
  points: StochasticPoint[];
  obLevel: number;            // default 80
  osLevel: number;            // default 20
}

export interface WilliamsRSubPane {
  points: IndicatorPoint[];
  obLevel: number;            // default -20
  osLevel: number;            // default -80
}

export interface CCISubPane {
  points: IndicatorPoint[];
  obLevel: number;            // default 100
  osLevel: number;            // default -100
}

export interface ADXSubPane {
  points: ADXPoint[];
  threshold: number;          // trend strength threshold (default 25)
  showPlusDI: boolean;
  showMinusDI: boolean;
  showADX: boolean;
}

export interface ATRSubPane {
  points: IndicatorPoint[];   // ATR values (absolute or % of price)
  ma: IndicatorPoint[];       // SMA of ATR (empty when maPeriod === 0)
  percentMode: boolean;       // true → show as % of close
  period: number;
}
