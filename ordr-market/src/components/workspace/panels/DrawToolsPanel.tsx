'use client';
import React from 'react';
import {
  MousePointer2, Crosshair, TrendingUp, Minus, ArrowRight, ChevronsUpDown,
  GitBranch, Layers, Square, Circle, Pen, Type, Ruler, Magnet, Lock, Eye, Trash2,
} from 'lucide-react';
import { T } from '../tokens';
import { useWorkspace } from '../WorkspaceProvider';

// Map workspace tool IDs to ChartEngine DrawingType values
const DRAWING_MODE_MAP: Record<string, string | null> = {
  cursor: null, crosshair: null,
  trendline: 'trendline', ray: 'ray', hline: 'horizontal',
  channel: 'parallel_channel', pitchfork: 'pitchfork', fib: 'fibonacci',
  rect: 'rectangle', ellipse: 'ellipse', path: 'brush', text: 'text_note',
  measure: 'date_price_range',
  magnet: null, lock: null, eye: null, trash: null,
};

interface ToolGroup {
  label: string;
  tools: { id: string; icon: React.ReactNode; name: string; shortcut?: string }[];
}

const TOOL_GROUPS: ToolGroup[] = [
  {
    label: 'POINTER',
    tools: [
      { id: 'cursor',    icon: <MousePointer2 size={14} />, name: 'Pointer',   shortcut: 'V' },
      { id: 'crosshair', icon: <Crosshair size={14} />,     name: 'Crosshair', shortcut: 'Shift+V' },
    ],
  },
  {
    label: 'LINES',
    tools: [
      { id: 'trendline', icon: <TrendingUp size={14} />,    name: 'Trend Line',   shortcut: 'Alt+T' },
      { id: 'ray',       icon: <ArrowRight size={14} />,    name: 'Ray' },
      { id: 'hline',     icon: <Minus size={14} />,         name: 'Horizontal' },
      { id: 'channel',   icon: <ChevronsUpDown size={14} />, name: 'Channel' },
      { id: 'pitchfork', icon: <GitBranch size={14} />,     name: 'Pitchfork' },
      { id: 'fib',       icon: <Layers size={14} />,        name: 'Fibonacci' },
    ],
  },
  {
    label: 'SHAPES',
    tools: [
      { id: 'rect',    icon: <Square size={14} />, name: 'Rectangle' },
      { id: 'ellipse', icon: <Circle size={14} />, name: 'Ellipse' },
      { id: 'path',    icon: <Pen size={14} />,    name: 'Path / Brush' },
      { id: 'text',    icon: <Type size={14} />,   name: 'Text Note' },
    ],
  },
  {
    label: 'MEASURE',
    tools: [
      { id: 'measure', icon: <Ruler size={14} />, name: 'Measure', shortcut: 'M' },
    ],
  },
  {
    label: 'MANAGE',
    tools: [
      { id: 'magnet', icon: <Magnet size={14} />, name: 'Magnet Mode' },
      { id: 'lock',   icon: <Lock size={14} />,   name: 'Lock Drawings' },
      { id: 'eye',    icon: <Eye size={14} />,    name: 'Show / Hide' },
      { id: 'trash',  icon: <Trash2 size={14} />, name: 'Remove All' },
    ],
  },
];

export function DrawToolsPanel() {
  const { state, dispatch } = useWorkspace();

  return (
    <div style={{ overflowY: 'auto', height: '100%', padding: '4px 0' }}>
      {TOOL_GROUPS.map(group => (
        <div key={group.label}>
          <div style={{
            padding: '6px 10px 3px', fontSize: 9, fontWeight: 700,
            color: T.text3, letterSpacing: '0.06em', fontFamily: T.font,
          }}>
            {group.label}
          </div>
          {group.tools.map(tool => {
            // Toggle tools reflect workspace state
            const active = tool.id === 'magnet' ? state.magnetEnabled
              : tool.id === 'lock' ? state.lockDrawings
              : tool.id === 'eye' ? state.hideDrawings
              : state.activeTool === tool.id;
            return (
              <div
                key={tool.id}
                onClick={() => {
                  if (tool.id === 'magnet') { dispatch({ type: 'TOGGLE_MAGNET' }); return; }
                  if (tool.id === 'lock') { dispatch({ type: 'TOGGLE_LOCK_DRAWINGS' }); return; }
                  if (tool.id === 'eye') { dispatch({ type: 'TOGGLE_HIDE_DRAWINGS' }); return; }
                  if (tool.id === 'trash') { dispatch({ type: 'DELETE_ALL_DRAWINGS' }); return; }
                  dispatch({ type: 'SET_TOOL', tool: tool.id });
                  const mode = DRAWING_MODE_MAP[tool.id];
                  dispatch({ type: 'SET_DRAWING_MODE', mode: mode !== undefined ? mode : null });
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '5px 10px', cursor: 'pointer', borderRadius: 3,
                  background: active ? T.accentBg : 'transparent',
                  margin: '0 4px', marginBottom: 1,
                }}
                onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = T.panelHover; }}
                onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = active ? T.accentBg : 'transparent'; }}
              >
                <span style={{ color: active ? T.accent : T.text2, flexShrink: 0 }}>{tool.icon}</span>
                <span style={{ flex: 1, fontSize: 11, fontWeight: active ? 600 : 400, color: active ? T.accent : T.text1, fontFamily: T.font }}>
                  {tool.name}
                </span>
                {tool.shortcut && (
                  <span style={{
                    fontSize: 9, color: T.text3, fontFamily: T.mono,
                    padding: '1px 4px', borderRadius: 2, background: T.surfaceAlt,
                  }}>
                    {tool.shortcut}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
