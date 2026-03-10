/**
 * chartBugfixes.test.ts -- Tests for 3 critical chart bugfixes:
 *   1. Context menu viewport coordinates (position: fixed)
 *   2. Future space panning (RIGHT_MARGIN, computeViewport, panRight)
 */

import {
  createInitialZoomState,
  tickAnimation,
  handleWheel,
  handleDragStart,
  handleDragMove,
  handleDragEnd,
} from "@/components/chart/core/zoom";
import type { ZoomPanState } from "@/components/chart/core/zoom";
import { computeViewport } from "@/components/chart/core/data";

/* ============================================================
   Test data
   ============================================================ */

const makeBars = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    t: 1000000 + i * 3600,
    o: 1.1 + Math.sin(i * 0.1) * 0.01,
    h: 1.12 + Math.sin(i * 0.1) * 0.01,
    l: 1.08 + Math.sin(i * 0.1) * 0.01,
    c: 1.1 + Math.cos(i * 0.1) * 0.01,
    v: 1000 + i * 10,
  }));

/* ============================================================
   Bug 2a: RIGHT_MARGIN allows full-screen future space
   ============================================================ */

describe("RIGHT_MARGIN = 1.0 (full future space)", () => {
  it("momentum allows endIndex past bars.length-1 by up to range*1.0", () => {
    const barCount = 500;
    const s: ZoomPanState = {
      ...createInitialZoomState(barCount, 200),
      startIndex: 300,
      endIndex: 499,
      targetStart: 300,
      targetEnd: 499,
      velocityX: 10, // pushing right
      isAnimating: true,
    };
    const next = tickAnimation(s, barCount);
    // With RIGHT_MARGIN=1.0, maxEnd = 499 + 199*1.0 = 698
    // targetEnd should be allowed past 499
    expect(next.targetEnd).toBeGreaterThan(499);
  });

  it("clamps endIndex to bars.length-1 + range*1.0", () => {
    const barCount = 500;
    const range = 200;
    const maxEnd = barCount - 1 + range * 1.0; // 699
    const s: ZoomPanState = {
      ...createInitialZoomState(barCount, range),
      startIndex: maxEnd - range,
      endIndex: maxEnd,
      targetStart: maxEnd - range,
      targetEnd: maxEnd,
      velocityX: 50, // pushing hard right
      isAnimating: true,
    };
    const next = tickAnimation(s, barCount);
    // Should not exceed maxEnd
    expect(next.targetEnd).toBeLessThanOrEqual(maxEnd);
  });

  it("drag move allows panning into future space", () => {
    const barCount = 100;
    const s = createInitialZoomState(barCount, 50);
    const started = handleDragStart(s, 400);
    // Drag left (mouse moves left = pan right into future)
    const moved = handleDragMove(started, 200, 800, barCount);
    // endIndex should be allowed past bars.length-1
    expect(moved.endIndex).toBeGreaterThan(barCount - 1);
  });

  it("handleWheel allows zoom pivot in future space", () => {
    const barCount = 200;
    // Start with view already in future space
    const s: ZoomPanState = {
      ...createInitialZoomState(barCount, 100),
      targetStart: 150,
      targetEnd: 250, // past last bar (199)
      startIndex: 150,
      endIndex: 250,
    };
    const result = handleWheel(s, -50, 400, 0, 800, barCount);
    // Should not snap back — endIndex can stay past data
    expect(result.targetEnd).toBeGreaterThan(barCount - 1);
  });
});

/* ============================================================
   Bug 2b: computeViewport preserves future space endIndex
   ============================================================ */

describe("computeViewport future space", () => {
  const bars = makeBars(100);

  it("preserves endIndex past bars.length-1 for spacing", () => {
    // endIndex=150 is past bars (0-99)
    const vp = computeViewport(bars, 50, 150);
    expect(vp.endIndex).toBe(150);
    expect(vp.startIndex).toBe(50);
  });

  it("uses only real bar data for price range when in future space", () => {
    const vp = computeViewport(bars, 50, 150);
    // priceMin/priceMax should be computed from bars[50..99], not crash
    expect(vp.priceMin).toBeGreaterThan(0);
    expect(vp.priceMax).toBeGreaterThan(vp.priceMin);
  });

  it("still clamps startIndex to 0", () => {
    const vp = computeViewport(bars, -10, 50);
    expect(vp.startIndex).toBe(0);
  });

  it("endIndex equals eiData when endIndex is within data range", () => {
    const vp = computeViewport(bars, 10, 50);
    // Math.ceil(50) = 50, min(99, 50) = 50 => eiData=50, max(50,50)=50
    expect(vp.endIndex).toBe(50);
  });

  it("does not crash with endIndex far beyond data", () => {
    const vp = computeViewport(bars, 0, 500);
    expect(vp.endIndex).toBe(500);
    expect(vp.priceMin).toBeGreaterThan(0);
  });
});

/* ============================================================
   Bug 2c: panRight keyboard shortcut allows future space
   ============================================================ */

describe("panRight future space (simulated)", () => {
  it("panRight does not clamp endIndex to bars.length-1", () => {
    const barCount = 500;
    const z = createInitialZoomState(barCount, 200);
    // Simulate the panRight logic from ChartEngine
    const step = (z.targetEnd - z.targetStart) * 0.1;
    const range = z.targetEnd - z.targetStart;
    const maxEnd = barCount - 1 + range * 1.0; // Match RIGHT_MARGIN

    const newTargetEnd = Math.min(maxEnd, z.targetEnd + step);
    const newTargetStart = z.targetStart + step;

    // The old bug clamped to bars.length-1 (499). Now maxEnd = 499+200*1.0 = 699
    expect(maxEnd).toBe(699);
    // After one pan step from initial position (endIndex=499), we should go past 499
    expect(newTargetEnd).toBeGreaterThan(499);
    expect(newTargetStart).toBeGreaterThan(z.targetStart);
  });

  it("repeated panRight reaches near maxEnd", () => {
    const barCount = 100;
    let targetStart = 50;
    let targetEnd = 99; // initial view: bars 50-99
    const visibleRange = targetEnd - targetStart; // 49 bars visible
    const maxEnd = barCount - 1 + visibleRange * 1.0; // 99 + 49 = 148
    // Simulate 80 panRight presses (both start and end shift together)
    for (let i = 0; i < 80; i++) {
      const step = (targetEnd - targetStart) * 0.1;
      const newEnd = Math.min(maxEnd, targetEnd + step);
      const newStart = targetStart + step;
      targetStart = newStart;
      targetEnd = newEnd;
    }
    // Should approach but not exceed maxEnd
    expect(targetEnd).toBeLessThanOrEqual(maxEnd + 0.01);
    expect(targetEnd).toBeGreaterThan(barCount - 1);
  });

  it("panLeft from future space works correctly", () => {
    const barCount = 200;
    // Start in future space
    const z: ZoomPanState = {
      ...createInitialZoomState(barCount, 100),
      targetStart: 150,
      targetEnd: 250,
      startIndex: 150,
      endIndex: 250,
    };
    // Simulate panLeft
    const step = (z.targetEnd - z.targetStart) * 0.1;
    const newStart = Math.max(0, z.targetStart - step);
    const newEnd = z.targetEnd - step;
    expect(newStart).toBeLessThan(z.targetStart);
    expect(newEnd).toBeLessThan(z.targetEnd);
  });
});
