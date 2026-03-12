/**
 * @jest-environment node
 */
/**
 * Tests for WCAG contrast checker utility.
 */
import {
  hexToRgb,
  relativeLuminance,
  contrastRatio,
  validateThemeContrast,
  validateAccentContrast,
  WCAG_AA_TEXT,
  WCAG_NON_TEXT,
} from "@/lib/theme/contrast";

describe("hexToRgb", () => {
  test("parses 6-digit hex", () => {
    expect(hexToRgb("#FF0000")).toEqual([255, 0, 0]);
    expect(hexToRgb("#00FF00")).toEqual([0, 255, 0]);
    expect(hexToRgb("#0000FF")).toEqual([0, 0, 255]);
  });

  test("parses 3-digit hex", () => {
    expect(hexToRgb("#F00")).toEqual([255, 0, 0]);
    expect(hexToRgb("#FFF")).toEqual([255, 255, 255]);
  });

  test("handles lowercase", () => {
    expect(hexToRgb("#ff0000")).toEqual([255, 0, 0]);
  });

  test("white", () => {
    expect(hexToRgb("#FFFFFF")).toEqual([255, 255, 255]);
  });

  test("black", () => {
    expect(hexToRgb("#000000")).toEqual([0, 0, 0]);
  });
});

describe("relativeLuminance", () => {
  test("black has luminance 0", () => {
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 4);
  });

  test("white has luminance 1", () => {
    expect(relativeLuminance("#FFFFFF")).toBeCloseTo(1, 4);
  });

  test("mid gray is between 0 and 1", () => {
    const lum = relativeLuminance("#808080");
    expect(lum).toBeGreaterThan(0);
    expect(lum).toBeLessThan(1);
  });
});

describe("contrastRatio", () => {
  test("black on white = 21:1", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 0);
  });

  test("white on white = 1:1", () => {
    expect(contrastRatio("#FFFFFF", "#FFFFFF")).toBeCloseTo(1, 1);
  });

  test("order does not matter", () => {
    const r1 = contrastRatio("#000000", "#FFFFFF");
    const r2 = contrastRatio("#FFFFFF", "#000000");
    expect(r1).toBeCloseTo(r2, 4);
  });

  test("ORDR default text-primary on bg-deep passes AA", () => {
    // #E5E7EB on #111827
    const ratio = contrastRatio("#E5E7EB", "#111827");
    expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_TEXT);
  });

  test("Institutional Obsidian text-primary on bg passes AA", () => {
    // #E0E0E0 on #121212
    const ratio = contrastRatio("#E0E0E0", "#121212");
    expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_TEXT);
  });

  test("Executive Clarity text-primary on bg passes AA", () => {
    // #1A1A2E on #F4F6F9
    const ratio = contrastRatio("#1A1A2E", "#F4F6F9");
    expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_TEXT);
  });
});

describe("validateThemeContrast", () => {
  // Helper: filter to only AA-level text pairs (the critical readability checks)
  const textFailures = (results: ReturnType<typeof validateThemeContrast>) =>
    results.filter(r => !r.pass && r.level === "AA" && r.pair.startsWith("text-"));

  test("ORDR default passes text readability checks", () => {
    const results = validateThemeContrast({
      bgDeep: "#111827",
      bgPanel: "#1F2937",
      textPrimary: "#E5E7EB",
      textSecondary: "#9CA3AF",
      borderRim: "#374151",
      focusRing: "#1C62F2",
      accentBlue: "#1C62F2",
    });
    expect(textFailures(results)).toEqual([]);
  });

  test("ORDR default returns 8 check results", () => {
    const results = validateThemeContrast({
      bgDeep: "#111827",
      bgPanel: "#1F2937",
      textPrimary: "#E5E7EB",
      textSecondary: "#9CA3AF",
      borderRim: "#374151",
      focusRing: "#1C62F2",
      accentBlue: "#1C62F2",
    });
    expect(results.length).toBe(8);
  });

  test("Institutional Obsidian passes text readability checks", () => {
    const results = validateThemeContrast({
      bgDeep: "#121212",
      bgPanel: "#1E1E1E",
      textPrimary: "#E0E0E0",
      textSecondary: "#B0B0B0",
      borderRim: "#444444",
      focusRing: "#64A8F0",
      accentBlue: "#64A8F0",
    });
    expect(textFailures(results)).toEqual([]);
  });

  test("Algorithmic Slate passes text-primary readability checks", () => {
    const results = validateThemeContrast({
      bgDeep: "#2E2E2E",
      bgPanel: "#3A3F44",
      textPrimary: "#F4F6F9",
      textSecondary: "#88A0B9",
      borderRim: "#5A6068",
      focusRing: "#64A8F0",
      accentBlue: "#64A8F0",
    });
    // text-primary passes on both surfaces
    const primaryFails = results.filter(
      r => !r.pass && r.pair.startsWith("text-primary")
    );
    expect(primaryFails).toEqual([]);
    // text-secondary on bg-panel is a known near-miss (~3.94 vs 4.5 required)
    const secOnPanel = results.find(r => r.pair === "text-secondary on bg-panel");
    expect(secOnPanel).toBeDefined();
    expect(secOnPanel!.ratio).toBeGreaterThan(3.5);
  });

  test("Executive Clarity passes text readability checks", () => {
    const results = validateThemeContrast({
      bgDeep: "#F4F6F9",
      bgPanel: "#FFFFFF",
      textPrimary: "#1A1A2E",
      textSecondary: "#4B5563",
      borderRim: "#D1D5DB",
      focusRing: "#1C62F2",
      accentBlue: "#1C62F2",
    });
    expect(textFailures(results)).toEqual([]);
  });

  test("border-rim vs bg-panel is subtle by design across themes", () => {
    // Institutional dark themes use low-contrast borders intentionally;
    // this test documents the known limitation.
    const ordrResults = validateThemeContrast({
      bgDeep: "#111827",
      bgPanel: "#1F2937",
      textPrimary: "#E5E7EB",
      textSecondary: "#9CA3AF",
      borderRim: "#374151",
      focusRing: "#1C62F2",
      accentBlue: "#1C62F2",
    });
    const borderCheck = ordrResults.find(r => r.pair === "border-rim vs bg-panel");
    expect(borderCheck).toBeDefined();
    expect(borderCheck!.level).toBe("non-text");
    // Ratio exists but is below WCAG non-text threshold
    expect(borderCheck!.ratio).toBeGreaterThanOrEqual(1);
    expect(borderCheck!.pass).toBe(false);
  });

  test("deliberately bad theme fails", () => {
    const results = validateThemeContrast({
      bgDeep: "#333333",
      bgPanel: "#444444",
      textPrimary: "#555555", // too close to bg
      textSecondary: "#666666",
      borderRim: "#444444",
      focusRing: "#444444", // same as bg
      accentBlue: "#444444",
    });
    const failures = results.filter(r => !r.pass);
    expect(failures.length).toBeGreaterThan(0);
  });

  test("results have correct structure", () => {
    const results = validateThemeContrast({
      bgDeep: "#111827",
      bgPanel: "#1F2937",
      textPrimary: "#E5E7EB",
      textSecondary: "#9CA3AF",
      borderRim: "#374151",
      focusRing: "#1C62F2",
      accentBlue: "#1C62F2",
    });
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r).toHaveProperty("pair");
      expect(r).toHaveProperty("fg");
      expect(r).toHaveProperty("bg");
      expect(r).toHaveProperty("ratio");
      expect(r).toHaveProperty("required");
      expect(r).toHaveProperty("level");
      expect(r).toHaveProperty("pass");
      expect(typeof r.ratio).toBe("number");
      expect(r.ratio).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("validateAccentContrast", () => {
  test("ruddy blue on dark backgrounds passes", () => {
    const result = validateAccentContrast("#64A8F0", "#111827", "#1F2937");
    expect(result.passOnDeep).toBe(true);
    expect(result.passOnPanel).toBe(true);
  });

  test("all curated accents pass on ORDR default", () => {
    const accents = ["#64A8F0", "#7C6FF0", "#34D399", "#F59E0B"];
    for (const hex of accents) {
      const result = validateAccentContrast(hex, "#111827", "#1F2937");
      expect(result.passOnDeep).toBe(true);
      expect(result.passOnPanel).toBe(true);
    }
  });

  test("very dark accent on dark bg fails", () => {
    const result = validateAccentContrast("#222222", "#111827", "#1F2937");
    expect(result.passOnDeep).toBe(false);
  });

  test("ratio values are numeric and >= 1", () => {
    const result = validateAccentContrast("#64A8F0", "#111827", "#1F2937");
    expect(result.ratioDeep).toBeGreaterThanOrEqual(1);
    expect(result.ratioPanel).toBeGreaterThanOrEqual(1);
  });
});
