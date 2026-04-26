# backend/app/api/routes/v1_cash_audit.py
"""v1 cash audit — chain verification + event log (read-only)."""
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, get_session
from app.models.cash import CashAuditEvent
from app.models.user import User

router = APIRouter(prefix="/v1/cash/audit", tags=["cash-audit"])


def _require_professional(user: User) -> None:
    if getattr(user, "plan_tier", "starter") not in ("professional", "enterprise"):
        raise HTTPException(status_code=403, detail="Professional plan required")


@router.get("/chain-verify")
async def chain_verify(
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Verify SHA-256 chain integrity for this tenant."""
    _require_professional(current_user)
    from app.services.cash_audit_service import verify_chain as _verify_chain
    return await _verify_chain(db, company_id=current_user.company_id)


@router.get("/events")
async def list_audit_events(
    account_id: uuid.UUID | None = None,
    event_type: str | None = None,
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_professional(current_user)
    q = select(CashAuditEvent).where(CashAuditEvent.company_id == current_user.company_id)
    if account_id:
        q = q.where(CashAuditEvent.account_id == account_id)
    if event_type:
        q = q.where(CashAuditEvent.event_type == event_type)
    q = q.order_by(CashAuditEvent.chain_seq.desc()).limit(limit).offset(offset)
    result = await db.execute(q)
    events = result.scalars().all()
    return [
        {
            "id": str(e.id),
            "event_type": e.event_type,
            "account_id": str(e.account_id) if e.account_id else None,
            "chain_seq": e.chain_seq,
            "performed_by": str(e.performed_by),
            "created_at": e.created_at.isoformat(),
        }
        for e in events
    ]
