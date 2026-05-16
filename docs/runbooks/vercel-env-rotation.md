# Vercel Env-Var Rotation Runbook

**Scope:** Production env vars for the `ordr-terminal` and `hedgecore` Vercel projects.
**Cadence:** Quarterly + on backend `JWT_SECRET` rotation.
**Owner:** Ops.

## Pre-flight

- [ ] You have Vercel team access (`ordr` team).
- [ ] Vercel CLI installed: `npm i -g vercel`. Verify: `vercel --version`.
- [ ] Logged in: `vercel login`.
- [ ] Linked: `vercel link` from `frontend/`.

## Variables

| Variable | Scope | Notes |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Production + Preview | Public, baked into the bundle. Changing this requires a redeploy, not just an env-var update. |
| `NEXT_PUBLIC_SENTRY_DSN` | Production + Preview | Public, baked. Same. |
| `SENTRY_AUTH_TOKEN` | Build-time only | Used for source-map upload. Rotate from Sentry. |
| `WORKOS_PUBLISHABLE_KEY` | Production + Preview | Public, baked. |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Production + Preview | Public, baked. |

## Standard flow

1. Pull current env to inspect:
   ```sh
   cd frontend
   vercel env pull .env.production.local --environment=production
   ```
2. Update target value at the source (Sentry, WorkOS, Stripe dashboards).
3. Remove + re-add the var:
   ```sh
   vercel env rm NEXT_PUBLIC_API_URL production
   echo "https://hedgecore.onrender.com/api" | vercel env add NEXT_PUBLIC_API_URL production
   ```
4. Trigger redeploy (required for `NEXT_PUBLIC_*` vars to take effect, since they're baked into the bundle):
   ```sh
   vercel --prod
   ```
5. Verify:
   ```sh
   curl -sf https://ordr-terminal.vercel.app/ | head -c 200
   ```
6. Smoke test in browser: login flow, dashboard load, one chart render.

## NEXT_PUBLIC_API_URL change

If backend moves (e.g. new Render service URL), this is the only frontend change required. **Both the production and preview environments must be updated**:

```sh
vercel env rm NEXT_PUBLIC_API_URL production
vercel env rm NEXT_PUBLIC_API_URL preview
echo "https://hedgecore.onrender.com/api" | vercel env add NEXT_PUBLIC_API_URL production
echo "https://hedgecore-preview.onrender.com/api" | vercel env add NEXT_PUBLIC_API_URL preview
vercel --prod
```

CORS on the backend must allow the new origin — see `backend/app/core/config.py:CORS_ALLOW_ORIGINS`.

## Cutover gate

**STOP — Resume requires your action:**

The procedure assumes Vercel team access. Once you've run `vercel --prod` and the
new deploy is live, verify it:

```sh
curl -sf https://ordr-terminal.vercel.app/api/health 2>&1 | head
```

(That endpoint is a Next.js API route that proxies to the backend `/health` —
returns 200 if both layers are up.)

## Rollback

```sh
vercel ls --prod  # find the prior good deploy
vercel promote <deployment-url>
```
