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
  // ETFs
  'SPY':    { name: 'SPDR S&P 500 ETF',      exchange: 'NYSE',   market: 'US',   price: 548.52,  change: -5.21,   changePct: -0.94, bid: 548.46,  ask: 548.58,  open: 553.73, high: 554.10, low: 547.80, close: 548.52 },
  'QQQ':    { name: 'Invesco Nasdaq 100 ETF', exchange: 'NASDAQ', market: 'US',   price: 459.31,  change: -5.88,   changePct: -1.27, bid: 459.24,  ask: 459.38,  open: 465.19, high: 465.90, low: 458.60, close: 459.31 },
  'IWM':    { name: 'iShares Russell 2000',   exchange: 'NYSE',   market: 'US',   price: 193.42,  change: -2.14,   changePct: -1.10, bid: 193.37,  ask: 193.47,  open: 195.56, high: 196.00, low: 192.88, close: 193.42 },
  'DIA':    { name: 'SPDR Dow Jones ETF',     exchange: 'NYSE',   market: 'US',   price: 401.18,  change: -3.62,   changePct: -0.89, bid: 401.12,  ask: 401.24,  open: 404.80, high: 405.22, low: 400.44, close: 401.18 },
  // Big Caps
  'AAPL':   { name: 'Apple Inc.',             exchange: 'NASDAQ', market: 'US',   price: 217.90,  change: -2.88,   changePct: -1.30, bid: 217.85,  ask: 217.95,  open: 220.78, high: 221.40, low: 217.22, close: 217.90 },
  'MSFT':   { name: 'Microsoft Corporation',  exchange: 'NASDAQ', market: 'US',   price: 388.45,  change: -4.12,   changePct: -1.05, bid: 388.38,  ask: 388.52,  open: 392.57, high: 393.10, low: 387.80, close: 388.45 },
  'NVDA':   { name: 'NVIDIA Corporation',     exchange: 'NASDAQ', market: 'US',   price: 106.62,  change: -2.18,   changePct: -2.00, bid: 106.57,  ask: 106.67,  open: 108.80, high: 109.20, low: 106.10, close: 106.62 },
  'TSLA':   { name: 'Tesla Inc.',             exchange: 'NASDAQ', market: 'US',   price: 261.48,  change: -7.34,   changePct: -2.73, bid: 261.42,  ask: 261.54,  open: 268.82, high: 269.50, low: 260.80, close: 261.48 },
  'AMZN':   { name: 'Amazon.com Inc.',        exchange: 'NASDAQ', market: 'US',   price: 194.72,  change: -3.06,   changePct: -1.55, bid: 194.66,  ask: 194.78,  open: 197.78, high: 198.30, low: 194.10, close: 194.72 },
  'META':   { name: 'Meta Platforms Inc.',    exchange: 'NASDAQ', market: 'US',   price: 572.40,  change: -8.60,   changePct: -1.48, bid: 572.32,  ask: 572.48,  open: 581.00, high: 582.20, low: 571.60, close: 572.40 },
  'GOOGL':  { name: 'Alphabet Inc.',          exchange: 'NASDAQ', market: 'US',   price: 154.28,  change: -2.12,   changePct: -1.36, bid: 154.22,  ask: 154.34,  open: 156.40, high: 156.90, low: 153.80, close: 154.28 },
  // Metals & Crypto
  'XAUUSD': { name: 'Gold Spot',              exchange: 'COMEX',  market: 'CME',  price: 3115.80, change: +22.40,  changePct: +0.72, bid: 3115.40, ask: 3116.20, open: 3093.40, high: 3128.60, low: 3088.10, close: 3115.80 },
  'BTCUSD': { name: 'Bitcoin / USD',          exchange: 'CRYPTO', market: 'CB',   price: 82450.0, change: -1240.0, changePct: -1.48, bid: 82430.0, ask: 82470.0, open: 83690.0, high: 84100.0, low: 82200.0, close: 82450.0 },
  'ETHUSD': { name: 'Ethereum / USD',         exchange: 'CRYPTO', market: 'CB',   price: 1802.40, change: -48.60,  changePct: -2.62, bid: 1801.80, ask: 1803.00, open: 1851.00, high: 1858.40, low: 1798.20, close: 1802.40 },
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
  // ── Trend ──────────────────────────────────────────────────────────────────
  { id: 'ema20',      name: 'Exponential Moving Average',     shortName: 'EMA',        category: 'trend',      defaultParams: '20',        color: '#4caf50', pane: 'overlay'  },
  { id: 'sma50',      name: 'Simple Moving Average',          shortName: 'SMA',        category: 'trend',      defaultParams: '50',        color: '#f44336', pane: 'overlay'  },
  { id: 'ema200',     name: 'EMA 200',                        shortName: 'EMA 200',    category: 'trend',      defaultParams: '200',       color: '#ab47bc', pane: 'overlay'  },
  { id: 'wma',        name: 'Weighted Moving Average',        shortName: 'WMA',        category: 'trend',      defaultParams: '20',        color: '#FF7043', pane: 'overlay'  },
  { id: 'smma',       name: 'Smoothed Moving Average',        shortName: 'SMMA',       category: 'trend',      defaultParams: '20',        color: '#FFCA28', pane: 'overlay'  },
  { id: 'dema',       name: 'Double Exponential MA',          shortName: 'DEMA',       category: 'trend',      defaultParams: '20',        color: '#26C6DA', pane: 'overlay'  },
  { id: 'tema',       name: 'Triple Exponential MA',          shortName: 'TEMA',       category: 'trend',      defaultParams: '20',        color: '#66BB6A', pane: 'overlay'  },
  { id: 'lsma',       name: 'Least Squares Moving Average',   shortName: 'LSMA',       category: 'trend',      defaultParams: '25',        color: '#EC407A', pane: 'overlay'  },
  { id: 'alma',       name: 'Arnaud Legoux Moving Average',   shortName: 'ALMA',       category: 'trend',      defaultParams: '21',        color: '#AB47BC', pane: 'overlay'  },
  { id: 'mcginley',   name: 'McGinley Dynamic',               shortName: 'McGinley',   category: 'trend',      defaultParams: '14',        color: '#FFA726', pane: 'overlay'  },
  { id: 'vwma',       name: 'Volume Weighted MA',             shortName: 'VWMA',       category: 'trend',      defaultParams: '20',        color: '#29B6F6', pane: 'overlay'  },
  { id: 'hma',        name: 'Hull Moving Average',            shortName: 'HMA',        category: 'trend',      defaultParams: '14',        color: '#26A69A', pane: 'overlay'  },
  { id: 'vwap',       name: 'Volume Weighted Avg Price',      shortName: 'VWAP',       category: 'trend',      defaultParams: '',          color: '#607d8b', pane: 'overlay'  },
  { id: 'ichimoku',   name: 'Ichimoku Cloud',                 shortName: 'Ichimoku',   category: 'trend',      defaultParams: '9,26,52',   color: '#FF6D00', pane: 'overlay'  },
  { id: 'sar',        name: 'Parabolic SAR',                  shortName: 'SAR',        category: 'trend',      defaultParams: '0.02,0.2',  color: '#00bcd4', pane: 'overlay'  },
  { id: 'supertrend', name: 'SuperTrend',                     shortName: 'ST',         category: 'trend',      defaultParams: '10,3',      color: '#00E676', pane: 'overlay'  },
  { id: 'chandelier', name: 'Chandelier Exit',                shortName: 'CE',         category: 'trend',      defaultParams: '22,3',      color: '#FF6E40', pane: 'overlay'  },
  { id: 'ckstop',     name: 'Chande Kroll Stop',              shortName: 'CKStop',     category: 'trend',      defaultParams: '10,1.5,9',  color: '#B2FF59', pane: 'overlay'  },
  { id: 'alligator',  name: 'Williams Alligator',             shortName: 'Alligator',  category: 'trend',      defaultParams: '13,8,5',    color: '#69F0AE', pane: 'overlay'  },
  { id: 'envelope',   name: 'Envelope',                       shortName: 'ENV',        category: 'trend',      defaultParams: '20,2.5',    color: '#78909C', pane: 'overlay'  },
  { id: 'maribbon',   name: 'MA Ribbon',                      shortName: 'Ribbon',     category: 'trend',      defaultParams: '',          color: '#80DEEA', pane: 'overlay'  },
  // ── Momentum ───────────────────────────────────────────────────────────────
  { id: 'rsi',        name: 'Relative Strength Index',        shortName: 'RSI',        category: 'momentum',   defaultParams: '14',        color: '#9c27b0', pane: 'separate' },
  { id: 'macd',       name: 'MACD',                           shortName: 'MACD',       category: 'momentum',   defaultParams: '12,26,9',   color: '#2196f3', pane: 'separate' },
  { id: 'sto',        name: 'Stochastic',                     shortName: 'Stoch',      category: 'momentum',   defaultParams: '14,3',      color: '#00bcd4', pane: 'separate' },
  { id: 'stochRSI',   name: 'Stochastic RSI',                 shortName: 'StochRSI',   category: 'momentum',   defaultParams: '14,14,3,3', color: '#4DD0E1', pane: 'separate' },
  { id: 'adx',        name: 'Average Directional Index',      shortName: 'ADX',        category: 'momentum',   defaultParams: '14',        color: '#795548', pane: 'separate' },
  { id: 'cci',        name: 'Commodity Channel Index',        shortName: 'CCI',        category: 'momentum',   defaultParams: '20',        color: '#FF5722', pane: 'separate' },
  { id: 'mom',        name: 'Momentum',                       shortName: 'MOM',        category: 'momentum',   defaultParams: '10',        color: '#8BC34A', pane: 'separate' },
  { id: 'willr',      name: 'Williams %R',                    shortName: '%R',         category: 'momentum',   defaultParams: '14',        color: '#E91E63', pane: 'separate' },
  { id: 'ao',         name: 'Awesome Oscillator',             shortName: 'AO',         category: 'momentum',   defaultParams: '5,34',      color: '#26A69A', pane: 'separate' },
  { id: 'bop',        name: 'Balance of Power',               shortName: 'BOP',        category: 'momentum',   defaultParams: '',          color: '#42A5F5', pane: 'separate' },
  { id: 'bbtrend',    name: 'Bollinger Bands Trend',          shortName: 'BBTrend',    category: 'momentum',   defaultParams: '20,50',     color: '#80CBC4', pane: 'separate' },
  { id: 'bbp',        name: 'Bull Bear Power',                shortName: 'BBP',        category: 'momentum',   defaultParams: '13',        color: '#A5D6A7', pane: 'separate' },
  { id: 'chaikinOsc', name: 'Chaikin Oscillator',             shortName: 'ChOsc',      category: 'momentum',   defaultParams: '3,10',      color: '#4DB6AC', pane: 'separate' },
  { id: 'cmo',        name: 'Chande Momentum Oscillator',     shortName: 'CMO',        category: 'momentum',   defaultParams: '9',         color: '#CE93D8', pane: 'separate' },
  { id: 'choppiness', name: 'Choppiness Index',               shortName: 'CHOP',       category: 'momentum',   defaultParams: '14',        color: '#FFCC02', pane: 'separate' },
  { id: 'chopZone',   name: 'Chop Zone',                      shortName: 'ChopZone',   category: 'momentum',   defaultParams: '30',        color: '#FFF176', pane: 'separate' },
  { id: 'connorsRSI', name: 'Connors RSI',                    shortName: 'CRSI',       category: 'momentum',   defaultParams: '3,2,100',   color: '#EF9A9A', pane: 'separate' },
  { id: 'coppock',    name: 'Coppock Curve',                  shortName: 'Coppock',    category: 'momentum',   defaultParams: '10,14,11',  color: '#FFAB40', pane: 'separate' },
  { id: 'dpo',        name: 'Detrended Price Oscillator',     shortName: 'DPO',        category: 'momentum',   defaultParams: '21',        color: '#81D4FA', pane: 'separate' },
  { id: 'fisher',     name: 'Fisher Transform',               shortName: 'Fisher',     category: 'momentum',   defaultParams: '9',         color: '#F48FB1', pane: 'separate' },
  { id: 'kst',        name: 'KST Oscillator',                 shortName: 'KST',        category: 'momentum',   defaultParams: '',          color: '#DCE775', pane: 'separate' },
  { id: 'massIndex',  name: 'Mass Index',                     shortName: 'MI',         category: 'momentum',   defaultParams: '9,25',      color: '#FFCC80', pane: 'separate' },
  { id: 'ppo',        name: 'Percentage Price Oscillator',    shortName: 'PPO',        category: 'momentum',   defaultParams: '12,26,9',   color: '#80CBC4', pane: 'separate' },
  { id: 'roc',        name: 'Rate of Change',                 shortName: 'ROC',        category: 'momentum',   defaultParams: '9',         color: '#BCAAA4', pane: 'separate' },
  { id: 'rvi',        name: 'Relative Vigor Index',           shortName: 'RVI',        category: 'momentum',   defaultParams: '10',        color: '#B39DDB', pane: 'separate' },
  { id: 'smi',        name: 'SMI Ergodic Oscillator',         shortName: 'SMI',        category: 'momentum',   defaultParams: '5,20,5',    color: '#80D8FF', pane: 'separate' },
  { id: 'trix',       name: 'TRIX',                           shortName: 'TRIX',       category: 'momentum',   defaultParams: '18',        color: '#CCFF90', pane: 'separate' },
  { id: 'tsi',        name: 'True Strength Index',            shortName: 'TSI',        category: 'momentum',   defaultParams: '25,13,13',  color: '#FFD180', pane: 'separate' },
  { id: 'uo',         name: 'Ultimate Oscillator',            shortName: 'UO',         category: 'momentum',   defaultParams: '7,14,28',   color: '#EA80FC', pane: 'separate' },
  { id: 'vortex',     name: 'Vortex Indicator',               shortName: 'Vortex',     category: 'momentum',   defaultParams: '14',        color: '#FF9E80', pane: 'separate' },
  { id: 'aroon',      name: 'Aroon',                          shortName: 'Aroon',      category: 'momentum',   defaultParams: '25',        color: '#82B1FF', pane: 'separate' },
  // ── Volatility ─────────────────────────────────────────────────────────────
  { id: 'bb',         name: 'Bollinger Bands',                shortName: 'BB',         category: 'volatility',  defaultParams: '20,2',      color: '#ff9800', pane: 'overlay'  },
  { id: 'kc',         name: 'Keltner Channel',                shortName: 'KC',         category: 'volatility',  defaultParams: '20,1.5',    color: '#E91E63', pane: 'overlay'  },
  { id: 'atr',        name: 'Average True Range',             shortName: 'ATR',        category: 'volatility',  defaultParams: '14',        color: '#9C27B0', pane: 'separate' },
  { id: 'dc',         name: 'Donchian Channel',               shortName: 'DC',         category: 'volatility',  defaultParams: '20',        color: '#3F51B5', pane: 'overlay'  },
  { id: 'histvol',    name: 'Historical Volatility',          shortName: 'HV',         category: 'volatility',  defaultParams: '20',        color: '#FF9800', pane: 'separate' },
  { id: 'bbpct',      name: 'Bollinger Bands %B',             shortName: 'BB %B',      category: 'volatility',  defaultParams: '20,2',      color: '#FFD54F', pane: 'separate' },
  { id: 'bbwid',      name: 'Bollinger Bands Width',          shortName: 'BBW',        category: 'volatility',  defaultParams: '20,2',      color: '#FFECB3', pane: 'separate' },
  // ── Volume ─────────────────────────────────────────────────────────────────
  { id: 'obv',        name: 'On-Balance Volume',              shortName: 'OBV',        category: 'volume',      defaultParams: '',          color: '#009688', pane: 'separate' },
  { id: 'cmf',        name: 'Chaikin Money Flow',             shortName: 'CMF',        category: 'volume',      defaultParams: '20',        color: '#4CAF50', pane: 'separate' },
  { id: 'mfi',        name: 'Money Flow Index',               shortName: 'MFI',        category: 'volume',      defaultParams: '14',        color: '#2196F3', pane: 'separate' },
  { id: 'vpro',       name: 'Volume Profile',                 shortName: 'VP',         category: 'volume',      defaultParams: '',          color: '#607D8B', pane: 'overlay'  },
  { id: 'cvd',        name: 'Cumulative Volume Delta',        shortName: 'CVD',        category: 'volume',      defaultParams: '',          color: '#FF5722', pane: 'separate' },
  { id: 'adl',        name: 'Accumulation/Distribution',      shortName: 'A/D',        category: 'volume',      defaultParams: '',          color: '#4FC3F7', pane: 'separate' },
  { id: 'pvt',        name: 'Price Volume Trend',             shortName: 'PVT',        category: 'volume',      defaultParams: '',          color: '#AED581', pane: 'separate' },
  { id: 'netVol',     name: 'Net Volume',                     shortName: 'NetVol',     category: 'volume',      defaultParams: '',          color: '#80CBC4', pane: 'separate' },
  { id: 'volOsc',     name: 'Volume Oscillator',              shortName: 'VolOsc',     category: 'volume',      defaultParams: '5,10',      color: '#FFAB40', pane: 'separate' },
  { id: 'eom',        name: 'Ease of Movement',               shortName: 'EOM',        category: 'volume',      defaultParams: '14',        color: '#B0BEC5', pane: 'separate' },
  { id: 'efi',        name: 'Elder Force Index',              shortName: 'EFI',        category: 'volume',      defaultParams: '13',        color: '#F06292', pane: 'separate' },
  { id: 'klinger',    name: 'Klinger Oscillator',             shortName: 'KVO',        category: 'volume',      defaultParams: '34,55,13',  color: '#9FA8DA', pane: 'separate' },
  { id: 'cvi',        name: 'Chaikin Volatility Index',       shortName: 'CVI',        category: 'volume',      defaultParams: '10',        color: '#E6EE9C', pane: 'separate' },
  // ── Structure / SMC ────────────────────────────────────────────────────────
  { id: 'pivots',     name: 'Pivot Points',                   shortName: 'Pivots',     category: 'structure',   defaultParams: 'standard',  color: '#FF9800', pane: 'overlay'  },
  { id: 'autofib',    name: 'Auto Fibonacci',                 shortName: 'Fib',        category: 'structure',   defaultParams: '',          color: '#E91E63', pane: 'overlay'  },
  { id: 'zigzag',     name: 'ZigZag',                         shortName: 'ZZ',         category: 'structure',   defaultParams: '5',         color: '#00BCD4', pane: 'overlay'  },
  { id: 'orderblk',   name: 'Order Blocks',                   shortName: 'OB',         category: 'structure',   defaultParams: '',          color: '#7C4DFF', pane: 'overlay'  },
  { id: 'liqzones',   name: 'Liquidity Zones',                shortName: 'LIQ',        category: 'structure',   defaultParams: '',          color: '#FFD54F', pane: 'overlay'  },
  { id: 'correlation',name: 'Correlation Coefficient',        shortName: 'Corr',       category: 'structure',   defaultParams: '14',        color: '#B0BEC5', pane: 'separate' },
  { id: 'adr',        name: 'Average Day Range',              shortName: 'ADR',        category: 'structure',   defaultParams: '14',        color: '#FFCC02', pane: 'separate' },
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
  // ETFs / Indices
  { symbol: 'SPY',   name: 'S&P 500 ETF',    price: 519.73,  change: +2.41,   changePct: +0.47, category: 'ETF'    },
  { symbol: 'QQQ',   name: 'Nasdaq 100 ETF', price: 442.18,  change: +3.12,   changePct: +0.71, category: 'ETF'    },
  { symbol: 'IWM',   name: 'Russell 2000',   price: 201.45,  change: -0.88,   changePct: -0.44, category: 'ETF'    },
  { symbol: 'DIA',   name: 'Dow Jones ETF',  price: 389.22,  change: +1.05,   changePct: +0.27, category: 'ETF'    },
  // Big Caps
  { symbol: 'AAPL',  name: 'Apple',          price: 189.84,  change: +1.23,   changePct: +0.65, category: 'Tech'   },
  { symbol: 'MSFT',  name: 'Microsoft',      price: 415.32,  change: +2.87,   changePct: +0.70, category: 'Tech'   },
  { symbol: 'NVDA',  name: 'Nvidia',         price: 875.40,  change: +18.60,  changePct: +2.17, category: 'Tech'   },
  { symbol: 'TSLA',  name: 'Tesla',          price: 172.63,  change: -3.41,   changePct: -1.94, category: 'Tech'   },
  { symbol: 'AMZN',  name: 'Amazon',         price: 182.41,  change: +1.14,   changePct: +0.63, category: 'Tech'   },
  { symbol: 'META',  name: 'Meta',           price: 493.50,  change: +4.22,   changePct: +0.86, category: 'Tech'   },
  { symbol: 'GOOGL', name: 'Alphabet',       price: 163.48,  change: +0.92,   changePct: +0.57, category: 'Tech'   },
  // Metals & Crypto
  { symbol: 'XAUUSD',name: 'Gold',           price: 2318.45, change: +12.30,  changePct: +0.53, category: 'Metals' },
  { symbol: 'BTCUSD',name: 'Bitcoin',        price: 67842.0, change: +1240.0, changePct: +1.86, category: 'Crypto' },
  { symbol: 'ETHUSD',name: 'Ethereum',       price: 3512.80, change: +88.40,  changePct: +2.58, category: 'Crypto' },
];

// ── Format helpers ───────────────────────────────────────────────────────────
export function formatPrice(n: number, symbol?: string): string {
  if (symbol?.includes('JPY')) return n.toFixed(2);
  if (n >= 10)  return n.toFixed(2);
  if (n >= 1)   return n.toFixed(4);
  return n.toFixed(5);
}

export function formatChange(n: number, symbol?: string): string {
  const prefix = n >= 0 ? '+' : '';
  return prefix + formatPrice(Math.abs(n), symbol);
}

// ── Layout persistence ───────────────────────────────────────────────────────
export const WORKSPACE_STORAGE_KEY = 'ordr_workspace_layout';

// ── Screener Universe (212 symbols) ─────────────────────────────────────────
export type ScreenerCategory = 'FX' | 'Stocks' | 'ETF' | 'Indices' | 'Crypto' | 'Commodities';

export interface ScreenerSymbol {
  symbol: string;
  name: string;
  category: ScreenerCategory;
}

export const SCREENER_UNIVERSE: ScreenerSymbol[] = [
  // FX Majors (7)
  { symbol: 'EURUSD',   name: 'Euro / US Dollar',            category: 'FX' },
  { symbol: 'GBPUSD',   name: 'British Pound / USD',         category: 'FX' },
  { symbol: 'USDJPY',   name: 'USD / Japanese Yen',          category: 'FX' },
  { symbol: 'USDCHF',   name: 'USD / Swiss Franc',           category: 'FX' },
  { symbol: 'USDCAD',   name: 'USD / Canadian Dollar',       category: 'FX' },
  { symbol: 'AUDUSD',   name: 'Australian Dollar / USD',     category: 'FX' },
  { symbol: 'NZDUSD',   name: 'New Zealand Dollar / USD',    category: 'FX' },
  // FX Minors (16)
  { symbol: 'EURGBP',   name: 'Euro / British Pound',        category: 'FX' },
  { symbol: 'EURJPY',   name: 'Euro / Japanese Yen',         category: 'FX' },
  { symbol: 'EURAUD',   name: 'Euro / Australian Dollar',    category: 'FX' },
  { symbol: 'EURCAD',   name: 'Euro / Canadian Dollar',      category: 'FX' },
  { symbol: 'EURCHF',   name: 'Euro / Swiss Franc',          category: 'FX' },
  { symbol: 'EURNZD',   name: 'Euro / New Zealand Dollar',   category: 'FX' },
  { symbol: 'GBPJPY',   name: 'British Pound / JPY',         category: 'FX' },
  { symbol: 'GBPAUD',   name: 'British Pound / AUD',         category: 'FX' },
  { symbol: 'GBPCAD',   name: 'British Pound / CAD',         category: 'FX' },
  { symbol: 'GBPCHF',   name: 'British Pound / CHF',         category: 'FX' },
  { symbol: 'GBPNZD',   name: 'British Pound / NZD',         category: 'FX' },
  { symbol: 'AUDJPY',   name: 'Australian Dollar / JPY',     category: 'FX' },
  { symbol: 'AUDCAD',   name: 'Australian Dollar / CAD',     category: 'FX' },
  { symbol: 'AUDCHF',   name: 'Australian Dollar / CHF',     category: 'FX' },
  { symbol: 'AUDNZD',   name: 'Australian Dollar / NZD',     category: 'FX' },
  { symbol: 'CADJPY',   name: 'Canadian Dollar / JPY',       category: 'FX' },
  // FX Exotics (8)
  { symbol: 'USDMXN',   name: 'USD / Mexican Peso',          category: 'FX' },
  { symbol: 'USDZAR',   name: 'USD / South African Rand',    category: 'FX' },
  { symbol: 'USDNOK',   name: 'USD / Norwegian Krone',       category: 'FX' },
  { symbol: 'USDSEK',   name: 'USD / Swedish Krona',         category: 'FX' },
  { symbol: 'USDTRY',   name: 'USD / Turkish Lira',          category: 'FX' },
  { symbol: 'USDSGD',   name: 'USD / Singapore Dollar',      category: 'FX' },
  { symbol: 'USDCNH',   name: 'USD / Chinese Yuan',          category: 'FX' },
  { symbol: 'USDHKD',   name: 'USD / Hong Kong Dollar',      category: 'FX' },
  // US Mega Cap (15)
  { symbol: 'AAPL',     name: 'Apple',                       category: 'Stocks' },
  { symbol: 'MSFT',     name: 'Microsoft',                   category: 'Stocks' },
  { symbol: 'NVDA',     name: 'NVIDIA',                      category: 'Stocks' },
  { symbol: 'AMZN',     name: 'Amazon',                      category: 'Stocks' },
  { symbol: 'GOOGL',    name: 'Alphabet',                    category: 'Stocks' },
  { symbol: 'META',     name: 'Meta Platforms',              category: 'Stocks' },
  { symbol: 'TSLA',     name: 'Tesla',                       category: 'Stocks' },
  { symbol: 'AVGO',     name: 'Broadcom',                    category: 'Stocks' },
  { symbol: 'JPM',      name: 'JPMorgan Chase',              category: 'Stocks' },
  { symbol: 'V',        name: 'Visa',                        category: 'Stocks' },
  { symbol: 'UNH',      name: 'UnitedHealth Group',          category: 'Stocks' },
  { symbol: 'LLY',      name: 'Eli Lilly',                   category: 'Stocks' },
  { symbol: 'MA',       name: 'Mastercard',                  category: 'Stocks' },
  { symbol: 'XOM',      name: 'ExxonMobil',                  category: 'Stocks' },
  { symbol: 'WMT',      name: 'Walmart',                     category: 'Stocks' },
  // US Tech (15)
  { symbol: 'AMD',      name: 'Advanced Micro Devices',      category: 'Stocks' },
  { symbol: 'ORCL',     name: 'Oracle',                      category: 'Stocks' },
  { symbol: 'CRM',      name: 'Salesforce',                  category: 'Stocks' },
  { symbol: 'ADBE',     name: 'Adobe',                       category: 'Stocks' },
  { symbol: 'QCOM',     name: 'Qualcomm',                    category: 'Stocks' },
  { symbol: 'TXN',      name: 'Texas Instruments',           category: 'Stocks' },
  { symbol: 'CSCO',     name: 'Cisco Systems',               category: 'Stocks' },
  { symbol: 'MU',       name: 'Micron Technology',           category: 'Stocks' },
  { symbol: 'INTC',     name: 'Intel',                       category: 'Stocks' },
  { symbol: 'IBM',      name: 'IBM',                         category: 'Stocks' },
  { symbol: 'NFLX',     name: 'Netflix',                     category: 'Stocks' },
  { symbol: 'UBER',     name: 'Uber Technologies',           category: 'Stocks' },
  { symbol: 'ABNB',     name: 'Airbnb',                      category: 'Stocks' },
  { symbol: 'SNAP',     name: 'Snap',                        category: 'Stocks' },
  { symbol: 'RBLX',     name: 'Roblox',                      category: 'Stocks' },
  // US Financials (10)
  { symbol: 'BAC',      name: 'Bank of America',             category: 'Stocks' },
  { symbol: 'WFC',      name: 'Wells Fargo',                 category: 'Stocks' },
  { symbol: 'GS',       name: 'Goldman Sachs',               category: 'Stocks' },
  { symbol: 'MS',       name: 'Morgan Stanley',              category: 'Stocks' },
  { symbol: 'C',        name: 'Citigroup',                   category: 'Stocks' },
  { symbol: 'AXP',      name: 'American Express',            category: 'Stocks' },
  { symbol: 'BLK',      name: 'BlackRock',                   category: 'Stocks' },
  { symbol: 'SCHW',     name: 'Charles Schwab',              category: 'Stocks' },
  { symbol: 'PYPL',     name: 'PayPal',                      category: 'Stocks' },
  { symbol: 'COIN',     name: 'Coinbase',                    category: 'Stocks' },
  // US Healthcare (10)
  { symbol: 'JNJ',      name: 'Johnson & Johnson',           category: 'Stocks' },
  { symbol: 'PFE',      name: 'Pfizer',                      category: 'Stocks' },
  { symbol: 'ABBV',     name: 'AbbVie',                      category: 'Stocks' },
  { symbol: 'MRK',      name: 'Merck',                       category: 'Stocks' },
  { symbol: 'ABT',      name: 'Abbott Laboratories',         category: 'Stocks' },
  { symbol: 'BMY',      name: 'Bristol-Myers Squibb',        category: 'Stocks' },
  { symbol: 'AMGN',     name: 'Amgen',                       category: 'Stocks' },
  { symbol: 'GILD',     name: 'Gilead Sciences',             category: 'Stocks' },
  { symbol: 'REGN',     name: 'Regeneron',                   category: 'Stocks' },
  { symbol: 'VRTX',     name: 'Vertex Pharmaceuticals',      category: 'Stocks' },
  // US Consumer (10)
  { symbol: 'KO',       name: 'Coca-Cola',                   category: 'Stocks' },
  { symbol: 'PEP',      name: 'PepsiCo',                     category: 'Stocks' },
  { symbol: 'MCD',      name: "McDonald's",                  category: 'Stocks' },
  { symbol: 'SBUX',     name: 'Starbucks',                   category: 'Stocks' },
  { symbol: 'NKE',      name: 'Nike',                        category: 'Stocks' },
  { symbol: 'HD',       name: 'Home Depot',                  category: 'Stocks' },
  { symbol: 'LOW',      name: "Lowe's",                      category: 'Stocks' },
  { symbol: 'TJX',      name: 'TJX Companies',               category: 'Stocks' },
  { symbol: 'COST',     name: 'Costco',                      category: 'Stocks' },
  { symbol: 'DIS',      name: 'Walt Disney',                 category: 'Stocks' },
  // US Industrial & Energy (10)
  { symbol: 'GE',       name: 'GE Aerospace',                category: 'Stocks' },
  { symbol: 'BA',       name: 'Boeing',                      category: 'Stocks' },
  { symbol: 'CAT',      name: 'Caterpillar',                 category: 'Stocks' },
  { symbol: 'UPS',      name: 'UPS',                         category: 'Stocks' },
  { symbol: 'HON',      name: 'Honeywell',                   category: 'Stocks' },
  { symbol: 'CVX',      name: 'Chevron',                     category: 'Stocks' },
  { symbol: 'COP',      name: 'ConocoPhillips',              category: 'Stocks' },
  { symbol: 'SLB',      name: 'SLB (Schlumberger)',          category: 'Stocks' },
  { symbol: 'F',        name: 'Ford Motor',                  category: 'Stocks' },
  { symbol: 'GM',       name: 'General Motors',              category: 'Stocks' },
  // Cybersecurity & Cloud (10)
  { symbol: 'PANW',     name: 'Palo Alto Networks',          category: 'Stocks' },
  { symbol: 'CRWD',     name: 'CrowdStrike',                 category: 'Stocks' },
  { symbol: 'ZS',       name: 'Zscaler',                     category: 'Stocks' },
  { symbol: 'NET',      name: 'Cloudflare',                  category: 'Stocks' },
  { symbol: 'SNOW',     name: 'Snowflake',                   category: 'Stocks' },
  { symbol: 'PLTR',     name: 'Palantir',                    category: 'Stocks' },
  { symbol: 'DDOG',     name: 'Datadog',                     category: 'Stocks' },
  { symbol: 'MDB',      name: 'MongoDB',                     category: 'Stocks' },
  { symbol: 'OKTA',     name: 'Okta',                        category: 'Stocks' },
  { symbol: 'SHOP',     name: 'Shopify',                     category: 'Stocks' },
  // Semis & Hardware (5)
  { symbol: 'ARM',      name: 'ARM Holdings',                category: 'Stocks' },
  { symbol: 'SMCI',     name: 'Super Micro Computer',        category: 'Stocks' },
  { symbol: 'DELL',     name: 'Dell Technologies',           category: 'Stocks' },
  { symbol: 'TSM',      name: 'Taiwan Semiconductor',        category: 'Stocks' },
  { symbol: 'ASML',     name: 'ASML Holding',                category: 'Stocks' },
  // Global Equities (7)
  { symbol: 'BABA',     name: 'Alibaba Group',               category: 'Stocks' },
  { symbol: 'MELI',     name: 'MercadoLibre',                category: 'Stocks' },
  { symbol: 'SE',       name: 'Sea Limited',                 category: 'Stocks' },
  { symbol: 'PINS',     name: 'Pinterest',                   category: 'Stocks' },
  { symbol: 'LYFT',     name: 'Lyft',                        category: 'Stocks' },
  { symbol: 'RIVN',     name: 'Rivian Automotive',           category: 'Stocks' },
  { symbol: 'LCID',     name: 'Lucid Group',                 category: 'Stocks' },
  // ETFs (25)
  { symbol: 'SPY',      name: 'S&P 500 ETF (SPDR)',          category: 'ETF' },
  { symbol: 'QQQ',      name: 'Nasdaq 100 ETF',              category: 'ETF' },
  { symbol: 'IWM',      name: 'Russell 2000 ETF',            category: 'ETF' },
  { symbol: 'DIA',      name: 'Dow Jones ETF',               category: 'ETF' },
  { symbol: 'GLD',      name: 'Gold ETF (SPDR)',             category: 'ETF' },
  { symbol: 'SLV',      name: 'Silver ETF',                  category: 'ETF' },
  { symbol: 'TLT',      name: '20Y Treasury Bond ETF',       category: 'ETF' },
  { symbol: 'IEF',      name: '7-10Y Treasury ETF',          category: 'ETF' },
  { symbol: 'VXX',      name: 'VIX Short-Term Futures ETF',  category: 'ETF' },
  { symbol: 'XLF',      name: 'Financial Select ETF',        category: 'ETF' },
  { symbol: 'XLE',      name: 'Energy Select ETF',           category: 'ETF' },
  { symbol: 'XLK',      name: 'Tech Select ETF',             category: 'ETF' },
  { symbol: 'XLV',      name: 'Health Care Select ETF',      category: 'ETF' },
  { symbol: 'XLI',      name: 'Industrial Select ETF',       category: 'ETF' },
  { symbol: 'XLY',      name: 'Consumer Discretionary ETF',  category: 'ETF' },
  { symbol: 'XLP',      name: 'Consumer Staples ETF',        category: 'ETF' },
  { symbol: 'XLU',      name: 'Utilities ETF',               category: 'ETF' },
  { symbol: 'XLRE',     name: 'Real Estate ETF',             category: 'ETF' },
  { symbol: 'ARKK',     name: 'ARK Innovation ETF',          category: 'ETF' },
  { symbol: 'SOXX',     name: 'Semiconductors ETF',          category: 'ETF' },
  { symbol: 'EEM',      name: 'Emerging Markets ETF',        category: 'ETF' },
  { symbol: 'EFA',      name: 'MSCI EAFE ETF',               category: 'ETF' },
  { symbol: 'HYG',      name: 'High Yield Bond ETF',         category: 'ETF' },
  { symbol: 'LQD',      name: 'Investment Grade Bond ETF',   category: 'ETF' },
  { symbol: 'VNQ',      name: 'Real Estate ETF (Vanguard)',  category: 'ETF' },
  { symbol: 'VTI',      name: 'Total Stock Market ETF',      category: 'ETF' },
  { symbol: 'AGG',      name: 'US Aggregate Bond ETF',       category: 'ETF' },
  { symbol: 'USO',      name: 'US Oil Fund ETF',             category: 'ETF' },
  { symbol: 'GDX',      name: 'Gold Miners ETF',             category: 'ETF' },
  { symbol: 'KWEB',     name: 'China Internet ETF',          category: 'ETF' },
  { symbol: 'SQQQ',     name: 'ProShares UltraPro Short QQQ',category: 'ETF' },
  { symbol: 'TQQQ',     name: 'ProShares UltraPro QQQ',      category: 'ETF' },
  { symbol: 'SPXS',     name: 'Direxion Bear 3x S&P 500',    category: 'ETF' },
  { symbol: 'SPXL',     name: 'Direxion Bull 3x S&P 500',    category: 'ETF' },
  { symbol: 'GDXJ',     name: 'Junior Gold Miners ETF',      category: 'ETF' },
  // Indices (6)
  { symbol: 'SPX',      name: 'S&P 500 Index',               category: 'Indices' },
  { symbol: 'NDX',      name: 'Nasdaq 100 Index',            category: 'Indices' },
  { symbol: 'DJI',      name: 'Dow Jones Industrial',        category: 'Indices' },
  { symbol: 'RUT',      name: 'Russell 2000 Index',          category: 'Indices' },
  { symbol: 'FTSE',     name: 'FTSE 100 Index',              category: 'Indices' },
  { symbol: 'DAX',      name: 'DAX 40 Index',                category: 'Indices' },
  { symbol: 'CAC',      name: 'CAC 40 Index',                category: 'Indices' },
  { symbol: 'N225',     name: 'Nikkei 225',                  category: 'Indices' },
  { symbol: 'HSI',      name: 'Hang Seng Index',             category: 'Indices' },
  { symbol: 'VIX',      name: 'CBOE Volatility Index',       category: 'Indices' },
  // Crypto (20)
  { symbol: 'BTCUSD',   name: 'Bitcoin / USD',               category: 'Crypto' },
  { symbol: 'ETHUSD',   name: 'Ethereum / USD',              category: 'Crypto' },
  { symbol: 'BNBUSD',   name: 'BNB / USD',                   category: 'Crypto' },
  { symbol: 'SOLUSD',   name: 'Solana / USD',                category: 'Crypto' },
  { symbol: 'XRPUSD',   name: 'XRP / USD',                   category: 'Crypto' },
  { symbol: 'ADAUSD',   name: 'Cardano / USD',               category: 'Crypto' },
  { symbol: 'DOGEUSD',  name: 'Dogecoin / USD',              category: 'Crypto' },
  { symbol: 'LTCUSD',   name: 'Litecoin / USD',              category: 'Crypto' },
  { symbol: 'LINKUSD',  name: 'Chainlink / USD',             category: 'Crypto' },
  { symbol: 'AVAXUSD',  name: 'Avalanche / USD',             category: 'Crypto' },
  { symbol: 'MATICUSD', name: 'Polygon / USD',               category: 'Crypto' },
  { symbol: 'DOTUSD',   name: 'Polkadot / USD',              category: 'Crypto' },
  { symbol: 'UNIUSD',   name: 'Uniswap / USD',               category: 'Crypto' },
  { symbol: 'ATOMUSD',  name: 'Cosmos / USD',                category: 'Crypto' },
  { symbol: 'NEARUSD',  name: 'NEAR Protocol / USD',         category: 'Crypto' },
  { symbol: 'APTUSD',   name: 'Aptos / USD',                 category: 'Crypto' },
  { symbol: 'FILUSD',   name: 'Filecoin / USD',              category: 'Crypto' },
  { symbol: 'ICPUSD',   name: 'Internet Computer / USD',     category: 'Crypto' },
  { symbol: 'VETUSD',   name: 'VeChain / USD',               category: 'Crypto' },
  { symbol: 'ALGOUSD',  name: 'Algorand / USD',              category: 'Crypto' },
  { symbol: 'SUIUSD',   name: 'Sui / USD',                   category: 'Crypto' },
  { symbol: 'ARBUSD',   name: 'Arbitrum / USD',              category: 'Crypto' },
  { symbol: 'OPUSD',    name: 'Optimism / USD',              category: 'Crypto' },
  { symbol: 'INJUSD',   name: 'Injective / USD',             category: 'Crypto' },
  { symbol: 'MKRUSD',   name: 'Maker / USD',                 category: 'Crypto' },
  // Commodities (6)
  { symbol: 'XAUUSD',   name: 'Gold Spot',                   category: 'Commodities' },
  { symbol: 'XAGUSD',   name: 'Silver Spot',                 category: 'Commodities' },
  { symbol: 'WTIUSD',   name: 'WTI Crude Oil',               category: 'Commodities' },
  { symbol: 'COPPER',   name: 'Copper',                      category: 'Commodities' },
  { symbol: 'PLATINUM', name: 'Platinum',                    category: 'Commodities' },
  { symbol: 'PALLADIUM',name: 'Palladium',                   category: 'Commodities' },
  { symbol: 'NATGAS',   name: 'Natural Gas',                 category: 'Commodities' },
];
