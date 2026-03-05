#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# ORDR Terminal — Git History Secret Scrub
#
# Removes known-exposed secrets from ALL git history using git-filter-repo.
# WARNING: This rewrites history. All collaborators must re-clone after.
#
# Prerequisites:
#   1. pip install git-filter-repo
#   2. ALL secrets already rotated (assume compromised before running)
#   3. Team notified — all open PRs will need rebasing after force-push
#
# Usage:
#   ./scripts/scrub-git-secrets.sh [--dry-run]
# ============================================================================

DRY_RUN=false
if [[ "${1:-}" == "--dry-run" ]]; then
    DRY_RUN=true
    echo "=== DRY RUN MODE — no changes will be made ==="
fi

# ── Prerequisites ─────────────────────────────────────────────────────────────
if ! command -v git-filter-repo &> /dev/null; then
    echo "ERROR: git-filter-repo not found. Install with: pip install git-filter-repo"
    exit 1
fi

if [[ ! -d ".git" ]]; then
    echo "ERROR: Must be run from the repository root (no .git directory found)"
    exit 1
fi

# ── Build replacement patterns file ──────────────────────────────────────────
PATTERNS_FILE=$(mktemp)
trap "rm -f $PATTERNS_FILE" EXIT

# INSTRUCTIONS:
# Uncomment and fill in the actual secret values before running.
# Format: ACTUAL_SECRET_VALUE==>***REDACTED_LABEL***
# Each line replaces all occurrences of the left side with the right side.
cat > "$PATTERNS_FILE" << 'PATTERNS'
# ─────────────────────────────────────────────────────────────────────────────
# EDIT THIS FILE before running: replace placeholders with actual secret values
# ─────────────────────────────────────────────────────────────────────────────

# OpenAI API key (if exposed) — replace with actual key value:
# sk-proj-REPLACE_WITH_ACTUAL_KEY==>***REDACTED_OPENAI_KEY***

# JWT dev secret (if committed to tracked files):
# ***REDACTED_JWT_SECRET***==>***REDACTED_JWT_DEV_SECRET***

# DB password (if committed):
# ***REDACTED_DB_PASSWORD***==>***REDACTED_DB_PASSWORD***

# Anthropic API key (if exposed):
# sk-ant-REPLACE_WITH_ACTUAL_KEY==>***REDACTED_ANTHROPIC_KEY***
PATTERNS

echo ""
echo "────────────────────────────────────────────────────────────"
echo "  BEFORE RUNNING THIS SCRIPT:"
echo "  1. Rotate ALL exposed secrets on the external platforms"
echo "  2. Edit this script and uncomment/fill the PATTERNS section"
echo "     with actual secret values to scrub"
echo "  3. Run with --dry-run first to verify"
echo "  4. Run without --dry-run only after team is notified"
echo "────────────────────────────────────────────────────────────"
echo ""

# Check if any patterns are actually uncommented (ready to run)
ACTIVE_PATTERNS=$(grep -v '^#' "$PATTERNS_FILE" | grep -v '^$' | wc -l)
if [[ "$ACTIVE_PATTERNS" -eq 0 ]]; then
    echo "WARNING: No active patterns found in patterns file."
    echo "         Edit this script and uncomment the secret values to scrub."
    if [[ "$DRY_RUN" == false ]]; then
        echo "         Aborting — nothing to scrub."
        exit 0
    fi
fi

if [[ "$DRY_RUN" == true ]]; then
    echo "DRY RUN: Would run: git filter-repo --replace-text <patterns>"
    echo ""
    echo "Active patterns:"
    grep -v '^#' "$PATTERNS_FILE" | grep -v '^$' || echo "  (none — add patterns above)"
    exit 0
fi

# ── Final confirmation ────────────────────────────────────────────────────────
echo "Active patterns to scrub:"
grep -v '^#' "$PATTERNS_FILE" | grep -v '^$'
echo ""
echo "This will PERMANENTLY REWRITE all git history."
echo "Ensure you have a backup and all collaborators are notified."
echo ""
read -rp "Type 'SCRUB' to proceed: " CONFIRM
if [[ "$CONFIRM" != "SCRUB" ]]; then
    echo "Aborted."
    exit 1
fi

# ── Execute scrub ─────────────────────────────────────────────────────────────
echo "Running git filter-repo..."
git filter-repo --replace-text "$PATTERNS_FILE" --force

echo ""
echo "════════════════════════════════════════════════════════════"
echo "  SCRUB COMPLETE"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "Post-scrub checklist:"
echo "  [ ] Verify clean: git log --all -S 'sk-proj-' --oneline"
echo "  [ ] Verify clean: git log --all -S 'dev_secret_key' --oneline"
echo "  [ ] Force push:   git push origin --force --all"
echo "  [ ] Force push:   git push origin --force --tags"
echo "  [ ] Notify team:  git fetch --all && git reset --hard origin/master"
echo "  [ ] GitHub:       Contact support to purge cached commit views"
echo "  [ ] Verify:       New secrets deployed and working on Render + Vercel"
echo ""
