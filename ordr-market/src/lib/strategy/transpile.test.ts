/**
 * Transpiler tests — PineScript, Python, JavaScript passthrough
 */
import { describe, it, expect } from 'vitest';
import { transpile, transpilePine, transpilePython } from './transpile';

// ── JavaScript passthrough ──────────────────────────────────────────────────
describe('transpile — JavaScript passthrough', () => {
  it('returns JS code unchanged', () => {
    const code = 'function onBar(api) { api.buy(); }';
    expect(transpile(code, 'javascript')).toBe(code);
  });
});

// ── PineScript transpiler ───────────────────────────────────────────────────
describe('transpilePine', () => {
  it('strips //@version declaration', () => {
    const result = transpilePine('//@version=5\nclose');
    expect(result).not.toContain('//@version');
  });

  it('strips strategy() declaration', () => {
    const result = transpilePine('strategy("My Strategy", overlay=true)\nclose');
    expect(result).not.toContain('strategy(');
  });

  it('strips indicator() declaration', () => {
    const result = transpilePine('indicator("RSI", overlay=false)\nclose');
    expect(result).not.toContain('indicator(');
  });

  it('converts input.int() to api.param()', () => {
    const result = transpilePine('length = input.int(14, title="Length")');
    expect(result).toContain('api.param(');
    expect(result).toContain("'Length'");
    expect(result).toContain('14');
  });

  it('converts input.float()', () => {
    const result = transpilePine('mult = input.float(2.0, title="Multiplier")');
    expect(result).toContain('api.param(');
    expect(result).toContain("'Multiplier'");
  });

  it('converts input.bool()', () => {
    const result = transpilePine('showMA = input.bool(true, title="Show MA")');
    expect(result).toContain('api.param(');
    expect(result).toContain('> 0');
  });

  it('converts ta.ema(close, n) to api.ema(n)', () => {
    const result = transpilePine('ta.ema(close, length)');
    expect(result).toContain('api.ema(length)');
  });

  it('converts ta.sma()', () => {
    const result = transpilePine('ta.sma(close, 20)');
    expect(result).toContain('api.sma(20)');
  });

  it('converts ta.rsi()', () => {
    const result = transpilePine('ta.rsi(close, 14)');
    expect(result).toContain('api.rsi(14)');
  });

  it('converts ta.atr()', () => {
    const result = transpilePine('ta.atr(14)');
    expect(result).toContain('api.atr(14)');
  });

  it('converts ta.crossover()', () => {
    const result = transpilePine('ta.crossover(fast, slow)');
    expect(result).toContain('api.crossover(fast, slow)');
  });

  it('converts ta.crossunder()', () => {
    const result = transpilePine('ta.crossunder(fast, slow)');
    expect(result).toContain('api.crossunder(fast, slow)');
  });

  it('converts historical series access close[1]', () => {
    const result = transpilePine('close[1]');
    expect(result).toContain('api.closes[api.closes.length - 1 - 1]');
  });

  it('converts bare close to api.close', () => {
    const result = transpilePine('if close > 100');
    expect(result).toContain('api.close');
  });

  it('converts bare open/high/low/volume', () => {
    const result = transpilePine('open + high + low + volume');
    expect(result).toContain('api.open');
    expect(result).toContain('api.high');
    expect(result).toContain('api.low');
    expect(result).toContain('api.volume');
  });

  it('converts strategy.entry long', () => {
    const result = transpilePine('strategy.entry("Long", strategy.long)');
    expect(result).toContain('api.buy("Long")');
  });

  it('converts strategy.entry short', () => {
    const result = transpilePine('strategy.entry("Short", strategy.short)');
    expect(result).toContain('api.short("Short")');
  });

  it('converts strategy.close()', () => {
    const result = transpilePine('strategy.close("Long")');
    expect(result).toContain('api.sell("Long")');
  });

  it('converts strategy.close_all()', () => {
    const result = transpilePine('strategy.close_all()');
    expect(result).toContain('api.close_position()');
  });

  it('converts plot() with color', () => {
    const result = transpilePine('plot(rsi_val, "RSI", color.blue)');
    expect(result).toContain('api.plot(');
    expect(result).toContain('#2196F3');
  });

  it('wraps output in onBar function', () => {
    const result = transpilePine('close');
    expect(result).toContain('function onBar(api)');
  });

  it('converts bar_index to api.index', () => {
    const result = transpilePine('bar_index');
    expect(result).toContain('api.index');
  });
});

// ── Python transpiler ───────────────────────────────────────────────────────
describe('transpilePython', () => {
  it('removes def on_bar() declaration', () => {
    const result = transpilePython('def on_bar(api):\n    api.buy()');
    expect(result).not.toContain('def on_bar');
  });

  it('converts True/False/None', () => {
    const result = transpilePython('x = True\ny = False\nz = None');
    expect(result).toContain('true');
    expect(result).toContain('false');
    expect(result).toContain('null');
  });

  it('converts and/or/not operators', () => {
    const result = transpilePython('if x and y or not z');
    expect(result).toContain('&&');
    expect(result).toContain('||');
    expect(result).toContain('!');
  });

  it('converts == to ===', () => {
    const result = transpilePython('if x == 5');
    expect(result).toContain('===');
  });

  it('converts != to !==', () => {
    const result = transpilePython('if x != 5');
    expect(result).toContain('!==');
  });

  it('converts # comments to //', () => {
    const result = transpilePython('# this is a comment');
    expect(result).toContain('//');
    expect(result).not.toContain('#');
  });

  it('wraps output in onBar function', () => {
    const result = transpilePython('api.buy()');
    expect(result).toContain('function onBar(api)');
  });
});

// ── Indent to blocks conversion ─────────────────────────────────────────────
describe('indent to blocks conversion', () => {
  it('converts if/else blocks from Pine', () => {
    const pine = `
if close > ema_val:
    strategy.entry("Long", strategy.long)
else:
    strategy.close("Long")
`;
    const result = transpilePine(pine);
    expect(result).toContain('{');
    expect(result).toContain('}');
    expect(result).toContain('else');
  });

  it('converts Python if/elif/else', () => {
    const py = `
if x > 10:
    api.buy()
elif x < 5:
    api.sell()
else:
    pass
`;
    const result = transpilePython(py);
    expect(result).toContain('if (');
    expect(result).toContain('} else if (');
    expect(result).toContain('} else {');
  });
});

// ── Full strategy transpile ─────────────────────────────────────────────────
describe('full PineScript strategy', () => {
  it('transpiles a simple EMA crossover strategy', () => {
    const pine = `//@version=5
strategy("EMA Cross", overlay=true)
length = input.int(20, title="Length")
ema_val = ta.ema(close, length)
if ta.crossover(close, ema_val)
    strategy.entry("Long", strategy.long)
if ta.crossunder(close, ema_val)
    strategy.close("Long")`;

    const result = transpilePine(pine);

    // Should have all the key conversions
    expect(result).toContain('function onBar(api)');
    expect(result).toContain('api.param(');
    expect(result).toContain('api.ema(length)');
    expect(result).toContain('api.crossover(');
    expect(result).toContain('api.buy(');
    expect(result).toContain('api.sell(');
    expect(result).not.toContain('//@version');
    expect(result).not.toContain('strategy(');
  });
});
