#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# deploy-all.sh  —  Trigger Render deploys via REST API
# Paste and run in: Render Dashboard → your service → Shell
#
# USAGE:
#   export RENDER_API_KEY="rnd_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
#   bash deploy-all.sh
#
# OPTIONAL — skip auto-discovery and supply IDs directly:
#   export RENDER_API_SERVICE_ID="srv_xxxx"        # hedgecore (prod)
#   export RENDER_API_PREVIEW_SERVICE_ID="srv_xxxx" # hedgecore-preview
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

API="https://api.render.com/v1"

# ── Require API key ──────────────────────────────────────────────────────────
if [[ -z "${RENDER_API_KEY:-}" ]]; then
  echo "ERROR: RENDER_API_KEY is not set."
  echo "  export RENDER_API_KEY=\"rnd_...\""
  exit 1
fi

HDR_AUTH="Authorization: Bearer ${RENDER_API_KEY}"
HDR_JSON="Content-Type: application/json"
HDR_ACCEPT="Accept: application/json"

# ── Helper: call Render API ──────────────────────────────────────────────────
render_get()  { curl -fsSL -H "$HDR_AUTH" -H "$HDR_ACCEPT" "$API$1"; }
render_post() { curl -fsSL -X POST -H "$HDR_AUTH" -H "$HDR_JSON" -H "$HDR_ACCEPT" -d "$2" "$API$1"; }

# ── Discover service IDs if not provided ─────────────────────────────────────
if [[ -z "${RENDER_API_SERVICE_ID:-}" ]] || [[ -z "${RENDER_API_PREVIEW_SERVICE_ID:-}" ]]; then
  echo "[*] Discovering services..."
  SERVICES=$(render_get "/services?limit=20")

  # Extract service IDs by name using grep + sed (no jq required)
  PROD_ID=$(echo "$SERVICES" \
    | grep -o '"id":"srv[^"]*","name":"hedgecore"' \
    | grep -o '"id":"[^"]*"' \
    | sed 's/"id":"//;s/"//')

  PREVIEW_ID=$(echo "$SERVICES" \
    | grep -o '"id":"srv[^"]*","name":"hedgecore-preview"' \
    | grep -o '"id":"[^"]*"' \
    | sed 's/"id":"//;s/"//')

  # Fallback: try flat array format
  if [[ -z "$PROD_ID" ]]; then
    PROD_ID=$(echo "$SERVICES" \
      | tr ',' '\n' \
      | grep -A2 '"hedgecore"' \
      | grep '"id"' \
      | head -1 \
      | sed 's/.*"id":"\([^"]*\)".*/\1/')
  fi
  if [[ -z "$PREVIEW_ID" ]]; then
    PREVIEW_ID=$(echo "$SERVICES" \
      | tr ',' '\n' \
      | grep -A2 '"hedgecore-preview"' \
      | grep '"id"' \
      | head -1 \
      | sed 's/.*"id":"\([^"]*\)".*/\1/')
  fi
else
  PROD_ID="${RENDER_API_SERVICE_ID}"
  PREVIEW_ID="${RENDER_API_PREVIEW_SERVICE_ID}"
fi

# ── Print discovered IDs ─────────────────────────────────────────────────────
echo ""
echo "  hedgecore         → ${PROD_ID:-NOT FOUND}"
echo "  hedgecore-preview → ${PREVIEW_ID:-NOT FOUND}"
echo ""

# ── Trigger production deploy ────────────────────────────────────────────────
if [[ -n "$PROD_ID" ]]; then
  echo "[*] Triggering hedgecore (production) deploy..."
  RESULT=$(render_post "/services/${PROD_ID}/deploys" '{"clearCache":"do_not_clear"}')
  DEPLOY_ID=$(echo "$RESULT" | grep -o '"id":"dep[^"]*"' | head -1 | sed 's/"id":"//;s/"//')
  echo "    Deploy ID : ${DEPLOY_ID:-unknown}"
  echo "    Dashboard : https://dashboard.render.com/web/${PROD_ID}/deploys/${DEPLOY_ID}"
else
  echo "[!] hedgecore not found — skipping production deploy"
fi

echo ""

# ── Trigger preview deploy ───────────────────────────────────────────────────
if [[ -n "$PREVIEW_ID" ]]; then
  echo "[*] Triggering hedgecore-preview deploy..."
  RESULT=$(render_post "/services/${PREVIEW_ID}/deploys" '{"clearCache":"do_not_clear"}')
  DEPLOY_ID=$(echo "$RESULT" | grep -o '"id":"dep[^"]*"' | head -1 | sed 's/"id":"//;s/"//')
  echo "    Deploy ID : ${DEPLOY_ID:-unknown}"
  echo "    Dashboard : https://dashboard.render.com/web/${PREVIEW_ID}/deploys/${DEPLOY_ID}"
else
  echo "[!] hedgecore-preview not found — skipping preview deploy"
fi

echo ""
echo "[+] Done. Both deploys triggered. Check dashboard links above for status."
echo "    Production health: https://hedgecore.onrender.com/health"
