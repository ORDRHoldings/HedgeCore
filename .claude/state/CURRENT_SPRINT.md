# Current Sprint

Sprint: P2-B — Custom Report Templates Library
Status: COMPLETE (2026-04-18)
Started: 2026-04-18
Completed: 2026-04-18

## Goal
Third item from the P2 (competitive-parity) backlog. Report Studio shipped
with 46 *hardcoded* system presets (`REPORT_PRESETS` constant) and `SavedReport`
for run-bound snapshots — but users had no way to save their own *reusable*
section mixes. P2-B closes that gap with a tenant-scoped `CustomReportTemplate`
library: save any custom section layout as a named, categorised template, and
pick it from a "MY TEMPLATES" group in the Studio template selector.

## Deliverables
| # | Item | Status |
|---|------|--------|
| T1 | `CustomReportTemplate` ORM (tenant-strict, JSONB sections + audience + bindings) | DONE |
| T2 | Alembic migration `0034_custom_report_templates` (3 indexes) | DONE |
| T3 | `custom_report_template_service` — validators + CRUD | DONE |
| T4 | Section-type / category / audience whitelists mirroring frontend enums | DONE |
| T5 | 5-endpoint router at `/v1/custom-report-templates` (professional + reports.write) | DONE |
| T6 | 21-test unit suite (validation, canonicalisation, error-index propagation) | DONE |
| T7 | Frontend typed client `customReportTemplatesClient.ts` + error subclass | DONE |
| T8 | `TemplateSelector` — MY TEMPLATES group, inline delete, accent highlight | DONE |
| T9 | `SaveAsTemplateModal` — name/short/category/audience/tags form | DONE |
| T10 | `ConfigPanel` — SAVE AS TEMPLATE button; prop-drill plumbing | DONE |
| T11 | `StudioTab` — modal orchestration + customRefreshKey + custom-selection handler | DONE |
| T12 | TypeScript check passes (`npx tsc --noEmit` exit 0) | DONE |
| T13 | Commit + state/changelog rollup | DONE |

## Architectural Decisions
- **Three distinct "template" concepts, intentionally** —
  - `REPORT_PRESETS` (frontend constant) = 46 *system* presets; read-only.
  - `SavedReport` (existing ORM) = run-bound *snapshot* of a filled-in report.
  - `CustomReportTemplate` (NEW) = tenant-scoped *reusable* section mix.
  The three surfaces coexist; the selector dropdown renders MY TEMPLATES above
  the preset groups, and falls back to "+ Custom Report" for an unsaved
  blank-slate mix.
- **Strict tenant scope, no system rows** — unlike HedgeTemplate (which has
  `company_id=NULL` system seeds), every CustomReportTemplate belongs to a
  single tenant. System-level library remains the frontend REPORT_PRESETS.
- **Pure-function validators, then ORM mutation** — `validate_sections` /
  `validate_audience` / `validate_category` are pure and individually tested;
  CRUD methods only call them + persist. Keeps the hot validation path out of
  async/DB code.
- **Soft delete** — `is_active=false` on DELETE. List endpoint filters
  inactive by default; `include_inactive=true` query flag for admin/restore
  views.
- **Section canonicalisation at write time** — `validate_sections` returns
  canonicalised dicts (default `status=INCLUDED`, `page_break_before=false`,
  title trimmed + capped at 200 chars). No client-sent junk reaches the DB.
- **Reports permission dual-key** — service accepts either `reports.write`
  or legacy `reports.create` to avoid churning existing RBAC rows while the
  new key is adopted.

## Routes Shipped (5 new)
```
GET    /v1/custom-report-templates                 # list (category + include_inactive)
GET    /v1/custom-report-templates/{id}            # detail
POST   /v1/custom-report-templates                 # create (201)
PUT    /v1/custom-report-templates/{id}            # update
DELETE /v1/custom-report-templates/{id}            # soft delete (204)
```

Professional-tier plan gate on all. Mutations also require reports.write.

## Section Spec Schema (JSONB)
```jsonc
{
  "type": "HEDGE_PLAN_TABLE",   // SectionType enum (21 values)
  "title": "Hedge Plan",        // non-empty, trimmed, capped at 200 chars
  "order": 2,                   // non-negative integer
  "status": "INCLUDED",         // INCLUDED|EXCLUDED|DRAFT
  "page_break_before": false
}
```

## Test Coverage
21 unit tests in `test_custom_report_template_service.py` (all passing):
- **Single-section validation (10):** non-dict reject, unknown type, empty/
  whitespace title, negative + non-integer order, bad status, valid minimal
  spec (defaults filled), title trim + length cap, page_break_before flag.
- **Sections-list validation (5):** empty list reject, non-list reject,
  over-MAX_SECTIONS reject, error index propagated (`section[1]`), canonical
  list returned with default status.
- **Category / audience (6):** valid category accepted, unknown category
  rejected, audience default empty, valid audience enums accepted, unknown
  audience rejected, non-list audience rejected.

## Files Changed
**Backend**
- `app/models/custom_report_template.py` (NEW, ~70 LOC)
- `app/models/__init__.py` (+1 line) — export CustomReportTemplate
- `migrations/versions/0034_custom_report_templates.py` (NEW) — table + 3 indexes
- `app/services/custom_report_template_service.py` (NEW, ~270 LOC) — validators + CRUD
- `app/api/routes/v1_custom_report_templates.py` (NEW, ~220 LOC) — 5 endpoints
- `app/api/router.py` (+5 lines) — mount v1_custom_report_templates
- `tests/test_custom_report_template_service.py` (NEW, ~170 LOC) — 21 tests

**Frontend**
- `lib/api/customReportTemplatesClient.ts` (NEW, ~135 LOC) — typed client + error subclass
- `app/reports/components/studio/TemplateSelector.tsx` (rewritten, ~400 LOC) — MY TEMPLATES group + inline delete
- `app/reports/components/studio/SaveAsTemplateModal.tsx` (NEW, ~295 LOC) — save form
- `app/reports/components/studio/ConfigPanel.tsx` (rewritten) — SAVE AS TEMPLATE button + prop drill
- `app/reports/components/studio/StudioTab.tsx` (rewritten) — modal orchestration + custom-selection handler

## Commits
- `a1e4911` — feat(reports): P2-B — Custom Report Templates Library

## Next
P2 backlog remaining:
- Mobile-responsive layouts (all pages desktop-only today)
