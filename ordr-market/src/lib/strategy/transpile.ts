/**
 * ORDR Market — Strategy Transpilers
 *
 * Regex-based transpilers for simple strategy patterns. NOT a full parser.
 *
 * ## Supported (PineScript)
 * - //@version, strategy(), indicator() declarations (stripped)
 * - input.int(), input.float(), input.bool() → api.param()
 * - ta.ema/sma/wma/rsi/atr/highest/lowest → api.*()
 * - ta.crossover(), ta.crossunder()
 * - ta.macd(), ta.bb() (basic forms)
 * - close/open/high/low/volume, close[N] historical access
 * - strategy.entry(long/short), strategy.close(), strategy.close_all()
 * - plot() with color constants
 * - if/else if/else indentation blocks → JS braces
 *
 * ## Supported (Python)
 * - def on_bar(api): → stripped
 * - True/False/None, and/or/not, ==/!=, # comments
 * - if/elif/else indentation blocks → JS braces
 *
 * ## NOT Supported (will silently fail or produce incorrect output)
 * - Nested function calls: ta.ema(ta.sma(close, 5), 10)
 * - Multi-line expressions or string continuations
 * - Custom function definitions (def/function beyond on_bar)
 * - Pine's iff() function
 * - security() multi-timeframe calls
 * - Variable-length array operations (array.*)
 * - Pine's var keyword (persistent variables)
 * - for...in loops, list comprehensions (Python)
 * - Type annotations (Python)
 * - Ternary with complex nesting
 *
 * For complex strategies, write directly in JavaScript using the api.* interface.
 */

import type { Language } from './types';

// ── PineScript → JavaScript ───────────────────────────────────────────────────
export function transpilePine(code: string): string {
  let js = code;

  // Strip version declaration
  js = js.replace(/\/\/@version=\d+\s*\n?/g, '');
  js = js.replace(/strategy\s*\([^)]*\)\s*\n?/g, '');
  js = js.replace(/indicator\s*\([^)]*\)\s*\n?/g, '');

  // Input declarations → param()
  js = js.replace(
    /(\w+)\s*=\s*input\.int\s*\(([^,)]+)(?:,\s*(?:title\s*=\s*)?"([^"]*)")?\s*\)/g,
    (_, v, def, title) => `const ${v} = api.param('${title || v}', ${def.trim()})`,
  );
  js = js.replace(
    /(\w+)\s*=\s*input\.float\s*\(([^,)]+)(?:,\s*(?:title\s*=\s*)?"([^"]*)")?\s*\)/g,
    (_, v, def, title) => `const ${v} = api.param('${title || v}', ${def.trim()})`,
  );
  js = js.replace(
    /(\w+)\s*=\s*input\.bool\s*\(([^,)]+)(?:,\s*(?:title\s*=\s*)?"([^"]*)")?\s*\)/g,
    (_, v, def, title) => `const ${v} = api.param('${title || v}', ${def.trim() === 'true' ? '1' : '0'}) > 0`,
  );

  // TA functions: ta.ema(close, n) → api.ema(n)
  js = js.replace(/ta\.ema\s*\(\s*(?:close\s*,\s*)?(\w+)\s*\)/g, 'api.ema($1)');
  js = js.replace(/ta\.sma\s*\(\s*(?:close\s*,\s*)?(\w+)\s*\)/g, 'api.sma($1)');
  js = js.replace(/ta\.wma\s*\(\s*(?:close\s*,\s*)?(\w+)\s*\)/g, 'api.wma($1)');
  js = js.replace(/ta\.rsi\s*\(\s*(?:close\s*,\s*)?(\w+)\s*\)/g, 'api.rsi($1)');
  js = js.replace(/ta\.atr\s*\(\s*(\w+)\s*\)/g, 'api.atr($1)');
  js = js.replace(/ta\.highest\s*\(\s*(?:high\s*,\s*)?(\w+)\s*\)/g, 'api.highest($1)');
  js = js.replace(/ta\.lowest\s*\(\s*(?:low\s*,\s*)?(\w+)\s*\)/g, 'api.lowest($1)');

  // Crossover / crossunder
  js = js.replace(/ta\.crossover\s*\(([^,)]+),\s*([^)]+)\)/g, 'api.crossover($1, $2)');
  js = js.replace(/ta\.crossunder\s*\(([^,)]+),\s*([^)]+)\)/g, 'api.crossunder($1, $2)');

  // MACD
  js = js.replace(/ta\.macd\s*\(([^)]*)\)/g, '(api.macd())');

  // Bollinger bands
  js = js.replace(/ta\.bb\s*\(([^)]*)\)/g, '(api.bb())');

  // Strategy orders — MUST run before bare OHLCV replacement
  // (otherwise \bclose\b captures the "close" in "strategy.close()")
  js = js.replace(/strategy\.entry\s*\("([^"]+)"\s*,\s*strategy\.long[^)]*\)/g,  'api.buy("$1")');
  js = js.replace(/strategy\.entry\s*\("([^"]+)"\s*,\s*strategy\.short[^)]*\)/g, 'api.short("$1")');
  js = js.replace(/strategy\.close_all\s*\([^)]*\)/g,      'api.close_position()');
  js = js.replace(/strategy\.close\s*\("([^"]+)"[^)]*\)/g, 'api.sell("$1")');

  // series[n] historical access → api.closes[api.index - n]
  js = js.replace(/\bclose\s*\[(\d+)\]/g, 'api.closes[api.closes.length - 1 - $1]');
  js = js.replace(/\bopen\s*\[(\d+)\]/g,  'api.opens[api.opens.length   - 1 - $1]');
  js = js.replace(/\bhigh\s*\[(\d+)\]/g,  'api.highs[api.highs.length   - 1 - $1]');
  js = js.replace(/\blow\s*\[(\d+)\]/g,   'api.lows[api.lows.length     - 1 - $1]');

  // Bare OHLCV series → current bar values
  js = js.replace(/\bclose\b(?!\s*\[)/g, 'api.close');
  js = js.replace(/\bopen\b(?!\s*\[)/g,  'api.open');
  js = js.replace(/\bhigh\b(?!\s*\[)/g,  'api.high');
  js = js.replace(/\blow\b(?!\s*\[)/g,   'api.low');
  js = js.replace(/\bvolume\b(?!\s*\[)/g,'api.volume');
  js = js.replace(/\bbar_index\b/g,      'api.index');

  // plot()
  js = js.replace(
    /plot\s*\(([^,)]+)(?:,\s*"([^"]*)")?(?:,\s*color\.(\w+))?\s*\)/g,
    (_, val, lbl, clr) => {
      const colorMap: Record<string, string> = {
        blue: '#2196F3', red: '#EF5350', green: '#26A69A', orange: '#FF9800',
        purple: '#AB47BC', white: '#FFFFFF', gray: '#9E9E9E',
      };
      const color = clr ? (colorMap[clr] ?? '#2962FF') : '#2962FF';
      return `api.plot(${val}, "${lbl || val}", "${color}")`;
    },
  );

  // Convert Pine indentation blocks to JS blocks
  js = convertIndentToBlocks(js);

  // Wrap in onBar function
  return wrapInOnBar(js);
}

// ── Python → JavaScript ───────────────────────────────────────────────────────
export function transpilePython(code: string): string {
  let js = code;

  // Remove Python-style def/return structure, keep body
  js = js.replace(/^def\s+on_bar\s*\([^)]*\)\s*:/m, '// on_bar body:');
  js = js.replace(/^def\s+\w+\s*\([^)]*\)\s*:/gm, '// function:');

  // Boolean literals
  js = js.replace(/\bTrue\b/g,  'true');
  js = js.replace(/\bFalse\b/g, 'false');
  js = js.replace(/\bNone\b/g,  'null');

  // Operators
  js = js.replace(/\band\b/g, '&&');
  js = js.replace(/\bor\b/g,  '||');
  js = js.replace(/\bnot\b/g, '!');

  // Python comments → JS comments
  js = js.replace(/#([^\n]*)/g, '//$1');

  // Python equality
  js = js.replace(/!=/g,  '!==');
  js = js.replace(/(?<![!<>=])==/g, '===');

  // api.* calls stay the same in Python-style (same API)
  // Convert indentation blocks
  js = convertIndentToBlocks(js);

  return wrapInOnBar(js);
}

// ── Indent → Braces converter ─────────────────────────────────────────────────
function convertIndentToBlocks(code: string): string {
  const lines = code.split('\n');
  const result: string[] = [];
  const indentStack: number[] = [0];

  for (const rawLine of lines) {
    if (rawLine.trim() === '' || rawLine.trim().startsWith('//')) {
      result.push(rawLine);
      continue;
    }
    const indent  = rawLine.length - rawLine.trimStart().length;
    const trimmed = rawLine.trimStart();

    // Pop blocks for decreasing indent
    while (indent < indentStack[indentStack.length - 1]) {
      indentStack.pop();
      result.push(' '.repeat(indentStack[indentStack.length - 1]) + '}');
    }

    const isBlock = /^(if|else if|elif|else|for|while)\b/.test(trimmed);
    if (isBlock) {
      const converted = trimmed
        .replace(/^if\s+(.+?)\s*:?\s*$/, 'if ($1) {')
        .replace(/^else if\s+(.+?)\s*:?\s*$/, '} else if ($1) {')
        .replace(/^elif\s+(.+?)\s*:?\s*$/, '} else if ($1) {')
        .replace(/^else\s*:?\s*$/, '} else {')
        .replace(/^for\s+(.+?)\s*:?\s*$/, 'for ($1) {')
        .replace(/^while\s+(.+?)\s*:?\s*$/, 'while ($1) {');
      result.push(' '.repeat(indent) + converted);
      indentStack.push(indent + 4);
    } else {
      // Strip trailing colon from variable lines (Pine-style)
      result.push(rawLine.replace(/\s*:\s*$/, ''));
    }
  }

  while (indentStack.length > 1) {
    indentStack.pop();
    result.push('}');
  }

  return result.join('\n');
}

// ── Wrap in onBar function ────────────────────────────────────────────────────
function wrapInOnBar(body: string): string {
  return `function onBar(api) {\n${body}\n}`;
}

// ── Public transpile entry ────────────────────────────────────────────────────
export function transpile(code: string, language: Language): string {
  switch (language) {
    case 'pinescript': return transpilePine(code);
    case 'python':     return transpilePython(code);
    default:           return code;
  }
}
