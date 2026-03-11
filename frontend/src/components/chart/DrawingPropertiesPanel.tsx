/**
 * DrawingPropertiesPanel.tsx — Floating panel for editing drawing properties.
 * Appears on right-click of a trendline or other drawing.
 * Dark theme, compact, TradingView-style.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import type { Drawing, DrawingType } from "./renderers/drawings";
import { THEME } from "./core/theme";

interface Props {
  drawing: Drawing;
  x: number;
  y: number;
  onUpdate: (updated: Drawing) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onClose: () => void;
}

const PRESET_COLORS = [
  "#2962FF", "#FF6D00", "#EF5350", "#26A69A", "#9C27B0",
  "#E91E63", "#00BCD4", "#FFEB3B", "#4CAF50", "#FF5722",
  "#795548", "#607D8B", "#FFFFFF", "#9598A1",
];

const LINE_WIDTHS = [0.5, 1, 1.5, 2, 3, 4];

export default function DrawingPropertiesPanel({ drawing, x, y, onUpdate, onDelete, onDuplicate, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [label, setLabel] = useState(drawing.label);

  // Position the panel so it doesn't overflow viewport
  const [pos, setPos] = useState({ x, y });
  useEffect(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    let nx = x, ny = y;
    if (x + rect.width > window.innerWidth - 10) nx = x - rect.width;
    if (y + rect.height > window.innerHeight - 10) ny = y - rect.height;
    if (nx < 0) nx = 10;
    if (ny < 0) ny = 10;
    setPos({ x: nx, y: ny });
  }, [x, y]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    // Delay to avoid catching the same right-click
    const timer = setTimeout(() => document.addEventListener("mousedown", handler), 50);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handler);
    };
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const update = useCallback((patch: Partial<Drawing>) => {
    onUpdate({ ...drawing, ...patch });
  }, [drawing, onUpdate]);

  const commitLabel = useCallback(() => {
    if (label !== drawing.label) update({ label });
  }, [label, drawing.label, update]);

  const isTrendline = drawing.type === "trendline";
  const showExtend = isTrendline;
  const showAngleToggle = isTrendline;

  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        left: pos.x,
        top: pos.y,
        zIndex: 10000,
        background: "#1E222D",
        border: `1px solid ${THEME.subPaneBorder}`,
        borderRadius: 6,
        boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        minWidth: 220,
        maxWidth: 280,
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: 11,
        color: "#D1D4DC",
        overflow: "hidden",
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Header */}
      <div style={{
        padding: "8px 12px",
        borderBottom: `1px solid ${THEME.subPaneBorder}`,
        fontWeight: 700, fontSize: 10, textTransform: "uppercase",
        color: THEME.axisText, letterSpacing: 0.5,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <span>{getTypeName(drawing.type)} PROPERTIES</span>
        <button
          onClick={onClose}
          style={{
            background: "none", border: "none", color: THEME.axisText,
            cursor: "pointer", fontSize: 14, lineHeight: 1, padding: 0,
          }}
        >
          &times;
        </button>
      </div>

      <div style={{ padding: "8px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
        {/* Label / Name */}
        <Row label="Label">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={commitLabel}
            onKeyDown={(e) => { if (e.key === "Enter") commitLabel(); }}
            placeholder="Name this line..."
            style={{
              flex: 1, background: "#131722", border: `1px solid ${THEME.subPaneBorder}`,
              borderRadius: 3, padding: "3px 6px", color: "#D1D4DC",
              fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, outline: "none",
            }}
          />
        </Row>

        {/* Color */}
        <Row label="Color">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => update({ color: c })}
                style={{
                  width: 18, height: 18, borderRadius: 3,
                  background: c, border: drawing.color === c ? "2px solid #D1D4DC" : "1px solid rgba(255,255,255,0.1)",
                  cursor: "pointer", padding: 0,
                }}
              />
            ))}
          </div>
        </Row>

        {/* Line Width */}
        <Row label="Width">
          <div style={{ display: "flex", gap: 3 }}>
            {LINE_WIDTHS.map((w) => (
              <button
                key={w}
                onClick={() => update({ lineWidth: w })}
                style={{
                  width: 28, height: 22, borderRadius: 3,
                  background: drawing.lineWidth === w ? "#2A2E39" : "transparent",
                  border: drawing.lineWidth === w ? `1px solid ${drawing.color}` : "1px solid rgba(255,255,255,0.05)",
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                  padding: 0,
                }}
              >
                <div style={{ width: 16, height: Math.max(1, w), background: drawing.color, borderRadius: 1 }} />
              </button>
            ))}
          </div>
        </Row>

        {/* Opacity */}
        <Row label="Opacity">
          <input
            type="range"
            min={0.1}
            max={1}
            step={0.05}
            value={drawing.opacity}
            onChange={(e) => update({ opacity: parseFloat(e.target.value) })}
            style={{ flex: 1, accentColor: drawing.color }}
          />
          <span style={{ fontSize: 10, color: THEME.axisText, minWidth: 28, textAlign: "right" }}>
            {Math.round(drawing.opacity * 100)}%
          </span>
        </Row>

        {/* Extend Left / Right (trendline only) */}
        {showExtend && (
          <Row label="Extend">
            <div style={{ display: "flex", gap: 6 }}>
              <ToggleButton
                active={drawing.extendLeft}
                onClick={() => update({ extendLeft: !drawing.extendLeft })}
                label="← LEFT"
                color={drawing.color}
              />
              <ToggleButton
                active={drawing.extendRight}
                onClick={() => update({ extendRight: !drawing.extendRight })}
                label="RIGHT →"
                color={drawing.color}
              />
            </div>
          </Row>
        )}

        {/* Show Angle (trendline only) */}
        {showAngleToggle && (
          <Row label="Angle">
            <ToggleButton
              active={drawing.showAngle}
              onClick={() => update({ showAngle: !drawing.showAngle })}
              label={drawing.showAngle ? "VISIBLE" : "HIDDEN"}
              color={drawing.color}
            />
          </Row>
        )}
      </div>

      {/* Actions */}
      <div style={{
        padding: "6px 12px 8px",
        borderTop: `1px solid ${THEME.subPaneBorder}`,
        display: "flex", gap: 4,
      }}>
        <ActionBtn onClick={onDuplicate} label="CLONE" />
        <ActionBtn onClick={onDelete} label="DELETE" danger />
      </div>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 10, color: THEME.axisText, minWidth: 44, textTransform: "uppercase" }}>{label}</span>
      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 4 }}>{children}</div>
    </div>
  );
}

function ToggleButton({ active, onClick, label, color }: { active: boolean; onClick: () => void; label: string; color: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, fontWeight: 600,
        padding: "3px 8px", borderRadius: 3,
        background: active ? `${color}22` : "transparent",
        border: `1px solid ${active ? color : "rgba(255,255,255,0.1)"}`,
        color: active ? color : THEME.axisText,
        cursor: "pointer", textTransform: "uppercase",
      }}
    >
      {label}
    </button>
  );
}

function ActionBtn({ onClick, label, danger }: { onClick: () => void; label: string; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fontWeight: 600,
        padding: "5px 0", borderRadius: 3,
        background: danger ? "rgba(239,83,80,0.12)" : "rgba(255,255,255,0.04)",
        border: `1px solid ${danger ? "rgba(239,83,80,0.3)" : "rgba(255,255,255,0.08)"}`,
        color: danger ? "#EF5350" : "#D1D4DC",
        cursor: "pointer", textTransform: "uppercase",
      }}
    >
      {label}
    </button>
  );
}

function getTypeName(type: DrawingType): string {
  switch (type) {
    case "trendline": return "TRENDLINE";
    case "horizontal": return "HORIZONTAL";
    case "fibonacci": return "FIBONACCI";
    case "rectangle": return "RECTANGLE";
    default: return "DRAWING";
  }
}
