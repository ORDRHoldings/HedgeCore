# ORDR Terminal — Operations Runbook

**Last updated:** 2026-03-05

---

## 1. Deployment Procedures

### 1.1 Backend Deploy (Render)
Render auto-deploys on push to `master`. Manual deploy:
```bash
git push origin master
# Monitor: https://dashboard.render.com → hedgecore service
```

Check health:
```bash
curl https://hedgecore.onrender.com/health
# Expected: {"status": "ok", ...}
```

### 1.2 Frontend Deploy (Vercel)
Vercel auto-deploys on push to `master`. Check:
- https://vercel.com/dashboard → hedgecore project
- Preview deploys on `dev` branch → hedgecore-preview

### 1.3 Database Migrations
Run Alembic migrations against production:
```bash
cd backend
DATABASE_URL="postgresql+asyncpg://hedge_user:...@.../hedge" \
  JWT_SECRET="..." \
  python -m alembic upgrade head
```

Always back up before migrating:
```bash
pg_dump -Fc "postgresql://..." > backup_$(date +%Y%m%d_%H%M).dump
```

---

## 2. Secret Rotation

### 2.1 JWT_SECRET Rotation
1. Generate new secret: `python3 -c "import secrets; print(secrets.token_urlsafe(64))"`
2. Update in Render environment variables
3. **Note**: existing sessions will be immediately invalidated — users must re-login
4. Update `backend/.env.example` with placeholder comment

### 2.2 API Key Rotation
API keys are HMAC-SHA256 hashed in `api_keys` table.
1. Contact affected user to generate new key via `/v1/api-keys` endpoint
2. Revoke old key: `DELETE /v1/api-keys/{id}`

### 2.3 Finnhub API Key
Set `FINNHUB_API_KEY` in Vercel project settings (not `NEXT_PUBLIC_` — server-side only).

---

## 3. Database Operations

### 3.1 Connect to Production DB
```bash
"C:\Program Files\PostgreSQL\17\bin\psql.exe" \
  "postgresql://hedge_user:<password>@dpg-d6abjuq48b3s73bqss00-a.oregon-postgres.render.com/hedge"
```

### 3.2 Reset to Blank State (DEMO ONLY)
```bash
cd backend
DATABASE_URL="..." JWT_SECRET="..." python reset_blank_state.py
```

### 3.3 Seed Demo Company
```bash
cd backend
DATABASE_URL="..." JWT_SECRET="..." python seed_company.py
```

---

## 4. Incident Response

### 4.1 Backend Down / 502s
1. Check Render service logs: Render dashboard → hedgecore → Logs
2. Check `/health` endpoint
3. Common causes:
   - DB connection exhaustion: check `pg_stat_activity`
   - Missing env var: check `Settings` startup validation
   - OOM: increase Render plan or reduce worker count

### 4.2 Auth Failures (401 on all requests)
1. Verify `JWT_SECRET` env var is set correctly (min 32 chars)
2. Check token expiry — access tokens expire in 30 min
3. Verify CSRF cookie is being sent on mutations

### 4.3 Audit Chain Integrity
```bash
# Check hash chain integrity
GET /api/v1/audit/chain/verify
# Expected: {"is_intact": true, "event_count": N}
```
If `is_intact=false`: escalate immediately — potential tamper event.

### 4.4 High Privilege Login Alerts
Roles with `hierarchy_level >= 10` trigger reduced session (15 min) and SYSTEM audit event.
Check `audit_events` table for `event_type = 'SYSTEM'`.

---

## 5. Monitoring Checklist

| Check | Frequency | Command/URL |
|-------|-----------|-------------|
| Backend health | 5 min | `GET /health` |
| Audit chain | Daily | `GET /v1/audit/chain/verify` |
| DB connections | Hourly | `SELECT count(*) FROM pg_stat_activity` |
| Token rotation | Weekly | Check `refresh_tokens` table for expired rows |
| Render service | Ongoing | Render dashboard |
| Vercel functions | Ongoing | Vercel dashboard → Functions |

---

## 6. WORM Table Protection

The following tables are **append-only** and must never have rows deleted or updated:
- `audit_events` — hash-chained audit trail
- `calculation_runs` — immutable engine output
- `policy_revisions` — policy change history
- `ledger_entries` — committed hedges

If you need to "undo" a ledger entry, create a reversal entry — never delete.

---

## 7. Emergency Contacts

- **Render support**: support@render.com
- **Vercel support**: vercel.com/support
- **DB restore**: Use Render automatic backups (daily, 7-day retention)
