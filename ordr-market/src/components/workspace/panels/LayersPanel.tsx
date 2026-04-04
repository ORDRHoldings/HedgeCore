'use client';
import React, { useState, useRef } from 'react';
import { Eye, EyeOff, Lock, Unlock, GripVertical, Layers as LayersIcon, ChevronDown, ChevronRight } from 'lucide-react';
import { T } from '../tokens';
import { useWorkspace } from '../WorkspaceProvider';

export function LayersPanel() {
  const { state, dispatch } = useWorkspace();

  const dragIdRef   = useRef<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const indicatorLayers = state.indicators.map(ind => ({
    id: ind.id,
    name: `${ind.name}${ind.params ? ` (${ind.params})` : ''}`,
    color: ind.color,
    visible: ind.visible,
    opacity: ind.opacity,
    locked: ind.locked,
  }));

  const overlayLayers = [
    ...(state.showSR  ? [{ id: '__sr',  name: 'Support / Resistance', color: '#FF9800' }] : []),
    ...(state.showFVG ? [{ id: '__fvg', name: 'Fair Value Gaps',       color: '#7C4DFF' }] : []),
  ];

  const totalCount = indicatorLayers.length + overlayLayers.length;

  function onDragStart(id: string) { dragIdRef.current = id; }
  function onDragEnter(id: string) { if (dragIdRef.current && dragIdRef.current !== id) setDragOver(id); }
  function onDragEnd() {
    const fromId = dragIdRef.current;
    const toId   = dragOver;
    dragIdRef.current = null;
    setDragOver(null);
    if (!fromId || !toId || fromId === toId) return;
    const ids = indicatorLayers.map(l => l.id);
    const fromIdx = ids.indexOf(fromId);
    const toIdx   = ids.indexOf(toId);
    if (fromIdx < 0 || toIdx < 0) return;
    const next = [...ids];
    next.splice(fromIdx, 1);
    next.splice(toIdx, 0, fromId);
    dispatch({ type: 'REORDER_INDICATORS', ids: next });
  }

  const rowBase: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 5,
    padding: '4px 8px', margin: '0 2px', borderRadius: 3, marginBottom: 1,
    transition: 'background 0.08s',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ padding: '8px 10px', borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <LayersIcon size={12} color={T.text2} />
          <span style={{ fontSize: 11, fontWeight: 600, color: T.text1, fontFamily: T.font }}>
            {totalCount} Layer{totalCount !== 1 ? 's' : ''}
          </span>
        </div>
        <p style={{ fontSize: 9, color: T.text3, margin: '3px 0 0', fontFamily: T.font }}>
          Click row to expand settings · drag to reorder
        </p>
      </div>

      {/* Layer list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>

        {totalCount === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 20 }}>
            <LayersIcon size={24} color={T.text3} style={{ opacity: 0.3, marginBottom: 8 }} />
            <span style={{ fontSize: 11, color: T.text3, fontFamily: T.font, textAlign: 'center' }}>
              No active layers. Add indicators or enable S/R and FVG overlays.
            </span>
          </div>
        ) : (
          <>
            {indicatorLayers.map(layer => {
              const isExpanded = expanded === layer.id;
              const hexColor = layer.color.startsWith('#') ? layer.color : '#64A8F0';
              return (
                <div key={layer.id}>
                  {/* Main row */}
                  <div
                    draggable
                    onDragStart={() => onDragStart(layer.id)}
                    onDragEnter={() => onDragEnter(layer.id)}
                    onDragEnd={onDragEnd}
                    onDragOver={e => e.preventDefault()}
                    style={{
                      ...rowBase,
                      opacity: layer.visible ? 1 : 0.45,
                      background: dragOver === layer.id ? T.accentBg : isExpanded ? T.panelActive : 'transparent',
                      cursor: 'pointer', userSelect: 'none',
                    }}
                    onMouseEnter={e => { if (dragOver !== layer.id && !isExpanded) (e.currentTarget as HTMLElement).style.background = T.panelHover; }}
                    onMouseLeave={e => { if (dragOver !== layer.id && !isExpanded) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                    onClick={() => setExpanded(prev => prev === layer.id ? null : layer.id)}
                  >
                    <GripVertical size={9} color={T.text3} style={{ flexShrink: 0, opacity: 0.4 }} />
                    {/* Color dot — opens color picker */}
                    <label
                      title="Change color"
                      style={{ position: 'relative', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center' }}
                      onClick={e => e.stopPropagation()}
                    >
                      <span style={{
                        display: 'block', width: 9, height: 9, borderRadius: '50%',
                        background: layer.color, border: '1px solid rgba(255,255,255,0.18)',
                        flexShrink: 0,
                      }} />
                      <input
                        type="color" value={hexColor}
                        onChange={e => dispatch({ type: 'SET_INDICATOR_COLOR', id: layer.id, color: e.target.value })}
                        style={{ position: 'absolute', opacity: 0, width: '100%', height: '100%', top: 0, left: 0, cursor: 'pointer' }}
                      />
                    </label>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 10, fontWeight: 500, color: T.text1, fontFamily: T.font, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {layer.name}
                      </div>
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); dispatch({ type: 'TOGGLE_INDICATOR_VISIBILITY', id: layer.id }); }}
                      style={{ display: 'flex', alignItems: 'center', border: 'none', background: 'none', cursor: 'pointer', padding: 2, outline: 'none', color: layer.visible ? T.text2 : T.text3 }}
                      title={layer.visible ? 'Hide' : 'Show'}
                    >
                      {layer.visible ? <Eye size={11} /> : <EyeOff size={11} />}
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); dispatch({ type: 'TOGGLE_INDICATOR_LOCK', id: layer.id }); }}
                      style={{ display: 'flex', alignItems: 'center', border: 'none', background: 'none', cursor: 'pointer', padding: 2, outline: 'none', color: layer.locked ? T.warn : T.text3 }}
                      title={layer.locked ? 'Unlock' : 'Lock'}
                    >
                      {layer.locked ? <Lock size={11} /> : <Unlock size={11} />}
                    </button>
                    {isExpanded
                      ? <ChevronDown size={9} color={T.accent} />
                      : <ChevronRight size={9} color={T.text3} />}
                  </div>

                  {/* Inline settings panel */}
                  {isExpanded && (
                    <div style={{
                      margin: '0 6px 6px 6px', padding: '10px',
                      background: T.surfaceAlt, borderRadius: 4,
                      border: `1px solid ${T.border}`,
                    }}>
                      {/* Opacity slider */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                        <span style={{ fontSize: 9, color: T.text3, fontFamily: T.font, width: 44, flexShrink: 0 }}>Opacity</span>
                        <input
                          type="range" min={0.05} max={1} step={0.05}
                          value={layer.opacity}
                          onChange={e => dispatch({ type: 'SET_INDICATOR_OPACITY', id: layer.id, opacity: parseFloat(e.target.value) })}
                          style={{ flex: 1, accentColor: layer.color, cursor: 'pointer', height: 3 }}
                        />
                        <span style={{ fontSize: 9, color: T.text2, fontFamily: T.mono, width: 26, textAlign: 'right' }}>
                          {Math.round(layer.opacity * 100)}%
                        </span>
                      </div>
                      {/* Color picker row */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                        <span style={{ fontSize: 9, color: T.text3, fontFamily: T.font, width: 44, flexShrink: 0 }}>Color</span>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', position: 'relative' }}>
                          <span style={{
                            display: 'block', width: 22, height: 14, borderRadius: 2,
                            background: layer.color, border: '1px solid rgba(255,255,255,0.18)',
                          }} />
                          <input
                            type="color" value={hexColor}
                            onChange={e => dispatch({ type: 'SET_INDICATOR_COLOR', id: layer.id, color: e.target.value })}
                            style={{ position: 'absolute', opacity: 0, width: '100%', height: '100%', top: 0, left: 0, cursor: 'pointer' }}
                          />
                          <span style={{ fontSize: 9, color: T.text2, fontFamily: T.mono }}>{layer.color}</span>
                        </label>
                      </div>
                      {/* Remove button */}
                      <button
                        onClick={() => { dispatch({ type: 'REMOVE_INDICATOR', id: layer.id }); setExpanded(null); }}
                        style={{
                          width: '100%', height: 22, borderRadius: 3,
                          border: `1px solid rgba(239,83,80,0.35)`, background: 'rgba(239,83,80,0.08)',
                          color: T.danger, fontSize: 9, fontFamily: T.font, cursor: 'pointer', outline: 'none',
                        }}
                      >
                        Remove indicator
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Non-draggable overlay rows */}
            {overlayLayers.length > 0 && (
              <>
                {indicatorLayers.length > 0 && (
                  <div style={{ height: 1, background: T.border, margin: '4px 8px' }} />
                )}
                {overlayLayers.map(layer => (
                  <div
                    key={layer.id}
                    style={{ ...rowBase, background: 'transparent' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = T.panelHover; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  >
                    <div style={{ width: 9, flexShrink: 0 }} />
                    <span style={{ width: 9, height: 9, borderRadius: '50%', background: layer.color, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 10, fontWeight: 500, color: T.text1, fontFamily: T.font, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {layer.name}
                      </div>
                      <div style={{ fontSize: 9, color: T.text3, fontFamily: T.font }}>overlay · always on</div>
                    </div>
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
