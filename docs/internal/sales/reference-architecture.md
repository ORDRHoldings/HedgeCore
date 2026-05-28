# ORDR TreasuryFX — Reference Architecture

**Audience:** IT, security, architecture review boards (ARBs), CISOs
**Format:** One-pager — convert to PDF for distribution
**Date:** 2026-05-27 · Version 1.1 (RLS structural-defense disclosure added)

---

## At a glance

> **Three-tier managed-PaaS architecture.** Stateless frontend (Vercel), stateless backend (Render), managed PostgreSQL + Redis (Render). No self-managed infrastructure. No bastion hosts. No microservices.

---

## High-level architecture diagram

```
                    ┌──────────────────────────────────────────┐
                    │        End-user browser (HTTPS)          │
                    └──────────────────┬───────────────────────┘
                                       │
                                       │ TLS 1.3
                                       ▼
                    ┌──────────────────────────────────────────┐
                    │  Frontend — Next.js 15.5 + React 19      │
                    │  Vercel (edge network, global CDN)       │
                    │  • Server-side rendering                 │
                    │  • CSP, security headers                 │
                    │  • Cookie-based JWT + CSRF token         │
                    └──────────────────┬───────────────────────┘
                                       │ HTTPS · JWT Bearer
                                       │           · X-CSRF-Token
                                       ▼
            ┌──────────────────────────────────────────────────────┐
            │  Backend — FastAPI (Python 3.12)                     │
            │  Render.com web service (Docker, autoscaled)         │
            │                                                      │
            │  Middleware order (immutable):                       │
            │   1. Audit (capture every request)                   │
            │   2. Rate limit (TokenBucket, 60 req/min)            │
            │   3. Auth (JWT + API-key + CSRF + RBAC)              │
            │                                                      │
            │  Engine_v1 kernel (46 modules, deterministic)        │
            │   • input validator (fail-closed)                    │
            │   • hedge calculation (pure functions)               │
            │   • RunEnvelope: hashed (SHA-256), signed            │
            │                                                      │
            │  Background workers:                                 │
            │   • Hash-chain verifier (cron, daily)                │
            │   • GDPR anonymisation cron                          │
            │   • Regulatory submission cron                       │
            └────────┬────────────────────────────┬────────────────┘
                     │                            │
                     ▼                            ▼
        ┌────────────────────────┐  ┌──────────────────────────┐
        │  PostgreSQL (Render)   │  │  Redis (Render)          │
        │  • AES-256 at rest     │  │  • Fail-open by design   │
        │  • Daily backups       │  │  • Market-data cache     │
        │  • PITR within 7 days  │  │  • TTL: 60s              │
        │  • WORM tables:        │  │                          │
        │    audit_events        │  │                          │
        │    calculation_runs    │  │                          │
        │    policy_revisions    │  │                          │
        │    ledger_entries      │  │                          │
        │  • Per-tenant Fernet   │  │                          │
        └────────────────────────┘  └──────────────────────────┘
                     │
                     ▼ outbound only
        ┌────────────────────────────────────────────────────┐
        │ External integrations (OAuth 2.0 / API key)        │
        │  • ERP: QBO, Xero, NetSuite, Sage Intacct, D365    │
        │  • Banking: IBKR (live), SWIFT, SEPA-pain.001      │
        │  • Reporting: ESMA / FCA / CFTC endpoints          │
        │  • Market data: TwelveData                         │
        │  • Observability: Sentry                           │
        └────────────────────────────────────────────────────┘
```

---

## Component summary

| Layer | Component | Technology | Hosting |
|---|---|---|---|
| **Frontend** | Web app | Next.js 15.5, React 19, TypeScript 5.9 | Vercel |
| **Backend** | API + workers | FastAPI, Python 3.12, SQLAlchemy async | Render.com |
| **Database** | Primary store | PostgreSQL 17 | Render Managed |
| **Cache** | Market data + session | Redis | Render Managed |
| **Observability** | Errors + APM | Sentry | Sentry SaaS |
| **CI/CD** | Build + deploy | GitHub Actions → Render + Vercel | GitHub-hosted |

---

## Key architectural properties

### Statelessness
Both frontend and backend are stateless. Sessions are JWT-based. No sticky sessions. Horizontal scaling via Render autoscaler.

### Determinism
The hedge calculation engine (`engine_v1/`, 46 modules) is composed of pure functions. No I/O, no side effects, no global state. Same inputs + same policy version → identical outputs, byte-for-byte. This is enforced architecturally — not policy.

### WORM enforcement
Append-only tables (`audit_events`, `calculation_runs`, `policy_revisions`, `ledger_entries`) are protected at the PostgreSQL layer with NO UPDATE / NO DELETE triggers. Application-layer code cannot bypass them.

### Hash chain
Every RunEnvelope contains the SHA-256 hash of its predecessor (per-tenant chain, genesis = 64 zeros). A daily cron re-walks each tenant's chain and alerts on any inconsistency. Chain breaks are detected within 24 hours.

### Fail-closed validation
Engine inputs pass through `engine_v1/validator.py` before reaching the kernel. Validation errors abort the calculation — no partial outputs, no fallbacks.

### Fail-open caching
Redis is intentionally fail-open: a Redis outage falls through silently to the upstream market data provider. Market data is operational, not authoritative — this is a conscious design choice.

---

## Security boundaries

| Boundary | Control | Enforcement |
|---|---|---|
| **Internet → Frontend** | TLS 1.3, HSTS, CSP, security headers | Vercel + application |
| **Frontend → Backend** | JWT Bearer, CSRF double-submit, rate limit | Application middleware |
| **Backend → Database** | Private network (Render), AES-256 at rest, parameterized queries | Render-managed + ORM |
| **Backend → External APIs** | OAuth 2.0 / API keys, per-tenant Fernet for credentials | Application |
| **Tenant ↔ Tenant** | PostgreSQL `FORCE ROW LEVEL SECURITY` on tenant-scoped tables; `app.current_tenant_id` set per-transaction via `set_config()`; no-tenant requests match sentinel → empty result, not "everything"; Enterprise tier supports dedicated DB | **DB schema (RLS policies)** + Application (session injection) |
| **User ↔ Permission** | RBAC: 9 roles × 41 permissions × hierarchy 0–15; fail-closed; two app-startup guards reject any route missing canonical auth or sitting outside the API-key allowlist | Dependency injection + structural startup guards |
| **Maker ↔ Checker** | Same user cannot make + check; SoD enforced in code | Application |

---

## Data flow — hedge calculation walkthrough

1. **Treasurer** submits a hedge proposal via the frontend.
2. Frontend POSTs to `/v1/proposals` with JWT + CSRF token.
3. Audit middleware captures the request envelope.
4. Rate-limit middleware checks the user's bucket.
5. Auth middleware validates JWT, resolves the user, eager-loads RBAC + tenant context.
6. Route handler validates the Pydantic schema.
7. `engine_v1.validator` checks all engine-relevant inputs (fail-closed).
8. `engine_v1.kernel.compute()` produces the calculation result (pure function, deterministic).
9. Result wrapped in a `RunEnvelope`: inputs_hash + outputs_hash + parent_hash + signature.
10. RunEnvelope persisted to `calculation_runs` (WORM).
11. State transition logged to `audit_events` (WORM).
12. Response returned to frontend.
13. **Checker** approves via separate user session (SoD enforced).
14. Approval logged; pipeline advances SANDBOX → STAGING.
15. **Hash-chain verifier** runs nightly across all tenants; alerts on any chain break.

---

## Operational properties

| Property | Value |
|---|---|
| **RTO** | 4 hours |
| **RPO** | 1 hour |
| **Backup retention** | 30 days |
| **PITR window** | 7 days |
| **Restore test cadence** | Quarterly |
| **DR drill cadence** | Annual |
| **Incident response SLA (critical)** | <24h customer notification |
| **Status page** | status.ordrtreasuryfx.com *(planned)* |
| **Pen test cadence** | Annual, third-party |
| **Vulnerability scanning** | Daily (Dependabot) + on every PR (CodeQL) |

---

## Compliance footprint

| Framework | Status | Notes |
|---|---|---|
| SOC 2 Type II | In progress | Observation period started [date] |
| GDPR | Compliant | DPA, DPIA, data subject rights |
| ISO 27001 | Mapped | Annex A controls mapped, certification on roadmap |
| OWASP ASVS Level 2 | Verified | ZAP baseline scan clean |
| EMIR Refit | Implemented | UTI-stamped XML, ISO 20022 |
| MiFID II | Implemented | Best-ex evidence captured |
| ASC 815 / IFRS 9 | Implemented | Hedge accounting (designation + effectiveness) |

---

## What's NOT in this architecture (and why)

| Anti-feature | Rationale |
|---|---|
| **No microservices** | Single backend service. Two stateless tiers + a database is enough. Microservice complexity isn't worth it at our scale. |
| **No machine learning in the engine** | Determinism is the product. ML would compromise auditability. |
| **No self-managed Kubernetes** | Render's managed runtime is enough. We don't have a platform team and we don't want one yet. |
| **No multi-region active-active** | Adds complexity, not customer value at our current scale. On Enterprise roadmap. |
| **No event sourcing / CQRS** | WORM tables give us the audit trail without the operational cost of full event sourcing. |
| **No cookie-banner kludge** | EU privacy compliance via legitimate-interest minimal-cookie strategy + clear DPA. |

---

## Document references

- **System boundaries:** `docs/architecture/SYSTEM_BOUNDARIES.md`
- **Engine truth table:** `docs/architecture/ENGINE_TRUTH_TABLE.md`
- **API contracts:** `docs/architecture/API_CONTRACTS.md`
- **DB schema canon:** `docs/architecture/DB_CANON.md`
- **Architecture freeze:** `docs/architecture/architecture-freeze.md`
- **ADR index:** `docs/architecture/adr/`
- **SOC 2 controls:** `docs/compliance/soc2-controls-matrix.md`
- **GDPR DPA:** `docs/compliance/gdpr-dpa-status.md`
- **OWASP ZAP:** `docs/security/owasp-zap-baseline-report.md`
- **Attack surface:** `docs/security/attack-surface.md`

---

**Contact:** security@ordrtreasuryfx.com · Architecture questions: architecture@ordrtreasuryfx.com
