/**
 * @jest-environment node
 */
/**
 * Comprehensive tests for operational templates and theme/luminance validation.
 * Covers: TEMPLATES array, TEMPLATE_MAP, each template's specific settings,
 * dark/light luminance invariants.
 */
import { TEMPLATES, TEMPLATE_MAP } from "@/lib/theme/templates";
import { THEME_PRESETS, CURATED_ACCENTS } from "@/lib/theme/presets";
import { DEFAULT_APPEARANCE } from "@/lib/theme/types";
import { relativeLuminance } from "@/lib/theme/contrast";
import type {
  AppearanceSettings,
  ThemeId,
  AccentId,
  Density,
  TemplateId,
  BaseFontSize,
} from "@/lib/theme/types";

const ALL_TEMPLATE_IDS: TemplateId[] = [
  "trading-floor",
  "treasury-ops",
  "executive-review",
  "night-desk",
  "compliance-review",
  "client-presentation",
];

const VALID_THEME_IDS: ThemeId[] = [
  "ordr-default",
  "institutional-obsidian",
  "algorithmic-slate",
  "executive-clarity",
  "midnight-terminal",
  "arctic-frost",
  "warm-carbon",
];

const VALID_ACCENT_IDS: AccentId[] = [
  "ruddy-blue", "violet", "emerald", "amber", "coral", "teal", "rose", "indigo",
];

const VALID_DENSITIES: Density[] = ["compact", "standard", "spacious"];

// ---------------------------------------------------------------------------
// TEMPLATES array
// ---------------------------------------------------------------------------
describe("TEMPLATES array", () => {
  test("contains 6 templates", () => {
    expect(TEMPLATES).toHaveLength(6);
  });

  test("no duplicate ids", () => {
    const ids = TEMPLATES.map(t => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("each has id, name, description, settings", () => {
    for (const t of TEMPLATES) {
      expect(typeof t.id).toBe("string");
      expect(t.id.length).toBeGreaterThan(0);
      expect(typeof t.name).toBe("string");
      expect(t.name.length).toBeGreaterThan(0);
      expect(typeof t.description).toBe("string");
      expect(t.description.length).toBeGreaterThan(0);
      expect(t.settings).toBeDefined();
      expect(typeof t.settings).toBe("object");
    }
  });

  test("all ids are valid TemplateId values", () => {
    for (const t of TEMPLATES) {
      expect(ALL_TEMPLATE_IDS).toContain(t.id);
    }
  });
});

// ---------------------------------------------------------------------------
// TEMPLATE_MAP
// ---------------------------------------------------------------------------
describe("TEMPLATE_MAP", () => {
  test("has same count as TEMPLATES", () => {
    expect(Object.keys(TEMPLATE_MAP)).toHaveLength(TEMPLATES.length);
  });

  test("all template ids are keys", () => {
    for (const t of TEMPLATES) {
      expect(TEMPLATE_MAP).toHaveProperty(t.id);
    }
  });

  test("values reference same objects as array", () => {
    for (const t of TEMPLATES) {
      expect(TEMPLATE_MAP[t.id]).toBe(t);
    }
  });
});

// ---------------------------------------------------------------------------
// Template settings validity (all 6)
// ---------------------------------------------------------------------------
describe("Template settings validity", () => {
  for (const template of TEMPLATES) {
    describe(`template: ${template.id}`, () => {
      const s = template.settings;

      test("references a valid ThemeId", () => {
        expect(VALID_THEME_IDS).toContain(s.themeId);
        expect(THEME_PRESETS[s.themeId]).toBeDefined();
      });

      test("references a valid AccentId", () => {
        expect(VALID_ACCENT_IDS).toContain(s.accentId);
        const accent = CURATED_ACCENTS.find(a => a.id === s.accentId);
        expect(accent).toBeDefined();
      });

      test("references a valid Density", () => {
        expect(VALID_DENSITIES).toContain(s.density);
      });

      test("baseFontSize is 12-16", () => {
        expect(s.baseFontSize).toBeGreaterThanOrEqual(12);
        expect(s.baseFontSize).toBeLessThanOrEqual(16);
      });

      test("templateId matches the template's own id", () => {
        expect(s.templateId).toBe(template.id);
      });

      test("all AppearanceSettings keys present", () => {
        const defaultKeys = Object.keys(DEFAULT_APPEARANCE).sort();
        const templateKeys = Object.keys(s).sort();
        expect(templateKeys).toEqual(defaultKeys);
      });

      test("modeOverride matches referenced theme's mode", () => {
        const preset = THEME_PRESETS[s.themeId];
        // Templates set modeOverride to match the preset's inherent mode
        expect(s.modeOverride).toBe(preset.mode);
      });
    });
  }
});

// ---------------------------------------------------------------------------
// Trading Floor template
// ---------------------------------------------------------------------------
describe("Trading Floor template", () => {
  const t = TEMPLATE_MAP["trading-floor"];

  test("themeId is institutional-obsidian", () => {
    expect(t.settings.themeId).toBe("institutional-obsidian");
  });

  test("density is compact", () => {
    expect(t.settings.density).toBe("compact");
  });

  test("reducedMotion is true", () => {
    expect(t.settings.reducedMotion).toBe(true);
  });

  test("baseFontSize is 12", () => {
    expect(t.settings.baseFontSize).toBe(12);
  });

  test("tabularNumerals is true", () => {
    expect(t.settings.tabularNumerals).toBe(true);
  });

  test("dark modeOverride", () => {
    expect(t.settings.modeOverride).toBe("dark");
  });
});

// ---------------------------------------------------------------------------
// Treasury Ops template
// ---------------------------------------------------------------------------
describe("Treasury Ops template", () => {
  const t = TEMPLATE_MAP["treasury-ops"];

  test("themeId is algorithmic-slate", () => {
    expect(t.settings.themeId).toBe("algorithmic-slate");
  });

  test("density is standard", () => {
    expect(t.settings.density).toBe("standard");
  });

  test("baseFontSize is 13", () => {
    expect(t.settings.baseFontSize).toBe(13);
  });

  test("tabularNumerals is true", () => {
    expect(t.settings.tabularNumerals).toBe(true);
  });

  test("dark modeOverride", () => {
    expect(t.settings.modeOverride).toBe("dark");
  });
});

// ---------------------------------------------------------------------------
// Executive Review template
// ---------------------------------------------------------------------------
describe("Executive Review template", () => {
  const t = TEMPLATE_MAP["executive-review"];

  test("themeId is executive-clarity", () => {
    expect(t.settings.themeId).toBe("executive-clarity");
  });

  test("modeOverride is light", () => {
    expect(t.settings.modeOverride).toBe("light");
  });

  test("density is spacious", () => {
    expect(t.settings.density).toBe("spacious");
  });

  test("baseFontSize is 14", () => {
    expect(t.settings.baseFontSize).toBe(14);
  });

  test("tabularNumerals is true", () => {
    expect(t.settings.tabularNumerals).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Night Desk template
// ---------------------------------------------------------------------------
describe("Night Desk template", () => {
  const t = TEMPLATE_MAP["night-desk"];

  test("themeId is midnight-terminal", () => {
    expect(t.settings.themeId).toBe("midnight-terminal");
  });

  test("density is compact", () => {
    expect(t.settings.density).toBe("compact");
  });

  test("reducedMotion is true", () => {
    expect(t.settings.reducedMotion).toBe(true);
  });

  test("numericFont is JetBrains Mono", () => {
    expect(t.settings.numericFont).toBe("JetBrains Mono");
  });

  test("baseFontSize is 12", () => {
    expect(t.settings.baseFontSize).toBe(12);
  });

  test("dark modeOverride", () => {
    expect(t.settings.modeOverride).toBe("dark");
  });
});

// ---------------------------------------------------------------------------
// Compliance Review template
// ---------------------------------------------------------------------------
describe("Compliance Review template", () => {
  const t = TEMPLATE_MAP["compliance-review"];

  test("themeId is institutional-obsidian", () => {
    expect(t.settings.themeId).toBe("institutional-obsidian");
  });

  test("highContrast is true", () => {
    expect(t.settings.highContrast).toBe(true);
  });

  test("colorPlusIcon is true", () => {
    expect(t.settings.colorPlusIcon).toBe(true);
  });

  test("density is standard", () => {
    expect(t.settings.density).toBe("standard");
  });

  test("baseFontSize is 13", () => {
    expect(t.settings.baseFontSize).toBe(13);
  });
});

// ---------------------------------------------------------------------------
// Client Presentation template
// ---------------------------------------------------------------------------
describe("Client Presentation template", () => {
  const t = TEMPLATE_MAP["client-presentation"];

  test("themeId is arctic-frost", () => {
    expect(t.settings.themeId).toBe("arctic-frost");
  });

  test("modeOverride is light", () => {
    expect(t.settings.modeOverride).toBe("light");
  });

  test("density is spacious", () => {
    expect(t.settings.density).toBe("spacious");
  });

  test("accentId is indigo", () => {
    expect(t.settings.accentId).toBe("indigo");
  });

  test("baseFontSize is 15", () => {
    expect(t.settings.baseFontSize).toBe(15);
  });

  test("uiFont is Inter", () => {
    expect(t.settings.uiFont).toBe("Inter");
  });

  test("colorPlusIcon is false", () => {
    expect(t.settings.colorPlusIcon).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Dark themes luminance
// ---------------------------------------------------------------------------
describe("Dark themes luminance", () => {
  const darkThemes = Object.values(THEME_PRESETS).filter(p => p.mode === "dark");

  test("all dark theme bgDeep luminance < 0.05", () => {
    for (const theme of darkThemes) {
      const lum = relativeLuminance(theme.colors.bgDeep);
      expect(lum).toBeLessThan(0.05);
    }
  });

  test("no pure white (#FFFFFF) text in dark themes", () => {
    for (const theme of darkThemes) {
      expect(theme.colors.textPrimary).not.toBe("#FFFFFF");
    }
  });

  test("no pure black (#000000) bg in dark themes", () => {
    for (const theme of darkThemes) {
      expect(theme.colors.bgDeep).not.toBe("#000000");
    }
  });

  test("dark theme text has high luminance relative to bg", () => {
    for (const theme of darkThemes) {
      const textLum = relativeLuminance(theme.colors.textPrimary);
      const bgLum = relativeLuminance(theme.colors.bgDeep);
      expect(textLum).toBeGreaterThan(bgLum);
    }
  });
});

// ---------------------------------------------------------------------------
// Light themes luminance
// ---------------------------------------------------------------------------
describe("Light themes luminance", () => {
  const lightThemes = Object.values(THEME_PRESETS).filter(p => p.mode === "light");

  test("at least 2 light themes exist", () => {
    expect(lightThemes.length).toBeGreaterThanOrEqual(2);
  });

  test("all light theme bgDeep luminance > 0.7", () => {
    for (const theme of lightThemes) {
      const lum = relativeLuminance(theme.colors.bgDeep);
      expect(lum).toBeGreaterThan(0.7);
    }
  });

  test("text is dark (luminance < 0.1)", () => {
    for (const theme of lightThemes) {
      const lum = relativeLuminance(theme.colors.textPrimary);
      expect(lum).toBeLessThan(0.1);
    }
  });

  test("light theme text has low luminance relative to bg", () => {
    for (const theme of lightThemes) {
      const textLum = relativeLuminance(theme.colors.textPrimary);
      const bgLum = relativeLuminance(theme.colors.bgDeep);
      expect(textLum).toBeLessThan(bgLum);
    }
  });
});
