/**
 * priceLine.test.ts -- Tests for drawCurrentPriceLine and drawOHLCLegend
 */

import { drawCurrentPriceLine, drawOHLCLegend } from "@/components/chart/renderers/priceLine";
import type { Bar } from "@/components/chart/indicators/types";
import type { ChartLayout, Viewport } from "@/components/chart/core/data";
import { computeLayout, computeViewport } from "@/components/chart/core/data";
import { THEME } from "@/components/chart/core/theme";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function makeBars(count: number, base = 1.1): Bar[] {
  return Array.from({ length: count }, (_, i) => ({
    t: 1_700_000_000 + i * 3600,
    o: base + i * 0.001,
    h: base + i * 0.001 + 0.005,
    l: base + i * 0.001 - 0.003,
    c: base + (i + 0.5) * 0.001,
    v: 10_000 + i * 1_000,
  }));
}

/** Create a minimal canvas-like mock that tracks calls. */
function mockCtx() {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const proxy = new Proxy(
    {
      // Track all method calls
      save: () => {},
      restore: () => {},
      beginPath: () => {},
      closePath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {},
      fill: () => {},
      fillRect: () => {},
      fillText: () => {},
      setLineDash: () => {},
      measureText: (text: string) => ({ width: text.length * 7 }),
      // Settable properties
      strokeStyle: "",
      fillStyle: "",
      lineWidth: 1,
      globalAlpha: 1,
      font: "",
      textAlign: "left" as CanvasTextAlign,
      textBaseline: "top" as CanvasTextBaseline,
    },
    {
      get(target, prop, receiver) {
        const val = Reflect.get(target, prop, receiver);
        if (typeof val === "function") {
          return (...args: unknown[]) => {
            calls.push({ method: prop as string, args });
            return (val as Function).apply(target, args);
          };
        }
        return val;
      },
      set(target, prop, value) {
        calls.push({ method: `set:${String(prop)}`, args: [value] });
        return Reflect.set(target, prop, value);
      },
    },
  );
  return { ctx: proxy as unknown as CanvasRenderingContext2D, calls };
}

function defaultLayout(): ChartLayout {
  return computeLayout(1200, 600, 0);
}

function defaultViewport(bars: Bar[]): Viewport {
  return computeViewport(bars, 0, bars.length - 1);
}

/* ================================================================== */
/* drawCurrentPriceLine                                                */
/* ================================================================== */

describe("drawCurrentPriceLine", () => {
  it("does nothing with empty bars", () => {
    const { ctx, calls } = mockCtx();
    drawCurrentPriceLine(ctx, [], defaultLayout(), { startIndex: 0, endIndex: 0, priceMin: 0, priceMax: 1 }, "EUR/USD");
    // Only property sets from proxy, no drawing calls
    const drawCalls = calls.filter((c) => ["stroke", "fill", "fillRect", "fillText"].includes(c.method));
    expect(drawCalls).toHaveLength(0);
  });

  it("draws a dashed horizontal line", () => {
    const bars = makeBars(50);
    const { ctx, calls } = mockCtx();
    const layout = defaultLayout();
    const vp = defaultViewport(bars);
    drawCurrentPriceLine(ctx, bars, layout, vp, "EUR/USD");

    const dashCalls = calls.filter((c) => c.method === "setLineDash");
    expect(dashCalls.length).toBeGreaterThanOrEqual(1);
    // First setLineDash should be the dashed pattern [6,3]
    expect(dashCalls[0].args[0]).toEqual([6, 3]);

    // Should have at least one stroke call for the line
    const strokeCalls = calls.filter((c) => c.method === "stroke");
    expect(strokeCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("uses bull color when close >= previous close", () => {
    const bars: Bar[] = [
      { t: 1000, o: 1.1, h: 1.12, l: 1.08, c: 1.09, v: 1000 },
      { t: 2000, o: 1.09, h: 1.13, l: 1.08, c: 1.11, v: 1000 },
    ];
    const { ctx, calls } = mockCtx();
    const layout = defaultLayout();
    const vp = computeViewport(bars, 0, 1);
    drawCurrentPriceLine(ctx, bars, layout, vp, "EUR/USD");

    // strokeStyle should be set to bull color
    const strokeSets = calls.filter(
      (c) => c.method === "set:strokeStyle" && c.args[0] === THEME.bullBody,
    );
    expect(strokeSets.length).toBeGreaterThanOrEqual(1);
  });

  it("uses bear color when close < previous close", () => {
    const bars: Bar[] = [
      { t: 1000, o: 1.1, h: 1.12, l: 1.08, c: 1.11, v: 1000 },
      { t: 2000, o: 1.11, h: 1.13, l: 1.08, c: 1.09, v: 1000 },
    ];
    const { ctx, calls } = mockCtx();
    const layout = defaultLayout();
    const vp = computeViewport(bars, 0, 1);
    drawCurrentPriceLine(ctx, bars, layout, vp, "EUR/USD");

    const strokeSets = calls.filter(
      (c) => c.method === "set:strokeStyle" && c.args[0] === THEME.bearBody,
    );
    expect(strokeSets.length).toBeGreaterThanOrEqual(1);
  });

  it("draws a label with price text in the axis gutter", () => {
    const bars = makeBars(10);
    const { ctx, calls } = mockCtx();
    const layout = defaultLayout();
    const vp = defaultViewport(bars);
    drawCurrentPriceLine(ctx, bars, layout, vp, "EUR/USD");

    // Should have fillText calls (price label)
    const textCalls = calls.filter((c) => c.method === "fillText");
    expect(textCalls.length).toBeGreaterThanOrEqual(1);
    // The text should be a formatted price string
    const priceText = textCalls[0].args[0] as string;
    expect(priceText).toMatch(/^\d+\.\d+$/);
  });

  it("draws left-pointing arrow (triangle)", () => {
    const bars = makeBars(10);
    const { ctx, calls } = mockCtx();
    const layout = defaultLayout();
    const vp = defaultViewport(bars);
    drawCurrentPriceLine(ctx, bars, layout, vp, "EUR/USD");

    // Arrow is drawn with moveTo/lineTo/lineTo/closePath/fill
    const closePathCalls = calls.filter((c) => c.method === "closePath");
    expect(closePathCalls.length).toBeGreaterThanOrEqual(1);
    const fillCalls = calls.filter((c) => c.method === "fill");
    expect(fillCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("sets globalAlpha for pulse animation", () => {
    const bars = makeBars(10);
    const { ctx, calls } = mockCtx();
    const layout = defaultLayout();
    const vp = defaultViewport(bars);
    drawCurrentPriceLine(ctx, bars, layout, vp, "EUR/USD");

    const alphaSets = calls.filter((c) => c.method === "set:globalAlpha");
    // Should set alpha to animated value and then back to 1.0
    expect(alphaSets.length).toBeGreaterThanOrEqual(2);
    const animatedAlpha = alphaSets[0].args[0] as number;
    expect(animatedAlpha).toBeGreaterThanOrEqual(0.85);
    expect(animatedAlpha).toBeLessThanOrEqual(1.0);
    // Final restore to 1.0
    const lastAlpha = alphaSets[alphaSets.length - 1].args[0] as number;
    expect(lastAlpha).toBe(1.0);
  });

  it("skips drawing when price is above visible range", () => {
    const bars: Bar[] = [{ t: 1000, o: 100, h: 110, l: 90, c: 105, v: 1000 }];
    const { ctx, calls } = mockCtx();
    const layout = defaultLayout();
    // Viewport with very low price range so last bar's close is way above
    const vp: Viewport = { startIndex: 0, endIndex: 0, priceMin: 0.5, priceMax: 1.0 };
    drawCurrentPriceLine(ctx, bars, layout, vp, "EUR/USD");

    const strokeCalls = calls.filter((c) => c.method === "stroke");
    expect(strokeCalls).toHaveLength(0);
  });

  it("handles single-bar array (uses same bar as prev)", () => {
    const bars: Bar[] = [{ t: 1000, o: 1.1, h: 1.12, l: 1.08, c: 1.11, v: 1000 }];
    const { ctx, calls } = mockCtx();
    const layout = defaultLayout();
    const vp = computeViewport(bars, 0, 0);
    drawCurrentPriceLine(ctx, bars, layout, vp, "EUR/USD");

    // Should still draw (uses lastBar as prevBar fallback)
    const strokeCalls = calls.filter((c) => c.method === "stroke");
    expect(strokeCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("uses JPY formatting for JPY pairs", () => {
    const bars: Bar[] = [
      { t: 1000, o: 150.0, h: 151.0, l: 149.0, c: 150.5, v: 1000 },
      { t: 2000, o: 150.5, h: 152.0, l: 150.0, c: 151.2, v: 1000 },
    ];
    const { ctx, calls } = mockCtx();
    const layout = defaultLayout();
    const vp = computeViewport(bars, 0, 1);
    drawCurrentPriceLine(ctx, bars, layout, vp, "USD/JPY");

    const textCalls = calls.filter((c) => c.method === "fillText");
    expect(textCalls.length).toBeGreaterThanOrEqual(1);
    const priceText = textCalls[0].args[0] as string;
    // JPY pair: 3 decimal places
    expect(priceText).toMatch(/^\d+\.\d{3}$/);
  });
});

/* ================================================================== */
/* drawOHLCLegend                                                      */
/* ================================================================== */

describe("drawOHLCLegend", () => {
  it("does nothing with empty bars", () => {
    const { ctx, calls } = mockCtx();
    drawOHLCLegend(ctx, [], defaultLayout(), { startIndex: 0, endIndex: 0, priceMin: 0, priceMax: 1 }, "EUR/USD", -1);
    const textCalls = calls.filter((c) => c.method === "fillText");
    expect(textCalls).toHaveLength(0);
  });

  it("displays last bar when hoveredIndex is -1", () => {
    const bars = makeBars(20);
    const { ctx, calls } = mockCtx();
    const layout = defaultLayout();
    const vp = defaultViewport(bars);
    drawOHLCLegend(ctx, bars, layout, vp, "EUR/USD", -1);

    const textCalls = calls.filter((c) => c.method === "fillText");
    // Should have O, H, L, C labels/values + Vol + change% = at least 11 fillText calls
    expect(textCalls.length).toBeGreaterThanOrEqual(11);

    // Verify last bar's open is in the output
    const lastBar = bars[bars.length - 1];
    const openStr = lastBar.o.toFixed(5);
    const hasOpen = textCalls.some((c) => (c.args[0] as string) === openStr);
    expect(hasOpen).toBe(true);
  });

  it("displays hovered bar when hoveredIndex is valid", () => {
    const bars = makeBars(20);
    const { ctx, calls } = mockCtx();
    const layout = defaultLayout();
    const vp = defaultViewport(bars);
    drawOHLCLegend(ctx, bars, layout, vp, "EUR/USD", 5);

    const textCalls = calls.filter((c) => c.method === "fillText");
    const bar5 = bars[5];
    const openStr = bar5.o.toFixed(5);
    const hasOpen = textCalls.some((c) => (c.args[0] as string) === openStr);
    expect(hasOpen).toBe(true);
  });

  it("falls back to last bar when hoveredIndex is out of range", () => {
    const bars = makeBars(10);
    const { ctx, calls } = mockCtx();
    const layout = defaultLayout();
    const vp = defaultViewport(bars);
    drawOHLCLegend(ctx, bars, layout, vp, "EUR/USD", 999);

    const textCalls = calls.filter((c) => c.method === "fillText");
    const lastBar = bars[bars.length - 1];
    const openStr = lastBar.o.toFixed(5);
    const hasOpen = textCalls.some((c) => (c.args[0] as string) === openStr);
    expect(hasOpen).toBe(true);
  });

  it("renders OHLC labels in muted axisText color", () => {
    const bars = makeBars(5);
    const { ctx, calls } = mockCtx();
    const layout = defaultLayout();
    const vp = defaultViewport(bars);
    drawOHLCLegend(ctx, bars, layout, vp, "EUR/USD", -1);

    // The labels "O ", "H ", "L ", "C ", "Vol " should use axisText color
    const axisColorSets = calls.filter(
      (c) => c.method === "set:fillStyle" && c.args[0] === THEME.axisText,
    );
    // 5 labels: O, H, L, C, Vol
    expect(axisColorSets.length).toBe(5);
  });

  it("renders values in #D1D4DC", () => {
    const bars = makeBars(5);
    const { ctx, calls } = mockCtx();
    const layout = defaultLayout();
    const vp = defaultViewport(bars);
    drawOHLCLegend(ctx, bars, layout, vp, "EUR/USD", -1);

    const valueSets = calls.filter(
      (c) => c.method === "set:fillStyle" && c.args[0] === "#D1D4DC",
    );
    // 5 values: O, H, L, C, Vol
    expect(valueSets.length).toBe(5);
  });

  it("shows green change% for bullish bar", () => {
    const bars: Bar[] = [{ t: 1000, o: 1.1, h: 1.15, l: 1.09, c: 1.12, v: 5000 }];
    const { ctx, calls } = mockCtx();
    const layout = defaultLayout();
    const vp = computeViewport(bars, 0, 0);
    drawOHLCLegend(ctx, bars, layout, vp, "EUR/USD", -1);

    // Last fillText call should be the change percentage
    const textCalls = calls.filter((c) => c.method === "fillText");
    const changePctCall = textCalls[textCalls.length - 1];
    expect((changePctCall.args[0] as string).startsWith("+")).toBe(true);

    // The fillStyle before the last fillText should be bullBody
    const fillSets = calls.filter((c) => c.method === "set:fillStyle");
    const lastFillSet = fillSets[fillSets.length - 1];
    expect(lastFillSet.args[0]).toBe(THEME.bullBody);
  });

  it("shows red change% for bearish bar", () => {
    const bars: Bar[] = [{ t: 1000, o: 1.15, h: 1.16, l: 1.08, c: 1.1, v: 5000 }];
    const { ctx, calls } = mockCtx();
    const layout = defaultLayout();
    const vp = computeViewport(bars, 0, 0);
    drawOHLCLegend(ctx, bars, layout, vp, "EUR/USD", -1);

    const textCalls = calls.filter((c) => c.method === "fillText");
    const changePctCall = textCalls[textCalls.length - 1];
    expect((changePctCall.args[0] as string).startsWith("-")).toBe(true);

    const fillSets = calls.filter((c) => c.method === "set:fillStyle");
    const lastFillSet = fillSets[fillSets.length - 1];
    expect(lastFillSet.args[0]).toBe(THEME.bearBody);
  });

  it("formats volume with M suffix for millions", () => {
    const bars: Bar[] = [{ t: 1000, o: 1.1, h: 1.15, l: 1.09, c: 1.12, v: 2_500_000 }];
    const { ctx, calls } = mockCtx();
    const layout = defaultLayout();
    const vp = computeViewport(bars, 0, 0);
    drawOHLCLegend(ctx, bars, layout, vp, "EUR/USD", -1);

    const textCalls = calls.filter((c) => c.method === "fillText");
    const volText = textCalls.find((c) => (c.args[0] as string).includes("M"));
    expect(volText).toBeDefined();
    expect((volText!.args[0] as string)).toBe("2.5M");
  });

  it("formats volume with K suffix for thousands", () => {
    const bars: Bar[] = [{ t: 1000, o: 1.1, h: 1.15, l: 1.09, c: 1.12, v: 45_000 }];
    const { ctx, calls } = mockCtx();
    const layout = defaultLayout();
    const vp = computeViewport(bars, 0, 0);
    drawOHLCLegend(ctx, bars, layout, vp, "EUR/USD", -1);

    const textCalls = calls.filter((c) => c.method === "fillText");
    const volText = textCalls.find((c) => (c.args[0] as string).includes("K"));
    expect(volText).toBeDefined();
    expect((volText!.args[0] as string)).toBe("45.0K");
  });

  it("formats volume with B suffix for billions", () => {
    const bars: Bar[] = [{ t: 1000, o: 1.1, h: 1.15, l: 1.09, c: 1.12, v: 3_200_000_000 }];
    const { ctx, calls } = mockCtx();
    const layout = defaultLayout();
    const vp = computeViewport(bars, 0, 0);
    drawOHLCLegend(ctx, bars, layout, vp, "EUR/USD", -1);

    const textCalls = calls.filter((c) => c.method === "fillText");
    const volText = textCalls.find((c) => (c.args[0] as string).includes("B"));
    expect(volText).toBeDefined();
    expect((volText!.args[0] as string)).toBe("3.2B");
  });

  it("positions legend at chartLeft+8, mainTop+16", () => {
    const bars = makeBars(5);
    const { ctx, calls } = mockCtx();
    const layout = defaultLayout();
    const vp = defaultViewport(bars);
    drawOHLCLegend(ctx, bars, layout, vp, "EUR/USD", -1);

    // First fillText call should be the "O " label at (chartLeft+8, mainTop+16)
    const textCalls = calls.filter((c) => c.method === "fillText");
    expect(textCalls.length).toBeGreaterThan(0);
    const firstCall = textCalls[0];
    expect(firstCall.args[1]).toBe(layout.chartLeft + 8); // x
    expect(firstCall.args[2]).toBe(layout.mainTop + 16); // y
  });

  it("uses 11px IBM Plex Mono font", () => {
    const bars = makeBars(5);
    const { ctx, calls } = mockCtx();
    const layout = defaultLayout();
    const vp = defaultViewport(bars);
    drawOHLCLegend(ctx, bars, layout, vp, "EUR/USD", -1);

    const fontSets = calls.filter((c) => c.method === "set:font");
    expect(fontSets.length).toBeGreaterThanOrEqual(1);
    expect(fontSets[0].args[0]).toBe("11px 'IBM Plex Mono', monospace");
  });
});
