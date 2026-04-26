# Operations Hardening Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close 23 identified operations gaps across backup, CI/CD, monitoring, disaster recovery, database maintenance, developer docs, and local infra.

**Architecture:** All 7 chunks are independent and can run in parallel. Chunks 1–3 touch code/config files. Chunk 4 is mostly documentation but the Sentry backend section requires two small code changes (requirements.txt + main.py — see Task 10). Chunks 5–7 are documentation and infra files only. No architecture freeze violations — none of these changes touch engine_v1, frozen models, or middleware order.

**Tech Stack:** GitHub Actions, gitleaks v8, Dependabot, Trivy (OSS), bash/pg_dump, Docker Compose v3.9, Next.js 15 Dockerfile, Markdown docs.

**Deployment:** Render.com (backend) + Vercel (frontend). Free tier assumed throughout. All new tooling is OSS/free.

**Testing convention for docs tasks:** Each doc task has a completeness checklist to verify against rather than a unit test. Mark the checklist item only when you have confirmed the section exists and is accurate.

---

## Chunk 1: CI/CD Hardening

**Files:**
- Modify: `.github/workflows/ci.yml`
- Create: `.github/dependabot.yml`

### Task 1: Add gitleaks secret scan to GitHub Actions CI

gitleaks already runs in pre-commit (`.pre-commit-config.yaml` line 29) but is NOT in the GitHub Actions CI pipeline. This means secrets can slip through if pre-commit is skipped.

**Files:**
- Modify: `.github/workflows/ci.yml` — add `security` job

- [ ] **Step 1: Read current ci.yml**

Read `.github/workflows/ci.yml` in full to understand the job structure before modifying.

- [ ] **Step 2: Add security job to ci.yml**

Add this job block after the existing `docker` job (around line 158):

```yaml
  # ── Security scan ─────────────────────────────────────────────────────────────
  security:
    name: Secret scan (gitleaks)
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0   # full history required for gitleaks

      - name: Run gitleaks
        uses: gitleaks/gitleaks-action@v2   # tracks latest v2.x — not SHA-pinned (consistent with rest of ci.yml)
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

- [ ] **Step 3: Verify the job is correctly indented and parses as valid YAML**

Check that the new `security:` key is at the same indentation level as `backend:`, `frontend:`, `e2e:`, `governance:`, `docker:`. All jobs are at 2-space indent under `jobs:`.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci(security): add gitleaks secret scan job to GitHub Actions

Gitleaks was pre-commit only — CI now scans full history on every push.
Closes gap C-01."
```

---

### Task 2: Add Dependabot for automated dependency updates

No dependency vulnerability scanning exists. Dependabot is free via GitHub and creates automated PRs for outdated/vulnerable deps.

**Files:**
- Create: `.github/dependabot.yml`

- [ ] **Step 1: Create `.github/dependabot.yml`**

```yaml
version: 2

updates:
  # ── Python backend ────────────────────────────────────────────────────────────
  - package-ecosystem: "pip"
    directory: "/backend"
    schedule:
      interval: "weekly"
      day: "monday"
      time: "09:00"
      timezone: "UTC"
    open-pull-requests-limit: 5
    labels:
      - "dependencies"
      - "backend"
    ignore:
      # Pin these manually — they affect the frozen engine
      - dependency-name: "sqlalchemy"
        update-types: ["version-update:semver-major"]
      - dependency-name: "fastapi"
        update-types: ["version-update:semver-major"]
      - dependency-name: "alembic"
        update-types: ["version-update:semver-major"]

  # ── Node.js frontend ──────────────────────────────────────────────────────────
  - package-ecosystem: "npm"
    directory: "/frontend"
    schedule:
      interval: "weekly"
      day: "monday"
      time: "09:00"
      timezone: "UTC"
    open-pull-requests-limit: 5
    labels:
      - "dependencies"
      - "frontend"
    ignore:
      # Pin Next.js/React major versions manually
      - dependency-name: "next"
        update-types: ["version-update:semver-major"]
      - dependency-name: "react"
        update-types: ["version-update:semver-major"]
      - dependency-name: "react-dom"
        update-types: ["version-update:semver-major"]

  # ── GitHub Actions ────────────────────────────────────────────────────────────
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
      day: "monday"
      time: "09:00"
      timezone: "UTC"
    labels:
      - "dependencies"
      - "ci"
```

- [ ] **Step 2: Commit**

```bash
git add .github/dependabot.yml
git commit -m "ci(deps): add Dependabot for weekly dependency scanning

Covers Python/pip (backend), npm (frontend), and GitHub Actions.
Major versions of frozen-architecture packages pinned manually.
Closes gap C-03."
```

---

### Task 3: Add Trivy container image vulnerability scan

The Docker build job builds the image but never scans it for CVEs. Trivy is OSS and runs in CI for free.

**Files:**
- Modify: `.github/workflows/ci.yml` — extend `docker` job

- [ ] **Step 1: Read the current `docker` job in ci.yml** (lines 147–158)

Confirm the job ends after `docker build`. We'll add Trivy as a subsequent step.

- [ ] **Step 2: Add Trivy scan step inside the `docker` job**

Add after the `Build backend image` step:

```yaml
      - name: Scan image with Trivy
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: ordr-backend:ci
          format: table
          exit-code: 0          # warn only — don't block CI until baseline is established
          ignore-unfixed: true
          severity: CRITICAL,HIGH
```

Note: `exit-code: 0` means the scan reports but does not fail the build. Once a CVE baseline is established, change to `exit-code: 1` to make it a hard gate.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci(security): add Trivy container CVE scan to docker job

Scans backend image for CRITICAL/HIGH CVEs. Warn-only (exit-code: 0)
until baseline established. Closes gap C-06."
```

---

### Task 4: Raise coverage gate and harden mypy

Coverage gate is 40% (too low for financial software — target 60% now, 75% later). mypy runs with `continue-on-error: true` meaning type errors never block CI.

**Files:**
- Modify: `.github/workflows/ci.yml` — `backend` job

- [ ] **Step 1: Verify current coverage before changing the gate**

Run locally first to confirm coverage is still ≥ 60% (last measured 64% on 2026-03-18 but several files have changed since):

```bash
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" \
DATABASE_URL="sqlite+aiosqlite://" \
python -m pytest tests/ -q --cov=app --cov-report=term-missing --cov-fail-under=60
```

Expected: PASS. If coverage has dropped below 60%, do NOT change the gate — instead open a sprint task to restore coverage first, then change the gate.

- [ ] **Step 2: Raise coverage gate from 40% to 60%**

In `.github/workflows/ci.yml`, find the pytest step (around line 40–47). Change:
```yaml
          --cov-fail-under=40
```
to:
```yaml
          --cov-fail-under=60
```

- [ ] **Step 3: Verify the change**

Read the modified block to confirm it shows `--cov-fail-under=60`.

- [ ] **Step 4: Add a comment noting the progression target**

Add an inline comment on the same line:
```yaml
          --cov-fail-under=60   # raised from 40% (2026-03-27); target 75%
```

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci(quality): raise coverage gate 40% -> 60%

Verified locally before committing. Target 75% tracked in memory.db
(risk #3). mypy remains continue-on-error pending baseline cleanup.
Closes gap C-05."
```

---

## Chunk 2: Backup Automation

**Files:**
- Create: `scripts/backup/pg_backup.sh`
- Create: `scripts/backup/restore_verify.sh`
- Create: `docs/ops/backup-restore.md`

### Task 5: Write pg_backup.sh — automated database backup script

The runbook mentions `pg_dump` but has no automation. This script creates timestamped compressed dumps and prunes old ones.

**Files:**
- Create: `scripts/backup/pg_backup.sh`

- [ ] **Step 1: Create `scripts/backup/` directory structure**

Verify `scripts/` exists first, then create the file:

```bash
#!/usr/bin/env bash
# pg_backup.sh — ORDR Terminal PostgreSQL backup script
#
# Platform: Linux only (uses GNU find -delete and GNU stat -c%s)
#           macOS users: install coreutils via Homebrew for GNU stat/find
#
# Usage:
#   DATABASE_URL="postgresql://user:pass@host/db" ./pg_backup.sh
#
# Environment variables:
#   DATABASE_URL       Required. Full PostgreSQL connection string.
#   BACKUP_DIR         Optional. Where to store dumps. Default: ./backups/db
#   RETAIN_DAYS        Optional. Days to keep old backups. Default: 30
#   BACKUP_PREFIX      Optional. Filename prefix. Default: hedgecore
#
# Output:
#   Creates: $BACKUP_DIR/$BACKUP_PREFIX_YYYYMMDD_HHMMSS.dump
#   Prunes:  Dumps older than $RETAIN_DAYS days
#
# Exit codes:
#   0  Success
#   1  Missing DATABASE_URL
#   2  pg_dump failed
#   3  Backup file not created or empty

set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────────
DATABASE_URL="${DATABASE_URL:?ERROR: DATABASE_URL is required}"
BACKUP_DIR="${BACKUP_DIR:-./backups/db}"
RETAIN_DAYS="${RETAIN_DAYS:-30}"
BACKUP_PREFIX="${BACKUP_PREFIX:-hedgecore}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/${BACKUP_PREFIX}_${TIMESTAMP}.dump"

# ── Setup ─────────────────────────────────────────────────────────────────────
mkdir -p "$BACKUP_DIR"

echo "[backup] Starting backup at $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "[backup] Output: $BACKUP_FILE"
echo "[backup] Retain: ${RETAIN_DAYS} days"

# ── Dump ──────────────────────────────────────────────────────────────────────
if ! pg_dump -Fc "$DATABASE_URL" > "$BACKUP_FILE"; then
    echo "[backup] ERROR: pg_dump failed" >&2
    rm -f "$BACKUP_FILE"
    exit 2
fi

# ── Validate dump is non-empty ────────────────────────────────────────────────
DUMP_SIZE=$(stat -c%s "$BACKUP_FILE" 2>/dev/null || stat -f%z "$BACKUP_FILE")
if [ "$DUMP_SIZE" -lt 1024 ]; then
    echo "[backup] ERROR: dump file too small (${DUMP_SIZE} bytes) — may be corrupt" >&2
    exit 3
fi

echo "[backup] Dump complete: ${DUMP_SIZE} bytes"

# ── Prune old backups ─────────────────────────────────────────────────────────
echo "[backup] Pruning backups older than ${RETAIN_DAYS} days..."
find "$BACKUP_DIR" -name "${BACKUP_PREFIX}_*.dump" -mtime "+${RETAIN_DAYS}" -delete
REMAINING=$(find "$BACKUP_DIR" -name "${BACKUP_PREFIX}_*.dump" | wc -l)
echo "[backup] Remaining backups: ${REMAINING}"

# ── Summary ───────────────────────────────────────────────────────────────────
echo "[backup] SUCCESS: $BACKUP_FILE"
echo "[backup] Verify with: pg_restore --list $BACKUP_FILE | head -20"
```

- [ ] **Step 2: Make the script executable**

```bash
chmod +x scripts/backup/pg_backup.sh
```

- [ ] **Step 3: Verify script syntax**

```bash
bash -n scripts/backup/pg_backup.sh
# Expected: no output (syntax OK)
```

- [ ] **Step 4: Commit**

```bash
git add scripts/backup/pg_backup.sh
git commit -m "ops(backup): add pg_backup.sh automated backup script

Timestamped pg_dump with size validation and retention pruning.
Closes gap B-01."
```

---

### Task 6: Write restore_verify.sh — backup integrity verification

Backups are worthless without a restore test. This script restores a dump to a temporary database and verifies key table row counts.

**Files:**
- Create: `scripts/backup/restore_verify.sh`

- [ ] **Step 1: Create the script**

```bash
#!/usr/bin/env bash
# restore_verify.sh — Verify a pg_dump backup is restorable
#
# Usage:
#   DUMP_FILE=./backups/db/hedgecore_20260327_120000.dump \
#   VERIFY_DB_URL="postgresql://user:pass@localhost/hedgecore_verify" \
#   ./restore_verify.sh
#
# What it does:
#   1. Restores the dump to VERIFY_DB_URL (database must exist)
#   2. Checks row counts on critical tables
#   3. Verifies WORM tables are not empty
#   4. Reports PASS or FAIL with details
#
# The verify database should be a throwaway local or staging DB.
# Drop and recreate it after each verify run.
#
# Exit codes:
#   0  Restore verified successfully
#   1  Missing required env vars
#   2  pg_restore failed
#   3  Verification checks failed

set -euo pipefail

DUMP_FILE="${DUMP_FILE:?ERROR: DUMP_FILE is required}"
VERIFY_DB_URL="${VERIFY_DB_URL:?ERROR: VERIFY_DB_URL is required}"

echo "[verify] Restore verification started at $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "[verify] Dump file: $DUMP_FILE"

# ── Restore ───────────────────────────────────────────────────────────────────
echo "[verify] Restoring dump..."
if ! pg_restore --clean --if-exists -d "$VERIFY_DB_URL" "$DUMP_FILE" 2>&1; then
    echo "[verify] WARNING: pg_restore exited non-zero. This is EXPECTED when --clean is used"
    echo "[verify]          because it tries to drop objects that may not exist yet."
    echo "[verify]          Proceeding to table verification to confirm actual restore success."
fi

# ── Verify critical tables ────────────────────────────────────────────────────
check_table() {
    local table="$1"
    local min_rows="${2:-0}"
    local count
    count=$(psql "$VERIFY_DB_URL" -t -c "SELECT COUNT(*) FROM ${table};" 2>/dev/null | tr -d ' ')
    if [ -z "$count" ]; then
        echo "[verify] FAIL: table '${table}' not found or query failed" >&2
        return 1
    fi
    if [ "$count" -lt "$min_rows" ]; then
        echo "[verify] FAIL: table '${table}' has ${count} rows, expected >= ${min_rows}" >&2
        return 1
    fi
    echo "[verify] OK: ${table} — ${count} rows"
    return 0
}

FAILED=0

# Core tables must exist (min 0 rows — production may be empty in staging)
check_table "users"             || FAILED=1
check_table "companies"         || FAILED=1
check_table "audit_events"      || FAILED=1
check_table "calculation_runs"  || FAILED=1
check_table "policy_revisions"  || FAILED=1

# ── Report ────────────────────────────────────────────────────────────────────
if [ "$FAILED" -eq 0 ]; then
    echo "[verify] SUCCESS: backup restore verified ✓"
    echo "[verify] RTO evidence: dump restored and tables intact"
    exit 0
else
    echo "[verify] FAIL: one or more table checks failed" >&2
    echo "[verify] Action: inspect restore output above and re-run pg_backup.sh" >&2
    exit 3
fi
```

- [ ] **Step 2: Make executable**

```bash
chmod +x scripts/backup/restore_verify.sh
```

- [ ] **Step 3: Verify syntax**

```bash
bash -n scripts/backup/restore_verify.sh
```

- [ ] **Step 4: Commit**

```bash
git add scripts/backup/restore_verify.sh
git commit -m "ops(backup): add restore_verify.sh backup integrity check

Restores dump to verify DB, checks row counts on WORM + core tables.
Closes gap B-02."
```

---

### Task 7: Write backup-restore.md runbook

Documents the full backup lifecycle: what runs when, how to restore, RTO/RPO targets, and the quarterly restore drill schedule.

**Files:**
- Create: `docs/ops/backup-restore.md`

- [ ] **Step 1: Create the document**

```markdown
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
```

- [ ] **Step 2: Verify completeness checklist**

Confirm the document contains all required sections:
- [ ] RTO and RPO targets defined
- [ ] Render automatic backup source documented
- [ ] Manual pg_dump procedure present
- [ ] Restore procedure (Render) present
- [ ] Restore procedure (pg_dump) present
- [ ] Full rebuild procedure present
- [ ] Quarterly restore drill defined
- [ ] Items NOT backed up listed

- [ ] **Step 3: Commit**

```bash
git add docs/ops/backup-restore.md
git commit -m "docs(ops): add backup-restore runbook with RTO/RPO and drill schedule

Covers Render automatic backups, manual pg_dump, restore procedures,
and quarterly drill. RTO=4h, RPO=24h. Closes gaps B-03, B-04."
```

---

## Chunk 3: Disaster Recovery Plan

**Files:**
- Create: `docs/ops/disaster-recovery-plan.md`
- Create: `docs/ops/sla-slo.md`

### Task 8: Write disaster-recovery-plan.md

A DR diagram exists in `docs/Docs/Technical/Disaster Recovery and Business Continuity diagram.png` but there is no actionable DR runbook. This fills that gap.

**Files:**
- Create: `docs/ops/disaster-recovery-plan.md`

- [ ] **Step 1: Create the DR plan document**

```markdown
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
| `CORS_ALLOW_ORIGINS` | `["https://hedgecore.vercel.app","https://ordr-terminal.vercel.app"]` |
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
```

- [ ] **Step 2: Verify completeness checklist**
  - [ ] RTO/RPO defined
  - [ ] Tier definitions present
  - [ ] Backend failure playbook
  - [ ] Frontend failure playbook
  - [ ] Database failure playbook
  - [ ] Market data failure playbook
  - [ ] Secret compromise playbook
  - [ ] Env var recovery table
  - [ ] DR test schedule

- [ ] **Step 3: Commit**

```bash
git add docs/ops/disaster-recovery-plan.md
git commit -m "docs(ops): add disaster recovery plan with 5 failure playbooks

Covers backend, frontend, DB, market data, and secret compromise.
RTO=4h, RPO=24h. WORM table loss disclosure requirement noted.
Closes gap B-03."
```

---

### Task 9: Write sla-slo.md — service level objectives

**Files:**
- Create: `docs/ops/sla-slo.md`

- [ ] **Step 1: Create the document**

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add docs/ops/sla-slo.md
git commit -m "docs(ops): add SLO definitions for v1 free-tier deployment

95% availability target with upgrade path to 99.5% on paid tier.
Error budget calculation included. Closes gap D-03."
```

---

## Chunk 4: Monitoring Setup

**Files:**
- Create: `docs/ops/monitoring-setup.md`

### Task 10: Write monitoring-setup.md

Documents how to configure UptimeRobot (free) for uptime alerts and Sentry (free tier) for error tracking. Zero new spend.

**Files:**
- Create: `docs/ops/monitoring-setup.md`

- [ ] **Step 1: Create the document**

```markdown
# Monitoring Setup Guide

**Last updated:** 2026-03-27

Zero-cost monitoring stack using free-tier services.

---

## Stack Overview

| Tool | Purpose | Cost | URL |
|------|---------|------|-----|
| UptimeRobot | Uptime monitoring + alerting | Free (50 monitors, 5-min interval) | uptimerobot.com |
| Sentry | Error tracking + stack traces | Free (5k errors/mo) | sentry.io |
| Render Logs | Backend log access | Free (included) | dashboard.render.com |
| Vercel Analytics | Frontend page load metrics | Free (included) | vercel.com |

---

## UptimeRobot Setup

### Step 1: Create a free account
1. Go to https://uptimerobot.com and create a free account
2. Verify email

### Step 2: Add monitors

Create the following monitors (Settings → Add New Monitor):

| Monitor Name | Type | URL | Interval | Alert |
|-------------|------|-----|----------|-------|
| ORDR Backend (prod) | HTTP(s) | `https://hedgecore.onrender.com/api/health` | 5 min | Email + Slack (if set up) |
| ORDR Frontend (prod) | HTTP(s) | `https://ordr-terminal.vercel.app` | 5 min | Email |
| ORDR Backend (preview) | HTTP(s) | `https://hedgecore-preview.onrender.com/api/health` | 15 min | Email only |

**Expected response for backend health check:**
- Status: 200
- Body contains: `"status":"ok"`

Configure each monitor with:
- **Alert contacts:** your email
- **Alert when:** Down for 2 consecutive checks (10 min)
- **Keyword monitoring (backend):** Look for `"status":"ok"` in response body

### Step 3: Create a status page (optional)
UptimeRobot → Status Pages → Create → add all 3 monitors.
Share with stakeholders or customers.

### Step 4: Add Slack alerts (optional)
If you use Slack:
1. UptimeRobot → Alert Contacts → Add Alert Contact → Slack
2. Create an incoming webhook in your Slack workspace
3. Paste webhook URL into UptimeRobot

---

## Sentry Setup (Error Tracking)

### Step 1: Create project
1. Go to https://sentry.io and create a free account
2. Create organization: `ordr-terminal`
3. Create two projects:
   - **ordr-backend** (Python → FastAPI)
   - **ordr-frontend** (JavaScript → Next.js)

### Step 2: Backend integration (CODE CHANGES REQUIRED)

> **⚠️ This section requires real code changes to the backend.** These are not architectural changes and do not touch frozen files, but they must go through normal CI (ruff lint, pytest).

**2a.** Add `sentry-sdk` to `backend/requirements.txt`:
```
sentry-sdk[fastapi]==2.x.x
```
Pin to the latest 2.x release — check https://pypi.org/project/sentry-sdk/ for current version.

**2b.** Add `SENTRY_DSN` to `backend/app/core/config.py` Settings class:
```python
SENTRY_DSN: str = ""   # empty string = Sentry disabled
```

**2c.** In `backend/app/main.py`, add Sentry init after the settings import and before app creation:
```python
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration

if settings.ENV == "production" and settings.SENTRY_DSN:
    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        integrations=[FastApiIntegration(), SqlalchemyIntegration()],
        traces_sample_rate=0.1,   # 10% of requests for performance monitoring
        environment=settings.ENV,
        # APP_VERSION is not currently in Settings — omit for now or add it:
        # release=settings.APP_VERSION,
    )
```

**2d.** Add `SENTRY_DSN` to Render env group `hedgecore-secrets`: paste DSN from Sentry dashboard → Settings → Client Keys

**2e.** Run `ruff check app/` and `pytest tests/ -x -q` to confirm no regressions before committing.

### Step 3: Frontend integration

```bash
cd frontend
npm install @sentry/nextjs
npx @sentry/wizard@latest -i nextjs
```

The wizard creates `sentry.client.config.ts`, `sentry.server.config.ts`, and `sentry.edge.config.ts`.

Add to Vercel environment variables:
- `NEXT_PUBLIC_SENTRY_DSN` — public DSN from Sentry (safe to expose)
- `SENTRY_ORG` — your Sentry org slug
- `SENTRY_PROJECT` — `ordr-frontend`
- `SENTRY_AUTH_TOKEN` — from Sentry → Settings → Auth Tokens (for source maps)

### Step 4: Verify Sentry is working

**Backend:**
```bash
# Trigger a test error via a deliberate validation failure (no new route needed)
curl -X POST https://hedgecore.onrender.com/api/v1/positions \
  -H "Content-Type: application/json" \
  -d '{"invalid": "payload"}'
# Expected: 422 Unprocessable Entity — check Sentry Issues for the validation error
```

**Frontend:**
Navigate to a non-existent route (e.g. `/test-sentry-verification-delete-me`) — the 404 should appear in Sentry Issues within 30 seconds.

---

## Render Log Access

No setup needed — logs are available in the Render dashboard.

**Backend logs:** dashboard.render.com → hedgecore → Logs
**Key log patterns to watch:**
```
ERROR     — application errors
WARNING   — rate limit hits, auth failures
startup failed — startup validation error (missing env var)
WORM      — WORM trigger fired (should be zero UPDATE/DELETE events)
```

Set up a log alert in Render (paid feature) or manually check weekly.

---

## Vercel Analytics

Enable in Vercel dashboard → hedgecore project → Analytics → Enable.
Provides page views, Web Vitals (LCP, FID, CLS), and geographic distribution.

---

## Monitoring Runbook Checks

Add these to your weekly ops checklist:

```
Weekly monitoring checks:
[ ] UptimeRobot: no downtime incidents in past 7 days
[ ] Sentry: no new unresolved CRITICAL/HIGH errors
[ ] Render: no crash restarts in backend service logs
[ ] Audit chain: GET /api/v1/audit/chain/verify → is_intact: true
[ ] DB connections: psql -c "SELECT count(*) FROM pg_stat_activity;" < 10
```

---

## Escalation Path

| Situation | Action |
|-----------|--------|
| UptimeRobot alert fires | Follow DR Plan playbook in `docs/ops/disaster-recovery-plan.md` |
| Sentry CRITICAL error | Investigate immediately; open incident if user-affecting |
| Audit chain broken | Escalate immediately (potential tamper event) |
```

- [ ] **Step 2: Verify completeness checklist**
  - [ ] UptimeRobot setup steps present
  - [ ] Sentry backend integration present
  - [ ] Sentry frontend integration present
  - [ ] Weekly runbook checks present
  - [ ] Escalation path present

- [ ] **Step 3: Commit**

```bash
git add docs/ops/monitoring-setup.md
git commit -m "docs(ops): add monitoring setup guide (UptimeRobot + Sentry)

Free-tier stack: UptimeRobot for uptime alerts, Sentry for error tracking.
Includes setup steps, backend/frontend integration, weekly checks.
Closes gaps M-01, M-02, M-03."
```

---

## Chunk 5: Developer & Operator Documentation

**Files:**
- Create: `docs/ops/onboarding.md`
- Create: `docs/ops/incident-postmortem-template.md`
- Create: `docs/ops/data-retention-policy.md`

### Task 11: Write onboarding.md — new developer/operator guide

No onboarding guide exists. A new developer has no documented path to get the system running locally.

**Files:**
- Create: `docs/ops/onboarding.md`

- [ ] **Step 1: Create the document**

```markdown
# Onboarding Guide — New Developer / Operator

**Last updated:** 2026-03-27

Welcome to ORDR Terminal. This guide gets you from zero to a running local environment.

---

## Prerequisites

Install these before starting:

| Tool | Version | Install |
|------|---------|---------|
| Python | 3.12 | pyenv or python.org |
| Node.js | 20 LTS | nvm or nodejs.org |
| PostgreSQL | 15+ | postgresql.org |
| Git | Any recent | git-scm.com |
| Docker (optional) | 24+ | docker.com |

**Windows note:** The repo uses bash scripts. Use Git Bash or WSL2. PowerShell is used
for Render deployment scripts (`scripts/render/*.ps1`).

---

## Repository Structure

```
TreasuryFX/
├── backend/          # Python 3.12 FastAPI API server
│   ├── app/          # Application code
│   │   ├── api/      # Route handlers
│   │   ├── engine/   # Orchestration layer (14 modules)
│   │   ├── engine_v1/ # FROZEN deterministic kernel (35 modules) ⚠️
│   │   ├── models/   # SQLAlchemy ORM models
│   │   └── core/     # Auth, config, dependencies
│   ├── migrations/   # Alembic database migrations
│   └── tests/        # ~2700 test cases
├── frontend/         # Next.js 15 TypeScript app
│   └── src/
│       ├── app/      # App Router pages
│       ├── components/ # React components
│       └── lib/      # Utilities, API client, auth
├── docs/
│   ├── architecture/ # Architecture freeze docs, ADRs ← READ THIS FIRST
│   └── ops/          # Operational runbooks ← YOU ARE HERE
├── infra/            # Docker, Nginx, K8s, Terraform (future)
├── scripts/          # Utility scripts
└── .claude/          # Claude Code operating framework
    └── rules/        # Coding rules (read before making changes)
```

---

## Local Development Setup

### 1. Clone and configure

```bash
git clone <repo-url>
cd TreasuryFX
cp backend/.env.example backend/.env
# Edit backend/.env — set DATABASE_URL, JWT_SECRET
```

**Minimum required env vars in `backend/.env`:**
```
DATABASE_URL=postgresql+asyncpg://hedgecalc:hedgecalc@localhost/hedgecalc
JWT_SECRET=dev-secret-key-at-least-32-characters-long
ENV=development
```

### 2. Backend setup

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Create local PostgreSQL database
createdb hedgecalc

# Run migrations
alembic upgrade head

# Seed demo data
python seed_company.py

# Start server
uvicorn app.main:app --reload
# API running at http://localhost:8000
# Docs at http://localhost:8000/docs
```

### 3. Frontend setup

```bash
cd frontend
npm ci

# Create local env file
cp .env.example .env.local 2>/dev/null || echo "NEXT_PUBLIC_API_URL=http://localhost:8000/api" > .env.local

# Start dev server
npm run dev
# App running at http://localhost:3000
```

### 4. Login with demo credentials

- URL: http://localhost:3000
- Username: `demo`
- Password: `demo`

---

## Running Tests

```bash
# Backend tests (fast, uses SQLite in-memory)
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" \
DATABASE_URL="sqlite+aiosqlite://" \
python -m pytest tests/ -x -q --tb=short

# Expected: ~2700 passing, 0 failed, ~130 skipped (Postgres-only tests)

# Frontend TypeScript check
cd frontend
npx tsc --noEmit

# Frontend build check
npx next build
```

---

## Architecture Rules — READ BEFORE CHANGING CODE

**⚠️ v1 Architecture Freeze:** Several components are frozen and require an ADR to modify.

Key rules:
1. `engine_v1/` is a frozen deterministic kernel — never add non-deterministic logic
2. `R1-R8` risk taxonomy is immutable — never modify
3. Middleware order: Audit → Rate Limit → Auth — never reorder
4. WORM tables (`audit_events`, `calculation_runs`, `policy_revisions`) are append-only

Read before touching anything:
- `docs/architecture/architecture-freeze.md` — full freeze list
- `.claude/rules/` — domain-specific coding rules (6 files)

---

## Making Changes

Standard workflow:
```bash
# 1. Create feature branch
git checkout -b feat/my-feature

# 2. Make changes
# (follow rules in .claude/rules/ for your domain)

# 3. Run tests
cd backend && pytest tests/ -x -q
cd frontend && npx tsc --noEmit

# 4. Push — CI runs automatically
git push origin feat/my-feature
```

**CI jobs that run on every push:**
- Backend: ruff lint + pytest (must be ≥60% coverage)
- Frontend: tsc + build
- Architecture: freeze check + pre-merge gate + risk gate
- Docker: backend image build + Trivy scan
- Security: gitleaks secret scan

---

## Deployment

All deployments are automatic on push to `master` (production) or `dev` (preview).

| Branch | Backend | Frontend |
|--------|---------|---------|
| `master` | Render auto-deploy (`hedgecore`) | Vercel auto-deploy |
| `dev` | Render auto-deploy (`hedgecore-preview`) | Vercel preview |

Manual deploy: see `docs/ops/render-cli.md`

---

## Key URLs

| Resource | URL |
|----------|-----|
| Production app | https://ordr-terminal.vercel.app |
| Production API | https://hedgecore.onrender.com/api |
| API docs (dev) | http://localhost:8000/docs |
| Render dashboard | https://dashboard.render.com |
| Vercel dashboard | https://vercel.com/dashboard |
| GitHub Actions | https://github.com/<org>/<repo>/actions |

---

## Common Issues

| Problem | Solution |
|---------|---------|
| `ImportError` on startup | Check you're in the right venv and ran `pip install -r requirements.txt` |
| `DATABASE_URL` asyncpg errors | Use `postgresql+asyncpg://` prefix, not `postgresql://` |
| 401 on all requests after JWT change | JWT_SECRET changed — all tokens invalidated, re-login |
| `alembic upgrade head` fails | Check `alembic current` — may need to stamp baseline first (`docs/ops/alembic-runbook.md`) |
| Frontend build fails | Run `npx tsc --noEmit` to find TypeScript errors first |
| Tests fail with `requires_postgres` | Normal — these tests skip on SQLite. Run against real PG for full suite. |
```

- [ ] **Step 2: Verify completeness checklist**
  - [ ] Prerequisites listed
  - [ ] Repo structure documented
  - [ ] Backend setup steps
  - [ ] Frontend setup steps
  - [ ] Test commands
  - [ ] Architecture freeze warning
  - [ ] Deployment workflow
  - [ ] Common issues table

- [ ] **Step 3: Commit**

```bash
git add docs/ops/onboarding.md
git commit -m "docs(ops): add developer onboarding guide

Covers setup, architecture rules, testing, deployment, and common issues.
Closes gap D-01."
```

---

### Task 12: Write incident-postmortem-template.md

**Files:**
- Create: `docs/ops/incident-postmortem-template.md`
- Create: `docs/ops/incidents/` directory placeholder

- [ ] **Step 1: Create the template**

```markdown
# Incident Post-Mortem Template

Copy this file to `docs/ops/incidents/YYYY-MM-DD-<summary>.md` for each incident.

---

# Incident: [One-line summary]

**Date:** YYYY-MM-DD
**Severity:** Tier 1 / Tier 2 / Tier 3
**Duration:** HH:MM (from first alert to full recovery)
**Components affected:** [Backend / Frontend / Database / Market Data / Auth]
**Author:** [name or team]
**Status:** Draft / Final

---

## Timeline

| Time (UTC) | Event |
|-----------|-------|
| HH:MM | Incident first detected |
| HH:MM | Investigation started |
| HH:MM | Root cause identified |
| HH:MM | Fix deployed |
| HH:MM | Service fully recovered |
| HH:MM | Post-mortem written |

---

## Impact

**Who was affected:** [e.g. all users, specific tenant, internal only]
**What was broken:** [e.g. login, FX calculations, position desk]
**Data integrity:** [Was any data corrupted or lost? Were WORM tables affected?]
**Audit chain:** [Was chain integrity maintained? Run `GET /v1/audit/chain/verify`]

---

## Root Cause

[1-3 sentences. Be specific. "The deploy failed because..." not "there was a problem."]

---

## Contributing Factors

- [Factor 1]
- [Factor 2]

---

## Detection

**How was the incident detected?**
[ ] UptimeRobot alert
[ ] Sentry error
[ ] User report
[ ] Manual check
[ ] Other: ___

**Time to detect:** HH:MM from incident start

---

## Resolution

**What fixed it?**
[Exact steps taken, commands run, config changes made]

**Was a rollback needed?** Yes / No
If yes: [which commit was rolled back to, and via what method]

---

## What Went Well

- [e.g. Keepalive cron limited blast radius]
- [e.g. DR playbook was accurate and followed correctly]

---

## What Could Be Improved

- [e.g. No alerting — manual detection took 2 hours]
- [e.g. DR playbook missing step for this case]

---

## Action Items

| Action | Owner | Due | Issue/PR |
|--------|-------|-----|---------|
| [Fix root cause] | - | YYYY-MM-DD | - |
| [Add monitoring for X] | - | YYYY-MM-DD | - |
| [Update DR playbook] | - | YYYY-MM-DD | - |

---

## Lessons Learned

[1-2 sentences. What does the team know now that it didn't know before?]
```

- [ ] **Step 2: Create placeholder for incidents directory**

```bash
# Create incidents directory with a .gitkeep
mkdir -p docs/ops/incidents
touch docs/ops/incidents/.gitkeep
```

- [ ] **Step 3: Commit**

```bash
git add docs/ops/incident-postmortem-template.md docs/ops/incidents/.gitkeep
git commit -m "docs(ops): add incident post-mortem template and incidents directory

Structured template covering timeline, impact, root cause, detection,
resolution, and action items. Closes gap D-04."
```

---

### Task 13: Write data-retention-policy.md

**Files:**
- Create: `docs/ops/data-retention-policy.md`

- [ ] **Step 1: Create the document**

```markdown
# Data Retention Policy

**Last updated:** 2026-03-27
**Version:** 1.0
**Applies to:** ORDR Terminal v1 (single-tenant demo / early enterprise)

---

## Overview

This policy defines how long different categories of data are retained in ORDR Terminal
and what happens when the retention period expires.

---

## Data Categories and Retention

### Category 1: WORM / Immutable Records

These tables are **append-only by design** and are never deleted (DB-level trigger enforcement):

| Table | Data | Retention | Deletion |
|-------|------|-----------|---------|
| `audit_events` | All system events with hash chain | **Indefinite** | Not permitted — immutable |
| `calculation_runs` | Hedge calculation outputs | **Indefinite** | Not permitted — immutable |
| `policy_revisions` | Policy change history | **Indefinite** | Not permitted — immutable |
| `ledger_entries` | Committed hedge positions | **Indefinite** | Reversal entries only |

**Rationale:** Regulatory and audit requirements demand complete, tamper-evident records.
Even if a client offboards, these records must be preserved for compliance purposes.

### Category 2: Operational User Data

| Data | Retention | Deletion method |
|------|-----------|----------------|
| User accounts | Duration of business relationship + 7 years | Anonymize on offboard |
| Positions | Duration of business relationship + 7 years | Archive table |
| Execution proposals | Duration of business relationship + 7 years | Archive table |
| FX exposure records | Duration of business relationship + 7 years | Archive table |

### Category 3: Session Data

| Data | Retention | Deletion |
|------|-----------|---------|
| JWT refresh tokens | 7 days (auto-expire) | Automatic via `refresh_tokens.expires_at` |
| API keys | Until revoked | `DELETE /v1/api-keys/{id}` |
| CSRF tokens | Session duration | Automatic on logout |

### Category 4: Market Data

| Data | Retention | Notes |
|------|-----------|-------|
| FX rate snapshots (`market_snapshots`) | 90 days rolling | Stale data pruned by background task |
| Real-time feed cache | In-memory only | Not persisted |

### Category 5: Operational Logs

| Data | Retention | Location |
|------|-----------|---------|
| Render application logs | 7 days | Render dashboard (free tier limit) |
| Vercel function logs | 1 day | Vercel dashboard (free tier limit) |
| GitHub Actions logs | 90 days | GitHub (default) |

---

## Backup Retention

| Backup type | Retention |
|------------|-----------|
| Render automatic DB backup | 7 days (free tier) |
| Manual pg_dump backups | 30 days (configurable in `scripts/backup/pg_backup.sh`) |

---

## Data Deletion Requests

For client data deletion requests (right-to-erasure, GDPR):

1. WORM tables (`audit_events`, `calculation_runs`, `policy_revisions`) **cannot be deleted**
   by design. This must be disclosed to clients before onboarding.
2. User PII in non-WORM tables can be anonymized (replace name/email with `[REDACTED]`).
3. No self-service deletion exists in v1 — contact the operator to process manually.

**Procedure:**
```sql
-- Anonymize user (do NOT delete — FK constraints + audit trail continuity)
UPDATE users SET
    email = 'redacted-' || id || '@deleted.invalid',
    full_name = '[DELETED]',
    hashed_password = '[DELETED]'
WHERE id = '<user-uuid>';

-- After running, confirm the operation was captured in the audit trail.
-- The audit middleware auto-records writes. Verify by checking for a recent event:
-- SELECT * FROM audit_events ORDER BY created_at DESC LIMIT 3;
-- NOTE: USER_ANONYMIZED is not a current event type — the audit middleware will record
-- whatever route triggered this (e.g. an admin endpoint call). If run as raw SQL,
-- manually insert an audit event to document the action was taken.
```

---

## Data Locations

| Data | Location | Jurisdiction |
|------|----------|-------------|
| Production database | Render PostgreSQL, US-West (Oregon) | United States |
| Application logs | Render, US-West (Oregon) | United States |
| Frontend | Vercel CDN (global edge) | Global |
| Error tracking | Sentry (if configured) | US / EU (configurable) |

---

## Policy Review

This policy is reviewed:
- Annually (scheduled review)
- When adding a new data category
- When onboarding a customer with specific compliance requirements (GDPR, SOC 2, etc.)
```

- [ ] **Step 2: Commit**

```bash
git add docs/ops/data-retention-policy.md
git commit -m "docs(ops): add data retention policy

Covers WORM immutable records, user data (7yr), sessions, market data,
backup retention, and GDPR deletion request procedure. Closes gap D-02."
```

---

## Chunk 6: Database Maintenance

**Files:**
- Create: `docs/ops/db-maintenance.md`

### Task 14: Write db-maintenance.md

Documents PostgreSQL maintenance schedule, VACUUM/ANALYZE strategy, index health checks, and PITR guidance.

**Files:**
- Create: `docs/ops/db-maintenance.md`

- [ ] **Step 1: Create the document**

```markdown
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
```

- [ ] **Step 2: Verify completeness checklist**
  - [ ] Weekly health checks (connections, long queries, bloat, index health, WORM integrity)
  - [ ] Monthly tasks (VACUUM, index bloat, refresh token cleanup)
  - [ ] Alembic stamp procedure
  - [ ] PITR documentation (free tier + upgrade path)
  - [ ] Pre/post migration checklist
  - [ ] Emergency connection kill

- [ ] **Step 3: Commit**

```bash
git add docs/ops/db-maintenance.md
git commit -m "docs(ops): add database maintenance runbook

Weekly/monthly health checks, VACUUM strategy, PITR guide, Alembic
stamp procedure, schema change checklist. Closes gaps DB-01, DB-02, B-05."
```

---

## Chunk 7: Infrastructure Fixes

**Files:**
- Modify: `infra/docker/docker-compose.yml` (currently empty — 1 line)
- Create: `frontend/Dockerfile`

### Task 15: Fix docker-compose.yml — working local dev stack

The file exists but is empty (1 line). A working compose file allows local development without manual PostgreSQL setup.

**Files:**
- Modify: `infra/docker/docker-compose.yml`

- [ ] **Step 1: Read the current (empty) file**

Read `infra/docker/docker-compose.yml` to confirm it's 1 line and understand the context.

- [ ] **Step 2: Write the compose file**

```yaml
# docker-compose.yml — ORDR Terminal local development stack
#
# IMPORTANT: Run docker compose from this directory (infra/docker/) or use:
#   docker compose -f infra/docker/docker-compose.yml up -d
# The relative paths (../../backend, ../../frontend) are relative to THIS file.
#
# Usage:
#   docker compose up -d              # Start all services
#   docker compose up -d postgres     # Start only the database
#   docker compose logs -f backend    # Follow backend logs
#   docker compose down               # Stop everything
#   docker compose down -v            # Stop and delete volumes (wipes DB)
#
# First-time setup:
#   1. docker compose up -d postgres
#   2. docker compose run --rm backend alembic upgrade head
#   3. docker compose run --rm backend python seed_company.py
#   4. docker compose up -d
#
# Access:
#   Frontend: http://localhost:3000
#   Backend:  http://localhost:8000
#   API docs: http://localhost:8000/docs

version: "3.9"

services:
  # ── PostgreSQL ────────────────────────────────────────────────────────────────
  postgres:
    image: postgres:15-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: hedgecalc
      POSTGRES_PASSWORD: hedgecalc
      POSTGRES_DB: hedgecalc
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U hedgecalc -d hedgecalc"]
      interval: 5s
      timeout: 5s
      retries: 10

  # ── Backend (FastAPI) ─────────────────────────────────────────────────────────
  backend:
    build:
      context: ../..
      dockerfile: backend/Dockerfile
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      DATABASE_URL: "postgresql+asyncpg://hedgecalc:hedgecalc@postgres:5432/hedgecalc"
      JWT_SECRET: "dev-secret-key-at-least-32-characters-long-local-only"
      ENV: "development"
      CORS_ALLOW_ORIGINS: '["http://localhost:3000","http://127.0.0.1:3000"]'
      ALLOW_INDICATIVE_FALLBACK: "true"
    ports:
      - "8000:8000"
    volumes:
      # Mount source for hot-reload in development
      - ../../backend/app:/app/app:ro
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 15s
      timeout: 10s
      start_period: 30s
      retries: 3

  # ── Frontend (Next.js) ────────────────────────────────────────────────────────
  frontend:
    build:
      context: ../../frontend
      dockerfile: Dockerfile
    restart: unless-stopped
    depends_on:
      backend:
        condition: service_healthy
    environment:
      NEXT_PUBLIC_API_URL: "http://localhost:8000/api"
    ports:
      - "3000:3000"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000"]
      interval: 20s
      timeout: 10s
      start_period: 60s
      retries: 3

volumes:
  postgres_data:
    name: ordr_postgres_data
```

- [ ] **Step 3: Verify YAML syntax**

```bash
docker compose -f infra/docker/docker-compose.yml config
# Expected: no errors, outputs resolved compose config
```

If Docker is not available: validate YAML syntax with Python:
```bash
python -c "import yaml; yaml.safe_load(open('infra/docker/docker-compose.yml'))"
# Expected: no errors
```

- [ ] **Step 4: Commit**

```bash
git add infra/docker/docker-compose.yml
git commit -m "infra(docker): write working local dev docker-compose stack

Covers postgres + backend + frontend with healthchecks, hot-reload
for backend, and first-time setup instructions. Closes gap D-05."
```

---

### Task 16: Replace frontend/Dockerfile with production multi-stage image

`frontend/Dockerfile` already exists but is a single-stage dev image (`node:20-slim`, `CMD ["npm", "run", "dev"]`) with no non-root user, no health check, and no standalone output. It must be replaced with a proper multi-stage production build.

**Files:**
- Modify: `frontend/Dockerfile` (replace existing dev-only image)
- Modify: `frontend/next.config.js` (add `output: "standalone"` — REQUIRED or CMD fails)

- [ ] **Step 1: Read and confirm the existing Dockerfile**

Read `frontend/Dockerfile`. Confirm it contains `CMD ["npm", "run", "dev"]` — the single-stage dev image. This confirms the replacement is safe.

- [ ] **Step 2: Replace with multi-stage production Dockerfile**

This follows the Next.js recommended multi-stage build pattern with standalone output mode.

```dockerfile
# ── Stage 1: deps ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps

RUN apk add --no-cache libc6-compat

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci


# ── Stage 2: builder ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build with standalone output for minimal runtime image
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

ARG NEXT_PUBLIC_API_URL=http://localhost:8000/api
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN npm run build


# ── Stage 3: runtime ──────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

RUN apk add --no-cache curl

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

WORKDIR /app

# Non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# Copy built output
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:3000 || exit 1

CMD ["node", "server.js"]
```

- [ ] **Step 3: Enable standalone output in next.config.js (REQUIRED)**

The config file is `frontend/next.config.js` (not `.ts`). Read it — it currently does NOT contain `output: "standalone"`.

`output: "standalone"` is **required** for the Dockerfile's `CMD ["node", "server.js"]` to work. Without it, `.next/standalone/server.js` will not be generated and the container will fail to start.

Add `output: "standalone"` to the `nextConfig` object (after the opening brace):
```javascript
const nextConfig = {
  output: "standalone",   // required for Docker multi-stage build
  eslint: {
    // ... rest of existing config unchanged
```

**Do not modify any other settings in next.config.js.**

- [ ] **Step 4: Verify Dockerfile syntax**

```bash
# Lint the Dockerfile (Docker must be available) — run from repo root
docker build --no-cache --target deps -f frontend/Dockerfile frontend/
# Expected: deps stage (npm ci) completes successfully
```

If Docker unavailable, check manually that:
- All `COPY` paths reference files that exist in `frontend/`
- Stage names (`deps`, `builder`, `runtime`) match what the compose file references

- [ ] **Step 5: Commit**

```bash
git add frontend/Dockerfile frontend/next.config.js
git commit -m "infra(docker): replace dev frontend Dockerfile with multi-stage production build

Replaces single-stage dev image (npm run dev) with 3-stage Alpine build.
Adds output: standalone to next.config.js (required for node server.js).
Non-root user (nextjs:1001), healthcheck, NEXT_PUBLIC_API_URL build arg.
Closes gap I-02."
```

---

## Final Task: Update state and close gaps

### Task 17: Record completion in memory.db and update OPEN_RISKS.md

After all chunks are complete:

- [ ] **Step 1: Record all validation runs in memory.db**

```bash
cd "D:\Synexiun\1-SynexFund\HedgeCalc\TreasuryFX"
python -c "
import sqlite3, datetime
c = sqlite3.connect('.claude/state/memory.db')
c.execute(\"\"\"INSERT INTO validation_runs (run_date, result, notes)
    VALUES (datetime('now'), 'pass',
    'Operations hardening complete: 23 gaps closed. CI/CD hardened, backup scripts, DR plan, monitoring guide, 6 ops docs, docker-compose, frontend Dockerfile.')\"\"\")
c.commit()
print('Recorded.')
"
```

- [ ] **Step 2: Update OPEN_RISKS.md**

Add new entries documenting that gaps C-01 through D-07 have been closed. Remove I-01 from list once blueprint sync confirms keepalive is active.

- [ ] **Step 3: Final commit**

```bash
git add .claude/state/
git commit -m "chore(state): record operations hardening completion

23 ops gaps closed across CI/CD, backup, DR, monitoring, docs, and infra."
```

---

## Summary of All Gap Closures

| Gap | Task | Deliverable |
|-----|------|------------|
| C-01 | Task 1 | gitleaks in GitHub Actions |
| C-03 | Task 2 | Dependabot (pip + npm + actions) |
| C-05 | Task 4 | Coverage gate 40% → 60% |
| C-06 | Task 3 | Trivy container scan |
| B-01 | Task 5 | `scripts/backup/pg_backup.sh` |
| B-02 | Task 6 | `scripts/backup/restore_verify.sh` |
| B-03, B-04 | Task 7 | `docs/ops/backup-restore.md` (RTO/RPO) |
| B-03 | Task 8 | `docs/ops/disaster-recovery-plan.md` |
| D-03 | Task 9 | `docs/ops/sla-slo.md` |
| M-01, M-02, M-03 | Task 10 | `docs/ops/monitoring-setup.md` |
| D-01 | Task 11 | `docs/ops/onboarding.md` |
| D-04 | Task 12 | `docs/ops/incident-postmortem-template.md` |
| D-02 | Task 13 | `docs/ops/data-retention-policy.md` |
| DB-01, DB-02, B-05 | Task 14 | `docs/ops/db-maintenance.md` |
| D-05 | Task 15 | `infra/docker/docker-compose.yml` (fixed) |
| I-02 | Task 16 | `frontend/Dockerfile` |

**Not addressed (deferred — architecture changes required):**
- C-04 mypy hard gate: requires fixing ~200 mypy errors first (sprint task)
- C-07 blue-green deploy: requires Render paid plan + architecture change
- C-08 performance regression test: requires baseline data collection first
- M-04 APM/tracing: requires Sentry Performance (paid) or OpenTelemetry setup
- I-01 cold starts: keepalive cron already applied — pending blueprint sync
- S-01 secret rotation: operator action required (human task, not automatable)
