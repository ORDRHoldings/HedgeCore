import type { Bar } from "../indicators/types";

export interface Viewport {
  startIndex: number;
  endIndex: number;
  priceMin: number;
  priceMax: number;
}

export interface ChartLayout {
  canvasWidth: number;
  canvasHeight: number;
  mainTop: number;
  mainHeight: number;
  volumeTop: number;
  volumeHeight: number;
  subPaneTop: number;
  subPaneHeight: number;
  priceAxisWidth: number;
  timeAxisHeight: number;
  chartLeft: number;
  chartRight: number;
  chartWidth: number;
}

export function computeLayout(w: number, h: number, hasSubPane: boolean): ChartLayout {
  const priceAxisWidth = 80;
  const timeAxisHeight = 28;
  const chartLeft = 0;
  const chartRight = w - priceAxisWidth;
  const chartWidth = chartRight - chartLeft;
  const mainTop = 0;
  const volumeHeight = 60;
  const subPaneHeight = hasSubPane ? 100 : 0;
  const mainHeight = h - timeAxisHeight - volumeHeight - subPaneHeight;
  const volumeTop = mainTop + mainHeight;
  const subPaneTop = volumeTop + volumeHeight;
  return {
    canvasWidth: w, canvasHeight: h,
    mainTop, mainHeight,
    volumeTop, volumeHeight,
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
  const ei = Math.min(bars.length - 1, Math.ceil(endIndex));
  let lo = Infinity, hi = -Infinity;
  for (let i = si; i <= ei; i++) {
    if (bars[i].l < lo) lo = bars[i].l;
    if (bars[i].h > hi) hi = bars[i].h;
  }
  const range = hi - lo || 0.0001;
  return {
    startIndex: si,
    endIndex: ei,
    priceMin: lo - range * padding,
    priceMax: hi + range * padding,
  };
}

export function priceToY(price: number, priceMin: number, priceMax: number, top: number, height: number): number {
  return top + height - ((price - priceMin) / (priceMax - priceMin)) * height;
}

export function yToPrice(y: number, priceMin: number, priceMax: number, top: number, height: number): number {
  return priceMin + ((top + height - y) / height) * (priceMax - priceMin);
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
  if (interval.includes("min") || interval === "1h" || interval === "4h") {
    return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  }
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
