/**
 * ORDR Market — Strategy Code Templates
 * Starter strategies in JavaScript, PineScript, and Python.
 */

export interface Template {
  id: string;
  name: string;
  description: string;
  js: string;
  pine: string;
  python: string;
}

export const TEMPLATES: Template[] = [
  {
    id: 'ema_cross',
    name: 'EMA Crossover',
    description: 'Enter long when fast EMA crosses above slow EMA. Exit on cross-under.',
    js: `// ── EMA Crossover Strategy ─────────────────────────────────────────
// Uses two exponential moving averages.
// Buy when fast EMA crosses above slow EMA.
// Sell when fast EMA crosses below slow EMA.

function onBar(api) {
  const fast = api.param('Fast EMA Period', 9);
  const slow  = api.param('Slow EMA Period', 21);

  const emaFast = api.ema(fast);
  const emaSlow = api.ema(slow);

  if (api.crossover(emaFast, emaSlow) && api.position !== 'long') {
    api.buy('EMA Cross Up');
  }

  if (api.crossunder(emaFast, emaSlow) && api.position === 'long') {
    api.sell('EMA Cross Down');
  }

  api.plot(emaFast, 'EMA Fast', '#2196F3');
  api.plot(emaSlow, 'EMA Slow', '#EF5350');
}
`,
    pine: `//@version=5
strategy("EMA Crossover", overlay=true)

fast = input.int(9, "Fast EMA Period")
slow = input.int(21, "Slow EMA Period")

ema_fast = ta.ema(close, fast)
ema_slow = ta.ema(close, slow)

plot(ema_fast, "EMA Fast", color.blue)
plot(ema_slow, "EMA Slow", color.red)

if ta.crossover(ema_fast, ema_slow)
    strategy.entry("Long", strategy.long)

if ta.crossunder(ema_fast, ema_slow)
    strategy.close("Long")
`,
    python: `# ── EMA Crossover Strategy ──────────────────────────────────────────
# Enter long on EMA cross up. Exit on cross down.

def on_bar(api):
    fast = api.param('Fast EMA Period', 9)
    slow = api.param('Slow EMA Period', 21)

    ema_fast = api.ema(fast)
    ema_slow = api.ema(slow)

    if api.crossover(ema_fast, ema_slow) and api.position != 'long':
        api.buy('EMA Cross Up')

    if api.crossunder(ema_fast, ema_slow) and api.position == 'long':
        api.sell('EMA Cross Down')

    api.plot(ema_fast, 'EMA Fast', '#2196F3')
    api.plot(ema_slow, 'EMA Slow', '#EF5350')
`,
  },

  {
    id: 'rsi_reversal',
    name: 'RSI Mean Reversion',
    description: 'Buy when RSI is oversold (< 30). Sell when overbought (> 70).',
    js: `// ── RSI Mean Reversion Strategy ────────────────────────────────────
// Buys oversold conditions, sells overbought.

function onBar(api) {
  const period    = api.param('RSI Period', 14);
  const oversold  = api.param('Oversold Level', 30);
  const overbought = api.param('Overbought Level', 70);

  const rsi = api.rsi(period);

  if (rsi < oversold && api.position !== 'long') {
    api.buy('RSI Oversold');
  }

  if (rsi > overbought && api.position === 'long') {
    api.sell('RSI Overbought');
  }

  api.plot(rsi, 'RSI', '#AB47BC');
}
`,
    pine: `//@version=5
strategy("RSI Mean Reversion", overlay=false)

period     = input.int(14, "RSI Period")
oversold   = input.int(30, "Oversold Level")
overbought = input.int(70, "Overbought Level")

rsi_val = ta.rsi(close, period)
plot(rsi_val, "RSI", color.purple)

if rsi_val < oversold
    strategy.entry("Long", strategy.long)

if rsi_val > overbought
    strategy.close("Long")
`,
    python: `# ── RSI Mean Reversion ──────────────────────────────────────────────

def on_bar(api):
    period     = api.param('RSI Period', 14)
    oversold   = api.param('Oversold Level', 30)
    overbought = api.param('Overbought Level', 70)

    rsi = api.rsi(period)

    if rsi < oversold and api.position != 'long':
        api.buy('RSI Oversold')

    if rsi > overbought and api.position == 'long':
        api.sell('RSI Overbought')

    api.plot(rsi, 'RSI', '#AB47BC')
`,
  },

  {
    id: 'macd_signal',
    name: 'MACD Signal Cross',
    description: 'Trade MACD line crosses of the signal line.',
    js: `// ── MACD Signal Cross Strategy ─────────────────────────────────────

function onBar(api) {
  const fast   = api.param('Fast Period',   12);
  const slow   = api.param('Slow Period',   26);
  const signal = api.param('Signal Period',  9);

  const { macd, signal: sig } = api.macd(fast, slow, signal);

  if (api.crossover(macd, sig) && api.position !== 'long') {
    api.buy('MACD Cross Up');
  }

  if (api.crossunder(macd, sig) && api.position === 'long') {
    api.sell('MACD Cross Down');
  }

  api.plot(macd, 'MACD',   '#2196F3');
  api.plot(sig,  'Signal', '#EF5350');
}
`,
    pine: `//@version=5
strategy("MACD Signal Cross", overlay=false)

fast   = input.int(12, "Fast Period")
slow   = input.int(26, "Slow Period")
signal = input.int(9,  "Signal Period")

[macd_line, signal_line, hist] = ta.macd(close, fast, slow, signal)

plot(macd_line,   "MACD",   color.blue)
plot(signal_line, "Signal", color.red)

if ta.crossover(macd_line, signal_line)
    strategy.entry("Long", strategy.long)

if ta.crossunder(macd_line, signal_line)
    strategy.close("Long")
`,
    python: `# ── MACD Signal Cross ───────────────────────────────────────────────

def on_bar(api):
    fast   = api.param('Fast Period',   12)
    slow   = api.param('Slow Period',   26)
    signal = api.param('Signal Period',  9)

    m = api.macd(fast, slow, signal)
    macd = m['macd']
    sig  = m['signal']

    if api.crossover(macd, sig) and api.position != 'long':
        api.buy('MACD Cross Up')

    if api.crossunder(macd, sig) and api.position == 'long':
        api.sell('MACD Cross Down')

    api.plot(macd, 'MACD',   '#2196F3')
    api.plot(sig,  'Signal', '#EF5350')
`,
  },

  {
    id: 'bb_bounce',
    name: 'Bollinger Band Bounce',
    description: 'Buy at lower band, sell at upper band. Mean-reversion within BB.',
    js: `// ── Bollinger Band Bounce Strategy ─────────────────────────────────

function onBar(api) {
  const period = api.param('BB Period', 20);
  const mult   = api.param('BB Multiplier', 2);

  const { upper, middle, lower } = api.bb(period, mult);

  if (api.close < lower && api.position !== 'long') {
    api.buy('BB Lower Touch');
  }

  if (api.close > upper && api.position === 'long') {
    api.sell('BB Upper Touch');
  }

  api.plot(upper,  'Upper Band', '#EF5350');
  api.plot(middle, 'Middle',     '#9E9E9E');
  api.plot(lower,  'Lower Band', '#26A69A');
}
`,
    pine: `//@version=5
strategy("BB Bounce", overlay=true)

period = input.int(20, "BB Period")
mult   = input.float(2.0, "BB Multiplier")

[upper, mid, lower] = ta.bb(close, period, mult)

plot(upper, "Upper", color.red)
plot(mid,   "Mid",   color.gray)
plot(lower, "Lower", color.green)

if close < lower
    strategy.entry("Long", strategy.long)

if close > upper
    strategy.close("Long")
`,
    python: `# ── Bollinger Band Bounce ────────────────────────────────────────────

def on_bar(api):
    period = api.param('BB Period', 20)
    mult   = api.param('BB Multiplier', 2)

    bb = api.bb(period, mult)
    upper  = bb['upper']
    lower  = bb['lower']
    middle = bb['middle']

    if api.close < lower and api.position != 'long':
        api.buy('BB Lower Touch')

    if api.close > upper and api.position == 'long':
        api.sell('BB Upper Touch')

    api.plot(upper,  'Upper Band', '#EF5350')
    api.plot(middle, 'Middle',     '#9E9E9E')
    api.plot(lower,  'Lower Band', '#26A69A')
`,
  },
];

export const DEFAULT_TEMPLATE = TEMPLATES[0];
