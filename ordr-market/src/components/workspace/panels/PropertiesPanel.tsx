'use client';
import React, { useState } from 'react';
import { Palette, Grid3x3, Type, Ruler, Eye, RotateCcw } from 'lucide-react';
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

function ColorSwatch({ color, active, onClick }: { color: string; active?: boolean; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: 16, height: 16, borderRadius: 3,
        background: color, border: active ? `2px solid ${T.accent}` : `1px solid ${T.border}`,
        cursor: 'pointer', outline: 'none', flexShrink: 0,
      }}
    />
  );
}

export function PropertiesPanel() {
  const { state, dispatch } = useWorkspace();
  const [bullColor, setBullColor] = useState('#26A69A');
  const [bearColor, setBearColor] = useState('#EF5350');
  const [gridVisible, setGridVisible] = useState(true);
  const [axisVisible, setAxisVisible] = useState(true);

  const hasSelection = state.selectedObjectId !== null;

  return (
    <div style={{ overflowY: 'auto', height: '100%' }}>
      {!hasSelection ? (
        <>
          {/* Chart styling */}
          <SectionHeader label="CHART STYLE" />
          <PropertyRow label="Chart type">
            <span style={{ fontSize: 10, color: T.text1, fontFamily: T.font, fontWeight: 500 }}>
              {state.chartType.charAt(0).toUpperCase() + state.chartType.slice(1)}
            </span>
          </PropertyRow>
          <PropertyRow label="Bull candle">
            <ColorSwatch color={bullColor} active />
          </PropertyRow>
          <PropertyRow label="Bear candle">
            <ColorSwatch color={bearColor} active />
          </PropertyRow>

          <SectionHeader label="GRID & AXES" />
          <PropertyRow label="Grid lines">
            <button
              onClick={() => setGridVisible(!gridVisible)}
              style={{
                display: 'flex', alignItems: 'center', width: 28, height: 14,
                borderRadius: 7, border: 'none', padding: 0,
                background: gridVisible ? T.accent : T.border,
                cursor: 'pointer', position: 'relative', outline: 'none',
              }}
            >
              <div style={{
                position: 'absolute', top: 2, left: gridVisible ? 15 : 2,
                width: 10, height: 10, borderRadius: '50%', background: '#fff',
                transition: 'left 0.15s ease',
              }} />
            </button>
          </PropertyRow>
          <PropertyRow label="Price axis">
            <button
              onClick={() => setAxisVisible(!axisVisible)}
              style={{
                display: 'flex', alignItems: 'center', width: 28, height: 14,
                borderRadius: 7, border: 'none', padding: 0,
                background: axisVisible ? T.accent : T.border,
                cursor: 'pointer', position: 'relative', outline: 'none',
              }}
            >
              <div style={{
                position: 'absolute', top: 2, left: axisVisible ? 15 : 2,
                width: 10, height: 10, borderRadius: '50%', background: '#fff',
                transition: 'left 0.15s ease',
              }} />
            </button>
          </PropertyRow>

          <SectionHeader label="SCALE" />
          <PropertyRow label="Scale mode">
            <span style={{ fontSize: 10, color: T.text1, fontFamily: T.mono }}>Linear</span>
          </PropertyRow>
          <PropertyRow label="Auto scale">
            <span style={{ fontSize: 10, color: T.accent, fontWeight: 600 }}>On</span>
          </PropertyRow>

          <SectionHeader label="SESSIONS" />
          <PropertyRow label="London">
            <span style={{ fontSize: 10, color: T.text3, fontFamily: T.mono }}>08:00-16:30</span>
          </PropertyRow>
          <PropertyRow label="New York">
            <span style={{ fontSize: 10, color: T.text3, fontFamily: T.mono }}>13:30-20:00</span>
          </PropertyRow>
          <PropertyRow label="Tokyo">
            <span style={{ fontSize: 10, color: T.text3, fontFamily: T.mono }}>00:00-09:00</span>
          </PropertyRow>
        </>
      ) : (
        <>
          <SectionHeader label="SELECTED OBJECT" />
          <div style={{ padding: '12px 10px', fontSize: 11, color: T.text2, fontFamily: T.font }}>
            Object ID: {state.selectedObjectId}
          </div>
          <PropertyRow label="Color">
            <ColorSwatch color={T.accent} active />
          </PropertyRow>
          <PropertyRow label="Line width">
            <span style={{ fontSize: 10, color: T.text1, fontFamily: T.mono }}>1px</span>
          </PropertyRow>
          <PropertyRow label="Visible">
            <Eye size={12} color={T.text2} />
          </PropertyRow>
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
