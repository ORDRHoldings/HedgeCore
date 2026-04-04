import type { SRLevel, FVGZone, TrendLine, MarketStructureData, ChartPatternData, ChartPattern, VolatilityConeData, DivergenceLine, OrderBlock, LiquidityZone } from "../indicators/types";
import type { ChartLayout, Viewport } from "../core/data";
import type { PriceScale } from "../core/data";
import { priceToY, indexToX } from "../core/data";
import { THEME } from "../core/theme";

// ── Support/Resistance ──────────────────────────────────

export function drawSRLevels(
  ctx: CanvasRenderingContext2D,
  levels: SRLevel[],
  layout: ChartLayout,
  viewport: Viewport,
  scale: PriceScale = "linear",
): void {
  const { mainTop, mainHeight, chartLeft, priceAxisWidth, canvasWidth } = layout;
  const { priceMin, priceMax } = viewport;

  for (const level of levels) {
    const y = priceToY(level.price, priceMin, priceMax, mainTop, mainHeight, scale);
    if (y < mainTop || y > mainTop + mainHeight) continue;

    const alpha = Math.min(0.8, 0.2 + level.strength * 0.1);
    const color = level.type === "support"
      ? `${THEME.supportColor}${alpha})`
      : `${THEME.resistanceColor}${alpha})`;

    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(chartLeft, y);
    ctx.lineTo(canvasWidth - priceAxisWidth, y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Label
    ctx.font = "9px 'IBM Plex Mono', monospace";
    ctx.fillStyle = color;
    ctx.textAlign = "right";
    ctx.fillText(
      `${level.type === "support" ? "S" : "R"} (${level.strength})`,
      canvasWidth - priceAxisWidth - 4,
      y - 3,
    );
  }
}

// ── Fair Value Gaps ─────────────────────────────────────

export function drawFVGZones(
  ctx: CanvasRenderingContext2D,
  zones: FVGZone[],
  layout: ChartLayout,
  viewport: Viewport,
  scale: PriceScale = "linear",
): void {
  const { mainTop, mainHeight, chartLeft, chartWidth, priceAxisWidth, canvasWidth } = layout;
  const { startIndex, endIndex, priceMin, priceMax } = viewport;

  for (const zone of zones) {
    if (zone.endIndex < startIndex || zone.startIndex > endIndex) continue;

    const x1 = indexToX(zone.startIndex, startIndex, endIndex, chartLeft, chartWidth);
    const x2 = canvasWidth - priceAxisWidth; // extend to right edge
    const yTop = priceToY(zone.top, priceMin, priceMax, mainTop, mainHeight, scale);
    const yBot = priceToY(zone.bottom, priceMin, priceMax, mainTop, mainHeight, scale);

    ctx.fillStyle = zone.type === "bullish"
      ? THEME.fvgBullFill
      : THEME.fvgBearFill;
    ctx.fillRect(x1, yTop, x2 - x1, yBot - yTop);

    // Border
    ctx.strokeStyle = zone.type === "bullish"
      ? THEME.fvgBullBorder
      : THEME.fvgBearBorder;
    ctx.lineWidth = 0.5;
    ctx.strokeRect(x1, yTop, x2 - x1, yBot - yTop);

    // Label
    ctx.font = "9px 'IBM Plex Mono', monospace";
    ctx.fillStyle = zone.type === "bullish" ? `${THEME.supportColor}0.6)` : `${THEME.resistanceColor}0.6)`;
    ctx.textAlign = "left";
    ctx.fillText("FVG", x1 + 3, yTop + 10);
  }
}

// ── Auto Trendlines ─────────────────────────────────────

export function drawTrendlines(
  ctx: CanvasRenderingContext2D,
  lines: TrendLine[],
  bars: { t: number }[],
  layout: ChartLayout,
  viewport: Viewport,
  scale: PriceScale = "linear",
): void {
  const { mainTop, mainHeight, chartLeft, chartWidth } = layout;
  const { startIndex, endIndex, priceMin, priceMax } = viewport;

  for (const line of lines) {
    // Find bar indices by timestamp
    const i1 = bars.findIndex(b => b.t === line.x1);
    const i2 = bars.findIndex(b => b.t === line.x2);
    if (i1 < 0 || i2 < 0) continue;
    if (i2 < startIndex - 5 || i1 > endIndex + 5) continue;

    const x1 = indexToX(i1, startIndex, endIndex, chartLeft, chartWidth);
    const y1 = priceToY(line.y1, priceMin, priceMax, mainTop, mainHeight, scale);
    const x2 = indexToX(i2, startIndex, endIndex, chartLeft, chartWidth);
    const y2 = priceToY(line.y2, priceMin, priceMax, mainTop, mainHeight, scale);

    const alpha = Math.min(0.8, 0.3 + line.touches * 0.1);
    ctx.strokeStyle = line.direction === "up"
      ? `${THEME.supportColor}${alpha})`
      : `${THEME.resistanceColor}${alpha})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);

    // Extend the line to the right edge
    const slope = (y2 - y1) / (x2 - x1 || 1);
    const extX = layout.canvasWidth - layout.priceAxisWidth;
    const extY = y2 + slope * (extX - x2);
    ctx.lineTo(extX, extY);
    ctx.stroke();

    // Touch count label
    ctx.font = "9px 'IBM Plex Mono', monospace";
    ctx.fillStyle = ctx.strokeStyle;
    ctx.textAlign = "left";
    ctx.fillText(`\u00d7${line.touches}`, x2 + 4, y2 - 4);
  }
}

// ── Market Structure (HH/HL/LH/LL + BOS/CHoCH) ───────────────────────────

export function drawMarketStructure(
  ctx: CanvasRenderingContext2D,
  data: MarketStructureData,
  layout: ChartLayout,
  viewport: Viewport,
  scale: PriceScale = "linear",
): void {
  if (!data || (data.swings.length === 0 && data.events.length === 0)) return;

  const { mainTop, mainHeight, chartLeft, chartWidth, priceAxisWidth, canvasWidth } = layout;
  const { startIndex, endIndex, priceMin, priceMax } = viewport;

  ctx.save();

  // ── Draw swing structure skeleton (dashed lines connecting consecutive highs and lows)
  const visHighs = data.swings.filter(s => s.type === "high" && s.idx >= startIndex - 1 && s.idx <= endIndex + 1);
  const visLows  = data.swings.filter(s => s.type === "low"  && s.idx >= startIndex - 1 && s.idx <= endIndex + 1);

  ctx.lineWidth = 0.8;
  ctx.setLineDash([4, 4]);

  // Connect consecutive highs
  if (visHighs.length >= 2) {
    ctx.strokeStyle = "rgba(150,150,200,0.3)";
    ctx.beginPath();
    for (let i = 0; i < visHighs.length; i++) {
      const x = indexToX(visHighs[i].idx, startIndex, endIndex, chartLeft, chartWidth);
      const y = priceToY(visHighs[i].price, priceMin, priceMax, mainTop, mainHeight, scale);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // Connect consecutive lows
  if (visLows.length >= 2) {
    ctx.strokeStyle = "rgba(150,200,150,0.3)";
    ctx.beginPath();
    for (let i = 0; i < visLows.length; i++) {
      const x = indexToX(visLows[i].idx, startIndex, endIndex, chartLeft, chartWidth);
      const y = priceToY(visLows[i].price, priceMin, priceMax, mainTop, mainHeight, scale);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // ── Draw swing point markers + labels ────────────────────────────────────
  const LABEL_COLORS: Record<string, string> = {
    HH: "#26A69A", HL: "#26A69A",
    LH: "#EF5350", LL: "#EF5350",
  };

  for (const sw of data.swings) {
    if (sw.idx < startIndex - 1 || sw.idx > endIndex + 1) continue;
    const px = priceMin, px2 = priceMax;
    if (sw.price < px || sw.price > px2) continue;

    const x = indexToX(sw.idx, startIndex, endIndex, chartLeft, chartWidth);
    const y = priceToY(sw.price, priceMin, priceMax, mainTop, mainHeight, scale);
    const color = LABEL_COLORS[sw.label] ?? "#9598A1";
    const isHigh = sw.type === "high";

    // Diamond marker
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.8;
    const d = 3.5;
    ctx.beginPath();
    ctx.moveTo(x, y - d);
    ctx.lineTo(x + d, y);
    ctx.lineTo(x, y + d);
    ctx.lineTo(x - d, y);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;

    // Label
    ctx.font = "bold 9px 'IBM Plex Mono', monospace";
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.fillText(sw.label, x, isHigh ? y - 10 : y + 18);
  }

  // ── Draw BOS / CHoCH events ───────────────────────────────────────────────
  for (const ev of data.events) {
    if (ev.idx < startIndex - 1 || ev.idx > endIndex + 1) continue;
    if (ev.price < priceMin || ev.price > priceMax) continue;

    const x = indexToX(ev.idx, startIndex, endIndex, chartLeft, chartWidth);
    const y = priceToY(ev.price, priceMin, priceMax, mainTop, mainHeight, scale);
    const isBull = ev.direction === "bullish";
    const isCHoCH = ev.kind === "CHoCH";
    const color = isBull ? "#26A69A" : "#EF5350";
    const alpha = isCHoCH ? 1 : 0.7;

    // Horizontal break line (extends left from event bar)
    ctx.strokeStyle = color;
    ctx.lineWidth = isCHoCH ? 1.5 : 1;
    ctx.setLineDash(isCHoCH ? [] : [3, 3]);
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.moveTo(chartLeft, y);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // Event badge
    ctx.font = `bold 8px 'IBM Plex Mono', monospace`;
    const label = ev.kind;
    const tw = ctx.measureText(label).width;
    const bx = Math.min(x + 4, canvasWidth - priceAxisWidth - tw - 8);
    const by = isBull ? y - 14 : y + 4;

    ctx.fillStyle = isCHoCH ? color : "rgba(10,10,20,0.85)";
    ctx.beginPath();
    ctx.roundRect(bx, by, tw + 8, 12, isCHoCH ? 10 : 3);
    ctx.fill();
    ctx.fillStyle = isCHoCH ? "#fff" : color;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(label, bx + 4, by + 2);
    ctx.textBaseline = "alphabetic";
  }

  ctx.restore();
}

// ── Chart Patterns ────────────────────────────────────────────────────────────

const PATTERN_LABELS: Record<string, string> = {
  doubleTop:              "Double Top",
  doubleBottom:           "Double Bottom",
  headAndShoulders:       "H&S",
  inverseHeadAndShoulders:"Inv H&S",
  bullFlag:               "Bull Flag",
  bearFlag:               "Bear Flag",
  ascendingTriangle:      "Asc △",
  descendingTriangle:     "Desc △",
  symmetricTriangle:      "Sym △",
  risingWedge:            "Rising ◇",
  fallingWedge:           "Falling ◇",
};

export function drawChartPatterns(
  ctx: CanvasRenderingContext2D,
  data: ChartPatternData,
  layout: ChartLayout,
  viewport: Viewport,
  scale: PriceScale = "linear",
): void {
  if (!data || data.patterns.length === 0) return;

  const { mainTop, mainHeight, chartLeft, chartWidth, priceAxisWidth, canvasWidth } = layout;
  const { startIndex, endIndex, priceMin, priceMax } = viewport;

  ctx.save();

  for (const pat of data.patterns) {
    if (pat.endIdx < startIndex - 5 || pat.startIdx > endIndex + 5) continue;

    const bull  = pat.direction === "bullish";
    const baseColor = bull ? "#26A69A" : "#EF5350";
    const alpha = pat.confirmed ? 0.85 : 0.55;

    // Clamp bar range to viewport
    const visStart = Math.max(pat.startIdx, startIndex);
    const visEnd   = Math.min(pat.endIdx,   endIndex);
    const x1 = indexToX(visStart, startIndex, endIndex, chartLeft, chartWidth);
    const x2 = indexToX(visEnd,   startIndex, endIndex, chartLeft, chartWidth);

    // Bounding box from key points
    const prices = pat.keyPoints.map(kp => kp.price);
    const pHigh = Math.max(...prices);
    const pLow  = Math.min(...prices);
    const yTop  = priceToY(pHigh, priceMin, priceMax, mainTop, mainHeight, scale);
    const yBot  = priceToY(pLow,  priceMin, priceMax, mainTop, mainHeight, scale);

    // Subtle fill
    ctx.fillStyle = bull
      ? `rgba(38,166,154,0.04)`
      : `rgba(239,83,80,0.04)`;
    ctx.fillRect(x1, yTop, x2 - x1, yBot - yTop);

    // Bounding border (dashed)
    ctx.strokeStyle = `${baseColor}${Math.round(alpha * 30).toString(16).padStart(2, "0")}`;
    ctx.lineWidth = 0.5;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(x1, yTop, x2 - x1, yBot - yTop);
    ctx.setLineDash([]);

    // Neckline (solid dashed horizontal)
    if (pat.neckline !== undefined) {
      const yNeck = priceToY(pat.neckline, priceMin, priceMax, mainTop, mainHeight, scale);
      if (yNeck >= mainTop && yNeck <= mainTop + mainHeight) {
        ctx.strokeStyle = pat.confirmed
          ? baseColor
          : `${baseColor}88`;
        ctx.lineWidth = pat.confirmed ? 1.5 : 1;
        ctx.setLineDash(pat.confirmed ? [] : [6, 4]);
        ctx.beginPath();
        ctx.moveTo(x1, yNeck);
        ctx.lineTo(Math.min(x2 + 30, canvasWidth - priceAxisWidth), yNeck);
        ctx.stroke();
        ctx.setLineDash([]);

        // Neckline price tag
        ctx.font = "8px 'IBM Plex Mono', monospace";
        ctx.fillStyle = `${baseColor}cc`;
        ctx.textAlign = "right";
        ctx.fillText(pat.neckline.toFixed(2), canvasWidth - priceAxisWidth - 2, yNeck - 2);
      }
    }

    // Trendline boundaries for triangle/wedge/flag patterns
    if (
      pat.keyPoints.length === 4 &&
      ["ascendingTriangle","descendingTriangle","symmetricTriangle","risingWedge","fallingWedge"].includes(pat.type)
    ) {
      const [kp0, kp1, kp2, kp3] = pat.keyPoints;  // H1, L1, H2, L2

      // Top boundary (kp0 → kp2)
      const tx1 = indexToX(kp0.idx, startIndex, endIndex, chartLeft, chartWidth);
      const ty1 = priceToY(kp0.price, priceMin, priceMax, mainTop, mainHeight, scale);
      const tx2 = indexToX(kp2.idx, startIndex, endIndex, chartLeft, chartWidth);
      const ty2 = priceToY(kp2.price, priceMin, priceMax, mainTop, mainHeight, scale);

      // Extend top line to x2
      const tSlope = tx2 !== tx1 ? (ty2 - ty1) / (tx2 - tx1) : 0;
      const extTopY = ty2 + tSlope * (x2 - tx2);

      ctx.strokeStyle = `${baseColor}${Math.round(alpha * 200).toString(16).padStart(2, "0")}`;
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 3]);
      ctx.beginPath();
      ctx.moveTo(tx1, ty1);
      ctx.lineTo(tx2, ty2);
      ctx.lineTo(x2, extTopY);
      ctx.stroke();

      // Bottom boundary (kp1 → kp3)
      const bx1 = indexToX(kp1.idx, startIndex, endIndex, chartLeft, chartWidth);
      const by1 = priceToY(kp1.price, priceMin, priceMax, mainTop, mainHeight, scale);
      const bx2 = indexToX(kp3.idx, startIndex, endIndex, chartLeft, chartWidth);
      const by2 = priceToY(kp3.price, priceMin, priceMax, mainTop, mainHeight, scale);
      const bSlope = bx2 !== bx1 ? (by2 - by1) / (bx2 - bx1) : 0;
      const extBotY = by2 + bSlope * (x2 - bx2);

      ctx.beginPath();
      ctx.moveTo(bx1, by1);
      ctx.lineTo(bx2, by2);
      ctx.lineTo(x2, extBotY);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Key point markers
    for (const kp of pat.keyPoints) {
      if (kp.idx < startIndex - 2 || kp.idx > endIndex + 2) continue;
      if (kp.price < priceMin || kp.price > priceMax) continue;

      const kx = indexToX(kp.idx, startIndex, endIndex, chartLeft, chartWidth);
      const ky = priceToY(kp.price, priceMin, priceMax, mainTop, mainHeight, scale);

      ctx.fillStyle = baseColor;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(kx, ky, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      // Small label
      ctx.font = "bold 8px 'IBM Plex Mono', monospace";
      ctx.fillStyle = `${baseColor}cc`;
      ctx.textAlign = "center";
      const above = kp.label === "L" || kp.label === "LS" || kp.label === "H" || kp.label === "T" || kp.label === "R";
      ctx.fillText(kp.label, kx, above ? ky - 6 : ky + 14);
    }

    // Target projection line
    if (pat.target !== undefined && pat.target > priceMin * 0.8 && pat.target < priceMax * 1.2) {
      const yTarget = priceToY(pat.target, priceMin, priceMax, mainTop, mainHeight, scale);
      if (yTarget >= mainTop && yTarget <= mainTop + mainHeight) {
        const tStart = Math.min(x2 + 4, canvasWidth - priceAxisWidth - 20);
        const tEnd   = Math.min(x2 + 50, canvasWidth - priceAxisWidth - 4);

        ctx.strokeStyle = bull ? "rgba(38,166,154,0.5)" : "rgba(239,83,80,0.5)";
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(tStart, yTarget);
        ctx.lineTo(tEnd, yTarget);
        ctx.stroke();
        ctx.setLineDash([]);

        // Arrow head
        ctx.fillStyle = bull ? "rgba(38,166,154,0.7)" : "rgba(239,83,80,0.7)";
        ctx.beginPath();
        const arrowDir = bull ? -1 : 1;
        ctx.moveTo(tEnd, yTarget);
        ctx.lineTo(tEnd - 5, yTarget - 3 * arrowDir);
        ctx.lineTo(tEnd - 5, yTarget + 3 * arrowDir);
        ctx.closePath();
        ctx.fill();
      }
    }

    // Pattern label badge
    const label = PATTERN_LABELS[pat.type] ?? pat.type;
    const confStr = `${Math.round(pat.confidence * 100)}%`;
    const fullLabel = pat.confirmed ? `${label} ✓` : `${label} ${confStr}`;

    ctx.font = "bold 9px 'IBM Plex Mono', monospace";
    const tw = ctx.measureText(fullLabel).width;
    const bx = Math.min(x1 + 4, canvasWidth - priceAxisWidth - tw - 12);
    const by = yTop - 2;

    ctx.fillStyle = pat.confirmed ? baseColor : "rgba(10,10,20,0.75)";
    ctx.beginPath();
    ctx.roundRect(bx, by - 11, tw + 8, 13, 4);
    ctx.fill();

    ctx.fillStyle = pat.confirmed ? "#fff" : baseColor;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(fullLabel, bx + 4, by);
  }

  ctx.restore();
}

// ── Volatility Cone ───────────────────────────────────────────────────────────

export function drawVolatilityCone(
  ctx: CanvasRenderingContext2D,
  data: VolatilityConeData,
  layout: ChartLayout,
  viewport: Viewport,
  scale: PriceScale = "linear",
): void {
  if (!data || data.annualHV <= 0) return;

  const { mainTop, mainHeight, chartLeft, chartWidth, priceAxisWidth, canvasWidth } = layout;
  const { startIndex, endIndex, priceMin, priceMax } = viewport;

  // Anchor must be within or near the visible range
  if (data.anchorIdx < startIndex - 5 || data.anchorIdx > endIndex + data.forwardBars + 5) return;

  const { anchorIdx, anchorPrice, annualHV, barsPerYear, forwardBars } = data;

  // Per-bar volatility (1σ move per bar as decimal)
  const barSigma = annualHV / Math.sqrt(barsPerYear);

  const xAnchor = indexToX(anchorIdx, startIndex, endIndex, chartLeft, chartWidth);
  const yAnchor = priceToY(anchorPrice, priceMin, priceMax, mainTop, mainHeight, scale);

  ctx.save();

  // Draw cone bands at 1σ and 2σ
  const sigmas = [
    { mult: 2, fillAlpha: 0.04, strokeAlpha: 0.25, lineW: 0.8 },
    { mult: 1, fillAlpha: 0.08, strokeAlpha: 0.45, lineW: 1.0 },
  ];

  for (const { mult, fillAlpha, strokeAlpha, lineW } of sigmas) {
    // Collect upper and lower band coordinates
    const upper: { x: number; y: number }[] = [{ x: xAnchor, y: yAnchor }];
    const lower: { x: number; y: number }[] = [{ x: xAnchor, y: yAnchor }];

    for (let n = 1; n <= forwardBars; n++) {
      const bIdx = anchorIdx + n;
      const barX = indexToX(bIdx, startIndex, endIndex, chartLeft, chartWidth);
      if (barX > canvasWidth - priceAxisWidth + 1) break;

      const sigma_n = barSigma * Math.sqrt(n) * mult;
      const uPrice = anchorPrice * (1 + sigma_n);
      const lPrice = anchorPrice * (1 - sigma_n);

      const uy = priceToY(uPrice, priceMin, priceMax, mainTop, mainHeight, scale);
      const ly = priceToY(lPrice, priceMin, priceMax, mainTop, mainHeight, scale);

      if (uy >= mainTop && uy <= mainTop + mainHeight) upper.push({ x: barX, y: uy });
      if (ly >= mainTop && ly <= mainTop + mainHeight) lower.push({ x: barX, y: ly });
    }

    if (upper.length < 2) continue;

    // Fill between upper and lower
    const color = `rgba(100,181,246,${fillAlpha})`;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(upper[0].x, upper[0].y);
    for (const pt of upper) ctx.lineTo(pt.x, pt.y);
    for (let i = lower.length - 1; i >= 0; i--) ctx.lineTo(lower[i].x, lower[i].y);
    ctx.closePath();
    ctx.fill();

    // Upper band line
    ctx.strokeStyle = `rgba(100,181,246,${strokeAlpha})`;
    ctx.lineWidth = lineW;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    upper.forEach((pt, i) => i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y));
    ctx.stroke();

    // Lower band line
    ctx.beginPath();
    lower.forEach((pt, i) => i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y));
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Anchor dot
  ctx.fillStyle = "rgba(100,181,246,0.8)";
  ctx.beginPath();
  ctx.arc(xAnchor, yAnchor, 3, 0, Math.PI * 2);
  ctx.fill();

  // Label badge
  const hvPct = (annualHV * 100).toFixed(1);
  const label = `σ cone HV:${hvPct}%`;
  ctx.font = "9px 'IBM Plex Mono', monospace";
  const tw = ctx.measureText(label).width;
  const bx = Math.min(xAnchor + 6, canvasWidth - priceAxisWidth - tw - 10);
  const by = yAnchor - 14;
  ctx.fillStyle = "rgba(10,14,26,0.8)";
  ctx.beginPath();
  ctx.roundRect(bx, by, tw + 8, 12, 4);
  ctx.fill();
  ctx.fillStyle = "rgba(100,181,246,0.9)";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(label, bx + 4, by + 9);

  ctx.restore();
}

// ── Divergence — price-chart side ─────────────────────────────────────────────

export function drawDivergenceOverlay(
  ctx: CanvasRenderingContext2D,
  lines: DivergenceLine[],
  oscLabel: string,
  layout: ChartLayout,
  viewport: Viewport,
  scale: PriceScale = "linear",
): void {
  if (!lines || lines.length === 0) return;

  const { mainTop, mainHeight, chartLeft, chartWidth } = layout;
  const { startIndex, endIndex, priceMin, priceMax } = viewport;

  ctx.save();

  for (const div of lines) {
    if (div.idx2 < startIndex - 2 || div.idx1 > endIndex + 2) continue;

    const x1 = indexToX(div.idx1, startIndex, endIndex, chartLeft, chartWidth);
    const x2 = indexToX(div.idx2, startIndex, endIndex, chartLeft, chartWidth);
    const y1 = priceToY(div.price1, priceMin, priceMax, mainTop, mainHeight, scale);
    const y2 = priceToY(div.price2, priceMin, priceMax, mainTop, mainHeight, scale);

    if (y1 < mainTop || y1 > mainTop + mainHeight) continue;
    if (y2 < mainTop || y2 > mainTop + mainHeight) continue;

    const bull = div.direction === "bullish";
    const color = bull ? "#26A69A" : "#EF5350";
    const alpha = div.kind === "regular" ? 0.85 : 0.55;

    // Divergence line
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash(div.kind === "hidden" ? [5, 3] : []);
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // Endpoint circles
    ctx.fillStyle = color;
    ctx.globalAlpha = alpha;
    for (const [x, y] of [[x1, y1], [x2, y2]] as [number, number][]) {
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Label badge at midpoint (above for bearish, below for bullish)
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const isRegular = div.kind === "regular";
    const tag = isRegular
      ? (bull ? `${oscLabel}↗` : `${oscLabel}↘`)
      : (bull ? `${oscLabel}↗h` : `${oscLabel}↘h`);

    ctx.font = `${isRegular ? "bold " : ""}8px 'IBM Plex Mono', monospace`;
    const tw = ctx.measureText(tag).width;
    const by2 = bull ? my + 4 : my - 12;

    ctx.fillStyle = "rgba(10,10,20,0.80)";
    ctx.beginPath();
    ctx.roundRect(mx - tw / 2 - 3, by2, tw + 6, 11, 3);
    ctx.fill();

    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(tag, mx, by2 + 8);
    ctx.textBaseline = "alphabetic";
  }

  ctx.restore();
}

// ── Order Blocks ──────────────────────────────────────────────────────────────

export function drawOrderBlocks(
  ctx: CanvasRenderingContext2D,
  blocks: OrderBlock[],
  layout: ChartLayout,
  viewport: Viewport,
  scale: PriceScale = "linear",
): void {
  if (!blocks.length) return;
  const { mainTop, mainHeight, chartLeft, chartWidth, priceAxisWidth, canvasWidth } = layout;
  const { startIndex, endIndex, priceMin, priceMax } = viewport;

  for (const ob of blocks) {
    if (ob.barIndex > endIndex) continue;

    const x1 = Math.max(chartLeft, indexToX(ob.barIndex, startIndex, endIndex, chartLeft, chartWidth));
    const x2 = canvasWidth - priceAxisWidth; // extend to right edge
    const yTop = priceToY(ob.top, priceMin, priceMax, mainTop, mainHeight, scale);
    const yBot = priceToY(ob.bottom, priceMin, priceMax, mainTop, mainHeight, scale);
    const h = Math.abs(yBot - yTop);
    if (h < 1) continue;

    const isBull = ob.type === "bullish";
    // Fill
    ctx.fillStyle = isBull ? "rgba(38,166,154,0.12)" : "rgba(239,83,80,0.12)";
    ctx.fillRect(x1, yTop, x2 - x1, yBot - yTop);
    // Left border accent
    ctx.fillStyle = isBull ? "rgba(38,166,154,0.8)" : "rgba(239,83,80,0.8)";
    ctx.fillRect(x1, yTop, 2, yBot - yTop);
    // Dashed top/bottom border
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = isBull ? "rgba(38,166,154,0.5)" : "rgba(239,83,80,0.5)";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(x1, yTop); ctx.lineTo(x2, yTop);
    ctx.moveTo(x1, yBot); ctx.lineTo(x2, yBot);
    ctx.stroke();
    ctx.setLineDash([]);
    // Label
    ctx.font = "bold 8px 'IBM Plex Mono', monospace";
    ctx.fillStyle = isBull ? "rgba(38,166,154,0.9)" : "rgba(239,83,80,0.9)";
    ctx.textAlign = "left";
    ctx.fillText(isBull ? "OB" : "OB", x1 + 4, yTop + 9);
  }
}

// ── Liquidity Zones ───────────────────────────────────────────────────────────

export function drawLiquidityZones(
  ctx: CanvasRenderingContext2D,
  zones: LiquidityZone[],
  layout: ChartLayout,
  viewport: Viewport,
  scale: PriceScale = "linear",
): void {
  if (!zones.length) return;
  const { mainTop, mainHeight, chartLeft, chartWidth, priceAxisWidth, canvasWidth } = layout;
  const { startIndex, endIndex, priceMin, priceMax } = viewport;

  for (const zone of zones) {
    if (zone.startIndex > endIndex) continue;

    const x1 = Math.max(chartLeft, indexToX(zone.startIndex, startIndex, endIndex, chartLeft, chartWidth));
    const x2 = canvasWidth - priceAxisWidth;
    const yTop = priceToY(zone.top, priceMin, priceMax, mainTop, mainHeight, scale);
    const yBot = priceToY(zone.bottom, priceMin, priceMax, mainTop, mainHeight, scale);
    const isBuySide = zone.type === "buy-side";

    // Thin highlight band
    ctx.fillStyle = isBuySide ? "rgba(38,166,154,0.07)" : "rgba(239,83,80,0.07)";
    ctx.fillRect(x1, yTop, x2 - x1, Math.abs(yBot - yTop));

    // Dashed line at price level
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = isBuySide ? "rgba(38,166,154,0.6)" : "rgba(239,83,80,0.6)";
    ctx.lineWidth = 0.75;
    const yMid = priceToY(zone.price, priceMin, priceMax, mainTop, mainHeight, scale);
    ctx.beginPath();
    ctx.moveTo(x1, yMid); ctx.lineTo(x2, yMid);
    ctx.stroke();
    ctx.setLineDash([]);

    // Label
    ctx.font = "bold 8px 'IBM Plex Mono', monospace";
    ctx.fillStyle = isBuySide ? "rgba(38,166,154,0.9)" : "rgba(239,83,80,0.9)";
    ctx.textAlign = "left";
    ctx.fillText(isBuySide ? `EQH×${zone.strength}` : `EQL×${zone.strength}`, x1 + 4, yMid - 2);
  }
}
