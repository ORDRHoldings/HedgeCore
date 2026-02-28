# UX/UI Enhancement Plan
**Review Date**: 2026-02-27
**Lens**: UX/UI Director — Institutional Fintech

---

## Part A — Information Architecture Improvements

### A1. Menu Label Changes

| Current Label | Proposed Label | Reason |
|--------------|---------------|--------|
| "Results Viewer" (Execution menu) | "Trade Desk" or "Execution Bridge" | Current label implies read-only; page is interactive execution |
| "Data Pipeline Log" (Execution menu) | "Import Audit Log" | Clearer; aligns with `/import-history` which does the same thing |
| "Ingestion Desk" (Position Desk menu) | "New Exposure" | More actionable; "ingestion" is backend terminology |
| "Hedge Plan Report" (Reports menu) | "Run Results" | `/results` shows multi-tab run output, not just a "hedge plan" |
| "My Saved Policies" (Policy menu) | "Policy Vault" | More institutional; clearer ownership model |

### A2. Menu Structure Cleanup

**Remove duplicates:**
- Remove "Hedge Wiki" from Dashboard dropdown → belongs only in Governance
- Remove "Committee Pack" from Governance dropdown → belongs only in Reports
  - OR: Keep in Governance but rename to "Audit Pack" (governance document) vs "Committee Pack" (presentation document)

**Collapse Dashboard sub-items:**
- "Portfolio Risk" and "Scenario Studio" are simulation/analytics tools, not dashboard views
- Consider moving them under a new "Analytics" top-level menu item, OR under "Execution" as analytical tools

**Recommended IA (8 → 7 menus):**
```
Dashboard          → Summary, Portfolio Risk, Scenario Studio
Position Desk      → Position Desk, Ingestion Desk, Bulk Import, Data Connectors, Import History
Policy Engine      → Policy Desk, Policy Library, AI Wizard, My Saved Policies
Execution          → Execution Desk, Trade Desk, Sandbox, FX Rates
Reports            → Report Studio, Preset Library, AI Builder, Saved Reports, Hedge Plan, Committee Pack
Governance         → HedgeWiki, Audit Trail, Run Viewer, Position Lineage, Access Control
Settings / Help    → Merge into one ⚙ icon with Settings + Help sub-sections
```

### A3. Pages to Merge / Split

| Recommendation | Reason |
|---------------|--------|
| Merge `/execution-history` (missing) into `/import-history` | Same content (import audit log); eliminate dead link |
| Split Settings page: add smooth scroll + active-tab-per-hash | Currently all hash links land at top; tab switching required |
| Consider merging `/policies` and `/saved-policies` | Both browse/manage policy templates; difference is scope filter (presets vs user-created) |

---

## Part B — Screen-Level UX Fixes

### B1. Dashboard

**Top 10 UX Improvements:**

1. **Empty state is missing for widgets with no data** — KpiSummary, ExposureSummary, PipelineStatus show blank/loading indefinitely when backend returns empty arrays. Add an `EmptyState` component: "No exposure data yet — add positions in the Position Desk."
2. **Widget add/remove catalog**: Catalog modal opens but doesn't show which widgets are already on the board (no visual distinction between "added" vs "available"). Add a checkmark or "On Board" badge to already-added widgets.
3. **Timestamp display**: Dashboard shows "last updated" as `ts` computed on mount, but doesn't refresh. Widget data can be stale. Add a "Last refreshed" indicator and a global "Refresh All" button.
4. **Role-specific default layouts**: 11 role layouts exist but there's no onboarding tooltip explaining "Your layout is role-optimized." New users won't know they can drag/rearrange.
5. **Command Hub widget**: Appears to be a keyboard shortcut launcher — label it clearly: "COMMAND PALETTE" with `Cmd+K` shortcut hint.
6. **Grid breakpoints**: At tablet width (768px), 12-column grid may compress widgets below readable size. Define minimum widget sizes in `widgetRegistry.ts` for all 17 widgets.
7. **GeoPolitical and Polisophic widgets**: If data is mocked, add a "SIMULATED DATA" watermark badge. Never present mocked data without disclosure.
8. **SystemPulse widget**: Should show real backend health, not mocked. Connect to `GET /health`.
9. **Help panel (DashboardHelpPanel)**: Trigger button is a `HelpCircle` icon in the header. It's not visually prominent. Consider a persistent "?" button in the bottom-right corner (standard UX pattern).
10. **Widget drag handle**: `className="widget-drag-handle"` exists on all widget headers, but users don't know they're draggable. Add a drag indicator icon (⠿) to the left of each widget header.

**Empty State**: "Your hedge portfolio is empty — [Add First Position]" button that links to `/position-desk`.
**Error State**: If KPI API fails — show "Unable to load summary" with a retry button. Not a blank widget.

---

### B2. Position Desk

**Top 10 UX Improvements:**

1. **Status filter clarity**: Filter chips are "ALL | NEEDS ACTION | NEW | POLICY_ASSIGNED | READY | HEDGED | REJECTED". The `NEEDS_ACTION` preset is a multi-state filter (combines NEW + POLICY_ASSIGNED). This should be visually distinguished from single-state filters — perhaps as a "🔔 NEEDS ACTION" primary button vs grey chips for states.
2. **Column density**: Table has ~10 columns. At standard display resolution, Record ID + Entity + Currency + Amount + Status + Policy ID + Run ID + Value Date + Flow + Actions overflow horizontally. Implement column pinning (Record ID + Status + Actions always visible) and horizontal scroll for the rest.
3. **Bulk selection UX**: Row checkboxes exist but the bulk action bar only appears after selection. Add a "Select All" master checkbox in the header row. Show count badge: "3 selected" when rows are checked.
4. **Policy ID + Run ID chips**: "Click to copy" behavior is good. But chips are small and hard to distinguish at a glance. The Policy ID chip should use amber/gold color, Run ID chip should use purple — matching the provenance graph color coding from `/lineage`.
5. **Add Exposure Line form**: Form fields don't have placeholder hint text showing expected format. Add: "e.g. TXN-001" for Record ID, "USD, MXN, EUR…" for currency, "YYYY-MM-DD" for value date.
6. **Validation messages**: Error states for blank fields should be inline (under the field), not toast-only. At a minimum, highlight the offending field border in red.
7. **Duplicate Record ID detection**: No frontend or backend duplicate check on `record_id`. If a user submits TXN-001 twice, both are created. Add: check for existing record_id in the current position list before submit.
8. **REJECTED positions with reason**: The rejection reason tooltip on hover is good. But rejected positions dominate visual space. Add a "Show/Hide Rejected" toggle with a count badge: "5 REJECTED ▼".
9. **Empty state (no positions)**: The current empty state should include a 3-step workflow illustration: "1. Add Position → 2. Assign Policy → 3. Execute Hedge" with action buttons.
10. **Keyboard shortcut discoverability**: `/` for search, `F` for filter toggle, `R` to refresh exist but are undisclosed. Add a "⌨ Shortcuts" tooltip or a small keyboard icon with a popover.

---

### B3. Policy Desk

**Top 10 UX Improvements:**

1. **Assignment mode tabs**: Four modes (Active Policy, Template Selection, Favorites, AI Recommendation) are tabs with no visual hierarchy. "Active Policy" should be the default — most users just want to assign the active policy to all selected positions.
2. **Bulk assignment confirmation**: After clicking "Assign Policy to N positions", show a preview: "Assigning 'Full Protection v3.2' to 5 positions (MXN/USD AP)" before confirming. Currently, the action may be immediate.
3. **Policy detail panel**: When browsing templates, the detail panel should show key parameters at a glance: Hedge Ratio, Tenor Buckets, Instruments Allowed, Governance Owner — not just description text.
4. **AI Recommendation**: The "AI Recommendation" tab should clearly state its reasoning: "Recommended based on: 3 AP positions, 2 MXN exposures, avg tenor 45 days." Without reasoning, users don't know why the AI chose a policy.
5. **Favorites shortcut**: Users should be able to star/favorite a policy directly from the assignment modal, without navigating to Policy Library.
6. **Unassign policy**: Is there a way to remove a policy from a `POLICY_ASSIGNED` position? If not, document that users must use "Reject and Reopen" to restart. If yes, add an "Unassign" action.
7. **Position filter on Policy Desk**: If the user comes from Position Desk with a filter active (e.g., "EUR positions only"), the Policy Desk should inherit that filter context. Currently, navigation loses filter state.
8. **Policy version display**: When showing an active policy, display the version number prominently: "Full Protection v3.2 (rev: PR-2847)". Version traceability is critical for audit.
9. **Policy assignment success**: After bulk assignment, navigate the user to the next step (Execution Desk) with a toast: "5 positions assigned. Proceed to Execution →" — not just update the table silently.
10. **Empty state**: "No positions available for policy assignment — all positions are either NEW (need a policy) or already HEDGED." with links to relevant actions.

---

### B4. Execution Desk

**Top 10 UX Improvements:**

1. **Step 1 Review — "POLICY_ASSIGNED only" filter**: The filter excludes `READY_TO_EXECUTE` positions (BUG-005). Fix the filter, or explain why `READY_TO_EXECUTE` isn't shown.
2. **Step 2 Calculate — show engine input summary**: Before running, display a summary: "Running hedge calculation for 5 positions totaling MXN 1,250,000." Users need to confirm what they're about to calculate.
3. **Step 3 Risk Check — pass/fail clarity**: Each compliance check should show: name, description, actual value vs. threshold, PASS/FAIL, and what action is blocked if FAIL. Currently, some checks may be opaque.
4. **Step 4 Execute — IBKR ticket format**: The ticket format (ticker, quantity, action, time-in-force) should be explicitly labeled as "IBKR-ready" with a disclaimer: "These tickets require manual entry into your broker platform. ORDR Terminal does not submit orders electronically."
5. **Pipeline progress bar**: The `PipelineProgress` component should show what data is coming into each step (e.g., Step 2: "5 positions selected", Step 3: "Run ID: CALC-xxxx").
6. **Back navigation**: The "← Back" button between steps should warn if the user has unsaved changes (e.g., going back from Step 3 would lose the run result).
7. **Error handling on Calculate**: If the backend returns a 422 validation error or 503, show a structured error with: what failed, why, and what to do (check FX rates, check position amounts).
8. **"0 READY" state**: When no `POLICY_ASSIGNED` positions exist, Step 1 should show an empty state with a prominent CTA: "Assign policies first → Policy Desk" rather than just an empty table.
9. **Run time estimate**: For large position sets, show a spinner with "Calculating... (typically < 2 seconds)".
10. **Post-execution summary**: After Step 4 completes, show a summary: "5 positions marked HEDGED | Run ID: CALC-xxxx | 5 hedge tickets generated" before redirecting to Position Desk.

---

### B5. Reports

**Top 10 UX Improvements:**

1. **Data binding required**: Before generating any report, force the user to bind a Run ID. Currently, if no run exists, the report can be generated with empty tables. Add a "Select Run" step at the top.
2. **AI Report Builder disclaimer**: The builder must display a persistent disclaimer: "AI generates structure and narrative only — all numbers are sourced from the selected calculation run. No data is invented."
3. **Export format clarity**: Exporting to "PDF" from a browser is HTML-to-PDF (print media). Set user expectations: "Print-ready PDF via browser print dialog" vs native PDF generation.
4. **Report preview**: The print preview pane should be wider (it may render at a narrow width). Institution reports need to be readable at A4/letter.
5. **Committee Pack structure**: The Committee Pack should have a fixed structure (cover page, hedge summary, effectiveness test, risk analysis, approval signatures). If any section is missing data, mark it "INCOMPLETE" rather than showing empty tables.
6. **Saved reports versioning**: Each time a report is saved over an existing name, create a new version (v1, v2…). Currently uses localStorage which may overwrite.
7. **Report audit trail**: Every report generation should emit an audit event: who generated it, what run was used, when. This is essential for CRO/CFO governance.
8. **Search in preset library**: The 30-preset search works but there's no category filter shortcuts (e.g., "Board", "Treasury", "Risk", "Audit"). Add category chips above the grid.
9. **XLSX export format**: Column headers should use the same labels as the Position Desk table. Currently, export column names may differ from the UI column names.
10. **Committee Pack accessibility**: The print-ready pack must meet WCAG AA minimum for color contrast (important for regulatory submissions). Avoid light grey text on white background.

---

### B6. Governance Pages

**Top 10 UX Improvements (across Audit Trail, Run Viewer, Lineage, Access Control, HedgeWiki):**

1. **Audit Trail — connect to backend** (BUG-002): This is the most critical UX/governance fix. Replace localStorage reads with real backend data.
2. **Audit Trail — chain integrity UI**: The "Verify Chain Integrity" button should call `GET /v1/audit/chain/verify` (backend has this endpoint). Currently, it performs client-side simulated verification.
3. **Run Viewer — run selector**: The page requires a `?id=` query param. If no ID is provided (e.g., user navigates directly to `/run-viewer`), show a list of recent runs to choose from, not a blank page.
4. **Position Lineage — back to position**: After viewing lineage for a position, there should be a prominent "← Back to Position" link that preserves context.
5. **Position Lineage — no position selected state**: If `/lineage` is loaded without `?position=` param, show a position selector, not a blank/error page.
6. **HedgeWiki — search**: The search in the left panel should highlight matching text within articles, not just filter the list.
7. **HedgeWiki — print article**: Each article should have a "Print" or "Export to PDF" action for documentation packages.
8. **Access Control — live data**: Load real users/roles from API. Display MFA enforcement status as a toggle for admins, not just a read-only badge.
9. **Access Control — Branch Hierarchy tab**: The "Admin Only" placeholder message is vague. Show the hierarchy with a lock icon and: "Contact your system administrator to configure branch hierarchy — or sign in as admin."
10. **Committee Pack (Governance context)**: The `/committee-pack` page, when accessed from Governance, should show the MOST RECENT committee pack for the active run, pre-populated, with a note: "This is the board-ready audit documentation package."

---

## Part C — Enterprise Design System Checklist

### Typography Scale
| Usage | Font | Size | Weight | Letter-Spacing |
|-------|------|------|--------|---------------|
| Page titles | IBM Plex Sans | 16-18px | 700 | +0.04em |
| Section headers | IBM Plex Sans | 13-14px | 600 | +0.06em uppercase |
| Table labels | IBM Plex Mono | 10-11px | 600 | +0.08em uppercase |
| Body / descriptions | IBM Plex Sans | 12-13px | 400 | normal |
| Data values | IBM Plex Mono | 12-13px | 400 | normal |
| Badges / chips | IBM Plex Mono | 9-10px | 700 | +0.06-0.1em |
| Headings (hero) | Manrope | 24-32px | 700 | -0.01em |
| Code | JetBrains Mono | 12px | 400 | normal |

**Issue**: Minimum 12px font enforced in CLAUDE.md but some badge/chip text is 9-10px. This is acceptable for badges (max 3 chars) but not for readable text. Ensure no label > 3 chars uses font size < 11px.

### Spacing / Grid
- **Standard unit**: 4px base unit (everything multiples of 4)
- **Panel padding**: 16px horizontal, 12px vertical (consistent across all panels)
- **Table row height**: 40px (dense), 48px (standard), 56px (comfortable)
- **Current state**: Position Desk rows are ~40px (dense) — correct for data tables. Dashboard widgets have inconsistent internal padding.

### Button Hierarchy
| Level | Usage | Appearance |
|-------|-------|-----------|
| Primary | Execute, Assign, Run, Approve | Filled cyan background, dark text |
| Secondary | View, Edit, Export | Outlined, cyan border, transparent bg |
| Destructive | Reject, Delete, Withdraw | Outlined, red border |
| Ghost | Back, Cancel, Dismiss | No border, secondary text color |

**Current state**: Mixed patterns. Some "Execute" buttons are outlined (should be filled primary). The destructive actions (Reject) use red outlines correctly.

### Status Color Semantics

| Status | Color | Hex | Usage |
|--------|-------|-----|-------|
| PASS / HEDGED / Active | Green | `--status-pass` #22c55e | All positive final states |
| PENDING / NEW / ASSIGNED | Cyan | `--accent-cyan` | Intermediate actionable states |
| WARNING / POLICY_ASSIGNED | Amber | `--accent-amber` | States requiring attention |
| ERROR / REJECTED | Red | `--accent-red` #B91C1C | Failure/rejection states |
| INFO / TRACE / RUN | Indigo/Purple | #818cf8 | Audit/technical data |
| NEUTRAL / INACTIVE | Tertiary text | `--text-tertiary` | Disabled or historical |

**Current state**: Mostly consistent. `POLICY_ASSIGNED` uses blue in some screens and cyan in others — normalize to cyan.

### Keyboard Shortcuts
Documented shortcuts in Position Desk: `/` (search), `F` (filter), `R` (refresh), `Esc` (close modal).
**Gap**: No global keyboard shortcut manifest. Add to Help page and a `?` tooltip in the toolbar.

### Accessibility (WCAG AA Minimum)
- [ ] Color contrast for tertiary text on panel backgrounds: verify ≥ 4.5:1
- [ ] All icon-only buttons must have `title` or `aria-label` attributes
- [ ] Dropdown menus must be keyboard-navigable (Tab + Enter)
- [ ] Status chips must not rely on color alone — add text label
- [ ] Modal overlays must trap focus and respond to Esc
- [ ] Form fields must have associated `<label>` elements

---

## Part D — "Make it Simpler" Redesign Proposal

### Core Insight
The product does two things:
1. **Ingest positions** (exposures from AR/AP)
2. **Generate a hedge plan** (policy → calculation → tickets)

Every other page supports one of these two activities. The current 8-section nav menu buries this simplicity.

### Simplified Workflow Proposal

**Home Screen** (when no data exists — first login):
```
┌─────────────────────────────────────────────────────┐
│  ORDR Terminal                        demo  ADMIN   │
├─────────────────────────────────────────────────────┤
│                                                     │
│   Your hedge portfolio is empty.                    │
│                                                     │
│   ┌───────────────┐    ┌───────────────┐            │
│   │  + Add         │    │  📁 Upload    │            │
│   │   Exposure     │    │   CSV/XLSX    │            │
│   └───────────────┘    └───────────────┘            │
│                                                     │
│   Or connect an ERP / Database                      │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**After positions exist — Workflow Strip always visible:**
```
01 POSITIONS (12)  ──→  02 ASSIGN POLICY  ──→  03 EXECUTE  ──→  04 REPORT
  NEW: 3  READY: 4         No active policy          0 ready            —
  [View All]              [Assign Now]            [Run Pipeline]    [Generate]
```

**Simplified Page Structure (current → simplified):**

| Current | Simplified | Removed/Merged |
|---------|-----------|---------------|
| Dashboard (complex) | Dashboard (KPIs + quick actions only) | Remove Portfolio Risk/Scenario from dashboard |
| Position Desk | Position Desk (unchanged) | — |
| Ingestion Desk | Merged into Position Desk as "Import" tab | — |
| Policy Desk | Simplified: one-click assign active policy | AI wizard/Library behind "Advanced" link |
| Execution Desk | Unchanged (4-step is correct) | — |
| Results Viewer | Renamed: Trade Desk | — |
| Sandbox | Available from Execution Desk as "What-If" tab | Not a top-level nav item |
| Reports (7 sub-items) | Reports (simplified: Recent | Create New | Saved) | Library/AI behind "More" |
| Governance (6 sub-items) | Governance (simplified: Audit | Lineage | Wiki | Access) | Remove Committee Pack duplicate |
| Settings | Unchanged | — |

### Progressive Disclosure Principle
- **Show by default**: Only the actions relevant to the current state of the user's data
- **Hide behind "Advanced"**: AI wizard, scenario studio, sandbox, report builder, connectors
- **Surface contextually**: If 5 positions are `POLICY_ASSIGNED`, show a banner: "5 positions ready for execution →"
