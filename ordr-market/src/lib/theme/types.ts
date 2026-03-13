/**
 * Theme Engine Types — ORDR Terminal Appearance System.
 * All color values are hex strings (#RRGGBB). CSS variables reference these.
 */

// ── Color Token Set ──────────────────────────────────────────────────────────
export interface ThemeColors {
  bgDeep:     string;
  bgPanel:    string;
  bgSub:      string;
  bgSidebar:     string;
  sidebarHover:  string;
  sidebarBorder: string;
  sidebarDivider:string;
  borderRim:  string;
  borderSoft: string;
  textPrimary:   string;
  textSecondary: string;
  textTertiary:  string;
  textDisabled:  string;
  accentBlue:    string;
  accentBlueDim: string;
  accentCyan:    string;
  accentIndigo:  string;
  accentAmber:   string;
  accentRed:     string;
  accentGreen:   string;
  statusPass:  string;
  statusFail:  string;
  statusWarn:  string;
  statusPending: string;
  focusRing: string;
  // Chart series
  chart1: string;
  chart2: string;
  chart3: string;
  chart4: string;
}

// ── Theme Preset ─────────────────────────────────────────────────────────────
export type ThemeId = "ordr-default" | "institutional-obsidian" | "algorithmic-slate" | "executive-clarity" | "midnight-terminal" | "arctic-frost" | "warm-carbon";
export type ThemeMode = "dark" | "light";

export interface ThemePreset {
  id:          ThemeId;
  name:        string;
  description: string;
  mode:        ThemeMode;
  colors:      ThemeColors;
}

// ── Curated Accent ───────────────────────────────────────────────────────────
export type AccentId = "ruddy-blue" | "violet" | "emerald" | "amber" | "coral" | "teal" | "rose" | "indigo";

export interface CuratedAccent {
  id:    AccentId;
  label: string;
  hex:   string;
  dim:   string; // 10% opacity variant for backgrounds
}

// ── Density ──────────────────────────────────────────────────────────────────
export type Density = "compact" | "standard" | "spacious";

// ── Typography ───────────────────────────────────────────────────────────────
export type UIFont = "IBM Plex Sans" | "Inter" | "system-ui";
export type NumericFont = "IBM Plex Mono" | "JetBrains Mono" | "ui-monospace";
export type BaseFontSize = 12 | 13 | 14 | 15 | 16;

// ── Template ─────────────────────────────────────────────────────────────────
export type TemplateId = "trading-floor" | "treasury-ops" | "executive-review" | "night-desk" | "compliance-review" | "client-presentation";

export interface OperationalTemplate {
  id:          TemplateId;
  name:        string;
  description: string;
  settings:    AppearanceSettings;
}

// ── User Appearance Settings (persisted) ─────────────────────────────────────
export interface AppearanceSettings {
  themeId:          ThemeId;
  modeOverride:     "system" | "dark" | "light";
  accentId:         AccentId;
  density:          Density;
  uiFont:           UIFont;
  numericFont:      NumericFont;
  baseFontSize:     BaseFontSize;
  tabularNumerals:  boolean;
  reducedMotion:    boolean;
  highContrast:     boolean;
  colorPlusIcon:    boolean;  // gains/losses show icon + sign, not just color
  templateId:       TemplateId | null;  // null = custom
}

export const DEFAULT_APPEARANCE: AppearanceSettings = {
  themeId:         "institutional-obsidian",
  modeOverride:    "dark",
  accentId:        "ruddy-blue",
  density:         "standard",
  uiFont:          "IBM Plex Sans",
  numericFont:     "IBM Plex Mono",
  baseFontSize:    13,
  tabularNumerals: true,
  reducedMotion:   false,
  highContrast:    false,
  colorPlusIcon:   true,
  templateId:      null,
};

export const APPEARANCE_STORAGE_KEY = "ordr_appearance";
