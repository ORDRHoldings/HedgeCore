# Service Level Objectives (SLOs)

**Last updated:** 2026-03-27
**Stage:** v1 (pre-enterprise, single-tenant demo tier)

> **Note:** These are internal operational targets, not contractual SLAs. Formal SLAs
> will be defined when the product moves to paid enterprise customers.

---

## Service Definitions

| Service | URL | Purpose |
|---------|-----|---------|
| Backend API | `https://hedgecore.onrender.com` | FX calculations, governance, data |
| Frontend App | `https://ordr-terminal.vercel.app` | User interface |
| Preview Backend | `https://hedgecore-preview.onrender.com` | Dev/staging |

---

## SLO Targets (v1 / Free Tier)

| Metric | Target | Measurement | Notes |
|--------|--------|-------------|-------|
| **Availability** | 95% monthly | UptimeRobot HTTP check every 5 min | Free Render tier has expected cold starts |
| **API response time (p50)** | < 500ms | Manual spot-check | Excludes cold-start first request |
| **API response time (p95)** | < 3000ms | Manual spot-check | Cold start may hit 30-60s |
| **Calculation correctness** | 100% | Engine determinism + hash chain | Non-negotiable: kernel is deterministic |
| **Audit chain integrity** | 100% | `GET /v1/audit/chain/verify` daily | WORM guarantee |
| **Deployment success rate** | > 90% | GitHub Actions CI pass rate | |
| **Backup success rate** | 100% | Render automatic daily + pre-deploy manual | |

---

## SLO Upgrade Path

When the product moves to paying customers, upgrade targets are:

| Metric | v1 (now) | v2 (paid tier) |
|--------|----------|----------------|
| Availability | 95% | 99.5% (requires Render Starter $7/mo) |
| Cold starts | Frequent | Eliminated (warm instances) |
| RPO | 24 hours | 1 minute (PITR with paid DB tier) |
| RTO | 4 hours | 30 minutes |

---

## Error Budget

At 95% availability (720h/month):
- Budget: 36 hours downtime per month
- Free-tier cold starts (~2min per cold start, ~6 cold starts/day if keepalive fails) = ~24h/month worst case
- Keepalive cron (every 14 min) should prevent most cold starts → budget consumed: ~1h/month

---

## Monitoring & Alerting

Current monitoring gaps (see `docs/ops/monitoring-setup.md` for setup instructions):
- [ ] UptimeRobot configured and alerting on downtime (gap M-01, M-02)
- [ ] Sentry configured for error tracking (gap M-03)
- [x] `/api/health` endpoint exists and returns `{"status": "ok"}`
- [x] Keepalive cron active (RISK-INF-01 mitigation)
- [x] Audit chain daily check documented in runbook

---

## Incident Severity Mapping

| SLO breach | Severity | Response |
|-----------|---------|---------|
| Availability < 90% | Tier 1 | Immediate recovery |
| Calculation error detected | Tier 1 | Halt calculations, investigate |
| Audit chain broken | Tier 1 | Escalate immediately |
| Availability 90-95% | Tier 2 | Fix within 2 hours |
| p95 latency > 5s | Tier 3 | Investigate in sprint |
