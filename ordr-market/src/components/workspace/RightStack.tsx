'use client';
/**
 * ORDR Market — Right Tabbed Stack
 * 280px dockable right sidebar with tabs: Properties, Layers, AI, Orderflow, Alerts, News, Trade.
 */
import React from 'react';
import {
  Settings, Layers, Bot, BarChart3, Bell, Newspaper, ShoppingCart,
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

const RIGHT_TABS: { id: RightTab; icon: React.ReactNode; label: string }[] = [
  { id: 'properties', icon: <Settings size={13} />,      label: 'Properties' },
  { id: 'layers',     icon: <Layers size={13} />,        label: 'Layers' },
  { id: 'ai',         icon: <Bot size={13} />,           label: 'AI' },
  { id: 'orderflow',  icon: <BarChart3 size={13} />,     label: 'Orderflow' },
  { id: 'alerts',     icon: <Bell size={13} />,          label: 'Alerts' },
  { id: 'news',       icon: <Newspaper size={13} />,     label: 'News' },
  { id: 'trade',      icon: <ShoppingCart size={13} />,  label: 'Trade' },
];

function PanelContent({ tab }: { tab: RightTab }) {
  switch (tab) {
    case 'properties': return <PropertiesPanel />;
    case 'layers':     return <LayersPanel />;
    case 'ai':         return <AIPanel />;
    case 'orderflow':  return <OrderflowPanel />;
    case 'alerts':     return <AlertsPanel />;
    case 'news':       return <NewsPanel />;
    case 'trade':      return <TradePanel />;
  }
}

export function RightStack() {
  const { state, dispatch } = useWorkspace();

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      width: '100%', height: '100%',
      background: T.surface, overflow: 'hidden',
    }}>
      {/* Tab bar */}
      <div style={{
        display: 'flex', alignItems: 'center', height: 30,
        borderBottom: `1px solid ${T.border}`, flexShrink: 0,
        overflowX: 'auto', overflowY: 'hidden',
        gap: 0, padding: '0 2px',
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
                gap: 4, padding: '0 8px', height: 28, minWidth: 0,
                borderRadius: 3, border: 'none', outline: 'none',
                background: active ? T.accentBg : 'transparent',
                color: active ? T.accent : T.text3,
                fontSize: 10, fontWeight: active ? 600 : 400,
                fontFamily: T.font, cursor: 'pointer', flexShrink: 0,
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={e => { if (!active) { e.currentTarget.style.background = T.hover; e.currentTarget.style.color = T.text1; } }}
              onMouseLeave={e => { if (!active) { e.currentTarget.style.background = active ? T.accentBg : 'transparent'; e.currentTarget.style.color = active ? T.accent : T.text3; } }}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Panel content */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {state.rightTab && <PanelContent tab={state.rightTab} />}
      </div>
    </div>
  );
}
