/**
 * ORDR Market — Strategy Backtest Web Worker
 *
 * Executes user strategy code in an isolated Web Worker context.
 * This prevents user code from accessing the DOM, window, document,
 * localStorage, or any other main-thread globals.
 *
 * Protocol:
 *   Main → Worker: { bars, code, language, config, userParams }
 *   Worker → Main: { type: 'result', data: BacktestResult }
 *                 | { type: 'error', message: string }
 */

import { runBacktest } from './engine';
import type { BacktestConfig, Language } from './types';

interface WorkerMessage {
  bars: { t: number; o: number; h: number; l: number; c: number; v: number }[];
  code: string;
  language: Language;
  config: BacktestConfig;
  userParams?: [string, number][];
}

self.onmessage = (e: MessageEvent<WorkerMessage>) => {
  const { bars, code, language, config, userParams } = e.data;
  try {
    const params = new Map<string, number>(userParams ?? []);
    const result = runBacktest(bars, code, language, config, params);
    self.postMessage({ type: 'result', data: result });
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err) });
  }
};
