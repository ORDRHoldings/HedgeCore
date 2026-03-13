export { ThemeProvider, useTheme } from "./ThemeProvider";
export { THEME_PRESETS, CURATED_ACCENTS } from "./presets";
export { TEMPLATES, TEMPLATE_MAP } from "./templates";
export type { AppearanceSettings, ThemeColors, ThemeId, AccentId, Density, TemplateId } from "./types";
export { DEFAULT_APPEARANCE, APPEARANCE_STORAGE_KEY } from "./types";
export { validateThemeContrast, validateAccentContrast, contrastRatio } from "./contrast";
