'use client';
/**
 * ORDR Market — Left Adaptive Rail
 * 44px icon rail + expandable 216px panel. Tabbed: Watchlist, Draw, Indicators, Screener, Layouts.
 */
import React from 'react';
import {
  Bookmark, Pencil, TrendingUp, ScanLine, LayoutGrid,
  MousePointer2, Crosshair, Minus, ChevronsUpDown, GitBranch,
  Layers, Square, Circle, Pen, Type, Ruler, Magnet, Lock, Eye, Trash2,
  Pin,
} from 'lucide-react';
import { T } from './tokens';
import { useWorkspace } from './WorkspaceProvider';
import type { LeftTab } from './workspace-types';
import { WatchlistPanel } from './panels/WatchlistPanel';
import { DrawToolsPanel } from './panels/DrawToolsPanel';
import { IndicatorsPanel } from './panels/IndicatorsPanel';
import { ScreenerPanel } from './panels/ScreenerPanel';
import { LayoutsPanel } from './panels/LayoutsPanel';

// ── Rail Tab Definition ──────────────────────────────────────────────────────
const RAIL_TABS: { id: LeftTab; icon: React.ReactNode; label: string }[] = [
  { id: 'watchlist',   icon: <Bookmark size={16} />,   label: 'Watchlist' },
  { id: 'draw',        icon: <Pencil size={16} />,     label: 'Drawing Tools' },
  { id: 'indicators',  icon: <TrendingUp size={16} />, label: 'Indicators' },
  { id: 'screener',    icon: <ScanLine size={16} />,   label: 'Screener' },
  { id: 'layouts',     icon: <LayoutGrid size={16} />, label: 'Layouts' },
];

// ── Drawing Tool Rail (inline in left rail when draw tab is closed) ──────────
const DRAW_TOOLS = [
  { id: 'cursor',    icon: <MousePointer2 size={15} />, tooltip: 'Pointer (V)' },
  { id: 'crosshair', icon: <Crosshair size={15} />,     tooltip: 'Crosshair' },
  null,
  { id: 'trendline', icon: <TrendingUp size={15} />,    tooltip: 'Trend Line' },
  { id: 'hline',     icon: <Minus size={15} />,         tooltip: 'H-Line' },
  { id: 'channel',   icon: <ChevronsUpDown size={15} />, tooltip: 'Channel' },
  { id: 'pitchfork', icon: <GitBranch size={15} />,     tooltip: 'Pitchfork' },
  { id: 'fib',       icon: <Layers size={15} />,        tooltip: 'Fibonacci' },
  null,
  { id: 'rect',      icon: <Square size={15} />,        tooltip: 'Rectangle' },
  { id: 'ellipse',   icon: <Circle size={15} />,        tooltip: 'Ellipse' },
  { id: 'pen',       icon: <Pen size={15} />,           tooltip: 'Pen' },
  { id: 'text',      icon: <Type size={15} />,          tooltip: 'Text' },
  null,
  { id: 'measure',   icon: <Ruler size={15} />,         tooltip: 'Measure (M)' },
  { id: 'magnet',    icon: <Magnet size={15} />,        tooltip: 'Magnet' },
  null,
  { id: 'lock',      icon: <Lock size={15} />,          tooltip: 'Lock' },
  { id: 'eye',       icon: <Eye size={15} />,           tooltip: 'Show/Hide' },
  { id: 'trash',     icon: <Trash2 size={15} />,        tooltip: 'Remove All' },
] as const;

// ── Panel Content Router ─────────────────────────────────────────────────────
function PanelContent({ tab }: { tab: LeftTab }) {
  switch (tab) {
    case 'watchlist':  return <WatchlistPanel />;
    case 'draw':       return <DrawToolsPanel />;
    case 'indicators': return <IndicatorsPanel />;
    case 'screener':   return <ScreenerPanel />;
    case 'layouts':    return <LayoutsPanel />;
  }
}

// ── Main Component ───────────────────────────────────────────────────────────
export function LeftRail() {
  const { state, dispatch } = useWorkspace();
  const expanded = state.leftTab !== null;

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Icon Rail */}
      <div style={{
        width: T.leftRailW, display: 'flex', flexDirection: 'column',
        alignItems: 'center', paddingTop: 6, paddingBottom: 6, gap: 2,
        background: T.surface, borderRight: `1px solid ${T.border}`,
        flexShrink: 0, overflowY: 'auto', overflowX: 'hidden', zIndex: 10,
      }}>
        {/* Tab buttons */}
        {RAIL_TABS.map(tab => {
          const active = state.leftTab === tab.id;
          return (
            <button
              key={tab.id}
              title={tab.label}
              onClick={() => dispatch({ type: 'SET_LEFT_TAB', tab: tab.id })}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 34, height: 34, borderRadius: T.r3, border: 'none',
                background: active ? T.accentBg : 'transparent',
                color: active ? T.accent : T.text2,
                cursor: 'pointer', outline: 'none', flexShrink: 0,
              }}
              onMouseEnter={e => { if (!active) { e.currentTarget.style.background = T.hover; e.currentTarget.style.color = T.text1; } }}
              onMouseLeave={e => { if (!active) { e.currentTarget.style.background = active ? T.accentBg : 'transparent'; e.currentTarget.style.color = active ? T.accent : T.text2; } }}
            >
              {tab.icon}
            </button>
          );
        })}

        {/* Separator */}
        <div style={{ height: 1, width: '70%', background: T.border, margin: '4px 0', flexShrink: 0 }} />

        {/* Quick draw tools (when draw panel is not open) */}
        {state.leftTab !== 'draw' && DRAW_TOOLS.map((tool, i) => {
          if (tool === null) return <div key={`s${i}`} style={{ height: 1, width: '70%', background: T.border, margin: '2px 0', flexShrink: 0 }} />;
          const active = state.activeTool === tool.id;
          return (
            <button
              key={tool.id}
              title={tool.tooltip}
              onClick={() => dispatch({ type: 'SET_TOOL', tool: tool.id })}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 30, height: 30, borderRadius: T.r3, border: 'none',
                background: active ? T.accentBg : 'transparent',
                color: active ? T.accent : T.text3,
                cursor: 'pointer', outline: 'none', flexShrink: 0,
              }}
              onMouseEnter={e => { if (!active) { e.currentTarget.style.background = T.hover; e.currentTarget.style.color = T.text1; } }}
              onMouseLeave={e => { if (!active) { e.currentTarget.style.background = active ? T.accentBg : 'transparent'; e.currentTarget.style.color = active ? T.accent : T.text3; } }}
            >
              {tool.icon}
            </button>
          );
        })}
      </div>

      {/* Expanded Panel */}
      {expanded && state.leftTab && (
        <div style={{
          width: T.leftPanelW, display: 'flex', flexDirection: 'column',
          background: T.surface, borderRight: `1px solid ${T.border}`,
          overflow: 'hidden',
        }}>
          {/* Panel header */}
          <div style={{
            display: 'flex', alignItems: 'center', height: T.panelHeaderH,
            padding: '0 10px', borderBottom: `1px solid ${T.border}`,
            flexShrink: 0,
          }}>
            <span style={{
              fontSize: 11, fontWeight: 600, color: T.text1,
              fontFamily: T.font, letterSpacing: '0.03em', textTransform: 'uppercase', flex: 1,
            }}>
              {RAIL_TABS.find(t => t.id === state.leftTab)?.label}
            </span>
            <button
              onClick={() => dispatch({ type: 'TOGGLE_LEFT_PIN' })}
              title={state.leftPinned ? 'Unpin panel' : 'Pin panel'}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 22, height: 22, borderRadius: 3, border: 'none',
                background: state.leftPinned ? T.accentBg : 'transparent',
                color: state.leftPinned ? T.accent : T.text3,
                cursor: 'pointer', outline: 'none',
                transform: state.leftPinned ? 'rotate(0deg)' : 'rotate(45deg)',
              }}
            >
              <Pin size={12} />
            </button>
          </div>

          {/* Panel content */}
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <PanelContent tab={state.leftTab} />
          </div>
        </div>
      )}
    </div>
  );
}
