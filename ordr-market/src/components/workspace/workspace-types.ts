/**
 * ORDR Market — Workspace Type Definitions
 * Central type system for the modular chart workspace.
 */

// ── Panel Tabs ───────────────────────────────────────────────────────────────
export type LeftTab = 'watchlist' | 'draw' | 'indicators' | 'screener' | 'layouts';
export type RightTab = 'properties' | 'layers' | 'ai' | 'orderflow' | 'alerts' | 'news' | 'trade' | 'watchlist' | 'risk' | 'heatmap' | 'notes' | 'corr';
export type BottomTab = 'mtf' | 'scanner' | 'replay' | 'strategy' | 'orders' | 'confluence';
export type ChartLayout = '1' | '2h' | '2v' | '4';

// ── Secondary Chart Pane ─────────────────────────────────────────────────────
export interface SecondaryChart {
  id: string;
  symbol: string;
  timeframe: string;
}

// ── Chart ────────────────────────────────────────────────────────────────────
export type ChartType = 'candles' | 'hollow' | 'bars' | 'line' | 'area' | 'heikinAshi' | 'baseline' | 'renko' | 'linebreak';
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

// ── Alert History ─────────────────────────────────────────────────────────────
export interface AlertHistoryEntry {
  id: string;
  symbol: string;
  condition: string;
  value: number;
  triggerPrice: number;
  triggeredAt: string; // ISO string
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

// ── Paper Position ───────────────────────────────────────────────────────────
export interface PaperPosition {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  lots: number;
  entryPrice: number;
  sl: number | null;
  tp: number | null;
  openedAt: number;
  orderType: 'market' | 'limit' | 'stop';
}

export interface ClosedPaperTrade {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  lots: number;
  entryPrice: number;
  exitPrice: number;
  pnl: number; // in price points
  openedAt: number;
  closedAt: number;
  note?: string;  // trade journal annotation
  tags?: string[];
}

// ── Backtest on-chart markers ─────────────────────────────────────────────────
export interface BacktestMarker {
  entryT:      number;  // unix ms — entry bar timestamp
  exitT:       number;  // unix ms — exit bar timestamp
  entryPrice:  number;
  exitPrice:   number;
  side:        'long' | 'short';
  win:         boolean;
}

// ── Toast Notification ───────────────────────────────────────────────────────
export interface WorkspaceToast {
  id: string;
  message: string;
  type: 'alert' | 'info' | 'error';
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
  paperPositions: PaperPosition[];
  tradeHistory: ClosedPaperTrade[];
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
  selectedObjectData: { type: string; color: string; lineWidth: number; lineStyle: string; label: string; opacity: number; locked: boolean } | null;
  pendingDrawingUpdate: { id: string; color?: string; lineWidth?: number; lineStyle?: string; opacity?: number } | null;
  chartConfig: Record<string, boolean>;
  chartSubPanes: string[];
  drawingMode: string | null;
  magnetEnabled: boolean;
  hideDrawings: boolean;
  lockDrawings: boolean;
  deleteDrawingsCounter: number;
  toasts: WorkspaceToast[];
  // Session highlights
  enabledSessions: string[];
  // Chart screenshot / copy trigger
  screenshotCounter: number;
  copyChartImageCounter: number;
  // Backtest on-chart markers
  backtestMarkers: BacktestMarker[];
  // Bar replay
  replayActive: boolean;
  replayIndex: number;     // bars visible (1-based slice end)
  replayPlaying: boolean;
  replaySpeed: 1 | 2 | 4 | 8;
  replayTotal: number;     // total bars available from fetch
  // Multi-chart grid
  chartLayout: ChartLayout;
  secondaryCharts: SecondaryChart[];
  // Price scale
  priceScaleMode: 'linear' | 'log' | 'percent';
  // Previous session levels
  showPrevLevels: boolean;
  // ICT open levels (DOL / WOL / Asia Range)
  showOpenLevels: boolean;
  // Swing pivot high/low dots
  showPivots: boolean;
  // Candle pattern labels (Doji, Hammer, Engulfing, etc.)
  showCandlePatterns: boolean;
  // Auto Fibonacci retracement (dominant swing in viewport)
  showAutoFib: boolean;
  // Session range boxes (Asia / London / NY H/L rectangles)
  showSessionRanges: boolean;
  // Crosshair sync across multi-chart panes
  crosshairSyncEnabled: boolean;
  // ICT Kill Zone bands (London / NY AM / NY PM)
  showKillZones: boolean;
  // Equal Highs / Equal Lows liquidity levels
  showEQHL: boolean;
  // Multi-symbol comparison overlay (re-based price lines)
  compareSymbols: string[];
  // News events overlay on chart timeline
  showNewsOverlay: boolean;
  // Alert trigger history (last 100 entries)
  alertHistory: AlertHistoryEntry[];
  // Risk calculator levels shown on chart
  riskLevels: { entry: number; sl: number | null; tp: number | null; side: 'long' | 'short' } | null;
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
  | { type: 'SET_INDICATOR_COLOR'; id: string; color: string }
  | { type: 'TOGGLE_INDICATOR_LOCK'; id: string }
  | { type: 'SET_LAYER_VISIBILITY'; id: string; visible: boolean }
  | { type: 'SET_LAYER_OPACITY'; id: string; opacity: number }
  | { type: 'TOGGLE_LAYER_LOCK'; id: string }
  | { type: 'SOLO_LAYER'; id: string }
  | { type: 'REORDER_LAYERS'; ids: string[] }
  | { type: 'REORDER_INDICATORS'; ids: string[] }
  | { type: 'ADD_ALERT'; alert: Omit<ChartAlert, 'id' | 'createdAt'> }
  | { type: 'REMOVE_ALERT'; id: string }
  | { type: 'TOGGLE_ALERT'; id: string }
  | { type: 'RESET_ALERT'; id: string }
  | { type: 'ADD_PAPER_POSITION'; position: Omit<PaperPosition, 'id' | 'openedAt'> }
  | { type: 'CLOSE_PAPER_POSITION'; id: string; exitPrice: number }
  | { type: 'CLOSE_ALL_POSITIONS'; exits: { id: string; exitPrice: number }[] }
  | { type: 'TOGGLE_TF_FAVORITE'; tf: string }
  | { type: 'ADD_CUSTOM_TF'; tf: string }
  | { type: 'SET_SELECTED_OBJECT'; id: string | null }
  | { type: 'SET_SELECTED_OBJECT_DATA'; data: WorkspaceState['selectedObjectData'] }
  | { type: 'UPDATE_DRAWING_STYLE'; id: string; patch: { color?: string; lineWidth?: number; lineStyle?: string; opacity?: number } }
  | { type: 'TOGGLE_CHART_INDICATOR'; key: string }
  | { type: 'SET_CHART_CONFIG'; config: Record<string, boolean> }
  | { type: 'SET_CHART_SUBPANES'; panes: string[] }
  | { type: 'TOGGLE_CHART_SUBPANE'; key: string }
  | { type: 'SET_DRAWING_MODE'; mode: string | null }
  | { type: 'TOGGLE_SESSION'; session: string }
  | { type: 'CAPTURE_SCREENSHOT' }
  | { type: 'COPY_CHART_IMAGE' }
  | { type: 'SET_BACKTEST_MARKERS'; markers: BacktestMarker[] }
  | { type: 'TOGGLE_MAGNET' }
  | { type: 'TOGGLE_HIDE_DRAWINGS' }
  | { type: 'TOGGLE_LOCK_DRAWINGS' }
  | { type: 'DELETE_ALL_DRAWINGS' }
  | { type: 'RESTORE_LAYOUT'; layout: Partial<WorkspaceState> }
  | { type: 'SET_CHART_LAYOUT'; layout: ChartLayout }
  | { type: 'UPDATE_SECONDARY_CHART'; id: string; symbol?: string; timeframe?: string }
  | { type: 'SET_PRICE_SCALE_MODE'; mode: 'linear' | 'log' | 'percent' }
  | { type: 'TOGGLE_PREV_LEVELS' }
  | { type: 'TOGGLE_OPEN_LEVELS' }
  | { type: 'TOGGLE_PIVOTS' }
  | { type: 'TOGGLE_CANDLE_PATTERNS' }
  | { type: 'TOGGLE_AUTO_FIB' }
  | { type: 'TOGGLE_SESSION_RANGES' }
  | { type: 'TOGGLE_CROSSHAIR_SYNC' }
  | { type: 'TOGGLE_KILL_ZONES' }
  | { type: 'TOGGLE_EQHL' }
  | { type: 'ADD_COMPARE'; symbol: string }
  | { type: 'REMOVE_COMPARE'; symbol: string }
  | { type: 'TOGGLE_NEWS_OVERLAY' }
  // Replay
  | { type: 'REPLAY_START' }
  | { type: 'REPLAY_STOP' }
  | { type: 'REPLAY_PLAY' }
  | { type: 'REPLAY_PAUSE' }
  | { type: 'REPLAY_SEEK'; index: number }
  | { type: 'REPLAY_STEP'; delta: 1 | -1 }
  | { type: 'REPLAY_SET_SPEED'; speed: 1 | 2 | 4 | 8 }
  | { type: 'SET_REPLAY_TOTAL'; total: number }
  // Alerts & toasts
  | { type: 'TRIGGER_ALERT'; id: string }
  | { type: 'LOG_ALERT_TRIGGER'; entry: Omit<AlertHistoryEntry, 'id'> }
  | { type: 'CLEAR_ALERT_HISTORY' }
  | { type: 'SET_RISK_LEVELS'; levels: WorkspaceState['riskLevels'] }
  | { type: 'ADD_TOAST'; toast: Omit<WorkspaceToast, 'id' | 'createdAt'> }
  | { type: 'REMOVE_TOAST'; id: string }
  // Trade journal
  | { type: 'UPDATE_TRADE_NOTE'; id: string; note: string }
  | { type: 'ADD_TRADE_TAG'; id: string; tag: string }
  | { type: 'REMOVE_TRADE_TAG'; id: string; tag: string };

// ── Context Value ────────────────────────────────────────────────────────────
export interface WorkspaceContextValue {
  state: WorkspaceState;
  dispatch: React.Dispatch<WorkspaceAction>;
  symbolInfo: SymbolInfo;
}
