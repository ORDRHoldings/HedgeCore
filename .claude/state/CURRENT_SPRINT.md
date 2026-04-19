# Current Sprint

Sprint: P0-A — EMIR / MiFID II / Dodd-Frank Regulatory Submissions
Status: COMPLETE (2026-04-18)
Started: 2026-04-18
Completed: 2026-04-18

## Goal
Ship a full TR (trade-repository) submission lifecycle on top of the existing `regulatory_export.py` pure-function export layer. Delivers: deterministic UTI generation, SHA-256 evidence anchor for each document, 5-state status machine (PENDING → SUBMITTED → ACKNOWLEDGED | REJECTED | FAILED), TR acknowledgment / rejection capture, retry accounting, dashboard with stats strip, hash-chained audit trail on every transition. Professional-tier gated.

## Deliverables
| # | Item | Status |
|---|------|--------|
| T1  | `RegulatorySubmission` ORM — tenant-scoped, status + document_hash + ack fields | DONE |
| T2  | Migration 0031 — `regulatory_submissions` table + 6 indexes | DONE |
| T3  | Pydantic v2 schemas (7 classes: create / response / ack / reject / filters / stats) | DONE |
| T4  | Migration 0032 — `regulatory.read` / `regulatory.submit` / `regulatory.acknowledge` RBAC grants | DONE |
| T5  | `regulatory_submission_service.py` — lifecycle orchestrator wrapping `regulatory_export` | DONE |
| T6  | `v1_regulatory_submissions.py` — 8 endpoints under `/v1/regulatory-submissions` | DONE |
| T7  | Router wired in `app/api/router.py` | DONE |
| T8  | `regulatorySubmissionClient.ts` — typed API client + `RegulatoryApiError` | DONE |
| T9  | `/regulatory-submissions` page — stats strip, filters, inline create, per-row actions | DONE |
| T10 | Sidebar nav — "Regulatory Submissions" under COMPLIANCE (Professional gate, FileCheck icon) | DONE |
| T11 | Validation (tsc clean, 8 routes registered) | DONE |
| T12 | Commits + state/memory updates | PENDING |

## Architectural Decisions
- **NOT a WORM table** — status legitimately mutates across lifecycle. Evidence integrity comes from the immutable `document_hash` (SHA-256 of the XML at creation) plus the append-only `audit_events` hash chain. Transitions emit events capturing `from_status`, `to_status`, and contextual metadata.
- **UTI format**: `UTI-<tenantShort8>-<framework>-<YYYYMMDD>-<10hex>`. Deterministic prefix for tenant/framework/date grouping, `secrets.token_hex(5)` for uniqueness. Caller may override for re-submission scenarios.
- **Transition matrix** (enforced in `_require_transition`):
  - PENDING → {SUBMITTED, FAILED}
  - SUBMITTED → {ACKNOWLEDGED, REJECTED, FAILED}
  - REJECTED → {SUBMITTED, FAILED}  (allow resubmit after fix)
  - FAILED → {PENDING, SUBMITTED}   (retry)
  - ACKNOWLEDGED → {}               (terminal)
  - `mark_failed` increments `retry_count` atomically.
- **Source run loading**: if `source_run_id` is provided, service loads the tenant-scoped `CalculationRun`, extracts inputs/outputs from `run_envelope` JSONB, and normalises into the `(run_data, transactions)` shape the pure export functions expect. `source_run_id` is nullable — manual/position reports pass `None`.
- **Audit bug avoided**: `from_status` captured BEFORE mutation (`prior_status = submission.status`) to prevent the audit payload recording the post-transition value.
- **Cross-tenant guard**: every service entry point takes `caller_tenant_id` and scopes queries accordingly; `get_submission` raises `not_found` (404) for cross-tenant access.
- **Event types** written to audit chain: `REGULATORY_SUBMISSION_CREATED`, `_SUBMITTED`, `_ACKNOWLEDGED`, `_REJECTED`, `_FAILED`.

## Routes Shipped (8)
```
POST   /v1/regulatory-submissions                              # create + generate doc
GET    /v1/regulatory-submissions                              # list (framework/status/run filters)
GET    /v1/regulatory-submissions/stats                        # counts + ack-rate %
GET    /v1/regulatory-submissions/{id}                         # detail
POST   /v1/regulatory-submissions/{id}/submit                  # PENDING → SUBMITTED
POST   /v1/regulatory-submissions/{id}/acknowledge             # → ACKNOWLEDGED (+ ack_reference)
POST   /v1/regulatory-submissions/{id}/reject                  # → REJECTED (+ reason)
POST   /v1/regulatory-submissions/{id}/mark-failed             # → FAILED (+ retry_count++)
```

## Frontend Shipped
- `layout.tsx` — PlanGate(professional) + PageShell(icon=FileCheck, breadcrumb=[Compliance, Regulatory Submissions])
- `page.tsx` — 7-cell KPI strip, framework + status dropdown filters, inline "+ New Submission" form, 10-column table, per-row action buttons (Submit / Ack / Reject / Fail) driven by current status
- `regulatorySubmissionClient.ts` — 8 typed functions + `RegulatoryApiError`

## Files Changed
**Backend:**
- `app/models/regulatory_submission.py` (new, 83 LOC)
- `app/models/__init__.py` (updated import list)
- `app/schemas_v1/regulatory.py` (new, 75 LOC)
- `app/services/regulatory_submission_service.py` (new, 330 LOC)
- `app/api/routes/v1_regulatory_submissions.py` (new, 170 LOC)
- `app/api/router.py` (+ regulatory submissions include)
- `migrations/versions/0031_regulatory_submissions.py` (new)
- `migrations/versions/0032_regulatory_permissions.py` (new)

**Frontend:**
- `src/lib/api/regulatorySubmissionClient.ts` (new, 200 LOC)
- `src/app/regulatory-submissions/layout.tsx` (new)
- `src/app/regulatory-submissions/page.tsx` (new, 440 LOC)
- `src/components/layout/AppSidebar.tsx` (+ FileCheck icon import, + prefix, + nav entry)

## Next: P1-A — Natural Hedging Optimizer
Build optimizer UI on top of existing `currency_netting_matrix.py` + `netting_overlay.py` in engine_v1 to identify internal currency offsets (A/R vs A/P) before going to market. Target: reduce hedge notional 15–30% for multi-entity clients; strong demo differentiator.
