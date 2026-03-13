/**
 * ORDR Market — Workspace Data Constants
 * Extracted from ChartWorkspace for modular reuse across all workspace components.
 */
import type { SymbolInfo } from './workspace-types';

// ── Timeframes ───────────────────────────────────────────────────────────────
export const BASE_TIMEFRAMES = ['1m', '3m', '5m', '15m', '30m', '1h', '4h', 'D', 'W', 'M'];
export const DEFAULT_TF_FAVORITES = ['30m', 'D', '1h'];
export const DEFAULT_TIMEFRAME = '30m';

// ── Symbol Data ──────────────────────────────────────────────────────────────
export const SYMBOL_DATA: Record<string, SymbolInfo> = {
  'EURUSD': { name: 'Euro / U.S. Dollar',  exchange: 'FOREX',  market: 'ICE',  price: 1.08241, change: +0.00245, changePct: +0.23, bid: 1.08228, ask: 1.08254, open: 1.07996, high: 1.08389, low: 1.07889, close: 1.08241 },
  'GBPUSD': { name: 'British Pound / USD', exchange: 'FOREX',  market: 'ICE',  price: 1.26831, change: -0.00142, changePct: -0.11, bid: 1.26820, ask: 1.26842, open: 1.26973, high: 1.27124, low: 1.26719, close: 1.26831 },
  'USDJPY': { name: 'USD / Japanese Yen',  exchange: 'FOREX',  market: 'ICE',  price: 149.412, change: +0.312,   changePct: +0.21, bid: 149.400, ask: 149.424, open: 149.100, high: 149.680, low: 148.990, close: 149.412 },
  'XAUUSD': { name: 'Gold Spot',           exchange: 'COMEX',  market: 'CME',  price: 2318.45, change: +12.30,   changePct: +0.53, bid: 2318.10, ask: 2318.80, open: 2306.15, high: 2324.90, low: 2301.30, close: 2318.45 },
  'BTCUSD': { name: 'Bitcoin / USD',       exchange: 'CRYPTO', market: 'CB',   price: 67842.0, change: +1240.0,  changePct: +1.86, bid: 67830.0, ask: 67854.0, open: 66602.0, high: 68210.0, low: 66401.0, close: 67842.0 },
  'SPX':    { name: 'S&P 500 Index',       exchange: 'INDEX',  market: 'NYSE', price: 5187.67, change: +24.31,   changePct: +0.47, bid: 5187.50, ask: 5187.84, open: 5163.36, high: 5198.12, low: 5159.28, close: 5187.67 },
};

export const SYMBOL_LIST = Object.keys(SYMBOL_DATA);

// ── Indicator Library ────────────────────────────────────────────────────────
export interface IndicatorDef {
  id: string;
  name: string;
  shortName: string;
  category: 'trend' | 'momentum' | 'volatility' | 'volume' | 'structure';
  defaultParams: string;
  color: string;
  pane: 'overlay' | 'separate';
}

export const INDICATOR_LIBRARY: IndicatorDef[] = [
  // Trend
  { id: 'ema20',    name: 'Exponential Moving Average',  shortName: 'EMA',      category: 'trend',      defaultParams: '20',      color: '#4caf50', pane: 'overlay'  },
  { id: 'sma50',    name: 'Simple Moving Average',       shortName: 'SMA',      category: 'trend',      defaultParams: '50',      color: '#f44336', pane: 'overlay'  },
  { id: 'ema200',   name: 'EMA 200',                     shortName: 'EMA',      category: 'trend',      defaultParams: '200',     color: '#ab47bc', pane: 'overlay'  },
  { id: 'vwap',     name: 'Volume Weighted Avg Price',   shortName: 'VWAP',     category: 'trend',      defaultParams: '',        color: '#607d8b', pane: 'overlay'  },
  { id: 'ichimoku', name: 'Ichimoku Cloud',              shortName: 'Ichimoku', category: 'trend',      defaultParams: '9,26,52', color: '#FF6D00', pane: 'overlay'  },
  { id: 'sar',      name: 'Parabolic SAR',               shortName: 'SAR',      category: 'trend',      defaultParams: '0.02,0.2',color: '#00bcd4', pane: 'overlay'  },
  { id: 'hma',      name: 'Hull Moving Average',         shortName: 'HMA',      category: 'trend',      defaultParams: '14',      color: '#26A69A', pane: 'overlay'  },
  // Momentum
  { id: 'rsi',      name: 'Relative Strength Index',     shortName: 'RSI',      category: 'momentum',   defaultParams: '14',      color: '#9c27b0', pane: 'separate' },
  { id: 'macd',     name: 'MACD',                        shortName: 'MACD',     category: 'momentum',   defaultParams: '12,26,9', color: '#2196f3', pane: 'separate' },
  { id: 'sto',      name: 'Stochastic',                  shortName: 'Stoch',    category: 'momentum',   defaultParams: '14,3',    color: '#00bcd4', pane: 'separate' },
  { id: 'adx',      name: 'Average Directional Index',   shortName: 'ADX',      category: 'momentum',   defaultParams: '14',      color: '#795548', pane: 'separate' },
  { id: 'cci',      name: 'Commodity Channel Index',     shortName: 'CCI',      category: 'momentum',   defaultParams: '20',      color: '#FF5722', pane: 'separate' },
  { id: 'mom',      name: 'Momentum',                    shortName: 'MOM',      category: 'momentum',   defaultParams: '10',      color: '#8BC34A', pane: 'separate' },
  { id: 'willr',    name: 'Williams %R',                 shortName: '%R',       category: 'momentum',   defaultParams: '14',      color: '#E91E63', pane: 'separate' },
  // Volatility
  { id: 'bb',       name: 'Bollinger Bands',             shortName: 'BB',       category: 'volatility',  defaultParams: '20,2',    color: '#ff9800', pane: 'overlay'  },
  { id: 'kc',       name: 'Keltner Channel',             shortName: 'KC',       category: 'volatility',  defaultParams: '20,1.5',  color: '#E91E63', pane: 'overlay'  },
  { id: 'atr',      name: 'Average True Range',          shortName: 'ATR',      category: 'volatility',  defaultParams: '14',      color: '#9C27B0', pane: 'separate' },
  { id: 'dc',       name: 'Donchian Channel',            shortName: 'DC',       category: 'volatility',  defaultParams: '20',      color: '#3F51B5', pane: 'overlay'  },
  { id: 'histvol',  name: 'Historical Volatility',       shortName: 'HV',       category: 'volatility',  defaultParams: '20',      color: '#FF9800', pane: 'separate' },
  // Volume
  { id: 'obv',      name: 'On-Balance Volume',           shortName: 'OBV',      category: 'volume',      defaultParams: '',        color: '#009688', pane: 'separate' },
  { id: 'cmf',      name: 'Chaikin Money Flow',          shortName: 'CMF',      category: 'volume',      defaultParams: '20',      color: '#4CAF50', pane: 'separate' },
  { id: 'mfi',      name: 'Money Flow Index',            shortName: 'MFI',      category: 'volume',      defaultParams: '14',      color: '#2196F3', pane: 'separate' },
  { id: 'vpro',     name: 'Volume Profile',              shortName: 'VP',       category: 'volume',      defaultParams: '',        color: '#607D8B', pane: 'overlay'  },
  { id: 'cvd',      name: 'Cumulative Volume Delta',     shortName: 'CVD',      category: 'volume',      defaultParams: '',        color: '#FF5722', pane: 'separate' },
  // Structure / SMC
  { id: 'pivots',   name: 'Pivot Points',                shortName: 'Pivots',   category: 'structure',   defaultParams: 'standard',color: '#FF9800', pane: 'overlay'  },
  { id: 'autofib',  name: 'Auto Fibonacci',              shortName: 'Fib',      category: 'structure',   defaultParams: '',        color: '#E91E63', pane: 'overlay'  },
  { id: 'zigzag',   name: 'ZigZag',                      shortName: 'ZZ',       category: 'structure',   defaultParams: '5',       color: '#00BCD4', pane: 'overlay'  },
  { id: 'orderblk', name: 'Order Blocks',                shortName: 'OB',       category: 'structure',   defaultParams: '',        color: '#7C4DFF', pane: 'overlay'  },
  { id: 'liqzones', name: 'Liquidity Zones',             shortName: 'LIQ',      category: 'structure',   defaultParams: '',        color: '#FFD54F', pane: 'overlay'  },
];

export const INDICATOR_CATEGORIES = [
  { id: 'all',         name: 'All',        count: INDICATOR_LIBRARY.length },
  { id: 'trend',       name: 'Trend',      count: INDICATOR_LIBRARY.filter(i => i.category === 'trend').length },
  { id: 'momentum',    name: 'Momentum',   count: INDICATOR_LIBRARY.filter(i => i.category === 'momentum').length },
  { id: 'volatility',  name: 'Volatility', count: INDICATOR_LIBRARY.filter(i => i.category === 'volatility').length },
  { id: 'volume',      name: 'Volume',     count: INDICATOR_LIBRARY.filter(i => i.category === 'volume').length },
  { id: 'structure',   name: 'Structure',  count: INDICATOR_LIBRARY.filter(i => i.category === 'structure').length },
] as const;

// ── Drawing Tool Definitions ─────────────────────────────────────────────────
export interface DrawToolDef {
  id: string;
  name: string;
  shortcut?: string;
  category: 'pointer' | 'line' | 'shape' | 'measure' | 'manage';
}

export const DRAWING_TOOLS: (DrawToolDef | null)[] = [
  { id: 'cursor',    name: 'Pointer',          shortcut: 'V',       category: 'pointer' },
  { id: 'crosshair', name: 'Crosshair',        shortcut: 'Shift+V', category: 'pointer' },
  null,
  { id: 'trendline', name: 'Trend Line',       shortcut: 'Alt+T',  category: 'line' },
  { id: 'ray',       name: 'Ray',                                   category: 'line' },
  { id: 'hline',     name: 'Horizontal Line',                       category: 'line' },
  { id: 'vline',     name: 'Vertical Line',                         category: 'line' },
  { id: 'channel',   name: 'Parallel Channel',                      category: 'line' },
  { id: 'pitchfork', name: 'Pitchfork',                             category: 'line' },
  { id: 'fib',       name: 'Fibonacci',                             category: 'line' },
  null,
  { id: 'rect',      name: 'Rectangle',                             category: 'shape' },
  { id: 'ellipse',   name: 'Ellipse',                               category: 'shape' },
  { id: 'path',      name: 'Path / Brush',                          category: 'shape' },
  { id: 'text',      name: 'Text Note',                             category: 'shape' },
  null,
  { id: 'measure',   name: 'Measure',          shortcut: 'M',      category: 'measure' },
  null,
  { id: 'magnet',    name: 'Magnet Mode',                           category: 'manage' },
  { id: 'lock',      name: 'Lock Drawings',                         category: 'manage' },
  { id: 'eye',       name: 'Show / Hide',                           category: 'manage' },
  { id: 'trash',     name: 'Remove All',                            category: 'manage' },
];

export const DRAWING_MODES = new Set([
  'trendline', 'ray', 'hline', 'vline', 'channel', 'pitchfork', 'fib',
  'rect', 'ellipse', 'path', 'text', 'measure',
]);

// ── Watchlist ────────────────────────────────────────────────────────────────
export interface WatchlistItem {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePct: number;
  category: string;
}

export const DEFAULT_WATCHLIST: WatchlistItem[] = [
  { symbol: 'EURUSD', name: 'EUR/USD', price: 1.08241, change: +0.00245, changePct: +0.23, category: 'Majors' },
  { symbol: 'GBPUSD', name: 'GBP/USD', price: 1.26831, change: -0.00142, changePct: -0.11, category: 'Majors' },
  { symbol: 'USDJPY', name: 'USD/JPY', price: 149.412, change: +0.312,   changePct: +0.21, category: 'Majors' },
  { symbol: 'XAUUSD', name: 'XAU/USD', price: 2318.45, change: +12.30,   changePct: +0.53, category: 'Metals' },
  { symbol: 'BTCUSD', name: 'BTC/USD', price: 67842.0, change: +1240.0,  changePct: +1.86, category: 'Crypto' },
  { symbol: 'SPX',    name: 'S&P 500', price: 5187.67, change: +24.31,   changePct: +0.47, category: 'Indices'},
];

// ── Format helpers ───────────────────────────────────────────────────────────
export function formatPrice(n: number): string {
  if (n >= 100)  return n.toFixed(2);
  if (n >= 10)   return n.toFixed(2);
  if (n >= 1)    return n.toFixed(4);
  return n.toFixed(5);
}

export function formatChange(n: number): string {
  const prefix = n >= 0 ? '+' : '';
  return prefix + formatPrice(Math.abs(n));
}

// ── Layout persistence ───────────────────────────────────────────────────────
export const WORKSPACE_STORAGE_KEY = 'ordr_workspace_layout';
