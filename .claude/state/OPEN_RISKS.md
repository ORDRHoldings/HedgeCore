# Open Risks

## RISK-INF-01: Free-tier cold starts cause 503 on first request
- **Severity**: HIGH
- **Component**: Render backend (hedgecore + hedgecore-preview)
- **Description**: Free-tier Render services cold-start after ~15 min inactivity. During cold start, the schema readiness check fails → HTTP 503 on the first incoming request. Subsequent requests succeed.
- **Mitigation A**: Upgrade `plan: free` → `plan: starter` in `render.yaml` ($7/mo each service).
- **Mitigation B**: Add external health-ping cron: `*/14 * * * * curl -s https://hedgecore.onrender.com/api/health`.
- **Status**: Open — infrastructure budget decision pending.
- **Opened**: 2026-03-24
