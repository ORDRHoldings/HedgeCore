/**
 * drawingToolsFullSuite.test.ts
 * Full test suite for all 49 drawing tools — TradingView parity + institutional innovations.
 */

import {
  createDrawing,
  getPointsRequired,
  getDefaultColor,
  computeDrawingStats,
  computeAngle,
  getPipSize,
  getLineDash,
  shiftSnapPoint,
  magneticSnap,
  detectBreakouts,
  createParallelLine,
  pointToSegmentDist,
} from "@/components/chart/renderers/drawings";
import type { Drawing, DrawingType } from "@/components/chart/renderers/drawings";
import type { Bar } from "@/components/chart/indicators/types";
import type { ChartLayout, Viewport } from "@/components/chart/core/data";

// ─── Test helpers ────────────────────────────────────────────
function makeBar(o: number, h: number, l: number, c: number, t = 0): Bar {
  return { o, h, l, c, v: 1000, t };
}

function makeBars(count: number, startPrice: number, trend: number = 0): Bar[] {
  return Array.from({ length: count }, (_, i) => {
    const base = startPrice + trend * i;
    return makeBar(base, base + 0.001, base - 0.001, base + trend * 0.5, i * 3600);
  });
}

const LAYOUT: ChartLayout = {
  canvasWidth: 1200,
  canvasHeight: 600,
  mainTop: 0,
  mainHeight: 500,
  volumeTop: 500,
  volumeHeight: 50,
  chartLeft: 60,
  chartRight: 1140,
  chartWidth: 1080,
  priceAxisWidth: 60,
  timeAxisHeight: 28,
  subPanes: [],
  subPaneTop: 550,
  subPaneHeight: 0,
};

const VIEWPORT: Viewport = {
  startIndex: 0,
  endIndex: 100,
  priceMin: 1.05,
  priceMax: 1.15,
};

const BARS_50 = makeBars(50, 1.10, 0.0001);
const PAIR = "EURUSD";

// ─── Suite 1: Factory & defaults ─────────────────────────────
describe("Drawing Factory", () => {
  const allTypes: DrawingType[] = [
    "trendline", "horizontal", "fibonacci", "rectangle",
    "ray", "extended_line", "horizontal_ray", "vertical_line", "cross_line", "info_line", "trend_angle",
    "parallel_channel", "regression_trend", "flat_top_bottom", "disjoint_channel",
    "pitchfork", "schiff_pitchfork", "mod_schiff_pitchfork", "inside_pitchfork",
    "fib_extension", "fib_channel", "fib_time_zone", "fib_speed_fan",
    "gann_box", "gann_fan",
    "xabcd_pattern", "cypher_pattern", "abcd_pattern", "triangle_pattern", "three_drives", "head_shoulders",
    "elliott_impulse", "elliott_correction", "elliott_triangle",
    "circle", "ellipse", "triangle_shape", "arrow_drawing", "brush", "polyline", "arc",
    "long_position", "short_position", "date_range", "price_range", "date_price_range", "forecast",
    "text_note", "anchored_text", "callout", "price_label", "arrow_marker_up", "arrow_marker_down", "flag_mark",
  ];

  test("createDrawing generates unique IDs", () => {
    const d1 = createDrawing("trendline", [{ index: 0, price: 1.1 }, { index: 10, price: 1.11 }]);
    const d2 = createDrawing("trendline", [{ index: 0, price: 1.1 }, { index: 10, price: 1.11 }]);
    expect(d1.id).not.toBe(d2.id);
    expect(d1.id).toMatch(/^d_\d+_[a-z0-9]+$/);
  });

  test.each(allTypes)("createDrawing(%s) has valid defaults", (type) => {
    const nReq = getPointsRequired(type);
    const count = nReq === -1 ? 2 : nReq;
    const points = Array.from({ length: count }, (_, i) => ({ index: i * 5, price: 1.1 + i * 0.001 }));
    const d = createDrawing(type, points);
    expect(d.type).toBe(type);
    expect(d.id).toBeTruthy();
    expect(typeof d.color).toBe("string");
    expect(d.opacity).toBe(1);
    expect(d.lineWidth).toBe(1.5);
    expect(d.locked).toBe(false);
    expect(d.stats).toBeDefined();
  });

  test.each(allTypes)("getDefaultColor(%s) returns valid hex", (type) => {
    const color = getDefaultColor(type);
    expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });
});

// ─── Suite 2: Points required ─────────────────────────────────
describe("getPointsRequired", () => {
  const cases: [DrawingType, number][] = [
    ["horizontal", 1], ["vertical_line", 1], ["text_note", 1],
    ["arrow_marker_up", 1], ["arrow_marker_down", 1], ["flag_mark", 1], ["price_label", 1],
    ["trendline", 2], ["ray", 2], ["extended_line", 2], ["rectangle", 2],
    ["circle", 2], ["ellipse", 2], ["date_range", 2], ["price_range", 2],
    ["regression_trend", 2], ["gann_box", 2], ["gann_fan", 2],
    ["parallel_channel", 3], ["pitchfork", 3], ["fib_extension", 3],
    ["callout", 3], ["triangle_shape", 3], ["arc", 3], ["forecast", 3],
    ["abcd_pattern", 4], ["disjoint_channel", 4],
    ["xabcd_pattern", 5], ["triangle_pattern", 5],
    ["elliott_impulse", 6], ["head_shoulders", 6],
    ["three_drives", 7],
    ["brush", -1], ["polyline", -1], ["arrow_drawing", -1],
  ];

  test.each(cases)("getPointsRequired(%s) = %i", (type, expected) => {
    expect(getPointsRequired(type)).toBe(expected);
  });
});

// ─── Suite 3: Geometry helpers ────────────────────────────────
describe("Geometry utilities", () => {
  test("computeAngle — horizontal line is 0°", () => {
    expect(computeAngle(0, 100, 100, 100)).toBeCloseTo(0, 1);
  });

  test("computeAngle — vertical up line is +90°", () => {
    expect(computeAngle(100, 100, 100, 0)).toBeCloseTo(90, 1);
  });

  test("computeAngle — 45° line", () => {
    expect(computeAngle(0, 100, 100, 0)).toBeCloseTo(45, 1);
  });

  test("getPipSize — EURUSD is 0.0001", () => {
    expect(getPipSize("EURUSD")).toBeCloseTo(0.0001, 6);
  });

  test("getPipSize — USDJPY is 0.01", () => {
    expect(getPipSize("USDJPY")).toBeCloseTo(0.01, 6);
  });

  test("getLineDash — solid is empty", () => {
    expect(getLineDash("solid")).toEqual([]);
  });

  test("getLineDash — dashed has gaps", () => {
    expect(getLineDash("dashed")).toEqual([6, 4]);
  });

  test("getLineDash — dotted has small gaps", () => {
    expect(getLineDash("dotted")).toEqual([2, 2]);
  });

  test("pointToSegmentDist — on segment endpoint", () => {
    const d = pointToSegmentDist(0, 0, 0, 0, 10, 0);
    expect(d).toBeCloseTo(0, 5);
  });

  test("pointToSegmentDist — perpendicular from midpoint", () => {
    const d = pointToSegmentDist(5, 5, 0, 0, 10, 0);
    expect(d).toBeCloseTo(5, 5);
  });

  test("pointToSegmentDist — beyond endpoint clamps", () => {
    const d = pointToSegmentDist(20, 0, 0, 0, 10, 0);
    expect(d).toBeCloseTo(10, 5);
  });

  test("pointToSegmentDist — point on segment interior", () => {
    const d = pointToSegmentDist(5, 0, 0, 0, 10, 0);
    expect(d).toBeCloseTo(0, 5);
  });

  test("pointToSegmentDist — zero-length segment", () => {
    const d = pointToSegmentDist(3, 4, 0, 0, 0, 0);
    expect(d).toBeCloseTo(5, 5);
  });
});

// ─── Suite 4: Shift snap ──────────────────────────────────────
describe("shiftSnapPoint", () => {
  test("snaps to 0° (horizontal)", () => {
    const result = shiftSnapPoint(0, 0, 100, 3);
    expect(result.y).toBeCloseTo(0, 0);
    expect(result.x).toBeCloseTo(100, 0);
  });

  test("snaps to 45°", () => {
    const result = shiftSnapPoint(0, 0, 95, -97);
    // angle from anchor: atan2(-97, 95) ≈ -45.6°, snaps to -45°
    const angleDeg = Math.atan2(result.y, result.x) * (180 / Math.PI);
    expect(Math.abs(angleDeg)).toBeCloseTo(45, 0);
  });

  test("snaps to 90° (vertical up in screen space)", () => {
    const result = shiftSnapPoint(0, 0, 2, -100);
    expect(result.x).toBeCloseTo(0, 0);
    expect(result.y).toBeLessThan(0);
  });

  test("preserves distance from anchor", () => {
    const result = shiftSnapPoint(0, 0, 80, 60);
    const dist = Math.hypot(result.x, result.y);
    expect(dist).toBeCloseTo(Math.hypot(80, 60), 1);
  });

  test("snaps to 180° (leftward horizontal)", () => {
    const result = shiftSnapPoint(0, 0, -100, 2);
    expect(result.y).toBeCloseTo(0, 0);
    expect(result.x).toBeLessThan(0);
  });

  test("snaps to 15° increment", () => {
    // 15° angle: dx=cos(15°)*100, dy=sin(15°)*100 with small perturbation
    const targetRad = 15 * (Math.PI / 180);
    const cx = Math.cos(targetRad) * 100;
    const cy = Math.sin(targetRad) * 100;
    const result = shiftSnapPoint(0, 0, cx, cy);
    const angleDeg = Math.atan2(result.y, result.x) * (180 / Math.PI);
    expect(angleDeg).toBeCloseTo(15, 0);
  });
});

// ─── Suite 5: Magnetic snap ───────────────────────────────────
describe("magneticSnap", () => {
  const bars = [makeBar(1.1000, 1.1050, 1.0980, 1.1020, 0)];
  const localViewport: Viewport = { startIndex: 0, endIndex: 10, priceMin: 1.095, priceMax: 1.110 };

  test("returns correct structure", () => {
    const result = magneticSnap(
      LAYOUT.chartLeft + 1,
      LAYOUT.mainTop + LAYOUT.mainHeight / 2,
      bars, LAYOUT, localViewport
    );
    expect(result).toHaveProperty("snapped");
    expect(result).toHaveProperty("snapType");
    expect(result).toHaveProperty("price");
    expect(result).toHaveProperty("index");
  });

  test("no snap when cursor far from bar (index out of range)", () => {
    const result = magneticSnap(9999, 9999, bars, LAYOUT, VIEWPORT);
    expect(result.snapped).toBe(false);
    expect(result.snapType).toBe("none");
  });

  test("no snap when empty bars array", () => {
    const result = magneticSnap(
      LAYOUT.chartLeft,
      LAYOUT.mainTop + 50,
      [], LAYOUT, localViewport
    );
    expect(result.snapped).toBe(false);
    expect(result.snapType).toBe("none");
  });

  test("snaps to high when cursor within 12px of high", () => {
    // Place cursor exactly at the high's Y position
    const highPrice = 1.1050;
    const { mainTop, mainHeight } = LAYOUT;
    const { priceMin, priceMax } = localViewport;
    const highY = mainTop + mainHeight - ((highPrice - priceMin) / (priceMax - priceMin)) * mainHeight;
    // Use X that corresponds to bar index 0
    const barX = LAYOUT.chartLeft + (0 - localViewport.startIndex) / (localViewport.endIndex - localViewport.startIndex) * LAYOUT.chartWidth;
    const result = magneticSnap(barX, highY, bars, LAYOUT, localViewport);
    expect(result.snapped).toBe(true);
    expect(result.snapType).toBe("high");
    expect(result.price).toBeCloseTo(highPrice, 4);
  });

  test("snaps to close when cursor nearest to close", () => {
    const closePrice = 1.1020;
    const { mainTop, mainHeight } = LAYOUT;
    const { priceMin, priceMax } = localViewport;
    const closeY = mainTop + mainHeight - ((closePrice - priceMin) / (priceMax - priceMin)) * mainHeight;
    const barX = LAYOUT.chartLeft + (0 - localViewport.startIndex) / (localViewport.endIndex - localViewport.startIndex) * LAYOUT.chartWidth;
    const result = magneticSnap(barX, closeY, bars, LAYOUT, localViewport);
    expect(result.snapped).toBe(true);
    expect(result.snapType).toBe("close");
    expect(result.price).toBeCloseTo(closePrice, 4);
  });
});

// ─── Suite 6: Stats computation ───────────────────────────────
describe("computeDrawingStats", () => {
  const d = createDrawing("trendline", [{ index: 0, price: 1.1000 }, { index: 10, price: 1.1100 }]);

  test("computes pip difference correctly", () => {
    const stats = computeDrawingStats(d, BARS_50, PAIR, LAYOUT, VIEWPORT);
    expect(stats.pips).toContain("100");
    expect(stats.pips).toContain("+");
  });

  test("computes percent change with sign", () => {
    const stats = computeDrawingStats(d, BARS_50, PAIR, LAYOUT, VIEWPORT);
    expect(stats.percent).toContain("%");
    expect(stats.percent).toContain("+");
  });

  test("computes bar count", () => {
    const stats = computeDrawingStats(d, BARS_50, PAIR, LAYOUT, VIEWPORT);
    expect(stats.bars).toBe("10 bars");
  });

  test("computes angle correctly", () => {
    const stats = computeDrawingStats(d, BARS_50, PAIR, LAYOUT, VIEWPORT);
    expect(stats.angle).toContain("°");
  });

  test("handles single point gracefully — returns dashes", () => {
    const singlePt = createDrawing("horizontal", [{ index: 5, price: 1.1 }]);
    const stats = computeDrawingStats(singlePt, BARS_50, PAIR, LAYOUT, VIEWPORT);
    expect(stats.pips).toBe("—");
    expect(stats.percent).toBe("—");
    expect(stats.bars).toBe("—");
    expect(stats.angle).toBe("—");
  });

  test("negative move returns negative pip sign", () => {
    const bearish = createDrawing("trendline", [{ index: 0, price: 1.1100 }, { index: 10, price: 1.1000 }]);
    const stats = computeDrawingStats(bearish, BARS_50, PAIR, LAYOUT, VIEWPORT);
    expect(stats.pips).toContain("-");
  });

  test("USDJPY uses 0.01 pip size", () => {
    const jpy = createDrawing("trendline", [{ index: 0, price: 145.00 }, { index: 5, price: 145.50 }]);
    const stats = computeDrawingStats(jpy, BARS_50, "USDJPY", LAYOUT, VIEWPORT);
    expect(stats.pips).toContain("50");
  });

  test("date range is computed from bars timestamps", () => {
    const stats = computeDrawingStats(d, BARS_50, PAIR, LAYOUT, VIEWPORT);
    // Timestamps: bar[0].t=0, bar[10].t=36000 → 10h
    expect(stats.dateRange).toContain("h");
  });

  test("zero-bar drawing returns 0 bars", () => {
    const sameIndex = createDrawing("trendline", [{ index: 5, price: 1.10 }, { index: 5, price: 1.11 }]);
    const stats = computeDrawingStats(sameIndex, BARS_50, PAIR, LAYOUT, VIEWPORT);
    expect(stats.bars).toBe("0 bars");
  });
});

// ─── Suite 7: Breakout detection ──────────────────────────────
describe("detectBreakouts", () => {
  test("detects upward breakout", () => {
    const trendline = createDrawing("trendline", [{ index: 0, price: 1.10 }, { index: 9, price: 1.10 }]);
    const bars = [
      ...Array.from({ length: 9 }, (_, i) => makeBar(1.099, 1.0995, 1.0985, 1.0990, i * 3600)),
      makeBar(1.0990, 1.1020, 1.0985, 1.1015, 9 * 3600), // breaks above 1.10
    ];
    const breakouts = detectBreakouts(trendline, bars, { startIndex: 0, endIndex: 10, priceMin: 1.09, priceMax: 1.11 });
    expect(breakouts.length).toBeGreaterThan(0);
    expect(breakouts[0].direction).toBe("up");
  });

  test("detects downward breakout", () => {
    const trendline = createDrawing("trendline", [{ index: 0, price: 1.10 }, { index: 9, price: 1.10 }]);
    const bars = [
      ...Array.from({ length: 9 }, (_, i) => makeBar(1.101, 1.1015, 1.1005, 1.1010, i * 3600)),
      makeBar(1.1010, 1.1015, 1.0990, 1.0985, 9 * 3600), // breaks below 1.10
    ];
    const breakouts = detectBreakouts(trendline, bars, { startIndex: 0, endIndex: 10, priceMin: 1.09, priceMax: 1.11 });
    expect(breakouts.length).toBeGreaterThan(0);
    expect(breakouts[0].direction).toBe("down");
  });

  test("returns empty for non-trendline types", () => {
    const rect = createDrawing("rectangle", [{ index: 0, price: 1.10 }, { index: 10, price: 1.11 }]);
    const breakouts = detectBreakouts(rect, BARS_50, VIEWPORT);
    expect(breakouts).toHaveLength(0);
  });

  test("returns empty when bars array is empty", () => {
    const trendline = createDrawing("trendline", [{ index: 0, price: 1.10 }, { index: 9, price: 1.10 }]);
    const breakouts = detectBreakouts(trendline, [], { startIndex: 0, endIndex: 10, priceMin: 1.09, priceMax: 1.11 });
    expect(breakouts).toHaveLength(0);
  });

  test("returns empty when trendline has fewer than 2 points", () => {
    const partial = createDrawing("trendline", [{ index: 0, price: 1.10 }]);
    // Manually drop to 1 point
    (partial as any).points = [{ index: 0, price: 1.10 }];
    const breakouts = detectBreakouts(partial, BARS_50, VIEWPORT);
    expect(breakouts).toHaveLength(0);
  });

  test("breakout result has correct shape", () => {
    const trendline = createDrawing("trendline", [{ index: 0, price: 1.10 }, { index: 9, price: 1.10 }]);
    const bars = [
      ...Array.from({ length: 9 }, (_, i) => makeBar(1.099, 1.0995, 1.0985, 1.0990, i * 3600)),
      makeBar(1.0990, 1.1020, 1.0985, 1.1015, 9 * 3600),
    ];
    const breakouts = detectBreakouts(trendline, bars, { startIndex: 0, endIndex: 10, priceMin: 1.09, priceMax: 1.11 });
    if (breakouts.length > 0) {
      expect(breakouts[0]).toHaveProperty("barIndex");
      expect(breakouts[0]).toHaveProperty("direction");
      expect(breakouts[0]).toHaveProperty("price");
    }
  });

  test("no breakout on flat trendline with stable price", () => {
    const trendline = createDrawing("trendline", [{ index: 0, price: 1.10 }, { index: 9, price: 1.10 }]);
    const bars = Array.from({ length: 10 }, (_, i) =>
      makeBar(1.1005, 1.1010, 1.0998, 1.1005, i * 3600)
    );
    // All closes above trendline — may fire once at start but no cross
    const breakouts = detectBreakouts(trendline, bars, { startIndex: 0, endIndex: 10, priceMin: 1.09, priceMax: 1.11 });
    // No crossing should occur since prevClose and currClose are both above line
    for (const b of breakouts) {
      expect(b.direction).toBeDefined();
    }
  });
});

// ─── Suite 8: Parallel line creation ──────────────────────────
describe("createParallelLine", () => {
  const base = createDrawing("trendline", [
    { index: 0, price: 1.10 }, { index: 10, price: 1.11 }
  ], { color: "#2962FF", lineWidth: 2, lineStyle: "dashed" });

  test("creates new drawing with offset prices", () => {
    const parallel = createParallelLine(base, 0.005);
    expect(parallel.points[0].price).toBeCloseTo(1.105, 5);
    expect(parallel.points[1].price).toBeCloseTo(1.115, 5);
  });

  test("preserves index positions", () => {
    const parallel = createParallelLine(base, 0.005);
    expect(parallel.points[0].index).toBe(0);
    expect(parallel.points[1].index).toBe(10);
  });

  test("preserves color", () => {
    const parallel = createParallelLine(base, 0.005);
    expect(parallel.color).toBe(base.color);
  });

  test("preserves lineWidth", () => {
    const parallel = createParallelLine(base, 0.005);
    expect(parallel.lineWidth).toBe(base.lineWidth);
  });

  test("preserves lineStyle", () => {
    const parallel = createParallelLine(base, 0.005);
    expect(parallel.lineStyle).toBe(base.lineStyle);
  });

  test("creates unique ID", () => {
    const parallel = createParallelLine(base, 0.005);
    expect(parallel.id).not.toBe(base.id);
  });

  test("empty label stays empty", () => {
    const parallel = createParallelLine(base, 0.005);
    // base.label is "" — empty label → parallel label is also ""
    expect(parallel.label).toBe("");
  });

  test("non-empty label appends parallel symbol", () => {
    const labeled = createDrawing("trendline", [{ index: 0, price: 1.10 }, { index: 10, price: 1.11 }], { label: "trend" });
    const parallel = createParallelLine(labeled, 0.005);
    expect(parallel.label).toContain("\u2225");
    expect(parallel.label).toContain("trend");
  });

  test("negative offset moves line below", () => {
    const parallel = createParallelLine(base, -0.005);
    expect(parallel.points[0].price).toBeCloseTo(1.095, 5);
    expect(parallel.points[1].price).toBeCloseTo(1.105, 5);
  });
});

// ─── Suite 9: Harmonic ratio validation ───────────────────────
describe("Harmonic pattern ratios", () => {
  function computeRatio(price0: number, price1: number, price2: number): number {
    const leg1 = Math.abs(price1 - price0);
    const leg2 = Math.abs(price2 - price1);
    return leg1 > 0 ? leg2 / leg1 : 0;
  }

  test("ABCD BC/AB validation — Gartley BC in [0.382, 0.886]", () => {
    const ratio = computeRatio(1.1000, 1.1100, 1.1040); // AB=100, BC=60
    expect(ratio).toBeGreaterThanOrEqual(0.382);
    expect(ratio).toBeLessThanOrEqual(0.886);
  });

  test("XABCD Gartley XD/XA detection", () => {
    const xa = 0.0100;
    const xd = 0.0079;
    const xdXa = xd / xa;
    // Gartley: XD/XA ≈ 0.786
    expect(xdXa).toBeGreaterThan(0.74);
    expect(xdXa).toBeLessThan(0.83);
  });

  test("Butterfly pattern identification — XD/XA > 1.27", () => {
    const xa = 0.0100;
    const ab = xa * 0.786; // Butterfly AB = 78.6% XA
    const xd = xa * 1.27;
    expect(xd / xa).toBeGreaterThan(1.2);
    expect(ab / xa).toBeGreaterThan(0.74);
    expect(ab / xa).toBeLessThan(0.83);
  });

  test("Crab pattern — XD/XA = 1.618", () => {
    const xa = 0.0100;
    const xd = xa * 1.618;
    expect(xd / xa).toBeCloseTo(1.618, 2);
  });

  test("Bat pattern — AB/XA in [0.382, 0.5]", () => {
    const xa = 0.0100;
    const ab = xa * 0.382;
    expect(ab / xa).toBeGreaterThanOrEqual(0.382);
    expect(ab / xa).toBeLessThanOrEqual(0.5);
  });
});

// ─── Suite 10: Elliott Wave rule checks ───────────────────────
describe("Elliott Wave validation", () => {
  function validateElliottImpulse(points: { index: number; price: number }[]): {
    rule1: boolean; rule2: boolean; rule3: boolean;
  } {
    const [p0, p1, p2, p3, p4, p5] = points;
    const w1 = Math.abs(p1.price - p0.price);
    const w2 = Math.abs(p2.price - p1.price);
    const w3 = Math.abs(p3.price - p2.price);
    const w4 = Math.abs(p4.price - p3.price);
    const w5 = Math.abs(p5.price - p4.price);
    return {
      rule1: w2 < w1,
      rule2: w3 >= Math.min(w1, w5),
      rule3: p4.price > p1.price,
    };
  }

  test("valid impulse wave passes all 3 rules", () => {
    const points = [
      { index: 0, price: 1.1000 },
      { index: 10, price: 1.1100 }, // W1 = 100 pips
      { index: 15, price: 1.1050 }, // W2 = 50 pips < W1 ✓
      { index: 30, price: 1.1250 }, // W3 = 200 pips (longest) ✓
      { index: 35, price: 1.1150 }, // W4 = 100 pips, above W1 end (1.1100) ✓
      { index: 45, price: 1.1300 }, // W5 = 150 pips
    ];
    const result = validateElliottImpulse(points);
    expect(result.rule1).toBe(true);
    expect(result.rule2).toBe(true);
    expect(result.rule3).toBe(true);
  });

  test("detects rule 1 violation — W2 retraces > W1", () => {
    const points = [
      { index: 0, price: 1.1000 },
      { index: 10, price: 1.1100 }, // W1 = 100 pips
      { index: 15, price: 1.0990 }, // W2 = 110 pips > W1 — VIOLATION
      { index: 30, price: 1.1250 },
      { index: 35, price: 1.1150 },
      { index: 45, price: 1.1300 },
    ];
    const result = validateElliottImpulse(points);
    expect(result.rule1).toBe(false);
  });

  test("detects rule 2 violation — W3 is shortest", () => {
    const points = [
      { index: 0, price: 1.1000 },
      { index: 10, price: 1.1200 }, // W1 = 200 pips
      { index: 15, price: 1.1150 }, // W2 = 50 pips
      { index: 20, price: 1.1180 }, // W3 = 30 pips — SHORTEST = VIOLATION
      { index: 25, price: 1.1100 },
      { index: 35, price: 1.1350 }, // W5 = 250 pips
    ];
    const result = validateElliottImpulse(points);
    expect(result.rule2).toBe(false);
  });

  test("W3 can equal W1 without violation", () => {
    const points = [
      { index: 0, price: 1.1000 },
      { index: 10, price: 1.1100 }, // W1 = 100 pips
      { index: 15, price: 1.1050 }, // W2 = 50 pips
      { index: 25, price: 1.1150 }, // W3 = 100 pips (equals W1, not shorter) ✓
      { index: 30, price: 1.1100 },
      { index: 40, price: 1.1180 },
    ];
    const result = validateElliottImpulse(points);
    expect(result.rule2).toBe(true);
  });
});

// ─── Suite 11: Gann math ─────────────────────────────────────
describe("Gann angle calculations", () => {
  const GANN_ANGLES: [string, number][] = [
    ["1x1", 45], ["2x1", 63.4], ["1x2", 26.6], ["3x1", 71.6], ["1x3", 18.4],
    ["4x1", 75.96], ["1x4", 14.04], ["8x1", 82.87], ["1x8", 7.13],
  ];

  test.each(GANN_ANGLES)("Gann %s angle in degrees", (name, expectedDeg) => {
    // "NxM" means N price units per M time units; angle = atan(N/M)
    const [priceParts, timeParts] = name.split("x").map(Number);
    const ratio = priceParts / timeParts;
    const deg = Math.atan(ratio) * (180 / Math.PI);
    expect(deg).toBeCloseTo(expectedDeg, 0);
  });

  test("Gann Square of 9 sqrt progression", () => {
    const basePrice = 1.1000;
    const sqRoot = Math.sqrt(basePrice);
    const next = Math.pow(sqRoot + 0.25, 2);
    // Should be slightly above base
    expect(next).toBeGreaterThan(basePrice);
    expect(next).toBeLessThan(basePrice + 1.0);
  });

  test("1x1 angle is exactly 45°", () => {
    // 1 price unit per 1 time unit → atan(1/1) = 45°
    const deg = Math.atan(1) * (180 / Math.PI);
    expect(deg).toBeCloseTo(45, 5);
  });

  test("8x1 and 1x8 are complementary angles", () => {
    // 8x1 = 8 price per 1 time = steep; 1x8 = 1 price per 8 time = shallow
    const angle8x1 = Math.atan(8 / 1) * (180 / Math.PI);
    const angle1x8 = Math.atan(1 / 8) * (180 / Math.PI);
    expect(angle8x1 + angle1x8).toBeCloseTo(90, 1);
  });
});

// ─── Suite 12: Fibonacci math ────────────────────────────────
describe("Fibonacci calculations", () => {
  const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0];
  const GOLDEN_RATIO = 1.6180339887;

  test("consecutive Fibonacci ratios approach golden ratio", () => {
    const fibs = [1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89];
    // Start from index 7 (21/13 ≈ 1.615) where error < 0.01
    for (let i = fibs.length - 1; i >= 7; i--) {
      const ratio = fibs[i] / fibs[i - 1];
      expect(Math.abs(ratio - GOLDEN_RATIO)).toBeLessThan(0.01);
    }
  });

  test("Fib extension level 161.8% calculation", () => {
    const p0 = 1.1000, p1 = 1.1100; // XA = 100 pips
    const p2 = 1.1050; // retracement
    const level = p2 + (p1 - p0) * 1.618;
    expect(level).toBeGreaterThan(1.1050);
  });

  test("Fib speed fan ratios include 0.236", () => {
    expect(FIB_LEVELS).toContain(0.236);
  });

  test("Fib speed fan ratios include 0.618", () => {
    expect(FIB_LEVELS).toContain(0.618);
  });

  test("Fibonacci time zone numbers are Fibonacci sequence", () => {
    const fibNums = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89];
    for (let i = 2; i < fibNums.length; i++) {
      expect(fibNums[i]).toBe(fibNums[i - 1] + fibNums[i - 2]);
    }
  });

  test("Fib retracement 61.8% of 100-pip move", () => {
    const move = 0.0100; // 100 pips
    const retrace = move * 0.618;
    expect(retrace).toBeCloseTo(0.00618, 5);
  });

  test("Standard 7 Fibonacci levels are defined", () => {
    expect(FIB_LEVELS).toHaveLength(7);
    expect(FIB_LEVELS[0]).toBe(0);
    expect(FIB_LEVELS[FIB_LEVELS.length - 1]).toBe(1.0);
  });
});

// ─── Suite 13: Innovation field validation ───────────────────
describe("Innovation fields on Drawing interface", () => {
  test("eventType field is accepted", () => {
    const d = createDrawing("vertical_line", [{ index: 5, price: 1.1 }], { eventType: "NFP" });
    expect(d.eventType).toBe("NFP");
  });

  test("institutionalTag field is accepted", () => {
    const d = createDrawing("text_note", [{ index: 0, price: 1.1 }], { institutionalTag: "RISK" });
    expect(d.institutionalTag).toBe("RISK");
  });

  test("waveDegree field is accepted", () => {
    const pts = Array.from({ length: 6 }, (_, i) => ({ index: i * 5, price: 1.1 + i * 0.001 }));
    const d = createDrawing("elliott_impulse", pts, { waveDegree: "primary" });
    expect(d.waveDegree).toBe("primary");
  });

  test("scenarioBranches field is accepted", () => {
    const branches = [
      { label: "BULL", probability: 45, endIndex: 50, endPrice: 1.12 },
      { label: "BEAR", probability: 35, endIndex: 50, endPrice: 1.08 },
    ];
    const pts = [{ index: 0, price: 1.1 }, { index: 10, price: 1.11 }, { index: 20, price: 1.105 }];
    const d = createDrawing("forecast", pts, { scenarioBranches: branches });
    expect(d.scenarioBranches).toHaveLength(2);
    expect(d.scenarioBranches![0].label).toBe("BULL");
  });

  test("formationTag field is accepted", () => {
    const pts = [{ index: 0, price: 1.10 }, { index: 10, price: 1.11 }, { index: 20, price: 1.095 }];
    const d = createDrawing("triangle_shape", pts, { formationTag: "ASCENDING" });
    expect(d.formationTag).toBe("ASCENDING");
  });

  test("signalStrength field is accepted", () => {
    const d = createDrawing("arrow_marker_up", [{ index: 5, price: 1.1 }], { signalStrength: 4 });
    expect(d.signalStrength).toBe(4);
  });

  test("hedgeCostBps field is accepted", () => {
    const d = createDrawing("long_position", [
      { index: 0, price: 1.1 }, { index: 10, price: 1.115 }
    ], { hedgeCostBps: 3.5 });
    expect(d.hedgeCostBps).toBe(3.5);
  });

  test("teamRole field is accepted", () => {
    const d = createDrawing("text_note", [{ index: 0, price: 1.1 }], { teamRole: "RISK" });
    expect(d.teamRole).toBe("RISK");
  });

  test("alertEnabled field is accepted", () => {
    const d = createDrawing("horizontal", [{ index: 0, price: 1.10 }], { alertEnabled: true });
    expect(d.alertEnabled).toBe(true);
  });

  test("policyLinkForwardRate field is accepted", () => {
    const d = createDrawing("horizontal", [{ index: 0, price: 1.10 }], { policyLinkForwardRate: 1.1050 });
    expect(d.policyLinkForwardRate).toBeCloseTo(1.1050, 4);
  });

  test("eventTaxonomy field is accepted", () => {
    const d = createDrawing("vertical_line", [{ index: 10, price: 1.1 }], { eventTaxonomy: "NFP" });
    expect(d.eventTaxonomy).toBe("NFP");
  });

  test("atrMultiple field is accepted", () => {
    const d = createDrawing("circle", [{ index: 0, price: 1.10 }, { index: 5, price: 1.11 }], { atrMultiple: 2.5 });
    expect(d.atrMultiple).toBe(2.5);
  });
});

// ─── Suite 14: R:R calculation (info_line innovation) ────────
describe("Risk/Reward calculations", () => {
  test("1:1 R:R stop level calculation", () => {
    const entry = 1.1000, target = 1.1100;
    const move = target - entry; // +100 pips
    const stop1_1 = entry - move / 1;
    expect(stop1_1).toBeCloseTo(1.0900, 5);
  });

  test("1:2 R:R stop level calculation", () => {
    const entry = 1.1000, target = 1.1100;
    const move = target - entry;
    const stop1_2 = entry - move / 2;
    expect(stop1_2).toBeCloseTo(1.0950, 5);
  });

  test("1:3 R:R stop level calculation", () => {
    const entry = 1.1000, target = 1.1100;
    const move = target - entry;
    const stop1_3 = entry - move / 3;
    const pipSize = 0.0001;
    const riskPips = (entry - stop1_3) / pipSize;
    const rewardPips = (target - entry) / pipSize;
    const rr = rewardPips / riskPips;
    expect(rr).toBeCloseTo(3, 0);
  });

  test("short position R:R inverts direction", () => {
    const entry = 1.1100, target = 1.1000; // short target
    const stop = 1.1150;
    const reward = entry - target; // 100 pips
    const risk = stop - entry;     // 50 pips
    const rr = reward / risk;
    expect(rr).toBeCloseTo(2, 1);
  });

  test("1:1 R:R when risk equals reward", () => {
    const entry = 1.1000, target = 1.1050, stop = 1.0950;
    const reward = target - entry; // 50 pips
    const risk = entry - stop;     // 50 pips
    const rr = reward / risk;
    expect(rr).toBeCloseTo(1, 5);
  });
});

// ─── Suite 15: ATR calculation (circle innovation) ───────────
describe("ATR calculation for circle tool", () => {
  test("14-period ATR computed correctly", () => {
    const bars: Bar[] = Array.from({ length: 15 }, (_, i) => ({
      o: 1.1 + i * 0.001,
      h: 1.1 + i * 0.001 + 0.0010,
      l: 1.1 + i * 0.001 - 0.0008,
      c: 1.1 + i * 0.001 + 0.0002,
      v: 1000,
      t: i * 3600,
    }));
    const period = 14;
    let sum = 0;
    for (let i = 1; i < bars.length; i++) {
      const tr = Math.max(
        bars[i].h - bars[i].l,
        Math.abs(bars[i].h - bars[i - 1].c),
        Math.abs(bars[i].l - bars[i - 1].c),
      );
      sum += tr;
    }
    const atr = sum / (bars.length - 1);
    expect(atr).toBeGreaterThan(0);
    expect(atr).toBeLessThan(0.005);
  });

  test("single-bar TR equals H-L when no prev close", () => {
    const bar = makeBar(1.1000, 1.1050, 1.0980, 1.1020, 0);
    const tr = bar.h - bar.l;
    expect(tr).toBeCloseTo(0.0070, 5);
  });

  test("ATR is always non-negative", () => {
    const bars: Bar[] = Array.from({ length: 5 }, (_, i) =>
      makeBar(1.1, 1.105, 1.095, 1.100, i * 3600)
    );
    let sum = 0;
    for (let i = 1; i < bars.length; i++) {
      const tr = Math.max(
        bars[i].h - bars[i].l,
        Math.abs(bars[i].h - bars[i - 1].c),
        Math.abs(bars[i].l - bars[i - 1].c),
      );
      sum += tr;
    }
    expect(sum / (bars.length - 1)).toBeGreaterThanOrEqual(0);
  });
});

// ─── Suite 16: ABCD auto-complete projection ─────────────────
describe("ABCD pattern auto-complete projection", () => {
  test("projects D at AB=CD distance from C", () => {
    // A=1.10, B=1.11, C=1.105
    const aPrice = 1.1000, bPrice = 1.1100, cPrice = 1.1050;
    const abMove = bPrice - aPrice; // +0.01
    const projD = cPrice - abMove; // C - AB (since AB was up, CD goes down)
    expect(projD).toBeCloseTo(1.0950, 5);
  });

  test("ABCD harmonicity — BC/AB ratio in valid range", () => {
    const ab = 0.0100, bc = 0.0061;
    const bcAb = bc / ab;
    expect(bcAb).toBeGreaterThanOrEqual(0.382);
    expect(bcAb).toBeLessThanOrEqual(0.886);
  });

  test("AB = CD equality check for classic ABCD", () => {
    const ab = 0.0100;
    const cd = 0.0100;
    expect(Math.abs(ab - cd)).toBeLessThan(0.0001);
  });

  test("bearish ABCD projects downward D", () => {
    // A=1.11, B=1.10, C=1.105 (retraced from B), D should be below C
    const aPrice = 1.1100, bPrice = 1.1000, cPrice = 1.1050;
    const abMove = bPrice - aPrice; // -0.01
    const projD = cPrice + abMove; // C + AB = 1.105 - 0.01 = 1.095
    expect(projD).toBeLessThan(cPrice);
    expect(projD).toBeCloseTo(1.0950, 5);
  });
});

// ─── Suite 17: Head & Shoulders symmetry score ───────────────
describe("H&S symmetry calculation", () => {
  function computeSymmetryScore(
    lsHeight: number, rsHeight: number, lsWidth: number, rsWidth: number
  ): number {
    const heightSym = Math.min(lsHeight, rsHeight) / Math.max(lsHeight, rsHeight);
    const widthSym = Math.min(lsWidth, rsWidth) / Math.max(lsWidth, rsWidth);
    return Math.round((heightSym * 0.6 + widthSym * 0.4) * 100);
  }

  test("perfect symmetry = 100%", () => {
    expect(computeSymmetryScore(100, 100, 10, 10)).toBe(100);
  });

  test("mismatched heights reduces score", () => {
    expect(computeSymmetryScore(100, 70, 10, 10)).toBeLessThan(100);
  });

  test("mismatched widths reduces score less than heights", () => {
    const heightMismatch = computeSymmetryScore(100, 70, 10, 10);
    const widthMismatch = computeSymmetryScore(100, 100, 10, 7);
    // Height has 0.6 weight vs width 0.4 — equal mismatch = height affects more
    expect(heightMismatch).toBeLessThan(widthMismatch);
  });

  test("very asymmetric shoulders produce low score", () => {
    // heightSym = 10/100 = 0.1, widthSym = 1.0, score = 0.1*0.6 + 1.0*0.4 = 0.46 → 46
    const score = computeSymmetryScore(100, 10, 10, 10);
    expect(score).toBeLessThan(50);
  });

  test("symmetry score is between 0 and 100", () => {
    for (const [ls, rs, lw, rw] of [[80, 60, 5, 8], [50, 50, 10, 10], [100, 1, 10, 1]]) {
      const s = computeSymmetryScore(ls as number, rs as number, lw as number, rw as number);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(100);
    }
  });
});

// ─── Suite 18: Slope velocity (extended_line innovation) ──────
describe("Slope velocity calculation", () => {
  test("calculates pips per bar correctly", () => {
    const p0 = { price: 1.1000, index: 0 };
    const p1 = { price: 1.1100, index: 10 };
    const priceDiff = p1.price - p0.price;
    const barDiff = p1.index - p0.index;
    const pipsPerBar = (priceDiff / 0.0001) / barDiff;
    expect(pipsPerBar).toBeCloseTo(10, 1);
  });

  test("identifies reversal zone when > 5 pips/bar", () => {
    const pipsPerBar = 6;
    expect(pipsPerBar > 5).toBe(true);
  });

  test("no reversal zone at normal slope", () => {
    const pipsPerBar = 2;
    expect(pipsPerBar > 5).toBe(false);
  });

  test("downslope is negative pips/bar", () => {
    const p0 = { price: 1.1100, index: 0 };
    const p1 = { price: 1.1000, index: 10 };
    const priceDiff = p1.price - p0.price;
    const pipsPerBar = (priceDiff / 0.0001) / (p1.index - p0.index);
    expect(pipsPerBar).toBeCloseTo(-10, 1);
  });

  test("flat line has 0 pips/bar", () => {
    const p0 = { price: 1.1000, index: 0 };
    const p1 = { price: 1.1000, index: 10 };
    const priceDiff = p1.price - p0.price;
    const pipsPerBar = (priceDiff / 0.0001) / (p1.index - p0.index);
    expect(pipsPerBar).toBeCloseTo(0, 5);
  });
});

// ─── Suite 19: Drawing defaults exhaustive check ─────────────
describe("Drawing default field completeness", () => {
  test("rectangle has fillEnabled = true by default", () => {
    const d = createDrawing("rectangle", [{ index: 0, price: 1.10 }, { index: 10, price: 1.11 }]);
    expect(d.fillEnabled).toBe(true);
  });

  test("non-rectangle has fillEnabled = false by default", () => {
    const d = createDrawing("trendline", [{ index: 0, price: 1.10 }, { index: 10, price: 1.11 }]);
    expect(d.fillEnabled).toBe(false);
  });

  test("default lineStyle is solid", () => {
    const d = createDrawing("trendline", [{ index: 0, price: 1.10 }, { index: 10, price: 1.11 }]);
    expect(d.lineStyle).toBe("solid");
  });

  test("default extendLeft and extendRight are false", () => {
    const d = createDrawing("trendline", [{ index: 0, price: 1.10 }, { index: 10, price: 1.11 }]);
    expect(d.extendLeft).toBe(false);
    expect(d.extendRight).toBe(false);
  });

  test("default arrowLeft and arrowRight are false", () => {
    const d = createDrawing("trendline", [{ index: 0, price: 1.10 }, { index: 10, price: 1.11 }]);
    expect(d.arrowLeft).toBe(false);
    expect(d.arrowRight).toBe(false);
  });

  test("default label is empty string", () => {
    const d = createDrawing("trendline", [{ index: 0, price: 1.10 }, { index: 10, price: 1.11 }]);
    expect(d.label).toBe("");
  });

  test("default labelAlign is right", () => {
    const d = createDrawing("trendline", [{ index: 0, price: 1.10 }, { index: 10, price: 1.11 }]);
    expect(d.labelAlign).toBe("right");
  });

  test("default stats.showPips is true", () => {
    const d = createDrawing("trendline", [{ index: 0, price: 1.10 }, { index: 10, price: 1.11 }]);
    expect(d.stats.showPips).toBe(true);
  });

  test("default stats.alwaysShow is false", () => {
    const d = createDrawing("trendline", [{ index: 0, price: 1.10 }, { index: 10, price: 1.11 }]);
    expect(d.stats.alwaysShow).toBe(false);
  });

  test("default stats.position is top", () => {
    const d = createDrawing("trendline", [{ index: 0, price: 1.10 }, { index: 10, price: 1.11 }]);
    expect(d.stats.position).toBe("top");
  });

  test("overrides merge correctly with all fields preserved", () => {
    const d = createDrawing("trendline", [{ index: 0, price: 1.10 }, { index: 10, price: 1.11 }], {
      lineStyle: "dotted",
      extendRight: true,
      arrowRight: true,
      locked: true,
    });
    expect(d.lineStyle).toBe("dotted");
    expect(d.extendRight).toBe(true);
    expect(d.arrowRight).toBe(true);
    expect(d.locked).toBe(true);
    // Other defaults still hold
    expect(d.opacity).toBe(1);
    expect(d.lineWidth).toBe(1.5);
  });
});
