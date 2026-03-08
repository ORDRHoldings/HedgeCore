"""
Tests for propose_execution() auto-advance of NEW positions.

When propose_execution() receives a position in NEW status with a run_id,
it auto-advances through NEW -> POLICY_ASSIGNED -> READY_TO_EXECUTE in a
single call, then creates the proposal. Without run_id, NEW positions are
rejected (they cannot reach READY_TO_EXECUTE).

Tests:
  1. NEW + run_id -> auto-advance to READY_TO_EXECUTE, proposal created
  2. NEW + no run_id -> ValueError (position not READY_TO_EXECUTE)
  3. POLICY_ASSIGNED + run_id -> auto-advance to READY_TO_EXECUTE (existing behavior)
  4. POLICY_ASSIGNED + no run_id -> ValueError (no auto-advance without run_id)
  5. READY_TO_EXECUTE -> proposal created directly (no advance needed)
  6. NEW + run_id -> hedge_amount and hedge_rate written to position
  7. NEW + run_id + existing active proposal -> ValueError (duplicate guard)
"""
from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.execution_proposal_service import propose_execution


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

def _mock_user(company_id=None, branch_id=None, user_id=None):
    user = MagicMock()
    user.id = user_id or uuid.uuid4()
    user.company_id = company_id or uuid.uuid4()
    user.branch_id = branch_id or uuid.uuid4()
    user.email = "maker@example.com"
    user.is_superuser = False
    return user


def _mock_position(company_id, execution_status="NEW", position_id=None):
    pos = MagicMock()
    pos.id = position_id or uuid.uuid4()
    pos.company_id = company_id
    pos.execution_status = execution_status
    pos.last_run_id = None
    pos.hedge_amount = None
    pos.hedge_rate = None
    return pos


def _mock_session(position=None, active_proposal=None):
    """Build an AsyncMock session with standard wiring.

    session.get -> returns position
    session.execute -> returns active_proposal query result (for duplicate guard)
    session.flush / commit / refresh / add -> no-ops
    """
    session = AsyncMock()
    session.get = AsyncMock(return_value=position)
    session.flush = AsyncMock()
    session.commit = AsyncMock()
    session.refresh = AsyncMock()
    session.add = MagicMock()

    # The duplicate-proposal guard calls session.execute() with a SELECT query.
    # Simulate the scalars().first() chain returning active_proposal (None = no dup).
    mock_result = MagicMock()
    mock_result.scalars.return_value.first.return_value = active_proposal
    session.execute = AsyncMock(return_value=mock_result)

    return session


# ---------------------------------------------------------------------------
# 1. NEW + run_id -> auto-advance and proposal created
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_new_with_run_id_auto_advances_and_creates_proposal():
    """Position in NEW with run_id should auto-advance to READY_TO_EXECUTE
    and produce a PROPOSED ExecutionProposal."""
    company_id = uuid.uuid4()
    user = _mock_user(company_id=company_id)
    pos = _mock_position(company_id, execution_status="NEW")

    # Track status transitions through flush calls
    statuses_at_flush = []

    async def capture_flush():
        statuses_at_flush.append(pos.execution_status)

    session = _mock_session(position=pos)
    session.flush = AsyncMock(side_effect=capture_flush)

    run_id = str(uuid.uuid4())
    proposal = await propose_execution(
        session,
        user=user,
        position_id=pos.id,
        execution_ref="EX-001",
        hedge_amount=100_000.0,
        hedge_rate=1.2345,
        run_id=run_id,
        policy_revision_id=None,
        notes="auto-advance test",
    )

    # Position should have been advanced through both stages
    assert pos.execution_status == "READY_TO_EXECUTE"
    # Flush should have been called twice: once for NEW->POLICY_ASSIGNED,
    # once for POLICY_ASSIGNED->READY_TO_EXECUTE
    assert len(statuses_at_flush) == 2
    assert statuses_at_flush[0] == "POLICY_ASSIGNED"
    assert statuses_at_flush[1] == "READY_TO_EXECUTE"
    # last_run_id should be set
    assert pos.last_run_id == run_id
    # Proposal was created and added to session
    session.add.assert_called_once()
    session.commit.assert_awaited_once()
    assert proposal.status == "PROPOSED"
    assert proposal.proposed_by == user.id
    assert proposal.proposed_by_email == user.email


# ---------------------------------------------------------------------------
# 2. NEW + no run_id -> rejected
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_new_without_run_id_raises():
    """Position in NEW without run_id cannot auto-advance; should raise ValueError."""
    company_id = uuid.uuid4()
    user = _mock_user(company_id=company_id)
    pos = _mock_position(company_id, execution_status="NEW")
    session = _mock_session(position=pos)

    with pytest.raises(ValueError, match="READY_TO_EXECUTE"):
        await propose_execution(
            session,
            user=user,
            position_id=pos.id,
            execution_ref="EX-002",
            hedge_amount=50_000.0,
            hedge_rate=1.1,
            run_id=None,
            policy_revision_id=None,
            notes=None,
        )

    # Position status should remain NEW (no auto-advance attempted)
    assert pos.execution_status == "NEW"


# ---------------------------------------------------------------------------
# 3. POLICY_ASSIGNED + run_id -> auto-advance (existing behavior)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_policy_assigned_with_run_id_auto_advances():
    """Position already in POLICY_ASSIGNED with run_id should advance to
    READY_TO_EXECUTE and produce a proposal (pre-existing behavior)."""
    company_id = uuid.uuid4()
    user = _mock_user(company_id=company_id)
    pos = _mock_position(company_id, execution_status="POLICY_ASSIGNED")
    session = _mock_session(position=pos)

    run_id = str(uuid.uuid4())
    proposal = await propose_execution(
        session,
        user=user,
        position_id=pos.id,
        execution_ref="EX-003",
        hedge_amount=200_000.0,
        hedge_rate=1.3,
        run_id=run_id,
        policy_revision_id=None,
        notes=None,
    )

    assert pos.execution_status == "READY_TO_EXECUTE"
    assert pos.last_run_id == run_id
    assert proposal.status == "PROPOSED"
    session.add.assert_called_once()


# ---------------------------------------------------------------------------
# 4. POLICY_ASSIGNED + no run_id -> rejected
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_policy_assigned_without_run_id_raises():
    """POLICY_ASSIGNED without run_id cannot auto-advance to READY_TO_EXECUTE."""
    company_id = uuid.uuid4()
    user = _mock_user(company_id=company_id)
    pos = _mock_position(company_id, execution_status="POLICY_ASSIGNED")
    session = _mock_session(position=pos)

    with pytest.raises(ValueError, match="READY_TO_EXECUTE"):
        await propose_execution(
            session,
            user=user,
            position_id=pos.id,
            execution_ref="EX-004",
            hedge_amount=None,
            hedge_rate=None,
            run_id=None,
            policy_revision_id=None,
            notes=None,
        )

    assert pos.execution_status == "POLICY_ASSIGNED"


# ---------------------------------------------------------------------------
# 5. READY_TO_EXECUTE -> direct proposal (no advance needed)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_ready_to_execute_creates_proposal_directly():
    """Position already READY_TO_EXECUTE should produce a proposal without
    any status transition."""
    company_id = uuid.uuid4()
    user = _mock_user(company_id=company_id)
    pos = _mock_position(company_id, execution_status="READY_TO_EXECUTE")
    session = _mock_session(position=pos)

    proposal = await propose_execution(
        session,
        user=user,
        position_id=pos.id,
        execution_ref="EX-005",
        hedge_amount=None,
        hedge_rate=None,
        run_id=None,
        policy_revision_id=None,
        notes="already ready",
    )

    # Status unchanged
    assert pos.execution_status == "READY_TO_EXECUTE"
    # flush should NOT have been called for auto-advance
    session.flush.assert_not_awaited()
    assert proposal.status == "PROPOSED"


# ---------------------------------------------------------------------------
# 6. NEW + run_id -> hedge_amount / hedge_rate written to position
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_new_auto_advance_sets_hedge_fields():
    """Auto-advance from NEW should write hedge_amount and hedge_rate to the
    position object during advancement."""
    company_id = uuid.uuid4()
    user = _mock_user(company_id=company_id)
    pos = _mock_position(company_id, execution_status="NEW")
    session = _mock_session(position=pos)

    await propose_execution(
        session,
        user=user,
        position_id=pos.id,
        execution_ref="EX-006",
        hedge_amount=750_000.0,
        hedge_rate=20.15,
        run_id=str(uuid.uuid4()),
        policy_revision_id=None,
        notes=None,
    )

    assert pos.hedge_amount == 750_000.0
    assert pos.hedge_rate == 20.15


# ---------------------------------------------------------------------------
# 7. NEW + run_id + existing active proposal -> duplicate guard
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_new_auto_advance_blocked_by_existing_proposal():
    """Even after auto-advancing from NEW, the duplicate proposal guard
    should reject if an active proposal already exists for this position."""
    company_id = uuid.uuid4()
    user = _mock_user(company_id=company_id)
    pos = _mock_position(company_id, execution_status="NEW")

    existing = MagicMock()
    existing.status = "PROPOSED"
    session = _mock_session(position=pos, active_proposal=existing)

    with pytest.raises(ValueError, match="active proposal"):
        await propose_execution(
            session,
            user=user,
            position_id=pos.id,
            execution_ref="EX-007",
            hedge_amount=100_000.0,
            hedge_rate=1.0,
            run_id=str(uuid.uuid4()),
            policy_revision_id=None,
            notes=None,
        )

    # Position was still advanced (the guard fires AFTER status transition)
    assert pos.execution_status == "READY_TO_EXECUTE"


# ---------------------------------------------------------------------------
# 8. Position not found -> ValueError
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_position_not_found_raises():
    """propose_execution should raise when session.get returns None."""
    user = _mock_user()
    session = _mock_session(position=None)

    with pytest.raises(ValueError, match="Position not found"):
        await propose_execution(
            session,
            user=user,
            position_id=uuid.uuid4(),
            execution_ref="EX-008",
            hedge_amount=None,
            hedge_rate=None,
            run_id=None,
            policy_revision_id=None,
            notes=None,
        )


# ---------------------------------------------------------------------------
# 9. Position belongs to different company -> ValueError
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_position_wrong_company_raises():
    """propose_execution should reject when position.company_id differs
    from user.company_id."""
    user = _mock_user(company_id=uuid.uuid4())
    pos = _mock_position(company_id=uuid.uuid4(), execution_status="READY_TO_EXECUTE")
    session = _mock_session(position=pos)

    with pytest.raises(ValueError, match="Position not found"):
        await propose_execution(
            session,
            user=user,
            position_id=pos.id,
            execution_ref="EX-009",
            hedge_amount=None,
            hedge_rate=None,
            run_id=None,
            policy_revision_id=None,
            notes=None,
        )


# ---------------------------------------------------------------------------
# 10. HEDGED position -> rejected regardless of run_id
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_hedged_position_rejected():
    """A position already HEDGED cannot have a new proposal, even with run_id."""
    company_id = uuid.uuid4()
    user = _mock_user(company_id=company_id)
    pos = _mock_position(company_id, execution_status="HEDGED")
    session = _mock_session(position=pos)

    with pytest.raises(ValueError, match="READY_TO_EXECUTE"):
        await propose_execution(
            session,
            user=user,
            position_id=pos.id,
            execution_ref="EX-010",
            hedge_amount=None,
            hedge_rate=None,
            run_id=str(uuid.uuid4()),
            policy_revision_id=None,
            notes=None,
        )
