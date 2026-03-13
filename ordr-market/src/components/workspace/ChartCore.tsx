'use client';
/**
 * ORDR Market — Chart Core
 * Central chart area with overlay header, floating drawing palette, and interactive canvas chart.
 */
import React, { useState } from 'react';
import {
  ChevronLeft, ChevronRight, X,
  TrendingUp, Minus, ChevronsUpDown, Layers, Square, Circle, Pen, Type,
  Ruler, Eraser,
} from 'lucide-react';
import { T } from './tokens';
import { useWorkspace } from './WorkspaceProvider';
import { MockCandleChart } from './MockCandleChart';
import { DRAWING_MODES, formatPrice } from './workspace-data';

// ── Indicator Chips ──────────────────────────────────────────────────────────
function IndicatorChips() {
  const { state, dispatch } = useWorkspace();
  const [collapsed, setCollapsed] = useState(false);

  if (state.indicators.length === 0) return null;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 4, flexWrap: 'wrap', pointerEvents: 'auto' }}>
      <button
        onClick={() => setCollapsed(!collapsed)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 16, height: 16, borderRadius: 2,
          border: `1px solid rgba(255,255,255,0.1)`, background: 'rgba(30,30,30,0.7)',
          cursor: 'pointer', outline: 'none', flexShrink: 0, color: '#B0B0B0',
        }}
      >
        {collapsed ? <ChevronRight size={9} /> : <ChevronLeft size={9} />}
      </button>

      {state.indicators.map(ind => (
        <div
          key={ind.id}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '1px 6px', height: 18, borderRadius: 2,
            background: 'rgba(30,30,30,0.85)', border: `1px solid rgba(255,255,255,0.08)`,
            backdropFilter: 'blur(4px)', flexShrink: 0,
            opacity: ind.visible ? 1 : 0.4,
          }}
        >
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: ind.color, flexShrink: 0 }} />
          <span style={{ fontSize: 10, fontWeight: 600, color: '#E0E0E0', fontFamily: T.font, whiteSpace: 'nowrap' }}>
            {ind.name}
            {ind.params && <span style={{ fontWeight: 400, color: '#787878' }}>({ind.params})</span>}
          </span>
          {!collapsed && ind.value && (
            <span style={{ fontSize: 10, fontWeight: 500, color: ind.color, fontFamily: T.mono }}>{ind.value}</span>
          )}
          <button
            onClick={() => dispatch({ type: 'TOGGLE_INDICATOR_VISIBILITY', id: ind.id })}
            title={ind.visible ? 'Hide' : 'Show'}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 12, height: 12, borderRadius: 2, border: 'none',
              background: 'transparent', cursor: 'pointer', outline: 'none', padding: 0,
              color: ind.visible ? '#787878' : '#EF5350',
            }}
          >
            {ind.visible ? '●' : '○'}
          </button>
          <button
            onClick={() => dispatch({ type: 'REMOVE_INDICATOR', id: ind.id })}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 12, height: 12, borderRadius: 2, border: 'none',
              background: 'transparent', cursor: 'pointer', outline: 'none', padding: 0, color: '#787878',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = '#EF5350'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#787878'; }}
          >
            <X size={8} />
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Chart Overlay Header ─────────────────────────────────────────────────────
function ChartOverlayHeader() {
  const { state, symbolInfo } = useWorkspace();
  const bull = symbolInfo.change >= 0;
  const color = bull ? '#26A69A' : '#EF5350';

  return (
    <div style={{
      position: 'absolute', top: 10, left: 12, zIndex: 5,
      pointerEvents: 'none', userSelect: 'none',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: '#E0E0E0', fontFamily: T.font, letterSpacing: '-0.3px' }}>
          {state.symbol}
        </span>
        <span style={{ fontSize: 10, color: '#B0B0B0', fontFamily: T.font }}>{symbolInfo.name}</span>
        <span style={{
          fontSize: 9, fontWeight: 600, color: '#B0B0B0', fontFamily: T.font,
          padding: '1px 4px', borderRadius: 2, background: 'rgba(255,255,255,0.06)',
          letterSpacing: '0.04em',
        }}>
          {symbolInfo.exchange} · {symbolInfo.market}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginBottom: 2 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color, fontFamily: T.mono, letterSpacing: '-0.3px', fontVariantNumeric: 'tabular-nums' }}>
          {formatPrice(symbolInfo.price)}
        </span>
        <span style={{ fontSize: 10, fontWeight: 500, color, fontFamily: T.mono }}>
          {bull ? '▲' : '▼'} {bull ? '+' : ''}{formatPrice(symbolInfo.change)}
        </span>
        <span style={{ fontSize: 10, color, fontFamily: T.mono, opacity: 0.85 }}>
          ({bull ? '+' : ''}{symbolInfo.changePct.toFixed(2)}%)
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {(['O', 'H', 'L', 'C'] as const).map(lbl => {
          const val = { O: symbolInfo.open, H: symbolInfo.high, L: symbolInfo.low, C: symbolInfo.close }[lbl];
          return (
            <div key={lbl} style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
              <span style={{ fontSize: 9, fontWeight: 600, color: '#787878', fontFamily: T.font }}>{lbl}</span>
              <span style={{ fontSize: 10, color: '#B0B0B0', fontFamily: T.mono, letterSpacing: '-0.3px', fontVariantNumeric: 'tabular-nums' }}>
                {formatPrice(val)}
              </span>
            </div>
          );
        })}
      </div>

      <IndicatorChips />
    </div>
  );
}

// ── Floating Drawing Palette ─────────────────────────────────────────────────
function FloatingPalette() {
  const { state, dispatch } = useWorkspace();

  const tools = [
    { id: 'trendline', icon: <TrendingUp size={13} />,    tooltip: 'Trend Line' },
    { id: 'hline',     icon: <Minus size={13} />,         tooltip: 'H-Line' },
    { id: 'channel',   icon: <ChevronsUpDown size={13} />, tooltip: 'Channel' },
    { id: 'fib',       icon: <Layers size={13} />,        tooltip: 'Fibonacci' },
    null,
    { id: 'rect',      icon: <Square size={13} />,        tooltip: 'Rectangle' },
    { id: 'ellipse',   icon: <Circle size={13} />,        tooltip: 'Ellipse' },
    { id: 'pen',       icon: <Pen size={13} />,           tooltip: 'Pen' },
    { id: 'text',      icon: <Type size={13} />,          tooltip: 'Text' },
    null,
    { id: 'measure',   icon: <Ruler size={13} />,         tooltip: 'Measure' },
    { id: 'eraser',    icon: <Eraser size={13} />,        tooltip: 'Eraser' },
  ] as const;

  return (
    <div style={{
      position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
      zIndex: 15, background: 'rgba(30,30,30,0.92)', borderRadius: T.r4,
      boxShadow: T.shadowFloat, border: '1px solid rgba(255,255,255,0.08)',
      display: 'flex', alignItems: 'center', padding: '0 4px', gap: 1, height: 32,
      backdropFilter: 'blur(8px)',
    }}>
      {tools.map((t, i) => t === null
        ? <div key={`ps${i}`} style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.08)', margin: '0 3px' }} />
        : (
          <button key={t.id} title={t.tooltip} onClick={() => dispatch({ type: 'SET_TOOL', tool: t.id })} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 26, height: 24, borderRadius: 3, border: 'none',
            background: state.activeTool === t.id ? 'rgba(100,168,240,0.15)' : 'transparent',
            color: state.activeTool === t.id ? '#64A8F0' : '#B0B0B0', cursor: 'pointer', outline: 'none',
          }}
          onMouseEnter={e => { if (state.activeTool !== t.id) { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = '#E0E0E0'; } }}
          onMouseLeave={e => { if (state.activeTool !== t.id) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#B0B0B0'; } }}
          >
            {t.icon}
          </button>
        )
      )}
    </div>
  );
}

// ── Main Chart Core ──────────────────────────────────────────────────────────
export function ChartCore() {
  const { state, symbolInfo } = useWorkspace();
  const showPalette = DRAWING_MODES.has(state.activeTool);

  return (
    <div style={{
      flex: 1, position: 'relative', overflow: 'hidden',
      background: T.chartBg, minWidth: 0, minHeight: 0,
    }}>
      <ChartOverlayHeader />
      {showPalette && <FloatingPalette />}

      <div style={{ position: 'absolute', inset: 0 }}>
        <MockCandleChart
          symbol={state.symbol}
          exchange={`${symbolInfo.exchange} · ${symbolInfo.market}`}
          interval={state.timeframe}
          chartType={state.chartType}
          showSR={state.showSR}
          showFVG={state.showFVG}
          indicators={state.indicators}
          activeTool={state.activeTool}
        />
      </div>
    </div>
  );
}
