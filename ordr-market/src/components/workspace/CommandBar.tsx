'use client';
/**
 * ORDR Market — Command Bar
 * Premium 36px top bar with three zones: left (brand/search), center (price/timeframes), right (tools/account).
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Search, ChevronDown, CandlestickChart, BarChart2, LineChart, AreaChart,
  TrendingUp, Bell, Settings, User, Star, X, Plus, Check,
  PlaySquare, Bot, Layers, SlidersHorizontal,
  Activity, Eye, Focus, LayoutDashboard, Zap,
  Camera, Sun, Save, LayoutGrid, Link2, Link2Off, Copy, Share2,
} from 'lucide-react';
import { T } from './tokens';
import { ThemeSwitcher } from './ThemeSwitcher';
import { useWorkspace } from './WorkspaceProvider';
import { SYMBOL_DATA, BASE_TIMEFRAMES, INDICATOR_LIBRARY, INDICATOR_CATEGORIES, formatPrice } from './workspace-data';
import type { ChartType, WorkspaceMode, ChartLayout } from './workspace-types';
import ChartSymbolSearch from '../chart/ChartSymbolSearch';

// ── Shared styles ────────────────────────────────────────────────────────────
const btnBase: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  height: 26, borderRadius: 3, border: 'none', outline: 'none',
  fontSize: 11, fontWeight: 500, cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap',
};

function CmdBtn({ children, active, onClick, title, style }: {
  children: React.ReactNode; active?: boolean; onClick?: () => void; title?: string; style?: React.CSSProperties;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        ...btnBase,
        padding: '0 7px',
        background: active ? T.accentBg : 'transparent',
        color: active ? T.accent : T.text2,
        fontFamily: T.font,
        ...style,
      }}
      onMouseEnter={e => { if (!active) { e.currentTarget.style.background = T.hover; e.currentTarget.style.color = T.text1; } }}
      onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.text2; } }}
    >
      {children}
    </button>
  );
}

function Separator() {
  return <div style={{ width: 1, height: 16, background: T.border, flexShrink: 0, margin: '0 4px' }} />;
}

// ── Symbol Search (opens on click OR when user starts typing) ────────────────
function SymbolSearch() {
  const { state, dispatch } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [initialQuery, setInitialQuery] = useState('');

  // Global keyboard listener: typing alphanumeric keys opens symbol search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't trigger if already open, or if user is in an input/textarea
      if (open) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      // Don't trigger on modifier combos (Ctrl+C, etc.)
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // Only trigger on single printable alphanumeric characters
      // Skip keys reserved for workspace shortcuts (v=cursor, m=measure)
      if (e.key === 'v' || e.key === 'V' || e.key === 'm' || e.key === 'Escape') return;
      if (e.key.length === 1 && /^[a-zA-Z0-9]$/.test(e.key)) {
        e.preventDefault();
        setInitialQuery(e.key.toUpperCase());
        setOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  const handleOpen = () => {
    setInitialQuery('');
    setOpen(true);
  };

  return (
    <>
      <button
        onClick={handleOpen}
        style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '0 7px', height: 26, borderRadius: 3,
          border: `1px solid ${T.border}`, background: T.surfaceAlt,
          cursor: 'pointer', flexShrink: 0, outline: 'none',
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = T.accent; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; }}
      >
        <Search size={11} color={T.text3} />
        <span style={{ fontSize: 13, fontWeight: 700, color: T.text1, letterSpacing: '-0.3px', fontFamily: T.font }}>
          {state.symbol}
        </span>
        <ChevronDown size={9} color={T.text3} />
      </button>
      <ChartSymbolSearch
        isOpen={open}
        onClose={() => setOpen(false)}
        onSelect={(sym) => { dispatch({ type: 'SET_SYMBOL', symbol: sym }); setOpen(false); }}
        currentSymbol={state.symbol}
        initialQuery={initialQuery}
      />
    </>
  );
}

// ── Mode Selector ────────────────────────────────────────────────────────────
function ModeSelector() {
  const { state, dispatch } = useWorkspace();
  const modes: { id: WorkspaceMode; icon: React.ReactNode; label: string }[] = [
    { id: 'focus',     icon: <Focus size={12} />,           label: 'Focus' },
    { id: 'workspace', icon: <LayoutDashboard size={12} />, label: 'Workspace' },
    { id: 'execution', icon: <Zap size={12} />,             label: 'Execution' },
  ];

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
      {modes.map(m => (
        <CmdBtn key={m.id} active={state.mode === m.id} onClick={() => dispatch({ type: 'SET_MODE', mode: m.id })} title={m.label}>
          {m.icon}
        </CmdBtn>
      ))}
    </div>
  );
}

// ── Timeframe Row ────────────────────────────────────────────────────────────
function TimeframeRow() {
  const { state, dispatch } = useWorkspace();
  const [showAdd, setShowAdd] = useState(false);
  const [inputVal, setInputVal] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const allTFs = [...BASE_TIMEFRAMES, ...state.customTimeframes];

  useEffect(() => { if (showAdd && inputRef.current) inputRef.current.focus(); }, [showAdd]);

  const handleAdd = () => {
    const v = inputVal.trim();
    if (v && !allTFs.includes(v)) { dispatch({ type: 'ADD_CUSTOM_TF', tf: v }); dispatch({ type: 'SET_TIMEFRAME', timeframe: v }); }
    setInputVal(''); setShowAdd(false);
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, flexShrink: 0 }}>
      {allTFs.map(tf => {
        const active = state.timeframe === tf;
        return (
          <button
            key={tf}
            onClick={() => dispatch({ type: 'SET_TIMEFRAME', timeframe: tf })}
            style={{
              ...btnBase,
              padding: '0 5px', height: 24, minWidth: 24,
              background: active ? T.accentBg : 'transparent',
              color: active ? T.accent : T.text2,
              fontSize: 11, fontWeight: active ? 600 : 400,
              fontFamily: T.font, letterSpacing: '-0.1px',
            }}
            onMouseEnter={e => { if (!active) { e.currentTarget.style.background = T.hover; e.currentTarget.style.color = T.text1; } }}
            onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.text2; } }}
          >
            {tf}
          </button>
        );
      })}
      <button
        onClick={() => { if (!showAdd) setShowAdd(true); }}
        style={{
          ...btnBase,
          width: 20, height: 20, padding: 0, justifyContent: 'center',
          border: `1px dashed ${T.border}`, background: 'transparent',
          color: T.text3, marginLeft: 2,
        }}
        title="Add custom timeframe"
        onMouseEnter={e => { e.currentTarget.style.borderColor = T.accent; e.currentTarget.style.color = T.accent; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.text3; }}
      >
        <Plus size={9} />
      </button>
      {showAdd && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginLeft: 2 }}>
          <input
            ref={inputRef}
            value={inputVal}
            onChange={e => setInputVal(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setShowAdd(false); }}
            placeholder="2h"
            style={{
              width: 42, height: 20, padding: '0 5px', fontSize: 10, fontFamily: T.font,
              color: T.text1, border: `1px solid ${T.accent}`, borderRadius: 3,
              background: T.selectedBg, outline: 'none',
            }}
          />
          <button onClick={handleAdd} style={{ ...btnBase, width: 18, height: 18, padding: 0, justifyContent: 'center', background: T.accent, borderRadius: 3, color: '#fff' }}>
            <Check size={9} />
          </button>
          <button onClick={() => setShowAdd(false)} style={{ ...btnBase, width: 18, height: 18, padding: 0, justifyContent: 'center', background: 'transparent', color: T.text3 }}>
            <X size={9} />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Chart Type Selector ──────────────────────────────────────────────────────
function ChartTypeSelector() {
  const { state, dispatch } = useWorkspace();
  const types: { id: ChartType; icon: React.ReactNode; label: string }[] = [
    { id: 'candles',    icon: <CandlestickChart size={14} />, label: 'Candles' },
    { id: 'hollow',     icon: <CandlestickChart size={14} />, label: 'Hollow' },
    { id: 'bars',       icon: <BarChart2 size={14} />,        label: 'Bars' },
    { id: 'line',       icon: <LineChart size={14} />,         label: 'Line' },
    { id: 'area',       icon: <AreaChart size={14} />,         label: 'Area' },
    { id: 'heikinAshi', icon: <CandlestickChart size={14} />, label: 'HA' },
    { id: 'baseline',   icon: <TrendingUp size={14} />,       label: 'Base' },
  ];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
      {types.map(ct => (
        <CmdBtn key={ct.id} active={state.chartType === ct.id} onClick={() => dispatch({ type: 'SET_CHART_TYPE', chartType: ct.id })} title={ct.label}>
          {ct.icon}
        </CmdBtn>
      ))}
    </div>
  );
}

// ── Indicator Library → chartConfig/chartSubPanes key mapping ─────────────────
// INDICATOR_LIBRARY ids must map to the boolean keys ChartEngine actually reads.
const IND_CFG: Record<string, { kind: 'overlay' | 'subpane'; key: string }> = {
  ema20:    { kind: 'overlay',  key: 'ema20' },
  sma50:    { kind: 'overlay',  key: 'sma50' },
  ema200:   { kind: 'overlay',  key: 'sma200' },
  vwap:     { kind: 'overlay',  key: 'vwap' },
  ichimoku: { kind: 'overlay',  key: 'ichimoku' },
  sar:      { kind: 'overlay',  key: 'parabolicSAR' },
  hma:      { kind: 'overlay',  key: 'hma9' },
  bb:       { kind: 'overlay',  key: 'bollinger' },
  kc:       { kind: 'overlay',  key: 'keltner' },
  dc:       { kind: 'overlay',  key: 'donchian' },
  vpro:     { kind: 'overlay',  key: 'volumeProfile' },
  pivots:   { kind: 'overlay',  key: 'pivotPoints' },
  autofib:  { kind: 'overlay',  key: 'autoFib' },
  zigzag:   { kind: 'overlay',  key: 'zigzag' },
  orderblk: { kind: 'overlay',  key: 'orderBlocks' },
  liqzones: { kind: 'overlay',  key: 'liqZones' },
  rsi:      { kind: 'subpane',  key: 'rsi' },
  macd:     { kind: 'subpane',  key: 'macd' },
  sto:      { kind: 'subpane',  key: 'stochastic' },
  adx:      { kind: 'subpane',  key: 'adx' },
  cci:      { kind: 'subpane',  key: 'cci' },
  mom:      { kind: 'subpane',  key: 'momentum' },
  willr:    { kind: 'subpane',  key: 'williamsR' },
  histvol:  { kind: 'subpane',  key: 'histVol' },
  obv:      { kind: 'subpane',  key: 'obv' },
  cmf:      { kind: 'subpane',  key: 'cmf' },
  mfi:      { kind: 'subpane',  key: 'mfi' },
  cvd:      { kind: 'subpane',  key: 'cvd' },
  // atr has no standalone sub-pane in ChartEngine — omit
};

// ── Indicators Menu ──────────────────────────────────────────────────────────
function IndicatorsButton() {
  const { state, dispatch } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  function isActive(indId: string): boolean {
    const mapping = IND_CFG[indId];
    if (!mapping) return false;
    if (mapping.kind === 'overlay') return !!state.chartConfig[mapping.key];
    return state.chartSubPanes.includes(mapping.key);
  }

  function toggleIndicator(indId: string) {
    const mapping = IND_CFG[indId];
    if (!mapping) return;
    if (mapping.kind === 'overlay') {
      dispatch({ type: 'TOGGLE_CHART_INDICATOR', key: mapping.key });
    } else {
      dispatch({ type: 'TOGGLE_CHART_SUBPANE', key: mapping.key });
    }
  }

  const activeCount = INDICATOR_LIBRARY.filter(ind => isActive(ind.id)).length;

  const filtered = INDICATOR_LIBRARY.filter(ind => {
    if (category !== 'all' && ind.category !== category) return false;
    if (search && !ind.name.toLowerCase().includes(search.toLowerCase()) && !ind.shortName.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <CmdBtn active={open} onClick={() => { setOpen(!open); setSearch(''); setCategory('all'); }}>
        <TrendingUp size={13} />
        <span>Indicators</span>
        {activeCount > 0 && (
          <span style={{
            fontSize: 9, fontWeight: 700, color: '#fff',
            background: T.accent, borderRadius: 6, padding: '0 4px', height: 14,
            display: 'inline-flex', alignItems: 'center',
          }}>
            {activeCount}
          </span>
        )}
      </CmdBtn>
      {open && (
        <div style={{
          position: 'absolute', top: 32, left: 0, zIndex: 100,
          background: T.surface, border: `1px solid ${T.border}`,
          borderRadius: T.r4, boxShadow: T.shadowFloat,
          width: 280, maxHeight: 380, display: 'flex', flexDirection: 'column',
        }}>
          {/* Search */}
          <div style={{ padding: '6px 8px', borderBottom: `1px solid ${T.border}` }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '0 8px', height: 28, borderRadius: 3,
              background: T.surfaceAlt, border: `1px solid ${T.border}`,
            }}>
              <Search size={12} color={T.text3} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search indicators..."
                autoFocus
                style={{
                  flex: 1, border: 'none', outline: 'none', background: 'transparent',
                  fontSize: 11, color: T.text1, fontFamily: T.font,
                }}
              />
            </div>
          </div>
          {/* Category tabs */}
          <div style={{ display: 'flex', gap: 0, padding: '4px 8px', borderBottom: `1px solid ${T.border}`, flexWrap: 'wrap' }}>
            {INDICATOR_CATEGORIES.map(cat => (
              <button
                key={cat.id}
                onClick={() => setCategory(cat.id)}
                style={{
                  ...btnBase, padding: '0 6px', height: 22, fontSize: 10,
                  background: category === cat.id ? T.accentBg : 'transparent',
                  color: category === cat.id ? T.accent : T.text3,
                  fontFamily: T.font, fontWeight: category === cat.id ? 600 : 400,
                }}
              >
                {cat.name}
              </button>
            ))}
          </div>
          {/* List */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '2px 0' }}>
            {filtered.map(ind => {
              const added = isActive(ind.id);
              const mapped = !!IND_CFG[ind.id];
              return (
                <div
                  key={ind.id}
                  onClick={() => toggleIndicator(ind.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '5px 10px', cursor: mapped ? 'pointer' : 'default',
                    background: added ? T.panelActive : 'transparent',
                    opacity: mapped ? 1 : 0.4,
                  }}
                  onMouseEnter={e => { if (mapped) (e.currentTarget as HTMLElement).style.background = added ? T.panelActive : T.panelHover; }}
                  onMouseLeave={e => { if (mapped) (e.currentTarget as HTMLElement).style.background = added ? T.panelActive : 'transparent'; }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: ind.color, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 500, color: T.text1, fontFamily: T.font }}>{ind.name}</div>
                    <div style={{ fontSize: 9, color: T.text3, fontFamily: T.font }}>{ind.shortName}{ind.defaultParams ? ` (${ind.defaultParams})` : ''}</div>
                  </div>
                  <span style={{ fontSize: 9, color: T.text3, fontFamily: T.font, textTransform: 'uppercase' as const }}>{ind.pane === 'overlay' ? 'OVR' : 'SEP'}</span>
                  {added && <Check size={11} color={T.accent} />}
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div style={{ padding: '16px 10px', fontSize: 11, color: T.text3, textAlign: 'center' }}>No indicators found</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Chart Layout Switcher ────────────────────────────────────────────────────
const LAYOUT_OPTIONS: { id: ChartLayout; title: string; icon: React.ReactNode }[] = [
  {
    id: '1',
    title: 'Single chart',
    icon: (
      <svg width={14} height={14} viewBox="0 0 14 14" fill="none">
        <rect x={1} y={1} width={12} height={12} rx={1} stroke="currentColor" strokeWidth={1.5} fill="none" />
      </svg>
    ),
  },
  {
    id: '2h',
    title: 'Two charts — horizontal split',
    icon: (
      <svg width={14} height={14} viewBox="0 0 14 14" fill="none">
        <rect x={1} y={1} width={5.5} height={12} rx={1} stroke="currentColor" strokeWidth={1.5} fill="none" />
        <rect x={7.5} y={1} width={5.5} height={12} rx={1} stroke="currentColor" strokeWidth={1.5} fill="none" />
      </svg>
    ),
  },
  {
    id: '2v',
    title: 'Two charts — vertical split',
    icon: (
      <svg width={14} height={14} viewBox="0 0 14 14" fill="none">
        <rect x={1} y={1} width={12} height={5.5} rx={1} stroke="currentColor" strokeWidth={1.5} fill="none" />
        <rect x={1} y={7.5} width={12} height={5.5} rx={1} stroke="currentColor" strokeWidth={1.5} fill="none" />
      </svg>
    ),
  },
  {
    id: '4',
    title: 'Four charts — 2×2 grid',
    icon: (
      <svg width={14} height={14} viewBox="0 0 14 14" fill="none">
        <rect x={1} y={1} width={5.5} height={5.5} rx={1} stroke="currentColor" strokeWidth={1.5} fill="none" />
        <rect x={7.5} y={1} width={5.5} height={5.5} rx={1} stroke="currentColor" strokeWidth={1.5} fill="none" />
        <rect x={1} y={7.5} width={5.5} height={5.5} rx={1} stroke="currentColor" strokeWidth={1.5} fill="none" />
        <rect x={7.5} y={7.5} width={5.5} height={5.5} rx={1} stroke="currentColor" strokeWidth={1.5} fill="none" />
      </svg>
    ),
  },
];

function LayoutSwitcher() {
  const { state, dispatch } = useWorkspace();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      {LAYOUT_OPTIONS.map(opt => {
        const active = state.chartLayout === opt.id;
        return (
          <button
            key={opt.id}
            title={opt.title}
            onClick={() => dispatch({ type: 'SET_CHART_LAYOUT', layout: opt.id })}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 24, height: 24, borderRadius: 3,
              border: `1px solid ${active ? T.accent : T.border}`,
              background: active ? T.accentBg : 'transparent',
              color: active ? T.accent : T.text3,
              cursor: 'pointer', outline: 'none',
              transition: 'all 0.1s',
            }}
            onMouseEnter={e => { if (!active) { e.currentTarget.style.background = T.hover; e.currentTarget.style.color = T.text2; } }}
            onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.text3; } }}
          >
            {opt.icon}
          </button>
        );
      })}
    </div>
  );
}

function CrosshairSyncToggle() {
  const { state, dispatch } = useWorkspace();
  const on = state.crosshairSyncEnabled;
  return (
    <button
      title={on ? 'Crosshair sync ON — click to disable' : 'Crosshair sync OFF — click to enable'}
      onClick={() => dispatch({ type: 'TOGGLE_CROSSHAIR_SYNC' })}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 24, height: 24, borderRadius: 3,
        border: `1px solid ${on ? T.accent : T.border}`,
        background: on ? T.accentBg : 'transparent',
        color: on ? T.accent : T.text3,
        cursor: 'pointer', outline: 'none', transition: 'all 0.1s',
      }}
      onMouseEnter={e => { if (!on) { e.currentTarget.style.background = T.hover; e.currentTarget.style.color = T.text2; } }}
      onMouseLeave={e => { if (!on) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.text3; } }}
    >
      {on ? <Link2 size={11} /> : <Link2Off size={11} />}
    </button>
  );
}

function ScaleModeSelector() {
  const { state, dispatch } = useWorkspace();
  const modes: { id: 'linear' | 'log' | 'percent'; label: string; title: string }[] = [
    { id: 'linear', label: 'Lin', title: 'Linear price scale' },
    { id: 'log',    label: 'Log', title: 'Logarithmic price scale' },
    { id: 'percent', label: '%',  title: 'Percentage price scale' },
  ];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      {modes.map(m => {
        const active = state.priceScaleMode === m.id;
        return (
          <button
            key={m.id}
            title={m.title}
            onClick={() => dispatch({ type: 'SET_PRICE_SCALE_MODE', mode: m.id })}
            style={{
              height: 20, padding: '0 6px', borderRadius: 3,
              border: `1px solid ${active ? T.accent : T.border}`,
              background: active ? T.accentBg : 'transparent',
              color: active ? T.accent : T.text3,
              fontSize: 9, fontWeight: 600, cursor: 'pointer', outline: 'none',
              fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.04em',
              transition: 'all 0.1s',
            }}
            onMouseEnter={e => { if (!active) { e.currentTarget.style.background = T.hover; e.currentTarget.style.color = T.text2; } }}
            onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.text3; } }}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
}

function PrevLevelsToggle() {
  const { state, dispatch } = useWorkspace();
  const active = state.showPrevLevels;
  return (
    <button
      title={active ? 'Hide previous day OHLC levels' : 'Show previous day OHLC levels'}
      onClick={() => dispatch({ type: 'TOGGLE_PREV_LEVELS' })}
      style={{
        height: 20, padding: '0 6px', borderRadius: 3,
        border: `1px solid ${active ? T.accent : T.border}`,
        background: active ? T.accentBg : 'transparent',
        color: active ? T.accent : T.text3,
        fontSize: 9, fontWeight: 600, cursor: 'pointer', outline: 'none',
        fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.04em',
        transition: 'all 0.1s',
        flexShrink: 0,
      }}
      onMouseEnter={e => { if (!active) { e.currentTarget.style.background = T.hover; e.currentTarget.style.color = T.text2; } }}
      onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.text3; } }}
    >
      PDH/L
    </button>
  );
}

function OpenLevelsToggle() {
  const { state, dispatch } = useWorkspace();
  const active = state.showOpenLevels;
  return (
    <button
      title={active ? 'Hide ICT open levels (DOL/WOL/Asia)' : 'Show ICT open levels (DOL/WOL/Asia)'}
      onClick={() => dispatch({ type: 'TOGGLE_OPEN_LEVELS' })}
      style={{
        height: 20, padding: '0 6px', borderRadius: 3,
        border: `1px solid ${active ? T.accent : T.border}`,
        background: active ? T.accentBg : 'transparent',
        color: active ? T.accent : T.text3,
        fontSize: 9, fontWeight: 600, cursor: 'pointer', outline: 'none',
        fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.04em',
        transition: 'all 0.1s',
        flexShrink: 0,
      }}
      onMouseEnter={e => { if (!active) { e.currentTarget.style.background = T.hover; e.currentTarget.style.color = T.text2; } }}
      onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.text3; } }}
    >
      DOL/WOL
    </button>
  );
}

function PivotsToggle() {
  const { state, dispatch } = useWorkspace();
  const active = state.showPivots;
  return (
    <button
      title={active ? 'Hide swing pivot high/low' : 'Show swing pivot high/low'}
      onClick={() => dispatch({ type: 'TOGGLE_PIVOTS' })}
      style={{
        height: 20, padding: '0 6px', borderRadius: 3,
        border: `1px solid ${active ? T.accent : T.border}`,
        background: active ? T.accentBg : 'transparent',
        color: active ? T.accent : T.text3,
        fontSize: 9, fontWeight: 600, cursor: 'pointer', outline: 'none',
        fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.04em',
        transition: 'all 0.1s',
        flexShrink: 0,
      }}
      onMouseEnter={e => { if (!active) { e.currentTarget.style.background = T.hover; e.currentTarget.style.color = T.text2; } }}
      onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.text3; } }}
    >
      PIVOTS
    </button>
  );
}

function CandlePatternsToggle() {
  const { state, dispatch } = useWorkspace();
  const active = state.showCandlePatterns;
  return (
    <button
      title={active ? 'Hide candle pattern labels' : 'Show candle pattern labels (Doji, Hammer, Engulfing…)'}
      onClick={() => dispatch({ type: 'TOGGLE_CANDLE_PATTERNS' })}
      style={{
        height: 20, padding: '0 6px', borderRadius: 3,
        border: `1px solid ${active ? T.accent : T.border}`,
        background: active ? T.accentBg : 'transparent',
        color: active ? T.accent : T.text3,
        fontSize: 9, fontWeight: 600, cursor: 'pointer', outline: 'none',
        fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.04em',
        transition: 'all 0.1s',
        flexShrink: 0,
      }}
      onMouseEnter={e => { if (!active) { e.currentTarget.style.background = T.hover; e.currentTarget.style.color = T.text2; } }}
      onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.text3; } }}
    >
      CNDL
    </button>
  );
}

function SessionRangesToggle() {
  const { state, dispatch } = useWorkspace();
  const active = state.showSessionRanges;
  return (
    <button
      title={active ? 'Hide session range boxes' : 'Show session range boxes (Asia / London / NY)'}
      onClick={() => dispatch({ type: 'TOGGLE_SESSION_RANGES' })}
      style={{
        height: 20, padding: '0 6px', borderRadius: 3,
        border: `1px solid ${active ? T.accent : T.border}`,
        background: active ? T.accentBg : 'transparent',
        color: active ? T.accent : T.text3,
        fontSize: 9, fontWeight: 600, cursor: 'pointer', outline: 'none',
        fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.04em',
        transition: 'all 0.1s',
        flexShrink: 0,
      }}
      onMouseEnter={e => { if (!active) { e.currentTarget.style.background = T.hover; e.currentTarget.style.color = T.text2; } }}
      onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.text3; } }}
    >
      SESS
    </button>
  );
}

function AutoFibToggle() {
  const { state, dispatch } = useWorkspace();
  const active = state.showAutoFib;
  return (
    <button
      title={active ? 'Hide auto Fibonacci retracement' : 'Show auto Fibonacci retracement (dominant viewport swing)'}
      onClick={() => dispatch({ type: 'TOGGLE_AUTO_FIB' })}
      style={{
        height: 20, padding: '0 6px', borderRadius: 3,
        border: `1px solid ${active ? T.accent : T.border}`,
        background: active ? T.accentBg : 'transparent',
        color: active ? T.accent : T.text3,
        fontSize: 9, fontWeight: 600, cursor: 'pointer', outline: 'none',
        fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.04em',
        transition: 'all 0.1s',
        flexShrink: 0,
      }}
      onMouseEnter={e => { if (!active) { e.currentTarget.style.background = T.hover; e.currentTarget.style.color = T.text2; } }}
      onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.text3; } }}
    >
      FIBO
    </button>
  );
}

function KillZonesToggle() {
  const { state, dispatch } = useWorkspace();
  const active = state.showKillZones;
  return (
    <button
      title={active ? 'Hide ICT Kill Zones' : 'Show ICT Kill Zones (London / NY AM / NY PM)'}
      onClick={() => dispatch({ type: 'TOGGLE_KILL_ZONES' })}
      style={{
        height: 20, padding: '0 6px', borderRadius: 3,
        border: `1px solid ${active ? T.accent : T.border}`,
        background: active ? T.accentBg : 'transparent',
        color: active ? T.accent : T.text3,
        fontSize: 9, fontWeight: 600, cursor: 'pointer', outline: 'none',
        fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.04em',
        transition: 'all 0.1s',
        flexShrink: 0,
      }}
      onMouseEnter={e => { if (!active) { e.currentTarget.style.background = T.hover; e.currentTarget.style.color = T.text2; } }}
      onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.text3; } }}
    >
      KZ
    </button>
  );
}

function EQHLToggle() {
  const { state, dispatch } = useWorkspace();
  const active = state.showEQHL;
  return (
    <button
      title={active ? 'Hide Equal Highs / Equal Lows' : 'Show Equal Highs / Equal Lows (liquidity clusters)'}
      onClick={() => dispatch({ type: 'TOGGLE_EQHL' })}
      style={{
        height: 20, padding: '0 6px', borderRadius: 3,
        border: `1px solid ${active ? T.accent : T.border}`,
        background: active ? T.accentBg : 'transparent',
        color: active ? T.accent : T.text3,
        fontSize: 9, fontWeight: 600, cursor: 'pointer', outline: 'none',
        fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.04em',
        transition: 'all 0.1s',
        flexShrink: 0,
      }}
      onMouseEnter={e => { if (!active) { e.currentTarget.style.background = T.hover; e.currentTarget.style.color = T.text2; } }}
      onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.text3; } }}
    >
      EQL/H
    </button>
  );
}

// ── News Events Overlay Toggle ────────────────────────────────────────────────
function NewsOverlayToggle() {
  const { state, dispatch } = useWorkspace();
  const active = state.showNewsOverlay;
  return (
    <button
      title={active ? 'Hide news events on chart' : 'Show news events on chart timeline'}
      onClick={() => dispatch({ type: 'TOGGLE_NEWS_OVERLAY' })}
      style={{
        height: 20, padding: '0 6px', borderRadius: 3,
        border: `1px solid ${active ? T.accent : T.border}`,
        background: active ? T.accentBg : 'transparent',
        color: active ? T.accent : T.text2,
        fontSize: 9, fontWeight: 700, cursor: 'pointer',
        outline: 'none', fontFamily: T.font, letterSpacing: '0.04em',
      }}
    >
      NEWS
    </button>
  );
}

// ── Compare Symbol Overlay ────────────────────────────────────────────────────
const COMPARE_COLORS = ['#2196F3', '#FF9800', '#AB47BC', '#26C6DA'];

function CompareButton() {
  const { state, dispatch } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const addSymbol = () => {
    const sym = input.trim().toUpperCase();
    if (!sym || sym === state.symbol) return;
    dispatch({ type: 'ADD_COMPARE', symbol: sym });
    setInput('');
  };

  const hasCompare = state.compareSymbols.length > 0;

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      {/* Active compare chips */}
      {state.compareSymbols.map((sym, i) => (
        <span key={sym} style={{
          display: 'inline-flex', alignItems: 'center', gap: 3,
          height: 20, padding: '0 5px', borderRadius: 3, marginRight: 2,
          border: `1px solid ${COMPARE_COLORS[i % COMPARE_COLORS.length]}40`,
          background: `${COMPARE_COLORS[i % COMPARE_COLORS.length]}18`,
          color: COMPARE_COLORS[i % COMPARE_COLORS.length],
          fontSize: 9, fontWeight: 600,
          fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.04em',
        }}>
          {sym}
          <button
            onClick={() => dispatch({ type: 'REMOVE_COMPARE', symbol: sym })}
            style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', color: 'inherit', lineHeight: 1, fontSize: 10, opacity: 0.7 }}
          >×</button>
        </span>
      ))}
      {/* Toggle button */}
      <button
        title="Compare with another symbol"
        onClick={() => setOpen(o => !o)}
        style={{
          height: 20, padding: '0 6px', borderRadius: 3,
          border: `1px solid ${hasCompare ? T.accent : T.border}`,
          background: open ? T.accentBg : 'transparent',
          color: open || hasCompare ? T.accent : T.text3,
          fontSize: 9, fontWeight: 600, cursor: 'pointer', outline: 'none',
          fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.04em',
          transition: 'all 0.1s', flexShrink: 0,
        }}
        onMouseEnter={e => { if (!open && !hasCompare) { e.currentTarget.style.background = T.hover; e.currentTarget.style.color = T.text2; } }}
        onMouseLeave={e => { if (!open && !hasCompare) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.text3; } }}
      >
        + CMP
      </button>
      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute', top: 26, right: 0, zIndex: 200,
          background: T.panelBg, border: `1px solid ${T.border}`, borderRadius: 4,
          padding: '8px 8px', minWidth: 180, boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        }}>
          <div style={{ fontSize: 9, color: T.text3, fontFamily: T.font, marginBottom: 6, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            Compare Symbol (max 4)
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <input
              autoFocus
              value={input}
              onChange={e => setInput(e.target.value.toUpperCase())}
              onKeyDown={e => { if (e.key === 'Enter') { addSymbol(); } }}
              placeholder="e.g. AAPL"
              style={{
                flex: 1, height: 24, padding: '0 6px', borderRadius: 3,
                border: `1px solid ${T.border}`, background: T.surfaceAlt,
                color: T.text1, fontSize: 10, fontFamily: T.mono, outline: 'none',
              }}
            />
            <button
              onClick={addSymbol}
              style={{
                height: 24, padding: '0 8px', borderRadius: 3, border: 'none',
                background: T.accent, color: '#fff', fontSize: 10, fontWeight: 600,
                cursor: 'pointer', fontFamily: T.font, outline: 'none',
              }}
            >+</button>
          </div>
          {state.compareSymbols.length > 0 && (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 3 }}>
              {state.compareSymbols.map((sym, i) => (
                <div key={sym} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: COMPARE_COLORS[i % COMPARE_COLORS.length], flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 10, color: T.text1, fontFamily: T.mono }}>{sym}</span>
                  <button
                    onClick={() => dispatch({ type: 'REMOVE_COMPARE', symbol: sym })}
                    style={{ border: 'none', background: 'none', cursor: 'pointer', color: T.text3, padding: '1px 3px', borderRadius: 2, fontSize: 11 }}
                    onMouseEnter={e => { e.currentTarget.style.color = T.bear; }}
                    onMouseLeave={e => { e.currentTarget.style.color = T.text3; }}
                  >×</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Quick Layout Switcher ─────────────────────────────────────────────────────
const LAYOUTS_STORAGE_KEY    = 'ordr_named_layouts';
const ACTIVE_LAYOUT_STOR_KEY = 'ordr_active_layout_id';

function loadCmdLayouts() {
  try { return JSON.parse(localStorage.getItem(LAYOUTS_STORAGE_KEY) ?? '[]') as { id: string; name: string; savedAt: number; updatedAt?: number; snapshot: { symbol: string; timeframe: string } }[]; }
  catch { return []; }
}

function QuickLayoutSwitcher() {
  const { state, dispatch } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [layouts, setLayouts] = useState<ReturnType<typeof loadCmdLayouts>>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveInput, setSaveInput] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLayouts(loadCmdLayouts());
    setActiveId(localStorage.getItem(ACTIVE_LAYOUT_STOR_KEY));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onClickOut(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener('mousedown', onClickOut);
    return () => document.removeEventListener('mousedown', onClickOut);
  }, [open]);

  const activeLayout = layouts.find(l => l.id === activeId);

  const doQuickSave = useCallback(() => {
    if (!saveInput.trim()) return;
    const snap = {
      mode: state.mode, leftTab: state.leftTab, rightTab: state.rightTab, bottomTab: state.bottomTab,
      symbol: state.symbol, timeframe: state.timeframe, chartType: state.chartType,
      chartLayout: state.chartLayout, secondaryCharts: state.secondaryCharts,
      indicators: state.indicators, chartSubPanes: state.chartSubPanes, chartConfig: state.chartConfig,
      showSR: state.showSR, showFVG: state.showFVG,
      priceScaleMode: state.priceScaleMode, showPrevLevels: state.showPrevLevels, enabledSessions: state.enabledSessions,
    };
    const layout = { id: Math.random().toString(36).slice(2), name: saveInput.trim(), savedAt: Date.now(), snapshot: snap };
    const next = [layout, ...loadCmdLayouts()].slice(0, 50);
    localStorage.setItem(LAYOUTS_STORAGE_KEY, JSON.stringify(next));
    localStorage.setItem(ACTIVE_LAYOUT_STOR_KEY, layout.id);
    setLayouts(next); setActiveId(layout.id); setSaving(false); setSaveInput(''); setOpen(false);
  }, [state, saveInput]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(prev => !prev)}
        title="Layout switcher"
        style={{
          display: 'flex', alignItems: 'center', gap: 4, height: 24,
          padding: '0 7px', borderRadius: 3, border: `1px solid ${open ? T.accent : T.border}`,
          background: open ? T.accentBg : 'transparent',
          color: open ? T.accent : T.text2, cursor: 'pointer', outline: 'none',
          fontSize: 10, fontFamily: T.font, fontWeight: 500,
        }}
        onMouseEnter={e => { if (!open) { e.currentTarget.style.background = T.hover; e.currentTarget.style.color = T.text1; } }}
        onMouseLeave={e => { if (!open) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.text2; } }}
      >
        <LayoutGrid size={11} />
        <span style={{ maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {activeLayout ? activeLayout.name : 'Layouts'}
        </span>
        {layouts.length > 0 && (
          <span style={{ fontSize: 8, color: T.text3, background: T.borderLight, borderRadius: 2, padding: '0 3px', minWidth: 14, textAlign: 'center' }}>
            {layouts.length}
          </span>
        )}
        <ChevronDown size={9} />
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 3,
          width: 220, background: T.surface, border: `1px solid ${T.border}`,
          borderRadius: 6, zIndex: 500, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          overflow: 'hidden',
        }}>
          {/* Quick save row */}
          {saving ? (
            <div style={{ display: 'flex', gap: 4, padding: '8px' }}>
              <input
                autoFocus value={saveInput}
                onChange={e => setSaveInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') doQuickSave(); if (e.key === 'Escape') setSaving(false); }}
                placeholder="Layout name…"
                style={{ flex: 1, height: 24, padding: '0 7px', borderRadius: 3, border: `1px solid ${T.accent}`, background: T.surfaceAlt, color: T.text1, fontSize: 10, fontFamily: T.font, outline: 'none' }}
              />
              <button onClick={doQuickSave} style={{ height: 24, padding: '0 8px', borderRadius: 3, border: 'none', background: T.accent, color: '#fff', fontSize: 9, fontWeight: 600, cursor: 'pointer', outline: 'none' }}>Save</button>
              <button onClick={() => setSaving(false)} style={{ width: 24, height: 24, borderRadius: 3, border: `1px solid ${T.border}`, background: 'none', color: T.text2, cursor: 'pointer', outline: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={9} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => { setSaving(true); setSaveInput(''); }}
              style={{ display: 'flex', alignItems: 'center', gap: 5, width: '100%', padding: '8px 12px', border: 'none', background: 'transparent', color: T.text2, cursor: 'pointer', fontSize: 10, fontFamily: T.font, fontWeight: 500 }}
              onMouseEnter={e => { e.currentTarget.style.background = T.hover; e.currentTarget.style.color = T.text1; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.text2; }}
            >
              <Save size={11} /> Save current layout…
            </button>
          )}

          {layouts.length > 0 && <div style={{ height: 1, background: T.border }} />}

          {/* Layout list */}
          <div style={{ maxHeight: 220, overflowY: 'auto' }}>
            {layouts.slice(0, 15).map((l, i) => {
              const isActive = l.id === activeId;
              return (
                <button
                  key={l.id}
                  onClick={() => {
                    try {
                      const full = (loadCmdLayouts() as { id: string; snapshot: Record<string, unknown> }[]).find(x => x.id === l.id);
                      if (full) {
                        dispatch({ type: 'RESTORE_LAYOUT', layout: full.snapshot as Parameters<typeof dispatch>[0] extends { type: 'RESTORE_LAYOUT'; layout: infer L } ? L : never });
                        setActiveId(l.id);
                        localStorage.setItem(ACTIVE_LAYOUT_STOR_KEY, l.id);
                      }
                    } catch { /* ignore */ }
                    setOpen(false);
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                    padding: '7px 12px', border: 'none', cursor: 'pointer',
                    background: isActive ? T.selectedBg : 'transparent',
                    color: isActive ? T.accent : T.text1, textAlign: 'left',
                    fontSize: 10, fontFamily: T.font, fontWeight: isActive ? 600 : 400,
                  }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = T.hover; }}
                  onMouseLeave={e => { e.currentTarget.style.background = isActive ? T.selectedBg : 'transparent'; }}
                >
                  {i < 5 && (
                    <span style={{ fontSize: 7, fontFamily: T.mono, color: isActive ? T.accent : T.text3, background: T.borderLight, borderRadius: 2, padding: '1px 3px', flexShrink: 0 }}>
                      ⌃{i + 1}
                    </span>
                  )}
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</span>
                  <span style={{ fontSize: 8, color: T.text3, flexShrink: 0 }}>{l.snapshot.symbol} · {l.snapshot.timeframe}</span>
                  {isActive && <Check size={9} color={T.accent} />}
                </button>
              );
            })}
            {layouts.length > 15 && (
              <div style={{ padding: '6px 12px', fontSize: 9, color: T.text3, fontFamily: T.font }}>
                +{layouts.length - 15} more — open Layouts panel
              </div>
            )}
          </div>

          {/* Open layouts panel */}
          <div style={{ height: 1, background: T.border }} />
          <button
            onClick={() => { dispatch({ type: 'SET_LEFT_TAB', tab: 'layouts' }); setOpen(false); }}
            style={{ display: 'flex', alignItems: 'center', gap: 5, width: '100%', padding: '7px 12px', border: 'none', background: 'transparent', color: T.text3, cursor: 'pointer', fontSize: 9, fontFamily: T.font }}
            onMouseEnter={e => { e.currentTarget.style.background = T.hover; e.currentTarget.style.color = T.text2; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.text3; }}
          >
            <LayoutGrid size={9} /> Manage layouts…
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main Command Bar ─────────────────────────────────────────────────────────
// ── Keyboard Shortcuts Modal ─────────────────────────────────────────────────
const SHORTCUT_GROUPS = [
  {
    label: 'POINTER & DRAWING',
    rows: [
      ['V',       'Cursor / Pointer'],
      ['⇧V',      'Crosshair'],
      ['Esc',     'Cancel active drawing'],
      ['Alt+T',   'Trend Line'],
      ['H',       'Horizontal Line'],
      ['F',       'Fibonacci Retracement'],
      ['R',       'Rectangle'],
      ['M',       'Price & Date Range'],
      ['N',       'Text Note'],
    ],
  },
  {
    label: 'TIMEFRAMES',
    rows: [
      ['1',  '1 Minute'],
      ['5',  '5 Minutes'],
      ['15', '15 Minutes'],
      ['30', '30 Minutes'],
      ['60', '1 Hour'],
      ['D',  'Daily'],
      ['W',  'Weekly'],
    ],
  },
  {
    label: 'CHART & NAVIGATION',
    rows: [
      ['Type any letter/number', 'Open symbol search'],
      ['?',                      'Show / hide shortcuts'],
      ['Ctrl+S',                 'Save current layout'],
      ['Ctrl+B',                 'Toggle watchlist panel'],
      ['Ctrl+J',                 'Toggle MTF strip'],
      ['F11',                    'Focus mode toggle'],
      ['Alt+⇧X',                 'Reset chart view'],
    ],
  },
];

function KeyboardShortcutsModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6,
          width: 460, maxHeight: '70vh', overflowY: 'auto',
          boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', padding: '12px 16px',
          borderBottom: `1px solid ${T.border}`,
        }}>
          <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: T.text1, fontFamily: T.font }}>
            Keyboard Shortcuts
          </span>
          <span style={{ fontSize: 9, color: T.text3, fontFamily: T.mono, marginRight: 12 }}>Press ? to toggle</span>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: T.text3, display: 'flex', padding: 2 }}>
            <X size={14} />
          </button>
        </div>
        {/* Groups */}
        <div style={{ padding: '8px 16px 16px' }}>
          {SHORTCUT_GROUPS.map(grp => (
            <div key={grp.label} style={{ marginTop: 14 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: T.text3, letterSpacing: '0.07em', marginBottom: 6, fontFamily: T.font }}>
                {grp.label}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {grp.rows.map(([key, desc]) => (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '3px 0' }}>
                    <span style={{
                      minWidth: 120, fontSize: 10, fontFamily: T.mono, fontWeight: 600,
                      color: T.accent, background: T.accentBg, padding: '2px 6px', borderRadius: 3,
                      flexShrink: 0,
                    }}>
                      {key}
                    </span>
                    <span style={{ fontSize: 11, color: T.text2, fontFamily: T.font }}>{desc}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function CommandBar() {
  const { state, dispatch, symbolInfo } = useWorkspace();
  const bull = symbolInfo.change >= 0;
  const priceColor = bull ? T.bull : T.bear;
  const [showShortcuts, setShowShortcuts] = useState(false);

  // '?' key toggles shortcuts modal
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== '?') return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      e.preventDefault();
      setShowShortcuts(prev => !prev);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <>
    <div style={{
      display: 'flex', alignItems: 'center', height: T.cmdBarH,
      background: T.surface, borderBottom: `1px solid ${T.border}`,
      padding: '0 8px', gap: 0, flexShrink: 0, fontFamily: T.font, zIndex: 30,
    }}>
      {/* ── LEFT ZONE ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: T.text1, letterSpacing: '0.06em' }}>ORDR</span>
        <span style={{ fontSize: 9, fontWeight: 600, color: T.accent, letterSpacing: '0.08em' }}>MKT</span>
      </div>

      <Separator />
      <ModeSelector />
      <Separator />
      <SymbolSearch />

      {/* Exchange badge */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 3,
        padding: '0 5px', height: 16, borderRadius: 2,
        background: T.borderLight, flexShrink: 0, marginLeft: 4,
      }}>
        <span style={{ fontSize: 9, fontWeight: 600, color: T.text2, letterSpacing: '0.04em' }}>{symbolInfo.exchange}</span>
        <span style={{ fontSize: 9, color: T.text3 }}>·</span>
        <span style={{ fontSize: 9, fontWeight: 500, color: T.text3 }}>{symbolInfo.market}</span>
      </div>

      <Separator />

      {/* ── CENTER ZONE ── */}
      {/* Price */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, flexShrink: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: priceColor, fontFamily: T.font, letterSpacing: '-0.4px', fontVariantNumeric: 'tabular-nums' }}>
          {formatPrice(symbolInfo.price)}
        </span>
        <span style={{ fontSize: 10, fontWeight: 500, color: priceColor }}>
          {bull ? '+' : ''}{formatPrice(symbolInfo.change)}
        </span>
        <span style={{ fontSize: 10, color: priceColor, opacity: 0.85 }}>
          ({bull ? '+' : ''}{symbolInfo.changePct.toFixed(2)}%)
        </span>
      </div>

      {/* OHLC */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginLeft: 8, flexShrink: 0 }}>
        {(['O', 'H', 'L', 'C'] as const).map(lbl => {
          const val = { O: symbolInfo.open, H: symbolInfo.high, L: symbolInfo.low, C: symbolInfo.close }[lbl];
          return (
            <div key={lbl} style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
              <span style={{ fontSize: 9, fontWeight: 600, color: T.text3, fontFamily: T.font }}>{lbl}</span>
              <span style={{ fontSize: 10, color: T.text2, fontFamily: T.mono, letterSpacing: '-0.3px', fontVariantNumeric: 'tabular-nums' }}>
                {formatPrice(val)}
              </span>
            </div>
          );
        })}
      </div>

      <Separator />
      <TimeframeRow />
      <Separator />
      <ChartTypeSelector />
      <Separator />

      {/* Indicators + overlays */}
      <IndicatorsButton />

      <CmdBtn active={state.showSR} onClick={() => dispatch({ type: 'TOGGLE_SR' })} title="Support / Resistance">
        <Layers size={13} />
        <span>S/R</span>
      </CmdBtn>

      <CmdBtn active={state.showFVG} onClick={() => dispatch({ type: 'TOGGLE_FVG' })} title="Fair Value Gaps">
        <SlidersHorizontal size={13} />
        <span>FVG</span>
      </CmdBtn>

      {/* Session quick-toggles */}
      {[
        { key: 'london',  label: 'LON' },
        { key: 'newyork', label: 'NY' },
        { key: 'tokyo',   label: 'TKY' },
      ].map(({ key, label }) => (
        <CmdBtn
          key={key}
          active={state.enabledSessions.includes(key)}
          onClick={() => dispatch({ type: 'TOGGLE_SESSION', session: key })}
          title={`${label} session highlight`}
        >
          <Sun size={11} />
          <span>{label}</span>
        </CmdBtn>
      ))}

      <Separator />
      <LayoutSwitcher />
      {state.chartLayout !== '1' && <CrosshairSyncToggle />}
      <Separator />
      <ScaleModeSelector />
      <Separator />
      <PrevLevelsToggle />
      <OpenLevelsToggle />
      <PivotsToggle />
      <CandlePatternsToggle />
      <SessionRangesToggle />
      <AutoFibToggle />
      <KillZonesToggle />
      <EQHLToggle />
      <NewsOverlayToggle />
      <CompareButton />
      <Separator />
      <QuickLayoutSwitcher />

      <div style={{ flex: 1, minWidth: 8 }} />

      {/* ── RIGHT ZONE ── */}
      <a href="/strategy" style={{
        ...btnBase, padding: '0 8px', textDecoration: 'none',
        border: `1px solid ${T.border}`, background: 'transparent', color: T.text2, fontFamily: T.font,
      }}
      onMouseEnter={e => { e.currentTarget.style.background = T.hover; e.currentTarget.style.color = T.text1; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.text2; }}
      >
        <Activity size={11} /><span>Strategy</span>
      </a>
      <a href="/marketplace" style={{
        ...btnBase, padding: '0 8px', textDecoration: 'none', marginLeft: 2,
        border: `1px solid ${T.border}`, background: 'transparent', color: T.text2, fontFamily: T.font,
      }}
      onMouseEnter={e => { e.currentTarget.style.background = T.hover; e.currentTarget.style.color = T.text1; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.text2; }}
      >
        <Star size={11} /><span>Market</span>
      </a>

      <Separator />

      <CmdBtn onClick={() => dispatch({ type: 'SET_RIGHT_TAB', tab: 'ai' })} active={state.rightTab === 'ai'} title="AI Assistant">
        <Bot size={13} />
      </CmdBtn>
      <CmdBtn onClick={() => dispatch({ type: 'SET_RIGHT_TAB', tab: 'alerts' })} active={state.rightTab === 'alerts'} title="Alerts">
        <Bell size={13} />
      </CmdBtn>
      <CmdBtn onClick={() => dispatch({ type: 'SET_BOTTOM_TAB', tab: 'replay' })} active={state.bottomTab === 'replay'} title="Bar Replay">
        <PlaySquare size={13} />
      </CmdBtn>

      <Separator />
      <CmdBtn onClick={() => dispatch({ type: 'CAPTURE_SCREENSHOT' })} title="Download chart as PNG">
        <Camera size={13} />
      </CmdBtn>
      <CmdBtn onClick={() => dispatch({ type: 'COPY_CHART_IMAGE' })} title="Copy chart image to clipboard">
        <Copy size={13} />
      </CmdBtn>
      <CmdBtn
        title="Copy shareable link (symbol + timeframe + indicators)"
        onClick={() => {
          const visibleInds = state.indicators.filter(i => i.visible).map(i => i.id).join(',');
          const url = new URL(window.location.href);
          url.search = '';
          url.searchParams.set('s', state.symbol);
          url.searchParams.set('tf', state.timeframe);
          if (visibleInds) url.searchParams.set('ind', visibleInds);
          navigator.clipboard.writeText(url.toString()).then(() => {
            dispatch({ type: 'ADD_TOAST', toast: { message: 'Share link copied to clipboard', type: 'info' } });
          }).catch(() => {
            dispatch({ type: 'ADD_TOAST', toast: { message: url.toString(), type: 'info' } });
          });
        }}
      >
        <Share2 size={13} />
      </CmdBtn>
      <CmdBtn onClick={() => setShowShortcuts(true)} active={showShortcuts} title="Keyboard Shortcuts (?)">
        <Settings size={13} />
      </CmdBtn>
      <ThemeSwitcher />

      <button
        onClick={() => dispatch({ type: 'SET_RIGHT_TAB', tab: 'trade' })}
        style={{
          ...btnBase, padding: '0 14px', marginLeft: 4,
          background: T.accent, color: '#FFF', fontFamily: T.font,
          fontWeight: 600, letterSpacing: '0.02em',
        }}
        onMouseEnter={e => { e.currentTarget.style.opacity = '0.9'; }}
        onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
      >
        Trade
      </button>
    </div>
    {showShortcuts && <KeyboardShortcutsModal onClose={() => setShowShortcuts(false)} />}
    </>
  );
}
