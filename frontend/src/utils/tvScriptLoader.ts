/**
 * tvScriptLoader.ts
 *
 * Singleton loader for the TradingView charting library (tv.js).
 *
 * Loads https://s3.tradingview.com/tv.js exactly once per browser session,
 * regardless of how many TradingViewEmbed components mount simultaneously or
 * in sequence.  All callers receive the same Promise and share the resolved
 * window.TradingView global.
 *
 * Guarantees:
 *  – Script is appended to <head> at most once.
 *  – Returns a Promise<void> that resolves when tv.js has loaded and
 *    window.TradingView.widget is available.
 *  – On network failure: resets the singleton so the next call retries.
 *  – Safe to call from SSR context (resolves immediately, no DOM access).
 */

export const TV_SCRIPT_SRC = 'https://s3.tradingview.com/tv.js';

// Module-level singleton state — set on first call, shared by all callers.
let _promise: Promise<void> | null = null;

/**
 * Load tv.js once.  Subsequent calls return the same Promise without
 * appending another <script> tag.
 */
export function loadTvScript(): Promise<void> {
  // Already loading or loaded — return cached Promise.
  if (_promise) return _promise;

  // SSR guard — no DOM available, resolve immediately.
  if (typeof document === 'undefined') {
    _promise = Promise.resolve();
    return _promise;
  }

  // tv.js may already be present in the DOM (e.g. back-navigation in browsers
  // that preserve the document, or a previous component tree mount).
  // If window.TradingView is already populated we are ready immediately.
  if (
    typeof window !== 'undefined' &&
    typeof (window as Window & { TradingView?: unknown }).TradingView !== 'undefined'
  ) {
    _promise = Promise.resolve();
    return _promise;
  }

  // Check for an existing <script src="...tv.js"> tag.
  const existing = document.querySelector<HTMLScriptElement>(
    `script[src="${TV_SCRIPT_SRC}"]`,
  );
  if (existing) {
    // Script tag present but may still be loading — wait for window.TradingView.
    _promise = waitForTradingView();
    return _promise;
  }

  // First load: create the script tag.
  _promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = TV_SCRIPT_SRC;
    script.async = true;

    script.onload = () => {
      // tv.js sets window.TradingView synchronously in its onload, but we
      // double-check to guard against edge cases.
      if (typeof (window as Window & { TradingView?: unknown }).TradingView !== 'undefined') {
        resolve();
      } else {
        // Poll briefly — should be near-instant.
        waitForTradingView().then(resolve).catch(reject);
      }
    };

    script.onerror = () => {
      _promise = null; // Reset so next call retries.
      reject(new Error(`[tvScriptLoader] Failed to load ${TV_SCRIPT_SRC}`));
    };

    document.head.appendChild(script);
  });

  return _promise;
}

/**
 * Poll for window.TradingView to become available (used when the script tag
 * exists in the DOM but may still be executing).
 * Gives up after 10 s.
 * @internal
 */
function waitForTradingView(): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const deadline = Date.now() + 10_000;
    function check() {
      if (typeof (window as Window & { TradingView?: unknown }).TradingView !== 'undefined') {
        resolve();
      } else if (Date.now() > deadline) {
        _promise = null;
        reject(new Error('[tvScriptLoader] Timed out waiting for window.TradingView'));
      } else {
        requestAnimationFrame(check);
      }
    }
    check();
  });
}

/**
 * Reset the singleton — exposed for unit tests only.
 * @internal
 */
export function _resetTvScriptLoader(): void {
  _promise = null;
}
