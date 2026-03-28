"""
tests/test_compliance_evidence.py
SOC2 compliance evidence model and nightly export job tests.

DB-integration tests are marked requires_postgres and auto-skipped on SQLite.
The export job tests use AsyncMock to avoid any real DB interaction.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ---------------------------------------------------------------------------
# Model tests (no DB required)
# ---------------------------------------------------------------------------

class TestComplianceEvidenceModel:
    def test_model_importable(self):
        from app.models.compliance_evidence import ComplianceEvidence  # noqa: F401
        assert ComplianceEvidence.__tablename__ == "compliance_evidence"

    def test_model_has_required_columns(self):
        from app.models.compliance_evidence import ComplianceEvidence
        cols = {c.name for c in ComplianceEvidence.__table__.columns}
        required = {
            "id",
            "company_id",
            "evidence_date",
            "evidence_type",
            "payload",
            "latest_audit_event_hash",
            "created_at",
        }
        assert required.issubset(cols), f"Missing columns: {required - cols}"

    def test_model_has_no_update_trigger_comment(self):
        """Verify the module docstring mentions WORM / no-update semantics."""
        import app.models.compliance_evidence as mod
        assert "WORM" in (mod.__doc__ or ""), "Module docstring must mention WORM"

    def test_evidence_type_enum_values(self):
        from app.models.compliance_evidence import EVIDENCE_TYPES
        assert "user_count" in EVIDENCE_TYPES
        assert "policy_change_count" in EVIDENCE_TYPES
        assert "failed_auth_count" in EVIDENCE_TYPES


# ---------------------------------------------------------------------------
# Export job tests (AsyncMock-based, no real DB)
# ---------------------------------------------------------------------------

class TestComplianceExportJob:
    def test_export_job_importable(self):
        from app.tasks.compliance_evidence_export import (  # noqa: F401
            collect_evidence_snapshot,
            run_compliance_evidence_export,
        )

    @pytest.mark.asyncio
    async def test_export_job_inserts_three_evidence_rows(self):
        """collect_evidence_snapshot returns exactly 3 rows for one tenant."""
        from app.tasks.compliance_evidence_export import collect_evidence_snapshot

        company_id = uuid.uuid4()

        # Build a mock session whose execute() always returns scalar 0 or None
        mock_session = AsyncMock()

        # scalar() calls: user_count=5, policy_count=2, failed_count=1
        # scalar() for latest_hash: return None
        scalar_side_effects = [5, 2, 1, None]
        scalar_mock = MagicMock(side_effect=scalar_side_effects)
        execute_result = MagicMock()
        execute_result.scalar = scalar_mock
        mock_session.execute = AsyncMock(return_value=execute_result)

        rows = await collect_evidence_snapshot(mock_session, company_id, snapshot_date=date(2026, 3, 28))

        assert len(rows) == 3
        types = {r.evidence_type for r in rows}
        assert types == {"user_count", "policy_change_count", "failed_auth_count"}
        for row in rows:
            assert row.company_id == company_id
            assert row.evidence_date == date(2026, 3, 28)

    @pytest.mark.asyncio
    async def test_export_job_payload_contains_count(self):
        """Each evidence row payload has a 'count' key."""
        from app.tasks.compliance_evidence_export import collect_evidence_snapshot

        company_id = uuid.uuid4()

        scalar_side_effects = [10, 3, 0, "abcd1234"]
        scalar_mock = MagicMock(side_effect=scalar_side_effects)
        execute_result = MagicMock()
        execute_result.scalar = scalar_mock
        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(return_value=execute_result)

        rows = await collect_evidence_snapshot(mock_session, company_id)

        for row in rows:
            assert "count" in row.payload, f"payload missing 'count': {row.payload}"

        user_row = next(r for r in rows if r.evidence_type == "user_count")
        assert user_row.payload["count"] == 10
        assert user_row.latest_audit_event_hash == "abcd1234"
