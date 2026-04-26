"use client";

/**
 * TradingViewEmbed.tsx
 *
 * Production-grade TradingView chart embed using the tv.js programmatic API.
 *
 * Approach: loads https://s3.tradingview.com/tv.js once (singleton) then calls
 *   new window.TradingView.widget({ container_id, symbol, … })
 * No JSON config <script> tags are injected into the DOM — the widget is
 * initialised entirely via the JS constructor after the container is mounted
 * and has non-zero dimensions.
 *
 * Guarantees:
 *  1. Singleton script loader  — tv.js is appended to <head> once per session.
 *  2. ResizeObserver layout gate — widget only initialises after the container
 *     reports width > 0 AND height > 0 (handles first render, tab switches,
 *     route transitions — no reliance on user interaction).
 *  3. Unique container ID      — each instance gets a stable, unique DOM id so
 *     TradingView.widget can locate the correct element.
 *  4. Clean unmount / duplicate prevention — widget.remove() called on cleanup;
 *     a per-effect `destroyed` flag prevents stale async callbacks from re-init.
 *  5. UX states                — loading skeleton during init; actionable error
 *     + Retry button on failure.
 *
 * Parent usage:
 *   <div className="h-[420px] w-full">
 *     <TradingViewEmbed symbol="FX_IDC:USDMXN" />
 *   </div>
 *
 * Set key={symbol} on the parent to fully remount when the symbol changes.
 */

import { useEffect, useId, useRef, useState, useCallback } from 'react';
import { loadTvScript } from '../../utils/tvScriptLoader';

// ── Types ─────────────────────────────────────────────────────────────────────

/** Minimal surface of window.TradingView.widget we actually use. */
interface TvWidget {
  remove(): void;
}

declare global {
  interface Window {
    TradingView?: {
      widget: new (config: TvWidgetConfig) => TvWidget;
    };
  }
}

interface TvWidgetConfig {
  container_id: string;
  symbol: string;
  interval: string;
  timezone: string;
  theme: 'light' | 'dark';
  style: string;
  locale: string;
  autosize: boolean;
  allow_symbol_change: boolean;
  hide_top_toolbar?: boolean;
  save_image?: boolean;
}

type Status = 'loading' | 'ready' | 'error';

interface Props {
  symbol: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Bounded number of ResizeObserver ticks to wait for non-zero size. */
const MAX_RESIZE_TICKS = 80;          // ~1.3 s at 60 fps
/** Fallback: mark ready/error if iframe is never detected. */
const READY_TIMEOUT_MS = 10_000;

// ── Component ─────────────────────────────────────────────────────────────────

export default function TradingViewEmbed({ symbol }: Props) {
  // useId gives a stable, unique id per component instance (React 18+).
  // Strip React's colon characters so the value is a valid DOM id.
  const reactId = useId();
  const containerId = `tv-chart-${reactId.replace(/:/g, '')}`;

  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef    = useRef<TvWidget | null>(null);

  const [status,   setStatus]   = useState<Status>('loading');
  const [retryKey, setRetryKey] = useState(0);

  const handleRetry = useCallback(() => {
    setStatus('loading');
    setRetryKey(k => k + 1);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !symbol) return;

    // ── Cleanup helpers ───────────────────────────────────────────────────────
    let destroyed = false;
    let resizeObserver: ResizeObserver | null = null;
    let mutationObserver: MutationObserver | null = null;
    let readyTimer: ReturnType<typeof setTimeout> | null = null;
    let resizeTicks = 0;

    function destroyWidget() {
      if (widgetRef.current) {
        try { widgetRef.current.remove(); } catch { /* ignore */ }
        widgetRef.current = null;
      }
    }

    // ── Step 1: reset state, destroy previous widget ──────────────────────────
    destroyWidget();
    container.innerHTML = '';
    setStatus('loading');

    // ── Step 2: load tv.js (singleton — no-op if already loaded) ─────────────
    loadTvScript().then(() => {
      if (destroyed) return;

      // ── Step 3: gate on non-zero container dimensions ─────────────────────
      // ResizeObserver fires when the container's painted size changes.
      // We must not call new TradingView.widget() until the container has
      // real dimensions — tv.js reads getBoundingClientRect() at init time.
      resizeObserver = new ResizeObserver((entries) => {
        if (destroyed) { resizeObserver?.disconnect(); return; }

        const rect = entries[0]?.contentRect;
        if (!rect) return;

        resizeTicks++;

        if (rect.width > 0 && rect.height > 0) {
          // Container is measurable — initialise widget exactly once.
          resizeObserver?.disconnect();
          resizeObserver = null;
          initWidget(container);
        } else if (resizeTicks >= MAX_RESIZE_TICKS) {
          // Gave up waiting for layout.
          resizeObserver?.disconnect();
          resizeObserver = null;
          if (!destroyed) setStatus('error');
        }
      });

      resizeObserver.observe(container);
    }).catch(() => {
      if (!destroyed) setStatus('error');
    });

    // ── Widget init (called once container size is confirmed) ─────────────────
    function initWidget(el: HTMLDivElement) {
      if (destroyed) return;
      if (!window.TradingView?.widget) {
        if (!destroyed) setStatus('error');
        return;
      }

      // Ensure the container element has the id that TradingView will target.
      el.id = containerId;

      try {
        const widget = new window.TradingView.widget({
          container_id:        containerId,
          symbol,
          interval:            'D',
          timezone:            'Etc/UTC',
          theme:               'light',
          style:               '1',
          locale:              'en',
          autosize:            true,
          allow_symbol_change: true,
          hide_top_toolbar:    false,
          save_image:          false,
        });

        widgetRef.current = widget;

        // Detect the iframe the widget injects → mark ready.
        mutationObserver = new MutationObserver((mutations) => {
          for (const m of mutations) {
            for (const node of Array.from(m.addedNodes)) {
              if (node instanceof HTMLIFrameElement) {
                mutationObserver?.disconnect();
                mutationObserver = null;
                if (readyTimer) { clearTimeout(readyTimer); readyTimer = null; }
                if (!destroyed) setStatus('ready');
                return;
              }
            }
          }
        });
        mutationObserver.observe(el, { childList: true, subtree: true });

        // Safety timeout: surface error if iframe never appears.
        readyTimer = setTimeout(() => {
          mutationObserver?.disconnect();
          mutationObserver = null;
          if (!destroyed) {
            const hasIframe = el.querySelector('iframe') !== null;
            setStatus(hasIframe ? 'ready' : 'error');
          }
        }, READY_TIMEOUT_MS);

      } catch {
        if (!destroyed) setStatus('error');
      }
    }

    // ── Cleanup ───────────────────────────────────────────────────────────────
    return () => {
      destroyed = true;
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      if (readyTimer) clearTimeout(readyTimer);
      destroyWidget();
      // Clear DOM so next mount starts clean (no orphaned iframes).
      if (container) container.innerHTML = '';
    };

  // retryKey in deps: manual Retry click triggers a full re-run of this effect.
  // containerId is stable (derived from useId which is mount-stable).
  }, [symbol, containerId, retryKey]);

  return (
    <div className="relative w-full h-full">

      {/* ── Loading skeleton ──────────────────────────────────────────────── */}
      {status === 'loading' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[var(--bg-panel)] z-10 gap-3 pointer-events-none">
          <div className="flex items-end gap-1">
            {[12, 18, 14, 20, 16].map((h, i) => (
              <div
                key={i}
                className="w-1 rounded-full bg-[var(--accent-cyan)] animate-pulse"
                style={{ height: h, animationDelay: `${i * 100}ms`, opacity: 0.65 }}
              />
            ))}
          </div>
          <span className="text-[11px] text-[var(--text-tertiary)] font-mono tracking-wider">
            Loading chart…
          </span>
        </div>
      )}

      {/* ── Error state ───────────────────────────────────────────────────── */}
      {status === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[var(--bg-panel)] z-10 gap-3 p-6">
          <svg
            width="20" height="20" viewBox="0 0 24 24" fill="none"
            style={{ color: 'var(--accent-amber)' }}
          >
            <path
              d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
              stroke="currentColor" strokeWidth="1.5"
              strokeLinecap="round" strokeLinejoin="round"
            />
          </svg>
          <p className="text-[11px] text-[var(--text-secondary)] text-center leading-relaxed">
            Chart failed to load.
            <br />
            Check your network connection.
          </p>
          <button
            onClick={handleRetry}
            className="text-[11px] px-3 py-1 border border-[var(--border-rim)] text-[var(--text-secondary)] hover:border-[var(--accent-cyan)] hover:text-[var(--accent-cyan)] transition-colors font-mono tracking-wide"
          >
            Retry
          </button>
        </div>
      )}

      {/*
        Container element.
        – id={containerId}: required by new TradingView.widget({ container_id })
          so the library can do document.getElementById(container_id).
        – Must be in the DOM with non-zero dimensions before widget() is called
          (enforced by the ResizeObserver gate above).
        – No child elements pre-injected; tv.js manages its own DOM.
      */}
      <div
        id={containerId}
        ref={containerRef}
        className="w-full h-full"
      />
    </div>
  );
}
