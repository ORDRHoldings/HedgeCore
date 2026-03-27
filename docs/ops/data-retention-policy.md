# Data Retention Policy

**Last updated:** 2026-03-27
**Version:** 1.0
**Applies to:** ORDR Terminal v1 (single-tenant demo / early enterprise)

---

## Overview

This policy defines how long different categories of data are retained in ORDR Terminal
and what happens when the retention period expires.

---

## Data Categories and Retention

### Category 1: WORM / Immutable Records

These tables are **append-only by design** and are never deleted (DB-level trigger enforcement):

| Table | Data | Retention | Deletion |
|-------|------|-----------|---------|
| `audit_events` | All system events with hash chain | **Indefinite** | Not permitted — immutable |
| `calculation_runs` | Hedge calculation outputs | **Indefinite** | Not permitted — immutable |
| `policy_revisions` | Policy change history | **Indefinite** | Not permitted — immutable |
| `ledger_entries` | Committed hedge positions | **Indefinite** | Reversal entries only |

**Rationale:** Regulatory and audit requirements demand complete, tamper-evident records.
Even if a client offboards, these records must be preserved for compliance purposes.

### Category 2: Operational User Data

| Data | Retention | Deletion method |
|------|-----------|----------------|
| User accounts | Duration of business relationship + 7 years | Anonymize on offboard |
| Positions | Duration of business relationship + 7 years | Archive table |
| Execution proposals | Duration of business relationship + 7 years | Archive table |
| FX exposure records | Duration of business relationship + 7 years | Archive table |

### Category 3: Session Data

| Data | Retention | Deletion |
|------|-----------|---------|
| JWT refresh tokens | 7 days (auto-expire) | Automatic via `refresh_tokens.expires_at` |
| API keys | Until revoked | `DELETE /v1/api-keys/{id}` |
| CSRF tokens | Session duration | Automatic on logout |

### Category 4: Market Data

| Data | Retention | Notes |
|------|-----------|-------|
| FX rate snapshots (`market_snapshots`) | 90 days rolling | Stale data pruned by background task |
| Real-time feed cache | In-memory only | Not persisted |

### Category 5: Operational Logs

| Data | Retention | Location |
|------|-----------|---------|
| Render application logs | 7 days | Render dashboard (free tier limit) |
| Vercel function logs | 1 day | Vercel dashboard (free tier limit) |
| GitHub Actions logs | 90 days | GitHub (default) |

---

## Backup Retention

| Backup type | Retention |
|------------|-----------|
| Render automatic DB backup | 7 days (free tier) |
| Manual pg_dump backups | 30 days (configurable in `scripts/backup/pg_backup.sh`) |

---

## Data Deletion Requests

For client data deletion requests (right-to-erasure, GDPR):

1. WORM tables (`audit_events`, `calculation_runs`, `policy_revisions`) **cannot be deleted**
   by design. This must be disclosed to clients before onboarding.
2. User PII in non-WORM tables can be anonymized (replace name/email with `[REDACTED]`).
3. No self-service deletion exists in v1 — contact the operator to process manually.

**Procedure:**
```sql
-- Anonymize user (do NOT delete — FK constraints + audit trail continuity)
UPDATE users SET
    email = 'redacted-' || id || '@deleted.invalid',
    full_name = '[DELETED]',
    hashed_password = '[DELETED]'
WHERE id = '<user-uuid>';

-- After running, confirm the operation was captured in the audit trail.
-- The audit middleware auto-records writes. Verify by checking for a recent event:
-- SELECT * FROM audit_events ORDER BY created_at DESC LIMIT 3;
-- NOTE: USER_ANONYMIZED is not a current event type — the audit middleware will record
-- whatever route triggered this (e.g. an admin endpoint call). If run as raw SQL,
-- manually insert an audit event to document the action was taken.
```

---

## Data Locations

| Data | Location | Jurisdiction |
|------|----------|-------------|
| Production database | Render PostgreSQL, US-West (Oregon) | United States |
| Application logs | Render, US-West (Oregon) | United States |
| Frontend | Vercel CDN (global edge) | Global |
| Error tracking | Sentry (if configured) | US / EU (configurable) |

---

## Policy Review

This policy is reviewed:
- Annually (scheduled review)
- When adding a new data category
- When onboarding a customer with specific compliance requirements (GDPR, SOC 2, etc.)
