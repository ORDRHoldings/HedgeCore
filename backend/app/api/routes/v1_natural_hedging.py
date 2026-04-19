"""Natural Hedging Optimizer routes (/v1/natural-hedging/*).

Compute-only — no DB mutation. Wraps the pure-function
`engine_v1.currency_netting_matrix` engine with tenant-scoped position
aggregation.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.plan_enforcement import require_plan_tier
from app.models.user import User
from app.services import natural_hedging_service as svc

router = APIRouter(prefix="/v1/natural-hedging", tags=["natural-hedging"])


class AnalyzeRequest(BaseModel):
    exposures: dict[str, float] = Field(
        ...,
        description="Currency-pair to USD-notional exposures, e.g. {'EURUSD': 500000, 'USDJPY': -300000}",
    )
    fx_rates: dict[str, float] | None = Field(
        default=None,
        description="Optional FX rates for triangulation consistency check",
    )


class FromPositionsRequest(BaseModel):
    reporting_currency: str = Field(default="USD", min_length=3, max_length=3)
    fx_rates: dict[str, float] | None = None
    statuses: list[str] | None = Field(
        default=None,
        description="Position status filter, e.g. ['CONFIRMED']. None = all active.",
    )


@router.post("/analyze")
async def analyze(
    body: AnalyzeRequest,
    current_user: User = Depends(require_plan_tier("professional")),
) -> dict[str, Any]:
    return svc.analyze(body.exposures, body.fx_rates)


@router.post("/from-positions")
async def from_positions(
    body: FromPositionsRequest,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_plan_tier("professional")),
) -> dict[str, Any]:
    return await svc.analyze_from_positions(
        db=db,
        tenant_id=current_user.company_id,
        reporting_currency=body.reporting_currency,
        fx_rates=body.fx_rates,
        statuses=body.statuses,
    )
