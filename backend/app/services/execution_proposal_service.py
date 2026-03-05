"""

app/services/execution_proposal_service.py

Execution Proposal Service -- True 4-Eyes Maker/Checker Workflow



SERVICE CONTRACT:

  propose_execution()    Maker creates a proposal (PROPOSED)

  approve_proposal()     Checker approves (APPROVED). Rejects if same actor as maker.

  reject_proposal()      Checker rejects (REJECTED). Rejects if same actor as maker.

  execute_proposal()     Either actor finalises (EXECUTED) after approval.

                         This triggers position.execute_position() under the hood.

  withdraw_proposal()    Maker withdraws before approval (WITHDRAWN).



SoD ENFORCEMENT (defence in depth):

  Layer 1 -- DB CHECK: approved_by IS NULL OR approved_by != proposed_by

  Layer 2 -- Service: raises ValueError("SoD violation") if same actor

  Both layers must pass. If DB constraint triggers, it surfaces as a service error.



LIFECYCLE INTEGRATION:

  A position cannot be executed (-> HEDGED) without an APPROVED proposal.

  position_service.execute_position() is called by execute_proposal() only.

  Attempting to call the position execute endpoint directly will fail with

  403 FORBIDDEN if the position has no approved proposal (enforced at API layer).



AUDIT CONTRACT:

  Every proposal state transition emits a corresponding audit_event.

  The audit event includes proposal_id, position_id, and the relevant hash.

"""

from __future__ import annotations

import uuid as _uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.execution_proposal import (
    ExecutionProposal,
    _assert_proposal_transition,
    compute_approval_hash,
    compute_proposal_hash,
)
from app.models.position import Position
from app.models.user import User
from app.schemas_v1.positions import ExecutePositionRequest

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _get_proposal(
    session: AsyncSession,
    proposal_id: _uuid.UUID,
    company_id: _uuid.UUID,
) -> ExecutionProposal:
    """Fetch proposal with tenant check. Raises ValueError on miss."""
    p = await session.get(ExecutionProposal, proposal_id)
    if not p or p.company_id != company_id:
        raise ValueError("Execution proposal not found")
    return p


async def get_active_proposal_for_position(
    session: AsyncSession,
    position_id: _uuid.UUID,
    company_id: _uuid.UUID,
) -> ExecutionProposal | None:
    """Return the active (PROPOSED or APPROVED) proposal for a position, if any."""
    q = (
        select(ExecutionProposal)
        .where(
            ExecutionProposal.position_id == position_id,
            ExecutionProposal.company_id  == company_id,
            ExecutionProposal.status.in_(("PROPOSED", "APPROVED")),
        )
        .order_by(ExecutionProposal.proposed_at.desc())
        .limit(1)
    )
    result = await session.execute(q)
    return result.scalars().first()


async def list_proposals_for_position(
    session: AsyncSession,
    position_id: _uuid.UUID,
    company_id: _uuid.UUID,
) -> list[ExecutionProposal]:
    """Return all proposals for a position (history), newest first."""
    q = (
        select(ExecutionProposal)
        .where(
            ExecutionProposal.position_id == position_id,
            ExecutionProposal.company_id  == company_id,
        )
        .order_by(ExecutionProposal.proposed_at.desc())
    )
    result = await session.execute(q)
    return list(result.scalars().all())


async def list_pending_proposals(
    session: AsyncSession,
    company_id: _uuid.UUID,
    branch_id: _uuid.UUID | None,
    all_branches: bool,
) -> list[ExecutionProposal]:
    """
    List all PROPOSED (awaiting approval) proposals for this company+scope.
    Used by checker dashboard.
    """
    q = select(ExecutionProposal).where(
        ExecutionProposal.company_id == company_id,
        ExecutionProposal.status == "PROPOSED",
    )
    if not all_branches and branch_id:
        q = q.where(ExecutionProposal.branch_id == branch_id)
    q = q.order_by(ExecutionProposal.proposed_at.asc())  # oldest first -> process in order
    result = await session.execute(q)
    return list(result.scalars().all())


# ---------------------------------------------------------------------------
# State transitions
# ---------------------------------------------------------------------------

async def propose_execution(
    session: AsyncSession,
    *,
    user: User,
    position_id: _uuid.UUID,
    execution_ref: str,
    hedge_amount: float | None,
    hedge_rate: float | None,
    run_id: str | None,
    policy_revision_id: str | None,
    notes: str | None,
    risk_decision_hash: str | None = None,
    risk_verdict: str | None = None,
) -> ExecutionProposal:
    """
    Maker creates an execution proposal for a position.
    Position must be in READY_TO_EXECUTE state.
    At most one active (PROPOSED|APPROVED) proposal allowed per position.
    """
    # Guard: position must be ready (or auto-advance from POLICY_ASSIGNED when run_id present)
    pos = await session.get(Position, position_id)
    if not pos or pos.company_id != user.company_id:
        raise ValueError("Position not found")
    if pos.execution_status == "POLICY_ASSIGNED" and run_id:
        # Auto-transition: creating a proposal with a run_id IS the declaration that
        # the position is ready to execute. Transition inline rather than requiring a
        # separate PATCH /v1/positions/{id}/ready call.
        pos.execution_status = "READY_TO_EXECUTE"
        pos.last_run_id = run_id
        if hedge_amount is not None:
            pos.hedge_amount = hedge_amount  # type: ignore[assignment]
        if hedge_rate is not None:
            pos.hedge_rate = hedge_rate      # type: ignore[assignment]
        await session.flush()
    if pos.execution_status != "READY_TO_EXECUTE":
        raise ValueError(
            f"Position must be READY_TO_EXECUTE to propose execution. "
            f"Current status: {pos.execution_status}"
        )

    # Guard: no active proposal already exists
    existing = await get_active_proposal_for_position(session, position_id, user.company_id)
    if existing:
        raise ValueError(
            f"An active proposal ({existing.status}) already exists for this position. "
            f"Withdraw or wait for the existing proposal to complete."
        )

    payload = {
        "execution_ref":      execution_ref,
        "hedge_amount":       hedge_amount,
        "hedge_rate":         hedge_rate,
        "run_id":             run_id,
        "policy_revision_id": policy_revision_id,
        "notes":              notes,
        "proposed_by":        str(user.id),
        "proposed_at":        datetime.now(UTC).isoformat(),
        "risk_decision_hash": risk_decision_hash,
        "risk_verdict":       risk_verdict,
    }
    proposal = ExecutionProposal(
        id                 = _uuid.uuid4(),
        position_id        = position_id,
        company_id         = user.company_id,
        branch_id          = user.branch_id,
        status             = "PROPOSED",
        proposed_by        = user.id,
        proposed_by_email  = user.email,
        proposed_at        = datetime.now(UTC),
        proposal_payload   = payload,
        proposal_hash      = compute_proposal_hash(payload),
        execution_ref      = execution_ref,
        risk_decision_hash = risk_decision_hash,
        risk_verdict       = risk_verdict,
    )
    session.add(proposal)
    await session.commit()
    await session.refresh(proposal)
    return proposal


async def approve_proposal(
    session: AsyncSession,
    *,
    user: User,
    proposal_id: _uuid.UUID,
    approval_notes: str | None = None,
) -> ExecutionProposal:
    """
    Checker approves a PROPOSED proposal -> APPROVED.
    Enforces SoD: approver must differ from proposer.
    """
    proposal = await _get_proposal(session, proposal_id, user.company_id)
    _assert_proposal_transition(proposal.status, "APPROVED", proposal_id)

    # SoD enforcement (service layer -- DB constraint is backup layer)
    if proposal.proposed_by == user.id:
        raise ValueError(
            "SoD violation: the approver must be a different actor than the proposer. "
            "You cannot approve your own execution proposal."
        )

    now = datetime.now(UTC)
    proposal.approved_by       = user.id
    proposal.approved_by_email = user.email
    proposal.approved_at       = now
    proposal.approval_notes    = approval_notes
    proposal.approval_hash     = compute_approval_hash(
        approved_by    = str(user.id),
        approved_at    = now,
        approval_notes = approval_notes,
        proposal_hash  = proposal.proposal_hash,
    )
    proposal.status = "APPROVED"
    await session.commit()
    await session.refresh(proposal)
    return proposal


async def approve_proposal_solo(
    session: AsyncSession,
    *,
    user: User,
    proposal_id: _uuid.UUID,
    approval_notes: str | None = None,
) -> ExecutionProposal:
    """
    Solo governance mode: self-approval (bypasses SoD check).

    Only called when company.settings['governance_mode'] == 'solo'.
    Records the approval with an explicit solo-mode marker in the hash input.
    """
    proposal = await _get_proposal(session, proposal_id, user.company_id)
    _assert_proposal_transition(proposal.status, "APPROVED", proposal_id)

    # NOTE: SoD check intentionally omitted — solo mode explicitly permits self-approval.
    notes = approval_notes or "Solo governance mode: self-approved by proposer"
    now = datetime.now(UTC)
    proposal.approved_by       = user.id
    proposal.approved_by_email = user.email
    proposal.approved_at       = now
    proposal.approval_notes    = notes
    proposal.approval_hash     = compute_approval_hash(
        approved_by    = str(user.id),
        approved_at    = now,
        approval_notes = notes,
        proposal_hash  = proposal.proposal_hash,
    )
    proposal.status = "APPROVED"
    await session.commit()
    await session.refresh(proposal)
    return proposal


async def reject_proposal(
    session: AsyncSession,
    *,
    user: User,
    proposal_id: _uuid.UUID,
    reason: str,
) -> ExecutionProposal:
    """
    Checker rejects a PROPOSED proposal -> REJECTED.
    Enforces SoD: same rule as approve.
    """
    proposal = await _get_proposal(session, proposal_id, user.company_id)
    _assert_proposal_transition(proposal.status, "REJECTED", proposal_id)

    if proposal.proposed_by == user.id:
        raise ValueError(
            "SoD violation: you cannot reject your own execution proposal. "
            "A different actor (checker) must reject."
        )

    proposal.approved_by       = user.id
    proposal.approved_by_email = user.email
    proposal.approved_at       = datetime.now(UTC)
    proposal.rejection_reason  = reason
    proposal.status            = "REJECTED"
    await session.commit()
    await session.refresh(proposal)
    return proposal


async def withdraw_proposal(
    session: AsyncSession,
    *,
    user: User,
    proposal_id: _uuid.UUID,
    reason: str | None = None,
) -> ExecutionProposal:
    """
    Maker withdraws their own PROPOSED or APPROVED proposal -> WITHDRAWN.
    Only the original proposer may withdraw.
    """
    proposal = await _get_proposal(session, proposal_id, user.company_id)
    _assert_proposal_transition(proposal.status, "WITHDRAWN", proposal_id)

    if proposal.proposed_by != user.id:
        raise ValueError(
            "Only the original proposer may withdraw this proposal."
        )

    proposal.rejection_reason = reason
    proposal.status           = "WITHDRAWN"
    await session.commit()
    await session.refresh(proposal)
    return proposal


async def execute_approved_proposal(
    session: AsyncSession,
    *,
    user: User,
    proposal_id: _uuid.UUID,
) -> tuple[ExecutionProposal, Position]:
    """
    Finalise an APPROVED proposal -> EXECUTED and transition position -> HEDGED.

    This is the only pathway to HEDGED. The position execute endpoint
    validates that an APPROVED proposal exists before calling this service.

    Returns the updated (proposal, position) tuple.
    """
    from app.services import position_service

    proposal = await _get_proposal(session, proposal_id, user.company_id)
    _assert_proposal_transition(proposal.status, "EXECUTED", proposal_id)

    # Execution reference comes from proposal payload
    execution_ref = (
        proposal.execution_ref
        or proposal.proposal_payload.get("execution_ref", "")
    )
    hedge_amount = proposal.proposal_payload.get("hedge_amount")
    hedge_rate   = proposal.proposal_payload.get("hedge_rate")

    # Resolve position scope
    pos = await session.get(Position, proposal.position_id)
    if not pos or pos.company_id != user.company_id:
        raise ValueError("Position not found")

    # Determine all_branches: superuser or has reports.view_all_branches permission
    if user.is_superuser or user.branch_id is None:
        all_branches = True
    else:
        from app.services import rbac_service as _rbac
        _perms = await _rbac.get_permissions_by_user(session, user.id)
        all_branches = "reports.view_all_branches" in _perms

    # Transition position -> HEDGED via position service
    execute_data = ExecutePositionRequest(
        execution_ref = execution_ref,
        hedge_amount  = float(hedge_amount) if hedge_amount else None,
        hedge_rate    = float(hedge_rate)   if hedge_rate   else None,
    )
    updated_pos = await position_service.execute_position(
        session, user, proposal.position_id, execute_data, all_branches
    )

    # Mark proposal EXECUTED
    proposal.execution_ref = execution_ref
    proposal.executed_at   = datetime.now(UTC)
    proposal.status        = "EXECUTED"
    await session.commit()
    await session.refresh(proposal)

    return proposal, updated_pos
