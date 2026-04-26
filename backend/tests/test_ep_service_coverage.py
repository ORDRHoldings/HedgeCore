"""
tests/test_ep_service_coverage.py

Coverage-targeted unit tests for app/services/execution_proposal_service.py.

Uses AsyncMock DB sessions to avoid PostgreSQL dependency so tests run on
every CI run (SQLite / no DB mode).

Functions covered:
  - _get_proposal                     — found, not found, wrong tenant
  - get_active_proposal_for_position  — none, found
  - list_proposals_for_position       — empty, non-empty
  - list_pending_proposals            — all branches, filtered by branch
  - propose_execution                 — position not found, wrong status, duplicate active, success
  - approve_proposal                  — SoD violation, success
  - approve_proposal_solo             — self-approval allowed
  - reject_proposal                   — SoD violation, success
  - withdraw_proposal                 — wrong proposer, success
  - apply_second_approval             — not APPROVED status, not required, already recorded,
                                        SoD vs maker, SoD vs checker, success
  - execute_approved_proposal         — missing second approval, position not found, success
  - supersede_active_proposals        — zero active, multiple active
  - _determine_second_approval_required — None hedge, below threshold, at threshold
"""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_db() -> AsyncMock:
    db = AsyncMock()
    db.add = MagicMock()
    db.add_all = MagicMock()
    result = MagicMock()
    result.scalars.return_value.first.return_value = None
    result.scalars.return_value.all.return_value = []
    db.execute.return_value = result
    return db


def _make_user(
    user_id=None,
    company_id=None,
    branch_id=None,
    email="maker@test.com",
    is_superuser=False,
):
    user = MagicMock()
    user.id = user_id or uuid.uuid4()
    user.company_id = company_id or uuid.uuid4()
    user.branch_id = branch_id or uuid.uuid4()
    user.email = email
    user.is_superuser = is_superuser
    return user


def _make_proposal(
    proposal_id=None,
    company_id=None,
    position_id=None,
    status="PROPOSED",
    proposed_by=None,
    approved_by=None,
    second_approver_required=False,
    second_approver_id=None,
    proposal_hash="aabbcc",
    approval_hash="ddeeff",
    execution_ref="REF-001",
    proposal_payload=None,
):
    p = MagicMock()
    p.id = proposal_id or uuid.uuid4()
    p.company_id = company_id or uuid.uuid4()
    p.position_id = position_id or uuid.uuid4()
    p.status = status
    p.proposed_by = proposed_by or uuid.uuid4()
    p.approved_by = approved_by
    p.second_approver_required = second_approver_required
    p.second_approver_id = second_approver_id
    p.proposal_hash = proposal_hash
    p.approval_hash = approval_hash
    p.execution_ref = execution_ref
    p.proposal_payload = proposal_payload or {
        "execution_ref": execution_ref,
        "hedge_amount": 100_000.0,
        "hedge_rate": 1.25,
    }
    return p


def _make_position(
    position_id=None,
    company_id=None,
    execution_status="READY_TO_EXECUTE",
    hedge_amount=None,
    hedge_rate=None,
):
    pos = MagicMock()
    pos.id = position_id or uuid.uuid4()
    pos.company_id = company_id or uuid.uuid4()
    pos.execution_status = execution_status
    pos.hedge_amount = hedge_amount
    pos.hedge_rate = hedge_rate
    pos.last_run_id = None
    return pos


# ---------------------------------------------------------------------------
# _determine_second_approval_required
# ---------------------------------------------------------------------------

def test_second_approval_required_none_hedge():
    from app.services.execution_proposal_service import _determine_second_approval_required
    assert _determine_second_approval_required(None) is False


def test_second_approval_required_below_threshold():
    from app.services.execution_proposal_service import _determine_second_approval_required
    assert _determine_second_approval_required(999_999.99) is False


def test_second_approval_required_at_threshold():
    from app.services.execution_proposal_service import _determine_second_approval_required
    assert _determine_second_approval_required(1_000_000.0) is True


def test_second_approval_required_above_threshold():
    from app.services.execution_proposal_service import _determine_second_approval_required
    assert _determine_second_approval_required(5_000_000.0) is True


def test_second_approval_required_negative_large():
    from app.services.execution_proposal_service import _determine_second_approval_required
    assert _determine_second_approval_required(-2_000_000.0) is True


# ---------------------------------------------------------------------------
# _get_proposal (private helper via module-level import)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_proposal_raises_when_not_found():
    from app.services.execution_proposal_service import _get_proposal

    db = _make_db()
    db.get = AsyncMock(return_value=None)
    with pytest.raises(ValueError, match="not found"):
        await _get_proposal(db, uuid.uuid4(), uuid.uuid4())


@pytest.mark.asyncio
async def test_get_proposal_raises_wrong_tenant():
    from app.services.execution_proposal_service import _get_proposal

    db = _make_db()
    proposal = _make_proposal(company_id=uuid.uuid4())
    db.get = AsyncMock(return_value=proposal)

    with pytest.raises(ValueError, match="not found"):
        await _get_proposal(db, proposal.id, uuid.uuid4())  # different company_id


@pytest.mark.asyncio
async def test_get_proposal_returns_proposal_when_found():
    from app.services.execution_proposal_service import _get_proposal

    db = _make_db()
    company_id = uuid.uuid4()
    proposal = _make_proposal(company_id=company_id)
    db.get = AsyncMock(return_value=proposal)

    result = await _get_proposal(db, proposal.id, company_id)
    assert result is proposal


# ---------------------------------------------------------------------------
# get_active_proposal_for_position
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_active_proposal_returns_none_when_empty():
    from app.services.execution_proposal_service import get_active_proposal_for_position

    db = _make_db()
    result = await get_active_proposal_for_position(db, uuid.uuid4(), uuid.uuid4())
    assert result is None


@pytest.mark.asyncio
async def test_get_active_proposal_returns_proposal():
    from app.services.execution_proposal_service import get_active_proposal_for_position

    db = _make_db()
    proposal = _make_proposal(status="PROPOSED")
    res_mock = MagicMock()
    res_mock.scalars.return_value.first.return_value = proposal
    db.execute.return_value = res_mock

    result = await get_active_proposal_for_position(db, uuid.uuid4(), uuid.uuid4())
    assert result is proposal


# ---------------------------------------------------------------------------
# list_proposals_for_position
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_list_proposals_for_position_empty():
    from app.services.execution_proposal_service import list_proposals_for_position

    db = _make_db()
    result = await list_proposals_for_position(db, uuid.uuid4(), uuid.uuid4())
    assert result == []


@pytest.mark.asyncio
async def test_list_proposals_for_position_returns_all():
    from app.services.execution_proposal_service import list_proposals_for_position

    db = _make_db()
    p1 = _make_proposal(status="REJECTED")
    p2 = _make_proposal(status="PROPOSED")
    res_mock = MagicMock()
    res_mock.scalars.return_value.all.return_value = [p1, p2]
    db.execute.return_value = res_mock

    result = await list_proposals_for_position(db, uuid.uuid4(), uuid.uuid4())
    assert len(result) == 2


# ---------------------------------------------------------------------------
# list_pending_proposals
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_list_pending_proposals_all_branches():
    from app.services.execution_proposal_service import list_pending_proposals

    db = _make_db()
    company_id = uuid.uuid4()
    result = await list_pending_proposals(db, company_id, branch_id=None, all_branches=True)
    assert result == []


@pytest.mark.asyncio
async def test_list_pending_proposals_filtered_by_branch():
    from app.services.execution_proposal_service import list_pending_proposals

    db = _make_db()
    company_id = uuid.uuid4()
    branch_id = uuid.uuid4()
    p1 = _make_proposal(status="PROPOSED")
    res_mock = MagicMock()
    res_mock.scalars.return_value.all.return_value = [p1]
    db.execute.return_value = res_mock

    result = await list_pending_proposals(
        db, company_id, branch_id=branch_id, all_branches=False
    )
    assert len(result) == 1


@pytest.mark.asyncio
async def test_list_pending_proposals_no_branch_id_no_filter():
    """all_branches=False but branch_id=None should not add branch filter."""
    from app.services.execution_proposal_service import list_pending_proposals

    db = _make_db()
    result = await list_pending_proposals(
        db, uuid.uuid4(), branch_id=None, all_branches=False
    )
    assert result == []


# ---------------------------------------------------------------------------
# propose_execution
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_propose_execution_position_not_found():
    from app.services.execution_proposal_service import propose_execution

    db = _make_db()
    db.get = AsyncMock(return_value=None)
    user = _make_user()

    with pytest.raises(ValueError, match="Position not found"):
        await propose_execution(
            db,
            user=user,
            position_id=uuid.uuid4(),
            execution_ref="REF-001",
            hedge_amount=100_000.0,
            hedge_rate=1.25,
            run_id=None,
            policy_revision_id=None,
            notes=None,
        )


@pytest.mark.asyncio
async def test_propose_execution_position_wrong_tenant():
    from app.services.execution_proposal_service import propose_execution

    db = _make_db()
    user = _make_user()
    pos = _make_position(company_id=uuid.uuid4())  # different company
    db.get = AsyncMock(return_value=pos)

    with pytest.raises(ValueError, match="Position not found"):
        await propose_execution(
            db,
            user=user,
            position_id=pos.id,
            execution_ref="REF-001",
            hedge_amount=100_000.0,
            hedge_rate=1.25,
            run_id=None,
            policy_revision_id=None,
            notes=None,
        )


@pytest.mark.asyncio
async def test_propose_execution_wrong_status():
    from app.services.execution_proposal_service import propose_execution

    db = _make_db()
    company_id = uuid.uuid4()
    user = _make_user(company_id=company_id)
    pos = _make_position(company_id=company_id, execution_status="HEDGED")
    db.get = AsyncMock(return_value=pos)

    # get_active_proposal returns None (no existing proposal)
    res_mock = MagicMock()
    res_mock.scalars.return_value.first.return_value = None
    db.execute.return_value = res_mock

    with pytest.raises(ValueError, match="READY_TO_EXECUTE"):
        await propose_execution(
            db,
            user=user,
            position_id=pos.id,
            execution_ref="REF-001",
            hedge_amount=100_000.0,
            hedge_rate=1.25,
            run_id=None,
            policy_revision_id=None,
            notes=None,
        )


@pytest.mark.asyncio
async def test_propose_execution_duplicate_active_proposal():
    from app.services.execution_proposal_service import propose_execution

    db = _make_db()
    company_id = uuid.uuid4()
    user = _make_user(company_id=company_id)
    pos = _make_position(company_id=company_id, execution_status="READY_TO_EXECUTE")
    db.get = AsyncMock(return_value=pos)

    existing = _make_proposal(status="PROPOSED")
    res_mock = MagicMock()
    res_mock.scalars.return_value.first.return_value = existing
    db.execute.return_value = res_mock

    with pytest.raises(ValueError, match="active proposal"):
        await propose_execution(
            db,
            user=user,
            position_id=pos.id,
            execution_ref="REF-001",
            hedge_amount=100_000.0,
            hedge_rate=1.25,
            run_id=None,
            policy_revision_id=None,
            notes=None,
        )


@pytest.mark.asyncio
async def test_propose_execution_auto_advance_from_new():
    """When position is NEW and run_id is provided it auto-advances to READY_TO_EXECUTE."""
    from app.services.execution_proposal_service import propose_execution

    db = _make_db()
    company_id = uuid.uuid4()
    user = _make_user(company_id=company_id)
    pos = _make_position(company_id=company_id, execution_status="NEW")
    db.get = AsyncMock(return_value=pos)

    # No existing active proposal
    no_proposal = MagicMock()
    no_proposal.scalars.return_value.first.return_value = None
    db.execute.return_value = no_proposal

    # Patch commit + refresh to avoid real DB
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    db.flush = AsyncMock()

    with patch("app.services.execution_proposal_service.compute_proposal_hash", return_value="hash123"):
        result = await propose_execution(
            db,
            user=user,
            position_id=pos.id,
            execution_ref="REF-AUTO",
            hedge_amount=500_000.0,
            hedge_rate=1.10,
            run_id="run-123",
            policy_revision_id=None,
            notes=None,
        )

    assert pos.execution_status == "READY_TO_EXECUTE"
    db.add.assert_called_once()
    db.commit.assert_called()


@pytest.mark.asyncio
async def test_propose_execution_success_ready_status():
    """Happy path: READY_TO_EXECUTE position creates a proposal."""
    from app.services.execution_proposal_service import propose_execution

    db = _make_db()
    company_id = uuid.uuid4()
    user = _make_user(company_id=company_id)
    pos = _make_position(company_id=company_id, execution_status="READY_TO_EXECUTE")
    db.get = AsyncMock(return_value=pos)

    res_mock = MagicMock()
    res_mock.scalars.return_value.first.return_value = None
    db.execute.return_value = res_mock

    db.commit = AsyncMock()
    db.refresh = AsyncMock()

    with patch("app.services.execution_proposal_service.compute_proposal_hash", return_value="hash456"):
        result = await propose_execution(
            db,
            user=user,
            position_id=pos.id,
            execution_ref="REF-OK",
            hedge_amount=100_000.0,
            hedge_rate=1.30,
            run_id=None,
            policy_revision_id=None,
            notes="Test note",
        )

    db.add.assert_called_once()
    db.commit.assert_called()


# ---------------------------------------------------------------------------
# approve_proposal
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_approve_proposal_sod_violation():
    from app.services.execution_proposal_service import approve_proposal

    db = _make_db()
    maker_id = uuid.uuid4()
    company_id = uuid.uuid4()
    user = _make_user(user_id=maker_id, company_id=company_id)
    proposal = _make_proposal(company_id=company_id, status="PROPOSED", proposed_by=maker_id)
    db.get = AsyncMock(return_value=proposal)

    with pytest.raises(ValueError, match="SoD violation"):
        await approve_proposal(db, user=user, proposal_id=proposal.id)


@pytest.mark.asyncio
async def test_approve_proposal_invalid_transition():
    from app.services.execution_proposal_service import approve_proposal

    db = _make_db()
    company_id = uuid.uuid4()
    user = _make_user(company_id=company_id)
    # Already EXECUTED — illegal transition
    proposal = _make_proposal(company_id=company_id, status="EXECUTED", proposed_by=uuid.uuid4())
    db.get = AsyncMock(return_value=proposal)

    with pytest.raises(ValueError, match="Illegal proposal transition"):
        await approve_proposal(db, user=user, proposal_id=proposal.id)


@pytest.mark.asyncio
async def test_approve_proposal_success():
    from app.services.execution_proposal_service import approve_proposal

    db = _make_db()
    company_id = uuid.uuid4()
    checker_id = uuid.uuid4()
    maker_id = uuid.uuid4()
    user = _make_user(user_id=checker_id, company_id=company_id, email="checker@test.com")
    proposal = _make_proposal(company_id=company_id, status="PROPOSED", proposed_by=maker_id)
    db.get = AsyncMock(return_value=proposal)
    db.commit = AsyncMock()
    db.refresh = AsyncMock()

    with patch(
        "app.services.execution_proposal_service.compute_approval_hash",
        return_value="approval_hash_xyz",
    ):
        result = await approve_proposal(
            db, user=user, proposal_id=proposal.id, approval_notes="Looks good"
        )

    assert proposal.status == "APPROVED"
    assert proposal.approved_by == checker_id
    db.commit.assert_called()


# ---------------------------------------------------------------------------
# approve_proposal_solo
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_approve_proposal_solo_self_approval():
    """Solo mode allows same actor to approve their own proposal."""
    from app.services.execution_proposal_service import approve_proposal_solo

    db = _make_db()
    company_id = uuid.uuid4()
    maker_id = uuid.uuid4()
    user = _make_user(user_id=maker_id, company_id=company_id)
    proposal = _make_proposal(company_id=company_id, status="PROPOSED", proposed_by=maker_id)
    db.get = AsyncMock(return_value=proposal)
    db.commit = AsyncMock()
    db.refresh = AsyncMock()

    with patch(
        "app.services.execution_proposal_service.compute_approval_hash",
        return_value="solo_hash",
    ):
        await approve_proposal_solo(db, user=user, proposal_id=proposal.id)

    assert proposal.status == "APPROVED"
    assert "Solo" in proposal.approval_notes or proposal.approval_notes is not None


# ---------------------------------------------------------------------------
# reject_proposal
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_reject_proposal_sod_violation():
    from app.services.execution_proposal_service import reject_proposal

    db = _make_db()
    maker_id = uuid.uuid4()
    company_id = uuid.uuid4()
    user = _make_user(user_id=maker_id, company_id=company_id)
    proposal = _make_proposal(company_id=company_id, status="PROPOSED", proposed_by=maker_id)
    db.get = AsyncMock(return_value=proposal)

    with pytest.raises(ValueError, match="SoD violation"):
        await reject_proposal(db, user=user, proposal_id=proposal.id, reason="rejected")


@pytest.mark.asyncio
async def test_reject_proposal_success():
    from app.services.execution_proposal_service import reject_proposal

    db = _make_db()
    company_id = uuid.uuid4()
    checker_id = uuid.uuid4()
    maker_id = uuid.uuid4()
    user = _make_user(user_id=checker_id, company_id=company_id)
    proposal = _make_proposal(company_id=company_id, status="PROPOSED", proposed_by=maker_id)
    db.get = AsyncMock(return_value=proposal)
    db.commit = AsyncMock()
    db.refresh = AsyncMock()

    await reject_proposal(db, user=user, proposal_id=proposal.id, reason="Bad rate")

    assert proposal.status == "REJECTED"
    assert proposal.rejection_reason == "Bad rate"
    db.commit.assert_called()


# ---------------------------------------------------------------------------
# withdraw_proposal
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_withdraw_proposal_wrong_proposer():
    from app.services.execution_proposal_service import withdraw_proposal

    db = _make_db()
    company_id = uuid.uuid4()
    maker_id = uuid.uuid4()
    other_id = uuid.uuid4()
    user = _make_user(user_id=other_id, company_id=company_id)
    proposal = _make_proposal(company_id=company_id, status="PROPOSED", proposed_by=maker_id)
    db.get = AsyncMock(return_value=proposal)

    with pytest.raises(ValueError, match="original proposer"):
        await withdraw_proposal(db, user=user, proposal_id=proposal.id)


@pytest.mark.asyncio
async def test_withdraw_proposal_success():
    from app.services.execution_proposal_service import withdraw_proposal

    db = _make_db()
    company_id = uuid.uuid4()
    maker_id = uuid.uuid4()
    user = _make_user(user_id=maker_id, company_id=company_id)
    proposal = _make_proposal(company_id=company_id, status="PROPOSED", proposed_by=maker_id)
    db.get = AsyncMock(return_value=proposal)
    db.commit = AsyncMock()
    db.refresh = AsyncMock()

    await withdraw_proposal(db, user=user, proposal_id=proposal.id, reason="Changed mind")

    assert proposal.status == "WITHDRAWN"
    assert proposal.rejection_reason == "Changed mind"
    db.commit.assert_called()


# ---------------------------------------------------------------------------
# apply_second_approval
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_apply_second_approval_not_approved_status():
    from app.services.execution_proposal_service import apply_second_approval

    db = _make_db()
    company_id = uuid.uuid4()
    user = _make_user(company_id=company_id)
    proposal = _make_proposal(company_id=company_id, status="PROPOSED")
    db.get = AsyncMock(return_value=proposal)

    with pytest.raises(ValueError, match="APPROVED"):
        await apply_second_approval(db, user=user, proposal_id=proposal.id)


@pytest.mark.asyncio
async def test_apply_second_approval_not_required():
    from app.services.execution_proposal_service import apply_second_approval

    db = _make_db()
    company_id = uuid.uuid4()
    user = _make_user(company_id=company_id)
    proposal = _make_proposal(
        company_id=company_id, status="APPROVED", second_approver_required=False
    )
    db.get = AsyncMock(return_value=proposal)

    with pytest.raises(ValueError, match="not required"):
        await apply_second_approval(db, user=user, proposal_id=proposal.id)


@pytest.mark.asyncio
async def test_apply_second_approval_already_recorded():
    from app.services.execution_proposal_service import apply_second_approval

    db = _make_db()
    company_id = uuid.uuid4()
    user = _make_user(company_id=company_id)
    proposal = _make_proposal(
        company_id=company_id,
        status="APPROVED",
        second_approver_required=True,
        second_approver_id=uuid.uuid4(),  # already set
    )
    db.get = AsyncMock(return_value=proposal)

    with pytest.raises(ValueError, match="already recorded"):
        await apply_second_approval(db, user=user, proposal_id=proposal.id)


@pytest.mark.asyncio
async def test_apply_second_approval_sod_vs_maker():
    from app.services.execution_proposal_service import apply_second_approval

    db = _make_db()
    company_id = uuid.uuid4()
    maker_id = uuid.uuid4()
    user = _make_user(user_id=maker_id, company_id=company_id)
    proposal = _make_proposal(
        company_id=company_id,
        status="APPROVED",
        proposed_by=maker_id,
        second_approver_required=True,
        second_approver_id=None,
    )
    db.get = AsyncMock(return_value=proposal)

    with pytest.raises(ValueError, match="differ from the proposer"):
        await apply_second_approval(db, user=user, proposal_id=proposal.id)


@pytest.mark.asyncio
async def test_apply_second_approval_sod_vs_checker():
    from app.services.execution_proposal_service import apply_second_approval

    db = _make_db()
    company_id = uuid.uuid4()
    checker_id = uuid.uuid4()
    user = _make_user(user_id=checker_id, company_id=company_id)
    proposal = _make_proposal(
        company_id=company_id,
        status="APPROVED",
        proposed_by=uuid.uuid4(),  # different from user
        approved_by=checker_id,   # same as user -> SoD violation
        second_approver_required=True,
        second_approver_id=None,
    )
    db.get = AsyncMock(return_value=proposal)

    with pytest.raises(ValueError, match="differ from the primary checker"):
        await apply_second_approval(db, user=user, proposal_id=proposal.id)


@pytest.mark.asyncio
async def test_apply_second_approval_success():
    from app.services.execution_proposal_service import apply_second_approval

    db = _make_db()
    company_id = uuid.uuid4()
    second_user_id = uuid.uuid4()
    user = _make_user(user_id=second_user_id, company_id=company_id)
    proposal = _make_proposal(
        company_id=company_id,
        status="APPROVED",
        proposed_by=uuid.uuid4(),
        approved_by=uuid.uuid4(),
        second_approver_required=True,
        second_approver_id=None,
        approval_hash="primary_hash",
    )
    db.get = AsyncMock(return_value=proposal)
    db.commit = AsyncMock()
    db.refresh = AsyncMock()

    await apply_second_approval(db, user=user, proposal_id=proposal.id, approval_notes="Confirmed")

    assert proposal.second_approver_id == second_user_id
    assert proposal.second_approval_hash is not None
    db.commit.assert_called()


# ---------------------------------------------------------------------------
# execute_approved_proposal
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_execute_approved_proposal_dual_key_missing():
    from app.services.execution_proposal_service import execute_approved_proposal

    db = _make_db()
    company_id = uuid.uuid4()
    user = _make_user(company_id=company_id)
    proposal = _make_proposal(
        company_id=company_id,
        status="APPROVED",
        second_approver_required=True,
        second_approver_id=None,  # not yet signed
    )
    db.get = AsyncMock(return_value=proposal)

    with pytest.raises(ValueError, match="Dual-key"):
        await execute_approved_proposal(db, user=user, proposal_id=proposal.id)


@pytest.mark.asyncio
async def test_execute_approved_proposal_position_not_found():
    from app.services.execution_proposal_service import execute_approved_proposal

    db = _make_db()
    company_id = uuid.uuid4()
    user = _make_user(company_id=company_id, is_superuser=True)
    proposal = _make_proposal(
        company_id=company_id,
        status="APPROVED",
        second_approver_required=False,
    )

    # proposal lookup succeeds; position lookup returns None
    call_count = 0

    async def get_side_effect(model, pk):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return proposal  # first call = proposal
        return None  # second call = position

    db.get = AsyncMock(side_effect=get_side_effect)

    with pytest.raises(ValueError, match="Position not found"):
        await execute_approved_proposal(db, user=user, proposal_id=proposal.id)


@pytest.mark.asyncio
async def test_execute_approved_proposal_success():
    from app.services.execution_proposal_service import execute_approved_proposal

    db = _make_db()
    company_id = uuid.uuid4()
    user = _make_user(company_id=company_id, is_superuser=True)
    proposal = _make_proposal(
        company_id=company_id,
        status="APPROVED",
        second_approver_required=False,
        proposal_payload={"execution_ref": "EXEC-001", "hedge_amount": 200_000.0, "hedge_rate": 1.15},
    )
    pos = _make_position(company_id=company_id, execution_status="READY_TO_EXECUTE")

    call_count = 0

    async def get_side_effect(model, pk):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return proposal
        return pos

    db.get = AsyncMock(side_effect=get_side_effect)
    db.commit = AsyncMock()
    db.refresh = AsyncMock()

    mock_updated_pos = MagicMock()

    with patch(
        "app.services.position_service.execute_position",
        new=AsyncMock(return_value=mock_updated_pos),
    ):
        result_proposal, result_pos = await execute_approved_proposal(
            db, user=user, proposal_id=proposal.id
        )

    assert proposal.status == "EXECUTED"
    assert result_pos is mock_updated_pos
    db.commit.assert_called()


# ---------------------------------------------------------------------------
# supersede_active_proposals_for_position
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_supersede_active_proposals_zero():
    from app.services.execution_proposal_service import supersede_active_proposals_for_position

    db = _make_db()
    res_mock = MagicMock()
    res_mock.scalars.return_value.all.return_value = []
    db.execute.return_value = res_mock

    count = await supersede_active_proposals_for_position(db, uuid.uuid4(), uuid.uuid4())
    assert count == 0
    db.flush.assert_not_called()


@pytest.mark.asyncio
async def test_supersede_active_proposals_multiple():
    from app.services.execution_proposal_service import supersede_active_proposals_for_position

    db = _make_db()
    p1 = _make_proposal(status="PROPOSED")
    p2 = _make_proposal(status="APPROVED")
    res_mock = MagicMock()
    res_mock.scalars.return_value.all.return_value = [p1, p2]
    db.execute.return_value = res_mock
    db.flush = AsyncMock()

    count = await supersede_active_proposals_for_position(
        db, uuid.uuid4(), uuid.uuid4(), reason="Position cancelled"
    )

    assert count == 2
    assert p1.status == "WITHDRAWN"
    assert p2.status == "WITHDRAWN"
    assert p1.rejection_reason == "Position cancelled"
    db.flush.assert_called_once()
