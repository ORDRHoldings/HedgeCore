"""
Execution Proposal API routes -- /api/v1/proposals

4-Eyes Maker/Checker workflow. A position cannot reach HEDGED without going
through the proposal -> approval -> execute sequence.

Endpoints:
  POST /v1/proposals                           -> maker creates proposal (trades.edit)
  GET  /v1/proposals                           -> list active proposals for company (trades.view)
  GET  /v1/proposals/pending                   -> checker dashboard: all PROPOSED (trades.execute)
  GET  /v1/proposals/{id}                      -> single proposal detail (trades.view)
  PATCH /v1/proposals/{id}/approve             -> checker approves (trades.execute + SoD)
  PATCH /v1/proposals/{id}/reject              -> checker rejects  (trades.execute + SoD)
  PATCH /v1/proposals/{id}/withdraw            -> maker withdraws  (trades.edit, own only)
  POST  /v1/proposals/{id}/execute             -> finalise APPROVED proposal -> HEDGED (trades.execute)
  GET  /v1/proposals/position/{position_id}    -> full history for a position (trades.view)

SoD rules:
  - trades.edit   can create and withdraw proposals
  - trades.execute can approve, reject, and finalise
  - The same actor cannot propose + approve (enforced at service + DB level)
"""
from __future__ import annotations

import logging
from uuid import UUID
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_async_session
from app.core.security import get_current_user
from app.models.audit_event import GENESIS_HASH, AuditEvent, build_audit_event
from app.models.execution_proposal import ExecutionProposal
from app.models.user import User
from app.services import rbac_service
from app.services import execution_proposal_service as ep_service
from sqlalchemy import select as sa_select

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/proposals", tags=["v1-proposals"])


# ---------------------------------------------------------------------------
# Pydantic schemas (inline -- proposal-specific, no reuse needed yet)
# ---------------------------------------------------------------------------

class ProposeExecutionRequest(BaseModel):
    position_id:        UUID
    execution_ref:      str   = Field(..., min_length=1, max_length=128)
    hedge_amount:       Optional[float] = Field(default=None, gt=0)
    hedge_rate:         Optional[float] = Field(default=None, gt=0)
    run_id:             Optional[str]   = Field(default=None, max_length=64)
    policy_revision_id: Optional[str]   = Field(default=None, max_length=64)
    notes:              Optional[str]   = Field(default=None, max_length=1024)


class ApproveProposalRequest(BaseModel):
    approval_notes: Optional[str] = Field(default=None, max_length=1024)


class RejectProposalRequest(BaseModel):
    reason: str = Field(..., min_length=1, max_length=512)


class WithdrawProposalRequest(BaseModel):
    reason: Optional[str] = Field(default=None, max_length=512)


class ProposalResponse(BaseModel):
    id:                 UUID
    position_id:        UUID
    company_id:         UUID
    branch_id:          Optional[UUID]  = None
    status:             str
    proposed_by:        UUID
    proposed_by_email:  Optional[str]   = None
    proposed_at:        str
    proposal_hash:      str
    approved_by:        Optional[UUID]  = None
    approved_by_email:  Optional[str]   = None
    approved_at:        Optional[str]   = None
    approval_notes:     Optional[str]   = None
    approval_hash:      Optional[str]   = None
    execution_ref:      Optional[str]   = None
    executed_at:        Optional[str]   = None
    rejection_reason:   Optional[str]   = None
    created_at:         str

    class Config:
        from_attributes = True

    @classmethod
    def from_orm_safe(cls, p: ExecutionProposal) -> "ProposalResponse":
        return cls(
            id                = p.id,
            position_id       = p.position_id,
            company_id        = p.company_id,
            branch_id         = p.branch_id,
            status            = p.status,
            proposed_by       = p.proposed_by,
            proposed_by_email = p.proposed_by_email,
            proposed_at       = p.proposed_at.isoformat() if p.proposed_at else "",
            proposal_hash     = p.proposal_hash,
            approved_by       = p.approved_by,
            approved_by_email = p.approved_by_email,
            approved_at       = p.approved_at.isoformat() if p.approved_at else None,
            approval_notes    = p.approval_notes,
            approval_hash     = p.approval_hash,
            execution_ref     = p.execution_ref,
            executed_at       = p.executed_at.isoformat() if p.executed_at else None,
            rejection_reason  = p.rejection_reason,
            created_at        = p.created_at.isoformat() if p.created_at else "",
        )


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------

async def _check_permission(session: AsyncSession, user: User, codename: str) -> None:
    if user.is_superuser:
        return
    perms = await rbac_service.get_permissions_by_user(session, user.id)
    if codename not in perms:
        raise HTTPException(status_code=403, detail=f"Missing permission: {codename}")


async def _resolve_scope(session: AsyncSession, user: User) -> bool:
    if user.is_superuser:
        return True
    perms = await rbac_service.get_permissions_by_user(session, user.id)
    return "reports.view_all_branches" in perms


# ---------------------------------------------------------------------------
# Audit helper
# ---------------------------------------------------------------------------

async def _emit_proposal_audit(
    session: AsyncSession,
    user: User,
    event_type: str,
    description: str,
    proposal_id: str,
    payload: dict,
    request: Request | None = None,
) -> None:
    """Non-fatal audit emission for proposal state transitions."""
    try:
        q = (
            sa_select(AuditEvent.event_hash)
            .where(AuditEvent.company_id == user.company_id)
            .order_by(AuditEvent.created_at.desc())
            .limit(1)
        )
        result = await session.execute(q)
        prev_hash = result.scalar_one_or_none() or GENESIS_HASH

        request_id = ip_address = None
        if request:
            request_id = request.headers.get("X-Request-Id")
            ip_address = request.client.host if request.client else None

        actor_role = None
        try:
            roles = await rbac_service.get_user_roles(session, user.id) if hasattr(rbac_service, "get_user_roles") else []
            if roles:
                actor_role = sorted(roles, key=lambda r: getattr(r, "hierarchy_level", 99))[0].name
        except Exception:
            pass

        event = build_audit_event(
            event_type      = event_type,
            description     = description,
            payload         = payload,
            prev_event_hash = prev_hash,
            company_id      = user.company_id,
            branch_id       = user.branch_id,
            actor_id        = user.id,
            actor_email     = user.email,
            actor_role      = actor_role,
            entity_type     = "proposal",
            entity_id       = proposal_id,
            request_id      = request_id,
            ip_address      = ip_address,
        )
        session.add(event)
        await session.commit()
    except Exception:
        logger.warning("Failed to emit audit event for proposal %s", proposal_id, exc_info=True)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("", response_model=ProposalResponse, status_code=201)
async def propose_execution(
    data:         ProposeExecutionRequest,
    request:      Request,
    session:      AsyncSession = Depends(get_async_session),
    current_user: User         = Depends(get_current_user),
):
    """
    Maker creates an execution proposal for a READY_TO_EXECUTE position.
    Requires: trades.edit
    """
    await _check_permission(session, current_user, "trades.edit")
    try:
        proposal = await ep_service.propose_execution(
            session,
            user               = current_user,
            position_id        = data.position_id,
            execution_ref      = data.execution_ref,
            hedge_amount       = data.hedge_amount,
            hedge_rate         = data.hedge_rate,
            run_id             = data.run_id,
            policy_revision_id = data.policy_revision_id,
            notes              = data.notes,
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    await _emit_proposal_audit(
        session, current_user,
        event_type  = "LIFECYCLE",
        description = f"Execution proposal PROPOSED for position {data.position_id}",
        proposal_id = str(proposal.id),
        payload     = {
            "status":        "PROPOSED",
            "execution_ref": data.execution_ref,
            "position_id":   str(data.position_id),
            "proposal_hash": proposal.proposal_hash,
        },
        request = request,
    )
    return ProposalResponse.from_orm_safe(proposal)


@router.get("/pending", response_model=list[ProposalResponse])
async def list_pending_proposals(
    session:      AsyncSession = Depends(get_async_session),
    current_user: User         = Depends(get_current_user),
):
    """
    Checker dashboard: list all PROPOSED (awaiting approval) proposals.
    Requires: trades.execute
    """
    await _check_permission(session, current_user, "trades.execute")
    all_branches = await _resolve_scope(session, current_user)
    proposals = await ep_service.list_pending_proposals(
        session, current_user.company_id, current_user.branch_id, all_branches
    )
    return [ProposalResponse.from_orm_safe(p) for p in proposals]


@router.get("/position/{position_id}", response_model=list[ProposalResponse])
async def list_proposals_for_position(
    position_id:  UUID,
    session:      AsyncSession = Depends(get_async_session),
    current_user: User         = Depends(get_current_user),
):
    """Full proposal history for a position (all statuses). Requires: trades.view"""
    await _check_permission(session, current_user, "trades.view")
    proposals = await ep_service.list_proposals_for_position(
        session, position_id, current_user.company_id
    )
    return [ProposalResponse.from_orm_safe(p) for p in proposals]


@router.get("/{proposal_id}", response_model=ProposalResponse)
async def get_proposal(
    proposal_id:  UUID,
    session:      AsyncSession = Depends(get_async_session),
    current_user: User         = Depends(get_current_user),
):
    """Single proposal detail. Requires: trades.view"""
    await _check_permission(session, current_user, "trades.view")
    from app.services.execution_proposal_service import _get_proposal
    try:
        proposal = await _get_proposal(session, proposal_id, current_user.company_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return ProposalResponse.from_orm_safe(proposal)


@router.patch("/{proposal_id}/approve", response_model=ProposalResponse)
async def approve_proposal(
    proposal_id:  UUID,
    data:         ApproveProposalRequest,
    request:      Request,
    session:      AsyncSession = Depends(get_async_session),
    current_user: User         = Depends(get_current_user),
):
    """
    Checker approves a PROPOSED execution proposal -> APPROVED.
    Enforces SoD: approver must be a different actor than the proposer.
    Requires: trades.execute
    """
    await _check_permission(session, current_user, "trades.execute")
    try:
        proposal = await ep_service.approve_proposal(
            session,
            user           = current_user,
            proposal_id    = proposal_id,
            approval_notes = data.approval_notes,
        )
    except ValueError as e:
        msg = str(e)
        if "SoD violation" in msg:
            raise HTTPException(status_code=403, detail=msg)
        raise HTTPException(status_code=409, detail=msg)

    await _emit_proposal_audit(
        session, current_user,
        event_type  = "LIFECYCLE",
        description = f"Execution proposal APPROVED by {current_user.email}",
        proposal_id = str(proposal.id),
        payload     = {
            "status":         "APPROVED",
            "approved_by":    str(current_user.id),
            "approval_hash":  proposal.approval_hash,
            "proposal_hash":  proposal.proposal_hash,
        },
        request = request,
    )
    return ProposalResponse.from_orm_safe(proposal)


@router.patch("/{proposal_id}/reject", response_model=ProposalResponse)
async def reject_proposal(
    proposal_id:  UUID,
    data:         RejectProposalRequest,
    request:      Request,
    session:      AsyncSession = Depends(get_async_session),
    current_user: User         = Depends(get_current_user),
):
    """
    Checker rejects a PROPOSED execution proposal -> REJECTED.
    Enforces SoD: same SoD rules as approve.
    Requires: trades.execute
    """
    await _check_permission(session, current_user, "trades.execute")
    try:
        proposal = await ep_service.reject_proposal(
            session,
            user        = current_user,
            proposal_id = proposal_id,
            reason      = data.reason,
        )
    except ValueError as e:
        msg = str(e)
        if "SoD violation" in msg:
            raise HTTPException(status_code=403, detail=msg)
        raise HTTPException(status_code=409, detail=msg)

    await _emit_proposal_audit(
        session, current_user,
        event_type  = "REJECTION",
        description = f"Execution proposal REJECTED: {data.reason[:80]}",
        proposal_id = str(proposal.id),
        payload     = {
            "status":           "REJECTED",
            "rejection_reason": data.reason,
        },
        request = request,
    )
    return ProposalResponse.from_orm_safe(proposal)


@router.patch("/{proposal_id}/withdraw", response_model=ProposalResponse)
async def withdraw_proposal(
    proposal_id:  UUID,
    data:         WithdrawProposalRequest,
    request:      Request,
    session:      AsyncSession = Depends(get_async_session),
    current_user: User         = Depends(get_current_user),
):
    """
    Maker withdraws their own PROPOSED or APPROVED proposal -> WITHDRAWN.
    Only the original proposer may withdraw.
    Requires: trades.edit
    """
    await _check_permission(session, current_user, "trades.edit")
    try:
        proposal = await ep_service.withdraw_proposal(
            session,
            user        = current_user,
            proposal_id = proposal_id,
            reason      = data.reason,
        )
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))

    await _emit_proposal_audit(
        session, current_user,
        event_type  = "LIFECYCLE",
        description = f"Execution proposal WITHDRAWN by {current_user.email}",
        proposal_id = str(proposal.id),
        payload     = {
            "status":           "WITHDRAWN",
            "withdrawal_reason": data.reason,
        },
        request = request,
    )
    return ProposalResponse.from_orm_safe(proposal)


@router.post("/{proposal_id}/execute", response_model=ProposalResponse)
async def execute_approved_proposal(
    proposal_id:  UUID,
    request:      Request,
    session:      AsyncSession = Depends(get_async_session),
    current_user: User         = Depends(get_current_user),
):
    """
    Finalise an APPROVED proposal -> EXECUTED. Transitions position -> HEDGED.
    This is the ONLY pathway to HEDGED (enforced at API + service layer).
    Requires: trades.execute
    """
    await _check_permission(session, current_user, "trades.execute")
    try:
        proposal, updated_pos = await ep_service.execute_approved_proposal(
            session,
            user        = current_user,
            proposal_id = proposal_id,
        )
    except ValueError as e:
        msg = str(e)
        if "Illegal" in msg or "terminal" in msg.lower():
            raise HTTPException(status_code=409, detail=msg)
        raise HTTPException(status_code=422, detail=msg)

    await _emit_proposal_audit(
        session, current_user,
        event_type  = "EXECUTION",
        description = (
            f"Execution proposal EXECUTED -> position {updated_pos.record_id} HEDGED "
            f"(ref: {proposal.execution_ref})"
        ),
        proposal_id = str(proposal.id),
        payload     = {
            "status":          "EXECUTED",
            "execution_ref":   proposal.execution_ref,
            "position_id":     str(proposal.position_id),
            "proposal_hash":   proposal.proposal_hash,
            "approval_hash":   proposal.approval_hash,
            "executed_at":     proposal.executed_at.isoformat() if proposal.executed_at else None,
        },
        request = request,
    )
    return ProposalResponse.from_orm_safe(proposal)
