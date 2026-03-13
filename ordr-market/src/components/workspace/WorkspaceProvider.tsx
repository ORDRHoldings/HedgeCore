'use client';
/**
 * ORDR Market — Workspace State Provider
 * Centralized state management via useReducer + Context.
 * Handles keyboard shortcuts, layout persistence, and mode transitions.
 */
import React, { createContext, useContext, useReducer, useEffect } from 'react';
import type {
  WorkspaceState, WorkspaceAction, WorkspaceContextValue,
  ActiveIndicator,
} from './workspace-types';
import { SYMBOL_DATA, DEFAULT_TF_FAVORITES, WORKSPACE_STORAGE_KEY } from './workspace-data';

// ── Initial State ────────────────────────────────────────────────────────────
const initialState: WorkspaceState = {
  mode: 'workspace',
  symbol: 'EURUSD',
  timeframe: '30m',
  chartType: 'candle',
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
      return { ...state, showSR: !state.showSR };
    case 'TOGGLE_FVG':
      return { ...state, showFVG: !state.showFVG };
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
      return { ...state, indicators: [...state.indicators, ind] };
    }
    case 'REMOVE_INDICATOR':
      return { ...state, indicators: state.indicators.filter(i => i.id !== action.id) };
    case 'TOGGLE_INDICATOR_VISIBILITY':
      return { ...state, indicators: state.indicators.map(i => i.id === action.id ? { ...i, visible: !i.visible } : i) };
    case 'SET_INDICATOR_OPACITY':
      return { ...state, indicators: state.indicators.map(i => i.id === action.id ? { ...i, opacity: action.opacity } : i) };
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
    case 'ADD_ALERT':
      return { ...state, alerts: [...state.alerts, { ...action.alert, id: `alert_${Date.now()}`, createdAt: Date.now() }] };
    case 'REMOVE_ALERT':
      return { ...state, alerts: state.alerts.filter(a => a.id !== action.id) };
    case 'TOGGLE_ALERT':
      return { ...state, alerts: state.alerts.map(a => a.id === action.id ? { ...a, active: !a.active } : a) };
    case 'TOGGLE_TF_FAVORITE': {
      const favs = new Set(state.timeframeFavorites);
      if (favs.has(action.tf)) favs.delete(action.tf); else favs.add(action.tf);
      return { ...state, timeframeFavorites: [...favs] };
    }
    case 'ADD_CUSTOM_TF':
      return state.customTimeframes.includes(action.tf) ? state : { ...state, customTimeframes: [...state.customTimeframes, action.tf] };
    case 'SET_SELECTED_OBJECT':
      return { ...state, selectedObjectId: action.id };
    case 'RESTORE_LAYOUT':
      return { ...state, ...action.layout };
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
      const stored = localStorage.getItem(WORKSPACE_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return { ...init, ...parsed };
      }
    } catch { /* ignore */ }
    return init;
  });

  // Persist layout changes
  useEffect(() => {
    try {
      const { mode, leftTab, rightTab, bottomTab, bottomHeight, timeframeFavorites, customTimeframes, leftPinned } = state;
      localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify({
        mode, leftTab, rightTab, bottomTab, bottomHeight, timeframeFavorites, customTimeframes, leftPinned,
      }));
    } catch { /* ignore */ }
  }, [state.mode, state.leftTab, state.rightTab, state.bottomTab, state.bottomHeight,
      state.timeframeFavorites, state.customTimeframes, state.leftPinned]);

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

      // Escape
      if (e.key === 'Escape') {
        dispatch({ type: 'SET_TOOL', tool: 'cursor' });
        dispatch({ type: 'SET_SELECTED_OBJECT', id: null });
        return;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [state.mode]);

  const symbolInfo = SYMBOL_DATA[state.symbol] ?? SYMBOL_DATA['EURUSD'];

  return (
    <WorkspaceContext.Provider value={{ state, dispatch, symbolInfo }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used within WorkspaceProvider');
  return ctx;
}
