# backend/app/api/routes/v1_cash_netting.py
"""v1 intercompany netting — obligations, proposals, approval, execution, savings."""
import uuid
from datetime import date
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, get_session
from app.models.user import User
from app.schemas_v1.cash import (
    ObligationCreate, ObligationResponse,
    NettingProposalResponse, NettingSavingsSummary,
)
from app.services.netting_service import (
    create_obligation, list_obligations, cancel_obligation,
    generate_proposals, approve_proposal, reject_proposal,
    execute_proposal, get_savings_summary,
)

router = APIRouter(prefix="/v1/cash/netting", tags=["cash-netting"])


def _require_professional(user: User) -> None:
    if getattr(user, "plan_tier", "starter") not in ("professional", "enterprise"):
        raise HTTPException(status_code=403, detail="Professional plan required")


def _require_write(user: User) -> None:
    _require_professional(user)
    if getattr(user, "role", "") not in ("cfo", "head_of_risk", "admin"):
        raise HTTPException(status_code=403, detail="Insufficient role")


# ── Module-level helpers for testability (patchable by route tests) ──

async def list_obligations_helper(db, *, company_id, status_filter):
    return await list_obligations(db, company_id=company_id, status_filter=status_filter)


async def create_obligation_helper(db, *, company_id, payload, created_by):
    return await create_obligation(db, company_id=company_id, payload=payload, created_by=created_by)


async def generate_proposals_helper(db, *, company_id, created_by):
    return await generate_proposals(db, company_id=company_id, created_by=created_by)


async def get_savings_helper(db, *, company_id):
    return await get_savings_summary(db, company_id=company_id)


# ── Routes ──

@router.get("/obligations", response_model=list[ObligationResponse])
async def get_obligations(
    status: str | None = Query(default=None),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_professional(current_user)
    return await list_obligations_helper(db, company_id=current_user.company_id, status_filter=status)


@router.post("/obligations", response_model=ObligationResponse, status_code=201)
async def post_obligation(
    body: ObligationCreate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_write(current_user)
    if body.debtor_entity_id == body.creditor_entity_id:
        raise HTTPException(status_code=422, detail="Debtor and creditor must be different entities")
    result = await create_obligation_helper(
        db, company_id=current_user.company_id,
        payload=body.model_dump(), created_by=current_user.id,
    )
    await db.commit()
    return result


@router.delete("/obligations/{obligation_id}", status_code=204)
async def delete_obligation(
    obligation_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_write(current_user)
    await cancel_obligation(db, obligation_id=obligation_id, company_id=current_user.company_id)
    await db.commit()


@router.get("/proposals", response_model=list[NettingProposalResponse])
async def get_proposals(
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_professional(current_user)
    from app.models.cash_netting import NettingProposal
    result = await db.execute(
        select(NettingProposal)
        .where(NettingProposal.company_id == current_user.company_id)
        .order_by(NettingProposal.proposed_at.desc())
    )
    return list(result.scalars().all())


@router.post("/proposals/generate", response_model=list[NettingProposalResponse])
async def post_generate_proposals(
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_write(current_user)
    proposals = await generate_proposals_helper(
        db, company_id=current_user.company_id, created_by=current_user.id,
    )
    await db.commit()
    return proposals


@router.post("/proposals/{proposal_id}/approve", response_model=NettingProposalResponse)
async def post_approve_proposal(
    proposal_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_write(current_user)
    result = await approve_proposal(
        db, proposal_id=proposal_id,
        company_id=current_user.company_id, approved_by=current_user.id,
    )
    await db.commit()
    return result


@router.post("/proposals/{proposal_id}/execute", response_model=NettingProposalResponse)
async def post_execute_proposal(
    proposal_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_write(current_user)
    result = await execute_proposal(
        db, proposal_id=proposal_id,
        company_id=current_user.company_id, executed_by=current_user.id,
    )
    await db.commit()
    return result


@router.get("/savings", response_model=NettingSavingsSummary)
async def get_savings(
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_professional(current_user)
    return await get_savings_helper(db, company_id=current_user.company_id)
