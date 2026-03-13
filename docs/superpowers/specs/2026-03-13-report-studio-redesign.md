# Report Studio Redesign — Design Spec

**Date**: 2026-03-13
**Status**: Approved
**Scope**: Frontend-only rebuild of `/reports` — theme alignment, decomposition, split-pane studio

---

## Problem

The Report Studio (`frontend/src/app/reports/page.tsx`) is a 1,900-line monolith with a hardcoded white-background palette that contradicts the application's dark theme. Styling mixes Tailwind classes, inline hex values, and CSS variables inconsistently. Phantom features (PowerPoint, ZIP_COMMITTEE) are listed in the UI but have no implementation. AI narrative placeholders are never replaced with real values. Advanced panels (VaR, Hedge Accounting) exist but receive no data.

## Design Decisions

### Architecture: Hybrid Tabs + Split-Pane Studio

**Pattern**: 4 tabs via `?tab=` URL params (Settings/Market Intelligence pattern). The Studio tab uses a split-pane layout (config left, live preview right) with an export action bar at bottom.

**Tabs**:

| Tab | URL Param | Purpose |
|-----|-----------|---------|
| Studio (default) | `/reports` | Split-pane: config + live preview + export bar |
| Library | `?tab=library` | 30 preset cards, search, category filter |
| Saved | `?tab=saved` | Saved report table, version history, re-export |
| Regulatory | `?tab=regulatory` | EMIR/MiFID/Dodd-Frank/ISDA/FINRA downloads |

### Theme: Dark, via T tokens

Kill the white `S` object in `page.tsx`. All components use `T` from `@/lib/design/tokens` which references CSS variables (`var(--bg-deep)`, `var(--bg-panel)`, etc.). EChartsWrapper already uses a dark palette — it will finally match.

### Studio Tab: Split-Pane Layout

```
┌──────────────────────────────────────────────────────────┐
│  PageShell: REPORT STUDIO                                │
├──────────────────────────────────────────────────────────┤
│  [STUDIO]  LIBRARY  SAVED  REGULATORY                    │
├────────────────┬─────────────────────────────────────────┤
│  CONFIG (300px)│  LIVE PREVIEW (flex)                     │
│                │                                          │
│  DATA BINDING  │  ┌─ Executive Summary ────────────────┐ │
│  ▸ Run: 4a8f   │  │  KPI strip (4 tiles)               │ │
│  ▸ Policy: RPV │  │  Narrative paragraph                │ │
│                │  └────────────────────────────────────┘ │
│  TEMPLATE      │                                          │
│  RPT-001 Board │  ┌─ Exposure Insights ────────────────┐ │
│                │  │  Bar chart (ECharts)                 │ │
│  SECTIONS (7)  │  │  HHI / concentration                │ │
│  1. Executive  │  └────────────────────────────────────┘ │
│  2. Exposure ◀─│─── click section = scroll preview       │
│  3. Efficiency │                                          │
│  4. Scenario   │  ⋮ more sections below ⋮                │
│  5. Compliance │                                          │
│  6. VaR        │                                          │
│  7. Disclosures│                                          │
├────────────────┴─────────────────────────────────────────┤
│  EXPORT BAR: 7 sections · ~12 pages · SHA-256   [EXPORT]│
└──────────────────────────────────────────────────────────┘
```

**Config Panel (left, 300px)**:
- Data Binding section: run selector dropdown, policy display, binding status badges
- Template section: preset dropdown with audience/page count metadata
- Sections list: ordered, draggable (drag handle icon), click to highlight in preview, + ADD button

**Live Preview (right, flex)**:
- Renders all selected sections using existing panel components (ExecutiveSummaryPanel, ExposureInsightsPanel, etc.)
- Full/Section toggle: show all or focus on selected section
- Click section in config = scroll preview to that section
- Dark-themed panels with T tokens

**Export Action Bar (bottom, sticky)**:
- Left: section count, page estimate, SHA-256 hash, validation badges (VALID / N WARNINGS)
- Right: SAVE button, format quick-picks (PDF, XLSX), primary EXPORT button that opens format drawer

### Library Tab

- Grid of preset cards (30 presets from `reportPresets.ts`)
- Search bar at top + category filter pills (10 categories)
- Each card shows: preset ID, name, audience badge, page count, section count
- Click card → navigates to Studio tab with preset loaded
- "Custom Report" card at end → Studio tab with blank sections

### Saved Tab

- Table with columns: Name, Run ID, Template, Date, Version, Actions
- Version badges grouped by run_id (v1, v2, v3)
- Actions: View (loads into Studio preview), Re-export (format picker), Delete
- Fetches from backend `GET /v1/reports/saved` (already exists)
- Sorted newest-first

### Regulatory Tab

- Run selector at top (same as Studio binding)
- Grid of regulatory format cards:
  - EMIR Article 9 (XML) → `GET /v1/reports/{run_id}/emir`
  - MiFID II RTS 25 (XML) → `GET /v1/reports/{run_id}/mifid`
  - Dodd-Frank Title VII (TXT) → `GET /v1/reports/{run_id}/dodd-frank`
  - ISDA Confirmation (XML) → regulatory_export service
  - FINRA 17a-4 (TXT) → regulatory_export service
- Each card: format badge, one-click download button, last-downloaded timestamp
- All downloads emit audit events (existing backend behavior)

---

## File Plan

### Delete (1 file)

```
frontend/src/app/reports/page.tsx              # 1,900-line monolith → replaced by decomposed structure
```

### New Files (14)

```
frontend/src/app/reports/
  page.tsx                                      # Thin shell (~80L): auth, Suspense, tab router
  types.ts                                      # ReportStudioTab union, tab defs, HASH_MAP
  components/
    ReportTabBar.tsx                            # 4-tab strip (Studio/Library/Saved/Regulatory)
    studio/
      StudioTab.tsx                             # Split-pane container: ConfigPanel + PreviewPane + ExportBar
      ConfigPanel.tsx                           # Left panel: DataBinding + TemplateSelector + SectionList
      DataBinding.tsx                           # Run selector dropdown + policy display + binding badges
      TemplateSelector.tsx                      # Preset dropdown with metadata
      SectionList.tsx                           # Draggable ordered section list with add/remove
      PreviewPane.tsx                           # Right panel: renders report panels with scroll sync
      ExportBar.tsx                             # Bottom sticky: validation + format picks + export action
    tabs/
      LibraryTab.tsx                            # 30 preset cards grid with search + filter
      SavedTab.tsx                              # Saved reports table with version badges + re-export
      RegulatoryTab.tsx                         # Regulatory format cards with one-click download
```

### Modified Files (4)

```
frontend/src/components/reports/ReportsContainer.tsx     # Convert Tailwind → inline styles with T tokens
frontend/src/components/reports/EChartsWrapper.tsx        # Bind C object to T tokens (CSS vars, not hex)
frontend/src/components/reports/ExecutiveSummaryPanel.tsx # Theme alignment — T tokens
frontend/src/components/reports/ExposureInsightsPanel.tsx # Theme alignment — T tokens
frontend/src/components/reports/HedgeEfficiencyPanel.tsx  # Theme alignment — T tokens
frontend/src/components/reports/PolicyCompliancePanel.tsx # Theme alignment — T tokens
frontend/src/components/reports/ScenarioSensitivityPanel.tsx # Theme alignment — T tokens
frontend/src/components/reports/panels/HedgeAccountingPanel.tsx # Theme alignment — T tokens
frontend/src/components/reports/panels/VaRPanel.tsx      # Theme alignment — T tokens
frontend/src/components/layout/AppSidebar.tsx            # Update REPORTS nav items to match 4 tabs
```

### Untouched (preserve as-is)

```
frontend/src/utils/reportCalcs.ts              # Pure calculation functions — no theme dependency
frontend/src/utils/clientExport.ts             # Export generation — no theme dependency
frontend/src/types/reportTypes.ts              # Type definitions — no change needed
frontend/src/constants/reportPresets.ts         # 30 presets — no change needed
frontend/src/app/api/report-ai/route.ts        # AI endpoint — no change needed
backend/app/api/routes/v1_reports.py           # Backend endpoints — no change
backend/app/api/routes/v1_export.py            # Backend exports — no change
backend/app/exports_v1/*                       # Export builders — no change
backend/app/services/regulatory_export.py      # Regulatory formats — no change
```

---

## Component Details

### `page.tsx` — Thin Shell (~80 lines)

Follows Settings page pattern exactly:
- `useSearchParams()` wrapped in `<Suspense>`
- Derives `activeTab` from URL (no useState for tab)
- `router.replace(/reports?tab=${param}, { scroll: false })`
- Auth guard via `useAuth()`
- Renders: `<PageShell icon={FileText} title="Report Studio">` → `<ReportTabBar>` → `{activeTabContent}`

### `StudioTab.tsx` — Split-Pane Container

```tsx
<div style={{ display: "grid", gridTemplateColumns: "300px 1fr", flex: 1, minHeight: 0 }}>
  <ConfigPanel
    binding={binding}
    onBindingChange={setBinding}
    template={template}
    onTemplateChange={setTemplate}
    sections={sections}
    onSectionsChange={setSections}
    selectedSection={selectedSection}
    onSelectSection={setSelectedSection}
  />
  <PreviewPane
    binding={binding}
    sections={sections}
    selectedSection={selectedSection}
  />
</div>
<ExportBar
  binding={binding}
  sections={sections}
  validationIssues={issues}
/>
```

State lives in StudioTab: `binding`, `template`, `sections`, `selectedSection`. Config panel modifies state, preview pane reads it.

### `ConfigPanel.tsx` — Left Panel (300px)

Three collapsible sections stacked vertically:
1. **DataBinding**: Dropdown of available runs (from `useHedge()` or `listRuns()`), policy display, green binding badges
2. **TemplateSelector**: Dropdown of 30 presets + "Custom", shows audience/page count metadata
3. **SectionList**: Ordered list of sections from selected template. Drag handles for reorder. Click to select (highlights in preview). "+ ADD" button shows available sections not yet included. "×" to remove.

### `PreviewPane.tsx` — Right Panel

Renders existing panel components (ExecutiveSummaryPanel, ExposureInsightsPanel, etc.) in a scrollable container. Each section wrapped in a div with `ref` for scroll-to. When `selectedSection` changes, scrolls to that section. Passes `CalculateResponse` data from bound run to each panel.

Full/Section toggle at top-right: "FULL" shows all sections, "SECTION" shows only the selected one.

### `ExportBar.tsx` — Bottom Sticky Bar

Left side:
- Section count and estimated page count
- SHA-256 report hash (from existing `computeReportHash`)
- Validation badges: green "VALID" or amber "N WARNINGS" (from existing validation logic in reportTypes.ts)

Right side:
- SAVE button → `POST /v1/reports/save` (existing endpoint)
- Format quick-picks: PDF, XLSX (most common)
- Primary EXPORT button → opens format drawer with all options (PDF, XLSX, CSV, HTML, JSON, ZIP)
- Removed: PowerPoint (no implementation exists)

### Panel Theme Conversion

All report panels currently define their own `S` or `C` objects with hardcoded hex values. Convert each to import `T` from `@/lib/design/tokens`:

**Before** (e.g., ExecutiveSummaryPanel):
```tsx
const S = { bgPanel: "#FFFFFF", primary: "#0D1117", ... };
```

**After**:
```tsx
import { T } from "@/lib/design/tokens";
// Use T.bgPanel, T.primary, T.fontMono etc.
```

EChartsWrapper's `C` object similarly converts hex to CSS variable references. Chart backgrounds become `transparent` (inheriting from panel background).

---

## Sidebar Nav Update

In `AppSidebar.tsx`, update REPORTS section:

**Before** (4 items):
```
Report Studio    → /reports
Preset Library   → /reports (same page, different view)
AI Report Builder → /reports (same page, different view)
Saved Reports    → /reports (same page, different view)
```

**After** (4 items):
```
Studio     → /reports
Library    → /reports?tab=library
Saved      → /reports?tab=saved
Regulatory → /reports?tab=regulatory
```

---

## What Gets Removed

1. **White palette `S` object** in page.tsx (lines 46-71) — replaced by `T` tokens
2. **`Badge` component** in page.tsx — replaced by existing pattern from other pages
3. **Five view states** (HOME/LIBRARY/BUILDER/SAVED/SETTINGS) — replaced by 4 URL tabs
4. **PowerPoint export option** — no code exists, remove from UI
5. **ZIP_COMMITTEE export option** — remove (ZIP already available via backend)
6. **Inline UUID function** — use `crypto.randomUUID()` or existing util
7. **~1,800 lines of monolith code** — decomposed into 13 focused files

## What Gets Preserved

1. **30 report presets** (`reportPresets.ts`) — unchanged
2. **Report calculation engine** (`reportCalcs.ts`) — unchanged
3. **Client-side export** (`clientExport.ts`) — PDF, XLSX, CSV, HTML, JSON all preserved
4. **7 report panels** — ExecutiveSummary, ExposureInsights, HedgeEfficiency, PolicyCompliance, ScenarioSensitivity, VaR, HedgeAccounting — all preserved, only theme-converted
5. **ECharts charts** — 5 chart types preserved, only theme-converted
6. **All backend endpoints** — v1_reports.py, v1_export.py, regulatory_export.py — zero changes
7. **76 governance tests** — all pass without modification
8. **Type system** (`reportTypes.ts`) — unchanged
9. **AI report endpoint** (`report-ai/route.ts`) — unchanged

---

## Implementation Order

### Phase 1 — Foundation (types + shell + tab bar)
1. Create `types.ts` (tab types, HASH_MAP, constants)
2. Create `ReportTabBar.tsx` (4-tab strip)
3. Rewrite `page.tsx` as thin shell (auth + Suspense + tab router)

### Phase 2 — Studio Tab (the core)
4. Create `DataBinding.tsx` (run selector + policy display)
5. Create `TemplateSelector.tsx` (preset dropdown)
6. Create `SectionList.tsx` (draggable section list)
7. Create `ConfigPanel.tsx` (composes DataBinding + TemplateSelector + SectionList)
8. Create `PreviewPane.tsx` (renders panels with scroll sync)
9. Create `ExportBar.tsx` (validation + format picks + export)
10. Create `StudioTab.tsx` (split-pane container)

### Phase 3 — Theme Conversion
11. Convert ReportsContainer.tsx (Tailwind → T tokens)
12. Convert all 7 panel components (local S/C → T tokens)
13. Convert EChartsWrapper.tsx (hex → CSS variable references)

### Phase 4 — Other Tabs
14. Create `LibraryTab.tsx` (preset cards grid)
15. Create `SavedTab.tsx` (saved reports table)
16. Create `RegulatoryTab.tsx` (regulatory download cards)

### Phase 5 — Nav + Cleanup
17. Update AppSidebar.tsx REPORTS section
18. Delete old page.tsx (replaced by new thin shell)
19. Verify build: `cd frontend && npx next build`

---

## Verification

1. **Build**: `cd frontend && npx next build` — zero errors
2. **Theme**: All report components render in dark theme, no white panels
3. **Tab routing**: URL params work, back/forward works, direct URL loads correct tab
4. **Studio**: Config panel changes reflect in live preview
5. **Export**: PDF, XLSX, CSV, ZIP exports still function
6. **Saved**: Backend save/load works via existing endpoints
7. **Regulatory**: All 5 format downloads work
8. **Sidebar**: All 4 nav items navigate correctly
9. **Governance tests**: All 76 existing tests still pass
10. **No regressions**: reportCalcs.ts, clientExport.ts, reportTypes.ts unchanged
