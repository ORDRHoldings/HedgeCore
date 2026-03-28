# Vendor Security Registry — ORDR Terminal

**Date:** 2026-03-28
**Owner:** Synexiun Ltd
**Review cycle:** Quarterly
**Next review:** 2026-06-28

---

## Classification Definitions

| Class | Description |
|-------|-------------|
| **PII** | Name, email, IP address, personal identifiers |
| **Financial** | Position data, calculation results, hedge amounts, notional values |
| **Credentials** | Passwords (hashed), JWT secrets, API keys (hashed) |
| **Operational** | Logs, errors, metrics, stack traces |
| **Infrastructure** | Database contents (all of the above at rest) |

---

## Vendor Registry

### 1. Render.com
| Field | Value |
|-------|-------|
| **Role** | Application hosting (backend API) + managed PostgreSQL |
| **Data processed** | Infrastructure: all data at rest and in transit between services |
| **Data classification** | PII, Financial, Credentials (hashed), Operational |
| **DPA signed** | Yes — Render Data Processing Agreement |
| **Encryption at rest** | Yes — AES-256 (PostgreSQL managed service) |
| **Encryption in transit** | Yes — TLS 1.2+ enforced |
| **Data residency** | US (Oregon) by default; EU region available on request |
| **SOC2 Type II** | Yes |
| **Fallback if unavailable** | Restore to alternate cloud provider using pg_backup.sh + Backblaze B2. RTO: 4h. See docs/ops/disaster-recovery.md. |

### 2. Vercel
| Field | Value |
|-------|-------|
| **Role** | Frontend hosting + CDN |
| **Data processed** | IP addresses, session tokens (in cookies/headers), browser metadata |
| **Data classification** | PII (IP), Credentials (session tokens) |
| **DPA signed** | Yes — Vercel DPA |
| **Encryption in transit** | Yes — TLS 1.3, automatic HTTPS |
| **Data residency** | Global CDN; primary compute in US East |
| **SOC2 Type II** | Yes |
| **Fallback if unavailable** | Deploy frontend to Render static site or Cloudflare Pages. DNS cutover within 30 minutes. |

### 3. Render PostgreSQL (Managed)
| Field | Value |
|-------|-------|
| **Role** | Primary relational database |
| **Data processed** | All application data (positions, users, audit events, calculation runs) |
| **Data classification** | PII, Financial, Infrastructure |
| **DPA signed** | Covered by Render.com DPA |
| **Backup** | Nightly automated backup + offsite to Backblaze B2 |
| **Fallback if unavailable** | Restore from backup to new Render PostgreSQL instance. RTO: 4h. RPO: 24h. |

### 4. Redis (Render managed)
| Field | Value |
|-------|-------|
| **Role** | Rate limiting, session cache, market data cache |
| **Data processed** | Session tokens (transient), rate limit counters, cached market data |
| **Data classification** | Credentials (session tokens — transient), Operational |
| **DPA signed** | Covered by Render.com DPA |
| **Fallback if unavailable** | Rate limiting: falls back to in-process token bucket (fail-closed). Market data: bypasses cache. Session: JWT validation continues without Redis. |

### 5. Sentry
| Field | Value |
|-------|-------|
| **Role** | Error monitoring and alerting |
| **Data processed** | Stack traces, request context, error metadata |
| **Data classification** | Operational (PII scrubbed before transmission) |
| **DPA signed** | Yes — Sentry DPA |
| **PII scrubbing** | Configured via before_send hook in Sprint 2 — strips email, name from payloads |
| **Data residency** | US by default; EU available on paid plans |
| **Fallback if unavailable** | Structured logs in Render log stream remain available. Alerting degraded. |

### 6. WorkOS
| Field | Value |
|-------|-------|
| **Role** | SSO/SAML/OIDC broker (Okta, Azure AD, Google Workspace) |
| **Data processed** | Email, name, IdP-issued tokens |
| **Data classification** | PII, Credentials (IdP tokens — transient) |
| **DPA signed** | Pending — must sign before go-live |
| **Fallback if unavailable** | Password authentication remains active for all tenants. SSO login degraded. |

### 7. Stripe
| Field | Value |
|-------|-------|
| **Role** | Subscription billing |
| **Data processed** | Name, email, payment method (tokenised) |
| **Data classification** | PII, Financial (billing) |
| **DPA signed** | Yes — Stripe Data Processing Agreement (accepted in Stripe Dashboard) |
| **PCI DSS** | Stripe holds PCI DSS Level 1. ORDR Terminal never processes raw card data. |
| **Fallback if unavailable** | New subscriptions blocked. Existing subscriptions continue on last-known plan tier stored in DB. |

### 8. Finnhub
| Field | Value |
|-------|-------|
| **Role** | Market data provider (FX rates, equity prices) |
| **Data processed** | API key only; no customer data sent |
| **Data classification** | Operational (API key) |
| **DPA signed** | Not required (no personal data transmitted) |
| **Fallback if unavailable** | Automatic failover to Twelve Data or Alpha Vantage. Stale data served from cache for up to 60s. |

### 9. Twelve Data
| Field | Value |
|-------|-------|
| **Role** | Market data provider (FX rates, fallback) |
| **Data processed** | API key only; no customer data sent |
| **Data classification** | Operational (API key) |
| **DPA signed** | Not required |
| **Fallback if unavailable** | Failover to Alpha Vantage. |

### 10. Alpha Vantage
| Field | Value |
|-------|-------|
| **Role** | Market data provider (FX rates, tertiary fallback) |
| **Data processed** | API key only; no customer data sent |
| **Data classification** | Operational (API key) |
| **DPA signed** | Not required |
| **Fallback if unavailable** | Market data unavailable; frontend shows stale data warning. Calculation engine continues with manually-entered rates. |

---

## Risk Summary

| Vendor | Risk Level | Key Risk | Mitigation |
|--------|-----------|----------|-----------|
| Render | Medium | All data at rest | SOC2 Type II, encryption at rest, Backblaze backup |
| Vercel | Low | IP/session only | SOC2 Type II, no financial data |
| Sentry | Low | PII scrubbing required | PII scrubbing hook implemented in Sprint 2 |
| WorkOS | Medium | PII + IdP tokens | DPA pending — must sign before SSO go-live |
| Stripe | Low | Billing PII only | PCI DSS Level 1, DPA in place |
| Finnhub/TwelveData/AlphaVantage | Very Low | API key only | No customer data transmitted |
