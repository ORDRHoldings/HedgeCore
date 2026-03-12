#!/usr/bin/env node
/**
 * CI Contrast Checker — validates all theme presets pass WCAG AA.
 * Run: node scripts/check-contrast.mjs
 * Exit code 0 = pass, 1 = failures found.
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// ── Contrast math (inline, no dependencies) ──────────────────────────────────

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a, b) {
  const l1 = luminance(a);
  const l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

// ── Load themes ──────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const themesPath = join(__dirname, "..", "frontend", "public", "themes.json");
const themes = JSON.parse(readFileSync(themesPath, "utf8"));

// ── WCAG AA thresholds ───────────────────────────────────────────────────────

const AA_TEXT = 4.5;
const NON_TEXT = 3.0;

let failures = 0;
let warnings = 0;
let total = 0;

for (const [id, preset] of Object.entries(themes.presets)) {
  const c = preset.colors;

  // [label, foreground, background, threshold, warnOnly]
  // warnOnly=true means a failure is reported but does not cause a non-zero exit
  // (decorative borders are WCAG 1.4.11 exempt — not required to understand content)
  const checks = [
    ["text-primary on bg-deep",    c.textPrimary,   c.bgDeep,  AA_TEXT,  false],
    ["text-primary on bg-panel",   c.textPrimary,   c.bgPanel, AA_TEXT,  false],
    ["text-secondary on bg-deep",  c.textSecondary, c.bgDeep,  AA_TEXT,  false],
    ["text-secondary on bg-panel", c.textSecondary, c.bgPanel, AA_TEXT,  false],
    ["border-rim vs bg-panel",     c.borderRim,     c.bgPanel, NON_TEXT, true],
    ["focus-ring vs bg-deep",      c.focusRing,     c.bgDeep,  NON_TEXT, false],
    ["focus-ring vs bg-panel",     c.focusRing,     c.bgPanel, NON_TEXT, false],
  ];

  console.log(`\n> ${preset.name} (${id})`);

  for (const [label, fg, bg, req, warnOnly] of checks) {
    // Skip rgba values — they depend on compositing context
    if (!fg || !bg || fg.startsWith("rgba")) continue;

    const r = ratio(fg, bg);
    const pass = r >= req;
    total++;

    if (!pass && warnOnly) {
      warnings++;
      console.log(`  WARN ${label}: ${r.toFixed(2)}:1 (need ${req}:1) [advisory]`);
    } else if (!pass) {
      failures++;
      console.error(`  FAIL ${label}: ${r.toFixed(2)}:1 (need ${req}:1)`);
    } else {
      console.log(`  PASS ${label}: ${r.toFixed(2)}:1 (need ${req}:1)`);
    }
  }
}

console.log(`\n${total} checks, ${failures} failures, ${warnings} warnings`);
process.exit(failures > 0 ? 1 : 0);
