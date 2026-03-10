/**
 * theme.ts -- Centralized dark theme constants (TradingView-inspired)
 *
 * Single source of truth for all chart rendering colors.
 * Every renderer imports from here; no hardcoded hex in drawing code.
 */

export const THEME = {
  // Canvas
  canvasBg: "#131722",

  // Axes
  axisBg: "#1E222D",
  axisText: "#787B86",
  gridLine: "rgba(42,46,57,0.5)",
  axisFont: "11px 'IBM Plex Mono', monospace",

  // Candles
  bullBody: "#26A69A",
  bullWick: "#26A69A",
  bearBody: "#EF5350",
  bearWick: "#EF5350",
  dojiColor: "#787B86",

  // Volume
  bullVol: "rgba(38,166,154,0.3)",
  bearVol: "rgba(239,83,80,0.3)",

  // Crosshair
  crosshairColor: "#9598A1",
  labelBg: "#2A2E39",
  labelText: "#D1D4DC",

  // Tooltip
  tooltipBg: "rgba(19,23,34,0.95)",
  tooltipText: "#D1D4DC",
  tooltipGreen: "#26A69A",
  tooltipRed: "#EF5350",

  // Indicators
  sma1Color: "#2962FF",
  sma2Color: "#FF6D00",
  emaColor: "#9C27B0",
  bbFill: "rgba(33,150,243,0.06)",
  bbLine: "#2196F3",
  kcFill: "rgba(255,152,0,0.06)",
  kcLine: "#FF9800",
  vwapColor: "#E91E63",

  // Sub-pane
  subPaneBg: "#1E222D",
  subPaneBorder: "#2A2E39",
  rsiColor: "#7B1FA2",
  macdLine: "#2962FF",
  macdSignal: "#FF6D00",
  macdHistPos: "rgba(38,166,154,0.5)",
  macdHistNeg: "rgba(239,83,80,0.5)",
  stochK: "#2962FF",
  stochD: "#FF6D00",

  // S/R, FVG, Trendlines
  supportColor: "rgba(38,166,154,",  // append alpha + ")"
  resistanceColor: "rgba(239,83,80,",
  fvgBullFill: "rgba(38,166,154,0.08)",
  fvgBearFill: "rgba(239,83,80,0.08)",
  fvgBullBorder: "rgba(38,166,154,0.25)",
  fvgBearBorder: "rgba(239,83,80,0.25)",

  // Volume Profile
  vpBuyColor: "rgba(38,166,154,0.5)",
  vpSellColor: "rgba(239,83,80,0.5)",
  vpPocColor: "#FFEB3B",
  vpVahValColor: "rgba(255,235,59,0.4)",

  // Drawings
  drawTrendline: "#2962FF",
  drawHorizontal: "#FF9800",
  drawFibonacci: "#9C27B0",
  drawRectangle: "#00BCD4",

  // Separator
  separator: "#2A2E39",

  // Level guides
  level30_70: "rgba(239,83,80,0.2)",  // RSI 70, Stoch 80
  level70_30: "rgba(38,166,154,0.2)",  // RSI 30, Stoch 20
  zeroLine: "rgba(149,152,161,0.3)",
} as const;
