# Bug Report — ORDR Terminal
**Review Date**: 2026-02-27
**Priority Scale**: P0=Blocker | P1=Critical | P2=Major | P3=Minor

---

## P0 — Blockers (Prevents core function)

None currently. Backend calculation engine and position lifecycle are functional.

---

## P1 — Critical

### ~~BUG-001: `/execution-history` page does not exist~~ — VERIFIED RESOLVED
**Status**: FALSE POSITIVE — page does exist at `frontend/src/app/execution-history/page.tsx`
**Verification**: Page reads from `listConnectorRuns` API client, renders a full execution history table with status filters, date range, search, and expandable detail rows.
**Note**: The page is correctly implemented with KPI cards, pagination, and CSV export. No action required.

---

### BUG-002: Audit Trail reads localStorage only — not connected to backend WORM table
**Section**: Governance → Audit Trail
**Reproduction**:
1. Log in, perform any operation (create position, assign policy, run calculation)
2. Navigate to Governance → Audit Trail
3. Observe: Events listed come from localStorage keys (`ordr_last_run_meta`, `ordr_connector_runs`, etc.) — NOT from the backend `audit_events` table
4. Open a new private browser window, log in with the same credentials
5. Observe: Audit trail is EMPTY in the new window

**Expected**: All audit events from the backend `GET /v1/audit` endpoint should appear, persisted in PostgreSQL
**Root Cause**: `frontend/src/app/audit-trail/page.tsx` reads from localStorage instead of calling the backend API
**CRO Impact**: HIGH — the audit trail presented to governance/auditors is session-scoped and ephemeral, undermining the WORM guarantee
**Fix**: Replace localStorage reads with `dashboardFetch('/v1/audit?limit=200', token)` from `dashboardClient`
**Files**: `frontend/src/app/audit-trail/page.tsx`

---

### BUG-003: WorkflowBreadcrumb Step 01 links to wrong page
**Section**: Position Desk / Policy Desk / Execution Desk (breadcrumb strip)
**Reproduction**:
1. Navigate to `/position-desk`
2. Observe the "01 POSITION DESK" breadcrumb step
3. Click it
4. Observe: Navigates to `/input` (Ingestion Desk), NOT `/position-desk`

**Expected**: Step 01 "POSITION DESK" should navigate to `/position-desk`
**Root Cause**: `WorkflowBreadcrumb.tsx` line 23: `{ key: "position", label: "POSITION DESK", href: "/input", num: "01" }`
**Fix**: Change `href: "/input"` to `href: "/position-desk"` on line 23
**Files**: `frontend/src/components/layout/WorkflowBreadcrumb.tsx:23`

---

### BUG-004: Legacy `Nav.tsx` imported by orphaned `/hedges` page — wrong branding shown
**Section**: `/hedges` page
**Evidence**:
- `frontend/src/components/Nav.tsx` — renders "HedgeCalc" branding with 4 legacy links including "Currency FX (Old Engine)"
- Confirmed: `frontend/src/app/hedges/page.tsx` line 4 imports `Nav.tsx`
- `frontend/src/components/layout/Header.tsx` — renders "HedgeCalc · FX POC · USD/MXN" (not imported by any active nav page)

**Risk**: `/hedges` is not in the main nav, but if a user navigates there (e.g., via direct URL), they see the old "HedgeCalc" branding instead of "ORDR Terminal". `Header.tsx` is currently not imported anywhere — it's dead code but a maintenance hazard.
**Fix**: Remove `Nav.tsx` import from `/hedges/page.tsx` and replace with `AppTopBar` pattern. Archive or delete `Header.tsx`.
**Files**:
- `frontend/src/app/hedges/page.tsx:4`
- `frontend/src/components/Nav.tsx`
- `frontend/src/components/layout/Header.tsx`

---

### BUG-005: `execution-desk` only shows `POLICY_ASSIGNED` positions — hides `READY_TO_EXECUTE`
**Section**: Execution → Execution Desk → Step 1 Review
**Observation**: `execution-desk/page.tsx` line: `positions.filter((p) => p.execution_status === "POLICY_ASSIGNED")`
**Problem**: The position lifecycle is `NEW → POLICY_ASSIGNED → READY_TO_EXECUTE → HEDGED`. The Execution Desk filter only shows `POLICY_ASSIGNED`, missing any positions already marked `READY_TO_EXECUTE`. The name "POLICY_ASSIGNED" is also used as the gate for execution, but the backend model has a separate `READY_TO_EXECUTE` state.
**Fix**: Filter should include both `POLICY_ASSIGNED` and `READY_TO_EXECUTE`, OR the policy assignment step should auto-transition to `READY_TO_EXECUTE`
**Files**: `frontend/src/app/execution-desk/page.tsx` (readyPositions useMemo)

---

## P2 — Major

### BUG-006: Access Control permission matrix is hardcoded
**Section**: Governance → Access Control
**Observation**: The "Permission Matrix" tab in `access-control/page.tsx` renders a hardcoded 7×12 grid with roles (Admin, CFO, Head of Risk, etc.) and their permissions. This is not fetched from `GET /v1/admin/roles` or the `role_permissions` table.
**Impact**: A user who has had their role changed in the backend will see stale permissions in this UI. For a governance screen, this is misleading.
**Fix**: Fetch roles + permissions from `/v1/admin/roles` and `/v1/admin/roles/{id}/permissions`
**Files**: `frontend/src/app/access-control/page.tsx`

---

### BUG-007: Duplicate "Committee Pack" in two menus
**Section**: Reports menu AND Governance menu
**Observation**: `/committee-pack` appears under both Reports → Committee Pack AND Governance → Committee Pack. Both link to the same route.
**Impact**: Navigation confusion; "Governance" should own audit artifacts; "Reports" should own exportable documents.
**Fix**: Remove from Governance menu OR move the page conceptually to one location.
**Files**: `frontend/src/components/layout/AppTopBar.tsx:267,279`

---

### BUG-008: "Hedge Wiki" duplicated across Dashboard and Governance menus
**Section**: Dashboard menu AND Governance menu
**Observation**: `/hedgewiki` appears as the last item in Dashboard's dropdown (under "Hedge Wiki") AND as the first item in Governance's dropdown.
**Fix**: Remove from Dashboard dropdown. HedgeWiki belongs in Governance.
**Files**: `frontend/src/components/layout/AppTopBar.tsx:216`

---

### BUG-009: Help sub-items all link to the same page with no differentiation
**Section**: Help menu
**Observation**: Documentation, FAQ, and Contact Support all link to `/help` with no hash anchor or query param. When the dropdown is open, clicking any of the three navigates to the same page with no scroll or section jump.
**Fix**:
- "Documentation" → `/help` (fine as default)
- "FAQ" → `/help?section=faq` or `/help#faq`
- "Contact Support" → `/help?section=contact` or `/help#contact`
**Files**: `frontend/src/components/layout/AppTopBar.tsx:300-303`

---

### BUG-010: Settings hash anchors may not trigger scroll-to-section
**Section**: Settings sub-menus
**Observation**: Settings sub-items (Policy Limits, Execution, API & Keys, Notifications) use hash anchor links (`/settings#policy_limits`, etc.). This works only if the settings page implements scroll behavior to the section with that `id`. If the `<section id="policy_limits">` element doesn't exist, the link lands on the top of the settings page with no visual indication of which tab was requested.
**Fix**: Verify that `settings/page.tsx` reads the `window.location.hash` on mount and activates the correct tab.
**Files**: `frontend/src/app/settings/page.tsx`, `frontend/src/components/layout/AppTopBar.tsx:289-292`

---

### BUG-011: `/results` page label is "Committee Pack" but renders a multi-tab run viewer
**Section**: Reports → Hedge Plan Report → `/results`
**Observation**: `results/page.tsx` comment says "Committee Pack" but the component is actually a multi-tab run results viewer with Overview, Exposure, Risk, Effectiveness, Execution, and Audit tabs. The `/committee-pack` page is a separate page.
**Impact**: Confuses the user model — "Hedge Plan Report" in the menu → lands on `/results` which doesn't match the label
**Fix**: Align menu label with page content. If `/results` = Hedge Plan Report viewer, rename or document it clearly.
**Files**: `frontend/src/app/results/page.tsx`, `AppTopBar.tsx:265`

---

### BUG-012: Position Desk bulk-reject with reason doesn't validate reason text length
**Section**: Position Desk → Bulk Reject
**Observation**: From the recent commit log (`feat(position-desk): bulk reject with reason`), bulk rejection with a reason string is implemented. However, from the API contract (`v1_positions.py PATCH /{id}/reject`), there is no validation of minimum/maximum reason length enforced server-side in the route (relies on Pydantic schema only).
**Impact**: Empty rejection reason strings may be accepted and persisted; audit trail will have blank-reason rejections.
**Fix**: Add minimum 5-character validation on rejection reason in the frontend form AND backend schema.

---

## P3 — Minor

### BUG-013: "LIVE" indicator in AppTopBar is always green regardless of backend health
**Section**: AppTopBar bottom-right
**Observation**: The "● LIVE" indicator in the menu bar is a static green dot with static "LIVE" text. It is never set to DEGRADED or OFFLINE even if the backend is unreachable.
**Fix**: Poll `GET /health` every 60s and update the indicator color accordingly.
**Files**: `frontend/src/components/layout/AppTopBar.tsx:667-673`

---

### BUG-014: Product name inconsistency across codebase
**Section**: Global
**Evidence**:
- `Nav.tsx` → "HedgeCalc"
- `Header.tsx` → "HedgeCalc · FX POC · USD/MXN"
- `AppTopBar.tsx` → "ORDR TERMINAL" (and ORDR logo image)
- CLAUDE.md → "ORDR Terminal"
- Backend comments → "HedgeCore"
- Help page → "ORDR Terminal"
- Dashboard title → "HedgeCalc" (widget registry)
**Fix**: Standardize to "ORDR Terminal" everywhere in user-facing text.

---

### BUG-015: Orphaned pages not reachable from navigation
**Section**: Multiple
**Pages**: `/hedges`, `/terminal`, `/ledger`, `/ledger/[id]`, `/staging`, `/staging/[id]`, `/sandbox/whitepaper`
**Impact**: These pages exist but users cannot reach them from the main nav. Either add to nav or confirm they are intentionally internal/deep-link only.

---

### BUG-016: `execution/page.tsx` labeled "Results Viewer" in Execution menu but is the ExecutionBridge
**Section**: Execution → Results Viewer → `/execution`
**Observation**: The menu item says "Results Viewer" with description "Pre-flight auth checklist, DV01, ticket desk, IBKR handoff", which accurately describes the `/execution` page (ExecutionBridge). But the label "Results Viewer" implies a read-only view of past results, not the interactive execution step.
**Fix**: Rename to "Execution Bridge" or "Trade Desk" in the nav.
**Files**: `frontend/src/components/layout/AppTopBar.tsx:251`
