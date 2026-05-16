# 2026-05-16 — RLS session-injection broken on asyncpg (SET LOCAL bind params)

**Severity:** P1 — backend DB layer fully degraded
**Status:** Resolved
**Duration:** ~3 days (latent since 2026-05-13 deploy of `fbc1eb1`; surfaced 2026-05-16 17:24Z; resolved 2026-05-16 17:28Z)
**Resolved by:** `151c591` (`fix(rls): use set_config()`)
**Touched files:** `backend/app/core/rls.py`, `backend/tests/test_rls_tenant_isolation.py`

## Timeline (UTC)

| Time | Event |
|---|---|
| 2026-05-13 ~17:00 | `fbc1eb1` ("Harden enterprise audit controls") deployed to prod via auto-deploy on push. Introduced `TenantRLSAsyncSession` as the session class on `async_session_maker`. |
| 2026-05-13 → 05-16 | Prod silently degraded. Health endpoint returns 503; every DB-touching endpoint that ran through the new session raised `asyncpg.exceptions.PostgresSyntaxError`. Render did NOT auto-restart because auto-rollback on failed health checks was never enabled (pre-launch gap, see deployment-and-oncall.md). |
| 2026-05-16 17:24 | Post-deploy smoke check after launch-readiness commits (`46057a9`) observed `/api/health` 503. Diagnosis began. |
| 2026-05-16 17:26 | Diagnosis complete (see Root Cause). Fix authored and tested on full backend suite (no regressions). |
| 2026-05-16 17:27 | `151c591` pushed to master. Auto-deploy started. |
| 2026-05-16 17:28 | Render redeploy complete. `/api/health` → 200 `{"db":"ok"}`. Resolved. |

## Root Cause

`TenantRLSAsyncSession.execute()` intercepts every query and ensures a transaction-local RLS context is set via:

```python
await session.execute(
    text("SET LOCAL app.current_tenant_id = :tenant_id"),
    {"tenant_id": safe_id},
)
```

PostgreSQL's grammar **does not accept bind parameters inside `SET` statements**. `SET ... = $1` is a syntax error. asyncpg uses PostgreSQL's extended query protocol (parse + bind + execute), so it hits this hard limit. Result: every query through the wrapped session — including the load-balancer health probe's `SELECT 1` — raised before the wrapped query could run.

**Why the test suite didn't catch it:**
- `tests/test_rls_tenant_isolation.py::TestRLSInjectionInterface::test_inject_tenant_rls_executes_set_local` exercises the path with a mocked AsyncMock session. The mock accepts any SQL; the real driver was never engaged.
- `tests/test_rls_tenant_isolation.py::TestRLSPostgresPoolIsolation` exercises PG-only paths, but the tests construct their own `SET LOCAL` statements via **f-string inlining** (`f"SET LOCAL app.current_tenant_id = '{company_id}'"`). The test author's own pattern worked. The production code path used bind params and was never test-exercised against a real PG.
- CI runs the backend suite against SQLite (`DATABASE_URL="sqlite+aiosqlite://"`). The `requires_postgres` marker auto-skips all 130 PG-only tests. No CI job runs the suite against a real Postgres.

## Fix

`backend/app/core/rls.py`: replace `SET LOCAL <var> = :param` with PostgreSQL's documented function-form equivalent:

```python
await session.execute(
    text("SELECT set_config('app.current_tenant_id', :tenant_id, true)"),
    {"tenant_id": safe_id},
)
```

`set_config(name, value, is_local)` is a regular function call, so bind params flow through the extended protocol. `is_local=true` preserves transaction-scoped semantics — value reverts at `COMMIT`/`ROLLBACK`, so the connection-pool leakage guarantees from the original `SET LOCAL` choice are unchanged.

Test source-string assertions in `test_rls_tenant_isolation.py` updated to accept either pattern, so future inlined call sites stay valid.

## Mitigation in place

- Forward fix landed. No rollback.
- Health endpoint now returning 200.
- Spot-check confirmed: smoke + full backend suite green with the change.

## Follow-ups

- **[BLOCKER for next launch]** No CI job runs the backend suite against a real PostgreSQL. 130 `requires_postgres`-marked tests are dead in CI. Add a workflow that spins up a Postgres service container and runs `pytest -m requires_postgres`. The smoke layer added in `9bb4593` only hits SQLite for the same reason — same gap.
- **[BLOCKER for next launch]** Render auto-rollback on failed health checks is not enabled (already tracked in `docs/runbooks/deployment-and-oncall.md` pre-launch gaps). With it on, a 503 deploy would have rolled back automatically and this incident would have been ~5 minutes instead of 3 days.
- **[BLOCKER for next launch]** No Sentry alert on backend 5xx rate. Same runbook flags this. Three days of silent prod degradation is the cost.
- Add a `requires_postgres` test that calls `inject_tenant_rls()` against a real session (not a mock) and asserts a follow-up `SELECT 1` succeeds. This is the test that would have caught the bug.
- Review the rest of `fbc1eb1`'s changes for similar PG-only landmines that the SQLite test suite cannot exercise (FORCE RLS policies, Argon2id+pepper paths, synex_kernel/ wiring).
