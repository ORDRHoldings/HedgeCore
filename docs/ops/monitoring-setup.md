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

> **Warning:** This section requires real code changes to the backend. These are not architectural changes and do not touch frozen files, but they must go through normal CI (ruff lint, pytest).

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
