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
import { computeLayout, computeViewport, formatPrice, xToIndex, yToPrice, indexToX, priceToY } from "./core/data";
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
  drawDrawings, loadDrawings, saveDrawings, createDrawing,
  hitTestDrawings, drawRubberBand, drawDrawingPriceLabels,
  magneticSnap, shiftSnapPoint, createParallelLine,
} from "./renderers/drawings";
import type { MagneticSnapResult } from "./renderers/drawings";
import DrawingPropertiesPanel from "./DrawingPropertiesPanel";
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
import { getIndicatorSchema, getDefaultParams, formatIndicatorLabel } from "./core/indicatorSchema";

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

  // Indicator parameter overrides: { indicatorId: { paramKey: value } }
  const [indicatorParams, setIndicatorParams] = useState<Record<string, Record<string, number>>>({});

  // Undo/redo stack
  const [undoStack, setUndoStack] = useState<Drawing[][]>([]);
  const [redoStack, setRedoStack] = useState<Drawing[][]>([]);

  // Drawing selection + hover + properties panel
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);
  const [hoveredDrawingId, setHoveredDrawingId] = useState<string | null>(null);
  const [drawingPropsPanel, setDrawingPropsPanel] = useState<{ drawingId: string; x: number; y: number } | null>(null);

  // Drawing tool refs (avoid stale closures in pointer handlers)
  const drawingModeRef = useRef<DrawingType | null>(drawingMode);
  const drawingPointsRef = useRef<{ index: number; price: number }[]>(drawingPoints);
  const drawingsRef = useRef<Drawing[]>(drawings);
  useEffect(() => { drawingModeRef.current = drawingMode; }, [drawingMode]);
  useEffect(() => { drawingPointsRef.current = drawingPoints; }, [drawingPoints]);
  useEffect(() => { drawingsRef.current = drawings; }, [drawings]);

  // Shift key tracking (for 15° angle snap)
  const shiftHeldRef = useRef(false);
  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.key === "Shift") shiftHeldRef.current = true; };
    const up = (e: KeyboardEvent) => { if (e.key === "Shift") shiftHeldRef.current = false; };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, []);

  // Drag-to-move drawings
  const drawingDragRef = useRef<{
    drawingId: string;
    part: string; // "body"|"p0"|"p1"|"rect-adj-0"|"rect-adj-1"|"edge-top"|"edge-bottom"|"edge-left"|"edge-right"
    startX: number; startY: number;
    origPoints: { index: number; price: number }[];
  } | null>(null);
  const dragOverrideRef = useRef<{ id: string; points: { index: number; price: number }[] } | null>(null);
  const [isDrawingDragging, setIsDrawingDragging] = useState(false);

  // Magnetic snap indicator for rubber band
  const magneticSnapResultRef = useRef<MagneticSnapResult | null>(null);

  // Helper: compute active viewport with zoom + price offset
  const getActiveViewport = useCallback(() => {
    const rawVp = computeViewport(bars, zoomRef.current.startIndex, zoomRef.current.endIndex);
    let vp = rawVp;
    if (priceZoomRef.current !== 1.0) {
      const mid = (vp.priceMin + vp.priceMax) / 2;
      const halfRange = ((vp.priceMax - vp.priceMin) / 2) * priceZoomRef.current;
      vp = { ...vp, priceMin: mid - halfRange, priceMax: mid + halfRange };
    }
    if (zoomRef.current.priceOffset !== 0) {
      vp = { ...vp, priceMin: vp.priceMin + zoomRef.current.priceOffset, priceMax: vp.priceMax + zoomRef.current.priceOffset };
    }
    return vp;
  }, [bars]);

  // Layout (left toolbar adds 40px)
  const LEFT_TOOLBAR_WIDTH = 40;
  const layout = useMemo(
    () => computeLayout(dimensions.w, dimensions.h, activeSubPanes.length),
    [dimensions.w, dimensions.h, activeSubPanes.length],
  );

  // Helper: get param value with fallback to schema default
  const p = useCallback((id: string, key: string, fallback: number): number => {
    return indicatorParams[id]?.[key] ?? fallback;
  }, [indicatorParams]);

  // Indicators (memoized, driven by indicatorParams)
  const indicators = useMemo((): IndicatorBundle => {
    if (bars.length < 5) return EMPTY_BUNDLE;

    const overlayLines: IndicatorBundle["overlayLines"] = [];
    if (config.sma20) overlayLines.push({ points: computeSMA(bars, p("sma20", "period", 20)), color: THEME.sma1Color, label: formatIndicatorLabel("sma20", { period: p("sma20", "period", 20) }) });
    if (config.sma50) overlayLines.push({ points: computeSMA(bars, p("sma50", "period", 50)), color: THEME.sma2Color, label: formatIndicatorLabel("sma50", { period: p("sma50", "period", 50) }) });
    if (config.sma200) overlayLines.push({ points: computeSMA(bars, p("sma200", "period", 200)), color: "#FF5252", label: formatIndicatorLabel("sma200", { period: p("sma200", "period", 200) }) });
    if (config.ema20) overlayLines.push({ points: computeEMA(bars, p("ema20", "period", 20)), color: THEME.emaColor, label: formatIndicatorLabel("ema20", { period: p("ema20", "period", 20) }) });
    if (config.ema50) overlayLines.push({ points: computeEMA(bars, p("ema50", "period", 50)), color: "#00E676", label: formatIndicatorLabel("ema50", { period: p("ema50", "period", 50) }) });
    if (config.hma9) overlayLines.push({ points: computeHMA(bars, p("hma9", "period", 9)), color: "#00E676", label: formatIndicatorLabel("hma9", { period: p("hma9", "period", 9) }) });
    if (config.tema20) overlayLines.push({ points: computeTEMA(bars, p("tema20", "period", 20)), color: "#FF4081", label: formatIndicatorLabel("tema20", { period: p("tema20", "period", 20) }) });

    const bandsList: IndicatorBundle["bands"] = [];
    if (config.bollinger) {
      const bbPeriod = p("bollinger", "period", 20);
      const bbStdDev = p("bollinger", "stdDev", 2);
      bandsList.push({ points: computeBollinger(bars, bbPeriod, bbStdDev), fill: THEME.bbFill, line: THEME.bbLine, label: formatIndicatorLabel("bollinger", { period: bbPeriod, stdDev: bbStdDev }) });
    }
    if (config.keltner) {
      const kcEma = p("keltner", "emaPeriod", 20);
      const kcAtr = p("keltner", "atrPeriod", 10);
      const kcMult = p("keltner", "multiplier", 1.5);
      bandsList.push({ points: computeKeltner(bars, kcEma, kcAtr, kcMult), fill: THEME.kcFill, line: THEME.kcLine, label: formatIndicatorLabel("keltner", { emaPeriod: kcEma, atrPeriod: kcAtr, multiplier: kcMult }) });
    }
    if (config.donchian) {
      const dcPeriod = p("donchian", "period", 20);
      bandsList.push({ points: computeDonchian(bars, dcPeriod), fill: "rgba(0,188,212,0.06)", line: "#00BCD4", label: formatIndicatorLabel("donchian", { period: dcPeriod }) });
    }

    const vwap = config.vwap ? computeVWAP(bars) : [];
    const ichimoku = config.ichimoku ? computeIchimoku(bars, p("ichimoku", "tenkan", 9), p("ichimoku", "kijun", 26), p("ichimoku", "senkouB", 52)) : [];
    const parabolicSAR = config.parabolicSAR ? computeParabolicSAR(bars, p("parabolicSAR", "afStart", 0.02), p("parabolicSAR", "afMax", 0.2)) : [];
    const pivotPointsArr = config.pivotPoints ? computePivotPoints(bars) : [];
    const pivotPoints = pivotPointsArr.length > 0 ? pivotPointsArr[pivotPointsArr.length - 1] : null;
    const volumeProfile = config.volumeProfile ? computeVolumeProfile(bars, p("volumeProfile", "numLevels", 50)) : null;

    const subPaneData: Record<string, unknown> = {};
    for (const sp of activeSubPanes) {
      switch (sp) {
        case "rsi": subPaneData.rsi = computeRSI(bars, p("rsi", "period", 14)); break;
        case "macd": subPaneData.macd = computeMACD(bars, p("macd", "fast", 12), p("macd", "slow", 26), p("macd", "signal", 9)); break;
        case "stochastic": subPaneData.stochastic = computeStochastic(bars, p("stochastic", "kPeriod", 14), p("stochastic", "dPeriod", 3)); break;
        case "stochRSI": subPaneData.stochRSI = computeStochRSI(bars, p("stochRSI", "rsiPeriod", 14), p("stochRSI", "stochPeriod", 14), p("stochRSI", "kSmooth", 3), p("stochRSI", "dSmooth", 3)); break;
        case "williamsR": subPaneData.williamsR = computeWilliamsR(bars, p("williamsR", "period", 14)); break;
        case "cci": subPaneData.cci = computeCCI(bars, p("cci", "period", 20)); break;
        case "adx": subPaneData.adx = computeADX(bars, p("adx", "period", 14)); break;
        case "obv": subPaneData.obv = computeOBV(bars); break;
        case "mfi": subPaneData.mfi = computeMFI(bars, p("mfi", "period", 14)); break;
        case "cmf": subPaneData.cmf = computeCMF(bars, p("cmf", "period", 20)); break;
      }
    }

    const sr = config.sr ? detectSupportResistance(bars) : [];
    const fvg = config.fvg ? detectFVG(bars) : [];
    const trend = config.trendlines ? detectTrendlines(bars) : [];

    return { overlayLines, bands: bandsList, vwap, ichimoku, parabolicSAR, pivotPoints, volumeProfile, subPaneData, sr, fvg, trend };
  }, [bars, config, activeSubPanes, indicatorParams, p]);

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
        case "cancel":
          // Cancel drawing in progress or deselect
          if (drawingMode) {
            setDrawingMode(null);
            drawingModeRef.current = null;
            setDrawingPoints([]);
            drawingPointsRef.current = [];
            setActiveTool("crosshair");
          } else if (selectedDrawingId) {
            setSelectedDrawingId(null);
            setDrawingPropsPanel(null);
          }
          break;
        case "deleteDrawing":
          // Delete selected drawing, or last drawing
          if (selectedDrawingId) {
            const updated = drawings.filter(d => d.id !== selectedDrawingId);
            pushDrawingState(updated);
            setSelectedDrawingId(null);
            setDrawingPropsPanel(null);
          } else if (drawings.length > 0) {
            const updated = drawings.slice(0, -1);
            pushDrawingState(updated);
          }
          break;
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [bars.length, pair, drawings, showSymbolSearch, showIndicatorDialog, selectedDrawingId, drawingMode]);

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

    // Apply price axis zoom factor, then vertical price offset
    const viewport = (() => {
      let vp = rawViewport;
      // Price axis zoom (drag-to-scale)
      if (priceZoomRef.current !== 1.0) {
        const mid = (vp.priceMin + vp.priceMax) / 2;
        const halfRange = ((vp.priceMax - vp.priceMin) / 2) * priceZoomRef.current;
        vp = { ...vp, priceMin: mid - halfRange, priceMax: mid + halfRange };
      }
      // Vertical pan offset
      if (zoom.priceOffset !== 0) {
        vp = { ...vp, priceMin: vp.priceMin + zoom.priceOffset, priceMax: vp.priceMax + zoom.priceOffset };
      }
      return vp;
    })();

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
    if (indicators.sr.length > 0) drawSRLevels(ctx, indicators.sr, layout, viewport, priceScale);
    if (indicators.fvg.length > 0) drawFVGZones(ctx, indicators.fvg, layout, viewport, priceScale);
    if (indicators.trend.length > 0) drawTrendlines(ctx, indicators.trend, bars, layout, viewport, priceScale);
    for (const band of indicators.bands) drawBands(ctx, band.points, bars, layout, viewport, band.fill, band.line, priceScale);
    if (indicators.ichimoku.length > 0) drawIchimoku(ctx, indicators.ichimoku, bars, layout, viewport, priceScale);

    // Layer 2: Price data (chart type dispatch)
    switch (chartType) {
      case "candles":
        drawCandlesticks(ctx, bars, layout, viewport, priceScale);
        break;
      case "hollow":
        drawHollowCandles(ctx, bars, layout, viewport, priceScale);
        break;
      case "bars":
        drawBarChart(ctx, bars, layout, viewport, priceScale);
        break;
      case "line":
        drawLineChart(ctx, bars, layout, viewport, priceScale);
        break;
      case "area":
        drawAreaChart(ctx, bars, layout, viewport, priceScale);
        break;
      case "heikinAshi":
        drawHeikinAshi(ctx, bars, layout, viewport, priceScale);
        break;
      case "baseline":
        drawBaseline(ctx, bars, layout, viewport, priceScale);
        break;
    }

    // Layer 3: Overlays on top
    for (const line of indicators.overlayLines) drawIndicatorLine(ctx, line.points, bars, layout, viewport, line.color, 1.5, priceScale);
    if (indicators.vwap.length > 0) drawVWAP(ctx, indicators.vwap, bars, layout, viewport, priceScale);
    if (indicators.parabolicSAR.length > 0) drawParabolicSAR(ctx, indicators.parabolicSAR, bars, layout, viewport, priceScale);
    if (indicators.pivotPoints) drawPivotPoints(ctx, indicators.pivotPoints, layout, viewport, priceScale);

    // Layer 4: Current price line
    drawCurrentPriceLine(ctx, bars, layout, viewport, pair, priceScale);

    // Layer 5: Volume
    drawVolume(ctx, bars, layout, viewport);
    if (indicators.volumeProfile) drawVolumeProfile(ctx, indicators.volumeProfile, layout, viewport, priceScale);

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

    // Layer 7: Drawings (apply drag override if active)
    let renderDrawings = drawings;
    if (dragOverrideRef.current) {
      const ov = dragOverrideRef.current;
      renderDrawings = drawings.map(d => d.id === ov.id ? { ...d, points: ov.points } : d);
    }
    drawDrawings(ctx, renderDrawings, layout, viewport, pair, priceScale, selectedDrawingId, hoveredDrawingId, bars);

    // Layer 7b: Rubber-band preview (drawing in progress)
    const currentPoints = drawingPointsRef.current;
    const currentMode = drawingModeRef.current;
    if (currentMode && currentPoints.length > 0 && ch.visible) {
      const neededPoints = currentMode === "horizontal" ? 1 : 2;
      if (currentPoints.length < neededPoints) {
        let rbx = ch.x, rby = ch.y;
        if (shiftHeldRef.current && currentMode !== "horizontal") {
          const p0 = currentPoints[0];
          const p0x = indexToX(p0.index, viewport.startIndex, viewport.endIndex, layout.chartLeft, layout.chartWidth);
          const p0y = priceToY(p0.price, viewport.priceMin, viewport.priceMax, layout.mainTop, layout.mainHeight, priceScale);
          if (currentMode === "rectangle") {
            // Shift = square constraint (equal width and height in pixels)
            const dx = ch.x - p0x;
            const dy = ch.y - p0y;
            const side = Math.max(Math.abs(dx), Math.abs(dy));
            rbx = p0x + side * Math.sign(dx || 1);
            rby = p0y + side * Math.sign(dy || 1);
          } else {
            // Shift-snap to 15° increments for trendlines
            const snapped = shiftSnapPoint(p0x, p0y, ch.x, ch.y);
            rbx = snapped.x;
            rby = snapped.y;
          }
        }
        drawRubberBand(ctx, currentPoints[0], rbx, rby, layout, viewport, priceScale, currentMode, undefined, magneticSnapResultRef.current);
      }
    }

    // Layer 8: Axes
    drawPriceAxis(ctx, layout, viewport, pair, priceScale, refPrice);
    drawTimeAxis(ctx, layout, viewport, bars, interval);

    // Layer 8b: Drawing price axis labels (on top of axes)
    drawDrawingPriceLabels(ctx, renderDrawings, layout, viewport, priceScale, selectedDrawingId);

    // Layer 9: Crosshair
    drawCrosshair(ctx, ch, layout, viewport, bars, pair, crosshairMode, priceScale, refPrice);

    // Layer 10: OHLC Legend (top-left, on top of everything)
    drawOHLCLegend(ctx, bars, layout, viewport, pair, ch.visible ? ch.snapIndex : -1);

    // Layer 11: Legend (indicator labels)
    drawLegend(ctx, indicators.overlayLines, indicators.bands, layout);
  }, [bars, layout, indicators, drawings, pair, interval, activeSubPanes, dimensions, chartType, enabledSessions, priceScale, crosshairMode, selectedDrawingId, hoveredDrawingId]);

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

    // Skip crosshair updates while context menu is open
    if (contextMenu.open) return;

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
      // Pass Y, mainHeight, and priceRange for vertical panning
      const vp = computeViewport(bars, zoomRef.current.startIndex, zoomRef.current.endIndex);
      const priceRange = vp.priceMax - vp.priceMin;
      zoomRef.current = handleDragMove(zoomRef.current, x, layout.chartWidth, bars.length, y, layout.mainHeight, priceRange);
    }

    const viewport = computeViewport(bars, zoomRef.current.startIndex, zoomRef.current.endIndex);
    const snap = snapToBar(x, viewport.startIndex, viewport.endIndex, layout.chartLeft, layout.chartWidth, bars.length);
    crosshairRef.current = { x, y, visible: true, snapIndex: snap };

    // Drawing drag-to-move: update override ref for 60fps rendering
    if (drawingDragRef.current) {
      const drag = drawingDragRef.current;
      const vp = getActiveViewport();
      const dx = x - drag.startX;
      const dy = y - drag.startY;
      const dIdx = (dx / layout.chartWidth) * (vp.endIndex - vp.startIndex);
      const dPrice = -(dy / layout.mainHeight) * (vp.priceMax - vp.priceMin);
      if (drag.part === "body") {
        dragOverrideRef.current = {
          id: drag.drawingId,
          points: drag.origPoints.map(p => ({ index: Math.round(p.index + dIdx), price: p.price + dPrice })),
        };
      } else if (drag.part === "rect-adj-0") {
        // Corner at (p0.index, p1.price): move p0.index + p1.price
        dragOverrideRef.current = {
          id: drag.drawingId,
          points: [
            { index: Math.round(drag.origPoints[0].index + dIdx), price: drag.origPoints[0].price },
            { index: drag.origPoints[1].index, price: drag.origPoints[1].price + dPrice },
          ],
        };
      } else if (drag.part === "rect-adj-1") {
        // Corner at (p1.index, p0.price): move p1.index + p0.price
        dragOverrideRef.current = {
          id: drag.drawingId,
          points: [
            { index: drag.origPoints[0].index, price: drag.origPoints[0].price + dPrice },
            { index: Math.round(drag.origPoints[1].index + dIdx), price: drag.origPoints[1].price },
          ],
        };
      } else if (drag.part === "edge-top" || drag.part === "edge-bottom") {
        // Edge drag: move only price of the relevant point (vertical only)
        const topPointIdx = drag.origPoints[0].price > drag.origPoints[1].price ? 0 : 1;
        const botPointIdx = 1 - topPointIdx;
        const targetIdx = drag.part === "edge-top" ? topPointIdx : botPointIdx;
        dragOverrideRef.current = {
          id: drag.drawingId,
          points: drag.origPoints.map((p, i) =>
            i === targetIdx ? { index: p.index, price: p.price + dPrice } : { ...p }
          ),
        };
      } else if (drag.part === "edge-left" || drag.part === "edge-right") {
        // Edge drag: move only index of the relevant point (horizontal only)
        const leftPointIdx = drag.origPoints[0].index < drag.origPoints[1].index ? 0 : 1;
        const rightPointIdx = 1 - leftPointIdx;
        const targetIdx = drag.part === "edge-left" ? leftPointIdx : rightPointIdx;
        dragOverrideRef.current = {
          id: drag.drawingId,
          points: drag.origPoints.map((p, i) =>
            i === targetIdx ? { index: Math.round(p.index + dIdx), price: p.price } : { ...p }
          ),
        };
      } else {
        // p0 or p1 corner drag (trendline + rectangle defining corners)
        const pi = drag.part === "p0" ? 0 : 1;
        const newPoints = drag.origPoints.map((p, i) => {
          if (i !== pi) return { ...p };
          let newIdx = Math.round(p.index + dIdx);
          let newPrice = p.price + dPrice;
          if (shiftHeldRef.current && drag.origPoints.length === 2) {
            const anchor = drag.origPoints[1 - pi];
            const ax = indexToX(anchor.index, vp.startIndex, vp.endIndex, layout.chartLeft, layout.chartWidth);
            const ay = priceToY(anchor.price, vp.priceMin, vp.priceMax, layout.mainTop, layout.mainHeight, priceScale);
            const cx = indexToX(newIdx, vp.startIndex, vp.endIndex, layout.chartLeft, layout.chartWidth);
            const cy = priceToY(newPrice, vp.priceMin, vp.priceMax, layout.mainTop, layout.mainHeight, priceScale);
            const snapped = shiftSnapPoint(ax, ay, cx, cy);
            newIdx = Math.round(xToIndex(snapped.x, vp.startIndex, vp.endIndex, layout.chartLeft, layout.chartWidth));
            newPrice = yToPrice(snapped.y, vp.priceMin, vp.priceMax, layout.mainTop, layout.mainHeight, priceScale);
          }
          return { index: newIdx, price: newPrice };
        });
        dragOverrideRef.current = { id: drag.drawingId, points: newPoints };
      }
      return;
    }

    // Update magnetic snap result during drawing mode
    if (drawingModeRef.current && bars.length > 0) {
      const vp = getActiveViewport();
      magneticSnapResultRef.current = magneticSnap(x, y, bars, layout, vp, priceScale);
    } else {
      magneticSnapResultRef.current = null;
    }

    // Hit test drawings for hover — only when not in drawing mode and not panning
    if (!drawingModeRef.current && !zoomRef.current.isDragging) {
      const hit = hitTestDrawings(x, y, drawingsRef.current, layout, viewport, priceScale);
      setHoveredDrawingId(hit ? hit.drawingId : null);
    }
  }, [layout, bars, contextMenu.open, priceScale, getActiveViewport]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    // FIX 2: Dismiss context menu on click and don't propagate
    if (contextMenu.open) {
      setContextMenu(prev => ({ ...prev, open: false }));
      return;
    }

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

    // FIX 3: Drawing mode — read from refs to avoid stale closures
    const currentDrawingMode = drawingModeRef.current;
    if (currentDrawingMode) {
      const vp = getActiveViewport();
      // Magnetic snap to nearest OHLC (pixel coords)
      const snap = magneticSnap(x, y, bars, layout, vp, priceScale);
      let idx = snap.index;
      let price = snap.price;
      const currentPoints = drawingPointsRef.current;
      // Shift-snap for second point (angle constraint) — operates in pixel space
      if (currentPoints.length === 1 && shiftHeldRef.current && currentDrawingMode !== "horizontal") {
        const anchor = currentPoints[0];
        const ax = indexToX(anchor.index, vp.startIndex, vp.endIndex, layout.chartLeft, layout.chartWidth);
        const ay = priceToY(anchor.price, vp.priceMin, vp.priceMax, layout.mainTop, layout.mainHeight, priceScale);
        const cx = indexToX(idx, vp.startIndex, vp.endIndex, layout.chartLeft, layout.chartWidth);
        const cy = priceToY(price, vp.priceMin, vp.priceMax, layout.mainTop, layout.mainHeight, priceScale);
        const snapped = shiftSnapPoint(ax, ay, cx, cy);
        idx = Math.round(xToIndex(snapped.x, vp.startIndex, vp.endIndex, layout.chartLeft, layout.chartWidth));
        price = yToPrice(snapped.y, vp.priceMin, vp.priceMax, layout.mainTop, layout.mainHeight, priceScale);
      }
      const pt = { index: idx, price };
      const newPoints = [...currentPoints, pt];
      setDrawingPoints(newPoints);
      drawingPointsRef.current = newPoints;

      const neededPoints = currentDrawingMode === "horizontal" ? 1 : 2;
      if (newPoints.length >= neededPoints) {
        const drawing = createDrawing(currentDrawingMode, newPoints);
        const updated = [...drawings, drawing];
        pushDrawingState(updated);
        setDrawingPoints([]);
        drawingPointsRef.current = [];
        // Auto-deactivate drawing mode after placement
        setDrawingMode(null);
        drawingModeRef.current = null;
        setActiveTool("crosshair");
        // Select the newly created drawing
        setSelectedDrawingId(drawing.id);
      }
      return;
    }

    // Click on chart without drawing mode: hit-test for selection + drag-to-move
    {
      const vp = getActiveViewport();
      const hit = hitTestDrawings(x, y, drawingsRef.current, layout, vp, priceScale);
      if (hit) {
        setSelectedDrawingId(hit.drawingId);
        if (drawingPropsPanel && drawingPropsPanel.drawingId !== hit.drawingId) {
          setDrawingPropsPanel(null);
        }
        // Start drag-to-move if drawing is not locked
        const targetDrawing = drawingsRef.current.find(d => d.id === hit.drawingId);
        if (targetDrawing && !targetDrawing.locked) {
          drawingDragRef.current = {
            drawingId: hit.drawingId,
            part: hit.part,
            startX: x,
            startY: y,
            origPoints: targetDrawing.points.map(p => ({ ...p })),
          };
          setIsDrawingDragging(true);
        }
        return;
      } else {
        setSelectedDrawingId(null);
        setDrawingPropsPanel(null);
      }
    }

    // Chart pan — pass Y for vertical panning
    zoomRef.current = handleDragStart(zoomRef.current, x, y);
    setIsDragging(true);
  }, [contextMenu.open, layout, drawings, bars, dimensions, activeTool, pushDrawingState, priceScale, drawingPropsPanel, getActiveViewport]);

  const handleMouseUp = useCallback(() => {
    // Commit drawing drag
    if (drawingDragRef.current && dragOverrideRef.current) {
      const ov = dragOverrideRef.current;
      const updated = drawingsRef.current.map(d => d.id === ov.id ? { ...d, points: ov.points } : d);
      pushDrawingState(updated);
      drawingDragRef.current = null;
      dragOverrideRef.current = null;
      setIsDrawingDragging(false);
      return;
    }
    if (drawingDragRef.current) {
      // Click without move — just cancel
      drawingDragRef.current = null;
      setIsDrawingDragging(false);
    }
    if (axisDragRef.current.isDragging) {
      axisDragRef.current = endAxisDrag(axisDragRef.current);
      return;
    }
    zoomRef.current = handleDragEnd(zoomRef.current);
    setIsDragging(false);
  }, [pushDrawingState]);

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
      // Also reset vertical pan offset
      zoomRef.current = { ...zoomRef.current, priceOffset: 0, priceVelocity: 0 };
      return;
    }
    if (zone === "timeAxis") {
      // Reset to show recent bars
      zoomRef.current = createInitialZoomState(bars.length, Math.min(200, bars.length));
      return;
    }
    // Double-click on chart area: reset vertical pan (auto-fit vertical)
    if (zone === "chart") {
      zoomRef.current = { ...zoomRef.current, priceOffset: 0, priceVelocity: 0 };
      priceZoomRef.current = 1.0;
      return;
    }
  }, [bars.length, dimensions, layout]);

  const handleContextMenu = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Check if right-clicking on a drawing → open properties panel
    const zoom = zoomRef.current;
    const viewport = computeViewport(bars, zoom.startIndex, zoom.endIndex);
    const hit = hitTestDrawings(x, y, drawingsRef.current, layout, viewport, priceScale);
    if (hit) {
      setSelectedDrawingId(hit.drawingId);
      setDrawingPropsPanel({ drawingId: hit.drawingId, x: e.clientX, y: e.clientY });
      setContextMenu(prev => ({ ...prev, open: false }));
      return;
    }

    // Generic context menu
    setDrawingPropsPanel(null);
    setContextMenu({ x: e.clientX, y: e.clientY, open: true });
  }, [bars, layout, priceScale]);

  const handleMouseLeave = useCallback(() => {
    crosshairRef.current = { ...crosshairRef.current, visible: false };
    magneticSnapResultRef.current = null;
    // Cancel drawing drag without committing
    if (drawingDragRef.current) {
      drawingDragRef.current = null;
      dragOverrideRef.current = null;
      setIsDrawingDragging(false);
    }
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
      // Commit drawing drag on global mouseup
      if (drawingDragRef.current && dragOverrideRef.current) {
        const ov = dragOverrideRef.current;
        const updated = drawingsRef.current.map(d => d.id === ov.id ? { ...d, points: ov.points } : d);
        pushDrawingState(updated);
        drawingDragRef.current = null;
        dragOverrideRef.current = null;
        setIsDrawingDragging(false);
        return;
      }
      if (drawingDragRef.current) {
        drawingDragRef.current = null;
        setIsDrawingDragging(false);
      }
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
  }, [pushDrawingState]);

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
      .map((k) => {
        // Use schema-driven label with current params, falling back to static label
        const schema = getIndicatorSchema(k);
        const currentParams = indicatorParams[k] ?? {};
        const mergedParams: Record<string, number> = schema
          ? Object.fromEntries(schema.params.map((sp) => [sp.key, currentParams[sp.key] ?? (sp.default as number)]))
          : {};
        const label = schema && schema.params.length > 0
          ? formatIndicatorLabel(k, mergedParams)
          : OVERLAY_META[k].label;
        return {
          key: k,
          label,
          color: OVERLAY_META[k].color,
          enabled: !!config[k],
        };
      })
      .filter((c) => c.enabled);
  }, [config, indicatorParams]);

  const subPaneChips: SubPaneChip[] = useMemo(() => {
    return activeSubPanes
      .filter((k) => SUBPANE_META[k])
      .map((k) => {
        const schema = getIndicatorSchema(k);
        const currentParams = indicatorParams[k] ?? {};
        const mergedParams: Record<string, number> = schema
          ? Object.fromEntries(schema.params.map((sp) => [sp.key, currentParams[sp.key] ?? (sp.default as number)]))
          : {};
        const label = schema && schema.params.length > 0
          ? formatIndicatorLabel(k, mergedParams)
          : SUBPANE_META[k].label;
        return {
          key: k,
          label,
          color: SUBPANE_META[k].color,
        };
      });
  }, [activeSubPanes, indicatorParams]);

  const handleRemoveOverlay = useCallback((key: string) => {
    handleToggle(key);
  }, [handleToggle]);

  const handleRemoveSubPane = useCallback((key: string) => {
    handleToggleSubPane(key);
  }, [handleToggleSubPane]);

  const handleIndicatorParamsChange = useCallback((id: string, params: Record<string, number>) => {
    setIndicatorParams((prev) => ({ ...prev, [id]: params }));
  }, []);

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
            cursor: isDrawingDragging ? "move" : drawingMode ? "crosshair" : isDragging ? "grabbing" : hoveredDrawingId ? "pointer" : "crosshair",
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
            indicatorParams={indicatorParams}
            onParamsChange={handleIndicatorParamsChange}
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

          {/* Drawing Properties Panel (right-click on a drawing) */}
          {drawingPropsPanel && (() => {
            const d = drawings.find(dr => dr.id === drawingPropsPanel.drawingId);
            if (!d) return null;
            return (
              <DrawingPropertiesPanel
                drawing={d}
                x={drawingPropsPanel.x}
                y={drawingPropsPanel.y}
                onUpdate={(updated) => {
                  const newDrawings = drawings.map(dr => dr.id === updated.id ? updated : dr);
                  pushDrawingState(newDrawings);
                }}
                onDelete={() => {
                  const newDrawings = drawings.filter(dr => dr.id !== drawingPropsPanel.drawingId);
                  pushDrawingState(newDrawings);
                  setDrawingPropsPanel(null);
                  setSelectedDrawingId(null);
                }}
                onDuplicate={() => {
                  const clone = createDrawing(d.type, d.points.map(p => ({ ...p })), {
                    color: d.color,
                    lineWidth: d.lineWidth,
                    label: d.label ? `${d.label} (copy)` : "",
                    extendLeft: d.extendLeft,
                    extendRight: d.extendRight,
                    showAngle: d.showAngle,
                    opacity: d.opacity,
                  });
                  pushDrawingState([...drawings, clone]);
                  setDrawingPropsPanel(null);
                  setSelectedDrawingId(clone.id);
                }}
                onCreateParallel={d.type === "trendline" ? () => {
                  const parallel = createParallelLine(d, 20);
                  pushDrawingState([...drawings, parallel]);
                  setDrawingPropsPanel(null);
                  setSelectedDrawingId(parallel.id);
                } : undefined}
                onClose={() => setDrawingPropsPanel(null)}
              />
            );
          })()}
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
