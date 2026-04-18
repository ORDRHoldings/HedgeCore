"""Pre-Trade TCA API routes (/v1/tca/*)."""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.dependencies import get_current_user
from app.core.plan_enforcement import require_plan_tier
from app.models.user import User
from app.schemas_v1.tca import (
    AccuracyReportResponse,
    PreTradeEstimateRequest,
    ReconcileRequest,
    TCABenchmark,
    TCABreakdown,
    TCAEstimateResponse,
)
from app.services import tca_service
from app.services.tca_service import SODViolationError, TCAServiceError

router = APIRouter(prefix="/v1/tca", tags=["tca"])


def _require_tca_perm(user: User, permission: str) -> None:
    """Inline permission check (superusers bypass).

    Follows the pattern used in v1_debt.py and other recent route files —
    permissions are loaded onto User at auth time.
    """
    if user.is_superuser:
        return
    user_perms = getattr(user, "permissions", None) or set()
    if permission not in user_perms:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"{permission} permission required",
        )


def _to_response(est) -> TCAEstimateResponse:
    """Map ORM row -> response model."""
    breakdown_src = est.outputs or {}
    # Engine's PositionCost has 'total_cost'; TransactionCostResult has 'total_transaction_cost'
    total_cost = breakdown_src.get(
        "total_cost",
        breakdown_src.get("total_transaction_cost", 0),
    )
    breakdown = TCABreakdown(
        slippage_cost=float(breakdown_src.get("slippage_cost", breakdown_src.get("total_slippage", 0))),
        broker_commission=float(breakdown_src.get("broker_commission", breakdown_src.get("total_commission", 0))),
        exchange_fee=float(breakdown_src.get("exchange_fee", breakdown_src.get("total_exchange_fees", 0))),
        clearing_fee=float(breakdown_src.get("clearing_fee", breakdown_src.get("total_clearing_fees", 0))),
        vol_drift_adjustment=float(breakdown_src.get("vol_drift_adjustment", breakdown_src.get("total_vol_drift", 0))),
        total_cost=float(total_cost),
        total_cost_bps=float(est.total_cost_bps or 0),
    )
    benchmark = None
    bench_attr = getattr(est, "_benchmark", None)
    if bench_attr:
        benchmark = TCABenchmark(**bench_attr)
    return TCAEstimateResponse(
        estimate_id=est.id,
        estimate_type=est.estimate_type,
        created_at=est.created_at,
        inputs=est.inputs or {},
        breakdown=breakdown,
        benchmark=benchmark,
        market_snapshot_id=est.market_snapshot_id,
        reconciled_at=est.reconciled_at,
        actual_cost_usd=float(est.actual_cost_usd) if est.actual_cost_usd is not None else None,
        variance_bps=float(est.variance_bps) if est.variance_bps is not None else None,
    )


@router.post("/pre-trade/estimate", response_model=TCAEstimateResponse)
async def post_pre_trade_estimate(
    request: PreTradeEstimateRequest,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_plan_tier("professional")),
):
    _require_tca_perm(current_user, "tca.estimate")
    try:
        est = await tca_service.estimate_pre_trade(
            db=db,
            tenant_id=current_user.company_id,
            user_id=current_user.id,
            request=request,
        )
    except TCAServiceError as e:
        if e.code == "no_market_snapshot":
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail=e.message)
        if e.code in {"estimate_not_found", "settlement_not_found"}:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail=e.message)
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=e.message)
    return _to_response(est)


@router.get("/estimates", response_model=list[TCAEstimateResponse])
async def list_estimates(
    type: str | None = None,
    pair: str | None = None,
    reconciled: bool | None = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_plan_tier("professional")),
):
    _require_tca_perm(current_user, "tca.read")
    from sqlalchemy import select
    from app.models.transaction_cost_estimate import TransactionCostEstimate

    stmt = (
        select(TransactionCostEstimate)
        .where(TransactionCostEstimate.tenant_id == current_user.company_id)
        .order_by(TransactionCostEstimate.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    if type:
        stmt = stmt.where(TransactionCostEstimate.estimate_type == type)
    if reconciled is True:
        stmt = stmt.where(TransactionCostEstimate.reconciled_at.isnot(None))
    elif reconciled is False:
        stmt = stmt.where(TransactionCostEstimate.reconciled_at.is_(None))
    rows = (await db.execute(stmt)).scalars().all()
    return [_to_response(r) for r in rows]


@router.get("/estimates/{estimate_id}", response_model=TCAEstimateResponse)
async def get_estimate(
    estimate_id: UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_plan_tier("professional")),
):
    _require_tca_perm(current_user, "tca.read")
    from sqlalchemy import select
    from app.models.transaction_cost_estimate import TransactionCostEstimate

    est = (
        await db.execute(
            select(TransactionCostEstimate).where(
                TransactionCostEstimate.id == estimate_id,
                TransactionCostEstimate.tenant_id == current_user.company_id,
            )
        )
    ).scalar_one_or_none()
    if est is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="estimate_not_found")
    return _to_response(est)


@router.get("/calc-runs/{run_id}", response_model=TCAEstimateResponse)
async def get_calc_run_tca(
    run_id: str,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_plan_tier("professional")),
):
    _require_tca_perm(current_user, "tca.read")
    # Helper already filters by tenant at DB level; belt-and-suspenders check retained.
    est = await tca_service._find_estimate_by_run_id(
        db, run_id, current_user.company_id,
    )
    if est is None or est.tenant_id != current_user.company_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="no_tca_for_run")
    return _to_response(est)


@router.post("/estimates/{estimate_id}/reconcile", response_model=TCAEstimateResponse)
async def post_reconcile(
    estimate_id: UUID,
    request: ReconcileRequest,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_plan_tier("professional")),
):
    _require_tca_perm(current_user, "tca.estimate")
    try:
        est = await tca_service.reconcile_actual(
            db=db,
            estimate_id=estimate_id,
            settlement_event_id=request.settlement_event_id,
            reconciling_user_id=current_user.id,
        )
    except SODViolationError as e:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail=e.message)
    except TCAServiceError as e:
        if e.code in {"estimate_not_found", "settlement_not_found"}:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail=e.message)
        if e.code == "cross_tenant":
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail=e.message)
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=e.message)
    return _to_response(est)


@router.get("/accuracy-report", response_model=AccuracyReportResponse)
async def get_accuracy_report(
    period: str = Query(..., min_length=1),
    group_by: str = Query("pair"),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_plan_tier("professional")),
):
    _require_tca_perm(current_user, "tca.read")
    if group_by not in {"pair", "instrument", "month"}:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="invalid_group_by")
    return await tca_service.get_accuracy_report(
        db=db,
        tenant_id=current_user.company_id,
        period=period,
        group_by=group_by,
    )
