/**
 * indicatorSchema.ts -- Schema-driven indicator parameter definitions
 *
 * Single source of truth for all chart indicator parameters.
 * Each indicator declares its configurable params with type, defaults,
 * min/max bounds, and step values. Used by IndicatorSettingsPanel
 * for live parameter editing and by ChartEngine for computation.
 */

/* ================================================================
   Types
   ================================================================ */

export interface IndicatorParam {
  key: string;
  label: string;
  type: "number" | "select";
  default: number | string;
  min?: number;
  max?: number;
  step?: number;
  options?: { value: string | number; label: string }[];
}

export interface IndicatorSchema {
  id: string;
  name: string;
  shortName: string;
  category: "overlay" | "subpane";
  params: IndicatorParam[];
  color: string;
}

/* ================================================================
   Registry
   ================================================================ */

export const INDICATOR_SCHEMA: IndicatorSchema[] = [
  // --- Trend Overlays ---
  {
    id: "sma20", name: "Simple Moving Average", shortName: "SMA",
    category: "overlay",
    params: [
      { key: "period", label: "Period", type: "number", default: 20, min: 2, max: 500, step: 1 },
      { key: "thickness", label: "Thickness", type: "number", default: 1.5, min: 0.5, max: 5, step: 0.5 },
      { key: "priceColor", label: "Price Color", type: "number", default: 0, min: 0, max: 1, step: 1 },
    ],
    color: "#FFD54F",
  },
  {
    id: "sma50", name: "Simple Moving Average", shortName: "SMA",
    category: "overlay",
    params: [
      { key: "period", label: "Period", type: "number", default: 50, min: 2, max: 500, step: 1 },
      { key: "thickness", label: "Thickness", type: "number", default: 1.5, min: 0.5, max: 5, step: 0.5 },
      { key: "priceColor", label: "Price Color", type: "number", default: 0, min: 0, max: 1, step: 1 },
    ],
    color: "#FF8A65",
  },
  {
    id: "sma200", name: "Simple Moving Average", shortName: "SMA",
    category: "overlay",
    params: [
      { key: "period", label: "Period", type: "number", default: 200, min: 2, max: 500, step: 1 },
      { key: "thickness", label: "Thickness", type: "number", default: 1.5, min: 0.5, max: 5, step: 0.5 },
      { key: "priceColor", label: "Price Color", type: "number", default: 0, min: 0, max: 1, step: 1 },
    ],
    color: "#FF5252",
  },
  {
    id: "ema20", name: "Exponential Moving Average", shortName: "EMA",
    category: "overlay",
    params: [
      { key: "period", label: "Period", type: "number", default: 20, min: 2, max: 500, step: 1 },
      { key: "thickness", label: "Thickness", type: "number", default: 1.5, min: 0.5, max: 5, step: 0.5 },
      { key: "priceColor", label: "Price Color", type: "number", default: 0, min: 0, max: 1, step: 1 },
    ],
    color: "#26C6DA",
  },
  {
    id: "ema50", name: "Exponential Moving Average", shortName: "EMA",
    category: "overlay",
    params: [
      { key: "period", label: "Period", type: "number", default: 50, min: 2, max: 500, step: 1 },
      { key: "thickness", label: "Thickness", type: "number", default: 1.5, min: 0.5, max: 5, step: 0.5 },
      { key: "priceColor", label: "Price Color", type: "number", default: 0, min: 0, max: 1, step: 1 },
    ],
    color: "#00E676",
  },
  {
    id: "hma9", name: "Hull Moving Average", shortName: "HMA",
    category: "overlay",
    params: [
      { key: "period", label: "Period", type: "number", default: 9, min: 2, max: 500, step: 1 },
      { key: "thickness", label: "Thickness", type: "number", default: 1.5, min: 0.5, max: 5, step: 0.5 },
      { key: "priceColor", label: "Price Color", type: "number", default: 0, min: 0, max: 1, step: 1 },
    ],
    color: "#00E676",
  },
  {
    id: "tema20", name: "Triple EMA", shortName: "TEMA",
    category: "overlay",
    params: [
      { key: "period", label: "Period", type: "number", default: 20, min: 2, max: 500, step: 1 },
      { key: "thickness", label: "Thickness", type: "number", default: 1.5, min: 0.5, max: 5, step: 0.5 },
      { key: "priceColor", label: "Price Color", type: "number", default: 0, min: 0, max: 1, step: 1 },
    ],
    color: "#FF4081",
  },
  {
    id: "vwap", name: "Volume Weighted Average Price", shortName: "VWAP",
    category: "overlay",
    params: [
      { key: "showBands", label: "SD Bands", type: "number", default: 0, min: 0, max: 1, step: 1 },
      { key: "bandMult", label: "Band Mult", type: "number", default: 1, min: 0.5, max: 4, step: 0.5 },
    ],
    color: "#E91E63",
  },
  {
    id: "ichimoku", name: "Ichimoku Cloud", shortName: "ICHI",
    category: "overlay",
    params: [
      { key: "tenkan", label: "Tenkan", type: "number", default: 9, min: 2, max: 100, step: 1 },
      { key: "kijun", label: "Kijun", type: "number", default: 26, min: 2, max: 200, step: 1 },
      { key: "senkouB", label: "Senkou B", type: "number", default: 52, min: 2, max: 500, step: 1 },
    ],
    color: "#2962FF",
  },
  {
    id: "parabolicSAR", name: "Parabolic SAR", shortName: "SAR",
    category: "overlay",
    params: [
      { key: "afStart", label: "AF Start", type: "number", default: 0.02, min: 0.001, max: 0.1, step: 0.001 },
      { key: "afMax", label: "AF Max", type: "number", default: 0.2, min: 0.05, max: 1.0, step: 0.01 },
    ],
    color: "#26A69A",
  },

  // --- Volatility Overlays ---
  {
    id: "bollinger", name: "Bollinger Bands", shortName: "BB",
    category: "overlay",
    params: [
      { key: "period", label: "Period", type: "number", default: 20, min: 2, max: 200, step: 1 },
      { key: "stdDev", label: "Std Dev", type: "number", default: 2, min: 0.5, max: 5, step: 0.5 },
      { key: "source", label: "Source", type: "select", default: 0,
        options: [
          { value: 0, label: "Close" },
          { value: 1, label: "HLC/3" },
          { value: 2, label: "HL/2" },
          { value: 3, label: "OHLC/4" },
          { value: 4, label: "Weighted" },
        ],
      },
      { key: "showSqueeze", label: "Squeeze", type: "number", default: 1, min: 0, max: 1, step: 1 },
    ],
    color: "#2196F3",
  },
  {
    id: "keltner", name: "Keltner Channel", shortName: "KC",
    category: "overlay",
    params: [
      { key: "emaPeriod", label: "EMA Period", type: "number", default: 20, min: 2, max: 200, step: 1 },
      { key: "atrPeriod", label: "ATR Period", type: "number", default: 10, min: 2, max: 100, step: 1 },
      { key: "multiplier", label: "Multiplier", type: "number", default: 1.5, min: 0.5, max: 5, step: 0.1 },
    ],
    color: "#FF9800",
  },
  {
    id: "donchian", name: "Donchian Channel", shortName: "DC",
    category: "overlay",
    params: [
      { key: "period", label: "Period", type: "number", default: 20, min: 2, max: 200, step: 1 },
      { key: "showBreakout", label: "Breakouts", type: "number", default: 1, min: 0, max: 1, step: 1 },
    ],
    color: "#00BCD4",
  },

  // --- Volume Overlays ---
  {
    id: "volumeProfile", name: "Volume Profile", shortName: "VP",
    category: "overlay",
    params: [
      { key: "numLevels", label: "Levels", type: "number", default: 50, min: 10, max: 200, step: 5 },
    ],
    color: "#FFEB3B",
  },

  // --- Smart Money Overlays (no tunable params) ---
  {
    id: "sr", name: "Support / Resistance", shortName: "S/R",
    category: "overlay",
    params: [],
    color: "#26A69A",
  },
  {
    id: "fvg", name: "Fair Value Gaps", shortName: "FVG",
    category: "overlay",
    params: [],
    color: "#26A69A",
  },
  {
    id: "trendlines", name: "Auto Trendlines", shortName: "TREND",
    category: "overlay",
    params: [],
    color: "#EF5350",
  },
  {
    id: "pivotPoints", name: "Pivot Points", shortName: "PIVOT",
    category: "overlay",
    params: [],
    color: "#9598A1",
  },

  // --- Oscillator Sub-panes ---
  {
    id: "rsi", name: "Relative Strength Index", shortName: "RSI",
    category: "subpane",
    params: [
      { key: "period",       label: "Period",       type: "number", default: 14,  min: 2,  max: 100, step: 1 },
      { key: "obLevel",      label: "OB Level",     type: "number", default: 70,  min: 50, max: 95,  step: 1 },
      { key: "osLevel",      label: "OS Level",     type: "number", default: 30,  min: 5,  max: 50,  step: 1 },
      { key: "signalPeriod", label: "Signal EMA",   type: "number", default: 0,   min: 0,  max: 50,  step: 1 },
      { key: "source", label: "Source", type: "select", default: 0,
        options: [
          { value: 0, label: "Close" },
          { value: 1, label: "HLC/3" },
          { value: 2, label: "HL/2" },
          { value: 3, label: "OHLC/4" },
          { value: 4, label: "Weighted Close" },
        ],
      },
    ],
    color: "#7B1FA2",
  },
  {
    id: "macd", name: "MACD", shortName: "MACD",
    category: "subpane",
    params: [
      { key: "fast",   label: "Fast",   type: "number", default: 12, min: 2,  max: 100, step: 1 },
      { key: "slow",   label: "Slow",   type: "number", default: 26, min: 2,  max: 200, step: 1 },
      { key: "signal", label: "Signal", type: "number", default: 9,  min: 2,  max: 50,  step: 1 },
    ],
    color: "#2962FF",
  },
  {
    id: "stochastic", name: "Stochastic", shortName: "STOCH",
    category: "subpane",
    params: [
      { key: "kPeriod", label: "K Period", type: "number", default: 14, min: 2,  max: 100, step: 1 },
      { key: "dPeriod", label: "D Period", type: "number", default: 3,  min: 1,  max: 50,  step: 1 },
      { key: "obLevel", label: "OB Level", type: "number", default: 80, min: 55, max: 95,  step: 1 },
      { key: "osLevel", label: "OS Level", type: "number", default: 20, min: 5,  max: 45,  step: 1 },
    ],
    color: "#FF6D00",
  },
  {
    id: "stochRSI", name: "Stochastic RSI", shortName: "SRSI",
    category: "subpane",
    params: [
      { key: "rsiPeriod",   label: "RSI Period",   type: "number", default: 14, min: 2,  max: 100, step: 1 },
      { key: "stochPeriod", label: "Stoch Period", type: "number", default: 14, min: 2,  max: 100, step: 1 },
      { key: "kSmooth",     label: "K Smooth",     type: "number", default: 3,  min: 1,  max: 20,  step: 1 },
      { key: "dSmooth",     label: "D Smooth",     type: "number", default: 3,  min: 1,  max: 20,  step: 1 },
      { key: "obLevel",     label: "OB Level",     type: "number", default: 80, min: 55, max: 95,  step: 1 },
      { key: "osLevel",     label: "OS Level",     type: "number", default: 20, min: 5,  max: 45,  step: 1 },
    ],
    color: "#FF6D00",
  },
  {
    id: "williamsR", name: "Williams %R", shortName: "W%R",
    category: "subpane",
    params: [
      { key: "period",  label: "Period",   type: "number", default: 14,  min: 2,   max: 100, step: 1 },
      { key: "obLevel", label: "OB Level", type: "number", default: -20, min: -45, max: -5,  step: 1 },
      { key: "osLevel", label: "OS Level", type: "number", default: -80, min: -95, max: -55, step: 1 },
    ],
    color: "#FF6D00",
  },
  {
    id: "cci", name: "CCI", shortName: "CCI",
    category: "subpane",
    params: [
      { key: "period",  label: "Period",   type: "number", default: 20,   min: 2,    max: 200,  step: 1 },
      { key: "obLevel", label: "OB Level", type: "number", default: 100,  min: 50,   max: 300,  step: 10 },
      { key: "osLevel", label: "OS Level", type: "number", default: -100, min: -300, max: -50,  step: 10 },
    ],
    color: "#2196F3",
  },
  {
    id: "adx", name: "ADX", shortName: "ADX",
    category: "subpane",
    params: [
      { key: "period",      label: "Period",    type: "number", default: 14, min: 2,  max: 100, step: 1 },
      { key: "threshold",   label: "Threshold", type: "number", default: 25, min: 10, max: 60,  step: 1 },
      { key: "showPlusDI",  label: "+DI",       type: "number", default: 1,  min: 0,  max: 1,   step: 1 },
      { key: "showMinusDI", label: "-DI",       type: "number", default: 1,  min: 0,  max: 1,   step: 1 },
      { key: "showADX",     label: "ADX Line",  type: "number", default: 1,  min: 0,  max: 1,   step: 1 },
    ],
    color: "#787B86",
  },
  {
    id: "atr", name: "Average True Range", shortName: "ATR",
    category: "subpane",
    params: [
      { key: "period",      label: "Period",    type: "number", default: 14, min: 2,  max: 200, step: 1 },
      { key: "percentMode", label: "% of Price",type: "number", default: 0,  min: 0,  max: 1,   step: 1 },
      { key: "maPeriod",    label: "MA Period", type: "number", default: 0,  min: 0,  max: 100, step: 1 },
    ],
    color: "#26C6DA",
  },
  {
    id: "obv", name: "On-Balance Volume", shortName: "OBV",
    category: "subpane",
    params: [],
    color: "#FF9800",
  },
  {
    id: "mfi", name: "Money Flow Index", shortName: "MFI",
    category: "subpane",
    params: [
      { key: "period", label: "Period", type: "number", default: 14, min: 2, max: 100, step: 1 },
    ],
    color: "#E040FB",
  },
  {
    id: "cmf", name: "Chaikin Money Flow", shortName: "CMF",
    category: "subpane",
    params: [
      { key: "period", label: "Period", type: "number", default: 20, min: 2, max: 200, step: 1 },
    ],
    color: "#00BCD4",
  },

  // --- MA Variants ---
  { id: "wma", name: "Weighted Moving Average", shortName: "WMA", category: "overlay",
    params: [
      { key: "period", label: "Period", type: "number", default: 20, min: 2, max: 500, step: 1 },
      { key: "thickness", label: "Thickness", type: "number", default: 1.5, min: 0.5, max: 5, step: 0.5 },
      { key: "priceColor", label: "Price Color", type: "number", default: 0, min: 0, max: 1, step: 1 },
    ], color: "#FF9800" },
  { id: "smma", name: "Smoothed Moving Average", shortName: "SMMA", category: "overlay",
    params: [
      { key: "period", label: "Period", type: "number", default: 20, min: 2, max: 500, step: 1 },
      { key: "thickness", label: "Thickness", type: "number", default: 1.5, min: 0.5, max: 5, step: 0.5 },
      { key: "priceColor", label: "Price Color", type: "number", default: 0, min: 0, max: 1, step: 1 },
    ], color: "#FF7043" },
  { id: "alma", name: "Arnaud Legoux MA", shortName: "ALMA", category: "overlay",
    params: [
      { key: "period", label: "Period", type: "number", default: 21, min: 2, max: 500, step: 1 },
      { key: "sigma", label: "Sigma", type: "number", default: 6, min: 1, max: 20, step: 1 },
      { key: "offset", label: "Offset", type: "number", default: 0.85, min: 0, max: 1, step: 0.05 },
      { key: "thickness", label: "Thickness", type: "number", default: 1.5, min: 0.5, max: 5, step: 0.5 },
      { key: "priceColor", label: "Price Color", type: "number", default: 0, min: 0, max: 1, step: 1 },
    ], color: "#AB47BC" },
  { id: "dema", name: "Double EMA", shortName: "DEMA", category: "overlay",
    params: [
      { key: "period", label: "Period", type: "number", default: 20, min: 2, max: 500, step: 1 },
      { key: "thickness", label: "Thickness", type: "number", default: 1.5, min: 0.5, max: 5, step: 0.5 },
      { key: "priceColor", label: "Price Color", type: "number", default: 0, min: 0, max: 1, step: 1 },
    ], color: "#26C6DA" },
  { id: "lsma", name: "Least Squares MA", shortName: "LSMA", category: "overlay",
    params: [
      { key: "period", label: "Period", type: "number", default: 25, min: 2, max: 500, step: 1 },
      { key: "thickness", label: "Thickness", type: "number", default: 1.5, min: 0.5, max: 5, step: 0.5 },
      { key: "priceColor", label: "Price Color", type: "number", default: 0, min: 0, max: 1, step: 1 },
    ], color: "#66BB6A" },
  { id: "mcginley", name: "McGinley Dynamic", shortName: "McGinley", category: "overlay",
    params: [
      { key: "period", label: "Period", type: "number", default: 14, min: 2, max: 200, step: 1 },
      { key: "thickness", label: "Thickness", type: "number", default: 1.5, min: 0.5, max: 5, step: 0.5 },
      { key: "priceColor", label: "Price Color", type: "number", default: 0, min: 0, max: 1, step: 1 },
    ], color: "#FFA726" },
  { id: "vwma", name: "Volume Weighted MA", shortName: "VWMA", category: "overlay",
    params: [
      { key: "period", label: "Period", type: "number", default: 20, min: 2, max: 200, step: 1 },
      { key: "thickness", label: "Thickness", type: "number", default: 1.5, min: 0.5, max: 5, step: 0.5 },
      { key: "priceColor", label: "Price Color", type: "number", default: 0, min: 0, max: 1, step: 1 },
    ], color: "#EC407A" },

  // --- Overlay bands / special ---
  { id: "envelope", name: "Envelope", shortName: "ENV", category: "overlay",
    params: [
      { key: "period", label: "Period", type: "number", default: 20, min: 2, max: 200, step: 1 },
      { key: "percent", label: "Percent", type: "number", default: 2.5, min: 0.1, max: 20, step: 0.1 },
    ], color: "#78909C" },
  { id: "supertrend", name: "SuperTrend", shortName: "ST", category: "overlay",
    params: [
      { key: "period", label: "Period", type: "number", default: 10, min: 2, max: 100, step: 1 },
      { key: "multiplier", label: "Multiplier", type: "number", default: 3, min: 0.5, max: 10, step: 0.5 },
      { key: "showArrows", label: "Arrows", type: "number", default: 1, min: 0, max: 1, step: 1 },
      { key: "showFill", label: "Fill", type: "number", default: 0, min: 0, max: 1, step: 1 },
      { key: "showLabel", label: "Label", type: "number", default: 1, min: 0, max: 1, step: 1 },
    ], color: "#26A69A" },
  { id: "chandelierExit", name: "Chandelier Exit", shortName: "CE", category: "overlay",
    params: [
      { key: "period", label: "Period", type: "number", default: 22, min: 2, max: 100, step: 1 },
      { key: "multiplier", label: "Multiplier", type: "number", default: 3, min: 0.5, max: 10, step: 0.5 },
      { key: "showArrows", label: "Arrows", type: "number", default: 1, min: 0, max: 1, step: 1 },
    ], color: "#26A69A" },
  { id: "chandeKrollStop", name: "Chande Kroll Stop", shortName: "CKS", category: "overlay",
    params: [
      { key: "p", label: "P", type: "number", default: 10, min: 2, max: 50, step: 1 },
      { key: "q", label: "Q", type: "number", default: 9, min: 1, max: 50, step: 1 },
      { key: "x", label: "X", type: "number", default: 1.5, min: 0.5, max: 5, step: 0.1 },
    ], color: "#EF5350" },
  { id: "alligator", name: "Williams Alligator", shortName: "ALLI", category: "overlay",
    params: [], color: "#2962FF" },
  { id: "zigzag", name: "ZigZag", shortName: "ZZ", category: "overlay",
    params: [
      { key: "depth", label: "Depth", type: "number", default: 12, min: 2, max: 50, step: 1 },
      { key: "deviation", label: "Deviation", type: "number", default: 5, min: 1, max: 20, step: 1 },
    ], color: "#FFD54F" },
  { id: "autoFib", name: "Auto Fibonacci", shortName: "AutoFib", category: "overlay",
    params: [{ key: "lookback", label: "Lookback", type: "number", default: 50, min: 20, max: 300, step: 5 }], color: "#26A69A" },
  { id: "maRibbon", name: "MA Ribbon", shortName: "Ribbon", category: "overlay",
    params: [
      { key: "showFill", label: "Trend Fill", type: "number", default: 1, min: 0, max: 1, step: 1 },
    ], color: "#EF5350" },

  // --- New oscillators ---
  { id: "ao", name: "Awesome Oscillator", shortName: "AO", category: "subpane",
    params: [], color: "#26A69A" },
  { id: "bop", name: "Balance of Power", shortName: "BOP", category: "subpane",
    params: [], color: "#9E9E9E" },
  { id: "bbtrend", name: "BB Trend", shortName: "BBTrend", category: "subpane",
    params: [{ key: "period", label: "Period", type: "number", default: 20, min: 2, max: 200, step: 1 }], color: "#2196F3" },
  { id: "bullBearPower", name: "Bull Bear Power", shortName: "BBP", category: "subpane",
    params: [{ key: "period", label: "Period", type: "number", default: 13, min: 2, max: 100, step: 1 }], color: "#26A69A" },
  { id: "chaikinOsc", name: "Chaikin Oscillator", shortName: "Chaikin Osc", category: "subpane",
    params: [
      { key: "fastPeriod", label: "Fast", type: "number", default: 3, min: 1, max: 50, step: 1 },
      { key: "slowPeriod", label: "Slow", type: "number", default: 10, min: 2, max: 100, step: 1 },
    ], color: "#00BCD4" },
  { id: "cmo", name: "Chande Momentum Oscillator", shortName: "CMO", category: "subpane",
    params: [{ key: "period", label: "Period", type: "number", default: 14, min: 2, max: 100, step: 1 }], color: "#FF6D00" },
  { id: "choppiness", name: "Choppiness Index", shortName: "Choppiness", category: "subpane",
    params: [{ key: "period", label: "Period", type: "number", default: 14, min: 2, max: 100, step: 1 }], color: "#9E9E9E" },
  { id: "chopZone", name: "Chop Zone", shortName: "Chop Zone", category: "subpane",
    params: [{ key: "period", label: "Period", type: "number", default: 30, min: 2, max: 200, step: 1 }], color: "#9E9E9E" },
  { id: "connorsRSI", name: "Connors RSI", shortName: "CRSI", category: "subpane",
    params: [
      { key: "rsiPeriod", label: "RSI", type: "number", default: 3, min: 1, max: 50, step: 1 },
      { key: "upDownPeriod", label: "UpDn", type: "number", default: 2, min: 1, max: 50, step: 1 },
      { key: "rocPeriod", label: "ROC", type: "number", default: 100, min: 10, max: 500, step: 5 },
    ], color: "#7B1FA2" },
  { id: "coppock", name: "Coppock Curve", shortName: "Coppock", category: "subpane",
    params: [], color: "#FF9800" },
  { id: "dpo", name: "Detrended Price Osc", shortName: "DPO", category: "subpane",
    params: [{ key: "period", label: "Period", type: "number", default: 21, min: 2, max: 200, step: 1 }], color: "#FF4081" },
  { id: "eom", name: "Ease of Movement", shortName: "EOM", category: "subpane",
    params: [{ key: "period", label: "Period", type: "number", default: 14, min: 1, max: 100, step: 1 }], color: "#9E9E9E" },
  { id: "efi", name: "Elder Force Index", shortName: "EFI", category: "subpane",
    params: [{ key: "period", label: "Period", type: "number", default: 13, min: 1, max: 100, step: 1 }], color: "#9E9E9E" },
  { id: "fisher", name: "Fisher Transform", shortName: "Fisher", category: "subpane",
    params: [{ key: "period", label: "Period", type: "number", default: 9, min: 2, max: 100, step: 1 }], color: "#E91E63" },
  { id: "klinger", name: "Klinger Oscillator", shortName: "Klinger", category: "subpane",
    params: [
      { key: "shortPeriod", label: "Short", type: "number", default: 34, min: 2, max: 100, step: 1 },
      { key: "longPeriod", label: "Long", type: "number", default: 55, min: 5, max: 200, step: 1 },
      { key: "signalPeriod", label: "Signal", type: "number", default: 13, min: 1, max: 50, step: 1 },
    ], color: "#2196F3" },
  { id: "kst", name: "Know Sure Thing", shortName: "KST", category: "subpane",
    params: [], color: "#FF9800" },
  { id: "massIndex", name: "Mass Index", shortName: "Mass", category: "subpane",
    params: [
      { key: "emaPeriod", label: "EMA", type: "number", default: 9, min: 2, max: 50, step: 1 },
      { key: "sumPeriod", label: "Sum", type: "number", default: 25, min: 5, max: 100, step: 1 },
    ], color: "#9C27B0" },
  { id: "momentum", name: "Momentum", shortName: "Mom", category: "subpane",
    params: [{ key: "period", label: "Period", type: "number", default: 10, min: 1, max: 200, step: 1 }], color: "#26C6DA" },
  { id: "ppo", name: "Percentage Price Osc", shortName: "PPO", category: "subpane",
    params: [
      { key: "fastPeriod", label: "Fast", type: "number", default: 12, min: 2, max: 100, step: 1 },
      { key: "slowPeriod", label: "Slow", type: "number", default: 26, min: 2, max: 200, step: 1 },
      { key: "signalPeriod", label: "Signal", type: "number", default: 9, min: 1, max: 50, step: 1 },
    ], color: "#2962FF" },
  { id: "roc", name: "Rate of Change", shortName: "ROC", category: "subpane",
    params: [{ key: "period", label: "Period", type: "number", default: 9, min: 1, max: 200, step: 1 }], color: "#00BCD4" },
  { id: "rvi", name: "Relative Vigor Index", shortName: "RVI", category: "subpane",
    params: [{ key: "period", label: "Period", type: "number", default: 10, min: 2, max: 100, step: 1 }], color: "#26C6DA" },
  { id: "smi", name: "SMI Ergodic", shortName: "SMI", category: "subpane",
    params: [
      { key: "tsiPeriod", label: "TSI", type: "number", default: 5, min: 1, max: 50, step: 1 },
      { key: "ema1Period", label: "EMA1", type: "number", default: 20, min: 2, max: 100, step: 1 },
      { key: "ema2Period", label: "EMA2", type: "number", default: 5, min: 1, max: 50, step: 1 },
    ], color: "#00E676" },
  { id: "trix", name: "TRIX", shortName: "TRIX", category: "subpane",
    params: [{ key: "period", label: "Period", type: "number", default: 18, min: 2, max: 200, step: 1 }], color: "#FF4081" },
  { id: "tsi", name: "True Strength Index", shortName: "TSI", category: "subpane",
    params: [
      { key: "longPeriod", label: "Long", type: "number", default: 25, min: 2, max: 100, step: 1 },
      { key: "shortPeriod", label: "Short", type: "number", default: 13, min: 1, max: 50, step: 1 },
      { key: "signalPeriod", label: "Signal", type: "number", default: 13, min: 1, max: 50, step: 1 },
    ], color: "#7B1FA2" },
  { id: "ultimateOscillator", name: "Ultimate Oscillator", shortName: "UO", category: "subpane",
    params: [
      { key: "period1", label: "Period 1", type: "number", default: 7, min: 1, max: 50, step: 1 },
      { key: "period2", label: "Period 2", type: "number", default: 14, min: 2, max: 100, step: 1 },
      { key: "period3", label: "Period 3", type: "number", default: 28, min: 3, max: 200, step: 1 },
    ], color: "#FF9800" },
  { id: "vortex", name: "Vortex Indicator", shortName: "Vortex", category: "subpane",
    params: [{ key: "period", label: "Period", type: "number", default: 14, min: 2, max: 100, step: 1 }], color: "#26C6DA" },
  { id: "aroon", name: "Aroon", shortName: "Aroon", category: "subpane",
    params: [{ key: "period", label: "Period", type: "number", default: 25, min: 2, max: 200, step: 1 }], color: "#26C6DA" },

  // --- Volume oscillators ---
  { id: "adl", name: "Acc/Dist Line", shortName: "ADL", category: "subpane", params: [], color: "#FF9800" },
  { id: "cvd", name: "Cumulative Volume Delta", shortName: "CVD", category: "subpane", params: [], color: "#26C6DA" },
  { id: "cvi", name: "Chaikin Volatility", shortName: "CVI", category: "subpane",
    params: [{ key: "period", label: "Period", type: "number", default: 10, min: 2, max: 100, step: 1 }], color: "#FF6D00" },
  { id: "netVolume", name: "Net Volume", shortName: "Net Vol", category: "subpane", params: [], color: "#26A69A" },
  { id: "pvt", name: "Price Volume Trend", shortName: "PVT", category: "subpane", params: [], color: "#E91E63" },
  { id: "volumeOscillator", name: "Volume Oscillator", shortName: "Vol Osc", category: "subpane",
    params: [
      { key: "fastPeriod", label: "Fast", type: "number", default: 5, min: 1, max: 50, step: 1 },
      { key: "slowPeriod", label: "Slow", type: "number", default: 10, min: 2, max: 100, step: 1 },
    ], color: "#FF9800" },

  // --- Band/range oscillators ---
  { id: "bbPercentB", name: "BB %B", shortName: "BB %B", category: "subpane",
    params: [
      { key: "period", label: "Period", type: "number", default: 20, min: 2, max: 200, step: 1 },
      { key: "stdDev", label: "Std Dev", type: "number", default: 2, min: 0.5, max: 5, step: 0.5 },
    ], color: "#2196F3" },
  { id: "bbWidth", name: "BB Width", shortName: "BB Width", category: "subpane",
    params: [
      { key: "period", label: "Period", type: "number", default: 20, min: 2, max: 200, step: 1 },
      { key: "stdDev", label: "Std Dev", type: "number", default: 2, min: 0.5, max: 5, step: 0.5 },
    ], color: "#FF9800" },
  { id: "histVol", name: "Historical Volatility", shortName: "Hist Vol", category: "subpane",
    params: [{ key: "period", label: "Period", type: "number", default: 20, min: 5, max: 200, step: 1 }], color: "#7B1FA2" },
  { id: "correlation", name: "Correlation Coefficient", shortName: "Corr", category: "subpane",
    params: [{ key: "period", label: "Period", type: "number", default: 14, min: 2, max: 200, step: 1 }], color: "#26A69A" },
  { id: "adr", name: "Average Daily Range", shortName: "ADR", category: "subpane",
    params: [{ key: "period", label: "Period", type: "number", default: 14, min: 2, max: 100, step: 1 }], color: "#FFD54F" },
];

/* ================================================================
   Helpers
   ================================================================ */

/** Lookup schema by indicator id */
export function getIndicatorSchema(id: string): IndicatorSchema | undefined {
  return INDICATOR_SCHEMA.find((s) => s.id === id);
}

/** Build default params object for an indicator */
export function getDefaultParams(id: string): Record<string, number> {
  const schema = getIndicatorSchema(id);
  if (!schema) return {};
  const defaults: Record<string, number> = {};
  for (const p of schema.params) {
    // Both "number" and "select" (with numeric option values) are stored as numbers
    if (p.type === "number" || p.type === "select") {
      defaults[p.key] = p.default as number;
    }
  }
  return defaults;
}

/** Format indicator label with current params, e.g., "SMA(30)" or "BB(20,2)" */
export function formatIndicatorLabel(id: string, params: Record<string, number>): string {
  const schema = getIndicatorSchema(id);
  if (!schema) return id;
  if (schema.params.length === 0) return schema.shortName;
  const values = schema.params.map((p) => {
    const v = params[p.key] ?? p.default;
    // Format decimals nicely
    return typeof v === "number" && v % 1 !== 0 ? v.toFixed(2).replace(/0+$/, "").replace(/\.$/, "") : String(v);
  });
  return `${schema.shortName}(${values.join(",")})`;
}

/** Clamp a parameter value to its schema bounds */
export function clampParam(param: IndicatorParam, value: number): number {
  let clamped = value;
  if (param.min !== undefined) clamped = Math.max(param.min, clamped);
  if (param.max !== undefined) clamped = Math.min(param.max, clamped);
  return clamped;
}
