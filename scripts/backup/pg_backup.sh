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
