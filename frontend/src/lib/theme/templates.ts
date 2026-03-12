/**
 * Operational Templates — curated preset bundles.
 * Each template sets multiple appearance settings at once.
 */
import type { OperationalTemplate } from "./types";

export const TEMPLATES: OperationalTemplate[] = [
  {
    id:          "trading-floor",
    name:        "Trading Floor",
    description: "Power-user setup: deep dark, compact density, reduced motion, tabular numbers",
    settings: {
      themeId:         "institutional-obsidian",
      modeOverride:    "dark",
      accentId:        "ruddy-blue",
      density:         "compact",
      uiFont:          "IBM Plex Sans",
      numericFont:     "IBM Plex Mono",
      baseFontSize:    12,
      tabularNumerals: true,
      reducedMotion:   true,
      highContrast:    false,
      colorPlusIcon:   true,
      templateId:      "trading-floor",
    },
  },
  {
    id:          "treasury-ops",
    name:        "Treasury Ops",
    description: "Balanced setup for daily operations: neutral dark, standard density",
    settings: {
      themeId:         "algorithmic-slate",
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
      templateId:      "treasury-ops",
    },
  },
  {
    id:          "executive-review",
    name:        "Executive Review",
    description: "Light theme, spacious layout for presentations and reviews",
    settings: {
      themeId:         "executive-clarity",
      modeOverride:    "light",
      accentId:        "ruddy-blue",
      density:         "spacious",
      uiFont:          "IBM Plex Sans",
      numericFont:     "IBM Plex Mono",
      baseFontSize:    14,
      tabularNumerals: true,
      reducedMotion:   false,
      highContrast:    false,
      colorPlusIcon:   true,
      templateId:      "executive-review",
    },
  },
];

export const TEMPLATE_MAP: Record<string, OperationalTemplate> = Object.fromEntries(
  TEMPLATES.map(t => [t.id, t])
);
