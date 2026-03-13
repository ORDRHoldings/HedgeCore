# Report Studio Redesign — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decompose the 1,900-line Report Studio monolith into a modular tabbed shell with split-pane studio, align all components to the application's dark theme via `T` tokens.

**Architecture:** 4-tab shell (Studio/Library/Saved/Regulatory) with URL param routing. Studio tab uses split-pane layout: 300px config panel (data binding + template + draggable sections) on left, live preview rendering existing report panels on right, export action bar at bottom. All components use `T` from `@/lib/design/tokens`.

**Tech Stack:** Next.js 15.5, React 19, TypeScript 5.9, ECharts (echarts-for-react), existing report panels + calculation utils.

**Spec:** `docs/superpowers/specs/2026-03-13-report-studio-redesign.md`

---

## File Structure

### New Files (13)

| File | Responsibility | Lines (est) |
|------|---------------|-------------|
| `frontend/src/app/reports/types.ts` | Tab union type, HASH_MAP, TAB_TO_PARAM, constants | ~60 |
| `frontend/src/app/reports/components/ReportTabBar.tsx` | 4-tab strip (Studio/Library/Saved/Regulatory) | ~55 |
| `frontend/src/app/reports/components/studio/StudioTab.tsx` | Split-pane container: state management, grid layout | ~120 |
| `frontend/src/app/reports/components/studio/ConfigPanel.tsx` | Left panel: composes DataBinding + TemplateSelector + SectionList | ~80 |
| `frontend/src/app/reports/components/studio/DataBinding.tsx` | Run selector dropdown, policy display, binding badges | ~120 |
| `frontend/src/app/reports/components/studio/TemplateSelector.tsx` | Preset dropdown with audience/page count metadata | ~90 |
| `frontend/src/app/reports/components/studio/SectionList.tsx` | Ordered section list with drag reorder, add/remove | ~150 |
| `frontend/src/app/reports/components/studio/PreviewPane.tsx` | Right panel: renders report panels, scroll sync | ~180 |
| `frontend/src/app/reports/components/studio/ExportBar.tsx` | Bottom sticky bar: validation + format picks + export | ~130 |
| `frontend/src/app/reports/components/tabs/LibraryTab.tsx` | 35 preset cards grid, search, category filter | ~200 |
| `frontend/src/app/reports/components/tabs/SavedTab.tsx` | Saved reports table, version badges, re-export | ~180 |
| `frontend/src/app/reports/components/tabs/RegulatoryTab.tsx` | Regulatory format cards, one-click download | ~160 |

### Rewritten Files (1)

| File | Change |
|------|--------|
| `frontend/src/app/reports/page.tsx` | 1,900L monolith → ~90L thin shell (auth + Suspense + tab router) |

### Modified Files (8)

| File | Change |
|------|--------|
| `frontend/src/components/reports/ReportsContainer.tsx` | Tailwind classes → inline styles with T tokens |
| `frontend/src/components/reports/EChartsWrapper.tsx:74-90` | Hardcoded hex C object → CSS variable references |
| `frontend/src/components/reports/ExecutiveSummaryPanel.tsx` | Local styles → T tokens import |
| `frontend/src/components/reports/ExposureInsightsPanel.tsx` | Local styles → T tokens import |
| `frontend/src/components/reports/HedgeEfficiencyPanel.tsx` | Local styles → T tokens import |
| `frontend/src/components/reports/PolicyCompliancePanel.tsx` | Local styles → T tokens import |
| `frontend/src/components/reports/ScenarioSensitivityPanel.tsx` | Local styles → T tokens import |
| `frontend/src/components/layout/AppSidebar.tsx:107-117` | REPORTS nav items → 4 tab-linked items |

### Unchanged Files

| File | Reason |
|------|--------|
| `frontend/src/utils/reportCalcs.ts` | Pure calculation functions — no theme dependency |
| `frontend/src/utils/clientExport.ts` | Export generation — no theme dependency |
| `frontend/src/types/reportTypes.ts` | Type definitions — no change needed |
| `frontend/src/constants/reportPresets.ts` | 35 presets — no change needed |
| `frontend/src/app/api/report-ai/route.ts` | AI endpoint — no change needed |
| `frontend/src/components/reports/panels/VaRPanel.tsx` | Already uses CSS variables |
| `frontend/src/components/reports/panels/HedgeAccountingPanel.tsx` | Already uses CSS variables |
| All backend files | Zero backend changes |

---

## Chunk 1: Foundation (types + shell + tab bar)

### Task 1: Create types.ts

**Files:**
- Create: `frontend/src/app/reports/types.ts`

- [ ] **Step 1: Create the types file**

```typescript
// frontend/src/app/reports/types.ts

export type ReportStudioTab = "STUDIO" | "LIBRARY" | "SAVED" | "REGULATORY";

export interface TabDef {
  key: ReportStudioTab;
  label: string;
  param: string | null; // null = default tab (no query param)
}

export const TABS: TabDef[] = [
  { key: "STUDIO",     label: "Studio",     param: null },
  { key: "LIBRARY",    label: "Library",    param: "library" },
  { key: "SAVED",      label: "Saved",      param: "saved" },
  { key: "REGULATORY", label: "Regulatory", param: "regulatory" },
];

/** URL query param → ReportStudioTab */
export const HASH_MAP: Record<string, ReportStudioTab> = {
  library:    "LIBRARY",
  saved:      "SAVED",
  regulatory: "REGULATORY",
};

/** ReportStudioTab → URL query param */
export const TAB_TO_PARAM: Record<ReportStudioTab, string | null> = {
  STUDIO:     null,
  LIBRARY:    "library",
  SAVED:      "saved",
  REGULATORY: "regulatory",
};
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `cd frontend && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors related to reports/types.ts

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/reports/types.ts
git commit -m "feat(reports): add tab types, HASH_MAP, TAB_TO_PARAM"
```

---

### Task 2: Create ReportTabBar.tsx

**Files:**
- Create: `frontend/src/app/reports/components/ReportTabBar.tsx`
- Reference: `frontend/src/app/market-intelligence/components/MarketTabBar.tsx` (exact same pattern)

- [ ] **Step 1: Create the tab bar component**

Follow the MarketTabBar pattern exactly — same structure, same inline styles, same T tokens. The only difference is importing from `../types` instead of market-intelligence types.

```typescript
"use client";

import { T } from "@/lib/design/tokens";
import { TABS } from "../types";
import type { ReportStudioTab } from "../types";

interface Props {
  activeTab: ReportStudioTab;
  onTabChange: (tab: ReportStudioTab) => void;
}

export default function ReportTabBar({ activeTab, onTabChange }: Props) {
  return (
    <div
      style={{
        display: "flex",
        gap: 0,
        borderBottom: `1px solid ${T.rim}`,
        background: T.bgPanel,
        padding: "0 24px",
        overflowX: "auto",
      }}
    >
      {TABS.map((tab) => {
        const isActive = tab.key === activeTab;
        return (
          <button
            key={tab.key}
            onClick={() => onTabChange(tab.key)}
            style={{
              fontFamily: T.fontMono,
              fontSize: 12,
              fontWeight: isActive ? 700 : 500,
              letterSpacing: "0.06em",
              color: isActive ? T.accent : T.tertiary,
              background: "transparent",
              border: "none",
              borderBottom: isActive
                ? `2px solid ${T.accent}`
                : "2px solid transparent",
              padding: "12px 18px",
              cursor: "pointer",
              whiteSpace: "nowrap",
              transition: "color 0.12s, border-color 0.12s",
              textTransform: "uppercase",
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/app/reports/components/ReportTabBar.tsx
git commit -m "feat(reports): add ReportTabBar — 4-tab strip"
```

---

### Task 3: Rewrite page.tsx as thin shell

**Files:**
- Rewrite: `frontend/src/app/reports/page.tsx` (1,900L → ~90L)
- Reference: `frontend/src/app/market-intelligence/page.tsx` (exact same pattern)

- [ ] **Step 1: Back up and rewrite page.tsx**

The old 1,900-line monolith is replaced by a thin shell that follows the Market Intelligence page pattern exactly. Auth guard, Suspense wrapper, tab router via `useSearchParams()`.

```typescript
"use client";

/**
 * reports/page.tsx — ORDR Report Studio (thin shell)
 *
 * Decomposed into:
 *   types.ts                         — tab types, HASH_MAP, constants
 *   components/ReportTabBar.tsx      — 4-tab strip
 *   components/studio/StudioTab.tsx  — split-pane studio
 *   components/tabs/LibraryTab.tsx   — preset library
 *   components/tabs/SavedTab.tsx     — saved reports
 *   components/tabs/RegulatoryTab.tsx — regulatory downloads
 */

import { Suspense, useCallback, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/authContext";
import { PageShell } from "@/components/layout/PageShell";
import { FileText } from "lucide-react";
import { T } from "@/lib/design/tokens";

import { HASH_MAP, TAB_TO_PARAM } from "./types";
import type { ReportStudioTab } from "./types";

import ReportTabBar from "./components/ReportTabBar";
import StudioTab from "./components/studio/StudioTab";
import LibraryTab from "./components/tabs/LibraryTab";
import SavedTab from "./components/tabs/SavedTab";
import RegulatoryTab from "./components/tabs/RegulatoryTab";

function ReportStudioInner() {
  const { isAuthenticated, isLoading, token, user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const tabParam = searchParams.get("tab") ?? "";
  const activeTab: ReportStudioTab =
    tabParam && HASH_MAP[tabParam] ? HASH_MAP[tabParam] : "STUDIO";

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace("/auth/login");
  }, [isLoading, isAuthenticated, router]);

  const handleTabChange = useCallback(
    (tab: ReportStudioTab) => {
      const param = TAB_TO_PARAM[tab];
      router.replace(
        param ? `/reports?tab=${param}` : "/reports",
        { scroll: false },
      );
    },
    [router],
  );

  if (isLoading || !isAuthenticated || !token) {
    return (
      <div style={{
        background: T.bgDeep, minHeight: "100vh",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <span style={{
          fontFamily: T.fontMono, fontSize: 12,
          color: T.tertiary, letterSpacing: "0.1em",
        }}>
          LOADING...
        </span>
      </div>
    );
  }

  const renderTab = () => {
    switch (activeTab) {
      case "STUDIO":     return <StudioTab token={token} userId={user?.id} />;
      case "LIBRARY":    return <LibraryTab onSelectPreset={(presetId) => {
        // Navigate to studio with preset loaded
        router.replace(`/reports?preset=${presetId}`, { scroll: false });
      }} />;
      case "SAVED":      return <SavedTab token={token} />;
      case "REGULATORY": return <RegulatoryTab token={token} />;
      default:           return <StudioTab token={token} userId={user?.id} />;
    }
  };

  return (
    <PageShell icon={FileText} title="Report Studio" noPadding>
      <ReportTabBar activeTab={activeTab} onTabChange={handleTabChange} />
      {renderTab()}
    </PageShell>
  );
}

export default function ReportsPage() {
  return (
    <Suspense fallback={
      <div style={{
        background: "var(--bg-deep)", minHeight: "100vh",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <span style={{
          fontFamily: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
          fontSize: 12, color: "var(--text-tertiary)", letterSpacing: "0.1em",
        }}>
          LOADING...
        </span>
      </div>
    }>
      <ReportStudioInner />
    </Suspense>
  );
}
```

**Important:** This file replaces the entire old page.tsx. The old code is not needed — all business logic is preserved in reportCalcs.ts, clientExport.ts, reportPresets.ts, and the panel components which are untouched.

- [ ] **Step 2: Create stub files for tabs so build passes**

Create minimal stubs for StudioTab, LibraryTab, SavedTab, RegulatoryTab so the page compiles. Each stub is a simple placeholder component that will be replaced in later tasks.

StudioTab stub:
```typescript
// frontend/src/app/reports/components/studio/StudioTab.tsx
"use client";
import { T } from "@/lib/design/tokens";

interface Props { token: string; userId?: string; }

export default function StudioTab({ token, userId }: Props) {
  return (
    <div style={{ padding: 24, fontFamily: T.fontMono, fontSize: 13, color: T.tertiary }}>
      STUDIO — loading...
    </div>
  );
}
```

LibraryTab stub:
```typescript
// frontend/src/app/reports/components/tabs/LibraryTab.tsx
"use client";
import { T } from "@/lib/design/tokens";

interface Props { onSelectPreset: (presetId: string) => void; }

export default function LibraryTab({ onSelectPreset }: Props) {
  return (
    <div style={{ padding: 24, fontFamily: T.fontMono, fontSize: 13, color: T.tertiary }}>
      LIBRARY — loading...
    </div>
  );
}
```

SavedTab stub:
```typescript
// frontend/src/app/reports/components/tabs/SavedTab.tsx
"use client";
import { T } from "@/lib/design/tokens";

interface Props { token: string; }

export default function SavedTab({ token }: Props) {
  return (
    <div style={{ padding: 24, fontFamily: T.fontMono, fontSize: 13, color: T.tertiary }}>
      SAVED — loading...
    </div>
  );
}
```

RegulatoryTab stub:
```typescript
// frontend/src/app/reports/components/tabs/RegulatoryTab.tsx
"use client";
import { T } from "@/lib/design/tokens";

interface Props { token: string; }

export default function RegulatoryTab({ token }: Props) {
  return (
    <div style={{ padding: 24, fontFamily: T.fontMono, fontSize: 13, color: T.tertiary }}>
      REGULATORY — loading...
    </div>
  );
}
```

- [ ] **Step 3: Build check**

Run: `cd frontend && npx next build 2>&1 | tail -5`
Expected: Build succeeds with no errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/reports/page.tsx frontend/src/app/reports/components/
git commit -m "feat(reports): decompose 1900L monolith into thin shell + tab stubs"
```

---

## Chunk 2: Studio Tab — Split-Pane Core

### Task 4: Create DataBinding.tsx

**Files:**
- Create: `frontend/src/app/reports/components/studio/DataBinding.tsx`
- Reference: `frontend/src/api/runsClient.ts` for `listRuns()` API

- [ ] **Step 1: Create DataBinding component**

This component shows a run selector dropdown, the bound policy, and status badges. It fetches available runs from the backend using `listRuns()`.

Key behaviors:
- Dropdown lists available CalculationRuns from `listRuns(token)`
- On select, calls `onBindingChange({ runId, policyId })`
- Shows green "RUN BOUND" / "POLICY BOUND" badges when bound
- Shows amber "NO RUN SELECTED" badge when unbound
- All inline styles using `T` tokens

Interface:
```typescript
export interface DataBindingState {
  runId: string | null;
  policyId: string | null;
  runLabel: string;
  policyLabel: string;
}
```

- [ ] **Step 2: Build check**

Run: `cd frontend && npx next build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/reports/components/studio/DataBinding.tsx
git commit -m "feat(reports): add DataBinding — run selector + policy display"
```

---

### Task 5: Create TemplateSelector.tsx

**Files:**
- Create: `frontend/src/app/reports/components/studio/TemplateSelector.tsx`
- Reference: `frontend/src/constants/reportPresets.ts` for `REPORT_PRESETS`

- [ ] **Step 1: Create TemplateSelector component**

Dropdown that lists all 35 report presets + a "Custom Report" option. On select, populates the section list. Shows metadata: audience badge, estimated pages, section count.

Key behaviors:
- Imports `REPORT_PRESETS` from `@/constants/reportPresets`
- Dropdown grouped by category (using `REPORT_CATEGORIES`)
- On select, calls `onTemplateChange(template)` which provides `default_sections`
- Shows template metadata below dropdown: audience, pages, tags
- "Custom Report" option starts with empty sections
- All inline styles using `T` tokens

- [ ] **Step 2: Build check + commit**

```bash
cd frontend && npx next build 2>&1 | tail -5
git add frontend/src/app/reports/components/studio/TemplateSelector.tsx
git commit -m "feat(reports): add TemplateSelector — preset dropdown with metadata"
```

---

### Task 6: Create SectionList.tsx

**Files:**
- Create: `frontend/src/app/reports/components/studio/SectionList.tsx`

- [ ] **Step 1: Create SectionList component**

Ordered list of report sections. Click to select (highlights). Drag handle (☰) for reorder. Remove (×) button. "+ ADD" to add sections from available types.

Key behaviors:
- Receives `sections: ReportSection[]` and `onSectionsChange`
- Selected section highlighted with left border (T.accent color)
- Drag-to-reorder using native HTML5 drag events (no library needed):
  - `draggable`, `onDragStart`, `onDragOver`, `onDrop`
  - Swap items in array on drop
- "+ ADD" button shows a small dropdown of available `SectionType` values not yet in list
- "×" remove button on each section
- Click section calls `onSelectSection(index)`
- All inline styles using `T` tokens

- [ ] **Step 2: Build check + commit**

```bash
cd frontend && npx next build 2>&1 | tail -5
git add frontend/src/app/reports/components/studio/SectionList.tsx
git commit -m "feat(reports): add SectionList — draggable ordered section list"
```

---

### Task 7: Create ConfigPanel.tsx

**Files:**
- Create: `frontend/src/app/reports/components/studio/ConfigPanel.tsx`

- [ ] **Step 1: Create ConfigPanel component**

Composes DataBinding + TemplateSelector + SectionList vertically in a scrollable 300px panel.

```typescript
"use client";

import { T } from "@/lib/design/tokens";
import DataBinding from "./DataBinding";
import TemplateSelector from "./TemplateSelector";
import SectionList from "./SectionList";
import type { DataBindingState } from "./DataBinding";
import type { ReportTemplate, ReportSection } from "@/types/reportTypes";

interface Props {
  token: string;
  binding: DataBindingState;
  onBindingChange: (b: DataBindingState) => void;
  template: ReportTemplate | null;
  onTemplateChange: (t: ReportTemplate | null) => void;
  sections: ReportSection[];
  onSectionsChange: (s: ReportSection[]) => void;
  selectedSection: number;
  onSelectSection: (i: number) => void;
}

export default function ConfigPanel({
  token, binding, onBindingChange,
  template, onTemplateChange,
  sections, onSectionsChange,
  selectedSection, onSelectSection,
}: Props) {
  return (
    <div style={{
      borderRight: `1px solid ${T.rim}`,
      overflowY: "auto",
      background: T.bgSub,
      display: "flex",
      flexDirection: "column",
    }}>
      <DataBinding
        token={token}
        binding={binding}
        onBindingChange={onBindingChange}
      />
      <TemplateSelector
        template={template}
        onTemplateChange={(t) => {
          onTemplateChange(t);
          if (t) {
            // Populate sections from template defaults
            const secs = t.default_sections.map((s, i) => ({
              ...s,
              id: `sec-${i}-${Date.now()}`,
            })) as ReportSection[];
            onSectionsChange(secs);
          }
        }}
      />
      <SectionList
        sections={sections}
        onSectionsChange={onSectionsChange}
        selectedSection={selectedSection}
        onSelectSection={onSelectSection}
      />
    </div>
  );
}
```

- [ ] **Step 2: Build check + commit**

```bash
cd frontend && npx next build 2>&1 | tail -5
git add frontend/src/app/reports/components/studio/ConfigPanel.tsx
git commit -m "feat(reports): add ConfigPanel — composes binding + template + sections"
```

---

### Task 8: Create PreviewPane.tsx

**Files:**
- Create: `frontend/src/app/reports/components/studio/PreviewPane.tsx`
- Reference: `frontend/src/components/reports/ReportsContainer.tsx` for panel rendering pattern

- [ ] **Step 1: Create PreviewPane component**

Right panel that renders the existing report panels (ExecutiveSummaryPanel, ExposureInsightsPanel, etc.) in a scrollable container. Each section gets a ref for scroll-to.

Key behaviors:
- When `binding.runId` is set, fetches the CalculateResponse from backend:
  `dashboardFetch(\`/v1/export/committee-pack/${binding.runId}\`, token)`
  or from the hedge context if already available
- Maps section types to panel components:
  - `EXECUTIVE_SUMMARY` → ExecutiveSummaryPanel
  - `EXPOSURE_DECOMPOSITION` → ExposureInsightsPanel
  - `HEDGE_EFFICIENCY` → HedgeEfficiencyPanel (alias for hedge coverage)
  - `SCENARIO_SENSITIVITY` → ScenarioSensitivityPanel
  - `POLICY_COMPLIANCE` → PolicyCompliancePanel
  - Other types → placeholder card with section title
- Each section wrapped in a div with `ref` for scroll-to
- When `selectedSection` changes, scrolls to that section via `scrollIntoView`
- Full/Section toggle at top: "FULL" shows all, "SECTION" shows only selected
- Shows "Select a run to preview report" message when no run bound
- All inline styles using `T` tokens

- [ ] **Step 2: Build check + commit**

```bash
cd frontend && npx next build 2>&1 | tail -5
git add frontend/src/app/reports/components/studio/PreviewPane.tsx
git commit -m "feat(reports): add PreviewPane — live report panel rendering"
```

---

### Task 9: Create ExportBar.tsx

**Files:**
- Create: `frontend/src/app/reports/components/studio/ExportBar.tsx`
- Reference: `frontend/src/utils/clientExport.ts` for export functions

- [ ] **Step 1: Create ExportBar component**

Bottom sticky bar with validation status, format quick-picks, and primary export button.

Key behaviors:
- Left side: section count, page estimate, SHA-256 hash (from existing `computeReportHash` if available), validation badges
- Right side: SAVE button (POST /v1/reports/save), format quick-picks (PDF, XLSX), primary EXPORT button
- SAVE calls `dashboardFetch("/v1/reports/save", token, { method: "POST", body: ... })`
- PDF export calls `exportCommitteePackPdf()` from clientExport.ts
- XLSX export calls `exportReportXlsx()` from clientExport.ts
- Validation: checks `binding.runId` is set, `sections.length > 0`
- Shows green "VALID" badge or amber "N ISSUES" badge
- Export button disabled when validation fails
- All inline styles using `T` tokens

- [ ] **Step 2: Build check + commit**

```bash
cd frontend && npx next build 2>&1 | tail -5
git add frontend/src/app/reports/components/studio/ExportBar.tsx
git commit -m "feat(reports): add ExportBar — validation + format picks + export"
```

---

### Task 10: Wire up StudioTab.tsx

**Files:**
- Modify: `frontend/src/app/reports/components/studio/StudioTab.tsx` (replace stub)

- [ ] **Step 1: Replace StudioTab stub with full implementation**

The StudioTab is the split-pane container that holds ConfigPanel (left), PreviewPane (right), and ExportBar (bottom). It owns all the state.

Key state:
- `binding: DataBindingState` — selected run + policy
- `template: ReportTemplate | null` — selected preset
- `sections: ReportSection[]` — current section list
- `selectedSection: number` — index of selected section in config panel

Layout:
```
display: flex; flex-direction: column; flex: 1; min-height: 0;
  ├─ split pane (display: grid; grid-template-columns: 300px 1fr; flex: 1; min-height: 0;)
  │   ├─ ConfigPanel (left, 300px)
  │   └─ PreviewPane (right, flex)
  └─ ExportBar (bottom, sticky)
```

- [ ] **Step 2: Build check**

Run: `cd frontend && npx next build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/reports/components/studio/StudioTab.tsx
git commit -m "feat(reports): wire StudioTab — split-pane config + preview + export"
```

---

## Chunk 3: Theme Conversion

### Task 11: Convert ReportsContainer.tsx to T tokens

**Files:**
- Modify: `frontend/src/components/reports/ReportsContainer.tsx`

- [ ] **Step 1: Add T import, replace all className and inline hex with T tokens**

Changes:
1. Add `import { T } from "@/lib/design/tokens";` at top
2. Replace all `className="..."` Tailwind usage with inline styles using T tokens
3. Replace any remaining hex values with T token references
4. Key conversions:
   - `className="w-full flex items-center..."` → `style={{ width: "100%", display: "flex", alignItems: "center", ... }}`
   - `bg-[var(--bg-panel)]` → `background: T.bgPanel`
   - `text-[var(--text-primary)]` → `color: T.primary`
   - All font references → `T.fontMono` or `T.fontUI`

- [ ] **Step 2: Build check + commit**

```bash
cd frontend && npx next build 2>&1 | tail -5
git add frontend/src/components/reports/ReportsContainer.tsx
git commit -m "refactor(reports): convert ReportsContainer from Tailwind to T tokens"
```

---

### Task 12: Convert EChartsWrapper.tsx to CSS variables

**Files:**
- Modify: `frontend/src/components/reports/EChartsWrapper.tsx:74-90`

- [ ] **Step 1: Update the C object to use CSS variable references**

The C object at line 74 has hardcoded hex values. Keep hex values for ECharts configs (ECharts can't resolve CSS variables at render time) but add a comment explaining this. The chart backgrounds should become `"transparent"` so they inherit from the panel's dark background.

Key changes at lines 74-90:
- `canvas: "#0B1120"` → `canvas: "transparent"` (inherits panel bg)
- `panelBg: "#0F1729"` → `panelBg: "transparent"`
- Keep data colors as hex (ECharts needs resolved values)
- Add comment: `// ECharts requires resolved hex — CSS vars don't work in canvas`

Also update tooltip styling to use transparent backgrounds with backdrop blur rather than hardcoded dark hex.

- [ ] **Step 2: Build check + commit**

```bash
cd frontend && npx next build 2>&1 | tail -5
git add frontend/src/components/reports/EChartsWrapper.tsx
git commit -m "refactor(reports): EChartsWrapper transparent canvas, inherits dark theme"
```

---

### Task 13: Convert 5 core report panels to T tokens

**Files:**
- Modify: `frontend/src/components/reports/ExecutiveSummaryPanel.tsx`
- Modify: `frontend/src/components/reports/ExposureInsightsPanel.tsx`
- Modify: `frontend/src/components/reports/HedgeEfficiencyPanel.tsx`
- Modify: `frontend/src/components/reports/PolicyCompliancePanel.tsx`
- Modify: `frontend/src/components/reports/ScenarioSensitivityPanel.tsx`

- [ ] **Step 1: Read each file and identify local style objects**

Check if each panel has a local `S` or `C` style object with hardcoded hex values. If it does, replace with `import { T } from "@/lib/design/tokens"` and use `T.bgPanel`, `T.primary`, `T.fontMono` etc.

If the panel already uses CSS variables (like VaRPanel and HedgeAccountingPanel do), no changes needed — just verify.

- [ ] **Step 2: Apply conversions to each file**

For each panel that has hardcoded hex:
1. Add `import { T } from "@/lib/design/tokens";`
2. Delete the local `S` or `C` object
3. Replace all references: `S.bgPanel` → `T.bgPanel`, `S.primary` → `T.primary`, etc.
4. If token names don't match exactly (e.g., `S.textPrimary` vs `T.primary`), map them:
   - `S.textPrimary` → `T.primary`
   - `S.textSecondary` → `T.secondary`
   - `S.textTertiary` → `T.tertiary`

- [ ] **Step 3: Build check + commit**

```bash
cd frontend && npx next build 2>&1 | tail -5
git add frontend/src/components/reports/ExecutiveSummaryPanel.tsx \
        frontend/src/components/reports/ExposureInsightsPanel.tsx \
        frontend/src/components/reports/HedgeEfficiencyPanel.tsx \
        frontend/src/components/reports/PolicyCompliancePanel.tsx \
        frontend/src/components/reports/ScenarioSensitivityPanel.tsx
git commit -m "refactor(reports): convert 5 core panels to T design tokens"
```

---

## Chunk 4: Secondary Tabs

### Task 14: Implement LibraryTab.tsx

**Files:**
- Modify: `frontend/src/app/reports/components/tabs/LibraryTab.tsx` (replace stub)
- Reference: `frontend/src/constants/reportPresets.ts` for data

- [ ] **Step 1: Replace stub with full implementation**

Grid of 35 preset cards with search bar and category filter pills at top.

Key behaviors:
- Imports `REPORT_PRESETS`, `REPORT_CATEGORIES` from `@/constants/reportPresets`
- Search bar filters presets by name, description, tags (case-insensitive)
- Category pills filter by category key. "All" pill shows everything.
- Each card shows: template_id badge, name, short_name, description, audience badges, page count, section count
- Click card calls `onSelectPreset(template_id)`
- "Custom Report" card at the end of the grid
- Grid: `display: grid; gridTemplateColumns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px`
- All inline styles using `T` tokens

- [ ] **Step 2: Build check + commit**

```bash
cd frontend && npx next build 2>&1 | tail -5
git add frontend/src/app/reports/components/tabs/LibraryTab.tsx
git commit -m "feat(reports): implement LibraryTab — 35 preset cards with search + filter"
```

---

### Task 15: Implement SavedTab.tsx

**Files:**
- Modify: `frontend/src/app/reports/components/tabs/SavedTab.tsx` (replace stub)

- [ ] **Step 1: Replace stub with full implementation**

Table of saved reports fetched from backend `GET /v1/reports/saved`.

Key behaviors:
- Fetches saved reports: `dashboardFetch("/v1/reports/saved", token)`
- Table columns: Name, Run ID (truncated), Template, Date, Version, Actions
- Version badges: shows version number with monospace styling
- Actions column: View (navigates to studio with report loaded), Re-export (PDF/XLSX), Delete
- Delete calls `dashboardFetch(\`/v1/reports/saved/${id}\`, token, { method: "DELETE" })`
- Shows EmptyState when no saved reports
- Sorted newest-first (backend returns this order)
- All inline styles using `T` tokens (table pattern from Position Desk)

- [ ] **Step 2: Build check + commit**

```bash
cd frontend && npx next build 2>&1 | tail -5
git add frontend/src/app/reports/components/tabs/SavedTab.tsx
git commit -m "feat(reports): implement SavedTab — saved reports table with re-export"
```

---

### Task 16: Implement RegulatoryTab.tsx

**Files:**
- Modify: `frontend/src/app/reports/components/tabs/RegulatoryTab.tsx` (replace stub)

- [ ] **Step 1: Replace stub with full implementation**

Grid of regulatory format cards with a run selector at top. Each card is a one-click download.

Key behaviors:
- Run selector dropdown at top (reuses DataBinding pattern or simpler select)
- 5 regulatory format cards:
  1. **EMIR Article 9** (XML) → `GET /v1/reports/{runId}/emir`
  2. **MiFID II RTS 25** (XML) → `GET /v1/reports/{runId}/mifid`
  3. **Dodd-Frank Title VII** (TXT) → `GET /v1/reports/{runId}/dodd-frank`
  4. **Bank Compliance PDF** → `GET /v1/reports/{runId}/bank-pdf`
  5. **Audit ZIP Bundle** → `GET /v1/export/zip/{runId}`
- Each card: icon, title, format badge (XML/TXT/PDF/ZIP), description, download button
- Download button disabled when no run selected
- On click: `dashboardFetch(url, token)` → get response blob → trigger browser download
- Shows loading state during download
- All inline styles using `T` tokens

- [ ] **Step 2: Build check + commit**

```bash
cd frontend && npx next build 2>&1 | tail -5
git add frontend/src/app/reports/components/tabs/RegulatoryTab.tsx
git commit -m "feat(reports): implement RegulatoryTab — 5 regulatory format downloads"
```

---

## Chunk 5: Nav + Cleanup + Verify

### Task 17: Update AppSidebar.tsx REPORTS section

**Files:**
- Modify: `frontend/src/components/layout/AppSidebar.tsx:107-117`

- [ ] **Step 1: Replace REPORTS nav items**

Find the Reports section (around lines 107-117) and replace with 4 tab-linked items:

Before:
```typescript
{
  label: "Reports", href: "/reports", icon: FileText,
  prefixes: ["/reports"],
  header: "Report Studio",
  items: [
    { label: "Report Studio",     desc: "30 presets, AI composer, export",   href: "/reports",              icon: FileText },
    { label: "Preset Library",    desc: "Board/treasury/risk/audit presets", href: "/reports?view=library", icon: Book },
    { label: "AI Report Builder", desc: "Goal-driven AI composer",           href: "/reports?view=builder", icon: Zap },
    { label: "Saved Reports",     desc: "Versioned and scheduled reports",   href: "/reports?view=saved",   icon: Shield },
    { label: "Run Results",       desc: "Hedge schedule with rationale",     href: "/results",              icon: BarChart3 },
    { label: "Committee Pack",    desc: "IFRS 9 hedge effectiveness pack",   href: "/committee-pack",       icon: Download },
  ],
},
```

After:
```typescript
{
  label: "Reports", href: "/reports", icon: FileText,
  prefixes: ["/reports"],
  header: "REPORTS",
  items: [
    { label: "Studio",      desc: "Split-pane report composer",       href: "/reports",                  icon: FileText },
    { label: "Library",     desc: "35 institutional presets",          href: "/reports?tab=library",      icon: Book },
    { label: "Saved",       desc: "Saved reports & versions",         href: "/reports?tab=saved",        icon: Shield },
    { label: "Regulatory",  desc: "EMIR, MiFID, Dodd-Frank",          href: "/reports?tab=regulatory",   icon: Download },
    { label: "Run Results", desc: "Hedge schedule with rationale",     href: "/results",                  icon: BarChart3 },
    { label: "Committee Pack", desc: "IFRS 9 effectiveness pack",     href: "/committee-pack",           icon: Download },
  ],
},
```

Note: Keep "Run Results" and "Committee Pack" — these are separate pages, not part of the report studio tabs.

- [ ] **Step 2: Build check + commit**

```bash
cd frontend && npx next build 2>&1 | tail -5
git add frontend/src/components/layout/AppSidebar.tsx
git commit -m "refactor(reports): update sidebar nav — 4 tab-linked items"
```

---

### Task 18: Final build verification

- [ ] **Step 1: Full build check**

Run: `cd frontend && npx next build 2>&1 | tail -20`
Expected: Build succeeds with zero errors. Reports page builds successfully.

- [ ] **Step 2: Check all stale references**

Run: `grep -rn "view=library\|view=builder\|view=saved" frontend/src/ --include="*.tsx" --include="*.ts" | grep -v node_modules | grep -v __tests__`
Expected: No results (old `?view=` params replaced by `?tab=`)

- [ ] **Step 3: Commit all remaining changes**

```bash
git add -A
git commit -m "feat(reports): Report Studio redesign — split-pane, dark theme, 4 tabs"
```

---

## Verification Checklist

After all tasks complete, verify:

1. **Build**: `cd frontend && npx next build` — zero errors
2. **Theme**: All report components render dark (no white panels)
3. **Tab routing**: `/reports`, `/reports?tab=library`, `/reports?tab=saved`, `/reports?tab=regulatory` all work
4. **Studio**: Config panel + live preview + export bar layout correct
5. **Library**: 35 preset cards render, search works, click loads into studio
6. **Saved**: Table loads from backend, delete works
7. **Regulatory**: 5 format cards render, downloads work when run selected
8. **Sidebar**: 4 nav items navigate correctly
9. **Panels**: All 7 report panels render in dark theme
10. **Charts**: ECharts have transparent background, inherit dark theme
11. **Exports**: PDF, XLSX, CSV from ExportBar still function
12. **No regressions**: reportCalcs.ts, clientExport.ts, reportTypes.ts unchanged
