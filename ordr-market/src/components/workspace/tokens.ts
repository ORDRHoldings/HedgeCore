/**
 * ORDR Market — Workspace Design Tokens
 *
 * Theme-aware token system. Chrome (toolbars, rails) follows the active theme
 * via CSS variables. Chart canvas interior stays dark (TradingView standard).
 * Market bull/bear colors are fixed across all themes.
 */

export const T = {
  // ── Surface & Background (theme-aware) ─────────────────────────────────
  bg:          'var(--bg-deep, #F0F3FA)',
  surface:     'var(--bg-panel, #FFFFFF)',
  surfaceAlt:  'var(--bg-sub, #F7F8FC)',
  chartBg:     '#131722',   // chart canvas — always dark (TradingView standard)

  // ── Borders (theme-aware) ───────────────────────────────────────────────
  border:      'var(--border-rim, #E0E3EB)',
  borderLight: 'var(--border-soft, #ECEEF6)',

  // ── Text (theme-aware) ──────────────────────────────────────────────────
  text1:  'var(--text-primary, #131722)',
  text2:  'var(--text-secondary, #787B86)',
  text3:  'var(--text-tertiary, #B2B5BE)',

  // ── Accent (theme-aware) ────────────────────────────────────────────────
  accent:   'var(--accent-blue, #2962FF)',
  accentBg: 'var(--accent-blue-dim, rgba(41,98,255,0.09))',

  // ── Interaction states ──────────────────────────────────────────────────
  hover:  'rgba(128,128,128,0.08)',
  active: 'rgba(128,128,128,0.14)',

  // ── Market colors (fixed — not theme-dependent) ─────────────────────────
  bull:       '#26A69A',
  bullBg:     'rgba(38,166,154,0.08)',
  bullBorder: 'rgba(38,166,154,0.22)',
  bear:       '#EF5350',
  bearBg:     'rgba(239,83,80,0.08)',
  bearBorder: 'rgba(239,83,80,0.22)',

  // ── Typography (theme-aware) ────────────────────────────────────────────
  font: "var(--font-ui, 'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif)",
  mono: "var(--font-mono, 'JetBrains Mono','Fira Code','SF Mono','Consolas','Courier New',monospace)",

  // ── Dimensions (fixed) ──────────────────────────────────────────────────
  topBarH:    40,
  bottomBarH: 28,
  railW:      40,

  // ── Radii (fixed) ──────────────────────────────────────────────────────
  r1: '2px',
  r2: '3px',
  r3: '4px',
  r4: '6px',
  r5: '8px',

  // ── Shadows ─────────────────────────────────────────────────────────────
  shadowFloat: '0 4px 20px rgba(0,0,0,0.11), 0 1px 6px rgba(0,0,0,0.06)',
  shadowSm:    '0 1px 4px rgba(0,0,0,0.08)',
  shadowPanel: '0 2px 12px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04)',

  // ── Chart-specific (always dark canvas) ───────────────────────────────
  chartGrid:      '#1C2030',
  chartAxis:      '#363A45',
  chartAxisText:  '#787B86',
  chartCrosshair: '#787B86',

  // ── EMA color family ──────────────────────────────────────────────────
  ema1: '#2962FF',    // Fast (20)
  ema2: '#FF6D00',    // Medium (50)
  ema3: '#AB47BC',    // Slow (200)

  // ── FVG / SMC zones ───────────────────────────────────────────────────
  fvgBull:  'rgba(38,166,154,0.12)',
  fvgBear:  'rgba(239,83,80,0.12)',
  liqHigh:  'rgba(255,152,0,0.50)',
  liqMid:   'rgba(255,152,0,0.30)',
  liqLow:   'rgba(255,152,0,0.15)',

  // ── Selection / focus ─────────────────────────────────────────────────
  selected:   '#2962FF',
  selectedBg: 'rgba(41,98,255,0.12)',
  focusRing:  'var(--accent-blue, #64A8F0)',

  // ── Layout dimensions ─────────────────────────────────────────────────
  cmdBarH:          36,
  statusBarH:       24,
  leftRailW:        44,
  leftPanelW:       216,
  leftExpandedW:    260,   // railW + panelW
  rightStackW:      280,
  bottomDockMinH:   120,
  bottomDockMaxH:   400,

  // ── Panel tokens ──────────────────────────────────────────────────────
  panelHeaderH:  32,
  panelBg:       'var(--bg-panel, #1E1E1E)',
  panelBorder:   'var(--border-soft, #333333)',
  panelHover:    'rgba(128,128,128,0.06)',
  panelActive:   'rgba(128,128,128,0.10)',

  // ── Semantic colors ───────────────────────────────────────────────────
  info:    'var(--accent-blue, #64A8F0)',
  infoBg:  'var(--accent-blue-dim, rgba(100,168,240,0.10))',
  warn:    'var(--accent-amber, #E5A84B)',
  warnBg:  'rgba(229,168,75,0.10)',
  success: 'var(--accent-green, #4CAF50)',
  danger:  'var(--accent-red, #E57373)',
} as const;

export type TokenMap = typeof T;
