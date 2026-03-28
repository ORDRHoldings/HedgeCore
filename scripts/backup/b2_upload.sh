#!/usr/bin/env bash
# b2_upload.sh — Upload a backup file to Backblaze B2 via rclone S3-compatible API
#
# Required environment variables:
#   B2_ACCOUNT_ID      — Backblaze B2 Application Key ID
#   B2_APP_KEY         — Backblaze B2 Application Key (secret)
#   B2_BUCKET          — Target bucket name (e.g. ordr-backups)
#   BACKUP_FILE        — Local path to the .dump file to upload
#
# Exit codes:
#   0  Success
#   1  Missing required env var
#   2  rclone not installed
#   3  Upload failed

set -euo pipefail

B2_ACCOUNT_ID="${B2_ACCOUNT_ID:?ERROR: B2_ACCOUNT_ID is required}"
B2_APP_KEY="${B2_APP_KEY:?ERROR: B2_APP_KEY is required}"
B2_BUCKET="${B2_BUCKET:?ERROR: B2_BUCKET is required}"
BACKUP_FILE="${BACKUP_FILE:?ERROR: BACKUP_FILE is required}"

if ! command -v rclone &>/dev/null; then
    echo "[b2_upload] ERROR: rclone is not installed. Install with: curl https://rclone.org/install.sh | bash" >&2
    exit 2
fi

FILENAME=$(basename "$BACKUP_FILE")
B2_ENDPOINT="${B2_ENDPOINT:-https://s3.us-west-004.backblazeb2.com}"

echo "[b2_upload] Uploading $FILENAME to B2 bucket: $B2_BUCKET"

# Configure rclone env-based remote (no config file required)
export RCLONE_S3_PROVIDER=Other
export RCLONE_S3_ENV_AUTH=false
export RCLONE_S3_ACCESS_KEY_ID="$B2_ACCOUNT_ID"
export RCLONE_S3_SECRET_ACCESS_KEY="$B2_APP_KEY"
export RCLONE_S3_ENDPOINT="$B2_ENDPOINT"
export RCLONE_S3_ACL=private

if ! rclone copyto "$BACKUP_FILE" ":s3:${B2_BUCKET}/db-backups/${FILENAME}" --progress; then
    echo "[b2_upload] ERROR: Upload to B2 failed" >&2
    exit 3
fi

echo "[b2_upload] SUCCESS: $FILENAME uploaded to B2://${B2_BUCKET}/db-backups/"
