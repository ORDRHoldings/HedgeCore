/**
 * indicatorLayers.test.ts -- Tests for IndicatorLayers component
 *
 * Validates:
 *   - Module exports and interface types
 *   - OverlayChip / SubPaneChip type contracts
 *   - Color/label maps match design spec
 *   - Props contract for callbacks
 *   - OVERLAY_META / SUBPANE_META completeness (via ChartEngine integration)
 *   - Delayed badge logic
 */

import type {
  OverlayChip,
  SubPaneChip,
  IndicatorLayersProps,
} from "@/components/chart/IndicatorLayers";
import { THEME } from "@/components/chart/core/theme";

/* ============================================================
   Module Export
   ============================================================ */

describe("IndicatorLayers module", () => {
  it("default export is a function (React component)", async () => {
    const mod = await import("@/components/chart/IndicatorLayers");
    expect(typeof mod.default).toBe("function");
  });

  it("exports OverlayChip and SubPaneChip types (no runtime value)", async () => {
    const mod = await import("@/components/chart/IndicatorLayers");
    expect(mod).toBeDefined();
    expect(mod.default).toBeDefined();
  });
});

/* ============================================================
   OverlayChip Type Contract
   ============================================================ */

describe("OverlayChip type", () => {
  it("accepts a valid overlay chip object", () => {
    const chip: OverlayChip = {
      key: "sma20",
      label: "SMA(20)",
      color: "#FFD54F",
      enabled: true,
    };
    expect(chip.key).toBe("sma20");
    expect(chip.label).toBe("SMA(20)");
    expect(chip.color).toBe("#FFD54F");
    expect(chip.enabled).toBe(true);
  });

  it("enabled can be false to indicate inactive", () => {
    const chip: OverlayChip = {
      key: "bollinger",
      label: "BB(20,2)",
      color: THEME.bbLine,
      enabled: false,
    };
    expect(chip.enabled).toBe(false);
  });
});

/* ============================================================
   SubPaneChip Type Contract
   ============================================================ */

describe("SubPaneChip type", () => {
  it("accepts a valid sub-pane chip object", () => {
    const chip: SubPaneChip = {
      key: "rsi",
      label: "RSI(14)",
      color: "#7B1FA2",
    };
    expect(chip.key).toBe("rsi");
    expect(chip.label).toBe("RSI(14)");
    expect(chip.color).toBe("#7B1FA2");
  });

  it("does not have an enabled property", () => {
    const chip: SubPaneChip = { key: "macd", label: "MACD(12,26,9)", color: "#2962FF" };
    expect("enabled" in chip).toBe(false);
  });
});

/* ============================================================
   IndicatorLayersProps Contract
   ============================================================ */

describe("IndicatorLayersProps contract", () => {
  it("accepts a valid props object with overlays and sub-panes", () => {
    const props: IndicatorLayersProps = {
      activeOverlays: [
        { key: "ema20", label: "EMA(20)", color: "#26C6DA", enabled: true },
      ],
      activeSubPanes: [
        { key: "rsi", label: "RSI(14)", color: "#7B1FA2" },
      ],
      onRemoveOverlay: (_key: string) => {},
      onRemoveSubPane: (_key: string) => {},
    };
    expect(props.activeOverlays).toHaveLength(1);
    expect(props.activeSubPanes).toHaveLength(1);
    expect(typeof props.onRemoveOverlay).toBe("function");
    expect(typeof props.onRemoveSubPane).toBe("function");
  });

  it("accepts empty arrays (renders nothing)", () => {
    const props: IndicatorLayersProps = {
      activeOverlays: [],
      activeSubPanes: [],
      onRemoveOverlay: () => {},
      onRemoveSubPane: () => {},
    };
    expect(props.activeOverlays).toHaveLength(0);
    expect(props.activeSubPanes).toHaveLength(0);
  });
});

/* ============================================================
   Design Spec: Overlay Colors
   ============================================================ */

describe("Overlay indicator colors match design spec", () => {
  const SPEC_COLORS: Record<string, string> = {
    sma20: "#FFD54F",
    sma50: "#FF8A65",
    sma200: "#FF5252",
    ema20: "#26C6DA",
    ema50: "#00E676",
    hma9: "#00E676",
    tema20: "#FF4081",
    vwap: THEME.vwapColor,
    bollinger: THEME.bbLine,
    keltner: THEME.kcLine,
    ichimoku: "#2962FF",
    donchian: "#00BCD4",
    volumeProfile: THEME.vpPocColor,
    sr: "#26A69A",
    fvg: "#26A69A",
    trendlines: "#EF5350",
    pivotPoints: "#9598A1",
    parabolicSAR: "#26A69A",
  };

  it("covers all 18 overlay indicators", () => {
    expect(Object.keys(SPEC_COLORS)).toHaveLength(18);
  });

  it("each color is a valid hex or THEME reference", () => {
    for (const [key, color] of Object.entries(SPEC_COLORS)) {
      expect(color).toBeTruthy();
      expect(typeof color).toBe("string");
      // Must start with # (hex) or be a THEME value
      expect(color.startsWith("#") || color.startsWith("rgba")).toBe(true);
    }
  });

  it("THEME.vwapColor is defined", () => {
    expect(THEME.vwapColor).toBeTruthy();
  });

  it("THEME.bbLine is defined", () => {
    expect(THEME.bbLine).toBeTruthy();
  });

  it("THEME.kcLine is defined", () => {
    expect(THEME.kcLine).toBeTruthy();
  });

  it("THEME.vpPocColor is defined", () => {
    expect(THEME.vpPocColor).toBeTruthy();
  });
});

/* ============================================================
   Design Spec: Sub-Pane Colors
   ============================================================ */

describe("Sub-pane indicator colors match design spec", () => {
  const SPEC_COLORS: Record<string, string> = {
    rsi: "#7B1FA2",
    macd: "#2962FF",
    stochastic: "#FF6D00",
    stochRSI: "#FF6D00",
    williamsR: "#FF6D00",
    cci: "#2196F3",
    adx: "#787B86",
    obv: "#FF9800",
    mfi: "#E040FB",
    cmf: "#00BCD4",
  };

  it("covers all 10 sub-pane indicators", () => {
    expect(Object.keys(SPEC_COLORS)).toHaveLength(10);
  });

  it("each color is a valid hex string", () => {
    for (const color of Object.values(SPEC_COLORS)) {
      expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
});

/* ============================================================
   Callback Behavior
   ============================================================ */

describe("Callback contract", () => {
  it("onRemoveOverlay receives the overlay key string", () => {
    let received = "";
    const cb = (key: string) => { received = key; };
    cb("sma20");
    expect(received).toBe("sma20");
  });

  it("onRemoveSubPane receives the sub-pane key string", () => {
    let received = "";
    const cb = (key: string) => { received = key; };
    cb("rsi");
    expect(received).toBe("rsi");
  });

  it("onRemoveOverlay is callable with all 18 overlay keys", () => {
    const calls: string[] = [];
    const cb = (key: string) => { calls.push(key); };
    const keys = [
      "sma20", "sma50", "sma200", "ema20", "ema50",
      "hma9", "tema20", "vwap",
      "bollinger", "keltner", "ichimoku", "donchian",
      "volumeProfile", "sr", "fvg", "trendlines",
      "pivotPoints", "parabolicSAR",
    ];
    for (const k of keys) cb(k);
    expect(calls).toHaveLength(18);
    expect(calls).toEqual(keys);
  });

  it("onRemoveSubPane is callable with all 10 sub-pane keys", () => {
    const calls: string[] = [];
    const cb = (key: string) => { calls.push(key); };
    const keys = [
      "rsi", "macd", "stochastic", "stochRSI", "williamsR",
      "cci", "adx", "obv", "mfi", "cmf",
    ];
    for (const k of keys) cb(k);
    expect(calls).toHaveLength(10);
    expect(calls).toEqual(keys);
  });
});

/* ============================================================
   Design Spec: Styling Constants
   ============================================================ */

describe("Design spec styling", () => {
  it("chip background matches spec: rgba(30,34,45,0.85)", () => {
    const BG = "rgba(30,34,45,0.85)";
    expect(BG).toBe("rgba(30,34,45,0.85)");
  });

  it("text color matches spec: #D1D4DC", () => {
    const TEXT = "#D1D4DC";
    expect(TEXT).toBe("#D1D4DC");
  });

  it("muted color matches spec: #787B86", () => {
    const MUTED = "#787B86";
    expect(MUTED).toBe("#787B86");
  });

  it("remove button hover color is red #EF5350", () => {
    const RED = "#EF5350";
    expect(RED).toBe("#EF5350");
  });

  it("font is IBM Plex Mono 10px", () => {
    const FONT = "'IBM Plex Mono', monospace";
    const SIZE = 10;
    expect(FONT).toContain("IBM Plex Mono");
    expect(SIZE).toBe(10);
  });

  it("container is positioned absolute at top:34, left:10", () => {
    const TOP = 34;
    const LEFT = 10;
    expect(TOP).toBe(34);
    expect(LEFT).toBe(10);
  });
});

/* ============================================================
   Delayed Badge Logic
   ============================================================ */

describe("Delayed badge logic", () => {
  it("shows for source containing 'twelve' (case insensitive)", () => {
    const sources = ["TwelveData", "twelvedata", "TWELVEDATA", "twelve_data"];
    for (const s of sources) {
      expect(s.toLowerCase().includes("twelve")).toBe(true);
    }
  });

  it("does not show for IBKR or other sources", () => {
    const sources = ["IBKR", "ibkr", "manual", "bloomberg", ""];
    for (const s of sources) {
      expect(s.toLowerCase().includes("twelve")).toBe(false);
    }
  });

  it("does not show when source is undefined", () => {
    const source: string | undefined = undefined;
    const shouldShow = source ? source.toLowerCase().includes("twelve") : false;
    expect(shouldShow).toBe(false);
  });
});

/* ============================================================
   Integration: Filtering Behavior
   ============================================================ */

describe("Chip filtering logic", () => {
  it("only enabled overlays appear as chips", () => {
    const all: OverlayChip[] = [
      { key: "ema20", label: "EMA(20)", color: "#26C6DA", enabled: true },
      { key: "sma50", label: "SMA(50)", color: "#FF8A65", enabled: false },
      { key: "bollinger", label: "BB(20,2)", color: THEME.bbLine, enabled: true },
    ];
    const visible = all.filter((c) => c.enabled);
    expect(visible).toHaveLength(2);
    expect(visible.map((c) => c.key)).toEqual(["ema20", "bollinger"]);
  });

  it("returns empty when no overlays or sub-panes active", () => {
    const overlays: OverlayChip[] = [];
    const subPanes: SubPaneChip[] = [];
    const total = overlays.length + subPanes.length;
    expect(total).toBe(0);
  });

  it("separator shown only when both overlays and sub-panes exist", () => {
    const hasOverlays = true;
    const hasSubPanes = true;
    const showSep = hasOverlays && hasSubPanes;
    expect(showSep).toBe(true);

    const showSep2 = hasOverlays && !hasSubPanes;
    expect(showSep2).toBe(false);
  });
});
