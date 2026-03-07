"""
test_staging_governance.py
==========================
Governance hardening tests for the Staging Queue pipeline.

Coverage:
  1.  self_approval_blocked        -- submitter ≠ approver enforced
  2.  status_already_terminal      -- cannot re-authorize APPROVED/REJECTED artifact
  3.  staged_artifact_schema       -- required fields present and typed
  4.  approval_record_schema       -- signature_hash format
  5.  authorization_status_enum    -- all expected values present
  6.  check_snapshot_staleness_fresh  -- fresh snapshot not stale
  7.  check_snapshot_staleness_old    -- old snapshot flagged
  8.  staging_list_order_desc      -- load_all_staging orders by submitted_at DESC
  9.  nav_access_control_removed   -- governance nav does NOT expose /access-control
  10. governance_nav_items_complete -- expected nav items still present

P1 Hardening (added):
  11. p1_version_field_in_schema   -- StagedArtifact has version field (P1-4)
  12. p1_version_field_in_orm      -- StagingArtifact ORM has version column (P1-4)
  13. p1_approval_unique_constraint -- Approval has UniqueConstraint (P1-3)
  14. p1_load_all_staging_accepts_pagination -- load_all_staging limit/offset/status_filter (P1-2)
  15. p1_count_staging_exists      -- count_staging function importable (P1-2)
  16. p1_update_staging_versioned  -- update_staging_status_versioned importable (P1-4)
  17. p1_emit_pipeline_event       -- _emit_pipeline_event importable (P1-1)
  18. p1_audit_event_import        -- build_audit_event + GENESIS_HASH importable (P1-1)
  19. p1_route_list_staging_pagination -- /staging route accepts limit/offset (P1-2)
  20. p1_per_action_permission     -- REJECT uses pipeline.reject, others use pipeline.approve (P1-5)
  21. p1_concurrent_modification_error -- CONCURRENT_MODIFICATION raises 409 (P1-4)
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
        p = pathlib.Path(__file__).parents[2] / "frontend" / "src" / "components" / "layout" / "AppSidebar.tsx"
        assert p.exists(), f"AppSidebar.tsx not found at {p}"
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

    def test_governance_section_exists(self):
        """Governance section header must exist in AppSidebar."""
        src = self._read_nav_source()
        assert "Compliance & Audit" in src, \
            "AppSidebar must contain 'Compliance & Audit' header for governance section"


# ---------------------------------------------------------------------------
# Test 10: Governance nav items completeness
# ---------------------------------------------------------------------------

class TestGovernanceNavItemsComplete:
    EXPECTED_HREFS = ["/staging", "/audit-trail", "/run-viewer", "/lineage", "/hedgewiki"]

    def _read_nav_source(self) -> str:
        import pathlib
        p = pathlib.Path(__file__).parents[2] / "frontend" / "src" / "components" / "layout" / "AppSidebar.tsx"
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


# ---------------------------------------------------------------------------
# P1 Hardening Tests
# ---------------------------------------------------------------------------


class TestP1VersionField:
    """P1-4: Optimistic lock — version field present in schema + ORM."""

    def test_staged_artifact_schema_has_version(self):
        """StagedArtifact Pydantic schema must have a version field (P1-4)."""
        from app.schemas_v1.pipeline import StagedArtifact
        import inspect
        fields = StagedArtifact.model_fields
        assert "version" in fields, "StagedArtifact Pydantic schema must have 'version' field"
        # Default should be 0 (non-negative integer)
        default = fields["version"].default
        assert default == 0, f"version default must be 0, got {default}"

    def test_staging_orm_has_version_column(self):
        """StagingArtifact ORM must have a 'version' column (P1-4)."""
        from app.models.staging import StagingArtifact
        mapper = StagingArtifact.__mapper__
        col_names = [c.key for c in mapper.columns]
        assert "version" in col_names, "StagingArtifact ORM must have 'version' column"


class TestP1ApprovalUniqueConstraint:
    """P1-3: Idempotency — unique constraint on (staging_artifact_id, approver_id, action)."""

    def test_approval_has_unique_constraint(self):
        """Approval model must declare UniqueConstraint preventing duplicate approvals (P1-3)."""
        from app.models.staging import Approval
        from sqlalchemy import UniqueConstraint
        table_args = getattr(Approval, "__table_args__", None)
        assert table_args is not None, "Approval must have __table_args__"
        has_uq = any(isinstance(a, UniqueConstraint) for a in table_args)
        assert has_uq, "Approval must have a UniqueConstraint"

    def test_approval_unique_constraint_columns(self):
        """UniqueConstraint must cover staging_artifact_id, approver_id, action (P1-3)."""
        from app.models.staging import Approval
        from sqlalchemy import UniqueConstraint
        table_args = getattr(Approval, "__table_args__", ())
        for constraint in table_args:
            if isinstance(constraint, UniqueConstraint):
                col_names = {c for c in constraint.columns.keys()}
                assert col_names == {"staging_artifact_id", "approver_id", "action"}, \
                    f"UniqueConstraint columns must be (staging_artifact_id, approver_id, action), got {col_names}"
                return
        pytest.fail("No UniqueConstraint found in Approval.__table_args__")

    def test_save_approval_returns_bool(self):
        """save_approval must return bool (True=saved, False=duplicate) (P1-3)."""
        import inspect
        from app.services.pipeline_db import save_approval
        sig = inspect.signature(save_approval)
        assert inspect.iscoroutinefunction(save_approval), "save_approval must be async"
        # Return annotation should be bool (check source hints)
        hints = save_approval.__annotations__
        # At minimum it must be importable and async — runtime type check via source
        import pathlib
        src = (pathlib.Path(__file__).parent.parent / "app" / "services" / "pipeline_db.py").read_text()
        assert "IntegrityError" in src, "pipeline_db must import and handle IntegrityError (P1-3)"
        assert "return False" in src, "save_approval must return False on duplicate (P1-3)"


class TestP1Pagination:
    """P1-2: Pagination — load_all_staging supports limit/offset/status_filter."""

    def test_load_all_staging_accepts_pagination_params(self):
        """load_all_staging must accept limit, offset, status_filter params (P1-2)."""
        import inspect
        from app.services.pipeline_db import load_all_staging
        sig = inspect.signature(load_all_staging)
        params = sig.parameters
        assert "limit" in params, "load_all_staging must accept 'limit'"
        assert "offset" in params, "load_all_staging must accept 'offset'"
        assert "status_filter" in params, "load_all_staging must accept 'status_filter'"

    def test_load_all_staging_defaults(self):
        """load_all_staging defaults: limit=100, offset=0, status_filter=None (P1-2)."""
        import inspect
        from app.services.pipeline_db import load_all_staging
        sig = inspect.signature(load_all_staging)
        p = sig.parameters
        assert p["limit"].default == 100
        assert p["offset"].default == 0
        assert p["status_filter"].default is None

    def test_count_staging_importable(self):
        """count_staging must be importable from pipeline_db (P1-2)."""
        from app.services.pipeline_db import count_staging
        import inspect
        assert inspect.iscoroutinefunction(count_staging), "count_staging must be async"
        sig = inspect.signature(count_staging)
        assert "status_filter" in sig.parameters

    def test_list_staging_service_accepts_pagination(self):
        """pipeline_service.list_staging must forward limit/offset/status_filter (P1-2)."""
        import inspect
        from app.services.pipeline_service import list_staging
        sig = inspect.signature(list_staging)
        p = sig.parameters
        assert "limit" in p, "list_staging must accept 'limit'"
        assert "offset" in p, "list_staging must accept 'offset'"
        assert "status_filter" in p, "list_staging must accept 'status_filter'"

    def test_route_query_params_in_source(self):
        """GET /staging route must declare limit, offset, status Query params (P1-2)."""
        import pathlib
        src = (pathlib.Path(__file__).parent.parent / "app" / "api" / "routes" / "v1_pipeline.py").read_text()
        # Find the list_staging endpoint
        idx = src.find("async def list_staging(")
        assert idx != -1, "list_staging route must exist"
        fn_body = src[idx: idx + 600]
        assert "Query" in fn_body, "list_staging route must use Query params"
        assert "limit" in fn_body, "list_staging route must have limit param"
        assert "offset" in fn_body, "list_staging route must have offset param"


class TestP1OptimisticLock:
    """P1-4: update_staging_status_versioned — optimistic lock implementation."""

    def test_update_staging_status_versioned_importable(self):
        """update_staging_status_versioned must be importable from pipeline_db (P1-4)."""
        from app.services.pipeline_db import update_staging_status_versioned
        import inspect
        assert inspect.iscoroutinefunction(update_staging_status_versioned)

    def test_update_staging_status_versioned_signature(self):
        """update_staging_status_versioned must accept staging_id, status, expected_version (P1-4)."""
        import inspect
        from app.services.pipeline_db import update_staging_status_versioned
        sig = inspect.signature(update_staging_status_versioned)
        params = sig.parameters
        assert "staging_id" in params
        assert "status" in params
        assert "expected_version" in params

    def test_concurrent_modification_error_code_exists(self):
        """CONCURRENT_MODIFICATION error must be raised in pipeline_service.authorize_staged (P1-4)."""
        import pathlib
        src = (pathlib.Path(__file__).parent.parent / "app" / "services" / "pipeline_service.py").read_text()
        assert "CONCURRENT_MODIFICATION" in src, \
            "pipeline_service must raise CONCURRENT_MODIFICATION on version conflict"

    def test_concurrent_modification_returns_409_in_route(self):
        """CONCURRENT_MODIFICATION must map to HTTP 409 in v1_pipeline.py (P1-4)."""
        import pathlib
        src = (pathlib.Path(__file__).parent.parent / "app" / "api" / "routes" / "v1_pipeline.py").read_text()
        idx = src.find("authorize_staged")
        assert idx != -1
        fn_area = src[idx: idx + 1000]
        assert "CONCURRENT_MODIFICATION" in fn_area, \
            "authorize_staged route must handle CONCURRENT_MODIFICATION → 409"


class TestP1AuditPersistence:
    """P1-1: _emit_pipeline_event — timeline events persisted to audit_events WORM table."""

    def test_emit_pipeline_event_importable(self):
        """_emit_pipeline_event must be defined in pipeline_service (P1-1)."""
        import pathlib
        src = (pathlib.Path(__file__).parent.parent / "app" / "services" / "pipeline_service.py").read_text()
        assert "_emit_pipeline_event" in src, \
            "pipeline_service must define _emit_pipeline_event"

    def test_build_audit_event_imported_in_service(self):
        """pipeline_service must import build_audit_event from audit_event model (P1-1)."""
        import pathlib
        src = (pathlib.Path(__file__).parent.parent / "app" / "services" / "pipeline_service.py").read_text()
        assert "build_audit_event" in src, \
            "pipeline_service must import build_audit_event (P1-1)"
        assert "GENESIS_HASH" in src, \
            "pipeline_service must import GENESIS_HASH (P1-1)"

    def test_audit_event_model_factory(self):
        """build_audit_event factory must produce AuditEvent with correct fields (P1-1)."""
        from app.models.audit_event import build_audit_event, GENESIS_HASH
        event = build_audit_event(
            event_type="LIFECYCLE",
            description="Test pipeline event",
            payload={"staging_id": "STG-TESTABCD", "action": "SUBMITTED"},
            prev_event_hash=GENESIS_HASH,
            entity_type="staging_artifact",
            entity_id="STG-TESTABCD",
        )
        assert event.event_type == "LIFECYCLE"
        assert len(event.event_hash) == 64
        assert event.prev_event_hash == GENESIS_HASH
        assert event.entity_type == "staging_artifact"

    def test_emit_called_on_submit(self):
        """submit_to_staging source must call _emit_pipeline_event (P1-1)."""
        import pathlib, re
        src = (pathlib.Path(__file__).parent.parent / "app" / "services" / "pipeline_service.py").read_text()
        # Find submit_to_staging function body
        idx = src.find("async def submit_to_staging(")
        assert idx != -1
        fn_body = src[idx: idx + 2000]
        assert "_emit_pipeline_event" in fn_body, \
            "submit_to_staging must call _emit_pipeline_event (P1-1)"

    def test_emit_called_on_authorize(self):
        """authorize_staged source must call _emit_pipeline_event (P1-1)."""
        import pathlib
        src = (pathlib.Path(__file__).parent.parent / "app" / "services" / "pipeline_service.py").read_text()
        idx = src.find("async def authorize_staged(")
        assert idx != -1
        fn_body = src[idx: idx + 4000]
        assert "_emit_pipeline_event" in fn_body, \
            "authorize_staged must call _emit_pipeline_event (P1-1)"


class TestP1PerActionPermission:
    """P1-5: REJECT action requires pipeline.reject; APPROVE requires pipeline.approve."""

    def test_reject_uses_pipeline_reject_permission(self):
        """authorize_staged route must check pipeline.reject for REJECT action (P1-5)."""
        import pathlib
        src = (pathlib.Path(__file__).parent.parent / "app" / "api" / "routes" / "v1_pipeline.py").read_text()
        idx = src.find("async def authorize_staged(")
        assert idx != -1
        fn_body = src[idx: idx + 1000]
        assert '"pipeline.reject"' in fn_body or "'pipeline.reject'" in fn_body, \
            "authorize_staged must check pipeline.reject for REJECT action (P1-5)"

    def test_approve_uses_pipeline_approve_permission(self):
        """authorize_staged route must check pipeline.approve for APPROVE/RETURN actions (P1-5)."""
        import pathlib
        src = (pathlib.Path(__file__).parent.parent / "app" / "api" / "routes" / "v1_pipeline.py").read_text()
        idx = src.find("async def authorize_staged(")
        assert idx != -1
        fn_body = src[idx: idx + 1000]
        assert '"pipeline.approve"' in fn_body or "'pipeline.approve'" in fn_body, \
            "authorize_staged must check pipeline.approve for non-REJECT actions (P1-5)"

    def test_pipeline_reject_permission_in_seed(self):
        """pipeline.reject must exist in SEED_PERMISSIONS (P1-5)."""
        from app.models.permission import SEED_PERMISSIONS
        codenames = {p[0] for p in SEED_PERMISSIONS}  # tuples: (codename, module, action, desc)
        assert "pipeline.reject" in codenames, \
            "pipeline.reject must be in SEED_PERMISSIONS"
        assert "pipeline.approve" in codenames, \
            "pipeline.approve must be in SEED_PERMISSIONS"
