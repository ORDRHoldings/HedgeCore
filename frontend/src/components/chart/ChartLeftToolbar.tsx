"use client";
/**
 * ChartLeftToolbar.tsx — TradingView-style vertical drawing toolbar
 *
 * Left-side icon rail for chart drawing tools: cursor modes, lines,
 * shapes, annotations, and utility tools. Pure presentational component.
 */
import React, { useState, useCallback } from "react";
import { THEME } from "./core/theme";

/* ═══════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════ */

export type ToolKey =
  | "cursor"
  | "crosshair"
  | "trendline"
  | "horizontal"
  | "ray"
  | "vertical"
  | "rectangle"
  | "fibonacci"
  | "pitchfork"
  | "text"
  | "arrow"
  | "priceRange"
  | "measure"
  | "zoomIn"
  | "eraser";

export interface ChartLeftToolbarProps {
  activeTool: string;
  onSelectTool: (tool: string) => void;
  hasDrawings: boolean;
  onClearDrawings: () => void;
}

interface ToolDef {
  key: ToolKey;
  label: string;
  icon: React.ReactNode;
}

/* ═══════════════════════════════════════════════════════
   Style Constants
   ═══════════════════════════════════════════════════════ */

const TOOLBAR_WIDTH = 40;
const BUTTON_SIZE = 36;
const ICON_SIZE = 16;
const ACTIVE_BG = "#2962FF";
const HOVER_BG = THEME.subPaneBorder; // #2A2E39
const DIVIDER_COLOR = THEME.subPaneBorder;
const ICON_COLOR = THEME.axisText; // #787B86
const ICON_ACTIVE_COLOR = "#D1D4DC";
const DELETE_HOVER_COLOR = "#EF5350";
const DISABLED_COLOR = "#3A3E4A";

/** Tools that are NOT yet implemented — shown grayed out with "Coming Soon" */
const DISABLED_TOOLS = new Set<ToolKey>([
  "ray", "vertical", "pitchfork", "text", "arrow",
  "priceRange", "measure", "zoomIn", "eraser",
]);

/* ═══════════════════════════════════════════════════════
   SVG Icons (16x16 inline paths)
   ═══════════════════════════════════════════════════════ */

function SvgIcon({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <svg
      width={ICON_SIZE}
      height={ICON_SIZE}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "block" }}
    >
      {typeof children === "string" ? null : children}
      {/* color is applied per-path via stroke/fill props */}
    </svg>
  );
}

function CrosshairIcon({ color }: { color: string }) {
  return (
    <SvgIcon color={color}>
      <line x1="8" y1="1" x2="8" y2="15" stroke={color} strokeWidth="1.2" />
      <line x1="1" y1="8" x2="15" y2="8" stroke={color} strokeWidth="1.2" />
      <circle cx="8" cy="8" r="3" stroke={color} strokeWidth="1.2" />
    </SvgIcon>
  );
}

function PointerIcon({ color }: { color: string }) {
  return (
    <SvgIcon color={color}>
      <path
        d="M4 2L4 12.5L6.8 10L9.5 14L11 13.2L8.3 9.2L11.5 8.5L4 2Z"
        fill={color}
      />
    </SvgIcon>
  );
}

function TrendLineIcon({ color }: { color: string }) {
  return (
    <SvgIcon color={color}>
      <line x1="2" y1="13" x2="14" y2="3" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="2" cy="13" r="1.5" fill={color} />
      <circle cx="14" cy="3" r="1.5" fill={color} />
    </SvgIcon>
  );
}

function HorizontalLineIcon({ color }: { color: string }) {
  return (
    <SvgIcon color={color}>
      <line x1="1" y1="8" x2="15" y2="8" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="1" cy="8" r="1.2" fill={color} />
      <circle cx="15" cy="8" r="1.2" fill={color} />
    </SvgIcon>
  );
}

function RayIcon({ color }: { color: string }) {
  return (
    <SvgIcon color={color}>
      <line x1="2" y1="10" x2="14" y2="6" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="2" cy="10" r="1.5" fill={color} />
      <path d="M11 5L14.5 6L12 8.5" fill={color} />
    </SvgIcon>
  );
}

function VerticalLineIcon({ color }: { color: string }) {
  return (
    <SvgIcon color={color}>
      <line x1="8" y1="1" x2="8" y2="15" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8" cy="1" r="1.2" fill={color} />
      <circle cx="8" cy="15" r="1.2" fill={color} />
    </SvgIcon>
  );
}

function RectangleIcon({ color }: { color: string }) {
  return (
    <SvgIcon color={color}>
      <rect x="2" y="3" width="12" height="10" rx="1" stroke={color} strokeWidth="1.3" />
    </SvgIcon>
  );
}

function FibonacciIcon({ color }: { color: string }) {
  return (
    <SvgIcon color={color}>
      <line x1="1" y1="2" x2="15" y2="2" stroke={color} strokeWidth="1" strokeDasharray="2 2" />
      <line x1="1" y1="5.5" x2="15" y2="5.5" stroke={color} strokeWidth="1" />
      <line x1="1" y1="8" x2="15" y2="8" stroke={color} strokeWidth="1" strokeDasharray="2 2" />
      <line x1="1" y1="10.5" x2="15" y2="10.5" stroke={color} strokeWidth="1" />
      <line x1="1" y1="14" x2="15" y2="14" stroke={color} strokeWidth="1" strokeDasharray="2 2" />
      <text x="1" y="4.5" fill={color} fontSize="3" fontFamily="monospace">0.0</text>
      <text x="1" y="12.5" fill={color} fontSize="3" fontFamily="monospace">1.0</text>
    </SvgIcon>
  );
}

function PitchforkIcon({ color }: { color: string }) {
  return (
    <SvgIcon color={color}>
      <line x1="2" y1="14" x2="8" y2="2" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
      <line x1="14" y1="14" x2="8" y2="2" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
      <line x1="8" y1="2" x2="8" y2="14" stroke={color} strokeWidth="1" strokeDasharray="2 2" />
      <circle cx="8" cy="2" r="1.3" fill={color} />
    </SvgIcon>
  );
}

function TextIcon({ color }: { color: string }) {
  return (
    <SvgIcon color={color}>
      <text
        x="8"
        y="12"
        fill={color}
        fontSize="12"
        fontFamily="'IBM Plex Mono', monospace"
        fontWeight="700"
        textAnchor="middle"
      >
        T
      </text>
    </SvgIcon>
  );
}

function ArrowIcon({ color }: { color: string }) {
  return (
    <SvgIcon color={color}>
      <line x1="2" y1="14" x2="13" y2="3" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M9 2L14 2.5L13.5 7" stroke={color} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </SvgIcon>
  );
}

function PriceRangeIcon({ color }: { color: string }) {
  return (
    <SvgIcon color={color}>
      <line x1="8" y1="2" x2="8" y2="14" stroke={color} strokeWidth="1.3" />
      <path d="M5.5 4.5L8 1.5L10.5 4.5" stroke={color} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M5.5 11.5L8 14.5L10.5 11.5" stroke={color} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <line x1="4" y1="8" x2="12" y2="8" stroke={color} strokeWidth="1" strokeDasharray="2 1" />
    </SvgIcon>
  );
}

function MeasureIcon({ color }: { color: string }) {
  return (
    <SvgIcon color={color}>
      <rect x="2" y="5" width="12" height="6" rx="1" stroke={color} strokeWidth="1.2" fill="none" />
      <line x1="5" y1="5" x2="5" y2="8" stroke={color} strokeWidth="0.8" />
      <line x1="8" y1="5" x2="8" y2="11" stroke={color} strokeWidth="0.8" />
      <line x1="11" y1="5" x2="11" y2="8" stroke={color} strokeWidth="0.8" />
    </SvgIcon>
  );
}

function ZoomInIcon({ color }: { color: string }) {
  return (
    <SvgIcon color={color}>
      <circle cx="7" cy="7" r="4.5" stroke={color} strokeWidth="1.3" />
      <line x1="10.5" y1="10.5" x2="14" y2="14" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="5" y1="7" x2="9" y2="7" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
      <line x1="7" y1="5" x2="7" y2="9" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
    </SvgIcon>
  );
}

function EraserIcon({ color }: { color: string }) {
  return (
    <SvgIcon color={color}>
      <path
        d="M10 2L14 6L7 13H3L2 12L6 8L10 2Z"
        stroke={color}
        strokeWidth="1.2"
        strokeLinejoin="round"
        fill="none"
      />
      <line x1="6" y1="8" x2="10" y2="4" stroke={color} strokeWidth="0.8" />
      <line x1="2" y1="14" x2="14" y2="14" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
    </SvgIcon>
  );
}

function TrashIcon({ color }: { color: string }) {
  return (
    <SvgIcon color={color}>
      <path d="M3 4H13L12 14H4L3 4Z" stroke={color} strokeWidth="1.2" strokeLinejoin="round" fill="none" />
      <line x1="1" y1="4" x2="15" y2="4" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
      <path d="M6 4V2.5C6 2.2 6.2 2 6.5 2H9.5C9.8 2 10 2.2 10 2.5V4" stroke={color} strokeWidth="1.2" />
      <line x1="6.5" y1="6.5" x2="6.5" y2="11.5" stroke={color} strokeWidth="1" strokeLinecap="round" />
      <line x1="9.5" y1="6.5" x2="9.5" y2="11.5" stroke={color} strokeWidth="1" strokeLinecap="round" />
    </SvgIcon>
  );
}

/* ═══════════════════════════════════════════════════════
   Tool Group Definitions
   ═══════════════════════════════════════════════════════ */

const CURSOR_TOOLS: ToolDef[] = [
  { key: "crosshair", label: "Crosshair", icon: null },
  { key: "cursor", label: "Pointer", icon: null },
];

const LINE_TOOLS: ToolDef[] = [
  { key: "trendline", label: "Trend Line", icon: null },
  { key: "horizontal", label: "Horizontal Line", icon: null },
  { key: "ray", label: "Ray", icon: null },
  { key: "vertical", label: "Vertical Line", icon: null },
];

const SHAPE_TOOLS: ToolDef[] = [
  { key: "rectangle", label: "Rectangle", icon: null },
  { key: "fibonacci", label: "Fibonacci", icon: null },
  { key: "pitchfork", label: "Pitchfork", icon: null },
];

const ANNOTATION_TOOLS: ToolDef[] = [
  { key: "text", label: "Text", icon: null },
  { key: "arrow", label: "Arrow", icon: null },
  { key: "priceRange", label: "Price Range", icon: null },
];

const UTILITY_TOOLS: ToolDef[] = [
  { key: "measure", label: "Measure", icon: null },
  { key: "zoomIn", label: "Zoom In", icon: null },
  { key: "eraser", label: "Eraser", icon: null },
];

const TOOL_GROUPS: ToolDef[][] = [
  CURSOR_TOOLS,
  LINE_TOOLS,
  SHAPE_TOOLS,
  ANNOTATION_TOOLS,
  UTILITY_TOOLS,
];

/* ═══════════════════════════════════════════════════════
   Icon Resolver
   ═══════════════════════════════════════════════════════ */

function getToolIcon(key: ToolKey, color: string): React.ReactNode {
  switch (key) {
    case "crosshair": return <CrosshairIcon color={color} />;
    case "cursor": return <PointerIcon color={color} />;
    case "trendline": return <TrendLineIcon color={color} />;
    case "horizontal": return <HorizontalLineIcon color={color} />;
    case "ray": return <RayIcon color={color} />;
    case "vertical": return <VerticalLineIcon color={color} />;
    case "rectangle": return <RectangleIcon color={color} />;
    case "fibonacci": return <FibonacciIcon color={color} />;
    case "pitchfork": return <PitchforkIcon color={color} />;
    case "text": return <TextIcon color={color} />;
    case "arrow": return <ArrowIcon color={color} />;
    case "priceRange": return <PriceRangeIcon color={color} />;
    case "measure": return <MeasureIcon color={color} />;
    case "zoomIn": return <ZoomInIcon color={color} />;
    case "eraser": return <EraserIcon color={color} />;
    default: return null;
  }
}

/* ═══════════════════════════════════════════════════════
   Tool Button
   ═══════════════════════════════════════════════════════ */

function ToolButton({
  toolKey,
  label,
  isActive,
  onClick,
  hoverColor,
}: {
  toolKey: ToolKey;
  label: string;
  isActive: boolean;
  onClick: () => void;
  hoverColor?: string;
}) {
  const [hovered, setHovered] = useState(false);
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const isDisabled = DISABLED_TOOLS.has(toolKey);

  const handleMouseEnter = useCallback(() => {
    setHovered(true);
    setTooltipVisible(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setHovered(false);
    setTooltipVisible(false);
  }, []);

  const iconColor = isDisabled
    ? DISABLED_COLOR
    : isActive
      ? ICON_ACTIVE_COLOR
      : hovered && hoverColor
        ? hoverColor
        : hovered
          ? ICON_ACTIVE_COLOR
          : ICON_COLOR;

  const bgColor = isDisabled
    ? "transparent"
    : isActive
      ? ACTIVE_BG
      : hovered
        ? hoverColor
          ? `${hoverColor}18`
          : HOVER_BG
        : "transparent";

  return (
    <div
      style={{ position: "relative" }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        onClick={isDisabled ? undefined : onClick}
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
          cursor: isDisabled ? "default" : "pointer",
          padding: 0,
          opacity: isDisabled ? 0.4 : 1,
          transition: "background 0.12s ease, opacity 0.12s ease",
        }}
      >
        {getToolIcon(toolKey, iconColor)}
      </button>

      {/* Tooltip */}
      {tooltipVisible && (
        <div
          style={{
            position: "absolute",
            left: TOOLBAR_WIDTH + 4,
            top: "50%",
            transform: "translateY(-50%)",
            background: THEME.tooltipBg,
            color: isDisabled ? "#545B69" : THEME.tooltipText,
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
          {isDisabled ? `${label} — Coming Soon` : label}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Divider
   ═══════════════════════════════════════════════════════ */

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

/* ═══════════════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════════════ */

export default function ChartLeftToolbar({
  activeTool,
  onSelectTool,
  hasDrawings,
  onClearDrawings,
}: ChartLeftToolbarProps) {
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
        padding: "4px 2px",
        gap: 2,
        height: "100%",
        boxSizing: "border-box",
        overflowY: "auto",
        overflowX: "hidden",
      }}
    >
      {/* Tool Groups */}
      {TOOL_GROUPS.map((group, gi) => (
        <React.Fragment key={gi}>
          {gi > 0 && <Divider />}
          {group.map((tool) => (
            <ToolButton
              key={tool.key}
              toolKey={tool.key}
              label={tool.label}
              isActive={activeTool === tool.key}
              onClick={() => onSelectTool(tool.key)}
            />
          ))}
        </React.Fragment>
      ))}

      {/* Spacer pushes delete to bottom */}
      <div style={{ flex: 1 }} />

      {/* Delete All */}
      <Divider />
      <DeleteAllButton
        hasDrawings={hasDrawings}
        onClearDrawings={onClearDrawings}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Delete All Button
   ═══════════════════════════════════════════════════════ */

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
