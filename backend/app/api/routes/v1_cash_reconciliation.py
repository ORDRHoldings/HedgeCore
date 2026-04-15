"""v1 reconciliation — run engine, summary, manual match, exception, unmatch."""
import uuid
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, get_session
from app.models.user import User
from app.schemas_v1.cash import (
    ReconciliationRunResponse, ReconciliationSummary, ManualMatchRequest,
)
from app.services.reconciliation_service import (
    run_reconciliation, get_reconciliation_summary,
    manual_match, mark_exception, unmatch,
)

router = APIRouter(prefix="/v1/cash/reconciliation", tags=["cash-reconciliation"])


def _require_professional(user: User) -> None:
    if getattr(user, "plan_tier", "starter") not in ("professional", "enterprise"):
        raise HTTPException(status_code=403, detail="Professional plan required")


def _require_write(user: User) -> None:
    _require_professional(user)
    if getattr(user, "role", "") not in ("cfo", "head_of_risk", "admin"):
        raise HTTPException(status_code=403, detail="Insufficient role")


# ── Module-level helpers for testability ──

async def run_reconciliation_helper(db, *, company_id, account_id, performed_by):
    return await run_reconciliation(db, company_id=company_id, account_id=account_id, performed_by=performed_by)


async def get_summary_helper(db, *, company_id):
    return await get_reconciliation_summary(db, company_id=company_id)


async def manual_match_helper(db, *, transaction_id, company_id, match_type, matched_id, performed_by):
    return await manual_match(db, transaction_id=transaction_id, company_id=company_id,
                               match_type=match_type, matched_id=matched_id, performed_by=performed_by)


async def mark_exception_helper(db, *, transaction_id, company_id, performed_by):
    return await mark_exception(db, transaction_id=transaction_id, company_id=company_id, performed_by=performed_by)


async def unmatch_helper(db, *, transaction_id, company_id, performed_by):
    return await unmatch(db, transaction_id=transaction_id, company_id=company_id, performed_by=performed_by)


# ── Routes ──

@router.post("/run", response_model=ReconciliationRunResponse)
async def run_reconciliation_route(
    account_id: uuid.UUID | None = Query(default=None),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_write(current_user)
    return await run_reconciliation_helper(
        db, company_id=current_user.company_id, account_id=account_id,
        performed_by=current_user.id,
    )


@router.get("/summary", response_model=ReconciliationSummary)
async def get_summary_route(
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_professional(current_user)
    return await get_summary_helper(db, company_id=current_user.company_id)


@router.post("/match")
async def manual_match_route(
    body: ManualMatchRequest,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_write(current_user)
    await manual_match_helper(
        db, transaction_id=body.transaction_id, company_id=current_user.company_id,
        match_type=body.match_type, matched_id=body.matched_id,
        performed_by=current_user.id,
    )
    await db.commit()
    return {"status": "matched"}


@router.post("/exception/{transaction_id}")
async def mark_exception_route(
    transaction_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_write(current_user)
    await mark_exception_helper(
        db, transaction_id=transaction_id, company_id=current_user.company_id,
        performed_by=current_user.id,
    )
    await db.commit()
    return {"status": "exception"}


@router.post("/unmatch/{transaction_id}")
async def unmatch_route(
    transaction_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_write(current_user)
    await unmatch_helper(
        db, transaction_id=transaction_id, company_id=current_user.company_id,
        performed_by=current_user.id,
    )
    await db.commit()
    return {"status": "unmatched"}
