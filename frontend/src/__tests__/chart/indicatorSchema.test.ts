/**
 * indicatorSchema.test.ts -- Tests for indicator parameter schema system
 *
 * Validates:
 *   - INDICATOR_SCHEMA registry completeness and integrity
 *   - getIndicatorSchema lookup
 *   - getDefaultParams extraction
 *   - formatIndicatorLabel formatting
 *   - clampParam bounds enforcement
 *   - Schema-param alignment with compute function signatures
 */

import {
  INDICATOR_SCHEMA,
  getIndicatorSchema,
  getDefaultParams,
  formatIndicatorLabel,
  clampParam,
} from "@/components/chart/core/indicatorSchema";
import type {
  IndicatorSchema,
  IndicatorParam,
} from "@/components/chart/core/indicatorSchema";

/* ============================================================
   INDICATOR_SCHEMA Structure
   ============================================================ */

describe("INDICATOR_SCHEMA structure", () => {
  it("contains the expected number of indicator schemas", () => {
    // Schema grew over time (28 → 81). Lock the count to the current
    // value to detect *future* accidental changes, not as a contract.
    expect(INDICATOR_SCHEMA).toHaveLength(81);
  });

  it("has unique ids", () => {
    const ids = INDICATOR_SCHEMA.map((s) => s.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("every schema has required fields", () => {
    for (const schema of INDICATOR_SCHEMA) {
      expect(typeof schema.id).toBe("string");
      expect(schema.id.length).toBeGreaterThan(0);
      expect(typeof schema.name).toBe("string");
      expect(schema.name.length).toBeGreaterThan(0);
      expect(typeof schema.shortName).toBe("string");
      expect(schema.shortName.length).toBeGreaterThan(0);
      expect(["overlay", "subpane"]).toContain(schema.category);
      expect(Array.isArray(schema.params)).toBe(true);
      expect(typeof schema.color).toBe("string");
      expect(schema.color.startsWith("#")).toBe(true);
    }
  });

  it("all param definitions have valid fields", () => {
    for (const schema of INDICATOR_SCHEMA) {
      for (const param of schema.params) {
        expect(typeof param.key).toBe("string");
        expect(param.key.length).toBeGreaterThan(0);
        expect(typeof param.label).toBe("string");
        expect(param.label.length).toBeGreaterThan(0);
        expect(["number", "select"]).toContain(param.type);
        expect(param.default).toBeDefined();
      }
    }
  });

  it("number params have min <= default <= max", () => {
    for (const schema of INDICATOR_SCHEMA) {
      for (const param of schema.params) {
        if (param.type === "number") {
          const val = param.default as number;
          if (param.min !== undefined) {
            expect(val).toBeGreaterThanOrEqual(param.min);
          }
          if (param.max !== undefined) {
            expect(val).toBeLessThanOrEqual(param.max);
          }
        }
      }
    }
  });

  it("number params have positive step values", () => {
    for (const schema of INDICATOR_SCHEMA) {
      for (const param of schema.params) {
        if (param.type === "number" && param.step !== undefined) {
          expect(param.step).toBeGreaterThan(0);
        }
      }
    }
  });

  it("ids match known indicator keys from the chart system", () => {
    const knownKeys = [
      "sma20", "sma50", "sma200", "ema20", "ema50",
      "hma9", "tema20", "vwap", "ichimoku", "parabolicSAR",
      "bollinger", "keltner", "donchian",
      "rsi", "macd", "stochastic", "stochRSI", "williamsR", "cci", "adx",
      "volumeProfile", "obv", "mfi", "cmf",
      "sr", "fvg", "trendlines", "pivotPoints",
    ];
    const schemaIds = INDICATOR_SCHEMA.map((s) => s.id);
    for (const key of knownKeys) {
      expect(schemaIds).toContain(key);
    }
  });

  it("overlay count locked", () => {
    const overlays = INDICATOR_SCHEMA.filter((s) => s.category === "overlay");
    expect(overlays).toHaveLength(33);
  });

  it("subpane count locked", () => {
    const subpanes = INDICATOR_SCHEMA.filter((s) => s.category === "subpane");
    expect(subpanes).toHaveLength(48);
  });
});

/* ============================================================
   Specific Indicator Schemas
   ============================================================ */

describe("Specific indicator schemas", () => {
  it("SMA schemas have period param", () => {
    for (const id of ["sma20", "sma50", "sma200"]) {
      const schema = getIndicatorSchema(id);
      expect(schema).toBeDefined();
      expect(schema!.params).toHaveLength(1);
      expect(schema!.params[0].key).toBe("period");
    }
  });

  it("SMA defaults match their ids", () => {
    expect(getIndicatorSchema("sma20")!.params[0].default).toBe(20);
    expect(getIndicatorSchema("sma50")!.params[0].default).toBe(50);
    expect(getIndicatorSchema("sma200")!.params[0].default).toBe(200);
  });

  it("MACD has 3 params: fast, slow, signal", () => {
    const schema = getIndicatorSchema("macd")!;
    expect(schema.params).toHaveLength(3);
    expect(schema.params.map((p) => p.key)).toEqual(["fast", "slow", "signal"]);
    expect(schema.params[0].default).toBe(12);
    expect(schema.params[1].default).toBe(26);
    expect(schema.params[2].default).toBe(9);
  });

  it("Bollinger has period and stdDev params", () => {
    const schema = getIndicatorSchema("bollinger")!;
    expect(schema.params).toHaveLength(2);
    expect(schema.params[0].key).toBe("period");
    expect(schema.params[1].key).toBe("stdDev");
    expect(schema.params[1].default).toBe(2);
    expect(schema.params[1].step).toBe(0.5);
  });

  it("Keltner has 3 params", () => {
    const schema = getIndicatorSchema("keltner")!;
    expect(schema.params).toHaveLength(3);
    const keys = schema.params.map((p) => p.key);
    expect(keys).toContain("emaPeriod");
    expect(keys).toContain("atrPeriod");
    expect(keys).toContain("multiplier");
  });

  it("Ichimoku has 3 params: tenkan, kijun, senkouB", () => {
    const schema = getIndicatorSchema("ichimoku")!;
    expect(schema.params).toHaveLength(3);
    expect(schema.params[0].default).toBe(9);
    expect(schema.params[1].default).toBe(26);
    expect(schema.params[2].default).toBe(52);
  });

  it("Parabolic SAR has afStart and afMax", () => {
    const schema = getIndicatorSchema("parabolicSAR")!;
    expect(schema.params).toHaveLength(2);
    expect(schema.params[0].key).toBe("afStart");
    expect(schema.params[0].default).toBe(0.02);
    expect(schema.params[1].key).toBe("afMax");
    expect(schema.params[1].default).toBe(0.2);
  });

  it("StochRSI has 4 params", () => {
    const schema = getIndicatorSchema("stochRSI")!;
    expect(schema.params).toHaveLength(4);
    expect(schema.params.map((p) => p.key)).toEqual(["rsiPeriod", "stochPeriod", "kSmooth", "dSmooth"]);
  });

  it("VWAP has no params", () => {
    const schema = getIndicatorSchema("vwap")!;
    expect(schema.params).toHaveLength(0);
  });

  it("OBV has no params", () => {
    const schema = getIndicatorSchema("obv")!;
    expect(schema.params).toHaveLength(0);
  });

  it("Smart money indicators have no params", () => {
    for (const id of ["sr", "fvg", "trendlines", "pivotPoints"]) {
      const schema = getIndicatorSchema(id)!;
      expect(schema.params).toHaveLength(0);
    }
  });
});

/* ============================================================
   getIndicatorSchema
   ============================================================ */

describe("getIndicatorSchema", () => {
  it("returns schema for known id", () => {
    const schema = getIndicatorSchema("rsi");
    expect(schema).toBeDefined();
    expect(schema!.id).toBe("rsi");
    expect(schema!.name).toBe("Relative Strength Index");
  });

  it("returns undefined for unknown id", () => {
    expect(getIndicatorSchema("nonexistent")).toBeUndefined();
    expect(getIndicatorSchema("")).toBeUndefined();
  });

  it("returns correct category for overlays", () => {
    expect(getIndicatorSchema("sma20")!.category).toBe("overlay");
    expect(getIndicatorSchema("bollinger")!.category).toBe("overlay");
  });

  it("returns correct category for subpanes", () => {
    expect(getIndicatorSchema("rsi")!.category).toBe("subpane");
    expect(getIndicatorSchema("macd")!.category).toBe("subpane");
  });
});

/* ============================================================
   getDefaultParams
   ============================================================ */

describe("getDefaultParams", () => {
  it("returns default params for SMA", () => {
    const defaults = getDefaultParams("sma20");
    expect(defaults).toEqual({ period: 20 });
  });

  it("returns default params for MACD", () => {
    const defaults = getDefaultParams("macd");
    expect(defaults).toEqual({ fast: 12, slow: 26, signal: 9 });
  });

  it("returns default params for Bollinger", () => {
    const defaults = getDefaultParams("bollinger");
    expect(defaults).toEqual({ period: 20, stdDev: 2 });
  });

  it("returns empty object for indicators with no params", () => {
    expect(getDefaultParams("vwap")).toEqual({});
    expect(getDefaultParams("obv")).toEqual({});
    expect(getDefaultParams("sr")).toEqual({});
  });

  it("returns empty object for unknown id", () => {
    expect(getDefaultParams("nonexistent")).toEqual({});
  });

  it("returns default params for StochRSI", () => {
    const defaults = getDefaultParams("stochRSI");
    expect(defaults).toEqual({ rsiPeriod: 14, stochPeriod: 14, kSmooth: 3, dSmooth: 3 });
  });

  it("returns default params for Keltner", () => {
    const defaults = getDefaultParams("keltner");
    expect(defaults).toEqual({ emaPeriod: 20, atrPeriod: 10, multiplier: 1.5 });
  });
});

/* ============================================================
   formatIndicatorLabel
   ============================================================ */

describe("formatIndicatorLabel", () => {
  it("formats SMA with period", () => {
    expect(formatIndicatorLabel("sma20", { period: 20 })).toBe("SMA(20)");
  });

  it("formats SMA with custom period", () => {
    expect(formatIndicatorLabel("sma20", { period: 30 })).toBe("SMA(30)");
  });

  it("formats MACD with 3 params", () => {
    expect(formatIndicatorLabel("macd", { fast: 12, slow: 26, signal: 9 })).toBe("MACD(12,26,9)");
  });

  it("formats Bollinger with decimal stdDev", () => {
    expect(formatIndicatorLabel("bollinger", { period: 20, stdDev: 2 })).toBe("BB(20,2)");
  });

  it("formats Bollinger with non-integer stdDev", () => {
    expect(formatIndicatorLabel("bollinger", { period: 20, stdDev: 2.5 })).toBe("BB(20,2.5)");
  });

  it("formats indicator with no params as shortName only", () => {
    expect(formatIndicatorLabel("vwap", {})).toBe("VWAP");
    expect(formatIndicatorLabel("obv", {})).toBe("OBV");
  });

  it("uses defaults when params not provided", () => {
    // Missing params fall back to schema defaults
    expect(formatIndicatorLabel("sma20", {})).toBe("SMA(20)");
    expect(formatIndicatorLabel("macd", {})).toBe("MACD(12,26,9)");
  });

  it("returns id for unknown indicator", () => {
    expect(formatIndicatorLabel("nonexistent", {})).toBe("nonexistent");
  });

  it("formats Keltner with 3 params", () => {
    const result = formatIndicatorLabel("keltner", { emaPeriod: 20, atrPeriod: 10, multiplier: 1.5 });
    expect(result).toBe("KC(20,10,1.5)");
  });

  it("formats Parabolic SAR with decimal params", () => {
    const result = formatIndicatorLabel("parabolicSAR", { afStart: 0.02, afMax: 0.2 });
    expect(result).toBe("SAR(0.02,0.2)");
  });

  it("formats Ichimoku with 3 params", () => {
    const result = formatIndicatorLabel("ichimoku", { tenkan: 9, kijun: 26, senkouB: 52 });
    expect(result).toBe("ICHI(9,26,52)");
  });
});

/* ============================================================
   clampParam
   ============================================================ */

describe("clampParam", () => {
  const periodParam: IndicatorParam = {
    key: "period",
    label: "Period",
    type: "number",
    default: 20,
    min: 2,
    max: 500,
    step: 1,
  };

  const stdDevParam: IndicatorParam = {
    key: "stdDev",
    label: "Std Dev",
    type: "number",
    default: 2,
    min: 0.5,
    max: 5,
    step: 0.5,
  };

  it("returns value within bounds unchanged", () => {
    expect(clampParam(periodParam, 20)).toBe(20);
    expect(clampParam(periodParam, 100)).toBe(100);
    expect(clampParam(stdDevParam, 2.5)).toBe(2.5);
  });

  it("clamps below min to min", () => {
    expect(clampParam(periodParam, 1)).toBe(2);
    expect(clampParam(periodParam, 0)).toBe(2);
    expect(clampParam(periodParam, -5)).toBe(2);
    expect(clampParam(stdDevParam, 0.1)).toBe(0.5);
  });

  it("clamps above max to max", () => {
    expect(clampParam(periodParam, 600)).toBe(500);
    expect(clampParam(periodParam, 1000)).toBe(500);
    expect(clampParam(stdDevParam, 10)).toBe(5);
  });

  it("handles param with no bounds", () => {
    const unbounded: IndicatorParam = {
      key: "test",
      label: "Test",
      type: "number",
      default: 10,
    };
    expect(clampParam(unbounded, -1000)).toBe(-1000);
    expect(clampParam(unbounded, 999999)).toBe(999999);
  });

  it("handles boundary values exactly at min/max", () => {
    expect(clampParam(periodParam, 2)).toBe(2);
    expect(clampParam(periodParam, 500)).toBe(500);
    expect(clampParam(stdDevParam, 0.5)).toBe(0.5);
    expect(clampParam(stdDevParam, 5)).toBe(5);
  });
});

/* ============================================================
   Schema-Compute Alignment
   ============================================================ */

describe("Schema params align with compute function signatures", () => {
  it("SMA schema param key matches computeSMA arg name", () => {
    const schema = getIndicatorSchema("sma20")!;
    expect(schema.params[0].key).toBe("period");
  });

  it("RSI schema param key matches computeRSI arg name", () => {
    const schema = getIndicatorSchema("rsi")!;
    expect(schema.params[0].key).toBe("period");
  });

  it("MACD schema param keys match computeMACD arg names", () => {
    const schema = getIndicatorSchema("macd")!;
    const keys = schema.params.map((p) => p.key);
    expect(keys).toEqual(["fast", "slow", "signal"]);
  });

  it("Bollinger schema param keys match computeBollinger arg names", () => {
    const schema = getIndicatorSchema("bollinger")!;
    const keys = schema.params.map((p) => p.key);
    expect(keys).toEqual(["period", "stdDev"]);
  });

  it("Keltner schema param keys match computeKeltner arg names", () => {
    const schema = getIndicatorSchema("keltner")!;
    const keys = schema.params.map((p) => p.key);
    expect(keys).toEqual(["emaPeriod", "atrPeriod", "multiplier"]);
  });

  it("Stochastic schema param keys match computeStochastic arg names", () => {
    const schema = getIndicatorSchema("stochastic")!;
    const keys = schema.params.map((p) => p.key);
    expect(keys).toEqual(["kPeriod", "dPeriod"]);
  });

  it("StochRSI schema param keys match computeStochRSI arg names", () => {
    const schema = getIndicatorSchema("stochRSI")!;
    const keys = schema.params.map((p) => p.key);
    expect(keys).toEqual(["rsiPeriod", "stochPeriod", "kSmooth", "dSmooth"]);
  });

  it("Ichimoku schema param keys match computeIchimoku arg names", () => {
    const schema = getIndicatorSchema("ichimoku")!;
    const keys = schema.params.map((p) => p.key);
    expect(keys).toEqual(["tenkan", "kijun", "senkouB"]);
  });

  it("Parabolic SAR schema param keys match computeParabolicSAR arg names", () => {
    const schema = getIndicatorSchema("parabolicSAR")!;
    const keys = schema.params.map((p) => p.key);
    expect(keys).toEqual(["afStart", "afMax"]);
  });

  it("Volume Profile schema param key matches computeVolumeProfile arg name", () => {
    const schema = getIndicatorSchema("volumeProfile")!;
    expect(schema.params[0].key).toBe("numLevels");
  });
});

/* ============================================================
   Edge Cases
   ============================================================ */

describe("Edge cases", () => {
  it("formatIndicatorLabel handles trailing zeros in decimals", () => {
    // 2.0 should format as "2", not "2.0"
    const result = formatIndicatorLabel("bollinger", { period: 20, stdDev: 2.0 });
    expect(result).toBe("BB(20,2)");
  });

  it("formatIndicatorLabel handles very small decimals", () => {
    const result = formatIndicatorLabel("parabolicSAR", { afStart: 0.01, afMax: 0.1 });
    expect(result).toBe("SAR(0.01,0.1)");
  });

  it("getDefaultParams returns number values only", () => {
    for (const schema of INDICATOR_SCHEMA) {
      const defaults = getDefaultParams(schema.id);
      for (const val of Object.values(defaults)) {
        expect(typeof val).toBe("number");
      }
    }
  });

  it("all default params are finite numbers", () => {
    for (const schema of INDICATOR_SCHEMA) {
      for (const param of schema.params) {
        if (param.type === "number") {
          expect(isFinite(param.default as number)).toBe(true);
        }
      }
    }
  });

  it("no param has min > max", () => {
    for (const schema of INDICATOR_SCHEMA) {
      for (const param of schema.params) {
        if (param.min !== undefined && param.max !== undefined) {
          expect(param.min).toBeLessThanOrEqual(param.max);
        }
      }
    }
  });
});
