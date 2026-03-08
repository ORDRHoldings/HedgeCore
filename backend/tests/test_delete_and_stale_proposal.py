"""
Regression tests for two live reliability blockers:

1. DELETE /v1/positions/{id} — only REJECTED positions can be deleted,
   and the soft-delete path must not 500.

2. Stale proposal blocker — when a position is rejected or reopened,
   active (PROPOSED/APPROVED) proposals must be auto-superseded so
   re-hedging is not blocked by orphaned proposals.
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__)))

from fixtures.sample_positions import make_position, COMPANY_ID, USER_ID, POLICY_ID


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _mock_user(company_id=None, branch_id=None, user_id=None):
    u = MagicMock()
    u.id = user_id or USER_ID
    u.company_id = company_id or COMPANY_ID
    u.branch_id = branch_id
    u.is_superuser = False
    u.email = "test@example.com"
    return u


def _mock_proposal(status="PROPOSED", position_id=None, company_id=None, proposed_by=None):
    p = MagicMock()
    p.id = uuid.uuid4()
    p.status = status
    p.position_id = position_id or uuid.uuid4()
    p.company_id = company_id or COMPANY_ID
    p.proposed_by = proposed_by or USER_ID
    p.proposed_at = datetime(2026, 1, 1, tzinfo=UTC)
    p.rejection_reason = None
    return p


# ═══════════════════════════════════════════════════════════════════════════
# PART 1: DELETE position — execution_status guard
# ═══════════════════════════════════════════════════════════════════════════

class TestDeletePositionGuard:
    """Only REJECTED positions may be deleted (soft-delete)."""

    @pytest.mark.asyncio
    async def test_delete_rejected_succeeds(self):
        """REJECTED + is_active → soft-delete sets is_active=False."""
        from app.services import position_service

        pos = make_position(execution_status="REJECTED", rejection_reason="test")
        user = _mock_user(company_id=pos.company_id)

        session = AsyncMock()
        session.get = AsyncMock(return_value=pos)
        session.commit = AsyncMock()
        session.refresh = AsyncMock()

        await position_service.delete_position(session, user, pos.id, all_branches=True)

        assert pos.is_active is False
        session.commit.assert_awaited_once()
        session.refresh.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_delete_new_raises(self):
        """NEW position → delete blocked with ValueError."""
        from app.services import position_service

        pos = make_position(execution_status="NEW")
        user = _mock_user(company_id=pos.company_id)

        session = AsyncMock()
        session.get = AsyncMock(return_value=pos)

        with pytest.raises(ValueError, match="Only REJECTED"):
            await position_service.delete_position(session, user, pos.id, all_branches=True)

    @pytest.mark.asyncio
    async def test_delete_hedged_raises(self):
        """HEDGED (terminal) position → delete blocked."""
        from app.services import position_service

        pos = make_position(execution_status="HEDGED")
        user = _mock_user(company_id=pos.company_id)

        session = AsyncMock()
        session.get = AsyncMock(return_value=pos)

        with pytest.raises(ValueError, match="Only REJECTED"):
            await position_service.delete_position(session, user, pos.id, all_branches=True)

    @pytest.mark.asyncio
    async def test_delete_policy_assigned_raises(self):
        """POLICY_ASSIGNED position → delete blocked."""
        from app.services import position_service

        pos = make_position(execution_status="POLICY_ASSIGNED")
        user = _mock_user(company_id=pos.company_id)

        session = AsyncMock()
        session.get = AsyncMock(return_value=pos)

        with pytest.raises(ValueError, match="Only REJECTED"):
            await position_service.delete_position(session, user, pos.id, all_branches=True)

    @pytest.mark.asyncio
    async def test_delete_ready_raises(self):
        """READY_TO_EXECUTE position → delete blocked."""
        from app.services import position_service

        pos = make_position(execution_status="READY_TO_EXECUTE")
        user = _mock_user(company_id=pos.company_id)

        session = AsyncMock()
        session.get = AsyncMock(return_value=pos)

        with pytest.raises(ValueError, match="Only REJECTED"):
            await position_service.delete_position(session, user, pos.id, all_branches=True)

    @pytest.mark.asyncio
    async def test_delete_inactive_raises(self):
        """Already-deleted (is_active=False) → not found."""
        from app.services import position_service

        pos = make_position(execution_status="REJECTED", rejection_reason="x")
        pos.is_active = False
        user = _mock_user(company_id=pos.company_id)

        session = AsyncMock()
        session.get = AsyncMock(return_value=pos)

        with pytest.raises(ValueError, match="not found"):
            await position_service.delete_position(session, user, pos.id, all_branches=True)

    @pytest.mark.asyncio
    async def test_delete_wrong_company_raises(self):
        """Cross-tenant delete → not found (obscured)."""
        from app.services import position_service

        pos = make_position(execution_status="REJECTED", rejection_reason="x")
        wrong_user = _mock_user(company_id=uuid.uuid4())

        session = AsyncMock()
        session.get = AsyncMock(return_value=pos)

        with pytest.raises(ValueError, match="not found"):
            await position_service.delete_position(session, wrong_user, pos.id, all_branches=True)


# ═══════════════════════════════════════════════════════════════════════════
# PART 2: Stale proposal auto-supersede
# ═══════════════════════════════════════════════════════════════════════════

class TestSupersedeStalProposals:
    """When position is rejected/reopened, active proposals are auto-withdrawn."""

    @pytest.mark.asyncio
    async def test_supersede_withdraws_proposed(self):
        """PROPOSED proposal → WITHDRAWN on position rejection."""
        from app.services.execution_proposal_service import supersede_active_proposals_for_position

        proposal = _mock_proposal(status="PROPOSED")
        session = AsyncMock()
        result_mock = MagicMock()
        result_mock.scalars.return_value.all.return_value = [proposal]
        session.execute = AsyncMock(return_value=result_mock)
        session.flush = AsyncMock()

        count = await supersede_active_proposals_for_position(
            session, proposal.position_id, COMPANY_ID,
            reason="Position rejected: test",
        )

        assert count == 1
        assert proposal.status == "WITHDRAWN"
        assert "rejected" in proposal.rejection_reason.lower()

    @pytest.mark.asyncio
    async def test_supersede_withdraws_approved(self):
        """APPROVED proposal → WITHDRAWN on position rejection."""
        from app.services.execution_proposal_service import supersede_active_proposals_for_position

        proposal = _mock_proposal(status="APPROVED")
        session = AsyncMock()
        result_mock = MagicMock()
        result_mock.scalars.return_value.all.return_value = [proposal]
        session.execute = AsyncMock(return_value=result_mock)
        session.flush = AsyncMock()

        count = await supersede_active_proposals_for_position(
            session, proposal.position_id, COMPANY_ID,
            reason="Position reopened — prior proposals superseded",
        )

        assert count == 1
        assert proposal.status == "WITHDRAWN"

    @pytest.mark.asyncio
    async def test_supersede_no_active_proposals(self):
        """No active proposals → returns 0, no flush."""
        from app.services.execution_proposal_service import supersede_active_proposals_for_position

        session = AsyncMock()
        result_mock = MagicMock()
        result_mock.scalars.return_value.all.return_value = []
        session.execute = AsyncMock(return_value=result_mock)
        session.flush = AsyncMock()

        count = await supersede_active_proposals_for_position(
            session, uuid.uuid4(), COMPANY_ID,
        )

        assert count == 0
        session.flush.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_supersede_multiple_proposals(self):
        """Multiple active proposals → all withdrawn."""
        from app.services.execution_proposal_service import supersede_active_proposals_for_position

        p1 = _mock_proposal(status="PROPOSED")
        p2 = _mock_proposal(status="APPROVED")
        session = AsyncMock()
        result_mock = MagicMock()
        result_mock.scalars.return_value.all.return_value = [p1, p2]
        session.execute = AsyncMock(return_value=result_mock)
        session.flush = AsyncMock()

        count = await supersede_active_proposals_for_position(
            session, uuid.uuid4(), COMPANY_ID,
            reason="batch supersede",
        )

        assert count == 2
        assert p1.status == "WITHDRAWN"
        assert p2.status == "WITHDRAWN"


class TestRejectClearsProposals:
    """reject_position() auto-supersedes active proposals."""

    @pytest.mark.asyncio
    async def test_reject_supersedes_proposal(self):
        """Rejecting a position with an active proposal → proposal withdrawn."""
        from app.services import position_service

        pos = make_position(execution_status="READY_TO_EXECUTE", policy_id=POLICY_ID)
        user = _mock_user(company_id=pos.company_id)

        data = MagicMock()
        data.reason = "No longer needed"

        session = AsyncMock()
        session.get = AsyncMock(return_value=pos)
        session.commit = AsyncMock()
        session.refresh = AsyncMock()

        # Mock the supersede function to verify it's called
        with patch(
            "app.services.execution_proposal_service.supersede_active_proposals_for_position",
            new_callable=AsyncMock,
            return_value=1,
        ) as mock_supersede:
            result = await position_service.reject_position(
                session, user, pos.id, data, all_branches=True,
            )

            mock_supersede.assert_awaited_once()
            call_args = mock_supersede.call_args
            assert call_args[0][1] == pos.id  # position_id
            assert "rejected" in call_args[1]["reason"].lower() or "rejected" in str(call_args[0]).lower()

        assert result.execution_status == "REJECTED"


class TestReopenClearsProposals:
    """reopen_position() auto-supersedes lingering proposals."""

    @pytest.mark.asyncio
    async def test_reopen_supersedes_proposal(self):
        """Reopening a rejected position → any lingering proposals withdrawn."""
        from app.services import position_service

        pos = make_position(execution_status="REJECTED", rejection_reason="test")
        user = _mock_user(company_id=pos.company_id)

        session = AsyncMock()
        session.get = AsyncMock(return_value=pos)
        session.commit = AsyncMock()
        session.refresh = AsyncMock()

        with patch(
            "app.services.execution_proposal_service.supersede_active_proposals_for_position",
            new_callable=AsyncMock,
            return_value=0,
        ) as mock_supersede:
            result = await position_service.reopen_position(
                session, user, pos.id, all_branches=True,
            )

            mock_supersede.assert_awaited_once()

        assert result.execution_status == "NEW"
        assert result.rejection_reason is None
        assert result.policy_id is None


# ═══════════════════════════════════════════════════════════════════════════
# PART 3: Re-hedge after rejection+reopen is unblocked
# ═══════════════════════════════════════════════════════════════════════════

class TestReHedgeAfterReopen:
    """After reject → reopen, a new proposal can be created (no stale block)."""

    @pytest.mark.asyncio
    async def test_propose_after_supersede_succeeds(self):
        """After active proposals are superseded, propose_execution() passes the guard."""
        from app.services.execution_proposal_service import (
            get_active_proposal_for_position,
        )

        # After supersede, there should be no active proposals
        session = AsyncMock()
        result_mock = MagicMock()
        result_mock.scalars.return_value.first.return_value = None  # no active proposal
        session.execute = AsyncMock(return_value=result_mock)

        result = await get_active_proposal_for_position(
            session, uuid.uuid4(), COMPANY_ID,
        )

        assert result is None  # Guard will not block

    @pytest.mark.asyncio
    async def test_propose_with_active_proposal_blocked(self):
        """With an active proposal, propose_execution() is still correctly blocked."""
        from app.services.execution_proposal_service import (
            get_active_proposal_for_position,
        )

        existing = _mock_proposal(status="APPROVED")

        session = AsyncMock()
        result_mock = MagicMock()
        result_mock.scalars.return_value.first.return_value = existing
        session.execute = AsyncMock(return_value=result_mock)

        result = await get_active_proposal_for_position(
            session, existing.position_id, COMPANY_ID,
        )

        assert result is not None
        assert result.status == "APPROVED"  # Guard will correctly block
