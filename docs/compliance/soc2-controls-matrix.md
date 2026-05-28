# SOC2 Type I Controls Matrix — ORDR Terminal

**Date:** 2026-05-27 (last reviewed; next review 2026-06-27)
**Scope:** Trust Service Criteria — Security (CC), Availability (A), Confidentiality (C)
**Status:** Evidence collection automated. Type I target: Q3 2026. Type II observation period gated on closing RISK-OPS-MON-01 (Sentry alerts + Render auto-rollback — runbook landed 2026-05-27, dashboard wiring pending).

---

## CC6 — Logical and Physical Access Controls

| Control | Implementation | Evidence Location | Status |
|---------|---------------|-------------------|--------|
| CC6.1 — Authentication | JWT HS256 (30min access + 7d refresh), bcrypt passwords | `backend/app/core/security.py` | Implemented |
| CC6.2 — Least privilege | RBAC: 9 roles, 41 permissions, hierarchy_level 0–15 | `backend/app/models/rbac.py` | Implemented |
| CC6.3 — Multi-factor auth | TOTP MFA table in DB | `backend/app/models/user_mfa.py` | Implemented |
| CC6.3a — Tenant isolation (RLS, structural) | PostgreSQL `FORCE ROW LEVEL SECURITY` on `positions` + `calculation_runs` via migration `0036_force_rls_tenant_context`. `TenantRLSAsyncSession` auto-injects `app.current_tenant_id` via `set_config()` on every query. **Two startup guards prevent regressions**: `assert_routes_have_canonical_auth` (every route must consume `get_current_user` or `get_api_key_principal`, else explicit allowlist with justification) and `assert_api_key_routes_safe` (API-key routes restricted to allowlist). Both fail closed at app startup. | `backend/alembic/versions/0036_force_rls_tenant_context.py`, `backend/app/core/rls.py`, `backend/app/core/dependencies.py::assert_routes_have_canonical_auth`, `backend/app/deps/api_key_auth.py::assert_api_key_routes_safe` | Implemented |
| CC6.6 — Network access | CORS configured per environment, IP allowlist middleware | `backend/app/core/ip_allowlist.py` | Implemented |
| CC6.7 — Data transmission | HTTPS enforced via Render/Vercel TLS termination | Render dashboard | Implemented |
| CC6.8 — Malware protection | gitleaks pre-commit, Trivy container scan, Dependabot | `.github/workflows/` | Implemented |

## CC7 — System Operations

| Control | Implementation | Evidence Location | Status |
|---------|---------------|-------------------|--------|
| CC7.2 — Monitor for anomalies | Sentry error tracking (DSN wired in `render.yaml`), structured logging. **Alert rules pending** — see RISK-OPS-MON-01 + `docs/runbooks/ops-monitoring.md` for the wiring checklist. | `backend/app/core/logging.py`, `render.yaml` | Partial |
| CC7.3 — Evaluate security events | Audit event log (WORM, hash chain). SHA-256, per-tenant, GENESIS = 64 zeros. Integrity verified via nightly job. | `audit_events` table, `backend/app/engine_v1/audit.py` | Implemented |
| CC7.5 — Respond to incidents | Incident runbook + post-mortem cadence operating. **Operating evidence**: 2026-05-13 → 2026-05-16 P1 RLS incident detected, diagnosed, and resolved in 4 minutes after detection; full post-mortem in `docs/incidents/2026-05-16-rls-set-local-bind-params.md`. Gap that incident exposed (no 5xx alert → 3-day latency to detect) tracked as RISK-OPS-MON-01 with runbook landed 2026-05-27. | `docs/ops/postmortem-template.md`, `docs/incidents/`, `docs/runbooks/ops-monitoring.md` | Implemented (with named gap) |

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
- [x] SSO/SAML implemented (Sprint 3 — done)
- [ ] **RISK-OPS-MON-01** — Sentry 5xx rule + Render auto-rollback toggle wired (runbook landed 2026-05-27; dashboard wiring pending — see `docs/runbooks/ops-monitoring.md`)
- [ ] Number the engineering rules under `.claude/rules/` as formal policy documents (CC5.3 formalization)

## Recent control-strengthening history

| Date | Control | Change |
|------|---------|--------|
| 2026-05-27 | CC7.2, CC7.5 | `docs/runbooks/ops-monitoring.md` shipped; converts RISK-OPS-MON-01 from "wire it" into a 6-step dashboard checklist |
| 2026-05-25 | CC8.2 | RISK-CI-PG-02 closed — alembic chain heals on fresh PG; `requires_postgres` suite drains to 0 fails |
| 2026-05-16 | CC6.3a, CC7.5 | RLS `SET LOCAL` bind-param bug detected via post-deploy smoke, root-caused in 2 min, fixed via `set_config()` in commit `151c591`. Post-mortem committed same day. |
| 2026-05-13 | CC6.3a | Migration `0036_force_rls_tenant_context` enabled `FORCE ROW LEVEL SECURITY` on `positions` + `calculation_runs`. Two startup guards (`assert_routes_have_canonical_auth`, `assert_api_key_routes_safe`) added to prevent structural drift. |
