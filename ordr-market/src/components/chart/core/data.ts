import type { Bar } from "../indicators/types";

export interface Viewport {
  startIndex: number;
  endIndex: number;
  priceMin: number;
  priceMax: number;
}

export interface SubPaneLayout {
  top: number;
  height: number;
}

export interface ChartLayout {
  canvasWidth: number;
  canvasHeight: number;
  mainTop: number;
  mainHeight: number;
  volumeTop: number;
  volumeHeight: number;
  subPanes: SubPaneLayout[];
  /** @deprecated Use subPanes[0].top — kept for backward compat */
  subPaneTop: number;
  /** @deprecated Use subPanes[0].height — kept for backward compat */
  subPaneHeight: number;
  priceAxisWidth: number;
  timeAxisHeight: number;
  chartLeft: number;
  chartRight: number;
  chartWidth: number;
}

export function computeLayout(w: number, h: number, subPaneCount: number): ChartLayout {
  const priceAxisWidth = 80;
  const timeAxisHeight = 28;
  const chartLeft = 10;
  const chartRightPad = 8; // breathing room before price axis
  const chartRight = w - priceAxisWidth - chartRightPad;
  const chartWidth = chartRight - chartLeft;
  const mainTop = 40; // Room for OHLC legend row 1 + indicator chips row 2
  const volumeHeight = 80;

  const panePixels = Math.max(70, Math.floor(90));
  const totalSubPaneHeight = subPaneCount * panePixels;
  const mainHeight = Math.max(200, h - timeAxisHeight - volumeHeight - totalSubPaneHeight - mainTop);
  const volumeTop = mainTop + mainHeight;

  // Build sub-pane array
  const subPanes: SubPaneLayout[] = [];
  let subCursor = volumeTop + volumeHeight;
  for (let i = 0; i < subPaneCount; i++) {
    subPanes.push({ top: subCursor, height: panePixels });
    subCursor += panePixels;
  }

  // Backward-compatible scalar fields (first pane or zero)
  const subPaneTop = subPanes.length > 0 ? subPanes[0].top : volumeTop + volumeHeight;
  const subPaneHeight = subPanes.length > 0 ? subPanes[0].height : 0;

  return {
    canvasWidth: w, canvasHeight: h,
    mainTop, mainHeight,
    volumeTop, volumeHeight,
    subPanes,
    subPaneTop, subPaneHeight,
    priceAxisWidth, timeAxisHeight,
    chartLeft, chartRight, chartWidth,
  };
}

export function computeViewport(
  bars: Bar[],
  startIndex: number,
  endIndex: number,
  padding: number = 0.02,
): Viewport {
  if (bars.length === 0) return { startIndex: 0, endIndex: 0, priceMin: 0, priceMax: 1 };
  const si = Math.max(0, Math.floor(startIndex));
  // Don't clamp endIndex to bars.length-1 — allow future space past last bar
  const eiData = Math.min(bars.length - 1, Math.ceil(endIndex));
  let lo = Infinity, hi = -Infinity;
  for (let i = si; i <= eiData; i++) {
    if (bars[i].l < lo) lo = bars[i].l;
    if (bars[i].h > hi) hi = bars[i].h;
  }
  const range = hi - lo || 0.0001;
  return {
    startIndex: si,
    endIndex: Math.max(eiData, Math.ceil(endIndex)), // Keep the extended endIndex for spacing
    priceMin: lo - range * padding,
    priceMax: hi + range * padding,
  };
}

export type PriceScale = "linear" | "log" | "percent";

export function priceToY(
  price: number, priceMin: number, priceMax: number,
  top: number, height: number, scale: PriceScale = "linear",
): number {
  if (scale === "log" && priceMin > 0 && priceMax > 0) {
    const logMin = Math.log(priceMin);
    const logMax = Math.log(priceMax);
    const logPrice = Math.log(Math.max(price, 1e-10));
    return top + height - ((logPrice - logMin) / (logMax - logMin || 1)) * height;
  }
  return top + height - ((price - priceMin) / (priceMax - priceMin || 1)) * height;
}

export function yToPrice(
  y: number, priceMin: number, priceMax: number,
  top: number, height: number, scale: PriceScale = "linear",
): number {
  const frac = (top + height - y) / height;
  if (scale === "log" && priceMin > 0 && priceMax > 0) {
    const logMin = Math.log(priceMin);
    const logMax = Math.log(priceMax);
    return Math.exp(logMin + frac * (logMax - logMin));
  }
  return priceMin + frac * (priceMax - priceMin);
}

export function indexToX(index: number, startIndex: number, endIndex: number, chartLeft: number, chartWidth: number): number {
  const range = endIndex - startIndex || 1;
  return chartLeft + ((index - startIndex) / range) * chartWidth;
}

export function xToIndex(x: number, startIndex: number, endIndex: number, chartLeft: number, chartWidth: number): number {
  const range = endIndex - startIndex || 1;
  return startIndex + ((x - chartLeft) / chartWidth) * range;
}

export function formatPrice(price: number, pair: string): string {
  if (pair.includes("JPY")) return price.toFixed(3);
  return price.toFixed(5);
}

export function formatTimestamp(ts: number, interval: string): string {
  const d = new Date(ts * 1000);
  const iv = interval.toLowerCase();
  // Intraday: show date + time
  const isIntraday = iv.includes("m") || iv.includes("h") || iv.includes("min");
  if (isIntraday) {
    return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  }
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
