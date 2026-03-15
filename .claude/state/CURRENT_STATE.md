# ORDR Terminal — Current State

> Last updated: 2026-03-15

## Recent Work
- **NEXUS autonomous learning system committed**: 48 files, 8 agents, SQLite-backed session/chain/integrity tracking. E2E fixtures (3 CSV datasets) + hedge desk e2e sidebar nav fix.
- **Audit Lab POST /runs HTTP 500 fix**: Root cause — asyncpg type inference rejects Python `str` for `TIMESTAMPTZ` columns; fix: pass `buffer_start`/`buffer_end` as `datetime.date` objects directly. Added `CAST()` for UUID/JSONB params in all audit_runs/findings/reports INSERTs. Debug wrapper on `create_audit_run` surfaces errors as 500 detail. Test fix: `inspect.getsource(_create_audit_run_inner)` not wrapper. 442/442 audit_lab tests pass. Render deploy pending (manual trigger required).
- **IBKR Gateway live streaming for ORDR Market charts**: WebSocket server (`/ws/market`), `MarketStreamManager` with IBKR `reqMktData` streaming + fallback polling, frontend `useMarketWebSocket` hook, `ChartCore.tsx` rewritten to use real IBKR data (historical + live ticks)
- **NEXUS initialized**: ordr-market project — 28 tables, 8 agents, genesis chain seeded
- **IBKR paper trading integration**: ADR-0005 approved, IBKRExecutor service, 3 API endpoints, PhaseExecute rewrite with IBKR execution flow
- **Deep security audit**: 20 critical+high findings resolved across 35 files

## Test Evidence
- Backend: `3545 passed, 0 failed` (19.81s, excl. 2 pre-existing unrelated failures)
- TypeScript: `tsc --noEmit` clean

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
