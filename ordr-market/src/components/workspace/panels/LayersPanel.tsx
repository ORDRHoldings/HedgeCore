'use client';
import React from 'react';
import { Eye, EyeOff, Lock, Unlock, GripVertical, Layers as LayersIcon, Volume2, VolumeX } from 'lucide-react';
import { T } from '../tokens';
import { useWorkspace } from '../WorkspaceProvider';

export function LayersPanel() {
  const { state, dispatch } = useWorkspace();

  // Build layers from indicators + built-in overlays
  const overlayLayers = [
    ...(state.showSR ? [{ id: '__sr', name: 'Support / Resistance', type: 'overlay' as const, color: '#FF9800' }] : []),
    ...(state.showFVG ? [{ id: '__fvg', name: 'Fair Value Gaps', type: 'overlay' as const, color: '#7C4DFF' }] : []),
  ];

  const indicatorLayers = state.indicators.map(ind => ({
    id: ind.id, name: `${ind.name}${ind.params ? ` (${ind.params})` : ''}`,
    type: 'indicator' as const, color: ind.color, visible: ind.visible,
    opacity: ind.opacity, locked: ind.locked,
  }));

  const allLayers = [...overlayLayers.map(o => ({ ...o, visible: true, opacity: 1, locked: false })), ...indicatorLayers];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header info */}
      <div style={{ padding: '8px 10px', borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <LayersIcon size={12} color={T.text2} />
          <span style={{ fontSize: 11, fontWeight: 600, color: T.text1, fontFamily: T.font }}>
            {allLayers.length} Layers
          </span>
        </div>
        <p style={{ fontSize: 9, color: T.text3, margin: '3px 0 0', fontFamily: T.font }}>
          Manage visibility, opacity, and order of chart overlays.
        </p>
      </div>

      {/* Layer list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {allLayers.length === 0 ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', height: '100%', padding: 20,
          }}>
            <LayersIcon size={24} color={T.text3} style={{ opacity: 0.3, marginBottom: 8 }} />
            <span style={{ fontSize: 11, color: T.text3, fontFamily: T.font, textAlign: 'center' }}>
              No active layers. Add indicators or enable S/R and FVG overlays.
            </span>
          </div>
        ) : (
          allLayers.map(layer => (
            <div
              key={layer.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '5px 8px', margin: '0 4px', borderRadius: 3,
                opacity: layer.visible ? 1 : 0.5,
                marginBottom: 1,
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = T.panelHover; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              <GripVertical size={10} color={T.text3} style={{ cursor: 'grab', flexShrink: 0, opacity: 0.5 }} />
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: layer.color, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 10, fontWeight: 500, color: T.text1, fontFamily: T.font, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {layer.name}
                </div>
                <div style={{ fontSize: 9, color: T.text3, fontFamily: T.font }}>
                  {layer.type} · {Math.round(layer.opacity * 100)}%
                </div>
              </div>

              {/* Controls */}
              {layer.type === 'indicator' && (
                <>
                  <button
                    onClick={() => dispatch({ type: 'TOGGLE_INDICATOR_VISIBILITY', id: layer.id })}
                    style={{ display: 'flex', alignItems: 'center', border: 'none', background: 'none', cursor: 'pointer', padding: 2, outline: 'none', color: layer.visible ? T.text2 : T.text3 }}
                    title={layer.visible ? 'Hide' : 'Show'}
                  >
                    {layer.visible ? <Eye size={11} /> : <EyeOff size={11} />}
                  </button>
                  <button
                    onClick={() => dispatch({ type: 'TOGGLE_INDICATOR_LOCK', id: layer.id })}
                    style={{ display: 'flex', alignItems: 'center', border: 'none', background: 'none', cursor: 'pointer', padding: 2, outline: 'none', color: layer.locked ? T.warn : T.text3 }}
                    title={layer.locked ? 'Unlock' : 'Lock'}
                  >
                    {layer.locked ? <Lock size={11} /> : <Unlock size={11} />}
                  </button>
                  <button
                    onClick={() => dispatch({ type: 'SOLO_LAYER', id: layer.id })}
                    style={{ display: 'flex', alignItems: 'center', border: 'none', background: 'none', cursor: 'pointer', padding: 2, outline: 'none', color: T.text3 }}
                    title="Solo this layer"
                  >
                    <Volume2 size={11} />
                  </button>
                </>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
