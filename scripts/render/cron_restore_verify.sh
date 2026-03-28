#!/usr/bin/env bash
# cron_restore_verify.sh — Monthly restore integrity check
#
# Render injects: B2_ACCOUNT_ID, B2_APP_KEY, B2_BUCKET, VERIFY_DB_URL, SENTRY_DSN
#
# What it does:
#   1. Downloads the most recent backup from B2
#   2. Runs restore_verify.sh against a temporary verify database
#   3. Reports PASS or FAIL; alerts Sentry on failure

set -euo pipefail

B2_ACCOUNT_ID="${B2_ACCOUNT_ID:?ERROR: B2_ACCOUNT_ID required}"
B2_APP_KEY="${B2_APP_KEY:?ERROR: B2_APP_KEY required}"
B2_BUCKET="${B2_BUCKET:?ERROR: B2_BUCKET required}"
VERIFY_DB_URL="${VERIFY_DB_URL:?ERROR: VERIFY_DB_URL required}"
B2_ENDPOINT="${B2_ENDPOINT:-https://s3.us-west-004.backblazeb2.com}"

export PATH="/usr/lib/postgresql/14/bin:/usr/lib/postgresql/15/bin:$PATH"

if ! command -v rclone &>/dev/null; then
    curl -fsSL https://rclone.org/install.sh | bash
fi

RESTORE_DIR="/tmp/restore_verify"
mkdir -p "$RESTORE_DIR"

export RCLONE_S3_PROVIDER=Other
export RCLONE_S3_ENV_AUTH=false
export RCLONE_S3_ACCESS_KEY_ID="$B2_ACCOUNT_ID"
export RCLONE_S3_SECRET_ACCESS_KEY="$B2_APP_KEY"
export RCLONE_S3_ENDPOINT="$B2_ENDPOINT"

echo "[restore_verify] Listing most recent backup in B2..."
LATEST=$(rclone lsf ":s3:${B2_BUCKET}/db-backups/" --format "tp" | sort -t';' -k1 | tail -1 | cut -d';' -f2 || true)

if [ -z "$LATEST" ]; then
    echo "[restore_verify] FAIL: no backup found in B2 bucket $B2_BUCKET" >&2
    exit 1
fi

echo "[restore_verify] Downloading: $LATEST"
rclone copyto ":s3:${B2_BUCKET}/db-backups/${LATEST}" "${RESTORE_DIR}/${LATEST}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DUMP_FILE="${RESTORE_DIR}/${LATEST}" VERIFY_DB_URL="$VERIFY_DB_URL" \
    bash "${SCRIPT_DIR}/../backup/restore_verify.sh"
