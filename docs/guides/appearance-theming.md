# Appearance & Theming — Developer Guide

## Overview

The ORDR Terminal uses a **token-driven theming system** with CSS variables applied at `:root`. User preferences are persisted to localStorage (immediate) and synced to the backend `User.ui_preferences` JSONB column.

## Architecture

```
ThemeProvider (React context)
  ├── reads AppearanceSettings from localStorage
  ├── applies CSS variables to document.documentElement
  ├── exposes useTheme() hook
  └── syncs to backend via GET/PATCH /v1/ui/appearance
```

### Key Files

| File | Purpose |
|------|---------|
| `frontend/src/lib/theme/types.ts` | Type definitions, `AppearanceSettings`, `DEFAULT_APPEARANCE` |
| `frontend/src/lib/theme/presets.ts` | 4 theme presets + curated accent palette |
| `frontend/src/lib/theme/templates.ts` | 3 operational templates |
| `frontend/src/lib/theme/contrast.ts` | WCAG 2.1 contrast validation |
| `frontend/src/lib/theme/ThemeProvider.tsx` | React context + CSS variable application |
| `frontend/src/app/settings/components/tabs/AppearanceTab.tsx` | Settings UI |
| `backend/app/api/routes/v1_ui.py` | Backend persistence endpoints |
| `frontend/src/app/globals.css` | CSS variable defaults + density/motion rules |

## CSS Variable Token List

### Surface
| Variable | Purpose |
|----------|---------|
| `--bg-deep` | Page background |
| `--bg-panel` | Card/panel background |
| `--bg-sub` | Secondary surface |
| `--bg-sidebar` | Navigation sidebar |

### Border
| Variable | Purpose |
|----------|---------|
| `--border-rim` | Primary borders |
| `--border-soft` | Subtle dividers |

### Text
| Variable | Purpose |
|----------|---------|
| `--text-primary` | Headings, primary content |
| `--text-secondary` | Body text, labels |
| `--text-tertiary` | Muted text, captions |
| `--text-disabled` | Disabled state |

### Accent / Status
| Variable | Purpose |
|----------|---------|
| `--accent-blue` | Primary accent |
| `--accent-blue-dim` | Accent at 10% opacity (backgrounds) |
| `--accent-cyan` | Alias for accent-blue |
| `--accent-amber` | Warning accent |
| `--accent-red` | Danger accent |
| `--accent-green` | Success accent |
| `--status-pass` | Positive status |
| `--status-fail` | Negative status |
| `--status-warn` | Warning status |

### Typography & Density
| Variable | Purpose |
|----------|---------|
| `--font-ui` | UI typeface |
| `--font-terminal` | Alias for font-ui |
| `--font-mono` | Monospace typeface |
| `--font-terminal-mono` | Alias for font-mono |
| `--font-size-base` | Base font size (12-16px) |
| `--density-scale` | Spacing multiplier (0.85/1/1.2) |
| `--row-height` | Table row height (28/36/44px) |
| `--numeric-variant` | `tabular-nums` or `normal` |

## Adding a New Theme Preset

1. Edit `frontend/src/lib/theme/presets.ts`
2. Create a `ThemePreset` object with all `ThemeColors` fields:
   ```typescript
   export const MY_THEME: ThemePreset = {
     id:          "my-theme-id",
     name:        "My Theme",
     description: "Description shown in settings",
     mode:        "dark",  // or "light"
     colors: { /* all ThemeColors fields */ },
   };
   ```
3. Add to `THEME_PRESETS` map
4. Add the ID to `ThemeId` union in `types.ts`
5. Add to backend `VALID_THEME_IDS` in `v1_ui.py`
6. Run contrast validation: all `validateThemeContrast()` pairs must pass

## Adding a New Template

1. Edit `frontend/src/lib/theme/templates.ts`
2. Create an `OperationalTemplate`:
   ```typescript
   {
     id:          "my-template",
     name:        "My Template",
     description: "One-line description",
     settings: {
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
       templateId:      "my-template",  // must match id
     },
   }
   ```
3. Add to `TEMPLATES` array
4. Add the ID to `TemplateId` union in `types.ts`

## Rules

1. **No arbitrary hex values** — Components consume CSS variables via the `S` or `T` token objects, never hardcoded colors.
2. **No pure white on pure black** — Dark themes use near-black (`#121212`+) and off-white (`#E0E0E0`-).
3. **Tabular numerals by default** — Numeric columns use `font-variant-numeric: var(--numeric-variant)`.
4. **Color is never the only signal** — Gains/losses require icon + sign alongside color.
5. **WCAG AA minimum** — All text-on-background pairs must pass 4.5:1 ratio.
6. **Focus indicators** — `--focus-ring` / `--accent-blue` used for `:focus-visible` outlines.
7. **Curated accents only** — Users choose from 4 pre-validated accent colors.

## Backend API

```
GET  /v1/ui/appearance  → AppearancePrefsResponse
PATCH /v1/ui/appearance → AppearancePrefsResponse
```

Request body (PATCH, all fields optional):
```json
{
  "theme_id": "institutional-obsidian",
  "density": "compact",
  "tabular_numerals": true
}
```

Invalid values are silently rejected (existing value preserved). Font size is clamped to 12-16.

## Persistence Flow

1. User changes setting in UI
2. `ThemeProvider.setAppearance()` updates React state + localStorage immediately
3. CSS variables applied to `:root` in same render cycle
4. Optional: frontend can sync to `PATCH /v1/ui/appearance` for cross-device persistence

## Extension Point: Org Defaults

The backend `Company.settings` JSONB already exists. To add org-level theme defaults:
1. Add `appearance_defaults` key to `Company.settings`
2. Add `allow_user_override: boolean` flag
3. In `GET /v1/ui/appearance`, merge: org defaults < user overrides (if allowed)

## URL-Based Theme Switching

Apply themes via URL parameters for shared links, previews, and A/B tests:

```
https://ordr-terminal.vercel.app?theme=executive-clarity&variant=light
https://ordr-terminal.vercel.app?theme=institutional-obsidian&variant=dark
```

Parameters:
- `theme` — Theme preset ID (ordr-default, institutional-obsidian, algorithmic-slate, executive-clarity)
- `variant` — Mode override (dark, light)

URL params take precedence over localStorage. Invalid values are ignored.

## A/B Testing

The `<html>` element carries data attributes for CSS-only and JS variant targeting:

```html
<html data-theme="ordr-default" data-variant="dark" data-density="standard" ...>
```

Use `data-variant` in analytics to segment by theme variant. CTA events include variant automatically.

## CTA Event Tracking

Import `trackEvent` from `@/lib/analytics/events`:

```typescript
import { trackEvent } from "@/lib/analytics/events";

trackEvent("click_launch_terminal", "hero");
```

Events are stored in localStorage (`ordr_cta_events`) for batch upload. Call `flushEvents()` to retrieve and clear.

## CI Contrast Validation

Run `node scripts/check-contrast.mjs` to validate all theme presets. This runs in CI after TypeScript checks.

## Accessibility

- **Skip-to-content**: `<a href="#main-content">` visible on Tab focus
- **Focus indicators**: All interactive elements use `--accent-blue` focus ring via `:focus-visible`
- **Color is not sole signal**: Gains/losses use icon + sign + color
- **Reduced motion**: `[data-reduced-motion="true"]` kills all animations
- **High contrast**: `[data-high-contrast="true"]` boosts border and text contrast

## Static Exports

- `/themes.json` — Machine-readable theme definitions (all presets, accents, templates)
- `/tokens.css` — CSS-only theme tokens via `[data-theme="..."]` selectors
- `/og-image.svg` — OpenGraph social preview image
