# Current Sprint

Sprint: P2-C — Hedge Program Templates Library
Status: COMPLETE (2026-04-18)
Started: 2026-04-18
Completed: 2026-04-18

## Goal
Second item from the P2 (competitive-parity) backlog: ship a library of reusable
hedge-strategy blueprints ("templates") that treasurers can apply to any
position to generate a ready-to-review set of instrument legs (forwards,
options, collars, layered tranches, rolling programs). Distinct from
PolicyTemplate — HedgeTemplate is the *execution blueprint* (what instruments,
in what proportions, at what tenors); PolicyTemplate is the *rules* (ratios,
caps, floors).

## Deliverables
| # | Item | Status |
|---|------|--------|
| T1 | `HedgeTemplate` ORM model (UUID PK, JSONB instrument_mix, nullable company_id) | DONE |
| T2 | Alembic migration `0033_hedge_templates` (table + 3 indexes) | DONE |
| T3 | `hedge_template_service.py` — CRUD + validation + apply + system seeds | DONE |
| T4 | 5 system templates: FWD100, LAY3, ROLL12, COLLAR95, FWDOPT5050 | DONE |
| T5 | `validate_instrument_mix()` — weight sum ≈ 1.0 or ≈ 2.0 (paired legs) | DONE |
| T6 | `apply_template_to_position()` — pure projection (notional split + tenor→date) | DONE |
| T7 | `seed_system_templates()` — idempotent on (short_name, is_system=true) | DONE |
| T8 | 6-endpoint router at `/v1/hedge-templates` (professional tier + trades.create) | DONE |
| T9 | 21-test unit suite (validation, system seeds, apply projection math) | DONE |
| T10 | Frontend typed client `hedgeTemplatesClient.ts` + `HedgeTemplateApiError` | DONE |
| T11 | `/hedge-templates` page — filter + template cards + inspect/apply modals | DONE |
| T12 | Sidebar entry — Hedge Desk → Templates (professional tier gate) | DONE |
| T13 | TypeScript check passes (`npx tsc --noEmit` exit 0) | DONE |
| T14 | Commit + state/changelog rollup | DONE |

## Architectural Decisions
- **HedgeTemplate ≠ PolicyTemplate** — PolicyTemplate defines *rules* (hedge
  ratios, caps, floors, allowed instruments). HedgeTemplate defines a concrete
  *execution blueprint* (exact instrument legs with weights, tenors, strikes,
  directions). A trader selects a position, applies a HedgeTemplate, reviews
  the resolved legs, and then sends them through the existing execution
  proposal pipeline.
- **Apply is a pure projection, not a state mutation** — `POST /apply` returns
  the resolved leg spec (notional split, tenor → absolute value_date) without
  creating execution proposals or hitting the kernel. Callers decide when/how
  to promote the output to real orders. This keeps the library reviewable and
  idempotent.
- **Weight-sum rule: 1.0 OR 2.0** — sequential tranches (forwards, layered,
  rolling) sum to 1.0 because each leg is a slice of the same notional.
  Paired legs (collar: BUY put + SELL call on same notional) sum to 2.0.
  Tolerance 1e-4. Anything else is rejected.
- **System templates are immutable** — `is_system=true` rows can neither be
  updated nor deleted (service raises `HedgeTemplateError` → 422 at the
  route). Tenants subclass by creating custom templates; the seeds are
  shared, read-only infrastructure.
- **Nullable `company_id` for system seeds** — NULL tenant means the row is
  visible to every tenant. Custom templates are tenant-scoped via explicit
  `company_id = current_user.company_id` filter.
- **Idempotent seeding by (short_name, is_system)** — `seed_system_templates()`
  can be invoked repeatedly without duplicating rows. Short-names are the
  canonical ID (FWD100, LAY3, ROLL12, COLLAR95, FWDOPT5050).

## System Templates Shipped (5)
| Short | Category | Legs | Description |
|-------|----------|------|-------------|
| FWD100 | FORWARD | 1 | Full-notional forward at position value_date |
| LAY3 | LAYERED | 3 | 50%/30%/20% at +90d/+180d/+365d |
| ROLL12 | ROLLING | 12 | 12 equal 1/12 tranches, monthly +30d steps |
| COLLAR95 | COLLAR | 2 | BUY 95% put + SELL 105% call, same notional |
| FWDOPT5050 | MIXED | 2 | 50% forward + 50% ATM vanilla call |

## Routes Shipped (6 new)
```
GET    /v1/hedge-templates                     # list (category filter, include_inactive)
GET    /v1/hedge-templates/{id}                # fetch single
POST   /v1/hedge-templates                     # create (custom, tenant-scoped)
PUT    /v1/hedge-templates/{id}                # update (custom only; system 422s)
DELETE /v1/hedge-templates/{id}                # soft delete (is_active=false)
POST   /v1/hedge-templates/{id}/apply          # project legs for a position
```

All gated: `require_plan_tier("professional")` + RBAC `trades.create` (write routes).

## Apply Projection Example
Input: position 1,000,000 EUR, value_date 2027-04-18; template LAY3; today 2026-04-18.
Output:
```json
{
  "template_id": "...",
  "position_id": "pos-1",
  "total_notional": 1000000.00,
  "currency": "EUR",
  "legs": [
    {"instrument": "FORWARD", "notional": 500000.00, "currency": "EUR",
     "value_date": "2026-07-17", "strike_pct": null, "direction": "SELL",
     "tranche_label": "3M", "weight": 0.5},
    {"instrument": "FORWARD", "notional": 300000.00, "currency": "EUR",
     "value_date": "2026-10-15", "strike_pct": null, "direction": "SELL",
     "tranche_label": "6M", "weight": 0.3},
    {"instrument": "FORWARD", "notional": 200000.00, "currency": "EUR",
     "value_date": "2027-04-18", "strike_pct": null, "direction": "SELL",
     "tranche_label": "12M", "weight": 0.2}
  ]
}
```

## Test Coverage
21 unit tests in `test_hedge_template_service.py` (all passing on SQLite / Windows):
- **Validation (9):** empty mix, unknown instrument, weight out of (0,1], bad direction,
  weight-sum mismatch, unit-sum accepted, paired legs sum=2.0 accepted, options require
  strike, negative tenor rejected.
- **System seeds (3):** every built-in spec validates (parametrized), ROLL12 has 12
  equal 1/12 legs, LAY3 weights sum to 1.0.
- **Apply projection (5):** FWD100 matches exposure, LAY3 splits 500k/300k/200k with
  correct absolute dates (+90d/+180d/+365d from 2026-04-18 = 2026-07-17/2026-10-15/2027-04-18),
  ROLL12 produces 12 equal 100k legs, COLLAR has symmetric put/call at 95/105 with
  opposite directions, currency preserved per position (EUR/JPY/MXN/GBP).

## Files Changed
**Backend**
- `app/models/hedge_template.py` (NEW, ~60 LOC) — HedgeTemplate ORM
- `app/models/__init__.py` (+1 line) — export HedgeTemplate
- `migrations/versions/0033_hedge_templates.py` (NEW) — table + 3 indexes
- `app/services/hedge_template_service.py` (NEW, ~290 LOC) — CRUD + validation + apply + 5 seeds
- `app/api/routes/v1_hedge_templates.py` (NEW, ~220 LOC) — 6 endpoints + Pydantic schemas
- `app/api/router.py` (+2 lines) — include v1_hedge_templates router
- `tests/test_hedge_template_service.py` (NEW, ~190 LOC) — 21 tests

**Frontend**
- `lib/api/hedgeTemplatesClient.ts` (NEW, ~160 LOC) — typed client + `HedgeTemplateApiError`
- `app/hedge-templates/layout.tsx` (NEW) — PlanGate(professional) + PageShell
- `app/hedge-templates/page.tsx` (NEW, ~430 LOC) — filter + cards + inspect/apply modals
- `components/layout/AppSidebar.tsx` (+2 lines + 1 import) — Templates item under Hedge Desk

## Commits
- `e2cca44` — feat(hedge-templates): P2-C — Hedge Program Templates Library

## Next
P2 backlog remaining:
- Mobile-responsive layouts (all pages desktop-only today)
- Custom report builder (Report Studio templates fixed today)
