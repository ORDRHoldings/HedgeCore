# Current Sprint

Sprint: P0-B — Pre-Trade TCA Dashboard
Status: COMPLETE (2026-04-18)
Started: 2026-04-18
Completed: 2026-04-18

## Goal
Ship Pre-Trade TCA: standalone cost estimator, post-calc TCA auto-attached to every calculation run, variance tracking against actual settlements, and an accuracy dashboard. Gated to Professional plan tier.

## Deliverables
| # | Item | Status |
|---|------|--------|
| T1  | TransactionCostEstimate ORM model (15 columns, 3 indexes) | DONE |
| T2  | Migration 0027 — transaction_cost_estimates table | DONE |
| T3  | Pydantic v2 schemas (7 classes) in `schemas_v1/tca.py` | DONE |
| T4  | Model + schema sync tests | DONE |
| T5  | `tca_service.estimate_pre_trade()` | DONE |
| T6  | `tca_service.attach_to_calc_run()` (idempotent, eager) | DONE |
| T7  | `tca_service.reconcile_actual()` + auto-settlement hook | DONE |
| T8  | `tca_service.get_accuracy_report()` | DONE |
| T9  | Migration 0028 — tca.read + tca.estimate RBAC perms | DONE |
| T10 | `v1_tca.py` — 6 endpoints | DONE |
| T11 | `v1_calculate.py` integration (non-fatal try/except) | DONE |
| T12 | `tcaClient.ts` API wrapper with typed error class | DONE |
| T13 | `/pre-trade-tca` estimator page | DONE |
| T14 | `/pre-trade-tca/accuracy` dashboard (dynamic Q-YYYY default) | DONE |
| T15 | TCA tab on `audit-lab/runs/[run_id]` page | DONE |
| T16 | Sidebar nav — Pre-Trade TCA (Professional gate) | DONE |
| T17 | Backend test pass (5308 tests collect clean; sync TCA tests pass) | DONE |
| T18 | `tsc --noEmit` clean + `next build` 117 pages compiled | DONE |
| T19 | Browser smoke test — both pages render correctly | DONE |
| T20 | State files updated | DONE |

## Architectural Decisions
- **Atomic WORM commits**: `db.add` → `db.flush` → `_emit_tca_audit` → single `db.commit` → `db.refresh` prevents audit/data divergence.
- **Hash-chain race**: `SELECT ... FOR UPDATE` on `prev_hash` lookup (per-tenant audit ordering).
- **Cross-tenant guards**: `tenant_id` filter required on all `_find_estimate_by_run_id` / `_load_estimate_and_settlement` queries.
- **SoD asymmetry**: `post_calc` blocks self-reconcile; `pre_trade` allows self-reconcile (trader owns their own pre-trade check).
- **Non-fatal attach**: Calculation run won't fail if TCA emission fails (try/except at v1_calculate.py:685).
- **Typed API errors**: `TCAApiError` class carrying HTTP status replaces brittle `e.message.includes("404")`.

## Bugs Fixed During Review
1. Hash chain race → added `.with_for_update()` to prev_hash select
2. WORM two-commit gap → single commit with flush + refresh
3. Cross-tenant query hole on `_load_estimate_and_settlement` → required `caller_tenant_id` param
4. Settlement transaction boundary → `confirm_settlement` commits before calling auto_reconcile
5. `post_reconcile` missing tenant guard → passes `caller_tenant_id=current_user.company_id`
6. Brittle 404 detection in frontend → typed `TCAApiError` with `.status`

## Key Commits
`7c5badf` → `ef1f766` (20 commits across 5 chunks + review fixes)

## Browser Verification
- `/pre-trade-tca` renders: TRADE INPUTS panel (Pair/Notional/Direction/Instrument/Window), COST BREAKDOWN empty state, RECENT ESTIMATES empty state.
- `/pre-trade-tca/accuracy` renders: tab nav, PERIOD defaults to dynamic "Q2-2026", GROUP BY dropdown "Pair/Instrument/Month".
- Screenshots: `pre-trade-tca-smoke.png`, `pre-trade-tca-accuracy-smoke.png`.
- Console errors observed are unrelated (dev env points frontend at :8002, backend runs on :8000).

## Known Environmental Risk
Windows pytest-asyncio `OSError: could not get source code` on all async tests (pre-existing, documented in `project_open_risks.md`). 5308 tests collect cleanly — async suite will run on Linux CI.

## Previous Sprint
Sprint: Audit Lab UX Overhaul
Status: COMPLETE
Completed: 2026-04-17
Commits: `0a513c7`, `e9c6724`, `c89b97d`

## Next
User to select next sub-project from competitive gap roadmap:
- P0-A: EMIR/MiFID II Regulatory Reporting
- P0-C: Counterparty Scoring Hub
- P1-A: Natural Hedging Optimizer
- P1-B: SWIFT/MT103 Payment Instructions
