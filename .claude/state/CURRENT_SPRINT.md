# Current Sprint

Sprint: Treasury Suite Phase 2 §4.4 — Payment Initiation
Status: COMPLETE
Started: 2026-04-15
Completed: 2026-04-15
Commits: 4c667d5 through 194435f (9 commits on master)

## Items
| # | Item | Status | Priority |
|---|------|--------|----------|
| P.1 | ORM models — PaymentBeneficiary + PaymentInstruction | DONE | high |
| P.2 | Alembic migration — payment_beneficiaries + payment_instructions tables | DONE | high |
| P.3 | Audit enum additions — 6 PAYMENT_* + BENEFICIARY_CREATED values | DONE | high |
| P.4 | Pydantic schemas — 7 request/response schemas in cash.py | DONE | high |
| P.5 | payment_service.py — hash computation, CRUD, 5-state machine, SoD | DONE | high |
| P.6 | v1_payments.py — 11 endpoints; router.py registration | DONE | high |
| P.7 | Tests — 12 service + 7 route tests (19 total, all pass) | DONE | high |
| P.8 | Frontend — /payments page (3-tab), cashClient API functions, sidebar nav | DONE | medium |

## Validation
- Backend: 19 new tests pass; 4801+ total, 0 failures
- tsc --noEmit: CLEAN
- next build: PASS (exit code 0)
- Critical fixes applied: PAYMENT_TYPES aligned, isCreator SoD check, CANCEL scope

## Previous Sprint
- Treasury Suite Phase 2 Frontend Pages (2026-04-15): cash-management, bank-statements

## Next
- Phase 2 §4.5+: TBD (netting, further treasury modules)
