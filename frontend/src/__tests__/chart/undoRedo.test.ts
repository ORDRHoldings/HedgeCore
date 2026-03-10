/**
 * undoRedo.test.ts -- Tests for undo/redo system for drawings
 */

import {
  createUndoRedoState,
  pushState,
  undo,
  redo,
  canUndo,
  canRedo,
  currentDrawings,
  undoDepth,
  redoDepth,
} from "@/components/chart/core/undoRedo";
import type { UndoRedoState } from "@/components/chart/core/undoRedo";
import type { Drawing } from "@/components/chart/renderers/drawings";

// ── Helpers ──────────────────────────────────────────────

function makeDrawing(id: string, type: Drawing["type"] = "horizontal"): Drawing {
  return {
    id,
    type,
    points: [{ index: 10, price: 1.1 }],
    color: "#FF0000",
  };
}

function makeDrawings(...ids: string[]): Drawing[] {
  return ids.map((id) => makeDrawing(id));
}

// ── createUndoRedoState ──────────────────────────────────

describe("createUndoRedoState", () => {
  it("creates state with one history entry containing initial drawings", () => {
    const drawings = makeDrawings("a", "b");
    const state = createUndoRedoState(drawings);
    expect(state.history).toHaveLength(1);
    expect(state.pointer).toBe(0);
    expect(state.maxHistory).toBe(50);
  });

  it("deep-copies initial drawings (mutation safety)", () => {
    const drawings = makeDrawings("a");
    const state = createUndoRedoState(drawings);

    // Mutate original
    drawings[0].id = "mutated";
    drawings[0].points[0].price = 999;

    // State should be unaffected
    expect(state.history[0][0].id).toBe("a");
    expect(state.history[0][0].points[0].price).toBe(1.1);
  });

  it("accepts custom maxHistory", () => {
    const state = createUndoRedoState([], 10);
    expect(state.maxHistory).toBe(10);
  });

  it("clamps maxHistory to at least 1", () => {
    const state = createUndoRedoState([], 0);
    expect(state.maxHistory).toBe(1);

    const state2 = createUndoRedoState([], -5);
    expect(state2.maxHistory).toBe(1);
  });

  it("works with empty initial drawings", () => {
    const state = createUndoRedoState([]);
    expect(state.history).toHaveLength(1);
    expect(state.history[0]).toHaveLength(0);
  });
});

// ── pushState ────────────────────────────────────────────

describe("pushState", () => {
  it("appends new state and advances pointer", () => {
    let state = createUndoRedoState(makeDrawings("a"));
    state = pushState(state, makeDrawings("a", "b"));

    expect(state.history).toHaveLength(2);
    expect(state.pointer).toBe(1);
    expect(state.history[1]).toHaveLength(2);
  });

  it("truncates redo history when pushing after undo", () => {
    let state = createUndoRedoState(makeDrawings("a"));
    state = pushState(state, makeDrawings("a", "b"));
    state = pushState(state, makeDrawings("a", "b", "c"));

    // Undo twice
    state = undo(state).state;
    state = undo(state).state;
    expect(state.pointer).toBe(0);

    // Push new state -- should truncate entries 1 and 2
    state = pushState(state, makeDrawings("x"));
    expect(state.history).toHaveLength(2);
    expect(state.pointer).toBe(1);
    expect(state.history[1][0].id).toBe("x");
  });

  it("enforces maxHistory by dropping oldest entries", () => {
    let state = createUndoRedoState(makeDrawings("0"), 5);

    for (let i = 1; i <= 10; i++) {
      state = pushState(state, makeDrawings(String(i)));
    }

    expect(state.history.length).toBeLessThanOrEqual(5);
    expect(state.pointer).toBe(state.history.length - 1);

    // Latest state should be "10"
    expect(state.history[state.pointer][0].id).toBe("10");
  });

  it("deep-copies drawings (mutation safety)", () => {
    const drawings = makeDrawings("a");
    let state = createUndoRedoState([]);
    state = pushState(state, drawings);

    drawings[0].id = "mutated";
    expect(state.history[1][0].id).toBe("a");
  });
});

// ── undo ─────────────────────────────────────────────────

describe("undo", () => {
  it("goes back one step and returns previous drawings", () => {
    let state = createUndoRedoState(makeDrawings("a"));
    state = pushState(state, makeDrawings("a", "b"));

    const result = undo(state);
    expect(result.state.pointer).toBe(0);
    expect(result.drawings).toHaveLength(1);
    expect(result.drawings[0].id).toBe("a");
  });

  it("returns current state when already at beginning", () => {
    const state = createUndoRedoState(makeDrawings("a"));
    const result = undo(state);
    expect(result.state.pointer).toBe(0);
    expect(result.state).toBe(state);
    expect(result.drawings[0].id).toBe("a");
  });

  it("can undo multiple steps", () => {
    let state = createUndoRedoState(makeDrawings("a"));
    state = pushState(state, makeDrawings("a", "b"));
    state = pushState(state, makeDrawings("a", "b", "c"));

    let result = undo(state);
    expect(result.drawings).toHaveLength(2);

    result = undo(result.state);
    expect(result.drawings).toHaveLength(1);
    expect(result.state.pointer).toBe(0);
  });

  it("returns deep copies (mutation safety)", () => {
    let state = createUndoRedoState(makeDrawings("a"));
    state = pushState(state, makeDrawings("a", "b"));

    const result = undo(state);
    result.drawings[0].id = "mutated";
    expect(result.state.history[0][0].id).toBe("a");
  });
});

// ── redo ─────────────────────────────────────────────────

describe("redo", () => {
  it("goes forward one step and returns next drawings", () => {
    let state = createUndoRedoState(makeDrawings("a"));
    state = pushState(state, makeDrawings("a", "b"));
    state = undo(state).state;

    const result = redo(state);
    expect(result.state.pointer).toBe(1);
    expect(result.drawings).toHaveLength(2);
  });

  it("returns current state when already at end", () => {
    let state = createUndoRedoState(makeDrawings("a"));
    state = pushState(state, makeDrawings("a", "b"));

    const result = redo(state);
    expect(result.state.pointer).toBe(1);
    expect(result.state).toBe(state);
    expect(result.drawings).toHaveLength(2);
  });

  it("can redo multiple steps", () => {
    let state = createUndoRedoState(makeDrawings("a"));
    state = pushState(state, makeDrawings("a", "b"));
    state = pushState(state, makeDrawings("a", "b", "c"));

    // Undo all
    state = undo(state).state;
    state = undo(state).state;

    // Redo two steps
    let result = redo(state);
    expect(result.drawings).toHaveLength(2);

    result = redo(result.state);
    expect(result.drawings).toHaveLength(3);
    expect(result.state.pointer).toBe(2);
  });

  it("returns deep copies (mutation safety)", () => {
    let state = createUndoRedoState(makeDrawings("a"));
    state = pushState(state, makeDrawings("a", "b"));
    state = undo(state).state;

    const result = redo(state);
    result.drawings[0].id = "mutated";
    expect(result.state.history[1][0].id).toBe("a");
  });
});

// ── canUndo / canRedo ────────────────────────────────────

describe("canUndo / canRedo", () => {
  it("canUndo is false at initial state", () => {
    const state = createUndoRedoState(makeDrawings("a"));
    expect(canUndo(state)).toBe(false);
  });

  it("canUndo is true after push", () => {
    let state = createUndoRedoState(makeDrawings("a"));
    state = pushState(state, makeDrawings("a", "b"));
    expect(canUndo(state)).toBe(true);
  });

  it("canRedo is false at latest state", () => {
    let state = createUndoRedoState(makeDrawings("a"));
    state = pushState(state, makeDrawings("a", "b"));
    expect(canRedo(state)).toBe(false);
  });

  it("canRedo is true after undo", () => {
    let state = createUndoRedoState(makeDrawings("a"));
    state = pushState(state, makeDrawings("a", "b"));
    state = undo(state).state;
    expect(canRedo(state)).toBe(true);
  });

  it("canRedo becomes false after push (truncates forward history)", () => {
    let state = createUndoRedoState(makeDrawings("a"));
    state = pushState(state, makeDrawings("a", "b"));
    state = undo(state).state;
    expect(canRedo(state)).toBe(true);

    state = pushState(state, makeDrawings("x"));
    expect(canRedo(state)).toBe(false);
  });
});

// ── currentDrawings ──────────────────────────────────────

describe("currentDrawings", () => {
  it("returns the drawings at the current pointer", () => {
    let state = createUndoRedoState(makeDrawings("a"));
    state = pushState(state, makeDrawings("a", "b"));
    state = pushState(state, makeDrawings("a", "b", "c"));

    expect(currentDrawings(state)).toHaveLength(3);

    state = undo(state).state;
    expect(currentDrawings(state)).toHaveLength(2);
  });

  it("returns a deep copy", () => {
    const state = createUndoRedoState(makeDrawings("a"));
    const d = currentDrawings(state);
    d[0].id = "mutated";
    expect(currentDrawings(state)[0].id).toBe("a");
  });
});

// ── undoDepth / redoDepth ────────────────────────────────

describe("undoDepth / redoDepth", () => {
  it("undoDepth is 0 at initial state", () => {
    const state = createUndoRedoState([]);
    expect(undoDepth(state)).toBe(0);
  });

  it("undoDepth grows with each push", () => {
    let state = createUndoRedoState([]);
    state = pushState(state, makeDrawings("a"));
    expect(undoDepth(state)).toBe(1);
    state = pushState(state, makeDrawings("a", "b"));
    expect(undoDepth(state)).toBe(2);
  });

  it("redoDepth is 0 at latest state", () => {
    let state = createUndoRedoState([]);
    state = pushState(state, makeDrawings("a"));
    expect(redoDepth(state)).toBe(0);
  });

  it("redoDepth grows with each undo", () => {
    let state = createUndoRedoState([]);
    state = pushState(state, makeDrawings("a"));
    state = pushState(state, makeDrawings("a", "b"));

    state = undo(state).state;
    expect(redoDepth(state)).toBe(1);

    state = undo(state).state;
    expect(redoDepth(state)).toBe(2);
  });
});

// ── Full workflow ────────────────────────────────────────

describe("full undo/redo workflow", () => {
  it("supports a complete add-undo-redo-branch cycle", () => {
    // Start empty
    let state = createUndoRedoState([]);
    expect(currentDrawings(state)).toHaveLength(0);

    // Add drawing A
    state = pushState(state, makeDrawings("a"));
    expect(currentDrawings(state)).toHaveLength(1);

    // Add drawing B
    state = pushState(state, makeDrawings("a", "b"));
    expect(currentDrawings(state)).toHaveLength(2);

    // Add drawing C
    state = pushState(state, makeDrawings("a", "b", "c"));
    expect(currentDrawings(state)).toHaveLength(3);
    expect(undoDepth(state)).toBe(3);
    expect(redoDepth(state)).toBe(0);

    // Undo to 2 drawings
    const r1 = undo(state);
    state = r1.state;
    expect(r1.drawings).toHaveLength(2);
    expect(undoDepth(state)).toBe(2);
    expect(redoDepth(state)).toBe(1);

    // Undo to 1 drawing
    const r2 = undo(state);
    state = r2.state;
    expect(r2.drawings).toHaveLength(1);

    // Redo back to 2
    const r3 = redo(state);
    state = r3.state;
    expect(r3.drawings).toHaveLength(2);

    // Branch: push new state (truncates "c" history)
    state = pushState(state, makeDrawings("a", "b", "d"));
    expect(currentDrawings(state)).toHaveLength(3);
    expect(currentDrawings(state)[2].id).toBe("d");
    expect(canRedo(state)).toBe(false);
    expect(canUndo(state)).toBe(true);
  });
});
