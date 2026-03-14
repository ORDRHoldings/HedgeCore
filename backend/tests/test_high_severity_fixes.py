"""Tests for HIGH severity backend fixes B-H3, B-H4, B-H5.

B-H3: Pipeline hash chain must query previous event hash (not always GENESIS_HASH).
B-H4: Dual-key threshold is service-layer only; governance_mode defaults to "team".
B-H5: Position field mutations blocked on HEDGED / REJECTED positions.
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# ---------------------------------------------------------------------------
# B-H5: Terminal-state position mutation guard
# ---------------------------------------------------------------------------

from app.services.position_service import update_position


class TestPositionTerminalStateGuard:
    """B-H5: update_position() must reject modifications on HEDGED/REJECTED."""

    @pytest.fixture
    def mock_user(self):
        user = MagicMock()
        user.id = uuid.UUID("aaaaaaaa-0000-0000-0000-000000000001")
        user.company_id = uuid.UUID("cccccccc-0000-0000-0000-000000000001")
        user.branch_id = uuid.UUID("bbbbbbbb-0000-0000-0000-000000000001")
        return user

    def _make_position(self, status="NEW"):
        pos = MagicMock()
        pos.id = uuid.uuid4()
        pos.company_id = uuid.UUID("cccccccc-0000-0000-0000-000000000001")
        pos.branch_id = uuid.UUID("bbbbbbbb-0000-0000-0000-000000000001")
        pos.is_active = True
        pos.execution_status = status
        return pos

    @pytest.mark.asyncio
    async def test_update_blocked_on_hedged(self, mock_user):
        pos = self._make_position("HEDGED")
        session = AsyncMock()
        session.get = AsyncMock(return_value=pos)

        data = MagicMock()
        data.model_dump.return_value = {"amount": 50000.0}

        with pytest.raises(ValueError, match="Cannot modify position in HEDGED state"):
            await update_position(session, mock_user, pos.id, data, all_branches=True)

    @pytest.mark.asyncio
    async def test_update_blocked_on_rejected(self, mock_user):
        pos = self._make_position("REJECTED")
        session = AsyncMock()
        session.get = AsyncMock(return_value=pos)

        data = MagicMock()
        data.model_dump.return_value = {"amount": 50000.0}

        with pytest.raises(ValueError, match="Cannot modify position in REJECTED state"):
            await update_position(session, mock_user, pos.id, data, all_branches=True)

    @pytest.mark.asyncio
    async def test_update_allowed_on_new(self, mock_user):
        pos = self._make_position("NEW")
        session = AsyncMock()
        session.get = AsyncMock(return_value=pos)
        session.commit = AsyncMock()
        session.refresh = AsyncMock()

        data = MagicMock()
        data.model_dump.return_value = {"amount": 50000.0}

        result = await update_position(session, mock_user, pos.id, data, all_branches=True)
        assert result is pos
        assert pos.amount == 50000.0

    @pytest.mark.asyncio
    async def test_update_allowed_on_policy_assigned(self, mock_user):
        pos = self._make_position("POLICY_ASSIGNED")
        session = AsyncMock()
        session.get = AsyncMock(return_value=pos)
        session.commit = AsyncMock()
        session.refresh = AsyncMock()

        data = MagicMock()
        data.model_dump.return_value = {"description": "updated"}

        result = await update_position(session, mock_user, pos.id, data, all_branches=True)
        assert result is pos

    @pytest.mark.asyncio
    async def test_update_allowed_on_ready_to_execute(self, mock_user):
        pos = self._make_position("READY_TO_EXECUTE")
        session = AsyncMock()
        session.get = AsyncMock(return_value=pos)
        session.commit = AsyncMock()
        session.refresh = AsyncMock()

        data = MagicMock()
        data.model_dump.return_value = {"description": "ready"}

        result = await update_position(session, mock_user, pos.id, data, all_branches=True)
        assert result is pos


# ---------------------------------------------------------------------------
# B-H3: Pipeline hash chain -- _emit_pipeline_event queries prev hash
# ---------------------------------------------------------------------------

from app.models.audit_event import GENESIS_HASH


class TestPipelineHashChain:
    """B-H3: _emit_pipeline_event must query the latest audit event hash."""

    @pytest.mark.asyncio
    async def test_emit_uses_genesis_when_no_company_id(self):
        """Without company_id, falls back to GENESIS_HASH."""
        session = AsyncMock()
        session.commit = AsyncMock()

        with patch(
            "app.services.pipeline_service.build_audit_event"
        ) as mock_build:
            mock_event = MagicMock()
            mock_build.return_value = mock_event

            from app.services.pipeline_service import _emit_pipeline_event

            await _emit_pipeline_event(
                session, "ENT-1", "TEST", "aaaaaaaa-0000-0000-0000-000000000001",
                "test event", {"key": "val"}, company_id=None,
            )

            # Should use GENESIS_HASH when no company_id
            call_kwargs = mock_build.call_args[1]
            assert call_kwargs["prev_event_hash"] == GENESIS_HASH

    @pytest.mark.asyncio
    async def test_emit_queries_prev_hash_with_company_id(self):
        """With company_id, must query audit_events for the latest hash."""
        company_id = "cccccccc-0000-0000-0000-000000000001"
        prev_hash = "abc123" * 10 + "abcd"

        # Mock the session.execute to return a previous hash
        mock_result = MagicMock()
        mock_result.scalars.return_value.first.return_value = prev_hash

        session = AsyncMock()
        session.execute = AsyncMock(return_value=mock_result)
        session.commit = AsyncMock()

        with patch(
            "app.services.pipeline_service.build_audit_event"
        ) as mock_build:
            mock_event = MagicMock()
            mock_build.return_value = mock_event

            from app.services.pipeline_service import _emit_pipeline_event

            await _emit_pipeline_event(
                session, "ENT-1", "TEST", "aaaaaaaa-0000-0000-0000-000000000001",
                "test event", {"key": "val"}, company_id=company_id,
            )

            # Should pass the queried hash, not GENESIS_HASH
            call_kwargs = mock_build.call_args[1]
            assert call_kwargs["prev_event_hash"] == prev_hash
            assert call_kwargs["prev_event_hash"] != GENESIS_HASH

    @pytest.mark.asyncio
    async def test_emit_falls_back_to_genesis_when_no_prior_events(self):
        """With company_id but no prior events, falls back to GENESIS_HASH."""
        company_id = "cccccccc-0000-0000-0000-000000000001"

        # Mock the session.execute to return None (no prior events)
        mock_result = MagicMock()
        mock_result.scalars.return_value.first.return_value = None

        session = AsyncMock()
        session.execute = AsyncMock(return_value=mock_result)
        session.commit = AsyncMock()

        with patch(
            "app.services.pipeline_service.build_audit_event"
        ) as mock_build:
            mock_event = MagicMock()
            mock_build.return_value = mock_event

            from app.services.pipeline_service import _emit_pipeline_event

            await _emit_pipeline_event(
                session, "ENT-1", "TEST", "aaaaaaaa-0000-0000-0000-000000000001",
                "test event", {"key": "val"}, company_id=company_id,
            )

            call_kwargs = mock_build.call_args[1]
            assert call_kwargs["prev_event_hash"] == GENESIS_HASH

    @pytest.mark.asyncio
    async def test_emit_passes_company_id_to_build(self):
        """The company_id should be forwarded to build_audit_event."""
        company_id = "cccccccc-0000-0000-0000-000000000001"

        mock_result = MagicMock()
        mock_result.scalars.return_value.first.return_value = None

        session = AsyncMock()
        session.execute = AsyncMock(return_value=mock_result)
        session.commit = AsyncMock()

        with patch(
            "app.services.pipeline_service.build_audit_event"
        ) as mock_build:
            mock_event = MagicMock()
            mock_build.return_value = mock_event

            from app.services.pipeline_service import _emit_pipeline_event

            await _emit_pipeline_event(
                session, "ENT-1", "TEST", "aaaaaaaa-0000-0000-0000-000000000001",
                "test event", {"key": "val"}, company_id=company_id,
            )

            call_kwargs = mock_build.call_args[1]
            assert call_kwargs["company_id"] == uuid.UUID(company_id)


# ---------------------------------------------------------------------------
# B-H4: Dual-key service layer is single source of truth
# ---------------------------------------------------------------------------

from app.services.execution_proposal_service import (
    _determine_second_approval_required,
)


class TestDualKeyServiceLayer:
    """B-H4: _determine_second_approval_required is the single source of truth."""

    def test_below_threshold_not_required(self):
        assert _determine_second_approval_required(500_000.0) is False

    def test_at_threshold_required(self):
        assert _determine_second_approval_required(1_000_000.0) is True

    def test_above_threshold_required(self):
        assert _determine_second_approval_required(5_000_000.0) is True

    def test_none_not_required(self):
        assert _determine_second_approval_required(None) is False

    def test_negative_below_threshold(self):
        """abs() is used, so -1.5M should trigger dual-key."""
        assert _determine_second_approval_required(-1_500_000.0) is True

    def test_custom_threshold(self):
        assert _determine_second_approval_required(
            500_000.0, dual_key_threshold_usd=250_000.0
        ) is True


class TestGovernanceModeDefault:
    """B-H4 / SEC-02: governance_mode must default to 'team' (fail-closed)."""

    def test_route_code_uses_team_default(self):
        """Verify the route file no longer defaults to 'solo'."""
        import inspect
        import app.api.routes.v1_execution_proposals as mod

        source = inspect.getsource(mod)

        # The approve_proposal route should default to "team", not "solo"
        # The line pattern: .get("governance_mode", "team")) if _co else "team"
        assert '"governance_mode", "team"' in source or "'governance_mode', 'team'" in source
        # Ensure the old "solo" default on the Company-missing fallback is gone
        assert 'if _co else "solo"' not in source
