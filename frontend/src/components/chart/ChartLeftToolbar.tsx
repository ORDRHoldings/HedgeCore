"use client";
/**
 * ChartLeftToolbar.tsx -- TradingView-style vertical drawing toolbar
 *
 * Left-side icon rail with flyout category menus for chart drawing tools.
 * 10 tool groups: cursors, lines, channels, fibonacci, patterns, shapes,
 * measurement, annotations, magnet toggle, and utilities.
 */
import React, { useState, useCallback, useEffect, useRef } from "react";
import { THEME } from "./core/theme";

/* =======================================================================
   Types
   ======================================================================= */

export type ToolKey =
  /* cursors */
  | "crosshair"
  | "cursor"
  /* lines */
  | "trendline"
  | "ray"
  | "extended_line"
  | "horizontal"
  | "horizontal_ray"
  | "vertical_line"
  | "cross_line"
  | "info_line"
  | "trend_angle"
  /* channels */
  | "parallel_channel"
  | "regression_trend"
  | "flat_top_bottom"
  | "disjoint_channel"
  | "pitchfork"
  | "schiff_pitchfork"
  | "mod_schiff_pitchfork"
  | "inside_pitchfork"
  /* fibonacci */
  | "fibonacci"
  | "fib_extension"
  | "fib_channel"
  | "fib_time_zone"
  | "fib_speed_fan"
  | "gann_box"
  | "gann_fan"
  /* patterns */
  | "xabcd_pattern"
  | "cypher_pattern"
  | "abcd_pattern"
  | "triangle_pattern"
  | "three_drives"
  | "head_shoulders"
  | "elliott_impulse"
  | "elliott_correction"
  | "elliott_triangle"
  /* shapes */
  | "rectangle"
  | "circle"
  | "ellipse"
  | "triangle_shape"
  | "arrow_drawing"
  | "brush"
  | "polyline"
  | "arc"
  /* measurement */
  | "long_position"
  | "short_position"
  | "date_range"
  | "price_range"
  | "date_price_range"
  | "forecast"
  /* annotations */
  | "text_note"
  | "anchored_text"
  | "callout"
  | "price_label"
  | "arrow_marker_up"
  | "arrow_marker_down"
  | "flag_mark"
  /* magnet */
  | "magnet"
  /* utilities */
  | "zoomIn"
  | "eraser";

export interface ChartLeftToolbarProps {
  activeTool: string;
  onSelectTool: (tool: string) => void;
  hasDrawings: boolean;
  onClearDrawings: () => void;
}

/* =======================================================================
   Style Constants
   ======================================================================= */

const TOOLBAR_WIDTH = 42;
const BUTTON_SIZE = 36;
const ICON_SIZE = 16;
const ACTIVE_BG = "#2962FF";
const HOVER_BG = "#2A2E39";
const DIVIDER_COLOR = THEME.subPaneBorder;
const ICON_COLOR = THEME.axisText;
const ICON_ACTIVE_COLOR = "#D1D4DC";
const DELETE_HOVER_COLOR = "#EF5350";
const FLYOUT_BG = "#1A1E2E";
const FLYOUT_BORDER = "#2A2E39";
const FLYOUT_HOVER = "#2A2E39";
const FLYOUT_CHECK = "#2962FF";

/* =======================================================================
   SVG Icon Components (16x16, viewBox 0 0 16 16)
   ======================================================================= */

function Svg({ children }: { children: React.ReactNode }) {
  return (
    <svg
      width={ICON_SIZE}
      height={ICON_SIZE}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "block" }}
    >
      {children}
    </svg>
  );
}

/* --- Cursors --- */

function CrosshairIcon({ color }: { color: string }) {
  return (
    <Svg>
      <line x1="8" y1="1" x2="8" y2="15" stroke={color} strokeWidth="1.2" />
      <line x1="1" y1="8" x2="15" y2="8" stroke={color} strokeWidth="1.2" />
      <circle cx="8" cy="8" r="3" stroke={color} strokeWidth="1.2" />
    </Svg>
  );
}

function PointerIcon({ color }: { color: string }) {
  return (
    <Svg>
      <path d="M4 2L4 12.5L6.8 10L9.5 14L11 13.2L8.3 9.2L11.5 8.5L4 2Z" fill={color} />
    </Svg>
  );
}

/* --- Lines --- */

function TrendLineIcon({ color }: { color: string }) {
  return (
    <Svg>
      <line x1="2" y1="13" x2="14" y2="3" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="2" cy="13" r="1.5" fill={color} />
      <circle cx="14" cy="3" r="1.5" fill={color} />
    </Svg>
  );
}

function RayIcon({ color }: { color: string }) {
  return (
    <Svg>
      <line x1="2" y1="11" x2="13" y2="5" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="2" cy="11" r="1.5" fill={color} />
      <path d="M11 4L14.5 5.5L12 8" fill={color} />
    </Svg>
  );
}

function ExtendedLineIcon({ color }: { color: string }) {
  return (
    <Svg>
      <line x1="0" y1="14" x2="16" y2="2" stroke={color} strokeWidth="1.4" />
    </Svg>
  );
}

function HorizontalLineIcon({ color }: { color: string }) {
  return (
    <Svg>
      <line x1="1" y1="8" x2="15" y2="8" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="1" cy="8" r="1.2" fill={color} />
      <circle cx="15" cy="8" r="1.2" fill={color} />
    </Svg>
  );
}

function HorizontalRayIcon({ color }: { color: string }) {
  return (
    <Svg>
      <line x1="2" y1="8" x2="14" y2="8" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="2" cy="8" r="1.5" fill={color} />
      <path d="M12 5.5L15 8L12 10.5" fill={color} />
    </Svg>
  );
}

function VerticalLineIcon({ color }: { color: string }) {
  return (
    <Svg>
      <line x1="8" y1="1" x2="8" y2="15" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8" cy="1" r="1.2" fill={color} />
      <circle cx="8" cy="15" r="1.2" fill={color} />
    </Svg>
  );
}

function CrossLineIcon({ color }: { color: string }) {
  return (
    <Svg>
      <line x1="2" y1="2" x2="14" y2="14" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
      <line x1="14" y1="2" x2="2" y2="14" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="8" cy="8" r="2" stroke={color} strokeWidth="1" />
    </Svg>
  );
}

function InfoLineIcon({ color }: { color: string }) {
  return (
    <Svg>
      <line x1="2" y1="12" x2="12" y2="4" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="2" cy="12" r="1.3" fill={color} />
      <circle cx="12" cy="4" r="1.3" fill={color} />
      <circle cx="13" cy="3" r="2.5" stroke={color} strokeWidth="0.8" />
      <text x="13" y="4.5" fill={color} fontSize="3.5" fontWeight="700" textAnchor="middle" fontFamily="monospace">i</text>
    </Svg>
  );
}

function TrendAngleIcon({ color }: { color: string }) {
  return (
    <Svg>
      <line x1="2" y1="13" x2="14" y2="13" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
      <line x1="2" y1="13" x2="12" y2="4" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
      <path d="M6 13 A5 5 0 0 1 4.5 10" stroke={color} strokeWidth="1" fill="none" />
    </Svg>
  );
}

/* --- Channels --- */

function ParallelChannelIcon({ color }: { color: string }) {
  return (
    <Svg>
      <line x1="1" y1="11" x2="15" y2="5" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
      <line x1="1" y1="14" x2="15" y2="8" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
    </Svg>
  );
}

function RegressionTrendIcon({ color }: { color: string }) {
  return (
    <Svg>
      <line x1="1" y1="12" x2="15" y2="4" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
      <line x1="1" y1="10" x2="15" y2="2" stroke={color} strokeWidth="0.8" strokeDasharray="2 1.5" />
      <line x1="1" y1="14" x2="15" y2="6" stroke={color} strokeWidth="0.8" strokeDasharray="2 1.5" />
    </Svg>
  );
}

function FlatTopBottomIcon({ color }: { color: string }) {
  return (
    <Svg>
      <line x1="1" y1="4" x2="15" y2="4" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
      <line x1="1" y1="12" x2="15" y2="8" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
    </Svg>
  );
}

function DisjointChannelIcon({ color }: { color: string }) {
  return (
    <Svg>
      <line x1="1" y1="10" x2="8" y2="5" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
      <line x1="8" y1="11" x2="15" y2="6" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
    </Svg>
  );
}

function PitchforkIcon({ color }: { color: string }) {
  return (
    <Svg>
      <line x1="2" y1="14" x2="8" y2="2" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
      <line x1="14" y1="14" x2="8" y2="2" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
      <line x1="8" y1="2" x2="8" y2="14" stroke={color} strokeWidth="1" strokeDasharray="2 2" />
      <circle cx="8" cy="2" r="1.3" fill={color} />
    </Svg>
  );
}

function SchiffPitchforkIcon({ color }: { color: string }) {
  return (
    <Svg>
      <line x1="3" y1="14" x2="8" y2="4" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
      <line x1="13" y1="14" x2="8" y2="4" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
      <line x1="5.5" y1="9" x2="8" y2="4" stroke={color} strokeWidth="1" strokeDasharray="2 2" />
      <circle cx="5.5" cy="9" r="1.2" fill={color} />
    </Svg>
  );
}

function ModSchiffPitchforkIcon({ color }: { color: string }) {
  return (
    <Svg>
      <line x1="3" y1="14" x2="9" y2="3" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
      <line x1="13" y1="14" x2="9" y2="3" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
      <line x1="8" y1="8.5" x2="9" y2="3" stroke={color} strokeWidth="1" strokeDasharray="2 2" />
      <circle cx="8" cy="8.5" r="1.2" fill={color} />
    </Svg>
  );
}

function InsidePitchforkIcon({ color }: { color: string }) {
  return (
    <Svg>
      <line x1="4" y1="14" x2="8" y2="3" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
      <line x1="12" y1="14" x2="8" y2="3" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
      <line x1="6" y1="8.5" x2="10" y2="8.5" stroke={color} strokeWidth="1" strokeDasharray="1.5 1.5" />
      <circle cx="8" cy="3" r="1.2" fill={color} />
    </Svg>
  );
}

/* --- Fibonacci --- */

function FibonacciIcon({ color }: { color: string }) {
  return (
    <Svg>
      <line x1="1" y1="2" x2="15" y2="2" stroke={color} strokeWidth="1" strokeDasharray="2 2" />
      <line x1="1" y1="5.5" x2="15" y2="5.5" stroke={color} strokeWidth="1" />
      <line x1="1" y1="8" x2="15" y2="8" stroke={color} strokeWidth="1" strokeDasharray="2 2" />
      <line x1="1" y1="10.5" x2="15" y2="10.5" stroke={color} strokeWidth="1" />
      <line x1="1" y1="14" x2="15" y2="14" stroke={color} strokeWidth="1" strokeDasharray="2 2" />
      <text x="1" y="4.5" fill={color} fontSize="3" fontFamily="monospace">0.0</text>
      <text x="1" y="12.5" fill={color} fontSize="3" fontFamily="monospace">1.0</text>
    </Svg>
  );
}

function FibExtensionIcon({ color }: { color: string }) {
  return (
    <Svg>
      <line x1="1" y1="14" x2="15" y2="14" stroke={color} strokeWidth="1" />
      <line x1="1" y1="10" x2="15" y2="10" stroke={color} strokeWidth="1" strokeDasharray="2 2" />
      <line x1="1" y1="6" x2="15" y2="6" stroke={color} strokeWidth="1" />
      <line x1="1" y1="2" x2="15" y2="2" stroke={color} strokeWidth="1" strokeDasharray="2 2" />
      <path d="M12 8L14 4L15 5" stroke={color} strokeWidth="1.2" strokeLinecap="round" fill="none" />
    </Svg>
  );
}

function FibChannelIcon({ color }: { color: string }) {
  return (
    <Svg>
      <line x1="1" y1="14" x2="15" y2="6" stroke={color} strokeWidth="1.2" />
      <line x1="1" y1="10" x2="15" y2="2" stroke={color} strokeWidth="0.8" strokeDasharray="2 2" />
      <line x1="1" y1="12" x2="15" y2="4" stroke={color} strokeWidth="0.8" strokeDasharray="2 2" />
    </Svg>
  );
}

function FibTimeZoneIcon({ color }: { color: string }) {
  return (
    <Svg>
      <line x1="2" y1="1" x2="2" y2="15" stroke={color} strokeWidth="1" />
      <line x1="5" y1="1" x2="5" y2="15" stroke={color} strokeWidth="1" />
      <line x1="10" y1="1" x2="10" y2="15" stroke={color} strokeWidth="1" />
      <text x="3" y="5" fill={color} fontSize="3" fontFamily="monospace">1</text>
      <text x="6.5" y="5" fill={color} fontSize="3" fontFamily="monospace">2</text>
      <text x="11" y="5" fill={color} fontSize="3" fontFamily="monospace">3</text>
    </Svg>
  );
}

function FibSpeedFanIcon({ color }: { color: string }) {
  return (
    <Svg>
      <line x1="2" y1="14" x2="14" y2="2" stroke={color} strokeWidth="1.2" />
      <line x1="2" y1="14" x2="14" y2="6" stroke={color} strokeWidth="0.9" />
      <line x1="2" y1="14" x2="14" y2="10" stroke={color} strokeWidth="0.9" />
      <circle cx="2" cy="14" r="1.2" fill={color} />
    </Svg>
  );
}

function GannBoxIcon({ color }: { color: string }) {
  return (
    <Svg>
      <rect x="2" y="2" width="12" height="12" stroke={color} strokeWidth="1.2" rx="0.5" />
      <line x1="2" y1="8" x2="14" y2="8" stroke={color} strokeWidth="0.7" />
      <line x1="8" y1="2" x2="8" y2="14" stroke={color} strokeWidth="0.7" />
      <line x1="2" y1="5" x2="14" y2="5" stroke={color} strokeWidth="0.5" strokeDasharray="1.5 1.5" />
      <line x1="2" y1="11" x2="14" y2="11" stroke={color} strokeWidth="0.5" strokeDasharray="1.5 1.5" />
    </Svg>
  );
}

function GannFanIcon({ color }: { color: string }) {
  return (
    <Svg>
      <line x1="2" y1="14" x2="14" y2="2" stroke={color} strokeWidth="1.2" />
      <line x1="2" y1="14" x2="14" y2="5" stroke={color} strokeWidth="0.8" />
      <line x1="2" y1="14" x2="14" y2="8" stroke={color} strokeWidth="0.8" />
      <line x1="2" y1="14" x2="14" y2="11" stroke={color} strokeWidth="0.8" />
      <line x1="2" y1="14" x2="6" y2="2" stroke={color} strokeWidth="0.8" />
      <circle cx="2" cy="14" r="1.2" fill={color} />
    </Svg>
  );
}

/* --- Patterns --- */

function XABCDPatternIcon({ color }: { color: string }) {
  return (
    <Svg>
      <polyline points="1,10 4,4 7,8 10,3 14,12" stroke={color} strokeWidth="1.3" fill="none" strokeLinejoin="round" />
      <circle cx="1" cy="10" r="1" fill={color} />
      <circle cx="14" cy="12" r="1" fill={color} />
    </Svg>
  );
}

function CypherPatternIcon({ color }: { color: string }) {
  return (
    <Svg>
      <polyline points="1,12 5,3 8,9 12,2 15,11" stroke={color} strokeWidth="1.3" fill="none" strokeLinejoin="round" />
    </Svg>
  );
}

function ABCDPatternIcon({ color }: { color: string }) {
  return (
    <Svg>
      <polyline points="2,12 6,4 10,10 14,3" stroke={color} strokeWidth="1.3" fill="none" strokeLinejoin="round" />
      <circle cx="2" cy="12" r="1" fill={color} />
      <circle cx="14" cy="3" r="1" fill={color} />
    </Svg>
  );
}

function TrianglePatternIcon({ color }: { color: string }) {
  return (
    <Svg>
      <polyline points="2,12 8,3 14,12 2,12" stroke={color} strokeWidth="1.3" fill="none" strokeLinejoin="round" />
    </Svg>
  );
}

function ThreeDrivesIcon({ color }: { color: string }) {
  return (
    <Svg>
      <polyline points="1,10 3,5 5,9 7,4 9,8 12,3 15,10" stroke={color} strokeWidth="1.2" fill="none" strokeLinejoin="round" />
    </Svg>
  );
}

function HeadShouldersIcon({ color }: { color: string }) {
  return (
    <Svg>
      <polyline points="1,10 3,6 5,10 8,2 11,10 13,6 15,10" stroke={color} strokeWidth="1.3" fill="none" strokeLinejoin="round" />
    </Svg>
  );
}

function ElliottImpulseIcon({ color }: { color: string }) {
  return (
    <Svg>
      <polyline points="1,14 4,8 5,11 8,3 10,7 14,1" stroke={color} strokeWidth="1.3" fill="none" strokeLinejoin="round" />
    </Svg>
  );
}

function ElliottCorrectionIcon({ color }: { color: string }) {
  return (
    <Svg>
      <polyline points="1,2 5,10 9,5 14,14" stroke={color} strokeWidth="1.3" fill="none" strokeLinejoin="round" />
    </Svg>
  );
}

function ElliottTriangleIcon({ color }: { color: string }) {
  return (
    <Svg>
      <polyline points="1,4 4,12 8,5 12,10 15,7" stroke={color} strokeWidth="1.3" fill="none" strokeLinejoin="round" />
    </Svg>
  );
}

/* --- Shapes --- */

function RectangleIcon({ color }: { color: string }) {
  return (
    <Svg>
      <rect x="2" y="3" width="12" height="10" rx="1" stroke={color} strokeWidth="1.3" />
    </Svg>
  );
}

function CircleIcon({ color }: { color: string }) {
  return (
    <Svg>
      <circle cx="8" cy="8" r="6" stroke={color} strokeWidth="1.3" />
    </Svg>
  );
}

function EllipseIcon({ color }: { color: string }) {
  return (
    <Svg>
      <ellipse cx="8" cy="8" rx="7" ry="4.5" stroke={color} strokeWidth="1.3" />
    </Svg>
  );
}

function TriangleShapeIcon({ color }: { color: string }) {
  return (
    <Svg>
      <polygon points="8,2 2,14 14,14" stroke={color} strokeWidth="1.3" fill="none" strokeLinejoin="round" />
    </Svg>
  );
}

function ArrowDrawingIcon({ color }: { color: string }) {
  return (
    <Svg>
      <line x1="2" y1="14" x2="13" y2="3" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M9 2L14 2.5L13.5 7" stroke={color} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

function BrushIcon({ color }: { color: string }) {
  return (
    <Svg>
      <path d="M2 10 Q4 6, 6 8 Q8 10, 10 6 Q12 2, 14 4" stroke={color} strokeWidth="1.4" fill="none" strokeLinecap="round" />
    </Svg>
  );
}

function PolylineIcon({ color }: { color: string }) {
  return (
    <Svg>
      <polyline points="2,12 5,5 9,10 14,3" stroke={color} strokeWidth="1.3" fill="none" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx="2" cy="12" r="1.2" fill={color} />
      <circle cx="5" cy="5" r="1.2" fill={color} />
      <circle cx="9" cy="10" r="1.2" fill={color} />
      <circle cx="14" cy="3" r="1.2" fill={color} />
    </Svg>
  );
}

function ArcIcon({ color }: { color: string }) {
  return (
    <Svg>
      <path d="M2 12 Q8 1, 14 12" stroke={color} strokeWidth="1.4" fill="none" strokeLinecap="round" />
    </Svg>
  );
}

/* --- Measurement --- */

function LongPositionIcon({ color }: { color: string }) {
  return (
    <Svg>
      <rect x="3" y="2" width="10" height="12" rx="1" stroke="#26A69A" strokeWidth="1.2" />
      <path d="M8 10L8 5" stroke="#26A69A" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M5.5 7L8 4.5L10.5 7" stroke="#26A69A" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

function ShortPositionIcon({ color }: { color: string }) {
  return (
    <Svg>
      <rect x="3" y="2" width="10" height="12" rx="1" stroke="#EF5350" strokeWidth="1.2" />
      <path d="M8 5L8 10" stroke="#EF5350" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M5.5 8L8 10.5L10.5 8" stroke="#EF5350" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

function DateRangeIcon({ color }: { color: string }) {
  return (
    <Svg>
      <line x1="3" y1="2" x2="3" y2="14" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
      <line x1="13" y1="2" x2="13" y2="14" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
      <line x1="3" y1="8" x2="13" y2="8" stroke={color} strokeWidth="1" strokeDasharray="2 1.5" />
      <path d="M5 6L3 8L5 10" stroke={color} strokeWidth="1" fill="none" strokeLinecap="round" />
      <path d="M11 6L13 8L11 10" stroke={color} strokeWidth="1" fill="none" strokeLinecap="round" />
    </Svg>
  );
}

function PriceRangeIcon({ color }: { color: string }) {
  return (
    <Svg>
      <line x1="8" y1="2" x2="8" y2="14" stroke={color} strokeWidth="1.3" />
      <path d="M5.5 4.5L8 1.5L10.5 4.5" stroke={color} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M5.5 11.5L8 14.5L10.5 11.5" stroke={color} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <line x1="4" y1="8" x2="12" y2="8" stroke={color} strokeWidth="1" strokeDasharray="2 1" />
    </Svg>
  );
}

function DatePriceRangeIcon({ color }: { color: string }) {
  return (
    <Svg>
      <rect x="2" y="3" width="12" height="10" stroke={color} strokeWidth="1.2" fill="none" rx="0.5" />
      <path d="M2 3L4 5" stroke={color} strokeWidth="1" strokeLinecap="round" />
      <path d="M14 13L12 11" stroke={color} strokeWidth="1" strokeLinecap="round" />
      <path d="M14 3L12 5" stroke={color} strokeWidth="1" strokeLinecap="round" />
      <path d="M2 13L4 11" stroke={color} strokeWidth="1" strokeLinecap="round" />
    </Svg>
  );
}

function ForecastIcon({ color }: { color: string }) {
  return (
    <Svg>
      <line x1="1" y1="11" x2="9" y2="5" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
      <line x1="9" y1="5" x2="15" y2="3" stroke={color} strokeWidth="1.2" strokeDasharray="2 1.5" strokeLinecap="round" />
      <circle cx="9" cy="5" r="1.2" fill={color} />
    </Svg>
  );
}

/* --- Annotations --- */

function TextNoteIcon({ color }: { color: string }) {
  return (
    <Svg>
      <text x="8" y="12" fill={color} fontSize="12" fontFamily="'IBM Plex Mono', monospace" fontWeight="700" textAnchor="middle">T</text>
    </Svg>
  );
}

function AnchoredTextIcon({ color }: { color: string }) {
  return (
    <Svg>
      <text x="8" y="10" fill={color} fontSize="10" fontFamily="'IBM Plex Mono', monospace" fontWeight="700" textAnchor="middle">T</text>
      <line x1="8" y1="11" x2="8" y2="15" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="8" cy="15" r="1" fill={color} />
    </Svg>
  );
}

function CalloutIcon({ color }: { color: string }) {
  return (
    <Svg>
      <rect x="1" y="2" width="14" height="9" rx="2" stroke={color} strokeWidth="1.2" fill="none" />
      <path d="M5 11L3 15L8 11" stroke={color} strokeWidth="1.2" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

function PriceLabelIcon({ color }: { color: string }) {
  return (
    <Svg>
      <path d="M2 4L10 4L14 8L10 12L2 12Z" stroke={color} strokeWidth="1.2" strokeLinejoin="round" fill="none" />
      <circle cx="5" cy="8" r="1" fill={color} />
    </Svg>
  );
}

function ArrowMarkerUpIcon({ color }: { color: string }) {
  return (
    <Svg>
      <path d="M8 2L8 14" stroke="#26A69A" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M4 6L8 2L12 6" stroke="#26A69A" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

function ArrowMarkerDownIcon({ color }: { color: string }) {
  return (
    <Svg>
      <path d="M8 14L8 2" stroke="#EF5350" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M4 10L8 14L12 10" stroke="#EF5350" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

function FlagMarkIcon({ color }: { color: string }) {
  return (
    <Svg>
      <line x1="3" y1="2" x2="3" y2="15" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
      <path d="M3 2L13 5L3 8Z" fill={color} opacity="0.6" />
      <path d="M3 2L13 5L3 8" stroke={color} strokeWidth="1" fill="none" />
    </Svg>
  );
}

/* --- Magnet --- */

function MagnetIcon({ color }: { color: string }) {
  return (
    <Svg>
      <path d="M3 6 Q3 2 8 2 Q13 2 13 6" stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <rect x="1.5" y="6" width="3" height="5" rx="0.5" stroke={color} strokeWidth="1" fill="none" />
      <rect x="11.5" y="6" width="3" height="5" rx="0.5" stroke={color} strokeWidth="1" fill="none" />
      <line x1="1.5" y1="8" x2="4.5" y2="8" stroke={color} strokeWidth="0.8" />
      <line x1="11.5" y1="8" x2="14.5" y2="8" stroke={color} strokeWidth="0.8" />
    </Svg>
  );
}

/* --- Utilities --- */

function ZoomInIcon({ color }: { color: string }) {
  return (
    <Svg>
      <circle cx="7" cy="7" r="4.5" stroke={color} strokeWidth="1.3" />
      <line x1="10.5" y1="10.5" x2="14" y2="14" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="5" y1="7" x2="9" y2="7" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
      <line x1="7" y1="5" x2="7" y2="9" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
    </Svg>
  );
}

function EraserIcon({ color }: { color: string }) {
  return (
    <Svg>
      <path d="M10 2L14 6L7 13H3L2 12L6 8L10 2Z" stroke={color} strokeWidth="1.2" strokeLinejoin="round" fill="none" />
      <line x1="6" y1="8" x2="10" y2="4" stroke={color} strokeWidth="0.8" />
      <line x1="2" y1="14" x2="14" y2="14" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
    </Svg>
  );
}

function TrashIcon({ color }: { color: string }) {
  return (
    <Svg>
      <path d="M3 4H13L12 14H4L3 4Z" stroke={color} strokeWidth="1.2" strokeLinejoin="round" fill="none" />
      <line x1="1" y1="4" x2="15" y2="4" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
      <path d="M6 4V2.5C6 2.2 6.2 2 6.5 2H9.5C9.8 2 10 2.2 10 2.5V4" stroke={color} strokeWidth="1.2" />
      <line x1="6.5" y1="6.5" x2="6.5" y2="11.5" stroke={color} strokeWidth="1" strokeLinecap="round" />
      <line x1="9.5" y1="6.5" x2="9.5" y2="11.5" stroke={color} strokeWidth="1" strokeLinecap="round" />
    </Svg>
  );
}

/* =======================================================================
   Icon Resolver
   ======================================================================= */

function getToolIcon(key: string, color: string): React.ReactNode {
  switch (key) {
    // Cursors
    case "crosshair": return <CrosshairIcon color={color} />;
    case "cursor": return <PointerIcon color={color} />;
    // Lines
    case "trendline": return <TrendLineIcon color={color} />;
    case "ray": return <RayIcon color={color} />;
    case "extended_line": return <ExtendedLineIcon color={color} />;
    case "horizontal": return <HorizontalLineIcon color={color} />;
    case "horizontal_ray": return <HorizontalRayIcon color={color} />;
    case "vertical_line": return <VerticalLineIcon color={color} />;
    case "cross_line": return <CrossLineIcon color={color} />;
    case "info_line": return <InfoLineIcon color={color} />;
    case "trend_angle": return <TrendAngleIcon color={color} />;
    // Channels
    case "parallel_channel": return <ParallelChannelIcon color={color} />;
    case "regression_trend": return <RegressionTrendIcon color={color} />;
    case "flat_top_bottom": return <FlatTopBottomIcon color={color} />;
    case "disjoint_channel": return <DisjointChannelIcon color={color} />;
    case "pitchfork": return <PitchforkIcon color={color} />;
    case "schiff_pitchfork": return <SchiffPitchforkIcon color={color} />;
    case "mod_schiff_pitchfork": return <ModSchiffPitchforkIcon color={color} />;
    case "inside_pitchfork": return <InsidePitchforkIcon color={color} />;
    // Fibonacci
    case "fibonacci": return <FibonacciIcon color={color} />;
    case "fib_extension": return <FibExtensionIcon color={color} />;
    case "fib_channel": return <FibChannelIcon color={color} />;
    case "fib_time_zone": return <FibTimeZoneIcon color={color} />;
    case "fib_speed_fan": return <FibSpeedFanIcon color={color} />;
    case "gann_box": return <GannBoxIcon color={color} />;
    case "gann_fan": return <GannFanIcon color={color} />;
    // Patterns
    case "xabcd_pattern": return <XABCDPatternIcon color={color} />;
    case "cypher_pattern": return <CypherPatternIcon color={color} />;
    case "abcd_pattern": return <ABCDPatternIcon color={color} />;
    case "triangle_pattern": return <TrianglePatternIcon color={color} />;
    case "three_drives": return <ThreeDrivesIcon color={color} />;
    case "head_shoulders": return <HeadShouldersIcon color={color} />;
    case "elliott_impulse": return <ElliottImpulseIcon color={color} />;
    case "elliott_correction": return <ElliottCorrectionIcon color={color} />;
    case "elliott_triangle": return <ElliottTriangleIcon color={color} />;
    // Shapes
    case "rectangle": return <RectangleIcon color={color} />;
    case "circle": return <CircleIcon color={color} />;
    case "ellipse": return <EllipseIcon color={color} />;
    case "triangle_shape": return <TriangleShapeIcon color={color} />;
    case "arrow_drawing": return <ArrowDrawingIcon color={color} />;
    case "brush": return <BrushIcon color={color} />;
    case "polyline": return <PolylineIcon color={color} />;
    case "arc": return <ArcIcon color={color} />;
    // Measurement
    case "long_position": return <LongPositionIcon color={color} />;
    case "short_position": return <ShortPositionIcon color={color} />;
    case "date_range": return <DateRangeIcon color={color} />;
    case "price_range": return <PriceRangeIcon color={color} />;
    case "date_price_range": return <DatePriceRangeIcon color={color} />;
    case "forecast": return <ForecastIcon color={color} />;
    // Annotations
    case "text_note": return <TextNoteIcon color={color} />;
    case "anchored_text": return <AnchoredTextIcon color={color} />;
    case "callout": return <CalloutIcon color={color} />;
    case "price_label": return <PriceLabelIcon color={color} />;
    case "arrow_marker_up": return <ArrowMarkerUpIcon color={color} />;
    case "arrow_marker_down": return <ArrowMarkerDownIcon color={color} />;
    case "flag_mark": return <FlagMarkIcon color={color} />;
    // Magnet
    case "magnet": return <MagnetIcon color={color} />;
    // Utilities
    case "zoomIn": return <ZoomInIcon color={color} />;
    case "eraser": return <EraserIcon color={color} />;
    default: return null;
  }
}

/* =======================================================================
   Tool Category Definitions
   ======================================================================= */

interface ToolItem {
  key: ToolKey;
  label: string;
}

interface ToolCategory {
  id: string;
  label: string;
  defaultTool: ToolKey;
  tools: ToolItem[];
}

const CATEGORY_CURSORS: ToolCategory = {
  id: "cursors",
  label: "Cursors",
  defaultTool: "crosshair",
  tools: [
    { key: "crosshair", label: "Crosshair" },
    { key: "cursor", label: "Pointer" },
  ],
};

const CATEGORY_LINES: ToolCategory = {
  id: "lines",
  label: "Lines",
  defaultTool: "trendline",
  tools: [
    { key: "trendline", label: "Trend Line" },
    { key: "ray", label: "Ray" },
    { key: "extended_line", label: "Extended Line" },
    { key: "horizontal", label: "Horizontal Line" },
    { key: "horizontal_ray", label: "Horizontal Ray" },
    { key: "vertical_line", label: "Vertical Line" },
    { key: "cross_line", label: "Cross Line" },
    { key: "info_line", label: "Info Line" },
    { key: "trend_angle", label: "Trend Angle" },
  ],
};

const CATEGORY_CHANNELS: ToolCategory = {
  id: "channels",
  label: "Channels",
  defaultTool: "parallel_channel",
  tools: [
    { key: "parallel_channel", label: "Parallel Channel" },
    { key: "regression_trend", label: "Regression Trend" },
    { key: "flat_top_bottom", label: "Flat Top/Bottom" },
    { key: "disjoint_channel", label: "Disjoint Channel" },
    { key: "pitchfork", label: "Pitchfork" },
    { key: "schiff_pitchfork", label: "Schiff Pitchfork" },
    { key: "mod_schiff_pitchfork", label: "Modified Schiff" },
    { key: "inside_pitchfork", label: "Inside Pitchfork" },
  ],
};

const CATEGORY_FIBONACCI: ToolCategory = {
  id: "fibonacci",
  label: "Fibonacci",
  defaultTool: "fibonacci",
  tools: [
    { key: "fibonacci", label: "Fibonacci Retracement" },
    { key: "fib_extension", label: "Fib Extension" },
    { key: "fib_channel", label: "Fib Channel" },
    { key: "fib_time_zone", label: "Fib Time Zone" },
    { key: "fib_speed_fan", label: "Fib Speed Fan" },
    { key: "gann_box", label: "Gann Box" },
    { key: "gann_fan", label: "Gann Fan" },
  ],
};

const CATEGORY_PATTERNS: ToolCategory = {
  id: "patterns",
  label: "Patterns",
  defaultTool: "xabcd_pattern",
  tools: [
    { key: "xabcd_pattern", label: "XABCD Pattern" },
    { key: "cypher_pattern", label: "Cypher Pattern" },
    { key: "abcd_pattern", label: "ABCD Pattern" },
    { key: "triangle_pattern", label: "Triangle Pattern" },
    { key: "three_drives", label: "Three Drives" },
    { key: "head_shoulders", label: "Head & Shoulders" },
    { key: "elliott_impulse", label: "Elliott Impulse" },
    { key: "elliott_correction", label: "Elliott Correction" },
    { key: "elliott_triangle", label: "Elliott Triangle" },
  ],
};

const CATEGORY_SHAPES: ToolCategory = {
  id: "shapes",
  label: "Shapes",
  defaultTool: "rectangle",
  tools: [
    { key: "rectangle", label: "Rectangle" },
    { key: "circle", label: "Circle" },
    { key: "ellipse", label: "Ellipse" },
    { key: "triangle_shape", label: "Triangle" },
    { key: "arrow_drawing", label: "Arrow" },
    { key: "brush", label: "Brush" },
    { key: "polyline", label: "Polyline" },
    { key: "arc", label: "Arc" },
  ],
};

const CATEGORY_MEASUREMENT: ToolCategory = {
  id: "measurement",
  label: "Measurement",
  defaultTool: "price_range",
  tools: [
    { key: "long_position", label: "Long Position" },
    { key: "short_position", label: "Short Position" },
    { key: "date_range", label: "Date Range" },
    { key: "price_range", label: "Price Range" },
    { key: "date_price_range", label: "Date & Price Range" },
    { key: "forecast", label: "Forecast" },
  ],
};

const CATEGORY_ANNOTATIONS: ToolCategory = {
  id: "annotations",
  label: "Annotations",
  defaultTool: "text_note",
  tools: [
    { key: "text_note", label: "Text" },
    { key: "anchored_text", label: "Anchored Text" },
    { key: "callout", label: "Callout" },
    { key: "price_label", label: "Price Label" },
    { key: "arrow_marker_up", label: "Arrow Up" },
    { key: "arrow_marker_down", label: "Arrow Down" },
    { key: "flag_mark", label: "Flag" },
  ],
};

/** Categories with flyout menus (excluding cursors which show inline, and magnet/utilities) */
const FLYOUT_CATEGORIES: ToolCategory[] = [
  CATEGORY_LINES,
  CATEGORY_CHANNELS,
  CATEGORY_FIBONACCI,
  CATEGORY_PATTERNS,
  CATEGORY_SHAPES,
  CATEGORY_MEASUREMENT,
  CATEGORY_ANNOTATIONS,
];

/** All tool keys in all categories (for lookup) */
const ALL_CATEGORY_TOOL_KEYS: Set<string> = new Set(
  [CATEGORY_CURSORS, ...FLYOUT_CATEGORIES].flatMap((c) => c.tools.map((t) => t.key))
);

/** Find which category a tool belongs to */
function findCategoryForTool(toolKey: string): string | null {
  for (const cat of [CATEGORY_CURSORS, ...FLYOUT_CATEGORIES]) {
    if (cat.tools.some((t) => t.key === toolKey)) return cat.id;
  }
  return null;
}

/* =======================================================================
   Flyout Menu Item
   ======================================================================= */

function FlyoutItem({
  tool,
  isActive,
  onSelect,
}: {
  tool: ToolItem;
  isActive: boolean;
  onSelect: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        padding: "7px 10px",
        border: "none",
        borderRadius: 4,
        background: hovered ? FLYOUT_HOVER : "transparent",
        cursor: "pointer",
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: 12,
        color: isActive ? ICON_ACTIVE_COLOR : ICON_COLOR,
        textAlign: "left",
        transition: "background 0.1s ease",
      }}
    >
      <span style={{ width: 16, height: 16, flexShrink: 0 }}>
        {getToolIcon(tool.key, isActive ? ICON_ACTIVE_COLOR : hovered ? ICON_ACTIVE_COLOR : ICON_COLOR)}
      </span>
      <span style={{ flex: 1, whiteSpace: "nowrap" }}>{tool.label}</span>
      {isActive && (
        <span style={{ color: FLYOUT_CHECK, fontSize: 13, fontWeight: 700, marginLeft: 4 }}>
          &#10003;
        </span>
      )}
    </button>
  );
}

/* =======================================================================
   Category Button (with flyout triangle indicator)
   ======================================================================= */

function CategoryButton({
  category,
  activeTool,
  lastUsed,
  isOpen,
  onToggle,
  onSelectTool,
  buttonRef,
}: {
  category: ToolCategory;
  activeTool: string;
  lastUsed: string;
  isOpen: boolean;
  onToggle: () => void;
  onSelectTool: (key: string) => void;
  buttonRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [hovered, setHovered] = useState(false);
  const categoryHasActive = category.tools.some((t) => t.key === activeTool);
  const displayTool = lastUsed || category.defaultTool;

  const iconColor = categoryHasActive || isOpen
    ? ICON_ACTIVE_COLOR
    : hovered
      ? ICON_ACTIVE_COLOR
      : ICON_COLOR;

  const bgColor = categoryHasActive
    ? ACTIVE_BG
    : isOpen
      ? HOVER_BG
      : hovered
        ? HOVER_BG
        : "transparent";

  return (
    <div ref={buttonRef} style={{ position: "relative" }}>
      <button
        onClick={onToggle}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        aria-label={category.label}
        style={{
          width: BUTTON_SIZE,
          height: BUTTON_SIZE,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "none",
          borderRadius: 4,
          background: bgColor,
          cursor: "pointer",
          padding: 0,
          position: "relative",
          transition: "background 0.12s ease",
        }}
      >
        {getToolIcon(displayTool, iconColor)}
        {/* Small triangle indicator in bottom-right */}
        <svg
          width="5"
          height="5"
          viewBox="0 0 5 5"
          style={{ position: "absolute", bottom: 3, right: 3 }}
        >
          <polygon points="0,5 5,5 5,0" fill={iconColor} opacity="0.7" />
        </svg>
      </button>
    </div>
  );
}

/* =======================================================================
   Flyout Menu
   ======================================================================= */

function FlyoutMenu({
  category,
  activeTool,
  top,
  onSelectTool,
}: {
  category: ToolCategory;
  activeTool: string;
  top: number;
  onSelectTool: (key: string) => void;
}) {
  return (
    <div
      data-flyout="true"
      style={{
        position: "fixed",
        left: TOOLBAR_WIDTH + 1,
        top,
        background: FLYOUT_BG,
        border: `1px solid ${FLYOUT_BORDER}`,
        borderRadius: 8,
        boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
        minWidth: 200,
        padding: 4,
        zIndex: 100,
      }}
    >
      {category.tools.map((tool) => (
        <FlyoutItem
          key={tool.key}
          tool={tool}
          isActive={activeTool === tool.key}
          onSelect={() => onSelectTool(tool.key)}
        />
      ))}
    </div>
  );
}

/* =======================================================================
   Simple Button (cursor tools, magnet, utilities)
   ======================================================================= */

function SimpleButton({
  toolKey,
  label,
  isActive,
  onClick,
  hoverColor,
}: {
  toolKey: string;
  label: string;
  isActive: boolean;
  onClick: () => void;
  hoverColor?: string;
}) {
  const [hovered, setHovered] = useState(false);
  const [tooltipVisible, setTooltipVisible] = useState(false);

  const iconColor = isActive
    ? ICON_ACTIVE_COLOR
    : hovered && hoverColor
      ? hoverColor
      : hovered
        ? ICON_ACTIVE_COLOR
        : ICON_COLOR;

  const bgColor = isActive
    ? ACTIVE_BG
    : hovered
      ? hoverColor
        ? `${hoverColor}18`
        : HOVER_BG
      : "transparent";

  return (
    <div
      style={{ position: "relative" }}
      onMouseEnter={() => { setHovered(true); setTooltipVisible(true); }}
      onMouseLeave={() => { setHovered(false); setTooltipVisible(false); }}
    >
      <button
        onClick={onClick}
        data-tool={toolKey}
        aria-label={label}
        style={{
          width: BUTTON_SIZE,
          height: BUTTON_SIZE,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "none",
          borderRadius: 4,
          background: bgColor,
          cursor: "pointer",
          padding: 0,
          transition: "background 0.12s ease",
        }}
      >
        {getToolIcon(toolKey, iconColor)}
      </button>
      {tooltipVisible && (
        <div
          style={{
            position: "absolute",
            left: TOOLBAR_WIDTH + 4,
            top: "50%",
            transform: "translateY(-50%)",
            background: THEME.tooltipBg,
            color: THEME.tooltipText,
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 11,
            fontWeight: 500,
            padding: "4px 8px",
            borderRadius: 4,
            whiteSpace: "nowrap",
            pointerEvents: "none",
            zIndex: 50,
            border: `1px solid ${THEME.subPaneBorder}`,
            boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
          }}
        >
          {label}
        </div>
      )}
    </div>
  );
}

/* =======================================================================
   Divider
   ======================================================================= */

function Divider() {
  return (
    <div
      style={{
        width: BUTTON_SIZE - 8,
        height: 1,
        background: DIVIDER_COLOR,
        margin: "4px auto",
      }}
    />
  );
}

/* =======================================================================
   Delete All Button
   ======================================================================= */

function DeleteAllButton({
  hasDrawings,
  onClearDrawings,
}: {
  hasDrawings: boolean;
  onClearDrawings: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [tooltipVisible, setTooltipVisible] = useState(false);

  const iconColor = hovered && hasDrawings ? DELETE_HOVER_COLOR : ICON_COLOR;
  const bgColor = hovered && hasDrawings ? `${DELETE_HOVER_COLOR}18` : "transparent";

  return (
    <div
      style={{ position: "relative", marginBottom: 4 }}
      onMouseEnter={() => { setHovered(true); setTooltipVisible(true); }}
      onMouseLeave={() => { setHovered(false); setTooltipVisible(false); }}
    >
      <button
        onClick={hasDrawings ? onClearDrawings : undefined}
        data-testid="delete-all-drawings"
        aria-label="Delete All Drawings"
        style={{
          width: BUTTON_SIZE,
          height: BUTTON_SIZE,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "none",
          borderRadius: 4,
          background: bgColor,
          cursor: hasDrawings ? "pointer" : "default",
          padding: 0,
          opacity: hasDrawings ? 1 : 0.35,
          transition: "background 0.12s ease, opacity 0.12s ease",
        }}
      >
        <TrashIcon color={iconColor} />
      </button>
      {tooltipVisible && (
        <div
          style={{
            position: "absolute",
            left: TOOLBAR_WIDTH + 4,
            top: "50%",
            transform: "translateY(-50%)",
            background: THEME.tooltipBg,
            color: hasDrawings && hovered ? DELETE_HOVER_COLOR : THEME.tooltipText,
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 11,
            fontWeight: 500,
            padding: "4px 8px",
            borderRadius: 4,
            whiteSpace: "nowrap",
            pointerEvents: "none",
            zIndex: 50,
            border: `1px solid ${THEME.subPaneBorder}`,
            boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
          }}
        >
          Delete All Drawings
        </div>
      )}
    </div>
  );
}

/* =======================================================================
   Main Component
   ======================================================================= */

export default function ChartLeftToolbar({
  activeTool,
  onSelectTool,
  hasDrawings,
  onClearDrawings,
}: ChartLeftToolbarProps) {
  const [openFlyout, setOpenFlyout] = useState<string | null>(null);
  const [magnetActive, setMagnetActive] = useState(false);

  // Track last-used tool per category
  const [lastUsed, setLastUsed] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const cat of FLYOUT_CATEGORIES) {
      initial[cat.id] = cat.defaultTool;
    }
    return initial;
  });

  // Refs for each category button (to compute flyout position)
  const buttonRefs = useRef<Record<string, React.RefObject<HTMLDivElement | null>>>({});
  for (const cat of FLYOUT_CATEGORIES) {
    if (!buttonRefs.current[cat.id]) {
      buttonRefs.current[cat.id] = React.createRef<HTMLDivElement>();
    }
  }

  // Close flyout on outside click
  useEffect(() => {
    if (!openFlyout) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Check if click is inside a flyout or a category button
      if (target.closest("[data-flyout]")) return;
      // Check if click is on any category button
      for (const cat of FLYOUT_CATEGORIES) {
        const ref = buttonRefs.current[cat.id];
        if (ref?.current?.contains(target)) return;
      }
      setOpenFlyout(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [openFlyout]);

  const handleToggleFlyout = useCallback((catId: string) => {
    setOpenFlyout((prev) => (prev === catId ? null : catId));
  }, []);

  const handleSelectFromFlyout = useCallback(
    (catId: string, toolKey: string) => {
      setLastUsed((prev) => ({ ...prev, [catId]: toolKey }));
      setOpenFlyout(null);
      onSelectTool(toolKey);
    },
    [onSelectTool]
  );

  const handleMagnetToggle = useCallback(() => {
    const next = !magnetActive;
    setMagnetActive(next);
    onSelectTool(next ? "magnet" : "crosshair");
  }, [magnetActive, onSelectTool]);

  // Compute flyout top for open category
  const getFlyoutTop = (catId: string): number => {
    const ref = buttonRefs.current[catId];
    if (ref?.current) {
      const rect = ref.current.getBoundingClientRect();
      return rect.top;
    }
    return 0;
  };

  return (
    <div
      data-testid="chart-left-toolbar"
      style={{
        width: TOOLBAR_WIDTH,
        minWidth: TOOLBAR_WIDTH,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        background: THEME.axisBg,
        borderRight: `1px solid ${THEME.subPaneBorder}`,
        padding: "4px 3px",
        gap: 2,
        height: "100%",
        boxSizing: "border-box",
        overflowY: "auto",
        overflowX: "hidden",
        position: "relative",
      }}
    >
      {/* === CURSORS (inline, no flyout) === */}
      {CATEGORY_CURSORS.tools.map((tool) => (
        <SimpleButton
          key={tool.key}
          toolKey={tool.key}
          label={tool.label}
          isActive={activeTool === tool.key}
          onClick={() => onSelectTool(tool.key)}
        />
      ))}

      <Divider />

      {/* === FLYOUT CATEGORIES (lines, channels, fib, patterns, shapes, measurement, annotations) === */}
      {FLYOUT_CATEGORIES.map((cat, idx) => (
        <React.Fragment key={cat.id}>
          {idx > 0 && <Divider />}
          <CategoryButton
            category={cat}
            activeTool={activeTool}
            lastUsed={lastUsed[cat.id]}
            isOpen={openFlyout === cat.id}
            onToggle={() => handleToggleFlyout(cat.id)}
            onSelectTool={(key) => handleSelectFromFlyout(cat.id, key)}
            buttonRef={buttonRefs.current[cat.id]}
          />
          {/* Render flyout via portal-like fixed positioning */}
          {openFlyout === cat.id && (
            <FlyoutMenu
              category={cat}
              activeTool={activeTool}
              top={getFlyoutTop(cat.id)}
              onSelectTool={(key) => handleSelectFromFlyout(cat.id, key)}
            />
          )}
        </React.Fragment>
      ))}

      <Divider />

      {/* === MAGNET TOGGLE === */}
      <SimpleButton
        toolKey="magnet"
        label={magnetActive ? "Magnet: ON" : "Magnet: OFF"}
        isActive={magnetActive}
        onClick={handleMagnetToggle}
      />

      {/* === Spacer === */}
      <div style={{ flex: 1 }} />

      {/* === UTILITIES === */}
      <Divider />
      <SimpleButton
        toolKey="zoomIn"
        label="Zoom In"
        isActive={activeTool === "zoomIn"}
        onClick={() => onSelectTool("zoomIn")}
      />
      <SimpleButton
        toolKey="eraser"
        label="Eraser"
        isActive={activeTool === "eraser"}
        onClick={() => onSelectTool("eraser")}
      />

      <Divider />

      {/* === DELETE ALL === */}
      <DeleteAllButton hasDrawings={hasDrawings} onClearDrawings={onClearDrawings} />
    </div>
  );
}
