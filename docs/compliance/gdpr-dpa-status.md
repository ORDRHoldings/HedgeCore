# GDPR Data Processing Agreements — ORDR Terminal

**Date:** 2026-03-28
**Data Controller:** [Client Company Name]
**Data Processor:** Synexiun Ltd (ORDR Terminal operator)

---

## ORDR Terminal GDPR Implementation

| Feature | Implementation | Status |
|---------|---------------|--------|
| Right of access (Art. 15) | `GET /v1/user/data-export` | Implemented |
| Right to erasure (Art. 17) | `DELETE /v1/user/account` — anonymises PII | Implemented |
| Data minimisation | Only email, name, company affiliation collected | Implemented |
| Retention policy | GDPR_RETENTION_DAYS env var (default 730 days) | Implemented |
| Automated enforcement | Nightly anonymisation job at 01:00 UTC | Implemented |
| Breach notification | Sentry alerts + ops runbook | Sprint 2 |

## Sub-processor DPA Status

| Vendor | Role | Personal Data Processed | DPA Signed | Notes |
|--------|------|------------------------|------------|-------|
| Render.com | Infrastructure (backend + PostgreSQL) | All user/tenant data (encrypted at rest) | Yes — [Render DPA](https://render.com/privacy) | GDPR-compliant, EU data residency available |
| Vercel | Frontend CDN/hosting | Session tokens, IP addresses | Yes — [Vercel DPA](https://vercel.com/legal/dpa) | GDPR-compliant |
| Sentry | Error monitoring | Stack traces (PII scrubbed before send) | Yes — [Sentry DPA](https://sentry.io/legal/dpa/) | PII scrubbing configured in Sprint 2 |
| WorkOS | SSO/SAML broker | Email, IdP tokens | Pending — sign before go-live | GDPR-compliant; DPA available on request |
| Stripe | Billing | Name, email, payment method | Yes — [Stripe DPA](https://stripe.com/legal/dpa) | Standard DPA in Stripe Dashboard |

## Data Flows

```
User Browser -> Vercel CDN -> Backend (Render) -> PostgreSQL (Render)
                                               -> Sentry (errors only, PII scrubbed)
                                               -> WorkOS (SSO flows only)
                                               -> Stripe (billing flows only)
```

## Retention Schedule

| Data Category | Retention Period | Basis | Deletion Method |
|---------------|-----------------|-------|-----------------|
| User PII (email, name) | 730 days post-account creation | Contractual necessity | Anonymisation (GDPR Art. 17) |
| Audit events | Indefinite | Financial regulation (MiFID II Art. 75, EMIR Art. 9) | Retained — regulatory override of Art. 17 |
| Calculation runs | Indefinite | Financial regulation | Retained |
| Auth audit logs | 90 days | Operational security | Hard delete via `cleanup_audit_tables()` |
| Session refresh tokens | 7 days (JWT TTL) | Session management | Automatic expiry |
