#!/usr/bin/env bash
# backup_and_upload.sh — Orchestrate: backup PostgreSQL + upload to B2 + alert on failure
#
# Required environment variables:
#   DATABASE_URL       — PostgreSQL connection string (injected by Render)
#   B2_ACCOUNT_ID      — Backblaze B2 key ID
#   B2_APP_KEY         — Backblaze B2 secret key
#   B2_BUCKET          — B2 bucket name
#
# Optional:
#   BACKUP_DIR         — Where to write the dump (default: /tmp/backups)
#   SENTRY_DSN         — If set, curl a Sentry error alert on failure
#   RETAIN_DAYS        — Days to retain local copies (default: 7)
#
# Exit codes:
#   0  Full success (backup + upload)
#   1  Backup step failed
#   2  Upload step failed (backup succeeded but not offloaded)

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/tmp/backups}"
RETAIN_DAYS="${RETAIN_DAYS:-7}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

_alert_sentry() {
    local message="$1"
    local dsn="${SENTRY_DSN:-}"
    if [ -z "$dsn" ]; then return; fi
    local host
    host=$(echo "$dsn" | sed 's|https://[^@]*@\([^/]*\)/.*|\1|')
    local project_id
    project_id=$(echo "$dsn" | sed 's|.*/\([0-9]*\)$|\1|')
    local public_key
    public_key=$(echo "$dsn" | sed 's|https://\([^@]*\)@.*|\1|')
    curl -s -X POST "https://${host}/api/${project_id}/store/" \
        -H "Content-Type: application/json" \
        -H "X-Sentry-Auth: Sentry sentry_version=7, sentry_key=${public_key}" \
        -d "{\"message\": \"ORDR Backup Failure: ${message}\", \"level\": \"error\", \"logger\": \"backup\"}" \
        || true
}

echo "[orchestrator] Backup + B2 upload started at $(date -u +%Y-%m-%dT%H:%M:%SZ)"

# Step 1: PostgreSQL dump
if ! BACKUP_DIR="$BACKUP_DIR" RETAIN_DAYS="$RETAIN_DAYS" bash "${SCRIPT_DIR}/pg_backup.sh"; then
    echo "[orchestrator] FAIL: pg_backup.sh failed" >&2
    _alert_sentry "pg_backup.sh failed — database backup did not complete"
    exit 1
fi

# Find the most recent dump file
LATEST_DUMP=$(find "$BACKUP_DIR" -name "hedgecore_*.dump" | sort | tail -1)

if [ -z "$LATEST_DUMP" ]; then
    echo "[orchestrator] FAIL: no dump file found after backup" >&2
    _alert_sentry "pg_backup.sh completed but no dump file found"
    exit 1
fi

# Step 2: Upload to B2
if ! BACKUP_FILE="$LATEST_DUMP" bash "${SCRIPT_DIR}/b2_upload.sh"; then
    echo "[orchestrator] FAIL: B2 upload failed for $LATEST_DUMP" >&2
    _alert_sentry "B2 upload failed for $(basename "$LATEST_DUMP") — backup not offsite"
    exit 2
fi

echo "[orchestrator] SUCCESS: backup complete and uploaded to B2"
