# Security Rules

## Secrets
- NEVER commit secrets to git (JWT_SECRET, DB passwords, API keys, tokens).
- `.gitleaks.toml` enforces detection. `.pre-commit-config.yaml` runs gitleaks.
- JWT_SECRET must be >= 32 characters. Production rejects dev defaults.
- Known leaked secrets in git history — scrub required (see `scripts/scrub-git-secrets.sh`).

## Authentication
- JWT HS256: 30min access token + 7d refresh token.
- API Keys: `HK_live_` prefix; secret HMAC-SHA256'd with a server-side pepper, then Argon2id-hashed at rest.
- Passwords: bcrypt hashed. No length check in hash_password() (demo/demo bypasses 12-char min).
- CSRF: csrf_token cookie (set on login) + X-CSRF-Token header (mutations via dashboardClient).
- CSRF skip: JWT Bearer-authenticated requests bypass CSRF check.

## Authorization
- RBAC: 9 roles, 63 permissions, hierarchy_level 0-15.
- Fail-closed: missing permission = denied.
- Separation of Duties: same user cannot make AND check an execution proposal.
- Superuser-only endpoints use `require_superuser` dependency.

## Headers
- X-Content-Type-Options: nosniff
- X-Frame-Options: DENY
- Referrer-Policy: strict-origin-when-cross-origin
- CORS configured per environment (no wildcard in production).

## Rate Limiting
- 60 req/min per user/IP.
- TokenBucket implementation in middleware.

## Data Protection
- WORM tables: append-only, NO UPDATE/DELETE.
- Hash chain: SHA-256, per-tenant, tamper-evident.
- Audit events are immutable and integrity-verifiable.

## Forbidden
- No secrets in source code, comments, or test fixtures.
- No wildcard CORS in production.
- No --no-verify on git commits.
- No force-push to master without explicit approval.
