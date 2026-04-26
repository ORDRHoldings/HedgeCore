# Sub-Processors

**Last updated:** 2026-04-25 · **Version:** 1.0

This page lists the third parties that ORDR TreasuryFX engages to process Personal Data on behalf of customers, in accordance with our [Data Processing Addendum](dpa.md). We provide thirty (30) days' notice before adding or replacing a sub-processor.

To subscribe to sub-processor change notifications, email **dpo@ordrtreasuryfx.com** with the subject "Sub-processor notifications."

---

## Hosting & infrastructure

| Sub-processor | Service | Data location | Personal Data Processed |
|---|---|---|---|
| **Render Services, Inc.** | Backend application hosting + managed PostgreSQL | EU (Frankfurt) for EU customers; US (us-east-1) for US customers | All Customer Data; authentication credentials (encrypted) |
| **Vercel Inc.** | Frontend application hosting + edge CDN | Global edge network; origin in customer-selected region | Browser session metadata; IP addresses; user-agent strings |

## Observability & monitoring

| Sub-processor | Service | Data location | Personal Data Processed |
|---|---|---|---|
| **Sentry (Functional Software, Inc.)** | Error monitoring & performance tracing | US (with EU storage option for EU customers) | User ID hashes, IP addresses, browser metadata, application error context (PII-redacted) |

## Market data

| Sub-processor | Service | Data location | Personal Data Processed |
|---|---|---|---|
| **TwelveData Inc.** | FX market data | US | None (market data is anonymous; no Personal Data shared) |

## Communications

| Sub-processor | Service | Data location | Personal Data Processed |
|---|---|---|---|
| **[Email transactional provider — e.g., Postmark / SendGrid]** | Transactional email (account verification, password reset, alerts) | [Region per provider] | Recipient email address, recipient name |

## Payment processing (for ORDR's own subscription billing)

| Sub-processor | Service | Data location | Personal Data Processed |
|---|---|---|---|
| **Stripe Inc.** | Subscription billing & payment processing | US (with EU regional storage available) | Customer's billing contact name, email, billing address. Card data is collected and processed directly by Stripe — ORDR does not store, process, or transmit cardholder data. |

## Customer support (when applicable)

| Sub-processor | Service | Data location | Personal Data Processed |
|---|---|---|---|
| **[Helpdesk provider — e.g., Intercom / Zendesk / Front]** | Customer support ticketing | [Region per provider] | Support ticket metadata, contact name, email, conversation content |

---

## Sub-processor change history

| Effective date | Change | Notification sent |
|---|---|---|
| 2026-04-25 | Initial publication | N/A (initial) |

---

## How we evaluate sub-processors

Before engaging any sub-processor that will Process Personal Data, we conduct due diligence on:

1. **Security certifications** — SOC 2 Type II, ISO 27001, or equivalent independent attestation
2. **Data Processing Addendum** — sub-processor must execute a DPA with terms no less protective than this DPA
3. **Data location** — sub-processor's data residency must be compatible with Customer's selected region
4. **International transfer mechanism** — for transfers outside the EEA/UK/Switzerland, the sub-processor must support the SCCs or equivalent valid transfer mechanism
5. **Track record** — public history of breach disclosures, regulatory enforcement actions, and remediation
6. **Annual review** — sub-processors are reviewed annually; failure to maintain certifications triggers replacement

---

## Sub-processor objection process

Customers with an active Order Form may object to a new sub-processor in writing within thirty (30) days of notification, on reasonable grounds related to data protection. Submit objections to **dpo@ordrtreasuryfx.com** with the subject "Sub-processor objection."

If we cannot reasonably accommodate the objection, the Customer's exclusive remedy is termination of the affected Order Form per our DPA.

---

## Contact

- Data Protection Officer: **dpo@ordrtreasuryfx.com**
- Security: **security@ordrtreasuryfx.com**
- Postal: [ORDR TreasuryFX legal entity address]
