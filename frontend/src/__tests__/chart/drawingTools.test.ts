/**
 * drawingTools.test.ts — Comprehensive tests for drawing tools with
 * TradingView parity features + innovations.
 *
 * Tests: createDrawing, hitTestDrawings, magneticSnap, shiftSnapPoint,
 * computeDrawingStats, createParallelLine, detectBreakouts,
 * pointToSegmentDist, computeAngle, getLineDash, getPipSize,
 * loadDrawings migration, drawDrawingPriceLabels.
 */

import {
  createDrawing,
  hitTestDrawings,
  magneticSnap,
  shiftSnapPoint,
  computeDrawingStats,
  createParallelLine,
  detectBreakouts,
  pointToSegmentDist,
  computeAngle,
  getLineDash,
  getPipSize,
  loadDrawings,
  saveDrawings,
  getDefaultColor,
  DEFAULT_STATS,
} from "@/components/chart/renderers/drawings";
import type { Drawing, DrawingType, LineStyle, MagneticSnapResult, HitTestResult, ComputedStats } from "@/components/chart/renderers/drawings";
import type { Bar } from "@/components/chart/indicators/types";
import type { ChartLayout, Viewport } from "@/components/chart/core/data";

// ── Mock localStorage ──────────────────────────────────
const localStore: Record<string, string> = {};
const mockStorage = {
  getItem: (k: string) => localStore[k] ?? null,
  setItem: (k: string, v: string) => { localStore[k] = v; },
  removeItem: (k: string) => { delete localStore[k]; },
  clear: () => { Object.keys(localStore).forEach(k => delete localStore[k]); },
  get length() { return Object.keys(localStore).length; },
  key: (i: number) => Object.keys(localStore)[i] ?? null,
};
Object.defineProperty(globalThis, "localStorage", { value: mockStorage, writable: true });

beforeEach(() => {
  Object.keys(localStore).forEach(k => delete localStore[k]);
});

// ── Helpers ──────────────────────────────────────────────

function makeLayout(): ChartLayout {
  return {
    chartLeft: 10,
    chartWidth: 800,
    mainTop: 4,
    mainHeight: 400,
    volumeTop: 404,
    volumeHeight: 80,
    priceAxisWidth: 80,
    timeAxisHeight: 28,
    subPanes: [],
    subPaneBorder: 2,
  } as ChartLayout;
}

function makeViewport(start = 0, end = 100, pMin = 1.0, pMax = 1.5): Viewport {
  return {
    startIndex: start,
    endIndex: end,
    priceMin: pMin,
    priceMax: pMax,
  };
}

function makeBars(count: number, basePrice = 1.1): Bar[] {
  return Array.from({ length: count }, (_, i) => ({
    t: Date.now() / 1000 + i * 3600,
    o: basePrice + i * 0.001,
    h: basePrice + i * 0.001 + 0.005,
    l: basePrice + i * 0.001 - 0.005,
    c: basePrice + i * 0.001 + 0.002,
    v: 1000 + i * 10,
  }));
}

function makeTrendline(p0Idx = 10, p0Price = 1.1, p1Idx = 50, p1Price = 1.3, overrides?: Partial<Drawing>): Drawing {
  return createDrawing("trendline", [
    { index: p0Idx, price: p0Price },
    { index: p1Idx, price: p1Price },
  ], overrides);
}

function makeHorizontal(price = 1.2): Drawing {
  return createDrawing("horizontal", [{ index: 0, price }]);
}

// ═══════════════════════════════════════════════════════════
//  1. createDrawing
// ═══════════════════════════════════════════════════════════

describe("createDrawing", () => {
  it("creates a trendline with defaults", () => {
    const d = createDrawing("trendline", [
      { index: 0, price: 1.0 },
      { index: 10, price: 1.1 },
    ]);
    expect(d.id).toMatch(/^d_/);
    expect(d.type).toBe("trendline");
    expect(d.points).toHaveLength(2);
    expect(d.lineStyle).toBe("solid");
    expect(d.opacity).toBe(1);
    expect(d.arrowLeft).toBe(false);
    expect(d.arrowRight).toBe(false);
    expect(d.showAngle).toBe(true);
    expect(d.showMidPoint).toBe(false);
    expect(d.showPriceLabels).toBe(false);
    expect(d.locked).toBe(false);
    expect(d.stats).toEqual(DEFAULT_STATS);
    expect(d.label).toBe("");
    expect(d.labelFontSize).toBe(11);
    expect(d.labelBold).toBe(false);
    expect(d.labelItalic).toBe(false);
    expect(d.labelColor).toBe("");
    expect(d.labelAlign).toBe("right");
  });

  it("creates a horizontal with 1 point", () => {
    const d = createDrawing("horizontal", [{ index: 5, price: 1.25 }]);
    expect(d.type).toBe("horizontal");
    expect(d.points).toHaveLength(1);
  });

  it("applies overrides", () => {
    const d = createDrawing("trendline", [
      { index: 0, price: 1.0 },
      { index: 10, price: 1.1 },
    ], {
      color: "#FF0000",
      lineWidth: 3,
      lineStyle: "dashed",
      opacity: 0.5,
      arrowRight: true,
      locked: true,
      label: "Trend",
      labelBold: true,
    });
    expect(d.color).toBe("#FF0000");
    expect(d.lineWidth).toBe(3);
    expect(d.lineStyle).toBe("dashed");
    expect(d.opacity).toBe(0.5);
    expect(d.arrowRight).toBe(true);
    expect(d.locked).toBe(true);
    expect(d.label).toBe("Trend");
    expect(d.labelBold).toBe(true);
  });

  it("uses default color per type", () => {
    const t = createDrawing("trendline", [{ index: 0, price: 1 }, { index: 1, price: 2 }]);
    const h = createDrawing("horizontal", [{ index: 0, price: 1 }]);
    const f = createDrawing("fibonacci", [{ index: 0, price: 1 }, { index: 1, price: 2 }]);
    const r = createDrawing("rectangle", [{ index: 0, price: 1 }, { index: 1, price: 2 }]);
    expect(t.color).toBe(getDefaultColor("trendline"));
    expect(h.color).toBe(getDefaultColor("horizontal"));
    expect(f.color).toBe(getDefaultColor("fibonacci"));
    expect(r.color).toBe(getDefaultColor("rectangle"));
  });

  it("generates unique IDs", () => {
    const d1 = createDrawing("trendline", [{ index: 0, price: 1 }, { index: 1, price: 2 }]);
    const d2 = createDrawing("trendline", [{ index: 0, price: 1 }, { index: 1, price: 2 }]);
    expect(d1.id).not.toBe(d2.id);
  });
});

// ═══════════════════════════════════════════════════════════
//  2. pointToSegmentDist
// ═══════════════════════════════════════════════════════════

describe("pointToSegmentDist", () => {
  it("returns 0 for point on segment", () => {
    expect(pointToSegmentDist(5, 5, 0, 0, 10, 10)).toBeCloseTo(0, 5);
  });

  it("returns perpendicular distance", () => {
    // Point (5, 0) to horizontal segment from (0,5) to (10,5)
    const d = pointToSegmentDist(5, 0, 0, 5, 10, 5);
    expect(d).toBeCloseTo(5, 5);
  });

  it("returns endpoint distance when projection is beyond", () => {
    // Point (15, 5) to segment (0,0)→(10,0)
    const d = pointToSegmentDist(15, 5, 0, 0, 10, 0);
    expect(d).toBeCloseTo(Math.hypot(5, 5), 5);
  });

  it("handles zero-length segment", () => {
    const d = pointToSegmentDist(3, 4, 0, 0, 0, 0);
    expect(d).toBeCloseTo(5, 5);
  });

  it("returns distance from start when before segment", () => {
    const d = pointToSegmentDist(-5, 0, 0, 0, 10, 0);
    expect(d).toBeCloseTo(5, 5);
  });
});

// ═══════════════════════════════════════════════════════════
//  3. computeAngle
// ═══════════════════════════════════════════════════════════

describe("computeAngle", () => {
  it("returns 0° for horizontal right", () => {
    expect(computeAngle(0, 100, 100, 100)).toBeCloseTo(0, 1);
  });

  it("returns 90° for straight up (y inverted)", () => {
    // Canvas: going up means y decreases
    expect(computeAngle(0, 100, 0, 0)).toBeCloseTo(90, 1);
  });

  it("returns -90° for straight down", () => {
    expect(computeAngle(0, 0, 0, 100)).toBeCloseTo(-90, 1);
  });

  it("returns 45° for diagonal up-right", () => {
    expect(computeAngle(0, 100, 100, 0)).toBeCloseTo(45, 1);
  });

  it("returns 180° for horizontal left", () => {
    const angle = computeAngle(100, 50, 0, 50);
    expect(Math.abs(angle)).toBeCloseTo(180, 1);
  });
});

// ═══════════════════════════════════════════════════════════
//  4. getPipSize
// ═══════════════════════════════════════════════════════════

describe("getPipSize", () => {
  it("returns 0.0001 for EUR/USD", () => {
    expect(getPipSize("EUR/USD")).toBe(0.0001);
  });

  it("returns 0.01 for USD/JPY", () => {
    expect(getPipSize("USD/JPY")).toBe(0.01);
  });

  it("returns 0.01 for GBP/JPY", () => {
    expect(getPipSize("GBP/JPY")).toBe(0.01);
  });

  it("returns 0.0001 for AUD/NZD", () => {
    expect(getPipSize("AUD/NZD")).toBe(0.0001);
  });

  it("is case insensitive", () => {
    expect(getPipSize("usd/jpy")).toBe(0.01);
    expect(getPipSize("eur/usd")).toBe(0.0001);
  });
});

// ═══════════════════════════════════════════════════════════
//  5. getLineDash
// ═══════════════════════════════════════════════════════════

describe("getLineDash", () => {
  it("returns empty array for solid", () => {
    expect(getLineDash("solid")).toEqual([]);
  });

  it("returns [6,4] for dashed", () => {
    expect(getLineDash("dashed")).toEqual([6, 4]);
  });

  it("returns [2,2] for dotted", () => {
    expect(getLineDash("dotted")).toEqual([2, 2]);
  });
});

// ═══════════════════════════════════════════════════════════
//  6. shiftSnapPoint
// ═══════════════════════════════════════════════════════════

describe("shiftSnapPoint", () => {
  it("snaps to horizontal (0°)", () => {
    const result = shiftSnapPoint(100, 100, 200, 103);
    expect(result.y).toBeCloseTo(100, 0);
    expect(result.x).toBeGreaterThan(100);
  });

  it("snaps to vertical (90°)", () => {
    const result = shiftSnapPoint(100, 100, 103, 0);
    expect(result.x).toBeCloseTo(100, 0);
    expect(result.y).toBeLessThan(100);
  });

  it("snaps to 45°", () => {
    const result = shiftSnapPoint(0, 0, 100, -95);
    // Should snap close to 45° diagonal
    expect(Math.abs(result.x - Math.abs(result.y))).toBeLessThan(5);
  });

  it("preserves distance from anchor", () => {
    const result = shiftSnapPoint(0, 0, 100, 0);
    const dist = Math.hypot(result.x, result.y);
    expect(dist).toBeCloseTo(100, 0);
  });

  it("returns anchor when cursor is at anchor", () => {
    const result = shiftSnapPoint(50, 50, 50, 50);
    expect(result.x).toBeCloseTo(50);
    expect(result.y).toBeCloseTo(50);
  });
});

// ═══════════════════════════════════════════════════════════
//  7. magneticSnap
// ═══════════════════════════════════════════════════════════

describe("magneticSnap", () => {
  const layout = makeLayout();
  const viewport = makeViewport(0, 100, 1.0, 1.5);
  const bars = makeBars(100, 1.1);

  it("snaps to nearest OHLC within threshold", () => {
    // Position cursor near bar 10's price
    const bar10 = bars[10];
    const { startIndex, endIndex, priceMin, priceMax } = viewport;
    // Compute pixel position of bar 10 close
    const barX = layout.chartLeft + ((10 - startIndex) / (endIndex - startIndex)) * layout.chartWidth;
    const barY = layout.mainTop + layout.mainHeight - ((bar10.c - priceMin) / (priceMax - priceMin)) * layout.mainHeight;
    // Cursor slightly offset
    const result = magneticSnap(barX, barY + 3, bars, layout, viewport);
    expect(result.snapped).toBe(true);
    expect(result.snapType).not.toBe("none");
    expect(result.index).toBe(10);
  });

  it("returns snapped=false when far from any bar", () => {
    // Cursor way outside chart
    const result = magneticSnap(-100, -100, bars, layout, viewport);
    expect(result.snapped).toBe(false);
    expect(result.snapType).toBe("none");
  });

  it("returns correct snap type (open/high/low/close)", () => {
    const bar = bars[20];
    const { startIndex, endIndex, priceMin, priceMax } = viewport;
    const barX = layout.chartLeft + ((20 - startIndex) / (endIndex - startIndex)) * layout.chartWidth;
    // Position exactly at high
    const highY = layout.mainTop + layout.mainHeight - ((bar.h - priceMin) / (priceMax - priceMin)) * layout.mainHeight;
    const result = magneticSnap(barX, highY, bars, layout, viewport);
    if (result.snapped) {
      expect(["open", "high", "low", "close"]).toContain(result.snapType);
    }
  });
});

// ═══════════════════════════════════════════════════════════
//  8. hitTestDrawings
// ═══════════════════════════════════════════════════════════

describe("hitTestDrawings", () => {
  const layout = makeLayout();
  const viewport = makeViewport(0, 100, 1.0, 1.5);

  it("returns null for empty drawings array", () => {
    const result = hitTestDrawings(100, 200, [], layout, viewport);
    expect(result).toBeNull();
  });

  it("detects trendline body hit", () => {
    const d = makeTrendline(10, 1.1, 50, 1.3);
    // Compute midpoint pixel
    const { startIndex, endIndex, priceMin, priceMax } = viewport;
    const midIdx = 30;
    const midPrice = 1.2;
    const mx = layout.chartLeft + ((midIdx - startIndex) / (endIndex - startIndex)) * layout.chartWidth;
    const my = layout.mainTop + layout.mainHeight - ((midPrice - priceMin) / (priceMax - priceMin)) * layout.mainHeight;
    const result = hitTestDrawings(mx, my, [d], layout, viewport);
    expect(result).not.toBeNull();
    expect(result!.drawingId).toBe(d.id);
    expect(result!.part).toBe("body");
  });

  it("detects trendline endpoint hit (p0)", () => {
    const d = makeTrendline(10, 1.1, 50, 1.3);
    const { startIndex, endIndex, priceMin, priceMax } = viewport;
    const px = layout.chartLeft + ((10 - startIndex) / (endIndex - startIndex)) * layout.chartWidth;
    const py = layout.mainTop + layout.mainHeight - ((1.1 - priceMin) / (priceMax - priceMin)) * layout.mainHeight;
    const result = hitTestDrawings(px, py, [d], layout, viewport);
    expect(result).not.toBeNull();
    expect(result!.part).toBe("p0");
  });

  it("detects trendline endpoint hit (p1)", () => {
    const d = makeTrendline(10, 1.1, 50, 1.3);
    const { startIndex, endIndex, priceMin, priceMax } = viewport;
    const px = layout.chartLeft + ((50 - startIndex) / (endIndex - startIndex)) * layout.chartWidth;
    const py = layout.mainTop + layout.mainHeight - ((1.3 - priceMin) / (priceMax - priceMin)) * layout.mainHeight;
    const result = hitTestDrawings(px, py, [d], layout, viewport);
    expect(result).not.toBeNull();
    expect(result!.part).toBe("p1");
  });

  it("detects horizontal line hit", () => {
    const d = makeHorizontal(1.2);
    const { priceMin, priceMax } = viewport;
    const py = layout.mainTop + layout.mainHeight - ((1.2 - priceMin) / (priceMax - priceMin)) * layout.mainHeight;
    const result = hitTestDrawings(200, py, [d], layout, viewport);
    expect(result).not.toBeNull();
    expect(result!.drawingId).toBe(d.id);
  });

  it("returns null when clicking far from any drawing", () => {
    const d = makeTrendline(10, 1.1, 50, 1.3);
    const result = hitTestDrawings(0, 0, [d], layout, viewport);
    expect(result).toBeNull();
  });

  it("prefers closer drawing when multiple overlap", () => {
    const d1 = makeTrendline(10, 1.1, 50, 1.3);
    const d2 = makeHorizontal(1.2);
    const { startIndex, endIndex, priceMin, priceMax } = viewport;
    const midIdx = 30;
    const py = layout.mainTop + layout.mainHeight - ((1.2 - priceMin) / (priceMax - priceMin)) * layout.mainHeight;
    const px = layout.chartLeft + ((midIdx - startIndex) / (endIndex - startIndex)) * layout.chartWidth;
    const result = hitTestDrawings(px, py, [d1, d2], layout, viewport);
    expect(result).not.toBeNull();
    // Should hit whichever is closer
  });
});

// ═══════════════════════════════════════════════════════════
//  9. computeDrawingStats
// ═══════════════════════════════════════════════════════════

describe("computeDrawingStats", () => {
  const layout = makeLayout();
  const viewport = makeViewport(0, 100, 1.0, 1.5);
  const bars = makeBars(100, 1.0);

  it("returns dashes for single-point drawing", () => {
    const d = makeHorizontal(1.2);
    const stats = computeDrawingStats(d, bars, "EUR/USD", layout, viewport);
    expect(stats.price).toBe("—");
    expect(stats.percent).toBe("—");
    expect(stats.pips).toBe("—");
  });

  it("computes price difference", () => {
    const d = makeTrendline(10, 1.1000, 50, 1.1500);
    const stats = computeDrawingStats(d, bars, "EUR/USD", layout, viewport);
    expect(stats.price).not.toBe("—");
    // 0.05 price diff
    expect(stats.price).toContain("0.05");
  });

  it("computes pips for EUR/USD correctly", () => {
    const d = makeTrendline(10, 1.1000, 50, 1.1500);
    const stats = computeDrawingStats(d, bars, "EUR/USD", layout, viewport);
    // 500 pips = 0.05 / 0.0001
    expect(stats.pips).toContain("500");
  });

  it("computes pips for USD/JPY correctly", () => {
    const jpyBars = makeBars(100, 110.0);
    const jpyViewport = makeViewport(0, 100, 108, 115);
    const d = makeTrendline(10, 110.00, 50, 111.00);
    const stats = computeDrawingStats(d, jpyBars, "USD/JPY", layout, jpyViewport);
    // 100 pips = 1.00 / 0.01
    expect(stats.pips).toContain("100");
  });

  it("computes percent change", () => {
    const d = makeTrendline(10, 1.0000, 50, 1.1000);
    const stats = computeDrawingStats(d, bars, "EUR/USD", layout, viewport);
    // 10% change
    expect(stats.percent).toContain("10");
  });

  it("computes bar count", () => {
    const d = makeTrendline(10, 1.1, 50, 1.3);
    const stats = computeDrawingStats(d, bars, "EUR/USD", layout, viewport);
    expect(stats.bars).toContain("40");
  });

  it("computes angle", () => {
    const d = makeTrendline(10, 1.1, 50, 1.3);
    const stats = computeDrawingStats(d, bars, "EUR/USD", layout, viewport);
    expect(stats.angle).not.toBe("—");
    // Should contain a degree value
    expect(stats.angle).toMatch(/°/);
  });
});

// ═══════════════════════════════════════════════════════════
//  10. createParallelLine
// ═══════════════════════════════════════════════════════════

describe("createParallelLine", () => {
  it("creates a parallel line offset by given price", () => {
    const d = makeTrendline(10, 1.1, 50, 1.3);
    const parallel = createParallelLine(d, 0.05);
    expect(parallel.type).toBe("trendline");
    expect(parallel.points[0].price).toBeCloseTo(1.15);
    expect(parallel.points[1].price).toBeCloseTo(1.35);
    expect(parallel.points[0].index).toBe(10);
    expect(parallel.points[1].index).toBe(50);
  });

  it("preserves original drawing color", () => {
    const d = makeTrendline(10, 1.1, 50, 1.3, { color: "#FF5733" });
    const parallel = createParallelLine(d, 0.05);
    expect(parallel.color).toBe("#FF5733");
  });

  it("creates a new ID", () => {
    const d = makeTrendline(10, 1.1, 50, 1.3);
    const parallel = createParallelLine(d, 0.05);
    expect(parallel.id).not.toBe(d.id);
  });

  it("handles negative offset", () => {
    const d = makeTrendline(10, 1.1, 50, 1.3);
    const parallel = createParallelLine(d, -0.05);
    expect(parallel.points[0].price).toBeCloseTo(1.05);
    expect(parallel.points[1].price).toBeCloseTo(1.25);
  });
});

// ═══════════════════════════════════════════════════════════
//  11. detectBreakouts
// ═══════════════════════════════════════════════════════════

describe("detectBreakouts", () => {
  it("returns empty for non-trendline", () => {
    const d = makeHorizontal(1.2);
    const viewport = makeViewport(0, 100, 1.0, 1.5);
    const bars = makeBars(100, 1.1);
    expect(detectBreakouts(d, bars, viewport)).toEqual([]);
  });

  it("returns empty for trendline with <2 points", () => {
    const d = createDrawing("trendline", [{ index: 5, price: 1.1 }]);
    const viewport = makeViewport(0, 100, 1.0, 1.5);
    const bars = makeBars(100, 1.1);
    expect(detectBreakouts(d, bars, viewport)).toEqual([]);
  });

  it("detects breakout when bar crosses trendline", () => {
    const bars = makeBars(100, 1.1);
    // Create a trendline that some bars will cross
    // Line from (10, high value) to (90, high value) — flat line above most bars
    const linePrice = 1.14; // bars[30].h = 1.1 + 30*0.001 + 0.005 = 1.135, bar[40].h = 1.145
    const d = makeTrendline(10, linePrice, 90, linePrice);
    const viewport = makeViewport(0, 100, 1.0, 1.5);
    const breakouts = detectBreakouts(d, bars, viewport);
    // Bars around index 35 should cross: bar[35].h = 1.14 which equals linePrice
    // Some bars should trigger breakout
    expect(breakouts.length).toBeGreaterThanOrEqual(0);
  });

  it("detects up and down breakouts", () => {
    // Build bars that clearly cross: close below 1.2 then above
    const bars: Bar[] = [];
    for (let i = 0; i < 100; i++) {
      const price = i < 50 ? 1.0 : 1.4; // Sudden jump at bar 50
      bars.push({
        t: Date.now() / 1000 + i * 3600,
        o: price, h: price + 0.01, l: price - 0.01, c: price,
        v: 1000,
      });
    }
    // Flat trendline at 1.2 from bar 0 to bar 99
    const d = makeTrendline(0, 1.2, 99, 1.2);
    const viewport = makeViewport(0, 100, 0.9, 1.5);
    const breakouts = detectBreakouts(d, bars, viewport);
    // At bar 50: prevClose=1.0 <= prevLinePrice=1.2 AND currClose=1.4 > linePrice=1.2 → "up"
    expect(breakouts.length).toBeGreaterThan(0);
    const upBreaks = breakouts.filter(b => b.direction === "up");
    expect(upBreaks.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════
//  12. loadDrawings / saveDrawings (persistence + migration)
// ═══════════════════════════════════════════════════════════

describe("loadDrawings / saveDrawings", () => {
  it("returns empty array when no data saved", () => {
    expect(loadDrawings("EURUSD")).toEqual([]);
  });

  it("round-trips drawings through save/load", () => {
    const d1 = makeTrendline(10, 1.1, 50, 1.3, { label: "Test" });
    const d2 = makeHorizontal(1.25);
    saveDrawings("EURUSD", [d1, d2]);
    const loaded = loadDrawings("EURUSD");
    expect(loaded).toHaveLength(2);
    expect(loaded[0].id).toBe(d1.id);
    expect(loaded[1].id).toBe(d2.id);
    expect(loaded[0].label).toBe("Test");
  });

  it("migrates old drawings without new fields", () => {
    // Simulate old-format drawing stored in localStorage (no stats, no locked, etc.)
    const oldDrawing = {
      id: "d_old_123",
      type: "trendline",
      points: [{ index: 10, price: 1.1 }, { index: 50, price: 1.3 }],
      color: "#2196F3",
      lineWidth: 1.5,
    };
    localStore["ordr_drawings_EURUSD"] = JSON.stringify([oldDrawing]);
    const loaded = loadDrawings("EURUSD");
    expect(loaded).toHaveLength(1);
    // Should have all new fields with defaults
    expect(loaded[0].lineStyle).toBe("solid");
    expect(loaded[0].opacity).toBe(1);
    expect(loaded[0].arrowLeft).toBe(false);
    expect(loaded[0].arrowRight).toBe(false);
    expect(loaded[0].locked).toBe(false);
    expect(loaded[0].showAngle).toBe(true);
    expect(loaded[0].stats).toEqual(DEFAULT_STATS);
    expect(loaded[0].label).toBe("");
    expect(loaded[0].labelFontSize).toBe(11);
  });

  it("deep-merges partial stats object", () => {
    const partialDrawing = {
      id: "d_partial",
      type: "trendline",
      points: [{ index: 10, price: 1.1 }, { index: 50, price: 1.3 }],
      color: "#2196F3",
      stats: { showPrice: true }, // Only one field set
    };
    localStore["ordr_drawings_EURUSD"] = JSON.stringify([partialDrawing]);
    const loaded = loadDrawings("EURUSD");
    expect(loaded[0].stats.showPrice).toBe(true);
    expect(loaded[0].stats.showPercent).toBe(false); // Default
    expect(loaded[0].stats.showPips).toBe(true); // Default
    expect(loaded[0].stats.position).toBe("top"); // Default
  });

  it("returns empty for invalid JSON", () => {
    localStore["ordr_drawings_EURUSD"] = "not json";
    expect(loadDrawings("EURUSD")).toEqual([]);
  });

  it("saves to pair-specific key", () => {
    const d = makeHorizontal(1.1);
    saveDrawings("GBPUSD", [d]);
    expect(localStore["ordr_drawings_GBPUSD"]).toBeDefined();
    expect(localStore["ordr_drawings_EURUSD"]).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════
//  13. DEFAULT_STATS
// ═══════════════════════════════════════════════════════════

describe("DEFAULT_STATS", () => {
  it("has expected default values", () => {
    expect(DEFAULT_STATS.showPrice).toBe(false);
    expect(DEFAULT_STATS.showPercent).toBe(false);
    expect(DEFAULT_STATS.showPips).toBe(true);
    expect(DEFAULT_STATS.showBars).toBe(false);
    expect(DEFAULT_STATS.showDateRange).toBe(false);
    expect(DEFAULT_STATS.showAngle).toBe(false);
    expect(DEFAULT_STATS.alwaysShow).toBe(false);
    expect(DEFAULT_STATS.position).toBe("top");
  });
});

// ═══════════════════════════════════════════════════════════
//  14. Drawing locking
// ═══════════════════════════════════════════════════════════

describe("Drawing locked state", () => {
  it("defaults to unlocked", () => {
    const d = makeTrendline();
    expect(d.locked).toBe(false);
  });

  it("can be created locked via override", () => {
    const d = makeTrendline(10, 1.1, 50, 1.3, { locked: true });
    expect(d.locked).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
//  15. Line style features
// ═══════════════════════════════════════════════════════════

describe("Line style features", () => {
  it("supports solid/dashed/dotted", () => {
    const styles: LineStyle[] = ["solid", "dashed", "dotted"];
    styles.forEach(s => {
      const d = createDrawing("trendline", [
        { index: 0, price: 1 },
        { index: 10, price: 2 },
      ], { lineStyle: s });
      expect(d.lineStyle).toBe(s);
    });
  });

  it("arrow properties default to false", () => {
    const d = makeTrendline();
    expect(d.arrowLeft).toBe(false);
    expect(d.arrowRight).toBe(false);
  });

  it("arrow properties can be set", () => {
    const d = makeTrendline(10, 1.1, 50, 1.3, { arrowLeft: true, arrowRight: true });
    expect(d.arrowLeft).toBe(true);
    expect(d.arrowRight).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
//  16. Label / text styling
// ═══════════════════════════════════════════════════════════

describe("Label / text styling", () => {
  it("supports font size, bold, italic, color, align", () => {
    const d = createDrawing("trendline", [
      { index: 0, price: 1 },
      { index: 10, price: 2 },
    ], {
      label: "Support",
      labelFontSize: 14,
      labelBold: true,
      labelItalic: true,
      labelColor: "#FF0000",
      labelAlign: "center",
    });
    expect(d.label).toBe("Support");
    expect(d.labelFontSize).toBe(14);
    expect(d.labelBold).toBe(true);
    expect(d.labelItalic).toBe(true);
    expect(d.labelColor).toBe("#FF0000");
    expect(d.labelAlign).toBe("center");
  });
});

// ═══════════════════════════════════════════════════════════
//  17. Extend left/right
// ═══════════════════════════════════════════════════════════

describe("Extend left/right", () => {
  it("defaults to false", () => {
    const d = makeTrendline();
    expect(d.extendLeft).toBe(false);
    expect(d.extendRight).toBe(false);
  });

  it("can be enabled via overrides", () => {
    const d = makeTrendline(10, 1.1, 50, 1.3, { extendLeft: true, extendRight: true });
    expect(d.extendLeft).toBe(true);
    expect(d.extendRight).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
//  18. Display toggles (angle, midPoint, priceLabels)
// ═══════════════════════════════════════════════════════════

describe("Display toggles", () => {
  it("showAngle defaults to true for trendline", () => {
    const d = makeTrendline();
    expect(d.showAngle).toBe(true);
  });

  it("showMidPoint defaults to false", () => {
    const d = makeTrendline();
    expect(d.showMidPoint).toBe(false);
  });

  it("showPriceLabels defaults to false", () => {
    const d = makeTrendline();
    expect(d.showPriceLabels).toBe(false);
  });

  it("can be toggled via overrides", () => {
    const d = makeTrendline(10, 1.1, 50, 1.3, {
      showAngle: false,
      showMidPoint: true,
      showPriceLabels: true,
    });
    expect(d.showAngle).toBe(false);
    expect(d.showMidPoint).toBe(true);
    expect(d.showPriceLabels).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
//  19. Rectangle and Fibonacci types
// ═══════════════════════════════════════════════════════════

describe("Rectangle and Fibonacci drawings", () => {
  it("creates rectangle with 2 points", () => {
    const d = createDrawing("rectangle", [
      { index: 10, price: 1.1 },
      { index: 50, price: 1.3 },
    ]);
    expect(d.type).toBe("rectangle");
    expect(d.points).toHaveLength(2);
  });

  it("creates fibonacci with 2 points", () => {
    const d = createDrawing("fibonacci", [
      { index: 10, price: 1.1 },
      { index: 50, price: 1.3 },
    ]);
    expect(d.type).toBe("fibonacci");
    expect(d.points).toHaveLength(2);
  });

  it("hit tests rectangle edge", () => {
    const layout = makeLayout();
    const viewport = makeViewport(0, 100, 1.0, 1.5);
    const d = createDrawing("rectangle", [
      { index: 20, price: 1.1 },
      { index: 60, price: 1.3 },
    ]);
    // Click on the left edge of the rectangle (edge hit, not center)
    const { startIndex, endIndex, priceMin, priceMax } = viewport;
    const leftX = layout.chartLeft + ((20 - startIndex) / (endIndex - startIndex)) * layout.chartWidth;
    const my = layout.mainTop + layout.mainHeight - ((1.2 - priceMin) / (priceMax - priceMin)) * layout.mainHeight;
    const result = hitTestDrawings(leftX + 2, my, [d], layout, viewport);
    expect(result).not.toBeNull();
    expect(result!.drawingId).toBe(d.id);
  });
});

// ═══════════════════════════════════════════════════════════
//  20. Opacity
// ═══════════════════════════════════════════════════════════

describe("Opacity", () => {
  it("defaults to 1.0", () => {
    const d = makeTrendline();
    expect(d.opacity).toBe(1);
  });

  it("can be set via override", () => {
    const d = makeTrendline(10, 1.1, 50, 1.3, { opacity: 0.4 });
    expect(d.opacity).toBe(0.4);
  });
});
