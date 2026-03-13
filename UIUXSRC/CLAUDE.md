# ORDR Terminal Design System -- Claude Code Integration Guide

## What This Is

A portable, production-grade UI/UX design system extracted from the ORDR Terminal institutional platform. It provides 7 theme presets, 8 accent colors, 6 operational templates, WCAG-validated contrast, density scaling, and a complete set of UI primitives -- all designed for financial/institutional applications.

## Quick Start -- How to Implement in a New Project

### Prerequisites
- Next.js 14+ (App Router)
- React 18+
- TypeScript 5+
- `lucide-react` for icons

### Step 1: Copy Files

Copy the entire contents of this UIUXSRC folder into your project:

```
cp -r UIUXSRC/theme/         your-project/src/lib/theme/
cp -r UIUXSRC/tokens/        your-project/src/lib/design/
cp -r UIUXSRC/components/    your-project/src/components/
cp    UIUXSRC/styles/globals.css  your-project/src/app/globals.css
```

### Step 2: Install Dependencies

```bash
npm install lucide-react
```

Add fonts to your `layout.tsx` or `globals.css`:
```
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&family=Manrope:wght@600;700;800&display=swap');
```

### Step 3: Wrap App with ThemeProvider

In your root `layout.tsx`:
```tsx
import { ThemeProvider } from "@/lib/theme/ThemeProvider";

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
```

### Step 4: Configure Server Sync (Optional)

The ThemeProvider includes a `syncToServer` function that is a no-op by default. If you want to persist appearance settings to your backend, pass a custom `onSyncToServer` callback:

```tsx
<ThemeProvider
  onSyncToServer={async (appearance, token) => {
    await fetch("/api/appearance", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(appearance),
    });
  }}
>
  {children}
</ThemeProvider>
```

### Step 5: Use in Components

```tsx
import { T } from "@/lib/design/tokens";
import { useTheme } from "@/lib/theme/ThemeProvider";
import { PageShell } from "@/components/layout/PageShell";
import { Icon } from "@/components/ui/Icon";
import { BarChart3 } from "lucide-react";

export default function MyPage() {
  const { appearance, updateAppearance } = useTheme();

  return (
    <PageShell icon={BarChart3} title="My Page">
      <div style={{ fontFamily: T.fontUI, color: T.primary }}>
        Content here
      </div>
    </PageShell>
  );
}
```

## Architecture Overview

### Theme Engine (5 files)

| File | Purpose |
|------|---------|
| `theme/types.ts` | TypeScript interfaces for all theme types |
| `theme/presets.ts` | 7 color presets + 8 curated accents |
| `theme/templates.ts` | 6 operational template bundles |
| `theme/contrast.ts` | WCAG 2.1 contrast validation |
| `theme/ThemeProvider.tsx` | React context, CSS variable injection, localStorage |

### 7 Theme Presets

| ID | Name | Mode | Best For |
|----|------|------|----------|
| `ordr-default` | ORDR Default | Dark | General production use |
| `institutional-obsidian` | Institutional Obsidian | Dark | Trading floors, minimal glare |
| `algorithmic-slate` | Algorithmic Slate | Dark | Daily operations, neutral |
| `executive-clarity` | Executive Clarity | Light | Presentations, reviews |
| `midnight-terminal` | Midnight Terminal | Dark | Overnight desks, ultra-dark |
| `arctic-frost` | Arctic Frost | Light | Modern, clean, cool tones |
| `warm-carbon` | Warm Carbon | Dark | Extended sessions, warm tones |

### 8 Curated Accents

Ruddy Blue, Violet, Emerald, Amber, Coral, Teal, Rose, Indigo -- each with contrast-validated hex + dim variant.

### 6 Operational Templates

| ID | Name | Theme | Density | Use Case |
|----|------|-------|---------|----------|
| `trading-floor` | Trading Floor | Obsidian | Compact | Power users |
| `treasury-ops` | Treasury Ops | Slate | Standard | Daily operations |
| `executive-review` | Executive Review | Clarity | Spacious | Presentations |
| `night-desk` | Night Desk | Midnight | Compact | Overnight sessions |
| `compliance-review` | Compliance Review | Obsidian | Standard | Audit workflows |
| `client-presentation` | Client Presentation | Arctic Frost | Spacious | Client-facing |

### Density System

| Level | Scale | Row Height | Use Case |
|-------|-------|------------|----------|
| Compact | 0.85 | 28px | Data-dense trading views |
| Standard | 1.0 | 36px | Default operations |
| Spacious | 1.2 | 44px | Presentations, reviews |

## Design Token Pattern

All components use CSS variables through the `T` token object:

```tsx
const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI:   "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  bgPanel:  "var(--bg-panel)",
  bgDeep:   "var(--bg-deep)",
  bgSub:    "var(--bg-sub)",
  rim:      "var(--border-rim)",
} as const;
```

**Rule**: Never hardcode hex colors. Always use CSS variables via the `T` object or inline `var(--token-name)`.

## Component Catalog

### Layout

- **PageShell** -- Full-page wrapper with header. Props: `icon`, `title`, `breadcrumb?`, `actions?`, `noPadding?`
- **PageHeader** -- Icon + title + breadcrumb + action slot

### UI Primitives

- **Icon** -- Lucide wrapper with square caps + miter joins (institutional feel)
- **Button** -- primary/secondary/danger variants with CSS variable theming
- **ActionButton** -- primary/secondary/ghost with T tokens (inline styles)
- **Card** -- Container with optional title, CSS variable theming
- **Spinner** -- Loading spinner (sm/md/lg) with CSS variable theming
- **KpiTile** -- Single KPI with delta + unit
- **KpiStrip** -- Grid of KPIs with loading skeleton
- **StatusChip** -- Status badge (PASS/FAIL/WARN/BLOCK/PENDING/DRAFT/AUTHORIZED/REJECTED/RETURNED)
- **EmptyState** -- 6 empty/error/loading states with custom SVG icons

## CSS Variable Reference

### Surfaces
- `--bg-deep` -- Deepest background (page)
- `--bg-panel` -- Panel/card background
- `--bg-sub` -- Subtle elevated surface
- `--bg-sidebar` -- Sidebar background

### Text
- `--text-primary` -- Main text
- `--text-secondary` -- Supporting text
- `--text-tertiary` -- Muted/label text
- `--text-disabled` -- Disabled text

### Borders
- `--border-rim` -- Primary border
- `--border-soft` -- Subtle border

### Accents
- `--accent-blue` -- Primary accent
- `--accent-cyan` -- Alias for accent-blue
- `--accent-amber` -- Warning accent
- `--accent-red` -- Danger accent
- `--accent-green` -- Success accent

### Status
- `--status-pass` -- Success/pass
- `--status-fail` -- Error/fail
- `--status-warn` -- Warning
- `--status-pending` -- Pending/neutral

### Typography
- `--font-terminal` -- UI font (IBM Plex Sans)
- `--font-terminal-mono` -- Monospace font (IBM Plex Mono)
- `--font-size-base` -- Base font size
- `--numeric-variant` -- tabular-nums or normal

### Density
- `--density-scale` -- 0.85 / 1 / 1.2
- `--row-height` -- 28px / 36px / 44px

## Styling Rules

1. **Inline styles with CSS variables** -- NOT className-heavy Tailwind for layout
2. **Minimum font size**: 12px (institutional minimum)
3. **Fonts**: IBM Plex Sans (UI), IBM Plex Mono (data), Manrope (headings)
4. **Icons**: lucide-react only, wrapped in `<Icon>` component
5. **Colors**: Always reference CSS variables, never hardcode hex
6. **Dark-first**: Default to dark themes; light themes available for presentations

## Accessibility

- WCAG AA contrast validation built-in (4.5:1 normal text, 3:1 large/UI)
- Reduced motion mode (CSS class `ordr-reduced-motion`)
- High contrast mode (CSS class `ordr-high-contrast`)
- Color + icon option for gains/losses
- All contrast checked via `contrast.ts` utilities

## Building an Appearance Settings Page

To create a settings page where users can customize their appearance:

1. Use `useTheme()` to get `appearance` and `setAppearance`
2. Import `THEME_PRESETS` from presets, `CURATED_ACCENTS` from presets, `TEMPLATES` from templates
3. Let users select theme, accent, density, fonts, and accessibility options
4. Changes apply instantly via CSS variables (no page reload)
5. Persisted to localStorage automatically

Example:
```tsx
const { appearance, setAppearance } = useTheme();
// Switch theme
setAppearance({ ...appearance, themeId: "arctic-frost" });
// Apply template
const template = TEMPLATES.find(t => t.id === "trading-floor");
if (template) setAppearance(template.settings);
```
