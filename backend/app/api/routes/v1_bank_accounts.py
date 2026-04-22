# backend/app/api/routes/v1_bank_accounts.py
"""v1 bank accounts — registry + lifecycle."""
import uuid
from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, get_session
from app.models.cash import LegalEntity, BankAccount, CashBalance, CashAuditEvent
from app.models.user import User
from app.schemas_v1.cash import BankAccountCreate, BankAccountResponse, BankAccountUpdate
from app.services.bank_account_service import (
    create_account, verify_account, freeze_account, unfreeze_account, close_account,
    decrypt_account_details, _get_account, AccountNotFoundError,
)

router = APIRouter(prefix="/v1/cash/accounts", tags=["cash-accounts"])


def _require_professional(user: User) -> None:
    if getattr(user, "plan_tier", "starter") not in ("professional", "enterprise"):
        raise HTTPException(status_code=403, detail="Professional plan required")


def _is_cfo(user: User) -> bool:
    return getattr(user, "role", "") in ("cfo", "admin")


def _require_write(user: User) -> None:
    _require_professional(user)
    if getattr(user, "role", "") not in ("cfo", "head_of_risk", "admin"):
        raise HTTPException(status_code=403, detail="Insufficient role")


def _account_response(account: BankAccount, user: User) -> dict:
    # IMPORTANT: use user.company_id (tenant key), NOT account.entity_id (entity-level FK)
    details = decrypt_account_details(account, user.company_id, _is_cfo(user))
    return {**{c.key: getattr(account, c.key) for c in account.__table__.columns}, **details}


async def list_accounts(
    db: AsyncSession,
    *,
    company_id: uuid.UUID,
    entity_id: uuid.UUID | None = None,
    status: str | None = None,
) -> list[BankAccount]:
    q = (select(BankAccount)
         .join(LegalEntity, BankAccount.entity_id == LegalEntity.id)
         .where(LegalEntity.company_id == company_id))
    if entity_id:
        q = q.where(BankAccount.entity_id == entity_id)
    if status:
        q = q.where(BankAccount.status == status)
    result = await db.execute(q)
    return list(result.scalars().all())


@router.get("", response_model=list[BankAccountResponse])
async def list_accounts_route(
    entity_id: uuid.UUID | None = None,
    status: str | None = None,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_professional(current_user)
    accounts = await list_accounts(db, company_id=current_user.company_id,
                                    entity_id=entity_id, status=status)
    return [_account_response(a, current_user) for a in accounts]


@router.post("", response_model=BankAccountResponse, status_code=201)
async def create_account_route(
    payload: BankAccountCreate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_write(current_user)
    account = await create_account(db, entity_id=payload.entity_id,
                                    company_id=current_user.company_id,
                                    payload=payload.model_dump(),
                                    created_by=current_user.id)
    await db.commit()
    return _account_response(account, current_user)


@router.post("/{account_id}/verify", response_model=BankAccountResponse)
async def verify_account_route(
    account_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_write(current_user)
    try:
        account = await verify_account(db, account_id=account_id,
                                        company_id=current_user.company_id,
                                        verifier_id=current_user.id)
        await db.commit()
        return _account_response(account, current_user)
    except AccountNotFoundError:
        raise HTTPException(status_code=404, detail="Account not found")


@router.post("/{account_id}/freeze", response_model=BankAccountResponse)
async def freeze_account_route(
    account_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_write(current_user)
    try:
        account = await freeze_account(db, account_id=account_id,
                                        company_id=current_user.company_id,
                                        actor_id=current_user.id)
        await db.commit()
        return _account_response(account, current_user)
    except AccountNotFoundError:
        raise HTTPException(status_code=404, detail="Account not found")


@router.post("/{account_id}/unfreeze", response_model=BankAccountResponse)
async def unfreeze_account_route(
    account_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_write(current_user)
    try:
        account = await unfreeze_account(db, account_id=account_id,
                                          company_id=current_user.company_id,
                                          actor_id=current_user.id)
        await db.commit()
        return _account_response(account, current_user)
    except AccountNotFoundError:
        raise HTTPException(status_code=404, detail="Account not found")


@router.post("/{account_id}/close", response_model=BankAccountResponse)
async def close_account_route(
    account_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_write(current_user)
    try:
        account = await close_account(db, account_id=account_id,
                                       company_id=current_user.company_id,
                                       actor_id=current_user.id)
        await db.commit()
        return _account_response(account, current_user)
    except AccountNotFoundError:
        raise HTTPException(status_code=404, detail="Account not found")


@router.patch("/{account_id}", response_model=BankAccountResponse)
async def update_account_route(
    account_id: uuid.UUID,
    payload: BankAccountUpdate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Update non-sensitive fields: nickname, purpose, thresholds, GL codes."""
    _require_write(current_user)
    try:
        account = await _get_account(db, account_id, current_user.company_id)
        for k, v in payload.model_dump(exclude_none=True).items():
            if hasattr(account, k):
                setattr(account, k, v)
        account.version += 1
        await db.commit()
        return _account_response(account, current_user)
    except AccountNotFoundError:
        raise HTTPException(status_code=404, detail="Account not found")


@router.get("/{account_id}/balances")
async def account_balances_route(
    account_id: uuid.UUID,
    date_from: date | None = None,
    date_to: date | None = None,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Return balance history for a specific account."""
    _require_professional(current_user)
    q = select(CashBalance).where(CashBalance.account_id == account_id)
    if date_from:
        q = q.where(CashBalance.balance_date >= date_from)
    if date_to:
        q = q.where(CashBalance.balance_date <= date_to)
    q = q.order_by(CashBalance.balance_date.desc())
    result = await db.execute(q)
    return result.scalars().all()


@router.get("/{account_id}/audit")
async def account_audit_route(
    account_id: uuid.UUID,
    limit: int = 50,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Return per-account audit events in reverse chain order."""
    _require_professional(current_user)
    result = await db.execute(
        select(CashAuditEvent)
        .where(CashAuditEvent.account_id == account_id)
        .order_by(CashAuditEvent.chain_seq.desc())
        .limit(limit)
    )
    events = result.scalars().all()
    return [
        {
            "id": str(e.id),
            "event_type": e.event_type,
            "chain_seq": e.chain_seq,
            "performed_by": str(e.performed_by),
            "created_at": e.created_at.isoformat(),
        }
        for e in events
    ]
