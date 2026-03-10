/**
 * undoRedo.ts -- Undo/redo system for chart drawings
 *
 * Maintains an immutable history stack of drawing states with a pointer
 * into the stack. Push truncates forward history; undo/redo move the
 * pointer. Max history is capped to prevent unbounded memory growth.
 */

import type { Drawing } from "../renderers/drawings";

// ── Types ────────────────────────────────────────────────

export interface UndoRedoState {
  /** Stack of drawing snapshots. Each entry is a full copy of drawings at that point. */
  history: Drawing[][];
  /** Current position in history (0-based). Points to the active state. */
  pointer: number;
  /** Maximum number of history entries to retain. */
  maxHistory: number;
}

// ── Factory ──────────────────────────────────────────────

/**
 * Create a fresh undo/redo state seeded with the initial drawings.
 */
export function createUndoRedoState(
  initialDrawings: Drawing[],
  maxHistory: number = 50,
): UndoRedoState {
  return {
    history: [deepCopyDrawings(initialDrawings)],
    pointer: 0,
    maxHistory: Math.max(1, maxHistory),
  };
}

// ── Mutations ────────────────────────────────────────────

/**
 * Push a new state after a drawing change (add, remove, modify).
 *
 * Truncates any redo history beyond the current pointer, then appends
 * the new state. If history exceeds maxHistory, the oldest entry is
 * discarded and the pointer is adjusted.
 */
export function pushState(
  state: UndoRedoState,
  drawings: Drawing[],
): UndoRedoState {
  // Truncate forward history
  const truncated = state.history.slice(0, state.pointer + 1);

  // Append new state
  truncated.push(deepCopyDrawings(drawings));

  // Enforce max history
  let pointer = truncated.length - 1;
  let history = truncated;
  if (history.length > state.maxHistory) {
    const excess = history.length - state.maxHistory;
    history = history.slice(excess);
    pointer = history.length - 1;
  }

  return {
    history,
    pointer,
    maxHistory: state.maxHistory,
  };
}

/**
 * Undo -- go back one step.
 * Returns the new state and the drawings to restore.
 * If already at the beginning, returns current state unchanged.
 */
export function undo(
  state: UndoRedoState,
): { state: UndoRedoState; drawings: Drawing[] } {
  if (!canUndo(state)) {
    return {
      state,
      drawings: deepCopyDrawings(state.history[state.pointer]),
    };
  }

  const newPointer = state.pointer - 1;
  const newState: UndoRedoState = {
    ...state,
    pointer: newPointer,
  };
  return {
    state: newState,
    drawings: deepCopyDrawings(state.history[newPointer]),
  };
}

/**
 * Redo -- go forward one step.
 * Returns the new state and the drawings to restore.
 * If already at the end, returns current state unchanged.
 */
export function redo(
  state: UndoRedoState,
): { state: UndoRedoState; drawings: Drawing[] } {
  if (!canRedo(state)) {
    return {
      state,
      drawings: deepCopyDrawings(state.history[state.pointer]),
    };
  }

  const newPointer = state.pointer + 1;
  const newState: UndoRedoState = {
    ...state,
    pointer: newPointer,
  };
  return {
    state: newState,
    drawings: deepCopyDrawings(state.history[newPointer]),
  };
}

// ── Queries ──────────────────────────────────────────────

/** True when there is at least one prior state to undo to. */
export function canUndo(state: UndoRedoState): boolean {
  return state.pointer > 0;
}

/** True when there is at least one forward state to redo to. */
export function canRedo(state: UndoRedoState): boolean {
  return state.pointer < state.history.length - 1;
}

/** Returns the current drawings snapshot (deep copy). */
export function currentDrawings(state: UndoRedoState): Drawing[] {
  return deepCopyDrawings(state.history[state.pointer]);
}

/** Returns the number of undo steps available. */
export function undoDepth(state: UndoRedoState): number {
  return state.pointer;
}

/** Returns the number of redo steps available. */
export function redoDepth(state: UndoRedoState): number {
  return state.history.length - 1 - state.pointer;
}

// ── Internal ─────────────────────────────────────────────

/**
 * Deep-copy a drawings array so that mutations to the original
 * do not corrupt history entries.
 */
function deepCopyDrawings(drawings: Drawing[]): Drawing[] {
  return drawings.map((d) => ({
    ...d,
    points: d.points.map((p) => ({ ...p })),
  }));
}
