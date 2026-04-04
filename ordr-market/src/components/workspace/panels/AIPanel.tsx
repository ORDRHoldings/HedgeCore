'use client';
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Bot, Send, Sparkles, TrendingUp, Target, AlertTriangle, BarChart3, Loader, Zap, BookOpen } from 'lucide-react';
import { T } from '../tokens';
import { useWorkspace } from '../WorkspaceProvider';
import { formatPrice } from '../workspace-data';
import { usePublicChartData } from '@/hooks/usePublicChartData';
import { computeRSI } from '@/components/chart/indicators/rsi';
import { computeMACD } from '@/components/chart/indicators/macd';
import { computeBollinger } from '@/components/chart/indicators/bollinger';
import { computeStochastic } from '@/components/chart/indicators/stochastic';
import { emaFromValues } from '@/components/chart/indicators/ema';
import { detectMarketStructure } from '@/components/chart/detection/market-structure';

// ── TF mapping ─────────────────────────────────────────────────────────────────
const TF_TO_API: Record<string, string> = {
  '1m': '1min', '3m': '3min', '5m': '5min', '15m': '15min', '30m': '30min',
  '1h': '1h', '4h': '4h', 'D': '1day', 'W': '1week',
};

// ── Market snapshot types ──────────────────────────────────────────────────────
interface MarketSnapshot {
  rsi: number | null;
  rsiSignal: 'bull' | 'bear' | 'neutral';
  macdHistogram: number | null;
  macdSignal: 'bull' | 'bear' | 'neutral';
  emaPosition: number | null;  // % from EMA20
  emaSignal: 'bull' | 'bear' | 'neutral';
  bbPosition: number | null;   // 0–100 within bands
  bbSignal: 'bull' | 'bear' | 'neutral';
  stochK: number | null;
  stochSignal: 'bull' | 'bear' | 'neutral';
  lastStructure: string | null;  // e.g. "BOS ▲ bullish"
  structureSignal: 'bull' | 'bear' | 'neutral';
  prevHigh: number | null;
  prevLow: number | null;
  prevClose: number | null;
  barsLoaded: number;
}

function computeSnapshot(bars: Parameters<typeof computeRSI>[0]): MarketSnapshot {
  const snap: MarketSnapshot = {
    rsi: null, rsiSignal: 'neutral',
    macdHistogram: null, macdSignal: 'neutral',
    emaPosition: null, emaSignal: 'neutral',
    bbPosition: null, bbSignal: 'neutral',
    stochK: null, stochSignal: 'neutral',
    lastStructure: null, structureSignal: 'neutral',
    prevHigh: null, prevLow: null, prevClose: null,
    barsLoaded: bars.length,
  };
  if (bars.length < 30) return snap;

  const lastBar = bars[bars.length - 1];
  const price = lastBar.c;

  // RSI
  try {
    const rsiPts = computeRSI(bars, 14);
    if (rsiPts.length > 0) {
      const v = rsiPts[rsiPts.length - 1].value;
      snap.rsi = v;
      snap.rsiSignal = v < 35 ? 'bull' : v > 65 ? 'bear' : 'neutral';
    }
  } catch { /* skip */ }

  // MACD histogram
  try {
    const macdPts = computeMACD(bars, 12, 26, 9);
    if (macdPts.length >= 2) {
      const h = macdPts[macdPts.length - 1].histogram;
      const hp = macdPts[macdPts.length - 2].histogram;
      snap.macdHistogram = h;
      snap.macdSignal = h > 0 && h > hp ? 'bull' : h < 0 && h < hp ? 'bear' : h > 0 ? 'neutral' : h < 0 ? 'bear' : 'neutral';
    }
  } catch { /* skip */ }

  // EMA20 position
  try {
    const closes = bars.map(b => b.c);
    const ema20 = emaFromValues(closes, 20);
    if (ema20.length > 0) {
      const e = ema20[ema20.length - 1];
      const pct = ((price - e) / e) * 100;
      snap.emaPosition = pct;
      snap.emaSignal = pct > 0.1 ? 'bull' : pct < -0.1 ? 'bear' : 'neutral';
    }
  } catch { /* skip */ }

  // Bollinger %B
  try {
    const bbPts = computeBollinger(bars, 20, 2);
    if (bbPts.length > 0) {
      const { upper, lower } = bbPts[bbPts.length - 1];
      const range = upper - lower;
      const pos = range > 0 ? ((price - lower) / range) * 100 : 50;
      snap.bbPosition = pos;
      snap.bbSignal = pos < 25 ? 'bull' : pos > 75 ? 'bear' : 'neutral';
    }
  } catch { /* skip */ }

  // Stochastic %K
  try {
    const stPts = computeStochastic(bars, 14, 3);
    if (stPts.length > 0) {
      const k = stPts[stPts.length - 1].k;
      snap.stochK = k;
      snap.stochSignal = k < 25 ? 'bull' : k > 75 ? 'bear' : 'neutral';
    }
  } catch { /* skip */ }

  // Market structure — last event
  try {
    const ms = detectMarketStructure(bars);
    if (ms.events.length > 0) {
      const ev = ms.events[ms.events.length - 1];
      snap.lastStructure = `${ev.kind} ${ev.direction === 'bullish' ? '▲' : '▼'}`;
      snap.structureSignal = ev.direction === 'bullish' ? 'bull' : 'bear';
    }
  } catch { /* skip */ }

  // Previous session H/L/C (second-to-last bar, or estimate from previous day's data)
  if (bars.length >= 2) {
    const prev = bars[bars.length - 2];
    snap.prevHigh  = prev.h;
    snap.prevLow   = prev.l;
    snap.prevClose = prev.c;
  }

  return snap;
}

// ── Snapshot badge strip ───────────────────────────────────────────────────────
function SnapshotBadge({ label, value, signal, loading }: {
  label: string; value: string; signal: 'bull' | 'bear' | 'neutral'; loading: boolean;
}) {
  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 44 }}>
        <span style={{ fontSize: 8, color: T.text3, fontFamily: T.font, letterSpacing: '0.04em' }}>{label}</span>
        <span style={{ display: 'inline-block', width: 36, height: 14, background: T.border, borderRadius: 3, opacity: 0.4 }} />
      </div>
    );
  }
  const fg = signal === 'bull' ? T.bull : signal === 'bear' ? T.bear : T.text2;
  const bg = signal === 'bull' ? 'rgba(38,166,154,0.12)' : signal === 'bear' ? 'rgba(239,83,80,0.12)' : 'rgba(255,255,255,0.04)';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 44 }}>
      <span style={{ fontSize: 8, color: T.text3, fontFamily: T.font, letterSpacing: '0.04em' }}>{label}</span>
      <span style={{
        padding: '2px 5px', borderRadius: 3, background: bg, color: fg,
        fontSize: 9, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace",
        whiteSpace: 'nowrap',
      }}>{value}</span>
    </div>
  );
}

// ── Quick actions ──────────────────────────────────────────────────────────────
const QUICK_ACTIONS = [
  { icon: <Sparkles size={11} />, label: 'Auto Brief',   prompt: 'Give me a complete market brief covering trend, structure, key levels, indicator confluence, and potential trade setups based on the current data.' },
  { icon: <TrendingUp size={11} />, label: 'Trend',       prompt: 'Analyze the current trend direction, strength, and any potential reversal signals.' },
  { icon: <Target size={11} />,     label: 'Key Levels',  prompt: 'Identify the most important support and resistance levels, including psychological levels and the previous session high/low.' },
  { icon: <Zap size={11} />,        label: 'Setup',       prompt: 'Identify the best trade setup right now with a specific entry zone, stop loss placement, and target based on structure and R:R.' },
  { icon: <AlertTriangle size={11} />, label: 'Risk',     prompt: 'Assess the current risk environment, volatility context, and what could invalidate a bullish or bearish thesis.' },
  { icon: <BarChart3 size={11} />,  label: 'Confluence',  prompt: 'Check indicator confluence — where RSI, MACD, BB, Stochastic, and market structure align and what it implies.' },
  { icon: <BookOpen size={11} />,   label: 'Explain',     prompt: 'Explain what the current chart is telling us in plain terms, as if briefing a senior trader.' },
];

// ── Chat message ───────────────────────────────────────────────────────────────
interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

// ── Main component ─────────────────────────────────────────────────────────────
export function AIPanel() {
  const { state, symbolInfo } = useWorkspace();
  const apiInterval = TF_TO_API[state.timeframe] ?? '1day';
  const { bars, loading: barsLoading } = usePublicChartData(state.symbol, apiInterval, 200);

  const snapshot = useMemo(() => computeSnapshot(bars), [bars]);

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: `Ready to analyze **${state.symbol}** on the ${state.timeframe} timeframe.\n\nCurrent price: ${formatPrice(symbolInfo.price)}\n\nUse the quick actions above or ask anything about the chart.`,
      timestamp: Date.now(),
    },
  ]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: Message = { role: 'user', content: text, timestamp: Date.now() };
    const history = [...messages, userMsg];
    setMessages(history);
    setInput('');
    setLoading(true);

    // Build market data payload from snapshot
    const marketData = snapshot.barsLoaded >= 30 ? {
      rsi:           snapshot.rsi,
      rsiSignal:     snapshot.rsiSignal,
      macdHistogram: snapshot.macdHistogram,
      macdSignal:    snapshot.macdSignal,
      emaPosition:   snapshot.emaPosition !== null ? +snapshot.emaPosition.toFixed(3) : null,
      emaSignal:     snapshot.emaSignal,
      bbPosition:    snapshot.bbPosition !== null ? +snapshot.bbPosition.toFixed(1) : null,
      bbSignal:      snapshot.bbSignal,
      stochK:        snapshot.stochK,
      stochSignal:   snapshot.stochSignal,
      lastStructure: snapshot.lastStructure,
      structureSignal: snapshot.structureSignal,
      prevHigh:      snapshot.prevHigh,
      prevLow:       snapshot.prevLow,
      prevClose:     snapshot.prevClose,
      barsLoaded:    snapshot.barsLoaded,
    } : null;

    try {
      const res = await fetch('/api/ai-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: state.symbol,
          timeframe: state.timeframe,
          price: symbolInfo.price,
          chartConfig: state.chartConfig,
          subPanes: state.chartSubPanes,
          marketData,
          messages: history
            .filter(m => m.role === 'user' || m.role === 'assistant')
            .map(m => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.content ?? data.error ?? 'No response received.',
        timestamp: Date.now(),
      }]);
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Network error — unable to reach AI analysis service.',
        timestamp: Date.now(),
      }]);
    } finally {
      setLoading(false);
    }
  };

  const snapshotLoading = barsLoading || snapshot.barsLoaded < 30;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ padding: '6px 10px', borderBottom: `1px solid ${T.border}`, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Bot size={12} color={T.accent} />
        <span style={{ fontSize: 10, fontWeight: 500, color: T.text2, fontFamily: T.font, flex: 1 }}>
          {state.symbol} · {state.timeframe} · {state.indicators.length} indicators
        </span>
        {snapshotLoading && <Loader size={9} color={T.text3} style={{ animation: 'spin 1s linear infinite' }} />}
      </div>

      {/* Market Snapshot strip */}
      <div style={{
        padding: '6px 8px', borderBottom: `1px solid ${T.border}`, flexShrink: 0,
        display: 'flex', gap: 4, alignItems: 'flex-end', overflowX: 'auto',
      }}>
        <SnapshotBadge label="RSI"   value={snapshot.rsi    !== null ? snapshot.rsi.toFixed(1)  : '—'} signal={snapshot.rsiSignal}       loading={snapshotLoading} />
        <SnapshotBadge label="MACD"  value={snapshot.macdSignal === 'bull' ? '▲' : snapshot.macdSignal === 'bear' ? '▼' : '◆'} signal={snapshot.macdSignal} loading={snapshotLoading} />
        <SnapshotBadge label="EMA20" value={snapshot.emaPosition !== null ? `${snapshot.emaPosition >= 0 ? '+' : ''}${snapshot.emaPosition.toFixed(2)}%` : '—'} signal={snapshot.emaSignal} loading={snapshotLoading} />
        <SnapshotBadge label="BB%"   value={snapshot.bbPosition  !== null ? `${snapshot.bbPosition.toFixed(0)}%`   : '—'} signal={snapshot.bbSignal}   loading={snapshotLoading} />
        <SnapshotBadge label="Stoch" value={snapshot.stochK      !== null ? snapshot.stochK.toFixed(0)             : '—'} signal={snapshot.stochSignal} loading={snapshotLoading} />
        <SnapshotBadge label="Struct" value={snapshot.lastStructure ?? '—'} signal={snapshot.structureSignal} loading={snapshotLoading} />
        {snapshot.prevHigh !== null && (
          <SnapshotBadge label="PDH" value={formatPrice(snapshot.prevHigh)} signal="neutral" loading={false} />
        )}
        {snapshot.prevLow !== null && (
          <SnapshotBadge label="PDL" value={formatPrice(snapshot.prevLow)} signal="neutral" loading={false} />
        )}
      </div>

      {/* Quick actions */}
      <div style={{ padding: '5px 8px', borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
          {QUICK_ACTIONS.map(action => (
            <button
              key={action.label}
              onClick={() => sendMessage(action.prompt)}
              disabled={loading}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
                padding: '3px 7px', borderRadius: 3,
                border: `1px solid ${T.border}`, background: T.surfaceAlt,
                color: T.text2, fontSize: 9, fontWeight: 500,
                fontFamily: T.font, cursor: loading ? 'default' : 'pointer', outline: 'none',
                opacity: loading ? 0.5 : 1,
              }}
              onMouseEnter={e => { if (!loading) { e.currentTarget.style.borderColor = T.accent; e.currentTarget.style.color = T.accent; } }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.text2; }}
            >
              {action.icon}{action.label}
            </button>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
        {messages.map((msg, i) => (
          <div key={i} style={{ marginBottom: 8, display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{
              maxWidth: '92%', padding: '7px 10px', borderRadius: 6,
              background: msg.role === 'user' ? T.accentBg : T.surfaceAlt,
              border: `1px solid ${msg.role === 'user' ? 'transparent' : T.border}`,
            }}>
              <div style={{ fontSize: 10, color: T.text1, fontFamily: T.font, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                {msg.content}
              </div>
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 2px' }}>
            <Loader size={11} color={T.accent} style={{ animation: 'spin 1s linear infinite' }} />
            <span style={{ fontSize: 9, color: T.text3, fontFamily: T.font }}>Analyzing {state.symbol}…</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ padding: '6px 8px', borderTop: `1px solid ${T.border}`, flexShrink: 0, display: 'flex', gap: 4, alignItems: 'center' }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) sendMessage(input); }}
          placeholder="Ask about the chart…"
          style={{
            flex: 1, height: 28, padding: '0 8px', borderRadius: 3,
            border: `1px solid ${T.border}`, background: T.surfaceAlt,
            color: T.text1, fontSize: 11, fontFamily: T.font, outline: 'none',
          }}
        />
        <button
          onClick={() => sendMessage(input)}
          disabled={loading}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 28, height: 28, borderRadius: 3, border: 'none',
            background: T.accent, color: '#fff', cursor: loading ? 'default' : 'pointer',
            outline: 'none', opacity: loading ? 0.5 : 1,
          }}
        >
          {loading ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={12} />}
        </button>
      </div>
    </div>
  );
}
