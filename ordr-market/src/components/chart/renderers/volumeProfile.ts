/**
 * volumeProfile.ts -- Horizontal volume histogram drawn from the RIGHT
 * side of the chart, with POC / VAH / VAL reference lines.
 *
 * Sprint 4 enhancements:
 * - Value Area highlight band (semi-transparent fill between VAL & VAH)
 * - Maximum-volume bar highlighted with full-opacity color
 * - POC price label on right side of chart
 * - VAH/VAL price labels on right side
 * - Total volume % display in POC label
 */

import type { VolumeProfileData } from "../indicators/types";
import type { ChartLayout, Viewport } from "../core/data";
import type { PriceScale } from "../core/data";
import { priceToY } from "../core/data";
import { THEME } from "../core/theme";

export function drawVolumeProfile(
  ctx: CanvasRenderingContext2D,
  profile: VolumeProfileData,
  layout: ChartLayout,
  viewport: Viewport,
  scale: PriceScale = "linear",
): void {
  if (!profile || profile.levels.length === 0) return;

  const { mainTop, mainHeight, chartLeft, chartWidth, priceAxisWidth, canvasWidth } = layout;
  const { priceMin, priceMax } = viewport;

  // Maximum bar width is 20% of the chart area
  const maxBarWidth = chartWidth * 0.2;

  // Find maximum volume across all levels for normalization
  let maxVol = 0;
  let totalVol = 0;
  let pocLevel = profile.levels[0];
  for (const lvl of profile.levels) {
    if (lvl.volume > maxVol) { maxVol = lvl.volume; pocLevel = lvl; }
    totalVol += lvl.volume;
  }
  if (maxVol === 0) return;

  // Determine bar height from adjacent levels
  const sortedLevels = [...profile.levels].sort((a, b) => a.price - b.price);
  let barHeightPx = 4; // fallback
  if (sortedLevels.length >= 2) {
    const priceDiff = sortedLevels[1].price - sortedLevels[0].price;
    const y1 = priceToY(sortedLevels[0].price, priceMin, priceMax, mainTop, mainHeight, scale);
    const y2 = priceToY(sortedLevels[0].price + priceDiff, priceMin, priceMax, mainTop, mainHeight, scale);
    barHeightPx = Math.max(2, Math.abs(y1 - y2) - 1);
  }

  const chartRight = chartLeft + chartWidth;

  // ── Value Area fill band (VAL → VAH) ─────────────────────────────────────
  if (
    profile.vahPrice !== undefined && profile.valPrice !== undefined &&
    profile.vahPrice >= priceMin && profile.valPrice <= priceMax
  ) {
    const vahY = priceToY(Math.min(profile.vahPrice, priceMax), priceMin, priceMax, mainTop, mainHeight, scale);
    const valY = priceToY(Math.max(profile.valPrice, priceMin), priceMin, priceMax, mainTop, mainHeight, scale);
    ctx.fillStyle = "rgba(255,160,0,0.04)";
    ctx.fillRect(chartLeft, vahY, chartWidth - 0, valY - vahY);
  }

  // ── Draw horizontal volume bars ───────────────────────────────────────────
  for (const lvl of profile.levels) {
    if (lvl.price < priceMin || lvl.price > priceMax) continue;

    const y = priceToY(lvl.price, priceMin, priceMax, mainTop, mainHeight, scale);
    const totalWidth = (lvl.volume / maxVol) * maxBarWidth;
    const buyWidth = lvl.volume > 0 ? (lvl.buyVolume / lvl.volume) * totalWidth : 0;
    const sellWidth = totalWidth - buyWidth;
    const isPocBar = lvl.price === pocLevel.price;

    // POC bar gets full opacity, others slightly dimmed
    const alpha = isPocBar ? 1.0 : 0.7;

    // Buy portion
    if (buyWidth > 0) {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = THEME.vpBuyColor;
      ctx.fillRect(chartRight - totalWidth, y - barHeightPx / 2, buyWidth, barHeightPx);
    }
    // Sell portion
    if (sellWidth > 0) {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = THEME.vpSellColor;
      ctx.fillRect(chartRight - sellWidth, y - barHeightPx / 2, sellWidth, barHeightPx);
    }
    ctx.globalAlpha = 1;
  }

  // ── POC line ──────────────────────────────────────────────────────────────
  if (profile.poc >= priceMin && profile.poc <= priceMax) {
    const pocY = priceToY(profile.poc, priceMin, priceMax, mainTop, mainHeight, scale);
    ctx.strokeStyle = THEME.vpPocColor;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 3]);
    ctx.beginPath();
    ctx.moveTo(chartLeft, pocY);
    ctx.lineTo(canvasWidth - priceAxisWidth, pocY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Left label
    ctx.font = "bold 9px 'IBM Plex Mono', monospace";
    ctx.fillStyle = THEME.vpPocColor;
    ctx.textAlign = "left";
    ctx.fillText("POC", chartLeft + 4, pocY - 3);

    // Right label: price + % of total vol
    const pocPct = totalVol > 0 ? ((pocLevel.volume / totalVol) * 100).toFixed(1) : "0.0";
    const pocPriceStr = profile.poc.toFixed(profile.poc > 100 ? 2 : 5);
    ctx.textAlign = "right";
    ctx.fillText(`${pocPriceStr} (${pocPct}%)`, canvasWidth - priceAxisWidth - 6, pocY - 3);
  }

  // ── VAH line ──────────────────────────────────────────────────────────────
  if (profile.vahPrice >= priceMin && profile.vahPrice <= priceMax) {
    const vahY = priceToY(profile.vahPrice, priceMin, priceMax, mainTop, mainHeight, scale);
    ctx.strokeStyle = THEME.vpVahValColor;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(chartLeft, vahY);
    ctx.lineTo(canvasWidth - priceAxisWidth, vahY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.font = "9px 'IBM Plex Mono', monospace";
    ctx.fillStyle = THEME.vpVahValColor;
    ctx.textAlign = "left";
    ctx.fillText("VAH", chartLeft + 4, vahY - 3);
    const vahStr = profile.vahPrice.toFixed(profile.vahPrice > 100 ? 2 : 5);
    ctx.textAlign = "right";
    ctx.fillText(vahStr, canvasWidth - priceAxisWidth - 6, vahY - 3);
  }

  // ── VAL line ──────────────────────────────────────────────────────────────
  if (profile.valPrice >= priceMin && profile.valPrice <= priceMax) {
    const valY = priceToY(profile.valPrice, priceMin, priceMax, mainTop, mainHeight, scale);
    ctx.strokeStyle = THEME.vpVahValColor;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(chartLeft, valY);
    ctx.lineTo(canvasWidth - priceAxisWidth, valY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.font = "9px 'IBM Plex Mono', monospace";
    ctx.fillStyle = THEME.vpVahValColor;
    ctx.textAlign = "left";
    ctx.fillText("VAL", chartLeft + 4, valY + 10);
    const valStr = profile.valPrice.toFixed(profile.valPrice > 100 ? 2 : 5);
    ctx.textAlign = "right";
    ctx.fillText(valStr, canvasWidth - priceAxisWidth - 6, valY + 10);
  }
}
