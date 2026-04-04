'use client';
/**
 * ORDR Market — Right Stack
 * Vertical icon rail (32px) + panel content.
 * Clicking the active icon closes the panel; clicking another switches it.
 */
import React from 'react';
import {
  Settings, Layers, Bot, BarChart3, Bell, Newspaper, ShoppingCart, Star, X,
  Calculator, LayoutGrid, FileText,
} from 'lucide-react';
import { T } from './tokens';
import { useWorkspace } from './WorkspaceProvider';
import type { RightTab } from './workspace-types';
import { PropertiesPanel } from './panels/PropertiesPanel';
import { LayersPanel } from './panels/LayersPanel';
import { AIPanel } from './panels/AIPanel';
import { OrderflowPanel } from './panels/OrderflowPanel';
import { AlertsPanel } from './panels/AlertsPanel';
import { NewsPanel } from './panels/NewsPanel';
import { TradePanel } from './panels/TradePanel';
import { WatchlistPanel } from './panels/WatchlistPanel';
import { RiskCalcPanel } from './panels/RiskCalcPanel';
import { HeatmapPanel } from './panels/HeatmapPanel';
import { ChartNotesPanel } from './panels/ChartNotesPanel';

const RAIL_W = 32;

const RIGHT_TABS: { id: RightTab; icon: React.ReactNode; label: string }[] = [
  { id: 'watchlist',  icon: <Star size={14} />,         label: 'Watchlist' },
  { id: 'properties', icon: <Settings size={14} />,     label: 'Properties' },
  { id: 'layers',     icon: <Layers size={14} />,       label: 'Layers' },
  { id: 'ai',         icon: <Bot size={14} />,          label: 'AI Analysis' },
  { id: 'orderflow',  icon: <BarChart3 size={14} />,    label: 'Orderflow' },
  { id: 'alerts',     icon: <Bell size={14} />,         label: 'Alerts' },
  { id: 'news',       icon: <Newspaper size={14} />,    label: 'News' },
  { id: 'trade',      icon: <ShoppingCart size={14} />, label: 'Trade' },
  { id: 'risk',       icon: <Calculator size={14} />,   label: 'Risk Calc' },
  { id: 'heatmap',    icon: <LayoutGrid size={14} />,   label: 'Heatmap' },
  { id: 'notes',      icon: <FileText size={14} />,     label: 'Chart Notes' },
];

function PanelContent({ tab }: { tab: RightTab }) {
  switch (tab) {
    case 'watchlist':  return <WatchlistPanel />;
    case 'properties': return <PropertiesPanel />;
    case 'layers':     return <LayersPanel />;
    case 'ai':         return <AIPanel />;
    case 'orderflow':  return <OrderflowPanel />;
    case 'alerts':     return <AlertsPanel />;
    case 'news':       return <NewsPanel />;
    case 'trade':      return <TradePanel />;
    case 'risk':       return <RiskCalcPanel />;
    case 'heatmap':    return <HeatmapPanel />;
    case 'notes':      return <ChartNotesPanel />;
  }
}

export function RightStack() {
  const { state, dispatch } = useWorkspace();

  return (
    <div style={{
      display: 'flex', flexDirection: 'row',
      width: '100%', height: '100%',
      background: T.surface, overflow: 'hidden',
    }}>
      {/* Vertical icon rail */}
      <div style={{
        width: RAIL_W, flexShrink: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        paddingTop: 4, paddingBottom: 4, gap: 2,
        borderRight: `1px solid ${T.border}`,
        background: T.bg,
        overflowY: 'auto', overflowX: 'hidden',
      }}>
        {RIGHT_TABS.map(tab => {
          const active = state.rightTab === tab.id;
          return (
            <button
              key={tab.id}
              title={tab.label}
              onClick={() => dispatch({ type: 'SET_RIGHT_TAB', tab: tab.id })}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 28, height: 28, borderRadius: 4, border: 'none', outline: 'none',
                background: active ? T.accentBg : 'transparent',
                color: active ? T.accent : T.text3,
                cursor: 'pointer', flexShrink: 0,
                transition: 'background 0.12s, color 0.12s',
              }}
              onMouseEnter={e => { if (!active) { e.currentTarget.style.background = T.hover; e.currentTarget.style.color = T.text1; } }}
              onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.text3; } }}
            >
              {tab.icon}
            </button>
          );
        })}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Close button — always visible, closes panel */}
        {state.rightTab && (
          <button
            title="Close panel"
            onClick={() => dispatch({ type: 'SET_RIGHT_TAB', tab: state.rightTab! })}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 28, height: 28, borderRadius: 4, border: 'none', outline: 'none',
              background: 'transparent', color: T.text3, cursor: 'pointer', flexShrink: 0,
              marginBottom: 2,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = T.hover; e.currentTarget.style.color = T.text1; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.text3; }}
          >
            <X size={13} />
          </button>
        )}
      </div>

      {/* Panel content */}
      <div style={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
        {state.rightTab && <PanelContent tab={state.rightTab} />}
      </div>
    </div>
  );
}
