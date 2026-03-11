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
    ],
    color: "#FFD54F",
  },
  {
    id: "sma50", name: "Simple Moving Average", shortName: "SMA",
    category: "overlay",
    params: [
      { key: "period", label: "Period", type: "number", default: 50, min: 2, max: 500, step: 1 },
    ],
    color: "#FF8A65",
  },
  {
    id: "sma200", name: "Simple Moving Average", shortName: "SMA",
    category: "overlay",
    params: [
      { key: "period", label: "Period", type: "number", default: 200, min: 2, max: 500, step: 1 },
    ],
    color: "#FF5252",
  },
  {
    id: "ema20", name: "Exponential Moving Average", shortName: "EMA",
    category: "overlay",
    params: [
      { key: "period", label: "Period", type: "number", default: 20, min: 2, max: 500, step: 1 },
    ],
    color: "#26C6DA",
  },
  {
    id: "ema50", name: "Exponential Moving Average", shortName: "EMA",
    category: "overlay",
    params: [
      { key: "period", label: "Period", type: "number", default: 50, min: 2, max: 500, step: 1 },
    ],
    color: "#00E676",
  },
  {
    id: "hma9", name: "Hull Moving Average", shortName: "HMA",
    category: "overlay",
    params: [
      { key: "period", label: "Period", type: "number", default: 9, min: 2, max: 500, step: 1 },
    ],
    color: "#00E676",
  },
  {
    id: "tema20", name: "Triple EMA", shortName: "TEMA",
    category: "overlay",
    params: [
      { key: "period", label: "Period", type: "number", default: 20, min: 2, max: 500, step: 1 },
    ],
    color: "#FF4081",
  },
  {
    id: "vwap", name: "Volume Weighted Average Price", shortName: "VWAP",
    category: "overlay",
    params: [],
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
      { key: "period", label: "Period", type: "number", default: 14, min: 2, max: 100, step: 1 },
    ],
    color: "#7B1FA2",
  },
  {
    id: "macd", name: "MACD", shortName: "MACD",
    category: "subpane",
    params: [
      { key: "fast", label: "Fast", type: "number", default: 12, min: 2, max: 100, step: 1 },
      { key: "slow", label: "Slow", type: "number", default: 26, min: 2, max: 200, step: 1 },
      { key: "signal", label: "Signal", type: "number", default: 9, min: 2, max: 50, step: 1 },
    ],
    color: "#2962FF",
  },
  {
    id: "stochastic", name: "Stochastic", shortName: "STOCH",
    category: "subpane",
    params: [
      { key: "kPeriod", label: "K Period", type: "number", default: 14, min: 2, max: 100, step: 1 },
      { key: "dPeriod", label: "D Period", type: "number", default: 3, min: 1, max: 50, step: 1 },
    ],
    color: "#FF6D00",
  },
  {
    id: "stochRSI", name: "Stochastic RSI", shortName: "SRSI",
    category: "subpane",
    params: [
      { key: "rsiPeriod", label: "RSI Period", type: "number", default: 14, min: 2, max: 100, step: 1 },
      { key: "stochPeriod", label: "Stoch Period", type: "number", default: 14, min: 2, max: 100, step: 1 },
      { key: "kSmooth", label: "K Smooth", type: "number", default: 3, min: 1, max: 20, step: 1 },
      { key: "dSmooth", label: "D Smooth", type: "number", default: 3, min: 1, max: 20, step: 1 },
    ],
    color: "#FF6D00",
  },
  {
    id: "williamsR", name: "Williams %R", shortName: "W%R",
    category: "subpane",
    params: [
      { key: "period", label: "Period", type: "number", default: 14, min: 2, max: 100, step: 1 },
    ],
    color: "#FF6D00",
  },
  {
    id: "cci", name: "CCI", shortName: "CCI",
    category: "subpane",
    params: [
      { key: "period", label: "Period", type: "number", default: 20, min: 2, max: 200, step: 1 },
    ],
    color: "#2196F3",
  },
  {
    id: "adx", name: "ADX", shortName: "ADX",
    category: "subpane",
    params: [
      { key: "period", label: "Period", type: "number", default: 14, min: 2, max: 100, step: 1 },
    ],
    color: "#787B86",
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
    if (p.type === "number") {
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
