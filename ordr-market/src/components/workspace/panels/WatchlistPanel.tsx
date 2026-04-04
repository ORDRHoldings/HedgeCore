'use client';
/**
 * WatchlistPanel — multi-group watchlist with live prices, flash, sort, search.
 *
 * Groups:
 *   "All"      — read-only DEFAULT_WATCHLIST organized by category
 *   User groups — named lists stored in localStorage, fully editable
 *
 * Controls:
 *   Group tabs (horizontal scroll) + "+" to create / rename / delete groups
 *   Search, sort (SYMBOL / PRICE / CHANGE), price flash animation
 *   Add symbol to active group, remove symbol from group
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Search, Star, Plus, TrendingUp, TrendingDown, Loader, X, ArrowUpDown,
  MoreHorizontal, Edit2, Trash2, Check,
} from 'lucide-react';
import { T } from '../tokens';
import { useWorkspace } from '../WorkspaceProvider';
import { DEFAULT_WATCHLIST, formatPrice } from '../workspace-data';
import { usePublicChartData } from '@/hooks/usePublicChartData';

// ── Storage keys ───────────────────────────────────────────────────────────────
const WL_GROUPS_KEY   = 'ordr_wl_groups_v2';
const WL_ACTIVE_KEY   = 'ordr_wl_active_v2';
const FAVORITES_KEY   = 'ordr_wl_favorites';

// ── Types ──────────────────────────────────────────────────────────────────────
interface WatchlistGroup {
  id: string;
  name: string;
  symbols: string[];  // symbol keys added by user
}

type SortKey = 'default' | 'symbol' | 'price' | 'change';

// ── Default group factory ──────────────────────────────────────────────────────
function defaultGroups(): WatchlistGroup[] {
  return [{ id: 'main', name: 'My List', symbols: [] }];
}

function loadGroups(): WatchlistGroup[] {
  try {
    const raw = localStorage.getItem(WL_GROUPS_KEY);
    if (!raw) return defaultGroups();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : defaultGroups();
  } catch { return defaultGroups(); }
}

function loadActiveGroupId(groups: WatchlistGroup[]): string {
  try {
    const id = localStorage.getItem(WL_ACTIVE_KEY);
    if (id && (id === 'all' || groups.some(g => g.id === id))) return id;
  } catch { /* */ }
  return 'all';
}

// ── Live row with flash & sort data reporting ──────────────────────────────────
interface LiveRowProps {
  symbol: string;
  name: string;
  active: boolean;
  isFav: boolean;
  onSelect: () => void;
  onToggleFav?: (e: React.MouseEvent) => void;
  onRemove?: (e: React.MouseEvent) => void;
  onLiveData?: (sym: string, price: number | null, changePct: number | null) => void;
}

function LiveRow({ symbol, name, active, isFav, onSelect, onToggleFav, onRemove, onLiveData }: LiveRowProps) {
  const { bars, loading } = usePublicChartData(symbol, '1day', 2);

  const price     = bars.length > 0 ? bars[bars.length - 1].c : null;
  const prevClose = bars.length > 1 ? bars[bars.length - 2].c : null;
  const changePct = price !== null && prevClose ? ((price - prevClose) / prevClose) * 100 : null;
  const bull      = (changePct ?? 0) >= 0;

  // Report live data upward for sorting
  useEffect(() => {
    onLiveData?.(symbol, price, changePct);
  }, [price, changePct]); // eslint-disable-line react-hooks/exhaustive-deps

  // Flash animation
  const prevPriceRef = useRef<number | null>(null);
  const [flashColor, setFlashColor] = useState<string | null>(null);
  const flashTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (price === null) return;
    const prev = prevPriceRef.current;
    prevPriceRef.current = price;
    if (prev === null) return;
    const color = price > prev ? '#22c55e' : price < prev ? '#ef4444' : null;
    if (!color) return;
    setFlashColor(color);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlashColor(null), 600);
  }, [price]);

  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current); }, []);

  return (
    <div
      onClick={onSelect}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '5px 8px', cursor: 'pointer', borderRadius: 3,
        background: active ? T.selectedBg : flashColor ? `${flashColor}18` : 'transparent',
        marginBottom: 1,
        transition: flashColor ? 'none' : 'background 0.4s ease',
      }}
      onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = T.panelHover; }}
      onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = active ? T.selectedBg : 'transparent'; }}
    >
      {/* Star / Remove */}
      {onRemove ? (
        <button onClick={onRemove} style={iconBtnStyle} title="Remove from list">
          <X size={9} color={T.text3} />
        </button>
      ) : onToggleFav ? (
        <button onClick={onToggleFav} style={iconBtnStyle}>
          <Star size={10} color={isFav ? '#FFD700' : T.text3} fill={isFav ? '#FFD700' : 'none'} />
        </button>
      ) : (
        <div style={{ width: 14, flexShrink: 0 }} />
      )}

      {/* Symbol + name */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: active ? 600 : 500, color: active ? T.accent : T.text1, fontFamily: T.font }}>
          {symbol}
        </div>
        <div style={{ fontSize: 9, color: T.text3, fontFamily: T.font, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {name}
        </div>
      </div>

      {/* Price + change */}
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        {loading && price === null ? (
          <Loader size={10} color={T.text3} style={{ animation: 'spin 1s linear infinite' }} />
        ) : (
          <>
            <div style={{
              fontSize: 11, fontWeight: 500, fontFamily: T.mono, fontVariantNumeric: 'tabular-nums',
              color: flashColor ?? T.text1,
              transition: flashColor ? 'none' : 'color 0.4s ease',
            }}>
              {price !== null ? formatPrice(price, symbol) : '—'}
            </div>
            {changePct !== null && (
              <div style={{ fontSize: 9, fontWeight: 500, fontFamily: T.mono, color: bull ? T.bull : T.bear, display: 'flex', alignItems: 'center', gap: 2, justifyContent: 'flex-end' }}>
                {bull ? <TrendingUp size={8} /> : <TrendingDown size={8} />}
                {bull ? '+' : ''}{changePct.toFixed(2)}%
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const iconBtnStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: 14, height: 14, border: 'none', background: 'transparent',
  cursor: 'pointer', outline: 'none', padding: 0, flexShrink: 0,
};

// ── Sorted list section ────────────────────────────────────────────────────────
interface SortedListProps {
  label?: string;
  labelColor?: string;
  items: { symbol: string; name: string }[];
  sortKey: SortKey;
  sortAsc: boolean;
  activeSymbol: string;
  favorites: Set<string>;
  onSelect: (s: string) => void;
  onToggleFav: (s: string, e: React.MouseEvent) => void;
  onRemove?: (s: string, e: React.MouseEvent) => void;
}

function SortedList({ label, labelColor, items, sortKey, sortAsc, activeSymbol, favorites, onSelect, onToggleFav, onRemove }: SortedListProps) {
  const [liveData, setLiveData] = useState<Map<string, { price: number | null; changePct: number | null }>>(new Map);

  const updateLive = useCallback((sym: string, price: number | null, changePct: number | null) => {
    setLiveData(prev => { const n = new Map(prev); n.set(sym, { price, changePct }); return n; });
  }, []);

  const sorted = [...items].sort((a, b) => {
    if (sortKey === 'symbol') {
      const cmp = a.symbol.localeCompare(b.symbol);
      return sortAsc ? cmp : -cmp;
    }
    const ad = liveData.get(a.symbol);
    const bd = liveData.get(b.symbol);
    if (sortKey === 'price') {
      const va = ad?.price ?? -Infinity, vb = bd?.price ?? -Infinity;
      return sortAsc ? va - vb : vb - va;
    }
    if (sortKey === 'change') {
      const va = ad?.changePct ?? -Infinity, vb = bd?.changePct ?? -Infinity;
      return sortAsc ? va - vb : vb - va;
    }
    return 0;
  });

  if (sorted.length === 0) return null;

  return (
    <div>
      {label && (
        <div style={{ padding: '4px 8px', fontSize: 9, fontWeight: 700, color: labelColor ?? T.text3, letterSpacing: '0.06em', fontFamily: T.font }}>
          {label}
        </div>
      )}
      {sorted.map(item => (
        <LiveRow
          key={item.symbol}
          symbol={item.symbol}
          name={item.name}
          active={activeSymbol === item.symbol}
          isFav={favorites.has(item.symbol)}
          onSelect={() => onSelect(item.symbol)}
          onToggleFav={e => onToggleFav(item.symbol, e)}
          onRemove={onRemove ? (e => onRemove(item.symbol, e)) : undefined}
          onLiveData={updateLive}
        />
      ))}
    </div>
  );
}

// ── Main panel ─────────────────────────────────────────────────────────────────
export function WatchlistPanel() {
  const { state, dispatch } = useWorkspace();

  // ── Groups state ──
  const [groups, setGroups]           = useState<WatchlistGroup[]>(loadGroups);
  const [activeGroupId, setActiveGroupId] = useState<string>(() => loadActiveGroupId(loadGroups()));
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [menuGroupId, setMenuGroupId] = useState<string | null>(null);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');

  // ── Favorites ──
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? '[]');
      return new Set(Array.isArray(stored) ? stored : ['SPY', 'AAPL']);
    } catch { return new Set(['SPY', 'AAPL']); }
  });

  // ── Search / sort ──
  const [search, setSearch]   = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('default');
  const [sortAsc, setSortAsc] = useState(true);

  // ── Add symbol ──
  const [addingSymbol, setAddingSymbol] = useState(false);
  const [addInput, setAddInput]         = useState('');
  const addInputRef = useRef<HTMLInputElement>(null);
  const newGroupInputRef = useRef<HTMLInputElement>(null);

  // ── Persist ──
  useEffect(() => {
    try { localStorage.setItem(WL_GROUPS_KEY, JSON.stringify(groups)); } catch { /* */ }
  }, [groups]);

  useEffect(() => {
    try { localStorage.setItem(WL_ACTIVE_KEY, activeGroupId); } catch { /* */ }
  }, [activeGroupId]);

  useEffect(() => {
    try { localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites])); } catch { /* */ }
  }, [favorites]);

  useEffect(() => { if (addingSymbol) addInputRef.current?.focus(); }, [addingSymbol]);
  useEffect(() => { if (creatingGroup) newGroupInputRef.current?.focus(); }, [creatingGroup]);

  // ── Group CRUD ──
  const createGroup = useCallback(() => {
    const name = newGroupName.trim() || `List ${groups.length + 1}`;
    const id = `grp_${Date.now()}`;
    const newGroup: WatchlistGroup = { id, name, symbols: [] };
    setGroups(prev => [...prev, newGroup]);
    setActiveGroupId(id);
    setCreatingGroup(false);
    setNewGroupName('');
  }, [newGroupName, groups.length]);

  const deleteGroup = useCallback((id: string) => {
    setGroups(prev => {
      const next = prev.filter(g => g.id !== id);
      return next.length > 0 ? next : defaultGroups();
    });
    setActiveGroupId(prev => {
      if (prev !== id) return prev;
      const remaining = groups.filter(g => g.id !== id);
      return remaining.length > 0 ? remaining[0].id : 'all';
    });
    setMenuGroupId(null);
  }, [groups]);

  const renameGroup = useCallback((id: string, name: string) => {
    setGroups(prev => prev.map(g => g.id === id ? { ...g, name } : g));
    setEditingGroupId(null);
  }, []);

  const addSymbolToGroup = useCallback((groupId: string, sym: string) => {
    setGroups(prev => prev.map(g =>
      g.id === groupId && !g.symbols.includes(sym)
        ? { ...g, symbols: [...g.symbols, sym] }
        : g
    ));
  }, []);

  const removeSymbolFromGroup = useCallback((groupId: string, sym: string) => {
    setGroups(prev => prev.map(g =>
      g.id === groupId ? { ...g, symbols: g.symbols.filter(s => s !== sym) } : g
    ));
  }, []);

  const toggleFav = useCallback((symbol: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavorites(prev => {
      const n = new Set(prev); n.has(symbol) ? n.delete(symbol) : n.add(symbol); return n;
    });
  }, []);

  // ── Sort cycle ──
  function cycleSort(key: SortKey) {
    if (sortKey === key) { if (sortAsc) setSortAsc(false); else { setSortKey('default'); setSortAsc(true); } }
    else { setSortKey(key); setSortAsc(true); }
  }

  // ── Commit add ──
  function commitAdd() {
    const sym = addInput.trim().toUpperCase();
    if (sym && activeGroupId !== 'all') addSymbolToGroup(activeGroupId, sym);
    setAddInput('');
    setAddingSymbol(false);
  }

  // ── Current group data ──
  const activeGroup = activeGroupId === 'all' ? null : groups.find(g => g.id === activeGroupId);

  const filteredDefault = DEFAULT_WATCHLIST.filter(w =>
    !search || w.symbol.toLowerCase().includes(search.toLowerCase()) || w.name.toLowerCase().includes(search.toLowerCase())
  );
  const defaultCategories = [...new Set(filteredDefault.map(w => w.category))];

  const favItems = activeGroupId === 'all'
    ? [...favorites].map(sym => { const def = DEFAULT_WATCHLIST.find(w => w.symbol === sym); return { symbol: sym, name: def?.name ?? sym }; })
    : [];

  const groupItems = activeGroup
    ? activeGroup.symbols
        .filter(sym => !search || sym.toLowerCase().includes(search.toLowerCase()))
        .map(sym => { const def = DEFAULT_WATCHLIST.find(w => w.symbol === sym); return { symbol: sym, name: def?.name ?? sym }; })
    : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}
      onClick={() => setMenuGroupId(null)}
    >
      {/* ── Group tab bar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 2,
        padding: '4px 6px', borderBottom: `1px solid ${T.border}`,
        overflowX: 'auto', flexShrink: 0,
        scrollbarWidth: 'none',
      }}>
        {/* All tab */}
        <GroupTab label="All" active={activeGroupId === 'all'} onClick={() => setActiveGroupId('all')} />

        {/* User groups */}
        {groups.map(g => (
          <div key={g.id} style={{ position: 'relative', flexShrink: 0 }}>
            {editingGroupId === g.id ? (
              <input
                autoFocus
                value={editingName}
                onChange={e => setEditingName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') renameGroup(g.id, editingName || g.name);
                  if (e.key === 'Escape') setEditingGroupId(null);
                }}
                onBlur={() => renameGroup(g.id, editingName || g.name)}
                style={{
                  width: Math.max(50, editingName.length * 7 + 16),
                  height: 22, borderRadius: 3, border: `1px solid ${T.accent}`,
                  background: T.surfaceAlt, color: T.text1,
                  fontSize: 10, fontFamily: T.mono, padding: '0 4px',
                  outline: 'none',
                }}
              />
            ) : (
              <button
                onClick={e => { e.stopPropagation(); setActiveGroupId(g.id); }}
                onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setMenuGroupId(menuGroupId === g.id ? null : g.id); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 3,
                  height: 22, padding: '0 8px', borderRadius: 3,
                  border: `1px solid ${activeGroupId === g.id ? T.accent : T.border}`,
                  background: activeGroupId === g.id ? `${T.accent}20` : 'transparent',
                  color: activeGroupId === g.id ? T.accent : T.text2,
                  fontSize: 10, fontFamily: T.font, cursor: 'pointer', outline: 'none',
                  whiteSpace: 'nowrap',
                }}
              >
                {g.name}
                <MoreHorizontal
                  size={10}
                  style={{ opacity: 0.5, cursor: 'pointer' }}
                  onClick={e => { e.stopPropagation(); setMenuGroupId(menuGroupId === g.id ? null : g.id); }}
                />
              </button>
            )}

            {/* Group context menu */}
            {menuGroupId === g.id && (
              <div
                onClick={e => e.stopPropagation()}
                style={{
                  position: 'absolute', top: 26, left: 0, zIndex: 50,
                  background: T.surface, border: `1px solid ${T.border}`,
                  borderRadius: 4, padding: 4, minWidth: 110, boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                }}
              >
                <MenuAction icon={<Edit2 size={10} />} label="Rename" onClick={() => {
                  setEditingGroupId(g.id);
                  setEditingName(g.name);
                  setMenuGroupId(null);
                }} />
                <MenuAction icon={<Trash2 size={10} />} label="Delete" danger onClick={() => deleteGroup(g.id)} />
              </div>
            )}
          </div>
        ))}

        {/* Create group */}
        {creatingGroup ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
            <input
              ref={newGroupInputRef}
              value={newGroupName}
              onChange={e => setNewGroupName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') createGroup(); if (e.key === 'Escape') { setCreatingGroup(false); setNewGroupName(''); } }}
              placeholder="List name…"
              style={{
                width: 80, height: 22, borderRadius: 3, border: `1px solid ${T.accent}`,
                background: T.surfaceAlt, color: T.text1,
                fontSize: 10, fontFamily: T.mono, padding: '0 4px', outline: 'none',
              }}
            />
            <button onClick={createGroup} style={{ ...iconBtnStyle, color: T.accent }}><Check size={10} /></button>
            <button onClick={() => { setCreatingGroup(false); setNewGroupName(''); }} style={{ ...iconBtnStyle, color: T.text3 }}><X size={10} /></button>
          </div>
        ) : (
          <button
            onClick={e => { e.stopPropagation(); setCreatingGroup(true); }}
            title="New list"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 22, height: 22, borderRadius: 3, border: `1px solid ${T.border}`,
              background: 'transparent', color: T.text3, cursor: 'pointer', outline: 'none', flexShrink: 0,
            }}
          >
            <Plus size={10} />
          </button>
        )}
      </div>

      {/* ── Search bar + add symbol ── */}
      <div style={{ padding: '4px 8px', flexShrink: 0 }}>
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
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 11, color: T.text1, fontFamily: T.font }}
          />
          {activeGroupId !== 'all' && (
            <button
              onClick={() => setAddingSymbol(true)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 18, height: 18, borderRadius: 3, border: 'none',
                background: T.accent, color: '#fff', cursor: 'pointer', outline: 'none',
              }} title="Add symbol">
              <Plus size={10} />
            </button>
          )}
        </div>
      </div>

      {/* Inline add input */}
      {addingSymbol && (
        <div style={{ padding: '0 8px 4px', flexShrink: 0 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '0 8px', height: 26, borderRadius: 3,
            background: T.surfaceAlt, border: `1px solid ${T.accent}`,
          }}>
            <input
              ref={addInputRef}
              value={addInput}
              onChange={e => setAddInput(e.target.value.toUpperCase())}
              onKeyDown={e => { if (e.key === 'Enter') commitAdd(); if (e.key === 'Escape') { setAddInput(''); setAddingSymbol(false); } }}
              placeholder="Symbol…"
              style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 11, color: T.text1, fontFamily: T.mono, textTransform: 'uppercase' }}
            />
            <button onClick={commitAdd} style={{ ...iconBtnStyle, color: T.accent }}><Plus size={11} /></button>
            <button onClick={() => { setAddInput(''); setAddingSymbol(false); }} style={{ ...iconBtnStyle, color: T.text3 }}><X size={10} /></button>
          </div>
        </div>
      )}

      {/* ── Sort controls ── */}
      <div style={{ padding: '0 8px 4px', display: 'flex', gap: 4, flexShrink: 0, alignItems: 'center' }}>
        <ArrowUpDown size={9} color={T.text3} />
        {(['symbol', 'price', 'change'] as SortKey[]).map(k => (
          <button key={k} onClick={() => cycleSort(k)} style={{
            fontSize: 9, fontFamily: T.font, fontWeight: 600,
            padding: '1px 6px', borderRadius: 3, cursor: 'pointer', outline: 'none',
            border: `1px solid ${sortKey === k ? T.accent : T.border}`,
            background: sortKey === k ? `${T.accent}22` : 'transparent',
            color: sortKey === k ? T.accent : T.text3,
            letterSpacing: '0.04em',
          }}>
            {k.toUpperCase()}{sortKey === k ? (sortAsc ? ' ↑' : ' ↓') : ''}
          </button>
        ))}
        {sortKey !== 'default' && (
          <button onClick={() => { setSortKey('default'); setSortAsc(true); }}
            style={{ marginLeft: 'auto', fontSize: 9, fontFamily: T.font, color: T.text3, border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}>✕</button>
        )}
      </div>

      {/* ── List content ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 2px' }}>

        {/* Group view: user list */}
        {activeGroupId !== 'all' && (
          <>
            {groupItems.length === 0 ? (
              <div style={{ padding: '20px 12px', textAlign: 'center', color: T.text3, fontSize: 11, fontFamily: T.font }}>
                No symbols yet. Use + to add.
              </div>
            ) : (
              <SortedList
                items={groupItems}
                sortKey={sortKey} sortAsc={sortAsc}
                activeSymbol={state.symbol}
                favorites={favorites}
                onSelect={sym => dispatch({ type: 'SET_SYMBOL', symbol: sym })}
                onToggleFav={toggleFav}
                onRemove={(sym, e) => { e.stopPropagation(); removeSymbolFromGroup(activeGroupId, sym); }}
              />
            )}
          </>
        )}

        {/* All view: favorites + DEFAULT_WATCHLIST by category */}
        {activeGroupId === 'all' && (
          <>
            {favItems.length > 0 && !search && (
              <SortedList
                label="FAVORITES" labelColor="#FFD700"
                items={favItems}
                sortKey={sortKey} sortAsc={sortAsc}
                activeSymbol={state.symbol}
                favorites={favorites}
                onSelect={sym => dispatch({ type: 'SET_SYMBOL', symbol: sym })}
                onToggleFav={toggleFav}
              />
            )}
            {defaultCategories.map(cat => (
              <SortedList
                key={cat}
                label={cat.toUpperCase()} labelColor={T.text3}
                items={filteredDefault.filter(w => w.category === cat).map(w => ({ symbol: w.symbol, name: w.name }))}
                sortKey={sortKey} sortAsc={sortAsc}
                activeSymbol={state.symbol}
                favorites={favorites}
                onSelect={sym => dispatch({ type: 'SET_SYMBOL', symbol: sym })}
                onToggleFav={toggleFav}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

// ── Small helpers ──────────────────────────────────────────────────────────────
function GroupTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        height: 22, padding: '0 8px', borderRadius: 3,
        border: `1px solid ${active ? T.accent : T.border}`,
        background: active ? `${T.accent}20` : 'transparent',
        color: active ? T.accent : T.text2,
        fontSize: 10, fontFamily: T.font, cursor: 'pointer', outline: 'none',
        whiteSpace: 'nowrap', flexShrink: 0,
      }}
    >
      {label}
    </button>
  );
}

function MenuAction({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        width: '100%', padding: '5px 8px', borderRadius: 3,
        border: 'none', background: 'transparent',
        color: danger ? '#ef4444' : T.text1,
        fontSize: 10, fontFamily: T.font, cursor: 'pointer', outline: 'none',
        textAlign: 'left',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = T.hover; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
    >
      {icon}{label}
    </button>
  );
}
