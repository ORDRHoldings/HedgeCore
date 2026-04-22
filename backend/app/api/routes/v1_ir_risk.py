# backend/app/api/routes/v1_ir_risk.py
"""V1 IR Risk routes."""
from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.dependencies import get_current_user
from app.models.user import User
from app.services.ir_swap_service import (
    create_swap, get_dv01_ladder, list_swaps, mark_to_market,
    mark_to_market_all,
)
from app.services.ir_hedge_service import run_effectiveness_test

router = APIRouter(prefix="/v1/ir-risk", tags=["ir-risk"])


def _require_ir_read(user: User) -> None:
    if not user.is_superuser and "ir_risk.read" not in (user.permissions or set()):
        raise HTTPException(status_code=403, detail="ir_risk.read permission required")


def _require_ir_write(user: User) -> None:
    if not user.is_superuser and "ir_risk.write" not in (user.permissions or set()):
        raise HTTPException(status_code=403, detail="ir_risk.write permission required")


class CreateSwapRequest(BaseModel):
    instrument_type: str
    notional: float
    currency: str
    fixed_rate: float | None = None
    strike: float | None = None
    float_index: str = "SOFR"
    start_date: date
    maturity_date: date
    pay_fixed: bool = True
    day_count: str = "ACT365"
    reset_frequency: str = "QUARTERLY"
    linked_facility_id: uuid.UUID | None = None
    legal_entity_id: uuid.UUID | None = None


class EffectivenessRequest(BaseModel):
    swap_id: uuid.UUID
    facility_id: uuid.UUID | None = None
    method: str = "DOLLAR_OFFSET"


@router.post("/swaps")
async def api_create_swap(
    body: CreateSwapRequest,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_ir_write(current_user)
    swap = await create_swap(db, tenant_id=current_user.company_id, spec=body.model_dump())
    return {"id": str(swap.id), "instrument_type": swap.instrument_type, "status": swap.status}


@router.get("/swaps")
async def api_list_swaps(
    status: str | None = Query(None),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_ir_read(current_user)
    swaps = await list_swaps(db, tenant_id=current_user.company_id, status=status)
    return [{"id": str(s.id), "instrument_type": s.instrument_type, "notional": float(s.notional),
             "last_npv": float(s.last_npv or 0), "last_dv01": float(s.last_dv01 or 0),
             "status": s.status} for s in swaps]


@router.get("/swaps/{swap_id}")
async def api_get_swap(
    swap_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_ir_read(current_user)
    from app.models.ir_risk import IRSwap
    swap = await db.get(IRSwap, swap_id)
    if not swap or swap.tenant_id != current_user.company_id:
        raise HTTPException(status_code=404, detail="Swap not found")
    return {"id": str(swap.id), "instrument_type": swap.instrument_type,
            "notional": float(swap.notional), "fixed_rate": float(swap.fixed_rate or 0),
            "last_npv": float(swap.last_npv or 0), "last_dv01": float(swap.last_dv01 or 0),
            "status": swap.status}


@router.post("/swaps/{swap_id}/mtm")
async def api_mtm_single(
    swap_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_ir_write(current_user)
    return await mark_to_market(db, swap_id=swap_id, tenant_id=current_user.company_id)


@router.post("/mtm-all")
async def api_mtm_all(
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_ir_write(current_user)
    return await mark_to_market_all(db, tenant_id=current_user.company_id)


@router.get("/dv01-ladder")
async def api_dv01_ladder(
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_ir_read(current_user)
    return await get_dv01_ladder(db, tenant_id=current_user.company_id)


@router.post("/effectiveness")
async def api_run_effectiveness(
    body: EffectivenessRequest,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_ir_write(current_user)
    return await run_effectiveness_test(
        db, swap_id=body.swap_id, facility_id=body.facility_id,
        tenant_id=current_user.company_id, method=body.method,
    )
