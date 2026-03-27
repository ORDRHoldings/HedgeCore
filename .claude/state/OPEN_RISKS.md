# Open Risks

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
