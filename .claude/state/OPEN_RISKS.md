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

## RISK-CI-PG-02: backend-postgres alembic chain fails on fresh PG — two migrations now guarded; chain still breaks at `b7d2e4f1a9c3`
- **Severity**: MEDIUM (advisory job — does not block merges)
- **Component**: `.github/workflows/ci.yml::backend-postgres`, `backend/migrations/versions/*.py`
- **History**:
  - 2026-05-23 — opened for `psycopg2.errors.DuplicateTable: relation "audit_logs" already exists`. Four follow-ups to `e2180e1dd4e7` (`830f4ee`, `15fd8fe`, `0943701`, `fe025cf`) added defensive `DROP TABLE IF EXISTS` ahead of the rebuild. Resolved.
  - 2026-05-25 — refined; next failure at `4dfe7c45fffe` (`CannotCoerce: cannot cast type integer to uuid`).
  - 2026-05-25 (this entry) — two migrations now defensively guarded; chain still breaks downstream.
- **Fixes shipped 2026-05-25**:
  1. `4dfe7c45fffe_migrate_users_id_to_uuid.py` — entire upgrade body wrapped in `DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='id' AND data_type='integer') THEN … END IF; END $$;`. Every `ALTER COLUMN user_id TYPE uuid USING user_id::uuid` (invalid syntax) replaced with per-column `IF data_type='integer' THEN ALTER ... USING NULL::uuid`. On empty fresh DBs this types-checks. On already-migrated DBs the outer guard short-circuits the whole block. Verified locally on `postgres:16`.
  2. `a3f8c1d2e4b5_phase0_worm_tables_and_request_context.py` — Python `for stmt in [...]: try: op.execute(stmt) except Exception: pass` (broken — PG transactions don't reset on Python-caught errors, every subsequent ALTER fails with "current transaction is aborted") replaced with `DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_class WHERE relname='positions') THEN ALTER TABLE positions ADD COLUMN IF NOT EXISTS ...; END IF; END $$;` guard.
- **Remaining blockers (not yet fixed)**: After applying the two fixes above and resetting via `DROP SCHEMA public CASCADE; CREATE SCHEMA public;`, the chain next fails at `b7d2e4f1a9c3` on `ALTER TABLE positions ADD COLUMN IF NOT EXISTS policy_revision_id UUID` — same pattern: migration assumes the `positions` table exists when it hasn't been created yet in this chain order. A grep of the full chain suggests many migrations carry the same "ALTER table that doesn't exist yet" pattern. A clean end-to-end fresh-DB run is multi-day audit work — explicitly deferred.
- **Why production tolerates this**: `app/main.py` runs `run_alembic_upgrade()` non-fatally — `except Exception as e: logger.warning(f"Alembic runner skipped (non-fatal): {e}")` (`app/core/db_migrations.py` lines 63–66). `_ensure_tables()` then runs and brings the schema to current via `Base.metadata.create_all`. The advisory CI job runs alembic in isolation, so the silent prod-time tolerance doesn't carry over.
- **Production-state caveat (load-bearing before any future fix lands)**: production must be at or past `4dfe7c45fffe` (master head is `0036_force_rls_tenant_context` and dashboards work, which transitively requires UUID `users.id`). All fixes must be no-ops on already-migrated DBs (the `information_schema` / `pg_class` guards do this).
- **Mitigation**: Already advisory (`continue-on-error: true`). RISK-CI-PG-01 mitigation milestone already accounted for fixture/schema work this would surface.
- **Followups**: (a) Audit every migration that touches a table created in an earlier revision — guard with `pg_class` existence checks. (b) Once the chain is fully fresh-DB-clean, promote `backend-postgres` to hard gate.
- **Status**: Open (advisory). Two migrations guarded; downstream chain still breaks. Full chain audit deferred as multi-day work.
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
