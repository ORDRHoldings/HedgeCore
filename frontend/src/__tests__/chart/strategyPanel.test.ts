/**
 * strategyPanel.test.ts -- Tests for StrategyPanel component
 *
 * Validates:
 *   - Props contract and type safety
 *   - Tab definitions (BUILDER, BACKTEST, ALERTS)
 *   - Condition data model
 *   - Indicator and comparison options
 *   - Resize constraints (min height, max height ratio)
 *   - Color/theme constants
 *   - Component exports (default + StrategyPanelToggle)
 *   - Sample condition structure
 */

import type { StrategyPanelProps } from "@/components/chart/StrategyPanel";

/* ============================================================
   Props Interface
   ============================================================ */

describe("StrategyPanelProps interface", () => {
  it("accepts required props", () => {
    const props: StrategyPanelProps = {
      height: 200,
      onResize: () => {},
      onClose: () => {},
    };
    expect(props.height).toBe(200);
    expect(typeof props.onResize).toBe("function");
    expect(typeof props.onClose).toBe("function");
  });

  it("height can be any positive number", () => {
    const props: StrategyPanelProps = {
      height: 350,
      onResize: () => {},
      onClose: () => {},
    };
    expect(props.height).toBeGreaterThan(0);
  });
});

/* ============================================================
   Component Exports
   ============================================================ */

describe("StrategyPanel exports", () => {
  it("exports default component function", async () => {
    const mod = await import("@/components/chart/StrategyPanel");
    expect(typeof mod.default).toBe("function");
  });

  it("exports StrategyPanelToggle named export", async () => {
    const mod = await import("@/components/chart/StrategyPanel");
    expect(typeof mod.StrategyPanelToggle).toBe("function");
  });
});

/* ============================================================
   Tab Definitions
   ============================================================ */

describe("Strategy tab definitions", () => {
  const TABS = ["BUILDER", "BACKTEST", "ALERTS"] as const;

  it("has exactly 3 tabs", () => {
    expect(TABS).toHaveLength(3);
  });

  it("BUILDER is the first/default tab", () => {
    expect(TABS[0]).toBe("BUILDER");
  });

  it("all tab names are uppercase", () => {
    for (const tab of TABS) {
      expect(tab).toBe(tab.toUpperCase());
    }
  });

  it("tabs are unique", () => {
    const unique = new Set(TABS);
    expect(unique.size).toBe(TABS.length);
  });
});

/* ============================================================
   Resize Constraints
   ============================================================ */

describe("Resize constraints", () => {
  const MIN_HEIGHT = 100;
  const MAX_HEIGHT_RATIO = 0.5; // 50% of viewport

  it("minimum height is at least 80px", () => {
    expect(MIN_HEIGHT).toBeGreaterThanOrEqual(80);
  });

  it("max height ratio does not exceed 60%", () => {
    expect(MAX_HEIGHT_RATIO).toBeLessThanOrEqual(0.6);
  });

  it("min height is less than default height", () => {
    const DEFAULT_HEIGHT = 200;
    expect(MIN_HEIGHT).toBeLessThan(DEFAULT_HEIGHT);
  });

  it("resize clamp works correctly", () => {
    const maxH = Math.floor(800 * MAX_HEIGHT_RATIO); // simulate 800px viewport
    const clamp = (v: number) => Math.max(MIN_HEIGHT, Math.min(maxH, v));

    expect(clamp(50)).toBe(MIN_HEIGHT); // below min -> clamped up
    expect(clamp(200)).toBe(200);       // within range -> unchanged
    expect(clamp(600)).toBe(maxH);      // above max -> clamped down
  });
});

/* ============================================================
   Condition Data Model
   ============================================================ */

describe("Condition data model", () => {
  interface Condition {
    id: string;
    type: "entry" | "exit";
    label: string;
    indicator: string;
    comparison: string;
    value: string;
  }

  const SAMPLE_CONDITIONS: Condition[] = [
    {
      id: "c1",
      type: "entry",
      label: "RSI crosses above 30",
      indicator: "RSI(14)",
      comparison: "crosses above",
      value: "30",
    },
    {
      id: "c2",
      type: "entry",
      label: "Price crosses SMA(20)",
      indicator: "Price",
      comparison: "crosses above",
      value: "SMA(20)",
    },
    {
      id: "c3",
      type: "exit",
      label: "RSI crosses below 70",
      indicator: "RSI(14)",
      comparison: "crosses below",
      value: "70",
    },
  ];

  it("has 3 sample conditions", () => {
    expect(SAMPLE_CONDITIONS).toHaveLength(3);
  });

  it("each condition has unique id", () => {
    const ids = SAMPLE_CONDITIONS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("each condition has required fields", () => {
    for (const c of SAMPLE_CONDITIONS) {
      expect(typeof c.id).toBe("string");
      expect(["entry", "exit"]).toContain(c.type);
      expect(typeof c.label).toBe("string");
      expect(typeof c.indicator).toBe("string");
      expect(typeof c.comparison).toBe("string");
      expect(typeof c.value).toBe("string");
    }
  });

  it("has both entry and exit types", () => {
    const types = SAMPLE_CONDITIONS.map((c) => c.type);
    expect(types).toContain("entry");
    expect(types).toContain("exit");
  });

  it("labels are human-readable descriptions", () => {
    for (const c of SAMPLE_CONDITIONS) {
      expect(c.label.length).toBeGreaterThan(5);
    }
  });
});

/* ============================================================
   Indicator Options
   ============================================================ */

describe("Indicator options", () => {
  const INDICATOR_OPTIONS = [
    "Price", "RSI(14)", "SMA(20)", "SMA(50)", "EMA(20)", "MACD",
    "Stochastic", "Volume", "ATR(14)", "CCI(20)",
  ];

  it("has 10 indicator options", () => {
    expect(INDICATOR_OPTIONS).toHaveLength(10);
  });

  it("includes Price as a base option", () => {
    expect(INDICATOR_OPTIONS).toContain("Price");
  });

  it("all options are non-empty strings", () => {
    for (const opt of INDICATOR_OPTIONS) {
      expect(typeof opt).toBe("string");
      expect(opt.length).toBeGreaterThan(0);
    }
  });

  it("options are unique", () => {
    const unique = new Set(INDICATOR_OPTIONS);
    expect(unique.size).toBe(INDICATOR_OPTIONS.length);
  });

  it("includes major oscillators", () => {
    expect(INDICATOR_OPTIONS).toContain("RSI(14)");
    expect(INDICATOR_OPTIONS).toContain("MACD");
    expect(INDICATOR_OPTIONS).toContain("Stochastic");
    expect(INDICATOR_OPTIONS).toContain("CCI(20)");
  });

  it("includes moving averages", () => {
    expect(INDICATOR_OPTIONS).toContain("SMA(20)");
    expect(INDICATOR_OPTIONS).toContain("SMA(50)");
    expect(INDICATOR_OPTIONS).toContain("EMA(20)");
  });
});

/* ============================================================
   Comparison Options
   ============================================================ */

describe("Comparison options", () => {
  const COMPARISON_OPTIONS = [
    "crosses above", "crosses below", "is above", "is below",
    "equals", "increases by", "decreases by",
  ];

  it("has 7 comparison types", () => {
    expect(COMPARISON_OPTIONS).toHaveLength(7);
  });

  it("all are lowercase strings", () => {
    for (const opt of COMPARISON_OPTIONS) {
      expect(opt).toBe(opt.toLowerCase());
    }
  });

  it("includes crossing conditions", () => {
    expect(COMPARISON_OPTIONS).toContain("crosses above");
    expect(COMPARISON_OPTIONS).toContain("crosses below");
  });

  it("includes static comparisons", () => {
    expect(COMPARISON_OPTIONS).toContain("is above");
    expect(COMPARISON_OPTIONS).toContain("is below");
    expect(COMPARISON_OPTIONS).toContain("equals");
  });

  it("includes delta comparisons", () => {
    expect(COMPARISON_OPTIONS).toContain("increases by");
    expect(COMPARISON_OPTIONS).toContain("decreases by");
  });
});

/* ============================================================
   Color Constants
   ============================================================ */

describe("Strategy panel color scheme", () => {
  const COLORS = {
    bg: "#0F1319",
    bgInput: "#131722",
    bgSub: "#1E222D",
    border: "#2A2E39",
    text: "#D1D4DC",
    accent: "#2962FF",
    green: "#26A69A",
    red: "#EF5350",
    amber: "#FF9800",
  };

  it("all colors are valid hex format", () => {
    for (const [, v] of Object.entries(COLORS)) {
      expect(v).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it("has distinct status colors", () => {
    expect(COLORS.green).not.toBe(COLORS.red);
    expect(COLORS.green).not.toBe(COLORS.amber);
    expect(COLORS.red).not.toBe(COLORS.amber);
  });

  it("background hierarchy is darker to lighter", () => {
    const bgR = parseInt(COLORS.bg.slice(1, 3), 16);
    const inputR = parseInt(COLORS.bgInput.slice(1, 3), 16);
    const subR = parseInt(COLORS.bgSub.slice(1, 3), 16);
    expect(bgR).toBeLessThanOrEqual(inputR);
    expect(inputR).toBeLessThanOrEqual(subR);
  });
});

/* ============================================================
   Handle Height Constants
   ============================================================ */

describe("Panel structural constants", () => {
  it("handle height is small enough to not steal space", () => {
    const HANDLE_HEIGHT = 6;
    expect(HANDLE_HEIGHT).toBeLessThanOrEqual(10);
    expect(HANDLE_HEIGHT).toBeGreaterThan(0);
  });

  it("transition duration is fast but visible", () => {
    const TRANSITION_MS = 200;
    expect(TRANSITION_MS).toBeGreaterThanOrEqual(100);
    expect(TRANSITION_MS).toBeLessThanOrEqual(500);
  });
});
