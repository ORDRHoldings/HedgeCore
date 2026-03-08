# Render Deployment — Automation Runbook

**Last updated:** 2026-03-07
**Services:** hedgecore (prod) · hedgecore-preview (dev) on Render.com
**Frontend:** Vercel (auto-deploy via git push — not covered here)

---

## What Was Added

| File | Purpose |
|------|---------|
| `render.yaml` | Blueprint — updated with buildFilter, Python 3.12, FINNHUB_API_KEY, /health path |
| `scripts/render/env-check.ps1` | Validate required env vars before running any script |
| `scripts/render/list-services.ps1` | List all Render services + emit service ID copy-paste block |
| `scripts/render/validate.ps1` | Structural validation of render.yaml + live API confirmation |
| `scripts/render/deploy-api.ps1` | Trigger manual deploy of `hedgecore` (production) |
| `scripts/render/deploy-web.ps1` | Deploy `hedgecore-preview` or show frontend (Vercel) instructions |
| `scripts/render/blueprint-sync.ps1` | Inspect and manually trigger blueprint sync |
| `.env.example` | Updated with RENDER_API_KEY, RENDER_API_SERVICE_ID, RENDER_PREVIEW_SERVICE_ID |

---

## About the Render CLI

> **Important:** Render.com does not publish an npm CLI package. The `render` npm
> package (`render-cli@0.3.2`) is an unrelated HTML template tool — do not use it.

All automation in this repo uses the **Render REST API** (`api.render.com/v1`)
directly via PowerShell `Invoke-RestMethod`. This is:
- More reliable than a third-party CLI wrapper
- Works without any additional installation
- Fully scriptable and machine-readable
- Identical to what a CLI tool would invoke internally

**Optional: Official Render CLI binary** (separate download, Go binary):
```powershell
# Windows — download from GitHub releases:
# https://github.com/render-oss/render-cli/releases
# Then add to PATH and call: render services list
```

---

## Required Environment Variables

Set these before running any script. Never commit real values to git.

```powershell
# Render API key — from: Render dashboard → Account Settings → API Keys
$env:RENDER_API_KEY = "rnd_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

# Production backend service ID (hedgecore, master branch)
$env:RENDER_API_SERVICE_ID = "srv_xxxxxxxxxxxxxxxx"

# Preview backend service ID (hedgecore-preview, dev branch)
$env:RENDER_PREVIEW_SERVICE_ID = "srv_xxxxxxxxxxxxxxxx"

# Optional — for blueprint sync scripts
$env:RENDER_OWNER_ID = "usr_xxxxxxxxxxxxxxxx"

# Optional — set to "json" for machine-readable list-services output
$env:RENDER_OUTPUT = "json"
```

Copy `.env.example` to `.env` and fill in. The scripts read from environment
variables only — they never touch `.env` directly.

### Finding Service IDs

```powershell
$env:RENDER_API_KEY = "rnd_..."
.\scripts\render\list-services.ps1 -Filter "hedgecore"
# Prints service IDs with copy-paste env var suggestions
```

---

## Installation / First-Time Setup

No CLI installation required. Prerequisites:
- PowerShell 7+ (`pwsh --version`)
- Network access to `api.render.com`
- Valid `RENDER_API_KEY`

Verify setup:
```powershell
.\scripts\render\env-check.ps1
```

---

## How to Validate render.yaml

Run before every deploy when render.yaml was modified:

```powershell
# Set API key first
$env:RENDER_API_KEY = "rnd_..."

# Validate — structural check + live API confirmation
.\scripts\render\validate.ps1

# Skip liveness ping (faster, offline-safe)
.\scripts\render\validate.ps1 -SkipLiveness
```

The validator checks:
1. render.yaml exists and is parseable
2. Required blocks present (services, databases, healthCheckPath, buildFilter)
3. Python 3.12 declared
4. No hardcoded secrets
5. Named services exist in Render (via API)
6. Production /health endpoint responds (optional)

---

## How to Deploy Each Service

### Production backend (hedgecore, master branch)

```powershell
# Trigger deploy — returns immediately
.\scripts\render\deploy-api.ps1

# Trigger and wait for completion (~5-10 min on free tier)
.\scripts\render\deploy-api.ps1 -Wait

# Force clean build (clears pip cache)
.\scripts\render\deploy-api.ps1 -ClearCache -Wait
```

### Preview backend (hedgecore-preview, dev branch)

```powershell
# Trigger preview deploy
.\scripts\render\deploy-web.ps1 -Target api-preview

# Wait for completion
.\scripts\render\deploy-web.ps1 -Target api-preview -Wait
```

### Frontend (Vercel — automatic)

```powershell
# Show Vercel deployment info
.\scripts\render\deploy-web.ps1 -Target frontend

# Manual Vercel deploy (requires Vercel CLI: npm install -g vercel)
.\scripts\render\deploy-web.ps1 -Target vercel
```

**The frontend deploys automatically on every git push to master/dev.**
No manual action required unless forcing a redeploy without a code change.

---

## Via npm scripts (from frontend/ directory)

```bash
npm run render:env-check      # Validate env vars
npm run render:services       # List services + IDs
npm run render:validate       # Validate render.yaml
npm run render:deploy:api     # Deploy production backend
npm run render:deploy:preview # Deploy preview backend
```

---

## Claude Automation Protocol

This section defines how Claude should use these scripts in future sessions.

### Decision flow

```
render.yaml modified?
  └─ YES → run validate.ps1
            └─ PASSES → deploy affected service
            └─ FAILS  → fix issues, re-validate before deploying

Service IDs unknown?
  └─ YES → run list-services.ps1
            └─ Set RENDER_API_SERVICE_ID and RENDER_PREVIEW_SERVICE_ID
            └─ Then proceed with deploy

Changed branch?
  master → deploy-api.ps1       (production hedgecore)
  dev    → deploy-web.ps1 -Target api-preview  (preview)
```

### Script naming contract (stable — do not rename)

| Script | Action |
|--------|--------|
| `env-check.ps1` | Prerequisite check — always run first |
| `list-services.ps1` | Discovery — when service IDs are unknown |
| `validate.ps1` | Gate — after render.yaml changes |
| `deploy-api.ps1` | Action — deploy production backend |
| `deploy-web.ps1` | Action — deploy preview or frontend info |
| `blueprint-sync.ps1` | Maintenance — after structural render.yaml changes |

### Safe deploy sequence

```powershell
# 1. Check environment
.\scripts\render\env-check.ps1 -RequireServiceIds

# 2. Validate blueprint (if render.yaml changed)
.\scripts\render\validate.ps1

# 3. Deploy
.\scripts\render\deploy-api.ps1 -Wait

# 4. Verify health
curl https://hedgecore.onrender.com/api/health
```

---

## Blueprint Sync (render.yaml changes)

Render auto-syncs when you push to the connected branch. For manual sync
or to inspect blueprint state:

```powershell
# Dry run — shows what would be synced
.\scripts\render\blueprint-sync.ps1 -DryRun

# Check sync state via API
$env:RENDER_OWNER_ID = "usr_..."
.\scripts\render\blueprint-sync.ps1
```

If blueprint sync fails via API (Render plan restriction):
```bash
# Trigger via empty commit
git commit --allow-empty -m "chore: trigger render blueprint sync"
git push origin master
```

---

## Known Limitations / Assumptions

| Item | Detail |
|------|--------|
| Free tier cold starts | Production service may sleep after 15min inactivity. First request takes 30-60s. |
| Blueprint sync API | Available on paid Render plans. Free tier may reject the API call — use git push instead. |
| Deploy status polling | Free tier deploys take 5-15 minutes. Use `-Wait` with patience. |
| Frontend on Vercel | Not managed by Render scripts. Deploys automatically on push. Use Vercel dashboard for manual redeploy. |
| No Render CLI binary | Official Render Go CLI available at github.com/render-oss/render-cli — not installed in this project. REST API used instead. |
| FINNHUB_API_KEY | Added to render.yaml env group reference. Must be present in `hedgecore-secrets` Render env group. |
| healthCheckPath | `/api/health` — matches the actual FastAPI route in main.py. Verify with: `curl https://hedgecore.onrender.com/api/health` |

---

## Health Check Reference

```bash
# Production
curl https://hedgecore.onrender.com/api/health

# Expected response
{"status": "ok", "env": "production", ...}

# Preview (if dev branch deployed)
curl https://hedgecore-preview.onrender.com/health
```
