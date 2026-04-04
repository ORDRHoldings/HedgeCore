'use client';
import React, { useState } from 'react';
import {
  MousePointer2, Crosshair,
  TrendingUp, Minus, ArrowRight, ArrowLeftRight, MoveHorizontal, ArrowUpDown,
  ChevronsUpDown, LineChart, AlignCenter,
  GitBranch, GitFork, GitMerge, GitPullRequestArrow,
  Layers, Percent, Timer, Zap,
  LayoutGrid, Wind,
  Activity, Hexagon, Triangle, ListOrdered,
  Waves,
  Square, Circle, Pentagon, Pen, Type, ArrowBigRight, Spline,
  Anchor, MessageSquare, Tag, Flag, ArrowUpCircle, ArrowDownCircle,
  Ruler, CalendarRange, DollarSign, Telescope,
  ArrowUpRight, ArrowDownRight,
  Magnet, Lock, Eye, Trash2,
  ChevronDown, ChevronRight,
} from 'lucide-react';
import { T } from '../tokens';
import { useWorkspace } from '../WorkspaceProvider';

// Map panel tool IDs → DrawingType values (null = not a drawing mode)
const DRAWING_MODE_MAP: Record<string, string | null> = {
  // pointer
  cursor: null, crosshair: null,
  // lines
  trendline:      'trendline',
  extended_line:  'extended_line',
  ray:            'ray',
  hray:           'horizontal_ray',
  hline:          'horizontal',
  vline:          'vertical_line',
  crossline:      'cross_line',
  infoline:       'info_line',
  trend_angle:    'trend_angle',
  // channels
  channel:        'parallel_channel',
  regression:     'regression_trend',
  flat_channel:   'flat_top_bottom',
  disjoint:       'disjoint_channel',
  // pitchforks
  pitchfork:      'pitchfork',
  schiff:         'schiff_pitchfork',
  mod_schiff:     'mod_schiff_pitchfork',
  inside_fork:    'inside_pitchfork',
  // fibonacci
  fib:            'fibonacci',
  fib_ext:        'fib_extension',
  fib_chan:       'fib_channel',
  fib_time:       'fib_time_zone',
  fib_speed:      'fib_speed_fan',
  // gann
  gann_box:       'gann_box',
  gann_fan:       'gann_fan',
  // harmonic patterns
  xabcd:          'xabcd_pattern',
  cypher:         'cypher_pattern',
  abcd:           'abcd_pattern',
  triangle_pat:   'triangle_pattern',
  three_drives:   'three_drives',
  head_shoulders: 'head_shoulders',
  // elliott
  elliott_imp:    'elliott_impulse',
  elliott_cor:    'elliott_correction',
  elliott_tri:    'elliott_triangle',
  // shapes
  rect:           'rectangle',
  circle:         'circle',
  ellipse:        'ellipse',
  triangle_shp:   'triangle_shape',
  arrow:          'arrow_drawing',
  path:           'brush',
  polyline:       'polyline',
  arc:            'arc',
  // annotations
  text:           'text_note',
  anchored_text:  'anchored_text',
  anchored_vwap:  'anchored_vwap',
  callout:        'callout',
  price_label:    'price_label',
  arrow_up:       'arrow_marker_up',
  arrow_down:     'arrow_marker_down',
  flag:           'flag_mark',
  // measurement
  date_range:     'date_range',
  price_range:    'price_range',
  measure:        'date_price_range',
  forecast:       'forecast',
  // positions
  long_pos:       'long_position',
  short_pos:      'short_position',
  // manage
  magnet: null, lock: null, eyetool: null, trash: null,
};

interface ToolDef { id: string; icon: React.ReactNode; name: string; shortcut?: string }
interface ToolGroup { label: string; defaultOpen: boolean; tools: ToolDef[] }

const TOOL_GROUPS: ToolGroup[] = [
  {
    label: 'POINTER', defaultOpen: true,
    tools: [
      { id: 'cursor',    icon: <MousePointer2 size={13} />, name: 'Pointer',   shortcut: 'V' },
      { id: 'crosshair', icon: <Crosshair size={13} />,     name: 'Crosshair', shortcut: '⇧V' },
    ],
  },
  {
    label: 'LINES', defaultOpen: true,
    tools: [
      { id: 'trendline',   icon: <TrendingUp size={13} />,     name: 'Trend Line',      shortcut: 'Alt+T' },
      { id: 'extended_line', icon: <ArrowLeftRight size={13} />, name: 'Extended Line' },
      { id: 'ray',         icon: <ArrowRight size={13} />,     name: 'Ray' },
      { id: 'hray',        icon: <MoveHorizontal size={13} />, name: 'Horizontal Ray' },
      { id: 'hline',       icon: <Minus size={13} />,          name: 'Horizontal Line', shortcut: 'H' },
      { id: 'vline',       icon: <ArrowUpDown size={13} />,    name: 'Vertical Line',   shortcut: 'V' },
      { id: 'crossline',   icon: <Crosshair size={13} />,      name: 'Cross Line' },
      { id: 'infoline',    icon: <LineChart size={13} />,      name: 'Info Line' },
      { id: 'trend_angle', icon: <Triangle size={13} />,       name: 'Trend Angle' },
    ],
  },
  {
    label: 'CHANNELS', defaultOpen: true,
    tools: [
      { id: 'channel',      icon: <ChevronsUpDown size={13} />, name: 'Parallel Channel' },
      { id: 'regression',   icon: <LineChart size={13} />,      name: 'Regression Trend' },
      { id: 'flat_channel', icon: <AlignCenter size={13} />,    name: 'Flat Top/Bottom' },
      { id: 'disjoint',     icon: <ArrowLeftRight size={13} />, name: 'Disjoint Channel' },
    ],
  },
  {
    label: 'PITCHFORK', defaultOpen: false,
    tools: [
      { id: 'pitchfork',  icon: <GitBranch size={13} />,         name: 'Andrews Pitchfork' },
      { id: 'schiff',     icon: <GitFork size={13} />,           name: 'Schiff Pitchfork' },
      { id: 'mod_schiff', icon: <GitMerge size={13} />,          name: 'Mod Schiff Fork' },
      { id: 'inside_fork', icon: <GitPullRequestArrow size={13} />, name: 'Inside Pitchfork' },
    ],
  },
  {
    label: 'FIBONACCI', defaultOpen: true,
    tools: [
      { id: 'fib',       icon: <Layers size={13} />,   name: 'Fibonacci Retracement', shortcut: 'F' },
      { id: 'fib_ext',   icon: <Percent size={13} />,  name: 'Fib Extension' },
      { id: 'fib_chan',  icon: <LayoutGrid size={13} />, name: 'Fib Channel' },
      { id: 'fib_time',  icon: <Timer size={13} />,    name: 'Fib Time Zone' },
      { id: 'fib_speed', icon: <Zap size={13} />,      name: 'Fib Speed Fan' },
    ],
  },
  {
    label: 'GANN', defaultOpen: false,
    tools: [
      { id: 'gann_box', icon: <LayoutGrid size={13} />, name: 'Gann Box' },
      { id: 'gann_fan', icon: <Wind size={13} />,       name: 'Gann Fan' },
    ],
  },
  {
    label: 'HARMONIC PATTERNS', defaultOpen: false,
    tools: [
      { id: 'xabcd',          icon: <Activity size={13} />,    name: 'XABCD Pattern' },
      { id: 'cypher',         icon: <Hexagon size={13} />,     name: 'Cypher Pattern' },
      { id: 'abcd',           icon: <Activity size={13} />,    name: 'ABCD Pattern' },
      { id: 'triangle_pat',   icon: <Triangle size={13} />,    name: 'Triangle Pattern' },
      { id: 'three_drives',   icon: <ListOrdered size={13} />, name: 'Three Drives' },
      { id: 'head_shoulders', icon: <Waves size={13} />,       name: 'Head & Shoulders' },
    ],
  },
  {
    label: 'ELLIOTT WAVE', defaultOpen: false,
    tools: [
      { id: 'elliott_imp', icon: <Waves size={13} />,       name: 'Impulse Wave (12345)' },
      { id: 'elliott_cor', icon: <Waves size={13} />,       name: 'Correction Wave (ABC)' },
      { id: 'elliott_tri', icon: <Triangle size={13} />,    name: 'Elliott Triangle' },
    ],
  },
  {
    label: 'SHAPES', defaultOpen: true,
    tools: [
      { id: 'rect',         icon: <Square size={13} />,       name: 'Rectangle',     shortcut: 'R' },
      { id: 'circle',       icon: <Circle size={13} />,       name: 'Circle' },
      { id: 'ellipse',      icon: <Circle size={13} />,       name: 'Ellipse' },
      { id: 'triangle_shp', icon: <Triangle size={13} />,     name: 'Triangle' },
      { id: 'arrow',        icon: <ArrowBigRight size={13} />, name: 'Arrow' },
      { id: 'arc',          icon: <Spline size={13} />,       name: 'Arc' },
      { id: 'polyline',     icon: <Spline size={13} />,       name: 'Polyline' },
      { id: 'path',         icon: <Pen size={13} />,          name: 'Brush' },
    ],
  },
  {
    label: 'ANNOTATIONS', defaultOpen: true,
    tools: [
      { id: 'text',         icon: <Type size={13} />,          name: 'Text Note',     shortcut: 'N' },
      { id: 'callout',      icon: <MessageSquare size={13} />, name: 'Callout' },
      { id: 'price_label',  icon: <Tag size={13} />,           name: 'Price Label' },
      { id: 'anchored_text', icon: <Anchor size={13} />,       name: 'Anchored Text' },
      { id: 'anchored_vwap', icon: <Activity size={13} />,    name: 'Anchored VWAP' },
      { id: 'arrow_up',     icon: <ArrowUpCircle size={13} />, name: 'Arrow Up' },
      { id: 'arrow_down',   icon: <ArrowDownCircle size={13} />, name: 'Arrow Down' },
      { id: 'flag',         icon: <Flag size={13} />,          name: 'Flag' },
    ],
  },
  {
    label: 'MEASUREMENT', defaultOpen: true,
    tools: [
      { id: 'measure',     icon: <Ruler size={13} />,        name: 'Price & Date Range', shortcut: 'M' },
      { id: 'price_range', icon: <DollarSign size={13} />,   name: 'Price Range' },
      { id: 'date_range',  icon: <CalendarRange size={13} />, name: 'Date Range' },
      { id: 'forecast',    icon: <Telescope size={13} />,    name: 'Forecast' },
    ],
  },
  {
    label: 'POSITIONS', defaultOpen: false,
    tools: [
      { id: 'long_pos',  icon: <ArrowUpRight size={13} />,   name: 'Long Position' },
      { id: 'short_pos', icon: <ArrowDownRight size={13} />, name: 'Short Position' },
    ],
  },
  {
    label: 'MANAGE', defaultOpen: true,
    tools: [
      { id: 'magnet',  icon: <Magnet size={13} />, name: 'Magnet Mode' },
      { id: 'lock',    icon: <Lock size={13} />,   name: 'Lock All Drawings' },
      { id: 'eyetool', icon: <Eye size={13} />,    name: 'Show / Hide Drawings' },
      { id: 'trash',   icon: <Trash2 size={13} />, name: 'Remove All Drawings' },
    ],
  },
];

export function DrawToolsPanel() {
  const { state, dispatch } = useWorkspace();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(
    () => Object.fromEntries(TOOL_GROUPS.map(g => [g.label, g.defaultOpen]))
  );

  function toggleGroup(label: string) {
    setOpenGroups(prev => ({ ...prev, [label]: !prev[label] }));
  }

  function handleToolClick(id: string) {
    if (id === 'magnet')  { dispatch({ type: 'TOGGLE_MAGNET' }); return; }
    if (id === 'lock')    { dispatch({ type: 'TOGGLE_LOCK_DRAWINGS' }); return; }
    if (id === 'eyetool') { dispatch({ type: 'TOGGLE_HIDE_DRAWINGS' }); return; }
    if (id === 'trash')   { dispatch({ type: 'DELETE_ALL_DRAWINGS' }); return; }
    dispatch({ type: 'SET_TOOL', tool: id });
    const mode = DRAWING_MODE_MAP[id];
    dispatch({ type: 'SET_DRAWING_MODE', mode: mode !== undefined ? mode : null });
  }

  function isActive(id: string): boolean {
    if (id === 'magnet')  return state.magnetEnabled;
    if (id === 'lock')    return state.lockDrawings;
    if (id === 'eyetool') return state.hideDrawings;
    return state.activeTool === id;
  }

  return (
    <div style={{ overflowY: 'auto', height: '100%', padding: '2px 0' }}>
      {TOOL_GROUPS.map(group => {
        const open = openGroups[group.label] ?? group.defaultOpen;
        return (
          <div key={group.label}>
            {/* Group header — click to collapse */}
            <div
              onClick={() => toggleGroup(group.label)}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '5px 10px 3px', cursor: 'pointer',
                userSelect: 'none',
              }}
            >
              <span style={{ fontSize: 9, fontWeight: 700, color: T.text3, letterSpacing: '0.06em', fontFamily: T.font, flex: 1 }}>
                {group.label}
              </span>
              {open
                ? <ChevronDown size={9} color={T.text3} />
                : <ChevronRight size={9} color={T.text3} />}
            </div>

            {open && group.tools.map(tool => {
              const active = isActive(tool.id);
              return (
                <div
                  key={tool.id}
                  onClick={() => handleToolClick(tool.id)}
                  title={tool.name + (tool.shortcut ? `  (${tool.shortcut})` : '')}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 7,
                    padding: '4px 10px', cursor: 'pointer', borderRadius: 3,
                    background: active ? T.accentBg : 'transparent',
                    margin: '0 4px', marginBottom: 1,
                  }}
                  onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = T.panelHover; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = active ? T.accentBg : 'transparent'; }}
                >
                  <span style={{ color: active ? T.accent : T.text2, flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                    {tool.icon}
                  </span>
                  <span style={{ flex: 1, fontSize: 10, fontWeight: active ? 600 : 400, color: active ? T.accent : T.text1, fontFamily: T.font, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {tool.name}
                  </span>
                  {tool.shortcut && (
                    <span style={{
                      fontSize: 8, color: T.text3, fontFamily: T.mono,
                      padding: '1px 4px', borderRadius: 2, background: T.surfaceAlt,
                      flexShrink: 0,
                    }}>
                      {tool.shortcut}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
