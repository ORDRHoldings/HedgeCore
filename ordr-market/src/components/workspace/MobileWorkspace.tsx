'use client';
/**
 * ORDR Market — Mobile Workspace
 *
 * Lightweight full-screen chart for mobile.
 * TradingView-style dark layout: chart fills the screen, minimal chrome.
 * Touch pan/pinch-zoom handled inside ChartEngine canvas.
 */
import React, { useState, useCallback, useEffect } from 'react';
import ChartEngine from '@/components/chart/ChartEngine';
import type { Bar } from '@/components/chart/indicators/types';
import { usePublicChartData } from '@/hooks/usePublicChartData';
import { useMarketWebSocket } from '@/hooks/useMarketWebSocket';
import {
  ChevronDown, TrendingUp, TrendingDown,
  BarChart2, Pencil, Bell, ListOrdered,
  X, Check, Search, Star,
} from 'lucide-react';
import { DEFAULT_WATCHLIST, formatPrice } from './workspace-data';

// ── Constants ─────────────────────────────────────────────────────────────────
const MOBILE_TFS = ['1m', '5m', '15m', '1h', '4h', 'D', 'W'];

const TF_MAP: Record<string, string> = {
  '1m': '1min', '3m': '3min', '5m': '5min', '15m': '15min', '30m': '30min',
  '1h': '1h', '4h': '4h', 'D': '1day', 'W': '1week', 'M': '1month',
};

const QUICK_SYMBOLS = [
  'SPY',   'QQQ',    'IWM',   'DIA',
  'AAPL',  'MSFT',   'NVDA',  'TSLA',
  'AMZN',  'META',   'GOOGL', 'XAUUSD',
  'BTCUSD','ETHUSD',
];

const QUICK_INDICATORS: { key: string; label: string }[] = [
  { key: 'ema20',      label: 'EMA 20' },
  { key: 'ema50',      label: 'EMA 50' },
  { key: 'bollinger',  label: 'BB' },
  { key: 'vwap',       label: 'VWAP' },
  { key: 'sr',         label: 'S/R' },
  { key: 'fvg',        label: 'FVG' },
  { key: 'ichimoku',   label: 'Ichimoku' },
  { key: 'keltner',    label: 'Keltner' },
];

const QUICK_SUBPANES: { key: string; label: string }[] = [
  { key: 'rsi',        label: 'RSI' },
  { key: 'macd',       label: 'MACD' },
  { key: 'stochastic', label: 'Stoch' },
  { key: 'adx',        label: 'ADX' },
];

const DRAW_TOOLS = [
  { id: 'trendline',        label: 'Trend' },
  { id: 'horizontal',       label: 'H-Line' },
  { id: 'vertical_line',    label: 'V-Line' },
  { id: 'fibonacci',        label: 'Fib' },
  { id: 'rectangle',        label: 'Rect' },
  { id: 'parallel_channel', label: 'Channel' },
];

// ── Palette ───────────────────────────────────────────────────────────────────
const C = {
  bg:       '#000000',
  surface:  '#0F0F0F',
  panel:    '#161616',
  border:   '#2A2A2A',
  text1:    '#E0E0E0',
  text2:    '#888888',
  text3:    '#555555',
  accent:   '#2962FF',
  bull:     '#26A69A',
  bear:     '#EF5350',
  warn:     '#F59E0B',
  font:     "'Inter', -apple-system, sans-serif",
  mono:     "'JetBrains Mono', 'Courier New', monospace",
} as const;

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(p: number): string {
  if (!p || p <= 0) return '—';
  if (p >= 10000) return p.toFixed(0);
  if (p >= 100)   return p.toFixed(2);
  return p.toFixed(5);
}

function barLimit(tf: string): number {
  if (['1m', '3m', '5m'].includes(tf)) return 300;
  if (['15m', '30m'].includes(tf)) return 400;
  return 500;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Pill({
  active, children, onClick, color,
}: { active: boolean; children: React.ReactNode; onClick: () => void; color?: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '5px 12px', borderRadius: 20, border: 'none', outline: 'none',
        background: active ? (color ?? C.accent) : C.panel,
        color: active ? '#fff' : C.text2,
        fontSize: 12, fontWeight: active ? 700 : 500, fontFamily: C.font,
        cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap',
        transition: 'background 0.12s',
      }}
    >
      {children}
    </button>
  );
}

// ── Symbol Search Sheet ───────────────────────────────────────────────────────
function SymbolSheet({
  current, onSelect, onClose,
}: { current: string; onSelect: (s: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const filtered = QUICK_SYMBOLS.filter(s =>
    !q || s.toLowerCase().includes(q.toLowerCase())
  );
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.85)', display: 'flex', flexDirection: 'column',
    }}
      onClick={onClose}
    >
      <div
        style={{
          background: C.surface, borderRadius: '16px 16px 0 0',
          marginTop: 'auto', padding: '16px',
          maxHeight: '80vh', display: 'flex', flexDirection: 'column',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div style={{ width: 36, height: 4, borderRadius: 2, background: C.border, margin: '0 auto 12px' }} />

        {/* Search */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: C.panel, borderRadius: 8, padding: '8px 12px',
          border: `1px solid ${C.border}`, marginBottom: 12,
        }}>
          <Search size={14} color={C.text3} />
          <input
            autoFocus
            value={q}
            onChange={e => setQ(e.target.value.toUpperCase())}
            placeholder="Search symbol…"
            style={{
              flex: 1, border: 'none', outline: 'none', background: 'transparent',
              fontSize: 14, color: C.text1, fontFamily: C.mono,
            }}
          />
          {q && <button onClick={() => setQ('')} style={{ background: 'none', border: 'none', color: C.text3, cursor: 'pointer', padding: 0 }}><X size={14} /></button>}
        </div>

        {/* Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, overflowY: 'auto' }}>
          {filtered.map(sym => (
            <button
              key={sym}
              onClick={() => { onSelect(sym); onClose(); }}
              style={{
                padding: '12px 8px', borderRadius: 8, border: `1px solid ${sym === current ? C.accent : C.border}`,
                background: sym === current ? 'rgba(41,98,255,0.12)' : C.panel,
                color: sym === current ? C.accent : C.text1,
                fontSize: 13, fontWeight: 600, fontFamily: C.mono,
                cursor: 'pointer', outline: 'none',
              }}
            >
              {sym}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Indicator Sheet ───────────────────────────────────────────────────────────
function IndicatorSheet({
  config, subpanes, onToggleOverlay, onToggleSubpane, onClose,
}: {
  config: Record<string, boolean>;
  subpanes: string[];
  onToggleOverlay: (k: string) => void;
  onToggleSubpane: (k: string) => void;
  onClose: () => void;
}) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.85)' }}
      onClick={onClose}
    >
      <div
        style={{
          background: C.surface, borderRadius: '16px 16px 0 0',
          marginTop: 'auto', position: 'absolute', bottom: 0, left: 0, right: 0,
          padding: '16px', paddingBottom: 'calc(16px + env(safe-area-inset-bottom))',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ width: 36, height: 4, borderRadius: 2, background: C.border, margin: '0 auto 16px' }} />
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text1, fontFamily: C.font, marginBottom: 12 }}>
          Overlays
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {QUICK_INDICATORS.map(ind => {
            const on = !!config[ind.key];
            return (
              <button key={ind.key} onClick={() => onToggleOverlay(ind.key)}
                style={{
                  padding: '8px 16px', borderRadius: 20, border: `1px solid ${on ? C.accent : C.border}`,
                  background: on ? 'rgba(41,98,255,0.15)' : C.panel,
                  color: on ? C.accent : C.text2,
                  fontSize: 13, fontWeight: on ? 700 : 500, fontFamily: C.font,
                  cursor: 'pointer', outline: 'none',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                {on && <Check size={12} />} {ind.label}
              </button>
            );
          })}
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text1, fontFamily: C.font, marginBottom: 12 }}>
          Sub-pane indicators
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {QUICK_SUBPANES.map(sp => {
            const on = subpanes.includes(sp.key);
            return (
              <button key={sp.key} onClick={() => onToggleSubpane(sp.key)}
                style={{
                  padding: '8px 16px', borderRadius: 20, border: `1px solid ${on ? C.warn : C.border}`,
                  background: on ? 'rgba(245,158,11,0.12)' : C.panel,
                  color: on ? C.warn : C.text2,
                  fontSize: 13, fontWeight: on ? 700 : 500, fontFamily: C.font,
                  cursor: 'pointer', outline: 'none',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                {on && <Check size={12} />} {sp.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Draw Sheet ────────────────────────────────────────────────────────────────
function DrawSheet({
  activeTool, onSelect, onClose,
}: { activeTool: string | null; onSelect: (t: string | null) => void; onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.85)' }}
      onClick={onClose}
    >
      <div
        style={{
          background: C.surface, borderRadius: '16px 16px 0 0',
          marginTop: 'auto', position: 'absolute', bottom: 0, left: 0, right: 0,
          padding: '16px', paddingBottom: 'calc(16px + env(safe-area-inset-bottom))',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ width: 36, height: 4, borderRadius: 2, background: C.border, margin: '0 auto 16px' }} />
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text1, fontFamily: C.font, marginBottom: 12 }}>
          Drawing Tools
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          <button
            onClick={() => { onSelect(null); onClose(); }}
            style={{
              padding: '12px 8px', borderRadius: 8,
              border: `1px solid ${!activeTool ? C.accent : C.border}`,
              background: !activeTool ? 'rgba(41,98,255,0.12)' : C.panel,
              color: !activeTool ? C.accent : C.text2,
              fontSize: 13, fontWeight: 600, fontFamily: C.font,
              cursor: 'pointer', outline: 'none',
            }}
          >
            Pointer
          </button>
          {DRAW_TOOLS.map(t => {
            const on = activeTool === t.id;
            return (
              <button key={t.id} onClick={() => { onSelect(t.id); onClose(); }}
                style={{
                  padding: '12px 8px', borderRadius: 8,
                  border: `1px solid ${on ? C.accent : C.border}`,
                  background: on ? 'rgba(41,98,255,0.12)' : C.panel,
                  color: on ? C.accent : C.text2,
                  fontSize: 13, fontWeight: on ? 700 : 500, fontFamily: C.font,
                  cursor: 'pointer', outline: 'none',
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Trade Sheet ───────────────────────────────────────────────────────────────
function TradeSheet({ symbol, price, onClose }: { symbol: string; price: number; onClose: () => void }) {
  const bid = price > 100 ? price - 0.20 : price - 0.0001;
  const ask = price > 100 ? price + 0.20 : price + 0.0001;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.80)' }}
      onClick={onClose}
    >
      <div
        style={{
          background: C.surface, borderRadius: '16px 16px 0 0',
          position: 'absolute', bottom: 0, left: 0, right: 0,
          padding: '16px 16px calc(16px + env(safe-area-inset-bottom))',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div style={{ width: 36, height: 4, borderRadius: 2, background: C.border, margin: '0 auto 14px' }} />

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.text1, fontFamily: C.mono, letterSpacing: '-0.5px' }}>{symbol}</div>
            <div style={{ fontSize: 12, color: C.text2, fontFamily: C.mono, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
              Mid {fmt(price)}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.text3, cursor: 'pointer', padding: 4 }}>
            <X size={20} />
          </button>
        </div>

        {/* Bid / Ask row */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          <div style={{ flex: 1, background: C.panel, borderRadius: 10, padding: '10px 14px', border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 10, color: C.text3, fontFamily: C.font, marginBottom: 4, letterSpacing: '0.04em' }}>BID</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.bear, fontFamily: C.mono, fontVariantNumeric: 'tabular-nums' }}>{fmt(bid)}</div>
          </div>
          <div style={{ flex: 1, background: C.panel, borderRadius: 10, padding: '10px 14px', border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 10, color: C.text3, fontFamily: C.font, marginBottom: 4, letterSpacing: '0.04em' }}>ASK</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.bull, fontFamily: C.mono, fontVariantNumeric: 'tabular-nums' }}>{fmt(ask)}</div>
          </div>
        </div>

        {/* Buy / Sell buttons */}
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, height: 52, borderRadius: 12, border: 'none', outline: 'none',
              background: C.bear, color: '#fff',
              fontSize: 16, fontWeight: 700, fontFamily: C.font, cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              lineHeight: 1.3,
            }}
          >
            <span>SELL</span>
            <span style={{ fontSize: 11, fontFamily: C.mono, fontWeight: 400, opacity: 0.85 }}>{fmt(bid)}</span>
          </button>
          <button
            onClick={onClose}
            style={{
              flex: 1, height: 52, borderRadius: 12, border: 'none', outline: 'none',
              background: C.bull, color: '#fff',
              fontSize: 16, fontWeight: 700, fontFamily: C.font, cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              lineHeight: 1.3,
            }}
          >
            <span>BUY</span>
            <span style={{ fontSize: 11, fontFamily: C.mono, fontWeight: 400, opacity: 0.85 }}>{fmt(ask)}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Watchlist Sheet ───────────────────────────────────────────────────────────
const WL_GROUPS_MOB = 'ordr_wl_groups_v2';
const WL_FAV_MOB    = 'ordr_wl_favorites';

interface MobWLGroup { id: string; name: string; symbols: string[]; }

function loadMobGroups(): MobWLGroup[] {
  try {
    const raw = localStorage.getItem(WL_GROUPS_MOB);
    if (!raw) return [{ id: 'main', name: 'My List', symbols: [] }];
    const p = JSON.parse(raw);
    return Array.isArray(p) && p.length > 0 ? p : [{ id: 'main', name: 'My List', symbols: [] }];
  } catch { return [{ id: 'main', name: 'My List', symbols: [] }]; }
}

function WatchlistSheet({ onSymbolSelect, onClose }: { onSymbolSelect: (s: string) => void; onClose: () => void }) {
  const [groups, setGroups] = useState<MobWLGroup[]>(loadMobGroups);
  const [activeId, setActiveId] = useState('all');
  const [favorites] = useState<Set<string>>(() => {
    try { const r = JSON.parse(localStorage.getItem(WL_FAV_MOB) ?? '[]'); return new Set(Array.isArray(r) ? r : []); } catch { return new Set(); }
  });
  const [search, setSearch] = useState('');
  const [addInput, setAddInput] = useState('');
  const [addingSymbol, setAddingSymbol] = useState(false);

  // persist groups
  useEffect(() => {
    try { localStorage.setItem(WL_GROUPS_MOB, JSON.stringify(groups)); } catch { /* */ }
  }, [groups]);

  const activeGroup = activeId === 'all' ? null : groups.find(g => g.id === activeId);

  const filteredAll = DEFAULT_WATCHLIST.filter(w =>
    !search || w.symbol.includes(search.toUpperCase()) || w.name.toLowerCase().includes(search.toLowerCase())
  );

  const groupSymbols = activeGroup
    ? activeGroup.symbols.filter(s => !search || s.includes(search.toUpperCase()))
    : [];

  function addToGroup(sym: string) {
    if (!activeGroup) return;
    setGroups(prev => prev.map(g => g.id === activeId && !g.symbols.includes(sym) ? { ...g, symbols: [...g.symbols, sym] } : g));
  }

  function removeFromGroup(sym: string) {
    if (!activeGroup) return;
    setGroups(prev => prev.map(g => g.id === activeId ? { ...g, symbols: g.symbols.filter(s => s !== sym) } : g));
  }

  function commitAdd() {
    const sym = addInput.trim().toUpperCase();
    if (sym) addToGroup(sym);
    setAddInput(''); setAddingSymbol(false);
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.85)' }}
      onClick={onClose}
    >
      <div
        style={{
          background: C.surface, borderRadius: '16px 16px 0 0',
          marginTop: 'auto', position: 'absolute', bottom: 0, left: 0, right: 0,
          maxHeight: '85vh', display: 'flex', flexDirection: 'column',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Handle + header */}
        <div style={{ padding: '12px 16px 0', flexShrink: 0 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: C.border, margin: '0 auto 10px' }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: C.text1, fontFamily: C.font }}>Watchlist</span>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.text3, cursor: 'pointer', padding: 4 }}><X size={18} /></button>
          </div>

          {/* Group tabs */}
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 10, scrollbarWidth: 'none' }}>
            <button onClick={() => setActiveId('all')} style={mobTabStyle(activeId === 'all')}>All</button>
            {groups.map(g => (
              <button key={g.id} onClick={() => setActiveId(g.id)} style={mobTabStyle(activeId === g.id)}>{g.name}</button>
            ))}
            <button
              onClick={() => {
                const id = `grp_${Date.now()}`;
                const name = `List ${groups.length + 1}`;
                setGroups(prev => [...prev, { id, name, symbols: [] }]);
                setActiveId(id);
              }}
              style={{ ...mobTabStyle(false), padding: '5px 10px' }}
            >+</button>
          </div>

          {/* Search */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.panel, borderRadius: 8, padding: '8px 12px', border: `1px solid ${C.border}`, marginBottom: addingSymbol ? 8 : 10 }}>
            <Search size={14} color={C.text3} />
            <input autoFocus value={search} onChange={e => setSearch(e.target.value.toUpperCase())}
              placeholder="Search…"
              style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 14, color: C.text1, fontFamily: C.mono }}
            />
            {activeId !== 'all' && (
              <button onClick={() => setAddingSymbol(true)} style={{ background: C.accent, border: 'none', borderRadius: 6, padding: '3px 8px', color: '#fff', fontSize: 12, cursor: 'pointer', outline: 'none' }}>+ Add</button>
            )}
          </div>

          {/* Add symbol inline */}
          {addingSymbol && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              <input value={addInput} onChange={e => setAddInput(e.target.value.toUpperCase())}
                onKeyDown={e => { if (e.key === 'Enter') commitAdd(); if (e.key === 'Escape') { setAddInput(''); setAddingSymbol(false); } }}
                placeholder="Enter symbol…"
                autoFocus
                style={{ flex: 1, background: C.panel, border: `1px solid ${C.accent}`, borderRadius: 8, padding: '8px 12px', color: C.text1, fontSize: 13, fontFamily: C.mono, outline: 'none' }}
              />
              <button onClick={commitAdd} style={{ background: C.accent, border: 'none', borderRadius: 8, padding: '8px 14px', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', outline: 'none' }}>Add</button>
            </div>
          )}
        </div>

        {/* Symbol list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 16px' }}>
          {activeId === 'all' ? (
            filteredAll.map(item => (
              <MobWLRow key={item.symbol} symbol={item.symbol} name={item.name}
                isFav={favorites.has(item.symbol)}
                onSelect={() => { onSymbolSelect(item.symbol); onClose(); }}
              />
            ))
          ) : groupSymbols.length === 0 ? (
            <div style={{ padding: '24px 0', textAlign: 'center', color: C.text3, fontSize: 13 }}>No symbols yet. Tap + Add.</div>
          ) : (
            groupSymbols.map(sym => {
              const def = DEFAULT_WATCHLIST.find(w => w.symbol === sym);
              return (
                <MobWLRow key={sym} symbol={sym} name={def?.name ?? sym}
                  isFav={favorites.has(sym)}
                  onSelect={() => { onSymbolSelect(sym); onClose(); }}
                  onRemove={() => removeFromGroup(sym)}
                />
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function mobTabStyle(active: boolean): React.CSSProperties {
  return {
    padding: '5px 12px', borderRadius: 16, border: `1px solid ${active ? C.accent : C.border}`,
    background: active ? 'rgba(41,98,255,0.15)' : C.panel,
    color: active ? C.accent : C.text2,
    fontSize: 12, fontWeight: active ? 700 : 500, fontFamily: C.font,
    cursor: 'pointer', outline: 'none', whiteSpace: 'nowrap', flexShrink: 0,
  };
}

function MobWLRow({ symbol, name, isFav, onSelect, onRemove }: { symbol: string; name: string; isFav: boolean; onSelect: () => void; onRemove?: () => void }) {
  const { bars, loading } = usePublicChartData(symbol, '1day', 2);
  const price     = bars.length > 0 ? bars[bars.length - 1].c : null;
  const prevClose = bars.length > 1 ? bars[bars.length - 2].c : null;
  const changePct = price !== null && prevClose ? ((price - prevClose) / prevClose) * 100 : null;
  const bull      = (changePct ?? 0) >= 0;

  return (
    <div onClick={onSelect} style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 8px', borderRadius: 8, cursor: 'pointer',
      borderBottom: `1px solid ${C.border}`,
    }}>
      <Star size={12} color={isFav ? '#FFD700' : C.text3} fill={isFav ? '#FFD700' : 'none'} style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.text1, fontFamily: C.mono }}>{symbol}</div>
        <div style={{ fontSize: 11, color: C.text3, fontFamily: C.font, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        {loading && price === null
          ? <div style={{ width: 40, height: 14, borderRadius: 3, background: C.border, animation: 'pulse 1s infinite' }} />
          : (
            <>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.text1, fontFamily: C.mono, fontVariantNumeric: 'tabular-nums' }}>
                {price !== null ? formatPrice(price, symbol) : '—'}
              </div>
              {changePct !== null && (
                <div style={{ fontSize: 11, color: bull ? C.bull : C.bear, fontFamily: C.mono, display: 'flex', alignItems: 'center', gap: 2, justifyContent: 'flex-end' }}>
                  {bull ? '+' : ''}{changePct.toFixed(2)}%
                </div>
              )}
            </>
          )}
      </div>
      {onRemove && (
        <button onClick={e => { e.stopPropagation(); onRemove(); }}
          style={{ background: 'none', border: 'none', color: C.text3, cursor: 'pointer', padding: 4, flexShrink: 0 }}>
          <X size={14} />
        </button>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function MobileWorkspace() {
  const [symbol, setSymbol]       = useState('SPY');
  const [timeframe, setTimeframe] = useState('1h');
  // Initial config mirrors ChartEngine DEFAULT_CONFIG for visible-by-default items.
  // Explicitly listing them so toggle buttons reflect the true render state.
  const [chartConfig, setChartConfig] = useState<Record<string, boolean>>({
    ema20: true, ema50: false, bollinger: false, vwap: false,
    sr: true, fvg: false, trendlines: false,
    ichimoku: false, keltner: false, volumeProfile: false,
  });
  const [subpanes, setSubpanes]   = useState<string[]>([]);
  const [drawingMode, setDrawingMode] = useState<string | null>(null);

  const [showSymbol, setShowSymbol]       = useState(false);
  const [showIndic, setShowIndic]         = useState(false);
  const [showDraw, setShowDraw]           = useState(false);
  const [showWatchlist, setShowWatchlist] = useState(false);
  const [showTrade, setShowTrade]         = useState(false);

  const apiInterval = TF_MAP[timeframe] ?? '1day';
  const limit = barLimit(timeframe);

  const { bars: fetchedBars, loading } = usePublicChartData(symbol, apiInterval, limit);
  const { tick } = useMarketWebSocket(symbol);

  // Merge live tick into last bar
  const bars = React.useMemo<Bar[]>(() => {
    if (!fetchedBars.length) return fetchedBars;
    if (!tick || !Number.isFinite(tick.mid) || tick.mid <= 0) return fetchedBars;
    const last = fetchedBars[fetchedBars.length - 1];
    const live: Bar = { ...last, c: tick.mid, h: Math.max(last.h, tick.mid), l: Math.min(last.l, tick.mid) };
    const r = fetchedBars.slice();
    r[r.length - 1] = live;
    return r;
  }, [fetchedBars, tick]);

  // Derived price display
  const price  = bars.length ? bars[bars.length - 1].c : 0;
  const prev   = bars.length > 1 ? bars[bars.length - 2].c : price;
  const change = price - prev;
  const changePct = prev ? (change / prev) * 100 : 0;
  const bull = change >= 0;

  const toggleOverlay = useCallback((key: string) => {
    setChartConfig(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const toggleSubpane = useCallback((key: string) => {
    setSubpanes(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [key]
    );
  }, []);

  const handleDrawingModeChange = useCallback((mode: string | null) => {
    setDrawingMode(mode);
  }, []);

  const handleChartTypeChange = useCallback((_t: string) => {}, []);

  // Prevent body scroll on mobile
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
    };
  }, []);

  const TOP_BAR_H  = 52;
  const TF_BAR_H   = 40;
  const BOT_BAR_H  = 60;

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: C.bg,
      display: 'flex', flexDirection: 'column',
      fontFamily: C.font,
      paddingTop: 'env(safe-area-inset-top)',
      paddingBottom: 'env(safe-area-inset-bottom)',
      paddingLeft: 'env(safe-area-inset-left)',
      paddingRight: 'env(safe-area-inset-right)',
    }}>

      {/* ── Top Bar ── */}
      <div style={{
        height: TOP_BAR_H, flexShrink: 0,
        display: 'flex', alignItems: 'center',
        padding: '0 12px', gap: 10,
        background: C.surface,
        borderBottom: `1px solid ${C.border}`,
      }}>
        {/* Symbol selector */}
        <button
          onClick={() => setShowSymbol(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            background: 'none', border: 'none', cursor: 'pointer', outline: 'none', padding: 0,
          }}
        >
          <span style={{ fontSize: 18, fontWeight: 700, color: C.text1, fontFamily: C.mono, letterSpacing: '-0.5px' }}>
            {symbol}
          </span>
          <ChevronDown size={14} color={C.text3} />
        </button>

        {/* Price + change */}
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
          <span style={{
            fontSize: 16, fontWeight: 700,
            color: bull ? C.bull : C.bear,
            fontFamily: C.mono, fontVariantNumeric: 'tabular-nums',
          }}>
            {fmt(price)}
          </span>
          <span style={{
            fontSize: 11, fontWeight: 500,
            color: bull ? C.bull : C.bear,
            fontFamily: C.mono, display: 'flex', alignItems: 'center', gap: 2,
          }}>
            {bull ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
            {bull ? '+' : ''}{change.toFixed(price < 10 ? 5 : 2)} ({changePct.toFixed(2)}%)
          </span>
        </div>

        <div style={{ flex: 1 }} />

        {/* Loading indicator */}
        {loading && (
          <div style={{
            width: 6, height: 6, borderRadius: '50%',
            background: C.warn, animation: 'pulse 1s infinite',
          }} />
        )}

        {/* Refresh/alert placeholder */}
        <button style={{ background: 'none', border: 'none', cursor: 'pointer', outline: 'none', padding: 4 }}>
          <Bell size={18} color={C.text3} />
        </button>
      </div>

      {/* ── Timeframe Bar ── */}
      <div style={{
        height: TF_BAR_H, flexShrink: 0,
        display: 'flex', alignItems: 'center',
        padding: '0 12px', gap: 6, overflowX: 'auto',
        background: C.surface,
        borderBottom: `1px solid ${C.border}`,
        scrollbarWidth: 'none',
      }}>
        {MOBILE_TFS.map(tf => (
          <Pill key={tf} active={timeframe === tf} onClick={() => setTimeframe(tf)}>
            {tf}
          </Pill>
        ))}
        {/* Separator */}
        <div style={{ width: 1, height: 18, background: C.border, flexShrink: 0, marginLeft: 2 }} />
        {/* Volume Profile Heatmap toggle — cloud heatmap button */}
        <button
          onClick={() => toggleOverlay('volumeProfile')}
          title="Volume Profile Heatmap"
          style={{
            flexShrink: 0,
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '4px 10px', borderRadius: 14, border: 'none', outline: 'none',
            background: chartConfig.volumeProfile
              ? 'linear-gradient(135deg, rgba(99,102,241,0.35) 0%, rgba(168,85,247,0.35) 100%)'
              : 'rgba(255,255,255,0.04)',
            boxShadow: chartConfig.volumeProfile
              ? '0 0 8px rgba(139,92,246,0.45), inset 0 1px 0 rgba(255,255,255,0.08)'
              : 'none',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          {/* Inline cloud + heatmap SVG icon */}
          <svg width="22" height="16" viewBox="0 0 22 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* Cloud shape */}
            <path
              d="M17 13H5C3.34 13 2 11.66 2 10C2 8.45 3.17 7.18 4.68 7.03C4.25 6.43 4 5.7 4 4.9C4 2.74 5.74 1 7.9 1C9.4 1 10.71 1.83 11.37 3.06C11.86 2.71 12.46 2.5 13.1 2.5C14.82 2.5 16.2 3.88 16.2 5.6C16.2 5.67 16.19 5.75 16.19 5.82C16.46 5.72 16.73 5.67 17 5.67C18.66 5.67 20 7.01 20 8.67C20 10.33 18.66 13 17 13Z"
              fill={chartConfig.volumeProfile ? 'rgba(167,139,250,0.30)' : 'rgba(255,255,255,0.08)'}
              stroke={chartConfig.volumeProfile ? '#a78bfa' : 'rgba(255,255,255,0.25)'}
              strokeWidth="0.8"
            />
            {/* Heatmap bars inside cloud (volume levels) */}
            <rect x="5.5" y="8.5" width="2" height="3.5" rx="0.5"
              fill={chartConfig.volumeProfile ? '#7c3aed' : 'rgba(255,255,255,0.15)'} />
            <rect x="8.5" y="6.5" width="2" height="5.5" rx="0.5"
              fill={chartConfig.volumeProfile ? '#8b5cf6' : 'rgba(255,255,255,0.15)'} />
            <rect x="11.5" y="9" width="2" height="3" rx="0.5"
              fill={chartConfig.volumeProfile ? '#a78bfa' : 'rgba(255,255,255,0.12)'} />
            <rect x="14.5" y="7.5" width="2" height="4.5" rx="0.5"
              fill={chartConfig.volumeProfile ? '#c4b5fd' : 'rgba(255,255,255,0.10)'} />
          </svg>
          <span style={{
            fontSize: 11, fontWeight: 600,
            color: chartConfig.volumeProfile ? '#c4b5fd' : C.text3,
            fontFamily: C.font,
            letterSpacing: '0.02em',
          }}>VP</span>
        </button>
      </div>

      {/* ── Chart (fills remaining space) ── */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative', background: '#131722' }}>
        {bars.length === 0 && loading && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            color: C.text3, fontSize: 12, fontFamily: C.mono,
          }}>
            Loading {symbol}…
          </div>
        )}
        <ChartEngine
          bars={bars}
          pair={symbol}
          interval={timeframe}
          loading={loading}
          embedded
          externalConfig={chartConfig}
          externalSubPanes={subpanes}
          externalDrawingMode={drawingMode as any}
          onDrawingModeChange={handleDrawingModeChange}
          onChartTypeChange={handleChartTypeChange}
          onPairChange={setSymbol}
          onSwipeTimeframe={(dir) => {
            const idx = MOBILE_TFS.indexOf(timeframe);
            const next = dir === 'left' ? MOBILE_TFS[idx + 1] : MOBILE_TFS[idx - 1];
            if (next) setTimeframe(next);
          }}
        />
      </div>

      {/* ── Bottom Action Bar ── */}
      <div style={{
        height: BOT_BAR_H, flexShrink: 0,
        display: 'flex', alignItems: 'center',
        padding: '0 12px', gap: 8,
        background: C.surface,
        borderTop: `1px solid ${C.border}`,
      }}>
        {/* Indicators */}
        <button
          onClick={() => setShowIndic(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '8px 12px', borderRadius: 8,
            border: `1px solid ${Object.values(chartConfig).some(Boolean) || subpanes.length ? C.accent : C.border}`,
            background: Object.values(chartConfig).some(Boolean) || subpanes.length ? 'rgba(41,98,255,0.12)' : C.panel,
            color: Object.values(chartConfig).some(Boolean) || subpanes.length ? C.accent : C.text2,
            fontSize: 12, fontWeight: 600, fontFamily: C.font,
            cursor: 'pointer', outline: 'none', flexShrink: 0,
          }}
        >
          <BarChart2 size={14} />
          Indicators
        </button>

        {/* Drawing tools */}
        <button
          onClick={() => setShowDraw(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '8px 12px', borderRadius: 8,
            border: `1px solid ${drawingMode ? C.accent : C.border}`,
            background: drawingMode ? 'rgba(41,98,255,0.12)' : C.panel,
            color: drawingMode ? C.accent : C.text2,
            fontSize: 12, fontWeight: 600, fontFamily: C.font,
            cursor: 'pointer', outline: 'none', flexShrink: 0,
          }}
        >
          <Pencil size={14} />
          {drawingMode ? DRAW_TOOLS.find(t => t.id === drawingMode)?.label ?? 'Draw' : 'Draw'}
        </button>

        {/* Watchlist */}
        <button
          onClick={() => setShowWatchlist(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '8px 12px', borderRadius: 8,
            border: `1px solid ${C.border}`,
            background: C.panel,
            color: C.text2,
            fontSize: 12, fontWeight: 600, fontFamily: C.font,
            cursor: 'pointer', outline: 'none', flexShrink: 0,
          }}
        >
          <ListOrdered size={14} />
          Watch
        </button>

        <div style={{ flex: 1 }} />

        {/* Trade button — opens buy/sell sheet */}
        <button
          onClick={() => setShowTrade(true)}
          style={{
            height: 40, padding: '0 18px', borderRadius: 8, border: 'none', outline: 'none',
            background: 'linear-gradient(90deg, #EF5350 0%, #26A69A 100%)',
            color: '#fff', fontSize: 13, fontWeight: 700, fontFamily: C.font,
            cursor: 'pointer', flexShrink: 0, letterSpacing: '0.03em',
          }}
        >
          Trade
        </button>
      </div>

      {/* ── Sheets ── */}
      {showSymbol && (
        <SymbolSheet
          current={symbol}
          onSelect={setSymbol}
          onClose={() => setShowSymbol(false)}
        />
      )}
      {showIndic && (
        <IndicatorSheet
          config={chartConfig}
          subpanes={subpanes}
          onToggleOverlay={toggleOverlay}
          onToggleSubpane={toggleSubpane}
          onClose={() => setShowIndic(false)}
        />
      )}
      {showDraw && (
        <DrawSheet
          activeTool={drawingMode}
          onSelect={setDrawingMode}
          onClose={() => setShowDraw(false)}
        />
      )}
      {showWatchlist && (
        <WatchlistSheet
          onSymbolSelect={sym => { setSymbol(sym); setShowWatchlist(false); }}
          onClose={() => setShowWatchlist(false)}
        />
      )}
      {showTrade && (
        <TradeSheet
          symbol={symbol}
          price={price}
          onClose={() => setShowTrade(false)}
        />
      )}
    </div>
  );
}
