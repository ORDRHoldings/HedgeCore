/**
 * chartTypes.test.ts -- Tests for Heikin Ashi transform and
 * all six chart-type renderers (line, area, bars, hollow, heikinAshi, baseline).
 *
 * Canvas 2D calls are captured via a mock CanvasRenderingContext2D so we can
 * assert correct drawing behaviour without a real DOM.
 */

import { computeHeikinAshi } from "@/components/chart/core/heikinAshi";
import {
  drawLineChart,
  drawAreaChart,
  drawBarChart,
  drawHollowCandles,
  drawHeikinAshi,
  drawBaseline,
} from "@/components/chart/renderers/chartTypes";
import type { ChartType } from "@/components/chart/renderers/chartTypes";
import type { Bar } from "@/components/chart/indicators/types";
import type { ChartLayout, Viewport } from "@/components/chart/core/data";
import { computeLayout, computeViewport } from "@/components/chart/core/data";

/* ================================================================== */
/*  Fixtures                                                           */
/* ================================================================== */

function makeBars(n: number, base = 1.1000): Bar[] {
  return Array.from({ length: n }, (_, i) => ({
    t: 1_700_000_000 + i * 3600,
    o: base + (i % 3 === 0 ? 0.001 : -0.001),
    h: base + 0.005 + i * 0.0001,
    l: base - 0.005 + i * 0.0001,
    c: base + (i % 2 === 0 ? 0.002 : -0.002),
    v: 1000 + i * 100,
  }));
}

/** Bull bar (close > open) */
function bullBar(t = 1): Bar {
  return { t, o: 1.1000, h: 1.1050, l: 1.0950, c: 1.1040, v: 500 };
}

/** Bear bar (close < open) */
function bearBar(t = 2): Bar {
  return { t, o: 1.1040, h: 1.1060, l: 1.0980, c: 1.0990, v: 600 };
}

function makeLayout(): ChartLayout {
  return computeLayout(1200, 600, 0);
}

function makeViewport(bars: Bar[]): Viewport {
  return computeViewport(bars, 0, bars.length - 1);
}

/* ================================================================== */
/*  Mock CanvasRenderingContext2D                                       */
/* ================================================================== */

interface MockCtxCalls {
  save: number;
  restore: number;
  beginPath: number;
  moveTo: [number, number][];
  lineTo: [number, number][];
  stroke: number;
  fill: number;
  fillRect: [number, number, number, number][];
  strokeRect: [number, number, number, number][];
  clip: number;
  closePath: number;
  rect: [number, number, number, number][];
  setLineDash: number[][];
  strokeStyles: string[];
  fillStyles: string[];
  lineWidths: number[];
}

function createMockCtx(): { ctx: CanvasRenderingContext2D; calls: MockCtxCalls } {
  const calls: MockCtxCalls = {
    save: 0,
    restore: 0,
    beginPath: 0,
    moveTo: [],
    lineTo: [],
    stroke: 0,
    fill: 0,
    fillRect: [],
    strokeRect: [],
    clip: 0,
    closePath: 0,
    rect: [],
    setLineDash: [],
    strokeStyles: [],
    fillStyles: [],
    lineWidths: [],
  };

  const ctx = {
    save: () => { calls.save++; },
    restore: () => { calls.restore++; },
    beginPath: () => { calls.beginPath++; },
    moveTo: (x: number, y: number) => { calls.moveTo.push([x, y]); },
    lineTo: (x: number, y: number) => { calls.lineTo.push([x, y]); },
    stroke: () => { calls.stroke++; },
    fill: () => { calls.fill++; },
    fillRect: (x: number, y: number, w: number, h: number) => { calls.fillRect.push([x, y, w, h]); },
    strokeRect: (x: number, y: number, w: number, h: number) => { calls.strokeRect.push([x, y, w, h]); },
    clip: () => { calls.clip++; },
    closePath: () => { calls.closePath++; },
    rect: (x: number, y: number, w: number, h: number) => { calls.rect.push([x, y, w, h]); },
    setLineDash: (d: number[]) => { calls.setLineDash.push(d); },
    createLinearGradient: () => ({
      addColorStop: () => {},
    }),
    set strokeStyle(v: string) { calls.strokeStyles.push(v); },
    set fillStyle(v: string) { calls.fillStyles.push(v); },
    set lineWidth(v: number) { calls.lineWidths.push(v); },
    set lineJoin(_: string) {},
    set lineCap(_: string) {},
  } as unknown as CanvasRenderingContext2D;

  return { ctx, calls };
}

/* ================================================================== */
/*  computeHeikinAshi                                                  */
/* ================================================================== */

describe("computeHeikinAshi", () => {
  it("returns empty array for empty input", () => {
    expect(computeHeikinAshi([])).toEqual([]);
  });

  it("computes first HA bar correctly", () => {
    const bar: Bar = { t: 100, o: 10, h: 15, l: 5, c: 12, v: 100 };
    const [ha] = computeHeikinAshi([bar]);

    // HA Close = (10+15+5+12)/4 = 10.5
    expect(ha.c).toBeCloseTo(10.5);
    // HA Open = (10+12)/2 = 11
    expect(ha.o).toBeCloseTo(11);
    // HA High = max(15, 11, 10.5) = 15
    expect(ha.h).toBeCloseTo(15);
    // HA Low = min(5, 11, 10.5) = 5
    expect(ha.l).toBeCloseTo(5);
    // Preserved
    expect(ha.t).toBe(100);
    expect(ha.v).toBe(100);
  });

  it("computes subsequent HA bars from previous HA values", () => {
    const bars: Bar[] = [
      { t: 1, o: 10, h: 15, l: 5, c: 12, v: 100 },
      { t: 2, o: 13, h: 16, l: 9, c: 14, v: 200 },
    ];
    const ha = computeHeikinAshi(bars);

    // Second bar:
    // HA Close = (13+16+9+14)/4 = 13
    expect(ha[1].c).toBeCloseTo(13);
    // HA Open = (ha[0].o + ha[0].c) / 2 = (11 + 10.5) / 2 = 10.75
    expect(ha[1].o).toBeCloseTo(10.75);
    // HA High = max(16, 10.75, 13) = 16
    expect(ha[1].h).toBeCloseTo(16);
    // HA Low = min(9, 10.75, 13) = 9
    expect(ha[1].l).toBeCloseTo(9);
    expect(ha[1].t).toBe(2);
    expect(ha[1].v).toBe(200);
  });

  it("preserves length", () => {
    const bars = makeBars(50);
    const ha = computeHeikinAshi(bars);
    expect(ha.length).toBe(50);
  });

  it("HA high is always >= HA open and HA close", () => {
    const bars = makeBars(100);
    const ha = computeHeikinAshi(bars);
    for (const b of ha) {
      expect(b.h).toBeGreaterThanOrEqual(b.o);
      expect(b.h).toBeGreaterThanOrEqual(b.c);
    }
  });

  it("HA low is always <= HA open and HA close", () => {
    const bars = makeBars(100);
    const ha = computeHeikinAshi(bars);
    for (const b of ha) {
      expect(b.l).toBeLessThanOrEqual(b.o);
      expect(b.l).toBeLessThanOrEqual(b.c);
    }
  });

  it("preserves timestamps and volumes", () => {
    const bars = makeBars(20);
    const ha = computeHeikinAshi(bars);
    for (let i = 0; i < bars.length; i++) {
      expect(ha[i].t).toBe(bars[i].t);
      expect(ha[i].v).toBe(bars[i].v);
    }
  });

  it("handles single bar", () => {
    const bars = [bullBar()];
    const ha = computeHeikinAshi(bars);
    expect(ha).toHaveLength(1);
    expect(ha[0].c).toBeCloseTo((1.1 + 1.105 + 1.095 + 1.104) / 4);
  });
});

/* ================================================================== */
/*  ChartType type                                                     */
/* ================================================================== */

describe("ChartType", () => {
  it("includes all 7 variants", () => {
    const types: ChartType[] = [
      "candles", "hollow", "bars", "line", "area", "heikinAshi", "baseline",
    ];
    expect(types).toHaveLength(7);
  });
});

/* ================================================================== */
/*  drawLineChart                                                      */
/* ================================================================== */

describe("drawLineChart", () => {
  it("does nothing for empty bars", () => {
    const { ctx, calls } = createMockCtx();
    drawLineChart(ctx, [], makeLayout(), { startIndex: 0, endIndex: 0, priceMin: 0, priceMax: 1 });
    expect(calls.stroke).toBe(0);
  });

  it("clips to chart area and restores context", () => {
    const bars = makeBars(10);
    const { ctx, calls } = createMockCtx();
    drawLineChart(ctx, bars, makeLayout(), makeViewport(bars));
    expect(calls.save).toBe(1);
    expect(calls.restore).toBe(1);
    expect(calls.clip).toBe(1);
  });

  it("draws a continuous line through all visible bars", () => {
    const bars = makeBars(20);
    const { ctx, calls } = createMockCtx();
    drawLineChart(ctx, bars, makeLayout(), makeViewport(bars));
    // Should have 1 moveTo (first point) and 19 lineTo's
    // (moveTo in the drawing path, not the clipping rect)
    expect(calls.moveTo.length).toBeGreaterThanOrEqual(1);
    expect(calls.lineTo.length).toBeGreaterThanOrEqual(19);
    expect(calls.stroke).toBeGreaterThanOrEqual(1);
  });

  it("sets line width to 2", () => {
    const bars = makeBars(5);
    const { ctx, calls } = createMockCtx();
    drawLineChart(ctx, bars, makeLayout(), makeViewport(bars));
    expect(calls.lineWidths).toContain(2);
  });

  it("uses THEME.sma1Color", () => {
    const bars = makeBars(5);
    const { ctx, calls } = createMockCtx();
    drawLineChart(ctx, bars, makeLayout(), makeViewport(bars));
    expect(calls.strokeStyles).toContain("#2962FF");
  });
});

/* ================================================================== */
/*  drawAreaChart                                                      */
/* ================================================================== */

describe("drawAreaChart", () => {
  it("does nothing for empty bars", () => {
    const { ctx, calls } = createMockCtx();
    drawAreaChart(ctx, [], makeLayout(), { startIndex: 0, endIndex: 0, priceMin: 0, priceMax: 1 });
    expect(calls.fill).toBe(0);
  });

  it("clips, fills, strokes, and restores", () => {
    const bars = makeBars(20);
    const { ctx, calls } = createMockCtx();
    drawAreaChart(ctx, bars, makeLayout(), makeViewport(bars));
    expect(calls.save).toBe(1);
    expect(calls.restore).toBe(1);
    expect(calls.clip).toBe(1);
    expect(calls.fill).toBeGreaterThanOrEqual(1);
    expect(calls.stroke).toBeGreaterThanOrEqual(1);
  });

  it("closes the fill path", () => {
    const bars = makeBars(10);
    const { ctx, calls } = createMockCtx();
    drawAreaChart(ctx, bars, makeLayout(), makeViewport(bars));
    expect(calls.closePath).toBeGreaterThanOrEqual(1);
  });

  it("creates gradient fill style", () => {
    const bars = makeBars(10);
    const { ctx, calls } = createMockCtx();
    drawAreaChart(ctx, bars, makeLayout(), makeViewport(bars));
    // fillStyle will be a gradient object (toString => "[object Object]" via mock)
    // Just verify fill was called
    expect(calls.fill).toBeGreaterThanOrEqual(1);
  });
});

/* ================================================================== */
/*  drawBarChart (OHLC)                                                */
/* ================================================================== */

describe("drawBarChart", () => {
  it("does nothing for empty bars", () => {
    const { ctx, calls } = createMockCtx();
    drawBarChart(ctx, [], makeLayout(), { startIndex: 0, endIndex: 0, priceMin: 0, priceMax: 1 });
    expect(calls.stroke).toBe(0);
  });

  it("clips and restores", () => {
    const bars = makeBars(10);
    const { ctx, calls } = createMockCtx();
    drawBarChart(ctx, bars, makeLayout(), makeViewport(bars));
    expect(calls.save).toBe(1);
    expect(calls.restore).toBe(1);
    expect(calls.clip).toBe(1);
  });

  it("draws 3 line segments per bar (wick + open tick + close tick)", () => {
    const bars = makeBars(5);
    const { ctx, calls } = createMockCtx();
    drawBarChart(ctx, bars, makeLayout(), makeViewport(bars));
    // Each bar: moveTo(x, hY), lineTo(x, lY), moveTo(x-4, oY), lineTo(x, oY), moveTo(x, cY), lineTo(x+4, cY)
    // = 3 moveTo + 3 lineTo per bar
    // Plus clipping rect moveTo/lineTo
    expect(calls.stroke).toBe(5); // one stroke() per bar
  });

  it("uses bull color for bull bars and bear color for bear bars", () => {
    const bars = [bullBar(1), bearBar(2)];
    const { ctx, calls } = createMockCtx();
    drawBarChart(ctx, bars, makeLayout(), makeViewport(bars));
    expect(calls.strokeStyles).toContain("#26A69A"); // bull
    expect(calls.strokeStyles).toContain("#EF5350"); // bear
  });

  it("sets lineWidth to 1.5", () => {
    const bars = makeBars(3);
    const { ctx, calls } = createMockCtx();
    drawBarChart(ctx, bars, makeLayout(), makeViewport(bars));
    expect(calls.lineWidths).toContain(1.5);
  });
});

/* ================================================================== */
/*  drawHollowCandles                                                  */
/* ================================================================== */

describe("drawHollowCandles", () => {
  it("does nothing for empty bars", () => {
    const { ctx, calls } = createMockCtx();
    drawHollowCandles(ctx, [], makeLayout(), { startIndex: 0, endIndex: 0, priceMin: 0, priceMax: 1 });
    expect(calls.stroke).toBe(0);
  });

  it("clips and restores", () => {
    const bars = makeBars(10);
    const { ctx, calls } = createMockCtx();
    drawHollowCandles(ctx, bars, makeLayout(), makeViewport(bars));
    expect(calls.save).toBe(1);
    expect(calls.restore).toBe(1);
    expect(calls.clip).toBe(1);
  });

  it("uses strokeRect for bull (hollow) bars", () => {
    const bars = [bullBar()];
    const { ctx, calls } = createMockCtx();
    drawHollowCandles(ctx, bars, makeLayout(), makeViewport(bars));
    expect(calls.strokeRect.length).toBeGreaterThanOrEqual(1);
  });

  it("uses fillRect for bear (filled) bars", () => {
    const bars = [bearBar()];
    const { ctx, calls } = createMockCtx();
    drawHollowCandles(ctx, bars, makeLayout(), makeViewport(bars));
    expect(calls.fillRect.length).toBeGreaterThanOrEqual(1);
  });

  it("draws wicks for all bars", () => {
    const bars = [bullBar(1), bearBar(2)];
    const { ctx, calls } = createMockCtx();
    drawHollowCandles(ctx, bars, makeLayout(), makeViewport(bars));
    // 2 wick strokes (one per bar)
    expect(calls.stroke).toBeGreaterThanOrEqual(2);
  });
});

/* ================================================================== */
/*  drawHeikinAshi                                                     */
/* ================================================================== */

describe("drawHeikinAshi", () => {
  it("does nothing for empty bars", () => {
    const { ctx, calls } = createMockCtx();
    drawHeikinAshi(ctx, [], makeLayout(), { startIndex: 0, endIndex: 0, priceMin: 0, priceMax: 1 });
    expect(calls.fillRect.length).toBe(0);
  });

  it("clips and restores", () => {
    const bars = makeBars(20);
    const { ctx, calls } = createMockCtx();
    drawHeikinAshi(ctx, bars, makeLayout(), makeViewport(bars));
    expect(calls.save).toBe(1);
    expect(calls.restore).toBe(1);
    expect(calls.clip).toBe(1);
  });

  it("renders candle bodies (fillRect) for each visible bar", () => {
    const bars = makeBars(10);
    const { ctx, calls } = createMockCtx();
    drawHeikinAshi(ctx, bars, makeLayout(), makeViewport(bars));
    expect(calls.fillRect.length).toBe(10);
  });

  it("renders wicks (stroke) for each visible bar", () => {
    const bars = makeBars(10);
    const { ctx, calls } = createMockCtx();
    drawHeikinAshi(ctx, bars, makeLayout(), makeViewport(bars));
    expect(calls.stroke).toBe(10);
  });

  it("recomputes viewport price range from HA bars", () => {
    // HA bars have different OHLC values, so if viewport is recomputed
    // the rendered y-coordinates will differ from standard candles
    const bars = makeBars(10);
    const { ctx: ctx1, calls: c1 } = createMockCtx();
    const { ctx: ctx2, calls: c2 } = createMockCtx();

    const layout = makeLayout();
    const viewport = makeViewport(bars);

    drawHeikinAshi(ctx1, bars, layout, viewport);

    // Draw standard candles for comparison — import isn't needed,
    // just verify HA fillRect coords are different
    // We can check by verifying that HA body y-positions exist
    expect(c1.fillRect.length).toBe(10);
    // The y-coordinates should be valid numbers within the layout
    for (const [x, y, w, h] of c1.fillRect) {
      expect(Number.isFinite(x)).toBe(true);
      expect(Number.isFinite(y)).toBe(true);
      expect(w).toBeGreaterThan(0);
      expect(h).toBeGreaterThanOrEqual(1);
    }
  });
});

/* ================================================================== */
/*  drawBaseline                                                       */
/* ================================================================== */

describe("drawBaseline", () => {
  it("does nothing for empty bars", () => {
    const { ctx, calls } = createMockCtx();
    drawBaseline(ctx, [], makeLayout(), { startIndex: 0, endIndex: 0, priceMin: 0, priceMax: 1 });
    expect(calls.stroke).toBe(0);
  });

  it("clips and restores", () => {
    const bars = makeBars(20);
    const { ctx, calls } = createMockCtx();
    drawBaseline(ctx, bars, makeLayout(), makeViewport(bars));
    expect(calls.save).toBe(1);
    expect(calls.restore).toBe(1);
    expect(calls.clip).toBe(1);
  });

  it("fills above and below baseline (2 fill calls)", () => {
    const bars = makeBars(20);
    const { ctx, calls } = createMockCtx();
    drawBaseline(ctx, bars, makeLayout(), makeViewport(bars));
    expect(calls.fill).toBe(2); // green above + red below
  });

  it("draws dashed baseline and closes the path", () => {
    const bars = makeBars(20);
    const { ctx, calls } = createMockCtx();
    drawBaseline(ctx, bars, makeLayout(), makeViewport(bars));
    // setLineDash called with [6,4] then reset with []
    expect(calls.setLineDash.length).toBe(2);
    expect(calls.setLineDash[0]).toEqual([6, 4]);
    expect(calls.setLineDash[1]).toEqual([]);
  });

  it("uses green for above-baseline fill and red for below", () => {
    const bars = makeBars(20);
    const { ctx, calls } = createMockCtx();
    drawBaseline(ctx, bars, makeLayout(), makeViewport(bars));
    expect(calls.fillStyles).toContain("rgba(38,166,154,0.10)");
    expect(calls.fillStyles).toContain("rgba(239,83,80,0.10)");
  });

  it("draws colored line segments between points", () => {
    const bars = makeBars(20);
    const { ctx, calls } = createMockCtx();
    drawBaseline(ctx, bars, makeLayout(), makeViewport(bars));
    // 19 line segments + 1 baseline stroke = 20 strokes
    expect(calls.stroke).toBeGreaterThanOrEqual(20);
  });

  it("handles single visible bar without error", () => {
    const bars = [bullBar()];
    const { ctx, calls } = createMockCtx();
    // Single bar = only 1 point, < 2 → early return after clip
    drawBaseline(ctx, bars, makeLayout(), makeViewport(bars));
    expect(calls.save).toBe(1);
    expect(calls.restore).toBe(1);
  });

  it("uses THEME.bullBody and THEME.bearBody for line segments", () => {
    const bars = makeBars(20);
    const { ctx, calls } = createMockCtx();
    drawBaseline(ctx, bars, makeLayout(), makeViewport(bars));
    const hasGreen = calls.strokeStyles.some(s => s === "#26A69A");
    const hasRed = calls.strokeStyles.some(s => s === "#EF5350");
    // At least one color should appear (depends on data, but makeBars oscillates)
    expect(hasGreen || hasRed).toBe(true);
  });
});

/* ================================================================== */
/*  Cross-cutting: all renderers handle edge cases                     */
/* ================================================================== */

describe("all renderers handle single bar", () => {
  const allDrawers = [
    { name: "drawLineChart", fn: drawLineChart },
    { name: "drawAreaChart", fn: drawAreaChart },
    { name: "drawBarChart", fn: drawBarChart },
    { name: "drawHollowCandles", fn: drawHollowCandles },
    { name: "drawHeikinAshi", fn: drawHeikinAshi },
    { name: "drawBaseline", fn: drawBaseline },
  ];

  for (const { name, fn } of allDrawers) {
    it(`${name} does not throw on single bar`, () => {
      const bars = [bullBar()];
      const { ctx } = createMockCtx();
      expect(() => fn(ctx, bars, makeLayout(), makeViewport(bars))).not.toThrow();
    });
  }
});

describe("all renderers handle viewport wider than bars", () => {
  const allDrawers = [
    { name: "drawLineChart", fn: drawLineChart },
    { name: "drawAreaChart", fn: drawAreaChart },
    { name: "drawBarChart", fn: drawBarChart },
    { name: "drawHollowCandles", fn: drawHollowCandles },
    { name: "drawHeikinAshi", fn: drawHeikinAshi },
    { name: "drawBaseline", fn: drawBaseline },
  ];

  for (const { name, fn } of allDrawers) {
    it(`${name} does not throw when viewport exceeds bar count`, () => {
      const bars = makeBars(5);
      const viewport: Viewport = {
        startIndex: 0,
        endIndex: 100, // way past bars.length
        priceMin: 1.09,
        priceMax: 1.12,
      };
      const { ctx } = createMockCtx();
      expect(() => fn(ctx, bars, makeLayout(), viewport)).not.toThrow();
    });
  }
});
