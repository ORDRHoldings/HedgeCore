import type {
  IndicatorPoint,
  BandPoint, // used in drawBands + drawVWAP bands
  MACDPoint,
  IchimokuPoint,
  PivotPointData,
  SuperTrendPoint,
  ChandelierPoint,
  ChandeKrollPoint,
  AlligatorPoint,
  ZigzagPoint,
  AutoFibData,
  MARibbonData,
  RSISubPane,
  DivergenceLine,
} from "../indicators/types";
import type { ChartLayout, Viewport } from "../core/data";
import type { PriceScale } from "../core/data";
import { priceToY, indexToX } from "../core/data";
import { THEME } from "../core/theme";

// ── Overlay line (SMA, EMA) ────────────────────────────

export interface DrawLineOpts {
  /** Color each segment by price-vs-MA (bull = price >= MA) */
  priceColored?: boolean;
  bullColor?: string;
  bearColor?: string;
  dash?: number[];
}

export function drawIndicatorLine(
  ctx: CanvasRenderingContext2D,
  points: IndicatorPoint[],
  bars: { t: number }[],
  layout: ChartLayout,
  viewport: Viewport,
  color: string,
  lineWidth: number = 1.5,
  scale: PriceScale = "linear",
  opts?: DrawLineOpts,
): void {
  if (points.length < 2) return;
  const { mainTop, mainHeight, chartLeft, chartWidth } = layout;
  const { startIndex, endIndex, priceMin, priceMax } = viewport;

  if (opts?.dash) ctx.setLineDash(opts.dash);

  if (opts?.priceColored) {
    const bullColor = opts.bullColor ?? "#26A69A";
    const bearColor = opts.bearColor ?? "#EF5350";
    const coords: { x: number; y: number; close: number; maVal: number }[] = [];

    for (const pt of points) {
      const idx = bars.findIndex(b => b.t === pt.t);
      if (idx < startIndex - 1 || idx > endIndex + 1) continue;
      const x = indexToX(idx, startIndex, endIndex, chartLeft, chartWidth);
      const y = priceToY(pt.value, priceMin, priceMax, mainTop, mainHeight, scale);
      const bar = bars[idx] as { t: number; c?: number };
      coords.push({ x, y, close: bar.c ?? pt.value, maVal: pt.value });
    }

    ctx.lineWidth = lineWidth;
    for (let i = 1; i < coords.length; i++) {
      ctx.strokeStyle = coords[i].close >= coords[i].maVal ? bullColor : bearColor;
      ctx.beginPath();
      ctx.moveTo(coords[i - 1].x, coords[i - 1].y);
      ctx.lineTo(coords[i].x, coords[i].y);
      ctx.stroke();
    }
  } else {
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    let started = false;

    for (const pt of points) {
      const idx = bars.findIndex(b => b.t === pt.t);
      if (idx < startIndex - 1 || idx > endIndex + 1) continue;

      const x = indexToX(idx, startIndex, endIndex, chartLeft, chartWidth);
      const y = priceToY(pt.value, priceMin, priceMax, mainTop, mainHeight, scale);
      if (!started) { ctx.moveTo(x, y); started = true; }
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  if (opts?.dash) ctx.setLineDash([]);
}

// ── Band overlay (Bollinger, Keltner) ──────────────────

export function drawBands(
  ctx: CanvasRenderingContext2D,
  points: BandPoint[],
  bars: { t: number }[],
  layout: ChartLayout,
  viewport: Viewport,
  fillColor: string,
  lineColor: string,
  scale: PriceScale = "linear",
): void {
  if (points.length < 2) return;
  const { mainTop, mainHeight, chartLeft, chartWidth } = layout;
  const { startIndex, endIndex, priceMin, priceMax } = viewport;

  ctx.fillStyle = fillColor;
  ctx.beginPath();

  const visiblePts: { x: number; upper: number; lower: number; mid: number }[] = [];
  for (const pt of points) {
    const idx = bars.findIndex(b => b.t === pt.t);
    if (idx < startIndex - 1 || idx > endIndex + 1) continue;
    const x = indexToX(idx, startIndex, endIndex, chartLeft, chartWidth);
    visiblePts.push({
      x,
      upper: priceToY(pt.upper, priceMin, priceMax, mainTop, mainHeight, scale),
      lower: priceToY(pt.lower, priceMin, priceMax, mainTop, mainHeight, scale),
      mid: priceToY(pt.middle, priceMin, priceMax, mainTop, mainHeight, scale),
    });
  }

  if (visiblePts.length < 2) return;

  // Upper line forward
  ctx.moveTo(visiblePts[0].x, visiblePts[0].upper);
  for (let i = 1; i < visiblePts.length; i++) {
    ctx.lineTo(visiblePts[i].x, visiblePts[i].upper);
  }
  // Lower line backward
  for (let i = visiblePts.length - 1; i >= 0; i--) {
    ctx.lineTo(visiblePts[i].x, visiblePts[i].lower);
  }
  ctx.closePath();
  ctx.fill();

  // Upper/lower/middle lines
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 2]);

  // Upper
  ctx.beginPath();
  for (let i = 0; i < visiblePts.length; i++) {
    if (i === 0) ctx.moveTo(visiblePts[i].x, visiblePts[i].upper);
    else ctx.lineTo(visiblePts[i].x, visiblePts[i].upper);
  }
  ctx.stroke();

  // Lower
  ctx.beginPath();
  for (let i = 0; i < visiblePts.length; i++) {
    if (i === 0) ctx.moveTo(visiblePts[i].x, visiblePts[i].lower);
    else ctx.lineTo(visiblePts[i].x, visiblePts[i].lower);
  }
  ctx.stroke();

  ctx.setLineDash([]);

  // Middle (solid)
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < visiblePts.length; i++) {
    if (i === 0) ctx.moveTo(visiblePts[i].x, visiblePts[i].mid);
    else ctx.lineTo(visiblePts[i].x, visiblePts[i].mid);
  }
  ctx.stroke();
}

// ── Shared oscillator divergence helper ────────────────

/**
 * Draw divergence line pairs on an oscillator sub-pane.
 * `yFn` converts an oscillator value to a Y pixel coordinate.
 */
function drawOscDivergence(
  ctx: CanvasRenderingContext2D,
  lines: DivergenceLine[],
  startIndex: number,
  endIndex: number,
  chartLeft: number,
  chartWidth: number,
  yFn: (v: number) => number,
): void {
  for (const div of lines) {
    if (div.idx2 < startIndex - 2 || div.idx1 > endIndex + 2) continue;
    const x1 = indexToX(div.idx1, startIndex, endIndex, chartLeft, chartWidth);
    const x2 = indexToX(div.idx2, startIndex, endIndex, chartLeft, chartWidth);
    const y1 = yFn(div.osc1);
    const y2 = yFn(div.osc2);
    const bull = div.direction === "bullish";
    const color = bull ? "#26A69A" : "#EF5350";

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash(div.kind === "hidden" ? [5, 3] : []);
    ctx.globalAlpha = div.kind === "regular" ? 0.90 : 0.60;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.setLineDash([]); ctx.globalAlpha = 1;

    // Endpoint dots
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.85;
    for (const [x, y] of [[x1, y1], [x2, y2]] as [number, number][]) {
      ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

// ── RSI sub-pane ───────────────────────────────────────

export function drawRSI(
  ctx: CanvasRenderingContext2D,
  data: RSISubPane,
  bars: { t: number }[],
  layout: ChartLayout,
  viewport: Viewport,
): void {
  const { points, signal, obLevel, osLevel, period } = data;
  const { subPaneTop, subPaneHeight, chartLeft, chartWidth } = layout;
  const { startIndex, endIndex } = viewport;
  if (subPaneHeight === 0 || points.length < 2) return;

  const pw = layout.canvasWidth - layout.priceAxisWidth;
  const yVal = (v: number) => subPaneTop + subPaneHeight * (1 - v / 100);
  const yOB = yVal(obLevel);
  const yOS = yVal(osLevel);
  const yMid = yVal(50);

  // Background
  ctx.fillStyle = THEME.subPaneBg;
  ctx.fillRect(0, subPaneTop, pw, subPaneHeight);
  ctx.strokeStyle = THEME.subPaneBorder;
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(0, subPaneTop);
  ctx.lineTo(pw, subPaneTop);
  ctx.stroke();

  // OB zone fill (top → OB line) — light red
  ctx.fillStyle = "rgba(239,83,80,0.10)";
  ctx.fillRect(0, subPaneTop, pw, yOB - subPaneTop);
  // OS zone fill (OS line → bottom) — light green
  ctx.fillStyle = "rgba(38,166,154,0.10)";
  ctx.fillRect(0, yOS, pw, subPaneTop + subPaneHeight - yOS);

  // Guide lines
  const dash = (y: number, color: string) => {
    ctx.strokeStyle = color; ctx.lineWidth = 0.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(pw, y);
    ctx.stroke(); ctx.setLineDash([]);
  };
  dash(yOB, THEME.level30_70);
  dash(yOS, THEME.level70_30);
  dash(yMid, THEME.zeroLine);

  // Level labels at right edge
  ctx.font = "9px 'IBM Plex Mono', monospace";
  ctx.fillStyle = THEME.axisText;
  ctx.textAlign = "right";
  ctx.fillText(String(obLevel), pw - 3, yOB - 2);
  ctx.fillText(String(osLevel), pw - 3, yOS + 9);
  ctx.fillText("50", pw - 3, yMid - 2);

  // Build signal map for O(1) lookup
  const sigMap = new Map<number, number>();
  for (const pt of signal) sigMap.set(pt.t, pt.value);

  // Collect visible points
  const vis: { idx: number; pt: IndicatorPoint; sig: number | undefined }[] = [];
  for (const pt of points) {
    const idx = bars.findIndex(b => b.t === pt.t);
    if (idx < startIndex - 1 || idx > endIndex + 1) continue;
    vis.push({ idx, pt, sig: sigMap.get(pt.t) });
  }
  if (vis.length < 2) return;

  // ── Fill between RSI line and 50 midline ────────────────────────────────
  ctx.save();
  for (let i = 0; i < vis.length - 1; i++) {
    const a = vis[i], b = vis[i + 1];
    const x1 = indexToX(a.idx, startIndex, endIndex, chartLeft, chartWidth);
    const x2 = indexToX(b.idx, startIndex, endIndex, chartLeft, chartWidth);
    const y1r = yVal(a.pt.value);
    const y2r = yVal(b.pt.value);
    const avg = (a.pt.value + b.pt.value) / 2;
    ctx.fillStyle = avg >= 50 ? "rgba(38,166,154,0.12)" : "rgba(239,83,80,0.12)";
    ctx.beginPath();
    ctx.moveTo(x1, y1r);
    ctx.lineTo(x2, y2r);
    ctx.lineTo(x2, yMid);
    ctx.lineTo(x1, yMid);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // ── RSI line — color by zone (segment-by-segment) ────────────────────────
  for (let i = 0; i < vis.length - 1; i++) {
    const a = vis[i], b = vis[i + 1];
    const x1 = indexToX(a.idx, startIndex, endIndex, chartLeft, chartWidth);
    const x2 = indexToX(b.idx, startIndex, endIndex, chartLeft, chartWidth);
    const y1 = yVal(a.pt.value);
    const y2 = yVal(b.pt.value);
    const avg = (a.pt.value + b.pt.value) / 2;
    ctx.strokeStyle = avg > obLevel ? "#ef5350" : avg < osLevel ? "#26a69a" : THEME.rsiColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  // ── Signal EMA line (dashed orange) ─────────────────────────────────────
  if (signal.length >= 2) {
    ctx.strokeStyle = "#FFA726";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 2]);
    ctx.beginPath();
    let started = false;
    for (const pt of signal) {
      const idx = bars.findIndex(b => b.t === pt.t);
      if (idx < startIndex - 1 || idx > endIndex + 1) continue;
      const x = indexToX(idx, startIndex, endIndex, chartLeft, chartWidth);
      const y = yVal(pt.value);
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Signal cross triangle arrows
    for (let i = 1; i < vis.length; i++) {
      const pv = vis[i - 1], cu = vis[i];
      if (pv.sig === undefined || cu.sig === undefined) continue;
      const crossed = (pv.pt.value - pv.sig) * (cu.pt.value - cu.sig) < 0;
      if (!crossed) continue;
      const x = indexToX(cu.idx, startIndex, endIndex, chartLeft, chartWidth);
      const y = yVal(cu.pt.value);
      const bullCross = cu.pt.value > cu.sig;
      ctx.fillStyle = bullCross ? "#26a69a" : "#ef5350";
      ctx.beginPath();
      if (bullCross) {
        ctx.moveTo(x, y - 9); ctx.lineTo(x - 4, y - 3); ctx.lineTo(x + 4, y - 3);
      } else {
        ctx.moveTo(x, y + 9); ctx.lineTo(x - 4, y + 3); ctx.lineTo(x + 4, y + 3);
      }
      ctx.closePath();
      ctx.fill();
    }
  }

  // ── Multi-value header ───────────────────────────────────────────────────
  const lastV = vis[vis.length - 1];
  const lastSig = lastV.sig;
  ctx.font = "10px 'IBM Plex Mono', monospace";
  ctx.textAlign = "left";
  const headerParts = [
    { text: `RSI(${period}) `, color: THEME.axisText },
    { text: lastV.pt.value.toFixed(2), color: lastV.pt.value > obLevel ? "#ef5350" : lastV.pt.value < osLevel ? "#26a69a" : THEME.rsiColor },
    ...(lastSig !== undefined ? [
      { text: "  SIG ", color: THEME.axisText },
      { text: lastSig.toFixed(2), color: "#FFA726" },
    ] : []),
  ];
  let hx = 6;
  for (const { text, color } of headerParts) {
    ctx.fillStyle = color;
    ctx.fillText(text, hx, subPaneTop + 12);
    hx += ctx.measureText(text).width;
  }

  // ── Divergence lines (oscillator pane side) ───────────────────────────────
  const divLines = data.divergences;
  if (divLines && divLines.length > 0) {
    drawOscDivergence(ctx, divLines, startIndex, endIndex, chartLeft, chartWidth,
      (v) => subPaneTop + subPaneHeight * (1 - v / 100));
  }
}

// ── MACD sub-pane ──────────────────────────────────────

export function drawMACD(
  ctx: CanvasRenderingContext2D,
  points: MACDPoint[],
  bars: { t: number }[],
  layout: ChartLayout,
  viewport: Viewport,
  divergences?: DivergenceLine[],
): void {
  const { subPaneTop, subPaneHeight, chartLeft, chartWidth } = layout;
  const { startIndex, endIndex } = viewport;
  if (subPaneHeight === 0) return;

  const pw = layout.canvasWidth - layout.priceAxisWidth;
  ctx.fillStyle = THEME.subPaneBg;
  ctx.fillRect(0, subPaneTop, pw, subPaneHeight);
  ctx.strokeStyle = THEME.subPaneBorder;
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(0, subPaneTop);
  ctx.lineTo(pw, subPaneTop);
  ctx.stroke();

  // Find max abs value for scaling
  let maxAbs = 0;
  const visible: { idx: number; pt: MACDPoint }[] = [];
  for (const pt of points) {
    const idx = bars.findIndex(b => b.t === pt.t);
    if (idx < startIndex - 1 || idx > endIndex + 1) continue;
    visible.push({ idx, pt });
    maxAbs = Math.max(maxAbs, Math.abs(pt.macd), Math.abs(pt.signal), Math.abs(pt.histogram));
  }
  if (maxAbs === 0 || visible.length < 2) return;

  const midY = subPaneTop + subPaneHeight / 2;
  const sc = (subPaneHeight / 2 - 10) / maxAbs;
  const range = endIndex - startIndex || 1;
  const barWidth = Math.max(1, (chartWidth / range) * 0.5);

  // Zero line
  ctx.strokeStyle = THEME.zeroLine;
  ctx.lineWidth = 0.5;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(0, midY); ctx.lineTo(pw, midY);
  ctx.stroke();
  ctx.setLineDash([]);

  // Subtle guide lines at ±33% of range
  for (const frac of [0.33, -0.33]) {
    const yG = midY - maxAbs * frac * sc;
    if (yG < subPaneTop || yG > subPaneTop + subPaneHeight) continue;
    ctx.strokeStyle = "rgba(150,152,161,0.10)";
    ctx.lineWidth = 0.5;
    ctx.setLineDash([2, 5]);
    ctx.beginPath();
    ctx.moveTo(0, yG); ctx.lineTo(pw, yG);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Histogram — 4-shade momentum direction coloring (TradingView standard)
  for (let i = 0; i < visible.length; i++) {
    const { idx, pt } = visible[i];
    const prevHist = i > 0 ? visible[i - 1].pt.histogram : pt.histogram;
    const growing = Math.abs(pt.histogram) >= Math.abs(prevHist);
    let color: string;
    if (pt.histogram >= 0) color = growing ? "#26a69a" : "#1a6b64";
    else                   color = growing ? "#ef5350" : "#7a2828";

    const x = indexToX(idx, startIndex, endIndex, chartLeft, chartWidth);
    const h = pt.histogram * sc;
    ctx.fillStyle = color;
    if (h >= 0) ctx.fillRect(x - barWidth / 2, midY - h, barWidth, h);
    else        ctx.fillRect(x - barWidth / 2, midY,     barWidth, -h);
  }

  // MACD line — colored by position relative to zero (teal above, red below)
  for (let i = 0; i < visible.length - 1; i++) {
    const a = visible[i], b = visible[i + 1];
    const x1 = indexToX(a.idx, startIndex, endIndex, chartLeft, chartWidth);
    const x2 = indexToX(b.idx, startIndex, endIndex, chartLeft, chartWidth);
    const y1 = midY - a.pt.macd * sc;
    const y2 = midY - b.pt.macd * sc;
    const avg = (a.pt.macd + b.pt.macd) / 2;
    ctx.strokeStyle = avg >= 0 ? "#26c6da" : "#ef9a9a";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  // Signal line
  ctx.strokeStyle = THEME.macdSignal;
  ctx.lineWidth = 1;
  ctx.beginPath();
  visible.forEach(({ idx, pt }, i) => {
    const x = indexToX(idx, startIndex, endIndex, chartLeft, chartWidth);
    const y = midY - pt.signal * sc;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Signal-cross triangle arrows
  for (let i = 1; i < visible.length; i++) {
    const prev = visible[i - 1].pt;
    const curr = visible[i].pt;
    const crossed = (prev.macd - prev.signal) * (curr.macd - curr.signal) < 0;
    if (!crossed) continue;
    const { idx } = visible[i];
    const x = indexToX(idx, startIndex, endIndex, chartLeft, chartWidth);
    const y = midY - curr.signal * sc;
    const bull = curr.macd > curr.signal;
    ctx.fillStyle = bull ? "#26a69a" : "#ef5350";
    ctx.beginPath();
    if (bull) {
      ctx.moveTo(x, y - 10); ctx.lineTo(x - 4, y - 4); ctx.lineTo(x + 4, y - 4);
    } else {
      ctx.moveTo(x, y + 10); ctx.lineTo(x - 4, y + 4); ctx.lineTo(x + 4, y + 4);
    }
    ctx.closePath();
    ctx.fill();
  }

  // ── Multi-value header ─────────────────────────────────────────────────────
  const last = visible[visible.length - 1].pt;
  ctx.font = "10px 'IBM Plex Mono', monospace";
  ctx.textAlign = "left";
  const mParts = [
    { text: "MACD ", color: THEME.axisText },
    { text: `${last.macd.toFixed(5)} `, color: last.macd >= 0 ? "#26c6da" : "#ef9a9a" },
    { text: "SIG ", color: THEME.axisText },
    { text: `${last.signal.toFixed(5)} `, color: "#FFA726" },
    { text: "HIST ", color: THEME.axisText },
    { text: last.histogram.toFixed(5), color: last.histogram >= 0 ? "#26a69a" : "#ef5350" },
  ];
  let mx = 6;
  for (const { text, color } of mParts) {
    ctx.fillStyle = color;
    ctx.fillText(text, mx, subPaneTop + 12);
    mx += ctx.measureText(text).width;
  }

  // ── Divergence lines (oscillator pane side) ─────────────────────────────
  if (divergences && divergences.length > 0 && maxAbs > 0) {
    const macdSc = sc;
    const macdMidY = subPaneTop + subPaneHeight / 2;
    drawOscDivergence(ctx, divergences, startIndex, endIndex, chartLeft, chartWidth,
      (v) => macdMidY - v * macdSc);
  }
}

// ── VWAP overlay ──────────────────────────────────────

export function drawVWAP(
  ctx: CanvasRenderingContext2D,
  points: IndicatorPoint[],
  bars: { t: number }[],
  layout: ChartLayout,
  viewport: Viewport,
  scale: PriceScale = "linear",
  bands?: BandPoint[],   // ±1σ
  bands2?: BandPoint[],  // ±2σ
  bands3?: BandPoint[],  // ±3σ
): void {
  // Draw outermost bands first (behind inner bands and VWAP line)
  if (bands3 && bands3.length >= 2) {
    drawBands(ctx, bands3, bars, layout, viewport, "rgba(33,150,243,0.04)", "rgba(33,150,243,0.20)", scale);
  }
  if (bands2 && bands2.length >= 2) {
    drawBands(ctx, bands2, bars, layout, viewport, "rgba(255,152,0,0.05)", "rgba(255,152,0,0.28)", scale);
  }
  if (bands && bands.length >= 2) {
    drawBands(ctx, bands, bars, layout, viewport, "rgba(233,30,99,0.07)", "rgba(233,30,99,0.40)", scale);
  }
  drawIndicatorLine(ctx, points, bars, layout, viewport, THEME.vwapColor, 2, scale);
}

// ── Ichimoku Cloud overlay ────────────────────────────

export function drawIchimoku(
  ctx: CanvasRenderingContext2D,
  points: IchimokuPoint[],
  bars: { t: number }[],
  layout: ChartLayout,
  viewport: Viewport,
  scale: PriceScale = "linear",
): void {
  if (points.length < 2) return;
  const { mainTop, mainHeight, chartLeft, chartWidth } = layout;
  const { startIndex, endIndex, priceMin, priceMax } = viewport;

  // Collect visible points with their x/y coords
  const vis: {
    x: number;
    tenkanY: number;
    kijunY: number;
    senkouAY: number;
    senkouBY: number;
    chikouY: number;
    senkouA: number;
    senkouB: number;
  }[] = [];

  for (const pt of points) {
    const idx = bars.findIndex(b => b.t === pt.t);
    if (idx < startIndex - 1 || idx > endIndex + 1) continue;
    const x = indexToX(idx, startIndex, endIndex, chartLeft, chartWidth);
    vis.push({
      x,
      tenkanY: priceToY(pt.tenkan, priceMin, priceMax, mainTop, mainHeight, scale),
      kijunY: priceToY(pt.kijun, priceMin, priceMax, mainTop, mainHeight, scale),
      senkouAY: priceToY(pt.senkouA, priceMin, priceMax, mainTop, mainHeight, scale),
      senkouBY: priceToY(pt.senkouB, priceMin, priceMax, mainTop, mainHeight, scale),
      chikouY: priceToY(pt.chikou, priceMin, priceMax, mainTop, mainHeight, scale),
      senkouA: pt.senkouA,
      senkouB: pt.senkouB,
    });
  }
  if (vis.length < 2) return;

  // Cloud fill between senkouA and senkouB — two-pass for depth
  for (let i = 0; i < vis.length - 1; i++) {
    const curr = vis[i];
    const next = vis[i + 1];
    const bullish = curr.senkouA >= curr.senkouB;
    ctx.fillStyle = bullish ? "rgba(38,166,154,0.12)" : "rgba(239,83,80,0.12)";
    ctx.beginPath();
    ctx.moveTo(curr.x, curr.senkouAY);
    ctx.lineTo(next.x, next.senkouAY);
    ctx.lineTo(next.x, next.senkouBY);
    ctx.lineTo(curr.x, curr.senkouBY);
    ctx.closePath();
    ctx.fill();
  }
  // Second pass: half-opacity glow depth effect
  ctx.save();
  ctx.globalAlpha = 0.5;
  for (let i = 0; i < vis.length - 1; i++) {
    const curr = vis[i];
    const next = vis[i + 1];
    const bullish = curr.senkouA >= curr.senkouB;
    ctx.fillStyle = bullish ? "rgba(38,166,154,0.12)" : "rgba(239,83,80,0.12)";
    ctx.beginPath();
    ctx.moveTo(curr.x, curr.senkouAY);
    ctx.lineTo(next.x, next.senkouAY);
    ctx.lineTo(next.x, next.senkouBY);
    ctx.lineTo(curr.x, curr.senkouBY);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // Senkou A (leading span A) — cloud outline
  ctx.strokeStyle = "rgba(38,166,154,0.75)";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([]);
  ctx.beginPath();
  vis.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.senkouAY); else ctx.lineTo(p.x, p.senkouAY); });
  ctx.stroke();

  // Senkou B (leading span B) — cloud outline
  ctx.strokeStyle = "rgba(239,83,80,0.75)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  vis.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.senkouBY); else ctx.lineTo(p.x, p.senkouBY); });
  ctx.stroke();

  // Tenkan-sen (conversion line) with glow
  ctx.save();
  ctx.shadowColor = "#3D8EFF";
  ctx.shadowBlur = 4;
  ctx.strokeStyle = "#3D8EFF";
  ctx.lineWidth = 1.8;
  ctx.setLineDash([]);
  ctx.beginPath();
  vis.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.tenkanY); else ctx.lineTo(p.x, p.tenkanY); });
  ctx.stroke();
  ctx.restore();

  // Kijun-sen (base line) with glow
  ctx.save();
  ctx.shadowColor = "#FF6B6B";
  ctx.shadowBlur = 4;
  ctx.strokeStyle = "#FF6B6B";
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  vis.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.kijunY); else ctx.lineTo(p.x, p.kijunY); });
  ctx.stroke();
  ctx.restore();

  // Chikou span (lagging)
  ctx.strokeStyle = "rgba(180,185,200,0.7)";
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  vis.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.chikouY); else ctx.lineTo(p.x, p.chikouY); });
  ctx.stroke();
  ctx.setLineDash([]);
}

// ── HMA overlay ───────────────────────────────────────

export function drawHMA(
  ctx: CanvasRenderingContext2D,
  points: IndicatorPoint[],
  bars: { t: number }[],
  layout: ChartLayout,
  viewport: Viewport,
  scale: PriceScale = "linear",
): void {
  drawIndicatorLine(ctx, points, bars, layout, viewport, "#00E676", 1.5, scale);
}

// ── TEMA overlay ──────────────────────────────────────

export function drawTEMA(
  ctx: CanvasRenderingContext2D,
  points: IndicatorPoint[],
  bars: { t: number }[],
  layout: ChartLayout,
  viewport: Viewport,
  scale: PriceScale = "linear",
): void {
  drawIndicatorLine(ctx, points, bars, layout, viewport, "#FF4081", 1.5, scale);
}

// ── Bollinger Bands (dedicated — squeeze + solid mid) ─

export function drawBollinger(
  ctx: CanvasRenderingContext2D,
  points: BandPoint[],
  bars: { t: number }[],
  layout: ChartLayout,
  viewport: Viewport,
  fillColor: string,
  lineColor: string,
  scale: PriceScale = "linear",
  showSqueeze: boolean = true,
): void {
  if (points.length < 2) return;
  const { mainTop, mainHeight, chartLeft, chartWidth } = layout;
  const { startIndex, endIndex, priceMin, priceMax } = viewport;

  type VisPt = { x: number; upperY: number; lowerY: number; midY: number; bwPrice: number };
  const vis: VisPt[] = [];
  for (const pt of points) {
    const idx = bars.findIndex(b => b.t === pt.t);
    if (idx < startIndex - 1 || idx > endIndex + 1) continue;
    const x = indexToX(idx, startIndex, endIndex, chartLeft, chartWidth);
    vis.push({
      x,
      upperY: priceToY(pt.upper, priceMin, priceMax, mainTop, mainHeight, scale),
      lowerY: priceToY(pt.lower, priceMin, priceMax, mainTop, mainHeight, scale),
      midY:   priceToY(pt.middle, priceMin, priceMax, mainTop, mainHeight, scale),
      bwPrice: pt.upper - pt.lower,
    });
  }
  if (vis.length < 2) return;

  // Average bandwidth for squeeze threshold
  const avgBW = vis.reduce((s, p) => s + p.bwPrice, 0) / vis.length;

  // Draw fill in segments — squeeze gets yellow tint
  for (let i = 1; i < vis.length; i++) {
    const sq = showSqueeze && vis[i].bwPrice < avgBW * 0.75;
    ctx.fillStyle = sq ? "rgba(255,235,59,0.12)" : fillColor;
    ctx.beginPath();
    ctx.moveTo(vis[i - 1].x, vis[i - 1].upperY);
    ctx.lineTo(vis[i].x,     vis[i].upperY);
    ctx.lineTo(vis[i].x,     vis[i].lowerY);
    ctx.lineTo(vis[i - 1].x, vis[i - 1].lowerY);
    ctx.closePath();
    ctx.fill();
  }

  // Upper band (dashed)
  ctx.strokeStyle = lineColor; ctx.lineWidth = 1; ctx.setLineDash([3, 2]);
  ctx.beginPath();
  for (let i = 0; i < vis.length; i++) {
    if (i === 0) ctx.moveTo(vis[i].x, vis[i].upperY);
    else ctx.lineTo(vis[i].x, vis[i].upperY);
  }
  ctx.stroke();

  // Lower band (dashed)
  ctx.beginPath();
  for (let i = 0; i < vis.length; i++) {
    if (i === 0) ctx.moveTo(vis[i].x, vis[i].lowerY);
    else ctx.lineTo(vis[i].x, vis[i].lowerY);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  // Middle band — solid, slightly thicker
  ctx.strokeStyle = lineColor; ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < vis.length; i++) {
    if (i === 0) ctx.moveTo(vis[i].x, vis[i].midY);
    else ctx.lineTo(vis[i].x, vis[i].midY);
  }
  ctx.stroke();

  // Squeeze indicator dots at bottom edge of chart area
  if (showSqueeze) {
    const dotY = mainTop + mainHeight - 4;
    ctx.fillStyle = "#FFD54F";
    for (let i = 0; i < vis.length; i++) {
      if (vis[i].bwPrice < avgBW * 0.75) {
        ctx.beginPath();
        ctx.arc(vis[i].x, dotY, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

// ── Donchian Channel overlay ──────────────────────────

export function drawDonchian(
  ctx: CanvasRenderingContext2D,
  points: BandPoint[],
  bars: { t: number }[],
  layout: ChartLayout,
  viewport: Viewport,
  scale: PriceScale = "linear",
): void {
  drawBands(ctx, points, bars, layout, viewport, "rgba(0,188,212,0.06)", "#00BCD4", scale);
}

// ── Donchian with breakout markers ────────────────────

export function drawDonchianBands(
  ctx: CanvasRenderingContext2D,
  points: BandPoint[],
  bars: { t: number }[],
  layout: ChartLayout,
  viewport: Viewport,
  fillColor: string,
  lineColor: string,
  scale: PriceScale = "linear",
  showBreakout: boolean = true,
): void {
  drawBands(ctx, points, bars, layout, viewport, fillColor, lineColor, scale);

  if (!showBreakout || points.length === 0) return;

  const { mainTop, mainHeight, chartLeft, chartWidth } = layout;
  const { startIndex, endIndex, priceMin, priceMax } = viewport;

  for (const pt of points) {
    const idx = bars.findIndex(b => b.t === pt.t);
    if (idx < startIndex - 1 || idx > endIndex + 1) continue;
    if (idx < 0 || idx >= bars.length) continue;
    const bar = bars[idx] as { t: number; c?: number; h?: number; l?: number };
    const x = indexToX(idx, startIndex, endIndex, chartLeft, chartWidth);

    // High touches upper band — bearish breakout marker
    if (bar.h !== undefined && bar.h >= pt.upper) {
      ctx.fillStyle = "#EF5350";
      ctx.beginPath();
      ctx.arc(x, priceToY(pt.upper, priceMin, priceMax, mainTop, mainHeight, scale), 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Low touches lower band — bullish breakout marker
    if (bar.l !== undefined && bar.l <= pt.lower) {
      ctx.fillStyle = "#26A69A";
      ctx.beginPath();
      ctx.arc(x, priceToY(pt.lower, priceMin, priceMax, mainTop, mainHeight, scale), 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// ── Parabolic SAR dots overlay ────────────────────────

export function drawParabolicSAR(
  ctx: CanvasRenderingContext2D,
  points: IndicatorPoint[],
  bars: { t: number }[],
  layout: ChartLayout,
  viewport: Viewport,
  scale: PriceScale = "linear",
): void {
  if (points.length === 0) return;
  const { mainTop, mainHeight, chartLeft, chartWidth } = layout;
  const { startIndex, endIndex, priceMin, priceMax } = viewport;

  // Track trend direction across all points (not just visible) for correct reversal detection
  let prevBull: boolean | null = null;

  for (const pt of points) {
    const idx = bars.findIndex(b => b.t === pt.t);
    if (idx < 0 || idx >= bars.length) continue;

    const bar = bars[idx] as { t: number; c: number };
    const isBull = pt.value <= bar.c; // SAR below price = bullish trend
    const isReversal = prevBull !== null && isBull !== prevBull;
    prevBull = isBull;

    if (idx < startIndex - 1 || idx > endIndex + 1) continue;

    const x = indexToX(idx, startIndex, endIndex, chartLeft, chartWidth);
    const y = priceToY(pt.value, priceMin, priceMax, mainTop, mainHeight, scale);

    // SAR dot
    ctx.fillStyle = isBull ? "#26A69A" : "#EF5350";
    ctx.beginPath();
    ctx.arc(x, y, 2, 0, Math.PI * 2);
    ctx.fill();

    // Reversal triangle marker
    if (isReversal) {
      const ts = 6;
      ctx.fillStyle = isBull ? "#26A69A" : "#EF5350";
      ctx.beginPath();
      if (isBull) {
        // Bullish reversal: upward triangle above SAR dot
        ctx.moveTo(x, y - ts - 5);
        ctx.lineTo(x - ts, y - 5);
        ctx.lineTo(x + ts, y - 5);
      } else {
        // Bearish reversal: downward triangle below SAR dot
        ctx.moveTo(x, y + ts + 5);
        ctx.lineTo(x - ts, y + 5);
        ctx.lineTo(x + ts, y + 5);
      }
      ctx.closePath();
      ctx.fill();
    }
  }
}

// ── Pivot Points overlay ──────────────────────────────

export function drawPivotPoints(
  ctx: CanvasRenderingContext2D,
  pivots: PivotPointData,
  layout: ChartLayout,
  viewport: Viewport,
  scale: PriceScale = "linear",
): void {
  const { mainTop, mainHeight, chartLeft, chartWidth, priceAxisWidth, canvasWidth } = layout;
  const { priceMin, priceMax } = viewport;

  const lineRight = canvasWidth - priceAxisWidth;

  const drawPivotLine = (
    price: number,
    label: string,
    color: string,
    dashed: boolean,
  ) => {
    if (price < priceMin || price > priceMax) return;
    const y = priceToY(price, priceMin, priceMax, mainTop, mainHeight, scale);

    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    if (dashed) ctx.setLineDash([4, 4]);
    else ctx.setLineDash([]);

    ctx.beginPath();
    ctx.moveTo(chartLeft, y);
    ctx.lineTo(lineRight, y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Label on right side
    ctx.font = "9px 'IBM Plex Mono', monospace";
    ctx.fillStyle = color;
    ctx.textAlign = "right";
    ctx.fillText(label, lineRight - 4, y - 3);
  };

  // PP - solid white
  drawPivotLine(pivots.pp, "PP", "#D1D4DC", false);

  // Resistance - dashed red
  drawPivotLine(pivots.r1, "R1", "#EF5350", true);
  drawPivotLine(pivots.r2, "R2", "#EF5350", true);
  drawPivotLine(pivots.r3, "R3", "#EF5350", true);

  // Support - dashed green
  drawPivotLine(pivots.s1, "S1", "#26A69A", true);
  drawPivotLine(pivots.s2, "S2", "#26A69A", true);
  drawPivotLine(pivots.s3, "S3", "#26A69A", true);
}

// ── SuperTrend overlay ────────────────────────────────

export function drawSuperTrend(
  ctx: CanvasRenderingContext2D,
  points: SuperTrendPoint[],
  bars: { t: number }[],
  layout: ChartLayout,
  viewport: Viewport,
  scale: PriceScale = "linear",
  cfg: { showArrows: boolean; showFill: boolean; showLabel: boolean } = { showArrows: true, showFill: false, showLabel: true },
): void {
  if (points.length < 2) return;
  const { startIndex, endIndex, priceMin, priceMax } = viewport;
  const { chartLeft, chartWidth, mainTop, mainHeight } = layout;

  type Coord = { x: number; y: number; closeY: number; dir: "up" | "down"; isFlip: boolean };
  const vis: Coord[] = [];

  // Track direction across all points (including non-visible) for correct flip detection
  let prevDirAll: "up" | "down" | null = null;

  for (const pt of points) {
    const idx = bars.findIndex(b => b.t === pt.t);
    if (idx < 0) continue;

    const isFlip = prevDirAll !== null && pt.direction !== prevDirAll;
    prevDirAll = pt.direction;

    if (idx < startIndex - 1 || idx > endIndex + 1) continue;

    const x = indexToX(idx, startIndex, endIndex, chartLeft, chartWidth);
    const y = priceToY(pt.value, priceMin, priceMax, mainTop, mainHeight, scale);
    const bar = bars[idx] as { t: number; c?: number };
    const closeY = priceToY(bar.c ?? pt.value, priceMin, priceMax, mainTop, mainHeight, scale);
    vis.push({ x, y, closeY, dir: pt.direction, isFlip });
  }
  if (vis.length < 2) return;

  // Fill between price and ST line
  if (cfg.showFill) {
    for (let i = 1; i < vis.length; i++) {
      if (vis[i].dir !== vis[i - 1].dir) continue;
      ctx.fillStyle = vis[i].dir === "up" ? "rgba(38,166,154,0.10)" : "rgba(239,83,80,0.10)";
      ctx.beginPath();
      ctx.moveTo(vis[i - 1].x, vis[i - 1].closeY);
      ctx.lineTo(vis[i].x,     vis[i].closeY);
      ctx.lineTo(vis[i].x,     vis[i].y);
      ctx.lineTo(vis[i - 1].x, vis[i - 1].y);
      ctx.closePath();
      ctx.fill();
    }
  }

  // ST line segments (colored by direction, skip over flips)
  ctx.lineWidth = 2;
  for (let i = 1; i < vis.length; i++) {
    if (vis[i].dir !== vis[i - 1].dir) continue;
    ctx.strokeStyle = vis[i].dir === "up" ? "#26A69A" : "#EF5350";
    ctx.beginPath();
    ctx.moveTo(vis[i - 1].x, vis[i - 1].y);
    ctx.lineTo(vis[i].x,     vis[i].y);
    ctx.stroke();
  }

  // Flip direction arrows
  if (cfg.showArrows) {
    let prevDir: "up" | "down" | null = null;
    for (let i = 0; i < vis.length; i++) {
      if (prevDir !== null && vis[i].dir !== prevDir) {
        const ts = 6;
        ctx.fillStyle = vis[i].dir === "up" ? "#26A69A" : "#EF5350";
        ctx.beginPath();
        if (vis[i].dir === "up") {
          ctx.moveTo(vis[i].x, vis[i].y - ts - 6);
          ctx.lineTo(vis[i].x - ts, vis[i].y - 6);
          ctx.lineTo(vis[i].x + ts, vis[i].y - 6);
        } else {
          ctx.moveTo(vis[i].x, vis[i].y + ts + 6);
          ctx.lineTo(vis[i].x - ts, vis[i].y + 6);
          ctx.lineTo(vis[i].x + ts, vis[i].y + 6);
        }
        ctx.closePath();
        ctx.fill();
      }
      prevDir = vis[i].dir;
    }
  }

  // Current direction label
  if (cfg.showLabel) {
    const last = vis[vis.length - 1];
    ctx.font = "bold 11px 'IBM Plex Mono', monospace";
    ctx.fillStyle = last.dir === "up" ? "#26A69A" : "#EF5350";
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.fillText(last.dir === "up" ? "▲ BULL" : "▼ BEAR", chartLeft + chartWidth - 4, mainTop + 4);
  }
}

// ── Chandelier Exit overlay ───────────────────────────

export function drawChandelierExit(
  ctx: CanvasRenderingContext2D,
  points: ChandelierPoint[],
  bars: { t: number }[],
  layout: ChartLayout,
  viewport: Viewport,
  scale: PriceScale = "linear",
  showArrows: boolean = true,
): void {
  if (points.length < 2) return;
  const { startIndex, endIndex, priceMin, priceMax } = viewport;
  const { chartLeft, chartWidth, mainTop, mainHeight } = layout;

  // Draw longStop (green dashed)
  ctx.strokeStyle = "#26A69A"; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]);
  ctx.beginPath(); let s1 = false;
  for (const pt of points) {
    const idx = bars.findIndex(b => b.t === pt.t);
    if (idx < startIndex - 1 || idx > endIndex + 1) continue;
    const x = indexToX(idx, startIndex, endIndex, chartLeft, chartWidth);
    const y = priceToY(pt.longStop, priceMin, priceMax, mainTop, mainHeight, scale);
    if (!s1) { ctx.moveTo(x, y); s1 = true; } else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Draw shortStop (red dashed)
  ctx.strokeStyle = "#EF5350"; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]);
  ctx.beginPath(); let s2 = false;
  for (const pt of points) {
    const idx = bars.findIndex(b => b.t === pt.t);
    if (idx < startIndex - 1 || idx > endIndex + 1) continue;
    const x = indexToX(idx, startIndex, endIndex, chartLeft, chartWidth);
    const y = priceToY(pt.shortStop, priceMin, priceMax, mainTop, mainHeight, scale);
    if (!s2) { ctx.moveTo(x, y); s2 = true; } else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  // Flip arrows: detect when active stop changes (close crosses a stop)
  if (showArrows) {
    let prevDir: "bull" | "bear" | null = null;
    for (const pt of points) {
      const idx = bars.findIndex(b => b.t === pt.t);
      if (idx < 0) continue;
      const bar = bars[idx] as { t: number; c?: number };
      const close = bar.c ?? 0;
      // Active direction: if close is above the longStop, we're in uptrend
      const dir: "bull" | "bear" = close >= pt.longStop ? "bull" : "bear";
      const isFlip = prevDir !== null && dir !== prevDir;
      prevDir = dir;
      if (!isFlip || idx < startIndex - 1 || idx > endIndex + 1) continue;

      const x = indexToX(idx, startIndex, endIndex, chartLeft, chartWidth);
      const stopPrice = dir === "bull" ? pt.longStop : pt.shortStop;
      const y = priceToY(stopPrice, priceMin, priceMax, mainTop, mainHeight, scale);
      const ts = 6;
      ctx.fillStyle = dir === "bull" ? "#26A69A" : "#EF5350";
      ctx.beginPath();
      if (dir === "bull") {
        ctx.moveTo(x, y - ts - 5); ctx.lineTo(x - ts, y - 5); ctx.lineTo(x + ts, y - 5);
      } else {
        ctx.moveTo(x, y + ts + 5); ctx.lineTo(x - ts, y + 5); ctx.lineTo(x + ts, y + 5);
      }
      ctx.closePath();
      ctx.fill();
    }
  }
}

// ── Chande Kroll Stop overlay ─────────────────────────

export function drawChandeKrollStop(
  ctx: CanvasRenderingContext2D,
  points: ChandeKrollPoint[],
  bars: { t: number }[],
  layout: ChartLayout,
  viewport: Viewport,
  scale: PriceScale = "linear",
): void {
  if (points.length < 2) return;
  const { startIndex, endIndex } = viewport;
  const { chartLeft, chartWidth, mainTop, mainHeight } = layout;
  // Draw stop1 (green dotted)
  ctx.strokeStyle = "#26A69A"; ctx.lineWidth = 1.5; ctx.setLineDash([2, 3]);
  ctx.beginPath(); let s1 = false;
  for (const pt of points) {
    const idx = bars.findIndex(b => b.t === pt.t);
    if (idx < startIndex - 1 || idx > endIndex + 1) continue;
    const x = indexToX(idx, startIndex, endIndex, chartLeft, chartWidth);
    const y = priceToY(pt.stop1, viewport.priceMin, viewport.priceMax, mainTop, mainHeight, scale);
    if (!s1) { ctx.moveTo(x, y); s1 = true; } else ctx.lineTo(x, y);
  }
  ctx.stroke();
  // Draw stop2 (red dotted)
  ctx.strokeStyle = "#EF5350"; ctx.lineWidth = 1.5; ctx.setLineDash([2, 3]);
  ctx.beginPath(); let s2 = false;
  for (const pt of points) {
    const idx = bars.findIndex(b => b.t === pt.t);
    if (idx < startIndex - 1 || idx > endIndex + 1) continue;
    const x = indexToX(idx, startIndex, endIndex, chartLeft, chartWidth);
    const y = priceToY(pt.stop2, viewport.priceMin, viewport.priceMax, mainTop, mainHeight, scale);
    if (!s2) { ctx.moveTo(x, y); s2 = true; } else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

// ── Williams Alligator overlay ────────────────────────

export function drawAlligator(
  ctx: CanvasRenderingContext2D,
  points: AlligatorPoint[],
  bars: { t: number }[],
  layout: ChartLayout,
  viewport: Viewport,
  scale: PriceScale = "linear",
): void {
  if (points.length < 2) return;
  const { startIndex, endIndex } = viewport;
  const { chartLeft, chartWidth, mainTop, mainHeight } = layout;
  // Jaw — blue dashed [8,5]
  ctx.strokeStyle = "#2962FF"; ctx.lineWidth = 1.5; ctx.setLineDash([8, 5]);
  ctx.beginPath(); let j = false;
  for (const pt of points) {
    const idx = bars.findIndex(b => b.t === pt.t);
    if (idx < startIndex - 1 || idx > endIndex + 1) continue;
    const x = indexToX(idx, startIndex, endIndex, chartLeft, chartWidth);
    const y = priceToY(pt.jaw, viewport.priceMin, viewport.priceMax, mainTop, mainHeight, scale);
    if (!j) { ctx.moveTo(x, y); j = true; } else ctx.lineTo(x, y);
  }
  ctx.stroke();
  // Teeth — red dashed [5,3]
  ctx.strokeStyle = "#EF5350"; ctx.lineWidth = 1.5; ctx.setLineDash([5, 3]);
  ctx.beginPath(); let t = false;
  for (const pt of points) {
    const idx = bars.findIndex(b => b.t === pt.t);
    if (idx < startIndex - 1 || idx > endIndex + 1) continue;
    const x = indexToX(idx, startIndex, endIndex, chartLeft, chartWidth);
    const y = priceToY(pt.teeth, viewport.priceMin, viewport.priceMax, mainTop, mainHeight, scale);
    if (!t) { ctx.moveTo(x, y); t = true; } else ctx.lineTo(x, y);
  }
  ctx.stroke();
  // Lips — green solid
  ctx.strokeStyle = "#26A69A"; ctx.lineWidth = 1.5; ctx.setLineDash([]);
  ctx.beginPath(); let l = false;
  for (const pt of points) {
    const idx = bars.findIndex(b => b.t === pt.t);
    if (idx < startIndex - 1 || idx > endIndex + 1) continue;
    const x = indexToX(idx, startIndex, endIndex, chartLeft, chartWidth);
    const y = priceToY(pt.lips, viewport.priceMin, viewport.priceMax, mainTop, mainHeight, scale);
    if (!l) { ctx.moveTo(x, y); l = true; } else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

// ── ZigZag overlay ────────────────────────────────────

export function drawZigzag(
  ctx: CanvasRenderingContext2D,
  points: ZigzagPoint[],
  bars: { t: number }[],
  layout: ChartLayout,
  viewport: Viewport,
  scale: PriceScale = "linear",
): void {
  if (points.length < 2) return;
  const { startIndex, endIndex } = viewport;
  const { chartLeft, chartWidth, mainTop, mainHeight } = layout;
  ctx.strokeStyle = "#FFD54F"; ctx.lineWidth = 1.5;
  ctx.beginPath(); let started = false;
  for (const pt of points) {
    const idx = pt.barIndex;
    if (idx < startIndex - 1 || idx > endIndex + 1) continue;
    const x = indexToX(idx, startIndex, endIndex, chartLeft, chartWidth);
    const y = priceToY(pt.price, viewport.priceMin, viewport.priceMax, mainTop, mainHeight, scale);
    if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

// ── Auto Fibonacci overlay ────────────────────────────

export function drawAutoFib(
  ctx: CanvasRenderingContext2D,
  data: AutoFibData,
  layout: ChartLayout,
  viewport: Viewport,
  scale: PriceScale = "linear",
): void {
  if (!data) return;
  const { chartLeft, chartWidth, mainTop, mainHeight } = layout;
  const fibColors = ["#9598A1", "#FFD54F", "#FF9800", "#F06292", "#26A69A", "#42A5F5", "#7E57C2"];
  data.levels.forEach((lvl, i) => {
    const y = priceToY(lvl.price, viewport.priceMin, viewport.priceMax, mainTop, mainHeight, scale);
    if (y < mainTop || y > mainTop + mainHeight) return;
    const color = fibColors[i % fibColors.length];
    ctx.strokeStyle = color; ctx.lineWidth = 0.8; ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(chartLeft, y);
    ctx.lineTo(chartLeft + chartWidth, y);
    ctx.stroke();
    ctx.setLineDash([]);
    // Label
    ctx.font = "10px 'IBM Plex Mono', monospace";
    ctx.fillStyle = color; ctx.textAlign = "right";
    ctx.fillText(`${lvl.label} ${lvl.price.toFixed(4)}`, chartLeft + chartWidth - 4, y - 2);
  });
}

// ── MA Ribbon overlay ─────────────────────────────────

export function drawMARibbon(
  ctx: CanvasRenderingContext2D,
  ribbons: MARibbonData[],
  bars: { t: number }[],
  layout: ChartLayout,
  viewport: Viewport,
  scale: PriceScale = "linear",
  showFill: boolean = true,
): void {
  if (ribbons.length === 0) return;

  // Trend fill between fastest (ribbons[0]) and slowest (ribbons[last])
  if (showFill && ribbons.length >= 2) {
    const fast = ribbons[0];
    const slow = ribbons[ribbons.length - 1];
    const { mainTop, mainHeight, chartLeft, chartWidth } = layout;
    const { startIndex, endIndex, priceMin, priceMax } = viewport;

    const fastVis: { x: number; y: number; val: number }[] = [];
    const slowVis: { x: number; y: number; val: number }[] = [];

    for (const pt of fast.points) {
      const idx = bars.findIndex(b => b.t === pt.t);
      if (idx < startIndex - 1 || idx > endIndex + 1) continue;
      fastVis.push({
        x: indexToX(idx, startIndex, endIndex, chartLeft, chartWidth),
        y: priceToY(pt.value, priceMin, priceMax, mainTop, mainHeight, scale),
        val: pt.value,
      });
    }
    for (const pt of slow.points) {
      const idx = bars.findIndex(b => b.t === pt.t);
      if (idx < startIndex - 1 || idx > endIndex + 1) continue;
      slowVis.push({
        x: indexToX(idx, startIndex, endIndex, chartLeft, chartWidth),
        y: priceToY(pt.value, priceMin, priceMax, mainTop, mainHeight, scale),
        val: pt.value,
      });
    }

    if (fastVis.length >= 2 && slowVis.length >= 2) {
      const isBull = fastVis[fastVis.length - 1].val >= slowVis[slowVis.length - 1].val;
      ctx.fillStyle = isBull ? "rgba(38,166,154,0.10)" : "rgba(239,83,80,0.10)";
      ctx.beginPath();
      ctx.moveTo(fastVis[0].x, fastVis[0].y);
      for (let i = 1; i < fastVis.length; i++) ctx.lineTo(fastVis[i].x, fastVis[i].y);
      for (let i = slowVis.length - 1; i >= 0; i--) ctx.lineTo(slowVis[i].x, slowVis[i].y);
      ctx.closePath();
      ctx.fill();
    }
  }

  for (const ribbon of ribbons) {
    if (ribbon.points.length < 2) continue;
    drawIndicatorLine(ctx, ribbon.points, bars, layout, viewport, ribbon.color, 1, scale);
  }
}
