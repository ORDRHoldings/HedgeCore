# Sprint 4 — Compliance Pipeline Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build SOC2 Type I evidence artifacts, enforce GDPR data retention, harden tenant isolation with PostgreSQL RLS, and document vendor security posture.

**Architecture:** All compliance features are additive — no frozen files are modified. The `compliance_evidence` table is WORM-governed (append-only, no UPDATE/DELETE DB triggers) and references the existing `audit_events` hash chain rather than forming its own. PostgreSQL RLS policies use `SET LOCAL` (transaction-scoped) via an SQLAlchemy event listener on the sync engine's `"begin"` event, keeping the setting within the transaction boundary so async connection pool reuse cannot leak tenant context across requests.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy async, PostgreSQL RLS, APScheduler (already wired in `backend/app/main.py`)

---

## Chunk 1: SOC2 Controls Matrix + Compliance Evidence Table

### Files

**Create:**
- `backend/app/models/compliance_evidence.py` — WORM ORM model
- `backend/migrations/versions/h1a2b3c4d5e6_compliance_evidence_table.py` — Alembic migration
- `backend/app/tasks/compliance_evidence_export.py` — nightly evidence export job
- `backend/tests/test_compliance_evidence.py` — tests for model + job
- `docs/compliance/soc2-controls-matrix.md` — SOC2 controls mapping document

**Modify:**
- `backend/app/main.py` — register nightly compliance export job with APScheduler

---

- [ ] **Step 1.1 — Write failing test for ComplianceEvidence model**

  File: `backend/tests/test_compliance_evidence.py`

  ```python
  """
  Tests for compliance_evidence WORM model and nightly export job.
  Runs on SQLite in-memory (no PostgreSQL required).
  """
  from __future__ import annotations
  import uuid
  import pytest
  from unittest.mock import AsyncMock, MagicMock, patch
  from datetime import UTC, datetime


  class TestComplianceEvidenceModel:
      def test_model_importable(self):
          from app.models.compliance_evidence import ComplianceEvidence
          assert ComplianceEvidence.__tablename__ == "compliance_evidence"

      def test_model_has_required_columns(self):
          from app.models.compliance_evidence import ComplianceEvidence
          cols = {c.name for c in ComplianceEvidence.__table__.columns}
          required = {"id", "company_id", "evidence_date", "evidence_type",
                      "payload", "created_at"}
          assert required.issubset(cols), f"Missing columns: {required - cols}"

      def test_model_has_no_update_trigger_comment(self):
          """Verify the model docstring documents WORM semantics."""
          from app.models import compliance_evidence
          import inspect
          src = inspect.getsource(compliance_evidence)
          assert "WORM" in src or "append-only" in src.lower()

      def test_evidence_type_enum_values(self):
          from app.models.compliance_evidence import EVIDENCE_TYPES
          assert "user_count" in EVIDENCE_TYPES
          assert "policy_change_count" in EVIDENCE_TYPES
          assert "failed_auth_count" in EVIDENCE_TYPES


  class TestComplianceExportJob:
      @pytest.mark.asyncio
      async def test_export_job_importable(self):
          from app.tasks.compliance_evidence_export import run_compliance_evidence_export
          assert callable(run_compliance_evidence_export)

      @pytest.mark.asyncio
      async def test_export_job_inserts_three_evidence_rows(self):
          from app.tasks.compliance_evidence_export import collect_evidence_snapshot

          mock_session = AsyncMock()
          # Simulate scalar results for COUNT queries
          mock_session.execute = AsyncMock(
              side_effect=[
                  MagicMock(scalar=MagicMock(return_value=5)),   # user_count
                  MagicMock(scalar=MagicMock(return_value=2)),   # policy_change_count
                  MagicMock(scalar=MagicMock(return_value=12)),  # failed_auth_count
              ]
          )
          mock_session.add = MagicMock()
          mock_session.commit = AsyncMock()

          company_id = uuid.uuid4()
          rows = await collect_evidence_snapshot(mock_session, company_id)

          assert len(rows) == 3
          types = {r.evidence_type for r in rows}
          assert types == {"user_count", "policy_change_count", "failed_auth_count"}

      @pytest.mark.asyncio
      async def test_export_job_payload_contains_count(self):
          from app.tasks.compliance_evidence_export import collect_evidence_snapshot

          mock_session = AsyncMock()
          mock_session.execute = AsyncMock(
              side_effect=[
                  MagicMock(scalar=MagicMock(return_value=42)),
                  MagicMock(scalar=MagicMock(return_value=0)),
                  MagicMock(scalar=MagicMock(return_value=3)),
              ]
          )
          mock_session.add = MagicMock()
          mock_session.commit = AsyncMock()

          company_id = uuid.uuid4()
          rows = await collect_evidence_snapshot(mock_session, company_id)

          user_row = next(r for r in rows if r.evidence_type == "user_count")
          assert user_row.payload["count"] == 42
  ```

  Run (expect ImportError / failures):
  ```bash
  cd /d/Synexiun/1-SynexFund/HedgeCalc/TreasuryFX/backend
  JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_compliance_evidence.py -x -q --tb=short 2>&1 | head -40
  ```

- [ ] **Step 1.2 — Create ComplianceEvidence ORM model**

  File: `backend/app/models/compliance_evidence.py`

  ```python
  """
  ComplianceEvidence ORM model — WORM-governed SOC2 evidence table.

  WORM semantics: rows are NEVER updated or deleted after insert.
  A NO UPDATE, NO DELETE trigger is added via Alembic migration.
  Evidence rows reference the existing audit_events hash chain
  (via latest_audit_event_hash) rather than forming their own chain.

  Evidence types collected nightly:
    user_count          — total active users per tenant
    policy_change_count — policy revision rows created in last 24h
    failed_auth_count   — failed login events in last 24h
  """
  from __future__ import annotations

  import uuid as _uuid
  from datetime import UTC, datetime

  from sqlalchemy import Column, Date, DateTime, Index, String, text
  from sqlalchemy.dialects.postgresql import JSONB
  from sqlalchemy.dialects.postgresql import UUID as PGUUID

  from app.core.db import Base

  EVIDENCE_TYPES = ("user_count", "policy_change_count", "failed_auth_count")


  class ComplianceEvidence(Base):
      __tablename__ = "compliance_evidence"

      id = Column(PGUUID(as_uuid=True), primary_key=True, default=_uuid.uuid4)

      # Tenant context
      company_id = Column(PGUUID(as_uuid=True), nullable=True)  # null = platform-wide

      # Evidence classification
      evidence_date = Column(Date, nullable=False)  # the date the snapshot covers
      evidence_type = Column(String(64), nullable=False)  # see EVIDENCE_TYPES

      # Structured payload: {"count": N, "notes": "..."}
      payload = Column(JSONB, nullable=False, default=dict)

      # Reference to the audit chain state at collection time (not a new chain)
      latest_audit_event_hash = Column(String(64), nullable=True)

      # WORM timestamp — never updated
      created_at = Column(
          DateTime(timezone=True),
          nullable=False,
          server_default=text("NOW()"),
      )

      __table_args__ = (
          Index("ix_compliance_evidence_date", "evidence_date"),
          Index("ix_compliance_evidence_tenant_date", "company_id", "evidence_date"),
          Index("ix_compliance_evidence_type", "evidence_type"),
      )
  ```

- [ ] **Step 1.3 — Create nightly export job**

  File: `backend/app/tasks/compliance_evidence_export.py`

  ```python
  """
  app/tasks/compliance_evidence_export.py
  ORDR Terminal — Nightly SOC2 compliance evidence export.

  Runs nightly at 02:00 UTC via APScheduler.
  For each active tenant, collects three evidence metrics and writes
  a ComplianceEvidence row (WORM — never updated or deleted).

  Metrics:
    user_count          — COUNT of active users for the company
    policy_change_count — COUNT of policy_revisions created in last 24h
    failed_auth_count   — COUNT of LOGIN audit_events with failure payload in last 24h
  """
  from __future__ import annotations

  import logging
  from datetime import UTC, date, datetime, timedelta

  from sqlalchemy import func, select, text
  from sqlalchemy.ext.asyncio import AsyncSession

  from app.models.audit_event import AuditEvent
  from app.models.compliance_evidence import ComplianceEvidence
  from app.models.organization import Company
  from app.models.policy_revision import PolicyRevision
  from app.models.user import User

  log = logging.getLogger(__name__)


  async def collect_evidence_snapshot(
      session: AsyncSession,
      company_id,
      snapshot_date: date | None = None,
  ) -> list[ComplianceEvidence]:
      """
      Collect the three SOC2 evidence metrics for one tenant.
      Returns a list of un-committed ComplianceEvidence rows.
      """
      today = snapshot_date or date.today()
      cutoff = datetime.now(UTC) - timedelta(hours=24)

      # 1. user_count
      user_result = await session.execute(
          select(func.count()).select_from(User).where(
              User.company_id == company_id,
              User.is_active.is_(True),
          )
      )
      user_count = user_result.scalar() or 0

      # 2. policy_change_count (last 24h)
      policy_result = await session.execute(
          select(func.count()).select_from(PolicyRevision).where(
              PolicyRevision.company_id == company_id,
              PolicyRevision.created_at >= cutoff,
          )
      )
      policy_count = policy_result.scalar() or 0

      # 3. failed_auth_count (last 24h) — LOGIN events with failure=True in payload
      failed_result = await session.execute(
          select(func.count()).select_from(AuditEvent).where(
              AuditEvent.company_id == company_id,
              AuditEvent.event_type == "LOGIN",
              AuditEvent.created_at >= cutoff,
              AuditEvent.payload["success"].as_boolean().is_(False),
          )
      )
      failed_count = failed_result.scalar() or 0

      # Fetch latest audit hash for this tenant (chain reference — not a new chain)
      latest_hash_result = await session.execute(
          select(AuditEvent.event_hash)
          .where(AuditEvent.company_id == company_id)
          .order_by(AuditEvent.created_at.desc())
          .limit(1)
      )
      latest_hash = latest_hash_result.scalar()

      rows = [
          ComplianceEvidence(
              company_id=company_id,
              evidence_date=today,
              evidence_type="user_count",
              payload={"count": user_count},
              latest_audit_event_hash=latest_hash,
          ),
          ComplianceEvidence(
              company_id=company_id,
              evidence_date=today,
              evidence_type="policy_change_count",
              payload={"count": policy_count, "window_hours": 24},
              latest_audit_event_hash=latest_hash,
          ),
          ComplianceEvidence(
              company_id=company_id,
              evidence_date=today,
              evidence_type="failed_auth_count",
              payload={"count": failed_count, "window_hours": 24},
              latest_audit_event_hash=latest_hash,
          ),
      ]
      return rows


  async def run_compliance_evidence_export() -> None:
      """
      Entry point called by APScheduler at 02:00 UTC.
      Iterates all active companies and writes evidence rows.
      """
      from app.core.db import async_session_maker  # lazy import — avoids circular

      log.info("Starting nightly compliance evidence export")

      async with async_session_maker() as session:
          try:
              companies_result = await session.execute(
                  select(Company.id).where(Company.is_active.is_(True))
              )
              company_ids = [row[0] for row in companies_result.fetchall()]

              total_rows = 0
              for company_id in company_ids:
                  rows = await collect_evidence_snapshot(session, company_id)
                  for row in rows:
                      session.add(row)
                  total_rows += len(rows)

              await session.commit()
              log.info(
                  "Compliance evidence export complete: %d companies, %d rows",
                  len(company_ids),
                  total_rows,
              )
          except Exception:
              log.exception("Compliance evidence export failed — rolling back")
              await session.rollback()
  ```

- [ ] **Step 1.4 — Write Alembic migration for compliance_evidence**

  File: `backend/migrations/versions/h1a2b3c4d5e6_compliance_evidence_table.py`

  ```python
  """compliance_evidence WORM table

  Revision ID: h1a2b3c4d5e6
  Revises: g1a2b3c4d5e6
  Create Date: 2026-03-28
  """
  from alembic import op
  import sqlalchemy as sa
  from sqlalchemy.dialects import postgresql

  revision = "h1a2b3c4d5e6"
  down_revision = "g1a2b3c4d5e6"
  branch_labels = None
  depends_on = None


  def upgrade() -> None:
      op.create_table(
          "compliance_evidence",
          sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
          sa.Column("company_id", postgresql.UUID(as_uuid=True), nullable=True),
          sa.Column("evidence_date", sa.Date(), nullable=False),
          sa.Column("evidence_type", sa.String(64), nullable=False),
          sa.Column("payload", postgresql.JSONB(), nullable=False, server_default="{}"),
          sa.Column("latest_audit_event_hash", sa.String(64), nullable=True),
          sa.Column(
              "created_at",
              sa.DateTime(timezone=True),
              nullable=False,
              server_default=sa.text("NOW()"),
          ),
      )
      op.create_index("ix_compliance_evidence_date", "compliance_evidence", ["evidence_date"])
      op.create_index(
          "ix_compliance_evidence_tenant_date",
          "compliance_evidence",
          ["company_id", "evidence_date"],
      )
      op.create_index(
          "ix_compliance_evidence_type", "compliance_evidence", ["evidence_type"]
      )

      # WORM enforcement: block UPDATE and DELETE at database level
      op.execute("""
          CREATE OR REPLACE FUNCTION prevent_compliance_evidence_mutation()
          RETURNS TRIGGER AS $$
          BEGIN
              RAISE EXCEPTION 'compliance_evidence is append-only (WORM): % on row % is forbidden',
                  TG_OP, OLD.id;
          END;
          $$ LANGUAGE plpgsql;
      """)
      op.execute("""
          CREATE TRIGGER trg_compliance_evidence_no_update
          BEFORE UPDATE ON compliance_evidence
          FOR EACH ROW EXECUTE FUNCTION prevent_compliance_evidence_mutation();
      """)
      op.execute("""
          CREATE TRIGGER trg_compliance_evidence_no_delete
          BEFORE DELETE ON compliance_evidence
          FOR EACH ROW EXECUTE FUNCTION prevent_compliance_evidence_mutation();
      """)


  def downgrade() -> None:
      op.execute("DROP TRIGGER IF EXISTS trg_compliance_evidence_no_delete ON compliance_evidence;")
      op.execute("DROP TRIGGER IF EXISTS trg_compliance_evidence_no_update ON compliance_evidence;")
      op.execute("DROP FUNCTION IF EXISTS prevent_compliance_evidence_mutation();")
      op.drop_index("ix_compliance_evidence_type", table_name="compliance_evidence")
      op.drop_index("ix_compliance_evidence_tenant_date", table_name="compliance_evidence")
      op.drop_index("ix_compliance_evidence_date", table_name="compliance_evidence")
      op.drop_table("compliance_evidence")
  ```

- [ ] **Step 1.5 — Register compliance export job in main.py**

  In `backend/app/main.py`, find the APScheduler block at line ~1698 and add the compliance job immediately after the `audit_cleanup` job registration:

  ```python
  # ── Compliance evidence export — nightly at 02:00 UTC ─────────────────
  from app.tasks.compliance_evidence_export import run_compliance_evidence_export
  _audit_scheduler.add_job(
      run_compliance_evidence_export,
      CronTrigger(hour=2, minute=0),
      id="compliance_evidence_export",
      replace_existing=True,
  )
  logger.info("Scheduler registered — compliance_evidence_export at 02:00 UTC daily")
  ```

- [ ] **Step 1.6 — Run tests (expect pass)**

  ```bash
  cd /d/Synexiun/1-SynexFund/HedgeCalc/TreasuryFX/backend
  JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_compliance_evidence.py -x -q --tb=short
  ```

  Expected output:
  ```
  6 passed in <2s
  ```

- [ ] **Step 1.7 — Create SOC2 controls matrix document**

  File: `docs/compliance/soc2-controls-matrix.md`

  ```markdown
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
  - [ ] SSO/SAML implemented (Sprint 3)
  ```

- [ ] **Step 1.8 — Run full test suite to verify no regressions**

  ```bash
  cd /d/Synexiun/1-SynexFund/HedgeCalc/TreasuryFX/backend
  JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/ -x -q --tb=short 2>&1 | tail -10
  ```

  Expected: all previously-passing tests still pass, 6 new tests pass.

- [ ] **Step 1.9 — Commit**

  ```bash
  cd /d/Synexiun/1-SynexFund/HedgeCalc/TreasuryFX
  git add backend/app/models/compliance_evidence.py \
          backend/app/tasks/compliance_evidence_export.py \
          backend/migrations/versions/h1a2b3c4d5e6_compliance_evidence_table.py \
          backend/tests/test_compliance_evidence.py \
          docs/compliance/soc2-controls-matrix.md \
          backend/app/main.py
  git commit -m "feat(compliance): SOC2 evidence table + nightly export job + controls matrix"
  ```

---

## Chunk 2: GDPR Enforcement

### Files

**Create:**
- `backend/app/tasks/gdpr_anonymise.py` — nightly anonymisation job
- `backend/app/api/routes/v1_user_gdpr.py` — data-export and account-erasure endpoints
- `backend/app/schemas/gdpr.py` — response schemas
- `backend/tests/test_gdpr_endpoints.py` — route + job tests
- `docs/compliance/gdpr-dpa-status.md` — vendor DPA documentation

**Modify:**
- `backend/app/main.py` — register gdpr_anonymise APScheduler job + include GDPR router
- `backend/app/api/routes/router.py` (or equivalent router registration) — include GDPR router

---

- [ ] **Step 2.1 — Write failing tests for GDPR endpoints**

  File: `backend/tests/test_gdpr_endpoints.py`

  ```python
  """
  Tests for GDPR data-export and account-erasure endpoints.
  All tests use AsyncMock — no PostgreSQL required.
  """
  from __future__ import annotations

  import uuid
  import pytest
  from unittest.mock import AsyncMock, MagicMock, patch
  from httpx import AsyncClient, ASGITransport
  from fastapi import FastAPI


  class TestGDPRJobImportable:
      def test_anonymise_job_importable(self):
          from app.tasks.gdpr_anonymise import run_gdpr_anonymise_job
          assert callable(run_gdpr_anonymise_job)

      def test_anonymise_user_importable(self):
          from app.tasks.gdpr_anonymise import anonymise_user
          assert callable(anonymise_user)

  class TestGDPRAnonymiseLogic:
      @pytest.mark.asyncio
      async def test_anonymise_user_hashes_email_and_name(self):
          from app.tasks.gdpr_anonymise import _hash_pii

          original_email = "john.doe@acme.com"
          hashed = _hash_pii(original_email)

          assert hashed != original_email
          assert len(hashed) == 64  # SHA-256 hex
          assert "@" not in hashed

      def test_hash_pii_is_deterministic(self):
          from app.tasks.gdpr_anonymise import _hash_pii

          val = "test@example.com"
          assert _hash_pii(val) == _hash_pii(val)

      def test_hash_pii_different_inputs_differ(self):
          from app.tasks.gdpr_anonymise import _hash_pii

          assert _hash_pii("a@example.com") != _hash_pii("b@example.com")


  class TestGDPRRouterImportable:
      def test_router_importable(self):
          from app.api.routes.v1_user_gdpr import router
          assert router is not None

      def test_data_export_route_exists(self):
          from app.api.routes.v1_user_gdpr import router
          paths = {route.path for route in router.routes}
          assert "/v1/user/data-export" in paths

      def test_account_delete_route_exists(self):
          from app.api.routes.v1_user_gdpr import router
          paths = {route.path for route in router.routes}
          assert "/v1/user/account" in paths

      def test_account_delete_is_delete_method(self):
          from app.api.routes.v1_user_gdpr import router
          delete_routes = [
              r for r in router.routes
              if hasattr(r, "methods") and "DELETE" in r.methods
          ]
          assert any("/v1/user/account" in r.path for r in delete_routes)
  ```

  Run (expect import failures):
  ```bash
  cd /d/Synexiun/1-SynexFund/HedgeCalc/TreasuryFX/backend
  JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_gdpr_endpoints.py -x -q --tb=short 2>&1 | head -30
  ```

- [ ] **Step 2.2 — Create GDPR anonymisation job**

  File: `backend/app/tasks/gdpr_anonymise.py`

  ```python
  """
  app/tasks/gdpr_anonymise.py
  ORDR Terminal — Nightly GDPR data retention enforcement.

  Runs nightly at 01:00 UTC via APScheduler.

  Policy (from docs/ops/data-retention-policy.md):
    - Personal data (name, email) is anonymised (SHA-256 hashed) after
      GDPR_RETENTION_DAYS (default: 730 = 2 years) from account creation.
    - Hard deletion is NOT performed — WORM tables (audit_events,
      calculation_runs, policy_revisions) must stay intact.
    - Only the User.email and User.full_name fields are anonymised.
      The user record remains so FK references in WORM tables are valid.
    - Anonymised users have is_active=False and hashed_password set to
      a sentinel that cannot be used to log in.

  The anonymise_user() function is also called directly by the
  DELETE /v1/user/account endpoint (right-to-erasure requests).
  """
  from __future__ import annotations

  import hashlib
  import logging
  import os
  from datetime import UTC, datetime, timedelta

  from sqlalchemy import select, update
  from sqlalchemy.ext.asyncio import AsyncSession

  from app.models.user import User

  log = logging.getLogger(__name__)

  RETENTION_DAYS = int(os.getenv("GDPR_RETENTION_DAYS", "730"))
  ANONYMISED_SENTINEL = "GDPR_ANONYMISED"
  ANONYMISED_PASSWORD_HASH = "$2b$12$GDPR_ANONYMISED_ACCOUNT_CANNOT_LOGIN_XXXXXXXXXXXXXXXXXXX"


  def _hash_pii(value: str) -> str:
      """SHA-256 hash of a PII field. Deterministic, irreversible."""
      return hashlib.sha256(value.encode("utf-8")).hexdigest()


  async def anonymise_user(session: AsyncSession, user: User) -> None:
      """
      Anonymise a single user's PII fields in-place.
      The user row is retained (for WORM FK integrity).
      Commits the change; caller should NOT commit separately.
      """
      hashed_email = _hash_pii(user.email) + "@anonymised.invalid"
      await session.execute(
          update(User)
          .where(User.id == user.id)
          .values(
              email=hashed_email,
              full_name=ANONYMISED_SENTINEL,
              hashed_password=ANONYMISED_PASSWORD_HASH,
              is_active=False,
          )
      )
      await session.commit()
      log.info("Anonymised user %s (GDPR)", user.id)


  async def run_gdpr_anonymise_job() -> None:
      """
      Entry point called by APScheduler at 01:00 UTC.
      Finds all users whose accounts are older than RETENTION_DAYS
      and whose email has not already been anonymised.
      """
      from app.core.db import async_session_maker  # lazy — avoids circular

      cutoff = datetime.now(UTC) - timedelta(days=RETENTION_DAYS)
      log.info("GDPR anonymise job starting (cutoff=%s)", cutoff.isoformat())

      async with async_session_maker() as session:
          try:
              result = await session.execute(
                  select(User).where(
                      User.created_at < cutoff,
                      User.email.not_like("%@anonymised.invalid"),
                  )
              )
              users = result.scalars().all()

              for user in users:
                  await anonymise_user(session, user)

              log.info("GDPR anonymise job complete: %d users anonymised", len(users))
          except Exception:
              log.exception("GDPR anonymise job failed — rolling back")
              await session.rollback()
  ```

- [ ] **Step 2.3 — Create GDPR schemas**

  File: `backend/app/schemas/gdpr.py`

  ```python
  """Pydantic schemas for GDPR data-export and erasure endpoints."""
  from __future__ import annotations

  from datetime import datetime
  from uuid import UUID

  from pydantic import BaseModel


  class UserDataExportResponse(BaseModel):
      user_id: UUID
      email: str
      full_name: str | None
      created_at: datetime
      company_id: UUID | None
      branch_id: UUID | None
      is_active: bool
      is_superuser: bool
      # Audit event count (not full events — those are large; user can request separately)
      audit_event_count: int

      class Config:
          from_attributes = True


  class AccountErasureResponse(BaseModel):
      status: str  # "anonymised"
      user_id: UUID
      message: str
  ```

- [ ] **Step 2.4 — Create GDPR route file**

  File: `backend/app/api/routes/v1_user_gdpr.py`

  ```python
  """
  app/api/routes/v1_user_gdpr.py
  ORDR Terminal — GDPR data subject rights endpoints.

  GET  /v1/user/data-export  — Article 15 right of access: returns all personal data
  DELETE /v1/user/account    — Article 17 right to erasure: anonymises user (not hard delete)

  Both endpoints require authentication. Users can only act on their own account.
  Anonymisation preserves WORM table integrity — rows are retained, PII is hashed.
  """
  from __future__ import annotations

  import logging

  from fastapi import APIRouter, Depends, Request
  from sqlalchemy import func, select
  from sqlalchemy.ext.asyncio import AsyncSession

  from app.core.db import get_session
  from app.core.dependencies import get_current_user
  from app.models.audit_event import AuditEvent
  from app.models.user import User
  from app.schemas.gdpr import AccountErasureResponse, UserDataExportResponse
  from app.tasks.gdpr_anonymise import anonymise_user

  log = logging.getLogger(__name__)

  router = APIRouter(tags=["gdpr"])


  @router.get("/v1/user/data-export", response_model=UserDataExportResponse)
  async def export_user_data(
      request: Request,
      db: AsyncSession = Depends(get_session),
      current_user: User = Depends(get_current_user),
  ) -> UserDataExportResponse:
      """
      GDPR Article 15 — Right of access.
      Returns all personal data held for the authenticated user.
      """
      count_result = await db.execute(
          select(func.count()).select_from(AuditEvent).where(
              AuditEvent.actor_id == current_user.id
          )
      )
      audit_count = count_result.scalar() or 0

      log.info("GDPR data export requested by user=%s", current_user.id)

      return UserDataExportResponse(
          user_id=current_user.id,
          email=current_user.email,
          full_name=current_user.full_name,
          created_at=current_user.created_at,
          company_id=current_user.company_id,
          branch_id=current_user.branch_id,
          is_active=current_user.is_active,
          is_superuser=current_user.is_superuser,
          audit_event_count=audit_count,
      )


  @router.delete("/v1/user/account", response_model=AccountErasureResponse)
  async def erase_user_account(
      request: Request,
      db: AsyncSession = Depends(get_session),
      current_user: User = Depends(get_current_user),
  ) -> AccountErasureResponse:
      """
      GDPR Article 17 — Right to erasure.
      Anonymises the user's PII (email and full_name are SHA-256 hashed).
      The user row is NOT hard-deleted to preserve WORM table FK integrity.
      The account is deactivated and the password hash is replaced with a
      sentinel that cannot be used to authenticate.
      """
      user_id = current_user.id
      log.info("GDPR erasure requested by user=%s", user_id)

      await anonymise_user(db, current_user)

      return AccountErasureResponse(
          status="anonymised",
          user_id=user_id,
          message=(
              "Your personal data has been anonymised in accordance with GDPR Article 17. "
              "Immutable audit records referencing your account are retained as required "
              "by financial regulation (MiFID II, EMIR)."
          ),
      )
  ```

- [ ] **Step 2.5 — Register GDPR router in main.py**

  In `backend/app/main.py`, find the block where routers are included (search for `app.include_router`) and add:

  ```python
  from app.api.routes.v1_user_gdpr import router as gdpr_router
  app.include_router(gdpr_router)
  ```

  Also register the nightly GDPR job in the APScheduler block:

  ```python
  from app.tasks.gdpr_anonymise import run_gdpr_anonymise_job
  _audit_scheduler.add_job(
      run_gdpr_anonymise_job,
      CronTrigger(hour=1, minute=0),
      id="gdpr_anonymise",
      replace_existing=True,
  )
  logger.info("Scheduler registered — gdpr_anonymise at 01:00 UTC daily")
  ```

- [ ] **Step 2.6 — Run GDPR tests (expect pass)**

  ```bash
  cd /d/Synexiun/1-SynexFund/HedgeCalc/TreasuryFX/backend
  JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_gdpr_endpoints.py -x -q --tb=short
  ```

  Expected output:
  ```
  9 passed in <2s
  ```

- [ ] **Step 2.7 — Create GDPR vendor DPA document**

  File: `docs/compliance/gdpr-dpa-status.md`

  ```markdown
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
  | Sentry | Error monitoring | Stack traces (PII scrubbed before send) | Yes — [Sentry DPA](https://sentry.io/legal/dpa/) | PII scrubbing config required in implementation |
  | WorkOS | SSO/SAML broker (Sprint 3) | Email, IdP tokens | Pending — sign before go-live | GDPR-compliant; DPA available on request |
  | Stripe | Billing (Sprint 3) | Name, email, payment method | Yes — [Stripe DPA](https://stripe.com/legal/dpa) | Standard DPA in Stripe Dashboard |

  ## Data Flows

  ```
  User Browser → Vercel CDN → Backend (Render) → PostgreSQL (Render)
                                                ↘ Sentry (errors only, PII scrubbed)
                                                ↘ WorkOS (SSO flows only)
                                                ↘ Stripe (billing flows only)
  ```

  ## Retention Schedule

  | Data Category | Retention Period | Basis | Deletion Method |
  |---------------|-----------------|-------|-----------------|
  | User PII (email, name) | 730 days post-account creation | Contractual necessity | Anonymisation (GDPR Art. 17) |
  | Audit events | Indefinite | Financial regulation (MiFID II Art. 75, EMIR Art. 9) | Retained — regulatory override of Art. 17 |
  | Calculation runs | Indefinite | Financial regulation | Retained |
  | Auth audit logs | 90 days | Operational security | Hard delete via `cleanup_audit_tables()` |
  | Session refresh tokens | 7 days (JWT TTL) | Session management | Automatic expiry |
  ```

- [ ] **Step 2.8 — Run full backend suite**

  ```bash
  cd /d/Synexiun/1-SynexFund/HedgeCalc/TreasuryFX/backend
  JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/ -x -q --tb=short 2>&1 | tail -10
  ```

- [ ] **Step 2.9 — Commit**

  ```bash
  cd /d/Synexiun/1-SynexFund/HedgeCalc/TreasuryFX
  git add backend/app/tasks/gdpr_anonymise.py \
          backend/app/api/routes/v1_user_gdpr.py \
          backend/app/schemas/gdpr.py \
          backend/tests/test_gdpr_endpoints.py \
          docs/compliance/gdpr-dpa-status.md \
          backend/app/main.py
  git commit -m "feat(gdpr): anonymise job, data-export endpoint, right-to-erasure endpoint, DPA docs"
  ```

---

## Chunk 3: Tenant Isolation Audit + PostgreSQL RLS

### Files

**Create:**
- `backend/migrations/versions/i1a2b3c4d5e6_rls_positions_calculation_runs.py` — Alembic migration adding RLS policies
- `backend/app/core/rls.py` — SQLAlchemy event listener that injects SET LOCAL per transaction
- `backend/tests/test_rls_tenant_isolation.py` — RLS-specific tests (pool_size ≥ 3, requires_postgres)

**Modify:**
- `backend/app/core/db.py` — import and register rls event listener; switch from NullPool to QueuePool with pool_size=3 minimum for RLS pool tests
- `backend/tests/test_tenant_isolation.py` — add any gap tests identified

---

- [ ] **Step 3.1 — Run existing tenant isolation tests and record baseline**

  ```bash
  cd /d/Synexiun/1-SynexFund/HedgeCalc/TreasuryFX/backend
  JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_tenant_isolation.py tests/test_pipeline_tenant_isolation.py tests/test_multi_tenant_policy_isolation.py -v --tb=short 2>&1 | tail -30
  ```

  Record pass/fail counts. All must pass before proceeding.

- [ ] **Step 3.2 — Write failing RLS tests**

  File: `backend/tests/test_rls_tenant_isolation.py`

  ```python
  """
  RLS tenant isolation tests.

  The PostgreSQL-specific tests (requires_postgres) verify that:
    1. SET LOCAL app.current_tenant_id is transaction-scoped (reverts on commit/rollback).
    2. With a pool of ≥ 3 connections, tenant context does not bleed across transactions.
    3. RLS policies block cross-tenant row access at the database level.

  The SQLite-compatible tests verify the rls.py module structure and
  the inject_tenant_rls coroutine interface.
  """
  from __future__ import annotations

  import uuid
  import pytest
  from unittest.mock import AsyncMock, MagicMock, call


  class TestRLSModuleStructure:
      def test_rls_module_importable(self):
          from app.core.rls import inject_tenant_rls
          assert callable(inject_tenant_rls)

      def test_rls_uses_set_local(self):
          """Source must use SET LOCAL (not SET) to keep setting transaction-scoped."""
          import inspect
          from app.core import rls
          src = inspect.getsource(rls)
          assert "SET LOCAL" in src, "RLS must use SET LOCAL for transaction-scoping"
          assert "SET app." not in src.replace("SET LOCAL", ""), \
              "Plain SET (connection-scoped) must not be used for tenant_id"

      def test_rls_module_does_not_use_connection_scoped_set(self):
          import inspect
          from app.core import rls
          src = inspect.getsource(rls)
          lines = src.splitlines()
          for line in lines:
              stripped = line.strip()
              # Must not have bare SET app.current_tenant_id without LOCAL
              if "SET app.current_tenant_id" in stripped and "SET LOCAL" not in stripped:
                  pytest.fail(
                      f"Found connection-scoped SET on line: {stripped!r}. "
                      "Must use SET LOCAL."
                  )


  class TestRLSInjectionInterface:
      @pytest.mark.asyncio
      async def test_inject_tenant_rls_executes_set_local(self):
          from app.core.rls import inject_tenant_rls

          mock_session = AsyncMock()
          mock_session.execute = AsyncMock()

          company_id = uuid.uuid4()
          await inject_tenant_rls(mock_session, str(company_id))

          mock_session.execute.assert_called_once()
          call_args = mock_session.execute.call_args
          # The SQL text should contain SET LOCAL
          sql_text = str(call_args[0][0])
          assert "SET LOCAL" in sql_text or "set local" in sql_text.lower()

      @pytest.mark.asyncio
      async def test_inject_tenant_rls_with_none_uses_empty_string(self):
          """None company_id (system/anonymous requests) must set empty string."""
          from app.core.rls import inject_tenant_rls

          mock_session = AsyncMock()
          mock_session.execute = AsyncMock()

          await inject_tenant_rls(mock_session, None)
          mock_session.execute.assert_called_once()


  @pytest.mark.requires_postgres
  class TestRLSPostgresPoolIsolation:
      """
      These tests require a live PostgreSQL instance with RLS policies applied.
      They verify no cross-tenant leakage across pooled connections (pool_size=3).
      """

      @pytest.mark.asyncio
      async def test_set_local_reverts_after_transaction(self, pg_engine):
          """
          SET LOCAL must not persist after the transaction ends.
          Acquire the same connection twice from the pool; verify the
          tenant setting is absent in the second transaction.
          """
          from sqlalchemy import text
          from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

          Session = async_sessionmaker(pg_engine, class_=AsyncSession, expire_on_commit=False)
          company_id = str(uuid.uuid4())

          async with Session() as s1:
              await s1.execute(text(f"SET LOCAL app.current_tenant_id = '{company_id}'"))
              result = await s1.execute(
                  text("SELECT current_setting('app.current_tenant_id', true)")
              )
              assert result.scalar() == company_id
              await s1.rollback()  # transaction ends — SET LOCAL reverts

          async with Session() as s2:
              result = await s2.execute(
                  text("SELECT current_setting('app.current_tenant_id', true)")
              )
              value = result.scalar()
              # After rollback, the setting must be gone (empty string or NULL)
              assert value in (None, "", "null"), \
                  f"SET LOCAL leaked across transactions: got {value!r}"

      @pytest.mark.asyncio
      async def test_concurrent_sessions_no_cross_tenant_leak(self, pg_engine):
          """
          With pool_size=3, concurrent transactions for different tenants
          must not see each other's tenant settings.
          """
          import asyncio
          from sqlalchemy import text
          from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

          Session = async_sessionmaker(pg_engine, class_=AsyncSession, expire_on_commit=False)

          tenant_a = str(uuid.uuid4())
          tenant_b = str(uuid.uuid4())
          tenant_c = str(uuid.uuid4())

          results = {}

          async def run_tenant(name: str, tenant_id: str):
              async with Session() as s:
                  await s.execute(text(f"SET LOCAL app.current_tenant_id = '{tenant_id}'"))
                  # Simulate work
                  await asyncio.sleep(0.05)
                  result = await s.execute(
                      text("SELECT current_setting('app.current_tenant_id', true)")
                  )
                  results[name] = result.scalar()
                  await s.commit()

          await asyncio.gather(
              run_tenant("a", tenant_a),
              run_tenant("b", tenant_b),
              run_tenant("c", tenant_c),
          )

          assert results["a"] == tenant_a, f"Tenant A leaked: {results['a']}"
          assert results["b"] == tenant_b, f"Tenant B leaked: {results['b']}"
          assert results["c"] == tenant_c, f"Tenant C leaked: {results['c']}"
  ```

  Run (SQLite-compatible tests only — postgres tests skip):
  ```bash
  cd /d/Synexiun/1-SynexFund/HedgeCalc/TreasuryFX/backend
  JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_rls_tenant_isolation.py -x -q --tb=short -k "not postgres" 2>&1 | head -30
  ```

- [ ] **Step 3.3 — Create RLS injection module**

  File: `backend/app/core/rls.py`

  ```python
  """
  app/core/rls.py
  ORDR Terminal — PostgreSQL Row Level Security tenant injection.

  Provides inject_tenant_rls() which executes:
      SET LOCAL app.current_tenant_id = '<uuid>'
  within the current transaction.

  CRITICAL: SET LOCAL is used (not SET) because:
  - SET LOCAL is transaction-scoped: the value reverts when the transaction ends.
  - SET is connection-scoped: the value persists on the pooled connection and
    could leak to a subsequent request that reuses the same connection.
  - async connection pooling (asyncpg + SQLAlchemy) reuses connections across
    requests. SET LOCAL is the only safe option.

  Usage (in get_session dependency or route handlers):
      await inject_tenant_rls(session, str(current_user.company_id))

  The RLS policies on `positions` and `calculation_runs` then enforce:
      company_id = current_setting('app.current_tenant_id')::uuid
  at the PostgreSQL level, as a defence-in-depth layer on top of application-level
  company_id filtering.
  """
  from __future__ import annotations

  import logging

  from sqlalchemy import text
  from sqlalchemy.ext.asyncio import AsyncSession

  log = logging.getLogger(__name__)


  async def inject_tenant_rls(session: AsyncSession, tenant_id: str | None) -> None:
      """
      Inject the tenant ID into the current PostgreSQL transaction via SET LOCAL.
      Must be called after a transaction has started (i.e., after the first
      statement or explicitly after BEGIN).

      Args:
          session:   The active AsyncSession for the current request.
          tenant_id: The company UUID as a string, or None for system/anonymous requests.
                     None sets an empty string, which RLS policies treat as no-match
                     (anonymous requests cannot see any tenant-scoped rows).
      """
      safe_id = str(tenant_id) if tenant_id else ""
      await session.execute(
          text("SET LOCAL app.current_tenant_id = :tenant_id"),
          {"tenant_id": safe_id},
      )
      log.debug("RLS tenant injected: company_id=%s", safe_id or "<anonymous>")
  ```

- [ ] **Step 3.4 — Create RLS Alembic migration**

  File: `backend/migrations/versions/i1a2b3c4d5e6_rls_positions_calculation_runs.py`

  ```python
  """Add PostgreSQL RLS policies on positions and calculation_runs

  Revision ID: i1a2b3c4d5e6
  Revises: h1a2b3c4d5e6
  Create Date: 2026-03-28

  RLS policy: tenant_id = current_setting('app.current_tenant_id')::uuid
  Applies to positions and calculation_runs.

  IMPORTANT: RLS is a defence-in-depth layer. Application-level company_id
  filtering must remain in all queries. RLS is not a replacement.

  Superuser and the application role bypass RLS via BYPASSRLS or FORCE ROW SECURITY.
  The application connects as a non-superuser role; superuser migrations bypass RLS.
  """
  from alembic import op
  import sqlalchemy as sa


  revision = "i1a2b3c4d5e6"
  down_revision = "h1a2b3c4d5e6"
  branch_labels = None
  depends_on = None


  def upgrade() -> None:
      # Enable RLS on positions
      op.execute("ALTER TABLE positions ENABLE ROW LEVEL SECURITY;")
      op.execute("ALTER TABLE positions FORCE ROW LEVEL SECURITY;")

      # SELECT policy: users see rows where company_id matches the session variable
      # The COALESCE handles the case where the variable is not set (returns empty string)
      op.execute("""
          CREATE POLICY positions_tenant_isolation_select
          ON positions
          FOR SELECT
          USING (
              company_id::text = COALESCE(
                  NULLIF(current_setting('app.current_tenant_id', true), ''),
                  '00000000-0000-0000-0000-000000000000'
              )
          );
      """)

      # INSERT policy: users can only insert rows for their own tenant
      op.execute("""
          CREATE POLICY positions_tenant_isolation_insert
          ON positions
          FOR INSERT
          WITH CHECK (
              company_id::text = COALESCE(
                  NULLIF(current_setting('app.current_tenant_id', true), ''),
                  '00000000-0000-0000-0000-000000000000'
              )
          );
      """)

      # UPDATE/DELETE policies: same tenant check
      op.execute("""
          CREATE POLICY positions_tenant_isolation_update
          ON positions
          FOR UPDATE
          USING (
              company_id::text = COALESCE(
                  NULLIF(current_setting('app.current_tenant_id', true), ''),
                  '00000000-0000-0000-0000-000000000000'
              )
          );
      """)

      # Enable RLS on calculation_runs
      op.execute("ALTER TABLE calculation_runs ENABLE ROW LEVEL SECURITY;")
      op.execute("ALTER TABLE calculation_runs FORCE ROW LEVEL SECURITY;")

      op.execute("""
          CREATE POLICY calc_runs_tenant_isolation_select
          ON calculation_runs
          FOR SELECT
          USING (
              company_id::text = COALESCE(
                  NULLIF(current_setting('app.current_tenant_id', true), ''),
                  '00000000-0000-0000-0000-000000000000'
              )
              OR company_id IS NULL  -- allow unauthenticated calculate calls
          );
      """)

      op.execute("""
          CREATE POLICY calc_runs_tenant_isolation_insert
          ON calculation_runs
          FOR INSERT
          WITH CHECK (
              company_id::text = COALESCE(
                  NULLIF(current_setting('app.current_tenant_id', true), ''),
                  '00000000-0000-0000-0000-000000000000'
              )
              OR company_id IS NULL
          );
      """)


  def downgrade() -> None:
      op.execute("DROP POLICY IF EXISTS positions_tenant_isolation_select ON positions;")
      op.execute("DROP POLICY IF EXISTS positions_tenant_isolation_insert ON positions;")
      op.execute("DROP POLICY IF EXISTS positions_tenant_isolation_update ON positions;")
      op.execute("ALTER TABLE positions DISABLE ROW LEVEL SECURITY;")

      op.execute("DROP POLICY IF EXISTS calc_runs_tenant_isolation_select ON calculation_runs;")
      op.execute("DROP POLICY IF EXISTS calc_runs_tenant_isolation_insert ON calculation_runs;")
      op.execute("ALTER TABLE calculation_runs DISABLE ROW LEVEL SECURITY;")
  ```

- [ ] **Step 3.5 — Wire RLS injection into get_session dependency**

  In `backend/app/core/db.py`, the `get_session` function currently yields a plain session. The RLS injection is intentionally NOT placed in `get_session` itself (it needs the tenant_id from the authenticated user, which is not available at session-creation time). Instead, create a FastAPI dependency that composes session + RLS injection.

  Add to `backend/app/core/db.py`:

  ```python
  # RLS-aware session: call this from routes that need tenant-scoped RLS enforcement.
  # Do NOT call inject_tenant_rls in get_session() — the tenant_id is not available there.
  # Use get_rls_session() as a Depends() alongside get_current_user.
  ```

  The actual RLS wiring is done at the route level or in a composite dependency. Add a helper to `backend/app/core/dependencies.py`:

  ```python
  # In backend/app/core/dependencies.py, add after get_current_user:

  async def get_session_with_rls(
      db: AsyncSession = Depends(get_session),
      current_user: User = Depends(get_current_user),
  ) -> AsyncGenerator[AsyncSession, None]:
      """
      Yields an AsyncSession with PostgreSQL RLS tenant context injected.
      Use as a drop-in replacement for get_session on routes that access
      positions or calculation_runs.
      """
      from app.core.rls import inject_tenant_rls
      tenant_id = str(current_user.company_id) if current_user.company_id else None
      await inject_tenant_rls(db, tenant_id)
      yield db
  ```

- [ ] **Step 3.6 — Run all RLS SQLite-compatible tests**

  ```bash
  cd /d/Synexiun/1-SynexFund/HedgeCalc/TreasuryFX/backend
  JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_rls_tenant_isolation.py tests/test_tenant_isolation.py tests/test_pipeline_tenant_isolation.py tests/test_multi_tenant_policy_isolation.py -v --tb=short -k "not requires_postgres" 2>&1 | tail -20
  ```

  Expected: all non-postgres tests pass (postgres tests auto-skip).

- [ ] **Step 3.7 — Run full suite for regression check**

  ```bash
  cd /d/Synexiun/1-SynexFund/HedgeCalc/TreasuryFX/backend
  JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/ -x -q --tb=short 2>&1 | tail -10
  ```

- [ ] **Step 3.8 — Commit**

  ```bash
  cd /d/Synexiun/1-SynexFund/HedgeCalc/TreasuryFX
  git add backend/app/core/rls.py \
          backend/migrations/versions/i1a2b3c4d5e6_rls_positions_calculation_runs.py \
          backend/tests/test_rls_tenant_isolation.py \
          backend/app/core/dependencies.py
  git commit -m "feat(rls): PostgreSQL RLS policies on positions + calculation_runs, SET LOCAL injection"
  ```

---

## Chunk 4: Vendor Security Registry + Final Validation

### Files

**Create:**
- `docs/compliance/vendor-registry.md` — complete vendor security registry

**Verify:**
- All tests across chunks pass
- TypeScript check passes on frontend (no frontend changes — verify no regressions)

---

- [ ] **Step 4.1 — Create vendor security registry**

  File: `docs/compliance/vendor-registry.md`

  ```markdown
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
  | **DPA signed** | Yes — [Render Data Processing Agreement](https://render.com/privacy) |
  | **Encryption at rest** | Yes — AES-256 (PostgreSQL managed service) |
  | **Encryption in transit** | Yes — TLS 1.2+ enforced |
  | **Data residency** | US (Oregon) by default; EU region available on request |
  | **SOC2 Type II** | Yes (Render holds SOC2 Type II certification) |
  | **Fallback if unavailable** | Restore to alternate cloud provider using `pg_backup.sh` + Backblaze B2 backup. RTO: 4h. See `docs/ops/disaster-recovery.md`. |

  ### 2. Vercel
  | Field | Value |
  |-------|-------|
  | **Role** | Frontend hosting + CDN |
  | **Data processed** | IP addresses, session tokens (in cookies/headers), browser metadata |
  | **Data classification** | PII (IP), Credentials (session tokens) |
  | **DPA signed** | Yes — [Vercel DPA](https://vercel.com/legal/dpa) |
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
  | **Fallback if unavailable** | Restore from backup to a new Render PostgreSQL instance. Connection string updated via env var. RTO: 4h. RPO: 24h. |

  ### 4. Redis (Render managed — Sprint 2, pending)
  | Field | Value |
  |-------|-------|
  | **Role** | Rate limiting, session cache, market data cache |
  | **Data processed** | Session tokens (transient), rate limit counters, cached market data |
  | **Data classification** | Credentials (session tokens — transient), Operational |
  | **DPA signed** | Covered by Render.com DPA |
  | **Fallback if unavailable** | Rate limiting: falls back to in-process token bucket (fail-safe, not fail-open). Market data cache: bypasses cache, calls provider directly. Session: JWT signature validation continues without Redis. |

  ### 5. Sentry
  | Field | Value |
  |-------|-------|
  | **Role** | Error monitoring and alerting |
  | **Data processed** | Stack traces, request context, error metadata |
  | **Data classification** | Operational (PII scrubbed before transmission) |
  | **DPA signed** | Yes — [Sentry DPA](https://sentry.io/legal/dpa/) |
  | **PII scrubbing** | Required: strip email, name, and financial values from Sentry payloads before send (configured via `before_send` hook) |
  | **Data residency** | US by default; EU available on paid plans |
  | **Fallback if unavailable** | Structured logs in Render log stream remain available. Alerting degraded; manually check logs. |

  ### 6. WorkOS (Sprint 3 — pending integration)
  | Field | Value |
  |-------|-------|
  | **Role** | SSO/SAML/OIDC broker (Okta, Azure AD, Google Workspace) |
  | **Data processed** | Email, name, IdP-issued tokens |
  | **Data classification** | PII, Credentials (IdP tokens — transient) |
  | **DPA signed** | Pending — must sign before go-live. [WorkOS DPA available on request.](https://workos.com/legal) |
  | **Fallback if unavailable** | Password authentication remains active for all tenants. SSO login degraded; users redirect to password flow. |

  ### 7. Stripe (Sprint 3 — pending integration)
  | Field | Value |
  |-------|-------|
  | **Role** | Subscription billing |
  | **Data processed** | Name, email, payment method (tokenised — Stripe never shares raw card data) |
  | **Data classification** | PII, Financial (billing) |
  | **DPA signed** | Yes — [Stripe Data Processing Agreement](https://stripe.com/legal/dpa) (accepted in Stripe Dashboard) |
  | **PCI DSS** | Stripe holds PCI DSS Level 1. ORDR Terminal never processes raw card data. |
  | **Fallback if unavailable** | New subscriptions blocked. Existing subscriptions continue based on last-known plan tier stored in DB. Manual billing via invoice. |

  ### 8. Finnhub
  | Field | Value |
  |-------|-------|
  | **Role** | Market data provider (FX rates, equity prices) |
  | **Data processed** | API key only; no customer data sent to Finnhub |
  | **Data classification** | Operational (API key = credential) |
  | **DPA signed** | Not required (no personal data transmitted) |
  | **Fallback if unavailable** | Automatic failover to Twelve Data or Alpha Vantage via `market_data` service. Stale data served from cache for up to 60s. |

  ### 9. Twelve Data
  | Field | Value |
  |-------|-------|
  | **Role** | Market data provider (FX rates, fallback) |
  | **Data processed** | API key only; no customer data sent |
  | **Data classification** | Operational (API key = credential) |
  | **DPA signed** | Not required |
  | **Fallback if unavailable** | Failover to Alpha Vantage. |

  ### 10. Alpha Vantage
  | Field | Value |
  |-------|-------|
  | **Role** | Market data provider (FX rates, tertiary fallback) |
  | **Data processed** | API key only; no customer data sent |
  | **Data classification** | Operational (API key = credential) |
  | **DPA signed** | Not required |
  | **Fallback if unavailable** | Market data unavailable; frontend shows stale data warning. Calculation engine continues with manually-entered rates. |

  ---

  ## Risk Summary

  | Vendor | Risk Level | Key Risk | Mitigation |
  |--------|-----------|----------|-----------|
  | Render | Medium | All data at rest | SOC2 Type II, encryption at rest, Backblaze backup |
  | Vercel | Low | IP/session only | SOC2 Type II, no financial data |
  | Sentry | Low | PII scrubbing required | PII scrubbing hook must be implemented (Sprint 2) |
  | WorkOS | Medium | PII + IdP tokens | DPA pending — must sign before SSO go-live |
  | Stripe | Low | Billing PII only | PCI DSS Level 1, DPA in place |
  | Finnhub/TwelveData/AlphaVantage | Very Low | API key only | No customer data transmitted |
  ```

- [ ] **Step 4.2 — Run complete backend test suite and record evidence**

  ```bash
  cd /d/Synexiun/1-SynexFund/HedgeCalc/TreasuryFX/backend
  JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/ -q --tb=short 2>&1 | tail -15
  ```

  Record final output. Expected:
  ```
  NNNN passed, 0 failed, NNN skipped (postgres) in <Xs
  ```
  Coverage must remain ≥ 40% (target: maintain or improve from ~62%).

- [ ] **Step 4.3 — TypeScript check (no frontend changes — verify clean)**

  ```bash
  cd /d/Synexiun/1-SynexFund/HedgeCalc/TreasuryFX/frontend
  npx tsc --noEmit 2>&1 | tail -10
  ```

  Expected: `0 errors` (no frontend changes in this sprint).

- [ ] **Step 4.4 — Commit vendor registry**

  ```bash
  cd /d/Synexiun/1-SynexFund/HedgeCalc/TreasuryFX
  git add docs/compliance/vendor-registry.md
  git commit -m "docs(compliance): vendor security registry with DPA status for all 10 vendors"
  ```

- [ ] **Step 4.5 — Final integration commit**

  ```bash
  cd /d/Synexiun/1-SynexFund/HedgeCalc/TreasuryFX
  git add docs/superpowers/plans/2026-03-28-sprint4-compliance-pipeline.md
  git commit -m "docs(sprint4): add compliance pipeline implementation plan"
  ```

---

## Execution Order & Dependencies

```
Chunk 1 (SOC2 + Evidence Table)
    |
    └── Chunk 2 (GDPR Enforcement)     [can start after Step 1.6 — test pass confirmed]
            |
            └── Chunk 3 (RLS)          [can start after Step 2.6 — test pass confirmed]
                    |
                    └── Chunk 4 (Vendor Registry + Final Validation)
```

All chunks are sequential. Each chunk ends with a test run that must pass before the next chunk begins.

## Done Criteria Checklist

- [ ] `compliance_evidence` table exists in migration with NO UPDATE/DELETE triggers
- [ ] Nightly evidence export job registered in APScheduler at 02:00 UTC
- [ ] `GET /v1/user/data-export` endpoint returns all user PII
- [ ] `DELETE /v1/user/account` anonymises user (does NOT hard delete)
- [ ] Nightly GDPR anonymisation job registered in APScheduler at 01:00 UTC
- [ ] `app/core/rls.py` uses `SET LOCAL` (verified in test)
- [ ] RLS migration applied to `positions` and `calculation_runs`
- [ ] `get_session_with_rls` dependency available in `dependencies.py`
- [ ] All tenant isolation tests pass (including new RLS tests, postgres tests skipped in SQLite CI)
- [ ] `docs/compliance/soc2-controls-matrix.md` committed and mapped to SOC2 TSC
- [ ] `docs/compliance/gdpr-dpa-status.md` committed with DPA status for all vendors
- [ ] `docs/compliance/vendor-registry.md` committed with all 10 vendors
- [ ] Full backend test suite passes with 0 failures
- [ ] TypeScript check clean
