# Navigation & Page Inventory
**Review Date**: 2026-02-27
**Source**: `frontend/src/components/layout/AppTopBar.tsx`

---

## Top Navigation Bar Structure

The app uses a two-row sticky header (`AppTopBar.tsx`):
- **Row 1** (44px): ORDR logo | section pill | user identity | role badge | branch | Sign Out
- **Row 2** (36px): 8 menu sections with hover-dropdown sub-navigation

A separate `WorkflowBreadcrumb` appears on Position Desk, Policy Desk, and Execution Desk pages as a secondary step-progress bar.

---

## Navigation Inventory Table

| Menu | Submenu Label | Route | Page Exists? | Expected API | Notes |
|------|---------------|-------|-------------|-------------|-------|
| **Dashboard** | Summary | `/dashboard` | ✅ | `/v1/dashboard/summary` | 17 drag-drop widgets |
| | Portfolio Risk | `/portfolio-risk` | ✅ | — | Simulation page |
| | Scenario Studio | `/scenario-studio` | ✅ | — | Monte Carlo stress test |
| | Polisophic | `/polisophic` | ✅ | — | Macro/political risk feed |
| | Hedge Wiki | `/hedgewiki` | ✅ | — | DUPLICATE — also in Governance |
| **Position Desk** | Position Desk | `/position-desk` | ✅ | `/v1/positions` | Main lifecycle control tower |
| | Ingestion Desk | `/input` | ✅ | `/v1/positions` | Manual entry + connector hub |
| | Upload CSV/XLSX | `/upload-csv` | ✅ | `/v1/upload` | Bulk import with validation |
| | Connect Database | `/database-connection` | ✅ | `/v1/connectors` | SQL pull setup |
| | ERP Integration | `/erp-integration` | ✅ | `/v1/connectors` | SAP/Oracle/NetSuite |
| | Accounting Systems | `/accounting-connection` | ✅ | `/v1/connectors` | QB/Xero/Sage |
| | Connectors Hub | `/connectors` | ✅ | `/v1/connectors` | Pipeline status |
| | Import History | `/import-history` | ✅ | — | Connector run audit log |
| **Policy Engine** | Policy Desk | `/policy-desk` | ✅ | `/v1/policies/active`, `/v1/positions/bulk-assign-policy` | Assignment center |
| | Policy Library | `/policies` | ✅ | `/v1/policies/templates` | 60 preset browser |
| | AI Policy Wizard | `/ai-policy-wizard` | ✅ | `/v1/policies/templates` | 7-phase wizard |
| | My Saved Policies | `/saved-policies` | ✅ | `/v1/policies/templates`, `/v1/policies/favorites` | User + branch scope |
| **Execution** | Execution Desk | `/execution-desk` | ✅ | `/v1/calculate`, `/v1/positions` | 4-step pipeline |
| | Results Viewer | `/execution` | ✅ | — | ExecutionBridge + Simulation (LABEL MISMATCH — not a "results viewer") |
| | Sandbox | `/sandbox` | ✅ | — | What-if engine |
| | FX Rates | `/currency-fx` | ✅ | Alpha Vantage | TradingView chart |
| | Data Pipeline Log | `/execution-history` | ✅ | `connectorClient.listConnectorRuns` | Full audit log: status, rows, hash integrity, expandable detail |
| **Reports** | Report Studio | `/reports` | ✅ | localStorage + backend | 30 presets, AI builder |
| | Preset Library | `/reports?view=library` | ✅ | — | Query param driven |
| | AI Report Builder | `/reports?view=builder` | ✅ | — | Query param driven |
| | Saved Reports | `/reports?view=saved` | ✅ | localStorage | Query param driven |
| | Hedge Plan Report | `/results` | ✅ | — | Multi-tab run viewer |
| | Committee Pack | `/committee-pack` | ✅ | — | DUPLICATE — also in Governance |
| **Governance** | Hedge Wiki | `/hedgewiki` | ✅ | — | DUPLICATE — also in Dashboard |
| | Audit Trail | `/audit-trail` | ✅ | localStorage (should be `/v1/audit`) | **CRITICAL: not reading from backend** |
| | Run Viewer | `/run-viewer` | ✅ | `/v1/runs/{id}` | TraceLite + RunEnvelope |
| | Position Lineage | `/lineage` | ✅ | `/v1/positions/{id}/lineage` | 5-node provenance graph |
| | Committee Pack | `/committee-pack` | ✅ | — | DUPLICATE — also in Reports |
| | Access Control | `/access-control` | ✅ | auth context (hardcoded matrix) | Partial backend integration |
| **Settings** | General | `/settings` | ✅ | `/v1/settings` (+ localStorage) | Tab defaults to General |
| | Policy Limits | `/settings#policy_limits` | ⚠️ | — | Hash anchor — scroll behavior required |
| | Execution | `/settings#execution` | ⚠️ | — | Hash anchor — scroll behavior required |
| | API & Keys | `/settings#api_keys` | ⚠️ | — | Hash anchor — scroll behavior required |
| | Notifications | `/settings#notifications` | ⚠️ | — | Hash anchor — scroll behavior required |
| **Help** | Documentation | `/help` | ✅ | `/health` (status check) | All 3 sub-items link to same page |
| | FAQ | `/help` | ✅ | — | No anchor differentiation |
| | Contact Support | `/help` | ✅ | — | No anchor differentiation |

---

## Orphaned / Unlisted Pages

These pages exist in the filesystem but are NOT reachable from the main navigation:

| Route | Page File | Notes |
|-------|-----------|-------|
| `/hedges` | `hedges/page.tsx` | Not in any nav menu |
| `/terminal` | `terminal/page.tsx` | Not in any nav menu |
| `/ledger` | `ledger/page.tsx` | Not in any nav menu |
| `/ledger/[id]` | `ledger/[id]/page.tsx` | Not in any nav menu |
| `/staging` | `staging/page.tsx` | Not in any nav menu |
| `/staging/[id]` | `staging/[id]/page.tsx` | Not in any nav menu |
| `/sandbox/whitepaper` | `sandbox/whitepaper/page.tsx` | Not in any nav menu |
| `/erp-oauth-callback` | OAuth callback | Correct — not a nav item |
| `/accounting-oauth-callback` | OAuth callback | Correct — not a nav item |
| `/api-health` | Old health check | Nav.tsx legacy link |

---

## Dead Code / Legacy Navigation Components

| File | Issue | Action Required |
|------|-------|-----------------|
| `frontend/src/components/Nav.tsx` | Old nav — "HedgeCalc" branding, 4 links only | **Remove** or verify no page imports it |
| `frontend/src/components/layout/Header.tsx` | Old header — "HedgeCalc FX POC · USD/MXN" | **Remove** or verify no page imports it |

---

## Workflow Breadcrumb Defect

The `WorkflowBreadcrumb` component shows three steps:
```
01 POSITION DESK → 02 POLICY DESK → 03 EXECUTION DESK
```

**Bug**: Step 01 "POSITION DESK" links to `/input` (Ingestion Desk), NOT `/position-desk`.
**Expected**: Step 01 should link to `/position-desk`.
**File**: `frontend/src/components/layout/WorkflowBreadcrumb.tsx`, line 23.

---

## Summary Statistics

- **Total nav sub-items**: 42
- **Pages confirmed to exist**: 40
- **Dead links (404)**: 1 (`/execution-history`)
- **Duplicate menu entries**: 3 (HedgeWiki ×2, Committee Pack ×2)
- **Hash-anchor sub-items (fragile)**: 4 (Settings sub-sections)
- **Orphaned pages not in nav**: 8
