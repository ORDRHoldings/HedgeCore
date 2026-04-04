'use client';
import React from 'react';
import { RotateCcw, Eye } from 'lucide-react';
import { T } from '../tokens';
import { useWorkspace } from '../WorkspaceProvider';

function PropertyRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '5px 10px', minHeight: 28,
    }}>
      <span style={{ fontSize: 10, color: T.text2, fontFamily: T.font, flexShrink: 0 }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>{children}</div>
    </div>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div style={{
      padding: '8px 10px 3px', fontSize: 9, fontWeight: 700,
      color: T.text3, letterSpacing: '0.06em', fontFamily: T.font,
      borderBottom: `1px solid ${T.border}`, marginBottom: 2,
    }}>
      {label}
    </div>
  );
}

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      style={{
        display: 'flex', alignItems: 'center', width: 28, height: 14,
        borderRadius: 7, border: 'none', padding: 0,
        background: on ? T.accent : T.border,
        cursor: 'pointer', position: 'relative', outline: 'none', flexShrink: 0,
      }}
    >
      <div style={{
        position: 'absolute', top: 2, left: on ? 15 : 2,
        width: 10, height: 10, borderRadius: '50%', background: '#fff',
        transition: 'left 0.15s ease',
      }} />
    </button>
  );
}

export function PropertiesPanel() {
  const { state, dispatch } = useWorkspace();

  const cfg           = state.chartConfig;
  const trendlinesOn  = !!cfg['trendlines'];
  const msOn          = !!cfg['marketStructure'];
  const patternsOn    = !!cfg['patterns'];
  const pivotOn       = !!cfg['pivotPoints'];

  const hasSelection = state.selectedObjectId !== null;

  const activeOverlayLabels = [
    state.showSR    && 'S/R',
    state.showFVG   && 'FVG',
    trendlinesOn    && 'Trendlines',
    msOn            && 'Market Structure',
    patternsOn      && 'Patterns',
    pivotOn         && 'Pivots',
  ].filter(Boolean).join(', ') || 'None';

  return (
    <div style={{ overflowY: 'auto', height: '100%' }}>
      {!hasSelection ? (
        <>
          {/* Chart type */}
          <SectionHeader label="CHART STYLE" />
          <PropertyRow label="Chart type">
            <span style={{ fontSize: 10, color: T.text1, fontFamily: T.font, fontWeight: 500 }}>
              {state.chartType.charAt(0).toUpperCase() + state.chartType.slice(1)}
            </span>
          </PropertyRow>
          <PropertyRow label="Timeframe">
            <span style={{ fontSize: 10, color: T.text1, fontFamily: T.mono, fontWeight: 500 }}>
              {state.timeframe}
            </span>
          </PropertyRow>

          {/* Overlay toggles — wired to real dispatch */}
          <SectionHeader label="OVERLAYS" />
          <PropertyRow label="Support / Resistance">
            <Toggle on={state.showSR} onToggle={() => dispatch({ type: 'TOGGLE_SR' })} />
          </PropertyRow>
          <PropertyRow label="Fair Value Gaps">
            <Toggle on={state.showFVG} onToggle={() => dispatch({ type: 'TOGGLE_FVG' })} />
          </PropertyRow>
          <PropertyRow label="Trendlines (auto)">
            <Toggle on={trendlinesOn} onToggle={() => dispatch({ type: 'TOGGLE_CHART_INDICATOR', key: 'trendlines' })} />
          </PropertyRow>
          <PropertyRow label="Market Structure">
            <Toggle on={msOn} onToggle={() => dispatch({ type: 'TOGGLE_CHART_INDICATOR', key: 'marketStructure' })} />
          </PropertyRow>
          <PropertyRow label="Chart Patterns">
            <Toggle on={patternsOn} onToggle={() => dispatch({ type: 'TOGGLE_CHART_INDICATOR', key: 'patterns' })} />
          </PropertyRow>
          <PropertyRow label="Pivot Points">
            <Toggle on={pivotOn} onToggle={() => dispatch({ type: 'TOGGLE_CHART_INDICATOR', key: 'pivotPoints' })} />
          </PropertyRow>

          {/* Indicators summary */}
          <SectionHeader label="INDICATORS" />
          <PropertyRow label="Active count">
            <span style={{ fontSize: 10, color: state.indicators.length > 0 ? T.text1 : T.text3, fontFamily: T.mono, fontWeight: 600 }}>
              {state.indicators.length}
            </span>
          </PropertyRow>
          <PropertyRow label="Active overlays">
            <span style={{ fontSize: 9, color: T.text2, fontFamily: T.font, maxWidth: 140, textAlign: 'right', lineHeight: 1.4 }}>
              {activeOverlayLabels}
            </span>
          </PropertyRow>

          {/* Scale */}
          <SectionHeader label="SCALE" />
          <PropertyRow label="Scale mode">
            <span style={{ fontSize: 10, color: T.text1, fontFamily: T.mono }}>Linear</span>
          </PropertyRow>
          <PropertyRow label="Auto scale">
            <span style={{ fontSize: 10, color: T.accent, fontWeight: 600 }}>On</span>
          </PropertyRow>

          {/* Sessions */}
          <SectionHeader label="SESSIONS (UTC)" />
          {[
            { key: 'sydney',   label: 'Sydney',   hours: '22:00–07:00' },
            { key: 'tokyo',    label: 'Tokyo',    hours: '00:00–09:00' },
            { key: 'london',   label: 'London',   hours: '08:00–17:00' },
            { key: 'newyork',  label: 'New York', hours: '13:00–22:00' },
          ].map(({ key, label, hours }) => {
            const on = state.enabledSessions.includes(key);
            return (
              <PropertyRow key={key} label={label}>
                <span style={{ fontSize: 9, color: T.text3, fontFamily: T.mono, marginRight: 6 }}>{hours}</span>
                <Toggle on={on} onToggle={() => dispatch({ type: 'TOGGLE_SESSION', session: key })} />
              </PropertyRow>
            );
          })}
        </>
      ) : (
        <>
          <SectionHeader label="SELECTED DRAWING" />
          {state.selectedObjectData && state.selectedObjectId ? (
            <>
              <PropertyRow label="Type">
                <span style={{ fontSize: 10, color: T.text1, fontFamily: T.mono, fontWeight: 500, textTransform: 'capitalize' }}>
                  {state.selectedObjectData.type.replace(/([A-Z])/g, ' $1').trim()}
                </span>
              </PropertyRow>

              {/* Color picker */}
              <PropertyRow label="Color">
                <label style={{ position: 'relative', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: 3,
                    background: state.selectedObjectData.color,
                    border: `1px solid ${T.border}`, flexShrink: 0,
                  }} />
                  <span style={{ fontSize: 10, color: T.text2, fontFamily: T.mono }}>{state.selectedObjectData.color}</span>
                  <input
                    type="color"
                    value={state.selectedObjectData.color}
                    onChange={e => dispatch({ type: 'UPDATE_DRAWING_STYLE', id: state.selectedObjectId!, patch: { color: e.target.value } })}
                    style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', cursor: 'pointer', border: 'none', padding: 0 }}
                  />
                </label>
              </PropertyRow>

              {/* Line width */}
              <PropertyRow label="Line width">
                <input
                  type="number"
                  min={0.5} max={6} step={0.5}
                  value={state.selectedObjectData.lineWidth}
                  onChange={e => dispatch({ type: 'UPDATE_DRAWING_STYLE', id: state.selectedObjectId!, patch: { lineWidth: Number(e.target.value) } })}
                  style={{
                    width: 44, padding: '2px 4px', fontSize: 10, fontFamily: T.mono,
                    background: T.surfaceAlt, border: `1px solid ${T.border}`, borderRadius: 3,
                    color: T.text1, outline: 'none', textAlign: 'right',
                  }}
                />
                <span style={{ fontSize: 10, color: T.text3, fontFamily: T.mono }}>px</span>
              </PropertyRow>

              {/* Line style */}
              <PropertyRow label="Style">
                <select
                  value={state.selectedObjectData.lineStyle}
                  onChange={e => dispatch({ type: 'UPDATE_DRAWING_STYLE', id: state.selectedObjectId!, patch: { lineStyle: e.target.value } })}
                  style={{
                    padding: '2px 4px', fontSize: 10, fontFamily: T.mono,
                    background: T.surfaceAlt, border: `1px solid ${T.border}`, borderRadius: 3,
                    color: T.text1, outline: 'none', cursor: 'pointer',
                  }}
                >
                  <option value="solid">Solid</option>
                  <option value="dashed">Dashed</option>
                  <option value="dotted">Dotted</option>
                </select>
              </PropertyRow>

              {/* Opacity slider */}
              <PropertyRow label="Opacity">
                <input
                  type="range"
                  min={0.1} max={1} step={0.05}
                  value={state.selectedObjectData.opacity}
                  onChange={e => dispatch({ type: 'UPDATE_DRAWING_STYLE', id: state.selectedObjectId!, patch: { opacity: Number(e.target.value) } })}
                  style={{ width: 80, accentColor: T.accent, cursor: 'pointer' }}
                />
                <span style={{ fontSize: 10, color: T.text1, fontFamily: T.mono, minWidth: 28, textAlign: 'right' }}>
                  {Math.round(state.selectedObjectData.opacity * 100)}%
                </span>
              </PropertyRow>

              {state.selectedObjectData.label && (
                <PropertyRow label="Label">
                  <span style={{ fontSize: 10, color: T.text2, fontFamily: T.font, maxWidth: 120, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {state.selectedObjectData.label}
                  </span>
                </PropertyRow>
              )}
              <PropertyRow label="Locked">
                <Eye size={12} color={state.selectedObjectData.locked ? T.accent : T.text3} />
                <span style={{ fontSize: 10, color: state.selectedObjectData.locked ? T.accent : T.text3, fontFamily: T.mono }}>
                  {state.selectedObjectData.locked ? 'Yes' : 'No'}
                </span>
              </PropertyRow>
            </>
          ) : (
            <div style={{ padding: '8px 10px', fontSize: 10, color: T.text3, fontFamily: T.mono }}>
              {state.selectedObjectId?.slice(0, 16)}…
            </div>
          )}
          <div style={{ padding: '8px 10px' }}>
            <button
              onClick={() => dispatch({ type: 'SET_SELECTED_OBJECT', id: null })}
              style={{
                display: 'flex', alignItems: 'center', gap: 4, width: '100%',
                padding: '6px 8px', borderRadius: 3, border: `1px solid ${T.border}`,
                background: 'transparent', color: T.text2, fontSize: 10,
                fontFamily: T.font, cursor: 'pointer', outline: 'none',
                justifyContent: 'center',
              }}
            >
              <RotateCcw size={10} /> Deselect
            </button>
          </div>
        </>
      )}
    </div>
  );
}
