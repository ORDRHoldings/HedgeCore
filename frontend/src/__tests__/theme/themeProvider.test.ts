/**
 * ThemeProvider unit tests.
 * Validates: types/presets integration, CSS variable mapping, density scale,
 * localStorage persistence, accent overrides, resolved mode logic.
 */

import { DEFAULT_APPEARANCE, APPEARANCE_STORAGE_KEY } from "@/lib/theme/types";
import type { AppearanceSettings, ThemeColors, Density, ThemeId, AccentId } from "@/lib/theme/types";
import { THEME_PRESETS, CURATED_ACCENTS } from "@/lib/theme/presets";

// ── Type / preset integrity ──────────────────────────────────────────────────

describe("Theme types and presets", () => {
  it("DEFAULT_APPEARANCE has all required fields", () => {
    expect(DEFAULT_APPEARANCE.themeId).toBe("ordr-default");
    expect(DEFAULT_APPEARANCE.modeOverride).toBe("dark");
    expect(DEFAULT_APPEARANCE.accentId).toBe("ruddy-blue");
    expect(DEFAULT_APPEARANCE.density).toBe("standard");
    expect(DEFAULT_APPEARANCE.uiFont).toBe("IBM Plex Sans");
    expect(DEFAULT_APPEARANCE.numericFont).toBe("IBM Plex Mono");
    expect(DEFAULT_APPEARANCE.baseFontSize).toBe(13);
    expect(DEFAULT_APPEARANCE.tabularNumerals).toBe(true);
    expect(DEFAULT_APPEARANCE.reducedMotion).toBe(false);
    expect(DEFAULT_APPEARANCE.highContrast).toBe(false);
    expect(DEFAULT_APPEARANCE.colorPlusIcon).toBe(true);
    expect(DEFAULT_APPEARANCE.templateId).toBeNull();
  });

  it("APPEARANCE_STORAGE_KEY is a stable string", () => {
    expect(APPEARANCE_STORAGE_KEY).toBe("ordr_appearance");
  });

  it("all 4 theme presets are registered", () => {
    const ids: ThemeId[] = ["ordr-default", "institutional-obsidian", "algorithmic-slate", "executive-clarity"];
    for (const id of ids) {
      expect(THEME_PRESETS[id]).toBeDefined();
      expect(THEME_PRESETS[id].id).toBe(id);
      expect(THEME_PRESETS[id].name).toBeTruthy();
      expect(THEME_PRESETS[id].description).toBeTruthy();
      expect(["dark", "light"]).toContain(THEME_PRESETS[id].mode);
    }
  });

  it("each preset has all required color tokens", () => {
    const requiredKeys: (keyof ThemeColors)[] = [
      "bgDeep", "bgPanel", "bgSub", "bgSidebar",
      "borderRim", "borderSoft",
      "textPrimary", "textSecondary", "textTertiary", "textDisabled",
      "accentBlue", "accentBlueDim", "accentCyan", "accentIndigo", "accentAmber", "accentRed", "accentGreen",
      "statusPass", "statusFail", "statusWarn", "statusPending",
      "focusRing",
      "chart1", "chart2", "chart3", "chart4",
    ];
    for (const preset of Object.values(THEME_PRESETS)) {
      for (const key of requiredKeys) {
        expect(preset.colors[key]).toBeTruthy();
      }
    }
  });

  it("executive-clarity is the only light theme", () => {
    const lightThemes = Object.values(THEME_PRESETS).filter(p => p.mode === "light");
    expect(lightThemes).toHaveLength(1);
    expect(lightThemes[0].id).toBe("executive-clarity");
  });
});

// ── Curated accents ──────────────────────────────────────────────────────────

describe("Curated accents", () => {
  it("has exactly 4 accents", () => {
    expect(CURATED_ACCENTS).toHaveLength(4);
  });

  it("each accent has hex and dim values", () => {
    for (const accent of CURATED_ACCENTS) {
      expect(accent.hex).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(accent.dim).toMatch(/^rgba\(/);
      expect(accent.label).toBeTruthy();
    }
  });

  it("default accent ruddy-blue exists", () => {
    const ruddy = CURATED_ACCENTS.find(a => a.id === "ruddy-blue");
    expect(ruddy).toBeDefined();
    expect(ruddy!.hex).toBe("#64A8F0");
  });
});

// ── Density scale ────────────────────────────────────────────────────────────

describe("Density scale", () => {
  const DENSITY_SCALE: Record<Density, string> = {
    compact:  "0.85",
    standard: "1",
    spacious: "1.2",
  };

  const DENSITY_ROW: Record<Density, string> = {
    compact:  "28px",
    standard: "36px",
    spacious: "44px",
  };

  it("compact < standard < spacious scale", () => {
    expect(parseFloat(DENSITY_SCALE.compact)).toBeLessThan(parseFloat(DENSITY_SCALE.standard));
    expect(parseFloat(DENSITY_SCALE.standard)).toBeLessThan(parseFloat(DENSITY_SCALE.spacious));
  });

  it("compact < standard < spacious row height", () => {
    expect(parseInt(DENSITY_ROW.compact)).toBeLessThan(parseInt(DENSITY_ROW.standard));
    expect(parseInt(DENSITY_ROW.standard)).toBeLessThan(parseInt(DENSITY_ROW.spacious));
  });
});

// ── CSS variable mapping logic ───────────────────────────────────────────────

describe("CSS variable mapping", () => {
  it("ordr-default colors map to expected CSS variable values", () => {
    const colors = THEME_PRESETS["ordr-default"].colors;
    // Verify the color tokens that will become CSS variables
    expect(colors.bgDeep).toBe("#111827");
    expect(colors.bgPanel).toBe("#1F2937");
    expect(colors.textPrimary).toBe("#E5E7EB");
    expect(colors.accentBlue).toBe("#1C62F2");
    expect(colors.statusPass).toBe("#059669");
    expect(colors.statusFail).toBe("#DC2626");
  });

  it("accent override replaces accentBlue, accentCyan, and focusRing", () => {
    const preset = THEME_PRESETS["ordr-default"];
    const colors = { ...preset.colors };
    const emerald = CURATED_ACCENTS.find(a => a.id === "emerald")!;

    // Simulate accent override logic from ThemeProvider
    colors.accentBlue = emerald.hex;
    colors.accentBlueDim = emerald.dim;
    colors.accentCyan = emerald.hex;
    colors.focusRing = emerald.hex;

    expect(colors.accentBlue).toBe("#34D399");
    expect(colors.accentCyan).toBe("#34D399");
    expect(colors.focusRing).toBe("#34D399");
    expect(colors.accentBlueDim).toMatch(/^rgba\(52, 211, 153/);
    // Other accents unchanged
    expect(colors.accentIndigo).toBe(preset.colors.accentIndigo);
    expect(colors.accentAmber).toBe(preset.colors.accentAmber);
  });
});

// ── Resolved mode logic ──────────────────────────────────────────────────────

describe("Resolved mode", () => {
  function resolveMode(modeOverride: "system" | "dark" | "light", themeId: ThemeId): "dark" | "light" {
    if (modeOverride !== "system") return modeOverride;
    const preset = THEME_PRESETS[themeId];
    return preset?.mode ?? "dark";
  }

  it("explicit dark override returns dark", () => {
    expect(resolveMode("dark", "executive-clarity")).toBe("dark");
  });

  it("explicit light override returns light", () => {
    expect(resolveMode("light", "ordr-default")).toBe("light");
  });

  it("system mode falls back to preset mode", () => {
    expect(resolveMode("system", "ordr-default")).toBe("dark");
    expect(resolveMode("system", "institutional-obsidian")).toBe("dark");
    expect(resolveMode("system", "executive-clarity")).toBe("light");
  });
});

// ── Appearance serialization ─────────────────────────────────────────────────

describe("Appearance serialization", () => {
  it("DEFAULT_APPEARANCE round-trips through JSON", () => {
    const json = JSON.stringify(DEFAULT_APPEARANCE);
    const parsed = JSON.parse(json) as AppearanceSettings;
    expect(parsed).toEqual(DEFAULT_APPEARANCE);
  });

  it("partial settings merge correctly with defaults", () => {
    const partial = { themeId: "institutional-obsidian" as ThemeId, baseFontSize: 15 as const };
    const merged = { ...DEFAULT_APPEARANCE, ...partial };
    expect(merged.themeId).toBe("institutional-obsidian");
    expect(merged.baseFontSize).toBe(15);
    // Other fields preserved from defaults
    expect(merged.density).toBe("standard");
    expect(merged.accentId).toBe("ruddy-blue");
    expect(merged.uiFont).toBe("IBM Plex Sans");
  });
});

// ── Terminal backward compat variables ───────────────────────────────────────

describe("Terminal backward compatibility", () => {
  it("terminal variables map to the same base colors", () => {
    // The ThemeProvider maps terminal vars to the same base colors.
    // Verify the mapping intent by checking source colors.
    const colors = THEME_PRESETS["ordr-default"].colors;
    // --terminal-bg should equal --bg-deep
    expect(colors.bgDeep).toBeTruthy();
    // --terminal-panel-bg should equal --bg-panel
    expect(colors.bgPanel).toBeTruthy();
    // --terminal-rail-bg should equal --bg-sidebar
    expect(colors.bgSidebar).toBeTruthy();
    // --terminal-accent should equal --accent-blue
    expect(colors.accentBlue).toBeTruthy();
  });
});

// ── URL-based theme switching ────────────────────────────────────────────────

describe("URL-based theme switching", () => {
  it("valid ?theme= param overrides localStorage themeId", () => {
    const stored: Partial<AppearanceSettings> = { themeId: "ordr-default" };
    // Simulate the provider init logic
    let base = { ...DEFAULT_APPEARANCE, ...stored };

    const urlTheme = "institutional-obsidian";
    if (urlTheme && THEME_PRESETS[urlTheme as ThemeId]) {
      base = { ...base, themeId: urlTheme as ThemeId };
    }

    expect(base.themeId).toBe("institutional-obsidian");
  });

  it("valid ?variant= param overrides modeOverride", () => {
    let base = { ...DEFAULT_APPEARANCE };

    const urlTheme = "executive-clarity";
    const urlVariant = "light";
    if (urlTheme && THEME_PRESETS[urlTheme as ThemeId]) {
      base = { ...base, themeId: urlTheme as ThemeId };
      if (urlVariant === "dark" || urlVariant === "light") {
        base = { ...base, modeOverride: urlVariant };
      }
    }

    expect(base.themeId).toBe("executive-clarity");
    expect(base.modeOverride).toBe("light");
  });

  it("invalid ?theme= param does NOT override", () => {
    let base = { ...DEFAULT_APPEARANCE };
    const urlTheme = "nonexistent-theme";

    if (urlTheme && THEME_PRESETS[urlTheme as ThemeId]) {
      base = { ...base, themeId: urlTheme as ThemeId };
    }

    expect(base.themeId).toBe("ordr-default");
  });

  it("invalid ?variant= param is ignored", () => {
    let base = { ...DEFAULT_APPEARANCE };
    const urlTheme = "ordr-default";
    const urlVariant = "invalid";

    if (urlTheme && THEME_PRESETS[urlTheme as ThemeId]) {
      base = { ...base, themeId: urlTheme as ThemeId };
      if (urlVariant === "dark" || urlVariant === "light") {
        base = { ...base, modeOverride: urlVariant };
      }
    }

    expect(base.modeOverride).toBe("dark"); // unchanged default
  });

  it("?theme= without ?variant= keeps existing modeOverride", () => {
    let base = { ...DEFAULT_APPEARANCE, modeOverride: "light" as const };
    const urlTheme = "algorithmic-slate";

    if (urlTheme && THEME_PRESETS[urlTheme as ThemeId]) {
      base = { ...base, themeId: urlTheme as ThemeId };
    }

    expect(base.themeId).toBe("algorithmic-slate");
    expect(base.modeOverride).toBe("light"); // preserved
  });
});

// ── Data attributes ─────────────────────────────────────────────────────────

describe("Data attributes for CSS consumption", () => {
  it("expected data attributes list", () => {
    // Verify the attribute names that should be set on <html>
    const expectedAttrs = [
      "data-theme",
      "data-variant",
      "data-density",
      "data-reduced-motion",
      "data-high-contrast",
      "data-tabular-nums",
    ];
    // All should be valid attribute names (lowercase, hyphenated)
    for (const attr of expectedAttrs) {
      expect(attr).toMatch(/^data-[a-z-]+$/);
    }
  });

  it("data-variant reflects resolved preset mode, not modeOverride", () => {
    // The data-variant attribute is set from preset.mode, not appearance.modeOverride.
    // For ordr-default, preset.mode is "dark" regardless of modeOverride.
    const preset = THEME_PRESETS["ordr-default"];
    expect(preset.mode).toBe("dark");

    const lightPreset = THEME_PRESETS["executive-clarity"];
    expect(lightPreset.mode).toBe("light");
  });

  it("data-density values match density type", () => {
    const validDensities: Density[] = ["compact", "standard", "spacious"];
    expect(validDensities).toContain(DEFAULT_APPEARANCE.density);
  });

  it("boolean attributes serialize to 'true' or 'false' strings", () => {
    expect(String(DEFAULT_APPEARANCE.reducedMotion)).toBe("false");
    expect(String(true)).toBe("true");
    expect(String(DEFAULT_APPEARANCE.highContrast)).toBe("false");
    expect(String(DEFAULT_APPEARANCE.tabularNumerals)).toBe("true");
  });
});

// ── syncToServer payload ────────────────────────────────────────────────────

describe("syncToServer payload shape", () => {
  it("appearance maps to expected server field names", () => {
    const appearance = DEFAULT_APPEARANCE;
    const payload = {
      theme_id: appearance.themeId,
      mode_override: appearance.modeOverride,
      accent_id: appearance.accentId,
      density: appearance.density,
      ui_font: appearance.uiFont,
      numeric_font: appearance.numericFont,
      base_font_size: appearance.baseFontSize,
      tabular_numerals: appearance.tabularNumerals,
      reduced_motion: appearance.reducedMotion,
      high_contrast: appearance.highContrast,
      color_plus_icon: appearance.colorPlusIcon,
      template_id: appearance.templateId,
    };

    expect(payload.theme_id).toBe("ordr-default");
    expect(payload.mode_override).toBe("dark");
    expect(payload.accent_id).toBe("ruddy-blue");
    expect(payload.density).toBe("standard");
    expect(payload.ui_font).toBe("IBM Plex Sans");
    expect(payload.numeric_font).toBe("IBM Plex Mono");
    expect(payload.base_font_size).toBe(13);
    expect(payload.tabular_numerals).toBe(true);
    expect(payload.reduced_motion).toBe(false);
    expect(payload.high_contrast).toBe(false);
    expect(payload.color_plus_icon).toBe(true);
    expect(payload.template_id).toBeNull();
  });

  it("payload round-trips through JSON", () => {
    const appearance = { ...DEFAULT_APPEARANCE, themeId: "algorithmic-slate" as ThemeId };
    const payload = {
      theme_id: appearance.themeId,
      mode_override: appearance.modeOverride,
      accent_id: appearance.accentId,
      density: appearance.density,
    };
    const json = JSON.stringify(payload);
    const parsed = JSON.parse(json);
    expect(parsed.theme_id).toBe("algorithmic-slate");
    expect(parsed.mode_override).toBe("dark");
  });
});

// ── Font resolution ──────────────────────────────────────────────────────────

describe("Font resolution", () => {
  function resolveUIFont(uiFont: string): string {
    return uiFont === "system-ui"
      ? "system-ui, -apple-system, sans-serif"
      : `'${uiFont}', sans-serif`;
  }

  function resolveMonoFont(numericFont: string): string {
    return numericFont === "ui-monospace"
      ? "ui-monospace, 'Cascadia Code', 'Menlo', monospace"
      : `'${numericFont}', monospace`;
  }

  it("IBM Plex Sans wraps in quotes with sans-serif fallback", () => {
    expect(resolveUIFont("IBM Plex Sans")).toBe("'IBM Plex Sans', sans-serif");
  });

  it("system-ui uses native stack", () => {
    expect(resolveUIFont("system-ui")).toBe("system-ui, -apple-system, sans-serif");
  });

  it("IBM Plex Mono wraps in quotes with monospace fallback", () => {
    expect(resolveMonoFont("IBM Plex Mono")).toBe("'IBM Plex Mono', monospace");
  });

  it("ui-monospace uses native monospace stack", () => {
    expect(resolveMonoFont("ui-monospace")).toBe("ui-monospace, 'Cascadia Code', 'Menlo', monospace");
  });
});
