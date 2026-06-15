# Disaster Recovery Plan

**Last updated:** 2026-03-27
**Version:** 1.0
**Classification:** Internal

---

## Scope

This plan covers recovery from failure of any single component of the ORDR Terminal
production stack: Render backend, Vercel frontend, Render PostgreSQL database, or
third-party market data providers.

**Out of scope:** Multi-region failover (v1 freeze), ML workloads (v1 freeze),
broker connectivity (v1 freeze).

---

## Recovery Objectives

| Metric | Target |
|--------|--------|
| RTO (Recovery Time Objective) | 4 hours |
| RPO (Recovery Point Objective) | 24 hours (Render daily backup) |
| MTTR (Mean Time To Recover) | Target: < 2 hours for Tier-1 incidents |

---

## Failure Tier Definitions

| Tier | Definition | Examples | Target Response |
|------|-----------|---------|----------------|
| **Tier 1** | Total service outage — no users can log in | Backend crash, DB down | Start recovery within 30 min |
| **Tier 2** | Partial degradation — core features broken | Market data feed down, CORS error | Workaround within 2 hours |
| **Tier 3** | Minor degradation — non-critical features broken | E2E test failure, chart render bug | Fix within 24 hours (sprint) |

---

## Component Failure Playbooks

### Playbook A: Backend service down (Render)

**Symptoms:** All API calls return 502/503; `/api/health` unreachable.

**Steps:**
1. Check Render dashboard → **hedgecore** → **Logs** for crash reason
2. Common causes and fixes:
   | Cause | Fix |
   |-------|-----|
   | OOM crash | Increase Render plan: `plan: free` → `plan: starter` in render.yaml |
   | Missing env var | Check `hedgecore-secrets` env group — add missing key |
   | DB connection exhausted | `psql $DB_URL -c "SELECT count(*) FROM pg_stat_activity;"` — kill idle connections |
   | Code bug in deploy | Render dashboard → **Deploys** → click previous deploy → **Redeploy** |
   | Cold start + schema check | Wait 60s and retry (keepalive cron should prevent this) |
3. If rollback needed: Render dashboard → **Deploys** → select last known-good commit → **Redeploy**
4. After recovery: run `curl https://hedgecore.onrender.com/api/health` to confirm
5. Record incident in `docs/ops/incidents/` using the post-mortem template

### Playbook B: Frontend down (Vercel)

**Symptoms:** App unreachable; Vercel returns 5xx.

**Steps:**
1. Check Vercel dashboard → **hedgecore** → **Deployments** for failure reason
2. If build failed: check build logs for TypeScript or import errors
3. Rollback: Vercel dashboard → last successful deployment → **Promote to Production**
4. Manual redeploy without code change: `git commit --allow-empty -m "chore: force vercel redeploy" && git push`

### Playbook C: Database corrupted or lost

**Symptoms:** API returns 500 on all DB-dependent routes; migration errors in logs.

**Steps:**
1. Confirm DB is the problem: `psql $DATABASE_URL -c "SELECT 1;"` — should return `1`
2. If DB unreachable: check Render dashboard → **hedgecore-db** → status
3. If DB corrupted:
   - Render dashboard → **hedgecore-db** → **Backups** → restore most recent
   - After restore: update `DATABASE_URL` in `hedgecore-secrets` env group
   - Redeploy backend
   - Run `alembic current` to confirm migration state
4. If backup restore insufficient: follow Scenario B in `docs/ops/backup-restore.md`
5. Verify WORM table integrity: `GET /api/v1/audit/chain/verify` → `{"is_intact": true}`

**WORM WARNING:** Never attempt to reconstruct audit_events, calculation_runs, or
policy_revisions rows manually. If these are lost, the only recovery is from backup.
Data loss in WORM tables must be disclosed to affected tenants.

### Playbook D: Market data feed failure

**Symptoms:** FX rates show stale data; position calculations use last-known values.

**Steps:**
1. Check which providers are failing — backend logs show provider-level errors
2. Current providers (priority order): Twelve Data → Alpha Vantage → Finnhub → yfinance → exchangerate-api.com
3. The fallback chain is automatic — if one provider fails, the next is tried
4. If all providers down: backend falls back to `ALLOW_INDICATIVE_FALLBACK=true` behavior (indicative rates only)
5. Set `ALLOW_INDICATIVE_FALLBACK=true` in Render env if needed for temporary operation
6. Investigate provider status pages and API key validity
7. IBKR TWS: if live feed was running, verify TWS process is up on the host machine

### Playbook E: Secret compromise

**Symptoms:** Unauthorized API usage; unknown login events in audit trail.

**Steps:**
1. **Immediate:** Rotate compromised credential (see `docs/ops/secret-rotation-checklist.md`)
2. JWT_SECRET rotation invalidates all active sessions — users must re-login (acceptable)
3. Check audit trail for unauthorized access: `GET /api/v1/audit/events?event_type=LOGIN`
4. Check WORM tables for unauthorized calculation runs or policy changes
5. If API key compromised: `DELETE /v1/api-keys/{id}` for affected keys
6. Follow incident post-mortem template after containment

---

## Environment Variable Recovery

If all Render env vars are lost (env group deleted):

| Variable | Where to find value |
|----------|-------------------|
| `DATABASE_URL` | Render dashboard → hedgecore-db → Connection Info |
| `ASYNC_DATABASE_URL` | Same as above, replace `postgresql://` with `postgresql+asyncpg://` |
| `JWT_SECRET` | Generate new: `python3 -c "import secrets; print(secrets.token_hex(32))"` |
| `FINNHUB_API_KEY` | finnhub.io → account → API keys |
| `ANTHROPIC_API_KEY` | console.anthropic.com → API keys |
| `CORS_ALLOW_ORIGINS` | `["https://ordr-treasury.vercel.app","https://ordr-terminal.vercel.app"]` |
| `ENV` | `production` |

---

## Post-Incident Actions

After every Tier-1 or Tier-2 incident:
1. Create `docs/ops/incidents/YYYY-MM-DD-<summary>.md` using post-mortem template
2. Update `OPEN_RISKS.md` if incident revealed a new risk
3. Update `memory.db` validation_runs table with incident record
4. Review if any monitoring gap contributed to late detection

---

## DR Test Schedule

| Test | Frequency | Procedure |
|------|-----------|-----------|
| Backup restore drill | Quarterly | See `docs/ops/backup-restore.md` |
| Playbook A tabletop | Semi-annual | Walk through backend failure with team |
| Full DR exercise | Annual | Intentionally take down staging, recover using this plan |

---

## Related Documents

- `docs/ops/backup-restore.md` — backup and restore procedures
- `docs/ops/runbook.md` — day-to-day operations
- `docs/ops/sla-slo.md` — service level objectives
- `docs/ops/incident-postmortem-template.md` — post-mortem template
- `docs/ops/secret-rotation-checklist.md` — credential rotation
