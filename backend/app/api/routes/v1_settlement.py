"""Settlement tracking routes."""
from __future__ import annotations
import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_async_session
from app.core.dependencies import get_current_user
from app.deps.plan_tier import require_plan
from app.models.user import User
from app.schemas_v1.settlement import SettlementConfirmRequest, SettlementEventRead
from app.services import settlement_service
from app.services.audit_emit import emit_audit

router = APIRouter(prefix="/v1/settlement", tags=["v1-settlement"])

_PLAN_DEPS = [require_plan("professional", "enterprise")]


@router.get("/pending", dependencies=_PLAN_DEPS)
async def list_pending_settlements(
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    return await settlement_service.list_pending_settlements(
        session, current_user.company.id
    )


@router.post(
    "/confirm/{ledger_entry_id}",
    response_model=SettlementEventRead,
    dependencies=_PLAN_DEPS,
)
async def confirm_settlement(
    ledger_entry_id: uuid.UUID,
    body: SettlementConfirmRequest,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """
    Confirm settlement. Creates SettlementEvent (CONFIRMED) and
    JournalEntry (DRAFT) for P&L variance — if GL mapping configured.
    JournalEntry still requires separate 4-eyes approval before posting.
    """
    try:
        se, draft_je = await settlement_service.confirm_settlement(
            session,
            ledger_entry_id=ledger_entry_id,
            actual_rate=body.actual_rate,
            settlement_ref=body.settlement_ref,
            hedge_rate=body.hedge_rate,
            hedge_notional=body.hedge_notional,
            currency=body.currency,
            standard=body.standard,
            user=current_user,
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    await session.commit()
    await emit_audit(
        session=session, user=current_user,
        event_type="SYSTEM",
        description=f"Settlement confirmed for ledger entry {ledger_entry_id}",
        entity_type="settlement_event", entity_id=str(se.id),
        payload={
            "actual_rate": str(body.actual_rate),
            "settlement_ref": body.settlement_ref,
            "draft_je_created": draft_je is not None,
        },
    )
    return se
