/**
 * Strategy Code Sanitizer
 * Validates user-submitted strategy code before execution.
 * Blocks dangerous patterns that could escape the Web Worker sandbox.
 */

const MAX_CODE_SIZE = 50_000; // 50 KB

// Patterns that must never appear in strategy code
const FORBIDDEN_PATTERNS: { pattern: RegExp; reason: string }[] = [
  // Network / IO
  { pattern: /\bfetch\s*\(/, reason: 'Network access (fetch) is not allowed' },
  { pattern: /\bXMLHttpRequest\b/, reason: 'Network access (XMLHttpRequest) is not allowed' },
  { pattern: /\bWebSocket\b/, reason: 'WebSocket access is not allowed' },
  { pattern: /\bimport\s*\(/, reason: 'Dynamic imports are not allowed' },
  { pattern: /\brequire\s*\(/, reason: 'require() is not allowed' },
  { pattern: /\bimportScripts\s*\(/, reason: 'importScripts() is not allowed' },

  // Code generation / eval
  { pattern: /\beval\s*\(/, reason: 'eval() is not allowed' },
  { pattern: /\bFunction\s*\(/, reason: 'Function constructor is not allowed' },

  // DOM / Browser APIs
  { pattern: /\bdocument\s*\./, reason: 'DOM access is not allowed' },
  { pattern: /\bwindow\s*\./, reason: 'window access is not allowed' },
  { pattern: /\blocalStorage\b/, reason: 'localStorage access is not allowed' },
  { pattern: /\bsessionStorage\b/, reason: 'sessionStorage access is not allowed' },
  { pattern: /\bindexedDB\b/, reason: 'IndexedDB access is not allowed' },

  // Timers (can be used for DoS)
  { pattern: /\bsetInterval\s*\(/, reason: 'setInterval() is not allowed' },
  { pattern: /\bsetTimeout\s*\(/, reason: 'setTimeout() is not allowed' },

  // Process / system
  { pattern: /\bprocess\s*\./, reason: 'process access is not allowed' },
  { pattern: /\b__proto__\b/, reason: 'Prototype manipulation is not allowed' },
  { pattern: /\bconstructor\s*\[/, reason: 'Constructor access via brackets is not allowed' },

  // Worker self-messaging (escape hatch)
  { pattern: /\bpostMessage\s*\(/, reason: 'postMessage() is not allowed in strategy code' },
  { pattern: /\bself\s*\./, reason: 'Worker self access is not allowed' },
  { pattern: /\bglobalThis\s*\./, reason: 'globalThis access is not allowed' },
];

export interface SanitizeResult {
  ok: boolean;
  error?: string;
}

/**
 * Validates strategy code against size limits and forbidden patterns.
 * Call this BEFORE passing code to buildStrategyFn / transpile.
 */
export function sanitizeCode(code: string): SanitizeResult {
  if (!code || code.trim().length === 0) {
    return { ok: false, error: 'Strategy code is empty.' };
  }

  if (code.length > MAX_CODE_SIZE) {
    return { ok: false, error: `Strategy code exceeds maximum size (${MAX_CODE_SIZE} bytes).` };
  }

  // Strip comments before pattern matching (avoid false positives in comments)
  const stripped = code
    .replace(/\/\/.*$/gm, '')           // single-line comments
    .replace(/\/\*[\s\S]*?\*\//g, '')   // multi-line comments
    .replace(/#.*$/gm, '');             // Python-style comments

  for (const { pattern, reason } of FORBIDDEN_PATTERNS) {
    if (pattern.test(stripped)) {
      return { ok: false, error: reason };
    }
  }

  return { ok: true };
}
