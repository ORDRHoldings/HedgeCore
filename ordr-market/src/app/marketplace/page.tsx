'use client';
/**
 * ORDR Market — Strategy Marketplace
 * Browse, subscribe, purchase, and publish trading strategies.
 */
import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUser, spendCredits } from '@/lib/auth';
import {
  MARKETPLACE_STRATEGIES,
  isSubscribed, subscribe, unsubscribe,
} from '@/lib/strategy/store';
import type { StrategyMeta } from '@/lib/strategy/types';

const F = "'Inter',-apple-system,sans-serif";
const M = "'JetBrains Mono','Fira Code',monospace";

// ── Design tokens ──────────────────────────────────────────────────────────────
const T = {
  bg:      'var(--bg-deep, #F0F3FA)',
  surface: 'var(--bg-panel, #FFFFFF)',
  panel:   'var(--bg-sub, #FAFBFE)',
  border:  'var(--border-rim, #E0E3EB)',
  text1:   'var(--text-primary, #131722)',
  text2:   'var(--text-secondary, #787B86)',
  text3:   'var(--text-tertiary, #B2B5BE)',
  accent:  'var(--accent-blue, #2962FF)',
  bull:    'var(--accent-green, #1565C0)',
  bear:    'var(--accent-red, #C62828)',
  bullBg:  'rgba(21,101,192,0.08)',
  bearBg:  'rgba(198,40,40,0.08)',
  accentBg:'var(--accent-blue-dim, rgba(41,98,255,0.08))',
} as const;

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmt(n: number, decimals = 1) {
  return n.toFixed(decimals);
}
function fmtPct(n: number) {
  const sign = n >= 0 ? '+' : '';
  return `${sign}${fmt(n)}%`;
}
function langLabel(lang: string) {
  return { javascript: 'JS', pinescript: 'Pine', python: 'Py' }[lang] ?? lang;
}
function langColor(lang: string) {
  return { javascript: '#F0DB4F', pinescript: '#1E88E5', python: '#306998' }[lang] ?? T.text2;
}

// ── Metric chip ───────────────────────────────────────────────────────────────
function Chip({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  const color = positive === undefined ? T.text2
    : positive ? T.bull : T.bear;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <span style={{ fontSize: 10, color: T.text3, fontFamily: F, fontWeight: 600, letterSpacing: '0.05em' }}>
        {label}
      </span>
      <span style={{ fontSize: 13, color, fontFamily: M, fontWeight: 700 }}>
        {value}
      </span>
    </div>
  );
}

// ── Price badge ────────────────────────────────────────────────────────────────
function PriceBadge({ strategy }: { strategy: StrategyMeta }) {
  if (strategy.priceMonthly === 0 && strategy.price === 0) {
    return (
      <span style={{
        padding: '3px 8px', borderRadius: 4, background: 'rgba(38,166,154,0.12)',
        color: '#1B8B7B', fontSize: 11, fontFamily: F, fontWeight: 700, letterSpacing: '0.04em',
      }}>
        FREE
      </span>
    );
  }
  if (strategy.price > 0) {
    return (
      <span style={{
        padding: '3px 8px', borderRadius: 4, background: T.accentBg,
        color: T.accent, fontSize: 11, fontFamily: M, fontWeight: 700,
      }}>
        {strategy.price.toLocaleString()} cr
      </span>
    );
  }
  return (
    <span style={{
      padding: '3px 8px', borderRadius: 4, background: 'rgba(156,39,176,0.1)',
      color: '#7B1FA2', fontSize: 11, fontFamily: M, fontWeight: 700,
    }}>
      {strategy.priceMonthly.toLocaleString()} cr/mo
    </span>
  );
}

// ── Strategy card ─────────────────────────────────────────────────────────────
function StrategyCard({
  strategy,
  onAction,
  subscribedIds,
  userCredits,
}: {
  strategy: StrategyMeta;
  onAction: (s: StrategyMeta, action: 'subscribe' | 'unsubscribe' | 'buy' | 'view') => void;
  subscribedIds: Set<string>;
  userCredits: number;
}) {
  const m = strategy.lastBacktest;
  const subbed = subscribedIds.has(strategy.id);
  const isFree = strategy.priceMonthly === 0 && strategy.price === 0;
  const hasMonthly = strategy.priceMonthly > 0;

  const actionLabel = subbed ? 'Unsubscribe'
    : isFree ? 'Subscribe Free'
    : hasMonthly ? `Subscribe · ${strategy.priceMonthly.toLocaleString()} cr/mo`
    : `Buy · ${strategy.price.toLocaleString()} cr`;

  const canAfford = isFree || subbed || (
    hasMonthly ? userCredits >= strategy.priceMonthly : userCredits >= strategy.price
  );

  return (
    <div style={{
      background: T.surface, borderRadius: 10, border: `1px solid ${T.border}`,
      padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14,
      transition: 'box-shadow 0.15s, border-color 0.15s',
      cursor: 'default',
    }}
    onMouseEnter={e => {
      (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 20px rgba(0,0,0,0.09)';
      (e.currentTarget as HTMLDivElement).style.borderColor = '#C8CDD8';
    }}
    onMouseLeave={e => {
      (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
      (e.currentTarget as HTMLDivElement).style.borderColor = T.border;
    }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: M, fontSize: 14, fontWeight: 700, color: T.text1 }}>
              {strategy.name}
            </span>
            <span style={{
              padding: '2px 6px', borderRadius: 3, fontSize: 10, fontFamily: M, fontWeight: 700,
              background: langColor(strategy.language) + '22', color: langColor(strategy.language),
            }}>
              {langLabel(strategy.language)}
            </span>
            {subbed && (
              <span style={{
                padding: '2px 6px', borderRadius: 3, fontSize: 10, fontFamily: F, fontWeight: 700,
                background: 'rgba(38,166,154,0.12)', color: '#1B8B7B',
              }}>
                ✓ SUBSCRIBED
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: T.text2, fontFamily: F, marginTop: 4, lineHeight: 1.5 }}>
            {strategy.description}
          </div>
        </div>
        <PriceBadge strategy={strategy} />
      </div>

      {/* Metrics row */}
      {m && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10,
          background: T.panel, borderRadius: 6, padding: '10px 12px',
          border: `1px solid ${T.border}`,
        }}>
          <Chip label="RETURN" value={fmtPct(m.totalReturn)} positive={m.totalReturn >= 0} />
          <Chip label="ANN RETURN" value={fmtPct(m.annualReturn)} positive={m.annualReturn >= 0} />
          <Chip label="MAX DD" value={fmtPct(m.maxDrawdown)} positive={false} />
          <Chip label="SHARPE" value={fmt(m.sharpe)} positive={m.sharpe >= 1} />
          <Chip label="WIN RATE" value={`${fmt(m.winRate)}%`} positive={m.winRate >= 50} />
          <Chip label="TRADES" value={String(m.totalTrades)} />
        </div>
      )}

      {/* Footer row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 11, color: T.text3, fontFamily: F }}>
          by <span style={{ color: T.text2, fontWeight: 600 }}>{strategy.authorName}</span>
        </span>
        <span style={{ width: 3, height: 3, borderRadius: '50%', background: T.border, flexShrink: 0 }} />
        <span style={{ fontSize: 11, color: T.text3, fontFamily: F }}>
          {strategy.subscribers.toLocaleString()} subscribers
        </span>
        <div style={{ flex: 1 }} />
        {strategy.tags.slice(0, 3).map(tag => (
          <span key={tag} style={{
            padding: '2px 7px', borderRadius: 3, fontSize: 10,
            background: T.panel, border: `1px solid ${T.border}`,
            color: T.text2, fontFamily: F, fontWeight: 500,
          }}>
            {tag}
          </span>
        ))}
        <button
          onClick={() => onAction(strategy, subbed ? 'unsubscribe' : (isFree ? 'subscribe' : (hasMonthly ? 'subscribe' : 'buy')))}
          disabled={!canAfford && !subbed}
          style={{
            padding: '7px 14px', borderRadius: 6, fontFamily: F, fontSize: 12, fontWeight: 700,
            cursor: (!canAfford && !subbed) ? 'not-allowed' : 'pointer',
            background: subbed ? T.panel : (canAfford ? T.accent : '#E0E3EB'),
            color: subbed ? T.text2 : (canAfford ? '#FFFFFF' : T.text3),
            border: subbed ? `1px solid ${T.border}` : 'none',
            transition: 'all 0.15s', flexShrink: 0,
          }}
        >
          {actionLabel}
        </button>
      </div>
    </div>
  );
}

// ── Filter bar ─────────────────────────────────────────────────────────────────
type Filter = 'all' | 'free' | 'premium' | 'popular' | 'topreturn';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all',       label: 'All Strategies' },
  { id: 'free',      label: 'Free'           },
  { id: 'premium',   label: 'Premium'        },
  { id: 'popular',   label: 'Most Popular'   },
  { id: 'topreturn', label: 'Top Return'     },
];

// ── Toast notification ────────────────────────────────────────────────────────
function Toast({ msg, ok }: { msg: string; ok: boolean }) {
  return (
    <div style={{
      position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
      background: ok ? '#1B5E20' : '#B71C1C', color: '#FFFFFF',
      padding: '10px 20px', borderRadius: 8, fontFamily: F, fontSize: 13, fontWeight: 600,
      boxShadow: '0 4px 20px rgba(0,0,0,0.25)', zIndex: 9999, pointerEvents: 'none',
      whiteSpace: 'nowrap',
    }}>
      {msg}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function MarketplacePage() {
  const router = useRouter();
  const user = getCurrentUser();

  const [filter, setFilter]     = useState<Filter>('all');
  const [search, setSearch]     = useState('');
  const [toast, setToast]       = useState<{ msg: string; ok: boolean } | null>(null);
  const [credits, setCredits]   = useState(user?.credits ?? 0);
  const [subscribedIds, setSubscribedIds] = useState<Set<string>>(() => {
    const set = new Set<string>();
    MARKETPLACE_STRATEGIES.forEach(s => { if (isSubscribed(s.id)) set.add(s.id); });
    return set;
  });

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 2800);
  };

  const filtered = useMemo(() => {
    let list = [...MARKETPLACE_STRATEGIES];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.tags.some(t => t.includes(q)) ||
        s.authorName.toLowerCase().includes(q)
      );
    }
    switch (filter) {
      case 'free':      list = list.filter(s => s.priceMonthly === 0 && s.price === 0); break;
      case 'premium':   list = list.filter(s => s.priceMonthly > 0 || s.price > 0);    break;
      case 'popular':   list = list.sort((a, b) => b.subscribers - a.subscribers);      break;
      case 'topreturn': list = list.sort((a, b) =>
        (b.lastBacktest?.totalReturn ?? 0) - (a.lastBacktest?.totalReturn ?? 0));       break;
    }
    return list;
  }, [filter, search]);

  const handleAction = (strategy: StrategyMeta, action: 'subscribe' | 'unsubscribe' | 'buy' | 'view') => {
    if (!user) { router.push('/login'); return; }

    if (action === 'unsubscribe') {
      unsubscribe(strategy.id);
      setSubscribedIds(prev => { const n = new Set(prev); n.delete(strategy.id); return n; });
      showToast(`Unsubscribed from ${strategy.name}`, true);
      return;
    }

    const isFree    = strategy.priceMonthly === 0 && strategy.price === 0;
    const cost      = action === 'buy' ? strategy.price : strategy.priceMonthly;

    if (!isFree) {
      const ok = spendCredits(user.id, cost);
      if (!ok) {
        showToast(`Insufficient credits — need ${cost.toLocaleString()} cr`, false);
        return;
      }
      setCredits(c => c - cost);
    }

    subscribe(strategy.id);
    setSubscribedIds(prev => new Set([...prev, strategy.id]));
    showToast(
      isFree ? `Subscribed to ${strategy.name}` : `Subscribed — ${cost.toLocaleString()} credits spent`,
      true,
    );
  };

  return (
    <div style={{ minHeight: '100vh', background: T.bg, fontFamily: F }}>
      {/* Background grid */}
      <div style={{
        position: 'fixed', inset: 0, opacity: 0.025, pointerEvents: 'none',
        backgroundImage: 'linear-gradient(#131722 1px,transparent 1px),linear-gradient(90deg,#131722 1px,transparent 1px)',
        backgroundSize: '40px 40px',
      }} />

      {/* Top bar */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(8px)',
        borderBottom: `1px solid ${T.border}`,
        display: 'flex', alignItems: 'center', gap: 16, padding: '0 24px', height: 52,
      }}>
        {/* Logo */}
        <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
          <div style={{
            width: 30, height: 30, borderRadius: 7, background: T.text1,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ color: '#FFF', fontFamily: M, fontSize: 12, fontWeight: 700 }}>O</span>
          </div>
          <span style={{ fontFamily: M, fontSize: 16, fontWeight: 700, color: T.text1, letterSpacing: '0.06em' }}>ORDR</span>
        </a>

        <div style={{ width: 1, height: 20, background: T.border }} />

        <span style={{ fontFamily: F, fontSize: 13, fontWeight: 700, color: T.text1 }}>
          Strategy Marketplace
        </span>

        <div style={{ flex: 1 }} />

        {/* Nav links */}
        <a href="/" style={{ fontSize: 12, color: T.text2, fontFamily: F, textDecoration: 'none', fontWeight: 500 }}>Chart</a>
        <a href="/strategy" style={{ fontSize: 12, color: T.text2, fontFamily: F, textDecoration: 'none', fontWeight: 500 }}>Strategy Lab</a>

        {/* Credits + user */}
        {user ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              padding: '5px 10px', borderRadius: 6, background: T.accentBg,
              border: `1px solid rgba(41,98,255,0.15)`,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span style={{ fontSize: 11, color: T.accent, fontFamily: M, fontWeight: 700 }}>
                {credits.toLocaleString()} cr
              </span>
            </div>
            <div style={{
              width: 30, height: 30, borderRadius: '50%', background: T.accent,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ color: '#FFF', fontSize: 12, fontFamily: F, fontWeight: 700 }}>
                {user.username?.charAt(0).toUpperCase() ?? 'U'}
              </span>
            </div>
          </div>
        ) : (
          <a href="/login" style={{
            padding: '6px 14px', borderRadius: 6, background: T.accent,
            color: '#FFF', fontSize: 12, fontFamily: F, fontWeight: 700,
            textDecoration: 'none',
          }}>Sign In</a>
        )}
      </div>

      {/* Hero strip */}
      <div style={{
        background: T.text1, padding: '40px 24px 36px',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', inset: 0, opacity: 0.06,
          backgroundImage: 'radial-gradient(circle at 30% 50%, #2962FF 0%, transparent 60%), radial-gradient(circle at 70% 50%, #1565C0 0%, transparent 60%)',
        }} />
        <div style={{ maxWidth: 960, margin: '0 auto', position: 'relative' }}>
          <div style={{ fontSize: 11, fontFamily: M, color: '#4A90D9', fontWeight: 700,
            letterSpacing: '0.1em', marginBottom: 10 }}>
            ORDR MARKET · STRATEGY ECOSYSTEM
          </div>
          <h1 style={{ fontFamily: M, fontSize: 28, fontWeight: 700, color: '#FFFFFF',
            margin: '0 0 8px', letterSpacing: '0.02em' }}>
            Algorithmic Trading Strategies
          </h1>
          <p style={{ fontFamily: F, fontSize: 14, color: '#9AA5C0', margin: 0, maxWidth: 560, lineHeight: 1.6 }}>
            Browse, subscribe to, and publish battle-tested trading strategies.
            Earn credits by publishing — spend them to unlock premium alpha.
          </p>

          <div style={{ display: 'flex', gap: 24, marginTop: 24 }}>
            {[
              { label: 'Strategies', value: MARKETPLACE_STRATEGIES.length.toString() },
              { label: 'Total Subscribers', value: MARKETPLACE_STRATEGIES.reduce((a,s) => a + s.subscribers, 0).toLocaleString() },
              { label: 'Avg Win Rate', value: `${fmt(MARKETPLACE_STRATEGIES.reduce((a,s) => a + (s.lastBacktest?.winRate ?? 0), 0) / MARKETPLACE_STRATEGIES.length)}%` },
              { label: 'Avg Sharpe', value: fmt(MARKETPLACE_STRATEGIES.reduce((a,s) => a + (s.lastBacktest?.sharpe ?? 0), 0) / MARKETPLACE_STRATEGIES.length) },
            ].map(stat => (
              <div key={stat.label}>
                <div style={{ fontFamily: M, fontSize: 20, fontWeight: 700, color: '#FFFFFF' }}>{stat.value}</div>
                <div style={{ fontFamily: F, fontSize: 11, color: '#6B7FA3', letterSpacing: '0.05em', marginTop: 2 }}>{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Filter + Search bar */}
      <div style={{
        background: T.surface, borderBottom: `1px solid ${T.border}`,
        padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <div style={{ maxWidth: 960, margin: '0 auto', width: '100%', display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Filter tabs */}
          <div style={{ display: 'flex', gap: 2, background: T.panel, borderRadius: 7, padding: 3, border: `1px solid ${T.border}` }}>
            {FILTERS.map(f => (
              <button key={f.id} onClick={() => setFilter(f.id)} style={{
                padding: '6px 12px', borderRadius: 5, border: 'none', fontFamily: F, fontSize: 12,
                fontWeight: filter === f.id ? 700 : 500,
                background: filter === f.id ? T.accent : 'transparent',
                color: filter === f.id ? '#FFFFFF' : T.text2,
                cursor: 'pointer', transition: 'all 0.15s',
              }}>
                {f.label}
              </button>
            ))}
          </div>

          <div style={{ flex: 1 }} />

          {/* Search */}
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              placeholder="Search strategies, tags, authors…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: 260, padding: '7px 12px 7px 32px',
                border: `1px solid ${T.border}`, borderRadius: 7,
                fontFamily: F, fontSize: 13, color: T.text1,
                background: T.panel, outline: 'none',
              }}
              onFocus={e => (e.target.style.borderColor = T.accent)}
              onBlur={e => (e.target.style.borderColor = T.border)}
            />
            <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }}
              width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.text2} strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
          </div>

          {/* Publish button */}
          <a href="/strategy" style={{
            padding: '7px 14px', borderRadius: 7, background: T.text1,
            color: '#FFF', fontSize: 12, fontFamily: F, fontWeight: 700,
            textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span>+ Publish Strategy</span>
          </a>
        </div>
      </div>

      {/* Strategy grid */}
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 24px 60px' }}>
        {filtered.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '80px 20px', color: T.text3,
            fontFamily: F, fontSize: 14,
          }}>
            No strategies match your search.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filtered.map(strategy => (
              <StrategyCard
                key={strategy.id}
                strategy={strategy}
                onAction={handleAction}
                subscribedIds={subscribedIds}
                userCredits={credits}
              />
            ))}
          </div>
        )}

        {/* Credit info footer */}
        <div style={{
          marginTop: 40, padding: '20px 24px', background: T.surface,
          borderRadius: 10, border: `1px solid ${T.border}`,
          display: 'flex', alignItems: 'center', gap: 20,
        }}>
          <div>
            <div style={{ fontFamily: M, fontSize: 13, fontWeight: 700, color: T.text1, marginBottom: 4 }}>
              How Credits Work
            </div>
            <div style={{ fontFamily: F, fontSize: 12, color: T.text2, lineHeight: 1.6 }}>
              Free strategies require 0 credits · Monthly subscriptions auto-renew · One-time purchases unlock forever ·
              Publish your own strategy to earn credits when others subscribe.
            </div>
          </div>
          {!user && (
            <a href="/login" style={{
              padding: '8px 16px', borderRadius: 6, background: T.accent, color: '#FFF',
              fontSize: 12, fontFamily: F, fontWeight: 700, textDecoration: 'none', flexShrink: 0,
            }}>
              Get Started Free →
            </a>
          )}
        </div>
      </div>

      {/* Toast */}
      {toast && <Toast msg={toast.msg} ok={toast.ok} />}
    </div>
  );
}
