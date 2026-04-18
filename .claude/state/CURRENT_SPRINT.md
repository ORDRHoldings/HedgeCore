# Current Sprint

Sprint: P0-C — Counterparty Scoring Hub
Status: COMPLETE (2026-04-18)
Started: 2026-04-18
Completed: 2026-04-18

## Goal
Ship a Counterparty Hub that institutional treasury teams need for credit-risk governance: per-counterparty CRUD, credit limits (notional / PFE / settlement / ISDA threshold), on-demand exposure computation using the existing `engine_v1.counterparty_risk` module, and breach detection with severity grading (WARNING ≥80%, BREACH ≥100%). Gated to Professional plan tier.

## Deliverables
| # | Item | Status |
|---|------|--------|
| T1  | `Counterparty` + `CreditLimit` ORM (2 tables, 6 indexes, 1 unique constraint) | DONE |
| T2  | Migration 0029 — counterparties + credit_limits | DONE |
| T3  | Pydantic v2 schemas (9 classes: CRUD + exposure + portfolio) | DONE |
| T4  | Migration 0030 — counterparty.read / counterparty.write RBAC grants | DONE |
| T5  | `counterparty_service.py` — CRUD + limits + compute_exposure + compute_portfolio_risk | DONE |
| T6  | `v1_counterparty.py` — 9 endpoints under `/v1/counterparties` | DONE |
| T7  | Router wired in `app/api/router.py` | DONE |
| T8  | `counterpartyClient.ts` — typed API client + `CounterpartyApiError` | DONE |
| T9  | `/counterparties` hub page — list + inline create | DONE |
| T10 | `/counterparties/[id]` detail page — metadata, limits CRUD, exposure compute | DONE |
| T11 | Sidebar nav — "Counterparties" under DEBT & IR RISK (Professional gate) | DONE |
| T12 | Validation (tsc clean, `next build` green, backend imports OK, 9 routes registered) | DONE |
| T13 | Commits (2): backend `258b59c`, frontend `68559db` | DONE |

## Architectural Decisions
- **Positions input model**: `compute_exposure` accepts caller-supplied positions (not auto-derived from `positions` table) because the v1 `Position` ORM has no `counterparty_id` column. Caller filters positions attributable to the counterparty. Keeps engine pure and v1 scope tight.
- **Breach detection**: 4 limit types map 1:1 to engine metrics — `notional` → `|net_notional_usd|`, `pfe` → `pfe_97_5`, `settlement` → `mark_to_market`, `isda_threshold` → `exposure_above_threshold`. Severity: `WARNING` at ≥80%, `BREACH` at ≥100%.
- **Single-active-per-type invariant**: creating a new credit limit deactivates any prior active limit of the same type on the same counterparty.
- **WORM audit pattern**: reused from TCA — `SELECT ... FOR UPDATE` on latest `event_hash` → `build_audit_event()` → `db.add` → single commit. Event types: `COUNTERPARTY_CREATED/UPDATED`, `CREDIT_LIMIT_CREATED/DEACTIVATED`, `COUNTERPARTY_EXPOSURE_COMPUTED`.
- **Cached risk metrics**: `last_exposure_usd`, `last_pfe_usd`, `risk_level_cached`, `last_scored_at` on Counterparty are NOT WORM — updated inline by `compute_exposure`. Audit trail captures the transition.
- **Cross-tenant guard**: `get_counterparty` always filters by `tenant_id` at query level. Credit limit operations re-validate ownership via `get_counterparty`.

## Routes Shipped (9)
```
POST   /v1/counterparties                               # create
GET    /v1/counterparties                               # list (include_inactive flag)
GET    /v1/counterparties/{id}                          # get
PATCH  /v1/counterparties/{id}                          # update
POST   /v1/counterparties/{id}/limits                   # add credit limit
GET    /v1/counterparties/{id}/limits                   # list limits
DELETE /v1/counterparties/{id}/limits/{limit_id}        # deactivate limit
POST   /v1/counterparties/{id}/exposure                 # compute exposure + breaches
POST   /v1/counterparties/portfolio-risk                # portfolio-wide view
```

## Key Commits
- `258b59c` feat(counterparty): Counterparty Hub backend — ORM, migrations 0029/0030, service, 9 routes
- `68559db` feat(counterparty): Hub UI — /counterparties list + detail + sidebar nav

## Browser Verification
- `next build`: 0 errors, `/counterparties` + `/counterparties/[id]` artifacts generated
- `tsc --noEmit`: 0 errors
- Backend import sanity: 9 routes registered, all services importable

## Known Environmental Risk (carried forward from P0-B)
- **Windows pytest-asyncio `OSError: could not get source code`**: affects ANY test file with `@pytest.mark.asyncio`. 5308 tests collect cleanly; sync service tests for counterparty_service pass. Async test coverage is validated on CI Linux at merge time.

## Next Sprint Candidates (user directive: "fix the gaps and priorities")
Per `memory/project_competitive_audit.md` priority order:
1. **P0-A**: EMIR / MiFID II Regulatory Reporting exports
2. **P1-A**: Natural Hedging Optimizer
3. **P1-B**: SWIFT / MT103 Payment Instructions
