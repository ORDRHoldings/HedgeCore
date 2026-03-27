# Backup & Restore Runbook

**Last updated:** 2026-03-27
**Owner:** Ops

---

## Recovery Objectives

| Metric | Target | Rationale |
|--------|--------|-----------|
| **RTO** (Recovery Time Objective) | 4 hours | Time to restore from backup + redeploy + verify |
| **RPO** (Recovery Point Objective) | 24 hours | Render free-tier backup retention: daily snapshots |

These targets reflect the free-tier hosting constraints. Upgrading to Render Starter ($7/mo) adds
point-in-time recovery (PITR) and reduces RPO to ~1 minute.

---

## Backup Sources

| Source | Provider | Frequency | Retention | How to Access |
|--------|----------|-----------|-----------|---------------|
| PostgreSQL production DB | Render automatic | Daily | 7 days | Render dashboard → hedgecore-db → Backups |
| PostgreSQL preview DB | Render automatic | Daily | 7 days | Render dashboard → hedgecore-preview-db → Backups |
| Application code | GitHub | Every commit | Forever | git clone |
| `.claude/state/memory.db` | git repo | On commit | Forever | git history |

---

## Manual Backup Procedure

Run before every database migration or major deployment:

```bash
# 1. Set connection string
export DATABASE_URL="postgresql://hedge_user:<password>@dpg-...render.com/hedge"

# 2. Run backup script
cd /path/to/TreasuryFX
./scripts/backup/pg_backup.sh

# Output: ./backups/db/hedgecore_YYYYMMDD_HHMMSS.dump
# Verify: pg_restore --list ./backups/db/hedgecore_*.dump | head -20
```

**Store backups off-site** — do not rely solely on the local file. Options:
- Upload to cloud storage: `aws s3 cp ./backups/db/hedgecore_*.dump s3://your-bucket/hedgecore/`
- Or email/upload to a secure location before destructive operations

---

## Restore Procedures

### Scenario A: Point-in-time restore from Render automatic backup

1. Log in to Render dashboard
2. Navigate to **hedgecore-db** → **Backups**
3. Select the backup closest to the desired point in time
4. Click **Restore** — creates a new database instance
5. Update `DATABASE_URL` in Render env group `hedgecore-secrets` to point to new DB
6. Redeploy `hedgecore` service to pick up new connection string
7. Run verify: `curl https://hedgecore.onrender.com/api/health`

**Estimated time:** 30–60 minutes (Render DB restore + service redeploy)

### Scenario B: Restore from manual pg_dump

```bash
# 1. Create a fresh database (or use existing empty one)
createdb hedgecore_restore

# 2. Restore dump
export DUMP_FILE="./backups/db/hedgecore_20260327_120000.dump"
export VERIFY_DB_URL="postgresql://postgres@localhost/hedgecore_restore"

pg_restore --clean --if-exists -d "$VERIFY_DB_URL" "$DUMP_FILE"

# 3. Verify
./scripts/backup/restore_verify.sh

# 4. Point production at restored DB
# Update DATABASE_URL in Render env group → redeploy
```

### Scenario C: Full environment rebuild (nuclear option)

1. Re-provision Render database from render.yaml blueprint
2. Run Alembic migrations: `alembic upgrade head`
3. Seed demo company: `python backend/seed_company.py`
4. Restore from most recent Render backup (Scenario A) or pg_dump (Scenario B)

**Estimated time:** 2–4 hours

---

## Quarterly Restore Drill

**Schedule:** First Monday of each quarter.

**Procedure:**
1. Take a manual backup: `./scripts/backup/pg_backup.sh`
2. Create a temporary local database: `createdb hedgecore_drill_YYYYMMDD`
3. Run: `DUMP_FILE=<latest> VERIFY_DB_URL=postgresql://...hedgecore_drill_YYYYMMDD ./scripts/backup/restore_verify.sh`
4. Confirm PASS output
5. Drop temporary database: `dropdb hedgecore_drill_YYYYMMDD`
6. Record result in `.claude/state/memory.db`:
   ```bash
   python -c "
   import sqlite3; c = sqlite3.connect('.claude/state/memory.db')
   c.execute(\"INSERT INTO validation_runs (run_date, result, notes) VALUES (datetime('now'), 'pass', 'Quarterly backup restore drill — PASS')\")
   c.commit()
   "
   ```

---

## What Is NOT Backed Up Automatically

| Item | Risk | Mitigation |
|------|------|-----------|
| Render env group secrets | HIGH — loss requires full secret re-entry | Document in 1Password / password manager |
| ANTHROPIC_API_KEY, FINNHUB_API_KEY | HIGH | Store in password manager |
| Vercel env vars | MEDIUM | Vercel dashboard → Settings → Environment Variables (export manually) |
| Local `.claude/state/nexus.db` | LOW — re-derivable from git history | Commit to git if it contains irreplaceable decisions |

---

## Related Runbooks

- `docs/ops/disaster-recovery-plan.md` — full DR playbook
- `docs/ops/alembic-runbook.md` — database migration procedures
- `docs/ops/secret-rotation-checklist.md` — credential rotation steps
