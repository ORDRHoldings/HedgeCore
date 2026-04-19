# Open Risks

## RISK-TEST-ISO-01: TestAssertRunAccessible isolation flake
- **Severity**: LOW
- **Component**: backend/tests/test_report_studio_governance.py::TestAssertRunAccessible
- **Description**: 7 tests pass in isolation but fail when the suite runs as a unit. Symptom suggests module-level patching of `app.api.routes.v1_calculate._assert_run_accessible` leaks between tests or collides with a parallel test that mutates the same attribute.
- **Mitigation**: Tests pass when the class runs alone — coverage is intact, but CI green requires either fixing the patch scope or running this class in its own worker.
- **Status**: Open — deferred, not caused by this session's work (discovered during test-hardening pass).
- **Opened**: 2026-04-19

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

## RISK-GIT-02: master ~50 commits ahead of origin/master
- **Severity**: MEDIUM
- **Component**: git / CI
- **Description**: Fast-forward merge from feat/treasury-suite-phase1 → master completed at HEAD 6b2856e. Push to origin deferred at user's discretion. CI gates have not been run against remote since before this sprint.
- **Mitigation**: All tests pass locally (4839/0/158). tsc + next build clean. No frozen file changes without ADR. Ready to push when user approves.
- **Status**: Open
- **Opened**: 2026-04-14
