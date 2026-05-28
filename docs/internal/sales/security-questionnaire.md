# ORDR TreasuryFX — Security Questionnaire Response Library

**Purpose:** Pre-filled responses to the standard procurement security questionnaires. Copy/paste answers into SIG Lite, CAIQ v4, VSAQ, or custom RFIs.

**Reviewed by:** [Compliance lead name + date]
**Last updated:** 2026-05-27

> **Usage:** When a prospect's procurement team sends a questionnaire, find the matching question domain below, copy the response, adjust to their phrasing, and attach the linked evidence document. Maintain a log of every send + change in `docs/internal/sales/questionnaire-log.md`.

---

## A. Company & program

**A1. Company legal name, jurisdiction, primary contact.**
> ORDR TreasuryFX [Legal Entity Name], registered in [Jurisdiction]. Primary security contact: security@ordrtreasuryfx.com.

**A2. Information security program ownership.**
> The CISO function is currently owned by the founder/CEO with quarterly reviews by an external security advisor. A dedicated CISO hire is planned post-funding (within 12 months).

**A3. Security policies in place.**
> Policies covering: access control, change management, incident response, data classification, encryption, vulnerability management, vendor management, business continuity, secure development. Available on request under NDA.

**A4. Last independent security assessment.**
> [Provider name], [date]. Findings: [N] critical / [N] high / [N] medium / [N] low — all critical and high resolved. Annual cadence.

---

## B. Compliance & certifications

**B1. SOC 2 Type II report.**
> Audit in progress. Observation period began [date]; report expected [date]. Bridge letter and SOC 2 Type I (if applicable) available under NDA.

**B2. ISO 27001 certification.**
> Controls mapped to ISO 27001 Annex A. Formal certification on roadmap (target: [year]). Mapping document available on request.

**B3. PCI DSS.**
> Not applicable. ORDR TreasuryFX does not store, process, or transmit cardholder data. Payment processing for the SaaS subscription itself is handled by [Stripe / your provider], a PCI DSS Level 1 certified vendor.

**B4. GDPR compliance.**
> DPA available; standard contractual clauses included. Data subject rights wired into the platform (export + delete). Data residency: EU (Frankfurt) for EU customers; US for North American customers. DPO contact: dpo@ordrtreasuryfx.com.

**B5. CCPA / state privacy laws.**
> Compliance program in place. Privacy notice published. Data deletion request process documented.

**B6. HIPAA / FERPA / PCI / FedRAMP.**
> Not applicable to current product scope. Out-of-scope frameworks are not pursued.

---

## C. Application security

**C1. Authentication mechanisms.**
> JWT (HS256) with 30-minute access tokens and 7-day refresh tokens. Passwords are bcrypt-hashed with cost factor 12. SAML 2.0 / OIDC SSO available on Enterprise tier. MFA via TOTP available on all tiers.

**C2. Authorization model.**
> Role-Based Access Control with 9 roles, 41 permissions, hierarchy levels 0–15. Fail-closed by default (missing permission = denied). Separation of Duties enforced for sensitive workflows (maker/checker on hedge proposals). **Two app-startup guards (`assert_routes_have_canonical_auth` + `assert_api_key_routes_safe`) walk the FastAPI route graph at boot and refuse to start if any route is missing canonical authentication or sits outside the API-key allowlist — preventing the "parallel auth helper bypasses tenant context" class of bug structurally rather than via review.**

**C3. Session management.**
> Stateless JWT-based sessions. Refresh-token rotation on each refresh. CSRF double-submit cookie + header protection on all state-changing operations.

**C4. Input validation.**
> All inputs validated server-side via Pydantic schemas before reaching business logic. Engine inputs additionally pass through a fail-closed validator (`engine_v1/validator.py`).

**C5. SQL injection / ORM safety.**
> SQLAlchemy ORM used for all database access. No raw SQL in route handlers. Parameterized queries enforced.

**C6. XSS protection.**
> React's JSX escaping is on by default. We do not use unsafe HTML-injection APIs in user-facing paths. Content Security Policy headers enabled in production.

**C7. CSRF protection.**
> Double-submit cookie pattern (`csrf_token` cookie + `X-CSRF-Token` header) on all mutating requests. JWT Bearer-authenticated API requests are exempt by design (Bearer auth is not browser-driven).

**C8. Rate limiting.**
> TokenBucket-based, 60 requests/minute per user/IP. Configurable per endpoint.

**C9. Security headers.**
> X-Content-Type-Options: nosniff; X-Frame-Options: DENY; Referrer-Policy: strict-origin-when-cross-origin; Strict-Transport-Security with preload; Content-Security-Policy (production-tuned).

**C10. Dependency management.**
> Dependabot enabled on GitHub. Critical CVEs patched within 7 days; high within 30 days. Lockfile-pinned dependencies (poetry.lock, package-lock.json).

---

## D. Data security

**D1. Encryption in transit.**
> TLS 1.3 enforced for all client and inter-service communication. Managed by Render (backend) and Vercel (frontend). HSTS preload enabled.

**D2. Encryption at rest.**
> AES-256 for database (Render-managed PostgreSQL). Per-tenant Fernet encryption for sensitive connector credentials (`CONNECTOR_ENCRYPTION_KEY`). Key rotation supported.

**D3. Key management.**
> Production secrets stored in Render's managed environment variables (encrypted at rest). Connector encryption keys are tenant-scoped and rotatable. JWT signing secret is environment-specific and rotatable.

**D4. Data classification.**
> Three tiers: Public (marketing content), Confidential (customer business data), Restricted (auth credentials, encryption keys). Restricted data never logged in plaintext.

**D5. Data retention.**
> Customer-controlled. Default: 7-year retention on WORM tables (audit_events, calculation_runs, policy_revisions, ledger_entries) per IFRS 9 / SOX expectations. Operational data retained per customer policy.

**D6. Data deletion.**
> Customer-initiated tenant deletion: full dataset purged within 30 days, except where regulatory retention applies (audit chain, regulatory submissions). Anonymization cron available for GDPR right-to-erasure.

**D7. Backups.**
> Daily automated backups via Render PG. Point-in-time recovery within 7 days. Retention: 30 days. Quarterly restore tests performed.

**D8. Backup encryption.**
> Encrypted at rest with the same AES-256 standard as primary storage.

**D9. Data residency.**
> EU customers: data resident in Frankfurt (eu-central-1). North American customers: us-east-1. No cross-region replication without customer consent.

**D10. Multi-tenancy isolation.**
> **Database-level enforcement** via PostgreSQL `FORCE ROW LEVEL SECURITY` on tenant-scoped tables (`positions`, `calculation_runs`, and downstream tables). The application sets `app.current_tenant_id` per-transaction via `set_config()`; RLS policies match this value against `company_id` on every row. A request that arrives without a valid tenant context matches the sentinel `NO_TENANT` value and returns empty — not "everything" — making accidental cross-tenant reads structurally impossible at the database layer, not just the application layer. Enterprise tier additionally offers a dedicated database instance for full physical isolation.

---

## E. Audit & logging

**E1. Audit logging.**
> All user actions logged to `audit_events` table (WORM, append-only, NO UPDATE / NO DELETE enforced at PostgreSQL level). Logs include user ID, IP, action, resource, timestamp, and result.

**E2. Log retention.**
> 7 years on the immutable audit chain (WORM). Operational logs (Sentry, application logs) retained 90 days.

**E3. Log integrity.**
> WORM tables enforced via PostgreSQL triggers. Audit chain hashed with SHA-256, per-tenant. Daily verification cron alerts on chain breaks.

**E4. Centralized logging.**
> Application logs to Sentry (production DSN). Structured JSON logs. PII-redaction in log pipeline.

**E5. Privileged access logging.**
> Admin actions logged separately and reviewed monthly. All superuser-only endpoints log full request context.

---

## F. Network security

**F1. Network architecture.**
> Three-tier deployment: Vercel edge (frontend), Render container (backend), Render managed PostgreSQL. No exposed admin interfaces. No bastion hosts (managed-PaaS model).

**F2. Firewall / WAF.**
> Render-managed firewall + Cloudflare DDoS protection (via Vercel). Rate limiting at application layer.

**F3. DDoS protection.**
> Cloudflare (via Vercel for frontend), Render's managed protection for backend.

**F4. VPN / private networking.**
> Backend ↔ database connection via Render's private network (not internet-routed).

**F5. Network monitoring.**
> Render + Vercel managed monitoring. Application performance monitoring via Sentry. Custom dashboards for request rate, error rate, p95 latency.

---

## G. Identity & access

**G1. SSO support.**
> SAML 2.0 and OIDC available on Enterprise tier. Standard OAuth providers (Google, Microsoft) on all tiers.

**G2. MFA support.**
> TOTP-based MFA available on all tiers. Enforced for admin/superuser accounts by default.

**G3. Provisioning / deprovisioning.**
> Admin-initiated user lifecycle. SCIM provisioning on Enterprise tier roadmap (target: [quarter]).

**G4. Privileged access management.**
> Superuser role limited to platform operations. Customer admin role for tenant management. Principle of least privilege applied across all roles.

**G5. Service accounts / API keys.**
> API keys are bcrypt-hashed with `HK_live_` prefix. Tenant-scoped. Rotatable. Revocable. Activity logged.

---

## H. Incident response

**H1. Incident response plan.**
> Documented IR plan available on request. Roles: founder/CEO (incident commander), engineering lead (technical lead), customer success (comms lead).

**H2. Customer notification SLA.**
> Material incidents: 72-hour notification (GDPR-aligned). Critical incidents affecting customer data: ASAP, target <24 hours.

**H3. Forensics capability.**
> Immutable audit logs (WORM tables) provide tamper-evident forensic trail. Application logs retained 90 days. Engagement with external forensics provider on retainer for serious incidents.

**H4. Tabletop exercises.**
> Quarterly tabletop exercises with engineering team. Annual full-team drill. **Operating evidence**: 2026-05-13 → 2026-05-16 production P1 incident (RLS `SET LOCAL` bind-parameter rejection) was detected on post-deploy smoke, root-caused in two minutes, and resolved 4 minutes after detection. Full post-mortem committed the same day. The incident also surfaced a real monitoring gap (RISK-OPS-MON-01 — Sentry 5xx alert rule not yet configured); closeout plan is documented in `docs/runbooks/ops-monitoring.md`.

**H5. Bug bounty / responsible disclosure.**
> security@ordrtreasuryfx.com with PGP key. Public disclosure policy. No formal bug bounty program currently (planned post-Series A).

---

## I. Business continuity

**I1. RTO / RPO.**
> RTO: 4 hours. RPO: 1 hour (point-in-time recovery within 7 days). Documented in BC plan.

**I2. Disaster recovery testing.**
> Quarterly restore tests. Annual full DR drill (target: from clean infrastructure to fully operational within RTO).

**I3. Geographic redundancy.**
> Single-region per customer (EU or US). Multi-region active-active on roadmap (Enterprise tier, target: [year]).

**I4. Vendor concentration risk.**
> Primary providers: Render (backend + DB), Vercel (frontend). Failover to alternative providers documented; estimated cutover time 48 hours.

---

## J. Vendor & supply chain

**J1. Sub-processor list.**
> Maintained at [marketing-site-url]/sub-processors. Current sub-processors include: Render (hosting), Vercel (hosting), Sentry (error monitoring), [TwelveData / market data provider], [Stripe / payments]. 30-day notice on additions.

**J2. Vendor due diligence.**
> All vendors with access to customer data are required to have SOC 2 (or equivalent) and a signed DPA. Annual review.

**J3. Open-source software.**
> Lockfile-pinned. License audit performed quarterly. No GPL/AGPL dependencies in production paths.

**J4. Software supply chain.**
> CI/CD pipelines (GitHub Actions) with branch protection, required reviews, signed commits encouraged. Dependabot for vulnerability monitoring.

---

## K. Specific to ORDR TreasuryFX (treasury domain)

**K1. Hedge accounting standards supported.**
> IFRS 9 and ASC 815. Effectiveness testing (prospective + retrospective), designation lifecycle, journal entry export to ERP.

**K2. Regulatory reporting supported.**
> EMIR Refit (UTI-stamped XML), MiFID II best-ex evidence, CFTC reporting, SWIFT MT103, ISO 20022 pain.001.001.09 CBPR+.

**K3. ERP integrations.**
> QuickBooks Online, Xero, NetSuite, Sage Intacct, Microsoft Dynamics 365. OAuth 2.0 flows. Per-tenant credential encryption (Fernet).

**K4. Banking integrations.**
> Interactive Brokers (live). SWIFT-network banks (via SWIFT MT103). Additional banking integrations on quarterly roadmap.

**K5. Determinism guarantees.**
> The hedge calculation engine (`engine_v1/`) is fully deterministic and version-pinned. Every calculation is reproducible byte-for-byte given the same inputs and policy version. No machine-learning components in the engine.

**K6. Tamper-evidence.**
> All calculations and policy changes are stored in WORM tables (no UPDATE, no DELETE allowed at the database layer). A SHA-256 hash chain links all RunEnvelopes, verified daily by an automated cron job. Chain breaks trigger alerts within 24 hours.

**K7. Separation of Duties.**
> The same user account cannot both create (maker) and approve (checker) a hedge proposal. Enforced in code, logged in the audit chain.

---

## L. Frequently weaponized procurement gotchas

**L1. "Are you SOC 2 Type II certified?"**
> If audit is in progress: *"Audit in progress; observation period started [date]; Type II report expected [date]. Type I report and bridge letter available under NDA."* Don't say "yes" prematurely.

**L2. "Do you have $5M cyber liability insurance?"**
> Negotiable. Many large procurement teams accept $1M minimum + commitment to scale with contract value. Have the policy documented and ready to attach.

**L3. "Do you support SCIM provisioning?"**
> Be honest: roadmap, not shipped. State the workaround (admin-driven via API) and the target ship quarter.

**L4. "Penetration test report?"**
> Provide redacted version or executive summary. Never send the full report with raw vulnerabilities even if remediated — share the attestation page.

**L5. "Source code escrow?"**
> Available on Enterprise tier. Use a standard escrow agent (Iron Mountain, EscrowTech).

**L6. "Right to audit?"**
> Acceptable in MSA: customer right to audit security controls annually with 30-day notice, customer's reasonable cost. Reject any "any time, any cost" language.

**L7. "Liability cap?"**
> Standard SaaS practice: 12 months of fees. Push back hard on uncapped liability — that's a deal-killer for the business model.

---

## M. Response process

1. Receive questionnaire (security@ or via the prospect's procurement portal)
2. Acknowledge within 1 business day with target turnaround date
3. Map questions to this library; pull responses
4. Flag any new question types — answer once and add to this document
5. Internal review (founder + advisor) before sending
6. Send via the prospect's preferred channel (most use OneTrust, Whistic, or Vendr)
7. Log in `docs/internal/sales/questionnaire-log.md`: prospect, questionnaire type, send date, response date, follow-ups
