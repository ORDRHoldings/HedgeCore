'use client';
import React, { useState } from 'react';
import { Search, Check, Eye, EyeOff, Lock, X, Star } from 'lucide-react';
import { T } from '../tokens';
import { useWorkspace } from '../WorkspaceProvider';
import { INDICATOR_LIBRARY, INDICATOR_CATEGORIES } from '../workspace-data';

export function IndicatorsPanel() {
  const { state, dispatch } = useWorkspace();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [favIds, setFavIds] = useState<Set<string>>(new Set(['rsi', 'ema20', 'macd']));

  const activeIds = new Set(state.indicators.map(i => i.id));

  const filtered = INDICATOR_LIBRARY.filter(ind => {
    if (category !== 'all' && ind.category !== category) return false;
    if (search && !ind.name.toLowerCase().includes(search.toLowerCase()) && !ind.shortName.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

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
            placeholder="Search indicators..."
            style={{
              flex: 1, border: 'none', outline: 'none', background: 'transparent',
              fontSize: 11, color: T.text1, fontFamily: T.font,
            }}
          />
        </div>
      </div>

      {/* Category tabs */}
      <div style={{ display: 'flex', gap: 0, padding: '0 6px 4px', flexWrap: 'wrap', flexShrink: 0 }}>
        {INDICATOR_CATEGORIES.map(cat => (
          <button
            key={cat.id}
            onClick={() => setCategory(cat.id)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 3,
              padding: '0 6px', height: 20, borderRadius: 3, border: 'none', outline: 'none',
              background: category === cat.id ? T.accentBg : 'transparent',
              color: category === cat.id ? T.accent : T.text3,
              fontSize: 9, fontWeight: category === cat.id ? 600 : 400,
              fontFamily: T.font, cursor: 'pointer',
            }}
          >
            {cat.name}
            <span style={{ fontSize: 8, opacity: 0.7 }}>{cat.count}</span>
          </button>
        ))}
      </div>

      {/* Active indicators */}
      {state.indicators.length > 0 && (
        <div style={{ padding: '4px 8px', borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: T.text3, letterSpacing: '0.06em', marginBottom: 3, fontFamily: T.font }}>
            ACTIVE ({state.indicators.length})
          </div>
          {state.indicators.map(ind => (
            <div key={ind.id} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '3px 4px', borderRadius: 3, marginBottom: 1,
            }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: ind.color, flexShrink: 0 }} />
              <span style={{ fontSize: 10, fontWeight: 500, color: T.text1, fontFamily: T.font, flex: 1 }}>
                {ind.name}{ind.params ? ` (${ind.params})` : ''}
              </span>
              <button
                onClick={() => dispatch({ type: 'TOGGLE_INDICATOR_VISIBILITY', id: ind.id })}
                style={{ display: 'flex', alignItems: 'center', border: 'none', background: 'none', cursor: 'pointer', padding: 0, outline: 'none', color: ind.visible ? T.text2 : T.text3 }}
              >
                {ind.visible ? <Eye size={10} /> : <EyeOff size={10} />}
              </button>
              <button
                onClick={() => dispatch({ type: 'REMOVE_INDICATOR', id: ind.id })}
                style={{ display: 'flex', alignItems: 'center', border: 'none', background: 'none', cursor: 'pointer', padding: 0, outline: 'none', color: T.text3 }}
                onMouseEnter={e => { e.currentTarget.style.color = T.bear; }}
                onMouseLeave={e => { e.currentTarget.style.color = T.text3; }}
              >
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Available indicators */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '2px 0' }}>
        {filtered.map(ind => {
          const added = activeIds.has(ind.id);
          const isFav = favIds.has(ind.id);
          return (
            <div
              key={ind.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '5px 8px', cursor: 'pointer',
                background: added ? T.panelActive : 'transparent',
                margin: '0 4px', borderRadius: 3, marginBottom: 1,
              }}
              onClick={() => {
                if (added) dispatch({ type: 'REMOVE_INDICATOR', id: ind.id });
                else dispatch({ type: 'ADD_INDICATOR', indicator: { id: ind.id, name: ind.shortName, params: ind.defaultParams, color: ind.color, pane: ind.pane } });
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = added ? T.panelActive : T.panelHover; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = added ? T.panelActive : 'transparent'; }}
            >
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: ind.color, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 10, fontWeight: 500, color: T.text1, fontFamily: T.font }}>{ind.name}</div>
                <div style={{ fontSize: 9, color: T.text3, fontFamily: T.font }}>{ind.shortName}{ind.defaultParams ? ` · ${ind.defaultParams}` : ''}</div>
              </div>
              <button
                onClick={e => { e.stopPropagation(); setFavIds(prev => { const n = new Set(prev); if (n.has(ind.id)) n.delete(ind.id); else n.add(ind.id); return n; }); }}
                style={{ display: 'flex', alignItems: 'center', border: 'none', background: 'none', cursor: 'pointer', padding: 0, outline: 'none' }}
              >
                <Star size={10} color={isFav ? '#FFD700' : T.text3} fill={isFav ? '#FFD700' : 'none'} />
              </button>
              {added && <Check size={10} color={T.accent} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
