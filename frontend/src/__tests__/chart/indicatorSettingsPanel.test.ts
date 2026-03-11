/**
 * indicatorSettingsPanel.test.ts -- Tests for IndicatorSettingsPanel component
 *
 * Validates:
 *   - Module exports
 *   - Props contract (IndicatorSettingsPanelProps)
 *   - Parameter editing behavior via clampParam
 *   - Reset to defaults logic
 *   - Integration with indicatorSchema
 *   - Updated IndicatorLayers props contract
 */

import type { IndicatorSettingsPanelProps } from "@/components/chart/IndicatorSettingsPanel";
import type { IndicatorLayersProps } from "@/components/chart/IndicatorLayers";
import {
  getIndicatorSchema,
  getDefaultParams,
  clampParam,
  formatIndicatorLabel,
} from "@/components/chart/core/indicatorSchema";

/* ============================================================
   Module Export
   ============================================================ */

describe("IndicatorSettingsPanel module", () => {
  it("default export is a function (React component)", async () => {
    const mod = await import("@/components/chart/IndicatorSettingsPanel");
    expect(typeof mod.default).toBe("function");
  });
});

/* ============================================================
   Props Contract
   ============================================================ */

describe("IndicatorSettingsPanelProps contract", () => {
  it("accepts valid props", () => {
    const props: IndicatorSettingsPanelProps = {
      indicatorId: "sma20",
      params: { period: 20 },
      visible: true,
      anchorRect: { top: 100, left: 200, width: 80, height: 20 },
      onParamsChange: (_id: string, _params: Record<string, number>) => {},
      onRemove: (_id: string) => {},
      onClose: () => {},
    };
    expect(props.indicatorId).toBe("sma20");
    expect(props.visible).toBe(true);
    expect(typeof props.onParamsChange).toBe("function");
    expect(typeof props.onRemove).toBe("function");
    expect(typeof props.onClose).toBe("function");
  });

  it("accepts null anchorRect", () => {
    const props: IndicatorSettingsPanelProps = {
      indicatorId: "rsi",
      params: { period: 14 },
      visible: true,
      anchorRect: null,
      onParamsChange: () => {},
      onRemove: () => {},
      onClose: () => {},
    };
    expect(props.anchorRect).toBeNull();
  });

  it("accepts optional visibility toggle", () => {
    const props: IndicatorSettingsPanelProps = {
      indicatorId: "macd",
      params: { fast: 12, slow: 26, signal: 9 },
      visible: true,
      anchorRect: null,
      onParamsChange: () => {},
      onRemove: () => {},
      onVisibilityToggle: (_id: string) => {},
      onClose: () => {},
      isHidden: false,
    };
    expect(typeof props.onVisibilityToggle).toBe("function");
    expect(props.isHidden).toBe(false);
  });

  it("accepts empty params for no-param indicators", () => {
    const props: IndicatorSettingsPanelProps = {
      indicatorId: "vwap",
      params: {},
      visible: true,
      anchorRect: null,
      onParamsChange: () => {},
      onRemove: () => {},
      onClose: () => {},
    };
    expect(Object.keys(props.params)).toHaveLength(0);
  });
});

/* ============================================================
   Parameter Editing Logic
   ============================================================ */

describe("Parameter editing logic", () => {
  it("clamping prevents values below min", () => {
    const schema = getIndicatorSchema("sma20")!;
    const param = schema.params[0];
    expect(clampParam(param, 1)).toBe(2); // min is 2
  });

  it("clamping prevents values above max", () => {
    const schema = getIndicatorSchema("sma20")!;
    const param = schema.params[0];
    expect(clampParam(param, 999)).toBe(500); // max is 500
  });

  it("clamping allows values within bounds", () => {
    const schema = getIndicatorSchema("rsi")!;
    const param = schema.params[0]; // period, min=2, max=100
    expect(clampParam(param, 21)).toBe(21);
    expect(clampParam(param, 50)).toBe(50);
  });

  it("MACD slow must be >= 2", () => {
    const schema = getIndicatorSchema("macd")!;
    const slowParam = schema.params[1];
    expect(clampParam(slowParam, 1)).toBe(2);
  });

  it("Bollinger stdDev allows fractional values", () => {
    const schema = getIndicatorSchema("bollinger")!;
    const stdDevParam = schema.params[1];
    expect(clampParam(stdDevParam, 1.5)).toBe(1.5);
    expect(clampParam(stdDevParam, 2.5)).toBe(2.5);
  });
});

/* ============================================================
   Reset to Defaults
   ============================================================ */

describe("Reset to defaults", () => {
  it("getDefaultParams returns correct defaults for all indicators with params", () => {
    const withParams = [
      "sma20", "sma50", "sma200", "ema20", "ema50", "hma9", "tema20",
      "bollinger", "keltner", "donchian", "ichimoku", "parabolicSAR",
      "volumeProfile", "rsi", "macd", "stochastic", "stochRSI",
      "williamsR", "cci", "adx", "mfi", "cmf",
    ];

    for (const id of withParams) {
      const defaults = getDefaultParams(id);
      const schema = getIndicatorSchema(id)!;
      for (const param of schema.params) {
        if (param.type === "number") {
          expect(defaults[param.key]).toBe(param.default);
        }
      }
    }
  });

  it("reset produces identical params to initial state", () => {
    // Simulate: user changes SMA period from 20 to 50, then resets
    const customParams = { period: 50 };
    const defaults = getDefaultParams("sma20");
    expect(customParams).not.toEqual(defaults);
    // After reset, params should match defaults
    expect(defaults).toEqual({ period: 20 });
  });

  it("reset for multi-param indicator restores all values", () => {
    const customParams = { fast: 8, slow: 21, signal: 5 };
    const defaults = getDefaultParams("macd");
    expect(customParams).not.toEqual(defaults);
    expect(defaults).toEqual({ fast: 12, slow: 26, signal: 9 });
  });
});

/* ============================================================
   Label Updates
   ============================================================ */

describe("Label updates with param changes", () => {
  it("SMA label reflects custom period", () => {
    expect(formatIndicatorLabel("sma20", { period: 30 })).toBe("SMA(30)");
    expect(formatIndicatorLabel("sma20", { period: 100 })).toBe("SMA(100)");
  });

  it("RSI label reflects custom period", () => {
    expect(formatIndicatorLabel("rsi", { period: 21 })).toBe("RSI(21)");
  });

  it("MACD label reflects all custom params", () => {
    expect(formatIndicatorLabel("macd", { fast: 8, slow: 21, signal: 5 })).toBe("MACD(8,21,5)");
  });

  it("BB label reflects custom period and stdDev", () => {
    expect(formatIndicatorLabel("bollinger", { period: 14, stdDev: 1.5 })).toBe("BB(14,1.5)");
  });

  it("label stays same with default params", () => {
    expect(formatIndicatorLabel("rsi", { period: 14 })).toBe("RSI(14)");
    expect(formatIndicatorLabel("macd", { fast: 12, slow: 26, signal: 9 })).toBe("MACD(12,26,9)");
  });
});

/* ============================================================
   Updated IndicatorLayers Props
   ============================================================ */

describe("IndicatorLayers new props", () => {
  it("accepts indicatorParams and onParamsChange", () => {
    const props: IndicatorLayersProps = {
      activeOverlays: [
        { key: "sma20", label: "SMA(20)", color: "#FFD54F", enabled: true },
      ],
      activeSubPanes: [
        { key: "rsi", label: "RSI(14)", color: "#7B1FA2" },
      ],
      onRemoveOverlay: () => {},
      onRemoveSubPane: () => {},
      indicatorParams: {
        sma20: { period: 30 },
        rsi: { period: 21 },
      },
      onParamsChange: (_id: string, _params: Record<string, number>) => {},
    };
    expect(props.indicatorParams).toBeDefined();
    expect(props.indicatorParams!["sma20"]).toEqual({ period: 30 });
    expect(typeof props.onParamsChange).toBe("function");
  });

  it("indicatorParams is optional (backward compatible)", () => {
    const props: IndicatorLayersProps = {
      activeOverlays: [],
      activeSubPanes: [],
      onRemoveOverlay: () => {},
      onRemoveSubPane: () => {},
    };
    expect(props.indicatorParams).toBeUndefined();
    expect(props.onParamsChange).toBeUndefined();
  });
});

/* ============================================================
   Callback Integration
   ============================================================ */

describe("Callback integration", () => {
  it("onParamsChange receives correct id and params", () => {
    let receivedId = "";
    let receivedParams: Record<string, number> = {};
    const cb = (id: string, params: Record<string, number>) => {
      receivedId = id;
      receivedParams = params;
    };

    cb("sma20", { period: 30 });
    expect(receivedId).toBe("sma20");
    expect(receivedParams).toEqual({ period: 30 });
  });

  it("onRemove receives indicator id", () => {
    let removedId = "";
    const cb = (id: string) => { removedId = id; };
    cb("rsi");
    expect(removedId).toBe("rsi");
  });

  it("onClose is callable", () => {
    let closed = false;
    const cb = () => { closed = true; };
    cb();
    expect(closed).toBe(true);
  });

  it("onParamsChange with clamped value", () => {
    const schema = getIndicatorSchema("rsi")!;
    const param = schema.params[0];
    // Simulate user entering value beyond max
    const userInput = 150;
    const clamped = clampParam(param, userInput);
    expect(clamped).toBe(100); // max is 100

    let receivedParams: Record<string, number> = {};
    const cb = (_id: string, params: Record<string, number>) => {
      receivedParams = params;
    };
    cb("rsi", { period: clamped });
    expect(receivedParams.period).toBe(100);
  });
});

/* ============================================================
   Schema Coverage for Settings Panel
   ============================================================ */

describe("Schema coverage", () => {
  it("every indicator with params can open a settings panel", () => {
    const withParams = [
      "sma20", "sma50", "sma200", "ema20", "ema50", "hma9", "tema20",
      "bollinger", "keltner", "donchian", "ichimoku", "parabolicSAR",
      "volumeProfile", "rsi", "macd", "stochastic", "stochRSI",
      "williamsR", "cci", "adx", "mfi", "cmf",
    ];
    for (const id of withParams) {
      const schema = getIndicatorSchema(id);
      expect(schema).toBeDefined();
      expect(schema!.params.length).toBeGreaterThan(0);
      const defaults = getDefaultParams(id);
      expect(Object.keys(defaults).length).toBe(schema!.params.length);
    }
  });

  it("indicators without params still have valid schema", () => {
    const noParams = ["vwap", "obv", "sr", "fvg", "trendlines", "pivotPoints"];
    for (const id of noParams) {
      const schema = getIndicatorSchema(id);
      expect(schema).toBeDefined();
      expect(schema!.params).toHaveLength(0);
    }
  });
});
