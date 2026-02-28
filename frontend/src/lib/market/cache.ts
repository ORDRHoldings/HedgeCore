import type { FxRateEntry, FxNewsArticle, EconEvent } from "./types";

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

// Module-level singletons — survive warm serverless invocations
export const fxRateCache = new SimpleCache<FxRateEntry[]>();
export const fxNewsCache = new SimpleCache<FxNewsArticle[]>();
export const econCalCache = new SimpleCache<EconEvent[]>();
