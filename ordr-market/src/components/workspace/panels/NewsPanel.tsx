'use client';
import React, { useState } from 'react';
import { Newspaper, Clock, AlertTriangle, TrendingUp, Globe, Filter } from 'lucide-react';
import { T } from '../tokens';

const MOCK_NEWS = [
  { id: 1, time: '09:32', importance: 'high' as const,   title: 'Fed Chair Powell testimony begins at 10:00 EST',     source: 'Reuters', tags: ['USD', 'RATES'] },
  { id: 2, time: '08:45', importance: 'high' as const,   title: 'ECB rate decision: no change, hawkish bias maintained', source: 'Bloomberg', tags: ['EUR', 'RATES'] },
  { id: 3, time: '08:12', importance: 'medium' as const, title: 'UK CPI comes in above expectations at 4.2% YoY',    source: 'ONS', tags: ['GBP', 'INFLATION'] },
  { id: 4, time: '07:30', importance: 'low' as const,    title: 'Japan machinery orders decline 3.2% in February',   source: 'MoF', tags: ['JPY'] },
  { id: 5, time: '06:00', importance: 'medium' as const, title: 'Gold rallies on safe-haven demand amid geopolitical tensions', source: 'Kitco', tags: ['XAU', 'RISK'] },
  { id: 6, time: '04:15', importance: 'low' as const,    title: 'Bitcoin ETF inflows reach $340M for third consecutive day', source: 'CoinDesk', tags: ['BTC', 'ETF'] },
];

const CALENDAR_EVENTS = [
  { time: '10:00', event: 'Fed Chair Powell Testimony', impact: 'high' as const, currency: 'USD' },
  { time: '12:30', event: 'US Initial Jobless Claims', impact: 'medium' as const, currency: 'USD' },
  { time: '14:00', event: 'US Existing Home Sales', impact: 'low' as const, currency: 'USD' },
  { time: '15:30', event: 'EIA Crude Oil Inventories', impact: 'medium' as const, currency: 'USD' },
];

export function NewsPanel() {
  const [tab, setTab] = useState<'news' | 'calendar'>('news');
  const [filter, setFilter] = useState<'all' | 'high' | 'medium'>('all');

  const impColor = (imp: string) => imp === 'high' ? T.danger : imp === 'medium' ? T.warn : T.text3;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Tab bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 0, padding: '4px 8px',
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
          <option value="medium">Medium</option>
        </select>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {tab === 'news' ? (
          MOCK_NEWS
            .filter(n => filter === 'all' || n.importance === filter)
            .map(news => (
              <div
                key={news.id}
                style={{
                  padding: '6px 10px', margin: '0 4px', borderRadius: 3, marginBottom: 1,
                  cursor: 'pointer',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = T.panelHover; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: impColor(news.importance), flexShrink: 0 }} />
                  <span style={{ fontSize: 9, color: T.text3, fontFamily: T.mono }}>{news.time}</span>
                  <span style={{ fontSize: 9, color: T.text3, fontFamily: T.font }}>{news.source}</span>
                </div>
                <div style={{ fontSize: 10, fontWeight: 500, color: T.text1, fontFamily: T.font, lineHeight: 1.4 }}>
                  {news.title}
                </div>
                <div style={{ display: 'flex', gap: 3, marginTop: 3 }}>
                  {news.tags.map(tag => (
                    <span key={tag} style={{
                      fontSize: 8, fontWeight: 600, padding: '1px 4px',
                      borderRadius: 2, background: T.surfaceAlt,
                      color: T.text3, letterSpacing: '0.04em',
                    }}>
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            ))
        ) : (
          CALENDAR_EVENTS
            .filter(e => filter === 'all' || e.impact === filter)
            .map((evt, i) => (
              <div
                key={i}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '7px 10px', margin: '0 4px', borderRadius: 3, marginBottom: 1,
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = T.panelHover; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <span style={{ fontSize: 10, fontFamily: T.mono, color: T.text3, fontVariantNumeric: 'tabular-nums', width: 36 }}>{evt.time}</span>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: impColor(evt.impact), flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, fontWeight: 500, color: T.text1, fontFamily: T.font }}>{evt.event}</div>
                  <div style={{ fontSize: 9, color: T.text3 }}>{evt.currency}</div>
                </div>
              </div>
            ))
        )}
      </div>
    </div>
  );
}
