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

## RISK-CI-PG-01: requires_postgres tests do not run in CI
- **Severity**: HIGH
- **Component**: GitHub Actions backend test job
- **Description**: 130 `requires_postgres`-marked tests auto-skip because CI uses `DATABASE_URL=sqlite+aiosqlite://`. The new route-smoke layer (`backend/tests/test_routes_smoke.py`, 2026-05-16) inherits the same gap. This is exactly how the `SET LOCAL` bind-param RLS bug (see `docs/incidents/2026-05-16-rls-set-local-bind-params.md`) shipped to prod and went undetected for 3 days.
- **Mitigation**: Add a GitHub Actions job that spins up a `postgres:16` service container, runs Alembic migrations, then runs `pytest -m requires_postgres` against it.
- **Status**: Open
- **Opened**: 2026-05-16

## RISK-OPS-MON-01: No backend 5xx alert + no Render auto-rollback
- **Severity**: HIGH
- **Component**: Sentry, Render service config
- **Description**: 2026-05-16 incident exposed two simultaneous monitoring gaps: (a) Sentry has no rule firing on backend 5xx rate, so a fully degraded prod produced zero alerts for 3 days; (b) Render's "auto-rollback on failed health check" toggle is off, so a deploy that returns 503 on `/api/health` stays live indefinitely.
- **Mitigation**: Wire `#alerts-backend` Sentry rule (>1% 5xx over 5min) and enable Render auto-rollback. Both are tracked as pre-launch gaps in `docs/runbooks/deployment-and-oncall.md` — incident shows they are no longer pre-launch, they are blocking.
- **Status**: Open
- **Opened**: 2026-05-16

## RISK-RLS-PROD-01: RLS injection broken on asyncpg — CLOSED
- **Severity**: P1 (production)
- **Component**: `backend/app/core/rls.py`
- **Description**: `TenantRLSAsyncSession` issued `SET LOCAL app.current_tenant_id = :tenant_id`. PostgreSQL rejects bind params in `SET` statements, so every DB query through the wrapped session raised `asyncpg.exceptions.PostgresSyntaxError`. `/api/health` returned 503 from 2026-05-13 through 2026-05-16.
- **Resolution**: 2026-05-16 — `151c591` switched to `SELECT set_config('app.current_tenant_id', :tenant_id, true)`. Health restored within minutes of deploy.
- **Status**: CLOSED. See `docs/incidents/2026-05-16-rls-set-local-bind-params.md`.
- **Opened**: 2026-05-13 / **Closed**: 2026-05-16
