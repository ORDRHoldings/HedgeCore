'use client';
import React from 'react';
import { LayoutGrid, Save, Upload, Trash2, Monitor, Tablet, Smartphone, Focus, LayoutDashboard, Zap } from 'lucide-react';
import { T } from '../tokens';
import { useWorkspace } from '../WorkspaceProvider';
import type { WorkspaceMode } from '../workspace-types';

const PRESET_LAYOUTS = [
  { id: 'default',   name: 'Default Workspace',    mode: 'workspace' as WorkspaceMode, desc: 'Full panel layout with watchlist' },
  { id: 'analysis',  name: 'Analysis Focus',       mode: 'focus' as WorkspaceMode,     desc: 'Maximum chart, no panels' },
  { id: 'execution', name: 'Trade Execution',      mode: 'execution' as WorkspaceMode, desc: 'Chart + order ticket + positions' },
  { id: 'smc',       name: 'SMC Analysis',         mode: 'workspace' as WorkspaceMode, desc: 'Layers + indicators + screener' },
];

export function LayoutsPanel() {
  const { state, dispatch } = useWorkspace();

  const modeIcon = (mode: WorkspaceMode) => {
    if (mode === 'focus') return <Focus size={12} />;
    if (mode === 'execution') return <Zap size={12} />;
    return <LayoutDashboard size={12} />;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Actions */}
      <div style={{ padding: '8px', display: 'flex', gap: 4, flexShrink: 0 }}>
        <button style={{
          display: 'flex', alignItems: 'center', gap: 4, flex: 1,
          padding: '6px 8px', borderRadius: 3, border: `1px solid ${T.border}`,
          background: T.surfaceAlt, color: T.text1, fontSize: 10,
          fontWeight: 500, fontFamily: T.font, cursor: 'pointer', outline: 'none',
          justifyContent: 'center',
        }}>
          <Save size={11} /> Save Current
        </button>
        <button style={{
          display: 'flex', alignItems: 'center', gap: 4, flex: 1,
          padding: '6px 8px', borderRadius: 3, border: `1px solid ${T.border}`,
          background: T.surfaceAlt, color: T.text1, fontSize: 10,
          fontWeight: 500, fontFamily: T.font, cursor: 'pointer', outline: 'none',
          justifyContent: 'center',
        }}>
          <Upload size={11} /> Import
        </button>
      </div>

      {/* Presets */}
      <div style={{ padding: '0 8px 4px' }}>
        <div style={{
          fontSize: 9, fontWeight: 700, color: T.text3,
          letterSpacing: '0.06em', fontFamily: T.font, marginBottom: 4,
        }}>PRESET LAYOUTS</div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 6px' }}>
        {PRESET_LAYOUTS.map(layout => {
          const active = state.mode === layout.mode;
          return (
            <div
              key={layout.id}
              onClick={() => dispatch({ type: 'SET_MODE', mode: layout.mode })}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 8px', borderRadius: 4,
                border: `1px solid ${active ? T.accent : T.border}`,
                background: active ? T.selectedBg : T.surfaceAlt,
                marginBottom: 4, cursor: 'pointer',
              }}
              onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = T.panelHover; }}
              onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = active ? T.selectedBg : T.surfaceAlt; }}
            >
              <span style={{ color: active ? T.accent : T.text2, flexShrink: 0 }}>
                {modeIcon(layout.mode)}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, fontWeight: 500, color: active ? T.accent : T.text1, fontFamily: T.font }}>{layout.name}</div>
                <div style={{ fontSize: 9, color: T.text3, fontFamily: T.font, marginTop: 1 }}>{layout.desc}</div>
              </div>
            </div>
          );
        })}

        {/* Responsive hints */}
        <div style={{
          fontSize: 9, fontWeight: 700, color: T.text3,
          letterSpacing: '0.06em', fontFamily: T.font, padding: '12px 2px 4px',
        }}>RESPONSIVE</div>
        {[
          { icon: <Monitor size={12} />, name: 'Desktop', desc: 'Full flagship experience' },
          { icon: <Tablet size={12} />,  name: 'Tablet',  desc: 'Simplified dock + panels' },
          { icon: <Smartphone size={12} />, name: 'Mobile', desc: 'Focus chart only' },
        ].map(r => (
          <div key={r.name} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '6px 8px', borderRadius: 4, marginBottom: 2,
          }}>
            <span style={{ color: T.text3 }}>{r.icon}</span>
            <div>
              <div style={{ fontSize: 10, fontWeight: 500, color: T.text2, fontFamily: T.font }}>{r.name}</div>
              <div style={{ fontSize: 9, color: T.text3 }}>{r.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
