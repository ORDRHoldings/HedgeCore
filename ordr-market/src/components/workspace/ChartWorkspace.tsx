'use client';
/**
 * ORDR Market — Chart Workspace Shell
 * v2: symbol input box, timeframe favorites + custom + 3m,
 *     indicator chips bar (collapsible), S/R + FVG off by default,
 *     default 30m, last candle centered.
 */

import React, { useState, useRef, useEffect, type CSSProperties } from 'react';
import {
  Search, ChevronDown, CandlestickChart, BarChart2, LineChart, AreaChart,
  TrendingUp, Layout, Bell, Maximize2, Settings, User,
  MousePointer2, Minus, ChevronsUpDown, GitBranch, Layers,
  Square, Circle, Pen, Type, Ruler, Magnet, Lock, Eye, Trash2,
  Bookmark, Calendar, FileText, MessageSquare, HelpCircle,
  RotateCcw, Sliders, PlaySquare, Crosshair, Activity,
  Eraser, LayoutGrid, SlidersHorizontal, Star, X, Plus,
  ChevronLeft, ChevronRight, Check,
} from 'lucide-react';

import { T } from './tokens';
import { ThemeSwitcher } from './ThemeSwitcher';
import {
  IconButton, RailButton, TimeframeButton, QuoteBadge,
  ToolbarSeparator, StatusPill, ToolbarGroup,
} from './primitives';
import { MockCandleChart } from './MockCandleChart';

// ─── Constants ────────────────────────────────────────────────────────────────
const BASE_TIMEFRAMES = ['1m', '3m', '5m', '15m', '30m', '1h', '4h', 'D', 'W', 'M'];
const DEFAULT_FAVORITES = new Set(['30m', 'D', '1h']);

const SYMBOL_DATA: Record<string, {
  name: string; exchange: string; market: string;
  price: number; change: number; changePct: number;
  bid: number; ask: number; open: number; high: number; low: number; close: number;
}> = {
  'EURUSD': { name: 'Euro / U.S. Dollar',  exchange: 'FOREX', market: 'ICE', price: 1.08241, change: +0.00245, changePct: +0.23, bid: 1.08228, ask: 1.08254, open: 1.07996, high: 1.08389, low: 1.07889, close: 1.08241 },
  'GBPUSD': { name: 'British Pound / USD', exchange: 'FOREX', market: 'ICE', price: 1.26831, change: -0.00142, changePct: -0.11, bid: 1.26820, ask: 1.26842, open: 1.26973, high: 1.27124, low: 1.26719, close: 1.26831 },
  'USDJPY': { name: 'USD / Japanese Yen',  exchange: 'FOREX', market: 'ICE', price: 149.412, change: +0.312,   changePct: +0.21, bid: 149.400, ask: 149.424, open: 149.100, high: 149.680, low: 148.990, close: 149.412 },
  'XAUUSD': { name: 'Gold Spot',           exchange: 'COMEX', market: 'CME', price: 2318.45, change: +12.30,   changePct: +0.53, bid: 2318.10, ask: 2318.80, open: 2306.15, high: 2324.90, low: 2301.30, close: 2318.45 },
  'BTCUSD': { name: 'Bitcoin / USD',       exchange: 'CRYPTO', market: 'CB', price: 67842.0, change: +1240.0,  changePct: +1.86, bid: 67830.0, ask: 67854.0, open: 66602.0, high: 68210.0, low: 66401.0, close: 67842.0 },
  'SPX':    { name: 'S&P 500 Index',       exchange: 'INDEX',  market: 'NYSE', price: 5187.67, change: +24.31, changePct: +0.47, bid: 5187.50, ask: 5187.84, open: 5163.36, high: 5198.12, low: 5159.28, close: 5187.67 },
};

const AVAILABLE_INDICATORS = [
  { id: 'rsi',   name: 'RSI',             params: '14',     color: '#9c27b0', value: '62.3'  },
  { id: 'macd',  name: 'MACD',            params: '12,26,9',color: '#2196f3', value: '0.0012'},
  { id: 'bb',    name: 'BB',              params: '20,2',   color: '#ff9800', value: ''      },
  { id: 'ema20', name: 'EMA',             params: '20',     color: '#4caf50', value: '1.0821'},
  { id: 'sma50', name: 'SMA',             params: '50',     color: '#f44336', value: '1.0798'},
  { id: 'vwap',  name: 'VWAP',            params: '',       color: '#607d8b', value: '1.0819'},
  { id: 'sto',   name: 'Stochastic',      params: '14,3',   color: '#00bcd4', value: '71.4'  },
  { id: 'adx',   name: 'ADX',             params: '14',     color: '#795548', value: '28.1'  },
];

const DRAWING_MODES = new Set([
  'trendline', 'hline', 'vline', 'channel', 'pitchfork', 'fib',
  'rect', 'ellipse', 'pen', 'text', 'measure', 'eraser',
]);

// ─── Symbol Selector ──────────────────────────────────────────────────────────
interface SymbolSelectorProps {
  symbol: string;
  onChange: (s: string) => void;
}

function SymbolSelector({ symbol, onChange }: SymbolSelectorProps) {
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState(symbol);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing && inputRef.current) inputRef.current.select(); }, [editing]);

  const commit = (val: string) => {
    const clean = val.trim().toUpperCase() || symbol;
    onChange(clean);
    setEditing(false);
  };

  if (editing) {
    return (
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <input
          ref={inputRef}
          value={draft}
          onChange={e => setDraft(e.target.value.toUpperCase())}
          onKeyDown={e => {
            if (e.key === 'Enter') commit(draft);
            if (e.key === 'Escape') { setDraft(symbol); setEditing(false); }
          }}
          onBlur={() => commit(draft)}
          placeholder="Symbol…"
          style={{
            width: 110,
            height: 28,
            padding: '0 8px',
            fontSize: 13,
            fontWeight: 700,
            fontFamily: T.font,
            color: T.text1,
            background: '#EEF3FF',
            border: `1.5px solid ${T.accent}`,
            borderRadius: T.r2,
            outline: 'none',
            letterSpacing: '-0.3px',
          }}
        />
      </div>
    );
  }

  return (
    <button
      onClick={() => { setDraft(symbol); setEditing(true); }}
      style={{
        display:      'flex',
        alignItems:   'center',
        gap:          5,
        padding:      '0 7px',
        height:       28,
        borderRadius: T.r2,
        border:       `1px solid ${T.border}`,
        background:   T.surfaceAlt,
        cursor:       'pointer',
        flexShrink:   0,
        outline:      'none',
      }}
      title="Click to change symbol"
      onMouseEnter={e => { e.currentTarget.style.borderColor = T.accent; e.currentTarget.style.background = '#EEF3FF'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.background = T.surfaceAlt; }}
    >
      <Search size={11} color={T.text3} />
      <span style={{ fontSize: 14, fontWeight: 700, color: T.text1, letterSpacing: '-0.3px', fontFamily: T.font }}>
        {symbol}
      </span>
      <ChevronDown size={9} color={T.text3} />
    </button>
  );
}

// ─── Timeframe row with favorites + custom ────────────────────────────────────
interface TimeframeRowProps {
  active:    string;
  onChange:  (tf: string) => void;
  favorites: Set<string>;
  onToggleFavorite: (tf: string) => void;
  custom:    string[];
  onAddCustom: (tf: string) => void;
}

function TimeframeRow({ active, onChange, favorites, onToggleFavorite, custom, onAddCustom }: TimeframeRowProps) {
  const [showAdd,   setShowAdd]   = useState(false);
  const [inputVal,  setInputVal]  = useState('');
  const [hovered,   setHovered]   = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const allTFs = [...BASE_TIMEFRAMES, ...custom];

  useEffect(() => {
    if (showAdd && inputRef.current) inputRef.current.focus();
  }, [showAdd]);

  const handleAdd = () => {
    const v = inputVal.trim();
    if (v && !allTFs.includes(v)) { onAddCustom(v); onChange(v); }
    setInputVal('');
    setShowAdd(false);
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
      {allTFs.map(tf => {
        const isFav = favorites.has(tf);
        const isHov = hovered === tf;
        return (
          <div
            key={tf}
            style={{ position: 'relative', display: 'flex', alignItems: 'center' }}
            onMouseEnter={() => setHovered(tf)}
            onMouseLeave={() => setHovered(null)}
          >
            <TimeframeButton label={tf} active={active === tf} onClick={() => onChange(tf)} />
            {/* Star toggle — visible on hover */}
            {isHov && (
              <button
                onClick={() => onToggleFavorite(tf)}
                style={{
                  position:  'absolute',
                  top: -5, right: -3,
                  width:  12, height: 12,
                  borderRadius: '50%',
                  border: 'none',
                  background: isFav ? '#FFD700' : T.border,
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  zIndex: 10, padding: 0,
                }}
                title={isFav ? 'Remove from favorites' : 'Add to favorites'}
              >
                <Star size={7} color={isFav ? '#fff' : T.text3} fill={isFav ? '#fff' : 'none'} />
              </button>
            )}
          </div>
        );
      })}

      {/* ChevronDown for overflow */}
      <button
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 20, height: 24, borderRadius: T.r2, border: 'none',
          background: 'transparent', cursor: 'pointer', color: T.text3, outline: 'none',
        }}
        onMouseEnter={e => { e.currentTarget.style.color = T.text1; }}
        onMouseLeave={e => { e.currentTarget.style.color = T.text3; }}
      >
        <ChevronDown size={10} />
      </button>

      {/* Add custom timeframe */}
      {showAdd ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginLeft: 2 }}>
          <input
            ref={inputRef}
            value={inputVal}
            onChange={e => setInputVal(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setShowAdd(false); }}
            placeholder="e.g. 2h"
            style={{
              width: 52, height: 22, padding: '0 6px',
              fontSize: 11, fontFamily: T.font, color: T.text1,
              border: `1px solid ${T.accent}`, borderRadius: T.r2,
              background: '#EEF3FF', outline: 'none',
            }}
          />
          <button onClick={handleAdd} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, borderRadius: T.r2, border: 'none', background: T.accent, cursor: 'pointer', outline: 'none' }}>
            <Check size={10} color="#fff" />
          </button>
          <button onClick={() => setShowAdd(false)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, borderRadius: T.r2, border: 'none', background: 'transparent', cursor: 'pointer', outline: 'none', color: T.text3 }}>
            <X size={10} />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 22, height: 22, borderRadius: T.r2,
            border: `1px dashed ${T.border}`, background: 'transparent',
            cursor: 'pointer', color: T.text3, marginLeft: 2, outline: 'none',
          }}
          title="Add custom timeframe"
          onMouseEnter={e => { e.currentTarget.style.borderColor = T.accent; e.currentTarget.style.color = T.accent; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.text3; }}
        >
          <Plus size={10} />
        </button>
      )}
    </div>
  );
}

// ─── Indicator chips bar ──────────────────────────────────────────────────────
interface ActiveIndicator {
  id:     string;
  name:   string;
  params: string;
  value?: string;
  color:  string;
}

interface IndicatorChipsBarProps {
  indicators: ActiveIndicator[];
  onRemove:   (id: string) => void;
}

function IndicatorChipsBar({ indicators, onRemove }: IndicatorChipsBarProps) {
  const [collapsed, setCollapsed] = useState(false);

  if (indicators.length === 0) return null;

  return (
    <div style={{
      display:    'flex',
      alignItems: 'center',
      gap:        3,
      marginTop:  4,
      flexWrap:   'wrap',
    }}>
      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 16, height: 16, borderRadius: 2,
          border: `1px solid ${T.border}`,
          background: T.surface,
          cursor: 'pointer', outline: 'none', flexShrink: 0,
          color: T.text3,
        }}
        title={collapsed ? 'Expand indicators' : 'Collapse indicators'}
      >
        {collapsed
          ? <ChevronRight size={9} />
          : <ChevronLeft size={9} />
        }
      </button>

      {indicators.map(ind => (
        <div
          key={ind.id}
          style={{
            display:      'flex',
            alignItems:   'center',
            gap:          4,
            padding:      '1px 6px',
            height:       18,
            borderRadius: T.r1,
            background:   'rgba(255,255,255,0.82)',
            border:       `1px solid ${T.borderLight}`,
            backdropFilter: 'blur(4px)',
            flexShrink:   0,
          }}
        >
          {/* Color dot */}
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: ind.color, flexShrink: 0 }} />

          {/* Name + params */}
          <span style={{ fontSize: 10, fontWeight: 600, color: T.text1, fontFamily: T.font, whiteSpace: 'nowrap' }}>
            {ind.name}
            {ind.params && (
              <span style={{ fontWeight: 400, color: T.text3 }}>({ind.params})</span>
            )}
          </span>

          {/* Current value — hidden when collapsed */}
          {!collapsed && ind.value && (
            <span style={{ fontSize: 10, fontWeight: 500, color: ind.color, fontFamily: T.font }}>
              {ind.value}
            </span>
          )}

          {/* Remove */}
          <button
            onClick={() => onRemove(ind.id)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 12, height: 12, borderRadius: 2,
              border: 'none', background: 'transparent',
              cursor: 'pointer', outline: 'none', padding: 0, color: T.text3,
            }}
            onMouseEnter={e => { e.currentTarget.style.color = T.bear; }}
            onMouseLeave={e => { e.currentTarget.style.color = T.text3; }}
          >
            <X size={8} />
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── Chart overlay header ─────────────────────────────────────────────────────
interface ChartOverlayHeaderProps {
  symbol:     string;
  indicators: ActiveIndicator[];
  onRemoveIndicator: (id: string) => void;
}

function ChartOverlayHeader({ symbol, indicators, onRemoveIndicator }: ChartOverlayHeaderProps) {
  const data  = SYMBOL_DATA[symbol] ?? SYMBOL_DATA['EURUSD'];
  const bull  = data.change >= 0;
  const color = bull ? T.bull : T.bear;
  const fmt   = (n: number) => {
    if (n >= 100) return n.toFixed(2);
    if (n >= 10)  return n.toFixed(2);
    if (n >= 1)   return n.toFixed(4);
    return n.toFixed(5);
  };

  return (
    <div style={{
      position:      'absolute',
      top:           10,
      left:          12,
      zIndex:        5,
      pointerEvents: 'none',
      userSelect:    'none',
    }}>
      {/* Symbol + meta */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: T.text1, fontFamily: T.font, letterSpacing: '-0.3px' }}>
          {symbol}
        </span>
        <span style={{ fontSize: 10, color: T.text2, fontFamily: T.font }}>
          {data.name}
        </span>
        <span style={{
          fontSize: 9, fontWeight: 600, color: T.text2, fontFamily: T.font,
          padding: '1px 4px', borderRadius: T.r1, background: 'rgba(0,0,0,0.05)',
          letterSpacing: '0.04em',
        }}>
          {data.exchange} · {data.market}
        </span>
      </div>

      {/* Price + change */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginBottom: 2 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color, fontFamily: T.font, letterSpacing: '-0.3px' }}>
          {fmt(data.price)}
        </span>
        <span style={{ fontSize: 10, fontWeight: 500, color, fontFamily: T.font }}>
          {bull ? '▲' : '▼'} {bull ? '+' : ''}{fmt(data.change)}
        </span>
        <span style={{ fontSize: 10, color, fontFamily: T.font, opacity: 0.85 }}>
          ({bull ? '+' : ''}{data.changePct.toFixed(2)}%)
        </span>
      </div>

      {/* OHLCV */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 0 }}>
        {[['O', data.open], ['H', data.high], ['L', data.low], ['C', data.close]].map(([lbl, val]) => (
          <div key={String(lbl)} style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
            <span style={{ fontSize: 9, fontWeight: 600, color: T.text3, fontFamily: T.font }}>{lbl}</span>
            <span style={{ fontSize: 10, color: T.text2, fontFamily: T.font, letterSpacing: '-0.3px' }}>
              {fmt(Number(val))}
            </span>
          </div>
        ))}
        <span style={{ fontSize: 9, color: T.text3, fontFamily: T.font }}>Vol —</span>
      </div>

      {/* Indicator chips — positioned here, pointerEvents re-enabled */}
      <div style={{ pointerEvents: 'auto', marginTop: 4 }}>
        <IndicatorChipsBar indicators={indicators} onRemove={onRemoveIndicator} />
      </div>
    </div>
  );
}

// ─── Indicators popup (simple dropdown) ──────────────────────────────────────
interface IndicatorsMenuProps {
  active:    ActiveIndicator[];
  onAdd:     (ind: ActiveIndicator) => void;
  onClose:   () => void;
}

function IndicatorsMenu({ active, onAdd, onClose }: IndicatorsMenuProps) {
  const activeIds = new Set(active.map(a => a.id));
  return (
    <div style={{
      position:     'absolute',
      top:          36,
      left:         0,
      zIndex:       100,
      background:   T.surface,
      border:       `1px solid ${T.border}`,
      borderRadius: T.r4,
      boxShadow:    T.shadowFloat,
      padding:      '6px 0',
      minWidth:     180,
    }}>
      <div style={{ padding: '2px 10px 6px', fontSize: 9, fontWeight: 700, color: T.text3, letterSpacing: '0.06em', fontFamily: T.font }}>
        INDICATORS
      </div>
      {AVAILABLE_INDICATORS.map(ind => {
        const added = activeIds.has(ind.id);
        return (
          <div
            key={ind.id}
            onClick={() => { if (!added) { onAdd(ind); onClose(); } }}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '4px 10px', cursor: added ? 'default' : 'pointer',
              opacity: added ? 0.5 : 1,
            }}
            onMouseEnter={e => { if (!added) (e.currentTarget as HTMLElement).style.background = T.hover; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: ind.color, flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 500, color: T.text1, fontFamily: T.font, flex: 1 }}>
              {ind.name}
            </span>
            {ind.params && <span style={{ fontSize: 10, color: T.text3, fontFamily: T.font }}>{ind.params}</span>}
            {added && <Check size={10} color={T.accent} />}
          </div>
        );
      })}
    </div>
  );
}

// ─── TOP BAR ─────────────────────────────────────────────────────────────────
interface TopBarProps {
  symbol:            string;
  onSymbolChange:    (s: string) => void;
  activeTimeframe:   string;
  onTimeframeChange: (tf: string) => void;
  favorites:         Set<string>;
  onToggleFavorite:  (tf: string) => void;
  customTFs:         string[];
  onAddCustomTF:     (tf: string) => void;
  activeChartType:   string;
  onChartTypeChange: (ct: string) => void;
  showSR:            boolean;
  onToggleSR:        () => void;
  showFVG:           boolean;
  onToggleFVG:       () => void;
  indicators:        ActiveIndicator[];
  onAddIndicator:    (ind: ActiveIndicator) => void;
}

function TopBar({
  symbol, onSymbolChange,
  activeTimeframe, onTimeframeChange,
  favorites, onToggleFavorite, customTFs, onAddCustomTF,
  activeChartType, onChartTypeChange,
  showSR, onToggleSR, showFVG, onToggleFVG,
  indicators, onAddIndicator,
}: TopBarProps) {
  const data = SYMBOL_DATA[symbol] ?? SYMBOL_DATA['EURUSD'];
  const bull = data.change >= 0;
  const fmt = (n: number) => {
    if (n >= 100) return n.toFixed(2);
    if (n >= 10)  return n.toFixed(2);
    if (n >= 1)   return n.toFixed(4);
    return n.toFixed(5);
  };

  const [showIndMenu, setShowIndMenu] = useState(false);
  const indBtnRef = useRef<HTMLDivElement>(null);

  // Close indicator menu on outside click
  useEffect(() => {
    if (!showIndMenu) return;
    const handler = (e: MouseEvent) => {
      if (indBtnRef.current && !indBtnRef.current.contains(e.target as Node)) {
        setShowIndMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showIndMenu]);

  const chartTypes = [
    { id: 'candles', icon: <CandlestickChart size={15} />, label: 'Candlestick' },
    { id: 'bars',    icon: <BarChart2 size={15} />,        label: 'Bars'         },
    { id: 'line',    icon: <LineChart size={15} />,         label: 'Line'         },
    { id: 'area',    icon: <AreaChart size={15} />,         label: 'Area'         },
  ];

  return (
    <div style={{
      display:      'flex',
      alignItems:   'center',
      height:       T.topBarH,
      background:   T.surface,
      borderBottom: `1px solid ${T.border}`,
      paddingLeft:  8,
      paddingRight: 8,
      gap:          0,
      flexShrink:   0,
      fontFamily:   T.font,
      zIndex:       20,
      overflow:     'hidden',
    }}>
      {/* Brand */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 2, marginRight: 8, flexShrink: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: T.text1, letterSpacing: '0.06em' }}>ORDR</span>
        <span style={{ fontSize: 9, fontWeight: 600, color: T.accent, letterSpacing: '0.08em' }}>MKT</span>
      </div>

      <ToolbarSeparator />

      {/* Symbol selector box */}
      <SymbolSelector symbol={symbol} onChange={onSymbolChange} />

      {/* Exchange badge */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 3,
        padding: '0 5px', height: 16, borderRadius: T.r1,
        background: T.borderLight, flexShrink: 0, marginLeft: 4,
      }}>
        <span style={{ fontSize: 9, fontWeight: 600, color: T.text2, letterSpacing: '0.04em' }}>{data.exchange}</span>
        <span style={{ fontSize: 9, color: T.text3 }}>·</span>
        <span style={{ fontSize: 9, fontWeight: 500, color: T.text3 }}>{data.market}</span>
      </div>

      {/* Price */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, flexShrink: 0, marginLeft: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: bull ? T.bull : T.bear, fontFamily: T.font, letterSpacing: '-0.4px' }}>
          {fmt(data.price)}
        </span>
        <span style={{ fontSize: 10, fontWeight: 500, color: bull ? T.bull : T.bear }}>
          {bull ? '+' : ''}{fmt(data.change)}
        </span>
        <span style={{ fontSize: 10, color: bull ? T.bull : T.bear, opacity: 0.85 }}>
          ({bull ? '+' : ''}{data.changePct.toFixed(2)}%)
        </span>
      </div>

      <div style={{ width: 8, flexShrink: 0 }} />
      <QuoteBadge side="SELL" price={fmt(data.bid)} />
      <div style={{ width: 3, flexShrink: 0 }} />
      <QuoteBadge side="BUY"  price={fmt(data.ask)} />

      <ToolbarSeparator />

      {/* Timeframes */}
      <TimeframeRow
        active={activeTimeframe}
        onChange={onTimeframeChange}
        favorites={favorites}
        onToggleFavorite={onToggleFavorite}
        custom={customTFs}
        onAddCustom={onAddCustomTF}
      />

      <ToolbarSeparator />

      {/* Chart type */}
      <ToolbarGroup>
        {chartTypes.map(ct => (
          <IconButton key={ct.id} icon={ct.icon} active={activeChartType === ct.id} label={ct.label} onClick={() => onChartTypeChange(ct.id)} />
        ))}
      </ToolbarGroup>

      <ToolbarSeparator />

      {/* Indicators button with dropdown */}
      <div ref={indBtnRef} style={{ position: 'relative', flexShrink: 0 }}>
        <button
          onClick={() => setShowIndMenu(!showIndMenu)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '0 8px', height: 28, borderRadius: T.r2,
            border: 'none',
            background: showIndMenu ? T.accentBg : 'transparent',
            color: showIndMenu ? T.accent : T.text2,
            fontSize: 11, fontWeight: 500, fontFamily: T.font,
            cursor: 'pointer', outline: 'none', flexShrink: 0,
          }}
          onMouseEnter={e => { if (!showIndMenu) { e.currentTarget.style.background = T.hover; e.currentTarget.style.color = T.text1; }}}
          onMouseLeave={e => { if (!showIndMenu) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.text2; }}}
        >
          <TrendingUp size={14} />
          <span>Indicators</span>
          {indicators.length > 0 && (
            <span style={{
              fontSize: 9, fontWeight: 700, color: '#fff',
              background: T.accent, borderRadius: 6, padding: '0 4px', height: 13,
              display: 'inline-flex', alignItems: 'center',
            }}>
              {indicators.length}
            </span>
          )}
        </button>
        {showIndMenu && (
          <IndicatorsMenu active={indicators} onAdd={onAddIndicator} onClose={() => setShowIndMenu(false)} />
        )}
      </div>

      {/* S/R toggle */}
      <button
        onClick={onToggleSR}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 3,
          padding: '0 7px', height: 28, borderRadius: T.r2,
          border: 'none',
          background: showSR ? T.accentBg : 'transparent',
          color: showSR ? T.accent : T.text2,
          fontSize: 11, fontWeight: 500, fontFamily: T.font,
          cursor: 'pointer', outline: 'none',
        }}
        title="Toggle Support / Resistance"
        onMouseEnter={e => { if (!showSR) { e.currentTarget.style.background = T.hover; e.currentTarget.style.color = T.text1; }}}
        onMouseLeave={e => { if (!showSR) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.text2; }}}
      >
        <Layers size={13} />
        <span>S/R</span>
      </button>

      {/* FVG toggle */}
      <button
        onClick={onToggleFVG}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 3,
          padding: '0 7px', height: 28, borderRadius: T.r2,
          border: 'none',
          background: showFVG ? T.accentBg : 'transparent',
          color: showFVG ? T.accent : T.text2,
          fontSize: 11, fontWeight: 500, fontFamily: T.font,
          cursor: 'pointer', outline: 'none',
        }}
        title="Toggle Fair Value Gaps"
        onMouseEnter={e => { if (!showFVG) { e.currentTarget.style.background = T.hover; e.currentTarget.style.color = T.text1; }}}
        onMouseLeave={e => { if (!showFVG) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.text2; }}}
      >
        <SlidersHorizontal size={13} />
        <span>FVG</span>
      </button>

      <IconButton icon={<Layout size={14} />} showLabel label="Templates" />

      <div style={{ flex: 1 }} />

      {/* Strategy Lab + Marketplace nav links */}
      <a href="/strategy" style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '0 9px', height: 26, borderRadius: T.r2,
        border: `1px solid ${T.border}`, background: 'transparent',
        cursor: 'pointer', flexShrink: 0, outline: 'none',
        textDecoration: 'none', color: T.text2,
        fontSize: 11, fontWeight: 500, fontFamily: T.font,
      }}
      onMouseEnter={e => { e.currentTarget.style.background = T.hover; e.currentTarget.style.color = T.text1; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.text2; }}
      title="Strategy Lab — Backtest & Publish">
        <Activity size={12} />
        <span>Strategy Lab</span>
      </a>
      <a href="/marketplace" style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '0 9px', height: 26, borderRadius: T.r2,
        border: `1px solid ${T.border}`, background: 'transparent',
        cursor: 'pointer', flexShrink: 0, outline: 'none',
        textDecoration: 'none', color: T.text2,
        fontSize: 11, fontWeight: 500, fontFamily: T.font,
        marginLeft: 4,
      }}
      onMouseEnter={e => { e.currentTarget.style.background = T.hover; e.currentTarget.style.color = T.text1; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.text2; }}
      title="Browse Strategy Marketplace">
        <Star size={12} />
        <span>Marketplace</span>
      </a>

      <ToolbarSeparator />

      {/* Right utilities */}
      <ToolbarGroup>
        <IconButton icon={<PlaySquare size={14} />} label="Bar Replay" />
        <IconButton icon={<Bell size={14} />}       label="Alerts" />
        <IconButton icon={<RotateCcw size={14} />}  label="Undo" />
        <IconButton icon={<Maximize2 size={14} />}  label="Fullscreen" />
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <IconButton icon={<LayoutGrid size={14} />}    label="Multi-layout" />
        <IconButton icon={<MessageSquare size={14} />} label="Ideas" />
        <IconButton icon={<Calendar size={14} />}      label="Calendar" />
      </ToolbarGroup>

      <ToolbarSeparator />
      <IconButton icon={<Settings size={14} />} label="Settings" />
      <ThemeSwitcher />

      <button
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '0 9px', height: 26, borderRadius: T.r2,
          border: `1px solid ${T.border}`, background: 'transparent',
          cursor: 'pointer', marginLeft: 4, flexShrink: 0, outline: 'none',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = T.hover; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
      >
        <User size={12} color={T.text2} />
        <span style={{ fontSize: 11, fontWeight: 500, color: T.text2, fontFamily: T.font }}>Trader</span>
      </button>

      <button
        style={{
          display: 'flex', alignItems: 'center', padding: '0 13px',
          height: 26, marginLeft: 6, borderRadius: T.r2,
          border: 'none', background: T.accent, color: '#FFF',
          fontSize: 11, fontWeight: 600, cursor: 'pointer',
          flexShrink: 0, fontFamily: T.font, letterSpacing: '0.02em', outline: 'none',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = '#1a53e0'; }}
        onMouseLeave={e => { e.currentTarget.style.background = T.accent; }}
      >
        Trade
      </button>
    </div>
  );
}

// ─── LEFT RAIL ────────────────────────────────────────────────────────────────
function LeftRail({ activeTool, onToolChange }: { activeTool: string; onToolChange: (t: string) => void }) {
  type Item = { id: string; icon: React.ReactNode; tooltip: string } | null;
  const tools: Item[] = [
    { id: 'cursor',    icon: <MousePointer2 size={15} />, tooltip: 'Cursor (V)' },
    { id: 'crosshair', icon: <Crosshair size={15} />,     tooltip: 'Crosshair (Shift+V)' },
    null,
    { id: 'trendline', icon: <TrendingUp size={15} />,    tooltip: 'Trend Line (Alt+T)' },
    { id: 'hline',     icon: <Minus size={15} />,         tooltip: 'Horizontal Line' },
    { id: 'channel',   icon: <ChevronsUpDown size={15} />, tooltip: 'Parallel Channel' },
    { id: 'pitchfork', icon: <GitBranch size={15} />,     tooltip: 'Pitchfork' },
    { id: 'fib',       icon: <Layers size={15} />,        tooltip: 'Fibonacci Retracement' },
    null,
    { id: 'rect',      icon: <Square size={15} />,        tooltip: 'Rectangle' },
    { id: 'ellipse',   icon: <Circle size={15} />,        tooltip: 'Ellipse' },
    { id: 'pen',       icon: <Pen size={15} />,           tooltip: 'Pen / Brush' },
    { id: 'text',      icon: <Type size={15} />,          tooltip: 'Text Note' },
    null,
    { id: 'measure',   icon: <Ruler size={15} />,         tooltip: 'Measure (M)' },
    { id: 'magnet',    icon: <Magnet size={15} />,        tooltip: 'Magnet Mode' },
    null,
    { id: 'lock',      icon: <Lock size={15} />,          tooltip: 'Lock All Drawings' },
    { id: 'eye',       icon: <Eye size={15} />,           tooltip: 'Show / Hide Drawings' },
    { id: 'trash',     icon: <Trash2 size={15} />,        tooltip: 'Remove All Drawings' },
  ];
  return (
    <div style={{
      width: T.railW, display: 'flex', flexDirection: 'column', alignItems: 'center',
      paddingTop: 6, paddingBottom: 6, gap: 1,
      background: T.surface, borderRight: `1px solid ${T.border}`,
      flexShrink: 0, overflowY: 'auto', overflowX: 'hidden', zIndex: 10,
    }}>
      {tools.map((t, i) => t === null
        ? <ToolbarSeparator key={`s${i}`} axis="horizontal" />
        : <RailButton key={t.id} icon={t.icon} active={activeTool === t.id} tooltip={t.tooltip} onClick={() => onToolChange(t.id)} />
      )}
    </div>
  );
}

// ─── RIGHT RAIL ───────────────────────────────────────────────────────────────
function RightRail() {
  const [active, setActive] = useState<string | null>(null);
  type Item = { id: string; icon: React.ReactNode; tooltip: string } | null;
  const tools: Item[] = [
    { id: 'watchlist', icon: <Bookmark size={15} />,    tooltip: 'Watchlist' },
    { id: 'alerts',    icon: <Bell size={15} />,        tooltip: 'Alerts' },
    null,
    { id: 'data',      icon: <Activity size={15} />,   tooltip: 'Market Data' },
    { id: 'calendar',  icon: <Calendar size={15} />,   tooltip: 'Economic Calendar' },
    { id: 'news',      icon: <FileText size={15} />,   tooltip: 'News Feed' },
    { id: 'ideas',     icon: <MessageSquare size={15} />, tooltip: 'Trading Ideas' },
    null,
    { id: 'settings',  icon: <Settings size={15} />,   tooltip: 'Settings' },
    { id: 'help',      icon: <HelpCircle size={15} />, tooltip: 'Help & Shortcuts' },
  ];
  return (
    <div style={{
      width: T.railW, display: 'flex', flexDirection: 'column', alignItems: 'center',
      paddingTop: 6, paddingBottom: 6, gap: 1,
      background: T.surface, borderLeft: `1px solid ${T.border}`,
      flexShrink: 0, zIndex: 10,
    }}>
      {tools.map((t, i) => t === null
        ? <ToolbarSeparator key={`s${i}`} axis="horizontal" />
        : <RailButton key={t.id} icon={t.icon} active={active === t.id} tooltip={t.tooltip} onClick={() => setActive(active === t.id ? null : t.id)} />
      )}
    </div>
  );
}

// ─── FLOATING DRAWING PALETTE ─────────────────────────────────────────────────
function FloatingPalette({ activeTool, onToolChange }: { activeTool: string; onToolChange: (t: string) => void }) {
  const tools = [
    { id: 'trendline', icon: <TrendingUp size={13} />,    tooltip: 'Trend Line' },
    { id: 'hline',     icon: <Minus size={13} />,         tooltip: 'Horizontal Line' },
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
  ];
  return (
    <div style={{
      position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
      zIndex: 15, background: T.surface, borderRadius: T.r4,
      boxShadow: T.shadowFloat, border: `1px solid ${T.border}`,
      display: 'flex', alignItems: 'center', padding: '0 4px', gap: 1, height: 32,
    }}>
      {tools.map((t, i) => t === null
        ? <div key={`ps${i}`} style={{ width: 1, height: 14, background: T.border, margin: '0 3px' }} />
        : (
          <button key={t.id} title={t.tooltip} onClick={() => onToolChange(t.id)} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 26, height: 24, borderRadius: T.r2, border: 'none',
            background: activeTool === t.id ? T.accentBg : 'transparent',
            color: activeTool === t.id ? T.accent : T.text2, cursor: 'pointer', outline: 'none',
          }}
          onMouseEnter={e => { if (activeTool !== t.id) { e.currentTarget.style.background = T.hover; e.currentTarget.style.color = T.text1; }}}
          onMouseLeave={e => { if (activeTool !== t.id) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.text2; }}}
          >
            {t.icon}
          </button>
        )
      )}
    </div>
  );
}

// ─── BOTTOM STRIP ─────────────────────────────────────────────────────────────
function BottomStrip() {
  const [paper, setPaper] = useState(false);
  return (
    <div style={{
      display: 'flex', alignItems: 'center', height: T.bottomBarH,
      background: T.surface, borderTop: `1px solid ${T.border}`,
      paddingLeft: 10, paddingRight: 10, gap: 8, flexShrink: 0, fontFamily: T.font, zIndex: 20,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <div
          onClick={() => setPaper(!paper)}
          style={{
            width: 28, height: 14, borderRadius: 7,
            background: paper ? T.accent : T.border,
            cursor: 'pointer', position: 'relative',
          }}
        >
          <div style={{
            position: 'absolute', top: 2, left: paper ? 15 : 2,
            width: 10, height: 10, borderRadius: '50%', background: '#FFF',
            boxShadow: '0 1px 2px rgba(0,0,0,0.15)', transition: 'left 0.18s ease',
          }} />
        </div>
        <span style={{ fontSize: 10, fontWeight: 500, color: paper ? T.accent : T.text2 }}>Paper Trading</span>
      </div>
      <div style={{ width: 1, height: 12, background: T.border }} />
      <StatusPill dot="#22c55e" label="Market Open" />
      <StatusPill label="London"   value="09:42:15" />
      <StatusPill label="New York" value="04:42:15" />
      <StatusPill label="Tokyo"    value="17:42:15" />
      <div style={{ flex: 1 }} />
      <StatusPill label="77 Indicators" />
      <StatusPill label="55 Tools" />
      <StatusPill label="Latency" value="12ms" />
    </div>
  );
}

// ─── MAIN WORKSPACE ───────────────────────────────────────────────────────────
export default function ChartWorkspace() {
  const [symbol,          setSymbol]          = useState('EURUSD');
  const [activeTimeframe, setActiveTimeframe] = useState('30m');   // default 30m
  const [activeTool,      setActiveTool]      = useState('cursor');
  const [activeChartType, setActiveChartType] = useState('candles');
  const [showSR,          setShowSR]          = useState(false);   // off by default
  const [showFVG,         setShowFVG]         = useState(false);   // off by default
  const [indicators,      setIndicators]      = useState<ActiveIndicator[]>([]);
  const [favorites,       setFavorites]       = useState<Set<string>>(DEFAULT_FAVORITES);
  const [customTFs,       setCustomTFs]       = useState<string[]>([]);

  const showPalette = DRAWING_MODES.has(activeTool);

  const addIndicator = (ind: ActiveIndicator) => {
    setIndicators(prev => prev.find(i => i.id === ind.id) ? prev : [...prev, ind]);
  };
  const removeIndicator = (id: string) => {
    setIndicators(prev => prev.filter(i => i.id !== id));
  };
  const toggleFavorite = (tf: string) => {
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(tf)) next.delete(tf); else next.add(tf);
      return next;
    });
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: '100vh', width: '100vw',
      background: T.bg, overflow: 'hidden',
      fontFamily: T.font, color: T.text1,
    }}>
      <TopBar
        symbol={symbol}                   onSymbolChange={setSymbol}
        activeTimeframe={activeTimeframe} onTimeframeChange={setActiveTimeframe}
        favorites={favorites}             onToggleFavorite={toggleFavorite}
        customTFs={customTFs}             onAddCustomTF={tf => setCustomTFs(p => [...p, tf])}
        activeChartType={activeChartType} onChartTypeChange={setActiveChartType}
        showSR={showSR}                   onToggleSR={() => setShowSR(p => !p)}
        showFVG={showFVG}                 onToggleFVG={() => setShowFVG(p => !p)}
        indicators={indicators}           onAddIndicator={addIndicator}
      />

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>
        <LeftRail activeTool={activeTool} onToolChange={setActiveTool} />

        {/* Chart canvas area */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: T.chartBg }}>
          <ChartOverlayHeader
            symbol={symbol}
            indicators={indicators}
            onRemoveIndicator={removeIndicator}
          />
          {showPalette && (
            <FloatingPalette activeTool={activeTool} onToolChange={setActiveTool} />
          )}
          <div style={{ position: 'absolute', inset: 0 }}>
            <MockCandleChart
              symbol={symbol}
              exchange={`${(SYMBOL_DATA[symbol] ?? SYMBOL_DATA['EURUSD']).exchange} · ${(SYMBOL_DATA[symbol] ?? SYMBOL_DATA['EURUSD']).market}`}
              interval={activeTimeframe}
              showSR={showSR}
              showFVG={showFVG}
            />
          </div>
        </div>

        <RightRail />
      </div>

      <BottomStrip />
    </div>
  );
}
