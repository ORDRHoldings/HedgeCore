# Ops Monitoring Runbook — Sentry alerts + Render auto-rollback

**Scope:** Wiring the production observability floor for ORDR TreasuryFX. Closes [RISK-OPS-MON-01](../../.claude/state/OPEN_RISKS.md) (HIGH, open). The 2026-05-13 → 2026-05-16 silent RLS outage was directly caused by the absence of these alerts.

**Audience:** Anyone with access to the Sentry, Render, and Vercel dashboards. Most steps are dashboard-only — Claude cannot execute them autonomously.

**Status:** Sentry DSN is already plumbed via `SENTRY_DSN` in `render.yaml` (lines 73-74, 119-120) and into the FastAPI app. The DSN is populated. **Alert rules are not yet defined.**

---

## 1. Sentry — backend 5xx rate alert

**Trigger:** Backend 5xx rate exceeds 1% over a 5-minute window.

### Steps

1. Open Sentry → Project `hedgecore` (production) → Alerts → New alert rule.
2. Set rule type: **Issue alert** → name `Backend 5xx rate > 1% (5min)`.
3. Conditions:
   - **When:** an event is captured
   - **If:** `level:error` AND `transaction.status:internal_error OR transaction.status:unknown_error`
   - **Filter:** environment = `production`
   - **Threshold:** more than `5` events in `5 minutes` *(approximate proxy for 1% — tune after one week of baseline)*
4. Actions:
   - Send email to `geofarmix@gmail.com`
   - *(Optional)* Send to Slack channel `#alerts-backend` if a workspace is wired
5. Save. Trigger a test 5xx (e.g., hit a deliberately-broken route in staging) to verify the alert fires.

### Verification

- Sentry → Alerts → Recent alert history shows the rule firing on the test event.
- Email delivered within 60s.

---

## 2. Sentry — frontend deploy regression alert

**Trigger:** New release introduces a > 5x spike in unhandled exceptions.

### Steps

1. Sentry → Project `ordr-terminal` → Alerts → New alert rule.
2. Rule type: **Metric alert** → name `Frontend exceptions spike post-deploy`.
3. Aggregate: `count()` of events; filter `level:error`.
4. Threshold: warning at `5x` 7-day baseline, critical at `10x`.
5. Resolution: auto-resolve after 1 hour below threshold.
6. Action: email + Slack.

---

## 3. Render — auto-rollback on `/api/health` failure

**Trigger:** New deploy fails health check 3 times in a row → Render reverts to previous deploy.

**Status:** `healthCheckPath: /api/health` is already set in `render.yaml` (line 33, 85). Auto-rollback toggle is a dashboard setting and **must be enabled manually**.

### Steps

1. Render dashboard → Service `hedgecore` → Settings → Health & Alerts.
2. Enable: **Auto-rollback on failed health check** (toggle ON).
3. Configure:
   - Health check path: `/api/health` (already set)
   - Initial delay: 30s (allow uvicorn warmup)
   - Threshold: 3 consecutive failures
   - Interval: 30s between checks
4. Repeat for `hedgecore-preview` (so dev branch tests the same flow).
5. Test: push a deliberately-broken commit to a feature branch, redeploy preview, confirm rollback fires.

### Verification

- Render → Service → Events shows `Deploy failed health check → rolling back to <previous SHA>`.
- Slack notification (if Render → Slack integration wired) lands within 60s.

---

## 4. Vercel — frontend env audit

**Status:** `ANTHROPIC_API_KEY` is required by `/api/policy-ai` and `/api/report-ai` (both Next.js route handlers running on Vercel, not Render). Verify it is set in the Vercel project.

### Steps

1. Vercel → Project `ordr-terminal` → Settings → Environment Variables.
2. Confirm `ANTHROPIC_API_KEY` exists for Production environment.
3. If missing: add it (value from Anthropic console). Redeploy.
4. Smoke test: open `/policy-desk` → AI policy assistant should not show "AI unavailable, using fallback" badge.

---

## 5. Voice Terminal env audit

**Status:** `OPENAI_API_KEY_V` is now declared in `render.yaml` (commit landing this runbook) but **must be populated in the `hedgecore-secrets` env group** before redeploy.

### Steps

1. Render dashboard → Env Groups → `hedgecore-secrets`.
2. Add key `OPENAI_API_KEY_V` with a valid OpenAI API key that has Realtime API access (sk-...).
3. Repeat for `hedgecore-preview-secrets`.
4. Trigger a redeploy of `hedgecore` (Render auto-deploys when the env group is saved, but a manual redeploy is fastest).
5. Smoke test: open Voice Terminal in the UI; the `/v1/voice/token` POST should return 200 with an ephemeral key (not 503).

---

## 6. Verification checklist

After all five sections above are complete:

- [ ] Sentry 5xx rule fires on test event
- [ ] Sentry frontend regression rule armed
- [ ] Render auto-rollback toggled ON for both services
- [ ] Vercel `ANTHROPIC_API_KEY` confirmed present
- [ ] `OPENAI_API_KEY_V` populated in `hedgecore-secrets`
- [ ] Voice Terminal returns 200 on `/v1/voice/token`
- [ ] Update `.claude/state/OPEN_RISKS.md` — flip RISK-OPS-MON-01 from `Open` to `Mitigated <date>` with the Sentry rule + Render auto-rollback as evidence

---

## Why this matters

The 2026-05-13 → 2026-05-16 silent RLS outage shipped because:
- A drive-by deletion broke RLS injection on dashboard routes (RISK-AUTH-RLS-02)
- No 5xx alert existed, so the spike in `/auth/me` 500s went unnoticed
- No health-check rollback existed, so the bad deploy stayed live for 3 days

Even with the now-shipped structural defenses (`assert_routes_have_canonical_auth`, `assert_api_key_routes_safe`), Sentry + auto-rollback are the second line of defense. They are required before any further go-live.

## Related

- [`deployment-and-oncall.md`](deployment-and-oncall.md) — broader on-call playbook, names the same alert gaps
- [`render-env-rotation.md`](render-env-rotation.md) — env-group rotation procedure
- [`.claude/state/OPEN_RISKS.md`](../../.claude/state/OPEN_RISKS.md) — RISK-OPS-MON-01 entry
- [CLAUDE.md §9.1](../../CLAUDE.md) — production gotcha that motivated this runbook
