"use client";
/**
 * ChartEngine.tsx — ORDR Canvas 2D Charting Platform (TradingView Parity)
 *
 * Full-featured institutional charting: 7 chart types, 77 indicators,
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
  SuperTrendPoint, ChandelierPoint, ChandeKrollPoint, AlligatorPoint,
  ZigzagPoint, AutoFibData, MARibbonData,
  BullBearPoint, KlingerPoint, PPOPoint, RVIPoint, SMIPoint, TSIPoint,
  VortexPoint, AroonPoint,
  RSISubPane, StochSubPane, WilliamsRSubPane, CCISubPane, ADXSubPane, ATRSubPane,
} from "./indicators/types";
import {
  computeSMA, computeEMA, emaFromValues, computeRSI, computeMACD,
  computeATR, computeBollinger, computeKeltner,
  computeStochastic, computeStochRSI, computeWilliamsR,
  computeCCI, computeADX, computeMFI, computeCMF, computeOBV,
  computeVWAP, computeVWAPBands, computeIchimoku, computeHMA, computeTEMA,
  computeDonchian, computeParabolicSAR, computePivotPoints,
  computeVolumeProfile,
} from "./indicators";
import type { RSISource } from "./indicators";
import {
  computeWMA, computeSMMA, computeALMA, computeDEMA, computeLSMA,
  computeMcGinley, computeVWMA, computeEnvelope,
  computeSuperTrend, computeChandelierExit, computeChandeKrollStop,
  computeAlligator, computeZigzag,
  computeBBPercentB, computeBBWidth, computeHistoricalVolatility,
  computeAutoFib, computeADR, computeCorrelation, computeMARibbon,
  computeAO, computeBOP, computeBBTrend, computeBullBearPower,
  computeChaikinOscillator, computeCMO, computeChoppiness, computeChopZone,
  computeConnorsRSI, computeCoppock, computeDPO, computeEOM, computeEFI,
  computeFisher, computeKlinger, computeKST, computeMassIndex, computeMomentum,
  computePPO, computeROC, computeRVI, computeSMI, computeTRIX, computeTSI,
  computeUltimateOscillator, computeVortex, computeAroon,
  computeADL, computeCVD, computeCVI, computeNetVolume, computePVT, computeVolumeOscillator,
} from "./indicators";
import { detectSupportResistance, detectFVG, detectTrendlines, detectMarketStructure, detectPatterns, detectDivergence } from "./detection";
import { detectOrderBlocks } from "./detection/order-blocks";
import { detectLiquidityZones } from "./detection/liquidity-zones";
import type { MarketStructureData, ChartPatternData, VolatilityConeData, DivergenceLine } from "./indicators/types";
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
import { THEME, syncThemeWithCSS } from "./core/theme";
import { drawCandlesticks } from "./renderers/candlestick";
import { drawVolume } from "./renderers/volume";
import {
  drawIndicatorLine, drawBands, drawRSI, drawMACD,
  drawVWAP, drawIchimoku, drawHMA, drawTEMA,
  drawDonchian, drawParabolicSAR, drawPivotPoints,
  drawSuperTrend, drawChandelierExit, drawChandeKrollStop,
  drawAlligator, drawZigzag, drawAutoFib, drawMARibbon,
} from "./renderers/indicators";
import { drawSRLevels, drawFVGZones, drawTrendlines, drawMarketStructure, drawChartPatterns } from "./renderers/overlays";
import {
  drawDrawings, loadDrawings, saveDrawings, createDrawing,
  hitTestDrawings, drawRubberBand, drawDrawingPriceLabels,
  magneticSnap, shiftSnapPoint, createParallelLine, getPointsRequired,
} from "./renderers/drawings";
import type { MagneticSnapResult, HitTestResult } from "./renderers/drawings";
import DrawingPropertiesPanel from "./DrawingPropertiesPanel";
import type { Drawing, DrawingType } from "./renderers/drawings";
import {
  drawStochastic, drawStochRSI, drawWilliamsR,
  drawCCI, drawADX, drawMFI, drawCMF, drawOBV,
  drawAO, drawBOP, drawBBTrend, drawBullBearPower,
  drawChaikinOsc, drawCMO, drawChoppiness, drawChopZone,
  drawConnorsRSI, drawCoppock, drawDPO, drawEOM, drawEFI,
  drawFisher, drawKlinger, drawKST, drawMassIndex, drawMomentum,
  drawPPO, drawROC, drawRVI, drawSMI, drawTRIX, drawTSI,
  drawUltimateOscillator, drawVortex, drawAroon,
  drawADL, drawCVD, drawCVI, drawNetVolume, drawPVT, drawVolumeOscillator,
  drawBBPercentB, drawBBWidth, drawHistVol, drawCorrelation, drawADRPane,
} from "./renderers/oscillators";
import { drawVolumeProfile } from "./renderers/volumeProfile";
import { drawCurrentPriceLine, drawOHLCLegend, drawIndicatorLegend } from "./renderers/priceLine";
import { renderChart } from "./renderers/ChartRenderer";
import type { IndicatorBundle as IndicatorBundleType } from "./renderers/ChartRenderer";
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
  /** Embedded mode: hides built-in header, toolbars, status bar. Canvas only. */
  embedded?: boolean;
  /** External indicator config — overrides internal state when provided */
  externalConfig?: Partial<ChartIndicatorConfig>;
  /** External sub-pane list — overrides internal state when provided */
  externalSubPanes?: string[];
  /** External chart type — overrides internal state when provided */
  externalChartType?: ChartType;
  /** External drawing mode — overrides internal state when provided */
  externalDrawingMode?: DrawingType | null;
  /** Magnet mode enabled (snap to OHLC) */
  externalMagnetEnabled?: boolean;
  /** Hide all drawings */
  externalHideDrawings?: boolean;
  /** Lock all drawings (prevent editing) */
  externalLockDrawings?: boolean;
  /** Delete all drawings trigger (increments to trigger) */
  externalDeleteAllDrawings?: number;
  /** Callback when config changes internally (for sync) */
  onConfigChange?: (config: ChartIndicatorConfig) => void;
  /** Callback when subpanes change internally (for sync) */
  onSubPanesChange?: (panes: string[]) => void;
  /** Callback when drawing mode changes internally (start / clear) */
  onDrawingModeChange?: (mode: DrawingType | null) => void;
  /** Callback when chart type changes internally (context menu) */
  onChartTypeChange?: (type: ChartType) => void;
  /** Callback when a drawing is selected (id) or deselected (null) */
  onObjectSelect?: (id: string | null) => void;
  /** Callback delivering selected drawing properties for the sidebar panel */
  onObjectData?: (data: { type: string; color: string; lineWidth: number; lineStyle: string; label: string; opacity: number; locked: boolean } | null) => void;
  /** External session keys to highlight (e.g. ["london","newyork"]) */
  externalSessions?: string[];
  /** Increment to trigger a canvas screenshot download */
  externalScreenshotTrigger?: number;
  /** Increment to trigger copying the canvas as PNG to the clipboard */
  externalCopyImageTrigger?: number;
  /** Backtest trade entry/exit markers to render on chart */
  externalBacktestMarkers?: import('../workspace/workspace-types').BacktestMarker[];
  /** Apply a style patch to a drawing by id (from sidebar properties panel) */
  externalDrawingUpdate?: { id: string; color?: string; lineWidth?: number; lineStyle?: string; opacity?: number } | null;
  /** Active alert price levels to render as dashed horizontal lines */
  externalAlertLevels?: { value: number; active: boolean; triggered: boolean }[];
  /** Override price scale mode (linear / log / percent) */
  externalPriceScaleMode?: "linear" | "log" | "percent";
  /** Show previous session OHLC horizontal level lines */
  externalShowPrevLevels?: boolean;
  /** Show ICT open levels (DOL / WOL / Asia Range) */
  externalShowOpenLevels?: boolean;
  /** Show swing pivot high/low dots */
  externalShowPivots?: boolean;
  /** Show candle pattern labels (Doji, Hammer, Engulfing, etc.) */
  externalShowCandlePatterns?: boolean;
  /** Show auto Fibonacci retracement levels for dominant viewport swing */
  externalShowAutoFib?: boolean;
  /** Show session range boxes (Asia/London/NY H/L rectangles) */
  externalShowSessionRanges?: boolean;
  /** Callback when price scale changes internally (context menu or status bar) */
  onPriceScaleModeChange?: (mode: "linear" | "log" | "percent") => void;
  /** Callback to add a price alert from the chart context menu */
  onAddAlert?: (price: number, direction: 'above' | 'below') => void;
  /** Callback to open a workspace panel from the chart context menu */
  onOpenPanel?: (panel: 'ai' | 'alerts') => void;
  /** Open paper positions for the current symbol — rendered as entry/SL/TP lines */
  externalTradeLevels?: import('./renderers/priceLine').TradeLevel[];
  /** Enable crosshair position sync across multi-chart panes via CustomEvent bus */
  syncCrosshair?: boolean;
  /** Called when a horizontal swipe gesture is detected on the chart (mobile) */
  onSwipeTimeframe?: (direction: 'left' | 'right') => void;
}

const DEFAULT_CONFIG: ChartIndicatorConfig = {
  sma20: false, sma50: false, sma200: false,
  ema20: true, ema50: false,
  hma9: false, tema20: false, vwap: false,
  bollinger: false, keltner: false, ichimoku: false, donchian: false,
  volumeProfile: false,
  sr: true, fvg: false, trendlines: true, marketStructure: false, patterns: false,
  orderBlocks: false, liqZones: false,
  pivotPoints: false, parabolicSAR: false,
  // New overlays
  wma: false, smma: false, alma: false, dema: false, lsma: false,
  mcginley: false, vwma: false, envelope: false, supertrend: false,
  chandelierExit: false, chandeKrollStop: false, alligator: false,
  zigzag: false, autoFib: false, maRibbon: false,
  // New subpanes (all false by default)
  ao: false, bop: false, bbtrend: false, bullBearPower: false,
  chaikinOsc: false, cmo: false, choppiness: false, chopZone: false,
  connorsRSI: false, coppock: false, dpo: false, eom: false, efi: false,
  fisher: false, klinger: false, kst: false, massIndex: false,
  momentum: false, ppo: false, roc: false, rvi: false,
  smi: false, trix: false, tsi: false, ultimateOscillator: false,
  vortex: false, aroon: false,
  adl: false, cvd: false, cvi: false, netVolume: false,
  pvt: false, volumeOscillator: false,
  bbPercentB: false, bbWidth: false, histVol: false,
  correlation: false, adr: false,
};

// IndicatorBundle type is defined in and re-exported from ChartRenderer
type IndicatorBundle = IndicatorBundleType;

const EMPTY_BUNDLE: IndicatorBundle = {
  overlayLines: [], bands: [], vwap: [], vwapBands: [], vwapBands2: [], vwapBands3: [], ichimoku: [],
  parabolicSAR: [], pivotPoints: null, volumeProfile: null,
  subPaneData: {}, sr: [], fvg: [], orderBlocks: [], liqZones: [], trend: [],
  supertrend: [], chandelierExit: [], chandeKrollStop: [],
  alligator: [], zigzag: [], autoFib: null, maRibbon: [],
  maRibbonShowFill: true,
  supertrendCfg: { showArrows: true, showFill: false, showLabel: true },
  chandelierShowArrows: true,
  marketStructure: null,
  patterns: null,
  volCone: null,
  rsiDivergences: [],
  macdDivergences: [],
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
  marketStructure: { label: "Market Structure", color: "#26A69A" },
  patterns: { label: "Patterns", color: "#9598A1" },
  pivotPoints: { label: "Pivot Pts", color: "#9598A1" },
  parabolicSAR: { label: "SAR", color: "#26A69A" },
  wma: { label: "WMA(20)", color: "#FF9800" },
  smma: { label: "SMMA(20)", color: "#FF7043" },
  alma: { label: "ALMA(21)", color: "#AB47BC" },
  dema: { label: "DEMA(20)", color: "#26C6DA" },
  lsma: { label: "LSMA(25)", color: "#66BB6A" },
  mcginley: { label: "McGinley(14)", color: "#FFA726" },
  vwma: { label: "VWMA(20)", color: "#EC407A" },
  envelope: { label: "ENV(20,2.5)", color: "#78909C" },
  supertrend: { label: "SuperTrend(10,3)", color: "#26A69A" },
  chandelierExit: { label: "CE(22,3)", color: "#26A69A" },
  chandeKrollStop: { label: "CKS", color: "#EF5350" },
  alligator: { label: "Alligator", color: "#2962FF" },
  zigzag: { label: "ZigZag", color: "#FFD54F" },
  autoFib: { label: "AutoFib", color: "#26A69A" },
  maRibbon: { label: "MA Ribbon", color: "#EF5350" },
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
  ao: { label: "AO", color: "#26A69A" },
  bop: { label: "BOP", color: "#9E9E9E" },
  bbtrend: { label: "BBTrend", color: "#2196F3" },
  bullBearPower: { label: "Bull/Bear Power", color: "#26A69A" },
  chaikinOsc: { label: "Chaikin Osc", color: "#00BCD4" },
  cmo: { label: "CMO(14)", color: "#FF6D00" },
  choppiness: { label: "Choppiness(14)", color: "#9E9E9E" },
  chopZone: { label: "Chop Zone", color: "#9E9E9E" },
  connorsRSI: { label: "CRSI", color: "#7B1FA2" },
  coppock: { label: "Coppock", color: "#FF9800" },
  dpo: { label: "DPO(21)", color: "#FF4081" },
  eom: { label: "EOM(14)", color: "#9E9E9E" },
  efi: { label: "EFI(13)", color: "#9E9E9E" },
  fisher: { label: "Fisher", color: "#E91E63" },
  klinger: { label: "Klinger", color: "#2196F3" },
  kst: { label: "KST", color: "#FF9800" },
  massIndex: { label: "Mass Index", color: "#9C27B0" },
  momentum: { label: "Momentum(10)", color: "#26C6DA" },
  ppo: { label: "PPO", color: "#2962FF" },
  roc: { label: "ROC(9)", color: "#00BCD4" },
  rvi: { label: "RVI(10)", color: "#26C6DA" },
  smi: { label: "SMI", color: "#00E676" },
  trix: { label: "TRIX(18)", color: "#FF4081" },
  tsi: { label: "TSI", color: "#7B1FA2" },
  ultimateOscillator: { label: "UO(7,14,28)", color: "#FF9800" },
  vortex: { label: "Vortex(14)", color: "#26C6DA" },
  aroon: { label: "Aroon(25)", color: "#26C6DA" },
  adl: { label: "ADL", color: "#FF9800" },
  cvd: { label: "CVD", color: "#26C6DA" },
  cvi: { label: "CVI(10)", color: "#FF6D00" },
  netVolume: { label: "Net Vol", color: "#26A69A" },
  pvt: { label: "PVT", color: "#E91E63" },
  volumeOscillator: { label: "Vol Osc", color: "#FF9800" },
  bbPercentB: { label: "BB %B", color: "#2196F3" },
  bbWidth: { label: "BB Width", color: "#FF9800" },
  histVol: { label: "Hist Vol", color: "#7B1FA2" },
  correlation: { label: "Correlation", color: "#26A69A" },
  adr: { label: "ADR(14)", color: "#FFD54F" },
};

/* ═══════════════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════════════ */

function ChartEngineInner({
  bars, pair, interval, source, loading, error, onPairChange,
  embedded, externalConfig, externalSubPanes, externalChartType,
  externalDrawingMode, externalMagnetEnabled, externalHideDrawings,
  externalLockDrawings, externalDeleteAllDrawings,
  onConfigChange, onSubPanesChange, onDrawingModeChange, onChartTypeChange, onObjectSelect, onObjectData,
  externalSessions, externalScreenshotTrigger, externalCopyImageTrigger, externalBacktestMarkers, externalDrawingUpdate, externalAlertLevels,
  externalPriceScaleMode, externalShowPrevLevels, externalShowOpenLevels, externalShowPivots, externalShowCandlePatterns, externalShowAutoFib, externalShowSessionRanges, onPriceScaleModeChange,
  onAddAlert, onOpenPanel, externalTradeLevels, syncCrosshair, onSwipeTimeframe,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const outerRef = useRef<HTMLDivElement>(null);

  // High-frequency state via refs (60fps, no React re-render)
  const zoomRef = useRef<ZoomPanState>(
    createInitialZoomState(bars.length, Math.min(200, bars.length)),
  );
  const crosshairRef = useRef<CrosshairState>({ x: 0, y: 0, visible: false, snapIndex: 0 });
  const instanceIdRef = useRef(`chart-${Math.random().toString(36).slice(2, 9)}`);
  const externalCrosshairTsRef = useRef<number | null>(null);
  const renderRef = useRef<() => void>(() => {});
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
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; open: boolean; price: number }>({ x: 0, y: 0, open: false, price: 0 });
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

  // D7: Multi-select, copy/paste, alerts
  const [selectedDrawingIds, setSelectedDrawingIds] = useState<string[]>([]);
  const selectedDrawingIdsRef = useRef<string[]>([]);
  const clipboardRef = useRef<Drawing[]>([]);
  const importFileRef = useRef<HTMLInputElement>(null);
  const [alertToasts, setAlertToasts] = useState<{ id: string; msg: string }[]>([]);

  useEffect(() => { selectedDrawingIdsRef.current = selectedDrawingIds; }, [selectedDrawingIds]);

  // Drawing tool refs (avoid stale closures in pointer handlers)
  const drawingModeRef = useRef<DrawingType | null>(drawingMode);
  const drawingPointsRef = useRef<{ index: number; price: number }[]>(drawingPoints);
  const drawingsRef = useRef<Drawing[]>(drawings);
  useEffect(() => { drawingModeRef.current = drawingMode; }, [drawingMode]);
  useEffect(() => { drawingPointsRef.current = drawingPoints; }, [drawingPoints]);
  useEffect(() => { drawingsRef.current = drawings; }, [drawings]);

  // ── Embedded mode: use external state when provided ────────────────────────
  const effectiveConfig = externalConfig ? { ...config, ...externalConfig } : config;
  const effectiveSubPanes = externalSubPanes ?? activeSubPanes;
  const effectiveChartType = externalChartType ?? chartType;
  const effectiveDrawingMode = externalDrawingMode !== undefined ? externalDrawingMode : drawingMode;
  const effectivePriceScale = externalPriceScaleMode ?? priceScale;
  const effectiveShowPrevLevels = externalShowPrevLevels ?? false;

  // Sync external config changes to internal state
  useEffect(() => {
    if (externalConfig) setConfig(prev => ({ ...prev, ...externalConfig } as ChartIndicatorConfig));
  }, [externalConfig]);
  useEffect(() => {
    if (externalSubPanes) setActiveSubPanes(externalSubPanes);
  }, [externalSubPanes]);
  useEffect(() => {
    if (externalChartType) setChartType(externalChartType);
  }, [externalChartType]);
  useEffect(() => {
    if (externalDrawingMode !== undefined) setDrawingMode(externalDrawingMode);
  }, [externalDrawingMode]);

  // ── External magnet / hide / lock / delete-all ─────────────────────────────
  const magnetEnabledRef = useRef(externalMagnetEnabled ?? true);
  useEffect(() => { magnetEnabledRef.current = externalMagnetEnabled ?? true; }, [externalMagnetEnabled]);

  const hideDrawingsRef = useRef(externalHideDrawings ?? false);
  useEffect(() => { hideDrawingsRef.current = externalHideDrawings ?? false; }, [externalHideDrawings]);

  const lockDrawingsRef = useRef(externalLockDrawings ?? false);
  useEffect(() => { lockDrawingsRef.current = externalLockDrawings ?? false; }, [externalLockDrawings]);

  const onSwipeTimeframeRef = useRef(onSwipeTimeframe);
  useEffect(() => { onSwipeTimeframeRef.current = onSwipeTimeframe; }, [onSwipeTimeframe]);

  // Delete all drawings when trigger counter increments
  useEffect(() => {
    if (externalDeleteAllDrawings && externalDeleteAllDrawings > 0) {
      setDrawings([]);
      saveDrawings(pair, []);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalDeleteAllDrawings]);

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
  // Touch hit override: stores the result of a touch-scaled hit test so handleMouseDown
  // can use it instead of re-running with small desktop thresholds.
  const touchHitOverrideRef = useRef<HitTestResult | null>(null);
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

  // Stable price ref — updated when bars change, used to size price axis without
  // adding bars to the layout memo (avoids layout recompute on every live tick)
  const latestClosePriceRef = useRef(100);
  useEffect(() => {
    if (bars.length > 0) latestClosePriceRef.current = bars[bars.length - 1].c;
  }, [bars]);

  // Layout (left toolbar adds 40px)
  const LEFT_TOOLBAR_WIDTH = 40;
  const layout = useMemo(() => {
    // Dynamic price axis width: measure widest label for this pair/price magnitude
    // IBM Plex Mono 11px ≈ 7px per char; 13px total padding
    const sampleLabel = formatPrice(latestClosePriceRef.current, pair);
    const axisW = Math.max(50, sampleLabel.length * 7 + 13);
    return computeLayout(dimensions.w, dimensions.h, effectiveSubPanes.length, axisW);
  }, [dimensions.w, dimensions.h, effectiveSubPanes.length, pair]);

  // Helper: get param value with fallback to schema default
  const p = useCallback((id: string, key: string, fallback: number): number => {
    return indicatorParams[id]?.[key] ?? fallback;
  }, [indicatorParams]);

  // Indicators (memoized, driven by indicatorParams)
  const indicators = useMemo((): IndicatorBundle => {
    if (bars.length < 5) return EMPTY_BUNDLE;

    const overlayLines: IndicatorBundle["overlayLines"] = [];
    if (effectiveConfig.sma20) overlayLines.push({ points: computeSMA(bars, p("sma20", "period", 20)), color: THEME.sma1Color, label: formatIndicatorLabel("sma20", { period: p("sma20", "period", 20) }), thickness: p("sma20", "thickness", 1.5), priceColored: p("sma20", "priceColor", 0) !== 0 });
    if (effectiveConfig.sma50) overlayLines.push({ points: computeSMA(bars, p("sma50", "period", 50)), color: THEME.sma2Color, label: formatIndicatorLabel("sma50", { period: p("sma50", "period", 50) }), thickness: p("sma50", "thickness", 1.5), priceColored: p("sma50", "priceColor", 0) !== 0 });
    if (effectiveConfig.sma200) overlayLines.push({ points: computeSMA(bars, p("sma200", "period", 200)), color: "#FF5252", label: formatIndicatorLabel("sma200", { period: p("sma200", "period", 200) }), thickness: p("sma200", "thickness", 1.5), priceColored: p("sma200", "priceColor", 0) !== 0 });
    if (effectiveConfig.ema20) overlayLines.push({ points: computeEMA(bars, p("ema20", "period", 20)), color: THEME.emaColor, label: formatIndicatorLabel("ema20", { period: p("ema20", "period", 20) }), thickness: p("ema20", "thickness", 1.5), priceColored: p("ema20", "priceColor", 0) !== 0 });
    if (effectiveConfig.ema50) overlayLines.push({ points: computeEMA(bars, p("ema50", "period", 50)), color: "#00E676", label: formatIndicatorLabel("ema50", { period: p("ema50", "period", 50) }), thickness: p("ema50", "thickness", 1.5), priceColored: p("ema50", "priceColor", 0) !== 0 });
    if (effectiveConfig.hma9) overlayLines.push({ points: computeHMA(bars, p("hma9", "period", 9)), color: "#00E676", label: formatIndicatorLabel("hma9", { period: p("hma9", "period", 9) }), thickness: p("hma9", "thickness", 1.5), priceColored: p("hma9", "priceColor", 0) !== 0 });
    if (effectiveConfig.tema20) overlayLines.push({ points: computeTEMA(bars, p("tema20", "period", 20)), color: "#FF4081", label: formatIndicatorLabel("tema20", { period: p("tema20", "period", 20) }), thickness: p("tema20", "thickness", 1.5), priceColored: p("tema20", "priceColor", 0) !== 0 });
    if (effectiveConfig.wma) overlayLines.push({ points: computeWMA(bars, p("wma", "period", 20)), color: "#FF9800", label: formatIndicatorLabel("wma", { period: p("wma", "period", 20) }), thickness: p("wma", "thickness", 1.5), priceColored: p("wma", "priceColor", 0) !== 0 });
    if (effectiveConfig.smma) overlayLines.push({ points: computeSMMA(bars, p("smma", "period", 20)), color: "#FF7043", label: formatIndicatorLabel("smma", { period: p("smma", "period", 20) }), thickness: p("smma", "thickness", 1.5), priceColored: p("smma", "priceColor", 0) !== 0 });
    if (effectiveConfig.alma) overlayLines.push({ points: computeALMA(bars, p("alma", "period", 21), p("alma", "sigma", 6), p("alma", "offset", 0.85)), color: "#AB47BC", label: formatIndicatorLabel("alma", { period: p("alma", "period", 21), sigma: p("alma", "sigma", 6), offset: p("alma", "offset", 0.85) }), thickness: p("alma", "thickness", 1.5), priceColored: p("alma", "priceColor", 0) !== 0 });
    if (effectiveConfig.dema) overlayLines.push({ points: computeDEMA(bars, p("dema", "period", 20)), color: "#26C6DA", label: formatIndicatorLabel("dema", { period: p("dema", "period", 20) }), thickness: p("dema", "thickness", 1.5), priceColored: p("dema", "priceColor", 0) !== 0 });
    if (effectiveConfig.lsma) overlayLines.push({ points: computeLSMA(bars, p("lsma", "period", 25)), color: "#66BB6A", label: formatIndicatorLabel("lsma", { period: p("lsma", "period", 25) }), thickness: p("lsma", "thickness", 1.5), priceColored: p("lsma", "priceColor", 0) !== 0 });
    if (effectiveConfig.mcginley) overlayLines.push({ points: computeMcGinley(bars, p("mcginley", "period", 14)), color: "#FFA726", label: formatIndicatorLabel("mcginley", { period: p("mcginley", "period", 14) }), thickness: p("mcginley", "thickness", 1.5), priceColored: p("mcginley", "priceColor", 0) !== 0 });
    if (effectiveConfig.vwma) overlayLines.push({ points: computeVWMA(bars, p("vwma", "period", 20)), color: "#EC407A", label: formatIndicatorLabel("vwma", { period: p("vwma", "period", 20) }), thickness: p("vwma", "thickness", 1.5), priceColored: p("vwma", "priceColor", 0) !== 0 });

    const bandsList: IndicatorBundle["bands"] = [];
    if (effectiveConfig.bollinger) {
      const bbPeriod = p("bollinger", "period", 20);
      const bbStdDev = p("bollinger", "stdDev", 2);
      const bbSrc = p("bollinger", "source", 0);
      const bbSqueeze = p("bollinger", "showSqueeze", 1) !== 0;
      bandsList.push({ points: computeBollinger(bars, bbPeriod, bbStdDev, bbSrc), fill: THEME.bbFill, line: THEME.bbLine, label: formatIndicatorLabel("bollinger", { period: bbPeriod, stdDev: bbStdDev }), type: "bollinger", showSqueeze: bbSqueeze });
    }
    if (effectiveConfig.keltner) {
      const kcEma = p("keltner", "emaPeriod", 20);
      const kcAtr = p("keltner", "atrPeriod", 10);
      const kcMult = p("keltner", "multiplier", 1.5);
      bandsList.push({ points: computeKeltner(bars, kcEma, kcAtr, kcMult), fill: THEME.kcFill, line: THEME.kcLine, label: formatIndicatorLabel("keltner", { emaPeriod: kcEma, atrPeriod: kcAtr, multiplier: kcMult }) });
    }
    if (effectiveConfig.donchian) {
      const dcPeriod = p("donchian", "period", 20);
      const dcBreakout = p("donchian", "showBreakout", 1) !== 0;
      bandsList.push({ points: computeDonchian(bars, dcPeriod), fill: "rgba(0,188,212,0.06)", line: "#00BCD4", label: formatIndicatorLabel("donchian", { period: dcPeriod }), type: "donchian", showBreakout: dcBreakout });
    }
    if (effectiveConfig.envelope) {
      const envPeriod = p("envelope", "period", 20);
      const envPct = p("envelope", "percent", 2.5);
      bandsList.push({ points: computeEnvelope(bars, envPeriod, envPct), fill: "rgba(120,144,156,0.06)", line: "#78909C", label: formatIndicatorLabel("envelope", { period: envPeriod, percent: envPct }) });
    }

    const vwap = effectiveConfig.vwap ? computeVWAP(bars) : [];
    const vwapNumBands = effectiveConfig.vwap ? p("vwap", "showBands", 0) : 0;
    const vwapBands  = vwapNumBands >= 1 ? computeVWAPBands(bars, 1) : [];
    const vwapBands2 = vwapNumBands >= 2 ? computeVWAPBands(bars, 2) : [];
    const vwapBands3 = vwapNumBands >= 3 ? computeVWAPBands(bars, 3) : [];
    const ichimoku = effectiveConfig.ichimoku ? computeIchimoku(bars, p("ichimoku", "tenkan", 9), p("ichimoku", "kijun", 26), p("ichimoku", "senkouB", 52)) : [];
    const parabolicSAR = effectiveConfig.parabolicSAR ? computeParabolicSAR(bars, p("parabolicSAR", "afStart", 0.02), p("parabolicSAR", "afMax", 0.2)) : [];
    const pivotPointsArr = effectiveConfig.pivotPoints ? computePivotPoints(bars) : [];
    const pivotPoints = pivotPointsArr.length > 0 ? pivotPointsArr[pivotPointsArr.length - 1] : null;
    const volumeProfile = effectiveConfig.volumeProfile ? computeVolumeProfile(bars, p("volumeProfile", "numLevels", 50)) : null;

    const supertrend = effectiveConfig.supertrend ? computeSuperTrend(bars, p("supertrend", "period", 10), p("supertrend", "multiplier", 3)) : [];
    const supertrendCfg = { showArrows: p("supertrend", "showArrows", 1) !== 0, showFill: p("supertrend", "showFill", 0) !== 0, showLabel: p("supertrend", "showLabel", 1) !== 0 };
    const chandelierExit = effectiveConfig.chandelierExit ? computeChandelierExit(bars, p("chandelierExit", "period", 22), p("chandelierExit", "multiplier", 3)) : [];
    const chandelierShowArrows = p("chandelierExit", "showArrows", 1) !== 0;
    const chandeKrollStop = effectiveConfig.chandeKrollStop ? computeChandeKrollStop(bars, p("chandeKrollStop", "p", 10), p("chandeKrollStop", "q", 9), p("chandeKrollStop", "x", 1.5)) : [];
    const alligator = effectiveConfig.alligator ? computeAlligator(bars) : [];
    const zigzag = effectiveConfig.zigzag ? computeZigzag(bars, p("zigzag", "deviation", 5)) : [];
    const autoFib = effectiveConfig.autoFib ? computeAutoFib(bars, p("autoFib", "lookback", 50)) : null;
    const maRibbon = effectiveConfig.maRibbon ? computeMARibbon(bars) : [];
    const maRibbonShowFill = !!effectiveConfig.maRibbon && p("maRibbon", "showFill", 1) !== 0;

    const subPaneData: Record<string, unknown> = {};
    for (const sp of effectiveSubPanes) {
      switch (sp) {
        case "rsi": {
          const rsiPeriod = p("rsi", "period", 14);
          const rsiSigPer = p("rsi", "signalPeriod", 0);
          const RSI_SOURCES: RSISource[] = ["close", "hlc3", "hl2", "ohlc4", "hl2c3"];
          const rsiSrc = RSI_SOURCES[p("rsi", "source", 0)] ?? "close";
          const rsiPts = computeRSI(bars, rsiPeriod, rsiSrc);
          const rsiSig: IndicatorPoint[] = rsiSigPer > 0 && rsiPts.length >= rsiSigPer
            ? emaFromValues(rsiPts.map(pt => pt.value), rsiSigPer)
                .map((v, i) => ({ t: rsiPts[i + rsiSigPer - 1].t, value: v }))
            : [];
          const rsiDivLines = detectDivergence(bars, rsiPts, 5);
          subPaneData.rsi = { points: rsiPts, signal: rsiSig, obLevel: p("rsi", "obLevel", 70), osLevel: p("rsi", "osLevel", 30), period: rsiPeriod, divergences: rsiDivLines } as RSISubPane;
          break;
        }
        case "macd": {
          const macdPts = computeMACD(bars, p("macd", "fast", 12), p("macd", "slow", 26), p("macd", "signal", 9));
          subPaneData.macd = macdPts;
          subPaneData._macdDivergences = detectDivergence(bars, macdPts.map((pt: { t: number; macd: number }) => ({ t: pt.t, value: pt.macd })), 5);
          break;
        }
        case "stochastic": subPaneData.stochastic = { points: computeStochastic(bars, p("stochastic", "kPeriod", 14), p("stochastic", "dPeriod", 3)), obLevel: p("stochastic", "obLevel", 80), osLevel: p("stochastic", "osLevel", 20) } as StochSubPane; break;
        case "stochRSI": subPaneData.stochRSI = { points: computeStochRSI(bars, p("stochRSI", "rsiPeriod", 14), p("stochRSI", "stochPeriod", 14), p("stochRSI", "kSmooth", 3), p("stochRSI", "dSmooth", 3)), obLevel: p("stochRSI", "obLevel", 80), osLevel: p("stochRSI", "osLevel", 20) } as StochSubPane; break;
        case "williamsR": subPaneData.williamsR = { points: computeWilliamsR(bars, p("williamsR", "period", 14)), obLevel: p("williamsR", "obLevel", -20), osLevel: p("williamsR", "osLevel", -80) } as WilliamsRSubPane; break;
        case "cci": subPaneData.cci = { points: computeCCI(bars, p("cci", "period", 20)), obLevel: p("cci", "obLevel", 100), osLevel: p("cci", "osLevel", -100) } as CCISubPane; break;
        case "adx": subPaneData.adx = { points: computeADX(bars, p("adx", "period", 14)), threshold: p("adx", "threshold", 25), showPlusDI: p("adx", "showPlusDI", 1) !== 0, showMinusDI: p("adx", "showMinusDI", 1) !== 0, showADX: p("adx", "showADX", 1) !== 0 } as ADXSubPane; break;
        case "atr": {
          const atrPeriod = p("atr", "period", 14);
          const atrPct = p("atr", "percentMode", 0) !== 0;
          const atrMaPer = p("atr", "maPeriod", 0);
          const rawATR = computeATR(bars, atrPeriod);
          const atrOffset = atrPeriod - 1;
          const atrPts: IndicatorPoint[] = rawATR.map((v, i) => ({
            t: bars[atrOffset + i].t,
            value: atrPct ? (v / bars[atrOffset + i].c) * 100 : v,
          }));
          const atrMa: IndicatorPoint[] = atrMaPer > 0 && atrPts.length >= atrMaPer
            ? (() => {
                const ma: IndicatorPoint[] = [];
                let sum = 0;
                for (let i = 0; i < atrMaPer; i++) sum += atrPts[i].value;
                for (let i = atrMaPer - 1; i < atrPts.length; i++) {
                  if (i >= atrMaPer) sum += atrPts[i].value - atrPts[i - atrMaPer].value;
                  ma.push({ t: atrPts[i].t, value: sum / atrMaPer });
                }
                return ma;
              })()
            : [];
          subPaneData.atr = { points: atrPts, ma: atrMa, percentMode: atrPct, period: atrPeriod } as ATRSubPane;
          break;
        }
        case "obv": subPaneData.obv = computeOBV(bars); break;
        case "mfi": subPaneData.mfi = computeMFI(bars, p("mfi", "period", 14)); break;
        case "cmf": subPaneData.cmf = computeCMF(bars, p("cmf", "period", 20)); break;
        case "ao": subPaneData.ao = computeAO(bars); break;
        case "bop": subPaneData.bop = computeBOP(bars); break;
        case "bbtrend": subPaneData.bbtrend = computeBBTrend(bars, p("bbtrend", "period", 20)); break;
        case "bullBearPower": subPaneData.bullBearPower = computeBullBearPower(bars, p("bullBearPower", "period", 13)); break;
        case "chaikinOsc": subPaneData.chaikinOsc = computeChaikinOscillator(bars, p("chaikinOsc", "fastPeriod", 3), p("chaikinOsc", "slowPeriod", 10)); break;
        case "cmo": subPaneData.cmo = computeCMO(bars, p("cmo", "period", 14)); break;
        case "choppiness": subPaneData.choppiness = computeChoppiness(bars, p("choppiness", "period", 14)); break;
        case "chopZone": subPaneData.chopZone = computeChopZone(bars, p("chopZone", "period", 30)); break;
        case "connorsRSI": subPaneData.connorsRSI = computeConnorsRSI(bars, p("connorsRSI", "rsiPeriod", 3), p("connorsRSI", "upDownPeriod", 2), p("connorsRSI", "rocPeriod", 100)); break;
        case "coppock": subPaneData.coppock = computeCoppock(bars); break;
        case "dpo": subPaneData.dpo = computeDPO(bars, p("dpo", "period", 21)); break;
        case "eom": subPaneData.eom = computeEOM(bars, p("eom", "period", 14)); break;
        case "efi": subPaneData.efi = computeEFI(bars, p("efi", "period", 13)); break;
        case "fisher": subPaneData.fisher = computeFisher(bars, p("fisher", "period", 9)); break;
        case "klinger": subPaneData.klinger = computeKlinger(bars, p("klinger", "shortPeriod", 34), p("klinger", "longPeriod", 55), p("klinger", "signalPeriod", 13)); break;
        case "kst": subPaneData.kst = computeKST(bars); break;
        case "massIndex": subPaneData.massIndex = computeMassIndex(bars, p("massIndex", "emaPeriod", 9), p("massIndex", "sumPeriod", 25)); break;
        case "momentum": subPaneData.momentum = computeMomentum(bars, p("momentum", "period", 10)); break;
        case "ppo": subPaneData.ppo = computePPO(bars, p("ppo", "fastPeriod", 12), p("ppo", "slowPeriod", 26), p("ppo", "signalPeriod", 9)); break;
        case "roc": subPaneData.roc = computeROC(bars, p("roc", "period", 9)); break;
        case "rvi": subPaneData.rvi = computeRVI(bars, p("rvi", "period", 10)); break;
        case "smi": subPaneData.smi = computeSMI(bars, p("smi", "tsiPeriod", 5), p("smi", "ema1Period", 20), p("smi", "ema2Period", 5)); break;
        case "trix": subPaneData.trix = computeTRIX(bars, p("trix", "period", 18)); break;
        case "tsi": subPaneData.tsi = computeTSI(bars, p("tsi", "longPeriod", 25), p("tsi", "shortPeriod", 13), p("tsi", "signalPeriod", 13)); break;
        case "ultimateOscillator": subPaneData.ultimateOscillator = computeUltimateOscillator(bars, p("ultimateOscillator", "period1", 7), p("ultimateOscillator", "period2", 14), p("ultimateOscillator", "period3", 28)); break;
        case "vortex": subPaneData.vortex = computeVortex(bars, p("vortex", "period", 14)); break;
        case "aroon": subPaneData.aroon = computeAroon(bars, p("aroon", "period", 25)); break;
        case "adl": subPaneData.adl = computeADL(bars); break;
        case "cvd": subPaneData.cvd = computeCVD(bars); break;
        case "cvi": subPaneData.cvi = computeCVI(bars, p("cvi", "period", 10)); break;
        case "netVolume": subPaneData.netVolume = computeNetVolume(bars); break;
        case "pvt": subPaneData.pvt = computePVT(bars); break;
        case "volumeOscillator": subPaneData.volumeOscillator = computeVolumeOscillator(bars, p("volumeOscillator", "fastPeriod", 5), p("volumeOscillator", "slowPeriod", 10)); break;
        case "bbPercentB": subPaneData.bbPercentB = computeBBPercentB(bars, p("bbPercentB", "period", 20), p("bbPercentB", "stdDev", 2)); break;
        case "bbWidth": subPaneData.bbWidth = computeBBWidth(bars, p("bbWidth", "period", 20), p("bbWidth", "stdDev", 2)); break;
        case "histVol": subPaneData.histVol = computeHistoricalVolatility(bars, p("histVol", "period", 20)); break;
        case "correlation": subPaneData.correlation = computeCorrelation(bars, p("correlation", "period", 14)); break;
        case "adr": subPaneData.adr = computeADR(bars, p("adr", "period", 14)); break;
      }
    }

    const sr = effectiveConfig.sr ? detectSupportResistance(bars) : [];
    const fvg = effectiveConfig.fvg ? detectFVG(bars) : [];
    const orderBlocks = effectiveConfig.orderBlocks ? detectOrderBlocks(bars) : [];
    const liqZones = effectiveConfig.liqZones ? detectLiquidityZones(bars) : [];
    const trend = effectiveConfig.trendlines ? detectTrendlines(bars) : [];
    const marketStructure: MarketStructureData | null = effectiveConfig.marketStructure ? detectMarketStructure(bars) : null;
    const patterns: ChartPatternData | null = effectiveConfig.patterns ? detectPatterns(bars) : null;

    // Extract divergences computed inside the sub-pane switch
    const rsiDivergences: DivergenceLine[] = (subPaneData.rsi as { divergences?: DivergenceLine[] } | undefined)?.divergences ?? [];
    const macdDivergences: DivergenceLine[] = (subPaneData._macdDivergences as DivergenceLine[] | undefined) ?? [];
    delete subPaneData._macdDivergences; // clean up temp key

    // Volatility Cone: auto-derived when histVol sub-pane is active
    let volCone: VolatilityConeData | null = null;
    if (effectiveSubPanes.includes("histVol") && bars.length > 20) {
      const hvPoints = subPaneData.histVol as { t: number; value: number }[] | undefined;
      if (hvPoints && hvPoints.length > 0) {
        const lastHV = hvPoints[hvPoints.length - 1].value;
        const bpyMap: Record<string, number> = { "1D": 252, "1W": 52, "1M": 12 };
        const barsPerYear = bpyMap[interval] ?? 252;
        volCone = {
          anchorIdx: bars.length - 1,
          anchorPrice: bars[bars.length - 1].c,
          annualHV: lastHV,
          barsPerYear,
          forwardBars: Math.min(20, Math.floor(bars.length * 0.08)),
        };
      }
    }

    return { overlayLines, bands: bandsList, vwap, vwapBands, vwapBands2, vwapBands3, ichimoku, parabolicSAR, pivotPoints, volumeProfile, subPaneData, sr, fvg, orderBlocks, liqZones, trend, supertrend, supertrendCfg, chandelierExit, chandelierShowArrows, chandeKrollStop, alligator, zigzag, autoFib, maRibbon, maRibbonShowFill, marketStructure, patterns, volCone, rsiDivergences, macdDivergences };
  }, [bars, interval, effectiveConfig, effectiveSubPanes, indicatorParams, p]);

  // Load drawings
  useEffect(() => {
    const loaded = loadDrawings(pair);
    setDrawings(loaded);
    setUndoStack([loaded]);
    setRedoStack([]);
  }, [pair]);

  // Reset zoom when bars data changes (new symbol or timeframe)
  useEffect(() => {
    if (bars.length > 0) {
      zoomRef.current = createInitialZoomState(bars.length, Math.min(200, bars.length));
      priceZoomRef.current = 1.0;
    }
  }, [bars]);

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

  /* ─── Touch events (mobile pan + pinch-to-zoom) ─── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let lastTouchX = 0;
    let lastTouchY = 0;
    let pinchDist0 = 0;   // initial pinch distance
    let touchDrawingStarted = false;
    let touchDragStarted = false;
    let swipeStartX = 0, swipeStartY = 0, swipeStartTime = 0, wasPinch = false;

    function dist(a: Touch, b: Touch) {
      const dx = a.clientX - b.clientX;
      const dy = a.clientY - b.clientY;
      return Math.sqrt(dx * dx + dy * dy);
    }

    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      if (e.touches.length === 1) {
        const t = e.touches[0];
        // Drawing mode: place point 1 immediately (mousedown + mouseup enters preview mode)
        if (drawingModeRef.current) {
          touchDrawingStarted = true;
          touchDragStarted = false;
          canvas.dispatchEvent(new MouseEvent('mousedown', {
            clientX: t.clientX, clientY: t.clientY,
            bubbles: true, cancelable: true, button: 0,
          }));
          canvas.dispatchEvent(new MouseEvent('mouseup', {
            clientX: t.clientX, clientY: t.clientY,
            bubbles: true, cancelable: true, button: 0,
          }));
          return;
        }
        const x = t.clientX - rect.left;
        const y = t.clientY - rect.top;

        // Check if touching near a drawing handle for drag (2.5x hit radius for finger precision)
        const vp0 = computeViewport(bars, zoomRef.current.startIndex, zoomRef.current.endIndex);
        const hitHandle = hitTestDrawings(x, y, drawingsRef.current, layout, vp0, effectivePriceScale, 3.5);
        if (hitHandle) {
          touchDragStarted = true;
          touchDrawingStarted = false;
          touchHitOverrideRef.current = hitHandle;
          canvas.dispatchEvent(new MouseEvent('mousedown', {
            clientX: t.clientX, clientY: t.clientY,
            bubbles: true, cancelable: true, button: 0,
          }));
          return;
        }

        // Axis drag-to-scale (same zones as desktop mousedown)
        const zone = detectMouseZone(
          x, y, layout.chartLeft, layout.chartWidth,
          layout.mainTop, layout.mainHeight,
          layout.priceAxisWidth, layout.timeAxisHeight,
          layout.canvasWidth, layout.canvasHeight,
        );
        if (zone === 'priceAxis' || zone === 'timeAxis') {
          const vp = computeViewport(bars, zoomRef.current.startIndex, zoomRef.current.endIndex);
          dragStartPriceZoom.current = priceZoomRef.current;
          axisDragRef.current = startAxisDrag(
            axisDragRef.current, zone, x, y,
            vp.priceMax - vp.priceMin,
            zoomRef.current.endIndex - zoomRef.current.startIndex,
          );
          return;
        }

        lastTouchX = x;
        lastTouchY = y;
        swipeStartX = t.clientX;
        swipeStartY = t.clientY;
        swipeStartTime = Date.now();
        wasPinch = false;
        zoomRef.current = handleDragStart(zoomRef.current, x, y);
      } else if (e.touches.length === 2) {
        // End any drag first
        axisDragRef.current = endAxisDrag(axisDragRef.current);
        zoomRef.current = handleDragEnd(zoomRef.current);
        pinchDist0 = dist(e.touches[0], e.touches[1]);
        wasPinch = true;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      if (e.touches.length === 1) {
        const t = e.touches[0];
        // Handle drag in progress — forward move events
        if (touchDragStarted) {
          canvas.dispatchEvent(new MouseEvent('mousemove', {
            clientX: t.clientX, clientY: t.clientY,
            bubbles: true, cancelable: true,
          }));
          return;
        }
        // Drawing mode: route move to drawing preview via synthetic mouse event
        if (drawingModeRef.current) {
          canvas.dispatchEvent(new MouseEvent('mousemove', {
            clientX: t.clientX, clientY: t.clientY,
            bubbles: true, cancelable: true,
          }));
          return;
        }
        const x = t.clientX - rect.left;
        const y = t.clientY - rect.top;

        // Axis drag in progress
        if (axisDragRef.current.isDragging) {
          const scales = moveAxisDrag(axisDragRef.current, x, y, layout.mainHeight, layout.chartWidth);
          if (axisDragRef.current.zone === 'timeAxis') {
            zoomRef.current = applyTimeScale(zoomRef.current, scales.timeScale, bars.length);
            axisDragRef.current = { ...axisDragRef.current, startX: x, startBarRange: zoomRef.current.endIndex - zoomRef.current.startIndex };
          } else if (axisDragRef.current.zone === 'priceAxis') {
            priceZoomRef.current = Math.max(0.1, Math.min(10, dragStartPriceZoom.current * scales.priceScale));
          }
          return;
        }

        const vp = computeViewport(bars, zoomRef.current.startIndex, zoomRef.current.endIndex);
        zoomRef.current = handleDragMove(zoomRef.current, x, layout.chartWidth, bars.length, y, layout.mainHeight, vp.priceMax - vp.priceMin);
        const snap = snapToBar(x, vp.startIndex, vp.endIndex, layout.chartLeft, layout.chartWidth, bars.length);
        crosshairRef.current = { x, y, visible: true, snapIndex: snap };
        lastTouchX = x;
        lastTouchY = y;
      } else if (e.touches.length === 2 && pinchDist0 > 0) {
        const d = dist(e.touches[0], e.touches[1]);
        const scale = d / pinchDist0;
        // Convert pinch scale to a synthetic wheel delta: scale>1 = zoom in (negative delta)
        const midX = ((e.touches[0].clientX + e.touches[1].clientX) / 2) - rect.left;
        const delta = (1 - scale) * 300; // tuned sensitivity
        zoomRef.current = zoomWheel(zoomRef.current, delta, midX, layout.chartLeft, layout.chartWidth, bars.length);
        pinchDist0 = d; // incremental
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 0) {
        // Complete drawing (place point 2) or release handle drag
        if (touchDrawingStarted && drawingModeRef.current) {
          const released = e.changedTouches[0];
          if (released) {
            canvas.dispatchEvent(new MouseEvent('mousedown', {
              clientX: released.clientX, clientY: released.clientY,
              bubbles: true, cancelable: true, button: 0,
            }));
          }
          touchDrawingStarted = false;
        }
        if (touchDragStarted) {
          const released = e.changedTouches[0];
          if (released) {
            canvas.dispatchEvent(new MouseEvent('mouseup', {
              clientX: released.clientX, clientY: released.clientY,
              bubbles: true, cancelable: true, button: 0,
            }));
          }
          touchDragStarted = false;
        }
        axisDragRef.current = endAxisDrag(axisDragRef.current);
        zoomRef.current = handleDragEnd(zoomRef.current);
        pinchDist0 = 0;
        // Swipe gesture → timeframe change (quick horizontal flick, not a draw/drag/pinch)
        if (!touchDrawingStarted && !touchDragStarted && !wasPinch && onSwipeTimeframeRef.current) {
          const released = e.changedTouches[0];
          if (released) {
            const dx = released.clientX - swipeStartX;
            const dy = released.clientY - swipeStartY;
            const elapsed = Date.now() - swipeStartTime;
            if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5 && elapsed < 400) {
              onSwipeTimeframeRef.current(dx > 0 ? 'right' : 'left');
            }
          }
        }
      } else if (e.touches.length === 1) {
        // One finger lifted from pinch — restart as single drag
        axisDragRef.current = endAxisDrag(axisDragRef.current);
        pinchDist0 = 0;
        const rect2 = canvas.getBoundingClientRect();
        const t = e.touches[0];
        lastTouchX = t.clientX - rect2.left;
        lastTouchY = t.clientY - rect2.top;
        zoomRef.current = handleDragStart(zoomRef.current, lastTouchX, lastTouchY);
      }
    };

    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchmove",  onTouchMove,  { passive: false });
    canvas.addEventListener("touchend",   onTouchEnd,   { passive: false });
    return () => {
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove",  onTouchMove);
      canvas.removeEventListener("touchend",   onTouchEnd);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, bars]);

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
          // Cancel drawing in progress or deselect
          if (effectiveDrawingMode) {
            setDrawingMode(null);
            drawingModeRef.current = null;
            setDrawingPoints([]);
            drawingPointsRef.current = [];
            setActiveTool("crosshair");
            onDrawingModeChange?.(null);
          } else if (selectedDrawingIds.length > 0) {
            setSelectedDrawingIds([]);
          } else if (selectedDrawingId) {
            setSelectedDrawingId(null);
            setDrawingPropsPanel(null);
          }
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
          onDrawingModeChange?.("trendline");
          break;
        case "drawHorizontal":
          setDrawingMode("horizontal");
          setActiveTool("horizontal");
          onDrawingModeChange?.("horizontal");
          break;
        case "drawFibonacci":
          setDrawingMode("fibonacci");
          setActiveTool("fibonacci");
          onDrawingModeChange?.("fibonacci");
          break;
        case "drawRectangle":
          setDrawingMode("rectangle");
          setActiveTool("rectangle");
          onDrawingModeChange?.("rectangle");
          break;
        case "deleteDrawing": {
          // Delete all multi-selected, or single selected, or last drawing
          const multiIds = selectedDrawingIdsRef.current;
          if (multiIds.length > 0) {
            const updated = drawings.filter(d => !multiIds.includes(d.id));
            pushDrawingState(updated);
            setSelectedDrawingIds([]);
            setSelectedDrawingId(null);
            setDrawingPropsPanel(null);
          } else if (selectedDrawingId) {
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
        case "copyDrawings": {
          const multiIds = selectedDrawingIdsRef.current;
          if (multiIds.length > 0) {
            clipboardRef.current = drawings.filter(d => multiIds.includes(d.id));
          } else if (selectedDrawingId) {
            const d = drawings.find(dr => dr.id === selectedDrawingId);
            clipboardRef.current = d ? [d] : [];
          }
          break;
        }
        case "pasteDrawings": {
          if (clipboardRef.current.length === 0) break;
          const pasted = clipboardRef.current.map(d => ({
            ...d,
            id: `${d.id}_paste_${Date.now()}`,
            points: d.points.map(p => ({ index: p.index + 10, price: p.price })),
          }));
          pushDrawingState([...drawings, ...pasted]);
          setSelectedDrawingIds(pasted.map(d => d.id));
          setSelectedDrawingId(null);
          break;
        }
        case "selectAllDrawings":
          setSelectedDrawingIds(drawings.map(d => d.id));
          setSelectedDrawingId(null);
          break;
        case "exportDrawings":
          handleExportDrawings();
          break;
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bars.length, pair, drawings, showSymbolSearch, showIndicatorDialog, selectedDrawingId, selectedDrawingIds, effectiveDrawingMode, onDrawingModeChange]);

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

  /* ─── D7: Export / Import drawings ─── */
  const handleExportDrawings = useCallback(() => {
    const json = JSON.stringify(drawingsRef.current, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `drawings_${pair}_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [pair]);

  const handleImportDrawings = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const imported = JSON.parse(ev.target?.result as string) as Drawing[];
        if (!Array.isArray(imported)) return;
        // Merge (append) — give each imported drawing a fresh ID to avoid collisions
        const remapped = imported.map(d => ({ ...d, id: `${d.id}_imp_${Date.now()}` }));
        pushDrawingState([...drawingsRef.current, ...remapped]);
      } catch {
        // Invalid JSON — silently ignore
      }
    };
    reader.readAsText(file);
    // Reset input so the same file can be re-imported
    e.target.value = "";
  }, [pushDrawingState]);

  /* ─── D7: Price-alert monitoring ─── */
  useEffect(() => {
    if (!bars.length) return;
    const currentPrice = bars[bars.length - 1].c;
    const prevPrice = bars.length >= 2 ? bars[bars.length - 2].c : currentPrice;
    const triggered: Drawing[] = [];
    for (const d of drawings) {
      if (!d.alertEnabled || d.alertTriggered) continue;
      // For horizontal / horizontal_ray: check price crossing
      if ((d.type === "horizontal" || d.type === "horizontal_ray") && d.points.length >= 1) {
        const lvl = d.points[0].price;
        const crossed = (prevPrice < lvl && currentPrice >= lvl) || (prevPrice > lvl && currentPrice <= lvl);
        if (crossed) triggered.push(d);
      }
    }
    if (triggered.length === 0) return;
    const newToasts = triggered.map(d => ({
      id: `alert_${d.id}_${Date.now()}`,
      msg: `ALERT: ${d.type === "horizontal" ? "Level" : d.type} crossed at ${d.points[0]?.price.toFixed(5)}`,
    }));
    // Mark drawings as triggered
    const updated = drawings.map(d =>
      triggered.some(t => t.id === d.id) ? { ...d, alertTriggered: true } : d
    );
    pushDrawingState(updated);
    setAlertToasts(prev => [...prev, ...newToasts]);
    // Auto-dismiss after 5 s
    setTimeout(() => {
      setAlertToasts(prev => prev.filter(t => !newToasts.some(n => n.id === t.id)));
    }, 5000);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bars]);

  /* ─── Render (delegated to ChartRenderer) ─── */
  const render = useCallback(() => {
    renderChart(
      {
        canvas: canvasRef.current,
        zoom: zoomRef.current,
        priceZoom: priceZoomRef.current,
        crosshair: crosshairRef.current,
        drawingPoints: drawingPointsRef.current,
        drawingMode: drawingModeRef.current,
        shiftHeld: shiftHeldRef.current,
        hideDrawings: hideDrawingsRef.current,
        dragOverride: dragOverrideRef.current,
        magneticSnapResult: magneticSnapResultRef.current,
      },
      {
        bars, layout, indicators, drawings, pair, interval,
        subPanes: effectiveSubPanes, dimensions,
        chartType: effectiveChartType, enabledSessions: externalSessions ?? enabledSessions,
        priceScale: effectivePriceScale, crosshairMode, selectedDrawingId, hoveredDrawingId, selectedDrawingIds,
        alertLevels: externalAlertLevels,
        tradeLevels: externalTradeLevels,
        backtestMarkers: externalBacktestMarkers,
        showPrevLevels: effectiveShowPrevLevels,
        showOpenLevels: externalShowOpenLevels ?? false,
        showPivots: externalShowPivots ?? false,
        showCandlePatterns: externalShowCandlePatterns ?? false,
        showAutoFib: externalShowAutoFib ?? false,
        showSessionRanges: externalShowSessionRanges ?? false,
        externalCrosshairTs: externalCrosshairTsRef.current,
      },
    );
  }, [bars, layout, indicators, drawings, pair, interval, effectiveSubPanes, dimensions, effectiveChartType, externalSessions, enabledSessions, effectivePriceScale, crosshairMode, selectedDrawingId, hoveredDrawingId, selectedDrawingIds, externalAlertLevels, externalTradeLevels, externalBacktestMarkers, effectiveShowPrevLevels, externalShowOpenLevels, externalShowPivots, externalShowCandlePatterns, externalShowAutoFib, externalShowSessionRanges]);

  /* ─── Keep renderRef current ─── */
  useEffect(() => { renderRef.current = render; }, [render]);

  /* ─── Crosshair sync event bus ─── */
  useEffect(() => {
    if (!syncCrosshair) {
      externalCrosshairTsRef.current = null;
      return;
    }
    const handler = (e: Event) => {
      const { ts, instanceId } = (e as CustomEvent<{ ts: number | null; instanceId: string }>).detail;
      if (instanceId === instanceIdRef.current) return;
      externalCrosshairTsRef.current = ts ?? null;
      renderRef.current();
    };
    window.addEventListener('ordr:crosshair-sync', handler);
    return () => window.removeEventListener('ordr:crosshair-sync', handler);
  }, [syncCrosshair]);

  /* ─── Screenshot capture ─── */
  useEffect(() => {
    if (!externalScreenshotTrigger || !canvasRef.current) return;
    const canvas = canvasRef.current;
    try {
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `ordr_${pair}_${interval}_${new Date().toISOString().slice(0, 10)}.png`;
      a.click();
    } catch { /* CORS or tainted canvas — silently ignore */ }
  }, [externalScreenshotTrigger]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ─── Copy chart image to clipboard ─── */
  useEffect(() => {
    if (!externalCopyImageTrigger || !canvasRef.current) return;
    const canvas = canvasRef.current;
    try {
      canvas.toBlob(blob => {
        if (!blob) return;
        navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).catch(() => {
          // Fallback: if clipboard.write not supported, just download
          const url = canvas.toDataURL('image/png');
          const a = document.createElement('a');
          a.href = url;
          a.download = `ordr_${pair}_${interval}_${new Date().toISOString().slice(0, 10)}.png`;
          a.click();
        });
      }, 'image/png');
    } catch { /* silently ignore */ }
  }, [externalCopyImageTrigger]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ─── External drawing style update ─── */
  useEffect(() => {
    if (!externalDrawingUpdate) return;
    const { id, lineStyle, ...rest } = externalDrawingUpdate;
    const updated = drawingsRef.current.map(d =>
      d.id === id
        ? { ...d, ...rest, ...(lineStyle !== undefined ? { lineStyle: lineStyle as Drawing['lineStyle'] } : {}) }
        : d
    );
    pushDrawingState(updated);
  }, [externalDrawingUpdate]); // eslint-disable-line react-hooks/exhaustive-deps

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
        // Reset start position so next frame delta is incremental (avoids compound scaling)
        axisDragRef.current = { ...axisDragRef.current, startX: x, startBarRange: zoomRef.current.endIndex - zoomRef.current.startIndex };
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

    // Emit crosshair sync event
    if (syncCrosshair && snap >= 0 && snap < bars.length) {
      window.dispatchEvent(new CustomEvent('ordr:crosshair-sync', {
        detail: { ts: bars[snap].t, instanceId: instanceIdRef.current },
      }));
    }

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
        // Point drag (p0, p1, p2, p3, etc.) — generic for all drawing types
        const pi = drag.part.startsWith("p") ? parseInt(drag.part.slice(1), 10) : 0;
        const clampedPi = Math.min(pi, drag.origPoints.length - 1);
        const newPoints = drag.origPoints.map((p, i) => {
          if (i !== clampedPi) return { ...p };
          let newIdx = Math.round(p.index + dIdx);
          let newPrice = p.price + dPrice;
          if (shiftHeldRef.current && drag.origPoints.length === 2) {
            const anchor = drag.origPoints[1 - clampedPi];
            const ax = indexToX(anchor.index, vp.startIndex, vp.endIndex, layout.chartLeft, layout.chartWidth);
            const ay = priceToY(anchor.price, vp.priceMin, vp.priceMax, layout.mainTop, layout.mainHeight, effectivePriceScale);
            const cx = indexToX(newIdx, vp.startIndex, vp.endIndex, layout.chartLeft, layout.chartWidth);
            const cy = priceToY(newPrice, vp.priceMin, vp.priceMax, layout.mainTop, layout.mainHeight, effectivePriceScale);
            const snapped = shiftSnapPoint(ax, ay, cx, cy);
            newIdx = Math.round(xToIndex(snapped.x, vp.startIndex, vp.endIndex, layout.chartLeft, layout.chartWidth));
            newPrice = yToPrice(snapped.y, vp.priceMin, vp.priceMax, layout.mainTop, layout.mainHeight, effectivePriceScale);
          }
          return { index: newIdx, price: newPrice };
        });
        dragOverrideRef.current = { id: drag.drawingId, points: newPoints };
      }
      return;
    }

    // Update magnetic snap result during drawing mode (respects magnet toggle)
    if (drawingModeRef.current && bars.length > 0 && magnetEnabledRef.current) {
      const vp = getActiveViewport();
      magneticSnapResultRef.current = magneticSnap(x, y, bars, layout, vp, effectivePriceScale);
    } else {
      magneticSnapResultRef.current = null;
    }

    // Hit test drawings for hover — only when not in drawing mode and not panning
    if (!drawingModeRef.current && !zoomRef.current.isDragging) {
      const hit = hitTestDrawings(x, y, drawingsRef.current, layout, viewport, effectivePriceScale);
      setHoveredDrawingId(hit ? hit.drawingId : null);
    }
  }, [layout, bars, contextMenu.open, effectivePriceScale, getActiveViewport]);

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
      // Magnetic snap to nearest OHLC (pixel coords) — respects magnet toggle
      let idx: number, price: number;
      if (magnetEnabledRef.current) {
        const snap = magneticSnap(x, y, bars, layout, vp, effectivePriceScale);
        idx = snap.index;
        price = snap.price;
      } else {
        idx = Math.round(xToIndex(x, vp.startIndex, vp.endIndex, layout.chartLeft, layout.chartWidth));
        price = yToPrice(y, vp.priceMin, vp.priceMax, layout.mainTop, layout.mainHeight, effectivePriceScale);
      }
      const currentPoints = drawingPointsRef.current;
      // Shift-snap for second point (angle constraint) — operates in pixel space
      if (currentPoints.length === 1 && shiftHeldRef.current && currentDrawingMode !== "horizontal") {
        const anchor = currentPoints[0];
        const ax = indexToX(anchor.index, vp.startIndex, vp.endIndex, layout.chartLeft, layout.chartWidth);
        const ay = priceToY(anchor.price, vp.priceMin, vp.priceMax, layout.mainTop, layout.mainHeight, effectivePriceScale);
        const cx = indexToX(idx, vp.startIndex, vp.endIndex, layout.chartLeft, layout.chartWidth);
        const cy = priceToY(price, vp.priceMin, vp.priceMax, layout.mainTop, layout.mainHeight, effectivePriceScale);
        const snapped = shiftSnapPoint(ax, ay, cx, cy);
        idx = Math.round(xToIndex(snapped.x, vp.startIndex, vp.endIndex, layout.chartLeft, layout.chartWidth));
        price = yToPrice(snapped.y, vp.priceMin, vp.priceMax, layout.mainTop, layout.mainHeight, effectivePriceScale);
      }
      const pt = { index: idx, price };
      const newPoints = [...currentPoints, pt];
      setDrawingPoints(newPoints);
      drawingPointsRef.current = newPoints;

      const neededPoints = getPointsRequired(currentDrawingMode);
      // Variable-point tools (brush/polyline) are terminated by double-click, not point count
      if (neededPoints > 0 && newPoints.length >= neededPoints) {
        const drawing = createDrawing(currentDrawingMode, newPoints);
        const updated = [...drawings, drawing];
        pushDrawingState(updated);
        setDrawingPoints([]);
        drawingPointsRef.current = [];
        // Auto-deactivate drawing mode after placement
        setDrawingMode(null);
        drawingModeRef.current = null;
        setActiveTool("crosshair");
        onDrawingModeChange?.(null);
        // Select the newly created drawing
        setSelectedDrawingId(drawing.id);
      }
      return;
    }

    // Click on chart without drawing mode: hit-test for selection + drag-to-move
    {
      const vp = getActiveViewport();
      // Use touch pre-computed hit (with 2.5x radius) if available, then clear it
      const hit = touchHitOverrideRef.current ?? hitTestDrawings(x, y, drawingsRef.current, layout, vp, effectivePriceScale);
      touchHitOverrideRef.current = null;
      if (hit) {
        // D7: Shift+click → toggle multi-select
        if (e.shiftKey) {
          setSelectedDrawingIds(prev => {
            const next = prev.includes(hit.drawingId)
              ? prev.filter(id => id !== hit.drawingId)
              : [...prev, hit.drawingId];
            return next;
          });
          setSelectedDrawingId(null);
          setDrawingPropsPanel(null);
          return;
        }
        // Clear multi-select when starting a normal single selection
        if (selectedDrawingIdsRef.current.length > 0) setSelectedDrawingIds([]);
        setSelectedDrawingId(hit.drawingId);
        onObjectSelect?.(hit.drawingId);
        const hitDrawing = drawingsRef.current.find(d => d.id === hit.drawingId);
        if (hitDrawing) {
          onObjectData?.({ type: hitDrawing.type, color: hitDrawing.color, lineWidth: hitDrawing.lineWidth, lineStyle: hitDrawing.lineStyle, label: hitDrawing.label, opacity: hitDrawing.opacity, locked: hitDrawing.locked });
        }
        if (drawingPropsPanel && drawingPropsPanel.drawingId !== hit.drawingId) {
          setDrawingPropsPanel(null);
        }
        // Start drag-to-move if drawing is not locked (respect global lock too)
        const targetDrawing = drawingsRef.current.find(d => d.id === hit.drawingId);
        if (targetDrawing && !targetDrawing.locked && !lockDrawingsRef.current) {
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
        if (selectedDrawingIdsRef.current.length > 0) setSelectedDrawingIds([]);
        setSelectedDrawingId(null);
        onObjectSelect?.(null);
        onObjectData?.(null);
        setDrawingPropsPanel(null);
      }
    }

    // Chart pan — pass Y for vertical panning
    zoomRef.current = handleDragStart(zoomRef.current, x, y);
    setIsDragging(true);
  }, [contextMenu.open, layout, drawings, bars, dimensions, activeTool, pushDrawingState, effectivePriceScale, drawingPropsPanel, getActiveViewport]);

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

    // Complete variable-point drawing tools (brush/polyline) on double-click
    const currentDrawingMode = drawingModeRef.current;
    if (currentDrawingMode && getPointsRequired(currentDrawingMode) < 0) {
      const currentPoints = drawingPointsRef.current;
      if (currentPoints.length >= 2) {
        const drawing = createDrawing(currentDrawingMode, currentPoints);
        const updated = [...drawingsRef.current, drawing];
        pushDrawingState(updated);
        setDrawingPoints([]);
        drawingPointsRef.current = [];
        setDrawingMode(null);
        drawingModeRef.current = null;
        setActiveTool("crosshair");
        onDrawingModeChange?.(null);
        setSelectedDrawingId(drawing.id);
      }
      return;
    }

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

    // Right-click during active drawing → cancel drawing in progress, no context menu
    if (drawingModeRef.current) {
      setDrawingMode(null);
      drawingModeRef.current = null;
      setDrawingPoints([]);
      drawingPointsRef.current = [];
      setActiveTool("crosshair");
      onDrawingModeChange?.(null);
      return;
    }

    // Check if right-clicking on a drawing → open properties panel
    const zoom = zoomRef.current;
    const viewport = computeViewport(bars, zoom.startIndex, zoom.endIndex);
    const hit = hitTestDrawings(x, y, drawingsRef.current, layout, viewport, effectivePriceScale);
    if (hit) {
      setSelectedDrawingId(hit.drawingId);
      setDrawingPropsPanel({ drawingId: hit.drawingId, x: e.clientX, y: e.clientY });
      setContextMenu(prev => ({ ...prev, open: false }));
      return;
    }

    // Generic context menu — capture price at click position
    const vp = computeViewport(bars, zoom.startIndex, zoom.endIndex);
    const clickedPrice = yToPrice(y, vp.priceMin, vp.priceMax, layout.mainTop, layout.mainHeight, effectivePriceScale);
    setDrawingPropsPanel(null);
    setContextMenu({ x: e.clientX, y: e.clientY, open: true, price: clickedPrice });
  }, [bars, layout, effectivePriceScale, onDrawingModeChange]);

  const handleMouseLeave = useCallback(() => {
    crosshairRef.current = { ...crosshairRef.current, visible: false };
    magneticSnapResultRef.current = null;
    if (syncCrosshair) {
      window.dispatchEvent(new CustomEvent('ordr:crosshair-sync', {
        detail: { ts: null, instanceId: instanceIdRef.current },
      }));
    }
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
    // All DrawingType values are valid tool keys — direct 1:1 mapping
    const allDrawingTypes: Set<string> = new Set([
      "trendline", "horizontal", "fibonacci", "rectangle",
      "ray", "extended_line", "horizontal_ray", "vertical_line", "cross_line", "info_line", "trend_angle",
      "parallel_channel", "regression_trend", "flat_top_bottom", "disjoint_channel",
      "pitchfork", "schiff_pitchfork", "mod_schiff_pitchfork", "inside_pitchfork",
      "fib_extension", "fib_channel", "fib_time_zone", "fib_speed_fan",
      "gann_box", "gann_fan",
      "xabcd_pattern", "cypher_pattern", "abcd_pattern", "triangle_pattern", "three_drives", "head_shoulders",
      "elliott_impulse", "elliott_correction", "elliott_triangle",
      "circle", "ellipse", "triangle_shape", "arrow_drawing", "brush", "polyline", "arc",
      "long_position", "short_position", "date_range", "price_range", "date_price_range", "forecast",
      "text_note", "anchored_text", "callout", "price_label", "arrow_marker_up", "arrow_marker_down", "flag_mark",
    ]);
    if (allDrawingTypes.has(tool)) {
      setDrawingMode(tool as DrawingType);
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
        onDrawingModeChange?.("trendline");
        break;
      case "horizontal":
        setDrawingMode("horizontal");
        setActiveTool("horizontal");
        onDrawingModeChange?.("horizontal");
        break;
      case "fibonacci":
        setDrawingMode("fibonacci");
        setActiveTool("fibonacci");
        onDrawingModeChange?.("fibonacci");
        break;
      case "rectangle":
        setDrawingMode("rectangle");
        setActiveTool("rectangle");
        onDrawingModeChange?.("rectangle");
        break;
      case "deleteAllDrawings":
        clearDrawings();
        break;
      case "exportDrawings":
        handleExportDrawings();
        break;
      case "importDrawings":
        importFileRef.current?.click();
        break;
      // Chart types (colon format from ChartContextMenu) — also sync to workspace in embedded mode
      case "chartType:candles": setChartType("candles"); onChartTypeChange?.("candles"); break;
      case "chartType:hollow": setChartType("hollow"); onChartTypeChange?.("hollow"); break;
      case "chartType:bars": setChartType("bars"); onChartTypeChange?.("bars"); break;
      case "chartType:line": setChartType("line"); onChartTypeChange?.("line"); break;
      case "chartType:area": setChartType("area"); onChartTypeChange?.("area"); break;
      case "chartType:heikinashi": setChartType("heikinAshi"); onChartTypeChange?.("heikinAshi"); break;
      case "chartType:baseline": setChartType("baseline"); onChartTypeChange?.("baseline"); break;
      // Price scale
      case "priceScale:linear": setPriceScale("linear"); onPriceScaleModeChange?.("linear"); break;
      case "priceScale:log": setPriceScale("log"); onPriceScaleModeChange?.("log"); break;
      case "priceScale:percentage": setPriceScale("percent"); onPriceScaleModeChange?.("percent"); break;
      // Crosshair mode
      case "crosshairMode:crosshair": setCrosshairMode("crosshair"); break;
      case "crosshairMode:dot": setCrosshairMode("dot"); break;
      case "crosshairMode:none": setCrosshairMode("none"); break;
      // Quick actions
      case "alert:above": onAddAlert?.(contextMenu.price, 'above'); onOpenPanel?.('alerts'); break;
      case "alert:below": onAddAlert?.(contextMenu.price, 'below'); onOpenPanel?.('alerts'); break;
      case "ai": onOpenPanel?.('ai'); break;
      case "copy:price":
        if (contextMenu.price > 0) {
          const fmt = contextMenu.price < 10 ? contextMenu.price.toFixed(5)
            : contextMenu.price < 1000 ? contextMenu.price.toFixed(2)
            : contextMenu.price.toFixed(0);
          navigator.clipboard.writeText(fmt).catch(() => {});
        }
        break;
      default: break;
    }
  }, [bars.length, pair, clearDrawings, handleExportDrawings, onDrawingModeChange, onChartTypeChange, onPriceScaleModeChange, onAddAlert, onOpenPanel, contextMenu.price]);

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
      "volumeProfile", "sr", "fvg", "trendlines", "marketStructure", "patterns",
      "orderBlocks", "liqZones",
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
          enabled: !!effectiveConfig[k as keyof ChartIndicatorConfig],
        };
      })
      .filter((c) => c.enabled);
  }, [effectiveConfig, indicatorParams]);

  const subPaneChips: SubPaneChip[] = useMemo(() => {
    return effectiveSubPanes
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
  }, [effectiveSubPanes, indicatorParams]);

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
      background: THEME.canvasBg,
      borderRadius: embedded ? 0 : 8,
      border: embedded ? "none" : `1px solid ${THEME.subPaneBorder}`,
      overflow: "hidden", position: "relative",
    }}>
      {/* Header — hidden in embedded mode (workspace CommandBar handles this) */}
      {!embedded && (
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "6px 12px",
          borderBottom: `1px solid ${THEME.subPaneBorder}`,
          background: THEME.axisBg, minHeight: 40,
        }}>
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

          <div style={{ display: "flex", gap: 1, background: "#1A1E2E", borderRadius: 4, padding: 1, marginLeft: 8 }}>
            {(["candles", "hollow", "bars", "line", "area", "heikinAshi", "baseline"] as ChartType[]).map(ct => (
              <button
                key={ct}
                onClick={() => setChartType(ct)}
                style={{
                  fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, fontWeight: 600,
                  padding: "2px 6px", borderRadius: 3, border: "none",
                  background: effectiveChartType === ct ? "#2A2E39" : "transparent",
                  color: effectiveChartType === ct ? "#D1D4DC" : "#545B69",
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
      )}

      {/* Top Toolbar — hidden in embedded mode */}
      {!embedded && (
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
      )}

      {/* Main area: left toolbar + canvas */}
      <div style={{ flex: 1, display: "flex", minHeight: 0, overflow: "hidden" }}>
        {/* Left Drawing Toolbar — hidden in embedded mode */}
        {!embedded && (
          <ChartLeftToolbar
            activeTool={activeTool}
            onSelectTool={handleSelectTool}
            hasDrawings={drawings.length > 0}
            onClearDrawings={clearDrawings}
          />
        )}

        {/* Canvas container */}
        <div
          ref={containerRef}
          style={{
            flex: 1, position: "relative",
            cursor: isDrawingDragging ? "grabbing" : effectiveDrawingMode ? "crosshair" : isDragging ? "grabbing" : hoveredDrawingId ? "grab" : "crosshair",
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
              price={contextMenu.price}
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

      {/* Bottom Status Bar — hidden in embedded mode */}
      {!embedded && (
        <ChartStatusBar
          interval={interval}
          lastBarTimestamp={lastBar ? lastBar.t : 0}
          priceScale={effectivePriceScale}
          onPriceScaleChange={(m) => { setPriceScale(m); onPriceScaleModeChange?.(m); }}
          onScreenshot={() => { if (canvasRef.current) exportScreenshot(canvasRef.current, pair); }}
          onFullscreen={() => { if (outerRef.current) toggleFullscreen(outerRef.current); }}
        />
      )}

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

      {/* D7: Hidden file input for import */}
      <input
        ref={importFileRef}
        type="file"
        accept=".json"
        style={{ display: "none" }}
        onChange={handleImportDrawings}
      />

      {/* D7: Multi-select badge */}
      {selectedDrawingIds.length > 1 && (
        <div style={{
          position: "absolute", bottom: 40, left: "50%", transform: "translateX(-50%)",
          background: "rgba(41,98,255,0.9)", color: "#fff",
          fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, fontWeight: 600,
          padding: "4px 12px", borderRadius: 20, pointerEvents: "none", zIndex: 100,
          letterSpacing: "0.04em",
        }}>
          {selectedDrawingIds.length} drawings selected · Ctrl+C copy · Delete remove · Escape clear
        </div>
      )}

      {/* D7: Alert toasts */}
      {alertToasts.length > 0 && (
        <div style={{
          position: "absolute", top: 12, right: 12, zIndex: 200,
          display: "flex", flexDirection: "column", gap: 6, pointerEvents: "none",
        }}>
          {alertToasts.map(t => (
            <div key={t.id} style={{
              background: "rgba(239,83,80,0.95)", color: "#fff",
              fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, fontWeight: 600,
              padding: "6px 14px", borderRadius: 6,
              borderLeft: "3px solid #FF9800",
              boxShadow: "0 2px 12px rgba(0,0,0,0.5)",
              letterSpacing: "0.04em",
            }}>
              ⚡ {t.msg}
            </div>
          ))}
        </div>
      )}
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

// (drawLegend moved to renderers/priceLine.ts as drawIndicatorLegend)
