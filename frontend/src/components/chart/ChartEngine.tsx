"use client";
/**
 * ChartEngine.tsx — ORDR Canvas 2D Charting Platform (TradingView Parity)
 *
 * Full-featured institutional charting: 7 chart types, 23 indicators,
 * multi-sub-pane, volume profile, smooth zoom/pan with momentum,
 * left drawing toolbar, symbol search, context menu, keyboard shortcuts,
 * axis drag-to-scale, screenshot export, fullscreen, bar countdown,
 * session highlighting, undo/redo, and dark theme.
 * Zero external dependencies. 60fps via requestAnimationFrame.
 */
import React, { useRef, useEffect, useState, useCallback, useMemo } from "react";
import type {
  Bar, IndicatorPoint, BandPoint, MACDPoint,
  SRLevel, FVGZone, TrendLine,
  StochasticPoint, ADXPoint, IchimokuPoint,
  VolumeProfileData, PivotPointData,
} from "./indicators/types";
import {
  computeSMA, computeEMA, computeRSI, computeMACD,
  computeBollinger, computeKeltner,
  computeStochastic, computeStochRSI, computeWilliamsR,
  computeCCI, computeADX, computeMFI, computeCMF, computeOBV,
  computeVWAP, computeIchimoku, computeHMA, computeTEMA,
  computeDonchian, computeParabolicSAR, computePivotPoints,
  computeVolumeProfile,
} from "./indicators";
import { detectSupportResistance, detectFVG, detectTrendlines } from "./detection";
import { computeLayout, computeViewport, formatPrice } from "./core/data";
import type { ChartLayout, SubPaneLayout } from "./core/data";
import { drawPriceAxis, drawTimeAxis } from "./core/axis";
import { drawCrosshair, snapToBar } from "./core/crosshair";
import type { CrosshairState, CrosshairMode } from "./core/crosshair";
import {
  createInitialZoomState, handleWheel as zoomWheel,
  handleDragStart, handleDragMove, handleDragEnd, tickAnimation,
} from "./core/zoom";
import type { ZoomPanState } from "./core/zoom";
import { THEME } from "./core/theme";
import { drawCandlesticks } from "./renderers/candlestick";
import { drawVolume } from "./renderers/volume";
import {
  drawIndicatorLine, drawBands, drawRSI, drawMACD,
  drawVWAP, drawIchimoku, drawHMA, drawTEMA,
  drawDonchian, drawParabolicSAR, drawPivotPoints,
} from "./renderers/indicators";
import { drawSRLevels, drawFVGZones, drawTrendlines } from "./renderers/overlays";
import {
  drawDrawings, loadDrawings, saveDrawings, getDefaultColor,
} from "./renderers/drawings";
import type { Drawing, DrawingType } from "./renderers/drawings";
import {
  drawStochastic, drawStochRSI, drawWilliamsR,
  drawCCI, drawADX, drawMFI, drawCMF, drawOBV,
} from "./renderers/oscillators";
import { drawVolumeProfile } from "./renderers/volumeProfile";
import { drawCurrentPriceLine, drawOHLCLegend } from "./renderers/priceLine";
import {
  drawLineChart, drawAreaChart, drawBarChart,
  drawHollowCandles, drawHeikinAshi, drawBaseline,
} from "./renderers/chartTypes";
import type { ChartType } from "./renderers/chartTypes";
import { drawSessions } from "./renderers/sessions";
import {
  matchShortcut, detectMouseZone,
  createAxisDragState, startAxisDrag, moveAxisDrag, endAxisDrag,
  applyTimeScale,
} from "./core/interactions";
import type { AxisDragState } from "./core/interactions";
import { exportScreenshot, toggleFullscreen } from "./core/utils";
import ChartToolbar from "./ChartToolbar";
import type { ChartIndicatorConfig } from "./ChartToolbar";
import ChartLeftToolbar from "./ChartLeftToolbar";
import ChartStatusBar from "./ChartStatusBar";
import ChartSymbolSearch from "./ChartSymbolSearch";
import ChartContextMenu from "./ChartContextMenu";
import ChartIndicatorDialog from "./ChartIndicatorDialog";
import IndicatorLayers from "./IndicatorLayers";
import type { OverlayChip, SubPaneChip } from "./IndicatorLayers";

/* ═══════════════════════════════════════════════════════
   Types & Defaults
   ═══════════════════════════════════════════════════════ */

interface Props {
  bars: Bar[];
  pair: string;
  interval: string;
  source?: string;
  loading?: boolean;
  error?: string | null;
  onPairChange?: (pair: string) => void;
}

const DEFAULT_CONFIG: ChartIndicatorConfig = {
  sma20: false, sma50: false, sma200: false,
  ema20: true, ema50: false,
  hma9: false, tema20: false, vwap: false,
  bollinger: false, keltner: false, ichimoku: false, donchian: false,
  volumeProfile: false,
  sr: true, fvg: true, trendlines: true,
  pivotPoints: false, parabolicSAR: false,
};

interface IndicatorBundle {
  overlayLines: { points: IndicatorPoint[]; color: string; label: string }[];
  bands: { points: BandPoint[]; fill: string; line: string; label: string }[];
  vwap: IndicatorPoint[];
  ichimoku: IchimokuPoint[];
  parabolicSAR: IndicatorPoint[];
  pivotPoints: PivotPointData | null;
  volumeProfile: VolumeProfileData | null;
  subPaneData: Record<string, unknown>;
  sr: SRLevel[];
  fvg: FVGZone[];
  trend: TrendLine[];
}

const EMPTY_BUNDLE: IndicatorBundle = {
  overlayLines: [], bands: [], vwap: [], ichimoku: [],
  parabolicSAR: [], pivotPoints: null, volumeProfile: null,
  subPaneData: {}, sr: [], fvg: [], trend: [],
};

/* ─── Indicator chip color/label maps ─── */
const OVERLAY_META: Record<string, { label: string; color: string }> = {
  sma20: { label: "SMA(20)", color: "#FFD54F" },
  sma50: { label: "SMA(50)", color: "#FF8A65" },
  sma200: { label: "SMA(200)", color: "#FF5252" },
  ema20: { label: "EMA(20)", color: "#26C6DA" },
  ema50: { label: "EMA(50)", color: "#00E676" },
  hma9: { label: "HMA(9)", color: "#00E676" },
  tema20: { label: "TEMA(20)", color: "#FF4081" },
  vwap: { label: "VWAP", color: THEME.vwapColor },
  bollinger: { label: "BB(20,2)", color: THEME.bbLine },
  keltner: { label: "KC(20,10)", color: THEME.kcLine },
  ichimoku: { label: "Ichimoku", color: "#2962FF" },
  donchian: { label: "DC(20)", color: "#00BCD4" },
  volumeProfile: { label: "Vol Profile", color: THEME.vpPocColor },
  sr: { label: "S/R", color: "#26A69A" },
  fvg: { label: "FVG", color: "#26A69A" },
  trendlines: { label: "Trendlines", color: "#EF5350" },
  pivotPoints: { label: "Pivot Pts", color: "#9598A1" },
  parabolicSAR: { label: "SAR", color: "#26A69A" },
};

const SUBPANE_META: Record<string, { label: string; color: string }> = {
  rsi: { label: "RSI(14)", color: "#7B1FA2" },
  macd: { label: "MACD(12,26,9)", color: "#2962FF" },
  stochastic: { label: "Stoch(14,3)", color: "#FF6D00" },
  stochRSI: { label: "StochRSI", color: "#FF6D00" },
  williamsR: { label: "Williams %R", color: "#FF6D00" },
  cci: { label: "CCI(20)", color: "#2196F3" },
  adx: { label: "ADX(14)", color: "#787B86" },
  obv: { label: "OBV", color: "#FF9800" },
  mfi: { label: "MFI(14)", color: "#E040FB" },
  cmf: { label: "CMF(20)", color: "#00BCD4" },
};

function withPane(layout: ChartLayout, pane: SubPaneLayout): ChartLayout {
  return { ...layout, subPaneTop: pane.top, subPaneHeight: pane.height };
}

/* ═══════════════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════════════ */

function ChartEngineInner({ bars, pair, interval, source, loading, error, onPairChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const outerRef = useRef<HTMLDivElement>(null);

  // High-frequency state via refs (60fps, no React re-render)
  const zoomRef = useRef<ZoomPanState>(
    createInitialZoomState(bars.length, Math.min(200, bars.length)),
  );
  const crosshairRef = useRef<CrosshairState>({ x: 0, y: 0, visible: false, snapIndex: 0 });
  const axisDragRef = useRef<AxisDragState>(createAxisDragState());
  const priceZoomRef = useRef(1.0);       // Price axis zoom factor (1.0 = auto-fit)
  const dragStartPriceZoom = useRef(1.0); // Snapshot at drag start

  // Low-frequency state
  const [dimensions, setDimensions] = useState({ w: 1200, h: 600 });
  const [config, setConfig] = useState<ChartIndicatorConfig>(DEFAULT_CONFIG);
  const [activeSubPanes, setActiveSubPanes] = useState<string[]>([]);
  const [drawingMode, setDrawingMode] = useState<DrawingType | null>(null);
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [drawingPoints, setDrawingPoints] = useState<{ index: number; price: number }[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  // New TradingView features
  const [chartType, setChartType] = useState<ChartType>("candles");
  const [activeTool, setActiveTool] = useState<string>("crosshair");
  const [priceScale, setPriceScale] = useState<"linear" | "log" | "percent">("linear");
  const [showSymbolSearch, setShowSymbolSearch] = useState(false);
  const [showIndicatorDialog, setShowIndicatorDialog] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; open: boolean }>({ x: 0, y: 0, open: false });
  const [crosshairMode, setCrosshairMode] = useState<CrosshairMode>("crosshair");
  const [enabledSessions, setEnabledSessions] = useState<string[]>([]);

  // Undo/redo stack
  const [undoStack, setUndoStack] = useState<Drawing[][]>([]);
  const [redoStack, setRedoStack] = useState<Drawing[][]>([]);

  // Layout (left toolbar adds 40px)
  const LEFT_TOOLBAR_WIDTH = 40;
  const layout = useMemo(
    () => computeLayout(dimensions.w, dimensions.h, activeSubPanes.length),
    [dimensions.w, dimensions.h, activeSubPanes.length],
  );

  // Indicators (memoized)
  const indicators = useMemo((): IndicatorBundle => {
    if (bars.length < 5) return EMPTY_BUNDLE;

    const overlayLines: IndicatorBundle["overlayLines"] = [];
    if (config.sma20) overlayLines.push({ points: computeSMA(bars, 20), color: THEME.sma1Color, label: "SMA(20)" });
    if (config.sma50) overlayLines.push({ points: computeSMA(bars, 50), color: THEME.sma2Color, label: "SMA(50)" });
    if (config.sma200) overlayLines.push({ points: computeSMA(bars, 200), color: "#FF5252", label: "SMA(200)" });
    if (config.ema20) overlayLines.push({ points: computeEMA(bars, 20), color: THEME.emaColor, label: "EMA(20)" });
    if (config.ema50) overlayLines.push({ points: computeEMA(bars, 50), color: "#00E676", label: "EMA(50)" });
    if (config.hma9) overlayLines.push({ points: computeHMA(bars, 9), color: "#00E676", label: "HMA(9)" });
    if (config.tema20) overlayLines.push({ points: computeTEMA(bars, 20), color: "#FF4081", label: "TEMA(20)" });

    const bandsList: IndicatorBundle["bands"] = [];
    if (config.bollinger) bandsList.push({ points: computeBollinger(bars), fill: THEME.bbFill, line: THEME.bbLine, label: "BB(20,2)" });
    if (config.keltner) bandsList.push({ points: computeKeltner(bars), fill: THEME.kcFill, line: THEME.kcLine, label: "KC(20,10)" });
    if (config.donchian) bandsList.push({ points: computeDonchian(bars, 20), fill: "rgba(0,188,212,0.06)", line: "#00BCD4", label: "DC(20)" });

    const vwap = config.vwap ? computeVWAP(bars) : [];
    const ichimoku = config.ichimoku ? computeIchimoku(bars) : [];
    const parabolicSAR = config.parabolicSAR ? computeParabolicSAR(bars) : [];
    const pivotPointsArr = config.pivotPoints ? computePivotPoints(bars) : [];
    const pivotPoints = pivotPointsArr.length > 0 ? pivotPointsArr[pivotPointsArr.length - 1] : null;
    const volumeProfile = config.volumeProfile ? computeVolumeProfile(bars) : null;

    const subPaneData: Record<string, unknown> = {};
    for (const sp of activeSubPanes) {
      switch (sp) {
        case "rsi": subPaneData.rsi = computeRSI(bars); break;
        case "macd": subPaneData.macd = computeMACD(bars); break;
        case "stochastic": subPaneData.stochastic = computeStochastic(bars); break;
        case "stochRSI": subPaneData.stochRSI = computeStochRSI(bars); break;
        case "williamsR": subPaneData.williamsR = computeWilliamsR(bars); break;
        case "cci": subPaneData.cci = computeCCI(bars); break;
        case "adx": subPaneData.adx = computeADX(bars); break;
        case "obv": subPaneData.obv = computeOBV(bars); break;
        case "mfi": subPaneData.mfi = computeMFI(bars); break;
        case "cmf": subPaneData.cmf = computeCMF(bars); break;
      }
    }

    const sr = config.sr ? detectSupportResistance(bars) : [];
    const fvg = config.fvg ? detectFVG(bars) : [];
    const trend = config.trendlines ? detectTrendlines(bars) : [];

    return { overlayLines, bands: bandsList, vwap, ichimoku, parabolicSAR, pivotPoints, volumeProfile, subPaneData, sr, fvg, trend };
  }, [bars, config, activeSubPanes]);

  // Load drawings
  useEffect(() => {
    const loaded = loadDrawings(pair);
    setDrawings(loaded);
    setUndoStack([loaded]);
    setRedoStack([]);
  }, [pair]);

  // Reset zoom on bar change
  useEffect(() => {
    if (bars.length > 0) {
      zoomRef.current = createInitialZoomState(bars.length, Math.min(200, bars.length));
    }
  }, [bars.length]);

  // Resize observer
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) setDimensions({ w: Math.floor(width), h: Math.floor(height) });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Native wheel listener with { passive: false }
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      zoomRef.current = zoomWheel(zoomRef.current, e.deltaY, x, layout.chartLeft, layout.chartWidth, bars.length);
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [layout, bars.length]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Don't capture if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (showSymbolSearch || showIndicatorDialog) return;

      const action = matchShortcut(e);
      if (!action) return;

      e.preventDefault();
      switch (action) {
        case "panLeft": {
          const z = zoomRef.current;
          const step = (z.targetEnd - z.targetStart) * 0.1;
          zoomRef.current = { ...z, targetStart: Math.max(0, z.targetStart - step), targetEnd: z.targetEnd - step, isAnimating: true };
          break;
        }
        case "panRight": {
          const z = zoomRef.current;
          const step = (z.targetEnd - z.targetStart) * 0.1;
          const range = z.targetEnd - z.targetStart;
          const maxEnd = bars.length - 1 + range * 1.0; // Match RIGHT_MARGIN
          zoomRef.current = { ...z, targetStart: z.targetStart + step, targetEnd: Math.min(maxEnd, z.targetEnd + step), isAnimating: true };
          break;
        }
        case "zoomIn":
          zoomRef.current = applyTimeScale(zoomRef.current, 0.85, bars.length);
          break;
        case "zoomOut":
          zoomRef.current = applyTimeScale(zoomRef.current, 1.18, bars.length);
          break;
        case "cancel":
          setDrawingMode(null);
          setDrawingPoints([]);
          setContextMenu(p => ({ ...p, open: false }));
          break;
        case "resetChart":
          zoomRef.current = createInitialZoomState(bars.length, Math.min(200, bars.length));
          break;
        case "undo":
          handleUndo();
          break;
        case "redo":
          handleRedo();
          break;
        case "screenshot":
          if (canvasRef.current) exportScreenshot(canvasRef.current, pair);
          break;
        case "fullscreen":
          if (outerRef.current) toggleFullscreen(outerRef.current);
          break;
        case "openIndicators":
          setShowIndicatorDialog(true);
          break;
        case "openSymbolSearch":
          setShowSymbolSearch(true);
          break;
        case "drawTrendline":
          setDrawingMode("trendline");
          setActiveTool("trendline");
          break;
        case "drawHorizontal":
          setDrawingMode("horizontal");
          setActiveTool("horizontal");
          break;
        case "drawFibonacci":
          setDrawingMode("fibonacci");
          setActiveTool("fibonacci");
          break;
        case "drawRectangle":
          setDrawingMode("rectangle");
          setActiveTool("rectangle");
          break;
        case "deleteDrawing":
          // Delete last drawing
          if (drawings.length > 0) {
            const updated = drawings.slice(0, -1);
            pushDrawingState(updated);
          }
          break;
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [bars.length, pair, drawings, showSymbolSearch, showIndicatorDialog]);

  /* ─── Drawing undo/redo ─── */
  const pushDrawingState = useCallback((newDrawings: Drawing[]) => {
    setDrawings(newDrawings);
    saveDrawings(pair, newDrawings);
    setUndoStack(prev => [...prev, newDrawings]);
    setRedoStack([]);
  }, [pair]);

  const handleUndo = useCallback(() => {
    setUndoStack(prev => {
      if (prev.length <= 1) return prev;
      const newStack = prev.slice(0, -1);
      const restored = newStack[newStack.length - 1];
      setDrawings(restored);
      saveDrawings(pair, restored);
      setRedoStack(r => [...r, prev[prev.length - 1]]);
      return newStack;
    });
  }, [pair]);

  const handleRedo = useCallback(() => {
    setRedoStack(prev => {
      if (prev.length === 0) return prev;
      const newStack = prev.slice(0, -1);
      const restored = prev[prev.length - 1];
      setDrawings(restored);
      saveDrawings(pair, restored);
      setUndoStack(u => [...u, restored]);
      return newStack;
    });
  }, [pair]);

  /* ─── Render ─── */
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || bars.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = dimensions.w * dpr;
    canvas.height = dimensions.h * dpr;
    canvas.style.width = `${dimensions.w}px`;
    canvas.style.height = `${dimensions.h}px`;
    ctx.scale(dpr, dpr);

    const zoom = zoomRef.current;
    const rawViewport = computeViewport(bars, zoom.startIndex, zoom.endIndex);

    // Apply price axis zoom factor
    const viewport = priceZoomRef.current !== 1.0
      ? (() => {
          const mid = (rawViewport.priceMin + rawViewport.priceMax) / 2;
          const halfRange = ((rawViewport.priceMax - rawViewport.priceMin) / 2) * priceZoomRef.current;
          return { ...rawViewport, priceMin: mid - halfRange, priceMax: mid + halfRange };
        })()
      : rawViewport;

    const ch = crosshairRef.current;

    // Reference price for percent scale (first visible bar's close)
    const refBarIdx = Math.max(0, Math.floor(zoom.startIndex));
    const refPrice = bars[refBarIdx]?.c || bars[0]?.c || 1;

    // Background
    ctx.fillStyle = THEME.canvasBg;
    ctx.fillRect(0, 0, dimensions.w, dimensions.h);

    // Watermark — faded pair name
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
    if (indicators.sr.length > 0) drawSRLevels(ctx, indicators.sr, layout, viewport);
    if (indicators.fvg.length > 0) drawFVGZones(ctx, indicators.fvg, layout, viewport);
    if (indicators.trend.length > 0) drawTrendlines(ctx, indicators.trend, bars, layout, viewport);
    for (const band of indicators.bands) drawBands(ctx, band.points, bars, layout, viewport, band.fill, band.line);
    if (indicators.ichimoku.length > 0) drawIchimoku(ctx, indicators.ichimoku, bars, layout, viewport);

    // Layer 2: Price data (chart type dispatch)
    switch (chartType) {
      case "candles":
        drawCandlesticks(ctx, bars, layout, viewport);
        break;
      case "hollow":
        drawHollowCandles(ctx, bars, layout, viewport);
        break;
      case "bars":
        drawBarChart(ctx, bars, layout, viewport);
        break;
      case "line":
        drawLineChart(ctx, bars, layout, viewport);
        break;
      case "area":
        drawAreaChart(ctx, bars, layout, viewport);
        break;
      case "heikinAshi":
        drawHeikinAshi(ctx, bars, layout, viewport);
        break;
      case "baseline":
        drawBaseline(ctx, bars, layout, viewport);
        break;
    }

    // Layer 3: Overlays on top
    for (const line of indicators.overlayLines) drawIndicatorLine(ctx, line.points, bars, layout, viewport, line.color);
    if (indicators.vwap.length > 0) drawVWAP(ctx, indicators.vwap, bars, layout, viewport);
    if (indicators.parabolicSAR.length > 0) drawParabolicSAR(ctx, indicators.parabolicSAR, bars, layout, viewport);
    if (indicators.pivotPoints) drawPivotPoints(ctx, indicators.pivotPoints, layout, viewport);

    // Layer 4: Current price line
    drawCurrentPriceLine(ctx, bars, layout, viewport, pair, priceScale);

    // Layer 5: Volume
    drawVolume(ctx, bars, layout, viewport);
    if (indicators.volumeProfile) drawVolumeProfile(ctx, indicators.volumeProfile, layout, viewport);

    // Layer 6: Sub-panes
    for (let i = 0; i < activeSubPanes.length; i++) {
      const pane = layout.subPanes[i];
      if (!pane) continue;
      const type = activeSubPanes[i];
      const d = indicators.subPaneData;
      switch (type) {
        case "rsi": drawRSI(ctx, d.rsi as IndicatorPoint[], bars, withPane(layout, pane), viewport); break;
        case "macd": drawMACD(ctx, d.macd as MACDPoint[], bars, withPane(layout, pane), viewport); break;
        case "stochastic": drawStochastic(ctx, d.stochastic as StochasticPoint[], bars, layout, viewport, pane); break;
        case "stochRSI": drawStochRSI(ctx, d.stochRSI as StochasticPoint[], bars, layout, viewport, pane); break;
        case "williamsR": drawWilliamsR(ctx, d.williamsR as IndicatorPoint[], bars, layout, viewport, pane); break;
        case "cci": drawCCI(ctx, d.cci as IndicatorPoint[], bars, layout, viewport, pane); break;
        case "adx": drawADX(ctx, d.adx as ADXPoint[], bars, layout, viewport, pane); break;
        case "obv": drawOBV(ctx, d.obv as IndicatorPoint[], bars, layout, viewport, pane); break;
        case "mfi": drawMFI(ctx, d.mfi as IndicatorPoint[], bars, layout, viewport, pane); break;
        case "cmf": drawCMF(ctx, d.cmf as IndicatorPoint[], bars, layout, viewport, pane); break;
      }
    }

    // Layer 7: Drawings
    drawDrawings(ctx, drawings, layout, viewport, pair);

    // Layer 8: Axes
    drawPriceAxis(ctx, layout, viewport, pair, priceScale, refPrice);
    drawTimeAxis(ctx, layout, viewport, bars, interval);

    // Layer 9: Crosshair
    drawCrosshair(ctx, ch, layout, viewport, bars, pair, crosshairMode, priceScale, refPrice);

    // Layer 10: OHLC Legend (top-left, on top of everything)
    drawOHLCLegend(ctx, bars, layout, viewport, pair, ch.visible ? ch.snapIndex : -1);

    // Layer 11: Legend (indicator labels)
    drawLegend(ctx, indicators.overlayLines, indicators.bands, layout);
  }, [bars, layout, indicators, drawings, pair, interval, activeSubPanes, dimensions, chartType, enabledSessions, priceScale, crosshairMode]);

  /* ─── Animation loop ─── */
  useEffect(() => {
    let rafId = 0;
    const frame = () => {
      zoomRef.current = tickAnimation(zoomRef.current, bars.length);
      render();
      rafId = requestAnimationFrame(frame);
    };
    rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId);
  }, [render, bars.length]);

  /* ─── Mouse handlers ─── */
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Axis drag
    if (axisDragRef.current.isDragging) {
      const scales = moveAxisDrag(axisDragRef.current, x, y, layout.mainHeight, layout.chartWidth);
      if (axisDragRef.current.zone === "timeAxis") {
        zoomRef.current = applyTimeScale(zoomRef.current, scales.timeScale, bars.length);
      } else if (axisDragRef.current.zone === "priceAxis") {
        // Apply price axis zoom: scale relative to drag start value
        priceZoomRef.current = Math.max(0.1, Math.min(10, dragStartPriceZoom.current * scales.priceScale));
      }
      return;
    }

    if (zoomRef.current.isDragging) {
      zoomRef.current = handleDragMove(zoomRef.current, x, layout.chartWidth, bars.length);
    }

    const viewport = computeViewport(bars, zoomRef.current.startIndex, zoomRef.current.endIndex);
    const snap = snapToBar(x, viewport.startIndex, viewport.endIndex, layout.chartLeft, layout.chartWidth, bars.length);
    crosshairRef.current = { x, y, visible: true, snapIndex: snap };
  }, [layout, bars]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button === 2) return; // Right-click handled by context menu
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Detect zone
    const zone = detectMouseZone(
      x, y, layout.chartLeft, layout.chartWidth,
      layout.mainTop, layout.mainHeight,
      layout.priceAxisWidth, layout.timeAxisHeight,
      dimensions.w, dimensions.h,
    );

    // Axis drag-to-scale
    if (zone === "priceAxis" || zone === "timeAxis") {
      const viewport = computeViewport(bars, zoomRef.current.startIndex, zoomRef.current.endIndex);
      const priceRange = viewport.priceMax - viewport.priceMin;
      const barRange = zoomRef.current.endIndex - zoomRef.current.startIndex;
      dragStartPriceZoom.current = priceZoomRef.current; // snapshot for relative scaling
      axisDragRef.current = startAxisDrag(axisDragRef.current, zone, x, y, priceRange, barRange);
      return;
    }

    // Drawing mode
    if (drawingMode) {
      const zoom = zoomRef.current;
      const viewport = computeViewport(bars, zoom.startIndex, zoom.endIndex);
      const { startIndex, endIndex, priceMin, priceMax } = viewport;
      const range = endIndex - startIndex || 1;
      const idx = startIndex + ((x - layout.chartLeft) / layout.chartWidth) * range;
      const price = priceMin + ((layout.mainTop + layout.mainHeight - y) / layout.mainHeight) * (priceMax - priceMin);
      const newPoints = [...drawingPoints, { index: Math.round(idx), price }];
      setDrawingPoints(newPoints);

      const neededPoints = drawingMode === "horizontal" ? 1 : 2;
      if (newPoints.length >= neededPoints) {
        const drawing: Drawing = {
          id: `d_${Date.now()}`,
          type: drawingMode,
          points: newPoints,
          color: getDefaultColor(drawingMode),
        };
        const updated = [...drawings, drawing];
        pushDrawingState(updated);
        setDrawingPoints([]);
        if (activeTool === "crosshair" || activeTool === "cursor") {
          setDrawingMode(null);
        }
      }
      return;
    }

    // Chart pan
    zoomRef.current = handleDragStart(zoomRef.current, x);
    setIsDragging(true);
  }, [drawingMode, drawingPoints, layout, drawings, pair, bars, dimensions, activeTool, pushDrawingState]);

  const handleMouseUp = useCallback(() => {
    if (axisDragRef.current.isDragging) {
      axisDragRef.current = endAxisDrag(axisDragRef.current);
      return;
    }
    zoomRef.current = handleDragEnd(zoomRef.current);
    setIsDragging(false);
  }, []);

  const handleDoubleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const zone = detectMouseZone(
      x, y, layout.chartLeft, layout.chartWidth,
      layout.mainTop, layout.mainHeight,
      layout.priceAxisWidth, layout.timeAxisHeight,
      dimensions.w, dimensions.h,
    );

    if (zone === "priceAxis") {
      // Auto-fit: reset price zoom to 1.0 (auto-fit from viewport)
      priceZoomRef.current = 1.0;
      return;
    }
    if (zone === "timeAxis") {
      // Reset to show recent bars
      zoomRef.current = createInitialZoomState(bars.length, Math.min(200, bars.length));
      return;
    }
  }, [bars.length, dimensions, layout]);

  const handleContextMenu = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    // Use viewport coordinates — ChartContextMenu uses position: "fixed"
    setContextMenu({ x: e.clientX, y: e.clientY, open: true });
  }, []);

  const handleMouseLeave = useCallback(() => {
    crosshairRef.current = { ...crosshairRef.current, visible: false };
    if (zoomRef.current.isDragging) {
      zoomRef.current = handleDragEnd(zoomRef.current);
      setIsDragging(false);
    }
    if (axisDragRef.current.isDragging) {
      axisDragRef.current = endAxisDrag(axisDragRef.current);
    }
  }, []);

  // Global mouseup
  useEffect(() => {
    const onGlobalUp = () => {
      if (zoomRef.current.isDragging) {
        zoomRef.current = handleDragEnd(zoomRef.current);
        setIsDragging(false);
      }
      if (axisDragRef.current.isDragging) {
        axisDragRef.current = endAxisDrag(axisDragRef.current);
      }
    };
    document.addEventListener("mouseup", onGlobalUp);
    return () => document.removeEventListener("mouseup", onGlobalUp);
  }, []);

  /* ─── Toolbar callbacks ─── */
  const handleToggle = useCallback((key: string) => {
    setConfig(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const handleToggleSubPane = useCallback((key: string) => {
    setActiveSubPanes(prev => {
      if (prev.includes(key)) return prev.filter(k => k !== key);
      if (prev.length >= 3) return [...prev.slice(1), key];
      return [...prev, key];
    });
  }, []);

  const clearDrawings = useCallback(() => {
    pushDrawingState([]);
  }, [pushDrawingState]);

  /* ─── Left toolbar callbacks ─── */
  const handleSelectTool = useCallback((tool: string) => {
    setActiveTool(tool);
    // Map tool to drawing mode
    const drawingTools: Record<string, DrawingType> = {
      trendline: "trendline",
      horizontal: "horizontal",
      rectangle: "rectangle",
      fibonacci: "fibonacci",
    };
    if (drawingTools[tool]) {
      setDrawingMode(drawingTools[tool]);
    } else {
      setDrawingMode(null);
      setDrawingPoints([]);
    }
  }, []);

  /* ─── Context menu actions ─── */
  const handleContextAction = useCallback((action: string) => {
    setContextMenu(p => ({ ...p, open: false }));
    switch (action) {
      case "reset":
        zoomRef.current = createInitialZoomState(bars.length, Math.min(200, bars.length));
        break;
      case "screenshot":
        if (canvasRef.current) exportScreenshot(canvasRef.current, pair);
        break;
      case "fullscreen":
        if (outerRef.current) toggleFullscreen(outerRef.current);
        break;
      case "addIndicator":
        setShowIndicatorDialog(true);
        break;
      case "trendline":
        setDrawingMode("trendline");
        setActiveTool("trendline");
        break;
      case "horizontal":
        setDrawingMode("horizontal");
        setActiveTool("horizontal");
        break;
      case "fibonacci":
        setDrawingMode("fibonacci");
        setActiveTool("fibonacci");
        break;
      case "rectangle":
        setDrawingMode("rectangle");
        setActiveTool("rectangle");
        break;
      case "deleteAllDrawings":
        clearDrawings();
        break;
      // Chart types (colon format from ChartContextMenu)
      case "chartType:candles": setChartType("candles"); break;
      case "chartType:hollow": setChartType("hollow"); break;
      case "chartType:bars": setChartType("bars"); break;
      case "chartType:line": setChartType("line"); break;
      case "chartType:area": setChartType("area"); break;
      case "chartType:heikinashi": setChartType("heikinAshi"); break;
      case "chartType:baseline": setChartType("baseline"); break;
      // Price scale
      case "priceScale:linear": setPriceScale("linear"); break;
      case "priceScale:log": setPriceScale("log"); break;
      case "priceScale:percentage": setPriceScale("percent"); break;
      // Crosshair mode
      case "crosshairMode:crosshair": setCrosshairMode("crosshair"); break;
      case "crosshairMode:dot": setCrosshairMode("dot"); break;
      case "crosshairMode:none": setCrosshairMode("none"); break;
      default: break;
    }
  }, [bars.length, pair, clearDrawings]);

  /* ─── Symbol search ─── */
  const handleSymbolSelect = useCallback((symbol: string) => {
    setShowSymbolSearch(false);
    if (onPairChange) onPairChange(symbol);
  }, [onPairChange]);

  /* ─── Indicator layer chips ─── */
  const overlayChips: OverlayChip[] = useMemo(() => {
    const OVERLAY_KEYS = [
      "sma20", "sma50", "sma200", "ema20", "ema50",
      "hma9", "tema20", "vwap",
      "bollinger", "keltner", "ichimoku", "donchian",
      "volumeProfile", "sr", "fvg", "trendlines",
      "pivotPoints", "parabolicSAR",
    ];
    return OVERLAY_KEYS
      .filter((k) => OVERLAY_META[k])
      .map((k) => ({
        key: k,
        label: OVERLAY_META[k].label,
        color: OVERLAY_META[k].color,
        enabled: !!config[k],
      }))
      .filter((c) => c.enabled);
  }, [config]);

  const subPaneChips: SubPaneChip[] = useMemo(() => {
    return activeSubPanes
      .filter((k) => SUBPANE_META[k])
      .map((k) => ({
        key: k,
        label: SUBPANE_META[k].label,
        color: SUBPANE_META[k].color,
      }));
  }, [activeSubPanes]);

  const handleRemoveOverlay = useCallback((key: string) => {
    handleToggle(key);
  }, [handleToggle]);

  const handleRemoveSubPane = useCallback((key: string) => {
    handleToggleSubPane(key);
  }, [handleToggleSubPane]);

  /* ─── Last bar info ─── */
  const lastBar = bars.length > 0 ? bars[bars.length - 1] : null;
  const prevBar = bars.length > 1 ? bars[bars.length - 2] : null;
  const change = lastBar && prevBar ? ((lastBar.c - prevBar.c) / prevBar.c) * 100 : 0;
  const isUp = change >= 0;

  if (error) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        height: "100%", fontFamily: "'IBM Plex Mono', monospace",
        color: "#EF5350", fontSize: 14, background: THEME.canvasBg,
        borderRadius: 8, border: `1px solid ${THEME.subPaneBorder}`,
      }}>
        {error}
      </div>
    );
  }

  return (
    <div ref={outerRef} style={{
      display: "flex", flexDirection: "column", height: "100%",
      background: THEME.canvasBg, borderRadius: 8,
      border: `1px solid ${THEME.subPaneBorder}`, overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "6px 12px",
        borderBottom: `1px solid ${THEME.subPaneBorder}`,
        background: THEME.axisBg, minHeight: 40,
      }}>
        {/* Clickable pair name → opens symbol search */}
        <button
          onClick={() => setShowSymbolSearch(true)}
          style={{
            fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 15,
            color: "#D1D4DC", background: "none", border: "none", cursor: "pointer",
            padding: "2px 4px", borderRadius: 4,
          }}
          title="Search symbol (press .)"
        >
          {pair}
          <span style={{ fontSize: 10, color: THEME.axisText, marginLeft: 4 }}>&#9662;</span>
        </button>

        {lastBar && (
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 15, fontWeight: 600, color: "#D1D4DC" }}>
              {formatPrice(lastBar.c, pair)}
            </span>
            <span style={{
              fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, fontWeight: 600,
              color: isUp ? THEME.bullBody : THEME.bearBody,
            }}>
              {isUp ? "+" : ""}{change.toFixed(3)}%
            </span>
          </div>
        )}

        {/* Chart type selector */}
        <div style={{ display: "flex", gap: 1, background: "#1A1E2E", borderRadius: 4, padding: 1, marginLeft: 8 }}>
          {(["candles", "hollow", "bars", "line", "area", "heikinAshi", "baseline"] as ChartType[]).map(ct => (
            <button
              key={ct}
              onClick={() => setChartType(ct)}
              style={{
                fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, fontWeight: 600,
                padding: "2px 6px", borderRadius: 3, border: "none",
                background: chartType === ct ? "#2A2E39" : "transparent",
                color: chartType === ct ? "#D1D4DC" : "#545B69",
                cursor: "pointer", textTransform: "uppercase",
              }}
            >
              {ct === "heikinAshi" ? "HA" : ct === "baseline" ? "BASE" : ct.toUpperCase().slice(0, 4)}
            </button>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        {source && (
          <span style={{
            fontFamily: "'IBM Plex Mono', monospace", fontSize: 10,
            padding: "2px 6px", borderRadius: 4,
            background: "rgba(41,98,255,0.15)", color: "#2962FF", fontWeight: 600,
          }}>
            {source}
          </span>
        )}
        {source && source.toLowerCase().includes("twelve") && (
          <span style={{
            fontFamily: "'IBM Plex Mono', monospace", fontSize: 9,
            padding: "1px 5px", borderRadius: 3,
            background: "rgba(255,152,0,0.15)", color: "#FF9800", fontWeight: 600,
          }}>
            DELAYED
          </span>
        )}
        {loading && (
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: THEME.axisText }}>
            LOADING...
          </span>
        )}
      </div>

      {/* Top Toolbar */}
      <ChartToolbar
        config={config}
        onToggle={handleToggle}
        activeSubPanes={activeSubPanes}
        onToggleSubPane={handleToggleSubPane}
        drawingMode={drawingMode}
        onSetDrawingMode={setDrawingMode}
        hasDrawings={drawings.length > 0}
        onClearDrawings={clearDrawings}
      />

      {/* Main area: left toolbar + canvas */}
      <div style={{ flex: 1, display: "flex", minHeight: 0, overflow: "hidden" }}>
        {/* Left Drawing Toolbar */}
        <ChartLeftToolbar
          activeTool={activeTool}
          onSelectTool={handleSelectTool}
          hasDrawings={drawings.length > 0}
          onClearDrawings={clearDrawings}
        />

        {/* Canvas container */}
        <div
          ref={containerRef}
          style={{
            flex: 1, position: "relative",
            cursor: drawingMode ? "crosshair" : isDragging ? "grabbing" : "crosshair",
            overflow: "hidden",
            touchAction: "none",
            userSelect: "none",
            WebkitUserSelect: "none",
          }}
        >
          <canvas
            ref={canvasRef}
            onMouseMove={handleMouseMove}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            onDoubleClick={handleDoubleClick}
            onContextMenu={handleContextMenu}
            style={{
              display: "block", width: "100%", height: "100%",
              touchAction: "none",
              userSelect: "none",
            }}
          />

          {/* Indicator layer chips (TradingView-style) */}
          <IndicatorLayers
            activeOverlays={overlayChips}
            activeSubPanes={subPaneChips}
            onRemoveOverlay={handleRemoveOverlay}
            onRemoveSubPane={handleRemoveSubPane}
          />

          {/* Context Menu (positioned inside canvas container) */}
          {contextMenu.open && (
            <ChartContextMenu
              x={contextMenu.x}
              y={contextMenu.y}
              isOpen={contextMenu.open}
              onClose={() => setContextMenu(p => ({ ...p, open: false }))}
              onAction={handleContextAction}
            />
          )}
        </div>
      </div>

      {/* Bottom Status Bar */}
      <ChartStatusBar
        interval={interval}
        lastBarTimestamp={lastBar ? lastBar.t : 0}
        priceScale={priceScale}
        onPriceScaleChange={setPriceScale}
        onScreenshot={() => { if (canvasRef.current) exportScreenshot(canvasRef.current, pair); }}
        onFullscreen={() => { if (outerRef.current) toggleFullscreen(outerRef.current); }}
      />

      {/* Symbol Search Modal */}
      <ChartSymbolSearch
        isOpen={showSymbolSearch}
        onClose={() => setShowSymbolSearch(false)}
        onSelect={handleSymbolSelect}
        currentSymbol={pair}
      />

      {/* Indicator Dialog */}
      <ChartIndicatorDialog
        isOpen={showIndicatorDialog}
        onClose={() => setShowIndicatorDialog(false)}
        activeOverlays={config}
        activeSubPanes={activeSubPanes}
        onToggleOverlay={handleToggle}
        onToggleSubPane={handleToggleSubPane}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Error Boundary
   ═══════════════════════════════════════════════════════ */

class ChartErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; errorMessage: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: "" };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, errorMessage: error.message };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", height: "100%", gap: 12,
          fontFamily: "'IBM Plex Mono', monospace", color: "#EF5350",
          fontSize: 13, background: THEME.canvasBg, borderRadius: 8,
          border: `1px solid ${THEME.subPaneBorder}`,
        }}>
          <span style={{ fontSize: 11, color: THEME.axisText }}>CHART ERROR</span>
          <span>{this.state.errorMessage}</span>
          <button
            onClick={() => this.setState({ hasError: false, errorMessage: "" })}
            style={{
              fontFamily: "'IBM Plex Mono', monospace", fontSize: 11,
              padding: "4px 12px", borderRadius: 4, border: `1px solid ${THEME.subPaneBorder}`,
              background: THEME.axisBg, color: THEME.labelText, cursor: "pointer",
            }}
          >
            RETRY
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function ChartEngine(props: Props) {
  return (
    <ChartErrorBoundary>
      <ChartEngineInner {...props} />
    </ChartErrorBoundary>
  );
}

/* ═══════════════════════════════════════════════════════
   Legend (drawn on canvas)
   ═══════════════════════════════════════════════════════ */

function drawLegend(
  ctx: CanvasRenderingContext2D,
  lines: { label: string; color: string }[],
  bands: { label: string; line: string }[],
  layout: ChartLayout,
): void {
  const items = [
    ...lines.map(l => ({ label: l.label, color: l.color })),
    ...bands.map(b => ({ label: b.label, color: b.line })),
  ];
  if (items.length === 0) return;

  ctx.font = "10px 'IBM Plex Mono', monospace";
  let x = layout.chartLeft + 4;
  const y = layout.mainTop + 28; // Below OHLC legend

  for (const item of items) {
    ctx.fillStyle = item.color;
    ctx.beginPath();
    ctx.arc(x + 4, y, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = THEME.axisText;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(item.label, x + 10, y);
    x += ctx.measureText(item.label).width + 20;
  }
}
