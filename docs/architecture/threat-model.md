# Threat Model

**Audience:** ORDR engineering, security reviewers, customer security teams under NDA
**Methodology:** STRIDE per data flow + treasury-specific scenarios
**Last reviewed:** 2026-04-25 — review at least annually and after any change to a frozen file
**Companion:** [Reference architecture](../internal/sales/reference-architecture.md) · [Security overview](../trust-center/security-overview.md)

---

## Scope

This threat model covers the ORDR TreasuryFX SaaS application and its sub-processor surface. It does NOT cover:

- Customer-side controls (their network, their endpoints, their bank channels)
- Sub-processors' internal infrastructure (each publishes their own attestations)
- Physical-layer threats to cloud datacenters (cloud-inherited)

---

## Trust boundaries

```
+------------------+         +------------------+         +------------------+
|  Customer staff  |  TLS    |  Vercel edge +   |  TLS    |  Render-hosted   |
|   (browser /     +-------->+    Next.js       +-------->+   FastAPI app    |
|    API client)   |  1.3    |   frontend       |  mTLS*  |   (engine + DB   |
+------------------+         +------------------+         |   driver layer)  |
                                                          +--------+---------+
                                                                   |
                                                                   v (private)
                                                          +------------------+
                                                          |  Render-managed  |
                                                          |  PostgreSQL      |
                                                          |  + Redis cache   |
                                                          +------------------+
                                                                   |
                                                                   v (read-only sync)
                                                          +------------------+
                                                          |  Off-platform    |
                                                          |  encrypted       |
                                                          |  backup (S3-     |
                                                          |  compatible)     |
                                                          +------------------+

* internal — between Vercel edge and Render origin
```

Each `→` is a trust boundary where data crosses from one privilege domain to another. STRIDE analysis is applied per boundary.

---

## STRIDE analysis

### S — Spoofing

| # | Threat | Mitigation | Residual risk |
|---|---|---|---|
| S1 | Attacker forges a JWT to impersonate a user | HS256 signed with 64-byte secret rotated quarterly; signature verified server-side every request | Low — depends on JWT_SECRET secrecy and bcrypt password strength |
| S2 | Attacker uses a stolen API key (`HK_live_*`) | bcrypt-hashed at rest; never logged; revocable per-key in seconds | Low if customer rotates promptly on suspicion |
| S3 | Attacker spoofs an internal service identity | Internal service-to-service is intra-VPC only; no external attack surface | Negligible |
| S4 | Attacker spoofs a customer's bank for a confirmation message (MT103) | Confirmations are one-way (we send to the bank); bank's own auth posture governs the inbound channel | Customer-controlled |
| S5 | Attacker phishes a customer admin to extract credentials | MFA strongly encouraged; SSO supported on Enterprise; in-app session expiry 30 min | Customer-controlled; out-of-platform |

### T — Tampering

| # | Threat | Mitigation | Residual risk |
|---|---|---|---|
| T1 | Attacker modifies a hedge proposal in transit | TLS 1.3 + JWT signature on the request | Negligible |
| T2 | Attacker tampers with stored audit data | WORM enforcement at app + DB triggers; SHA-256 hash chain; quarterly integrity verification job | Low — chain divergence is detected |
| T3 | Attacker tampers with WORM data via DB direct access | Production DB access is by emergency procedure only; logged; reviewed; no developer has standing write access | Low — depends on access-control enforcement |
| T4 | Insider with prod access edits a row to "fix" a number | Same as T3, plus: hash chain divergence triggers Sev-1 regardless of intent | Detected within 24h via integrity job |
| T5 | Attacker tampers with backups | Off-platform backups are encrypted with a key separate from production; integrity-checked on restore drills | Low |
| T6 | Attacker injects malicious code via dependency | Dependabot + pip-audit + npm audit; lockfile-only installs; no auto-merge of dep updates | Low for popular deps; medium for long-tail |
| T7 | Attacker modifies a deployment artifact in the supply chain | OIDC-based deploy; no long-lived deploy keys; deploy logs monitored | Low |

### R — Repudiation

| # | Threat | Mitigation | Residual risk |
|---|---|---|---|
| R1 | User claims "I didn't approve that hedge" | Every approval is recorded in audit_events with user identity, timestamp, IP, and chain hash; non-repudiable post-hoc | Negligible |
| R2 | Admin claims "I didn't change that policy" | Policy revisions are WORM with the user's signature; chain-verified | Negligible |
| R3 | Attacker tries to delete logs to cover tracks | Logs are append-only; DB triggers prevent deletion; backups are immutable for retention period | Low |
| R4 | User claims "the system did it, not me" | All system-initiated actions are tagged with a `system` actor; user-initiated actions have explicit user identity; no ambiguity | Negligible |

### I — Information Disclosure

| # | Threat | Mitigation | Residual risk |
|---|---|---|---|
| I1 | Cross-tenant data leak | Multi-tenant isolation at ORM layer; tenant_id scoped on every query; no cross-tenant joins exist in the codebase; pen-tested annually | Low |
| I2 | API leaks sensitive info via verbose error messages | Error responses are sanitized; stack traces only in Sentry, not in client responses | Low |
| I3 | Backups intercepted in transit to off-platform storage | Encrypted with AES-256 client-side before upload; key managed separately from production runtime | Low |
| I4 | Sentry error reports leak Customer Data | Sentry integration scrubs PII fields; error context redacted; quarterly review of what's getting through | Low — with active maintenance |
| I5 | URL parameters or query strings leak data | No sensitive data in URLs (CSRF token in cookie, JWT in Authorization header, never URL); referer policy strict | Low |
| I6 | Browser cache leaks Customer Data | `Cache-Control: no-store` on all data endpoints; service worker scoped narrowly | Low |
| I7 | Logs leak Customer Data | Application logs do not include Customer business data — only request paths, identifiers, and error context | Low |
| I8 | Subprocessor leaks Customer Data | Sub-processors evaluated annually for SOC 2 / ISO 27001; DPAs in place; sub-processor breaches trigger our own breach process | Low |

### D — Denial of Service

| # | Threat | Mitigation | Residual risk |
|---|---|---|---|
| D1 | Application-layer DoS (slowloris, large payloads) | Render-provider WAF + 60 req/min rate limit + payload size cap | Low |
| D2 | Authenticated user floods the API | Per-user rate limit (60/min); circuit breaker on misbehaving users | Low |
| D3 | Attacker exhausts DB connections | Connection pooling with max-conn cap; query timeout enforced | Low |
| D4 | Market data feed outage cascades | Cache is fail-open by design — Redis outage does NOT block market data | Negligible to internal users |
| D5 | Sub-processor (Render, Vercel) outage | Documented in [BC plan](../ops/business-continuity.md); standby region; status-page communication | Customer-visible during outage; recovery within RTO |

### E — Elevation of Privilege

| # | Threat | Mitigation | Residual risk |
|---|---|---|---|
| E1 | Horizontal privilege escalation (user A acts as user B) | RBAC fail-closed on every endpoint; per-request user context; no shared global state in the app | Low |
| E2 | Vertical privilege escalation (user → admin) | Superuser role gated by separate dependency (`require_superuser`); no path from user role to admin role without admin grant | Low |
| E3 | Cross-tenant escalation (tenant A admin → tenant B data) | tenant_id scoped on every query; structurally impossible to express cross-tenant access in the ORM | Low |
| E4 | Maker/checker bypass — same user makes and approves | Separation of Duties enforced at service layer; `same user cannot make and check` is a unit-tested invariant | Low |
| E5 | Engine bypass — user submits a calculation that skips the validator | Validator is invoked at the engine boundary, not optionally; no bypass path in the codebase | Low |
| E6 | Insider with admin role abuses access | Audit trail captures every admin action with chain hash; quarterly admin-action review | Detected post-hoc; not prevented |

---

## Treasury-specific threat scenarios

These are the scenarios that don't fit STRIDE neatly but are specific to a governance platform.

### TR1: Hash-chain forge attempt

**Threat:** Attacker (insider or external) attempts to insert, modify, or delete a row in a WORM table such that the chain still verifies.

**Why it's hard:** SHA-256 of (prev_hash || row) means changing any historical row breaks the chain at that point and every point after. Forging a single row requires recomputing every subsequent hash — possible if the attacker has full DB access AND can replace every downstream row.

**Mitigations:**

- WORM triggers prevent UPDATE/DELETE — DB-level enforcement
- Application has no UPDATE/DELETE statements for WORM tables
- Chain head is published daily and stored externally (off-platform backup) — comparing the published head against the recomputed head detects any tampering
- Quarterly integrity job recomputes the entire chain end-to-end
- Customer can independently verify the chain using their exported audit pack

**Residual risk:** Low. An attacker would need: standing prod DB write access (which no developer has), AND the ability to replace every downstream row, AND avoid the daily head-publication. Three independent mitigations in a row.

### TR2: 4-eyes circumvention

**Threat:** Same user creates and approves a hedge proposal, defeating the maker/checker control.

**Mitigations:**

- Application-layer SoD check on every approval action
- Database-level constraint: `creator_id != approver_id` on the proposal record
- Audit event captures creator and approver — discrepancies surface in the audit pack
- Pen-test scope explicitly tests this scenario annually

**Residual risk:** Low.

### TR3: Calculation drift / determinism violation

**Threat:** A code change or environmental change causes the same inputs to produce different outputs, breaking reproducibility.

**Mitigations:**

- `engine_v1/` is architecture-frozen — modifications require an ADR
- CI runs deterministic-replay tests on every PR (replay historical envelopes, compare output bit-by-bit)
- No floating-point comparisons without explicit tolerance documentation
- No time-dependent or random behavior in the engine
- No ML, no auto-learning, no stateful decision logic

**Residual risk:** Low — but this is the highest-priority test in CI because the consequence is silent.

### TR4: Reg-reporting integrity (UTI collision / duplicate)

**Threat:** Two reporting events get the same UTI, or a UTI is reused across reports — violates EMIR uniqueness.

**Mitigations:**

- UTI generation uses a deterministic scheme (tenant_id + timestamp + counter + hash suffix)
- Database constraint: UTI is UNIQUE per tenant
- Reporting submission is logged to audit ledger with the UTI; replay detects duplicates

**Residual risk:** Low.

### TR5: ERP connector compromise

**Threat:** A customer's ERP credentials in ORDR are exfiltrated; attacker reads or writes ERP data.

**Mitigations:**

- ERP credentials encrypted at rest with AES-256
- Read-only credentials preferred where the integration allows
- Activity logged to audit ledger; unusual activity alerts
- Rotation by customer at any time

**Residual risk:** Medium — depends on customer's own credential hygiene. We can't fully control this; we minimize it.

### TR6: Banking message forgery (MT103 / pain.001)

**Threat:** Attacker generates an unauthorized payment message that the customer's bank executes.

**Mitigations:**

- ORDR generates *messages*, not payments — the bank's own authentication and SoD govern execution
- Messages are generated in response to an approved-and-committed hedge in the ledger only
- Each message is logged with the originating ledger entry
- Banks typically require their own authorization step regardless

**Residual risk:** Low — bank's controls are an additional defense layer.

### TR7: Audit-pack tampering after export

**Threat:** Customer's user receives an audit pack and modifies it before delivering to their auditor.

**Mitigations:**

- Audit pack contains the chain head hash signed at export time
- Auditor can verify the chain against ORDR's published head (under NDA / customer consent)
- Tamper of the export breaks the verifiable chain

**Residual risk:** Low — and detectable.

---

## Threats accepted (with rationale)

A complete threat model documents what we *don't* defend against.

| # | Threat | Why we accept | Compensating control |
|---|---|---|---|
| A1 | Single-cloud-provider catastrophic failure | Multi-cloud is out of v1 scope; cost/complexity not justified at this stage | Off-platform backups + RTO 4h; documented in BC plan |
| A2 | Insider with full prod access acting maliciously over extended period | No tractable defense for full insider with time | 4-eyes on production access; quarterly access review; audit log review; small team is high-trust |
| A3 | State-actor-level attack with novel zero-day in cryptography | Out of practical defense scope for any commercial SaaS | Standard cryptography; rapid patching; insurance |
| A4 | Customer's own staff phishing | Customer-side problem | MFA strongly recommended; SSO available; session expiry |
| A5 | Customer's auditor accessing data with stolen audit account | Customer manages auditor account lifecycle | Audit role is read-only; revocable; separately auditable |
| A6 | Sub-processor sub-sub-processor breach | We have direct DPA with sub-processor; sub-sub-processor is one layer removed | Sub-processor evaluation; chain of DPAs; right to terminate sub-processor on objection |

---

## Review cadence

| Trigger | Action |
|---|---|
| Annual | Full threat-model review with engineering team |
| New module added | STRIDE analysis on the new module's data flows |
| New sub-processor added | Sub-processor section updated; DPA quality reviewed |
| Pen-test report received | Findings reconciled against threat model; gaps added |
| Incident occurred | Affected scenario re-validated; mitigations re-rated |
| Customer asks for a specific scenario | Added to scenario list; reviewed |

---

## Distribution

- Internal: this document is the source of truth
- External (under NDA): redacted version in the assurance pack — sub-processor list and TR-prefixed treasury-specific scenarios are visible; STRIDE-level details summarized rather than itemized
- Public: existence of threat model + summary of methodology in [security overview](../trust-center/security-overview.md)
