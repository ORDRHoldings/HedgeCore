'use client';
/**
 * ORDR Market — Command Palette (Cmd/Ctrl+K)
 *
 * Instant fuzzy search across: symbols · indicators (77) · timeframes · workspace commands · drawing tools.
 * Keyboard navigation: ↑↓ to move, Enter to execute, Escape to close.
 */
import React, {
  useState, useEffect, useRef, useCallback, useMemo,
} from 'react';
import {
  Search, Check, TrendingUp, BarChart2, Clock,
  Terminal, Pencil, X,
} from 'lucide-react';
import { T } from './tokens';
import { useWorkspace } from './WorkspaceProvider';
import { DEFAULT_WATCHLIST, BASE_TIMEFRAMES, SYMBOL_DATA } from './workspace-data';

// ── Fuzzy rank ────────────────────────────────────────────────────────────────
function rank(query: string, text: string): number | null {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (!q) return 1;
  if (t === q)         return 0;
  if (t.startsWith(q)) return 0.5;
  if (t.includes(q))   return 1;
  // subsequence
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length ? 2 : null;
}

// ── Indicator data (mirrors IndicatorsPanel lists) ────────────────────────────
const OVERLAY_LIST = [
  { key: 'sma20',         label: 'SMA(20)',           color: '#FFD54F' },
  { key: 'sma50',         label: 'SMA(50)',            color: '#FF8A65' },
  { key: 'sma200',        label: 'SMA(200)',           color: '#FF5252' },
  { key: 'ema20',         label: 'EMA(20)',            color: '#26C6DA' },
  { key: 'ema50',         label: 'EMA(50)',            color: '#00E676' },
  { key: 'hma9',          label: 'HMA(9)',             color: '#00E676' },
  { key: 'tema20',        label: 'TEMA(20)',           color: '#FF4081' },
  { key: 'vwap',          label: 'VWAP',              color: '#B2B5BE' },
  { key: 'bollinger',     label: 'BB(20,2)',           color: '#2196F3' },
  { key: 'keltner',       label: 'KC(20,10)',          color: '#E91E63' },
  { key: 'ichimoku',      label: 'Ichimoku',           color: '#2962FF' },
  { key: 'donchian',      label: 'DC(20)',             color: '#00BCD4' },
  { key: 'volumeProfile', label: 'Vol Profile',        color: '#FF6D00' },
  { key: 'sr',            label: 'S/R',               color: '#26A69A' },
  { key: 'fvg',           label: 'FVG',               color: '#26A69A' },
  { key: 'trendlines',    label: 'Trendlines',         color: '#EF5350' },
  { key: 'pivotPoints',   label: 'Pivot Points',       color: '#9598A1' },
  { key: 'parabolicSAR',  label: 'Parabolic SAR',      color: '#26A69A' },
  { key: 'wma',           label: 'WMA(20)',            color: '#FF9800' },
  { key: 'smma',          label: 'SMMA(20)',           color: '#FF7043' },
  { key: 'alma',          label: 'ALMA(21)',           color: '#AB47BC' },
  { key: 'dema',          label: 'DEMA(20)',           color: '#26C6DA' },
  { key: 'lsma',          label: 'LSMA(25)',           color: '#66BB6A' },
  { key: 'mcginley',      label: 'McGinley(14)',        color: '#FFA726' },
  { key: 'vwma',          label: 'VWMA(20)',           color: '#EC407A' },
  { key: 'envelope',      label: 'ENV(20,2.5)',         color: '#78909C' },
  { key: 'supertrend',    label: 'SuperTrend(10,3)',    color: '#26A69A' },
  { key: 'chandelierExit', label: 'Chandelier Exit',   color: '#26A69A' },
  { key: 'chandeKrollStop', label: 'Chande Kroll Stop', color: '#EF5350' },
  { key: 'alligator',     label: 'Alligator',          color: '#2962FF' },
  { key: 'zigzag',        label: 'ZigZag',             color: '#FFD54F' },
  { key: 'autoFib',       label: 'Auto Fibonacci',      color: '#26A69A' },
  { key: 'maRibbon',      label: 'MA Ribbon',          color: '#EF5350' },
] as const;

const SUBPANE_LIST = [
  { key: 'rsi',             label: 'RSI(14)',            color: '#7B1FA2' },
  { key: 'macd',            label: 'MACD(12,26,9)',      color: '#2962FF' },
  { key: 'stochastic',      label: 'Stochastic(14,3)',   color: '#FF6D00' },
  { key: 'stochRSI',        label: 'Stochastic RSI',     color: '#FF6D00' },
  { key: 'williamsR',       label: "Williams %R",        color: '#FF6D00' },
  { key: 'cci',             label: 'CCI(20)',            color: '#2196F3' },
  { key: 'adx',             label: 'ADX(14)',            color: '#787B86' },
  { key: 'obv',             label: 'OBV',               color: '#FF9800' },
  { key: 'mfi',             label: 'MFI(14)',            color: '#E040FB' },
  { key: 'cmf',             label: 'CMF(20)',            color: '#00BCD4' },
  { key: 'ao',              label: 'Awesome Oscillator', color: '#26A69A' },
  { key: 'bop',             label: 'Balance of Power',   color: '#9E9E9E' },
  { key: 'bbtrend',         label: 'BB Trend',          color: '#2196F3' },
  { key: 'bullBearPower',   label: 'Bull/Bear Power',    color: '#26A69A' },
  { key: 'chaikinOsc',      label: 'Chaikin Oscillator', color: '#00BCD4' },
  { key: 'cmo',             label: 'CMO(14)',            color: '#FF6D00' },
  { key: 'choppiness',      label: 'Choppiness(14)',     color: '#9E9E9E' },
  { key: 'connorsRSI',      label: 'Connors RSI',        color: '#7B1FA2' },
  { key: 'coppock',         label: 'Coppock Curve',      color: '#FF9800' },
  { key: 'dpo',             label: 'DPO(21)',            color: '#FF4081' },
  { key: 'fisher',          label: 'Fisher Transform',   color: '#E91E63' },
  { key: 'klinger',         label: 'Klinger Volume',     color: '#2196F3' },
  { key: 'kst',             label: 'KST',               color: '#FF9800' },
  { key: 'momentum',        label: 'Momentum(10)',        color: '#26C6DA' },
  { key: 'ppo',             label: 'PPO',               color: '#2962FF' },
  { key: 'roc',             label: 'ROC(9)',             color: '#00BCD4' },
  { key: 'rvi',             label: 'RVI(10)',            color: '#26C6DA' },
  { key: 'smi',             label: 'SMI',               color: '#00E676' },
  { key: 'trix',            label: 'TRIX(18)',           color: '#FF4081' },
  { key: 'tsi',             label: 'TSI',               color: '#7B1FA2' },
  { key: 'ultimateOscillator', label: 'Ultimate Oscillator', color: '#FF9800' },
  { key: 'aroon',           label: 'Aroon(25)',          color: '#26C6DA' },
  { key: 'adl',             label: 'ADL',               color: '#FF9800' },
  { key: 'cvd',             label: 'CVD',               color: '#26C6DA' },
  { key: 'netVolume',       label: 'Net Volume',         color: '#26A69A' },
  { key: 'pvt',             label: 'PVT',               color: '#E91E63' },
  { key: 'bbPercentB',      label: 'BB %B',             color: '#2196F3' },
  { key: 'bbWidth',         label: 'BB Width',          color: '#FF9800' },
  { key: 'histVol',         label: 'Historical Volatility', color: '#7B1FA2' },
  { key: 'adr',             label: 'ADR(14)',            color: '#FFD54F' },
] as const;

// ── Drawing tools ──────────────────────────────────────────────────────────────
const DRAWING_TOOLS = [
  { key: 'trendline',          label: 'Trendline' },
  { key: 'horizontal',         label: 'Horizontal Line' },
  { key: 'ray',                label: 'Ray' },
  { key: 'channel',            label: 'Channel' },
  { key: 'rectangle',          label: 'Rectangle' },
  { key: 'fibonacci',          label: 'Fibonacci Retracement' },
  { key: 'fibretracement',     label: 'Fib Retracement (alt)' },
  { key: 'fibextension',       label: 'Fibonacci Extension' },
  { key: 'pitchfork',          label: 'Andrews Pitchfork' },
  { key: 'triangle',           label: 'Triangle' },
  { key: 'ellipse',            label: 'Ellipse' },
  { key: 'text',               label: 'Text Label' },
  { key: 'arrow',              label: 'Arrow' },
  { key: 'anchored_vwap',      label: 'Anchored VWAP' },
] as const;

// ── Result type ───────────────────────────────────────────────────────────────
interface PaletteItem {
  id: string;
  group: 'symbol' | 'indicator' | 'timeframe' | 'command' | 'drawing';
  groupLabel: string;
  icon: React.ReactNode;
  label: string;
  sublabel?: string;
  accentColor?: string;
  active?: boolean;
  kbd?: string;
  action: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────
interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const { state, dispatch } = useWorkspace();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  // Build all items (memoized — recomputes only on state change)
  const allItems = useMemo<PaletteItem[]>(() => {
    const items: PaletteItem[] = [];
    const close = () => onClose();

    // ── Symbols ───────────────────────────────────────────────────────────
    for (const { symbol } of DEFAULT_WATCHLIST) {
      const info = SYMBOL_DATA[symbol];
      items.push({
        id: `sym_${symbol}`,
        group: 'symbol',
        groupLabel: 'SYMBOLS',
        icon: <TrendingUp size={12} />,
        label: symbol,
        sublabel: info?.name ?? '',
        active: state.symbol === symbol,
        action: () => { dispatch({ type: 'SET_SYMBOL', symbol }); close(); },
      });
    }

    // ── Overlay indicators ────────────────────────────────────────────────
    for (const ind of OVERLAY_LIST) {
      const active = !!(state.chartConfig as Record<string, boolean>)[ind.key];
      items.push({
        id: `ovl_${ind.key}`,
        group: 'indicator',
        groupLabel: 'INDICATORS',
        icon: <BarChart2 size={12} />,
        label: ind.label,
        sublabel: 'Overlay',
        accentColor: ind.color,
        active,
        action: () => {
          dispatch({ type: 'TOGGLE_CHART_INDICATOR', key: ind.key });
          close();
        },
      });
    }

    // ── Sub-pane indicators ───────────────────────────────────────────────
    for (const ind of SUBPANE_LIST) {
      const active = state.chartSubPanes.includes(ind.key);
      items.push({
        id: `sub_${ind.key}`,
        group: 'indicator',
        groupLabel: 'INDICATORS',
        icon: <BarChart2 size={12} />,
        label: ind.label,
        sublabel: 'Sub-pane',
        accentColor: ind.color,
        active,
        action: () => {
          dispatch({ type: 'TOGGLE_CHART_SUBPANE', key: ind.key });
          close();
        },
      });
    }

    // ── Timeframes ────────────────────────────────────────────────────────
    for (const tf of BASE_TIMEFRAMES) {
      items.push({
        id: `tf_${tf}`,
        group: 'timeframe',
        groupLabel: 'TIMEFRAMES',
        icon: <Clock size={12} />,
        label: tf,
        sublabel: tfName(tf),
        active: state.timeframe === tf,
        action: () => { dispatch({ type: 'SET_TIMEFRAME', timeframe: tf }); close(); },
      });
    }

    // ── Drawing tools ─────────────────────────────────────────────────────
    for (const tool of DRAWING_TOOLS) {
      items.push({
        id: `drw_${tool.key}`,
        group: 'drawing',
        groupLabel: 'DRAWING',
        icon: <Pencil size={12} />,
        label: tool.label,
        sublabel: 'Drawing tool',
        action: () => {
          dispatch({ type: 'SET_DRAWING_MODE', mode: tool.key });
          dispatch({ type: 'SET_TOOL', tool: 'pencil' });
          close();
        },
      });
    }

    // ── Commands ──────────────────────────────────────────────────────────
    const cmds: { label: string; sublabel: string; active?: boolean; kbd?: string; action: () => void }[] = [
      {
        label: 'FVG Zones',
        sublabel: 'Toggle Fair Value Gap overlay',
        active: !!(state.chartConfig as Record<string, boolean>).fvg,
        action: () => { dispatch({ type: 'TOGGLE_CHART_INDICATOR', key: 'fvg' }); close(); },
      },
      {
        label: 'Support & Resistance',
        sublabel: 'Toggle S/R levels',
        active: !!(state.chartConfig as Record<string, boolean>).sr,
        action: () => { dispatch({ type: 'TOGGLE_CHART_INDICATOR', key: 'sr' }); close(); },
      },
      {
        label: 'Auto Trendlines',
        sublabel: 'Toggle auto trendline detection',
        active: !!(state.chartConfig as Record<string, boolean>).trendlines,
        action: () => { dispatch({ type: 'TOGGLE_CHART_INDICATOR', key: 'trendlines' }); close(); },
      },
      {
        label: 'Previous Day Levels',
        sublabel: 'Toggle PDH / PDL / PDC',
        active: state.showPrevLevels,
        action: () => { dispatch({ type: 'TOGGLE_PREV_LEVELS' }); close(); },
      },
      {
        label: 'Linear Scale',
        sublabel: 'Set price scale to linear',
        active: state.priceScaleMode === 'linear',
        action: () => { dispatch({ type: 'SET_PRICE_SCALE_MODE', mode: 'linear' }); close(); },
      },
      {
        label: 'Log Scale',
        sublabel: 'Set price scale to logarithmic',
        active: state.priceScaleMode === 'log',
        action: () => { dispatch({ type: 'SET_PRICE_SCALE_MODE', mode: 'log' }); close(); },
      },
      {
        label: 'Percent Scale',
        sublabel: 'Set price scale to % change',
        active: state.priceScaleMode === 'percent',
        action: () => { dispatch({ type: 'SET_PRICE_SCALE_MODE', mode: 'percent' }); close(); },
      },
      {
        label: 'Bar Replay',
        sublabel: 'Toggle bar replay mode',
        active: state.replayActive,
        action: () => {
          dispatch({ type: state.replayActive ? 'REPLAY_STOP' : 'REPLAY_START' });
          close();
        },
      },
      {
        label: 'Screenshot',
        sublabel: 'Capture chart as image',
        kbd: 'Alt+S',
        action: () => { dispatch({ type: 'CAPTURE_SCREENSHOT' }); close(); },
      },
      {
        label: 'Focus Mode',
        sublabel: 'Maximum chart, minimal panels',
        active: state.mode === 'focus',
        action: () => { dispatch({ type: 'SET_MODE', mode: 'focus' }); close(); },
      },
      {
        label: 'Default Layout',
        sublabel: 'Full workspace with watchlist',
        active: state.mode === 'workspace',
        action: () => { dispatch({ type: 'SET_MODE', mode: 'workspace' }); close(); },
      },
      {
        label: '1×1 Chart Grid',
        sublabel: 'Single chart layout',
        active: state.chartLayout === '1',
        action: () => { dispatch({ type: 'SET_CHART_LAYOUT', layout: '1' }); close(); },
      },
      {
        label: '2 Charts Horizontal',
        sublabel: 'Side-by-side chart grid',
        active: state.chartLayout === '2h',
        action: () => { dispatch({ type: 'SET_CHART_LAYOUT', layout: '2h' }); close(); },
      },
      {
        label: '2 Charts Vertical',
        sublabel: 'Stacked chart grid',
        active: state.chartLayout === '2v',
        action: () => { dispatch({ type: 'SET_CHART_LAYOUT', layout: '2v' }); close(); },
      },
      {
        label: '2×2 Chart Grid',
        sublabel: 'Four-panel chart grid',
        active: state.chartLayout === '4',
        action: () => { dispatch({ type: 'SET_CHART_LAYOUT', layout: '4' }); close(); },
      },
      {
        label: 'Clear All Drawings',
        sublabel: 'Remove all drawings from chart',
        action: () => { dispatch({ type: 'DELETE_ALL_DRAWINGS' }); close(); },
      },
      {
        label: 'Lock Drawings',
        sublabel: 'Prevent drawing edits',
        active: state.lockDrawings,
        action: () => { dispatch({ type: 'TOGGLE_LOCK_DRAWINGS' }); close(); },
      },
      {
        label: 'Hide Drawings',
        sublabel: 'Temporarily hide all drawings',
        active: state.hideDrawings,
        action: () => { dispatch({ type: 'TOGGLE_HIDE_DRAWINGS' }); close(); },
      },
    ];
    for (const cmd of cmds) {
      items.push({
        id: `cmd_${cmd.label}`,
        group: 'command',
        groupLabel: 'COMMANDS',
        icon: <Terminal size={12} />,
        ...cmd,
      });
    }

    return items;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.symbol, state.chartConfig, state.chartSubPanes, state.timeframe,
      state.priceScaleMode, state.replayActive, state.mode, state.chartLayout,
      state.showPrevLevels, state.lockDrawings, state.hideDrawings]);

  // Filter + rank
  const filtered = useMemo<PaletteItem[]>(() => {
    if (!query.trim()) {
      // No query → show a useful default set
      return [
        ...allItems.filter(i => i.group === 'symbol').slice(0, 6),
        ...allItems.filter(i => i.group === 'timeframe'),
        ...allItems.filter(i => i.group === 'command').slice(0, 8),
      ];
    }
    const scored: { item: PaletteItem; score: number }[] = [];
    for (const item of allItems) {
      const labelScore = rank(query, item.label);
      const subScore   = item.sublabel ? rank(query, item.sublabel) : null;
      const best = [labelScore, subScore].filter(s => s !== null) as number[];
      if (best.length === 0) continue;
      scored.push({ item, score: Math.min(...best) });
    }
    scored.sort((a, b) => {
      // Sort by score, then by group priority
      if (a.score !== b.score) return a.score - b.score;
      const gp: Record<string, number> = { symbol: 0, timeframe: 1, indicator: 2, drawing: 3, command: 4 };
      return (gp[a.item.group] ?? 9) - (gp[b.item.group] ?? 9);
    });
    // Cap per group
    const groupCounts: Record<string, number> = {};
    const limits: Record<string, number> = { symbol: 5, indicator: 10, timeframe: 10, drawing: 6, command: 8 };
    return scored
      .filter(({ item }) => {
        groupCounts[item.group] = (groupCounts[item.group] ?? 0) + 1;
        return groupCounts[item.group] <= (limits[item.group] ?? 8);
      })
      .map(({ item }) => item);
  }, [allItems, query]);

  // Reset active index when filtered list changes
  useEffect(() => { setActiveIndex(0); }, [filtered]);

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${activeIndex}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      filtered[activeIndex]?.action();
    } else if (e.key === 'Escape') {
      onClose();
    }
  }, [filtered, activeIndex, onClose]);

  if (!open) return null;

  // Group items for section headers
  let lastGroup = '';

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: 80,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 560, maxWidth: 'calc(100vw - 32px)',
          maxHeight: 520,
          borderRadius: 8, overflow: 'hidden',
          background: 'var(--bg-panel, #1E2030)',
          border: `1px solid ${T.border}`,
          boxShadow: '0 8px 40px rgba(0,0,0,0.4), 0 2px 12px rgba(0,0,0,0.2)',
          display: 'flex', flexDirection: 'column',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Search input */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 14px',
          borderBottom: `1px solid ${T.border}`,
        }}>
          <Search size={15} style={{ color: T.text3, flexShrink: 0 }} />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search indicators, symbols, commands…"
            style={{
              flex: 1, border: 'none', outline: 'none', background: 'transparent',
              color: T.text1, fontSize: 14, fontFamily: T.font,
            }}
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 2, color: T.text3, outline: 'none', display: 'flex', alignItems: 'center' }}
            >
              <X size={12} />
            </button>
          )}
          <kbd style={{
            fontSize: 10, padding: '2px 6px', borderRadius: 3,
            border: `1px solid ${T.border}`, background: T.surfaceAlt,
            color: T.text3, fontFamily: T.mono,
          }}>
            Esc
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} style={{ flex: 1, overflowY: 'auto' }}>
          {filtered.length === 0 && (
            <div style={{
              padding: '24px 16px', textAlign: 'center',
              color: T.text3, fontSize: 12, fontFamily: T.font,
            }}>
              No results for &ldquo;{query}&rdquo;
            </div>
          )}
          {filtered.map((item, idx) => {
            const showHeader = item.groupLabel !== lastGroup;
            lastGroup = item.groupLabel;
            const isActive = idx === activeIndex;
            return (
              <React.Fragment key={item.id}>
                {showHeader && (
                  <div style={{
                    padding: '8px 14px 4px',
                    fontSize: 9, fontWeight: 700, color: T.text3,
                    letterSpacing: '0.08em', fontFamily: T.font,
                    borderTop: idx > 0 ? `1px solid ${T.border}` : undefined,
                  }}>
                    {item.groupLabel}
                  </div>
                )}
                <div
                  data-idx={idx}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={item.action}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 14px',
                    background: isActive ? T.accentBg : 'transparent',
                    cursor: 'pointer',
                    transition: 'background 0.05s',
                  }}
                >
                  {/* Color dot for indicators */}
                  {item.accentColor ? (
                    <span style={{
                      width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                      background: item.accentColor,
                    }} />
                  ) : (
                    <span style={{ color: isActive ? T.accent : T.text3, flexShrink: 0 }}>
                      {item.icon}
                    </span>
                  )}

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 12, fontWeight: 500,
                      color: isActive ? T.accent : T.text1,
                      fontFamily: item.group === 'symbol' || item.group === 'timeframe'
                        ? "'IBM Plex Mono', monospace" : T.font,
                    }}>
                      {item.label}
                    </div>
                    {item.sublabel && (
                      <div style={{
                        fontSize: 10, color: T.text3, fontFamily: T.font, marginTop: 1,
                      }}>
                        {item.sublabel}
                      </div>
                    )}
                  </div>

                  {/* Active state check */}
                  {item.active && (
                    <Check size={11} style={{ color: T.bull, flexShrink: 0 }} />
                  )}

                  {/* Keyboard shortcut */}
                  {item.kbd && (
                    <kbd style={{
                      fontSize: 9, padding: '1px 5px', borderRadius: 3,
                      border: `1px solid ${T.border}`, background: T.surfaceAlt,
                      color: T.text3, fontFamily: T.mono,
                    }}>
                      {item.kbd}
                    </kbd>
                  )}
                </div>
              </React.Fragment>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', gap: 12, alignItems: 'center',
          padding: '6px 14px',
          borderTop: `1px solid ${T.border}`,
          color: T.text3, fontSize: 9, fontFamily: T.font,
        }}>
          <span><kbd style={{ fontFamily: T.mono, fontSize: 9 }}>↑↓</kbd> navigate</span>
          <span><kbd style={{ fontFamily: T.mono, fontSize: 9 }}>↵</kbd> select</span>
          <span><kbd style={{ fontFamily: T.mono, fontSize: 9 }}>Esc</kbd> close</span>
          <span style={{ marginLeft: 'auto' }}>
            {filtered.length} result{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Timeframe labels ──────────────────────────────────────────────────────────
function tfName(tf: string): string {
  const map: Record<string, string> = {
    '1m': '1 Minute', '3m': '3 Minutes', '5m': '5 Minutes',
    '15m': '15 Minutes', '30m': '30 Minutes',
    '1h': '1 Hour', '4h': '4 Hours',
    'D': 'Daily', 'W': 'Weekly', 'M': 'Monthly',
  };
  return map[tf] ?? tf;
}
