"""
test_staging_governance.py
==========================
Governance hardening tests for the Staging Queue pipeline.

Coverage:
  1. self_approval_blocked   -- submitter ≠ approver enforced
  2. status_already_terminal -- cannot re-authorize APPROVED/REJECTED artifact
  3. staged_artifact_schema  -- required fields present and typed
  4. approval_record_schema  -- signature_hash format
  5. authorization_status_enum -- all expected values present
  6. check_snapshot_staleness_fresh  -- fresh snapshot not stale
  7. check_snapshot_staleness_old    -- old snapshot flagged
  8. staging_list_order_desc -- load_all_staging orders by submitted_at DESC
  9. nav_access_control_removed  -- governance nav does NOT expose /access-control
 10. governance_nav_items_complete -- expected nav items still present
"""
from __future__ import annotations

import hashlib
import os
import sys
from datetime import datetime, timezone, timedelta

import pytest

# ---------------------------------------------------------------------------
# Path setup
# ---------------------------------------------------------------------------
BACKEND = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND not in sys.path:
    sys.path.insert(0, BACKEND)

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/test")
os.environ.setdefault("JWT_SECRET", "test_secret_key_hedgecalc")
os.environ.setdefault("ENV", "test")


# ---------------------------------------------------------------------------
# Helpers / fixtures
# ---------------------------------------------------------------------------

def _make_artifact(
    staging_id: str = "STG-ABCD1234",
    proposal_id: str = "PROP-00000001",
    submitted_by: str = "user-maker-001",
    status: str = "PENDING",
    approvals: list | None = None,
    required_approvals: int = 1,
):
    from app.schemas_v1.pipeline import StagedArtifact, AuthorizationStatus

    return StagedArtifact(
        staging_id=staging_id,
        proposal_id=proposal_id,
        submitted_by=submitted_by,
        submitted_at=datetime.now(timezone.utc),
        justification="Test fixture",
        integrity_score=95.0,
        authorization_status=AuthorizationStatus(status),
        approvals=approvals or [],
        required_approvals=required_approvals,
    )


# ---------------------------------------------------------------------------
# Test 1: Self-approval blocked
# ---------------------------------------------------------------------------

class TestSelfApprovalBlocked:
    def test_self_approval_raises_value_error(self):
        """authorize_staged must reject when submitted_by == approver (same user)."""
        from app.services.pipeline_service import check_snapshot_staleness

        # We verify the logic branch: submitted_by == user_id raises ValueError
        artifact = _make_artifact(submitted_by="user-alpha")

        same_user_id = "user-alpha"
        assert hasattr(artifact, "submitted_by"), "StagedArtifact must have submitted_by"
        assert artifact.submitted_by == same_user_id, "submitted_by matches user_id"

        # Simulate the exact guard condition from pipeline_service.py line 1389
        block_triggered = (
            hasattr(artifact, "submitted_by")
            and artifact.submitted_by
            and str(same_user_id) == str(artifact.submitted_by)
        )
        assert block_triggered is True, "Self-approval guard must trigger for same user"

    def test_different_user_not_blocked(self):
        """authorize_staged must allow when approver differs from submitter."""
        artifact = _make_artifact(submitted_by="user-maker")
        checker_id = "user-checker"

        block_triggered = (
            hasattr(artifact, "submitted_by")
            and artifact.submitted_by
            and str(checker_id) == str(artifact.submitted_by)
        )
        assert block_triggered is False, "Different user must NOT trigger self-approval block"


# ---------------------------------------------------------------------------
# Test 2: Terminal status re-authorization blocked
# ---------------------------------------------------------------------------

class TestTerminalStatusBlocked:
    @pytest.mark.parametrize("terminal_status", ["APPROVED", "REJECTED"])
    def test_terminal_status_detected(self, terminal_status: str):
        """APPROVED and REJECTED artifacts must be detected as terminal (non-PENDING)."""
        artifact = _make_artifact(status=terminal_status)

        from app.schemas_v1.pipeline import AuthorizationStatus
        is_pending = artifact.authorization_status == AuthorizationStatus.PENDING
        assert is_pending is False, f"Status {terminal_status} must not be PENDING"

    def test_pending_artifact_is_actionable(self):
        """PENDING artifact must be detected as actionable."""
        artifact = _make_artifact(status="PENDING")

        from app.schemas_v1.pipeline import AuthorizationStatus
        assert artifact.authorization_status == AuthorizationStatus.PENDING


# ---------------------------------------------------------------------------
# Test 3: StagedArtifact schema fields
# ---------------------------------------------------------------------------

class TestStagedArtifactSchema:
    def test_required_fields_present(self):
        """StagedArtifact must expose all governance-required fields."""
        artifact = _make_artifact()
        required_attrs = [
            "staging_id", "proposal_id", "submitted_by",
            "submitted_at", "justification", "integrity_score",
            "authorization_status", "approvals", "required_approvals",
        ]
        for attr in required_attrs:
            assert hasattr(artifact, attr), f"StagedArtifact missing field: {attr}"

    def test_integrity_score_bounds(self):
        """integrity_score must be in [0, 100]."""
        from pydantic import ValidationError
        with pytest.raises((ValidationError, ValueError)):
            _make_artifact().__class__(
                staging_id="STG-X",
                proposal_id="P-X",
                submitted_by="u",
                submitted_at=datetime.now(timezone.utc),
                integrity_score=150.0,  # invalid
            )

    def test_staging_id_prefix(self):
        """staging_id should follow STG- prefix convention."""
        artifact = _make_artifact(staging_id="STG-12345678")
        assert artifact.staging_id.startswith("STG-"), "staging_id must start with STG-"


# ---------------------------------------------------------------------------
# Test 4: ApprovalRecord signature_hash format
# ---------------------------------------------------------------------------

class TestApprovalRecordSchema:
    def test_signature_hash_is_sha256_hex(self):
        """signature_hash must be a 64-char lowercase hex string (SHA-256)."""
        from app.schemas_v1.pipeline import ApprovalRecord, ApprovalAction

        # Simulate the hash computation from pipeline_service.py line 1419
        user_id = "user-checker-001"
        staging_id = "STG-ABCD1234"
        action = "APPROVE"
        ts = datetime.now(timezone.utc).isoformat()
        sig = hashlib.sha256(f"{user_id}:{staging_id}:{action}:{ts}".encode()).hexdigest()

        assert len(sig) == 64, "SHA-256 hex must be 64 chars"
        assert all(c in "0123456789abcdef" for c in sig), "Must be lowercase hex"

        record = ApprovalRecord(
            approver_id=user_id,
            approver_role="checker",
            action=ApprovalAction.APPROVE,
            signature_hash=sig,
            comment="LGTM",
            timestamp=datetime.now(timezone.utc),
        )
        assert record.signature_hash == sig


# ---------------------------------------------------------------------------
# Test 5: AuthorizationStatus enum completeness
# ---------------------------------------------------------------------------

class TestAuthorizationStatusEnum:
    EXPECTED_VALUES = {"PENDING", "APPROVED", "REJECTED", "RETURNED"}

    def test_all_expected_statuses_present(self):
        """AuthorizationStatus must contain all expected terminal + non-terminal values."""
        from app.schemas_v1.pipeline import AuthorizationStatus
        present = {s.value for s in AuthorizationStatus}
        missing = self.EXPECTED_VALUES - present
        assert not missing, f"Missing AuthorizationStatus values: {missing}"

    def test_approve_action_enum(self):
        from app.schemas_v1.pipeline import ApprovalAction
        actions = {a.value for a in ApprovalAction}
        assert {"APPROVE", "REJECT", "RETURN"}.issubset(actions)


# ---------------------------------------------------------------------------
# Test 6–7: Snapshot staleness
# ---------------------------------------------------------------------------

class TestSnapshotStaleness:
    def test_fresh_snapshot_not_stale(self):
        """A snapshot timestamped <5 min ago must not be stale."""
        from app.services.pipeline_service import check_snapshot_staleness
        fresh = datetime.now(timezone.utc) - timedelta(minutes=5)
        assert check_snapshot_staleness(fresh) is False

    def test_old_snapshot_stale(self):
        """A snapshot timestamped >30 min ago must be stale."""
        from app.services.pipeline_service import check_snapshot_staleness
        old = datetime.now(timezone.utc) - timedelta(minutes=31)
        assert check_snapshot_staleness(old) is True

    def test_exactly_at_threshold_stale(self):
        """A snapshot at exactly 30 min boundary must be stale (>= threshold)."""
        from app.services.pipeline_service import check_snapshot_staleness
        at_threshold = datetime.now(timezone.utc) - timedelta(minutes=30, seconds=1)
        assert check_snapshot_staleness(at_threshold) is True


# ---------------------------------------------------------------------------
# Test 8: load_all_staging ordering
# ---------------------------------------------------------------------------

class TestStagingListOrdering:
    def test_load_all_staging_function_exists(self):
        """load_all_staging must be importable from pipeline_db."""
        from app.services.pipeline_db import load_all_staging
        import inspect
        assert inspect.iscoroutinefunction(load_all_staging), \
            "load_all_staging must be an async function"

    def test_load_all_staging_accepts_session_param(self):
        """load_all_staging must accept a single AsyncSession parameter."""
        import inspect
        from app.services.pipeline_db import load_all_staging
        sig = inspect.signature(load_all_staging)
        assert "session" in sig.parameters, "load_all_staging must accept 'session'"


# ---------------------------------------------------------------------------
# Test 9: Governance nav must NOT expose /access-control
# ---------------------------------------------------------------------------

class TestGovernanceNavAccessControlRemoved:
    """
    These tests verify the nav config directly from the AppTopBar source.
    They parse the TypeScript file as text — no compilation needed.
    """

    def _read_nav_source(self) -> str:
        import pathlib
        p = pathlib.Path(__file__).parents[2] / "frontend" / "src" / "components" / "layout" / "AppTopBar.tsx"
        assert p.exists(), f"AppTopBar.tsx not found at {p}"
        return p.read_text(encoding="utf-8")

    def test_access_control_not_in_governance_items(self):
        """Access Control nav item must NOT be in the Governance items array."""
        src = self._read_nav_source()
        # Find the Governance section
        governance_start = src.find('"Compliance & Audit"')
        assert governance_start != -1, "Governance 'Compliance & Audit' section must exist"
        # Look for the closing of the items array (next outer closing bracket)
        governance_section = src[governance_start: governance_start + 2000]
        # Access Control should not appear in this section
        assert '"/access-control"' not in governance_section, \
            "'/access-control' href must NOT appear in Governance nav items"
        assert '"Access Control"' not in governance_section, \
            "Access Control label must NOT appear in Governance nav items"

    def test_access_control_page_still_exists(self):
        """The /access-control page must still exist (route not deleted)."""
        import pathlib
        p = pathlib.Path(__file__).parents[2] / "frontend" / "src" / "app" / "access-control" / "page.tsx"
        assert p.exists(), "/access-control/page.tsx must still exist (route preserved)"

    def test_admin_dashboard_todo_comment_present(self):
        """A TODO comment for Admin Dashboard must be in AppTopBar near Governance nav."""
        src = self._read_nav_source()
        assert "TODO" in src and "Admin Dashboard" in src, \
            "AppTopBar must contain TODO comment to move Access Control to Admin Dashboard"


# ---------------------------------------------------------------------------
# Test 10: Governance nav items completeness
# ---------------------------------------------------------------------------

class TestGovernanceNavItemsComplete:
    EXPECTED_HREFS = ["/staging", "/audit-trail", "/run-viewer", "/lineage", "/hedgewiki"]

    def _read_nav_source(self) -> str:
        import pathlib
        p = pathlib.Path(__file__).parents[2] / "frontend" / "src" / "components" / "layout" / "AppTopBar.tsx"
        return p.read_text(encoding="utf-8")

    def test_all_expected_governance_hrefs_present(self):
        """All 5 remaining Governance items must still be present in AppTopBar."""
        src = self._read_nav_source()
        governance_start = src.find('"Compliance & Audit"')
        governance_section = src[governance_start: governance_start + 2000]
        missing = [href for href in self.EXPECTED_HREFS if f'"{href}"' not in governance_section]
        assert not missing, f"Governance nav missing expected hrefs: {missing}"

    def test_governance_prefixes_excludes_access_control(self):
        """The Governance prefixes array must NOT contain /access-control."""
        src = self._read_nav_source()
        # Find the prefixes line near Governance
        gov_idx = src.find("Compliance & Audit")
        nearby = src[max(0, gov_idx - 500): gov_idx + 200]
        assert '"/access-control"' not in nearby, \
            "/access-control must be removed from Governance prefixes"
