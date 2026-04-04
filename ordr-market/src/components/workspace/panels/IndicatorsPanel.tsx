'use client';
import React, { useState, useMemo } from 'react';
import { Search, Eye, EyeOff, X, Check } from 'lucide-react';
import { T } from '../tokens';
import { useWorkspace } from '../WorkspaceProvider';

// ── Indicator Definitions (inline — 77 total) ──────────────────────────────

type IndicatorType = 'overlay' | 'subpane';

interface IndicatorDef {
  key: string;
  label: string;
  color: string;
  type: IndicatorType;
  categories: string[];
}

// Overlay indicators (34)
const OVERLAYS: IndicatorDef[] = [
  { key: 'sma20',           label: 'SMA(20)',          color: '#FFD54F',  type: 'overlay', categories: ['movingAvg'] },
  { key: 'sma50',           label: 'SMA(50)',          color: '#FF8A65',  type: 'overlay', categories: ['movingAvg'] },
  { key: 'sma200',          label: 'SMA(200)',         color: '#FF5252',  type: 'overlay', categories: ['movingAvg'] },
  { key: 'ema20',           label: 'EMA(20)',          color: '#26C6DA',  type: 'overlay', categories: ['movingAvg'] },
  { key: 'ema50',           label: 'EMA(50)',          color: '#00E676',  type: 'overlay', categories: ['movingAvg'] },
  { key: 'hma9',            label: 'HMA(9)',           color: '#00E676',  type: 'overlay', categories: ['movingAvg'] },
  { key: 'tema20',          label: 'TEMA(20)',         color: '#FF4081',  type: 'overlay', categories: ['movingAvg'] },
  { key: 'vwap',            label: 'VWAP',             color: '#B2B5BE',  type: 'overlay', categories: ['volume'] },
  { key: 'bollinger',       label: 'BB(20,2)',         color: '#2196F3',  type: 'overlay', categories: ['bands'] },
  { key: 'keltner',         label: 'KC(20,10)',        color: '#E91E63',  type: 'overlay', categories: ['bands'] },
  { key: 'ichimoku',        label: 'Ichimoku',         color: '#2962FF',  type: 'overlay', categories: ['trend'] },
  { key: 'donchian',        label: 'DC(20)',           color: '#00BCD4',  type: 'overlay', categories: ['bands'] },
  { key: 'volumeProfile',   label: 'Vol Profile',      color: '#FF6D00',  type: 'overlay', categories: ['volume'] },
  { key: 'sr',              label: 'S/R',              color: '#26A69A',  type: 'overlay', categories: ['structure'] },
  { key: 'fvg',             label: 'FVG',              color: '#26A69A',  type: 'overlay', categories: ['structure'] },
  { key: 'trendlines',      label: 'Trendlines',       color: '#EF5350',  type: 'overlay', categories: ['structure'] },
  { key: 'pivotPoints',     label: 'Pivot Pts',        color: '#9598A1',  type: 'overlay', categories: ['structure'] },
  { key: 'parabolicSAR',    label: 'SAR',              color: '#26A69A',  type: 'overlay', categories: ['trend'] },
  { key: 'wma',             label: 'WMA(20)',          color: '#FF9800',  type: 'overlay', categories: ['movingAvg'] },
  { key: 'smma',            label: 'SMMA(20)',         color: '#FF7043',  type: 'overlay', categories: ['movingAvg'] },
  { key: 'alma',            label: 'ALMA(21)',         color: '#AB47BC',  type: 'overlay', categories: ['movingAvg'] },
  { key: 'dema',            label: 'DEMA(20)',         color: '#26C6DA',  type: 'overlay', categories: ['movingAvg'] },
  { key: 'lsma',            label: 'LSMA(25)',         color: '#66BB6A',  type: 'overlay', categories: ['movingAvg'] },
  { key: 'mcginley',        label: 'McGinley(14)',     color: '#FFA726',  type: 'overlay', categories: ['movingAvg'] },
  { key: 'vwma',            label: 'VWMA(20)',         color: '#EC407A',  type: 'overlay', categories: ['movingAvg', 'volume'] },
  { key: 'envelope',        label: 'ENV(20,2.5)',      color: '#78909C',  type: 'overlay', categories: ['bands'] },
  { key: 'supertrend',      label: 'SuperTrend(10,3)', color: '#26A69A',  type: 'overlay', categories: ['trend'] },
  { key: 'chandelierExit',  label: 'CE(22,3)',         color: '#26A69A',  type: 'overlay', categories: ['trend'] },
  { key: 'chandeKrollStop', label: 'CKS',              color: '#EF5350',  type: 'overlay', categories: ['trend'] },
  { key: 'alligator',       label: 'Alligator',        color: '#2962FF',  type: 'overlay', categories: ['trend'] },
  { key: 'zigzag',          label: 'ZigZag',           color: '#FFD54F',  type: 'overlay', categories: ['structure'] },
  { key: 'autoFib',         label: 'AutoFib',          color: '#26A69A',  type: 'overlay', categories: ['structure'] },
  { key: 'maRibbon',        label: 'MA Ribbon',        color: '#EF5350',  type: 'overlay', categories: ['movingAvg'] },
];

// Sub-pane indicators (43)
const SUBPANES: IndicatorDef[] = [
  { key: 'rsi',               label: 'RSI(14)',          color: '#7B1FA2',  type: 'subpane', categories: ['oscillators'] },
  { key: 'macd',              label: 'MACD(12,26,9)',    color: '#2962FF',  type: 'subpane', categories: ['oscillators'] },
  { key: 'stochastic',        label: 'Stoch(14,3)',      color: '#FF6D00',  type: 'subpane', categories: ['oscillators'] },
  { key: 'stochRSI',          label: 'StochRSI',         color: '#FF6D00',  type: 'subpane', categories: ['oscillators'] },
  { key: 'williamsR',         label: 'Williams %R',      color: '#FF6D00',  type: 'subpane', categories: ['oscillators'] },
  { key: 'cci',               label: 'CCI(20)',          color: '#2196F3',  type: 'subpane', categories: ['oscillators'] },
  { key: 'adx',               label: 'ADX(14)',          color: '#787B86',  type: 'subpane', categories: ['trend'] },
  { key: 'obv',               label: 'OBV',              color: '#FF9800',  type: 'subpane', categories: ['volume'] },
  { key: 'mfi',               label: 'MFI(14)',          color: '#E040FB',  type: 'subpane', categories: ['volume'] },
  { key: 'cmf',               label: 'CMF(20)',          color: '#00BCD4',  type: 'subpane', categories: ['volume'] },
  { key: 'ao',                label: 'AO',               color: '#26A69A',  type: 'subpane', categories: ['oscillators'] },
  { key: 'bop',               label: 'BOP',              color: '#9E9E9E',  type: 'subpane', categories: ['oscillators', 'volume'] },
  { key: 'bbtrend',           label: 'BBTrend',          color: '#2196F3',  type: 'subpane', categories: ['trend'] },
  { key: 'bullBearPower',     label: 'Bull/Bear Power',  color: '#26A69A',  type: 'subpane', categories: ['volume'] },
  { key: 'chaikinOsc',        label: 'Chaikin Osc',      color: '#00BCD4',  type: 'subpane', categories: ['volume'] },
  { key: 'cmo',               label: 'CMO(14)',          color: '#FF6D00',  type: 'subpane', categories: ['oscillators'] },
  { key: 'choppiness',        label: 'Choppiness(14)',   color: '#9E9E9E',  type: 'subpane', categories: ['trend'] },
  { key: 'chopZone',          label: 'Chop Zone',        color: '#9E9E9E',  type: 'subpane', categories: ['trend'] },
  { key: 'connorsRSI',        label: 'CRSI',             color: '#7B1FA2',  type: 'subpane', categories: ['oscillators'] },
  { key: 'coppock',           label: 'Coppock',          color: '#FF9800',  type: 'subpane', categories: ['oscillators'] },
  { key: 'dpo',               label: 'DPO(21)',          color: '#FF4081',  type: 'subpane', categories: ['oscillators'] },
  { key: 'eom',               label: 'EOM(14)',          color: '#9E9E9E',  type: 'subpane', categories: ['volume'] },
  { key: 'efi',               label: 'EFI(13)',          color: '#9E9E9E',  type: 'subpane', categories: ['volume'] },
  { key: 'fisher',            label: 'Fisher',           color: '#E91E63',  type: 'subpane', categories: ['oscillators'] },
  { key: 'klinger',           label: 'Klinger',          color: '#2196F3',  type: 'subpane', categories: ['volume'] },
  { key: 'kst',               label: 'KST',              color: '#FF9800',  type: 'subpane', categories: ['oscillators'] },
  { key: 'massIndex',         label: 'Mass Index',       color: '#9C27B0',  type: 'subpane', categories: ['trend'] },
  { key: 'momentum',          label: 'Momentum(10)',     color: '#26C6DA',  type: 'subpane', categories: ['oscillators'] },
  { key: 'ppo',               label: 'PPO',              color: '#2962FF',  type: 'subpane', categories: ['oscillators'] },
  { key: 'roc',               label: 'ROC(9)',           color: '#00BCD4',  type: 'subpane', categories: ['oscillators'] },
  { key: 'rvi',               label: 'RVI(10)',          color: '#26C6DA',  type: 'subpane', categories: ['oscillators'] },
  { key: 'smi',               label: 'SMI',              color: '#00E676',  type: 'subpane', categories: ['oscillators'] },
  { key: 'trix',              label: 'TRIX(18)',         color: '#FF4081',  type: 'subpane', categories: ['oscillators'] },
  { key: 'tsi',               label: 'TSI',              color: '#7B1FA2',  type: 'subpane', categories: ['oscillators'] },
  { key: 'ultimateOscillator', label: 'UO(7,14,28)',    color: '#FF9800',  type: 'subpane', categories: ['oscillators'] },
  { key: 'vortex',            label: 'Vortex(14)',       color: '#26C6DA',  type: 'subpane', categories: ['trend'] },
  { key: 'aroon',             label: 'Aroon(25)',        color: '#26C6DA',  type: 'subpane', categories: ['trend'] },
  { key: 'adl',               label: 'ADL',              color: '#FF9800',  type: 'subpane', categories: ['volume'] },
  { key: 'cvd',               label: 'CVD',              color: '#26C6DA',  type: 'subpane', categories: ['volume'] },
  { key: 'cvi',               label: 'CVI(10)',          color: '#FF6D00',  type: 'subpane', categories: ['volume'] },
  { key: 'netVolume',         label: 'Net Vol',          color: '#26A69A',  type: 'subpane', categories: ['volume'] },
  { key: 'pvt',               label: 'PVT',              color: '#E91E63',  type: 'subpane', categories: ['volume'] },
  { key: 'volumeOscillator',  label: 'Vol Osc',          color: '#FF9800',  type: 'subpane', categories: ['volume'] },
  { key: 'bbPercentB',        label: 'BB %B',            color: '#2196F3',  type: 'subpane', categories: ['bands'] },
  { key: 'bbWidth',           label: 'BB Width',         color: '#FF9800',  type: 'subpane', categories: ['bands'] },
  { key: 'histVol',           label: 'Hist Vol',         color: '#7B1FA2',  type: 'subpane', categories: ['structure'] },
  { key: 'correlation',       label: 'Correlation',      color: '#26A69A',  type: 'subpane', categories: ['structure'] },
  { key: 'adr',               label: 'ADR(14)',          color: '#FFD54F',  type: 'subpane', categories: ['structure'] },
];

const ALL_INDICATORS: IndicatorDef[] = [...OVERLAYS, ...SUBPANES];

// Lookup map for fast access
const INDICATOR_MAP = new Map<string, IndicatorDef>(ALL_INDICATORS.map(d => [d.key, d]));

// ── Categories ──────────────────────────────────────────────────────────────

interface CategoryDef {
  id: string;
  label: string;
  keys: Set<string>;
}

const CATEGORIES: CategoryDef[] = [
  { id: 'all',        label: 'All',        keys: new Set(ALL_INDICATORS.map(d => d.key)) },
  { id: 'movingAvg',  label: 'Moving Avg', keys: new Set(ALL_INDICATORS.filter(d => d.categories.includes('movingAvg')).map(d => d.key)) },
  { id: 'oscillators', label: 'Oscillators', keys: new Set(ALL_INDICATORS.filter(d => d.categories.includes('oscillators')).map(d => d.key)) },
  { id: 'bands',      label: 'Bands',      keys: new Set(ALL_INDICATORS.filter(d => d.categories.includes('bands')).map(d => d.key)) },
  { id: 'trend',      label: 'Trend',      keys: new Set(ALL_INDICATORS.filter(d => d.categories.includes('trend')).map(d => d.key)) },
  { id: 'volume',     label: 'Volume',     keys: new Set(ALL_INDICATORS.filter(d => d.categories.includes('volume')).map(d => d.key)) },
  { id: 'structure',  label: 'Structure',  keys: new Set(ALL_INDICATORS.filter(d => d.categories.includes('structure')).map(d => d.key)) },
];

// ── Component ───────────────────────────────────────────────────────────────

export function IndicatorsPanel() {
  const { state, dispatch } = useWorkspace();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');

  // Derive active set from chartConfig (overlays) + chartSubPanes (sub-panes)
  const activeKeys = useMemo(() => {
    const s = new Set<string>();
    // overlay keys that are true in chartConfig
    for (const [k, v] of Object.entries(state.chartConfig)) {
      if (v && INDICATOR_MAP.has(k)) s.add(k);
    }
    // sub-pane keys
    for (const k of state.chartSubPanes) {
      if (INDICATOR_MAP.has(k)) s.add(k);
    }
    return s;
  }, [state.chartConfig, state.chartSubPanes]);

  // Filtered list
  const filtered = useMemo(() => {
    const catDef = CATEGORIES.find(c => c.id === category);
    const q = search.toLowerCase().trim();
    return ALL_INDICATORS.filter(ind => {
      if (catDef && catDef.id !== 'all' && !catDef.keys.has(ind.key)) return false;
      if (q && !ind.label.toLowerCase().includes(q) && !ind.key.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [category, search]);

  // Active indicators for the top section
  const activeIndicators = useMemo(
    () => ALL_INDICATORS.filter(d => activeKeys.has(d.key)),
    [activeKeys],
  );

  function toggle(ind: IndicatorDef) {
    if (ind.type === 'overlay') {
      dispatch({ type: 'TOGGLE_CHART_INDICATOR', key: ind.key });
    } else {
      dispatch({ type: 'TOGGLE_CHART_SUBPANE', key: ind.key });
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* ── Search ──────────────────────────────────────────────────────── */}
      <div style={{ padding: '6px 8px', flexShrink: 0 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '0 8px', height: 26, borderRadius: 3,
          background: T.surfaceAlt, border: `1px solid ${T.border}`,
        }}>
          <Search size={11} color={T.text3} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search 77 indicators..."
            style={{
              flex: 1, border: 'none', outline: 'none', background: 'transparent',
              fontSize: 11, color: T.text1, fontFamily: T.font,
            }}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              style={{ display: 'flex', border: 'none', background: 'none', cursor: 'pointer', padding: 0, color: T.text3 }}
            >
              <X size={10} />
            </button>
          )}
        </div>
      </div>

      {/* ── Category Tabs ───────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 0, padding: '0 6px 4px', flexWrap: 'wrap', flexShrink: 0 }}>
        {CATEGORIES.map(cat => (
          <button
            key={cat.id}
            onClick={() => setCategory(cat.id)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 3,
              padding: '0 6px', height: 20, borderRadius: 3, border: 'none', outline: 'none',
              background: category === cat.id ? T.accentBg : 'transparent',
              color: category === cat.id ? T.accent : T.text3,
              fontSize: 9, fontWeight: category === cat.id ? 600 : 400,
              fontFamily: T.font, cursor: 'pointer',
              transition: 'background 0.12s, color 0.12s',
            }}
          >
            {cat.label}
            <span style={{ fontSize: 8, opacity: 0.7 }}>{cat.keys.size}</span>
          </button>
        ))}
      </div>

      {/* ── Active Indicators ───────────────────────────────────────────── */}
      {activeIndicators.length > 0 && (
        <div style={{ padding: '4px 8px', borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
          <div style={{
            fontSize: 9, fontWeight: 700, color: T.text3,
            letterSpacing: '0.06em', marginBottom: 3, fontFamily: T.font,
          }}>
            ACTIVE ({activeIndicators.length})
          </div>
          {activeIndicators.map(ind => (
            <div
              key={ind.key}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '3px 4px', borderRadius: 3, marginBottom: 1,
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = T.panelHover; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: ind.color, flexShrink: 0 }} />
              <span style={{ fontSize: 10, fontWeight: 500, color: T.text1, fontFamily: T.font, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {ind.label}
              </span>
              <span style={{ fontSize: 8, color: T.text3, fontFamily: T.font, textTransform: 'uppercase' as const, opacity: 0.7, flexShrink: 0 }}>
                {ind.type === 'overlay' ? 'OVR' : 'SUB'}
              </span>
              {/* Remove — X removes the indicator */}
              <button
                onClick={e => { e.stopPropagation(); toggle(ind); }}
                title="Remove"
                style={{
                  display: 'flex', alignItems: 'center', border: 'none',
                  background: 'none', cursor: 'pointer', padding: 2, outline: 'none',
                  color: T.text3, borderRadius: 2, flexShrink: 0,
                }}
                onMouseEnter={e => { e.currentTarget.style.color = T.bear; }}
                onMouseLeave={e => { e.currentTarget.style.color = T.text3; }}
              >
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Indicator List (scrollable) ─────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '2px 0' }}>
        {filtered.length === 0 && (
          <div style={{
            padding: '16px 12px', textAlign: 'center',
            fontSize: 11, color: T.text3, fontFamily: T.font,
          }}>
            No indicators match &ldquo;{search}&rdquo;
          </div>
        )}
        {filtered.map(ind => {
          const active = activeKeys.has(ind.key);
          return (
            <div
              key={ind.key}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '5px 8px', cursor: 'pointer',
                background: active ? T.panelActive : 'transparent',
                margin: '0 4px', borderRadius: 3, marginBottom: 1,
              }}
              onClick={() => toggle(ind)}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = active ? T.panelActive : T.panelHover; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = active ? T.panelActive : 'transparent'; }}
            >
              {/* Color dot */}
              <span style={{
                width: 5, height: 5, borderRadius: '50%',
                background: ind.color, flexShrink: 0,
              }} />
              {/* Label + type badge */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 10, fontWeight: 500, color: T.text1, fontFamily: T.font }}>
                  {ind.label}
                </div>
                <div style={{ fontSize: 9, color: T.text3, fontFamily: T.font }}>
                  {ind.type === 'overlay' ? 'Overlay' : 'Sub-pane'}
                </div>
              </div>
              {/* Active check */}
              {active && <Check size={10} color={T.accent} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
