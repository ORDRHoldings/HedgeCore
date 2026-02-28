import type { FxRateEntry, FxNewsArticle, EconEvent, RiskPulseSnapshot, RiskInsight } from "./types";

interface Entry<T> {
  data: T;
  expiresAt: number;
}

class SimpleCache<T> {
  private store = new Map<string, Entry<T>>();

  get(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.data;
  }

  set(key: string, data: T, ttlMs: number): void {
    this.store.set(key, { data, expiresAt: Date.now() + ttlMs });
  }
}

// ── Ring buffer for factor history ────────────────────────────────────────────

export interface FactorSample {
  ts: number;
  vix: number;
  us10y: number;
  dxy: number;
  brent: number;
  gold: number;
}

export class RingBuffer<T> {
  private buf: T[] = [];
  private readonly max: number;

  constructor(maxSize: number) { this.max = maxSize; }

  push(item: T): void {
    this.buf.push(item);
    if (this.buf.length > this.max) this.buf.shift();
  }

  toArray(): T[] { return [...this.buf]; }
  length(): number { return this.buf.length; }

  series<K extends keyof T>(key: K): T[K][] {
    return this.buf.map((item) => item[key]);
  }
}

// ── Module-level singletons — survive warm serverless invocations ─────────────
export const fxRateCache      = new SimpleCache<FxRateEntry[]>();
export const fxNewsCache      = new SimpleCache<FxNewsArticle[]>();
export const econCalCache     = new SimpleCache<EconEvent[]>();
export const riskPulseCache   = new SimpleCache<RiskPulseSnapshot>();
export const riskInsightCache = new SimpleCache<RiskInsight>();

export const factorHistory = new RingBuffer<FactorSample>(30);
export const scoreHistory  = new RingBuffer<number>(20);
