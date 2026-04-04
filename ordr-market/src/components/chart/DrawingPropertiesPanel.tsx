/**
 * DrawingPropertiesPanel.tsx — Full TradingView-parity properties panel.
 *
 * Sections: Style, Extend/Arrows, Text, Statistics, Display, Actions.
 * Appears on right-click of any drawing. Dark theme, scrollable.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import type { Drawing, DrawingType, DrawingStats, LineStyle, RectLabelPosition } from "./renderers/drawings";
import { DEFAULT_STATS } from "./renderers/drawings";
import { THEME } from "./core/theme";

interface Props {
  drawing: Drawing;
  x: number;
  y: number;
  onUpdate: (updated: Drawing) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onCreateParallel?: () => void;
  onClose: () => void;
}

const PRESET_COLORS = [
  "#2962FF", "#FF6D00", "#EF5350", "#26A69A", "#9C27B0",
  "#E91E63", "#00BCD4", "#FFEB3B", "#4CAF50", "#FF5722",
  "#795548", "#607D8B", "#FFFFFF", "#9598A1",
];

const LINE_WIDTHS = [0.5, 1, 1.5, 2, 3, 4];
const LINE_STYLES: LineStyle[] = ["solid", "dashed", "dotted"];
const FONT_SIZES = [9, 10, 11, 12, 14, 16, 18];
const STAT_POSITIONS: DrawingStats["position"][] = ["top", "bottom", "left", "right"];
const RECT_LABEL_POSITIONS: { value: RectLabelPosition; label: string }[] = [
  { value: "top-left", label: "TL" },
  { value: "top-center", label: "TC" },
  { value: "top-right", label: "TR" },
  { value: "center", label: "C" },
  { value: "bottom-left", label: "BL" },
  { value: "bottom-center", label: "BC" },
  { value: "bottom-right", label: "BR" },
];

export default function DrawingPropertiesPanel({
  drawing, x, y, onUpdate, onDelete, onDuplicate, onCreateParallel, onClose,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [label, setLabel] = useState(drawing.label);
  const [activeTab, setActiveTab] = useState<"style" | "text" | "stats">("style");

  // Keep label in sync if drawing changes externally
  useEffect(() => { setLabel(drawing.label); }, [drawing.label]);

  // Position panel within viewport
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
    const timer = setTimeout(() => document.addEventListener("mousedown", handler), 50);
    return () => { clearTimeout(timer); document.removeEventListener("mousedown", handler); };
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

  const updateStats = useCallback((patch: Partial<DrawingStats>) => {
    update({ stats: { ...(drawing.stats || DEFAULT_STATS), ...patch } });
  }, [drawing.stats, update]);

  const commitLabel = useCallback(() => {
    if (label !== drawing.label) update({ label });
  }, [label, drawing.label, update]);

  const isTrendline = drawing.type === "trendline";
  const isRectangle = drawing.type === "rectangle";
  const hasTwoPoints = drawing.points.length >= 2;
  const isLineType = ["trendline", "ray", "extended_line", "horizontal_ray", "info_line", "trend_angle"].includes(drawing.type);
  const isChannel = ["parallel_channel", "regression_trend", "flat_top_bottom", "disjoint_channel",
    "pitchfork", "schiff_pitchfork", "mod_schiff_pitchfork", "inside_pitchfork"].includes(drawing.type);
  const isShape = ["circle", "ellipse", "triangle_shape", "arc"].includes(drawing.type);
  const isAnnotation = ["text_note", "anchored_text", "callout", "price_label"].includes(drawing.type);
  const isPosition = ["long_position", "short_position"].includes(drawing.type);
  const hasExtend = isLineType || isRectangle || isChannel;
  const hasArrows = isLineType;
  const hasFill = isRectangle || isChannel || isShape || isPosition;

  return (
    <div
      ref={ref}
      style={{
        position: "fixed", left: pos.x, top: pos.y, zIndex: 10000,
        background: "#1E222D", border: `1px solid ${THEME.subPaneBorder}`,
        borderRadius: 6, boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        width: 280, maxHeight: 480,
        fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "#D1D4DC",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Header */}
      <div style={{
        padding: "8px 12px", borderBottom: `1px solid ${THEME.subPaneBorder}`,
        fontWeight: 700, fontSize: 10, textTransform: "uppercase",
        color: THEME.axisText, letterSpacing: 0.5,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span>{getTypeName(drawing.type)}</span>
          {drawing.locked && <span style={{ color: "#FF9800", fontSize: 9 }}>LOCKED</span>}
        </div>
        <button onClick={onClose} style={closeBtnS}>&times;</button>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: `1px solid ${THEME.subPaneBorder}` }}>
        {(["style", "text", "stats"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              flex: 1, padding: "5px 0", border: "none", cursor: "pointer",
              fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, fontWeight: 600,
              textTransform: "uppercase",
              background: activeTab === tab ? "#2A2E39" : "transparent",
              color: activeTab === tab ? "#D1D4DC" : THEME.axisText,
              borderBottom: activeTab === tab ? `2px solid ${drawing.color}` : "2px solid transparent",
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content (scrollable) */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 12px", display: "flex", flexDirection: "column", gap: 8 }}>

        {/* ── STYLE TAB ── */}
        {activeTab === "style" && (<>
          {/* Color */}
          <Row label="Color">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
              {PRESET_COLORS.map((c) => (
                <button key={c} onClick={() => update({ color: c })} style={{
                  width: 18, height: 18, borderRadius: 3, background: c, padding: 0,
                  border: drawing.color === c ? "2px solid #D1D4DC" : "1px solid rgba(255,255,255,0.1)",
                  cursor: "pointer",
                }} />
              ))}
            </div>
          </Row>

          {/* Line Width */}
          <Row label="Width">
            <div style={{ display: "flex", gap: 3 }}>
              {LINE_WIDTHS.map((w) => (
                <button key={w} onClick={() => update({ lineWidth: w })} style={{
                  width: 28, height: 22, borderRadius: 3, padding: 0, cursor: "pointer",
                  background: drawing.lineWidth === w ? "#2A2E39" : "transparent",
                  border: drawing.lineWidth === w ? `1px solid ${drawing.color}` : "1px solid rgba(255,255,255,0.05)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <div style={{ width: 16, height: Math.max(1, w), background: drawing.color, borderRadius: 1 }} />
                </button>
              ))}
            </div>
          </Row>

          {/* Line Style */}
          <Row label="Style">
            <div style={{ display: "flex", gap: 3 }}>
              {LINE_STYLES.map((s) => (
                <button key={s} onClick={() => update({ lineStyle: s })} style={{
                  width: 48, height: 22, borderRadius: 3, padding: 0, cursor: "pointer",
                  background: (drawing.lineStyle || "solid") === s ? "#2A2E39" : "transparent",
                  border: (drawing.lineStyle || "solid") === s ? `1px solid ${drawing.color}` : "1px solid rgba(255,255,255,0.05)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <svg width="32" height="2" style={{ overflow: "visible" }}>
                    <line x1="0" y1="1" x2="32" y2="1" stroke={drawing.color} strokeWidth="1.5"
                      strokeDasharray={s === "dashed" ? "6,4" : s === "dotted" ? "2,2" : "none"} />
                  </svg>
                </button>
              ))}
            </div>
          </Row>

          {/* Opacity */}
          <Row label="Opacity">
            <input type="range" min={0.1} max={1} step={0.05}
              value={drawing.opacity} onChange={(e) => update({ opacity: parseFloat(e.target.value) })}
              style={{ flex: 1, accentColor: drawing.color }} />
            <span style={{ fontSize: 10, color: THEME.axisText, minWidth: 28, textAlign: "right" }}>
              {Math.round(drawing.opacity * 100)}%
            </span>
          </Row>

          {/* Extend (line types + rectangle + channels) */}
          {hasExtend && (
            <Row label="Extend">
              <div style={{ display: "flex", gap: 4 }}>
                <Tog active={drawing.extendLeft} onClick={() => update({ extendLeft: !drawing.extendLeft })}
                  label="\u2190 LEFT" color={drawing.color} />
                <Tog active={drawing.extendRight} onClick={() => update({ extendRight: !drawing.extendRight })}
                  label="RIGHT \u2192" color={drawing.color} />
              </div>
            </Row>
          )}

          {/* Arrows (line types) */}
          {hasArrows && (
            <Row label="Arrows">
              <div style={{ display: "flex", gap: 4 }}>
                <Tog active={drawing.arrowLeft || false} onClick={() => update({ arrowLeft: !drawing.arrowLeft })}
                  label="\u25C0 LEFT" color={drawing.color} />
                <Tog active={drawing.arrowRight || false} onClick={() => update({ arrowRight: !drawing.arrowRight })}
                  label="RIGHT \u25B6" color={drawing.color} />
              </div>
            </Row>
          )}

          {/* Fill (rectangle, channels, shapes, positions) */}
          {hasFill && (<>
            <SectionHeader label="Fill" />
            <Row label="Show">
              <Tog active={drawing.fillEnabled !== false} onClick={() => update({ fillEnabled: !(drawing.fillEnabled !== false) })}
                label={drawing.fillEnabled !== false ? "VISIBLE" : "HIDDEN"} color={drawing.color} />
            </Row>
            {drawing.fillEnabled !== false && (
              <Row label="Color">
                <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                  <button onClick={() => update({ fillColor: "" })} style={{
                    width: 18, height: 18, borderRadius: 3, padding: 0, cursor: "pointer",
                    background: `conic-gradient(red, yellow, lime, aqua, blue, magenta, red)`,
                    border: !drawing.fillColor ? "2px solid #D1D4DC" : "1px solid rgba(255,255,255,0.1)",
                  }} title="Use border color" />
                  {PRESET_COLORS.slice(0, 10).map((c) => (
                    <button key={c} onClick={() => update({ fillColor: c })} style={{
                      width: 18, height: 18, borderRadius: 3, background: c, padding: 0,
                      border: drawing.fillColor === c ? "2px solid #D1D4DC" : "1px solid rgba(255,255,255,0.1)",
                      cursor: "pointer",
                    }} />
                  ))}
                </div>
              </Row>
            )}
            {drawing.fillEnabled !== false && (
              <Row label="Opacity">
                <input type="range" min={0.02} max={0.8} step={0.02}
                  value={drawing.fillOpacity ?? 0.15} onChange={(e) => update({ fillOpacity: parseFloat(e.target.value) })}
                  style={{ flex: 1, accentColor: drawing.color }} />
                <span style={{ fontSize: 10, color: THEME.axisText, minWidth: 28, textAlign: "right" }}>
                  {Math.round((drawing.fillOpacity ?? 0.15) * 100)}%
                </span>
              </Row>
            )}
          </>)}

          {/* Middle Line (rectangle + channels) */}
          {(isRectangle || isChannel) && (<>
            <SectionHeader label="Middle Line" />
            <Row label="Show">
              <Tog active={drawing.midLine || false} onClick={() => update({ midLine: !drawing.midLine })}
                label={drawing.midLine ? "VISIBLE" : "HIDDEN"} color={drawing.color} />
            </Row>
            {drawing.midLine && (<>
              <Row label="Color">
                <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                  <button onClick={() => update({ midLineColor: "" })} style={{
                    width: 18, height: 18, borderRadius: 3, padding: 0, cursor: "pointer",
                    background: `conic-gradient(red, yellow, lime, aqua, blue, magenta, red)`,
                    border: !drawing.midLineColor ? "2px solid #D1D4DC" : "1px solid rgba(255,255,255,0.1)",
                  }} title="Use border color" />
                  {PRESET_COLORS.slice(0, 8).map((c) => (
                    <button key={c} onClick={() => update({ midLineColor: c })} style={{
                      width: 18, height: 18, borderRadius: 3, background: c, padding: 0,
                      border: drawing.midLineColor === c ? "2px solid #D1D4DC" : "1px solid rgba(255,255,255,0.1)",
                      cursor: "pointer",
                    }} />
                  ))}
                </div>
              </Row>
              <Row label="Width">
                <div style={{ display: "flex", gap: 3 }}>
                  {[0.5, 1, 1.5, 2].map((w) => (
                    <button key={w} onClick={() => update({ midLineWidth: w })} style={{
                      width: 28, height: 22, borderRadius: 3, padding: 0, cursor: "pointer",
                      background: (drawing.midLineWidth || 1) === w ? "#2A2E39" : "transparent",
                      border: (drawing.midLineWidth || 1) === w ? `1px solid ${drawing.color}` : "1px solid rgba(255,255,255,0.05)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <div style={{ width: 16, height: Math.max(1, w), background: drawing.midLineColor || drawing.color, borderRadius: 1 }} />
                    </button>
                  ))}
                </div>
              </Row>
              <Row label="Style">
                <div style={{ display: "flex", gap: 3 }}>
                  {LINE_STYLES.map((s) => (
                    <button key={s} onClick={() => update({ midLineStyle: s })} style={{
                      width: 48, height: 22, borderRadius: 3, padding: 0, cursor: "pointer",
                      background: (drawing.midLineStyle || "dashed") === s ? "#2A2E39" : "transparent",
                      border: (drawing.midLineStyle || "dashed") === s ? `1px solid ${drawing.color}` : "1px solid rgba(255,255,255,0.05)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <svg width="32" height="2" style={{ overflow: "visible" }}>
                        <line x1="0" y1="1" x2="32" y2="1" stroke={drawing.midLineColor || drawing.color} strokeWidth="1"
                          strokeDasharray={s === "dashed" ? "6,4" : s === "dotted" ? "2,2" : "none"} />
                      </svg>
                    </button>
                  ))}
                </div>
              </Row>
            </>)}
          </>)}

          {/* Display toggles */}
          <SectionHeader label="Display" />
          {isLineType && (
            <Row label="Angle">
              <Tog active={drawing.showAngle} onClick={() => update({ showAngle: !drawing.showAngle })}
                label={drawing.showAngle ? "VISIBLE" : "HIDDEN"} color={drawing.color} />
            </Row>
          )}
          {isLineType && (
            <Row label="Mid Pt">
              <Tog active={drawing.showMidPoint || false} onClick={() => update({ showMidPoint: !drawing.showMidPoint })}
                label={drawing.showMidPoint ? "VISIBLE" : "HIDDEN"} color={drawing.color} />
            </Row>
          )}
          <Row label="Axis">
            <Tog active={drawing.showPriceLabels || false} onClick={() => update({ showPriceLabels: !drawing.showPriceLabels })}
              label={drawing.showPriceLabels ? "PRICES ON" : "PRICES OFF"} color={drawing.color} />
          </Row>
          <Row label="Lock">
            <Tog active={drawing.locked || false} onClick={() => update({ locked: !drawing.locked })}
              label={drawing.locked ? "LOCKED" : "UNLOCKED"} color={drawing.locked ? "#FF9800" : drawing.color} />
          </Row>

          {/* Coordinates */}
          {hasTwoPoints && (<>
            <SectionHeader label="Coordinates" />
            {drawing.points.map((pt, pi) => (
              <Row key={pi} label={`P${pi + 1}`}>
                <CoordInput value={pt.index} onChange={(v) => {
                  const pts = [...drawing.points];
                  pts[pi] = { ...pts[pi], index: v };
                  update({ points: pts });
                }} label="Bar" />
                <CoordInput value={parseFloat(pt.price.toFixed(5))} onChange={(v) => {
                  const pts = [...drawing.points];
                  pts[pi] = { ...pts[pi], price: v };
                  update({ points: pts });
                }} label="Price" step={0.00001} />
              </Row>
            ))}
          </>)}
        </>)}

        {/* ── TEXT TAB ── */}
        {activeTab === "text" && (<>
          <Row label="Label">
            <input value={label} onChange={(e) => setLabel(e.target.value)}
              onBlur={commitLabel} onKeyDown={(e) => { if (e.key === "Enter") commitLabel(); }}
              placeholder="Name this line..." style={inputS} />
          </Row>
          <Row label="Size">
            <div style={{ display: "flex", gap: 3 }}>
              {FONT_SIZES.map(s => (
                <button key={s} onClick={() => update({ labelFontSize: s })} style={{
                  width: 24, height: 22, borderRadius: 3, padding: 0, cursor: "pointer",
                  fontFamily: "'IBM Plex Mono', monospace", fontSize: 9,
                  background: (drawing.labelFontSize || 11) === s ? "#2A2E39" : "transparent",
                  border: (drawing.labelFontSize || 11) === s ? `1px solid ${drawing.color}` : "1px solid rgba(255,255,255,0.05)",
                  color: "#D1D4DC",
                }}>{s}</button>
              ))}
            </div>
          </Row>
          <Row label="Format">
            <div style={{ display: "flex", gap: 4 }}>
              <Tog active={drawing.labelBold || false} onClick={() => update({ labelBold: !drawing.labelBold })}
                label="B" color={drawing.color} />
              <Tog active={drawing.labelItalic || false} onClick={() => update({ labelItalic: !drawing.labelItalic })}
                label="I" color={drawing.color} />
            </div>
          </Row>
          <Row label="Color">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
              <button onClick={() => update({ labelColor: "" })} style={{
                width: 18, height: 18, borderRadius: 3, padding: 0, cursor: "pointer",
                background: `conic-gradient(red, yellow, lime, aqua, blue, magenta, red)`,
                border: !drawing.labelColor ? "2px solid #D1D4DC" : "1px solid rgba(255,255,255,0.1)",
              }} title="Use line color" />
              {PRESET_COLORS.slice(0, 10).map((c) => (
                <button key={c} onClick={() => update({ labelColor: c })} style={{
                  width: 18, height: 18, borderRadius: 3, background: c, padding: 0,
                  border: drawing.labelColor === c ? "2px solid #D1D4DC" : "1px solid rgba(255,255,255,0.1)",
                  cursor: "pointer",
                }} />
              ))}
            </div>
          </Row>
          <Row label="Align">
            <div style={{ display: "flex", gap: 3 }}>
              {(["left", "center", "right"] as const).map(a => (
                <Tog key={a} active={(drawing.labelAlign || "right") === a}
                  onClick={() => update({ labelAlign: a })}
                  label={a.toUpperCase()} color={drawing.color} />
              ))}
            </div>
          </Row>
          {/* Rectangle label position (7-position grid) */}
          {isRectangle && (
            <Row label="Pos">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 2, maxWidth: 132 }}>
                {RECT_LABEL_POSITIONS.map(p => (
                  <Tog key={p.value} active={(drawing.labelPosition || "top-left") === p.value}
                    onClick={() => update({ labelPosition: p.value })}
                    label={p.label} color={drawing.color} />
                ))}
              </div>
            </Row>
          )}
        </>)}

        {/* ── STATS TAB ── */}
        {activeTab === "stats" && (<>
          <Row label="Price">
            <Tog active={drawing.stats?.showPrice || false} onClick={() => updateStats({ showPrice: !drawing.stats?.showPrice })}
              label={drawing.stats?.showPrice ? "ON" : "OFF"} color={drawing.color} />
          </Row>
          <Row label="%">
            <Tog active={drawing.stats?.showPercent || false} onClick={() => updateStats({ showPercent: !drawing.stats?.showPercent })}
              label={drawing.stats?.showPercent ? "ON" : "OFF"} color={drawing.color} />
          </Row>
          <Row label="Pips">
            <Tog active={drawing.stats?.showPips ?? true} onClick={() => updateStats({ showPips: !(drawing.stats?.showPips ?? true) })}
              label={drawing.stats?.showPips !== false ? "ON" : "OFF"} color={drawing.color} />
          </Row>
          <Row label="Bars">
            <Tog active={drawing.stats?.showBars || false} onClick={() => updateStats({ showBars: !drawing.stats?.showBars })}
              label={drawing.stats?.showBars ? "ON" : "OFF"} color={drawing.color} />
          </Row>
          <Row label="Dates">
            <Tog active={drawing.stats?.showDateRange || false} onClick={() => updateStats({ showDateRange: !drawing.stats?.showDateRange })}
              label={drawing.stats?.showDateRange ? "ON" : "OFF"} color={drawing.color} />
          </Row>
          <Row label="Angle">
            <Tog active={drawing.stats?.showAngle || false} onClick={() => updateStats({ showAngle: !drawing.stats?.showAngle })}
              label={drawing.stats?.showAngle ? "ON" : "OFF"} color={drawing.color} />
          </Row>

          <SectionHeader label="Options" />
          <Row label="Always">
            <Tog active={drawing.stats?.alwaysShow || false} onClick={() => updateStats({ alwaysShow: !drawing.stats?.alwaysShow })}
              label={drawing.stats?.alwaysShow ? "ALWAYS" : "ON SELECT"} color={drawing.color} />
          </Row>
          <Row label="Pos">
            <div style={{ display: "flex", gap: 3 }}>
              {STAT_POSITIONS.map(p => (
                <Tog key={p} active={(drawing.stats?.position || "top") === p}
                  onClick={() => updateStats({ position: p })}
                  label={p.toUpperCase()} color={drawing.color} />
              ))}
            </div>
          </Row>
        </>)}
      </div>

      {/* Actions (always visible at bottom) */}
      <div style={{
        padding: "6px 12px 8px", borderTop: `1px solid ${THEME.subPaneBorder}`,
        display: "flex", gap: 4, flexWrap: "wrap",
      }}>
        <ActionBtn onClick={onDuplicate} label="CLONE" />
        {isLineType && onCreateParallel && (
          <ActionBtn onClick={onCreateParallel} label="PARALLEL" />
        )}
        <ActionBtn onClick={onDelete} label="DELETE" danger />
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════
//  Sub-components
// ══════════════════════════════════════════════════════

const closeBtnS: React.CSSProperties = {
  background: "none", border: "none", color: THEME.axisText,
  cursor: "pointer", fontSize: 14, lineHeight: 1, padding: 0,
};

const inputS: React.CSSProperties = {
  flex: 1, background: "#131722", border: `1px solid ${THEME.subPaneBorder}`,
  borderRadius: 3, padding: "3px 6px", color: "#D1D4DC",
  fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, outline: "none",
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 10, color: THEME.axisText, minWidth: 44, textTransform: "uppercase" }}>{label}</span>
      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 4 }}>{children}</div>
    </div>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div style={{
      fontSize: 9, fontWeight: 700, color: THEME.axisText, textTransform: "uppercase",
      letterSpacing: 0.5, marginTop: 4, paddingBottom: 2,
      borderBottom: `1px solid ${THEME.subPaneBorder}`,
    }}>
      {label}
    </div>
  );
}

function Tog({ active, onClick, label, color }: { active: boolean; onClick: () => void; label: string; color: string }) {
  return (
    <button onClick={onClick} style={{
      fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, fontWeight: 600,
      padding: "3px 8px", borderRadius: 3,
      background: active ? `${color}22` : "transparent",
      border: `1px solid ${active ? color : "rgba(255,255,255,0.1)"}`,
      color: active ? color : THEME.axisText,
      cursor: "pointer", textTransform: "uppercase",
    }}>
      {label}
    </button>
  );
}

function ActionBtn({ onClick, label, danger }: { onClick: () => void; label: string; danger?: boolean }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fontWeight: 600,
      padding: "5px 0", borderRadius: 3, minWidth: 60,
      background: danger ? "rgba(239,83,80,0.12)" : "rgba(255,255,255,0.04)",
      border: `1px solid ${danger ? "rgba(239,83,80,0.3)" : "rgba(255,255,255,0.08)"}`,
      color: danger ? "#EF5350" : "#D1D4DC",
      cursor: "pointer", textTransform: "uppercase",
    }}>
      {label}
    </button>
  );
}

function CoordInput({ value, onChange, label, step }: {
  value: number; onChange: (v: number) => void; label: string; step?: number;
}) {
  const [val, setVal] = useState(String(value));
  useEffect(() => { setVal(String(value)); }, [value]);
  const commit = () => {
    const n = parseFloat(val);
    if (!isNaN(n) && n !== value) onChange(n);
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
      <span style={{ fontSize: 8, color: THEME.axisText }}>{label}</span>
      <input value={val} onChange={(e) => setVal(e.target.value)}
        onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") commit(); }}
        step={step || 1} type="number"
        style={{
          width: 60, background: "#131722", border: `1px solid ${THEME.subPaneBorder}`,
          borderRadius: 2, padding: "2px 4px", color: "#D1D4DC",
          fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, outline: "none",
        }} />
    </div>
  );
}

function getTypeName(type: DrawingType): string {
  const names: Partial<Record<DrawingType, string>> = {
    trendline: "TRENDLINE", horizontal: "HORIZONTAL", fibonacci: "FIBONACCI", rectangle: "RECTANGLE",
    ray: "RAY", extended_line: "EXTENDED LINE", horizontal_ray: "HORIZONTAL RAY",
    vertical_line: "VERTICAL LINE", cross_line: "CROSS LINE", info_line: "INFO LINE", trend_angle: "TREND ANGLE",
    parallel_channel: "PARALLEL CHANNEL", regression_trend: "REGRESSION", flat_top_bottom: "FLAT TOP/BOTTOM",
    disjoint_channel: "DISJOINT CHANNEL", pitchfork: "PITCHFORK", schiff_pitchfork: "SCHIFF PITCHFORK",
    mod_schiff_pitchfork: "MOD SCHIFF", inside_pitchfork: "INSIDE PITCHFORK",
    fib_extension: "FIB EXTENSION", fib_channel: "FIB CHANNEL", fib_time_zone: "FIB TIME ZONE",
    fib_speed_fan: "FIB SPEED FAN", gann_box: "GANN BOX", gann_fan: "GANN FAN",
    xabcd_pattern: "XABCD PATTERN", cypher_pattern: "CYPHER", abcd_pattern: "ABCD PATTERN",
    triangle_pattern: "TRIANGLE PATTERN", three_drives: "THREE DRIVES", head_shoulders: "HEAD & SHOULDERS",
    elliott_impulse: "ELLIOTT IMPULSE", elliott_correction: "ELLIOTT CORRECTION", elliott_triangle: "ELLIOTT TRIANGLE",
    circle: "CIRCLE", ellipse: "ELLIPSE", triangle_shape: "TRIANGLE", arrow_drawing: "ARROW",
    brush: "BRUSH", polyline: "POLYLINE", arc: "ARC",
    long_position: "LONG POSITION", short_position: "SHORT POSITION",
    date_range: "DATE RANGE", price_range: "PRICE RANGE", date_price_range: "DATE & PRICE RANGE",
    forecast: "FORECAST", text_note: "TEXT", anchored_text: "ANCHORED TEXT", callout: "CALLOUT",
    price_label: "PRICE LABEL", arrow_marker_up: "ARROW UP", arrow_marker_down: "ARROW DOWN", flag_mark: "FLAG",
  };
  return names[type] || type.toUpperCase().replace(/_/g, " ");
}
