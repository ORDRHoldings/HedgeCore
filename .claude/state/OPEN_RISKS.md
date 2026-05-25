# Open Risks

## RISK-TEST-ISO-01: Suite-level test flake (root cause identified + fixed)
- **Severity**: LOW
- **Component**: backend/tests/test_pipeline_service_units.py::TestCheckSnapshotStaleness::test_exact_threshold (the actual flake; the original TestAssertRunAccessible note was misdiagnosed and now passes reliably)
- **Description**: `test_exact_threshold` was wall-clock sensitive: it computed `at_threshold = datetime.now(UTC) - timedelta(minutes=30)` then called `check_snapshot_staleness`, which re-reads `datetime.now(UTC)` internally. Under suite load the two clocks drifted past the strict-inequality boundary (`delta > 30`), flipping the assertion.
- **Resolution**: 2026-04-25 — patched `app.services.pipeline_service._now` to a fixed instant inside the test so both timestamps are bit-identical. Full suite now: 5247 passed, 158 skipped, 0 failed.
- **Status**: CLOSED.
- **Opened**: 2026-04-19  /  **Closed**: 2026-04-25

## RISK-INF-01: Free-tier cold starts cause 503 on first request
- **Severity**: HIGH
- **Component**: Render backend (hedgecore + hedgecore-preview)
- **Description**: Free-tier Render services cold-start after ~15 min inactivity. During cold start, the schema readiness check fails → HTTP 503 on the first incoming request. Subsequent requests succeed.
- **Mitigation A**: Upgrade `plan: free` → `plan: starter` in `render.yaml` ($7/mo each service).
- **Mitigation B**: ✅ APPLIED 2026-03-25 — `hedgecore-keepalive` cron added to `render.yaml`, pings `/api/health` every 14 min. Activate via Render blueprint sync.
- **Status**: Partially mitigated — cron in IaC, pending blueprint sync. Severity downgraded to MEDIUM.
- **Opened**: 2026-03-24

## OPS-HARDENING: Operations gaps closed 2026-03-27
- **Status**: CLOSED
- **Gaps closed**: C-01 (gitleaks CI), C-03 (Dependabot), C-05 (coverage gate 60%), C-06 (Trivy), B-01 (pg_backup.sh), B-02 (restore_verify.sh), B-03/B-04 (DR plan, RTO/RPO), D-03 (SLOs), M-01/M-02/M-03 (monitoring guide), D-01 (onboarding), D-04 (postmortem template), D-02 (data retention), DB-01/DB-02/B-05 (db-maintenance), D-05 (docker-compose), I-02 (frontend Dockerfile)
- **Remaining deferred**: C-04 (mypy hard gate), S-01 (secret rotation — human action), I-01 (blueprint sync pending)

## RISK-ERP-01: ERP live credentials not provisioned for any tenant
- **Severity**: MEDIUM
- **Component**: erp_connector_service, gl_posting_service
- **Description**: Posting adapters (QuickBooks, Xero, NetSuite) and ERP pull adapters run in paper mode by default. No tenant has live ERP credentials stored in `company.settings`. No live writes or pulls will succeed until credentials are added.
- **Mitigation**: Credentials stored in `company.settings` JSONB; settings UI page exists at `/settings/gl-accounts`. Paper mode is safe — no data loss risk.
- **Status**: Open
- **Opened**: 2026-04-14

## RISK-GIT-02: master ahead of origin — CLOSED
- **Status**: CLOSED 2026-04-28 — master pushed regularly; latest HEAD `0d34942` on origin.
- **Opened**: 2026-04-14 / **Closed**: 2026-04-28

## RISK-CI-PG-01: requires_postgres tests do not run in CI — Mitigated (advisory)
- **Severity**: HIGH → MEDIUM (advisory job lands findings without blocking merge)
- **Component**: GitHub Actions backend test job
- **Description**: 130 `requires_postgres`-marked tests auto-skip because the main CI uses `DATABASE_URL=sqlite+aiosqlite://`. The new route-smoke layer (`backend/tests/test_routes_smoke.py`, 2026-05-16) inherits the same gap. This is exactly how the `SET LOCAL` bind-param RLS bug (see `docs/incidents/2026-05-16-rls-set-local-bind-params.md`) shipped to prod and went undetected for 3 days.
- **Mitigation**: 2026-05-16 — `137c8a2` added the `backend-postgres` GitHub Actions job (`postgres:16` service container + Alembic upgrade + `pytest -m requires_postgres`) with `continue-on-error: true` while we audit which of the 130 marked tests need fixture/schema work. Promoting to hard-gate (flip `continue-on-error: false`) is itself a launch-readiness milestone.
- **Status**: Mitigated (advisory). Promotion to hard gate is tracked as a separate launch-readiness item.
- **Opened**: 2026-05-16 / **Mitigated**: 2026-05-16

## RISK-OPS-MON-01: No backend 5xx alert + no Render auto-rollback
- **Severity**: HIGH
- **Component**: Sentry, Render service config
- **Description**: 2026-05-16 incident exposed two simultaneous monitoring gaps: (a) Sentry has no rule firing on backend 5xx rate, so a fully degraded prod produced zero alerts for 3 days; (b) Render's "auto-rollback on failed health check" toggle is off, so a deploy that returns 503 on `/api/health` stays live indefinitely.
- **Mitigation**: Wire `#alerts-backend` Sentry rule (>1% 5xx over 5min) and enable Render auto-rollback. Both are tracked as pre-launch gaps in `docs/runbooks/deployment-and-oncall.md` — incident shows they are no longer pre-launch, they are blocking.
- **Status**: Open
- **Opened**: 2026-05-16

## RISK-AUTH-RLS-01: API-key auth path does not inject tenant RLS context — Mitigated (option 3)
- **Severity**: MEDIUM → LOW (startup guard now fails closed if API-key auth lands on a non-allowlisted route)
- **Component**: `backend/app/deps/api_key_auth.py::get_api_key_principal`, `backend/app/middleware/api_key_auth.py`
- **Description**: With `fbc1eb1` + migration 0036 enabling `FORCE ROW LEVEL SECURITY` on `positions` and `calculation_runs`, every query against those tables requires a transaction-local `app.current_tenant_id`. The JWT auth path in `core/dependencies.py::get_current_user` (lines 129–132) correctly calls `set_tenant_rls_context()` + `inject_tenant_rls()`. The API-key auth surfaces (`get_api_key_principal` dep + `APIKeyAuthMiddleware`) validate the key and attach a principal, but **never inject tenant context** — and the `ApiKey` model has no direct `company_id`, only `owner_user_id` (FK users.id, nullable, ON DELETE SET NULL).
  - Today this is **latent**, not active: `get_api_key_principal` is only consumed by `/system/whoami/api-key` and `/system/db-tables` (both read `information_schema`, not RLS-protected tables); the schema-health endpoint uses its own `verify_api_key_header` path.
  - It becomes a P1 the moment an API-key dependency is added to any business endpoint that reads positions or calculation_runs — those queries will silently return empty results because policy `COALESCE(NULLIF(current_setting('app.current_tenant_id', true), ''), '_NO_TENANT')` matches nothing.
- **Mitigation options**:
  1. Resolve tenant from `api_key.owner_user_id` → `users.company_id` and inject (requires design decision for `owner_user_id IS NULL` keys — system keys?). — *not implemented*
  2. Add a `company_id` column to `api_keys` (cleaner — keys are tenant-scoped by birth, decoupled from user lifecycle). — *not implemented*
  3. ✅ **Shipped 2026-05-24**: `assert_api_key_routes_safe(app)` walks every APIRoute's dependant tree (including nested `require_api_key_scopes` closures) for `get_api_key_principal`. Anything outside `API_KEY_AUTH_ALLOWLIST = {"/api/system/whoami/api-key", "/api/system/db-tables"}` raises `RuntimeError` from `lifespan` at startup, blocking deployment. 7 unit tests cover direct dep, scoped dep, allowlist extension, and a regression boot of the real production app against its own guard. See `backend/app/deps/api_key_auth.py` + `backend/tests/test_api_key_rls_startup_guard.py`.
- **Status**: Mitigated (option 3). Risk no longer latent — accidental wiring of API-key auth to a business endpoint now fails closed at startup rather than silently returning empty rows in prod. Options 1 and 2 remain available if API-key auth is ever needed on RLS-protected business routes.
- **Opened**: 2026-05-17 / **Mitigated**: 2026-05-24

## RISK-AUTH-RLS-02: dashboard JWT path bypassed RLS injection — Mitigated
- **Severity**: HIGH (active silent-empty-results bug under migration 0036) → CLOSED
- **Component**: `backend/app/api/routes/dashboard.py::_resolve_user`
- **Description**: `dashboard.py` does not depend on `core/dependencies.py::get_current_user`. Instead it carries its own `_resolve_user(request, db)` helper that calls `decode_token` + a User lookup but **never sets the request-local RLS contextvar**. With migration 0036 forcing RLS on `positions` and `calculation_runs`, `TenantRLSAsyncSession.execute()` auto-injects from the contextvar — and the default is `None` → `set_config('app.current_tenant_id', '', true)` → policy `COALESCE(NULLIF(...,''), '00000000-...')` matches the NO_TENANT sentinel → all dashboard aggregates against positions/calculation_runs silently returned empty.
  - Distinct from RISK-AUTH-RLS-01: RLS-01 covered the *API-key* path (latent). RLS-02 covered the *JWT* path on `/api/v1/dashboard/*` routes (active in production for any user with data).
- **Mitigation**: 2026-05-24 — `_resolve_user` now calls `set_tenant_rls_context(tenant_id, bypass=is_superuser)` after the User lookup. `TenantRLSAsyncSession.execute()` re-injects on the next query because the marker changes (empty → real tenant). Explicit `inject_tenant_rls` was *not* added because the auto-inject path is sufficient and adding it consumes mocked execute slots in the existing dashboard route tests. 3 new regression tests in `backend/tests/test_dashboard_rls_injection.py` pin the contract: contextvar matches `user.company_id` after `_resolve_user` (tenant + superuser-bypass cases) and stays cleared on the 401-rejected path.
- **Mitigation B (structural defense)**: 2026-05-24 — shipped `assert_routes_have_canonical_auth(app)` companion to the RLS-01 guard (commit `4607acc`). Walks every APIRoute and requires either `get_current_user` or `get_api_key_principal` in the dependant tree, or explicit listing in `NO_AUTH_ROUTE_ALLOWLIST` (originally 42 entries; now 35 after the dashboard refactor). 9 tests in `backend/tests/test_canonical_auth_startup_guard.py` including a regression boot of the production app against its own guard.
- **Mitigation C (root-cause elimination)**: 2026-05-24 — `_resolve_user` deleted (commit `81d0064`). All 7 dashboard endpoints now take `user: User = Depends(get_current_user)`; the parallel auth helper is gone. Dashboard routes removed from `NO_AUTH_ROUTE_ALLOWLIST`. New structural test in `test_dashboard_rls_injection.py` asserts every dashboard route has `Depends(get_current_user)` in its dependant tree.
- **Status**: CLOSED — root cause eliminated, structural guard in place. Tests: 5514 passed / 160 skipped / 0 failed on SQLite (was 5507; net +7).
- **Opened**: 2026-05-24 / **Closed**: 2026-05-24

## RISK-CI-PG-02: backend-postgres alembic chain fails on fresh PG — root cause is architectural (chain assumes `_ensure_tables` runs first)
- **Severity**: MEDIUM (advisory job — does not block merges)
- **Component**: `.github/workflows/ci.yml::backend-postgres`, `backend/migrations/versions/*.py`, `backend/app/core/db.py::_ensure_tables`
- **Root cause (identified 2026-05-25)**: The migration chain was authored assuming `Base.metadata.create_all` (via `_ensure_tables()`) runs first and the chain alters/augments that schema. Many tables (`positions`, `execution_proposals`, `policy_instances`, `audit_transactions`, …) have **no `CREATE TABLE` migration anywhere in the chain** — they exist purely in the ORM. In production this is fine: `app/main.py` runs `run_alembic_upgrade()` non-fatally first (catches all exceptions per `app/core/db_migrations.py` lines 63–66), then `_ensure_tables()` brings the schema up via `create_all`. The advisory CI job runs alembic in isolation against a fresh `postgres:16`, so the chain crashes the moment it tries to ALTER an ORM-only table.
- **History**:
  - 2026-05-23 — opened for `audit_logs` duplicate. Resolved by four follow-ups to `e2180e1dd4e7`.
  - 2026-05-25 — refined; root cause identified as the architectural pattern above.
  - 2026-05-25 (this entry) — 5 migrations now defensively guarded with `pg_class` / `information_schema` existence checks. Chain progresses substantially further on fresh PG (verified locally) but still doesn't reach head — `audit_transactions` is the next ORM-only table.
- **Fixes shipped 2026-05-25** (commits `24dfb84` + this one):
  1. `4dfe7c45fffe_migrate_users_id_to_uuid.py` — `DO $$ IF data_type='integer' THEN … END IF; END $$;` wrapper + `USING NULL::uuid` (invalid `integer::uuid` syntax replaced).
  2. `a3f8c1d2e4b5_phase0_worm_tables_and_request_context.py` — Python try/except replaced with `DO $$ IF EXISTS pg_class WHERE relname='positions' THEN … END IF; END $$;` (Python try/except cannot reset poisoned PG transactions).
  3. `b7d2e4f1a9c3_phase1_policy_revisions_and_4eyes.py` — section 2 positions ALTERs wrapped in same `pg_class` guard.
  4. `k1a2b3c4d5e6_rls_positions_calculation_runs.py` — positions ENABLE RLS + 3 CREATE POLICY wrapped in `pg_class` guard.
  5. `0036_force_rls_tenant_context.py` — positions ALTER POLICY (×3) + DROP/CREATE POLICY + FORCE RLS wrapped in `pg_class` guard.
  6. `f81cffe7f9ee_perf_composite_indexes.py` — `op.create_index` for positions + execution_proposals replaced with PG raw `DO $$ IF EXISTS … CREATE INDEX … END IF; END $$;`; calculation_runs + audit_events unguarded (created in chain by `a3f8c1d2e4b5`). SQLite path preserved via dialect branch.
  7. `c9f3a2b1d4e5_policy_instance_unique_active_constraint.py` — entire body wrapped in `pg_class` guard for `policy_instances`.
  8. `f1a2b3c4d5e6_replace_policy_active_index_typed_sentinel.py` — early-return on `policy_instances` missing.
- **Why each guard is safe**: every guard is a no-op on production-state DBs (where `_ensure_tables` ran first so the table exists, or where the migration was previously applied). The guards only short-circuit on fresh-PG-alembic-in-isolation paths.
- **Remaining (not yet fixed)**: chain still breaks on `audit_transactions` and likely several more ORM-only tables downstream. The truly correct architectural fix is a CI workflow change: either (a) make `backend-postgres` run `Base.metadata.create_all` via a pre-step (mirrors production exactly), or (b) split it into two advisory jobs — `pytest-pg` (uses `_ensure_tables`) and `alembic-chain-pg` (pure alembic against the goal of getting the chain clean). One-migration-at-a-time guarding is reaching diminishing returns.
- **Mitigation**: Already advisory (`continue-on-error: true`). RISK-CI-PG-01 milestone covers the larger fixture/schema audit.
- **Followups**: (a) Workflow refactor to mirror production sequence (`_ensure_tables` first, then alembic — production parity). (b) Complete the migration guard sweep for remaining ORM-only tables when prioritized. (c) Promote `backend-postgres` to hard gate once one of the above paths is closed.
- **Status**: Open (advisory). 8 migrations now defensively guarded. Architectural root cause identified. Real fix is a CI workflow change, not more migration guards.
- **Opened**: 2026-05-23  /  **Last update**: 2026-05-25

## RISK-CI-E2E-01: E2E Playwright suite has never actually run end-to-end in CI
- **Severity**: HIGH (advisory — does not block merges while we audit)
- **Component**: `.github/workflows/ci.yml::e2e`, `frontend/e2e/**/*.spec.ts`
- **Description**: Two specs in `frontend/e2e/accounting/` imported `'../../helpers/auth'` (two levels up), resolving outside the `e2e/` tree to a non-existent path. Every CI run from at least 2026-05-13 failed fast on this missing module before any test could execute. Fixing the import path (commit 54c3559) exposed the next layer: the suite has 237 tests across 51 files targeting the live `hedgecore.onrender.com` backend, and cannot complete in the GitHub Actions runner window — runs sat in_progress past 30 min and had to be cancelled. **Bottom line: the E2E suite has not actually verified anything on master in 10+ days.**
- **Mitigation**: 2026-05-23 — demoted `e2e` job to `continue-on-error: true` with a step-level 20-minute timeout (commits `732fe8e` + `c1f153e`). Step-level (not job-level) timeout is required because GitHub Actions treats a cancelled job as poisoning the workflow result regardless of `continue-on-error`; step-level + step-level `continue-on-error` cleanly drops a timeout into the advisory path. Unblocks master merges; logs the gap visibly in every run.
- **Status update 2026-05-23**: First post-demotion CI run (26350186757) actually completed E2E within the 20-min window with `conclusion=success` — likely runner-concurrency variance vs. the cancelled congested attempts. The audit work below remains valid: the suite is brittle (target=live prod URL, 237 tests serialized through one runner) and one green run does not certify it.
- **Followups (separate work)**:
  1. Audit which of the 237 tests are genuinely E2E vs which should be component tests.
  2. ✅ Partial — 2026-05-24 (commits `008f830` + `97636e9`): split out a smoke subset. `frontend/playwright.config.ts` defines a `smoke` project (`testMatch: /e2e[\\/]smoke[\\/].*\.spec\.ts/`) that resolves to 44 tests (43 nav-smoke + 1 full-journey). CI workflow adds an advisory `e2e-smoke` job (10-min step timeout, `continue-on-error: true`) running `--project=smoke`. Still advisory — needs N consecutive green runs to prove stability before promotion. Spinning up a CI-local backend is the larger remaining sub-item.
  3. Promote back to a hard gate once the suite is reliably green inside the runner window across N consecutive runs. Promotion is a launch-readiness milestone. Smoke job is the candidate ahead of the full chromium suite.
- **Status**: Mitigated (advisory). Open work item for E2E audit.
- **Opened**: 2026-05-23

## RISK-RLS-PROD-01: RLS injection broken on asyncpg — CLOSED
- **Severity**: P1 (production)
- **Component**: `backend/app/core/rls.py`
- **Description**: `TenantRLSAsyncSession` issued `SET LOCAL app.current_tenant_id = :tenant_id`. PostgreSQL rejects bind params in `SET` statements, so every DB query through the wrapped session raised `asyncpg.exceptions.PostgresSyntaxError`. `/api/health` returned 503 from 2026-05-13 through 2026-05-16.
- **Resolution**: 2026-05-16 — `151c591` switched to `SELECT set_config('app.current_tenant_id', :tenant_id, true)`. Health restored within minutes of deploy.
- **Status**: CLOSED. See `docs/incidents/2026-05-16-rls-set-local-bind-params.md`.
- **Opened**: 2026-05-13 / **Closed**: 2026-05-16
