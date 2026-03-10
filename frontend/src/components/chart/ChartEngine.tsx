"use client";
/**
 * ChartEngine.tsx — ORDR Canvas 2D Charting Platform
 *
 * Proprietary institutional FX charting: candlesticks, indicators, auto-detection,
 * forward curve overlays, zoom/pan, crosshair, drawing tools.
 * Zero external charting dependencies. 60fps target via requestAnimationFrame.
 */
import React, { useRef, useEffect, useState, useCallback, useMemo } from "react";
import type {
  Bar, IndicatorPoint, BandPoint, MACDPoint,
  SRLevel, FVGZone, TrendLine,
} from "./indicators/types";
import {
  computeSMA, computeEMA, computeRSI, computeMACD,
  computeBollinger, computeKeltner,
} from "./indicators";
import { detectSupportResistance, detectFVG, detectTrendlines } from "./detection";
import { computeLayout, computeViewport, formatPrice } from "./core/data";
import type { ChartLayout, Viewport } from "./core/data";
import { drawPriceAxis, drawTimeAxis } from "./core/axis";
import { drawCrosshair, snapToBar } from "./core/crosshair";
import type { CrosshairState } from "./core/crosshair";
import {
  createInitialZoomState, handleWheel, handleDragStart,
  handleDragMove, handleDragEnd,
} from "./core/zoom";
import type { ZoomPanState } from "./core/zoom";
import { drawCandlesticks } from "./renderers/candlestick";
import { drawVolume } from "./renderers/volume";
import {
  drawIndicatorLine, drawBands, drawRSI, drawMACD,
} from "./renderers/indicators";
import { drawSRLevels, drawFVGZones, drawTrendlines } from "./renderers/overlays";
import {
  drawDrawings, loadDrawings, saveDrawings,
  getDefaultColor,
} from "./renderers/drawings";
import type { Drawing, DrawingType } from "./renderers/drawings";

/* ═══════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════ */

export type SubPaneType = "none" | "rsi" | "macd";
export type OverlayType = "sma" | "ema" | "bollinger" | "keltner";

interface OverlayConfig {
  type: OverlayType;
  enabled: boolean;
  period?: number;
  color: string;
}

interface Props {
  bars: Bar[];
  pair: string;
  interval: string;
  source?: string;
  loading?: boolean;
  error?: string | null;
}

/* ═══════════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════════ */

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  bgPanel: "var(--bg-panel, #FFFFFF)",
  bgDeep: "var(--bg-deep, #F8FAFC)",
  bgSub: "var(--bg-sub, #F1F5F9)",
  rim: "var(--border-rim, #E2E8F0)",
  accent: "var(--accent-cyan, #1C62F2)",
  textPrimary: "var(--text-primary, #0F172A)",
  textSecondary: "var(--text-secondary, #334155)",
  textTertiary: "var(--text-tertiary, #94A3B8)",
} as const;

const DEFAULT_OVERLAYS: OverlayConfig[] = [
  { type: "sma", enabled: false, period: 20, color: "#3B82F6" },
  { type: "sma", enabled: false, period: 50, color: "#F59E0B" },
  { type: "ema", enabled: true, period: 20, color: "#8B5CF6" },
  { type: "bollinger", enabled: false, color: "rgba(59,130,246,0.15)" },
  { type: "keltner", enabled: false, color: "rgba(245,158,11,0.15)" },
];

/* ═══════════════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════════════ */

export default function ChartEngine({ bars, pair, interval, source, loading, error }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number>(0);

  // State
  const [dimensions, setDimensions] = useState({ w: 1200, h: 600 });
  const [subPane, setSubPane] = useState<SubPaneType>("none");
  const [overlays, setOverlays] = useState<OverlayConfig[]>(DEFAULT_OVERLAYS);
  const [showSR, setShowSR] = useState(true);
  const [showFVG, setShowFVG] = useState(true);
  const [showTrendlines, setShowTrendlines] = useState(true);
  const [drawingMode, setDrawingMode] = useState<DrawingType | null>(null);
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [zoomState, setZoomState] = useState<ZoomPanState>(() =>
    createInitialZoomState(bars.length, Math.min(200, bars.length)),
  );
  const [crosshair, setCrosshair] = useState<CrosshairState>({
    x: 0, y: 0, visible: false, snapIndex: 0,
  });
  const [drawingPoints, setDrawingPoints] = useState<{ index: number; price: number }[]>([]);

  // Layout
  const layout = useMemo(
    () => computeLayout(dimensions.w, dimensions.h, subPane !== "none"),
    [dimensions.w, dimensions.h, subPane],
  );

  // Viewport
  const viewport = useMemo(
    () => computeViewport(bars, zoomState.startIndex, zoomState.endIndex),
    [bars, zoomState.startIndex, zoomState.endIndex],
  );

  // Computed indicators (memoized)
  const indicators = useMemo(() => {
    if (bars.length < 5) return { overlayLines: [], bands: [], rsi: [], macd: [], sr: [], fvg: [], trend: [] };

    const overlayLines: { points: IndicatorPoint[]; color: string; label: string }[] = [];
    const bandsList: { points: BandPoint[]; fill: string; line: string; label: string }[] = [];

    for (const ov of overlays) {
      if (!ov.enabled) continue;
      if (ov.type === "sma" && ov.period) {
        overlayLines.push({ points: computeSMA(bars, ov.period), color: ov.color, label: `SMA(${ov.period})` });
      } else if (ov.type === "ema" && ov.period) {
        overlayLines.push({ points: computeEMA(bars, ov.period), color: ov.color, label: `EMA(${ov.period})` });
      } else if (ov.type === "bollinger") {
        bandsList.push({ points: computeBollinger(bars), fill: "rgba(59,130,246,0.06)", line: "#3B82F6", label: "BB(20,2)" });
      } else if (ov.type === "keltner") {
        bandsList.push({ points: computeKeltner(bars), fill: "rgba(245,158,11,0.06)", line: "#F59E0B", label: "KC(20,10)" });
      }
    }

    return {
      overlayLines,
      bands: bandsList,
      rsi: subPane === "rsi" ? computeRSI(bars) : [],
      macd: subPane === "macd" ? computeMACD(bars) : [],
      sr: showSR ? detectSupportResistance(bars) : [],
      fvg: showFVG ? detectFVG(bars) : [],
      trend: showTrendlines ? detectTrendlines(bars) : [],
    };
  }, [bars, overlays, subPane, showSR, showFVG, showTrendlines]);

  // Load drawings from localStorage
  useEffect(() => {
    setDrawings(loadDrawings(pair));
  }, [pair]);

  // Reset zoom when bars change significantly
  useEffect(() => {
    if (bars.length > 0) {
      setZoomState(createInitialZoomState(bars.length, Math.min(200, bars.length)));
    }
  }, [bars.length]);

  // Resize observer
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setDimensions({ w: Math.floor(width), h: Math.floor(height) });
        }
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ─── Render Loop ─── */
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

    // Clear
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, dimensions.w, dimensions.h);

    // Auto-detected overlays
    if (showSR) drawSRLevels(ctx, indicators.sr, layout, viewport);
    if (showFVG) drawFVGZones(ctx, indicators.fvg, layout, viewport);
    if (showTrendlines) drawTrendlines(ctx, indicators.trend, bars, layout, viewport);

    // Bands (behind candles)
    for (const band of indicators.bands) {
      drawBands(ctx, band.points, bars, layout, viewport, band.fill, band.line);
    }

    // Candlesticks
    drawCandlesticks(ctx, bars, layout, viewport);

    // Overlay lines (on top of candles)
    for (const line of indicators.overlayLines) {
      drawIndicatorLine(ctx, line.points, bars, layout, viewport, line.color);
    }

    // Volume
    drawVolume(ctx, bars, layout, viewport);

    // Sub-pane
    if (subPane === "rsi") drawRSI(ctx, indicators.rsi, bars, layout, viewport);
    if (subPane === "macd") drawMACD(ctx, indicators.macd, bars, layout, viewport);

    // User drawings
    drawDrawings(ctx, drawings, layout, viewport, pair);

    // Axes
    drawPriceAxis(ctx, layout, viewport, pair);
    drawTimeAxis(ctx, layout, viewport, bars, interval);

    // Crosshair (on top of everything)
    drawCrosshair(ctx, crosshair, layout, viewport, bars, pair);

    // Indicator legend (top-left)
    drawLegend(ctx, indicators.overlayLines, indicators.bands, layout);
  }, [bars, layout, viewport, crosshair, indicators, drawings, pair, interval, subPane, showSR, showFVG, showTrendlines, dimensions]);

  // Animation frame
  useEffect(() => {
    const frame = () => {
      render();
      animRef.current = requestAnimationFrame(frame);
    };
    animRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(animRef.current);
  }, [render]);

  /* ─── Mouse handlers ─── */
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (zoomState.isDragging) {
      setZoomState(s => handleDragMove(s, x, layout.chartWidth, bars.length));
    }

    const snap = snapToBar(x, viewport.startIndex, viewport.endIndex, layout.chartLeft, layout.chartWidth, bars.length);
    setCrosshair({ x, y, visible: true, snapIndex: snap });
  }, [zoomState.isDragging, viewport, layout, bars.length]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (drawingMode) {
      // Add point for drawing
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

    setZoomState(s => handleDragStart(s, x));
  }, [drawingMode, drawingPoints, viewport, layout, drawings, pair]);

  const handleMouseUp = useCallback(() => {
    setZoomState(s => handleDragEnd(s));
  }, []);

  const handleMouseLeave = useCallback(() => {
    setCrosshair(s => ({ ...s, visible: false }));
    setZoomState(s => handleDragEnd(s));
  }, []);

  const handleWheelEvent = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    setZoomState(s => handleWheel(s, e.deltaY, x, layout.chartLeft, layout.chartWidth, bars.length));
  }, [layout, bars.length]);

  /* ─── Toolbar toggle helpers ─── */
  const toggleOverlay = (idx: number) => {
    setOverlays(prev => prev.map((o, i) => i === idx ? { ...o, enabled: !o.enabled } : o));
  };

  const clearDrawings = () => {
    setDrawings([]);
    saveDrawings(pair, []);
  };

  /* ─── Last bar info ─── */
  const lastBar = bars.length > 0 ? bars[bars.length - 1] : null;
  const prevBar = bars.length > 1 ? bars[bars.length - 2] : null;
  const change = lastBar && prevBar ? ((lastBar.c - prevBar.c) / prevBar.c) * 100 : 0;
  const isUp = change >= 0;

  if (error) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", fontFamily: S.fontMono, color: "#DC2626", fontSize: 14 }}>
        {error}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: S.bgPanel, borderRadius: 8, border: `1px solid ${S.rim}`, overflow: "hidden" }}>
      {/* ── Header Bar ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 12px", borderBottom: `1px solid ${S.rim}`, background: S.bgDeep, minHeight: 42 }}>
        {/* Pair + Price */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontFamily: S.fontMono, fontWeight: 700, fontSize: 15, color: S.textPrimary }}>{pair}</span>
          {lastBar && (
            <>
              <span style={{ fontFamily: S.fontMono, fontSize: 15, fontWeight: 600, color: S.textPrimary }}>
                {formatPrice(lastBar.c, pair)}
              </span>
              <span style={{ fontFamily: S.fontMono, fontSize: 12, color: isUp ? "#059669" : "#DC2626", fontWeight: 600 }}>
                {isUp ? "+" : ""}{change.toFixed(3)}%
              </span>
            </>
          )}
        </div>

        <div style={{ flex: 1 }} />

        {/* Source badge */}
        {source && (
          <span style={{ fontFamily: S.fontMono, fontSize: 10, padding: "2px 6px", borderRadius: 4, background: "#EFF6FF", color: "#3B82F6", fontWeight: 600 }}>
            {source}
          </span>
        )}

        {loading && (
          <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.textTertiary }}>LOADING...</span>
        )}
      </div>

      {/* ── Toolbar ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 8px", borderBottom: `1px solid ${S.rim}`, background: S.bgSub, flexWrap: "wrap", minHeight: 32 }}>
        {/* Overlays */}
        {overlays.map((ov, i) => (
          <ToolbarBtn
            key={i}
            active={ov.enabled}
            onClick={() => toggleOverlay(i)}
            color={ov.color}
          >
            {ov.type === "sma" ? `SMA ${ov.period}` : ov.type === "ema" ? `EMA ${ov.period}` : ov.type === "bollinger" ? "BB" : "KC"}
          </ToolbarBtn>
        ))}

        <Divider />

        {/* Sub-pane */}
        <ToolbarBtn active={subPane === "rsi"} onClick={() => setSubPane(s => s === "rsi" ? "none" : "rsi")}>RSI</ToolbarBtn>
        <ToolbarBtn active={subPane === "macd"} onClick={() => setSubPane(s => s === "macd" ? "none" : "macd")}>MACD</ToolbarBtn>

        <Divider />

        {/* Auto-detection */}
        <ToolbarBtn active={showSR} onClick={() => setShowSR(s => !s)}>S/R</ToolbarBtn>
        <ToolbarBtn active={showFVG} onClick={() => setShowFVG(s => !s)}>FVG</ToolbarBtn>
        <ToolbarBtn active={showTrendlines} onClick={() => setShowTrendlines(s => !s)}>TREND</ToolbarBtn>

        <Divider />

        {/* Drawing tools */}
        <ToolbarBtn active={drawingMode === "trendline"} onClick={() => setDrawingMode(m => m === "trendline" ? null : "trendline")}>LINE</ToolbarBtn>
        <ToolbarBtn active={drawingMode === "horizontal"} onClick={() => setDrawingMode(m => m === "horizontal" ? null : "horizontal")}>HORIZ</ToolbarBtn>
        <ToolbarBtn active={drawingMode === "fibonacci"} onClick={() => setDrawingMode(m => m === "fibonacci" ? null : "fibonacci")}>FIB</ToolbarBtn>
        <ToolbarBtn active={drawingMode === "rectangle"} onClick={() => setDrawingMode(m => m === "rectangle" ? null : "rectangle")}>RECT</ToolbarBtn>
        {drawings.length > 0 && (
          <ToolbarBtn active={false} onClick={clearDrawings} color="#DC2626">CLR</ToolbarBtn>
        )}

        {drawingMode && (
          <span style={{ fontFamily: S.fontMono, fontSize: 10, color: "#3B82F6", marginLeft: 8 }}>
            Click {drawingMode === "horizontal" ? "1 point" : "2 points"} on chart
          </span>
        )}
      </div>

      {/* ── Canvas ── */}
      <div
        ref={containerRef}
        style={{ flex: 1, position: "relative", cursor: drawingMode ? "crosshair" : zoomState.isDragging ? "grabbing" : "crosshair" }}
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
   Sub-components
   ═══════════════════════════════════════════════════════ */

function ToolbarBtn({ children, active, onClick, color }: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  color?: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        fontFamily: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
        fontSize: 10,
        fontWeight: 600,
        padding: "2px 8px",
        borderRadius: 4,
        border: `1px solid ${active ? (color || "#3B82F6") : "transparent"}`,
        background: active ? (color ? `${color}15` : "#EFF6FF") : "transparent",
        color: active ? (color || "#3B82F6") : "#64748B",
        cursor: "pointer",
        transition: "all 0.15s",
        lineHeight: "18px",
      }}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div style={{ width: 1, height: 16, background: "#E2E8F0", margin: "0 4px" }} />;
}

/* ═══════════════════════════════════════════════════════
   Legend helper (drawn on canvas)
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
  let x = 10;
  const y = layout.mainTop + 10;

  for (const item of items) {
    // Color dot
    ctx.fillStyle = item.color;
    ctx.beginPath();
    ctx.arc(x + 4, y, 3, 0, Math.PI * 2);
    ctx.fill();

    // Label
    ctx.fillStyle = "#64748B";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(item.label, x + 10, y);
    x += ctx.measureText(item.label).width + 20;
  }
}
