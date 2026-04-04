'use client';
/**
 * ORDR Market — Chart Core
 *
 * Embeds the full ChartEngine inside the workspace layout.
 * Data source: IBKR Gateway via backend REST (historical) + WebSocket (live ticks).
 *
 * Historical bars: GET /v1/public/chart-data/{symbol}?interval={apiInterval}&limit={limit}
 * Live ticks:      ws(s)://{host}/ws/market  →  useMarketWebSocket
 */
import React, { useMemo, useCallback, useEffect, useRef, useState } from 'react';
import { useWorkspace } from './WorkspaceProvider';
import ChartEngine from '../chart/ChartEngine';
import { BASE_TIMEFRAMES } from './workspace-data';
import type { Bar } from '../chart/indicators/types';
import { usePublicChartData } from '@/hooks/usePublicChartData';
import { useMarketWebSocket } from '@/hooks/useMarketWebSocket';
import { useCompareData } from '@/hooks/useCompareData';
import { computeRSI } from '../chart/indicators/rsi';
import { computeEMA } from '../chart/indicators/ema';
import { computeMACD } from '../chart/indicators/macd';

// ── Timeframe mapping: workspace codes → backend API codes ───────────────────
const TF_MAP: Record<string, string> = {
  '1m': '1min', '3m': '3min', '5m': '5min', '15m': '15min', '30m': '30min',
  '1h': '1h', '4h': '4h', 'D': '1day', 'W': '1week', 'M': '1month',
};

// Milliseconds per bar for each workspace timeframe code
const TF_MS: Record<string, number> = {
  '1m': 60_000, '3m': 180_000, '5m': 300_000,
  '15m': 900_000, '30m': 1_800_000,
  '1h': 3_600_000, '4h': 14_400_000,
  'D': 86_400_000, 'W': 604_800_000, 'M': 2_592_000_000,
};

function fmtCountdown(ms: number): string {
  if (ms <= 0) return 'closing';
  const s = Math.floor(ms / 1000) % 60;
  const m = Math.floor(ms / 60_000) % 60;
  const h = Math.floor(ms / 3_600_000);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s.toString().padStart(2, '0')}s`;
  return `${s}s`;
}

function toApiInterval(tf: string): string {
  return TF_MAP[tf] ?? '1day';
}

function barLimitFor(tf: string): number {
  // More bars for intraday so the chart fills meaningfully
  if (['1m', '3m', '5m'].includes(tf)) return 300;
  if (['15m', '30m'].includes(tf)) return 400;
  return 500;
}

// ── Loading/error overlay ────────────────────────────────────────────────────
function ChartOverlay({ text, isError }: { text: string; isError?: boolean }) {
  return (
    <div style={{
      position: 'absolute', inset: 0, display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-deep, #0a0a0f)',
      color: isError ? '#ef4444' : 'var(--text-muted, #555)',
      fontFamily: 'IBM Plex Mono, monospace', fontSize: 12,
      letterSpacing: '0.05em', zIndex: 10,
      pointerEvents: 'none',
    }}>
      {text}
    </div>
  );
}

// ── Browser notification helper ──────────────────────────────────────────────
function fireBrowserNotification(title: string, body: string) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try { new Notification(title, { body, icon: '/favicon.ico', tag: 'ordr-alert' }); } catch { /* */ }
}

// ── Webhook fire helper (fire-and-forget, never throws) ──────────────────────
function fireWebhook(url: string, payload: Record<string, unknown>) {
  if (!url) return;
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: 'ORDR Market', ...payload }),
  }).catch(() => { /* silently ignore webhook errors */ });
}

// ── Alert beep via Web Audio API ─────────────────────────────────────────────
function playAlertBeep(freq = 880, duration = 0.4) {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
    osc.onended = () => ctx.close();
  } catch { /* browser may block audio without user interaction */ }
}

// ── Main Chart Core ──────────────────────────────────────────────────────────
export function ChartCore() {
  const { state, dispatch, symbolInfo } = useWorkspace();
  const apiInterval = toApiInterval(state.timeframe);
  const limit = barLimitFor(state.timeframe);

  // Historical bars from backend (IBKR or TwelveData)
  const { bars: fetchedBars, loading, error, source } = usePublicChartData(
    state.symbol,
    apiInterval,
    limit,
  );

  // Live tick from WebSocket (updates last bar in real-time)
  const { tick, connected: wsConnected } = useMarketWebSocket(state.symbol);

  // Comparison overlay data
  const compareData = useCompareData(state.compareSymbols, toApiInterval(state.timeframe));

  // Sync fetched bar count to replay state so the scrubber knows total range
  useEffect(() => {
    if (fetchedBars.length > 0) {
      dispatch({ type: 'SET_REPLAY_TOTAL', total: fetchedBars.length });
    }
  }, [fetchedBars.length, dispatch]);

  // Alert price monitor — detect price crossings against active alerts
  const prevPriceRef = useRef<number>(0);
  useEffect(() => {
    const price = symbolInfo.price;
    if (!price || price <= 0) return;
    const prev = prevPriceRef.current;
    prevPriceRef.current = price;
    if (!prev) return; // skip first tick (no previous to compare)

    for (const alert of state.alerts) {
      if (!alert.active || alert.triggered) continue;
      if (alert.symbol !== state.symbol) continue;
      if (alert.type !== 'price') continue;

      const hitAbove = alert.condition.includes('above') && prev < alert.value && price >= alert.value;
      const hitBelow = alert.condition.includes('below') && prev > alert.value && price <= alert.value;

      if (hitAbove || hitBelow) {
        dispatch({ type: 'TRIGGER_ALERT', id: alert.id });
        dispatch({ type: 'LOG_ALERT_TRIGGER', entry: { symbol: alert.symbol, condition: alert.condition, value: alert.value, triggerPrice: price, triggeredAt: new Date().toISOString() } });
        const msg = `Alert fired: ${alert.symbol} — ${alert.condition}`;
        dispatch({ type: 'ADD_TOAST', toast: { message: msg, type: 'alert' } });
        playAlertBeep();
        fireBrowserNotification(`ORDR Alert — ${alert.symbol}`, `${alert.condition.replace('price_', '')} ${alert.value}`);
        if (state.webhookEnabled && state.webhookUrl) {
          fireWebhook(state.webhookUrl, { type: 'price_alert', symbol: alert.symbol, condition: alert.condition, value: alert.value, triggerPrice: price, triggeredAt: new Date().toISOString() });
        }
      }
    }
  }, [symbolInfo.price]); // eslint-disable-line react-hooks/exhaustive-deps

  // Indicator alert monitor — detect indicator condition crossings on new bars
  const prevBarsLenRef = useRef<number>(0);
  useEffect(() => {
    if (!fetchedBars.length || fetchedBars.length === prevBarsLenRef.current) return;
    prevBarsLenRef.current = fetchedBars.length;

    const indAlerts = state.alerts.filter(a =>
      a.active && !a.triggered && a.type === 'indicator' && a.symbol === state.symbol
    );
    if (!indAlerts.length) return;

    const n = fetchedBars.length;
    if (n < 35) return; // need enough bars for MACD

    let rsiPrev: number | null = null, rsiCurr: number | null = null;
    let macdPrev: { macd: number; signal: number } | null = null;
    let macdCurr: { macd: number; signal: number } | null = null;

    for (const alert of indAlerts) {
      const { condition, value } = alert;
      let fired = false;

      if (condition === 'rsi_above' || condition === 'rsi_below') {
        if (rsiPrev === null) {
          const rsiPoints = computeRSI(fetchedBars);
          if (rsiPoints.length >= 2) {
            rsiPrev = rsiPoints[rsiPoints.length - 2].value;
            rsiCurr = rsiPoints[rsiPoints.length - 1].value;
          }
        }
        if (rsiPrev !== null && rsiCurr !== null) {
          if (condition === 'rsi_above' && rsiPrev <= value && rsiCurr > value) fired = true;
          if (condition === 'rsi_below' && rsiPrev >= value && rsiCurr < value) fired = true;
        }
      } else if (condition === 'ema_cross_above' || condition === 'ema_cross_below') {
        const period = Math.round(value) || 20;
        const emaPoints = computeEMA(fetchedBars, period);
        if (emaPoints.length >= 2) {
          const prevEma = emaPoints[emaPoints.length - 2].value;
          const currEma = emaPoints[emaPoints.length - 1].value;
          const prevClose = fetchedBars[n - 2].c;
          const currClose = fetchedBars[n - 1].c;
          if (condition === 'ema_cross_above' && prevClose <= prevEma && currClose > currEma) fired = true;
          if (condition === 'ema_cross_below' && prevClose >= prevEma && currClose < currEma) fired = true;
        }
      } else if (condition === 'macd_bull_cross' || condition === 'macd_bear_cross') {
        if (macdPrev === null) {
          const macdPoints = computeMACD(fetchedBars);
          if (macdPoints.length >= 2) {
            macdPrev = { macd: macdPoints[macdPoints.length - 2].macd, signal: macdPoints[macdPoints.length - 2].signal };
            macdCurr = { macd: macdPoints[macdPoints.length - 1].macd, signal: macdPoints[macdPoints.length - 1].signal };
          }
        }
        if (macdPrev && macdCurr) {
          if (condition === 'macd_bull_cross' && macdPrev.macd <= macdPrev.signal && macdCurr.macd > macdCurr.signal) fired = true;
          if (condition === 'macd_bear_cross' && macdPrev.macd >= macdPrev.signal && macdCurr.macd < macdCurr.signal) fired = true;
        }
      }

      if (fired) {
        dispatch({ type: 'TRIGGER_ALERT', id: alert.id });
        const lastBar = fetchedBars[fetchedBars.length - 1];
        dispatch({ type: 'LOG_ALERT_TRIGGER', entry: { symbol: alert.symbol, condition, value: alert.value, triggerPrice: lastBar?.c ?? alert.value, triggeredAt: new Date().toISOString() } });
        const indMsg = `Indicator alert: ${alert.symbol} — ${condition.replace(/_/g, ' ')}`;
        dispatch({ type: 'ADD_TOAST', toast: { message: indMsg, type: 'alert' } });
        playAlertBeep(660, 0.5);
        fireBrowserNotification(`ORDR Alert — ${alert.symbol}`, condition.replace(/_/g, ' '));
        if (state.webhookEnabled && state.webhookUrl) {
          const lastBar = fetchedBars[fetchedBars.length - 1];
          fireWebhook(state.webhookUrl, { type: 'indicator_alert', symbol: alert.symbol, condition, value: alert.value, triggerPrice: lastBar?.c ?? alert.value, triggeredAt: new Date().toISOString() });
        }
      }
    }
  }, [fetchedBars.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Merge live tick + apply replay slice
  const bars = useMemo<Bar[]>(() => {
    if (!fetchedBars.length) return fetchedBars;

    // In replay mode: show only bars up to replayIndex, no live tick
    if (state.replayActive) {
      return fetchedBars.slice(0, Math.max(1, state.replayIndex));
    }

    // Live mode: merge latest tick into last bar
    if (!tick || !Number.isFinite(tick.mid) || tick.mid <= 0) return fetchedBars;
    const last = fetchedBars[fetchedBars.length - 1];
    const liveBar: Bar = {
      ...last,
      c: tick.mid,
      h: Math.max(last.h, tick.mid),
      l: Math.min(last.l, tick.mid),
    };
    const result = fetchedBars.slice();
    result[result.length - 1] = liveBar;
    return result;
  }, [fetchedBars, tick, state.replayActive, state.replayIndex]);

  const handlePairChange = useCallback((pair: string) => {
    dispatch({ type: 'SET_SYMBOL', symbol: pair });
  }, [dispatch]);

  const handleDrawingModeChange = useCallback((mode: string | null) => {
    dispatch({ type: 'SET_DRAWING_MODE', mode });
    if (mode === null) dispatch({ type: 'SET_TOOL', tool: 'cursor' });
  }, [dispatch]);

  const handleChartTypeChange = useCallback((type: string) => {
    dispatch({ type: 'SET_CHART_TYPE', chartType: type as any });
  }, [dispatch]);

  const handlePriceScaleModeChange = useCallback((mode: 'linear' | 'log' | 'percent') => {
    dispatch({ type: 'SET_PRICE_SCALE_MODE', mode });
  }, [dispatch]);

  const handleAddAlert = useCallback((price: number, direction: 'above' | 'below') => {
    dispatch({
      type: 'ADD_ALERT',
      alert: {
        type: 'price',
        symbol: state.symbol,
        condition: `price_${direction}`,
        value: price,
        active: true,
        triggered: false,
      },
    });
    dispatch({ type: 'ADD_TOAST', toast: { message: `Alert set ${direction} ${price < 10 ? price.toFixed(5) : price.toFixed(2)}`, type: 'info' } });
  }, [dispatch, state.symbol]);

  const handleOpenPanel = useCallback((panel: 'ai' | 'alerts') => {
    dispatch({ type: 'SET_RIGHT_TAB', tab: panel });
  }, [dispatch]);

  const handleObjectSelect = useCallback((id: string | null) => {
    dispatch({ type: 'SET_SELECTED_OBJECT', id });
    if (id !== null) dispatch({ type: 'SET_RIGHT_TAB', tab: 'properties' });
  }, [dispatch]);

  const handleObjectData = useCallback((data: { type: string; color: string; lineWidth: number; lineStyle: string; label: string; opacity: number; locked: boolean } | null) => {
    dispatch({ type: 'SET_SELECTED_OBJECT_DATA', data });
  }, [dispatch]);

  // ── Candle countdown timer ────────────────────────────────────────────────
  const [countdown, setCountdown] = useState('');
  useEffect(() => {
    const intervalMs = TF_MS[state.timeframe];
    if (!intervalMs || !fetchedBars.length) { setCountdown(''); return; }

    function compute() {
      const lastBar = fetchedBars[fetchedBars.length - 1];
      const closeAt = lastBar.t + intervalMs;
      setCountdown(fmtCountdown(closeAt - Date.now()));
    }
    compute();
    const id = window.setInterval(compute, 1_000);
    return () => window.clearInterval(id);
  }, [fetchedBars, state.timeframe]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── News events overlay ───────────────────────────────────────────────────
  const [newsEvents, setNewsEvents] = useState<{ ts: number; title: string; importance: 'high' | 'medium' | 'low'; sentiment: string; source: string }[]>([]);
  useEffect(() => {
    if (!state.showNewsOverlay) { setNewsEvents([]); return; }
    let cancelled = false;
    fetch(`/api/news?symbol=${encodeURIComponent(state.symbol)}&mode=symbol&limit=50`)
      .then(r => r.json())
      .then((data: { news?: { isoTime: string; title: string; importance: string; sentiment: string; source: string }[] }) => {
        if (cancelled) return;
        const items = (data.news ?? []).map(n => ({
          ts: Math.floor(new Date(n.isoTime).getTime() / 1000),
          title: n.title,
          importance: (n.importance as 'high' | 'medium' | 'low'),
          sentiment: n.sentiment,
          source: n.source,
        }));
        setNewsEvents(items);
      })
      .catch(() => { if (!cancelled) setNewsEvents([]); });
    return () => { cancelled = true; };
  }, [state.showNewsOverlay, state.symbol]);

  const fvgOn = !!(state.chartConfig as Record<string, boolean>).fvg;
  const tlOn  = !!(state.chartConfig as Record<string, boolean>).trendlines;

  return (
    <div style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: 'hidden', position: 'relative' }}>
      {loading && !fetchedBars.length && (
        <ChartOverlay text="Loading chart data from IBKR…" />
      )}
      {error && !fetchedBars.length && (
        <ChartOverlay text={`Data unavailable: ${error}`} isError />
      )}

      {/* ── On-chart overlay toggles ─────────────────────────────────── */}
      <div style={{
        position: 'absolute', bottom: 36, left: 12, zIndex: 20,
        display: 'flex', gap: 4, pointerEvents: 'auto',
      }}>
        {/* FVG toggle */}
        <button
          onClick={() => dispatch({ type: 'TOGGLE_CHART_INDICATOR', key: 'fvg' })}
          title={fvgOn ? 'Hide FVG zones' : 'Show FVG zones'}
          style={{
            height: 22, padding: '0 8px', borderRadius: 4,
            border: `1px solid ${fvgOn ? 'rgba(41,98,255,0.6)' : 'rgba(255,255,255,0.12)'}`,
            background: fvgOn ? 'rgba(41,98,255,0.18)' : 'rgba(0,0,0,0.55)',
            color: fvgOn ? '#90CAF9' : 'rgba(255,255,255,0.45)',
            fontSize: 10, fontWeight: 600, cursor: 'pointer',
            fontFamily: "'IBM Plex Mono', monospace",
            letterSpacing: '0.04em', outline: 'none',
            backdropFilter: 'blur(4px)',
            transition: 'all 0.12s',
          }}
        >
          FVG
        </button>
        {/* Trendlines toggle */}
        <button
          onClick={() => dispatch({ type: 'TOGGLE_CHART_INDICATOR', key: 'trendlines' })}
          title={tlOn ? 'Hide auto trendlines' : 'Show auto trendlines'}
          style={{
            height: 22, padding: '0 8px', borderRadius: 4,
            border: `1px solid ${tlOn ? 'rgba(41,98,255,0.6)' : 'rgba(255,255,255,0.12)'}`,
            background: tlOn ? 'rgba(41,98,255,0.18)' : 'rgba(0,0,0,0.55)',
            color: tlOn ? '#90CAF9' : 'rgba(255,255,255,0.45)',
            fontSize: 10, fontWeight: 600, cursor: 'pointer',
            fontFamily: "'IBM Plex Mono', monospace",
            letterSpacing: '0.04em', outline: 'none',
            backdropFilter: 'blur(4px)',
            transition: 'all 0.12s',
          }}
        >
          TL
        </button>
        {/* Candle countdown */}
        {countdown && (
          <span style={{
            height: 22, padding: '0 8px', borderRadius: 4,
            border: '1px solid rgba(255,255,255,0.10)',
            background: 'rgba(0,0,0,0.55)',
            color: countdown === 'closing' ? 'rgba(255,152,0,0.9)' : 'rgba(255,255,255,0.45)',
            fontSize: 10, fontWeight: 600,
            fontFamily: "'IBM Plex Mono', monospace",
            letterSpacing: '0.04em',
            backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center',
            userSelect: 'none', whiteSpace: 'nowrap',
          }}>
            {countdown}
          </span>
        )}
      </div>

      <ChartEngine
        bars={bars}
        pair={state.symbol}
        interval={state.timeframe}
        source={source}
        loading={loading}
        error={error}
        onPairChange={handlePairChange}
        embedded
        externalConfig={state.chartConfig as any}
        externalSubPanes={state.chartSubPanes}
        externalChartType={state.chartType as any}
        externalDrawingMode={state.drawingMode as any}
        externalMagnetEnabled={state.magnetEnabled}
        externalHideDrawings={state.hideDrawings}
        externalLockDrawings={state.lockDrawings}
        externalDeleteAllDrawings={state.deleteDrawingsCounter}
        onDrawingModeChange={handleDrawingModeChange}
        onChartTypeChange={handleChartTypeChange}
        onObjectSelect={handleObjectSelect}
        onObjectData={handleObjectData}
        externalSessions={state.enabledSessions}
        externalScreenshotTrigger={state.screenshotCounter}
        externalCopyImageTrigger={state.copyChartImageCounter}
        externalBacktestMarkers={state.backtestMarkers}
        externalDrawingUpdate={state.pendingDrawingUpdate}
        externalAlertLevels={state.alerts.filter(a => a.symbol === state.symbol && a.type === 'price')}
        externalTradeLevels={state.paperPositions
          .filter(p => p.symbol === state.symbol)
          .map(p => ({ side: p.side, entryPrice: p.entryPrice, sl: p.sl, tp: p.tp, lots: p.lots, pair: state.symbol }))}
        externalPriceScaleMode={state.priceScaleMode}
        externalShowPrevLevels={state.showPrevLevels}
        externalShowOpenLevels={state.showOpenLevels}
        externalShowPivots={state.showPivots}
        externalShowCandlePatterns={state.showCandlePatterns}
        externalShowAutoFib={state.showAutoFib}
        externalShowSessionRanges={state.showSessionRanges}
        externalShowKillZones={state.showKillZones}
        externalShowEQHL={state.showEQHL}
        externalCompareData={compareData}
        externalNewsEvents={newsEvents}
        externalRiskLevels={state.riskLevels}
        onPriceScaleModeChange={handlePriceScaleModeChange}
        onAddAlert={handleAddAlert}
        onOpenPanel={handleOpenPanel}
        syncCrosshair={state.crosshairSyncEnabled && state.chartLayout !== '1'}
        onSwipeTimeframe={(dir) => {
          const tfs = [...BASE_TIMEFRAMES, ...state.customTimeframes];
          const idx = tfs.indexOf(state.timeframe);
          const next = dir === 'left' ? tfs[idx + 1] : tfs[idx - 1];
          if (next) dispatch({ type: 'SET_TIMEFRAME', timeframe: next });
        }}
      />
    </div>
  );
}
