/**
 * drawingToolsExtended.test.ts -- Tests for extended drawing tools:
 * getPointsRequired, new DrawingType colors, new Drawing properties,
 * hitTestGenericDrawing, and createDrawing defaults for new fields.
 */

import {
  createDrawing,
  getDefaultColor,
  getPointsRequired,
  hitTestDrawings,
  loadDrawings,
  saveDrawings,
  DEFAULT_STATS,
} from "@/components/chart/renderers/drawings";
import type { Drawing, DrawingType } from "@/components/chart/renderers/drawings";
import { hitTestGenericDrawing } from "@/components/chart/renderers/drawingTools";
import type { ChartLayout, Viewport } from "@/components/chart/core/data";

// ── Mock localStorage ──
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

// ── Helpers ──
function makeLayout(): ChartLayout {
  return {
    chartLeft: 10,
    chartRight: 810,
    chartWidth: 800,
    canvasWidth: 900,
    canvasHeight: 520,
    mainTop: 4,
    mainHeight: 400,
    volumeTop: 404,
    volumeHeight: 80,
    priceAxisWidth: 80,
    timeAxisHeight: 28,
    subPanes: [],
    subPaneTop: 484,
    subPaneHeight: 0,
  } as ChartLayout;
}

function makeViewport(start = 0, end = 100, pMin = 1.0, pMax = 1.5): Viewport {
  return { startIndex: start, endIndex: end, priceMin: pMin, priceMax: pMax };
}

function idx2px(idx: number, layout: ChartLayout, viewport: Viewport): number {
  return layout.chartLeft + ((idx - viewport.startIndex) / (viewport.endIndex - viewport.startIndex)) * layout.chartWidth;
}

function price2px(price: number, layout: ChartLayout, viewport: Viewport): number {
  return layout.mainTop + layout.mainHeight - ((price - viewport.priceMin) / (viewport.priceMax - viewport.priceMin)) * layout.mainHeight;
}

// ═══════════════════════════════════════════════════════
//  1. getPointsRequired
// ═══════════════════════════════════════════════════════

describe("getPointsRequired", () => {
  it("returns 1 for single-point tools", () => {
    const singlePt: DrawingType[] = [
      "horizontal", "vertical_line", "cross_line", "horizontal_ray",
      "text_note", "anchored_text", "price_label",
      "arrow_marker_up", "arrow_marker_down", "flag_mark",
    ];
    for (const t of singlePt) {
      expect(getPointsRequired(t)).toBe(1);
    }
  });

  it("returns 2 for two-point tools", () => {
    const twoPt: DrawingType[] = [
      "trendline", "ray", "extended_line", "info_line", "trend_angle",
      "fibonacci", "rectangle", "circle", "ellipse",
      "date_range", "price_range", "date_price_range",
      "gann_box", "gann_fan", "fib_time_zone", "fib_speed_fan",
      "long_position", "short_position", "regression_trend",
    ];
    for (const t of twoPt) {
      expect(getPointsRequired(t)).toBe(2);
    }
  });

  it("returns 3 for three-point tools", () => {
    const threePt: DrawingType[] = [
      "parallel_channel", "flat_top_bottom",
      "pitchfork", "schiff_pitchfork", "mod_schiff_pitchfork", "inside_pitchfork",
      "fib_extension", "fib_channel",
      "callout", "triangle_shape", "arc", "forecast",
    ];
    for (const t of threePt) {
      expect(getPointsRequired(t)).toBe(3);
    }
  });

  it("returns 4 for four-point tools", () => {
    expect(getPointsRequired("abcd_pattern")).toBe(4);
    expect(getPointsRequired("elliott_correction")).toBe(4);
    expect(getPointsRequired("disjoint_channel")).toBe(4);
  });

  it("returns 5 for five-point tools", () => {
    expect(getPointsRequired("xabcd_pattern")).toBe(5);
    expect(getPointsRequired("cypher_pattern")).toBe(5);
    expect(getPointsRequired("triangle_pattern")).toBe(5);
  });

  it("returns 6 for six-point tools", () => {
    expect(getPointsRequired("elliott_impulse")).toBe(6);
    expect(getPointsRequired("head_shoulders")).toBe(6);
    expect(getPointsRequired("elliott_triangle")).toBe(6);
  });

  it("returns 7 for three_drives", () => {
    expect(getPointsRequired("three_drives")).toBe(7);
  });

  it("returns -1 for variable-point tools", () => {
    expect(getPointsRequired("brush")).toBe(-1);
    expect(getPointsRequired("polyline")).toBe(-1);
    expect(getPointsRequired("arrow_drawing")).toBe(-1);
  });
});

// ═══════════════════════════════════════════════════════
//  2. New DrawingType colors
// ═══════════════════════════════════════════════════════

describe("getDefaultColor for new types", () => {
  it("returns correct color for line tools", () => {
    expect(getDefaultColor("ray")).toBe("#2962FF");
    expect(getDefaultColor("extended_line")).toBe("#2962FF");
    expect(getDefaultColor("horizontal_ray")).toBe("#FF9800");
    expect(getDefaultColor("vertical_line")).toBe("#787B86");
    expect(getDefaultColor("cross_line")).toBe("#787B86");
    expect(getDefaultColor("info_line")).toBe("#26A69A");
    expect(getDefaultColor("trend_angle")).toBe("#FF6D00");
  });

  it("returns correct color for channel tools", () => {
    expect(getDefaultColor("parallel_channel")).toBe("#2962FF");
    expect(getDefaultColor("regression_trend")).toBe("#9C27B0");
    expect(getDefaultColor("flat_top_bottom")).toBe("#FF9800");
    expect(getDefaultColor("disjoint_channel")).toBe("#00BCD4");
    expect(getDefaultColor("pitchfork")).toBe("#2962FF");
    expect(getDefaultColor("schiff_pitchfork")).toBe("#2962FF");
  });

  it("returns correct color for fibonacci tools", () => {
    expect(getDefaultColor("fib_extension")).toBe("#9C27B0");
    expect(getDefaultColor("fib_channel")).toBe("#9C27B0");
    expect(getDefaultColor("fib_time_zone")).toBe("#9C27B0");
    expect(getDefaultColor("fib_speed_fan")).toBe("#9C27B0");
  });

  it("returns correct color for gann tools", () => {
    expect(getDefaultColor("gann_box")).toBe("#FF6D00");
    expect(getDefaultColor("gann_fan")).toBe("#FF6D00");
  });

  it("returns correct color for pattern tools", () => {
    expect(getDefaultColor("xabcd_pattern")).toBe("#00BCD4");
    expect(getDefaultColor("head_shoulders")).toBe("#E91E63");
    expect(getDefaultColor("elliott_impulse")).toBe("#26A69A");
    expect(getDefaultColor("elliott_correction")).toBe("#EF5350");
  });

  it("returns correct color for shape tools", () => {
    expect(getDefaultColor("circle")).toBe("#2962FF");
    expect(getDefaultColor("ellipse")).toBe("#2962FF");
    expect(getDefaultColor("brush")).toBe("#FFEB3B");
    expect(getDefaultColor("arc")).toBe("#9C27B0");
  });

  it("returns correct color for measurement tools", () => {
    expect(getDefaultColor("long_position")).toBe("#26A69A");
    expect(getDefaultColor("short_position")).toBe("#EF5350");
    expect(getDefaultColor("date_range")).toBe("#787B86");
    expect(getDefaultColor("forecast")).toBe("#2962FF");
  });

  it("returns correct color for annotation tools", () => {
    expect(getDefaultColor("text_note")).toBe("#D1D4DC");
    expect(getDefaultColor("callout")).toBe("#FFEB3B");
    expect(getDefaultColor("arrow_marker_up")).toBe("#26A69A");
    expect(getDefaultColor("arrow_marker_down")).toBe("#EF5350");
    expect(getDefaultColor("flag_mark")).toBe("#FF9800");
  });
});

// ═══════════════════════════════════════════════════════
//  3. createDrawing new default fields
// ═══════════════════════════════════════════════════════

describe("createDrawing new default fields", () => {
  it("includes channel defaults", () => {
    const d = createDrawing("parallel_channel", [
      { index: 0, price: 1.0 },
      { index: 10, price: 1.1 },
      { index: 5, price: 1.05 },
    ]);
    expect(d.channelFillEnabled).toBe(false);
    expect(d.channelFillOpacity).toBe(0.15);
    expect(d.channelFillColor).toBe("");
  });

  it("includes text/annotation defaults", () => {
    const d = createDrawing("text_note", [{ index: 5, price: 1.1 }]);
    expect(d.text).toBe("");
    expect(d.fontSize).toBe(14);
    expect(d.fontBold).toBe(false);
    expect(d.fontItalic).toBe(false);
    expect(d.backgroundColor).toBe("");
    expect(d.borderRadius).toBe(4);
  });

  it("includes brush defaults", () => {
    const d = createDrawing("brush", [{ index: 0, price: 1.0 }]);
    expect(d.brushSize).toBe(2);
  });

  it("allows overriding new fields", () => {
    const d = createDrawing("text_note", [{ index: 5, price: 1.1 }], {
      text: "Hello",
      fontSize: 18,
      fontBold: true,
      backgroundColor: "#FF0000",
    });
    expect(d.text).toBe("Hello");
    expect(d.fontSize).toBe(18);
    expect(d.fontBold).toBe(true);
    expect(d.backgroundColor).toBe("#FF0000");
  });

  it("creates new types with correct default color", () => {
    const d = createDrawing("ray", [
      { index: 0, price: 1.0 },
      { index: 10, price: 1.1 },
    ]);
    expect(d.type).toBe("ray");
    expect(d.color).toBe("#2962FF");
  });
});

// ═══════════════════════════════════════════════════════
//  4. hitTestDrawings default case dispatches to generic
// ═══════════════════════════════════════════════════════

describe("hitTestDrawings with new types", () => {
  const layout = makeLayout();
  const viewport = makeViewport(0, 100, 1.0, 1.5);

  it("hits a ray drawing at its midpoint", () => {
    const d = createDrawing("ray", [
      { index: 10, price: 1.1 },
      { index: 50, price: 1.3 },
    ]);
    const midIdx = 30;
    const midPrice = 1.2;
    const mx = idx2px(midIdx, layout, viewport);
    const my = price2px(midPrice, layout, viewport);
    const result = hitTestDrawings(mx, my, [d], layout, viewport);
    expect(result).not.toBeNull();
    expect(result!.drawingId).toBe(d.id);
  });

  it("hits a vertical_line drawing", () => {
    const d = createDrawing("vertical_line", [{ index: 50, price: 1.2 }]);
    const x = idx2px(50, layout, viewport);
    const y = price2px(1.3, layout, viewport);
    const result = hitTestDrawings(x, y, [d], layout, viewport);
    expect(result).not.toBeNull();
    expect(result!.drawingId).toBe(d.id);
  });

  it("hits a cross_line drawing on horizontal", () => {
    const d = createDrawing("cross_line", [{ index: 50, price: 1.2 }]);
    const y = price2px(1.2, layout, viewport);
    const result = hitTestDrawings(100, y, [d], layout, viewport);
    expect(result).not.toBeNull();
    expect(result!.drawingId).toBe(d.id);
  });

  it("hits a cross_line drawing on vertical", () => {
    const d = createDrawing("cross_line", [{ index: 50, price: 1.2 }]);
    const x = idx2px(50, layout, viewport);
    const result = hitTestDrawings(x, 200, [d], layout, viewport);
    expect(result).not.toBeNull();
    expect(result!.drawingId).toBe(d.id);
  });

  it("hits an arrow_marker_up near point", () => {
    const d = createDrawing("arrow_marker_up", [{ index: 30, price: 1.2 }]);
    const x = idx2px(30, layout, viewport);
    const y = price2px(1.2, layout, viewport);
    const result = hitTestDrawings(x + 2, y + 2, [d], layout, viewport);
    expect(result).not.toBeNull();
    expect(result!.drawingId).toBe(d.id);
  });

  it("hits a flag_mark near point", () => {
    const d = createDrawing("flag_mark", [{ index: 60, price: 1.3 }]);
    const x = idx2px(60, layout, viewport);
    const y = price2px(1.3, layout, viewport);
    const result = hitTestDrawings(x, y, [d], layout, viewport);
    expect(result).not.toBeNull();
    expect(result!.drawingId).toBe(d.id);
  });

  it("returns null when far from a new-type drawing", () => {
    const d = createDrawing("vertical_line", [{ index: 50, price: 1.2 }]);
    const result = hitTestDrawings(0, 0, [d], layout, viewport);
    expect(result).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════
//  5. hitTestGenericDrawing directly
// ═══════════════════════════════════════════════════════

describe("hitTestGenericDrawing", () => {
  const layout = makeLayout();
  const viewport = makeViewport(0, 100, 1.0, 1.5);

  it("handles handle hit for ray p0", () => {
    const d = createDrawing("ray", [
      { index: 10, price: 1.1 },
      { index: 50, price: 1.3 },
    ]);
    const x = idx2px(10, layout, viewport);
    const y = price2px(1.1, layout, viewport);
    const result = hitTestGenericDrawing(x, y, d, layout, viewport, "linear");
    expect(result).not.toBeNull();
    expect(result!.part).toBe("p0");
  });

  it("handles handle hit for ray p1", () => {
    const d = createDrawing("ray", [
      { index: 10, price: 1.1 },
      { index: 50, price: 1.3 },
    ]);
    const x = idx2px(50, layout, viewport);
    const y = price2px(1.3, layout, viewport);
    const result = hitTestGenericDrawing(x, y, d, layout, viewport, "linear");
    expect(result).not.toBeNull();
    expect(result!.part).toBe("p1");
  });

  it("hit tests circle edge", () => {
    const d = createDrawing("circle", [
      { index: 50, price: 1.25 },
      { index: 60, price: 1.25 },
    ]);
    // Test at the top of the circle (not at p1 which is on the right edge)
    const centerX = idx2px(50, layout, viewport);
    const centerY = price2px(1.25, layout, viewport);
    const edgeX = idx2px(60, layout, viewport);
    const radius = edgeX - centerX;
    const testX = centerX; // top of circle
    const testY = centerY - radius;
    const result = hitTestGenericDrawing(testX, testY, d, layout, viewport, "linear");
    expect(result).not.toBeNull();
    expect(result!.part).toBe("body");
  });

  it("hit tests ellipse edge", () => {
    const d = createDrawing("ellipse", [
      { index: 50, price: 1.25 },
      { index: 70, price: 1.35 },
    ]);
    // Test at horizontal edge: center_x + rx, center_y
    const cx = idx2px(50, layout, viewport);
    const ex = idx2px(70, layout, viewport);
    const testX = cx + Math.abs(ex - cx);
    const testY = price2px(1.25, layout, viewport);
    const result = hitTestGenericDrawing(testX, testY, d, layout, viewport, "linear");
    expect(result).not.toBeNull();
  });

  it("hit tests gann_box border", () => {
    const d = createDrawing("gann_box", [
      { index: 20, price: 1.1 },
      { index: 60, price: 1.3 },
    ]);
    const x = idx2px(20, layout, viewport);
    const y = price2px(1.2, layout, viewport);
    const result = hitTestGenericDrawing(x, y, d, layout, viewport, "linear");
    expect(result).not.toBeNull();
    expect(result!.part).toBe("body");
  });

  it("returns null for unknown type", () => {
    const d = createDrawing("trendline", [
      { index: 10, price: 1.1 },
      { index: 50, price: 1.3 },
    ]);
    // Force type to something unknown for coverage
    (d as any).type = "unknown_tool";
    const result = hitTestGenericDrawing(100, 200, d, layout, viewport, "linear");
    expect(result).toBeNull();
  });

  it("detects multi-segment pattern hit", () => {
    const d = createDrawing("abcd_pattern", [
      { index: 10, price: 1.1 },
      { index: 20, price: 1.3 },
      { index: 30, price: 1.2 },
      { index: 40, price: 1.4 },
    ]);
    // Hit near midpoint of first segment
    const mx = idx2px(15, layout, viewport);
    const my = price2px(1.2, layout, viewport);
    const result = hitTestGenericDrawing(mx, my, d, layout, viewport, "linear");
    expect(result).not.toBeNull();
    expect(result!.drawingId).toBe(d.id);
  });

  it("detects horizontal_ray hit to the right of start", () => {
    const d = createDrawing("horizontal_ray", [{ index: 30, price: 1.2 }]);
    const y = price2px(1.2, layout, viewport);
    const xRight = idx2px(60, layout, viewport);
    const result = hitTestGenericDrawing(xRight, y, d, layout, viewport, "linear");
    expect(result).not.toBeNull();
    expect(result!.part).toBe("body");
  });

  it("does not hit horizontal_ray to the left of start", () => {
    const d = createDrawing("horizontal_ray", [{ index: 50, price: 1.2 }]);
    const y = price2px(1.2, layout, viewport);
    const xLeft = idx2px(10, layout, viewport);
    const result = hitTestGenericDrawing(xLeft, y, d, layout, viewport, "linear");
    expect(result).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════
//  6. Persistence migration for new fields
// ═══════════════════════════════════════════════════════

describe("loadDrawings migration for new fields", () => {
  it("adds new defaults to old drawings", () => {
    const old = {
      id: "d_old_new",
      type: "ray",
      points: [{ index: 10, price: 1.1 }, { index: 50, price: 1.3 }],
      color: "#2962FF",
    };
    localStore["ordr_drawings_TEST"] = JSON.stringify([old]);
    const loaded = loadDrawings("TEST");
    expect(loaded).toHaveLength(1);
    expect(loaded[0].channelFillEnabled).toBe(false);
    expect(loaded[0].channelFillOpacity).toBe(0.15);
    expect(loaded[0].brushSize).toBe(2);
    expect(loaded[0].text).toBe("");
    expect(loaded[0].fontSize).toBe(14);
    expect(loaded[0].fontBold).toBe(false);
    expect(loaded[0].backgroundColor).toBe("");
    expect(loaded[0].borderRadius).toBe(4);
  });

  it("preserves explicitly set new fields", () => {
    const drawing = {
      id: "d_new_fields",
      type: "text_note",
      points: [{ index: 5, price: 1.1 }],
      color: "#D1D4DC",
      text: "Important",
      fontSize: 18,
      fontBold: true,
      backgroundColor: "#333",
    };
    localStore["ordr_drawings_TEST2"] = JSON.stringify([drawing]);
    const loaded = loadDrawings("TEST2");
    expect(loaded[0].text).toBe("Important");
    expect(loaded[0].fontSize).toBe(18);
    expect(loaded[0].fontBold).toBe(true);
    expect(loaded[0].backgroundColor).toBe("#333");
  });
});

// ═══════════════════════════════════════════════════════
//  7. All DrawingType values have a color entry
// ═══════════════════════════════════════════════════════

describe("All DrawingType values have color entries", () => {
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

  it("getDefaultColor returns a non-empty string for every type", () => {
    for (const t of allTypes) {
      const color = getDefaultColor(t);
      expect(color).toBeTruthy();
      expect(typeof color).toBe("string");
      expect(color.length).toBeGreaterThan(0);
    }
  });

  it("getPointsRequired returns a number for every type", () => {
    for (const t of allTypes) {
      const pts = getPointsRequired(t);
      expect(typeof pts).toBe("number");
      expect(pts !== 0).toBe(true);
    }
  });
});
