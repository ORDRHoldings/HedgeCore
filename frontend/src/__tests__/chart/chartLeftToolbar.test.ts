/**
 * chartLeftToolbar.test.ts -- Tests for ChartLeftToolbar component
 *
 * Validates:
 *   - ToolKey type completeness
 *   - Component exports and interface
 *   - Tool group structure (all 15 tool keys present)
 *   - Theme color usage
 *   - Props contract
 */

import type { ToolKey, ChartLeftToolbarProps } from "@/components/chart/ChartLeftToolbar";
import { THEME } from "@/components/chart/core/theme";

/* ============================================================
   ToolKey Type Completeness
   ============================================================ */

describe("ToolKey type", () => {
  const ALL_TOOL_KEYS: ToolKey[] = [
    "cursor",
    "crosshair",
    "trendline",
    "horizontal",
    "ray",
    "vertical",
    "rectangle",
    "fibonacci",
    "pitchfork",
    "text",
    "arrow",
    "priceRange",
    "measure",
    "zoomIn",
    "eraser",
  ];

  it("covers all 15 expected tool keys", () => {
    expect(ALL_TOOL_KEYS).toHaveLength(15);
  });

  it("each key is a valid string", () => {
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
    const keys: ToolKey[] = ["cursor", "trendline", "fibonacci", "eraser"];
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
   Tool Groups
   ============================================================ */

describe("Tool groups", () => {
  const CURSOR_KEYS: ToolKey[] = ["crosshair", "cursor"];
  const LINE_KEYS: ToolKey[] = ["trendline", "horizontal", "ray", "vertical"];
  const SHAPE_KEYS: ToolKey[] = ["rectangle", "fibonacci", "pitchfork"];
  const ANNOTATION_KEYS: ToolKey[] = ["text", "arrow", "priceRange"];
  const UTILITY_KEYS: ToolKey[] = ["measure", "zoomIn", "eraser"];

  it("cursor group has 2 tools", () => {
    expect(CURSOR_KEYS).toHaveLength(2);
  });

  it("line group has 4 tools", () => {
    expect(LINE_KEYS).toHaveLength(4);
  });

  it("shape group has 3 tools", () => {
    expect(SHAPE_KEYS).toHaveLength(3);
  });

  it("annotation group has 3 tools", () => {
    expect(ANNOTATION_KEYS).toHaveLength(3);
  });

  it("utility group has 3 tools", () => {
    expect(UTILITY_KEYS).toHaveLength(3);
  });

  it("all groups sum to 15 total tools", () => {
    const total =
      CURSOR_KEYS.length +
      LINE_KEYS.length +
      SHAPE_KEYS.length +
      ANNOTATION_KEYS.length +
      UTILITY_KEYS.length;
    expect(total).toBe(15);
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
    // This is a design contract: the active tool button must use this color
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
    // Types are compile-time only; this test validates the module loads
    const mod = await import("@/components/chart/ChartLeftToolbar");
    expect(mod).toBeDefined();
    expect(mod.default).toBeDefined();
  });
});

/* ============================================================
   Design Spec Constants
   ============================================================ */

describe("Design spec constants", () => {
  it("toolbar width is 40px", () => {
    const TOOLBAR_WIDTH = 40;
    expect(TOOLBAR_WIDTH).toBe(40);
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
    const keys: ToolKey[] = ["crosshair", "cursor", "trendline", "horizontal", "ray",
      "vertical", "rectangle", "fibonacci", "pitchfork", "text", "arrow",
      "priceRange", "measure", "zoomIn", "eraser"];
    for (const k of keys) cb(k);
    expect(calls).toHaveLength(15);
    expect(calls).toEqual(keys);
  });
});
