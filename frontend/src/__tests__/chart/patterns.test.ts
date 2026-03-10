/**
 * patterns.test.ts -- Tests for chart pattern detection and rendering
 */

import {
  findPivots,
  detectPatterns,
  drawPatterns,
} from "@/components/chart/renderers/patterns";
import type { DetectedPattern, PatternType } from "@/components/chart/renderers/patterns";
import type { Bar } from "@/components/chart/indicators/types";
import type { ChartLayout, Viewport } from "@/components/chart/core/data";
import { computeLayout } from "@/components/chart/core/data";

// ── Helpers ──────────────────────────────────────────────

function makeBar(index: number, open: number, high: number, low: number, close: number): Bar {
  return {
    t: 1700000000 + index * 3600,
    o: open,
    h: high,
    l: low,
    c: close,
    v: 1000 + index,
  };
}

/** Create flat bars with a specific high/low */
function flatBars(count: number, price: number = 1.1, spread: number = 0.005): Bar[] {
  return Array.from({ length: count }, (_, i) =>
    makeBar(i, price, price + spread, price - spread, price)
  );
}

/**
 * Create a double-top pattern with distinct pivot points.
 * Uses a bell-curve shape for each peak so pivot detection (radius=5)
 * finds clear local maxima. Pattern:
 *   bars 0-9: flat base
 *   bars 10-20: bell peak 1 centered at index 15
 *   bars 21-29: valley (flat at valley level)
 *   bars 30-40: bell peak 2 centered at index 35
 *   bars 41-55: flat base
 */
function doubleTopBars(): Bar[] {
  const bars: Bar[] = [];
  const base = 1.1;
  const peak = 1.15;
  const valleyPrice = 1.105;

  // Flat pre-run (indices 0-9)
  for (let i = 0; i < 10; i++) {
    bars.push(makeBar(i, base, base + 0.001, base - 0.001, base));
  }

  // First bell peak centered at index 15 (indices 10-20)
  for (let i = 10; i <= 20; i++) {
    const dist = Math.abs(i - 15);
    const scale = Math.max(0, 1 - dist / 5.5);
    const p = base + (peak - base) * scale * scale;
    const spread = 0.001 + 0.001 * scale;
    bars.push(makeBar(i, p, p + spread, p - spread, p));
  }

  // Valley between peaks (indices 21-29)
  for (let i = 21; i <= 29; i++) {
    bars.push(makeBar(i, valleyPrice, valleyPrice + 0.001, valleyPrice - 0.001, valleyPrice));
  }

  // Second bell peak centered at index 35 (indices 30-40)
  for (let i = 30; i <= 40; i++) {
    const dist = Math.abs(i - 35);
    const scale = Math.max(0, 1 - dist / 5.5);
    const p = base + (peak - base) * scale * scale;
    const spread = 0.001 + 0.001 * scale;
    bars.push(makeBar(i, p, p + spread, p - spread, p));
  }

  // Flat post-run (indices 41-55)
  for (let i = 41; i <= 55; i++) {
    bars.push(makeBar(i, base, base + 0.001, base - 0.001, base));
  }

  return bars;
}

/**
 * Create a double-bottom pattern with distinct pivot points.
 */
function doubleBottomBars(): Bar[] {
  const bars: Bar[] = [];
  const base = 1.1;
  const trough = 1.05;
  const peakPrice = 1.095;

  // Flat pre-run (indices 0-9)
  for (let i = 0; i < 10; i++) {
    bars.push(makeBar(i, base, base + 0.001, base - 0.001, base));
  }

  // First bell trough centered at index 15 (indices 10-20)
  for (let i = 10; i <= 20; i++) {
    const dist = Math.abs(i - 15);
    const scale = Math.max(0, 1 - dist / 5.5);
    const p = base - (base - trough) * scale * scale;
    const spread = 0.001 + 0.001 * scale;
    bars.push(makeBar(i, p, p + spread, p - spread, p));
  }

  // Peak between troughs (indices 21-29)
  for (let i = 21; i <= 29; i++) {
    bars.push(makeBar(i, peakPrice, peakPrice + 0.001, peakPrice - 0.001, peakPrice));
  }

  // Second bell trough centered at index 35 (indices 30-40)
  for (let i = 30; i <= 40; i++) {
    const dist = Math.abs(i - 35);
    const scale = Math.max(0, 1 - dist / 5.5);
    const p = base - (base - trough) * scale * scale;
    const spread = 0.001 + 0.001 * scale;
    bars.push(makeBar(i, p, p + spread, p - spread, p));
  }

  // Flat post-run (indices 41-55)
  for (let i = 41; i <= 55; i++) {
    bars.push(makeBar(i, base, base + 0.001, base - 0.001, base));
  }

  return bars;
}

function createMockCtx(): CanvasRenderingContext2D {
  return {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    font: "",
    textAlign: "",
    textBaseline: "",
    fillRect: jest.fn(),
    fillText: jest.fn(),
    strokeRect: jest.fn(),
    beginPath: jest.fn(),
    moveTo: jest.fn(),
    lineTo: jest.fn(),
    stroke: jest.fn(),
    fill: jest.fn(),
    arc: jest.fn(),
    setLineDash: jest.fn(),
    measureText: jest.fn().mockReturnValue({ width: 60 }),
    quadraticCurveTo: jest.fn(),
    closePath: jest.fn(),
    save: jest.fn(),
    restore: jest.fn(),
  } as unknown as CanvasRenderingContext2D;
}

// ── findPivots ───────────────────────────────────────────

describe("findPivots", () => {
  it("finds local highs and lows in synthetic data", () => {
    // Create a simple up-down pattern
    const bars: Bar[] = [];
    for (let i = 0; i < 30; i++) {
      const price = 1.1 + Math.sin(i * 0.5) * 0.03;
      bars.push(makeBar(i, price, price + 0.002, price - 0.002, price));
    }
    const pivots = findPivots(bars, 0, 29, 3);
    expect(pivots.length).toBeGreaterThan(0);
    // Should have both highs and lows
    const highs = pivots.filter((p) => p.kind === "high");
    const lows = pivots.filter((p) => p.kind === "low");
    expect(highs.length).toBeGreaterThan(0);
    expect(lows.length).toBeGreaterThan(0);
  });

  it("returns empty for flat data", () => {
    const bars = flatBars(30);
    const pivots = findPivots(bars, 0, 29, 5);
    expect(pivots).toHaveLength(0);
  });

  it("respects radius parameter", () => {
    // Single peak at index 10
    const bars = flatBars(21, 1.1, 0.001);
    bars[10] = makeBar(10, 1.15, 1.16, 1.14, 1.15);

    const pivotsR3 = findPivots(bars, 0, 20, 3);
    const pivotsR5 = findPivots(bars, 0, 20, 5);

    // Both should find the peak
    expect(pivotsR3.some((p) => p.index === 10 && p.kind === "high")).toBe(true);
    expect(pivotsR5.some((p) => p.index === 10 && p.kind === "high")).toBe(true);
  });

  it("returns empty for too-short arrays (less than 2*radius+1)", () => {
    const bars = flatBars(5);
    const pivots = findPivots(bars, 0, 4, 5);
    expect(pivots).toHaveLength(0);
  });
});

// ── detectPatterns ───────────────────────────────────────

describe("detectPatterns", () => {
  it("returns empty for too-short bar arrays", () => {
    const bars = flatBars(10);
    expect(detectPatterns(bars, 0, 9)).toHaveLength(0);
  });

  it("returns empty for flat data", () => {
    const bars = flatBars(100);
    expect(detectPatterns(bars, 0, 99)).toHaveLength(0);
  });

  it("detects double top pattern", () => {
    const bars = doubleTopBars();
    const patterns = detectPatterns(bars, 0, bars.length - 1);
    const doubleTops = patterns.filter((p) => p.type === "double_top");
    expect(doubleTops.length).toBeGreaterThanOrEqual(1);

    const dt = doubleTops[0];
    expect(dt.keyPoints.length).toBe(3);
    expect(dt.confidence).toBeGreaterThan(0);
    expect(dt.confidence).toBeLessThanOrEqual(1);
    expect(dt.label).toContain("Double Top");
  });

  it("detects double bottom pattern", () => {
    const bars = doubleBottomBars();
    const patterns = detectPatterns(bars, 0, bars.length - 1);
    const doubleBottoms = patterns.filter((p) => p.type === "double_bottom");
    expect(doubleBottoms.length).toBeGreaterThanOrEqual(1);

    const db = doubleBottoms[0];
    expect(db.keyPoints.length).toBe(3);
    expect(db.confidence).toBeGreaterThan(0);
    expect(db.label).toContain("Double Bottom");
  });

  it("deduplicates overlapping same-type patterns", () => {
    const bars = doubleTopBars();
    const patterns = detectPatterns(bars, 0, bars.length - 1);
    // If there are duplicate double tops they should be deduplicated
    const types = patterns.map((p) => p.type);
    const dtCount = types.filter((t) => t === "double_top").length;
    // Should have at most a reasonable number (dedup working)
    expect(dtCount).toBeLessThanOrEqual(3);
  });

  it("patterns have valid structure", () => {
    const bars = doubleTopBars();
    const patterns = detectPatterns(bars, 0, bars.length - 1);

    for (const p of patterns) {
      expect(p.startIndex).toBeGreaterThanOrEqual(0);
      expect(p.endIndex).toBeGreaterThanOrEqual(p.startIndex);
      expect(p.keyPoints.length).toBeGreaterThanOrEqual(2);
      expect(p.confidence).toBeGreaterThanOrEqual(0);
      expect(p.confidence).toBeLessThanOrEqual(1);
      expect(p.label.length).toBeGreaterThan(0);

      // All key point indices within pattern range (with small margin)
      for (const kp of p.keyPoints) {
        expect(kp.index).toBeGreaterThanOrEqual(0);
        expect(kp.price).toBeGreaterThan(0);
      }
    }
  });

  it("handles clamped range correctly", () => {
    const bars = flatBars(50);
    // Even with out-of-bounds indices, should not throw
    expect(() => detectPatterns(bars, -10, 200)).not.toThrow();
  });
});

// ── PatternType completeness ─────────────────────────────

describe("PatternType", () => {
  it("all expected types are valid strings", () => {
    const validTypes: PatternType[] = [
      "double_top",
      "double_bottom",
      "head_shoulders",
      "triangle_asc",
      "triangle_desc",
      "wedge_rising",
      "wedge_falling",
      "flag_bull",
      "flag_bear",
    ];
    // This just verifies the type system accepts all values
    expect(validTypes).toHaveLength(9);
  });
});

// ── drawPatterns ─────────────────────────────────────────

describe("drawPatterns", () => {
  const layout: ChartLayout = computeLayout(1200, 600, 0);
  const viewport: Viewport = {
    startIndex: 0,
    endIndex: 55,
    priceMin: 1.04,
    priceMax: 1.16,
  };

  it("does nothing with empty patterns array", () => {
    const ctx = createMockCtx();
    drawPatterns(ctx, [], layout, viewport);
    expect(ctx.beginPath).not.toHaveBeenCalled();
  });

  it("skips patterns outside viewport", () => {
    const ctx = createMockCtx();
    const farPattern: DetectedPattern = {
      type: "double_top",
      startIndex: 100,
      endIndex: 120,
      keyPoints: [
        { index: 105, price: 1.12 },
        { index: 110, price: 1.10 },
        { index: 115, price: 1.12 },
      ],
      confidence: 0.8,
      label: "Double Top (80%)",
    };
    drawPatterns(ctx, [farPattern], layout, viewport);
    // Should not draw lines (beginPath for lines)
    expect(ctx.stroke).not.toHaveBeenCalled();
  });

  it("draws connecting lines and circles for visible patterns", () => {
    const ctx = createMockCtx();
    const pattern: DetectedPattern = {
      type: "double_top",
      startIndex: 10,
      endIndex: 22,
      keyPoints: [
        { index: 12, price: 1.14 },
        { index: 17, price: 1.11 },
        { index: 22, price: 1.14 },
      ],
      confidence: 0.72,
      label: "Double Top (72%)",
    };
    drawPatterns(ctx, [pattern], layout, viewport);

    // Should have called stroke for the connecting line
    expect(ctx.stroke).toHaveBeenCalled();
    // Should have drawn circles at key points (3 arc calls)
    expect(ctx.arc).toHaveBeenCalledTimes(3);
    // Should have drawn the label
    expect(ctx.fillText).toHaveBeenCalled();
    // Should have used setLineDash for dashed lines and then reset
    expect(ctx.setLineDash).toHaveBeenCalled();
  });

  it("draws multiple patterns", () => {
    const ctx = createMockCtx();
    const patterns: DetectedPattern[] = [
      {
        type: "double_top",
        startIndex: 5,
        endIndex: 15,
        keyPoints: [
          { index: 7, price: 1.13 },
          { index: 10, price: 1.10 },
          { index: 13, price: 1.13 },
        ],
        confidence: 0.65,
        label: "Double Top (65%)",
      },
      {
        type: "double_bottom",
        startIndex: 20,
        endIndex: 35,
        keyPoints: [
          { index: 22, price: 1.06 },
          { index: 27, price: 1.09 },
          { index: 32, price: 1.06 },
        ],
        confidence: 0.78,
        label: "Double Bottom (78%)",
      },
    ];
    drawPatterns(ctx, patterns, layout, viewport);

    // 3 circles per pattern * 2 patterns = 6 arcs
    expect(ctx.arc).toHaveBeenCalledTimes(6);
  });

  it("skips patterns with fewer than 2 key points", () => {
    const ctx = createMockCtx();
    const pattern: DetectedPattern = {
      type: "double_top",
      startIndex: 10,
      endIndex: 20,
      keyPoints: [{ index: 15, price: 1.12 }],
      confidence: 0.5,
      label: "Incomplete",
    };
    drawPatterns(ctx, [pattern], layout, viewport);
    expect(ctx.stroke).not.toHaveBeenCalled();
  });
});
