# Security Overview

**For:** Customer security teams, procurement, IT, and internal auditors evaluating ORDR TreasuryFX.
**Companion documents:** [Compliance status](compliance-status.md) · [DPA](../legal/dpa.md) · [Reference architecture](../internal/sales/reference-architecture.md)

---

## 1. Application security

### Authentication

- **JWT HS256** access tokens, 30-minute lifetime
- **Refresh tokens**, 7-day lifetime, rotated on use
- **bcrypt** password hashing, cost factor 12
- **CSRF** double-submit cookie + header (`X-CSRF-Token`) on all mutation routes; JWT Bearer-authenticated requests bypass CSRF check by design (token possession is the equivalent of CSRF protection)
- **Rate limiting**: 60 req/min per user/IP, TokenBucket implementation in middleware
- **Session invalidation**: forced on password change, role change, or admin-initiated revocation

### Authorization

- **RBAC**: 9 roles (Owner, Admin, Treasurer, Trader, Risk Officer, Controller, Auditor, Viewer, API) × 41 permissions × hierarchy level 0–15
- **Fail-closed**: missing permission = denied (no implicit grants)
- **Separation of Duties**: same user cannot both make and check an execution proposal in the 4-eyes pipeline
- **Multi-tenant isolation**: every query scoped to `tenant_id`; cross-tenant access is structurally impossible at the ORM layer
- **Superuser-only endpoints** use a separate dependency (`require_superuser`)

### Input validation

- **Pydantic v2** schemas validate every API input
- **Fail-closed validator** at engine boundary (`engine_v1/validator.py`) rejects malformed inputs with audit-ledger entry
- **No raw SQL** in route handlers — SQLAlchemy ORM only
- **Parameterized queries** throughout
- No unsafe HTML-injection APIs in user-facing rendering paths
- Server-side rendering is the default in Next.js App Router; user-supplied content is escaped by React

### Output handling

- **Strict CSP** with no inline scripts in production
- **`X-Content-Type-Options: nosniff`**
- **`X-Frame-Options: DENY`**
- **`Referrer-Policy: strict-origin-when-cross-origin`**
- **HSTS** with preload directive
- CORS configured per environment, **no wildcard in production**

---

## 2. Data security

### Encryption

- **TLS 1.3** in transit (TLS 1.2 minimum, with strong cipher suites)
- **AES-256** at rest (managed Postgres + S3-compatible backup storage)
- **Bcrypt** for passwords (cost 12); **never** plaintext or reversible
- **API keys** stored as bcrypt hashes; plaintext value visible to user only at creation
- **JWT signing keys** rotated quarterly; dual-key window for zero-downtime rotation

### Data classification

| Class | Examples | Handling |
|---|---|---|
| **Customer Data — restricted** | Hedge proposals, exposures, ledger entries | Stored in customer's region, encrypted, RBAC-gated |
| **Personal Data** | User name, email, login times | Stored alongside Customer Data, GDPR-governed |
| **Authentication credentials** | Password hashes, MFA secrets | bcrypt; never logged; rotated on personnel change |
| **Operational logs** | Application logs, access logs | 90-day retention, PII-redacted, separate from audit ledger |
| **Audit ledger** | WORM events with hash chain | 7-year retention minimum, append-only, integrity-verifiable |

### Multi-tenancy

ORDR TreasuryFX is **logically tenant-isolated** by default:

- Every persisted row carries `tenant_id`
- Every query is scoped at the ORM layer
- Hash chains are per-tenant from individual GENESIS_HASH
- Cross-tenant joins are not expressed anywhere in the codebase

**Enterprise** customers may opt for a **dedicated tenant database** (separate Postgres instance) for strict physical isolation. Available via Order Form add-on.

---

## 3. Audit and integrity

### WORM tables

`audit_events`, `calculation_runs`, `policy_revisions`, and `ledger_entries` are append-only. We enforce this at three layers:

1. **Application** — no UPDATE or DELETE statements emitted
2. **Database** — NO UPDATE / NO DELETE triggers on these tables
3. **Operational** — quarterly hash-chain verification job confirms no rewrites

If a row is ever discovered to have changed, it is treated as a Sev-1 incident regardless of cause.

### Hash chain

- **SHA-256**
- **Per-tenant** (each tenant has its own chain head)
- **GENESIS_HASH = 0000…0000** (64 zeros)
- Each row's hash = SHA-256(prev_hash || serialized_row)
- The current head is published in the daily integrity check
- Customers can verify the chain end-to-end using their exported audit pack

This is the difference between "we logged it" and "we can prove we didn't change it." The audit chain is what makes ORDR's claims provable to a Big 4 auditor without taking our word for it.

### Calculation reproducibility

Every hedge calculation is logged with its `RunEnvelope` — input snapshot, parameter set, deterministic seed. Re-running the kernel with the envelope produces a bit-identical output. This is what enables:

- Reproducible audit answers months later
- Regression testing in CI
- Forensic reconstruction of any historical decision

There is no ML, no random sampling, no time-dependent behavior. Determinism is the design.

---

## 4. Infrastructure security

### Hosting

- **Backend (FastAPI)**: Render.com — managed container hosting, auto-deploy on master push, EU and US regions
- **Frontend (Next.js)**: Vercel — edge CDN with origin in customer-selected region
- **Database**: Render PostgreSQL — managed, encrypted at rest, automated backups, point-in-time recovery to last 30 days
- **Cache**: Render-managed Redis (fail-open by design)

All providers are SOC 2 Type II audited (verifiable on each provider's trust page).

### Network

- **No direct internet access to database** (private network within Render)
- **API and frontend** are public-facing with WAF + DDoS protection at the provider layer
- **Internal admin endpoints** require superuser role + IP allowlist (Enterprise tier)

### Secrets

- **Render env vars** for all production secrets, encrypted at rest
- **No secrets in git history** (verified by `gitleaks` pre-commit hook + CI)
- **Quarterly rotation** of `JWT_SECRET`, database password, internal API keys
- **On-demand rotation** for any suspected leak; runbook: `docs/ops/secret-rotation-runbook.md`
- **Per-customer API keys** (`HK_live_*`) are bcrypt-hashed; plaintext shown to Customer once at creation

### Logging and monitoring

- **Sentry** for application errors and performance traces
- **Render-native** infrastructure metrics
- **PII redaction** in error reports (configured at the Sentry integration layer)
- **Audit ledger** (separate from operational logs) is the source of truth for governance events
- **No customer business data** is ever sent to Sentry; only stack traces, request paths, and identifiers

---

## 5. Operational security

### Change management

- All code changes via pull request
- Required: minimum one reviewer, all CI checks green
- Architecture freeze: any change to a frozen file (engine kernel, validator, audit, security core, WORM models) requires an Architecture Decision Record
- Pre-commit hooks: lint, type check, secret scan
- CI gates: ruff, pytest, tsc --noEmit, next build, Playwright E2E (master/dev only)

### Access control (employees)

- **SSO** for all employee tools (1Password, GitHub, Render, Vercel)
- **MFA** required everywhere it's offered
- **Least privilege**: developers do not have write access to production database
- **Production access** is by emergency procedure, logged, and reviewed
- **Off-boarding** within 1 business day of departure (immediate for involuntary)

### Vendor risk management

- Sub-processors evaluated on: SOC 2 / ISO 27001, DPA quality, data residency, breach history, financial stability
- Annual review; failure to maintain certifications triggers replacement
- Sub-processor list is **public** with **30-day** change notice

### Backup and recovery

- **Continuous WAL archiving** + **nightly base backup** (Render-native)
- **Weekly off-platform encrypted copy** to a non-Render cloud (defense against single-vendor failure)
- **Quarterly restore drill** with hash-chain integrity verification post-restore
- **RTO 4h critical / RPO 15min critical** for the application; per `docs/ops/business-continuity.md`

---

## 6. Compliance footprint

| Framework | Status | Mechanism |
|---|---|---|
| SOC 2 Type II | In progress, target Q3 2026 | Engagement with auditor; readiness attestation available |
| ISO 27001 | Roadmap (post-Series A) | — |
| GDPR | Compliant by design | DPA + SCCs Module Two + UK Addendum + privacy notice |
| CCPA / CPRA | Compliant | DPA §13 Service Provider terms |
| OWASP ASVS Level 2 | Annual external test | Pen-test summary on request under NDA |
| IFRS 9 / ASC 815 | Customer-implemented; platform supports both | Hedge effectiveness module |
| EMIR Refit | Customer-implemented; platform supports submission | Reg-reporting module |
| MiFID II best-execution | Customer-implemented; platform provides TCA | Pre-Trade TCA module |

For evidence of any of the above, see [compliance status](compliance-status.md) or contact security@ordrtreasuryfx.com.

---

## 7. What we do NOT do

This list is part of the security posture. The shortest path to a security incident is offering features that increase blast radius without a clear customer need.

- We do **not** train ML models on customer data — there is no ML in the product
- We do **not** sell or share customer data with third parties for any purpose
- We do **not** execute trades on behalf of customers (out of v1 scope by design)
- We do **not** allow customer data to leave its selected residency region
- We do **not** use cross-site tracking, advertising pixels, or third-party analytics on the customer-facing app
- We do **not** offer SSH or similar shell access to customer environments
- We do **not** retain customer data past the contractual retention period
- We do **not** allow ORDR staff to write to a customer's production tenant during onboarding (audit posture)

---

## 8. Open questions / known limitations

We publish what isn't yet covered, because honesty here is what makes the rest credible.

| Item | Status | Plan |
|---|---|---|
| SOC 2 Type II report | In progress | Q3 2026 |
| ISO 27001 certification | Not started | Post-Series A |
| FedRAMP / HIPAA | Not pursued | Out of scope unless a sustained customer need emerges |
| Multi-region active-active | Not implemented | Out of v1 scope; documented in BC plan |
| Customer-managed encryption keys (CMEK / BYOK) | Not implemented | Roadmap; Enterprise add-on Q4 2026 |
| Bug bounty program | Not yet | Public disclosure works for now; bounty after SOC 2 |
| Source code escrow | Available | Enterprise rider via Iron Mountain or EscrowTech |

---

## Contact

- Security questions, NDA-gated documents: **security@ordrtreasuryfx.com**
- Vulnerability disclosure: **security@ordrtreasuryfx.com** (see [trust center README](README.md#vulnerability-disclosure))
- Privacy, rights requests: **dpo@ordrtreasuryfx.com**
