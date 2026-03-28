#!/usr/bin/env bash
# cron_backup.sh — Render cron job entry point for daily PostgreSQL backup
#
# Render injects: DATABASE_URL, B2_ACCOUNT_ID, B2_APP_KEY, B2_BUCKET, SENTRY_DSN
# via environment variables configured in the service's env group.

set -euo pipefail

# Ensure pg_dump is in PATH (Render Ubuntu images have PostgreSQL client tools)
export PATH="/usr/lib/postgresql/14/bin:/usr/lib/postgresql/15/bin:$PATH"

# Install rclone if not present (Render cron containers are ephemeral)
if ! command -v rclone &>/dev/null; then
    echo "[cron_backup] Installing rclone..."
    curl -fsSL https://rclone.org/install.sh | bash
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
bash "${SCRIPT_DIR}/../backup/backup_and_upload.sh"
