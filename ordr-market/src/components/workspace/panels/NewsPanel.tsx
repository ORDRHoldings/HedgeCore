'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Newspaper, Clock, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { T } from '../tokens';
import { useWorkspace } from '../WorkspaceProvider';

// ─── Types ──────────────────────────────────────────────────────────────────

interface NewsItem {
  id: number;
  isoTime: string;
  importance: 'high' | 'medium' | 'low';
  sentiment: string;   // "Bullish" | "Bearish" | "Neutral" | "Somewhat-Bullish" etc.
  title: string;
  source: string;
  url?: string | null;
  summary?: string | null;
  tags: string[];
}

interface CalendarEvent {
  day: string;
  date?: string;
  time: string;
  event: string;
  impact: 'high' | 'medium' | 'low';
  currency: string;
  actual?: string | null;
  forecast?: string | null;
  previous?: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const REFRESH_INTERVAL = 90; // seconds

function relativeTime(isoTime: string): string {
  const diff = Math.floor((Date.now() - new Date(isoTime).getTime()) / 1000);
  if (diff < 60)  return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function isNew(isoTime: string): boolean {
  return Date.now() - new Date(isoTime).getTime() < 5 * 60 * 1000;
}

function impColor(imp: string) {
  if (imp === 'high')   return T.danger;
  if (imp === 'medium') return T.warn;
  return T.text3;
}

function sentimentStyle(s: string): { label: string; color: string; bg: string } {
  const lower = s.toLowerCase();
  if (lower.includes('bullish'))  return { label: 'Bull', color: '#26A69A', bg: 'rgba(38,166,154,0.12)' };
  if (lower.includes('bearish'))  return { label: 'Bear', color: '#EF5350', bg: 'rgba(239,83,80,0.12)' };
  return { label: 'Neut', color: T.text3, bg: T.surfaceAlt };
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <div style={{ padding: '7px 10px', margin: '0 4px 1px' }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 5, alignItems: 'center' }}>
        <div style={{ width: 5, height: 5, borderRadius: '50%', background: T.border }} />
        <div style={{ width: 28, height: 7, borderRadius: 2, background: T.border }} />
        <div style={{ width: 40, height: 7, borderRadius: 2, background: T.border }} />
      </div>
      <div style={{ width: '90%', height: 9, borderRadius: 2, background: T.border, marginBottom: 4 }} />
      <div style={{ width: '65%', height: 9, borderRadius: 2, background: T.border }} />
    </div>
  );
}

// ─── News row ────────────────────────────────────────────────────────────────

function NewsRow({ item }: { item: NewsItem }) {
  const [expanded, setExpanded] = useState(false);
  const sent = sentimentStyle(item.sentiment);
  const fresh = isNew(item.isoTime);

  return (
    <div
      style={{ padding: '6px 10px', margin: '0 4px 1px', borderRadius: 3, cursor: 'pointer' }}
      onClick={() => {
        if (item.summary) setExpanded(e => !e);
        else if (item.url) window.open(item.url, '_blank', 'noopener,noreferrer');
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = T.panelHover; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
    >
      {/* Meta row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: impColor(item.importance), flexShrink: 0 }} />
        <span style={{ fontSize: 8, fontFamily: T.mono, color: T.text3, fontVariantNumeric: 'tabular-nums' }}>
          {relativeTime(item.isoTime)}
        </span>
        <span style={{ fontSize: 8, color: T.text3, fontFamily: T.font }}>{item.source}</span>
        {/* Sentiment badge */}
        <span style={{
          fontSize: 7, fontWeight: 700, letterSpacing: '0.03em',
          padding: '1px 4px', borderRadius: 2,
          color: sent.color, background: sent.bg,
          fontFamily: T.font, marginLeft: 2,
        }}>
          {sent.label}
        </span>
        {fresh && (
          <span style={{
            fontSize: 7, fontWeight: 700, letterSpacing: '0.04em',
            padding: '1px 4px', borderRadius: 2,
            color: '#FFB300', background: 'rgba(255,179,0,0.12)', fontFamily: T.font,
          }}>
            NEW
          </span>
        )}
        {item.summary && (
          <span style={{ marginLeft: 'auto', color: T.text3, display: 'flex', alignItems: 'center' }}>
            {expanded ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
          </span>
        )}
      </div>

      {/* Title */}
      <div style={{ fontSize: 10, fontWeight: 500, color: T.text1, fontFamily: T.font, lineHeight: 1.4 }}>
        {item.title}
      </div>

      {/* Expanded summary */}
      {expanded && item.summary && (
        <div style={{
          fontSize: 9, color: T.text2, fontFamily: T.font, lineHeight: 1.5,
          marginTop: 5, paddingTop: 5, borderTop: `1px solid ${T.border}`,
        }}>
          {item.summary}
          {item.url && (
            <span
              onClick={e => { e.stopPropagation(); window.open(item.url!, '_blank', 'noopener,noreferrer'); }}
              style={{ color: T.accent, marginLeft: 6, cursor: 'pointer', textDecoration: 'underline' }}
            >
              Read more ↗
            </span>
          )}
        </div>
      )}

      {/* Tags */}
      <div style={{ display: 'flex', gap: 3, marginTop: 4 }}>
        {item.tags.map(tag => (
          <span key={tag} style={{
            fontSize: 8, fontWeight: 600, padding: '1px 4px', borderRadius: 2,
            background: T.surfaceAlt, color: T.text3, letterSpacing: '0.04em', fontFamily: T.font,
          }}>
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Calendar row ────────────────────────────────────────────────────────────

function CalRow({ evt }: { evt: CalendarEvent }) {
  const hasData = evt.actual || evt.forecast || evt.previous;
  return (
    <div
      style={{ padding: '6px 10px', margin: '0 4px 1px', borderRadius: 3 }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = T.panelHover; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <span style={{ fontSize: 9, fontFamily: T.mono, color: T.text3, fontVariantNumeric: 'tabular-nums', width: 32, flexShrink: 0 }}>
          {evt.time}
        </span>
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: impColor(evt.impact), flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 500, color: T.text1, fontFamily: T.font, lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{evt.event}</div>
          <div style={{ fontSize: 8, color: T.text3, fontFamily: T.font, marginTop: 1 }}>{evt.currency} · {evt.day}</div>
        </div>
      </div>
      {hasData && (
        <div style={{ display: 'flex', gap: 8, marginTop: 4, paddingLeft: 44 }}>
          {evt.actual   && <span style={{ fontSize: 8, fontFamily: T.mono, color: '#26A69A' }}>A: {evt.actual}</span>}
          {evt.forecast && <span style={{ fontSize: 8, fontFamily: T.mono, color: T.text3 }}>F: {evt.forecast}</span>}
          {evt.previous && <span style={{ fontSize: 8, fontFamily: T.mono, color: T.text3 }}>P: {evt.previous}</span>}
        </div>
      )}
    </div>
  );
}

// ─── Main panel ──────────────────────────────────────────────────────────────

export function NewsPanel() {
  const { state } = useWorkspace();
  const [tab, setTab]             = useState<'news' | 'calendar'>('news');
  const [filter, setFilter]       = useState<'all' | 'high' | 'medium'>('all');
  const [symbolMode, setSymbolMode] = useState(false);
  const [news, setNews]           = useState<NewsItem[]>([]);
  const [calendar, setCalendar]   = useState<CalendarEvent[]>([]);
  const [loading, setLoading]       = useState(false);
  const [dataSource, setDataSource] = useState<'mock' | 'alphavantage' | null>(null);
  const [calSource, setCalSource]   = useState<'twelvedata' | 'fallback' | null>(null);
  const [countdown, setCountdown]   = useState(REFRESH_INTERVAL);
  const countdownRef                = useRef(REFRESH_INTERVAL);
  const timerRef                    = useRef<ReturnType<typeof setInterval> | null>(null);
  const calTimerRef                 = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch news
  const fetchNews = useCallback(async () => {
    setLoading(true);
    countdownRef.current = REFRESH_INTERVAL;
    setCountdown(REFRESH_INTERVAL);
    try {
      const mode = symbolMode ? 'symbol' : 'market';
      const res = await fetch(`/api/news?symbol=${encodeURIComponent(state.symbol)}&mode=${mode}&limit=20`);
      if (res.ok) {
        const data = await res.json();
        setNews(data.items ?? []);
        setDataSource(data.source ?? 'mock');
      }
    } catch { /* retain existing */ }
    finally { setLoading(false); }
  }, [state.symbol, symbolMode]);

  // Fetch calendar with 30-minute auto-refresh
  const fetchCalendar = useCallback(async () => {
    try {
      const res = await fetch('/api/news?type=calendar');
      if (res.ok) {
        const data = await res.json();
        setCalendar(data.events ?? []);
        setCalSource(data.source ?? 'fallback');
      }
    } catch { /* noop */ }
  }, []);

  // Auto-refresh countdown (news)
  useEffect(() => {
    fetchNews();
    fetchCalendar();
  }, [state.symbol, symbolMode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    timerRef.current = setInterval(() => {
      countdownRef.current -= 1;
      setCountdown(countdownRef.current);
      if (countdownRef.current <= 0) fetchNews();
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [fetchNews]);

  // Calendar auto-refresh every 30 minutes
  useEffect(() => {
    calTimerRef.current = setInterval(fetchCalendar, 30 * 60 * 1000);
    return () => { if (calTimerRef.current) clearInterval(calTimerRef.current); };
  }, [fetchCalendar]);

  const visibleNews = news.filter(n => filter === 'all' || n.importance === filter);
  const visibleCal  = calendar.filter(e => filter === 'all' || e.impact === filter);

  // Countdown ring (arc progress)
  const pct = countdown / REFRESH_INTERVAL;
  const r = 7, circ = 2 * Math.PI * r;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* ── Tab / toolbar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 0, padding: '4px 6px',
        borderBottom: `1px solid ${T.border}`, flexShrink: 0,
      }}>
        {(['news', 'calendar'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '0 8px', height: 24, borderRadius: 3,
              border: 'none', outline: 'none',
              background: tab === t ? T.accentBg : 'transparent',
              color: tab === t ? T.accent : T.text3,
              fontSize: 10, fontWeight: tab === t ? 600 : 400,
              fontFamily: T.font, cursor: 'pointer',
            }}
          >
            {t === 'news' ? <Newspaper size={11} /> : <Clock size={11} />}
            {t === 'news' ? 'Headlines' : 'Calendar'}
          </button>
        ))}

        <div style={{ flex: 1 }} />

        {/* Symbol filter toggle */}
        {tab === 'news' && (
          <button
            onClick={() => setSymbolMode(m => !m)}
            title={symbolMode ? 'Market-wide news' : `News for ${state.symbol}`}
            style={{
              fontSize: 8, fontWeight: 600, padding: '2px 5px', borderRadius: 3,
              border: `1px solid ${symbolMode ? T.accent : T.border}`,
              background: symbolMode ? T.accentBg : 'transparent',
              color: symbolMode ? T.accent : T.text3,
              fontFamily: T.font, cursor: 'pointer', outline: 'none', marginRight: 4,
            }}
          >
            {state.symbol}
          </button>
        )}

        {/* Source badge */}
        {tab === 'news' && dataSource && (
          <span style={{
            fontSize: 7, fontWeight: 700, letterSpacing: '0.05em',
            padding: '2px 4px', borderRadius: 2, marginRight: 4,
            color: dataSource === 'alphavantage' ? '#26A69A' : T.text3,
            background: dataSource === 'alphavantage' ? 'rgba(38,166,154,0.1)' : T.surfaceAlt,
            fontFamily: T.font,
          }}>
            {dataSource === 'alphavantage' ? 'LIVE' : 'DEMO'}
          </span>
        )}
        {tab === 'calendar' && calSource && (
          <span style={{
            fontSize: 7, fontWeight: 700, letterSpacing: '0.05em',
            padding: '2px 4px', borderRadius: 2, marginRight: 4,
            color: calSource === 'twelvedata' ? '#26A69A' : T.text3,
            background: calSource === 'twelvedata' ? 'rgba(38,166,154,0.1)' : T.surfaceAlt,
            fontFamily: T.font,
          }}>
            {calSource === 'twelvedata' ? 'LIVE' : 'STATIC'}
          </span>
        )}

        {/* Refresh with countdown ring */}
        {tab === 'news' && (
          <button
            onClick={fetchNews}
            disabled={loading}
            title={`Refresh (${countdown}s)`}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 20, height: 20, borderRadius: 3,
              border: `1px solid ${T.border}`, background: 'transparent',
              color: T.text3, cursor: 'pointer', outline: 'none',
              opacity: loading ? 0.5 : 1, marginRight: 4, position: 'relative',
            }}
          >
            {loading
              ? <RefreshCw size={9} style={{ animation: 'spin 1s linear infinite' }} />
              : (
                <svg width={16} height={16} viewBox="0 0 16 16">
                  <circle cx={8} cy={8} r={r} fill="none" stroke={T.border} strokeWidth={1.5} />
                  <circle
                    cx={8} cy={8} r={r}
                    fill="none" stroke={T.accent} strokeWidth={1.5}
                    strokeDasharray={`${circ * pct} ${circ * (1 - pct)}`}
                    strokeLinecap="round"
                    transform="rotate(-90 8 8)"
                  />
                </svg>
              )
            }
          </button>
        )}

        {/* Impact filter */}
        <select
          value={filter}
          onChange={e => setFilter(e.target.value as typeof filter)}
          style={{
            height: 20, fontSize: 9, borderRadius: 3,
            border: `1px solid ${T.border}`, background: T.surfaceAlt,
            color: T.text2, fontFamily: T.font, outline: 'none', padding: '0 4px',
          }}
        >
          <option value="all">All</option>
          <option value="high">High</option>
          <option value="medium">Med</option>
        </select>
      </div>

      {/* ── Content ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {tab === 'news' ? (
          loading && news.length === 0 ? (
            <>
              <SkeletonRow /><SkeletonRow /><SkeletonRow /><SkeletonRow /><SkeletonRow />
            </>
          ) : visibleNews.length === 0 ? (
            <div style={{ padding: '20px 10px', textAlign: 'center', fontSize: 10, color: T.text3, fontFamily: T.font }}>
              No headlines match filter
            </div>
          ) : (
            visibleNews.map(item => <NewsRow key={item.id} item={item} />)
          )
        ) : (
          visibleCal.length === 0 ? (
            <div style={{ padding: '20px 10px', textAlign: 'center', fontSize: 10, color: T.text3, fontFamily: T.font }}>
              No events match filter
            </div>
          ) : (
            visibleCal.map((evt, i) => <CalRow key={i} evt={evt} />)
          )
        )}
      </div>
    </div>
  );
}
