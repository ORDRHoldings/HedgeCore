# backend/app/api/routes/v1_cash_positions.py
"""v1 cash positions — manual entry, pull, consolidated views."""
import uuid
from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.dependencies import get_current_user, get_session
from app.models.cash import BankAccount, CashBalance, LegalEntity, ReconciliationStatus
from app.models.user import User
from app.schemas_v1.cash import (
    CashBalanceCreate, BulkBalanceCreate, ReconcileRequest, CashBalanceResponse,
    ConsolidatedPositionResponse, EntityPositionResponse,
)
from app.services.cash_balance_service import enter_balance, bulk_enter_balances, reconcile_balance

router = APIRouter(prefix="/v1/cash", tags=["cash-positions"])


def _require_professional(user: User) -> None:
    if getattr(user, "plan_tier", "starter") not in ("professional", "enterprise"):
        raise HTTPException(status_code=403, detail="Professional plan required")


def _require_write(user: User) -> None:
    _require_professional(user)
    if getattr(user, "role", "") not in ("cfo", "head_of_risk", "admin"):
        raise HTTPException(status_code=403, detail="Insufficient role")


@router.get("/positions/consolidated", response_model=ConsolidatedPositionResponse)
async def consolidated_position(
    as_of_date: date | None = None,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_professional(current_user)
    target_date = as_of_date or date.today()
    result = await get_consolidated_position(db, company_id=current_user.company_id, as_of_date=target_date)
    return ConsolidatedPositionResponse(as_of_date=target_date, positions=result)


@router.get("/positions/by-entity", response_model=EntityPositionResponse)
async def entity_position(
    as_of_date: date | None = None,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_professional(current_user)
    target_date = as_of_date or date.today()
    result = await get_entity_position(db, company_id=current_user.company_id, as_of_date=target_date)
    return EntityPositionResponse(as_of_date=target_date, positions=result)


@router.get("/positions/by-account")
async def account_position(
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_professional(current_user)
    return await get_account_position(db, company_id=current_user.company_id)


@router.post("/balances", response_model=CashBalanceResponse, status_code=201)
async def enter_balance_route(
    payload: CashBalanceCreate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_write(current_user)
    balance = await enter_balance(db, account_id=payload.account_id,
                                   company_id=current_user.company_id,
                                   payload=payload.model_dump(),
                                   created_by=current_user.id)
    await db.commit()
    return balance


@router.post("/balances/bulk")
async def bulk_balances_route(
    payload: BulkBalanceCreate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_write(current_user)
    rows = [r.model_dump() for r in payload.rows]
    results = await bulk_enter_balances(db, company_id=current_user.company_id,
                                         rows=rows, created_by=current_user.id)
    await db.commit()
    return {"created": len(results)}


@router.post("/balances/{balance_id}/reconcile", response_model=CashBalanceResponse)
async def reconcile_balance_route(
    balance_id: uuid.UUID,
    payload: ReconcileRequest,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_write(current_user)
    balance = await reconcile_balance(
        db,
        balance_id=balance_id,
        company_id=current_user.company_id,
        reconciler_id=current_user.id,
        new_status=ReconciliationStatus(payload.status),
        note=payload.note,
    )
    await db.commit()
    return balance


@router.post("/pull/{connection_id}")
async def pull_balances_route(
    connection_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_write(current_user)
    # Delegates to bank_connection_service.pull_balances (Phase 2a stub — live adapters in 2e)
    return {"message": "Pull triggered", "connection_id": str(connection_id)}


# ── Position query helpers (called by routes above) ────────────────────

async def get_consolidated_position(db, *, company_id, as_of_date):
    from decimal import Decimal
    result = await db.execute(
        select(
            CashBalance.currency,
            func.sum(CashBalance.ledger_balance).label("ledger_balance"),
            func.sum(CashBalance.available_balance).label("available_balance"),
            func.sum(CashBalance.in_transit_credit - CashBalance.in_transit_debit).label("in_transit_net"),
            func.count(CashBalance.account_id).label("account_count"),
        )
        .join(BankAccount, CashBalance.account_id == BankAccount.id)
        .join(LegalEntity, BankAccount.entity_id == LegalEntity.id)
        .where(LegalEntity.company_id == company_id, CashBalance.balance_date == as_of_date)
        .group_by(CashBalance.currency)
    )
    rows = result.all()
    return [
        {
            "currency": r.currency,
            "ledger_balance": r.ledger_balance or Decimal("0"),
            "available_balance": r.available_balance or Decimal("0"),
            "in_transit_net": r.in_transit_net or Decimal("0"),
            "account_count": r.account_count,
        }
        for r in rows
    ]


async def get_entity_position(db, *, company_id, as_of_date):
    from decimal import Decimal
    result = await db.execute(
        select(
            LegalEntity.id.label("entity_id"),
            LegalEntity.short_name.label("entity_name"),
            CashBalance.currency,
            func.sum(CashBalance.ledger_balance).label("ledger_balance"),
            func.sum(CashBalance.available_balance).label("available_balance"),
        )
        .join(BankAccount, CashBalance.account_id == BankAccount.id)
        .join(LegalEntity, BankAccount.entity_id == LegalEntity.id)
        .where(LegalEntity.company_id == company_id, CashBalance.balance_date == as_of_date)
        .group_by(LegalEntity.id, LegalEntity.short_name, CashBalance.currency)
    )
    rows = result.all()
    return [
        {
            "entity_id": r.entity_id,
            "entity_name": r.entity_name,
            "currency": r.currency,
            "ledger_balance": r.ledger_balance or Decimal("0"),
            "available_balance": r.available_balance or Decimal("0"),
        }
        for r in rows
    ]


async def get_account_position(db, *, company_id):
    from decimal import Decimal
    result = await db.execute(
        select(BankAccount, CashBalance)
        .outerjoin(
            CashBalance,
            (CashBalance.account_id == BankAccount.id)
        )
        .join(LegalEntity, BankAccount.entity_id == LegalEntity.id)
        .where(LegalEntity.company_id == company_id)
        .order_by(BankAccount.id, CashBalance.balance_date.desc())
    )
    return [
        {
            "account_id": str(row.BankAccount.id),
            "nickname": row.BankAccount.nickname,
            "currency": row.BankAccount.currency,
            "ledger_balance": str(row.CashBalance.ledger_balance) if row.CashBalance else None,
            "available_balance": str(row.CashBalance.available_balance) if row.CashBalance else None,
            "balance_date": str(row.CashBalance.balance_date) if row.CashBalance else None,
            "status": row.BankAccount.status,
        }
        for row in result.all()
    ]
