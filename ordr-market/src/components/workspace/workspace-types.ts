/**
 * ORDR Market — Workspace Type Definitions
 * Central type system for the modular chart workspace.
 */

// ── Panel Tabs ───────────────────────────────────────────────────────────────
export type LeftTab = 'watchlist' | 'draw' | 'indicators' | 'screener' | 'layouts';
export type RightTab = 'properties' | 'layers' | 'ai' | 'orderflow' | 'alerts' | 'news' | 'trade';
export type BottomTab = 'mtf' | 'scanner' | 'replay' | 'strategy' | 'orders';

// ── Chart ────────────────────────────────────────────────────────────────────
export type ChartType = 'candles' | 'hollow' | 'bars' | 'line' | 'area' | 'heikinAshi' | 'baseline';
export type WorkspaceMode = 'focus' | 'workspace' | 'execution';

// ── Indicator Instance ───────────────────────────────────────────────────────
export interface ActiveIndicator {
  id: string;
  name: string;
  params: string;
  value?: string;
  color: string;
  visible: boolean;
  opacity: number;
  locked: boolean;
  pane: 'overlay' | 'separate';
}

// ── Layer Item ───────────────────────────────────────────────────────────────
export interface LayerItem {
  id: string;
  type: 'indicator' | 'drawing' | 'overlay';
  name: string;
  visible: boolean;
  opacity: number;
  locked: boolean;
  order: number;
}

// ── Chart Alert ──────────────────────────────────────────────────────────────
export interface ChartAlert {
  id: string;
  type: 'price' | 'indicator' | 'drawing';
  symbol: string;
  condition: string;
  value: number;
  active: boolean;
  triggered: boolean;
  createdAt: number;
}

// ── Symbol Data ──────────────────────────────────────────────────────────────
export interface SymbolInfo {
  name: string;
  exchange: string;
  market: string;
  price: number;
  change: number;
  changePct: number;
  bid: number;
  ask: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

// ── Workspace State ──────────────────────────────────────────────────────────
export interface WorkspaceState {
  mode: WorkspaceMode;
  symbol: string;
  timeframe: string;
  chartType: ChartType;
  activeTool: string;
  showSR: boolean;
  showFVG: boolean;
  leftTab: LeftTab | null;
  leftPinned: boolean;
  rightTab: RightTab | null;
  bottomTab: BottomTab | null;
  bottomHeight: number;
  indicators: ActiveIndicator[];
  layers: LayerItem[];
  alerts: ChartAlert[];
  timeframeFavorites: string[];
  customTimeframes: string[];
  selectedObjectId: string | null;
  chartConfig: Record<string, boolean>;
  chartSubPanes: string[];
  drawingMode: string | null;
  magnetEnabled: boolean;
  hideDrawings: boolean;
  lockDrawings: boolean;
  deleteDrawingsCounter: number;
}

// ── Workspace Actions ────────────────────────────────────────────────────────
export type WorkspaceAction =
  | { type: 'SET_MODE'; mode: WorkspaceMode }
  | { type: 'SET_SYMBOL'; symbol: string }
  | { type: 'SET_TIMEFRAME'; timeframe: string }
  | { type: 'SET_CHART_TYPE'; chartType: ChartType }
  | { type: 'SET_TOOL'; tool: string }
  | { type: 'TOGGLE_SR' }
  | { type: 'TOGGLE_FVG' }
  | { type: 'SET_LEFT_TAB'; tab: LeftTab | null }
  | { type: 'TOGGLE_LEFT_PIN' }
  | { type: 'SET_RIGHT_TAB'; tab: RightTab | null }
  | { type: 'SET_BOTTOM_TAB'; tab: BottomTab | null }
  | { type: 'SET_BOTTOM_HEIGHT'; height: number }
  | { type: 'ADD_INDICATOR'; indicator: Omit<ActiveIndicator, 'visible' | 'opacity' | 'locked'> }
  | { type: 'REMOVE_INDICATOR'; id: string }
  | { type: 'TOGGLE_INDICATOR_VISIBILITY'; id: string }
  | { type: 'SET_INDICATOR_OPACITY'; id: string; opacity: number }
  | { type: 'TOGGLE_INDICATOR_LOCK'; id: string }
  | { type: 'SET_LAYER_VISIBILITY'; id: string; visible: boolean }
  | { type: 'SET_LAYER_OPACITY'; id: string; opacity: number }
  | { type: 'TOGGLE_LAYER_LOCK'; id: string }
  | { type: 'SOLO_LAYER'; id: string }
  | { type: 'REORDER_LAYERS'; ids: string[] }
  | { type: 'ADD_ALERT'; alert: Omit<ChartAlert, 'id' | 'createdAt'> }
  | { type: 'REMOVE_ALERT'; id: string }
  | { type: 'TOGGLE_ALERT'; id: string }
  | { type: 'TOGGLE_TF_FAVORITE'; tf: string }
  | { type: 'ADD_CUSTOM_TF'; tf: string }
  | { type: 'SET_SELECTED_OBJECT'; id: string | null }
  | { type: 'TOGGLE_CHART_INDICATOR'; key: string }
  | { type: 'SET_CHART_CONFIG'; config: Record<string, boolean> }
  | { type: 'SET_CHART_SUBPANES'; panes: string[] }
  | { type: 'TOGGLE_CHART_SUBPANE'; key: string }
  | { type: 'SET_DRAWING_MODE'; mode: string | null }
  | { type: 'TOGGLE_MAGNET' }
  | { type: 'TOGGLE_HIDE_DRAWINGS' }
  | { type: 'TOGGLE_LOCK_DRAWINGS' }
  | { type: 'DELETE_ALL_DRAWINGS' }
  | { type: 'RESTORE_LAYOUT'; layout: Partial<WorkspaceState> };

// ── Context Value ────────────────────────────────────────────────────────────
export interface WorkspaceContextValue {
  state: WorkspaceState;
  dispatch: React.Dispatch<WorkspaceAction>;
  symbolInfo: SymbolInfo;
}
