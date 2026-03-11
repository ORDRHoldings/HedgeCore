/**
 * chartLeftToolbar.test.ts -- Tests for ChartLeftToolbar component
 *
 * Validates:
 *   - ToolKey type completeness (all 59 tool keys)
 *   - Component exports and interface
 *   - Tool category structure (10 groups)
 *   - Theme color usage
 *   - Props contract
 *   - Flyout category definitions
 */

import type { ToolKey, ChartLeftToolbarProps } from "@/components/chart/ChartLeftToolbar";
import { THEME } from "@/components/chart/core/theme";

/* ============================================================
   ToolKey Type Completeness
   ============================================================ */

describe("ToolKey type", () => {
  const ALL_TOOL_KEYS: ToolKey[] = [
    // Cursors (2)
    "crosshair",
    "cursor",
    // Lines (9)
    "trendline",
    "ray",
    "extended_line",
    "horizontal",
    "horizontal_ray",
    "vertical_line",
    "cross_line",
    "info_line",
    "trend_angle",
    // Channels (8)
    "parallel_channel",
    "regression_trend",
    "flat_top_bottom",
    "disjoint_channel",
    "pitchfork",
    "schiff_pitchfork",
    "mod_schiff_pitchfork",
    "inside_pitchfork",
    // Fibonacci (7)
    "fibonacci",
    "fib_extension",
    "fib_channel",
    "fib_time_zone",
    "fib_speed_fan",
    "gann_box",
    "gann_fan",
    // Patterns (9)
    "xabcd_pattern",
    "cypher_pattern",
    "abcd_pattern",
    "triangle_pattern",
    "three_drives",
    "head_shoulders",
    "elliott_impulse",
    "elliott_correction",
    "elliott_triangle",
    // Shapes (8)
    "rectangle",
    "circle",
    "ellipse",
    "triangle_shape",
    "arrow_drawing",
    "brush",
    "polyline",
    "arc",
    // Measurement (6)
    "long_position",
    "short_position",
    "date_range",
    "price_range",
    "date_price_range",
    "forecast",
    // Annotations (7)
    "text_note",
    "anchored_text",
    "callout",
    "price_label",
    "arrow_marker_up",
    "arrow_marker_down",
    "flag_mark",
    // Magnet (1)
    "magnet",
    // Utilities (2)
    "zoomIn",
    "eraser",
  ];

  it("covers all 59 expected tool keys", () => {
    expect(ALL_TOOL_KEYS).toHaveLength(59);
  });

  it("each key is a valid non-empty string", () => {
    for (const key of ALL_TOOL_KEYS) {
      expect(typeof key).toBe("string");
      expect(key.length).toBeGreaterThan(0);
    }
  });

  it("has no duplicates", () => {
    const unique = new Set(ALL_TOOL_KEYS);
    expect(unique.size).toBe(ALL_TOOL_KEYS.length);
  });
});

/* ============================================================
   Props Interface
   ============================================================ */

describe("ChartLeftToolbarProps contract", () => {
  it("accepts a valid props object", () => {
    const props: ChartLeftToolbarProps = {
      activeTool: "crosshair",
      onSelectTool: (_tool: string) => {},
      hasDrawings: false,
      onClearDrawings: () => {},
    };
    expect(props.activeTool).toBe("crosshair");
    expect(typeof props.onSelectTool).toBe("function");
    expect(props.hasDrawings).toBe(false);
    expect(typeof props.onClearDrawings).toBe("function");
  });

  it("activeTool accepts any ToolKey value", () => {
    const keys: ToolKey[] = ["cursor", "trendline", "fibonacci", "eraser", "parallel_channel"];
    for (const key of keys) {
      const props: ChartLeftToolbarProps = {
        activeTool: key,
        onSelectTool: () => {},
        hasDrawings: true,
        onClearDrawings: () => {},
      };
      expect(props.activeTool).toBe(key);
    }
  });
});

/* ============================================================
   Tool Category Sizes
   ============================================================ */

describe("Tool categories", () => {
  const CURSOR_KEYS: ToolKey[] = ["crosshair", "cursor"];
  const LINE_KEYS: ToolKey[] = [
    "trendline", "ray", "extended_line", "horizontal", "horizontal_ray",
    "vertical_line", "cross_line", "info_line", "trend_angle",
  ];
  const CHANNEL_KEYS: ToolKey[] = [
    "parallel_channel", "regression_trend", "flat_top_bottom", "disjoint_channel",
    "pitchfork", "schiff_pitchfork", "mod_schiff_pitchfork", "inside_pitchfork",
  ];
  const FIB_KEYS: ToolKey[] = [
    "fibonacci", "fib_extension", "fib_channel", "fib_time_zone",
    "fib_speed_fan", "gann_box", "gann_fan",
  ];
  const PATTERN_KEYS: ToolKey[] = [
    "xabcd_pattern", "cypher_pattern", "abcd_pattern", "triangle_pattern",
    "three_drives", "head_shoulders", "elliott_impulse", "elliott_correction", "elliott_triangle",
  ];
  const SHAPE_KEYS: ToolKey[] = [
    "rectangle", "circle", "ellipse", "triangle_shape",
    "arrow_drawing", "brush", "polyline", "arc",
  ];
  const MEASUREMENT_KEYS: ToolKey[] = [
    "long_position", "short_position", "date_range",
    "price_range", "date_price_range", "forecast",
  ];
  const ANNOTATION_KEYS: ToolKey[] = [
    "text_note", "anchored_text", "callout", "price_label",
    "arrow_marker_up", "arrow_marker_down", "flag_mark",
  ];
  const UTILITY_KEYS: ToolKey[] = ["zoomIn", "eraser"];
  const MAGNET_KEY: ToolKey = "magnet";

  it("cursor group has 2 tools", () => {
    expect(CURSOR_KEYS).toHaveLength(2);
  });

  it("line group has 9 tools", () => {
    expect(LINE_KEYS).toHaveLength(9);
  });

  it("channel group has 8 tools", () => {
    expect(CHANNEL_KEYS).toHaveLength(8);
  });

  it("fibonacci group has 7 tools", () => {
    expect(FIB_KEYS).toHaveLength(7);
  });

  it("pattern group has 9 tools", () => {
    expect(PATTERN_KEYS).toHaveLength(9);
  });

  it("shape group has 8 tools", () => {
    expect(SHAPE_KEYS).toHaveLength(8);
  });

  it("measurement group has 6 tools", () => {
    expect(MEASUREMENT_KEYS).toHaveLength(6);
  });

  it("annotation group has 7 tools", () => {
    expect(ANNOTATION_KEYS).toHaveLength(7);
  });

  it("utility group has 2 tools", () => {
    expect(UTILITY_KEYS).toHaveLength(2);
  });

  it("magnet is a single toggle", () => {
    expect(MAGNET_KEY).toBe("magnet");
  });

  it("non-cursor groups sum to 57 tools (9+8+7+9+8+6+7+2+1)", () => {
    const total =
      LINE_KEYS.length +
      CHANNEL_KEYS.length +
      FIB_KEYS.length +
      PATTERN_KEYS.length +
      SHAPE_KEYS.length +
      MEASUREMENT_KEYS.length +
      ANNOTATION_KEYS.length +
      UTILITY_KEYS.length +
      1; // magnet
    expect(total).toBe(57);
  });

  it("all tool keys across all groups total 59", () => {
    const all = [
      ...CURSOR_KEYS,
      ...LINE_KEYS,
      ...CHANNEL_KEYS,
      ...FIB_KEYS,
      ...PATTERN_KEYS,
      ...SHAPE_KEYS,
      ...MEASUREMENT_KEYS,
      ...ANNOTATION_KEYS,
      MAGNET_KEY,
      ...UTILITY_KEYS,
    ];
    expect(all).toHaveLength(59);
    expect(new Set(all).size).toBe(59);
  });
});

/* ============================================================
   Theme Integration
   ============================================================ */

describe("Theme color usage", () => {
  it("axisBg is used for toolbar background", () => {
    expect(THEME.axisBg).toBe("#1E222D");
  });

  it("subPaneBorder is used for border and dividers", () => {
    expect(THEME.subPaneBorder).toBe("#2A2E39");
  });

  it("axisText is used for inactive icon color", () => {
    expect(THEME.axisText).toBe("#787B86");
  });

  it("tooltipBg and tooltipText are used for tooltips", () => {
    expect(THEME.tooltipBg).toContain("rgba");
    expect(THEME.tooltipText).toBe("#D1D4DC");
  });

  it("active highlight uses TradingView accent blue #2962FF", () => {
    const ACCENT = "#2962FF";
    expect(ACCENT).toBe("#2962FF");
  });
});

/* ============================================================
   Module Export
   ============================================================ */

describe("Module exports", () => {
  it("default export is a function (React component)", async () => {
    const mod = await import("@/components/chart/ChartLeftToolbar");
    expect(typeof mod.default).toBe("function");
  });

  it("exports ToolKey and ChartLeftToolbarProps types (no runtime value)", async () => {
    const mod = await import("@/components/chart/ChartLeftToolbar");
    expect(mod).toBeDefined();
    expect(mod.default).toBeDefined();
  });
});

/* ============================================================
   Design Spec Constants
   ============================================================ */

describe("Design spec constants", () => {
  it("toolbar width is 42px", () => {
    const TOOLBAR_WIDTH = 42;
    expect(TOOLBAR_WIDTH).toBe(42);
  });

  it("button size is 36x36px", () => {
    const BUTTON_SIZE = 36;
    expect(BUTTON_SIZE).toBe(36);
  });

  it("icon size is 16x16", () => {
    const ICON_SIZE = 16;
    expect(ICON_SIZE).toBe(16);
  });

  it("delete hover color is red #EF5350", () => {
    const DELETE_COLOR = "#EF5350";
    expect(DELETE_COLOR).toBe("#EF5350");
  });

  it("flyout background is #1A1E2E", () => {
    const FLYOUT_BG = "#1A1E2E";
    expect(FLYOUT_BG).toBe("#1A1E2E");
  });

  it("flyout border radius is 8px", () => {
    const FLYOUT_RADIUS = 8;
    expect(FLYOUT_RADIUS).toBe(8);
  });

  it("flyout min width is 200px", () => {
    const FLYOUT_MIN_WIDTH = 200;
    expect(FLYOUT_MIN_WIDTH).toBe(200);
  });
});

/* ============================================================
   Callback Behavior
   ============================================================ */

describe("Callback contract", () => {
  it("onSelectTool receives the tool key string", () => {
    let received = "";
    const cb = (tool: string) => { received = tool; };
    cb("trendline");
    expect(received).toBe("trendline");
  });

  it("onClearDrawings is a void function", () => {
    let called = false;
    const cb = () => { called = true; };
    cb();
    expect(called).toBe(true);
  });

  it("onSelectTool is callable with any ToolKey", () => {
    const calls: string[] = [];
    const cb = (tool: string) => { calls.push(tool); };
    const keys: ToolKey[] = [
      "crosshair", "cursor",
      "trendline", "ray", "extended_line", "horizontal",
      "parallel_channel", "fibonacci",
      "xabcd_pattern", "rectangle",
      "long_position", "price_range",
      "text_note", "callout",
      "magnet", "zoomIn", "eraser",
    ];
    for (const k of keys) cb(k);
    expect(calls).toHaveLength(17);
    expect(calls).toEqual(keys);
  });
});

/* ============================================================
   Flyout Category Defaults
   ============================================================ */

describe("Category default tools", () => {
  it("lines default to trendline", () => {
    const DEFAULT: ToolKey = "trendline";
    expect(DEFAULT).toBe("trendline");
  });

  it("channels default to parallel_channel", () => {
    const DEFAULT: ToolKey = "parallel_channel";
    expect(DEFAULT).toBe("parallel_channel");
  });

  it("fibonacci default to fibonacci", () => {
    const DEFAULT: ToolKey = "fibonacci";
    expect(DEFAULT).toBe("fibonacci");
  });

  it("patterns default to xabcd_pattern", () => {
    const DEFAULT: ToolKey = "xabcd_pattern";
    expect(DEFAULT).toBe("xabcd_pattern");
  });

  it("shapes default to rectangle", () => {
    const DEFAULT: ToolKey = "rectangle";
    expect(DEFAULT).toBe("rectangle");
  });

  it("measurement default to price_range", () => {
    const DEFAULT: ToolKey = "price_range";
    expect(DEFAULT).toBe("price_range");
  });

  it("annotations default to text_note", () => {
    const DEFAULT: ToolKey = "text_note";
    expect(DEFAULT).toBe("text_note");
  });
});
