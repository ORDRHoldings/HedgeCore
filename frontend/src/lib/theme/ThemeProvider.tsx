"use client";
/**
 * ThemeProvider — applies appearance settings as CSS variables on document root.
 * Reads from localStorage on mount, syncs changes back.
 * Provides context for settings page and any component that needs theme info.
 */

import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from "react";
import type { AppearanceSettings, ThemeId, Density } from "./types";
import { DEFAULT_APPEARANCE, APPEARANCE_STORAGE_KEY } from "./types";
import { THEME_PRESETS, CURATED_ACCENTS } from "./presets";
import type { ThemeColors } from "./types";

// ── Context value ────────────────────────────────────────────────────────────
interface ThemeContextValue {
  appearance: AppearanceSettings;
  setAppearance: (settings: AppearanceSettings) => void;
  updateAppearance: (patch: Partial<AppearanceSettings>) => void;
  resolvedColors: ThemeColors;
  resolvedMode: "dark" | "light";
  /** Persist current appearance to server (non-critical, localStorage is primary). */
  syncToServer: (token: string) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

// ── Density scale map ────────────────────────────────────────────────────────
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

// ── CSS Variable Application ─────────────────────────────────────────────────
function applyThemeToRoot(appearance: AppearanceSettings) {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  const preset = THEME_PRESETS[appearance.themeId];
  if (!preset) return;

  const colors = { ...preset.colors };

  // Apply accent override
  const accent = CURATED_ACCENTS.find(a => a.id === appearance.accentId);
  if (accent) {
    colors.accentBlue = accent.hex;
    colors.accentBlueDim = accent.dim;
    colors.accentCyan = accent.hex;
    colors.focusRing = accent.hex;
  }

  // Map ThemeColors to CSS variables
  const varMap: Record<string, string> = {
    "--bg-deep":           colors.bgDeep,
    "--bg-panel":          colors.bgPanel,
    "--bg-sub":            colors.bgSub,
    "--bg-sidebar":        colors.bgSidebar,
    "--sidebar-hover":     colors.sidebarHover,
    "--sidebar-border":    colors.sidebarBorder,
    "--sidebar-divider":   colors.sidebarDivider,
    "--border-rim":        colors.borderRim,
    "--border-soft":       colors.borderSoft,
    "--text-primary":      colors.textPrimary,
    "--text-secondary":    colors.textSecondary,
    "--text-tertiary":     colors.textTertiary,
    "--text-disabled":     colors.textDisabled,
    "--accent-blue":       colors.accentBlue,
    "--accent-blue-dim":   colors.accentBlueDim,
    "--accent-cyan":       colors.accentCyan,
    "--accent-indigo":     colors.accentIndigo,
    "--accent-amber":      colors.accentAmber,
    "--accent-red":        colors.accentRed,
    "--accent-green":      colors.accentGreen,
    "--status-pass":       colors.statusPass,
    "--status-fail":       colors.statusFail,
    "--status-warn":       colors.statusWarn,
    "--status-pending":    colors.statusPending,
    // Terminal duplicates (kept for backward compat)
    "--terminal-bg":            colors.bgDeep,
    "--terminal-topbar-bg":     colors.bgPanel,
    "--terminal-rail-bg":       colors.bgSidebar,
    "--terminal-workspace-bg":  colors.bgDeep,
    "--terminal-panel-bg":      colors.bgPanel,
    "--terminal-border":        colors.borderRim,
    "--terminal-text-primary":  colors.textPrimary,
    "--terminal-text-secondary":colors.textSecondary,
    "--terminal-text-tertiary": colors.textTertiary,
    "--terminal-accent":        colors.accentBlue,
    "--terminal-success":       colors.statusPass,
    "--terminal-warning":       colors.statusWarn,
    "--terminal-danger":        colors.statusFail,
  };

  for (const [prop, val] of Object.entries(varMap)) {
    root.style.setProperty(prop, val);
  }

  // Typography
  const fontUI = appearance.uiFont === "system-ui"
    ? "system-ui, -apple-system, sans-serif"
    : `'${appearance.uiFont}', sans-serif`;
  const fontMono = appearance.numericFont === "ui-monospace"
    ? "ui-monospace, 'Cascadia Code', 'Menlo', monospace"
    : `'${appearance.numericFont}', monospace`;

  root.style.setProperty("--font-ui", fontUI);
  root.style.setProperty("--font-terminal", fontUI);
  root.style.setProperty("--font-mono", fontMono);
  root.style.setProperty("--font-terminal-mono", fontMono);
  root.style.setProperty("--font-size-base", `${appearance.baseFontSize}px`);

  // Density
  root.style.setProperty("--density-scale", DENSITY_SCALE[appearance.density]);
  root.style.setProperty("--row-height", DENSITY_ROW[appearance.density]);

  // Tabular numerals
  if (appearance.tabularNumerals) {
    root.style.setProperty("--numeric-variant", "tabular-nums");
  } else {
    root.style.setProperty("--numeric-variant", "normal");
  }

  // Reduced motion
  if (appearance.reducedMotion) {
    root.classList.add("ordr-reduced-motion");
  } else {
    root.classList.remove("ordr-reduced-motion");
  }

  // High contrast
  if (appearance.highContrast) {
    root.classList.add("ordr-high-contrast");
  } else {
    root.classList.remove("ordr-high-contrast");
  }

  // Data attributes for CSS-only consumption + A/B
  root.setAttribute("data-theme", appearance.themeId);
  root.setAttribute("data-variant", preset.mode);
  root.setAttribute("data-density", appearance.density);
  root.setAttribute("data-reduced-motion", String(appearance.reducedMotion));
  root.setAttribute("data-high-contrast", String(appearance.highContrast));
  root.setAttribute("data-tabular-nums", String(appearance.tabularNumerals));

  // Body background + color (immediate visual update)
  document.body.style.background = colors.bgDeep;
  document.body.style.color = colors.textPrimary;
}

// ── Provider ─────────────────────────────────────────────────────────────────
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [appearance, setAppearanceState] = useState<AppearanceSettings>(() => {
    if (typeof window === "undefined") return DEFAULT_APPEARANCE;

    // 1. Load from localStorage
    let base = DEFAULT_APPEARANCE;
    try {
      const raw = localStorage.getItem(APPEARANCE_STORAGE_KEY);
      if (raw) {
        base = { ...DEFAULT_APPEARANCE, ...JSON.parse(raw) };
      }
    } catch { /* ignore */ }

    // 2. URL search params override (for shared links / previews)
    try {
      const params = new URLSearchParams(window.location.search);
      const urlTheme = params.get("theme");
      const urlVariant = params.get("variant");
      if (urlTheme && THEME_PRESETS[urlTheme as ThemeId]) {
        base = { ...base, themeId: urlTheme as ThemeId };
        if (urlVariant === "dark" || urlVariant === "light") {
          base = { ...base, modeOverride: urlVariant };
        }
      }
    } catch { /* ignore */ }

    return base;
  });

  // Apply theme on mount and on change
  useEffect(() => {
    applyThemeToRoot(appearance);
  }, [appearance]);

  const setAppearance = useCallback((settings: AppearanceSettings) => {
    setAppearanceState(settings);
    try {
      localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(settings));
    } catch { /* quota exceeded — ignore */ }
  }, []);

  const updateAppearance = useCallback((patch: Partial<AppearanceSettings>) => {
    setAppearanceState(prev => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(next));
      } catch { /* ignore */ }
      return next;
    });
  }, []);

  const resolvedColors = useMemo(() => {
    const preset = THEME_PRESETS[appearance.themeId];
    if (!preset) return THEME_PRESETS["ordr-default"].colors;
    const colors = { ...preset.colors };
    const accent = CURATED_ACCENTS.find(a => a.id === appearance.accentId);
    if (accent) {
      colors.accentBlue = accent.hex;
      colors.accentBlueDim = accent.dim;
      colors.accentCyan = accent.hex;
      colors.focusRing = accent.hex;
    }
    return colors;
  }, [appearance.themeId, appearance.accentId]);

  const resolvedMode = useMemo(() => {
    if (appearance.modeOverride !== "system") return appearance.modeOverride;
    const preset = THEME_PRESETS[appearance.themeId];
    return preset?.mode ?? "dark";
  }, [appearance.modeOverride, appearance.themeId]);

  const syncToServer = useCallback(async (token: string) => {
    try {
      const { dashboardFetch } = await import("@/lib/api/dashboardClient");
      await dashboardFetch("/v1/ui/appearance", token, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
        }),
      });
    } catch { /* non-critical -- localStorage is primary */ }
  }, [appearance]);

  const ctx = useMemo<ThemeContextValue>(() => ({
    appearance,
    setAppearance,
    updateAppearance,
    resolvedColors,
    resolvedMode,
    syncToServer,
  }), [appearance, setAppearance, updateAppearance, resolvedColors, resolvedMode, syncToServer]);

  return (
    <ThemeContext.Provider value={ctx}>
      {children}
    </ThemeContext.Provider>
  );
}
