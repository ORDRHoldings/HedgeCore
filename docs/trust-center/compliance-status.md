# Compliance Status

**Last reviewed:** 2026-04-25 — review monthly
**Format:** Each row says where we are, what evidence exists, and what's still open.

---

## SOC 2 Type II

| Field | Status |
|---|---|
| Engagement | Auditor selection in progress (target: Big 4 or top mid-tier with SaaS specialty) |
| Trust Services Criteria in scope | Security, Availability, Confidentiality (Privacy and Processing Integrity deferred — Privacy is covered separately under GDPR; Processing Integrity is largely a treasury-specific concept covered by the audit ledger and is on the v2 SOC 2 expansion list) |
| Type I report | Targeted Q2 2026 |
| Type II observation period | Targeted Q3 2026 (90-day minimum window) |
| Type II report delivery | Targeted Q4 2026 |
| Bridge document | [SOC 2 readiness attestation](soc2-readiness-attestation.md) — published; updated monthly until Type II is delivered |

**What this means for customers today:** Customers who require SOC 2 Type II for procurement signing can:

1. Use the readiness attestation as an interim
2. Negotiate a SOC 2 contingency clause in the Order Form (template language available — buyer's right to terminate without penalty if Type II is not delivered by a target date)
3. Receive the Type II report as soon as it is issued

We do not claim SOC 2 Type II compliance until the report is in hand. Anything else is misleading.

---

## ISO 27001

Not started. Planned for post-Series A. We expect the SOC 2 Type II workstream to produce 70% of the artifacts required for ISO certification.

---

## GDPR (UK + EU + Switzerland)

| Element | Status | Evidence |
|---|---|---|
| Lawful basis documented | ✓ | [Privacy notice](../legal/privacy-notice.md) |
| Data Processing Addendum | ✓ | [DPA template](../legal/dpa.md) |
| SCCs Module Two | ✓ | DPA Annex referenced |
| UK Addendum (B1.0) | ✓ | DPA |
| Swiss FADP modifications | ✓ | DPA |
| Sub-processor list (public) | ✓ | [Sub-processors](../legal/sub-processors.md) |
| Sub-processor change notice | ✓ | 30 days minimum |
| Data residency (EU-only option) | ✓ | Frankfurt region available |
| Data Protection Officer | ✓ | dpo@ordrtreasuryfx.com (designated; external counsel reviews) |
| ROPA (Records of Processing Activities) | Internal — available under NDA | Maintained by DPO |
| DPIA template | Internal — available under NDA | For Customer DPIA support |
| Subject access request workflow | ✓ | Per privacy notice; 30-day SLA |
| Personal Data Breach process | ✓ | Per [DPA](../legal/dpa.md) and [incident response plan](../ops/incident-response-plan.md); 72-hour assessment window |

---

## CCPA / CPRA

| Element | Status |
|---|---|
| Service Provider terms in DPA | ✓ DPA §13 |
| "Do not sell or share" — applicable? | ✓ Honored automatically: ORDR does not sell or share Personal Information for cross-context behavioural advertising |
| Right-to-know workflow | ✓ Privacy notice |
| Right-to-delete workflow | ✓ Privacy notice |
| Right-to-correct workflow | ✓ Privacy notice |
| Sensitive PI use | ✗ ORDR does not use Sensitive PI for any non-service purpose |

---

## Hedge accounting (customer-facing, not ORDR's compliance)

ORDR provides modules that **support** customer compliance with:

| Framework | Module | Notes |
|---|---|---|
| IFRS 9 | Hedge Effectiveness, Audit Lab | Cash-flow, fair-value, net-investment hedges |
| ASC 815 | Hedge Effectiveness, Audit Lab | Equivalent treatment for US GAAP |
| EMIR Refit | Regulatory Submissions | UTI-stamped XML generation; Customer is the reporting entity |
| MiFID II best-execution | Pre-Trade TCA | Customer's auditable best-ex evidence |
| CFTC | Regulatory Submissions | US derivatives reporting flows |

Customer remains the Controller and the regulatory reporting entity. ORDR is the Processor and the platform.

---

## OWASP

| Item | Status |
|---|---|
| OWASP ASVS Level 2 mapping | Internal — under NDA |
| OWASP Top 10 coverage | Annual pen-test scoped explicitly to Top 10 + Treasury-specific scenarios |
| OWASP Dependency Check | Continuous via Dependabot + pip-audit |

---

## Penetration testing

| Field | Status |
|---|---|
| Frequency | Annual external |
| Last test | [date] (or "Initial test in progress" prior to first report) |
| Firm | [Independent firm — disclosed under NDA] |
| Scope | Application + API + auth + multi-tenant isolation + cryptographic implementations |
| Critical findings open | 0 |
| High findings open | [n] (current count, with target remediation date) |
| Executive summary | Available under NDA |

If we have any open Critical findings at any time, this row is updated to show it, with a target remediation date. We do not hide them.

---

## Backup-restore drills

| Field | Status |
|---|---|
| Cadence | Quarterly |
| Most recent | [date] |
| Result | [Pass / Pass with note / Fail — corrective action] |
| Hash-chain integrity post-restore | [Verified / Failed — see incident-XX] |
| Next drill | [date] |

A failed drill is itself an incident with a post-mortem and action items.

---

## Insurance

| Coverage | Carrier | Limit | Status |
|---|---|---|---|
| Cyber liability | [Carrier] | $[X]M | [Active / Procuring] |
| Errors & Omissions | [Carrier] | $[Y]M | [Active / Procuring] |
| General liability | [Carrier] | $[Z]M | [Active / Procuring] |

Certificate of Insurance available on request to procurement.

---

## Audit and assurance evidence package

For prospects under NDA, the assurance pack contains:

1. SOC 2 Type II readiness attestation (this trust center)
2. Most recent pen-test executive summary
3. Most recent backup-restore drill attestation
4. Sub-processor list with last review date
5. ROPA + DPIA-support template
6. Threat-model summary
7. Insurance Certificate(s)
8. Sample audit-pack (export from a demo tenant — no real Customer Data)
9. Hash-chain verification walkthrough (worked example)
10. Architectural one-pager + this trust center

To request: email security@ordrtreasuryfx.com under NDA. We deliver within 5 business days.

---

## Where we publicly stand vs. where we honestly want to be

| Today | Goal |
|---|---|
| SOC 2 Type II in progress | Type II report in customer hands |
| Annual pen-test | Continuous attack surface monitoring + bug bounty |
| Single-region per customer | Multi-region failover for Enterprise (Q1 2027) |
| Manual customer data export | One-click self-serve export (Q3 2026) |
| Email-based DSAR | In-app DSAR workflow (Q4 2026) |
| Quarterly restore drill | Monthly automated restore-drill in CI |

This page is updated as items move from "today" to "goal." We don't move them silently.
