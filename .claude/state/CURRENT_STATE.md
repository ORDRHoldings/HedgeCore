# ORDR Terminal — Current State

> Last updated: 2026-03-14 (commit af2357a)

## Recent Work
- **Deep security audit**: Admin section (10 criticals), hedge desk pipeline (5 criticals), hedge desk workflow (6 highs), backend hardening (3 highs), DB model fixes (4 criticals)
- **Total fixes**: 20 critical+high findings resolved across 35 files
- **Tests**: 3475 passing (+95 new), 134 skipped (PG-only), 0 failed

## Test Evidence
- Backend: `3475 passed, 134 skipped, 0 failed` (22.33s)
- Frontend: `tsc --noEmit` clean, `next build` passes
- Pre-existing failure: `test_report_studio_governance.py::test_compute_report_hash_function_exists` (unrelated)

## Open Items (from audit — not yet fixed)
### Medium Priority
- Risk gate UX dead-end when endpoint unavailable (no bypass for authorized users)
- SMB tier auto-advance stale closure race condition
- ProgressBar back-navigation doesn't clear downstream state
- No React Error Boundaries on hedge desk phases
- Raw SQL in 3+ route files (v1_admin_metrics, v1_admin_monitor, v1_hedge_effectiveness)
- Position `value_date` is String(10) not Date type
- Missing CHECK constraints (amount > 0, execution_status values)
- LedgerEntry missing WORM trigger (docstring-only claim)
- No Alembic migration for ~23 tables
- Float for monetary in StagingArtifact + AuditTransaction
- Factor covariance fallback not validated for PSD
- In-memory admin config not persisted/audited/thread-safe
- NullPool with pool_pre_ping (no connection reuse)

### Low Priority
- Unused Redux hedgeSlice + hedgeContext
- Duplicated @keyframes spin in 4 files
- Missing ARIA on position selection grid
- No hierarchy enforcement on approval
- Redundant unique indexes on users.email + branches.company_id
