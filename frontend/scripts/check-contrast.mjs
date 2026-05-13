/**
 * check-contrast.mjs
 * WCAG AA contrast checker for ORDR Terminal design tokens.
 * Run: node scripts/check-contrast.mjs
 * Exit 1 if any required pair fails; exit 0 on pass.
 */

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255,
  };
}

function linearize(c) {
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminance({ r, g, b }) {
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

function contrastRatio(hex1, hex2) {
  const l1 = luminance(hexToRgb(hex1));
  const l2 = luminance(hexToRgb(hex2));
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// Design tokens from globals.css
const BG_DEEP    = '#111827';
const BG_PANEL   = '#1F2937';
const BG_SIDEBAR = '#0B1120';
const BG_SUB     = '#293548';

const TEXT_PRIMARY   = '#E5E7EB';
const TEXT_SECONDARY = '#9CA3AF';
const ACCENT_BLUE    = '#1C62F2';
const ACCENT_GREEN   = '#059669';
const ACCENT_AMBER   = '#D97706';
const ACCENT_RED     = '#DC2626';
const WHITE          = '#FFFFFF';

// Pairs: [label, foreground, background, minRatio]
// 4.5 = WCAG AA normal text; 3.0 = AA large text / UI components
const PAIRS = [
  // Primary reading surfaces
  ['primary text on deep bg',   TEXT_PRIMARY,   BG_DEEP,    4.5],
  ['primary text on panel',     TEXT_PRIMARY,   BG_PANEL,   4.5],
  ['primary text on sidebar',   TEXT_PRIMARY,   BG_SIDEBAR, 4.5],
  ['primary text on sub',       TEXT_PRIMARY,   BG_SUB,     4.5],

  // Secondary text — large-text threshold (labels, captions)
  ['secondary text on deep bg', TEXT_SECONDARY, BG_DEEP,    3.0],
  ['secondary text on panel',   TEXT_SECONDARY, BG_PANEL,   3.0],

  // Accent colors on dark panels (buttons, badges, UI components)
  ['accent blue on deep',       ACCENT_BLUE,    BG_DEEP,    3.0],
  ['accent green on deep',      ACCENT_GREEN,   BG_DEEP,    3.0],
  ['accent amber on deep',      ACCENT_AMBER,   BG_DEEP,    3.0],
  ['accent red on deep',        ACCENT_RED,     BG_DEEP,    3.0],

  // White text on accent (buttons with colored bg)
  ['white on accent blue',      WHITE,          ACCENT_BLUE,  4.5],
];

let failed = 0;
for (const [label, fg, bg, min] of PAIRS) {
  const ratio = contrastRatio(fg, bg);
  const pass = ratio >= min;
  const icon = pass ? '✓' : '✗';
  const status = pass ? 'PASS' : `FAIL (min ${min}:1)`;
  process.stdout.write(`${icon} ${ratio.toFixed(2)}:1  ${label}  [${status}]\n`);
  if (!pass) failed++;
}

if (failed > 0) {
  console.error(`\n${failed} contrast pair(s) below WCAG AA threshold.`);
  process.exit(1);
} else {
  process.stdout.write('\nAll contrast checks passed.\n');
}
