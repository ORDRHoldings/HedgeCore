'use client';
import React, { useState } from 'react';
import { Search, Star, Plus, TrendingUp, TrendingDown } from 'lucide-react';
import { T } from '../tokens';
import { useWorkspace } from '../WorkspaceProvider';
import { DEFAULT_WATCHLIST, formatPrice } from '../workspace-data';

export function WatchlistPanel() {
  const { state, dispatch } = useWorkspace();
  const [search, setSearch] = useState('');
  const [favorites, setFavorites] = useState<Set<string>>(new Set(['EURUSD', 'XAUUSD']));

  const filtered = DEFAULT_WATCHLIST.filter(w =>
    !search || w.symbol.toLowerCase().includes(search.toLowerCase()) || w.name.toLowerCase().includes(search.toLowerCase())
  );

  const categories = [...new Set(filtered.map(w => w.category))];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Search */}
      <div style={{ padding: '6px 8px', flexShrink: 0 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '0 8px', height: 26, borderRadius: 3,
          background: T.surfaceAlt, border: `1px solid ${T.border}`,
        }}>
          <Search size={11} color={T.text3} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search symbols..."
            style={{
              flex: 1, border: 'none', outline: 'none', background: 'transparent',
              fontSize: 11, color: T.text1, fontFamily: T.font,
            }}
          />
          <button style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 18, height: 18, borderRadius: 3, border: 'none',
            background: T.accent, color: '#fff', cursor: 'pointer', outline: 'none',
          }} title="Add symbol">
            <Plus size={10} />
          </button>
        </div>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 2px' }}>
        {categories.map(cat => (
          <div key={cat}>
            <div style={{
              padding: '4px 8px', fontSize: 9, fontWeight: 700,
              color: T.text3, letterSpacing: '0.06em', fontFamily: T.font,
            }}>
              {cat.toUpperCase()}
            </div>
            {filtered.filter(w => w.category === cat).map(item => {
              const active = state.symbol === item.symbol;
              const bull = item.changePct >= 0;
              const isFav = favorites.has(item.symbol);
              return (
                <div
                  key={item.symbol}
                  onClick={() => dispatch({ type: 'SET_SYMBOL', symbol: item.symbol })}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '5px 8px', cursor: 'pointer', borderRadius: 3,
                    background: active ? T.selectedBg : 'transparent',
                    marginBottom: 1,
                  }}
                  onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = T.panelHover; }}
                  onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  <button
                    onClick={e => { e.stopPropagation(); setFavorites(prev => { const n = new Set(prev); if (n.has(item.symbol)) n.delete(item.symbol); else n.add(item.symbol); return n; }); }}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      width: 14, height: 14, border: 'none', background: 'transparent',
                      cursor: 'pointer', outline: 'none', padding: 0, flexShrink: 0,
                    }}
                  >
                    <Star size={10} color={isFav ? '#FFD700' : T.text3} fill={isFav ? '#FFD700' : 'none'} />
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: active ? 600 : 500, color: active ? T.accent : T.text1, fontFamily: T.font }}>{item.symbol}</div>
                    <div style={{ fontSize: 9, color: T.text3, fontFamily: T.font, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 500, color: T.text1, fontFamily: T.mono, fontVariantNumeric: 'tabular-nums' }}>
                      {formatPrice(item.price)}
                    </div>
                    <div style={{
                      fontSize: 9, fontWeight: 500, fontFamily: T.mono,
                      color: bull ? T.bull : T.bear,
                      display: 'flex', alignItems: 'center', gap: 2, justifyContent: 'flex-end',
                    }}>
                      {bull ? <TrendingUp size={8} /> : <TrendingDown size={8} />}
                      {bull ? '+' : ''}{item.changePct.toFixed(2)}%
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
