"""Counterparty Hub API routes (/v1/counterparties/*)."""
from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Body, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.plan_enforcement import require_plan_tier
from app.models.user import User
from app.schemas_v1.counterparty import (
    CounterpartyCreate,
    CounterpartyResponse,
    CounterpartyUpdate,
    CreditLimitCreate,
    CreditLimitResponse,
    ExposureResponse,
    PortfolioRiskResponse,
)
from app.services import counterparty_service
from app.services.counterparty_service import CounterpartyServiceError

router = APIRouter(prefix="/v1/counterparties", tags=["counterparty"])


def _require_perm(user: User, permission: str) -> None:
    if user.is_superuser:
        return
    user_perms = getattr(user, "permissions", None) or set()
    if permission not in user_perms:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"{permission} permission required",
        )


def _map_error(e: CounterpartyServiceError) -> HTTPException:
    if e.code in {"counterparty_not_found", "credit_limit_not_found"}:
        return HTTPException(status.HTTP_404_NOT_FOUND, detail=e.message)
    if e.code == "duplicate_name":
        return HTTPException(status.HTTP_409_CONFLICT, detail=e.message)
    return HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=e.message)


class ExposureComputeRequest(BaseModel):
    positions: list[dict[str, Any]] = Field(
        ...,
        description="Positions attributable to this counterparty: "
                    "[{notional_usd, mtm_usd, isda_threshold_usd}, ...]",
    )
    volatility_annual: float = Field(default=0.10, gt=0, le=2.0)
    time_horizon_years: float = Field(default=1.0, gt=0, le=10.0)


class PortfolioRiskRequest(BaseModel):
    positions: list[dict[str, Any]] = Field(
        ...,
        description="Positions across all counterparties: "
                    "[{counterparty_id, counterparty_name, notional_usd, mtm_usd, isda_threshold_usd}, ...]",
    )
    volatility_annual: float = Field(default=0.10, gt=0, le=2.0)
    time_horizon_years: float = Field(default=1.0, gt=0, le=10.0)


# ---------------- Counterparty CRUD ----------------


@router.post("", response_model=CounterpartyResponse, status_code=status.HTTP_201_CREATED)
async def create_counterparty_route(
    request: CounterpartyCreate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_plan_tier("professional")),
):
    _require_perm(current_user, "counterparty.write")
    try:
        cp = await counterparty_service.create_counterparty(
            db=db,
            tenant_id=current_user.company_id,
            user_id=current_user.id,
            request=request,
        )
    except CounterpartyServiceError as e:
        raise _map_error(e)
    return CounterpartyResponse.model_validate(cp)


@router.get("", response_model=list[CounterpartyResponse])
async def list_counterparties_route(
    include_inactive: bool = Query(False),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_plan_tier("professional")),
):
    _require_perm(current_user, "counterparty.read")
    rows = await counterparty_service.list_counterparties(
        db=db,
        tenant_id=current_user.company_id,
        active_only=not include_inactive,
    )
    return [CounterpartyResponse.model_validate(r) for r in rows]


@router.get("/{counterparty_id}", response_model=CounterpartyResponse)
async def get_counterparty_route(
    counterparty_id: UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_plan_tier("professional")),
):
    _require_perm(current_user, "counterparty.read")
    try:
        cp = await counterparty_service.get_counterparty(
            db=db, counterparty_id=counterparty_id, tenant_id=current_user.company_id,
        )
    except CounterpartyServiceError as e:
        raise _map_error(e)
    return CounterpartyResponse.model_validate(cp)


@router.patch("/{counterparty_id}", response_model=CounterpartyResponse)
async def update_counterparty_route(
    counterparty_id: UUID,
    update: CounterpartyUpdate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_plan_tier("professional")),
):
    _require_perm(current_user, "counterparty.write")
    try:
        cp = await counterparty_service.update_counterparty(
            db=db,
            counterparty_id=counterparty_id,
            tenant_id=current_user.company_id,
            user_id=current_user.id,
            update=update,
        )
    except CounterpartyServiceError as e:
        raise _map_error(e)
    return CounterpartyResponse.model_validate(cp)


# ---------------- Credit Limit CRUD ----------------


@router.post(
    "/{counterparty_id}/limits",
    response_model=CreditLimitResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_credit_limit_route(
    counterparty_id: UUID,
    request: CreditLimitCreate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_plan_tier("professional")),
):
    _require_perm(current_user, "counterparty.write")
    # Path wins over body; force consistency
    if request.counterparty_id != counterparty_id:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="path counterparty_id mismatch with body",
        )
    try:
        lim = await counterparty_service.create_credit_limit(
            db=db,
            tenant_id=current_user.company_id,
            user_id=current_user.id,
            request=request,
        )
    except CounterpartyServiceError as e:
        raise _map_error(e)
    return CreditLimitResponse.model_validate(lim)


@router.get(
    "/{counterparty_id}/limits",
    response_model=list[CreditLimitResponse],
)
async def list_credit_limits_route(
    counterparty_id: UUID,
    include_inactive: bool = Query(False),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_plan_tier("professional")),
):
    _require_perm(current_user, "counterparty.read")
    try:
        rows = await counterparty_service.list_credit_limits(
            db=db,
            counterparty_id=counterparty_id,
            tenant_id=current_user.company_id,
            active_only=not include_inactive,
        )
    except CounterpartyServiceError as e:
        raise _map_error(e)
    return [CreditLimitResponse.model_validate(r) for r in rows]


@router.delete(
    "/{counterparty_id}/limits/{limit_id}",
    response_model=CreditLimitResponse,
)
async def deactivate_credit_limit_route(
    counterparty_id: UUID,
    limit_id: UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_plan_tier("professional")),
):
    _require_perm(current_user, "counterparty.write")
    try:
        # Cross-tenant guard via get_counterparty
        await counterparty_service.get_counterparty(
            db=db, counterparty_id=counterparty_id, tenant_id=current_user.company_id,
        )
        lim = await counterparty_service.deactivate_credit_limit(
            db=db,
            limit_id=limit_id,
            tenant_id=current_user.company_id,
            user_id=current_user.id,
        )
    except CounterpartyServiceError as e:
        raise _map_error(e)
    return CreditLimitResponse.model_validate(lim)


# ---------------- Exposure Computation ----------------


@router.post("/{counterparty_id}/exposure", response_model=ExposureResponse)
async def compute_exposure_route(
    counterparty_id: UUID,
    request: ExposureComputeRequest = Body(...),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_plan_tier("professional")),
):
    _require_perm(current_user, "counterparty.read")
    try:
        return await counterparty_service.compute_exposure(
            db=db,
            counterparty_id=counterparty_id,
            tenant_id=current_user.company_id,
            user_id=current_user.id,
            positions=request.positions,
            volatility_annual=request.volatility_annual,
            time_horizon_years=request.time_horizon_years,
        )
    except CounterpartyServiceError as e:
        raise _map_error(e)


@router.post("/portfolio-risk", response_model=PortfolioRiskResponse)
async def compute_portfolio_risk_route(
    request: PortfolioRiskRequest = Body(...),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_plan_tier("professional")),
):
    _require_perm(current_user, "counterparty.read")
    return await counterparty_service.compute_portfolio_risk(
        db=db,
        tenant_id=current_user.company_id,
        positions=request.positions,
        volatility_annual=request.volatility_annual,
        time_horizon_years=request.time_horizon_years,
    )
