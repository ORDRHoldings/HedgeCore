'use client';
/**
 * MiniCandleChart — lightweight canvas candlestick renderer for MTF strip.
 * No dependency on ChartEngine. Auto-sizes to container via ResizeObserver.
 */
import React, { useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import type { Bar } from './indicators/types';

interface MiniCandleChartProps {
  bars: Bar[];
  bullColor?: string;
  bearColor?: string;
}

export default function MiniCandleChart({
  bars,
  bullColor = '#26A69A',
  bearColor = '#EF5350',
}: MiniCandleChartProps) {
  const wrapRef  = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Keep a ref so the ResizeObserver callback always reads the latest bars
  const barsRef = useRef(bars);
  barsRef.current = bars;

  const draw = useCallback((w: number, h: number, b: Bar[]) => {
    const canvas = canvasRef.current;
    if (!canvas || b.length < 2 || w <= 0 || h <= 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width  = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width  = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Show as many bars as fit at ~4px per bar
    const maxBars = Math.max(2, Math.floor(w / 4));
    const visible = b.slice(-maxBars);
    const N = visible.length;
    if (N < 2) return;

    let maxH = -Infinity, minL = Infinity;
    for (const bar of visible) {
      if (bar.h > maxH) maxH = bar.h;
      if (bar.l < minL) minL = bar.l;
    }
    const range = maxH - minL;
    if (!range) return;

    const padT = 3, padB = 3, padL = 1, padR = 1;
    const cw = w - padL - padR;
    const ch = h - padT - padB;
    const barW  = cw / N;
    const bodyW = Math.max(1, barW * 0.55);
    const toY   = (p: number) => padT + ch * (1 - (p - minL) / range);

    ctx.lineWidth = 1;
    for (let i = 0; i < N; i++) {
      const bar   = visible[i];
      const x     = padL + (i + 0.5) * barW;
      const color = bar.c >= bar.o ? bullColor : bearColor;
      ctx.strokeStyle = color;
      ctx.fillStyle   = color;

      // wick
      ctx.beginPath();
      ctx.moveTo(x, toY(bar.h));
      ctx.lineTo(x, toY(bar.l));
      ctx.stroke();

      // body
      const y1 = toY(Math.max(bar.o, bar.c));
      const y2 = toY(Math.min(bar.o, bar.c));
      ctx.fillRect(x - bodyW / 2, y1, bodyW, Math.max(1, y2 - y1));
    }
  }, [bullColor, bearColor]);

  // Keep drawRef fresh so ResizeObserver closure picks up new props
  const drawRef = useRef(draw);
  drawRef.current = draw;

  // Redraw when bars or colors change
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const { width, height } = wrap.getBoundingClientRect();
    draw(width, height, bars);
  }, [bars, draw]);

  // Redraw on container resize
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      drawRef.current(width, height, barsRef.current);
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={wrapRef} style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', top: 0, left: 0 }} />
    </div>
  );
}
