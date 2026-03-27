# Database Maintenance Runbook

**Last updated:** 2026-03-27
**Database:** PostgreSQL 15+ (Render managed)

---

## Render Managed DB — What's Automatic

Render's managed PostgreSQL handles these automatically:
- Daily backups (7-day retention)
- Auto-vacuuming (enabled by default on Render)
- Connection pooling (PgBouncer available on paid plans)
- Security patches (managed by Render)

**You don't need to run manual VACUUM** unless you see bloat warnings below.

---

## Connecting to Production DB

```bash
"C:\Program Files\PostgreSQL\17\bin\psql.exe" \
  "postgresql://hedge_user:<password>@dpg-...render.com/hedge"
```

Or from Linux/Mac:
```bash
psql "postgresql://hedge_user:<password>@dpg-...render.com/hedge"
```

---

## Weekly Health Checks

Run these weekly (5 minutes):

### 1. Connection count
```sql
SELECT count(*) AS active_connections
FROM pg_stat_activity
WHERE state = 'active';
-- Healthy: < 10 (free tier connection limit: 25)
-- Action if > 20: investigate long-running queries below
```

### 2. Long-running queries
```sql
SELECT pid, now() - query_start AS duration, query, state
FROM pg_stat_activity
WHERE state != 'idle'
  AND query_start < now() - interval '5 minutes'
ORDER BY duration DESC;
-- Any query > 5 min is suspicious. Check if it's a migration or a stuck calculation.
-- Kill if needed: SELECT pg_terminate_backend(<pid>);
```

### 3. Table bloat check
```sql
SELECT
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(quote_ident(tablename))) AS size,
    n_dead_tup AS dead_rows,
    last_vacuum,
    last_autovacuum
FROM pg_stat_user_tables
ORDER BY n_dead_tup DESC
LIMIT 10;
-- Action if dead_rows > 100k and last_autovacuum is NULL or > 7 days ago:
-- VACUUM ANALYZE <tablename>;
```

### 4. Index health
```sql
SELECT
    indexrelname AS index_name,
    idx_scan AS times_used,
    pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
ORDER BY idx_scan ASC
LIMIT 10;
-- Indexes with idx_scan = 0 and size > 1MB may be unused. Review before dropping.
-- WORM table indexes must never be dropped without an ADR.
```

### 5. WORM table integrity
```bash
curl https://hedgecore.onrender.com/api/v1/audit/chain/verify
# Expected: {"is_intact": true, "event_count": N}
# If false: escalate immediately — potential tamper event
```

---

## Monthly Maintenance Tasks

### VACUUM ANALYZE (if autovacuum insufficient)
```sql
-- Run on tables with high churn (positions, execution_proposals, refresh_tokens)
VACUUM ANALYZE positions;
VACUUM ANALYZE execution_proposals;
VACUUM ANALYZE refresh_tokens;
-- NEVER run VACUUM FULL in production — takes exclusive lock
```

### Check for index bloat
```sql
SELECT
    relname AS table,
    indexrelname AS index,
    pg_size_pretty(pg_relation_size(indexrelid)) AS size
FROM pg_stat_user_indexes
JOIN pg_index ON pg_index.indexrelid = pg_stat_user_indexes.indexrelid
WHERE NOT indisvalid
ORDER BY pg_relation_size(indexrelid) DESC;
-- Invalid indexes: REINDEX CONCURRENTLY <index_name>;
```

### Refresh token cleanup
```sql
-- Expired refresh tokens are cleaned by the app but verify periodically
SELECT count(*) FROM refresh_tokens WHERE expires_at < now();
-- If > 1000 expired tokens: DELETE FROM refresh_tokens WHERE expires_at < now();
-- This is NOT a WORM table — deletion is permitted.
```

---

## Alembic State — Production Stamp (REQUIRED — Not Yet Done)

The production database was built by `_ensure_tables()` before full Alembic coverage was established.
The Alembic state table (`alembic_version`) may not exist or may be at the wrong revision.

**Check current state:**
```bash
cd backend
DATABASE_URL="postgresql://hedge_user:<password>@dpg-...render.com/hedge" \
  alembic current
# If output is empty or "(head) (base)" mismatch: stamp is needed
```

**Apply stamp (one-time, safe operation — does NOT run DDL):**
```bash
# Use the sync psycopg2 URL (not asyncpg):
DATABASE_URL="postgresql://hedge_user:<password>@dpg-...render.com/hedge" \
  alembic stamp 2026_03_24_baseline
```

After stamping:
```bash
alembic current
# Expected: 2026_03_24_baseline (head)
```

This must be done before the next schema migration. Tracked as gap DB-01 / part of sprint.

---

## Point-in-Time Recovery (PITR)

### Free tier (current): Daily snapshots only
- RPO: 24 hours
- How to access: Render dashboard → hedgecore-db → Backups
- Restore creates a new DB instance — update `DATABASE_URL` in env group after restore

### Paid tier upgrade path (Render Starter $7/mo):
- Enables PITR with ~1 minute granularity
- Restore to any point in last 7 days via Render dashboard
- Command: Render dashboard → hedgecore-db → Backups → "Restore to a point in time"

To upgrade: edit `render.yaml`:
```yaml
databases:
  - name: hedgecore-db
    plan: starter   # was: free
```

---

## Schema Change Checklist

Before any `alembic upgrade head` in production:

```
Pre-migration:
[ ] Take manual backup: ./scripts/backup/pg_backup.sh
[ ] Run migration against staging first (hedgecore-preview-db)
[ ] Review migration file: backend/migrations/versions/<revision>.py
[ ] Confirm no WORM table modifications without ADR
[ ] Check for missing indexes on new FK columns

Post-migration:
[ ] alembic current → confirms head
[ ] Run smoke test: curl https://hedgecore.onrender.com/api/health
[ ] Run audit chain verify: GET /v1/audit/chain/verify
[ ] Monitor logs for 10 min: Render dashboard → hedgecore → Logs
```

---

## Emergency: Kill All Connections

If the DB is connection-exhausted and the service can't start:
```sql
-- Terminate all non-superuser connections
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = 'hedge'
  AND pid <> pg_backend_pid()
  AND usename <> 'postgres';
```

---

## Related Runbooks

- `docs/ops/alembic-runbook.md` — migration procedures
- `docs/ops/backup-restore.md` — backup and restore
- `docs/ops/disaster-recovery-plan.md` — DB failure playbook
