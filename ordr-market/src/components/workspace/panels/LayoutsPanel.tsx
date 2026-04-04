'use client';
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  LayoutGrid, Save, Trash2, Download, Upload,
  Focus, Zap, LayoutDashboard, Check, X, Edit2,
  Layers, TrendingUp, BarChart2, Activity, Eye,
  Copy, Star, RefreshCw, Search, ChevronDown, ChevronUp,
  SortAsc, SortDesc, Clock, FileText, CloudOff, Cloud,
  AlertCircle,
} from 'lucide-react';
import { T } from '../tokens';
import { useWorkspace } from '../WorkspaceProvider';
import type {
  WorkspaceState, WorkspaceMode, ActiveIndicator,
  LeftTab, RightTab, BottomTab, ChartType, ChartLayout, SecondaryChart,
} from '../workspace-types';

// ── Constants ────────────────────────────────────────────────────────────────
const STORAGE_KEY        = 'ordr_named_layouts';
const AUTOSAVE_KEY       = 'ordr_autosave_enabled';
const ACTIVE_LAYOUT_KEY  = 'ordr_active_layout_id';
const MAX_LAYOUTS        = 50;
const AUTOSAVE_DEBOUNCE  = 3000; // ms

// ── Types ────────────────────────────────────────────────────────────────────
interface LayoutSnapshot {
  mode: WorkspaceMode;
  leftTab: LeftTab | null;
  rightTab: RightTab | null;
  bottomTab: BottomTab | null;
  symbol: string;
  timeframe: string;
  chartType: ChartType;
  chartLayout: ChartLayout;
  secondaryCharts: SecondaryChart[];
  indicators: ActiveIndicator[];
  chartSubPanes: string[];
  chartConfig: Record<string, boolean>;
  showSR: boolean;
  showFVG: boolean;
  priceScaleMode: 'linear' | 'log' | 'percent';
  showPrevLevels: boolean;
  enabledSessions: string[];
}

interface SavedLayout {
  id: string;
  name: string;
  description?: string;
  savedAt: number;
  updatedAt?: number;
  isDefault?: boolean;
  snapshot: LayoutSnapshot;
}

type SortMode = 'recent' | 'nameAsc' | 'nameDesc';

// ── Persistence helpers ───────────────────────────────────────────────────────
function loadLayouts(): SavedLayout[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'); }
  catch { return []; }
}
function persistLayouts(layouts: SavedLayout[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(layouts.slice(0, MAX_LAYOUTS)));
}
function loadAutosave(): boolean {
  return localStorage.getItem(AUTOSAVE_KEY) === 'true';
}
function loadActiveLayoutId(): string | null {
  return localStorage.getItem(ACTIVE_LAYOUT_KEY);
}

function snapshotFromState(state: WorkspaceState): LayoutSnapshot {
  return {
    mode: state.mode,
    leftTab: state.leftTab,
    rightTab: state.rightTab,
    bottomTab: state.bottomTab,
    symbol: state.symbol,
    timeframe: state.timeframe,
    chartType: state.chartType,
    chartLayout: state.chartLayout,
    secondaryCharts: state.secondaryCharts,
    indicators: state.indicators,
    chartSubPanes: state.chartSubPanes,
    chartConfig: state.chartConfig,
    showSR: state.showSR,
    showFVG: state.showFVG,
    priceScaleMode: state.priceScaleMode,
    showPrevLevels: state.showPrevLevels,
    enabledSessions: state.enabledSessions,
  };
}

// Shallow compare two snapshots (key fields only) to detect dirty state
function snapshotsEqual(a: LayoutSnapshot, b: LayoutSnapshot): boolean {
  return a.symbol === b.symbol
    && a.timeframe === b.timeframe
    && a.chartType === b.chartType
    && a.chartLayout === b.chartLayout
    && a.priceScaleMode === b.priceScaleMode
    && a.showPrevLevels === b.showPrevLevels
    && JSON.stringify(a.chartConfig) === JSON.stringify(b.chartConfig)
    && JSON.stringify(a.chartSubPanes) === JSON.stringify(b.chartSubPanes)
    && a.mode === b.mode;
}

// ── Indicator Templates ────────────────────────────────────────────────────────
interface IndicatorTemplate {
  id: string; name: string; desc: string;
  icon: React.ReactNode;
  chartConfig: Record<string, boolean>;
  chartSubPanes: string[];
}

const IND_TEMPLATES: IndicatorTemplate[] = [
  { id: 'clean',      name: 'Clean',      desc: 'Bare price action — no indicators',           icon: <Eye size={11} />,       chartConfig: { ema20: false, sr: false, fvg: false, trendlines: false }, chartSubPanes: [] },
  { id: 'scalper',    name: 'Scalper',    desc: 'EMA20 · VWAP · RSI · Stochastic',             icon: <Activity size={11} />,  chartConfig: { ema20: true, vwap: true, sr: true, fvg: true, trendlines: false }, chartSubPanes: ['rsi', 'stochastic'] },
  { id: 'swing',      name: 'Swing',      desc: 'EMA50 · EMA200 · BB · MACD',                  icon: <TrendingUp size={11} />, chartConfig: { ema50: true, sma200: true, bollinger: true, sr: true, fvg: false, trendlines: true }, chartSubPanes: ['macd'] },
  { id: 'smc',        name: 'ICT / SMC',  desc: 'FVG · S/R · Trendlines · OBV',               icon: <Layers size={11} />,    chartConfig: { fvg: true, sr: true, trendlines: true, ema20: false, bollinger: false }, chartSubPanes: ['obv'] },
  { id: 'volatility', name: 'Volatility', desc: 'BB · Keltner · ATR · Hist Vol',               icon: <BarChart2 size={11} />, chartConfig: { bollinger: true, keltner: true, sr: false, fvg: false, trendlines: false }, chartSubPanes: ['atr', 'histvol'] },
  { id: 'momentum',   name: 'Momentum',   desc: 'EMA20 · RSI · MACD · Williams %R',            icon: <Zap size={11} />,       chartConfig: { ema20: true, sr: false, fvg: false, trendlines: false }, chartSubPanes: ['rsi', 'macd', 'williamsR'] },
  { id: 'volume',     name: 'Volume',     desc: 'VWAP · Volume Profile · OBV · CMF',           icon: <LayoutGrid size={11} />, chartConfig: { vwap: true, volumeProfile: true, sr: false, fvg: false }, chartSubPanes: ['obv', 'cmf'] },
];

// ── Preset Workspaces ─────────────────────────────────────────────────────────
const PRESETS: { id: string; name: string; mode: WorkspaceMode; desc: string }[] = [
  { id: 'default',   name: 'Default',   mode: 'workspace',  desc: 'Full panel layout with watchlist' },
  { id: 'analysis',  name: 'Analysis',  mode: 'focus',      desc: 'Maximum chart, minimal panels' },
  { id: 'execution', name: 'Execution', mode: 'execution',  desc: 'Chart + order ticket + positions' },
];

// ── Small helpers ─────────────────────────────────────────────────────────────
function modeIcon(mode: WorkspaceMode) {
  if (mode === 'focus')     return <Focus size={11} />;
  if (mode === 'execution') return <Zap size={11} />;
  return <LayoutDashboard size={11} />;
}

function formatDate(ts: number) {
  const d = new Date(ts);
  const now = Date.now();
  const diff = now - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function gridLabel(layout: ChartLayout): string {
  if (layout === '2h') return '2H'; if (layout === '2v') return '2V'; if (layout === '4') return '2×2';
  return '1×1';
}
function scaleLabel(mode: 'linear' | 'log' | 'percent'): string {
  if (mode === 'log') return 'Log'; if (mode === 'percent') return '%'; return 'Lin';
}
function indicatorCount(snap: LayoutSnapshot): number {
  return Object.values(snap.chartConfig).filter(Boolean).length + snap.chartSubPanes.length;
}

// ── Sub-components ────────────────────────────────────────────────────────────
function Badge({ children, accent, warn }: { children: React.ReactNode; accent?: boolean; warn?: boolean }) {
  return (
    <span style={{
      fontSize: 8, fontWeight: 600, fontFamily: T.font,
      padding: '1px 4px', borderRadius: 2, whiteSpace: 'nowrap' as const,
      border: `1px solid ${accent ? 'rgba(41,98,255,0.4)' : warn ? 'rgba(255,160,0,0.4)' : T.border}`,
      background: accent ? 'rgba(41,98,255,0.12)' : warn ? 'rgba(255,160,0,0.1)' : 'rgba(255,255,255,0.04)',
      color: accent ? '#90CAF9' : warn ? '#FFB74D' : T.text3,
      letterSpacing: '0.03em',
    }}>
      {children}
    </span>
  );
}

function SectionHeader({ label, count, children }: { label: string; count?: number; children?: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 9, fontWeight: 700, color: T.text3,
      letterSpacing: '0.06em', fontFamily: T.font,
      padding: '10px 2px 5px', display: 'flex', alignItems: 'center', gap: 6,
    }}>
      <span>{label}</span>
      {count !== undefined && <span style={{ fontWeight: 400, opacity: 0.7 }}>({count})</span>}
      {children && <span style={{ marginLeft: 'auto' }}>{children}</span>}
    </div>
  );
}

function IconBtn({ icon, title, onClick, color, hoverColor }: {
  icon: React.ReactNode; title: string; onClick: (e: React.MouseEvent) => void;
  color?: string; hoverColor?: string;
}) {
  return (
    <button
      onClick={onClick} title={title}
      style={{ display: 'flex', alignItems: 'center', border: 'none', background: 'none', cursor: 'pointer', padding: 3, outline: 'none', color: color ?? T.text3, borderRadius: 3 }}
      onMouseEnter={e => { e.currentTarget.style.color = hoverColor ?? T.text1; }}
      onMouseLeave={e => { e.currentTarget.style.color = color ?? T.text3; }}
    >
      {icon}
    </button>
  );
}

// ── Exported hook for CommandBar quick-switcher ───────────────────────────────
export function useLayouts() {
  const [layouts, setLayouts] = useState<SavedLayout[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  useEffect(() => {
    setLayouts(loadLayouts());
    setActiveId(loadActiveLayoutId());
  }, []);
  return { layouts, activeId };
}

// ── Main Component ────────────────────────────────────────────────────────────
export function LayoutsPanel() {
  const { state, dispatch } = useWorkspace();
  const [layouts, setLayouts] = useState<SavedLayout[]>([]);
  const [activeLayoutId, setActiveLayoutId] = useState<string | null>(null);
  const [activeSnapshot, setActiveSnapshot] = useState<LayoutSnapshot | null>(null);
  const [autosave, setAutosave] = useState(false);
  const [autosaveAt, setAutosaveAt] = useState<number | null>(null);

  // UI state
  const [naming, setNaming] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [saved, setSaved] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameInput, setRenameInput] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingDescId, setEditingDescId] = useState<string | null>(null);
  const [descInput, setDescInput] = useState('');
  const [search, setSearch] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [updatedId, setUpdatedId] = useState<string | null>(null); // flash on overwrite

  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    setLayouts(loadLayouts());
    setAutosave(loadAutosave());
    const aid = loadActiveLayoutId();
    setActiveLayoutId(aid);
  }, []);

  // ── Dirty detection ───────────────────────────────────────────────────────
  const currentSnapshot = useMemo(() => snapshotFromState(state), [
    state.symbol, state.timeframe, state.chartType, state.chartLayout,
    state.chartConfig, state.chartSubPanes, state.priceScaleMode,
    state.showPrevLevels, state.mode,
  ]);

  const isDirty = useMemo(() => {
    if (!activeLayoutId || !activeSnapshot) return false;
    return !snapshotsEqual(currentSnapshot, activeSnapshot);
  }, [currentSnapshot, activeLayoutId, activeSnapshot]);

  // ── Autosave effect ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!autosave || !activeLayoutId || !isDirty) return;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      setLayouts(prev => {
        const now = Date.now();
        const next = prev.map(l => l.id === activeLayoutId
          ? { ...l, snapshot: snapshotFromState(state), updatedAt: now }
          : l
        );
        persistLayouts(next);
        setActiveSnapshot(snapshotFromState(state));
        setAutosaveAt(now);
        return next;
      });
    }, AUTOSAVE_DEBOUNCE);
    return () => { if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autosave, activeLayoutId, isDirty, currentSnapshot]);

  // ── Ctrl+S save prompt ────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key !== 's') return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      e.preventDefault();
      setNaming(true); setNameInput('');
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ── Ctrl+1…5 quick load ───────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const n = parseInt(e.key);
      if (isNaN(n) || n < 1 || n > 5) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const sorted = getSorted(layouts, sortMode);
      const filtered = search ? sorted.filter(l => l.name.toLowerCase().includes(search.toLowerCase())) : sorted;
      const target = filtered[n - 1];
      if (target) loadLayout(target);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layouts, sortMode, search]);

  // ── Sort util ─────────────────────────────────────────────────────────────
  function getSorted(ls: SavedLayout[], mode: SortMode): SavedLayout[] {
    const pinDefault = [...ls].sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0));
    if (mode === 'nameAsc')  return [...pinDefault].sort((a, b) => a.name.localeCompare(b.name));
    if (mode === 'nameDesc') return [...pinDefault].sort((a, b) => b.name.localeCompare(a.name));
    return [...pinDefault].sort((a, b) => (b.updatedAt ?? b.savedAt) - (a.updatedAt ?? a.savedAt));
  }

  const displayedLayouts = useMemo(() => {
    const sorted = getSorted(layouts, sortMode);
    if (!search.trim()) return sorted;
    return sorted.filter(l => l.name.toLowerCase().includes(search.toLowerCase())
      || (l.description ?? '').toLowerCase().includes(search.toLowerCase()));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layouts, sortMode, search]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const doSave = useCallback(() => {
    const name = nameInput.trim() || `Layout ${new Date().toLocaleDateString()}`;
    const now = Date.now();
    const layout: SavedLayout = { id: Math.random().toString(36).slice(2), name, savedAt: now, snapshot: snapshotFromState(state) };
    const next = [layout, ...layouts].slice(0, MAX_LAYOUTS);
    persistLayouts(next);
    setLayouts(next);
    setActiveLayoutId(layout.id);
    setActiveSnapshot(layout.snapshot);
    localStorage.setItem(ACTIVE_LAYOUT_KEY, layout.id);
    setNaming(false); setNameInput('');
    setSaved(true); setTimeout(() => setSaved(false), 1800);
  }, [state, layouts, nameInput]);

  const loadLayout = useCallback((layout: SavedLayout) => {
    dispatch({ type: 'RESTORE_LAYOUT', layout: layout.snapshot });
    setActiveLayoutId(layout.id);
    setActiveSnapshot(layout.snapshot);
    localStorage.setItem(ACTIVE_LAYOUT_KEY, layout.id);
  }, [dispatch]);

  const doUpdate = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const now = Date.now();
    const snap = snapshotFromState(state);
    const next = layouts.map(l => l.id === id ? { ...l, snapshot: snap, updatedAt: now } : l);
    persistLayouts(next);
    setLayouts(next);
    if (activeLayoutId === id) setActiveSnapshot(snap);
    setUpdatedId(id); setTimeout(() => setUpdatedId(null), 1600);
  }, [state, layouts, activeLayoutId]);

  const doDuplicate = useCallback((layout: SavedLayout, e: React.MouseEvent) => {
    e.stopPropagation();
    const copy: SavedLayout = { ...layout, id: Math.random().toString(36).slice(2), name: `${layout.name} (copy)`, savedAt: Date.now(), updatedAt: undefined, isDefault: false };
    const next = [copy, ...layouts].slice(0, MAX_LAYOUTS);
    persistLayouts(next);
    setLayouts(next);
  }, [layouts]);

  const doDelete = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = layouts.filter(l => l.id !== id);
    persistLayouts(next);
    setLayouts(next);
    if (activeLayoutId === id) {
      setActiveLayoutId(null);
      setActiveSnapshot(null);
      localStorage.removeItem(ACTIVE_LAYOUT_KEY);
    }
  }, [layouts, activeLayoutId]);

  const doRename = useCallback((id: string) => {
    const name = renameInput.trim();
    if (!name) { setRenamingId(null); return; }
    const next = layouts.map(l => l.id === id ? { ...l, name } : l);
    persistLayouts(next); setLayouts(next); setRenamingId(null);
  }, [layouts, renameInput]);

  const doToggleDefault = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = layouts.map(l => ({ ...l, isDefault: l.id === id ? !l.isDefault : false }));
    persistLayouts(next); setLayouts(next);
  }, [layouts]);

  const doSaveDesc = useCallback((id: string) => {
    const next = layouts.map(l => l.id === id ? { ...l, description: descInput.trim() || undefined } : l);
    persistLayouts(next); setLayouts(next); setEditingDescId(null);
  }, [layouts, descInput]);

  const doExport = useCallback(() => {
    const blob = new Blob([JSON.stringify(layouts, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'ordr-layouts.json'; a.click();
    URL.revokeObjectURL(url);
  }, [layouts]);

  const doImport = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json';
    input.onchange = () => {
      const file = input.files?.[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = e2 => {
        try {
          const imported: SavedLayout[] = JSON.parse(e2.target?.result as string);
          if (!Array.isArray(imported)) return;
          const next = [...imported, ...layouts].slice(0, MAX_LAYOUTS);
          persistLayouts(next); setLayouts(next);
        } catch { /* ignore */ }
      };
      reader.readAsText(file);
    };
    input.click();
  }, [layouts]);

  const applyTemplate = useCallback((tpl: IndicatorTemplate) => {
    dispatch({ type: 'SET_CHART_CONFIG', config: tpl.chartConfig });
    dispatch({ type: 'SET_CHART_SUBPANES', panes: tpl.chartSubPanes });
  }, [dispatch]);

  const toggleAutosave = useCallback(() => {
    const next = !autosave;
    setAutosave(next);
    localStorage.setItem(AUTOSAVE_KEY, String(next));
    if (!next) setAutosaveAt(null);
  }, [autosave]);

  // ── Styles ────────────────────────────────────────────────────────────────
  const rowBase: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '7px 8px', borderRadius: 4,
    border: `1px solid ${T.border}`, background: T.surfaceAlt, marginBottom: 4,
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* ── Header bar ───────────────────────────────────────────────────── */}
      <div style={{ padding: '8px 8px 0', display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>

        {/* Action row */}
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            onClick={() => { setNaming(true); setNameInput(''); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 4, flex: 1,
              padding: '6px 8px', borderRadius: 3, border: `1px solid ${isDirty ? T.accent : T.border}`,
              background: isDirty ? T.accentBg : T.surfaceAlt,
              color: isDirty ? T.accent : T.text2,
              fontSize: 10, fontWeight: 600, fontFamily: T.font, cursor: 'pointer', outline: 'none',
              justifyContent: 'center',
            }}
            title="Save current workspace as named layout (Ctrl+S)"
          >
            {saved ? <Check size={11} /> : <Save size={11} />}
            {saved ? 'Saved!' : isDirty ? '● Save Changes' : 'Save Current'}
          </button>

          {/* Autosave toggle */}
          <button
            onClick={toggleAutosave}
            title={autosave ? 'Autosave ON — changes save automatically to active layout' : 'Autosave OFF'}
            style={{
              display: 'flex', alignItems: 'center', gap: 3,
              width: 54, padding: '0 6px', borderRadius: 3,
              border: `1px solid ${autosave ? 'rgba(76,175,80,0.5)' : T.border}`,
              background: autosave ? 'rgba(76,175,80,0.12)' : T.surfaceAlt,
              color: autosave ? '#81C784' : T.text3,
              fontSize: 8, fontWeight: 700, fontFamily: T.font, cursor: 'pointer', outline: 'none',
              justifyContent: 'center', letterSpacing: '0.04em',
            }}
          >
            {autosave ? <Cloud size={10} /> : <CloudOff size={10} />}
            {autosave ? 'AUTO' : 'AUTO'}
          </button>

          <button onClick={doExport} title="Export all layouts as JSON"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 30, borderRadius: 3, border: `1px solid ${T.border}`, background: T.surfaceAlt, color: T.text2, cursor: 'pointer', outline: 'none' }}>
            <Download size={11} />
          </button>
          <button onClick={doImport} title="Import layouts from JSON"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 30, borderRadius: 3, border: `1px solid ${T.border}`, background: T.surfaceAlt, color: T.text2, cursor: 'pointer', outline: 'none' }}>
            <Upload size={11} />
          </button>
        </div>

        {/* Autosave status */}
        {autosave && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 4px', borderRadius: 3, background: 'rgba(76,175,80,0.07)', border: '1px solid rgba(76,175,80,0.2)' }}>
            <Cloud size={9} color="#81C784" />
            <span style={{ fontSize: 9, color: '#81C784', fontFamily: T.font }}>
              {activeLayoutId
                ? autosaveAt ? `Autosaved ${formatDate(autosaveAt)}` : 'Autosave active — changes save to active layout'
                : 'Save a layout first to enable autosave'}
            </span>
          </div>
        )}

        {/* Dirty banner when no autosave */}
        {!autosave && isDirty && activeLayoutId && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 4px', borderRadius: 3, background: 'rgba(255,160,0,0.07)', border: '1px solid rgba(255,160,0,0.25)' }}>
            <AlertCircle size={9} color="#FFB74D" />
            <span style={{ fontSize: 9, color: '#FFB74D', fontFamily: T.font, flex: 1 }}>Unsaved changes</span>
            <button
              onClick={() => { const lay = layouts.find(l => l.id === activeLayoutId); if (lay) doUpdate(activeLayoutId, { stopPropagation: () => {} } as React.MouseEvent); }}
              style={{ fontSize: 8, color: '#FFB74D', fontFamily: T.font, background: 'none', border: '1px solid rgba(255,160,0,0.4)', borderRadius: 2, cursor: 'pointer', padding: '1px 5px', outline: 'none' }}
            >
              Update
            </button>
          </div>
        )}

        {/* Naming prompt */}
        {naming && (
          <div style={{ display: 'flex', gap: 4 }}>
            <input
              autoFocus
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') doSave(); if (e.key === 'Escape') setNaming(false); }}
              placeholder="Layout name…"
              style={{ flex: 1, height: 26, padding: '0 8px', borderRadius: 3, border: `1px solid ${T.accent}`, background: T.surfaceAlt, color: T.text1, fontSize: 11, fontFamily: T.font, outline: 'none' }}
            />
            <button onClick={doSave} style={{ height: 26, padding: '0 10px', borderRadius: 3, border: 'none', background: T.accent, color: '#fff', fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: T.font, outline: 'none' }}>Save</button>
            <button onClick={() => setNaming(false)} style={{ height: 26, width: 26, borderRadius: 3, border: `1px solid ${T.border}`, background: T.surfaceAlt, color: T.text2, cursor: 'pointer', outline: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <X size={11} />
            </button>
          </div>
        )}
      </div>

      {/* ── Scrollable body ──────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 6px 12px' }}>

        {/* ── Saved Layouts ──────────────────────────────────────────────── */}
        {layouts.length > 0 && (
          <>
            <SectionHeader label="SAVED" count={layouts.length}>
              {/* Sort controls */}
              <div style={{ display: 'flex', gap: 2 }}>
                {([
                  { id: 'recent',   icon: <Clock size={8} />,    title: 'Sort by recent' },
                  { id: 'nameAsc',  icon: <SortAsc size={8} />,  title: 'Sort A→Z' },
                  { id: 'nameDesc', icon: <SortDesc size={8} />, title: 'Sort Z→A' },
                ] as { id: SortMode; icon: React.ReactNode; title: string }[]).map(s => (
                  <button
                    key={s.id} title={s.title}
                    onClick={() => setSortMode(s.id)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      width: 18, height: 16, borderRadius: 2, border: 'none', cursor: 'pointer', outline: 'none',
                      background: sortMode === s.id ? T.accentBg : 'transparent',
                      color: sortMode === s.id ? T.accent : T.text3,
                    }}
                  >
                    {s.icon}
                  </button>
                ))}
              </div>
            </SectionHeader>

            {/* Search */}
            <div style={{ position: 'relative', marginBottom: 6 }}>
              <Search size={9} style={{ position: 'absolute', left: 7, top: '50%', transform: 'translateY(-50%)', color: T.text3, pointerEvents: 'none' }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search layouts…"
                style={{
                  width: '100%', height: 26, padding: '0 8px 0 24px', borderRadius: 3,
                  border: `1px solid ${T.border}`, background: T.surfaceAlt,
                  color: T.text1, fontSize: 10, fontFamily: T.font, outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
              {search && (
                <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', color: T.text3, display: 'flex', padding: 0 }}>
                  <X size={9} />
                </button>
              )}
            </div>

            {/* Layout count hint */}
            {layouts.length >= MAX_LAYOUTS - 5 && (
              <div style={{ fontSize: 8, color: T.text3, fontFamily: T.font, padding: '0 2px 4px' }}>
                {layouts.length}/{MAX_LAYOUTS} layouts used
              </div>
            )}

            {displayedLayouts.length === 0 && search && (
              <div style={{ fontSize: 10, color: T.text3, fontFamily: T.font, padding: '8px 4px', textAlign: 'center' }}>
                No layouts match &ldquo;{search}&rdquo;
              </div>
            )}

            {displayedLayouts.map((layout, idx) => {
              const isActive = layout.id === activeLayoutId;
              const isExpanded = expandedId === layout.id;
              const wasUpdated = updatedId === layout.id;

              return (
                <div
                  key={layout.id}
                  style={{
                    borderRadius: 4, marginBottom: 4, overflow: 'hidden',
                    border: `1px solid ${isActive ? T.accent : T.border}`,
                    background: isActive ? T.selectedBg : T.surfaceAlt,
                    transition: 'border-color 0.15s, background 0.15s',
                  }}
                  onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = T.panelHover; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = isActive ? T.selectedBg : T.surfaceAlt; }}
                >
                  {/* ── Main row ── */}
                  <div
                    onClick={() => { if (renamingId !== layout.id) loadLayout(layout); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', cursor: 'pointer' }}
                  >
                    {/* Keyboard shortcut badge (1–5) */}
                    {idx < 5 && (
                      <span style={{
                        fontSize: 7, fontWeight: 700, fontFamily: T.mono,
                        color: isActive ? T.accent : T.text3,
                        background: isActive ? T.accentBg : T.borderLight,
                        border: `1px solid ${isActive ? 'rgba(41,98,255,0.3)' : T.border}`,
                        borderRadius: 2, padding: '1px 3px', flexShrink: 0,
                      }}>
                        ⌃{idx + 1}
                      </span>
                    )}

                    <span style={{ color: isActive ? T.accent : T.text2, flexShrink: 0 }}>
                      {modeIcon(layout.snapshot.mode)}
                    </span>

                    {/* Name / inline rename */}
                    {renamingId === layout.id ? (
                      <input
                        autoFocus
                        value={renameInput}
                        onChange={e => setRenameInput(e.target.value)}
                        onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') doRename(layout.id); if (e.key === 'Escape') setRenamingId(null); }}
                        onClick={e => e.stopPropagation()}
                        style={{ flex: 1, height: 20, padding: '0 6px', borderRadius: 2, border: `1px solid ${T.accent}`, background: T.surfaceAlt, color: T.text1, fontSize: 10, fontFamily: T.font, outline: 'none' }}
                      />
                    ) : (
                      <span style={{ flex: 1, fontSize: 10, fontWeight: isActive ? 600 : 500, color: isActive ? T.accent : T.text1, fontFamily: T.font, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {layout.name}
                        {isActive && isDirty && !autosave && <span style={{ color: '#FFB74D', marginLeft: 4 }}>●</span>}
                      </span>
                    )}

                    {/* Default star */}
                    <IconBtn
                      icon={<Star size={10} fill={layout.isDefault ? '#FFD700' : 'none'} />}
                      title={layout.isDefault ? 'Default layout — loaded on startup' : 'Set as default layout'}
                      onClick={e => doToggleDefault(layout.id, e)}
                      color={layout.isDefault ? '#FFD700' : T.text3}
                      hoverColor="#FFD700"
                    />

                    {/* Overwrite with current */}
                    <IconBtn
                      icon={wasUpdated ? <Check size={10} /> : <RefreshCw size={10} />}
                      title="Update: overwrite this layout with current workspace state"
                      onClick={e => doUpdate(layout.id, e)}
                      color={wasUpdated ? '#81C784' : T.text3}
                      hoverColor={T.accent}
                    />

                    {/* Duplicate */}
                    <IconBtn
                      icon={<Copy size={10} />}
                      title="Duplicate this layout"
                      onClick={e => doDuplicate(layout, e)}
                      color={T.text3}
                      hoverColor={T.text1}
                    />

                    {/* Rename */}
                    <IconBtn
                      icon={<Edit2 size={10} />}
                      title="Rename"
                      onClick={e => { e.stopPropagation(); setRenamingId(layout.id); setRenameInput(layout.name); }}
                    />

                    {/* Expand/collapse */}
                    <IconBtn
                      icon={isExpanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                      title={isExpanded ? 'Collapse' : 'Show details & notes'}
                      onClick={e => { e.stopPropagation(); setExpandedId(isExpanded ? null : layout.id); }}
                    />

                    {/* Delete */}
                    <IconBtn
                      icon={<Trash2 size={10} />}
                      title="Delete"
                      onClick={e => doDelete(layout.id, e)}
                      color={T.text3}
                      hoverColor={T.bear}
                    />
                  </div>

                  {/* ── Badge strip ── */}
                  <div style={{ display: 'flex', gap: 3, padding: '0 8px 6px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <Badge accent={isActive}>{layout.snapshot.timeframe}</Badge>
                    <Badge accent={isActive}>{layout.snapshot.symbol}</Badge>
                    {layout.snapshot.chartLayout !== '1' && <Badge>{gridLabel(layout.snapshot.chartLayout)}</Badge>}
                    {layout.snapshot.priceScaleMode !== 'linear' && <Badge warn>{scaleLabel(layout.snapshot.priceScaleMode)}</Badge>}
                    {layout.snapshot.showPrevLevels && <Badge>PDH/L</Badge>}
                    {indicatorCount(layout.snapshot) > 0 && <Badge>{indicatorCount(layout.snapshot)} ind</Badge>}
                    {layout.isDefault && <Badge warn>★ default</Badge>}
                    <span style={{ fontSize: 8, color: T.text3, fontFamily: T.font, marginLeft: 'auto', alignSelf: 'center' }}>
                      {formatDate(layout.updatedAt ?? layout.savedAt)}
                    </span>
                  </div>

                  {/* ── Expanded details + notes ── */}
                  {isExpanded && (
                    <div style={{ padding: '0 8px 8px', borderTop: `1px solid ${T.border}` }}>
                      {/* Indicator detail */}
                      <div style={{ paddingTop: 6, fontSize: 9, color: T.text3, fontFamily: T.font, marginBottom: 6, lineHeight: 1.6 }}>
                        <strong style={{ color: T.text2 }}>Overlays:</strong>{' '}
                        {Object.entries(layout.snapshot.chartConfig).filter(([, v]) => v).map(([k]) => k).join(', ') || 'none'}
                        {layout.snapshot.chartSubPanes.length > 0 && (
                          <><br /><strong style={{ color: T.text2 }}>Panes:</strong> {layout.snapshot.chartSubPanes.join(', ')}</>
                        )}
                      </div>

                      {/* Notes */}
                      <div style={{ fontSize: 9, fontWeight: 700, color: T.text3, letterSpacing: '0.05em', marginBottom: 4 }}>
                        NOTES
                      </div>
                      {editingDescId === layout.id ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <textarea
                            autoFocus
                            value={descInput}
                            onChange={e => setDescInput(e.target.value)}
                            placeholder="Add a note about this layout…"
                            rows={3}
                            style={{
                              width: '100%', padding: '6px 8px', borderRadius: 3,
                              border: `1px solid ${T.accent}`, background: T.surfaceAlt,
                              color: T.text1, fontSize: 10, fontFamily: T.font, outline: 'none',
                              resize: 'vertical', boxSizing: 'border-box',
                            }}
                          />
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button onClick={() => doSaveDesc(layout.id)} style={{ flex: 1, height: 22, borderRadius: 3, border: 'none', background: T.accent, color: '#fff', fontSize: 9, fontWeight: 600, cursor: 'pointer', fontFamily: T.font, outline: 'none' }}>
                              Save Note
                            </button>
                            <button onClick={() => setEditingDescId(null)} style={{ width: 30, height: 22, borderRadius: 3, border: `1px solid ${T.border}`, background: T.surfaceAlt, color: T.text2, cursor: 'pointer', outline: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <X size={9} />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div
                          onClick={e => { e.stopPropagation(); setEditingDescId(layout.id); setDescInput(layout.description ?? ''); }}
                          style={{ fontSize: 9, color: layout.description ? T.text2 : T.text3, fontFamily: T.font, lineHeight: 1.5, cursor: 'text', minHeight: 20, padding: '3px 4px', borderRadius: 3, border: `1px dashed ${T.border}` }}
                        >
                          {layout.description || <span style={{ opacity: 0.6 }}><FileText size={8} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 3 }} />Click to add notes…</span>}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}

        {/* Empty state */}
        {layouts.length === 0 && (
          <div style={{ padding: '20px 8px', textAlign: 'center' }}>
            <LayoutGrid size={24} color={T.text3} style={{ marginBottom: 8, opacity: 0.4 }} />
            <div style={{ fontSize: 11, fontWeight: 500, color: T.text2, fontFamily: T.font, marginBottom: 4 }}>No saved layouts</div>
            <div style={{ fontSize: 9, color: T.text3, fontFamily: T.font, lineHeight: 1.6 }}>
              Save your current chart setup — symbol, timeframe, indicators, and panel layout — as a named layout for instant recall.
            </div>
            <div style={{ fontSize: 9, color: T.text3, fontFamily: T.mono, marginTop: 8, padding: '4px 8px', background: T.surfaceAlt, borderRadius: 3, display: 'inline-block' }}>
              Ctrl+S to save
            </div>
          </div>
        )}

        {/* ── Indicator Templates ──────────────────────────────────────────── */}
        <SectionHeader label="INDICATOR TEMPLATES" />
        <div style={{ fontSize: 9, color: T.text3, fontFamily: T.font, padding: '0 2px 6px', lineHeight: 1.4 }}>
          Swap indicator sets without changing symbol or timeframe.
        </div>
        {IND_TEMPLATES.map(tpl => (
          <div key={tpl.id}
            style={{ ...rowBase, cursor: 'pointer' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = T.panelHover; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = T.surfaceAlt; }}
            onClick={() => applyTemplate(tpl)}
          >
            <span style={{ color: T.text2, flexShrink: 0 }}>{tpl.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 500, color: T.text1, fontFamily: T.font }}>{tpl.name}</div>
              <div style={{ fontSize: 9, color: T.text3, fontFamily: T.font, marginTop: 1 }}>{tpl.desc}</div>
            </div>
            {tpl.chartSubPanes.length > 0 && <Badge>{tpl.chartSubPanes.length} sub</Badge>}
          </div>
        ))}

        {/* ── Workspace Presets ─────────────────────────────────────────────── */}
        <SectionHeader label="WORKSPACE PRESETS" />
        {PRESETS.map(preset => {
          const active = state.mode === preset.mode;
          return (
            <div key={preset.id}
              onClick={() => dispatch({ type: 'SET_MODE', mode: preset.mode })}
              style={{
                ...rowBase,
                border: `1px solid ${active ? T.accent : T.border}`,
                background: active ? T.selectedBg : T.surfaceAlt,
                cursor: 'pointer',
              }}
              onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = T.panelHover; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = active ? T.selectedBg : T.surfaceAlt; }}
            >
              <span style={{ color: active ? T.accent : T.text2, flexShrink: 0 }}>{modeIcon(preset.mode)}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, fontWeight: 500, color: active ? T.accent : T.text1, fontFamily: T.font }}>{preset.name}</div>
                <div style={{ fontSize: 9, color: T.text3, fontFamily: T.font, marginTop: 1 }}>{preset.desc}</div>
              </div>
              {active && <Check size={10} style={{ color: T.accent, flexShrink: 0 }} />}
            </div>
          );
        })}

        {/* ── Keyboard shortcut hint ──────────────────────────────────────── */}
        <div style={{ marginTop: 12, padding: '8px', borderRadius: 4, background: T.surfaceAlt, border: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: T.text3, letterSpacing: '0.06em', marginBottom: 6 }}>SHORTCUTS</div>
          {[
            ['Ctrl+S', 'Save layout'],
            ['Ctrl+1…5', 'Load 1st–5th layout'],
            ['★ star', 'Default — loads on startup'],
            ['↑ update', 'Overwrite with current state'],
          ].map(([key, desc]) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' }}>
              <span style={{ minWidth: 70, fontSize: 8, fontFamily: T.mono, fontWeight: 600, color: T.accent, background: T.accentBg, padding: '1px 5px', borderRadius: 2, flexShrink: 0 }}>
                {key}
              </span>
              <span style={{ fontSize: 9, color: T.text2, fontFamily: T.font }}>{desc}</span>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
