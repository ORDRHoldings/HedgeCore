'use client';
/**
 * ORDR Market — Workspace State Provider
 * Centralized state management via useReducer + Context.
 * Handles keyboard shortcuts, layout persistence, and mode transitions.
 */
import React, { createContext, useContext, useReducer, useEffect, useCallback } from 'react';
import { Bell, X } from 'lucide-react';
import { T } from './tokens';
import type {
  WorkspaceState, WorkspaceAction, WorkspaceContextValue,
  WorkspaceToast, ActiveIndicator, ClosedPaperTrade, ChartLayout,
} from './workspace-types';
import { SYMBOL_DATA, DEFAULT_TF_FAVORITES, WORKSPACE_STORAGE_KEY } from './workspace-data';

// ── INDICATOR_LIBRARY id → ChartEngine config/subpane key ────────────────────
const INDICATOR_TO_CHART_KEY: Record<string, string> = {
  // ── Overlay MA lines → chartConfig keys ──────────────────────────────────
  ema20:       'ema20',
  sma50:       'sma50',
  ema200:      'sma200',
  wma:         'wma',
  smma:        'smma',
  dema:        'dema',
  tema:        'tema20',
  lsma:        'lsma',
  alma:        'alma',
  mcginley:    'mcginley',
  vwma:        'vwma',
  hma:         'hma9',
  // ── Overlay special → chartConfig keys ───────────────────────────────────
  vwap:        'vwap',
  ichimoku:    'ichimoku',
  sar:         'parabolicSAR',
  supertrend:  'supertrend',
  chandelier:  'chandelierExit',
  ckstop:      'chandeKrollStop',
  alligator:   'alligator',
  envelope:    'envelope',
  maribbon:    'maRibbon',
  bb:          'bollinger',
  kc:          'keltner',
  dc:          'donchian',
  vpro:        'volumeProfile',
  pivots:      'pivotPoints',
  autofib:     'autoFib',
  zigzag:      'zigzag',
  // ── Separate panes → chartSubPanes keys ──────────────────────────────────
  rsi:         'rsi',
  macd:        'macd',
  sto:         'stochastic',
  stochRSI:    'stochRSI',
  adx:         'adx',
  cci:         'cci',
  mom:         'momentum',
  willr:       'williamsR',
  ao:          'ao',
  bop:         'bop',
  bbtrend:     'bbtrend',
  bbp:         'bullBearPower',
  chaikinOsc:  'chaikinOsc',
  cmo:         'cmo',
  choppiness:  'choppiness',
  chopZone:    'chopZone',
  connorsRSI:  'connorsRSI',
  coppock:     'coppock',
  dpo:         'dpo',
  fisher:      'fisher',
  kst:         'kst',
  massIndex:   'massIndex',
  ppo:         'ppo',
  roc:         'roc',
  rvi:         'rvi',
  smi:         'smi',
  trix:        'trix',
  tsi:         'tsi',
  uo:          'ultimateOscillator',
  vortex:      'vortex',
  aroon:       'aroon',
  atr:         'atr',
  obv:         'obv',
  cmf:         'cmf',
  mfi:         'mfi',
  cvd:         'cvd',
  adl:         'adl',
  pvt:         'pvt',
  netVol:      'netVolume',
  volOsc:      'volumeOscillator',
  eom:         'eom',
  efi:         'efi',
  klinger:     'klinger',
  cvi:         'cvi',
  histvol:     'histVol',
  bbpct:       'bbPercentB',
  bbwid:       'bbWidth',
  correlation: 'correlation',
  adr:         'adr',
};

// ── Initial State ────────────────────────────────────────────────────────────
const initialState: WorkspaceState = {
  mode: 'workspace',
  symbol: 'SPY',
  timeframe: '30m',
  chartType: 'candles',
  activeTool: 'cursor',
  showSR: false,
  showFVG: false,
  leftTab: null,
  leftPinned: false,
  rightTab: null,
  bottomTab: null,
  bottomHeight: 200,
  indicators: [],
  layers: [],
  alerts: [],
  timeframeFavorites: [...DEFAULT_TF_FAVORITES],
  customTimeframes: [],
  selectedObjectId: null,
  selectedObjectData: null,
  pendingDrawingUpdate: null,
  chartConfig: { ema20: true, sr: false, fvg: false, trendlines: true },
  chartSubPanes: [],
  drawingMode: null,
  magnetEnabled: true,
  hideDrawings: false,
  lockDrawings: false,
  deleteDrawingsCounter: 0,
  paperPositions: [],
  tradeHistory: [],
  enabledSessions: [],
  screenshotCounter: 0,
  copyChartImageCounter: 0,
  backtestMarkers: [],
  replayActive: false,
  replayIndex: 0,
  replayPlaying: false,
  replaySpeed: 1,
  replayTotal: 0,
  toasts: [],
  chartLayout: '1',
  priceScaleMode: 'linear',
  showPrevLevels: false,
  showOpenLevels: false,
  showPivots: false,
  showCandlePatterns: false,
  showAutoFib: false,
  showSessionRanges: false,
  crosshairSyncEnabled: true,
  showKillZones: false,
  showEQHL: false,
  compareSymbols: [],
  showNewsOverlay: false,
  alertHistory: [],
  riskLevels: null,
  webhookUrl: '',
  webhookEnabled: false,
  secondaryCharts: [
    { id: 'c1', symbol: 'AAPL',   timeframe: '1D' },
    { id: 'c2', symbol: 'EURUSD', timeframe: '4h' },
    { id: 'c3', symbol: 'BTCUSD', timeframe: '1h' },
  ],
};

// ── Reducer ──────────────────────────────────────────────────────────────────
function workspaceReducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  switch (action.type) {
    case 'SET_MODE': {
      const next = { ...state, mode: action.mode };
      if (action.mode === 'focus') {
        next.leftTab = null;
        next.rightTab = null;
        next.bottomTab = null;
      }
      if (action.mode === 'execution' && !next.rightTab) {
        next.rightTab = 'trade';
      }
      return next;
    }
    case 'SET_SYMBOL':
      return { ...state, symbol: action.symbol.toUpperCase() };
    case 'SET_TIMEFRAME':
      return { ...state, timeframe: action.timeframe };
    case 'SET_CHART_TYPE':
      return { ...state, chartType: action.chartType };
    case 'SET_TOOL':
      return { ...state, activeTool: action.tool };
    case 'TOGGLE_SR':
      return { ...state, showSR: !state.showSR, chartConfig: { ...state.chartConfig, sr: !state.showSR } };
    case 'TOGGLE_FVG':
      return { ...state, showFVG: !state.showFVG, chartConfig: { ...state.chartConfig, fvg: !state.showFVG } };
    case 'SET_LEFT_TAB':
      return { ...state, leftTab: state.leftTab === action.tab ? null : action.tab };
    case 'TOGGLE_LEFT_PIN':
      return { ...state, leftPinned: !state.leftPinned };
    case 'SET_RIGHT_TAB':
      return { ...state, rightTab: state.rightTab === action.tab ? null : action.tab };
    case 'SET_BOTTOM_TAB':
      return { ...state, bottomTab: state.bottomTab === action.tab ? null : action.tab };
    case 'SET_BOTTOM_HEIGHT':
      return { ...state, bottomHeight: Math.max(120, Math.min(400, action.height)) };
    case 'ADD_INDICATOR': {
      if (state.indicators.find(i => i.id === action.indicator.id)) return state;
      const ind: ActiveIndicator = { ...action.indicator, visible: true, opacity: 1, locked: false };
      const addKey = INDICATOR_TO_CHART_KEY[action.indicator.id];
      if (!addKey) return { ...state, indicators: [...state.indicators, ind] };
      if (action.indicator.pane === 'overlay') {
        return { ...state, indicators: [...state.indicators, ind], chartConfig: { ...state.chartConfig, [addKey]: true } };
      }
      const addPanes = state.chartSubPanes.includes(addKey)
        ? state.chartSubPanes
        : state.chartSubPanes.length >= 3
          ? [...state.chartSubPanes.slice(1), addKey]
          : [...state.chartSubPanes, addKey];
      return { ...state, indicators: [...state.indicators, ind], chartSubPanes: addPanes };
    }
    case 'REMOVE_INDICATOR': {
      const removedInd = state.indicators.find(i => i.id === action.id);
      const removeKey = removedInd ? INDICATOR_TO_CHART_KEY[removedInd.id] : undefined;
      if (!removeKey || !removedInd) {
        return { ...state, indicators: state.indicators.filter(i => i.id !== action.id) };
      }
      if (removedInd.pane === 'overlay') {
        return { ...state, indicators: state.indicators.filter(i => i.id !== action.id), chartConfig: { ...state.chartConfig, [removeKey]: false } };
      }
      return { ...state, indicators: state.indicators.filter(i => i.id !== action.id), chartSubPanes: state.chartSubPanes.filter(k => k !== removeKey) };
    }
    case 'TOGGLE_INDICATOR_VISIBILITY':
      return { ...state, indicators: state.indicators.map(i => i.id === action.id ? { ...i, visible: !i.visible } : i) };
    case 'SET_INDICATOR_OPACITY':
      return { ...state, indicators: state.indicators.map(i => i.id === action.id ? { ...i, opacity: action.opacity } : i) };
    case 'SET_INDICATOR_COLOR':
      return { ...state, indicators: state.indicators.map(i => i.id === action.id ? { ...i, color: action.color } : i) };
    case 'TOGGLE_INDICATOR_LOCK':
      return { ...state, indicators: state.indicators.map(i => i.id === action.id ? { ...i, locked: !i.locked } : i) };
    case 'SET_LAYER_VISIBILITY':
      return { ...state, layers: state.layers.map(l => l.id === action.id ? { ...l, visible: action.visible } : l) };
    case 'SET_LAYER_OPACITY':
      return { ...state, layers: state.layers.map(l => l.id === action.id ? { ...l, opacity: action.opacity } : l) };
    case 'TOGGLE_LAYER_LOCK':
      return { ...state, layers: state.layers.map(l => l.id === action.id ? { ...l, locked: !l.locked } : l) };
    case 'SOLO_LAYER':
      return { ...state, layers: state.layers.map(l => ({ ...l, visible: l.id === action.id })) };
    case 'REORDER_LAYERS': {
      const byId = new Map(state.layers.map(l => [l.id, l]));
      return { ...state, layers: action.ids.map((id, i) => ({ ...byId.get(id)!, order: i })).filter(Boolean) };
    }
    case 'REORDER_INDICATORS': {
      const byId = new Map(state.indicators.map(ind => [ind.id, ind]));
      const reordered = action.ids.map(id => byId.get(id)).filter(Boolean) as typeof state.indicators;
      return { ...state, indicators: reordered };
    }
    case 'ADD_ALERT':
      return { ...state, alerts: [...state.alerts, { ...action.alert, id: `alert_${Date.now()}`, createdAt: Date.now() }] };
    case 'REMOVE_ALERT':
      return { ...state, alerts: state.alerts.filter(a => a.id !== action.id) };
    case 'TOGGLE_ALERT':
      return { ...state, alerts: state.alerts.map(a => a.id === action.id ? { ...a, active: !a.active } : a) };
    case 'RESET_ALERT':
      return { ...state, alerts: state.alerts.map(a => a.id === action.id ? { ...a, triggered: false, active: true } : a) };
    case 'ADD_PAPER_POSITION': {
      const pos = { ...action.position, id: `pos_${Date.now()}`, openedAt: Date.now() };
      return { ...state, paperPositions: [...state.paperPositions, pos] };
    }
    case 'CLOSE_PAPER_POSITION': {
      const pos = state.paperPositions.find(p => p.id === action.id);
      if (!pos) return state;
      const pnl = pos.side === 'buy'
        ? (action.exitPrice - pos.entryPrice) * pos.lots
        : (pos.entryPrice - action.exitPrice) * pos.lots;
      const closed: ClosedPaperTrade = {
        id: pos.id, symbol: pos.symbol, side: pos.side, lots: pos.lots,
        entryPrice: pos.entryPrice, exitPrice: action.exitPrice, pnl,
        openedAt: pos.openedAt, closedAt: Date.now(),
      };
      return {
        ...state,
        paperPositions: state.paperPositions.filter(p => p.id !== action.id),
        tradeHistory: [closed, ...state.tradeHistory],
      };
    }
    case 'CLOSE_ALL_POSITIONS': {
      const now = Date.now();
      const closed: ClosedPaperTrade[] = action.exits.flatMap(({ id, exitPrice }) => {
        const pos = state.paperPositions.find(p => p.id === id);
        if (!pos) return [];
        const pnl = pos.side === 'buy'
          ? (exitPrice - pos.entryPrice) * pos.lots
          : (pos.entryPrice - exitPrice) * pos.lots;
        return [{ id: pos.id, symbol: pos.symbol, side: pos.side, lots: pos.lots, entryPrice: pos.entryPrice, exitPrice, pnl, openedAt: pos.openedAt, closedAt: now }];
      });
      const closedIds = new Set(action.exits.map(e => e.id));
      return { ...state, paperPositions: state.paperPositions.filter(p => !closedIds.has(p.id)), tradeHistory: [...closed, ...state.tradeHistory] };
    }
    case 'UPDATE_TRADE_NOTE':
      return { ...state, tradeHistory: state.tradeHistory.map(t => t.id === action.id ? { ...t, note: action.note } : t) };
    case 'ADD_TRADE_TAG': {
      return { ...state, tradeHistory: state.tradeHistory.map(t => t.id === action.id ? { ...t, tags: [...(t.tags ?? []).filter(g => g !== action.tag), action.tag] } : t) };
    }
    case 'REMOVE_TRADE_TAG':
      return { ...state, tradeHistory: state.tradeHistory.map(t => t.id === action.id ? { ...t, tags: (t.tags ?? []).filter(g => g !== action.tag) } : t) };
    case 'TOGGLE_TF_FAVORITE': {
      const favs = new Set(state.timeframeFavorites);
      if (favs.has(action.tf)) favs.delete(action.tf); else favs.add(action.tf);
      return { ...state, timeframeFavorites: [...favs] };
    }
    case 'ADD_CUSTOM_TF':
      return state.customTimeframes.includes(action.tf) ? state : { ...state, customTimeframes: [...state.customTimeframes, action.tf] };
    case 'SET_SELECTED_OBJECT':
      return { ...state, selectedObjectId: action.id, selectedObjectData: action.id ? state.selectedObjectData : null, pendingDrawingUpdate: null };
    case 'SET_SELECTED_OBJECT_DATA':
      return { ...state, selectedObjectData: action.data };
    case 'UPDATE_DRAWING_STYLE': {
      const upd = state.selectedObjectData
        ? { ...state.selectedObjectData, ...action.patch }
        : state.selectedObjectData;
      return {
        ...state,
        selectedObjectData: upd,
        pendingDrawingUpdate: { id: action.id, ...action.patch },
      };
    }
    case 'TOGGLE_CHART_INDICATOR': {
      const prev = state.chartConfig[action.key] ?? false;
      const next = { ...state, chartConfig: { ...state.chartConfig, [action.key]: !prev } };
      if (action.key === 'sr')  next.showSR  = !prev;
      if (action.key === 'fvg') next.showFVG = !prev;
      return next;
    }
    case 'SET_CHART_CONFIG':
      return { ...state, chartConfig: action.config };
    case 'SET_CHART_SUBPANES':
      return { ...state, chartSubPanes: action.panes };
    case 'TOGGLE_CHART_SUBPANE': {
      const panes = state.chartSubPanes;
      if (panes.includes(action.key)) {
        return { ...state, chartSubPanes: panes.filter(k => k !== action.key) };
      }
      const next = panes.length >= 3 ? [...panes.slice(1), action.key] : [...panes, action.key];
      return { ...state, chartSubPanes: next };
    }
    case 'SET_DRAWING_MODE':
      return { ...state, drawingMode: action.mode };
    case 'TOGGLE_SESSION': {
      const key = action.session.toLowerCase().replace(/\s+/g, '');
      const has = state.enabledSessions.some(s => s === key);
      return { ...state, enabledSessions: has ? state.enabledSessions.filter(s => s !== key) : [...state.enabledSessions, key] };
    }
    case 'CAPTURE_SCREENSHOT':
      return { ...state, screenshotCounter: state.screenshotCounter + 1 };
    case 'COPY_CHART_IMAGE':
      return { ...state, copyChartImageCounter: state.copyChartImageCounter + 1 };
    case 'SET_BACKTEST_MARKERS':
      return { ...state, backtestMarkers: action.markers };
    case 'TOGGLE_MAGNET':
      return { ...state, magnetEnabled: !state.magnetEnabled };
    case 'TOGGLE_HIDE_DRAWINGS':
      return { ...state, hideDrawings: !state.hideDrawings };
    case 'TOGGLE_LOCK_DRAWINGS':
      return { ...state, lockDrawings: !state.lockDrawings };
    case 'DELETE_ALL_DRAWINGS':
      return { ...state, deleteDrawingsCounter: state.deleteDrawingsCounter + 1 };
    case 'RESTORE_LAYOUT':
      return { ...state, ...action.layout };
    case 'SET_CHART_LAYOUT':
      return { ...state, chartLayout: action.layout };
    case 'UPDATE_SECONDARY_CHART':
      return {
        ...state,
        secondaryCharts: state.secondaryCharts.map(c =>
          c.id === action.id
            ? { ...c, ...(action.symbol !== undefined ? { symbol: action.symbol } : {}), ...(action.timeframe !== undefined ? { timeframe: action.timeframe } : {}) }
            : c
        ),
      };
    case 'SET_PRICE_SCALE_MODE':
      return { ...state, priceScaleMode: action.mode };
    case 'TOGGLE_PREV_LEVELS':
      return { ...state, showPrevLevels: !state.showPrevLevels };
    case 'TOGGLE_OPEN_LEVELS':
      return { ...state, showOpenLevels: !state.showOpenLevels };
    case 'TOGGLE_PIVOTS':
      return { ...state, showPivots: !state.showPivots };
    case 'TOGGLE_CANDLE_PATTERNS':
      return { ...state, showCandlePatterns: !state.showCandlePatterns };
    case 'TOGGLE_AUTO_FIB':
      return { ...state, showAutoFib: !state.showAutoFib };
    case 'TOGGLE_SESSION_RANGES':
      return { ...state, showSessionRanges: !state.showSessionRanges };
    case 'TOGGLE_CROSSHAIR_SYNC':
      return { ...state, crosshairSyncEnabled: !state.crosshairSyncEnabled };
    case 'TOGGLE_KILL_ZONES':
      return { ...state, showKillZones: !state.showKillZones };
    case 'TOGGLE_EQHL':
      return { ...state, showEQHL: !state.showEQHL };
    case 'ADD_COMPARE': {
      if (state.compareSymbols.includes(action.symbol) || state.compareSymbols.length >= 4) return state;
      return { ...state, compareSymbols: [...state.compareSymbols, action.symbol] };
    }
    case 'REMOVE_COMPARE':
      return { ...state, compareSymbols: state.compareSymbols.filter(s => s !== action.symbol) };
    case 'TOGGLE_NEWS_OVERLAY':
      return { ...state, showNewsOverlay: !state.showNewsOverlay };
    case 'LOG_ALERT_TRIGGER': {
      const newEntry = { ...action.entry, id: Math.random().toString(36).slice(2) };
      const trimmed = [newEntry, ...state.alertHistory].slice(0, 100);
      return { ...state, alertHistory: trimmed };
    }
    case 'CLEAR_ALERT_HISTORY':
      return { ...state, alertHistory: [] };
    case 'SET_RISK_LEVELS':
      return { ...state, riskLevels: action.levels };
    case 'SET_WEBHOOK_URL':
      return { ...state, webhookUrl: action.url };
    case 'TOGGLE_WEBHOOK_ENABLED':
      return { ...state, webhookEnabled: !state.webhookEnabled };
    case 'REPLAY_START':
      return {
        ...state,
        replayActive: true,
        replayPlaying: false,
        // Start at 40% of bars, minimum 50
        replayIndex: Math.max(50, Math.floor(state.replayTotal * 0.4)),
      };
    case 'REPLAY_STOP':
      return { ...state, replayActive: false, replayPlaying: false };
    case 'REPLAY_PLAY':
      return { ...state, replayPlaying: true };
    case 'REPLAY_PAUSE':
      return { ...state, replayPlaying: false };
    case 'REPLAY_SEEK':
      return { ...state, replayIndex: Math.max(1, Math.min(state.replayTotal, action.index)) };
    case 'REPLAY_STEP':
      return { ...state, replayIndex: Math.max(1, Math.min(state.replayTotal, state.replayIndex + action.delta)) };
    case 'REPLAY_SET_SPEED':
      return { ...state, replaySpeed: action.speed };
    case 'SET_REPLAY_TOTAL':
      return { ...state, replayTotal: action.total };
    case 'TRIGGER_ALERT':
      return {
        ...state,
        alerts: state.alerts.map(a =>
          a.id === action.id ? { ...a, triggered: true, active: false } : a
        ),
      };
    case 'ADD_TOAST': {
      const toast: WorkspaceToast = {
        ...action.toast,
        id: Math.random().toString(36).slice(2),
        createdAt: Date.now(),
      };
      return { ...state, toasts: [...state.toasts.slice(-4), toast] }; // cap at 5
    }
    case 'REMOVE_TOAST':
      return { ...state, toasts: state.toasts.filter(t => t.id !== action.id) };
    default:
      return state;
  }
}

// ── Context ──────────────────────────────────────────────────────────────────
const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(workspaceReducer, initialState, (init) => {
    if (typeof window === 'undefined') return init;
    try {
      // If a default named layout is set, load it instead of raw workspace state
      const namedLayouts: { id: string; isDefault?: boolean; snapshot: Partial<typeof init> }[] =
        JSON.parse(localStorage.getItem('ordr_named_layouts') ?? '[]');
      const defaultLayout = namedLayouts.find(l => l.isDefault);
      if (defaultLayout?.snapshot) {
        return { ...init, ...defaultLayout.snapshot };
      }
      const stored = localStorage.getItem(WORKSPACE_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return { ...init, ...parsed };
      }
    } catch { /* ignore */ }
    return init;
  });

  // Apply URL share params on mount (symbol, tf)
  // ?s=EURUSD&tf=4h&ind=ema20,rsi — indicators param is encoded but only sym/tf are restored
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sp = new URLSearchParams(window.location.search);
    const sym = sp.get('s');
    const tf  = sp.get('tf');
    if (sym) dispatch({ type: 'SET_SYMBOL', symbol: sym.toUpperCase() });
    if (tf)  dispatch({ type: 'SET_TIMEFRAME', timeframe: tf });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist layout + chart state changes
  useEffect(() => {
    try {
      const {
        mode, leftTab, rightTab, bottomTab, bottomHeight,
        timeframeFavorites, customTimeframes, leftPinned,
        symbol, timeframe, chartType, chartConfig, chartSubPanes,
        showSR, showFVG, magnetEnabled, alerts,
        paperPositions, tradeHistory, enabledSessions,
        chartLayout, secondaryCharts, priceScaleMode, showPrevLevels, showOpenLevels, showPivots, showCandlePatterns, showAutoFib, showSessionRanges,
        crosshairSyncEnabled, showKillZones, showEQHL, compareSymbols, showNewsOverlay,
        alertHistory, webhookUrl, webhookEnabled,
      } = state;
      localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify({
        mode, leftTab, rightTab, bottomTab, bottomHeight,
        timeframeFavorites, customTimeframes, leftPinned,
        symbol, timeframe, chartType, chartConfig, chartSubPanes,
        showSR, showFVG, magnetEnabled, alerts,
        paperPositions, tradeHistory, enabledSessions,
        chartLayout, secondaryCharts, priceScaleMode, showPrevLevels, showOpenLevels, showPivots, showCandlePatterns, showAutoFib, showSessionRanges,
        crosshairSyncEnabled, showKillZones, showEQHL, compareSymbols, showNewsOverlay,
        alertHistory, webhookUrl, webhookEnabled,
      }));
    } catch { /* ignore */ }
  }, [
    state.mode, state.leftTab, state.rightTab, state.bottomTab, state.bottomHeight,
    state.timeframeFavorites, state.customTimeframes, state.leftPinned,
    state.symbol, state.timeframe, state.chartType, state.chartConfig, state.chartSubPanes,
    state.showSR, state.showFVG, state.magnetEnabled, state.alerts,
    state.paperPositions, state.tradeHistory, state.enabledSessions,
    state.chartLayout, state.secondaryCharts, state.priceScaleMode, state.showPrevLevels, state.showOpenLevels, state.showPivots, state.showCandlePatterns,
    state.crosshairSyncEnabled, state.showKillZones, state.showEQHL, state.compareSymbols, state.showNewsOverlay,
    state.alertHistory, state.webhookUrl, state.webhookEnabled,
  ]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const ctrl = e.ctrlKey || e.metaKey;

      // Panel toggles
      if (e.key === 'b' && ctrl && !e.shiftKey) { e.preventDefault(); dispatch({ type: 'SET_LEFT_TAB', tab: 'watchlist' }); return; }
      if (e.key === 'B' && ctrl && e.shiftKey) { e.preventDefault(); dispatch({ type: 'SET_RIGHT_TAB', tab: 'properties' }); return; }
      if (e.key === 'j' && ctrl) { e.preventDefault(); dispatch({ type: 'SET_BOTTOM_TAB', tab: 'mtf' }); return; }

      // Tools
      if (e.key === 'v' && !ctrl && !e.shiftKey) { dispatch({ type: 'SET_TOOL', tool: 'cursor' }); return; }
      if (e.key === 'V' && e.shiftKey && !ctrl) { dispatch({ type: 'SET_TOOL', tool: 'crosshair' }); return; }
      if (e.key === 'm' && !ctrl) { dispatch({ type: 'SET_TOOL', tool: 'measure' }); return; }

      // Mode
      if (e.key === 'F11') { e.preventDefault(); dispatch({ type: 'SET_MODE', mode: state.mode === 'focus' ? 'workspace' : 'focus' }); return; }

      // Replay keyboard controls
      if (e.key === 'ArrowRight' && !ctrl && state.replayActive) {
        e.preventDefault(); dispatch({ type: 'REPLAY_STEP', delta: 1 }); return;
      }
      if (e.key === 'ArrowLeft' && !ctrl && state.replayActive) {
        e.preventDefault(); dispatch({ type: 'REPLAY_STEP', delta: -1 }); return;
      }
      if (e.key === ' ' && state.replayActive) {
        e.preventDefault();
        dispatch({ type: state.replayPlaying ? 'REPLAY_PAUSE' : 'REPLAY_PLAY' });
        return;
      }

      // Escape
      if (e.key === 'Escape') {
        dispatch({ type: 'SET_TOOL', tool: 'cursor' });
        dispatch({ type: 'SET_SELECTED_OBJECT', id: null });
        return;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [state.mode, state.replayActive, state.replayPlaying]);

  // Generate synthetic SymbolInfo for symbols not in the static data (stocks, etc.)
  const symbolInfo = SYMBOL_DATA[state.symbol] ?? (() => {
    const seed = state.symbol.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    const price = 50 + (seed % 400) + (seed % 100) / 100;
    const change = ((seed * 7) % 200 - 100) / 100;
    return {
      name: state.symbol,
      exchange: price > 200 ? 'NASDAQ' : 'NYSE',
      market: 'US',
      price, change, changePct: +(change / price * 100).toFixed(2),
      bid: +(price - 0.02).toFixed(2), ask: +(price + 0.02).toFixed(2),
      open: +(price - change).toFixed(2),
      high: +(price + Math.abs(change) * 1.5).toFixed(2),
      low: +(price - Math.abs(change) * 1.2).toFixed(2),
      close: price,
    };
  })();

  return (
    <WorkspaceContext.Provider value={{ state, dispatch, symbolInfo }}>
      {children}
      <ToastLayer />
    </WorkspaceContext.Provider>
  );
}

// ── Toast Layer ───────────────────────────────────────────────────────────────
function ToastLayer() {
  const { state, dispatch } = useWorkspace();
  const { toasts } = state;

  // Auto-dismiss oldest toast after 5s
  useEffect(() => {
    if (!toasts.length) return;
    const oldest = toasts[0];
    const remaining = Math.max(200, 5000 - (Date.now() - oldest.createdAt));
    const id = window.setTimeout(() => dispatch({ type: 'REMOVE_TOAST', id: oldest.id }), remaining);
    return () => window.clearTimeout(id);
  }, [toasts, dispatch]);

  if (!toasts.length) return null;

  return (
    <div style={{
      position: 'fixed', bottom: 80, right: 16, zIndex: 9999,
      display: 'flex', flexDirection: 'column-reverse', gap: 6,
      pointerEvents: 'none',
    }}>
      {toasts.map(toast => (
        <div
          key={toast.id}
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 14px', borderRadius: 6,
            background: 'rgba(18,22,33,0.97)',
            border: `1px solid ${toast.type === 'alert' ? '#FF9800' : toast.type === 'error' ? T.bear : T.border}`,
            boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
            minWidth: 240, maxWidth: 340,
            pointerEvents: 'auto',
          }}
        >
          <Bell size={14} color={toast.type === 'alert' ? '#FF9800' : T.text2} style={{ flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: T.text1, fontFamily: T.font, flex: 1, lineHeight: 1.4 }}>
            {toast.message}
          </span>
          <button
            onClick={() => dispatch({ type: 'REMOVE_TOAST', id: toast.id })}
            style={{
              border: 'none', background: 'none', cursor: 'pointer',
              color: T.text3, padding: 0, outline: 'none', flexShrink: 0,
              display: 'flex', alignItems: 'center',
            }}
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used within WorkspaceProvider');
  return ctx;
}
