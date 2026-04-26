# Secret Rotation Runbook

**Audience:** ORDR TreasuryFX on-call / DevOps lead
**Scope:** Rotation of all production secrets — JWT signing key, database credentials, API keys, third-party tokens. Step-by-step with the actual commands.
**Cadence:** Quarterly for the JWT signing key and DB password; on-demand for any secret suspected of compromise; immediately on any role-change of an operator who held the secret.

---

## Inventory of secrets

| Secret | Used by | Storage | Rotation cadence | Detection blast radius |
|---|---|---|---|---|
| `JWT_SECRET` | Backend (signs access + refresh tokens) | Render env var | Quarterly | All sessions invalidated |
| `DATABASE_URL` (password component) | Backend | Render env var | Quarterly | Brief connection blip |
| `REDIS_URL` (auth component) | Backend (cache) | Render env var | Quarterly | Cache cold start, fail-open |
| `STRIPE_SECRET_KEY` | Backend (billing) | Render env var | Annually | Billing path unaffected if rotated cleanly |
| `STRIPE_WEBHOOK_SECRET` | Backend | Render env var | Annually | Webhook validation breaks until updated |
| `TWELVEDATA_API_KEY` | Backend (FX market data) | Render env var | Annually | Market data degrades; fail-open |
| `SENTRY_DSN` | Backend + frontend | Render + Vercel env var | Annually | Error reporting breaks |
| Email transactional API key | Backend | Render env var | Annually | Auth/verification emails stop |
| `INTERNAL_OPS_API_KEY` (if used) | Internal automation | Render env var | Quarterly | Internal automation breaks |
| Per-customer `HK_live_*` API keys | Customer integrations | DB (bcrypt hashed) | On Customer request | Single customer integration breaks |
| GitHub deploy key / OIDC role | CI → Render/Vercel | GitHub Actions secrets | On personnel change | Deploys break |
| Render API key (for ops automation) | Local laptop / CI | 1Password + GitHub secret | Quarterly | Ops automation breaks |
| Vercel token | Local laptop / CI | 1Password + GitHub secret | Quarterly | Deploys break |

> If a secret is not in this table, it should not exist. Add it to the inventory before rotating.

---

## Pre-rotation checklist

Before any rotation:

- [ ] Confirm current incident posture is green (no ongoing incident — rotating during a fire makes things worse)
- [ ] Confirm a rollback path exists (you can restore the prior secret if rotation breaks something)
- [ ] Schedule a low-traffic window (default: weekend 02:00 UTC)
- [ ] Alert customers if the rotation will cause user-visible session invalidation (`JWT_SECRET` rotation does)
- [ ] Open an ops timeline doc — every command and observation gets a timestamped line
- [ ] Have a second engineer in Slack/Zoom for 4-eyes on any production env-var write

---

## A. JWT_SECRET rotation (every 90 days)

> **Effect on users:** All access and refresh tokens become invalid. Every signed-in user is logged out and must re-authenticate. Schedule for low-traffic window and post a status-page banner in advance.

### A.1 Generate a new key

```bash
# 64 bytes = 512 bits, base64-encoded. Far above the 32-char minimum.
openssl rand -base64 64 | tr -d '\n' > /tmp/new_jwt_secret
wc -c /tmp/new_jwt_secret    # expect ~88 chars
```

### A.2 Stage the change in Render dashboard

1. Render → service `hedgecore` → Environment → "Add Environment Variable"
2. Add `JWT_SECRET_NEXT` (do **not** replace `JWT_SECRET` yet)
3. Paste the value from `/tmp/new_jwt_secret`
4. Save (this triggers a redeploy — wait for it to go green before proceeding)

The backend supports a "next-key" config: if `JWT_SECRET_NEXT` is set, tokens signed with either `JWT_SECRET` or `JWT_SECRET_NEXT` are accepted, but new tokens are still signed with `JWT_SECRET`. This is the dual-key window.

### A.3 Cut over

After the redeploy succeeds and you've confirmed login still works:

1. Render → service `hedgecore` → Environment
2. Replace `JWT_SECRET` with the value from `/tmp/new_jwt_secret`
3. Delete `JWT_SECRET_NEXT`
4. Save and wait for redeploy

### A.4 Verify

```bash
# Hit the health endpoint
curl -fsSL https://api.ordrtreasuryfx.com/api/v1/health/live

# In a browser: log in with a test account — confirm session cookie issued and /v1/auth/me returns 200
```

### A.5 Post-rotation

- [ ] Delete `/tmp/new_jwt_secret` (`shred -u /tmp/new_jwt_secret` on Linux; secure-empty-trash on macOS)
- [ ] Update the secret-rotation log (date, who, ticket reference)
- [ ] Confirm Sentry shows no spike in 401s after the cut-over window settles
- [ ] Lower status-page banner

### A.6 Rollback

If users cannot authenticate after cut-over and the issue is the new key:
1. Render → restore `JWT_SECRET` to the prior value (still in Render's env-var revision history if you didn't delete it elsewhere — otherwise from your offline backup)
2. Wait for redeploy
3. Investigate before re-attempting

---

## B. DATABASE_URL password rotation (every 90 days)

> **Effect on users:** None if done correctly. Brief connection-pool refresh.

### B.1 Mint a new password on the database

For Render PostgreSQL, use `psql` against the prod DB with admin role:

```bash
# Use a one-shot psql session via the offline ops bastion or local laptop with VPN
psql "$RENDER_PG_ADMIN_URL" <<'SQL'
ALTER USER hedge_user WITH PASSWORD 'PLACEHOLDER_NEW_PASSWORD';
SQL
```

Generate the password offline:
```bash
openssl rand -base64 32 | tr -d '/+=\n' | head -c 32
```

Substitute it into the SQL above; never paste it into a shared shell history. Use `read -s` if running interactively.

### B.2 Update Render env var

1. Render → `hedgecore` → Environment → edit `DATABASE_URL`
2. Replace the password component only; leave host, port, database name unchanged
3. Save → redeploy

### B.3 Verify

```bash
curl -fsSL https://api.ordrtreasuryfx.com/api/v1/health/ready
# Expect 200 with db: ok
```

Tail the Render logs for the first 60 seconds after redeploy. Look for `connection refused` or `password authentication failed` — if present, rollback immediately.

### B.4 Rollback

If the new password is wrong / mistyped:
1. Re-set the DB password to the old value via `psql` (you must have the old value to do this; **always keep the old password in a sealed offline note for 24 hours** before discarding)
2. Render env var stays as-is (it has the new value, which now matches)
3. Or re-set Render env var to the old password if you preserved it

### B.5 Post-rotation

- [ ] Confirm no application-level errors in Sentry for 30 minutes post-rotation
- [ ] Discard old password from offline note 24 hours later
- [ ] Update rotation log

---

## C. REDIS_URL rotation

Same shape as B but no application data is at risk (cache is fail-open by design — Redis outage must not block market data, per project rules).

### C.1 Steps

1. Render → managed Redis → rotate password (Render dashboard control)
2. Render → `hedgecore` → update `REDIS_URL` with new password
3. Save → redeploy
4. Verify: `curl /api/v1/health/ready` — Redis check should be `ok` or `degraded` (degraded is acceptable since fail-open)

---

## D. Third-party API keys

### D.1 Stripe

```
1. Stripe dashboard → Developers → API keys → Roll secret key
2. Copy the new value
3. Render → hedgecore → STRIPE_SECRET_KEY → paste → save → wait for redeploy
4. Test: create a $0.50 test customer + invoice in a sandbox tenant
5. Once verified working, deactivate the prior key in Stripe dashboard
```

> **Order matters.** Roll first, deploy second, deactivate old key third. Reversing this sequence creates an outage.

### D.2 Stripe webhook secret

```
1. Stripe → Developers → Webhooks → endpoint → Roll signing secret
2. Render → STRIPE_WEBHOOK_SECRET → update → redeploy
3. Trigger a test event from Stripe → verify it processes
```

### D.3 TwelveData

```
1. TwelveData portal → API Keys → Generate new key
2. Render → TWELVEDATA_API_KEY → update → redeploy
3. Curl the FX endpoint to confirm: /api/v1/fx-rates/major
4. Revoke old key in TwelveData portal
```

Same pattern for Sentry DSN, transactional email, helpdesk: roll → deploy → revoke old.

---

## E. Per-customer API keys (`HK_live_*`)

Per-customer keys are bcrypt-hashed in DB (per `app/models/api_key.py`). They are rotated:

- Quarterly — recommended best practice (Customer-driven)
- Immediately on Customer request (compromise, employee departure)

### E.1 Customer-initiated rotation flow

1. Customer logs in → Settings → API Keys → Create new key
2. Backend issues a new `HK_live_*` value, returns plaintext **once** (the only time it's visible)
3. Customer copies it into their integration
4. Customer revokes old key from the same screen
5. Backend logs both actions to the WORM audit ledger

ORDR ops should never see the plaintext. If a Customer asks ops to "regenerate the key for them," refuse — they must do it themselves under their own login. Audit posture requires this.

---

## F. Repository / CI secrets

### F.1 GitHub Actions secrets (Render API key, Vercel token, etc.)

```bash
# Verify list
gh secret list --repo ORDR/hedgecore

# Update one
gh secret set RENDER_API_KEY --repo ORDR/hedgecore < /tmp/new_render_key

# Confirm by re-running a recent workflow
gh workflow run deploy.yml --ref master
```

### F.2 Deploy keys / OIDC trust

- Prefer GitHub OIDC over long-lived deploy keys whenever the deploy target supports it (Render supports OIDC; Vercel supports tokens but scope them per-project).
- Rotate on personnel change, not on a calendar.

---

## G. Compromise scenarios

### G.1 Suspected or confirmed key leak

If a secret may have leaked (gitleaks alert, lost laptop, suspicious Sentry spike, ex-employee with prior access):

1. **Within 15 minutes:** Rotate the suspected secret per the relevant section above
2. **Within 1 hour:** Audit access logs for the secret's blast-radius window (use audit_events WORM table query — see incident-response-plan.md)
3. **Within 4 hours:** Notify affected customers per the DPA breach-notification section, if Customer Data may have been exposed
4. **Within 24 hours:** Post-mortem ticket opened with timeline, root cause, and prevention plan
5. **Within 72 hours:** Regulatory notification per GDPR Art. 33 if Personal Data Breach criteria met

### G.2 Git history scrubbing

If a secret was committed:

1. Rotate first (assume the secret is burned the moment it touches a public commit)
2. Scrub history with `git filter-repo` (do not use `git filter-branch` — deprecated)
3. Force-push (master force-push requires CTO approval per release rules — get it in writing)
4. Expire the GitHub cache: contact GitHub support to purge cached views
5. File a Trufflehog/gitleaks alert false-negative report so detection improves

The repository already has `.gitleaks.toml` and the `.pre-commit-config.yaml` runs gitleaks; if a secret slipped past, the detection rule needs updating.

---

## H. Operational hygiene

- **Never paste a secret into Slack, Zoom chat, or a ticket** — even ephemeral. Use 1Password "share" links with an expiry.
- **Never commit a `.env` file** — `.gitignore` covers `.env*` but verify after every checkout.
- **Use `direnv` locally** with a `.envrc` that loads from a 1Password `op` CLI lookup, not from a checked-in file.
- **Quarterly drill:** rotate one non-critical secret as a fire drill so the team's muscle memory stays warm.
- **Annual review:** walk through this runbook with the whole team. Anything outdated gets fixed that day.

---

## Rotation log (template)

Keep a markdown log at `.claude/state/secret-rotation-log.md` with one line per rotation:

```
2026-04-25  JWT_SECRET    quarterly   ops@geo  ticket #123  no-incident
2026-04-25  DATABASE_URL  quarterly   ops@geo  ticket #123  no-incident
2026-05-12  STRIPE_KEY    suspected-leak  ops@geo  ticket #145  rotated within 12 min
```
