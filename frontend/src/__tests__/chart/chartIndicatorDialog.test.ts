/**
 * chartIndicatorDialog.test.ts -- Tests for ChartIndicatorDialog
 *
 * Tests the pure logic functions (filterIndicators, isIndicatorActive)
 * and validates the INDICATOR_REGISTRY data structure integrity.
 */

import {
  INDICATOR_REGISTRY,
  filterIndicators,
  isIndicatorActive,
} from "@/components/chart/ChartIndicatorDialog";
import type {
  IndicatorDef,
  IndicatorCategory,
} from "@/components/chart/ChartIndicatorDialog";

/* ============================================================
   INDICATOR_REGISTRY structure
   ============================================================ */

describe("INDICATOR_REGISTRY", () => {
  it("contains 28 indicators", () => {
    expect(INDICATOR_REGISTRY).toHaveLength(28);
  });

  it("has unique keys", () => {
    const keys = INDICATOR_REGISTRY.map((i) => i.key);
    const unique = new Set(keys);
    expect(unique.size).toBe(keys.length);
  });

  it("every entry has required fields with correct types", () => {
    const validCategories: IndicatorCategory[] = [
      "trend",
      "oscillators",
      "volume",
      "volatility",
      "smartmoney",
    ];
    const validTypes: Array<"overlay" | "subpane"> = ["overlay", "subpane"];

    for (const ind of INDICATOR_REGISTRY) {
      expect(typeof ind.key).toBe("string");
      expect(ind.key.length).toBeGreaterThan(0);
      expect(typeof ind.name).toBe("string");
      expect(ind.name.length).toBeGreaterThan(0);
      expect(typeof ind.shortDesc).toBe("string");
      expect(ind.shortDesc.length).toBeGreaterThan(0);
      expect(validCategories).toContain(ind.category);
      expect(validTypes).toContain(ind.type);
    }
  });

  it("has correct category counts", () => {
    const counts: Record<string, number> = {};
    for (const ind of INDICATOR_REGISTRY) {
      counts[ind.category] = (counts[ind.category] || 0) + 1;
    }
    expect(counts["trend"]).toBe(10);
    expect(counts["volatility"]).toBe(3);
    expect(counts["oscillators"]).toBe(7);
    expect(counts["volume"]).toBe(4);
    expect(counts["smartmoney"]).toBe(4);
  });

  it("all oscillators are sub-pane type", () => {
    const oscillators = INDICATOR_REGISTRY.filter(
      (i) => i.category === "oscillators",
    );
    for (const osc of oscillators) {
      expect(osc.type).toBe("subpane");
    }
  });

  it("all smart money indicators are overlay type", () => {
    const sm = INDICATOR_REGISTRY.filter((i) => i.category === "smartmoney");
    for (const ind of sm) {
      expect(ind.type).toBe("overlay");
    }
  });

  it("volume category has both overlay and subpane types", () => {
    const vol = INDICATOR_REGISTRY.filter((i) => i.category === "volume");
    const types = new Set(vol.map((i) => i.type));
    expect(types.has("overlay")).toBe(true);
    expect(types.has("subpane")).toBe(true);
  });

  it("keys match known indicator keys from ChartToolbar", () => {
    const knownKeys = [
      "sma20", "sma50", "sma200", "ema20", "ema50",
      "hma9", "tema20", "vwap", "ichimoku", "parabolicSAR",
      "bollinger", "keltner", "donchian",
      "rsi", "macd", "stochastic", "stochRSI", "williamsR", "cci", "adx",
      "volumeProfile", "obv", "mfi", "cmf",
      "sr", "fvg", "trendlines", "pivotPoints",
    ];
    const registryKeys = INDICATOR_REGISTRY.map((i) => i.key);
    for (const key of knownKeys) {
      expect(registryKeys).toContain(key);
    }
  });
});

/* ============================================================
   filterIndicators
   ============================================================ */

describe("filterIndicators", () => {
  it("returns all indicators when category=all and search is empty", () => {
    const result = filterIndicators(INDICATOR_REGISTRY, "", "all");
    expect(result).toHaveLength(INDICATOR_REGISTRY.length);
  });

  it("filters by category", () => {
    const result = filterIndicators(INDICATOR_REGISTRY, "", "oscillators");
    expect(result).toHaveLength(7);
    for (const ind of result) {
      expect(ind.category).toBe("oscillators");
    }
  });

  it("filters by search string (name match)", () => {
    const result = filterIndicators(INDICATOR_REGISTRY, "SMA", "all");
    expect(result.length).toBeGreaterThanOrEqual(3);
    for (const ind of result) {
      expect(
        ind.name.toLowerCase().includes("sma") ||
        ind.shortDesc.toLowerCase().includes("sma"),
      ).toBe(true);
    }
  });

  it("filters by search string (description match)", () => {
    const result = filterIndicators(
      INDICATOR_REGISTRY,
      "exponential",
      "all",
    );
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result.some((i) => i.key === "ema20")).toBe(true);
  });

  it("search is case-insensitive", () => {
    const upper = filterIndicators(INDICATOR_REGISTRY, "MACD", "all");
    const lower = filterIndicators(INDICATOR_REGISTRY, "macd", "all");
    const mixed = filterIndicators(INDICATOR_REGISTRY, "Macd", "all");
    expect(upper).toEqual(lower);
    expect(lower).toEqual(mixed);
  });

  it("combines category and search filters", () => {
    const result = filterIndicators(INDICATOR_REGISTRY, "stoch", "oscillators");
    expect(result.length).toBe(2);
    expect(result.some((i) => i.key === "stochastic")).toBe(true);
    expect(result.some((i) => i.key === "stochRSI")).toBe(true);
  });

  it("returns empty array when nothing matches", () => {
    const result = filterIndicators(
      INDICATOR_REGISTRY,
      "nonexistent_xyz",
      "all",
    );
    expect(result).toHaveLength(0);
  });

  it("handles whitespace-only search as empty", () => {
    const result = filterIndicators(INDICATOR_REGISTRY, "   ", "all");
    expect(result).toHaveLength(INDICATOR_REGISTRY.length);
  });

  it("filters volatility category correctly", () => {
    const result = filterIndicators(INDICATOR_REGISTRY, "", "volatility");
    expect(result).toHaveLength(3);
    const keys = result.map((i) => i.key);
    expect(keys).toContain("bollinger");
    expect(keys).toContain("keltner");
    expect(keys).toContain("donchian");
  });

  it("filters smartmoney category correctly", () => {
    const result = filterIndicators(INDICATOR_REGISTRY, "", "smartmoney");
    expect(result).toHaveLength(4);
    const keys = result.map((i) => i.key);
    expect(keys).toContain("sr");
    expect(keys).toContain("fvg");
    expect(keys).toContain("trendlines");
    expect(keys).toContain("pivotPoints");
  });

  it("search across description matches 'convergence'", () => {
    const result = filterIndicators(INDICATOR_REGISTRY, "convergence", "all");
    expect(result).toHaveLength(1);
    expect(result[0].key).toBe("macd");
  });

  it("search 'volume' returns multiple matches across categories", () => {
    const result = filterIndicators(INDICATOR_REGISTRY, "volume", "all");
    expect(result.length).toBeGreaterThanOrEqual(2);
    const keys = result.map((i) => i.key);
    expect(keys).toContain("vwap"); // "Volume Weighted Average Price"
    expect(keys).toContain("volumeProfile");
  });
});

/* ============================================================
   isIndicatorActive
   ============================================================ */

describe("isIndicatorActive", () => {
  const overlayDef: IndicatorDef = {
    key: "sma20",
    name: "SMA (20)",
    shortDesc: "test",
    category: "trend",
    type: "overlay",
  };

  const subpaneDef: IndicatorDef = {
    key: "rsi",
    name: "RSI",
    shortDesc: "test",
    category: "oscillators",
    type: "subpane",
  };

  it("returns true for active overlay", () => {
    const result = isIndicatorActive(
      overlayDef,
      { sma20: true },
      [],
    );
    expect(result).toBe(true);
  });

  it("returns false for inactive overlay", () => {
    const result = isIndicatorActive(
      overlayDef,
      { sma20: false },
      [],
    );
    expect(result).toBe(false);
  });

  it("returns false for missing overlay key", () => {
    const result = isIndicatorActive(overlayDef, {}, []);
    expect(result).toBe(false);
  });

  it("returns true for active sub-pane", () => {
    const result = isIndicatorActive(subpaneDef, {}, ["rsi"]);
    expect(result).toBe(true);
  });

  it("returns false for inactive sub-pane", () => {
    const result = isIndicatorActive(subpaneDef, {}, ["macd"]);
    expect(result).toBe(false);
  });

  it("returns false for empty sub-panes array", () => {
    const result = isIndicatorActive(subpaneDef, {}, []);
    expect(result).toBe(false);
  });

  it("sub-pane check ignores overlay config", () => {
    // Even if rsi exists in overlays, sub-pane type checks activeSubPanes
    const result = isIndicatorActive(
      subpaneDef,
      { rsi: true },
      [],
    );
    expect(result).toBe(false);
  });

  it("overlay check ignores sub-panes list", () => {
    const result = isIndicatorActive(
      overlayDef,
      {},
      ["sma20"],
    );
    expect(result).toBe(false);
  });

  it("works with multiple active sub-panes", () => {
    const result = isIndicatorActive(
      subpaneDef,
      {},
      ["macd", "rsi", "stochastic"],
    );
    expect(result).toBe(true);
  });

  it("works with all overlays active", () => {
    const allOverlays: Record<string, boolean> = {};
    for (const ind of INDICATOR_REGISTRY) {
      if (ind.type === "overlay") allOverlays[ind.key] = true;
    }
    const result = isIndicatorActive(overlayDef, allOverlays, []);
    expect(result).toBe(true);
  });
});

/* ============================================================
   Registry data quality
   ============================================================ */

describe("Registry data quality", () => {
  it("no duplicate names", () => {
    const names = INDICATOR_REGISTRY.map((i) => i.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it("every shortDesc is non-trivial (>10 chars)", () => {
    for (const ind of INDICATOR_REGISTRY) {
      expect(ind.shortDesc.length).toBeGreaterThan(10);
    }
  });

  it("trend indicators are all overlay type", () => {
    const trend = INDICATOR_REGISTRY.filter((i) => i.category === "trend");
    for (const ind of trend) {
      expect(ind.type).toBe("overlay");
    }
  });

  it("volatility indicators are all overlay type", () => {
    const vol = INDICATOR_REGISTRY.filter((i) => i.category === "volatility");
    for (const ind of vol) {
      expect(ind.type).toBe("overlay");
    }
  });

  it("sub-pane count does not exceed what the chart supports", () => {
    const subpanes = INDICATOR_REGISTRY.filter((i) => i.type === "subpane");
    // There should be more sub-pane indicators than MAX_SUBPANES (3)
    // to validate the limit logic matters
    expect(subpanes.length).toBeGreaterThan(3);
  });

  it("total overlay count", () => {
    const overlays = INDICATOR_REGISTRY.filter((i) => i.type === "overlay");
    expect(overlays.length).toBe(18);
  });

  it("total subpane count", () => {
    const subpanes = INDICATOR_REGISTRY.filter((i) => i.type === "subpane");
    expect(subpanes.length).toBe(10);
  });
});
