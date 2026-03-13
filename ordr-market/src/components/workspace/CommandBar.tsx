'use client';
/**
 * ORDR Market — Command Bar
 * Premium 36px top bar with three zones: left (brand/search), center (price/timeframes), right (tools/account).
 */
import React, { useState, useRef, useEffect } from 'react';
import {
  Search, ChevronDown, CandlestickChart, BarChart2, LineChart, AreaChart,
  TrendingUp, Bell, Settings, User, Star, X, Plus, Check,
  PlaySquare, Bot, Layers, SlidersHorizontal,
  Activity, Eye, Focus, LayoutDashboard, Zap,
} from 'lucide-react';
import { T } from './tokens';
import { ThemeSwitcher } from './ThemeSwitcher';
import { useWorkspace } from './WorkspaceProvider';
import { SYMBOL_DATA, BASE_TIMEFRAMES, INDICATOR_LIBRARY, INDICATOR_CATEGORIES, formatPrice } from './workspace-data';
import type { ChartType, WorkspaceMode } from './workspace-types';

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

// ── Symbol Search ────────────────────────────────────────────────────────────
function SymbolSearch() {
  const { state, dispatch } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [hlIdx, setHlIdx] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => { if (open && inputRef.current) inputRef.current.focus(); }, [open]);

  const symbols = Object.keys(SYMBOL_DATA);
  const filtered = symbols.filter(s => {
    if (!search) return true;
    const q = search.toUpperCase();
    return s.includes(q) || SYMBOL_DATA[s].name.toUpperCase().includes(q);
  });

  const select = (sym: string) => {
    dispatch({ type: 'SET_SYMBOL', symbol: sym });
    setOpen(false);
    setSearch('');
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHlIdx(i => Math.min(i + 1, filtered.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setHlIdx(i => Math.max(i - 1, 0)); }
    if (e.key === 'Enter' && filtered[hlIdx]) { select(filtered[hlIdx]); }
    if (e.key === 'Escape') { setOpen(false); }
  };

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={() => { setOpen(!open); setSearch(''); setHlIdx(0); }}
        style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '0 7px', height: 26, borderRadius: 3,
          border: `1px solid ${open ? T.accent : T.border}`, background: T.surfaceAlt,
          cursor: 'pointer', flexShrink: 0, outline: 'none',
        }}
        onMouseEnter={e => { if (!open) e.currentTarget.style.borderColor = T.accent; }}
        onMouseLeave={e => { if (!open) e.currentTarget.style.borderColor = T.border; }}
      >
        <Search size={11} color={T.text3} />
        <span style={{ fontSize: 13, fontWeight: 700, color: T.text1, letterSpacing: '-0.3px', fontFamily: T.font }}>
          {state.symbol}
        </span>
        <ChevronDown size={9} color={T.text3} />
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 32, left: 0, zIndex: 100,
          background: T.surface, border: `1px solid ${T.border}`,
          borderRadius: T.r4, boxShadow: T.shadowFloat,
          width: 260, maxHeight: 320, display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ padding: '6px 8px', borderBottom: `1px solid ${T.border}` }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '0 8px', height: 28, borderRadius: 3,
              background: T.surfaceAlt, border: `1px solid ${T.border}`,
            }}>
              <Search size={12} color={T.text3} />
              <input
                ref={inputRef}
                value={search}
                onChange={e => { setSearch(e.target.value); setHlIdx(0); }}
                onKeyDown={handleKey}
                placeholder="Search symbol..."
                style={{
                  flex: 1, border: 'none', outline: 'none', background: 'transparent',
                  fontSize: 11, color: T.text1, fontFamily: T.font,
                }}
              />
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '2px 0' }}>
            {filtered.map((sym, idx) => {
              const info = SYMBOL_DATA[sym];
              const active = sym === state.symbol;
              const highlighted = idx === hlIdx;
              const bull = info.change >= 0;
              return (
                <div
                  key={sym}
                  onClick={() => select(sym)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '6px 10px', cursor: 'pointer',
                    background: highlighted ? T.panelHover : active ? T.panelActive : 'transparent',
                  }}
                  onMouseEnter={() => setHlIdx(idx)}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: T.text1, fontFamily: T.font }}>{sym}</span>
                      <span style={{ fontSize: 9, color: T.text3, fontFamily: T.font, fontWeight: 500 }}>{info.exchange}</span>
                    </div>
                    <div style={{ fontSize: 9, color: T.text3, fontFamily: T.font }}>{info.name}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: T.text1, fontFamily: T.mono, fontVariantNumeric: 'tabular-nums' }}>
                      {formatPrice(info.price)}
                    </div>
                    <div style={{ fontSize: 9, fontWeight: 500, color: bull ? '#26A69A' : '#EF5350', fontFamily: T.mono }}>
                      {bull ? '+' : ''}{info.changePct.toFixed(2)}%
                    </div>
                  </div>
                  {active && <Check size={11} color={T.accent} />}
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div style={{ padding: '16px 10px', fontSize: 11, color: T.text3, textAlign: 'center' }}>No symbols found</div>
            )}
          </div>
        </div>
      )}
    </div>
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
    { id: 'candle', icon: <CandlestickChart size={14} />, label: 'Candlestick' },
    { id: 'bar',    icon: <BarChart2 size={14} />,        label: 'Bars' },
    { id: 'line',   icon: <LineChart size={14} />,         label: 'Line' },
    { id: 'area',   icon: <AreaChart size={14} />,         label: 'Area' },
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

  const activeIds = new Set(state.indicators.map(i => i.id));
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
        {state.indicators.length > 0 && (
          <span style={{
            fontSize: 9, fontWeight: 700, color: '#fff',
            background: T.accent, borderRadius: 6, padding: '0 4px', height: 14,
            display: 'inline-flex', alignItems: 'center',
          }}>
            {state.indicators.length}
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
              const added = activeIds.has(ind.id);
              return (
                <div
                  key={ind.id}
                  onClick={() => {
                    if (!added) {
                      dispatch({ type: 'ADD_INDICATOR', indicator: { id: ind.id, name: ind.shortName, params: ind.defaultParams, color: ind.color, pane: ind.pane } });
                    } else {
                      dispatch({ type: 'REMOVE_INDICATOR', id: ind.id });
                    }
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '5px 10px', cursor: 'pointer',
                    background: added ? T.panelActive : 'transparent',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = added ? T.panelActive : T.panelHover; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = added ? T.panelActive : 'transparent'; }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: ind.color, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 500, color: T.text1, fontFamily: T.font }}>{ind.name}</div>
                    <div style={{ fontSize: 9, color: T.text3, fontFamily: T.font }}>{ind.shortName}{ind.defaultParams ? ` (${ind.defaultParams})` : ''}</div>
                  </div>
                  <span style={{ fontSize: 9, color: T.text3, fontFamily: T.font, textTransform: 'uppercase' }}>{ind.pane === 'overlay' ? 'OVR' : 'SEP'}</span>
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

// ── Main Command Bar ─────────────────────────────────────────────────────────
export function CommandBar() {
  const { state, dispatch, symbolInfo } = useWorkspace();
  const bull = symbolInfo.change >= 0;
  const priceColor = bull ? T.bull : T.bear;

  return (
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
      <CmdBtn title="Settings"><Settings size={13} /></CmdBtn>
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
  );
}
