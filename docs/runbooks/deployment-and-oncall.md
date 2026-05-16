# Deployment & On-Call Runbook

**Scope:** Day-to-day deployment, health monitoring, rollback, and incident response for ORDR TreasuryFX.

## Surfaces

| Component | Location | Health URL | Auto-deploy |
|---|---|---|---|
| Backend (prod) | Render — `hedgecore` | <https://hedgecore.onrender.com/health> | Yes — on push to `master` |
| Backend (preview) | Render — `hedgecore-preview` | <https://hedgecore-preview.onrender.com/health> | Yes — on push to `dev` |
| Frontend (prod) | Vercel — `ordr-terminal` | <https://ordr-terminal.vercel.app/> | Yes — on push to `master` |
| Frontend (alt prod) | Vercel — `hedgecore` | <https://hedgecore.vercel.app/> | Yes — on push to `master` |
| Database (prod) | Render Postgres — `hedge` | (Render dashboard) | n/a |

## Standard deploy flow

1. Branch from `master`: `git checkout -b feat/foo`.
2. Make changes. CI runs on push (ruff, mypy, pytest with `--cov-fail-under=70`, frontend tsc + build, freeze check, gitleaks, Docker build + Trivy scan).
3. PR. **Pre-merge checklist** in `.claude/rules/releases.md`:
   - [ ] All CI green
   - [ ] No frozen-file edits without an ADR (governance job in CI enforces)
   - [ ] No new secrets (gitleaks job)
   - [ ] CHANGELOG_AI.md updated
4. Merge to `master`. Render and Vercel auto-deploy. Watch:
   - Render: <https://dashboard.render.com> → `hedgecore` → Events
   - Vercel: <https://vercel.com/ordr/ordr-terminal> → Deployments
5. Post-deploy smoke (Claude can run this autonomously after deploy completes):
   ```sh
   curl -sf https://hedgecore.onrender.com/health
   curl -sf https://ordr-terminal.vercel.app/
   ```
6. Update `.claude/state/CURRENT_STATE.md` (or invoke `historian` agent).

## Health checks

| URL | Expected | Latency budget |
|---|---|---|
| `/health` | `{"status":"ok",...}` 200 | <200ms |
| `/api/v1/public-chart-data/usdjpy` | 200 with `points` array | <1s |
| `/api/auth/me` (with valid token) | 200 with user object | <500ms |
| Frontend `/` | 200, HTML | <2s |
| Frontend `/auth/login` | 200, HTML, login form | <2s |

A 5xx or timeout on any of these for >2 consecutive minutes = page on-call.

## Alerts (target state — most not yet wired)

| Signal | Trigger | Owner | Channel |
|---|---|---|---|
| Backend 5xx rate | >1% over 5min | Sentry | `#alerts-backend` (TO WIRE) |
| Backend p95 latency | >2s over 5min | Sentry | `#alerts-backend` (TO WIRE) |
| Frontend client errors | >5/min | Sentry | `#alerts-frontend` (TO WIRE) |
| DB connection failures | any in prod | Render | Render notifications (configure) |
| Hash chain break | any | App-level cron | `#alerts-security` — fires on chain verification job (`backend/app/jobs/verify_hash_chain.py`) |
| Gitleaks finding | any | GitHub Actions | PR check fails; surface in `#alerts-security` |

> **Note:** Slack channel routing is configured per-tenant via the `webhook_endpoints` table (see sub-project B, 2026-04-27). Ops alerts use a separate platform-level webhook; this is **not yet configured**. File before go-live.

## Rollback procedures

### Backend (Render)

1. Render dashboard → `hedgecore` → Deploys.
2. Find prior successful deploy (green check).
3. Click → "Redeploy".
4. Watch logs. Health URL should return 200 within 60s.
5. If rollback fails: contact Render support; meanwhile keep traffic on whatever version is up.

### Frontend (Vercel)

```sh
vercel ls --prod  # list prod deploys
vercel promote https://ordr-terminal-<sha>.vercel.app
```

Or via Vercel dashboard → Deployments → prior → "Promote to Production".

### Database

There is **no automatic database rollback**. Options:

1. If the bad release added a migration: `alembic downgrade -1` from a connected shell.
2. If data is corrupted: restore from Render's automatic daily snapshot (Render dashboard → Postgres → Backups).
3. If neither, escalate.

## Incident triage

When a page fires:

1. **Acknowledge.** Confirm you're on it in `#oncall`.
2. **Check the recent deploy.** Most incidents are within 30 min of a deploy. Render → Events; Vercel → Deployments.
3. **Check Sentry.** Filter to last 30 min. Cluster by error fingerprint.
4. **Check Render status:** <https://status.render.com>. Check Vercel status: <https://www.vercel-status.com>.
5. **Rollback first, investigate second** — if the incident is post-deploy and an obvious regression. Use the rollback procedure above.
6. **Comms.** Update `#status` if user-visible.
7. **Resolve.** Post-mortem in `docs/incidents/YYYY-MM-DD-<slug>.md`. Required fields: timeline, root cause, mitigation, follow-ups.

## Escalation

| Level | Contact | When |
|---|---|---|
| L1 | On-call rotation (TBD) | First responder |
| L2 | Backend lead | If L1 can't resolve in 30 min |
| L3 | CTO | Customer impact >30 min |

> On-call rotation is not yet established. For now the operator (you) is sole on-call.

## Pre-launch gaps (must close before paying customers go live)

- [ ] Slack alert channels wired (`#alerts-backend`, `#alerts-frontend`, `#alerts-security`, `#oncall`, `#status`)
- [ ] Sentry alert rules configured for the 4 signals above
- [ ] Render auto-rollback enabled (Render → Settings → "Auto-rollback on failed health check")
- [ ] On-call rotation established + PagerDuty or equivalent
- [ ] First chaos drill: trigger a fake 5xx in staging, verify alert + rollback
- [ ] Status page (statuspage.io or equivalent)
- [ ] `backend/scripts/post_rotation_smoke.py` authored (see Render runbook)
- [ ] `backend/scripts/ibkr_smoke.py` authored (see IBKR runbook)
- [ ] `backend/scripts/rotate_connector_tokens.py` authored (see Render runbook)
- [ ] Customer-facing changelog (separate from `CHANGELOG_AI.md`)
- [ ] DPA + ToS + Privacy policy published
