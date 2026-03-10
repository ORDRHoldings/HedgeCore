"use client";
/**
 * IndicatorLayers.tsx -- Interactive indicator chips overlaid on the chart canvas
 *
 * TradingView-style indicator labels shown at the top-left of the main chart
 * pane. Each chip displays the indicator color dot, name, and a remove button
 * on hover. Positioned absolutely over the canvas container.
 */
import React, { useState } from "react";

/* ═══════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════ */

export interface OverlayChip {
  key: string;
  label: string;
  color: string;
  enabled: boolean;
}

export interface SubPaneChip {
  key: string;
  label: string;
  color: string;
}

export interface IndicatorLayersProps {
  activeOverlays: OverlayChip[];
  activeSubPanes: SubPaneChip[];
  onRemoveOverlay: (key: string) => void;
  onRemoveSubPane: (key: string) => void;
}

/* ═══════════════════════════════════════════════════════
   Styles
   ═══════════════════════════════════════════════════════ */

const S = {
  container: {
    position: "absolute" as const,
    top: 34,
    left: 10,
    display: "flex",
    flexWrap: "wrap" as const,
    gap: 4,
    pointerEvents: "auto" as const,
    zIndex: 15,
    maxWidth: "calc(100% - 100px)",
  },
  chip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "2px 6px",
    borderRadius: 4,
    background: "rgba(30,34,45,0.85)",
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 10,
    color: "#D1D4DC",
    cursor: "default",
    userSelect: "none" as const,
    border: "1px solid transparent",
    transition: "border-color 0.15s",
    lineHeight: "16px",
  },
  chipHover: {
    borderColor: "rgba(120,123,134,0.3)",
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    flexShrink: 0,
  },
  label: {
    color: "#D1D4DC",
    whiteSpace: "nowrap" as const,
  },
  mutedLabel: {
    color: "#787B86",
    whiteSpace: "nowrap" as const,
    fontSize: 9,
    marginLeft: 2,
  },
  removeBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 14,
    height: 14,
    borderRadius: 3,
    border: "none",
    background: "transparent",
    color: "#787B86",
    cursor: "pointer",
    fontSize: 10,
    fontFamily: "'IBM Plex Mono', monospace",
    fontWeight: 700,
    padding: 0,
    lineHeight: 1,
    marginLeft: 2,
    transition: "color 0.1s, background 0.1s",
  },
  removeBtnHover: {
    color: "#EF5350",
    background: "rgba(239,83,80,0.15)",
  },
  sectionLabel: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 9,
    color: "#545B69",
    padding: "2px 4px",
    alignSelf: "center" as const,
  },
} as const;

/* ═══════════════════════════════════════════════════════
   Chip Sub-component
   ═══════════════════════════════════════════════════════ */

function Chip({
  label,
  color,
  onRemove,
  section,
}: {
  label: string;
  color: string;
  onRemove: () => void;
  section?: string;
}) {
  const [hovered, setHovered] = useState(false);
  const [removeHovered, setRemoveHovered] = useState(false);

  return (
    <div
      style={{
        ...S.chip,
        ...(hovered ? S.chipHover : {}),
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setRemoveHovered(false); }}
    >
      <span style={{ ...S.dot, background: color }} />
      <span style={S.label}>{label}</span>
      {section && <span style={S.mutedLabel}>{section}</span>}
      {hovered && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          onMouseEnter={() => setRemoveHovered(true)}
          onMouseLeave={() => setRemoveHovered(false)}
          style={{
            ...S.removeBtn,
            ...(removeHovered ? S.removeBtnHover : {}),
          }}
          title={`Remove ${label}`}
          aria-label={`Remove ${label}`}
        >
          {"\u00D7"}
        </button>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════════════ */

export default function IndicatorLayers({
  activeOverlays,
  activeSubPanes,
  onRemoveOverlay,
  onRemoveSubPane,
}: IndicatorLayersProps) {
  const enabledOverlays = activeOverlays.filter((o) => o.enabled);

  if (enabledOverlays.length === 0 && activeSubPanes.length === 0) return null;

  return (
    <div style={S.container}>
      {enabledOverlays.map((o) => (
        <Chip
          key={o.key}
          label={o.label}
          color={o.color}
          onRemove={() => onRemoveOverlay(o.key)}
        />
      ))}
      {enabledOverlays.length > 0 && activeSubPanes.length > 0 && (
        <span style={S.sectionLabel}>|</span>
      )}
      {activeSubPanes.map((sp) => (
        <Chip
          key={sp.key}
          label={sp.label}
          color={sp.color}
          section="SUB"
          onRemove={() => onRemoveSubPane(sp.key)}
        />
      ))}
    </div>
  );
}
