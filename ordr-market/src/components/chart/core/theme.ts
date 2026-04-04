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

// ── TradingView-exact canvas defaults (NEVER overridden by UI theme) ─────────
// These match TradingView's dark theme pixel-for-pixel.
const DEFAULTS = {
  // Canvas — locked to TV dark regardless of UI theme
  canvasBg: "#131722",

  // Axes — TV exact
  axisBg:   "#1e222d",
  axisText: "#787b86",
  gridLine: "rgba(42,46,57,0.7)",
  axisFont: "11px 'IBM Plex Mono', monospace",

  // Candles — TV exact teal/red
  bullBody: "#26a69a",
  bullWick: "#26a69a",
  bearBody: "#ef5350",
  bearWick: "#ef5350",
  dojiColor: "#787b86",

  // Volume — TV style semi-transparent
  bullVol: "rgba(38,166,154,0.45)",
  bearVol: "rgba(239,83,80,0.45)",

  // Crosshair — TV exact
  crosshairColor: "#9598a1",
  labelBg:  "#2a2e39",
  labelText: "#d1d4dc",

  // Tooltip
  tooltipBg:    "rgba(19,23,34,0.96)",
  tooltipText:  "#d1d4dc",
  tooltipGreen: "#26a69a",
  tooltipRed:   "#ef5350",

  // Indicators
  sma1Color: "#2962ff",
  sma2Color: "#ff6d00",
  emaColor:  "#9c27b0",
  bbFill:  "rgba(33,150,243,0.06)",
  bbLine:  "#2196f3",
  kcFill:  "rgba(255,152,0,0.06)",
  kcLine:  "#ff9800",
  vwapColor: "#e91e63",

  // Sub-pane — TV exact
  subPaneBg:     "#1e222d",
  subPaneBorder: "#2a2e39",
  rsiColor:      "#7b1fa2",
  macdLine:      "#2962ff",
  macdSignal:    "#ff6d00",
  macdHistPos:   "rgba(38,166,154,0.55)",
  macdHistNeg:   "rgba(239,83,80,0.55)",
  stochK: "#2962ff",
  stochD: "#ff6d00",

  // S/R, FVG
  supportColor:    "rgba(38,166,154,",
  resistanceColor: "rgba(239,83,80,",
  fvgBullFill:   "rgba(38,166,154,0.08)",
  fvgBearFill:   "rgba(239,83,80,0.08)",
  fvgBullBorder: "rgba(38,166,154,0.25)",
  fvgBearBorder: "rgba(239,83,80,0.25)",

  // Volume Profile
  vpBuyColor:   "rgba(38,166,154,0.5)",
  vpSellColor:  "rgba(239,83,80,0.5)",
  vpPocColor:   "#ffeb3b",
  vpVahValColor:"rgba(255,235,59,0.4)",

  // Drawings
  drawTrendline:  "#2962ff",
  drawHorizontal: "#ff9800",
  drawFibonacci:  "#9c27b0",
  drawRectangle:  "#00bcd4",

  // Separator — TV exact
  separator: "#2a2e39",

  // Level guides
  level30_70: "rgba(239,83,80,0.2)",
  level70_30: "rgba(38,166,154,0.2)",
  zeroLine:   "rgba(149,152,161,0.3)",
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

  // Only pull accent + text from UI theme.
  // Canvas, axis, grid, candles STAY at TradingView values — they must not
  // change with the UI theme (Void Black, light, etc.).
  const accent  = get("--accent-blue") || DEFAULTS.sma1Color;
  const textPri = get("--text-primary") || DEFAULTS.labelText;

  THEME.sma1Color     = accent;
  THEME.drawTrendline = accent;
  THEME.labelText     = textPri;
  THEME.tooltipText   = textPri;

  // Everything else (canvasBg, axisBg, gridLine, separator, candle colors,
  // crosshairColor, dojiColor, subPaneBg…) stays at DEFAULTS — TV exact.
}
