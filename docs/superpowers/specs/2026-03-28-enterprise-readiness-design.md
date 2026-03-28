# Enterprise Readiness — Design Spec

**Date:** 2026-03-28
**Status:** Approved
**Scope:** All four enterprise dimensions — Sales, Reliability, Compliance, Scalability
**Sequence:** Risk-ranked (Option 3)

---

## Context

ORDR Terminal is a v1-frozen institutional FX hedge calculation and governance platform. The core engine, audit chain, RBAC, and regulatory export features are complete. The following gaps prevent enterprise sales, reliable institutional operation, and regulatory certification.

### Current Strengths (Already Done)
- RBAC: 9 roles, 41 permissions, hierarchy levels 0–15
- WORM tables: append-only with SHA-256 hash chain per tenant
- 4-eyes approval + Separation of Duties
- JWT (30min) + API keys (`HK_live_` prefix, bcrypt-hashed)
- CSRF protection + rate limiting (60 req/min)
- Regulatory exports: EMIR, ISDA, FINRA-17a4, IFRS9-XML, ASC815-XML
- CI: gitleaks, Dependabot, Trivy, 75% test coverage
- DR plan, backup scripts, SLOs, monitoring docs
- Docker stack (multi-stage prod build)

### Gap Summary
| Dimension | Key Gaps |
|-----------|----------|
| Security | Secrets in git history, rotation pending, no mypy gate, no pentest |
| Reliability | Free-tier cold starts, no Redis in prod, no Sentry, no uptime monitoring |
| Enterprise Sales | No SSO/SAML, no billing, no self-service signup, no webhook support |
| Compliance | No SOC2 controls matrix, GDPR enforcement not wired, tenant isolation partial |
| Scalability | No load test baseline, market data not cached, connection pool untuned |

---

## Sprint 1 — Security Foundation

**Goal:** Eliminate live security risks before any enterprise client touches the system.

### 1.1 Git History Scrub
- Run `scripts/scrub-git-secrets.sh` to rewrite git history and remove committed secrets
- Force-push all branches after scrub (requires coordination — notify all contributors to re-clone)
- Closes risk **R-001**

### 1.2 Secret Rotation
- Rotate `JWT_SECRET` (new random 64-char hex)
- Rotate PostgreSQL password via Render dashboard
- Rotate Finnhub, Alpha Vantage, Twelve Data API keys
- Update all env vars in Render + Vercel project settings
- Closes risk **S-01**

### 1.3 mypy Hard Gate
- Enable mypy in CI pipeline scoped to `backend/app/engine_v1/` only
- Configuration: `--strict`, disallow-untyped-defs, no-implicit-optional
- Frozen kernel must be fully type-safe; rest of codebase deferred
- Closes gap **C-04**

### 1.4 Penetration Test Prep
- Document the full attack surface (endpoints, auth flows, file upload, CSV import, WebSocket)
- Run OWASP ZAP baseline scan against staging environment
- Commit scan report and remediation plan as ADR to `docs/architecture/adr/`
- Creates evidence artifact for enterprise security questionnaires

### 1.5 IP Allowlisting
- Add configurable `ALLOWED_IPS` env var to rate-limit middleware
- Default: empty (open — no behaviour change)
- When set: requests from unlisted IPs receive HTTP 403
- Enables per-client network lockdown without code changes

**Done criteria:** No known secrets in git history, all env vars rotated, mypy green on engine_v1/, OWASP scan report committed to ADR.

---

## Sprint 2 — Infrastructure Upgrade

**Goal:** Remove single points of failure and operational blind spots.

### 2.1 Render Paid Tier
- Upgrade `plan: free` → `plan: starter` ($7/mo) in `render.yaml` for both `hedgecore` and `hedgecore-preview`
- Eliminates 15-minute cold starts
- Execute blueprint sync to activate keepalive cron (already in IaC, pending sync)
- Closes risk **RISK-INF-01**

### 2.2 Private Networking
- Enable Render internal network between backend service and PostgreSQL
- Replace `DATABASE_URL` public hostname with internal hostname
- Removes PostgreSQL from public internet exposure
- Update `render.yaml` with `envGroup` referencing internal DB URL

### 2.3 Redis in Production
- Provision Render Redis instance
- Wire `REDIS_URL` env var; remove silent fallback in middleware
- Rate limiting, session cache, and market data cache become durable
- Log clearly on startup if Redis is unreachable (fail-open with warning, not silent)

### 2.4 Sentry Error Tracking
- Add `sentry-sdk[fastapi]` to `backend/requirements.txt`
- Add `@sentry/nextjs` to `frontend/package.json`
- DSN injected via `SENTRY_DSN` env var (no-op if unset)
- Captures unhandled exceptions with tenant ID, user ID, request context
- PII scrubbing: strip email/name from Sentry payloads

### 2.5 External Uptime Monitoring
- Configure BetterUptime (or UptimeRobot) on `/api/health` endpoint
- Alert to email + Slack on downtime
- Public status page for institutional clients

### 2.6 Automated Backup Scheduling
- Wire existing `pg_backup.sh` to Render cron job (daily at 02:00 UTC)
- Offload snapshot to Backblaze B2 (S3-compatible, cheap)
- Wire `restore_verify.sh` to monthly cron — tests restore integrity automatically
- Alert on backup failure via Sentry + email

**Done criteria:** Zero cold starts on staging, Redis confirmed active in production, Sentry events flowing for both frontend and backend, backup cron running with offsite storage, uptime monitor active.

---

## Sprint 3 — SSO + Billing

**Goal:** Unblock enterprise sales with IdP integration and subscription management.

### 3.1 SSO / SAML / OIDC
- Integrate **WorkOS** (single SDK covering Okta, Azure AD, Google Workspace, SAML 2.0, OIDC)
- New `sso_provider` + `sso_domain` fields on `Company` model (migration required)
- Auth flow: SSO callback → validate WorkOS token → issue ORDR JWT (same downstream path as password auth)
- No changes to engine, RBAC, or audit chain
- Fallback: password auth remains for non-SSO tenants

### 3.2 Stripe Billing
- Subscription plans: **Starter** / **Professional** / **Enterprise**
- New fields on `Company`: `stripe_customer_id`, `stripe_subscription_id`, `plan_tier`
- Webhook handler for: `invoice.paid`, `invoice.payment_failed`, `customer.subscription.deleted`
- Plan tier stored in DB, checked at auth — not derived from Stripe on every request
- Test mode only until go-live; live keys gated behind `STRIPE_LIVE_MODE=true`

### 3.3 Plan Enforcement (Backend)
- Move feature gating from frontend UI to authoritative backend middleware
- `PlanEnforcementMiddleware`: checks `company.plan_tier` against feature matrix
- Plan limits enforced: position count, user count, API rate limit multiplier, export formats
- Returns `HTTP 402 Payment Required` when limit exceeded

### 3.4 Self-Service Signup
- New `/signup` flow: email → company creation → Stripe Checkout → workspace provisioned
- SSO configuration optional post-signup (can be added later in Admin Hub)
- Removes need for manual superuser provisioning for new clients
- Email verification gate before workspace activation

### 3.5 API Docs Portal
- FastAPI OpenAPI spec already exists at `/openapi.json`
- Deploy **Scalar** as static Next.js page at `/docs` (replaces raw Swagger UI)
- Add API key creation UI to Admin Hub (already partially present)
- Include authentication guide, rate limit headers, error code reference

**Done criteria:** SSO login works with a test Okta tenant, Stripe test-mode subscription creates/cancels/renews correctly, plan limits enforced at backend for all three tiers, signup flow creates full tenant end-to-end, Scalar docs deployed.

---

## Sprint 4 — Compliance Pipeline

**Goal:** Build the evidence artifacts required for SOC2 Type I and GDPR accountability.

### 4.1 SOC2 Controls Matrix
- Map existing controls to SOC2 Trust Service Criteria (Security, Availability, Confidentiality)
- Controls already implemented: WORM audit log, hash chain, RBAC, bcrypt, CSRF, rate limiting, gitleaks, Dependabot, Trivy, DR plan, backup, SLOs
- Gaps to close: access review process, change management log, vendor risk register
- Automate nightly evidence export: user count, policy change count, failed auth count → append-only `compliance_evidence` table
- Commit controls matrix to `docs/compliance/soc2-controls-matrix.md`

### 4.2 GDPR Enforcement
- Wire scheduled job to enforce data retention policy (docs already exist in `docs/`)
- Job runs nightly: anonymises personal data (name, email → hashed) for records older than retention period
- New endpoint: `GET /v1/user/data-export` — returns all personal data for requesting user (JSON)
- New endpoint: `DELETE /v1/user/account` — initiates right-to-erasure (anonymise, not hard delete — preserves WORM integrity)
- Document GDPR DPA status for all vendors (Render, Vercel, Sentry, WorkOS, Stripe)

### 4.3 Tenant Isolation Audit
- Run full existing tenant isolation test suite; fix any gaps
- Add PostgreSQL row-level security (RLS) policies on `positions` and `calculation_runs`
- RLS policy: `tenant_id = current_setting('app.current_tenant_id')` set at session start
- Add cross-tenant boundary tests to CI (read/write attempts across tenant boundaries must return 403/404)
- Tests must pass 100% before sprint closes

### 4.4 Vendor Security Registry
- Document all third-party dependencies with:
  - Data classification (what data touches the vendor)
  - Contractual DPA status (signed / pending / not required)
  - Fallback/contingency if vendor is unavailable
- Vendors: Render, Vercel, PostgreSQL, Redis, Sentry, WorkOS, Stripe, Finnhub, Twelve Data, Alpha Vantage
- Commit to `docs/compliance/vendor-registry.md`

**Done criteria:** Controls matrix committed and mapped to SOC2 criteria, GDPR export + erasure endpoints live, tenant isolation 100% passing with RLS enforced, vendor registry committed with DPA status for all vendors.

---

## Sprint 5 — Scale & Performance

**Goal:** Validate the system handles institutional load and add integration primitives.

### 5.1 Load Testing Baseline
- **Tool:** k6
- **Scenario:** 100 concurrent users, 1000 positions per tenant, 10 simultaneous calculation runs
- **Targets:** p50 < 200ms, p95 < 500ms, p99 < 1s for `/v1/calculate`
- Record baseline report; commit to `docs/performance/load-test-baseline.md`
- Fix any bottlenecks found before closing sprint

### 5.2 Market Data Caching
- Cache Finnhub / Twelve Data responses in Redis with 60s TTL
- Cache key: `market_data:{provider}:{pair}:{timeframe}`
- Add cache-hit/miss counter to `/api/health` response
- Reduces provider API calls by ~90% under concurrent load

### 5.3 Connection Pool Tuning
- Set SQLAlchemy async pool: `pool_size=20`, `max_overflow=10`, `pool_timeout=30`
- Match Render PostgreSQL connection limit (default 97 on Starter plan)
- Add pool exhaustion metric to Sentry performance monitoring

### 5.4 Webhook Support
- `POST /v1/webhooks` — register endpoint URL per tenant (max 5 per tenant)
- `GET /v1/webhooks` — list registered endpoints
- `DELETE /v1/webhooks/{id}` — remove endpoint
- Events fired: `position.created`, `calculation.completed`, `proposal.approved`, `proposal.rejected`
- Signed with `HMAC-SHA256` using per-tenant webhook secret
- Delivery: async background task, retry with exponential backoff (5 attempts, 1m/5m/15m/1h/4h)
- Delivery log stored (last 100 per endpoint) — viewable in Admin Hub

### 5.5 Horizontal Scaling Prep
- Document stateless deployment contract: no in-process state, all session/cache in Redis, sticky sessions not required
- Test 2-instance deployment on Render (manual scale-out)
- Verify: rate limiting is Redis-backed (not in-process), session tokens validate correctly across instances
- Update `docs/architecture/SYSTEM_BOUNDARIES.md` with multi-instance topology

**Done criteria:** k6 report committed with all p95 targets met, market data cache active with hit rate > 80% under load, webhooks deliver signed events with retry, 2-instance deployment tested and confirmed stateless.

---

## Sequencing & Dependencies

```
Sprint 1 (Security)     → must complete before Sprint 3 (SSO has no secrets risk)
Sprint 2 (Infra)        → must complete before Sprint 5 (Redis required for caching)
Sprint 3 (SSO+Billing)  → can run after Sprint 1; parallel with Sprint 4
Sprint 4 (Compliance)   → can run after Sprint 2 (RLS requires stable DB)
Sprint 5 (Scale)        → runs last (requires Redis + load-stable infra)
```

## Effort Estimates

| Sprint | Focus | Estimated Days |
|--------|-------|---------------|
| 1 | Security Foundation | 3–5 |
| 2 | Infrastructure Upgrade | 3–4 |
| 3 | SSO + Billing | 8–10 |
| 4 | Compliance Pipeline | 5–7 |
| 5 | Scale & Performance | 4–6 |
| **Total** | | **23–32 days** |

## Architecture Constraints
- v1 freeze remains in effect throughout. No changes to `engine_v1/`, WORM tables, or hash chain.
- All DB changes require Alembic migrations.
- No new auth dependencies without updating `dependencies.py`.
- Frozen files require ADR before modification.
