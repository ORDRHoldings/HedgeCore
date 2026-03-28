# ORDR Terminal — Attack Surface Document

**Date:** 2026-03-28
**Status:** Active
**Owner:** Security Foundation Sprint 1

---

## 1. External Entry Points

### 1.1 REST API (HTTPS)
- Base URL: `https://hedgecore.onrender.com/api`
- Auth: JWT Bearer (30min expiry) + API Key (`HK_live_` prefix)
- CORS: configured per environment, no wildcard in production

| Endpoint Group | Auth Required | Rate Limited | Notes |
|----------------|---------------|--------------|-------|
| `POST /v1/auth/login` | No | 60/min | Credential submission |
| `POST /v1/auth/refresh` | Refresh token | 60/min | Token refresh |
| `GET /api/health` | No | 60/min | Public health check |
| `GET /v1/positions` | JWT or API Key | 60/min | Tenant-scoped |
| `POST /v1/calculate` | JWT or API Key | 60/min | Engine entry point |
| `POST /v1/proposals` | JWT | 60/min | Execution flow |
| `PATCH /v1/proposals/{id}/approve` | JWT + 4-eyes | 60/min | Governance action |
| `POST /v1/proposals/{id}/execute` | JWT + 4-eyes + IP | 60/min | Execution trigger |
| `GET /v1/audit-events` | JWT | 60/min | WORM audit read |
| `POST /v1/users` | JWT + admin | 60/min | User provisioning |
| `GET /v1/exports/*` | JWT | 60/min | Regulatory reports |
| `GET /openapi.json` | No | 60/min | API schema |
| `GET /api/v1/market-data/live/*` | No (public prefix) | 60/min | Live FX rates |

### 1.2 WebSocket
- `WS /api/v1/ws/market-data` — authenticated, requires JWT
- `WS /api/v1/voice/realtime` — gated by `OPENAI_API_KEY` env var, 503 if unset

### 1.3 Frontend (HTTPS, Vercel)
- Base URL: `https://ordr-terminal.vercel.app`
- Next.js 15 App Router, SSR + client components
- Auth state: JWT in memory + refresh token in httpOnly cookie (set by backend)

---

## 2. Authentication Flows

### 2.1 Password Auth
1. `POST /v1/auth/login` with `{username, password}`
2. Backend: bcrypt verify -> issue JWT access (30min) + refresh (7d)
3. Access token in Authorization header for subsequent requests
4. CSRF token set as cookie on login, verified on mutations via `X-CSRF-Token` header

### 2.2 API Key Auth
1. Client sends `X-API-Key: HK_live_<id>.<secret>` header
2. Backend: split on `.`, lookup by id, bcrypt verify secret
3. API key principal treated as service account (CSRF not required for Bearer-authenticated requests)

### 2.3 SSO (Sprint 3 — pending)
- WorkOS SAML/OIDC integration planned
- JWT issuance path will be identical to password auth post-SSO

---

## 3. Trust Boundaries

| Boundary | Controls |
|----------|----------|
| Internet -> Render (backend) | HTTPS TLS, CORS, rate limiting |
| Internet -> Vercel (frontend) | HTTPS TLS |
| Frontend -> Backend API | JWT auth, CSRF |
| Backend -> PostgreSQL | Private credentials in env vars |
| Backend -> Market data providers | API keys in env vars |
| Tenant A -> Tenant B | RBAC tenant_id checks in every query |
| Execution proposals | IP allowlist (`EXECUTION_IP_ALLOWLIST_ENABLED`) |

---

## 4. Key Security Controls

| Control | Implementation | Location |
|---------|----------------|----------|
| Authentication | JWT HS256 (30min) + refresh (7d) | `app/core/security.py` |
| API Key auth | HK_live_ prefix, bcrypt-hashed | `app/deps/api_key_auth.py` |
| CSRF | csrf_token cookie + X-CSRF-Token header | `app/middleware/csrf.py` |
| Rate limiting | 60 req/min per user/IP, token bucket | `app/middleware/rate_limit.py` |
| RBAC | 9 roles, 41 permissions, hierarchy 0-15 | `app/core/dependencies.py` |
| Audit trail | WORM append-only, SHA-256 hash chain | `app/engine_v1/audit.py` |
| 4-eyes approval | Maker/checker SoD enforcement | `app/services/execution_proposal_service.py` |
| Tenant isolation | tenant_id scoping on all queries | All route handlers |
| WORM tables | No UPDATE/DELETE on audit_events, calculation_runs, policy_revisions | DB triggers |
| IP allowlist | Per-endpoint for execution proposals | `app/core/ip_allowlist.py` |

---

## 5. Known Risk Areas (Pentest Focus)

| Risk | Description | Existing Controls | Status |
|------|-------------|-------------------|--------|
| Tenant isolation | Cross-tenant data read via crafted IDs | RBAC tenant_id check on all queries | Partial — RLS planned Sprint 4 |
| IDOR | Direct object reference on positions/proposals | RBAC + tenant scoping | Active |
| JWT abuse | Token replay after logout | Stateless JWT, no server-side revocation | Accepted — Redis revocation Sprint 2 |
| Audit log tampering | DELETE/UPDATE on WORM tables | DB-level append-only + hash chain | Mitigated |
| Rate limit bypass | IP rotation to bypass 60/min limit | Per-user limit (not just IP) | Active |
| 4-eyes bypass | Single user approving own proposal | SoD check in service layer | Mitigated |
| Secrets exposure | Leaked secrets in git history | Git scrub in progress (Sprint 1) | In Progress |
| Global IP allowlist | No middleware-level IP filtering | Per-endpoint only | Sprint 1 Chunk 5 |
| Unauthenticated market data | `GET /api/v1/market-data/live/*` requires no auth — FX rate data is publicly readable without a token | Route added to `public_prefixes` in APIKeyAuthMiddleware (fix 2026-03-25) — accepted risk; data is indicative prices only, not proprietary |

---

## 6. Remediation Tracking

| Finding | Severity | Sprint | Status |
|---------|----------|--------|--------|
| Secrets in git history | Critical | Sprint 1 Chunk 1 | In Progress |
| No global IP allowlist middleware | Medium | Sprint 1 Chunk 5 | In Progress |
| No mypy enforcement on kernel | Low | Sprint 1 Chunk 3 | In Progress |
| No server-side JWT revocation | Medium | Sprint 2 (Redis) | Planned |
| No RLS on core tables | Medium | Sprint 4 | Planned |

---

## 7. Out of Scope (v1)

- Active/authenticated penetration test — deferred to contracted third party
- Network-layer firewall rules (Render manages infrastructure)
- DDoS protection beyond rate limiting (Render/Cloudflare layer)
