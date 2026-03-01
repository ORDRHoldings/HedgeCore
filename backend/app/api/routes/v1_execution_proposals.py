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



import hashlib

import json

import logging

from datetime import datetime, timezone

from uuid import UUID

from typing import Optional



from fastapi import APIRouter, Depends, HTTPException, Query, Request

from pydantic import BaseModel, ConfigDict, Field

from sqlalchemy.ext.asyncio import AsyncSession



from app.core.db import get_async_session

from app.core.security import get_current_user, get_mfa_verified

from app.models.audit_event import GENESIS_HASH, AuditEvent, build_audit_event

from app.models.execution_proposal import ExecutionProposal

from app.models.user import User

from app.models.user_mfa import UserMFA

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

    risk_decision_hash: Optional[str]   = Field(default=None, max_length=64)

    risk_verdict:       Optional[str]   = Field(default=None, max_length=32)





class ApproveProposalRequest(BaseModel):

    approval_notes: Optional[str] = Field(default=None, max_length=1024)





class RejectProposalRequest(BaseModel):

    reason: str = Field(..., min_length=1, max_length=512)





class WithdrawProposalRequest(BaseModel):

    reason: Optional[str] = Field(default=None, max_length=512)




class SecondApproveRequest(BaseModel):

    notes: Optional[str] = Field(default=None, max_length=1024)





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

    # L-12 dual-key fields
    second_approver_required: bool             = False

    second_approver_id:       Optional[UUID]   = None

    second_approver_email:    Optional[str]    = None

    second_approved_at:       Optional[str]    = None

    second_approval_notes:    Optional[str]    = None

    second_approval_hash:     Optional[str]    = None

    risk_decision_hash:       Optional[str]    = None

    risk_verdict:             Optional[str]    = None

    actual_fill_rate:         Optional[float]  = None

    actual_fill_notional:     Optional[float]  = None

    slippage_bps:             Optional[float]  = None

    fill_timestamp:           Optional[str]    = None

    fill_hash:                Optional[str]    = None



    model_config = ConfigDict(from_attributes=True)



    @classmethod

    def from_orm_safe(cls, p: ExecutionProposal) -> "ProposalResponse":

        return cls(

            id                       = p.id,

            position_id              = p.position_id,

            company_id               = p.company_id,

            branch_id                = p.branch_id,

            status                   = p.status,

            proposed_by              = p.proposed_by,

            proposed_by_email        = p.proposed_by_email,

            proposed_at              = p.proposed_at.isoformat() if p.proposed_at else "",

            proposal_hash            = p.proposal_hash,

            approved_by              = p.approved_by,

            approved_by_email        = p.approved_by_email,

            approved_at              = p.approved_at.isoformat() if p.approved_at else None,

            approval_notes           = p.approval_notes,

            approval_hash            = p.approval_hash,

            execution_ref            = p.execution_ref,

            executed_at              = p.executed_at.isoformat() if p.executed_at else None,

            rejection_reason         = p.rejection_reason,

            created_at               = p.created_at.isoformat() if p.created_at else "",

            second_approver_required = getattr(p, "second_approver_required", False) or False,

            second_approver_id       = getattr(p, "second_approver_id", None),

            second_approver_email    = getattr(p, "second_approver_email", None),

            second_approved_at       = (
                p.second_approved_at.isoformat()
                if getattr(p, "second_approved_at", None) else None
            ),

            second_approval_notes    = getattr(p, "second_approval_notes", None),

            second_approval_hash     = getattr(p, "second_approval_hash", None),

            risk_decision_hash       = getattr(p, "risk_decision_hash", None),

            risk_verdict             = getattr(p, "risk_verdict", None),

            actual_fill_rate         = getattr(p, "actual_fill_rate", None),

            actual_fill_notional     = getattr(p, "actual_fill_notional", None),

            slippage_bps             = getattr(p, "slippage_bps", None),

            fill_timestamp           = getattr(p, "fill_timestamp", None),

            fill_hash                = getattr(p, "fill_hash", None),

        )





# ---------------------------------------------------------------------------

# Auth helpers

# ---------------------------------------------------------------------------



async def _check_mfa_gate(session: AsyncSession, user: User, mfa_verified: bool) -> None:

    """

    L-11: If the user has MFA enabled, the current token must have mfa_verified=True.

    Raises 403 with detail 'MFA_REQUIRED' if gate is not satisfied.

    """

    from sqlalchemy import select as _sa_select

    result = await session.execute(

        _sa_select(UserMFA).where(UserMFA.user_id == user.id)

    )

    mfa_row = result.scalars().first()

    if mfa_row and mfa_row.is_enabled and not mfa_verified:

        raise HTTPException(

            status_code=403,

            detail={

                "detail": "MFA_REQUIRED",

                "message": (

                    "Multi-factor authentication required for this action. "

                    "Please verify your TOTP code at POST /v1/mfa/verify."

                ),

            },

        )




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

        prev_hash = result.scalars().first() or GENESIS_HASH



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

    try:

        await _check_permission(session, current_user, "trades.edit")

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

            risk_decision_hash = data.risk_decision_hash,

            risk_verdict       = data.risk_verdict,

        )

    except HTTPException:

        raise

    except ValueError as e:

        raise HTTPException(status_code=422, detail=str(e))

    except Exception as e:

        logger.error("propose_execution unhandled exception", exc_info=True)

        raise HTTPException(status_code=500, detail="Internal server error")

    # L-12: check dual-key threshold against active policy (non-fatal)
    try:

        from app.services import policy_service as _pol_svc

        from app.services import policy_revision_service as _pr_svc

        from app.schemas_v1.policy import PolicyConfig as _PolicyConfig

        _instance = await _pol_svc.get_active_instance(session, current_user)

        if _instance is not None:

            _rev = await _pr_svc.get_latest_revision(session, _instance.id)

            if _rev is not None and _rev.canonical_policy:

                _pol_cfg = _PolicyConfig(**_rev.canonical_policy)

                if (

                    _pol_cfg.dual_key_required

                    and data.hedge_amount is not None

                    and data.hedge_rate is not None

                ):

                    notional = data.hedge_amount * data.hedge_rate

                    if notional >= _pol_cfg.dual_key_threshold_usd:

                        proposal.second_approver_required = True

                        await session.commit()

    except Exception:

        logger.debug("dual-key threshold check failed (non-fatal)", exc_info=True)



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

    mfa_verified: bool         = Depends(get_mfa_verified),

):

    """

    Checker approves a PROPOSED execution proposal -> APPROVED.

    Enforces SoD: approver must be a different actor than the proposer.

    Requires: trades.execute

    """

    await _check_permission(session, current_user, "trades.execute")

    await _check_mfa_gate(session, current_user, mfa_verified)

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

    mfa_verified: bool         = Depends(get_mfa_verified),

):

    """

    Finalise an APPROVED proposal -> EXECUTED. Transitions position -> HEDGED.

    This is the ONLY pathway to HEDGED (enforced at API + service layer).

    Requires: trades.execute

    """

    await _check_permission(session, current_user, "trades.execute")

    await _check_mfa_gate(session, current_user, mfa_verified)

    # L-12: dual-key guard -- second approver must be set if required
    from app.services.execution_proposal_service import _get_proposal as _gp
    try:
        _proposal_check = await _gp(session, proposal_id, current_user.company_id)
        if (
            getattr(_proposal_check, "second_approver_required", False)
            and not getattr(_proposal_check, "second_approver_id", None)
        ):
            raise HTTPException(
                status_code=422,
                detail=(
                    "SECOND_APPROVAL_REQUIRED: This proposal requires a second approver "
                    "due to its notional size. See PATCH /v1/proposals/{id}/second-approve."
                ),
            )
    except HTTPException:
        raise
    except ValueError:
        pass  # will surface as 404/422 in ep_service below

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


@router.patch("/{proposal_id}/second-approve", response_model=ProposalResponse)

async def second_approve_proposal(

    proposal_id:  UUID,

    data:         SecondApproveRequest,

    request:      Request,

    session:      AsyncSession = Depends(get_async_session),

    current_user: User         = Depends(get_current_user),

    mfa_verified: bool         = Depends(get_mfa_verified),

):

    """

    L-12: Second approver confirms a proposal that requires dual-key approval.

    Proposal must already be in APPROVED status (first approval complete).

    Enforces full SoD: second approver cannot be the maker or first approver.

    Requires: trades.execute

    """

    await _check_permission(session, current_user, "trades.execute")

    await _check_mfa_gate(session, current_user, mfa_verified)

    from app.services.execution_proposal_service import _get_proposal

    try:

        proposal = await _get_proposal(session, proposal_id, current_user.company_id)

    except ValueError as e:

        raise HTTPException(status_code=404, detail=str(e))

    if proposal.status != "APPROVED":

        raise HTTPException(

            status_code=409,

            detail=f"Proposal must be in APPROVED status for second approval. Current: {proposal.status}",

        )

    if not getattr(proposal, "second_approver_required", False):

        raise HTTPException(

            status_code=400,

            detail="Second approval not required for this proposal",

        )

    if getattr(proposal, "second_approver_id", None):

        raise HTTPException(

            status_code=409,

            detail="Already has second approval",

        )

    # SoD: second approver cannot be the maker or the first approver

    if current_user.id == proposal.proposed_by:

        raise HTTPException(

            status_code=403,

            detail="SoD violation: second approver cannot be the original proposer",

        )

    if proposal.approved_by and current_user.id == proposal.approved_by:

        raise HTTPException(

            status_code=403,

            detail="SoD violation: second approver cannot be the same as the first approver",

        )

    now = datetime.now(timezone.utc)

    proposal.second_approver_id    = current_user.id

    proposal.second_approver_email = current_user.email

    proposal.second_approved_at    = now

    proposal.second_approval_notes = data.notes

    # Hash chains: second approval -> approval_hash -> proposal_hash

    chain_content = {

        "second_approver_id": str(current_user.id),

        "second_approved_at": now.isoformat(),

        "approval_hash":      proposal.approval_hash,

    }

    proposal.second_approval_hash = hashlib.sha256(

        json.dumps(chain_content, sort_keys=True, separators=(",", ":")).encode("utf-8")

    ).hexdigest()

    await session.commit()

    await session.refresh(proposal)

    await _emit_proposal_audit(

        session, current_user,

        event_type  = "LIFECYCLE",

        description = f"Execution proposal SECOND APPROVED by {current_user.email}",

        proposal_id = str(proposal.id),

        payload     = {

            "status":               "APPROVED",

            "second_approver_id":   str(current_user.id),

            "second_approval_hash": proposal.second_approval_hash,

        },

        request = request,

    )

    return ProposalResponse.from_orm_safe(proposal)


# ---------------------------------------------------------------------------

# POST /v1/proposals/batch — atomic multi-position proposal submission

# ---------------------------------------------------------------------------



class BatchProposeRequest(BaseModel):

    proposals: list[ProposeExecutionRequest] = Field(..., min_length=1, max_length=50)



class BatchProposeResponse(BaseModel):

    created: list[ProposalResponse]

    failed: list[dict]  # {position_id, error}



@router.post("/batch", response_model=BatchProposeResponse, status_code=201)

async def batch_propose_execution(

    data:         BatchProposeRequest,

    request:      Request,

    session:      AsyncSession = Depends(get_async_session),

    current_user: User         = Depends(get_current_user),

):

    """

    Atomic batch proposal submission. Creates proposals for multiple positions

    in a single request. If any proposal fails, succeeded proposals are still

    committed (partial success is reported in the response).

    Requires: trades.edit

    """

    await _check_permission(session, current_user, "trades.edit")

    created: list[ProposalResponse] = []

    failed: list[dict] = []

    for item in data.proposals:

        try:

            proposal = await ep_service.propose_execution(

                session,

                user               = current_user,

                position_id        = item.position_id,

                execution_ref      = item.execution_ref,

                hedge_amount       = item.hedge_amount,

                hedge_rate         = item.hedge_rate,

                run_id             = item.run_id,

                policy_revision_id = item.policy_revision_id,

                notes              = item.notes,

                risk_decision_hash = item.risk_decision_hash,

                risk_verdict       = item.risk_verdict,

            )

            created.append(ProposalResponse.from_orm_safe(proposal))

            await _emit_proposal_audit(

                session, current_user,

                event_type  = "LIFECYCLE",

                description = f"Batch execution proposal PROPOSED for position {item.position_id}",

                proposal_id = str(proposal.id),

                payload     = {

                    "status":        "PROPOSED",

                    "execution_ref": item.execution_ref,

                    "position_id":   str(item.position_id),

                    "proposal_hash": proposal.proposal_hash,

                    "batch":         True,

                },

                request = request,

            )

        except Exception as e:

            logger.warning("Batch propose failed for position %s: %s", item.position_id, e)

            failed.append({"position_id": str(item.position_id), "error": str(e)})

    return BatchProposeResponse(created=created, failed=failed)


# ---------------------------------------------------------------------------

# PATCH /v1/proposals/{id}/fill — record actual fill data

# ---------------------------------------------------------------------------



class FillReportRequest(BaseModel):

    fill_price:       float = Field(..., gt=0)

    fill_notional:    float = Field(..., gt=0)

    fill_currency:    str   = Field(..., max_length=8)

    fill_timestamp:   str   = Field(..., description="ISO 8601 datetime")

    slippage_bps:     Optional[float] = None

    submission_mode:  str   = Field(default="MANUAL", max_length=32)

    counterparty:     Optional[str] = Field(default=None, max_length=128)

    confirmation_ref: Optional[str] = Field(default=None, max_length=128)



@router.patch("/{proposal_id}/fill", response_model=ProposalResponse)

async def report_fill(

    proposal_id:  UUID,

    data:         FillReportRequest,

    request:      Request,

    session:      AsyncSession = Depends(get_async_session),

    current_user: User         = Depends(get_current_user),

):

    """

    Records actual fill data against an APPROVED or EXECUTED proposal.

    Enriches the proposal with execution quality data (fill rate, slippage).

    Emits a FILL audit event into the hash chain.

    Requires: trades.execute

    """

    await _check_permission(session, current_user, "trades.execute")



    result = await session.execute(

        sa_select(ExecutionProposal).where(

            ExecutionProposal.id == proposal_id,

            ExecutionProposal.company_id == current_user.company_id,

        )

    )

    proposal = result.scalars().first()

    if not proposal:

        raise HTTPException(status_code=404, detail="Proposal not found")

    if proposal.status not in ("APPROVED", "EXECUTED"):

        raise HTTPException(

            status_code=422,

            detail=f"Fill can only be reported on APPROVED or EXECUTED proposals (current: {proposal.status})",

        )



    import hashlib, json as _json

    def _canon(obj: dict) -> str:

        return _json.dumps(obj, sort_keys=True, separators=(",", ":"), default=str)



    # Compute slippage if not provided

    proposed_rate = None

    if proposal.proposal_payload:

        proposed_rate = proposal.proposal_payload.get("hedge_rate")

    if data.slippage_bps is None and proposed_rate and proposed_rate > 0:

        slippage_bps = abs(data.fill_price - proposed_rate) / proposed_rate * 10000

    else:

        slippage_bps = data.slippage_bps



    fill_payload = {

        "fill_price":       data.fill_price,

        "fill_notional":    data.fill_notional,

        "fill_currency":    data.fill_currency,

        "fill_timestamp":   data.fill_timestamp,

        "slippage_bps":     slippage_bps,

        "submission_mode":  data.submission_mode,

        "counterparty":     data.counterparty,

        "confirmation_ref": data.confirmation_ref,

        "reported_by":      str(current_user.id),

        "proposal_hash":    proposal.proposal_hash,

    }

    fill_hash = hashlib.sha256(_canon(fill_payload).encode()).hexdigest()



    # Store fill data

    proposal.actual_fill_rate     = data.fill_price

    proposal.actual_fill_notional = data.fill_notional

    proposal.slippage_bps         = slippage_bps

    proposal.fill_timestamp       = data.fill_timestamp

    proposal.fill_hash            = fill_hash

    await session.commit()

    await session.refresh(proposal)



    await _emit_proposal_audit(

        session, current_user,

        event_type  = "LIFECYCLE",

        description = f"Fill reported: {data.fill_currency} {data.fill_price:.6f} (slippage {slippage_bps:.1f} bps)",

        proposal_id = str(proposal.id),

        payload     = fill_payload,

        request     = request,

    )



    return ProposalResponse.from_orm_safe(proposal)
