/**
 * theme.ts -- Chart rendering theme (syncs with workspace CSS variables)
 *
 * THEME is a mutable singleton. `syncThemeWithCSS()` reads CSS variables set
 * by ThemeProvider and updates THEME in-place. Every renderer that imports
 * THEME reads properties at draw-time, so they see the latest values.
 */

// Helper: hex "#RRGGBB" → "rgba(r,g,b,a)"
function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return `rgba(0,0,0,${alpha})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ── Default (dark fallback — used before CSS vars are resolved) ─────────────
const DEFAULTS = {
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
  level30_70: "rgba(239,83,80,0.2)",
  level70_30: "rgba(38,166,154,0.2)",
  zeroLine: "rgba(149,152,161,0.3)",
};

// ── Mutable THEME — updated in-place by syncThemeWithCSS() ──────────────────
export const THEME: Record<string, string> & typeof DEFAULTS = { ...DEFAULTS };

/**
 * Read CSS variables from :root and update THEME in-place.
 * Call this once per render frame (getComputedStyle is cached, ~0 cost).
 */
export function syncThemeWithCSS(): void {
  if (typeof document === "undefined") return;

  const s = getComputedStyle(document.documentElement);
  const get = (v: string): string => s.getPropertyValue(v).trim();

  // Read the workspace theme CSS variables
  const bgDeep    = get("--bg-deep")       || DEFAULTS.canvasBg;
  const bgPanel   = get("--bg-panel")      || DEFAULTS.axisBg;
  const bgSub     = get("--bg-sub")        || DEFAULTS.labelBg;
  const borderRim = get("--border-rim")    || DEFAULTS.subPaneBorder;
  const borderSoft= get("--border-soft")   || DEFAULTS.separator;
  const textPri   = get("--text-primary")  || DEFAULTS.labelText;
  const textSec   = get("--text-secondary")|| DEFAULTS.axisText;
  const textTer   = get("--text-tertiary") || DEFAULTS.crosshairColor;
  const accent    = get("--accent-blue")   || DEFAULTS.sma1Color;

  // Map to chart-specific properties
  THEME.canvasBg       = bgDeep;
  THEME.axisBg         = bgPanel;
  THEME.axisText       = textTer;
  THEME.gridLine       = hexToRgba(borderSoft, 0.5);
  THEME.labelBg        = bgSub;
  THEME.labelText      = textPri;
  THEME.crosshairColor = textSec;
  THEME.tooltipBg      = hexToRgba(bgDeep, 0.95);
  THEME.tooltipText    = textPri;
  THEME.subPaneBg      = bgPanel;
  THEME.subPaneBorder  = borderRim;
  THEME.separator      = borderRim;
  THEME.dojiColor      = textTer;

  // Accent-driven
  THEME.sma1Color      = accent;
  THEME.drawTrendline  = accent;

  // Bull/bear stay fixed (market convention)
  // Indicator colors stay fixed (user expects consistent indicator palette)
}
