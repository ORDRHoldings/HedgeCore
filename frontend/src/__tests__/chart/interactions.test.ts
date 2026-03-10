/**
 * interactions.test.ts -- Tests for chart interactions module:
 *   keyboard shortcuts, mouse zone detection, axis drag-to-scale, zoom extensions
 */

import {
  SHORTCUTS,
  matchShortcut,
  detectMouseZone,
  createAxisDragState,
  startAxisDrag,
  moveAxisDrag,
  endAxisDrag,
  applyPriceScale,
  applyTimeScale,
} from "@/components/chart/core/interactions";
import type {
  ShortcutDef,
  MouseZone,
  AxisDragState,
} from "@/components/chart/core/interactions";
import { createInitialZoomState } from "@/components/chart/core/zoom";
import type { ZoomPanState } from "@/components/chart/core/zoom";

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/** Build a minimal KeyboardEvent-like object for matchShortcut */
function fakeKey(
  key: string,
  mods: { ctrl?: boolean; shift?: boolean; alt?: boolean } = {},
): KeyboardEvent {
  return {
    key,
    ctrlKey: !!mods.ctrl,
    shiftKey: !!mods.shift,
    altKey: !!mods.alt,
  } as unknown as KeyboardEvent;
}

/* ============================================================
   1. SHORTCUTS table
   ============================================================ */

describe("SHORTCUTS", () => {
  it("is a non-empty array of ShortcutDef objects", () => {
    expect(Array.isArray(SHORTCUTS)).toBe(true);
    expect(SHORTCUTS.length).toBeGreaterThan(0);
  });

  it("every entry has key, action, and label strings", () => {
    for (const s of SHORTCUTS) {
      expect(typeof s.key).toBe("string");
      expect(s.key.length).toBeGreaterThan(0);
      expect(typeof s.action).toBe("string");
      expect(s.action.length).toBeGreaterThan(0);
      expect(typeof s.label).toBe("string");
      expect(s.label.length).toBeGreaterThan(0);
    }
  });

  it("contains all navigation shortcuts", () => {
    const actions = SHORTCUTS.map((s) => s.action);
    expect(actions).toContain("panLeft");
    expect(actions).toContain("panRight");
    expect(actions).toContain("zoomIn");
    expect(actions).toContain("zoomOut");
  });

  it("contains drawing tool shortcuts", () => {
    const actions = SHORTCUTS.map((s) => s.action);
    expect(actions).toContain("drawTrendline");
    expect(actions).toContain("drawHorizontal");
    expect(actions).toContain("drawFibonacci");
    expect(actions).toContain("drawRectangle");
  });

  it("contains action shortcuts (undo, redo, delete, cancel)", () => {
    const actions = SHORTCUTS.map((s) => s.action);
    expect(actions).toContain("undo");
    expect(actions).toContain("redo");
    expect(actions).toContain("deleteDrawing");
    expect(actions).toContain("cancel");
  });
});

/* ============================================================
   2. matchShortcut
   ============================================================ */

describe("matchShortcut", () => {
  it("matches simple key without modifiers", () => {
    expect(matchShortcut(fakeKey("ArrowLeft"))).toBe("panLeft");
    expect(matchShortcut(fakeKey("ArrowRight"))).toBe("panRight");
    expect(matchShortcut(fakeKey("Escape"))).toBe("cancel");
    expect(matchShortcut(fakeKey("Delete"))).toBe("deleteDrawing");
  });

  it("matches zoom shortcuts (+, -, =)", () => {
    expect(matchShortcut(fakeKey("+"))).toBe("zoomIn");
    expect(matchShortcut(fakeKey("-"))).toBe("zoomOut");
    expect(matchShortcut(fakeKey("="))).toBe("zoomIn");
  });

  it("matches ctrl-modified shortcuts", () => {
    expect(matchShortcut(fakeKey("z", { ctrl: true }))).toBe("undo");
    expect(matchShortcut(fakeKey("y", { ctrl: true }))).toBe("redo");
    expect(matchShortcut(fakeKey("r", { ctrl: true }))).toBe("resetChart");
  });

  it("matches ctrl+shift shortcuts", () => {
    expect(matchShortcut(fakeKey("z", { ctrl: true, shift: true }))).toBe("redo");
    expect(matchShortcut(fakeKey("s", { ctrl: true, shift: true }))).toBe("screenshot");
  });

  it("matches alt-modified drawing shortcuts", () => {
    expect(matchShortcut(fakeKey("t", { alt: true }))).toBe("drawTrendline");
    expect(matchShortcut(fakeKey("h", { alt: true }))).toBe("drawHorizontal");
    expect(matchShortcut(fakeKey("f", { alt: true }))).toBe("drawFibonacci");
    expect(matchShortcut(fakeKey("r", { alt: true }))).toBe("drawRectangle");
  });

  it("returns null for unmatched keys", () => {
    expect(matchShortcut(fakeKey("x"))).toBeNull();
    expect(matchShortcut(fakeKey("q", { ctrl: true }))).toBeNull();
    expect(matchShortcut(fakeKey("F12"))).toBeNull();
  });

  it("rejects wrong modifier combinations", () => {
    // "z" without ctrl should not match undo
    expect(matchShortcut(fakeKey("z"))).toBeNull();
    // ArrowLeft with ctrl should not match panLeft
    expect(matchShortcut(fakeKey("ArrowLeft", { ctrl: true }))).toBeNull();
    // "t" without alt should not match drawTrendline
    expect(matchShortcut(fakeKey("t"))).toBeNull();
  });

  it("matches display shortcuts", () => {
    expect(matchShortcut(fakeKey("F11"))).toBe("fullscreen");
    expect(matchShortcut(fakeKey("/"))).toBe("openIndicators");
    expect(matchShortcut(fakeKey("."))).toBe("openSymbolSearch");
  });
});

/* ============================================================
   3. detectMouseZone
   ============================================================ */

describe("detectMouseZone", () => {
  // Layout: 1000x600 canvas, priceAxisWidth=80, timeAxisHeight=28
  const totalW = 1000;
  const totalH = 600;
  const priceAxisW = 80;
  const timeAxisH = 28;
  const chartLeft = 10;
  const chartWidth = totalW - priceAxisW - 10 - 8; // matches data.ts pattern
  const mainTop = 4;
  const mainHeight = 400;

  function zone(x: number, y: number): MouseZone {
    return detectMouseZone(x, y, chartLeft, chartWidth, mainTop, mainHeight, priceAxisW, timeAxisH, totalW, totalH);
  }

  it("identifies chart area (center of canvas)", () => {
    expect(zone(400, 300)).toBe("chart");
    expect(zone(10, 4)).toBe("chart");
  });

  it("identifies price axis (right strip)", () => {
    // x > 1000 - 80 = 920, y in top portion
    expect(zone(950, 300)).toBe("priceAxis");
    expect(zone(921, 100)).toBe("priceAxis");
    expect(zone(999, 0)).toBe("priceAxis");
  });

  it("identifies time axis (bottom strip)", () => {
    // y > 600 - 28 = 572, x in left portion
    expect(zone(400, 580)).toBe("timeAxis");
    expect(zone(10, 573)).toBe("timeAxis");
    expect(zone(100, 599)).toBe("timeAxis");
  });

  it("identifies corner (bottom-right intersection)", () => {
    // x > 920 AND y > 572
    expect(zone(950, 580)).toBe("corner");
    expect(zone(999, 599)).toBe("corner");
  });

  it("boundary: exactly at priceAxis edge is still chart", () => {
    // x = totalW - priceAxisW = 920 (not > 920)
    expect(zone(920, 300)).toBe("chart");
  });

  it("boundary: exactly at timeAxis edge is still chart", () => {
    // y = totalH - timeAxisH = 572 (not > 572)
    expect(zone(400, 572)).toBe("chart");
  });
});

/* ============================================================
   4. Axis Drag State Machine
   ============================================================ */

describe("createAxisDragState", () => {
  it("returns idle state with all zeroes", () => {
    const s = createAxisDragState();
    expect(s.isDragging).toBe(false);
    expect(s.zone).toBe("chart");
    expect(s.startX).toBe(0);
    expect(s.startY).toBe(0);
    expect(s.startPriceRange).toBe(0);
    expect(s.startBarRange).toBe(0);
  });
});

describe("startAxisDrag", () => {
  it("transitions to dragging on priceAxis", () => {
    const idle = createAxisDragState();
    const s = startAxisDrag(idle, "priceAxis", 950, 200, 0.05, 150);
    expect(s.isDragging).toBe(true);
    expect(s.zone).toBe("priceAxis");
    expect(s.startX).toBe(950);
    expect(s.startY).toBe(200);
    expect(s.startPriceRange).toBe(0.05);
    expect(s.startBarRange).toBe(150);
  });

  it("transitions to dragging on timeAxis", () => {
    const idle = createAxisDragState();
    const s = startAxisDrag(idle, "timeAxis", 400, 580, 0.03, 200);
    expect(s.isDragging).toBe(true);
    expect(s.zone).toBe("timeAxis");
    expect(s.startX).toBe(400);
    expect(s.startY).toBe(580);
  });
});

describe("moveAxisDrag", () => {
  it("returns neutral scale when not dragging", () => {
    const idle = createAxisDragState();
    const result = moveAxisDrag(idle, 500, 300, 400, 800);
    expect(result.priceScale).toBe(1);
    expect(result.timeScale).toBe(1);
  });

  it("price axis: drag down = zoom out (scale > 1)", () => {
    const s = startAxisDrag(createAxisDragState(), "priceAxis", 950, 200, 0.05, 150);
    // Drag 100px down on a 400px chart = 25% ratio
    const result = moveAxisDrag(s, 950, 300, 400, 800);
    expect(result.priceScale).toBeGreaterThan(1);
    expect(result.timeScale).toBe(1);
  });

  it("price axis: drag up = zoom in (scale < 1)", () => {
    const s = startAxisDrag(createAxisDragState(), "priceAxis", 950, 300, 0.05, 150);
    // Drag 100px up
    const result = moveAxisDrag(s, 950, 200, 400, 800);
    expect(result.priceScale).toBeLessThan(1);
    expect(result.timeScale).toBe(1);
  });

  it("time axis: drag right = zoom out (scale > 1)", () => {
    const s = startAxisDrag(createAxisDragState(), "timeAxis", 400, 580, 0.05, 150);
    // Drag 200px right on 800px chart = 25% ratio
    const result = moveAxisDrag(s, 600, 580, 400, 800);
    expect(result.timeScale).toBeGreaterThan(1);
    expect(result.priceScale).toBe(1);
  });

  it("time axis: drag left = zoom in (scale < 1)", () => {
    const s = startAxisDrag(createAxisDragState(), "timeAxis", 400, 580, 0.05, 150);
    const result = moveAxisDrag(s, 200, 580, 400, 800);
    expect(result.timeScale).toBeLessThan(1);
    expect(result.priceScale).toBe(1);
  });

  it("clamps scale to [0.1, 10]", () => {
    const s = startAxisDrag(createAxisDragState(), "priceAxis", 950, 0, 0.05, 150);
    // Extreme drag down (5x chart height)
    const down = moveAxisDrag(s, 950, 2000, 400, 800);
    expect(down.priceScale).toBeLessThanOrEqual(10);

    // Extreme drag up
    const up = moveAxisDrag(s, 950, -2000, 400, 800);
    expect(up.priceScale).toBeGreaterThanOrEqual(0.1);
  });

  it("chart zone drag returns neutral scale", () => {
    const s = startAxisDrag(createAxisDragState(), "chart", 400, 200, 0.05, 150);
    const result = moveAxisDrag(s, 500, 300, 400, 800);
    expect(result.priceScale).toBe(1);
    expect(result.timeScale).toBe(1);
  });

  it("zero chart dimensions do not cause division by zero", () => {
    const s = startAxisDrag(createAxisDragState(), "priceAxis", 950, 200, 0.05, 150);
    // chartHeight = 0 should use fallback (divide by 1)
    const result = moveAxisDrag(s, 950, 300, 0, 0);
    expect(Number.isFinite(result.priceScale)).toBe(true);
    expect(Number.isFinite(result.timeScale)).toBe(true);
  });
});

describe("endAxisDrag", () => {
  it("sets isDragging to false", () => {
    const dragging = startAxisDrag(createAxisDragState(), "priceAxis", 950, 200, 0.05, 150);
    expect(dragging.isDragging).toBe(true);
    const ended = endAxisDrag(dragging);
    expect(ended.isDragging).toBe(false);
  });

  it("preserves other state fields", () => {
    const dragging = startAxisDrag(createAxisDragState(), "timeAxis", 400, 580, 0.03, 200);
    const ended = endAxisDrag(dragging);
    expect(ended.zone).toBe("timeAxis");
    expect(ended.startX).toBe(400);
    expect(ended.startY).toBe(580);
  });
});

/* ============================================================
   5. Zoom State Extensions
   ============================================================ */

describe("applyPriceScale", () => {
  it("multiplies current scale by delta", () => {
    expect(applyPriceScale(1.0, 1.5)).toBeCloseTo(1.5);
    expect(applyPriceScale(2.0, 0.5)).toBeCloseTo(1.0);
  });

  it("clamps to minimum 0.1", () => {
    expect(applyPriceScale(0.1, 0.5)).toBeCloseTo(0.1);
    expect(applyPriceScale(0.05, 0.1)).toBeCloseTo(0.1);
  });

  it("clamps to maximum 10.0", () => {
    expect(applyPriceScale(5.0, 3.0)).toBeCloseTo(10.0);
    expect(applyPriceScale(10.0, 2.0)).toBeCloseTo(10.0);
  });

  it("identity: scale by 1.0 returns same value", () => {
    expect(applyPriceScale(3.7, 1.0)).toBeCloseTo(3.7);
  });
});

describe("applyTimeScale", () => {
  const barCount = 500;

  function makeState(start: number, end: number): ZoomPanState {
    return {
      ...createInitialZoomState(barCount),
      targetStart: start,
      targetEnd: end,
      startIndex: start,
      endIndex: end,
    };
  }

  it("zoom in: scaleDelta < 1 narrows the range", () => {
    const s = makeState(100, 300);
    const result = applyTimeScale(s, 0.5, barCount);
    const origRange = 300 - 100;
    const newRange = result.targetEnd - result.targetStart;
    expect(newRange).toBeLessThan(origRange);
  });

  it("zoom out: scaleDelta > 1 widens the range", () => {
    const s = makeState(100, 300);
    const result = applyTimeScale(s, 2.0, barCount);
    const origRange = 300 - 100;
    const newRange = result.targetEnd - result.targetStart;
    expect(newRange).toBeGreaterThan(origRange);
  });

  it("centers around midpoint of current view", () => {
    const s = makeState(100, 300);
    const center = 200;
    const result = applyTimeScale(s, 0.5, barCount);
    const newCenter = (result.targetStart + result.targetEnd) / 2;
    expect(newCenter).toBeCloseTo(center, 0);
  });

  it("clamps minimum half-range to 5 bars", () => {
    const s = makeState(200, 210); // 10-bar range, half = 5
    const result = applyTimeScale(s, 0.1, barCount); // try to get very small
    const newRange = result.targetEnd - result.targetStart;
    expect(newRange).toBeGreaterThanOrEqual(10); // 2 * minHalf
  });

  it("clamps maximum half-range to barCount / 2", () => {
    const s = makeState(0, 499);
    const result = applyTimeScale(s, 5.0, barCount);
    const newRange = result.targetEnd - result.targetStart;
    expect(newRange).toBeLessThanOrEqual(barCount);
  });

  it("clamps start to 0 (no negative indices)", () => {
    const s = makeState(0, 50);
    const result = applyTimeScale(s, 2.0, barCount);
    expect(result.targetStart).toBeGreaterThanOrEqual(0);
  });

  it("clamps end to barCount - 1", () => {
    const s = makeState(450, 499);
    const result = applyTimeScale(s, 2.0, barCount);
    expect(result.targetEnd).toBeLessThanOrEqual(barCount - 1);
  });

  it("sets isAnimating=true and velocityX=0", () => {
    const s = makeState(100, 300);
    const result = applyTimeScale(s, 1.2, barCount);
    expect(result.isAnimating).toBe(true);
    expect(result.velocityX).toBe(0);
  });

  it("identity: scaleDelta=1 preserves range", () => {
    const s = makeState(100, 300);
    const result = applyTimeScale(s, 1.0, barCount);
    expect(result.targetStart).toBeCloseTo(100);
    expect(result.targetEnd).toBeCloseTo(300);
  });
});
