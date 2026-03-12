/**
 * interactions.ts -- Keyboard shortcuts, axis drag-to-scale, and mouse zone detection
 *
 * Pure functions for chart interaction handling:
 * - Shortcut definitions and matcher for keyboard navigation/tools
 * - Mouse zone detection (chart area vs price axis vs time axis)
 * - Axis drag state machine for vertical price zoom and horizontal time zoom
 * - Scale application helpers that integrate with ZoomPanState
 */

import type { ZoomPanState } from "./zoom";

/* ------------------------------------------------------------------ */
/*  1. Keyboard Shortcuts                                             */
/* ------------------------------------------------------------------ */

export interface ShortcutDef {
  key: string;        // KeyboardEvent.key
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  action: string;     // action identifier
  label: string;      // human-readable for context menu
}

export const SHORTCUTS: ShortcutDef[] = [
  // Navigation
  { key: "ArrowLeft", action: "panLeft", label: "Pan Left" },
  { key: "ArrowRight", action: "panRight", label: "Pan Right" },
  { key: "ArrowUp", action: "zoomIn", label: "Zoom In" },
  { key: "ArrowDown", action: "zoomOut", label: "Zoom Out" },
  { key: "+", action: "zoomIn", label: "Zoom In" },
  { key: "-", action: "zoomOut", label: "Zoom Out" },
  { key: "=", action: "zoomIn", label: "Zoom In" },

  // Actions
  { key: "Delete", action: "deleteDrawing", label: "Delete Drawing" },
  { key: "Escape", action: "cancel", label: "Cancel" },
  { key: "r", ctrl: true, action: "resetChart", label: "Reset Chart" },
  { key: "z", ctrl: true, action: "undo", label: "Undo" },
  { key: "y", ctrl: true, action: "redo", label: "Redo" },
  { key: "z", ctrl: true, shift: true, action: "redo", label: "Redo" },
  { key: "s", ctrl: true, shift: true, action: "screenshot", label: "Screenshot" },

  // Drawing tools
  { key: "t", alt: true, action: "drawTrendline", label: "Trend Line" },
  { key: "h", alt: true, action: "drawHorizontal", label: "Horizontal Line" },
  { key: "f", alt: true, action: "drawFibonacci", label: "Fibonacci" },
  { key: "r", alt: true, action: "drawRectangle", label: "Rectangle" },

  // Display
  { key: "F11", action: "fullscreen", label: "Fullscreen" },
  { key: "/", action: "openIndicators", label: "Open Indicators" },
  { key: ".", action: "openSymbolSearch", label: "Search Symbol" },
];

/* ------------------------------------------------------------------ */
/*  2. Shortcut Matcher                                               */
/* ------------------------------------------------------------------ */

/**
 * Match a KeyboardEvent against the SHORTCUTS table.
 * Returns the action string for the first matching shortcut, or null.
 *
 * Modifier matching is strict: if the shortcut specifies ctrl=true,
 * the event must have ctrlKey=true. If the shortcut does not specify
 * ctrl (undefined/false), the event must have ctrlKey=false.
 * Same logic for shift and alt.
 */
export function matchShortcut(e: KeyboardEvent): string | null {
  for (const s of SHORTCUTS) {
    if (s.key !== e.key) continue;
    if (!!s.ctrl !== e.ctrlKey) continue;
    if (!!s.shift !== e.shiftKey) continue;
    if (!!s.alt !== e.altKey) continue;
    return s.action;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  3. Mouse Zone Detection                                           */
/* ------------------------------------------------------------------ */

export type MouseZone = "chart" | "priceAxis" | "timeAxis" | "corner";

/**
 * Determine which interactive zone a mouse coordinate falls in.
 *
 * Layout regions (all values in canvas pixels):
 *   - Price axis: right strip of width `priceAxisWidth`
 *   - Time axis: bottom strip of height `timeAxisHeight`
 *   - Corner: intersection of price axis and time axis (bottom-right)
 *   - Chart: everything else
 */
export function detectMouseZone(
  x: number,
  y: number,
  _chartLeft: number,
  _chartWidth: number,
  _mainTop: number,
  _mainHeight: number,
  priceAxisWidth: number,
  timeAxisHeight: number,
  totalWidth: number,
  totalHeight: number,
): MouseZone {
  const inPriceColumn = x > totalWidth - priceAxisWidth;
  const inTimeRow = y > totalHeight - timeAxisHeight;

  if (inPriceColumn && inTimeRow) return "corner";
  if (inPriceColumn) return "priceAxis";
  if (inTimeRow) return "timeAxis";
  return "chart";
}

/* ------------------------------------------------------------------ */
/*  4. Axis Drag State Machine                                        */
/* ------------------------------------------------------------------ */

export interface AxisDragState {
  isDragging: boolean;
  zone: MouseZone;
  startY: number;          // For price axis drag
  startX: number;          // For time axis drag
  startPriceRange: number; // Initial price range at drag start
  startBarRange: number;   // Initial bar range at drag start
}

export function createAxisDragState(): AxisDragState {
  return {
    isDragging: false,
    zone: "chart",
    startY: 0,
    startX: 0,
    startPriceRange: 0,
    startBarRange: 0,
  };
}

/**
 * Begin an axis drag. Called on mousedown when the cursor is in
 * the price axis or time axis zone.
 */
export function startAxisDrag(
  state: AxisDragState,
  zone: MouseZone,
  mouseX: number,
  mouseY: number,
  currentPriceRange: number,
  currentBarRange: number,
): AxisDragState {
  return {
    isDragging: true,
    zone,
    startX: mouseX,
    startY: mouseY,
    startPriceRange: currentPriceRange,
    startBarRange: currentBarRange,
  };
}

/**
 * Compute scale factors while an axis drag is in progress.
 *
 * Price axis (vertical):
 *   Dragging UP   (negative deltaY) = zoom IN  (scale < 1 -> narrower price range)
 *   Dragging DOWN (positive deltaY) = zoom OUT (scale > 1 -> wider price range)
 *
 * Time axis (horizontal):
 *   Dragging LEFT  (negative deltaX) = zoom IN  (scale < 1 -> fewer bars visible)
 *   Dragging RIGHT (positive deltaX) = zoom OUT (scale > 1 -> more bars visible)
 *
 * Returns a multiplier pair. A value of 1.0 means no change on that axis.
 * The sensitivity maps a full-height (or full-width) drag to roughly 3x zoom.
 */
export function moveAxisDrag(
  state: AxisDragState,
  mouseX: number,
  mouseY: number,
  chartHeight: number,
  chartWidth: number,
): { priceScale: number; timeScale: number } {
  if (!state.isDragging) return { priceScale: 1, timeScale: 1 };

  const SENSITIVITY = 2.0; // full-dimension drag = 3x (1 + 2)

  if (state.zone === "priceAxis") {
    const deltaY = mouseY - state.startY;
    const ratio = deltaY / (chartHeight || 1);
    const scale = 1 + ratio * SENSITIVITY;
    return { priceScale: Math.max(0.1, Math.min(10, scale)), timeScale: 1 };
  }

  if (state.zone === "timeAxis") {
    const deltaX = mouseX - state.startX;
    const ratio = deltaX / (chartWidth || 1);
    const scale = 1 + ratio * SENSITIVITY;
    return { priceScale: 1, timeScale: Math.max(0.1, Math.min(10, scale)) };
  }

  return { priceScale: 1, timeScale: 1 };
}

/**
 * End the current axis drag, resetting state.
 */
export function endAxisDrag(state: AxisDragState): AxisDragState {
  return {
    ...state,
    isDragging: false,
  };
}

/* ------------------------------------------------------------------ */
/*  5. Zoom State Extensions                                          */
/* ------------------------------------------------------------------ */

/**
 * Apply a vertical price scale multiplier.
 * Used when the user drags the price axis up/down.
 * The viewport renderer should multiply the visible price range by this factor.
 *
 * Clamped to [0.1, 10.0] to prevent degenerate views.
 */
export function applyPriceScale(
  currentScale: number,
  scaleDelta: number,
): number {
  return Math.max(0.1, Math.min(10.0, currentScale * scaleDelta));
}

/**
 * Apply horizontal (time) scaling to a ZoomPanState by adjusting
 * targetStart/targetEnd symmetrically around the current center.
 *
 * scaleDelta < 1 = zoom in (fewer bars), > 1 = zoom out (more bars).
 * The visible half-range is clamped to [5, barCount/2].
 */
export function applyTimeScale(
  state: ZoomPanState,
  scaleDelta: number,
  barCount: number,
): ZoomPanState {
  const center = (state.targetStart + state.targetEnd) / 2;
  const halfRange = (state.targetEnd - state.targetStart) / 2;
  const newHalf = halfRange * scaleDelta;

  const minHalf = 5;
  const maxHalf = barCount / 2;
  const clampedHalf = Math.max(minHalf, Math.min(maxHalf, newHalf));

  let newStart = center - clampedHalf;
  let newEnd = center + clampedHalf;

  // Clamp to valid bar range
  if (newStart < 0) {
    newStart = 0;
    newEnd = clampedHalf * 2;
  }
  if (newEnd > barCount - 1) {
    newEnd = barCount - 1;
    newStart = newEnd - clampedHalf * 2;
  }
  if (newStart < 0) newStart = 0;

  return {
    ...state,
    targetStart: newStart,
    targetEnd: newEnd,
    isAnimating: true,
    velocityX: 0,
  };
}
