/**
 * ChartRenderer — Extracted rendering pipeline from ChartEngine.
 *
 * Pure function that takes all rendering inputs and draws the full
 * 11-layer chart onto a canvas context. No React, no refs, no state.
 */
import type {
  Bar, IndicatorPoint, BandPoint, MACDPoint,
  StochasticPoint, ADXPoint, IchimokuPoint,
  VolumeProfileData, PivotPointData,
  SuperTrendPoint, ChandelierPoint, ChandeKrollPoint, AlligatorPoint,
  ZigzagPoint, AutoFibData, MARibbonData,
  BullBearPoint, KlingerPoint, PPOPoint, RVIPoint, SMIPoint, TSIPoint,
  VortexPoint, AroonPoint,
  SRLevel, FVGZone, TrendLine,
  RSISubPane, StochSubPane, WilliamsRSubPane, CCISubPane, ADXSubPane, ATRSubPane,
} from "../indicators/types";
import type { ChartLayout, SubPaneLayout } from "../core/data";
import type { ZoomPanState } from "../core/zoom";
import type { CrosshairState, CrosshairMode } from "../core/crosshair";
import type { ChartType } from "./chartTypes";
import type { Drawing, DrawingType, MagneticSnapResult } from "./drawings";

import { computeViewport, indexToX, priceToY } from "../core/data";
import { syncThemeWithCSS, THEME } from "../core/theme";
import { drawPriceAxis, drawTimeAxis } from "../core/axis";
import { drawCrosshair } from "../core/crosshair";
import { drawCandlesticks } from "./candlestick";
import { drawVolume } from "./volume";
import {
  drawIndicatorLine, drawBands, drawBollinger, drawDonchianBands,
  drawRSI, drawMACD,
  drawVWAP, drawIchimoku,
  drawParabolicSAR, drawPivotPoints,
  drawSuperTrend, drawChandelierExit, drawChandeKrollStop,
  drawAlligator, drawZigzag, drawAutoFib, drawMARibbon,
} from "./indicators";
import { drawSRLevels, drawFVGZones, drawTrendlines } from "./overlays";
import {
  drawDrawings, drawRubberBand, drawDrawingPriceLabels,
  shiftSnapPoint,
} from "./drawings";
import { drawVolumeProfile } from "./volumeProfile";
import { drawCurrentPriceLine, drawOHLCLegend, drawIndicatorLegend } from "./priceLine";
import {
  drawLineChart, drawAreaChart, drawBarChart,
  drawHollowCandles, drawHeikinAshi, drawBaseline,
} from "./chartTypes";
import { drawSessions } from "./sessions";
import {
  drawStochastic, drawStochRSI, drawWilliamsR,
  drawCCI, drawADX, drawATR, drawMFI, drawCMF, drawOBV,
  drawAO, drawBOP, drawBBTrend, drawBullBearPower,
  drawChaikinOsc, drawCMO, drawChoppiness, drawChopZone,
  drawConnorsRSI, drawCoppock, drawDPO, drawEOM, drawEFI,
  drawFisher, drawKlinger, drawKST, drawMassIndex, drawMomentum,
  drawPPO, drawROC, drawRVI, drawSMI, drawTRIX, drawTSI,
  drawUltimateOscillator, drawVortex, drawAroon,
  drawADL, drawCVD, drawCVI, drawNetVolume, drawPVT, drawVolumeOscillator,
  drawBBPercentB, drawBBWidth, drawHistVol, drawCorrelation, drawADRPane,
} from "./oscillators";

// ── Types ────────────────────────────────────────────────────────────────────

export interface IndicatorBundle {
  overlayLines: {
    points: IndicatorPoint[];
    color: string;
    label: string;
    /** Line width in pixels (default 1.5) */
    thickness?: number;
    /** Color each segment by price position relative to the MA value */
    priceColored?: boolean;
  }[];
  bands: {
    points: BandPoint[];
    fill: string;
    line: string;
    label: string;
    /** Dispatch to a dedicated renderer: "bollinger" | "donchian" */
    type?: string;
    showSqueeze?: boolean;
    showBreakout?: boolean;
  }[];
  vwap: IndicatorPoint[];
  vwapBands: BandPoint[];
  ichimoku: IchimokuPoint[];
  parabolicSAR: IndicatorPoint[];
  pivotPoints: PivotPointData | null;
  volumeProfile: VolumeProfileData | null;
  subPaneData: Record<string, unknown>;
  sr: SRLevel[];
  fvg: FVGZone[];
  trend: TrendLine[];
  supertrend: SuperTrendPoint[];
  chandelierExit: ChandelierPoint[];
  chandeKrollStop: ChandeKrollPoint[];
  alligator: AlligatorPoint[];
  zigzag: ZigzagPoint[];
  autoFib: AutoFibData | null;
  maRibbon: MARibbonData[];
  maRibbonShowFill: boolean;
  supertrendCfg: { showArrows: boolean; showFill: boolean; showLabel: boolean };
  chandelierShowArrows: boolean;
}

/** Snapshot of ref values read at call time */
export interface RenderRefs {
  canvas: HTMLCanvasElement | null;
  zoom: ZoomPanState;
  priceZoom: number;
  crosshair: CrosshairState;
  drawingPoints: { index: number; price: number }[];
  drawingMode: DrawingType | null;
  shiftHeld: boolean;
  hideDrawings: boolean;
  dragOverride: { id: string; points: { index: number; price: number }[] } | null;
  magneticSnapResult: MagneticSnapResult | null;
}

/** Stable values from React state/props */
export interface RenderProps {
  bars: Bar[];
  layout: ChartLayout;
  indicators: IndicatorBundle;
  drawings: Drawing[];
  pair: string;
  interval: string;
  subPanes: string[];
  dimensions: { w: number; h: number };
  chartType: ChartType;
  enabledSessions: string[];
  priceScale: "linear" | "log" | "percent";
  crosshairMode: CrosshairMode;
  selectedDrawingId: string | null;
  hoveredDrawingId: string | null;
}

// ── Helper ───────────────────────────────────────────────────────────────────

function withPane(layout: ChartLayout, pane: SubPaneLayout): ChartLayout {
  return { ...layout, subPaneTop: pane.top, subPaneHeight: pane.height };
}

// ── Main render pipeline ─────────────────────────────────────────────────────

export function renderChart(refs: RenderRefs, props: RenderProps): void {
  syncThemeWithCSS();

  const { canvas, zoom, crosshair: ch, drawingPoints, drawingMode,
    shiftHeld, hideDrawings, dragOverride, magneticSnapResult } = refs;
  const { bars, layout, indicators, drawings, pair, interval,
    subPanes, dimensions, chartType, enabledSessions,
    priceScale, crosshairMode, selectedDrawingId, hoveredDrawingId } = props;

  if (!canvas || bars.length === 0) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  canvas.width = dimensions.w * dpr;
  canvas.height = dimensions.h * dpr;
  canvas.style.width = `${dimensions.w}px`;
  canvas.style.height = `${dimensions.h}px`;
  ctx.scale(dpr, dpr);

  // Viewport with price zoom + offset
  const rawViewport = computeViewport(bars, zoom.startIndex, zoom.endIndex);
  const viewport = (() => {
    let vp = rawViewport;
    if (refs.priceZoom !== 1.0) {
      const mid = (vp.priceMin + vp.priceMax) / 2;
      const halfRange = ((vp.priceMax - vp.priceMin) / 2) * refs.priceZoom;
      vp = { ...vp, priceMin: mid - halfRange, priceMax: mid + halfRange };
    }
    if (zoom.priceOffset !== 0) {
      vp = { ...vp, priceMin: vp.priceMin + zoom.priceOffset, priceMax: vp.priceMax + zoom.priceOffset };
    }
    return vp;
  })();

  // Reference price for percent scale
  const refBarIdx = Math.max(0, Math.floor(zoom.startIndex));
  const refPrice = bars[refBarIdx]?.c || bars[0]?.c || 1;

  // Background
  ctx.fillStyle = THEME.canvasBg;
  ctx.fillRect(0, 0, dimensions.w, dimensions.h);

  // Watermark
  ctx.save();
  ctx.font = `bold ${Math.min(layout.mainHeight * 0.18, 120)}px 'IBM Plex Mono', monospace`;
  ctx.fillStyle = "rgba(42,46,57,0.18)";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const watermarkText = pair.length > 3 ? `${pair.slice(0, 3)}/${pair.slice(3)}` : pair;
  ctx.fillText(watermarkText, layout.chartLeft + layout.chartWidth / 2, layout.mainTop + layout.mainHeight / 2);
  ctx.restore();

  // Session highlighting (behind everything)
  if (enabledSessions.length > 0) {
    drawSessions(ctx, bars, layout, viewport, enabledSessions);
  }

  // Layer 1: Behind candles
  if (indicators.sr.length > 0) drawSRLevels(ctx, indicators.sr, layout, viewport, priceScale);
  if (indicators.fvg.length > 0) drawFVGZones(ctx, indicators.fvg, layout, viewport, priceScale);
  if (indicators.trend.length > 0) drawTrendlines(ctx, indicators.trend, bars, layout, viewport, priceScale);
  for (const band of indicators.bands) {
    if (band.type === "bollinger") {
      drawBollinger(ctx, band.points, bars, layout, viewport, band.fill, band.line, priceScale, band.showSqueeze ?? true);
    } else if (band.type === "donchian") {
      drawDonchianBands(ctx, band.points, bars, layout, viewport, band.fill, band.line, priceScale, band.showBreakout ?? true);
    } else {
      drawBands(ctx, band.points, bars, layout, viewport, band.fill, band.line, priceScale);
    }
  }
  if (indicators.ichimoku.length > 0) drawIchimoku(ctx, indicators.ichimoku, bars, layout, viewport, priceScale);

  // Layer 2: Price data (chart type dispatch)
  switch (chartType) {
    case "candles":    drawCandlesticks(ctx, bars, layout, viewport, priceScale); break;
    case "hollow":     drawHollowCandles(ctx, bars, layout, viewport, priceScale); break;
    case "bars":       drawBarChart(ctx, bars, layout, viewport, priceScale); break;
    case "line":       drawLineChart(ctx, bars, layout, viewport, priceScale); break;
    case "area":       drawAreaChart(ctx, bars, layout, viewport, priceScale); break;
    case "heikinAshi": drawHeikinAshi(ctx, bars, layout, viewport, priceScale); break;
    case "baseline":   drawBaseline(ctx, bars, layout, viewport, priceScale); break;
  }

  // Layer 3: Overlays
  for (const line of indicators.overlayLines) {
    drawIndicatorLine(ctx, line.points, bars, layout, viewport, line.color, line.thickness ?? 1.5, priceScale,
      line.priceColored ? { priceColored: true, bullColor: "#26A69A", bearColor: "#EF5350" } : undefined);
  }
  if (indicators.vwap.length > 0) drawVWAP(ctx, indicators.vwap, bars, layout, viewport, priceScale,
    indicators.vwapBands.length > 0 ? indicators.vwapBands : undefined);
  if (indicators.parabolicSAR.length > 0) drawParabolicSAR(ctx, indicators.parabolicSAR, bars, layout, viewport, priceScale);
  if (indicators.pivotPoints) drawPivotPoints(ctx, indicators.pivotPoints, layout, viewport, priceScale);
  if (indicators.supertrend.length > 0) drawSuperTrend(ctx, indicators.supertrend, bars, layout, viewport, priceScale, indicators.supertrendCfg);
  if (indicators.chandelierExit.length > 0) drawChandelierExit(ctx, indicators.chandelierExit, bars, layout, viewport, priceScale, indicators.chandelierShowArrows);
  if (indicators.chandeKrollStop.length > 0) drawChandeKrollStop(ctx, indicators.chandeKrollStop, bars, layout, viewport, priceScale);
  if (indicators.alligator.length > 0) drawAlligator(ctx, indicators.alligator, bars, layout, viewport, priceScale);
  if (indicators.zigzag.length > 0) drawZigzag(ctx, indicators.zigzag, bars, layout, viewport, priceScale);
  if (indicators.autoFib) drawAutoFib(ctx, indicators.autoFib, layout, viewport, priceScale);
  if (indicators.maRibbon.length > 0) drawMARibbon(ctx, indicators.maRibbon, bars, layout, viewport, priceScale, indicators.maRibbonShowFill);

  // Layer 4: Current price line
  drawCurrentPriceLine(ctx, bars, layout, viewport, pair, priceScale);

  // Layer 5: Volume
  drawVolume(ctx, bars, layout, viewport);
  if (indicators.volumeProfile) drawVolumeProfile(ctx, indicators.volumeProfile, layout, viewport, priceScale);

  // Layer 6: Sub-panes
  for (let i = 0; i < subPanes.length; i++) {
    const pane = layout.subPanes[i];
    if (!pane) continue;
    const type = subPanes[i];
    const d = indicators.subPaneData;
    switch (type) {
      case "rsi": drawRSI(ctx, d.rsi as RSISubPane, bars, withPane(layout, pane), viewport); break;
      case "macd": drawMACD(ctx, d.macd as MACDPoint[], bars, withPane(layout, pane), viewport); break;
      case "stochastic": drawStochastic(ctx, d.stochastic as StochSubPane, bars, layout, viewport, pane); break;
      case "stochRSI": drawStochRSI(ctx, d.stochRSI as StochSubPane, bars, layout, viewport, pane); break;
      case "williamsR": drawWilliamsR(ctx, d.williamsR as WilliamsRSubPane, bars, layout, viewport, pane); break;
      case "cci": drawCCI(ctx, d.cci as CCISubPane, bars, layout, viewport, pane); break;
      case "adx": drawADX(ctx, d.adx as ADXSubPane, bars, layout, viewport, pane); break;
      case "atr": drawATR(ctx, d.atr as ATRSubPane, bars, layout, viewport, pane); break;
      case "obv": drawOBV(ctx, d.obv as IndicatorPoint[], bars, layout, viewport, pane); break;
      case "mfi": drawMFI(ctx, d.mfi as IndicatorPoint[], bars, layout, viewport, pane); break;
      case "cmf": drawCMF(ctx, d.cmf as IndicatorPoint[], bars, layout, viewport, pane); break;
      case "ao": drawAO(ctx, d.ao as IndicatorPoint[], bars, layout, viewport, pane); break;
      case "bop": drawBOP(ctx, d.bop as IndicatorPoint[], bars, layout, viewport, pane); break;
      case "bbtrend": drawBBTrend(ctx, d.bbtrend as IndicatorPoint[], bars, layout, viewport, pane); break;
      case "bullBearPower": drawBullBearPower(ctx, d.bullBearPower as BullBearPoint[], bars, layout, viewport, pane); break;
      case "chaikinOsc": drawChaikinOsc(ctx, d.chaikinOsc as IndicatorPoint[], bars, layout, viewport, pane); break;
      case "cmo": drawCMO(ctx, d.cmo as IndicatorPoint[], bars, layout, viewport, pane); break;
      case "choppiness": drawChoppiness(ctx, d.choppiness as IndicatorPoint[], bars, layout, viewport, pane); break;
      case "chopZone": drawChopZone(ctx, d.chopZone as IndicatorPoint[], bars, layout, viewport, pane); break;
      case "connorsRSI": drawConnorsRSI(ctx, d.connorsRSI as IndicatorPoint[], bars, layout, viewport, pane); break;
      case "coppock": drawCoppock(ctx, d.coppock as IndicatorPoint[], bars, layout, viewport, pane); break;
      case "dpo": drawDPO(ctx, d.dpo as IndicatorPoint[], bars, layout, viewport, pane); break;
      case "eom": drawEOM(ctx, d.eom as IndicatorPoint[], bars, layout, viewport, pane); break;
      case "efi": drawEFI(ctx, d.efi as IndicatorPoint[], bars, layout, viewport, pane); break;
      case "fisher": drawFisher(ctx, d.fisher as IndicatorPoint[], bars, layout, viewport, pane); break;
      case "klinger": drawKlinger(ctx, d.klinger as KlingerPoint[], bars, layout, viewport, pane); break;
      case "kst": drawKST(ctx, d.kst as IndicatorPoint[], bars, layout, viewport, pane); break;
      case "massIndex": drawMassIndex(ctx, d.massIndex as IndicatorPoint[], bars, layout, viewport, pane); break;
      case "momentum": drawMomentum(ctx, d.momentum as IndicatorPoint[], bars, layout, viewport, pane); break;
      case "ppo": drawPPO(ctx, d.ppo as PPOPoint[], bars, layout, viewport, pane); break;
      case "roc": drawROC(ctx, d.roc as IndicatorPoint[], bars, layout, viewport, pane); break;
      case "rvi": drawRVI(ctx, d.rvi as RVIPoint[], bars, layout, viewport, pane); break;
      case "smi": drawSMI(ctx, d.smi as SMIPoint[], bars, layout, viewport, pane); break;
      case "trix": drawTRIX(ctx, d.trix as IndicatorPoint[], bars, layout, viewport, pane); break;
      case "tsi": drawTSI(ctx, d.tsi as TSIPoint[], bars, layout, viewport, pane); break;
      case "ultimateOscillator": drawUltimateOscillator(ctx, d.ultimateOscillator as IndicatorPoint[], bars, layout, viewport, pane); break;
      case "vortex": drawVortex(ctx, d.vortex as VortexPoint[], bars, layout, viewport, pane); break;
      case "aroon": drawAroon(ctx, d.aroon as AroonPoint[], bars, layout, viewport, pane); break;
      case "adl": drawADL(ctx, d.adl as IndicatorPoint[], bars, layout, viewport, pane); break;
      case "cvd": drawCVD(ctx, d.cvd as IndicatorPoint[], bars, layout, viewport, pane); break;
      case "cvi": drawCVI(ctx, d.cvi as IndicatorPoint[], bars, layout, viewport, pane); break;
      case "netVolume": drawNetVolume(ctx, d.netVolume as IndicatorPoint[], bars, layout, viewport, pane); break;
      case "pvt": drawPVT(ctx, d.pvt as IndicatorPoint[], bars, layout, viewport, pane); break;
      case "volumeOscillator": drawVolumeOscillator(ctx, d.volumeOscillator as IndicatorPoint[], bars, layout, viewport, pane); break;
      case "bbPercentB": drawBBPercentB(ctx, d.bbPercentB as IndicatorPoint[], bars, layout, viewport, pane); break;
      case "bbWidth": drawBBWidth(ctx, d.bbWidth as IndicatorPoint[], bars, layout, viewport, pane); break;
      case "histVol": drawHistVol(ctx, d.histVol as IndicatorPoint[], bars, layout, viewport, pane); break;
      case "correlation": drawCorrelation(ctx, d.correlation as IndicatorPoint[], bars, layout, viewport, pane); break;
      case "adr": drawADRPane(ctx, d.adr as IndicatorPoint[], bars, layout, viewport, pane); break;
    }
  }

  // Layer 7: Drawings
  if (!hideDrawings) {
    let renderDrawings = drawings;
    if (dragOverride) {
      const ov = dragOverride;
      renderDrawings = drawings.map(d => d.id === ov.id ? { ...d, points: ov.points } : d);
    }
    drawDrawings(ctx, renderDrawings, layout, viewport, pair, priceScale, selectedDrawingId, hoveredDrawingId, bars);

    // Layer 7b: Rubber-band preview (drawing in progress)
    if (drawingMode && drawingPoints.length > 0 && ch.visible) {
      const neededPoints = drawingMode === "horizontal" ? 1 : 2;
      if (drawingPoints.length < neededPoints) {
        let rbx = ch.x, rby = ch.y;
        if (shiftHeld && drawingMode !== "horizontal") {
          const p0 = drawingPoints[0];
          const p0x = indexToX(p0.index, viewport.startIndex, viewport.endIndex, layout.chartLeft, layout.chartWidth);
          const p0y = priceToY(p0.price, viewport.priceMin, viewport.priceMax, layout.mainTop, layout.mainHeight, priceScale);
          if (drawingMode === "rectangle") {
            const dx = ch.x - p0x;
            const dy = ch.y - p0y;
            const side = Math.max(Math.abs(dx), Math.abs(dy));
            rbx = p0x + side * Math.sign(dx || 1);
            rby = p0y + side * Math.sign(dy || 1);
          } else {
            const snapped = shiftSnapPoint(p0x, p0y, ch.x, ch.y);
            rbx = snapped.x;
            rby = snapped.y;
          }
        }
        drawRubberBand(ctx, drawingPoints[0], rbx, rby, layout, viewport, priceScale, drawingMode, undefined, magneticSnapResult);
      }
    }
  }

  // Layer 8: Axes
  drawPriceAxis(ctx, layout, viewport, pair, priceScale, refPrice);
  drawTimeAxis(ctx, layout, viewport, bars, interval);

  // Layer 8b: Drawing price axis labels
  if (!hideDrawings) {
    drawDrawingPriceLabels(ctx, drawings, layout, viewport, priceScale, selectedDrawingId);
  }

  // Layer 9: Crosshair
  drawCrosshair(ctx, ch, layout, viewport, bars, pair, crosshairMode, priceScale, refPrice);

  // Layer 10: OHLC Legend
  drawOHLCLegend(ctx, bars, layout, viewport, pair, ch.visible ? ch.snapIndex : -1);

  // Layer 11: Indicator chips
  drawIndicatorLegend(ctx, indicators.overlayLines, indicators.bands, layout);
}
