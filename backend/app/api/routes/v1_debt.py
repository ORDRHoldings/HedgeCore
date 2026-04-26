# backend/app/api/routes/v1_debt.py
"""V1 Debt management routes."""
from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.dependencies import get_current_user
from app.models.user import User
from app.services.debt_service import (
    check_covenants,
    create_facility,
    get_debt_schedule,
    get_maturity_calendar,
    get_total_exposure,
    record_drawdown,
)

router = APIRouter(prefix="/v1/debt", tags=["debt"])


def _require_debt_read(user: User) -> None:
    if not user.is_superuser and "debt.read" not in (user.permissions or set()):
        raise HTTPException(status_code=403, detail="debt.read permission required")


def _require_debt_write(user: User) -> None:
    if not user.is_superuser and "debt.write" not in (user.permissions or set()):
        raise HTTPException(status_code=403, detail="debt.write permission required")


class CreateFacilityRequest(BaseModel):
    facility_type: str
    counterparty: str
    currency: str
    committed_amount: float
    margin_bps: int = 0
    rate_index: str = "SOFR"
    maturity_date: date
    day_count: str = "ACT365"
    payment_frequency: str = "QUARTERLY"
    repayment_type: str = "BULLET"
    legal_entity_id: uuid.UUID | None = None


class RecordDrawdownRequest(BaseModel):
    amount: float
    drawdown_date: date
    repayment_date: date | None = None
    rate_fixed_at: float | None = None


@router.post("/facilities")
async def api_create_facility(
    body: CreateFacilityRequest,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_debt_write(current_user)
    facility = await create_facility(db, tenant_id=current_user.company_id, spec=body.model_dump())
    return {"id": str(facility.id), "status": facility.status, "facility_type": facility.facility_type}


@router.get("/facilities")
async def api_list_facilities(
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_debt_read(current_user)
    return await get_maturity_calendar(db, tenant_id=current_user.company_id)


@router.get("/facilities/{facility_id}")
async def api_get_facility(
    facility_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_debt_read(current_user)
    from app.models.debt import DebtFacility
    facility = await db.get(DebtFacility, facility_id)
    if not facility or facility.tenant_id != current_user.company_id:
        raise HTTPException(status_code=404, detail="Facility not found")
    return {
        "id": str(facility.id), "counterparty": facility.counterparty,
        "facility_type": facility.facility_type, "currency": facility.currency,
        "committed_amount": float(facility.committed_amount),
        "drawn_amount": float(facility.drawn_amount or 0),
        "maturity_date": str(facility.maturity_date),
        "status": facility.status,
    }


@router.post("/facilities/{facility_id}/drawdowns")
async def api_record_drawdown(
    facility_id: uuid.UUID,
    body: RecordDrawdownRequest,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_debt_write(current_user)
    drawdown = await record_drawdown(
        db, facility_id=facility_id, tenant_id=current_user.company_id,
        amount=body.amount, drawdown_date=body.drawdown_date,
        repayment_date=body.repayment_date, rate_fixed_at=body.rate_fixed_at,
    )
    return {"id": str(drawdown.id), "amount": float(drawdown.amount), "drawdown_hash": drawdown.drawdown_hash}


@router.get("/maturity-calendar")
async def api_maturity_calendar(
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_debt_read(current_user)
    return await get_maturity_calendar(db, tenant_id=current_user.company_id)


@router.get("/facilities/{facility_id}/schedule")
async def api_debt_schedule(
    facility_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_debt_read(current_user)
    return await get_debt_schedule(db, facility_id=facility_id, tenant_id=current_user.company_id)


@router.get("/covenants")
async def api_covenants(
    facility_id: uuid.UUID = Query(...),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_debt_read(current_user)
    return await check_covenants(db, facility_id=facility_id, tenant_id=current_user.company_id)


@router.get("/exposure")
async def api_exposure(
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_debt_read(current_user)
    return await get_total_exposure(db, tenant_id=current_user.company_id)
