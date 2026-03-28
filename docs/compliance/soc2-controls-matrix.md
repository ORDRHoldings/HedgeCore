# SOC2 Type I Controls Matrix — ORDR Terminal

**Date:** 2026-03-28
**Scope:** Trust Service Criteria — Security (CC), Availability (A), Confidentiality (C)
**Status:** Evidence collection automated. Type I target: Q3 2026.

---

## CC6 — Logical and Physical Access Controls

| Control | Implementation | Evidence Location | Status |
|---------|---------------|-------------------|--------|
| CC6.1 — Authentication | JWT HS256 (30min access + 7d refresh), bcrypt passwords | `backend/app/core/security.py` | Implemented |
| CC6.2 — Least privilege | RBAC: 9 roles, 41 permissions, hierarchy_level 0–15 | `backend/app/models/rbac.py` | Implemented |
| CC6.3 — Multi-factor auth | TOTP MFA table in DB | `backend/app/models/user_mfa.py` | Implemented |
| CC6.6 — Network access | CORS configured per environment, IP allowlist middleware | `backend/app/core/ip_allowlist.py` | Implemented |
| CC6.7 — Data transmission | HTTPS enforced via Render/Vercel TLS termination | Render dashboard | Implemented |
| CC6.8 — Malware protection | gitleaks pre-commit, Trivy container scan, Dependabot | `.github/workflows/` | Implemented |

## CC7 — System Operations

| Control | Implementation | Evidence Location | Status |
|---------|---------------|-------------------|--------|
| CC7.2 — Monitor for anomalies | Sentry error tracking, structured logging | `backend/app/core/logging.py` | Sprint 2 |
| CC7.3 — Evaluate security events | Audit event log (WORM, hash chain) | `audit_events` table | Implemented |
| CC7.5 — Respond to incidents | Incident runbook | `docs/ops/postmortem-template.md` | Implemented |

## CC8 — Change Management

| Control | Implementation | Evidence Location | Status |
|---------|---------------|-------------------|--------|
| CC8.1 — Change control process | Git flow: feat/fix branches → PR → master | GitHub repository | Implemented |
| CC8.1 — Approval before deployment | PR required, CI gates (lint + test + build) | `.github/workflows/` | Implemented |
| CC8.1 — Change log | `CHANGELOG_AI.md` updated each sprint | `.claude/state/CHANGELOG_AI.md` | Implemented |

## CC9 — Risk Mitigation

| Control | Implementation | Evidence Location | Status |
|---------|---------------|-------------------|--------|
| CC9.1 — Risk identification | Open risks register | `.claude/state/OPEN_RISKS.md` | Implemented |
| CC9.2 — Vendor risk | Vendor security registry | `docs/compliance/vendor-registry.md` | Sprint 4 |

## A1 — Availability

| Control | Implementation | Evidence Location | Status |
|---------|---------------|-------------------|--------|
| A1.1 — Capacity planning | SLO document, connection pool config | `docs/ops/slo.md` | Implemented |
| A1.2 — Backup and recovery | `pg_backup.sh`, Backblaze B2 offsite | `scripts/pg_backup.sh` | Sprint 2 |
| A1.3 — Restore testing | `restore_verify.sh` monthly cron | `scripts/restore_verify.sh` | Sprint 2 |

## C1 — Confidentiality

| Control | Implementation | Evidence Location | Status |
|---------|---------------|-------------------|--------|
| C1.1 — Confidential data classification | Vendor registry with data classification | `docs/compliance/vendor-registry.md` | Sprint 4 |
| C1.2 — Encrypt in transit | TLS on all public endpoints | Render/Vercel platform | Implemented |
| C1.2 — Encrypt at rest | Render PostgreSQL encryption at rest | Render dashboard | Implemented |

## Automated Evidence Collection

Nightly job (02:00 UTC) writes to `compliance_evidence` table:
- `user_count` — active user count per tenant
- `policy_change_count` — policy revisions in last 24h per tenant
- `failed_auth_count` — failed login events in last 24h per tenant

Evidence rows are WORM-governed (append-only, DB-level NO UPDATE/DELETE triggers).
Rows reference the audit_events hash chain via `latest_audit_event_hash`.

## Gaps to Close Before Type I Assessment

- [ ] Access review process documented (quarterly user access review procedure)
- [ ] Penetration test report committed (Sprint 1 item)
- [ ] Vendor DPA status complete (Sprint 4 — this sprint)
- [ ] SSO/SAML implemented (Sprint 3 — done)
