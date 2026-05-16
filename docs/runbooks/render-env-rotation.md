# Render Env-Var Rotation Runbook

**Scope:** Production secret rotation for the `hedgecore` Render service.
**Cadence:** Quarterly + on any suspected leak.
**Owner:** Ops + Security.

## Pre-flight

- [ ] You have Render dashboard access for the `hedgecore` service.
- [ ] You have access to the secret source-of-truth (1Password vault `ordr-prod`).
- [ ] Backend health check is currently green: <https://hedgecore.onrender.com/health>
- [ ] No active Render deploy in progress.

## Variables to rotate

| Variable | Source | Cutover risk |
|---|---|---|
| `JWT_SECRET` | 1Password → generate via `openssl rand -base64 48` | **HIGH** — invalidates all live access tokens. Rotate during low-traffic window. |
| `API_KEY_PEPPER` | 1Password → generate via `openssl rand -base64 48` | **HIGH** — invalidates all `HK_live_*` API keys until rehash-on-verify cycle. See ADR-0020. |
| `CONNECTOR_ENCRYPTION_KEY` | 1Password → generate via `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` | **HIGH** — without prior dual-write, decrypts of stored OAuth tokens will fail. See "Connector key rotation" below. |
| `WORKOS_API_KEY` | WorkOS dashboard → "Generate new key" | LOW — WorkOS supports overlapping keys for 24h. |
| `WORKOS_CLIENT_SECRET` | WorkOS dashboard | LOW |
| `STRIPE_SECRET_KEY` | Stripe dashboard → "Roll key" | LOW — Stripe supports overlapping keys. |
| `STRIPE_WEBHOOK_SECRET` | Stripe dashboard → endpoint settings → "Roll secret" | LOW |
| `DATABASE_URL` | Render dashboard → database → "Rotate password" | **HIGH** — connection drops; rolling restart required. |
| `SENTRY_DSN` | Sentry → project → keys → "Generate new" | LOW |

## Standard rotation flow (per variable)

1. Generate the new value at the source.
2. In Render dashboard → `hedgecore` → Environment, **add the new variable with a `_NEW` suffix** (e.g. `JWT_SECRET_NEW`).
3. Trigger a manual deploy. Backend boot validator (`app/core/config.py`) will reject if format is wrong.
4. Verify boot via `/health`. If green, proceed.
5. Promote: rename `_NEW` → canonical name, delete the old value. Trigger redeploy.
6. Verify `/health` and `/auth/me` (against a known-good test account).
7. Update 1Password with the new value and `Rotated-On: YYYY-MM-DD` note.

## High-risk: JWT_SECRET cutover

Rotating `JWT_SECRET` invalidates all access tokens immediately. Steps:

1. Pre-announce: post in `#ops` 15 min before. All users will be logged out.
2. Rotate per "Standard rotation flow".
3. Wait for `/health` green.
4. Smoke test: `curl -X POST https://hedgecore.onrender.com/api/auth/login -d '{"username":"demo","password":"demo"}'` → expect 200 with new token.
5. Smoke test: hit `/api/auth/me` with the new token → expect 200.

## High-risk: API_KEY_PEPPER cutover

See ADR-0020. Argon2id stores its parameters in the hash, so the pepper is **the secret** — rotating it invalidates all existing API keys.

Strategy: dual-pepper window.

1. Add `API_KEY_PEPPER_OLD` = current pepper.
2. Set `API_KEY_PEPPER` = new pepper.
3. Deploy. Verifier in `app/services/api_keys.verify_api_key_header()` tries new pepper first, falls back to `_OLD` on miss; on success with `_OLD`, rehashes with new pepper.
4. Wait 30 days for all live keys to be exercised at least once (monitor `audit_events` for `api_key.verify` events).
5. Remove `API_KEY_PEPPER_OLD`. Force rotation for any key not seen in 30 days.

> **Note:** the `_OLD` fallback path requires application code support. As of 2026-05-16 this is NOT implemented; rotating `API_KEY_PEPPER` today requires re-issuing all keys. File an enhancement before next quarterly rotation.

## High-risk: CONNECTOR_ENCRYPTION_KEY (Fernet MultiFernet)

The connector vault uses `Fernet.MultiFernet`, which natively supports key rotation: the new key encrypts, all keys can decrypt.

1. Generate new key.
2. Set `CONNECTOR_ENCRYPTION_KEY` = `"<new_key>,<old_key>"` (comma-separated, new first).
3. Deploy. New encryptions use new key; existing tokens decrypt with old.
4. Run rotation script: `python backend/scripts/rotate_connector_tokens.py` — re-encrypts all stored tokens with the new key.
5. After verification, set `CONNECTOR_ENCRYPTION_KEY` = `"<new_key>"` only.

> **Note:** `backend/scripts/rotate_connector_tokens.py` does NOT exist as of 2026-05-16. Author before next rotation.

## DATABASE_URL rotation

1. Render dashboard → Postgres → "Rotate credentials".
2. Render auto-injects new `DATABASE_URL` to all connected services on next deploy. **Trigger redeploy explicitly** if not auto-rolling.
3. Watch logs for asyncpg connection errors during the cutover window (~30s).
4. Verify with `/health` (includes DB check).

## Cutover gate

**STOP — Resume requires your action:**

The above procedure assumes operator access to the Render dashboard, 1Password
`ordr-prod` vault, WorkOS dashboard, Stripe dashboard, and Sentry. Claude cannot
proceed without you running these steps. Once a rotation is complete, run:

```sh
python backend/scripts/post_rotation_smoke.py --env production
```

(Script does not yet exist — see the "Post-rotation smoke" section below.)

## Post-rotation smoke

Until `post_rotation_smoke.py` is authored, run manually:

```sh
curl -sf https://hedgecore.onrender.com/health
curl -sf https://hedgecore.onrender.com/api/v1/public-chart-data/usdjpy
# Login flow
TOKEN=$(curl -sf -X POST https://hedgecore.onrender.com/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"username":"demo","password":"demo"}' | jq -r .access_token)
curl -sf https://hedgecore.onrender.com/api/auth/me -H "Authorization: Bearer $TOKEN"
```

All four must return 200. If any fails, roll back immediately: Render dashboard → Deploys → previous → "Redeploy".

## Rollback

1. Render dashboard → service → Deploys → previous successful deploy → "Redeploy".
2. Render restores the env-var snapshot from that deploy.
3. Verify `/health`.
4. Post-mortem: write up in `docs/incidents/YYYY-MM-DD-env-rollback.md`.
