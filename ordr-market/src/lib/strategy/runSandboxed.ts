/**
 * ORDR Market — Sandboxed Backtest Runner
 *
 * Executes runBacktest inside a Web Worker to isolate user code from the
 * main thread. User strategy code (via new Function()) runs in the worker
 * context where it cannot access DOM, window, document, localStorage,
 * cookies, or any sensitive main-thread globals.
 *
 * Falls back to main-thread execution if Web Workers are unavailable.
 */

import type { Bar, BacktestConfig, BacktestResult, Language } from './types';
import { EMPTY_METRICS } from './types';

const WORKER_TIMEOUT_MS = 30_000; // 30s max per backtest

export function runBacktestSandboxed(
  bars: Bar[],
  code: string,
  language: Language,
  config: BacktestConfig,
  userParams: Map<string, number> = new Map(),
): Promise<BacktestResult> {
  // Fall back to main-thread if Workers unavailable (SSR or unsupported)
  if (typeof Worker === 'undefined') {
    return import('./engine').then(({ runBacktest }) =>
      runBacktest(bars, code, language, config, userParams),
    );
  }

  return new Promise((resolve) => {
    let worker: Worker | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      if (worker) worker.terminate();
      worker = null;
      timer = null;
    };

    const errorResult = (message: string): BacktestResult => ({
      trades: [],
      equity: [],
      metrics: { ...EMPTY_METRICS, initialCapital: config.initialCapital, finalCapital: config.initialCapital },
      plots: [],
      error: message,
      barCount: 0,
      execTimeMs: 0,
    });

    try {
      worker = new Worker(
        new URL('./worker.ts', import.meta.url),
        { type: 'module' },
      );

      timer = setTimeout(() => {
        cleanup();
        resolve(errorResult('Strategy execution timed out (30s limit).'));
      }, WORKER_TIMEOUT_MS);

      worker.onmessage = (e: MessageEvent) => {
        cleanup();
        if (e.data.type === 'result') {
          resolve(e.data.data as BacktestResult);
        } else {
          resolve(errorResult(e.data.message ?? 'Unknown worker error'));
        }
      };

      worker.onerror = (err) => {
        cleanup();
        resolve(errorResult(`Worker error: ${err.message ?? 'unknown'}`));
      };

      worker.postMessage({
        bars,
        code,
        language,
        config,
        userParams: Array.from(userParams.entries()),
      });
    } catch (err) {
      cleanup();
      // Fallback: run on main thread
      import('./engine').then(({ runBacktest }) => {
        resolve(runBacktest(bars, code, language, config, userParams));
      });
    }
  });
}
