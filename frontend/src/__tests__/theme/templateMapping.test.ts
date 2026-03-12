/**
 * @jest-environment node
 */
/**
 * Tests for template -> theme + settings mapping.
 */
import { TEMPLATES, TEMPLATE_MAP } from "@/lib/theme/templates";
import { THEME_PRESETS } from "@/lib/theme/presets";
import { DEFAULT_APPEARANCE } from "@/lib/theme/types";
import type { AppearanceSettings } from "@/lib/theme/types";

describe("Templates", () => {
  test("all 3 templates defined", () => {
    expect(TEMPLATES).toHaveLength(3);
  });

  test("each template has required fields", () => {
    for (const t of TEMPLATES) {
      expect(t.id).toBeTruthy();
      expect(t.name).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(t.settings).toBeDefined();
    }
  });

  test("each template references a valid theme", () => {
    for (const t of TEMPLATES) {
      expect(THEME_PRESETS[t.settings.themeId]).toBeDefined();
    }
  });

  test("each template has complete settings", () => {
    const defaultKeys = Object.keys(DEFAULT_APPEARANCE).sort();
    for (const t of TEMPLATES) {
      const templateKeys = Object.keys(t.settings).sort();
      expect(templateKeys).toEqual(defaultKeys);
    }
  });

  test("template IDs match their settings.templateId", () => {
    for (const t of TEMPLATES) {
      expect(t.settings.templateId).toBe(t.id);
    }
  });
});

describe("TEMPLATE_MAP", () => {
  test("maps all 3 templates by id", () => {
    expect(Object.keys(TEMPLATE_MAP)).toHaveLength(3);
    expect(TEMPLATE_MAP["trading-floor"]).toBeDefined();
    expect(TEMPLATE_MAP["treasury-ops"]).toBeDefined();
    expect(TEMPLATE_MAP["executive-review"]).toBeDefined();
  });
});

describe("Trading Floor template", () => {
  const t = TEMPLATE_MAP["trading-floor"];

  test("uses Institutional Obsidian theme", () => {
    expect(t.settings.themeId).toBe("institutional-obsidian");
  });

  test("is compact density", () => {
    expect(t.settings.density).toBe("compact");
  });

  test("has reduced motion ON", () => {
    expect(t.settings.reducedMotion).toBe(true);
  });

  test("has tabular numerals ON", () => {
    expect(t.settings.tabularNumerals).toBe(true);
  });

  test("dark mode", () => {
    expect(t.settings.modeOverride).toBe("dark");
  });
});

describe("Treasury Ops template", () => {
  const t = TEMPLATE_MAP["treasury-ops"];

  test("uses Algorithmic Slate theme", () => {
    expect(t.settings.themeId).toBe("algorithmic-slate");
  });

  test("is standard density", () => {
    expect(t.settings.density).toBe("standard");
  });

  test("tabular numerals ON", () => {
    expect(t.settings.tabularNumerals).toBe(true);
  });
});

describe("Executive Review template", () => {
  const t = TEMPLATE_MAP["executive-review"];

  test("uses Executive Clarity (light) theme", () => {
    expect(t.settings.themeId).toBe("executive-clarity");
    const theme = THEME_PRESETS[t.settings.themeId];
    expect(theme.mode).toBe("light");
  });

  test("is spacious density", () => {
    expect(t.settings.density).toBe("spacious");
  });

  test("base font size increased", () => {
    expect(t.settings.baseFontSize).toBeGreaterThan(DEFAULT_APPEARANCE.baseFontSize);
  });

  test("tabular numerals ON", () => {
    expect(t.settings.tabularNumerals).toBe(true);
  });
});

describe("Theme presets", () => {
  test("all 4 presets defined", () => {
    expect(Object.keys(THEME_PRESETS)).toHaveLength(4);
  });

  test("each preset has complete color set", () => {
    const requiredKeys = [
      "bgDeep", "bgPanel", "bgSub", "bgSidebar",
      "borderRim", "borderSoft",
      "textPrimary", "textSecondary", "textTertiary", "textDisabled",
      "accentBlue", "accentBlueDim",
      "statusPass", "statusFail", "statusWarn",
      "focusRing",
      "chart1", "chart2", "chart3", "chart4",
    ];
    for (const [id, preset] of Object.entries(THEME_PRESETS)) {
      for (const key of requiredKeys) {
        expect(preset.colors).toHaveProperty(key);
      }
    }
  });

  test("dark themes use dark backgrounds", () => {
    const darkThemes = Object.values(THEME_PRESETS).filter(t => t.mode === "dark");
    for (const t of darkThemes) {
      // Dark bg should have low luminance -- just check first hex digit
      const bg = t.colors.bgDeep.replace("#", "");
      const r = parseInt(bg.slice(0, 2), 16);
      expect(r).toBeLessThan(128);
    }
  });

  test("light theme uses light background", () => {
    const light = THEME_PRESETS["executive-clarity"];
    const bg = light.colors.bgDeep.replace("#", "");
    const r = parseInt(bg.slice(0, 2), 16);
    expect(r).toBeGreaterThan(128);
  });

  test("no pure white on pure black in dark defaults", () => {
    const darkThemes = Object.values(THEME_PRESETS).filter(t => t.mode === "dark");
    for (const t of darkThemes) {
      expect(t.colors.bgDeep).not.toBe("#000000");
      expect(t.colors.textPrimary).not.toBe("#FFFFFF");
    }
  });
});

describe("DEFAULT_APPEARANCE", () => {
  test("has all required fields", () => {
    expect(DEFAULT_APPEARANCE.themeId).toBeDefined();
    expect(DEFAULT_APPEARANCE.density).toBeDefined();
    expect(DEFAULT_APPEARANCE.uiFont).toBeDefined();
    expect(DEFAULT_APPEARANCE.numericFont).toBeDefined();
    expect(DEFAULT_APPEARANCE.baseFontSize).toBeDefined();
    expect(DEFAULT_APPEARANCE.tabularNumerals).toBe(true);
    expect(DEFAULT_APPEARANCE.colorPlusIcon).toBe(true);
  });

  test("references a valid theme", () => {
    expect(THEME_PRESETS[DEFAULT_APPEARANCE.themeId]).toBeDefined();
  });
});
