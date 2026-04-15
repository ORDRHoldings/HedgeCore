# backend/app/api/routes/v1_cash_forecast.py
"""v1 cash forecast — 13w/12m rolling forecasts, scenarios, gaps, variance."""
import uuid
from datetime import date
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, get_session
from app.models.user import User
from app.schemas_v1.cash import (
    ForecastItemCreate, ForecastItemResponse, ForecastItemUpdate,
    ForecastResponse, LiquidityGapsResponse, ScenarioRequest, VarianceResponse,
)
from app.services.forecast_service import (
    get_forecast, create_forecast_item, list_forecast_items,
    update_forecast_item, run_scenario, get_liquidity_gaps, get_variance,
    save_snapshot,
)

router = APIRouter(prefix="/v1/cash/forecast", tags=["cash-forecast"])


def _require_professional(user: User) -> None:
    if getattr(user, "plan_tier", "starter") not in ("professional", "enterprise"):
        raise HTTPException(status_code=403, detail="Professional plan required")


def _require_write(user: User) -> None:
    _require_professional(user)
    if getattr(user, "role", "") not in ("cfo", "head_of_risk", "admin"):
        raise HTTPException(status_code=403, detail="Insufficient role")


# ── Module-level helpers for testability (patchable by route tests) ──

async def get_forecast_for_entity(db, *, company_id, entity_id, horizon, as_of_date):
    return await get_forecast(db, company_id=company_id, entity_id=entity_id,
                              horizon=horizon, as_of_date=as_of_date)


async def get_consolidated_forecast_data(db, *, company_id, horizon, as_of_date):
    return await get_forecast(db, company_id=company_id, entity_id=None,
                              horizon=horizon, as_of_date=as_of_date)


async def run_scenario_route_helper(db, *, company_id, entity_id, horizon, scenario, created_by):
    return await run_scenario(db, company_id=company_id, entity_id=entity_id,
                              horizon=horizon, scenario=scenario, created_by=created_by)


@router.get("/consolidated")
async def forecast_consolidated(
    horizon: str = Query(default="13w", pattern="^(13w|12m)$"),
    as_of_date: date | None = None,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_professional(current_user)
    target = as_of_date or date.today()
    buckets = await get_consolidated_forecast_data(
        db, company_id=current_user.company_id, horizon=horizon, as_of_date=target,
    )
    return ForecastResponse(as_of_date=target, horizon=horizon, entity_id=None, buckets=buckets)


@router.get("/liquidity-gaps")
async def liquidity_gaps(
    entity_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_professional(current_user)
    gaps = await get_liquidity_gaps(
        db, company_id=current_user.company_id, entity_id=entity_id,
    )
    return LiquidityGapsResponse(as_of_date=date.today(), gaps=gaps)


@router.post("/scenarios")
async def run_scenario_route(
    payload: ScenarioRequest,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_write(current_user)
    scenario = {}
    if payload.inflow_shift:
        scenario["inflow_shift"] = payload.inflow_shift
    if payload.outflow_shift:
        scenario["outflow_shift"] = payload.outflow_shift
    buckets = await run_scenario_route_helper(
        db, company_id=current_user.company_id, entity_id=payload.entity_id,
        horizon=payload.horizon, scenario=scenario, created_by=current_user.id,
    )
    await db.commit()
    return ForecastResponse(as_of_date=date.today(), horizon=payload.horizon,
                            entity_id=payload.entity_id, buckets=buckets)


@router.get("/variance")
async def variance_report(
    entity_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_professional(current_user)
    rows = await get_variance(db, company_id=current_user.company_id, entity_id=entity_id)
    return VarianceResponse(entity_id=entity_id, rows=rows)


# ── Forecast Item CRUD ──────────────────────────────────────────────────

@router.post("/items", response_model=ForecastItemResponse, status_code=201)
async def create_item(
    payload: ForecastItemCreate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_write(current_user)
    item = await create_forecast_item(
        db, company_id=current_user.company_id,
        payload=payload.model_dump(), created_by=current_user.id,
    )
    await db.commit()
    return item


@router.get("/items", response_model=list[ForecastItemResponse])
async def list_items(
    active_only: bool = True,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_professional(current_user)
    return await list_forecast_items(db, company_id=current_user.company_id, active_only=active_only)


@router.patch("/items/{item_id}", response_model=ForecastItemResponse)
async def update_item(
    item_id: uuid.UUID,
    payload: ForecastItemUpdate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_write(current_user)
    item = await update_forecast_item(
        db, item_id=item_id, company_id=current_user.company_id,
        payload=payload.model_dump(exclude_unset=True),
    )
    await db.commit()
    return item


@router.post("/snapshots")
async def save_forecast_snapshot(
    horizon: str = Query(default="13w", pattern="^(13w|12m)$"),
    entity_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Save current forecast as a snapshot for future variance tracking."""
    _require_write(current_user)
    buckets = await get_forecast(
        db, company_id=current_user.company_id, entity_id=entity_id,
        horizon=horizon, as_of_date=date.today(),
    )
    snapshot = await save_snapshot(
        db, company_id=current_user.company_id, entity_id=entity_id,
        horizon=horizon, buckets=buckets, parameters={}, created_by=current_user.id,
    )
    await db.commit()
    return {"snapshot_id": str(snapshot.id), "snapshot_date": str(snapshot.snapshot_date)}


# ── Parameterized entity route — MUST be LAST (catches /{entity_id}) ──

@router.get("/{entity_id}")
async def forecast_by_entity(
    entity_id: uuid.UUID,
    horizon: str = Query(default="13w", pattern="^(13w|12m)$"),
    as_of_date: date | None = None,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_professional(current_user)
    target = as_of_date or date.today()
    buckets = await get_forecast_for_entity(
        db, company_id=current_user.company_id, entity_id=entity_id,
        horizon=horizon, as_of_date=target,
    )
    return ForecastResponse(as_of_date=target, horizon=horizon, entity_id=entity_id, buckets=buckets)
