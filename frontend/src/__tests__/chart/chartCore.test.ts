/**
 * chartCore.test.ts -- Tests for chart core modules:
 *   theme.ts, zoom.ts, data.ts (layout changes)
 */

import { THEME } from "@/components/chart/core/theme";
import {
  createInitialZoomState,
  tickAnimation,
  handleWheel,
  handleDragStart,
  handleDragMove,
  handleDragEnd,
} from "@/components/chart/core/zoom";
import type { ZoomPanState } from "@/components/chart/core/zoom";
import { computeLayout, computeViewport } from "@/components/chart/core/data";
import type { ChartLayout, SubPaneLayout } from "@/components/chart/core/data";

/* ============================================================
   THEME
   ============================================================ */

describe("THEME", () => {
  it("exports a frozen object with all required keys", () => {
    expect(typeof THEME).toBe("object");
    expect(THEME.canvasBg).toBe("#131722");
    expect(THEME.bullBody).toBe("#26A69A");
    expect(THEME.bearBody).toBe("#EF5350");
    expect(THEME.crosshairColor).toBe("#9598A1");
    expect(THEME.drawTrendline).toBe("#2962FF");
  });

  it("includes all axis colors", () => {
    expect(THEME.axisBg).toBe("#1E222D");
    expect(THEME.axisText).toBe("#787B86");
    expect(THEME.gridLine).toContain("rgba");
    expect(THEME.axisFont).toContain("IBM Plex Mono");
  });

  it("includes sub-pane colors", () => {
    expect(THEME.subPaneBg).toBe("#1E222D");
    expect(THEME.subPaneBorder).toBe("#2A2E39");
    expect(THEME.rsiColor).toBeDefined();
    expect(THEME.macdLine).toBeDefined();
    expect(THEME.macdSignal).toBeDefined();
  });

  it("includes volume profile and drawing colors", () => {
    expect(THEME.vpBuyColor).toContain("rgba");
    expect(THEME.drawHorizontal).toBe("#FF9800");
    expect(THEME.drawFibonacci).toBe("#9C27B0");
    expect(THEME.drawRectangle).toBe("#00BCD4");
  });

  it("support/resistance colors end with comma for alpha append", () => {
    expect(THEME.supportColor).toMatch(/rgba\(\d+,\d+,\d+,$/);
    expect(THEME.resistanceColor).toMatch(/rgba\(\d+,\d+,\d+,$/);
  });
});

/* ============================================================
   ZOOM — createInitialZoomState
   ============================================================ */

describe("createInitialZoomState", () => {
  it("creates state with default 200 visible bars", () => {
    const s = createInitialZoomState(500);
    expect(s.endIndex).toBe(499);
    expect(s.startIndex).toBe(299);
    expect(s.targetStart).toBe(299);
    expect(s.targetEnd).toBe(499);
    expect(s.isDragging).toBe(false);
    expect(s.isAnimating).toBe(false);
    expect(s.velocityX).toBe(0);
  });

  it("clamps start to 0 when barCount < visibleBars", () => {
    const s = createInitialZoomState(50, 200);
    expect(s.startIndex).toBe(0);
    expect(s.endIndex).toBe(49);
  });

  it("handles zero bars", () => {
    const s = createInitialZoomState(0);
    expect(s.startIndex).toBe(0);
    expect(s.endIndex).toBe(0);
  });
});

/* ============================================================
   ZOOM — tickAnimation
   ============================================================ */

describe("tickAnimation", () => {
  it("returns same state when dragging", () => {
    const s = createInitialZoomState(500);
    const dragging: ZoomPanState = { ...s, isDragging: true };
    const result = tickAnimation(dragging, 500);
    expect(result).toBe(dragging);
  });

  it("converges startIndex toward targetStart", () => {
    const s: ZoomPanState = {
      ...createInitialZoomState(500),
      startIndex: 100,
      endIndex: 300,
      targetStart: 200,
      targetEnd: 400,
      isAnimating: true,
    };
    const next = tickAnimation(s, 500);
    // Should have moved toward target
    expect(next.startIndex).toBeGreaterThan(100);
    expect(next.startIndex).toBeLessThan(200);
    expect(next.endIndex).toBeGreaterThan(300);
    expect(next.endIndex).toBeLessThan(400);
    expect(next.isAnimating).toBe(true);
  });

  it("snaps to target when close enough (within EPSILON)", () => {
    const s: ZoomPanState = {
      ...createInitialZoomState(500),
      startIndex: 199.999,
      endIndex: 399.999,
      targetStart: 200,
      targetEnd: 400,
      isAnimating: true,
    };
    const next = tickAnimation(s, 500);
    expect(next.startIndex).toBe(200);
    expect(next.endIndex).toBe(400);
    expect(next.isAnimating).toBe(false);
  });

  it("applies momentum and decays velocity", () => {
    const s: ZoomPanState = {
      ...createInitialZoomState(500),
      startIndex: 100,
      endIndex: 300,
      targetStart: 100,
      targetEnd: 300,
      velocityX: 5,
      isAnimating: true,
    };
    const next = tickAnimation(s, 500);
    // targetStart should have shifted by velocity
    expect(next.targetStart).toBeGreaterThan(100);
    // Velocity should have decayed
    expect(Math.abs(next.velocityX)).toBeLessThan(5);
    expect(next.isAnimating).toBe(true);
  });

  it("stops momentum at boundary", () => {
    const s: ZoomPanState = {
      ...createInitialZoomState(500),
      startIndex: 0,
      endIndex: 200,
      targetStart: 0,
      targetEnd: 200,
      velocityX: -10, // pushing left past 0
      isAnimating: true,
    };
    const next = tickAnimation(s, 500);
    expect(next.targetStart).toBe(0);
    expect(next.velocityX).toBe(0);
  });
});

/* ============================================================
   ZOOM — handleWheel
   ============================================================ */

describe("handleWheel", () => {
  it("zooms in (reduces range) on negative deltaY", () => {
    const s = createInitialZoomState(500);
    const result = handleWheel(s, -100, 400, 0, 800, 500);
    const origRange = s.targetEnd - s.targetStart;
    const newRange = result.targetEnd - result.targetStart;
    expect(newRange).toBeLessThan(origRange);
    expect(result.isAnimating).toBe(true);
    expect(result.velocityX).toBe(0);
  });

  it("zooms out (increases range) on positive deltaY", () => {
    const s = createInitialZoomState(500, 100);
    const result = handleWheel(s, 100, 400, 0, 800, 500);
    const origRange = s.targetEnd - s.targetStart;
    const newRange = result.targetEnd - result.targetStart;
    expect(newRange).toBeGreaterThan(origRange);
  });

  it("respects minRange of 10", () => {
    const s: ZoomPanState = {
      ...createInitialZoomState(500, 12),
    };
    // Zoom in aggressively
    let state = s;
    for (let i = 0; i < 20; i++) {
      state = handleWheel(state, -100, 400, 0, 800, 500);
    }
    const range = state.targetEnd - state.targetStart;
    expect(range).toBeGreaterThanOrEqual(10);
  });

  it("clamps to bar boundaries", () => {
    const s = createInitialZoomState(500);
    const result = handleWheel(s, 100, 400, 0, 800, 500);
    expect(result.targetStart).toBeGreaterThanOrEqual(0);
    expect(result.targetEnd).toBeLessThanOrEqual(499);
  });
});

/* ============================================================
   ZOOM — drag lifecycle
   ============================================================ */

describe("handleDragStart / handleDragMove / handleDragEnd", () => {
  it("sets isDragging=true on start", () => {
    const s = createInitialZoomState(500);
    const started = handleDragStart(s, 400);
    expect(started.isDragging).toBe(true);
    expect(started.dragStartX).toBe(400);
    expect(started.dragStartStart).toBe(s.startIndex);
    expect(started.velocityX).toBe(0);
  });

  it("pans left when dragging right", () => {
    const s = createInitialZoomState(500);
    const started = handleDragStart(s, 400);
    // Drag mouse right = pan left (earlier bars)
    const moved = handleDragMove(started, 500, 800, 500);
    expect(moved.startIndex).toBeLessThan(s.startIndex);
    expect(moved.endIndex).toBeLessThan(s.endIndex);
  });

  it("ignores move when not dragging", () => {
    const s = createInitialZoomState(500);
    const result = handleDragMove(s, 500, 800, 500);
    expect(result).toBe(s);
  });

  it("sets isDragging=false on end", () => {
    const s = createInitialZoomState(500);
    const started = handleDragStart(s, 400);
    const ended = handleDragEnd(started);
    expect(ended.isDragging).toBe(false);
  });

  it("enables momentum animation on drag end with velocity", () => {
    const s = createInitialZoomState(500);
    const started = handleDragStart(s, 400);
    const moved = handleDragMove(started, 500, 800, 500);
    // Artificially set a velocity
    const withVelocity: ZoomPanState = { ...moved, velocityX: 2 };
    const ended = handleDragEnd(withVelocity);
    expect(ended.isAnimating).toBe(true);
  });
});

/* ============================================================
   DATA — computeLayout
   ============================================================ */

describe("computeLayout", () => {
  it("uses chartLeft=10 and mainTop=4", () => {
    const layout = computeLayout(1200, 600, 0);
    expect(layout.chartLeft).toBe(10);
    expect(layout.mainTop).toBe(4);
  });

  it("uses volumeHeight=80", () => {
    const layout = computeLayout(1200, 600, 0);
    expect(layout.volumeHeight).toBe(80);
  });

  it("has no sub-panes when count is 0", () => {
    const layout = computeLayout(1200, 600, 0);
    expect(layout.subPanes).toHaveLength(0);
    expect(layout.subPaneHeight).toBe(0);
  });

  it("creates one sub-pane with correct dimensions", () => {
    const layout = computeLayout(1200, 600, 1);
    expect(layout.subPanes).toHaveLength(1);
    expect(layout.subPanes[0].height).toBeGreaterThanOrEqual(70);
    expect(layout.subPanes[0].top).toBe(layout.volumeTop + layout.volumeHeight);
    // backward compat
    expect(layout.subPaneTop).toBe(layout.subPanes[0].top);
    expect(layout.subPaneHeight).toBe(layout.subPanes[0].height);
  });

  it("creates multiple sub-panes stacked vertically", () => {
    const layout = computeLayout(1200, 800, 3);
    expect(layout.subPanes).toHaveLength(3);
    for (let i = 1; i < layout.subPanes.length; i++) {
      expect(layout.subPanes[i].top).toBe(
        layout.subPanes[i - 1].top + layout.subPanes[i - 1].height
      );
    }
  });

  it("enforces minimum main height of 200", () => {
    // Tiny canvas with 3 sub-panes should still get 200px main
    const layout = computeLayout(400, 400, 3);
    expect(layout.mainHeight).toBeGreaterThanOrEqual(200);
  });

  it("chartWidth = chartRight - chartLeft", () => {
    const layout = computeLayout(1200, 600, 0);
    expect(layout.chartWidth).toBe(layout.chartRight - layout.chartLeft);
    expect(layout.chartRight).toBe(1200 - 80);
  });
});

/* ============================================================
   DATA — computeViewport
   ============================================================ */

describe("computeViewport", () => {
  const bars = Array.from({ length: 100 }, (_, i) => ({
    t: 1000000 + i * 3600,
    o: 1.1 + Math.sin(i * 0.1) * 0.01,
    h: 1.12 + Math.sin(i * 0.1) * 0.01,
    l: 1.08 + Math.sin(i * 0.1) * 0.01,
    c: 1.1 + Math.cos(i * 0.1) * 0.01,
    v: 1000 + i * 10,
  }));

  it("returns correct startIndex and endIndex clamped to bars", () => {
    const vp = computeViewport(bars, 10.5, 50.3);
    expect(vp.startIndex).toBe(10);
    expect(vp.endIndex).toBe(51);
  });

  it("applies padding to price range", () => {
    const vp = computeViewport(bars, 0, 99, 0.05);
    // priceMin should be below actual low
    let lo = Infinity;
    for (const b of bars) if (b.l < lo) lo = b.l;
    expect(vp.priceMin).toBeLessThan(lo);
  });

  it("handles empty bars", () => {
    const vp = computeViewport([], 0, 0);
    expect(vp.priceMin).toBe(0);
    expect(vp.priceMax).toBe(1);
  });
});
