/**
 * WCAG Contrast Checker -- validates accessibility of theme token pairs.
 * Uses WCAG 2.1 relative luminance + contrast ratio formulas.
 */

/** Parse hex color (#RGB or #RRGGBB) to [r, g, b] in 0-255 */
export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  if (h.length === 3) {
    return [
      parseInt(h[0] + h[0], 16),
      parseInt(h[1] + h[1], 16),
      parseInt(h[2] + h[2], 16),
    ];
  }
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** Relative luminance per WCAG 2.1 (0 = black, 1 = white) */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(c => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio between two hex colors (always >= 1) */
export function contrastRatio(fg: string, bg: string): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// -- Thresholds --
export const WCAG_AA_TEXT = 4.5;        // Normal text
export const WCAG_AA_LARGE = 3.0;       // Large text (>=18px or >=14px bold)
export const WCAG_AAA_TEXT = 7.0;       // Enhanced contrast
export const WCAG_NON_TEXT = 3.0;       // UI components, borders, focus rings

// -- Validation result --
export interface ContrastResult {
  pair:      string;
  fg:        string;
  bg:        string;
  ratio:     number;
  required:  number;
  level:     "AA" | "AAA" | "non-text";
  pass:      boolean;
}

/** Returns true if hex is a valid 6-digit hex color (ignoring rgba) */
function isHex(color: string): boolean {
  return /^#[0-9A-Fa-f]{3,6}$/.test(color);
}

/**
 * Validate critical contrast pairs for a theme.
 * Returns array of results. Any result with pass=false means the theme fails.
 */
export function validateThemeContrast(colors: {
  bgDeep: string;
  bgPanel: string;
  textPrimary: string;
  textSecondary: string;
  borderRim: string;
  focusRing: string;
  accentBlue: string;
}): ContrastResult[] {
  const results: ContrastResult[] = [];

  const check = (
    pair: string,
    fg: string,
    bg: string,
    required: number,
    level: ContrastResult["level"]
  ) => {
    if (!isHex(fg) || !isHex(bg)) return; // skip rgba values
    const ratio = contrastRatio(fg, bg);
    results.push({ pair, fg, bg, ratio, required, level, pass: ratio >= required });
  };

  // Text on backgrounds (AA normal text)
  check("text-primary on bg-deep",    colors.textPrimary,   colors.bgDeep,  WCAG_AA_TEXT, "AA");
  check("text-primary on bg-panel",   colors.textPrimary,   colors.bgPanel, WCAG_AA_TEXT, "AA");
  check("text-secondary on bg-deep",  colors.textSecondary, colors.bgDeep,  WCAG_AA_TEXT, "AA");
  check("text-secondary on bg-panel", colors.textSecondary, colors.bgPanel, WCAG_AA_TEXT, "AA");

  // Non-text contrast (borders, focus rings)
  check("border-rim vs bg-panel",     colors.borderRim,     colors.bgPanel, WCAG_NON_TEXT, "non-text");
  check("focus-ring vs bg-deep",      colors.focusRing,     colors.bgDeep,  WCAG_NON_TEXT, "non-text");
  check("focus-ring vs bg-panel",     colors.focusRing,     colors.bgPanel, WCAG_NON_TEXT, "non-text");

  // Button text on accent (white text on accent bg)
  // For dark themes, assume white text (#FFFFFF); for light, assume dark text (#1A1A2E)
  const btnText = relativeLuminance(colors.bgDeep) < 0.2 ? "#FFFFFF" : "#1A1A2E";
  check("button-text on accent",      btnText,              colors.accentBlue, WCAG_AA_TEXT, "AA");

  return results;
}

/**
 * Quick check: does a curated accent pass contrast against the theme surfaces?
 */
export function validateAccentContrast(
  accentHex: string,
  bgDeep: string,
  bgPanel: string,
): { passOnDeep: boolean; passOnPanel: boolean; ratioDeep: number; ratioPanel: number } {
  const ratioDeep  = contrastRatio(accentHex, bgDeep);
  const ratioPanel = contrastRatio(accentHex, bgPanel);
  return {
    passOnDeep:  ratioDeep  >= WCAG_NON_TEXT,
    passOnPanel: ratioPanel >= WCAG_NON_TEXT,
    ratioDeep,
    ratioPanel,
  };
}
