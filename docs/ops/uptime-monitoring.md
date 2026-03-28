# Uptime Monitoring Runbook

## Production Monitor
- Tool: BetterUptime
- Endpoint: https://hedgecore.onrender.com/api/health
- Frequency: every 3 minutes
- Alert channels: ops email, #ordr-alerts Slack
- Public status page: https://status.ordr-terminal.com (configure CNAME in DNS)

## Preview Monitor
- Endpoint: https://hedgecore-preview.onrender.com/api/health
- Frequency: every 5 minutes
- Alert channels: ops email only

## Health Check Endpoint

`GET /api/health` returns:
- `200 OK` with `{"status": "ok", ...}` when service is healthy
- Non-200 if database is unreachable or app is in error state

## Setup (Manual Steps)

### BetterUptime Production Monitor
1. Go to https://betteruptime.com → New Monitor
2. Monitor type: HTTPS
3. URL: `https://hedgecore.onrender.com/api/health`
4. Check frequency: every 3 minutes
5. Alert contacts: ops email + Slack webhook (configure in BetterUptime integrations)
6. Expected status: 200
7. Timeout: 10s
8. Enable: Public Status Page

### BetterUptime Preview Monitor
1. URL: `https://hedgecore-preview.onrender.com/api/health`
2. Check frequency: every 5 minutes
3. Alert contacts: ops email only (no Slack for preview)
4. Status page: private (not public-facing)

### Slack Integration
1. BetterUptime → Integrations → Slack
2. Connect to `#ordr-alerts` Slack channel (create if not present)
3. Enable alerts for: service down, service recovered, SSL expiry warning

## Escalation Policy

1. Alert fires → ops email + Slack notification (immediate)
2. If unacknowledged after 10 minutes → phone call escalation (configure in BetterUptime on-call)
3. Rollback procedure: Render dashboard → Deployments → select previous commit → redeploy

## SSL Certificate Monitoring

BetterUptime auto-monitors SSL expiry. Alert fires 30 days before expiry.
Render auto-renews Let's Encrypt certs; this alert should never fire unless a custom domain cert expires.

## Status Page

Configure public status page at https://status.ordr-terminal.com:
1. BetterUptime → Status Pages → New Status Page
2. Add production monitor to status page
3. Configure CNAME: `status.ordr-terminal.com` → BetterUptime provided CNAME target
4. Share URL with institutional clients on onboarding
