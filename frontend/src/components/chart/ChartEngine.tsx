"use client";
/**
 * ChartEngine.tsx — ORDR Canvas 2D Charting Platform
 *
 * Institutional FX charting with 23 indicators, multi-sub-pane (up to 3),
 * volume profile, smooth zoom/pan with momentum, dark theme, drawing tools.
 * Zero external charting dependencies. 60fps via requestAnimationFrame.
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
import type { CrosshairState } from "./core/crosshair";
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
import ChartToolbar from "./ChartToolbar";
import type { ChartIndicatorConfig } from "./ChartToolbar";

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

function withPane(layout: ChartLayout, pane: SubPaneLayout): ChartLayout {
  return { ...layout, subPaneTop: pane.top, subPaneHeight: pane.height };
}

/* ═══════════════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════════════ */

export default function ChartEngine({ bars, pair, interval, source, loading, error }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number>(0);

  // High-frequency state via refs (60fps, no React re-render)
  const zoomRef = useRef<ZoomPanState>(
    createInitialZoomState(bars.length, Math.min(200, bars.length)),
  );
  const crosshairRef = useRef<CrosshairState>({ x: 0, y: 0, visible: false, snapIndex: 0 });

  // Low-frequency state
  const [dimensions, setDimensions] = useState({ w: 1200, h: 600 });
  const [config, setConfig] = useState<ChartIndicatorConfig>(DEFAULT_CONFIG);
  const [activeSubPanes, setActiveSubPanes] = useState<string[]>([]);
  const [drawingMode, setDrawingMode] = useState<DrawingType | null>(null);
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [drawingPoints, setDrawingPoints] = useState<{ index: number; price: number }[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  // Layout
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
  useEffect(() => { setDrawings(loadDrawings(pair)); }, [pair]);

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
    const viewport = computeViewport(bars, zoom.startIndex, zoom.endIndex);
    const ch = crosshairRef.current;

    ctx.fillStyle = THEME.canvasBg;
    ctx.fillRect(0, 0, dimensions.w, dimensions.h);

    // Layer 1: Behind candles
    if (indicators.sr.length > 0) drawSRLevels(ctx, indicators.sr, layout, viewport);
    if (indicators.fvg.length > 0) drawFVGZones(ctx, indicators.fvg, layout, viewport);
    if (indicators.trend.length > 0) drawTrendlines(ctx, indicators.trend, bars, layout, viewport);
    for (const band of indicators.bands) drawBands(ctx, band.points, bars, layout, viewport, band.fill, band.line);
    if (indicators.ichimoku.length > 0) drawIchimoku(ctx, indicators.ichimoku, bars, layout, viewport);

    // Layer 2: Candlesticks
    drawCandlesticks(ctx, bars, layout, viewport);

    // Layer 3: Overlays on top
    for (const line of indicators.overlayLines) drawIndicatorLine(ctx, line.points, bars, layout, viewport, line.color);
    if (indicators.vwap.length > 0) drawVWAP(ctx, indicators.vwap, bars, layout, viewport);
    if (indicators.parabolicSAR.length > 0) drawParabolicSAR(ctx, indicators.parabolicSAR, bars, layout, viewport);
    if (indicators.pivotPoints) drawPivotPoints(ctx, indicators.pivotPoints, layout, viewport);

    // Layer 4: Volume
    drawVolume(ctx, bars, layout, viewport);
    if (indicators.volumeProfile) drawVolumeProfile(ctx, indicators.volumeProfile, layout, viewport);

    // Layer 5: Sub-panes
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

    // Layer 6: Drawings
    drawDrawings(ctx, drawings, layout, viewport, pair);

    // Layer 7: Axes
    drawPriceAxis(ctx, layout, viewport, pair);
    drawTimeAxis(ctx, layout, viewport, bars, interval);

    // Layer 8: Crosshair
    drawCrosshair(ctx, ch, layout, viewport, bars, pair);

    // Layer 9: Legend
    drawLegend(ctx, indicators.overlayLines, indicators.bands, layout);
  }, [bars, layout, indicators, drawings, pair, interval, activeSubPanes, dimensions]);

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

    if (zoomRef.current.isDragging) {
      zoomRef.current = handleDragMove(zoomRef.current, x, layout.chartWidth, bars.length);
    }

    const viewport = computeViewport(bars, zoomRef.current.startIndex, zoomRef.current.endIndex);
    const snap = snapToBar(x, viewport.startIndex, viewport.endIndex, layout.chartLeft, layout.chartWidth, bars.length);
    crosshairRef.current = { x, y, visible: true, snapIndex: snap };
  }, [layout, bars]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

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
        setDrawings(updated);
        saveDrawings(pair, updated);
        setDrawingPoints([]);
        setDrawingMode(null);
      }
      return;
    }

    zoomRef.current = handleDragStart(zoomRef.current, x);
    setIsDragging(true);
  }, [drawingMode, drawingPoints, layout, drawings, pair, bars]);

  const handleMouseUp = useCallback(() => {
    zoomRef.current = handleDragEnd(zoomRef.current);
    setIsDragging(false);
  }, []);

  const handleMouseLeave = useCallback(() => {
    crosshairRef.current = { ...crosshairRef.current, visible: false };
    zoomRef.current = handleDragEnd(zoomRef.current);
    setIsDragging(false);
  }, []);

  const handleWheelEvent = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    zoomRef.current = zoomWheel(zoomRef.current, e.deltaY, x, layout.chartLeft, layout.chartWidth, bars.length);
  }, [layout, bars.length]);

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
    setDrawings([]);
    saveDrawings(pair, []);
  }, [pair]);

  /* ─── Last bar ─── */
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
    <div style={{
      display: "flex", flexDirection: "column", height: "100%",
      background: THEME.canvasBg, borderRadius: 8,
      border: `1px solid ${THEME.subPaneBorder}`, overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "8px 12px",
        borderBottom: `1px solid ${THEME.subPaneBorder}`,
        background: THEME.axisBg, minHeight: 42,
      }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 15, color: "#D1D4DC" }}>
            {pair}
          </span>
          {lastBar && (
            <>
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 15, fontWeight: 600, color: "#D1D4DC" }}>
                {formatPrice(lastBar.c, pair)}
              </span>
              <span style={{
                fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, fontWeight: 600,
                color: isUp ? THEME.bullBody : THEME.bearBody,
              }}>
                {isUp ? "+" : ""}{change.toFixed(3)}%
              </span>
            </>
          )}
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
        {loading && (
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: THEME.axisText }}>
            LOADING...
          </span>
        )}
      </div>

      {/* Toolbar */}
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

      {/* Canvas */}
      <div
        ref={containerRef}
        style={{
          flex: 1, position: "relative",
          cursor: drawingMode ? "crosshair" : isDragging ? "grabbing" : "crosshair",
        }}
      >
        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          onWheel={handleWheelEvent}
          style={{ display: "block", width: "100%", height: "100%" }}
        />
      </div>
    </div>
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
  const y = layout.mainTop + 14;

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
