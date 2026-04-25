# Trust Center

**ORDR TreasuryFX** publishes our security, compliance, privacy, and reliability posture in one place. This trust center is intentionally short, factual, and free of marketing prose.

> Public URL (when deployed): **https://trust.ordrtreasuryfx.com**
> Last reviewed: 2026-04-25

---

## At a glance

| Topic | Status | Detail |
|---|---|---|
| **Hosting** | EU (Frankfurt) + US (us-east-1), customer-selected | [Architecture](#architecture) |
| **Encryption** | TLS 1.3 in transit, AES-256 at rest | [Security overview](security-overview.md) |
| **Authentication** | JWT HS256 + bcrypt + CSRF + rate-limit | [Security overview](security-overview.md) |
| **RBAC** | 9 roles × 41 permissions, fail-closed | [Security overview](security-overview.md) |
| **Audit** | SHA-256 hash chain, WORM tables, per-tenant | [Security overview](security-overview.md) |
| **SOC 2 Type II** | In progress, Q3 2026 target | [Compliance status](compliance-status.md) |
| **GDPR** | DPA + SCCs Module Two + UK Addendum | [DPA](../legal/dpa.md) |
| **CCPA / CPRA** | Service Provider terms in DPA §13 | [DPA](../legal/dpa.md) |
| **Privacy notice** | Public | [Privacy notice](../legal/privacy-notice.md) |
| **Sub-processors** | Public, 30-day change notice | [Sub-processors](../legal/sub-processors.md) |
| **Penetration test** | Annual external test; summary letter on request under NDA | [Pen-test policy](#penetration-testing) |
| **Status page** | https://status.ordrtreasuryfx.com | Live uptime + incidents |
| **Disclosure** | security@ordrtreasuryfx.com | [Vulnerability disclosure](#vulnerability-disclosure) |

---

## Architecture

ORDR TreasuryFX is a single-tenant-database model with regional residency. Customer Data never leaves the customer's selected region (EU Frankfurt or US us-east-1). The deterministic engine runs in a stateless application tier; all persistent data lives in a managed Postgres instance with continuous WAL archiving and 30-day point-in-time recovery, plus an off-platform encrypted backup.

The platform is **architecture-frozen at v1**: no machine-learning, no auto-learning, no broker execution, no stateful decision logic. This is a deliberate constraint — it makes the platform deterministic, testable, and audit-defensible. See `docs/architecture/architecture-freeze.md`.

Detailed architecture: [Reference architecture (one-pager)](../internal/sales/reference-architecture.md)

---

## Documents available without NDA

- [Privacy notice](../legal/privacy-notice.md)
- [Sub-processors list](../legal/sub-processors.md)
- [DPA template](../legal/dpa.md) (your executed copy will be specific to your contract)
- [MSA template](../legal/msa-template.md) (your executed copy will be specific to your contract)
- [Security overview](security-overview.md) (this trust center)
- [Compliance status](compliance-status.md) (this trust center)
- [SOC 2 Type II readiness attestation](soc2-readiness-attestation.md) (until full Type II)

---

## Documents available under NDA

- Penetration test executive summary (annual, redacted)
- Threat model summary
- Disaster recovery and business continuity plan
- SOC 2 Type II report (when delivered)
- Internal security policies (information security, access control, change management, incident response, vendor risk, data classification, encryption, retention)
- Most-recent backup-restore drill attestation

To request: email **security@ordrtreasuryfx.com** with your NDA in hand or signed; we'll counter-sign within 2 business days.

---

## Penetration testing

ORDR conducts an annual external penetration test by an independent firm. Scope:

- Application-layer (OWASP ASVS Level 2)
- API authentication and authorization (including RBAC + multi-tenant isolation)
- Cryptographic implementations (TLS, JWT, bcrypt, hash chain)

We provide a **redacted executive summary** under NDA. We do not share full reports — that's industry standard, because they can be a roadmap for an attacker. The summary covers: scope, methodology, findings count by severity, current remediation status, and the firm's overall opinion. See [pen-test summary template](../internal/sales/pentest-summary-template.md) for the structure.

---

## Vulnerability disclosure

We take security reports seriously. Please report potential vulnerabilities to **security@ordrtreasuryfx.com** with:

- Description of the issue
- Reproduction steps
- Suggested impact
- Whether you'd like to be credited

We commit to:

- Acknowledgment within 1 business day
- Initial triage within 3 business days
- Remediation timeline based on severity (Critical: 24h, High: 7d, Medium: 30d, Low: 90d)
- Optional public credit after remediation
- No legal action against good-faith researchers operating within our [safe harbor](#safe-harbor)

### Safe harbor

We will not pursue or support legal action against researchers who:

1. Make a good-faith effort to avoid privacy violations, destruction of data, and interruption of service
2. Limit testing to systems under ORDR's direct control (do not test customer integrations or third-party services)
3. Do not exfiltrate data beyond what is necessary to demonstrate the issue
4. Do not publicly disclose details of unfixed issues
5. Provide ORDR a reasonable time to remediate before any public disclosure

---

## How we evaluate ourselves

These are commitments we hold ourselves to and will publish status against on this page over time:

- **Time-to-acknowledge** for security reports: 1 business day (target 100%)
- **Time-to-remediate** Critical: 24 hours (target 100%)
- **Penetration test** cadence: annual (last test: see compliance-status.md)
- **Backup-restore drill** cadence: quarterly (most recent: see compliance-status.md)
- **Sub-processor change notice** lead time: 30 days minimum
- **Open Critical findings**: 0 (any non-zero is published with remediation date)

---

## Contact

| Topic | Address |
|---|---|
| Security incidents, vulnerability reports | security@ordrtreasuryfx.com |
| Privacy, GDPR rights requests | dpo@ordrtreasuryfx.com |
| Sales, demos, contracts | hello@ordrtreasuryfx.com |
| General | hello@ordrtreasuryfx.com |
| Legal entity address | [filled per legal entity registration] |
