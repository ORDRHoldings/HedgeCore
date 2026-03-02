"""POST /api/v1/calculate/multi -- multi-currency hedge plan endpoint.

Generalizes /v1/calculate to support any of 26 registered currency pairs.
USDMXN still routes to this endpoint but uses the generic kernel.
The legacy /v1/calculate endpoint is UNCHANGED.

Updated in Prompt 3 to route through sandbox_calculate_multi() in pipeline_service,
which runs the full V2 satellite module suite and stores the result for proposal creation.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_async_session
from app.core.security import get_current_user
from app.engine_v1.pair_registry import PAIR_REGISTRY
from app.models.user import User
from app.schemas_v1.pipeline import SandboxCalculateRequest
from app.services import rbac_service
from app.services.pipeline_service import sandbox_calculate_multi

router = APIRouter(prefix="/v1", tags=["v1-calculate-multi"])


class MultiCalculateRequest(BaseModel):
    pair: str = Field(default="USDMXN", description="Currency pair, e.g. USDMXN, EURUSD, USDBRL")
    trades: list = Field(..., max_length=10_000)
    hedges: list = Field(default_factory=list, max_length=10_000)
    market: dict = Field(..., description="MarketSnapshot or MultiCurrencyMarketSnapshot dict")
    policy: dict = Field(..., description="PolicyConfig dict (may include pair_overrides)")


class MultiCalculateResponse(BaseModel):
    run_id: str
    pair: str
    validation_status: str
    v2_results: dict[str, Any]
    waterfall: dict[str, Any] | None = None
    hedge_plan: dict[str, Any] | None = None
    scenario_results: dict[str, Any] | None = None
    run_envelope: dict[str, Any] | None = None


@router.post("/calculate/multi", response_model=MultiCalculateResponse)
async def calculate_multi(
    request_data: MultiCalculateRequest,
    request: Request,
    db: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
) -> MultiCalculateResponse:
    """Multi-currency hedge plan calculation routed through the full V2 pipeline.

    Accepts any of 26 registered currency pairs. All V2 satellite modules
    (margin, liquidity, factor covariance, concentration, capital adequacy, etc.)
    are executed and returned in v2_results. The run is stored in the sandbox
    store and can be promoted to a proposal via POST /v1/pipeline/proposals.

    USDMXN delegates to the legacy sandbox_calculate() for bit-identical results.
    All other pairs use kernel_multi + normalizer_multi + scenarios_multi.
    """
    # RBAC
    if not await rbac_service.user_has_permission(db, current_user.id, "calculate.recommend"):
        raise HTTPException(status_code=403, detail="Permission denied: calculate.recommend required")

    # Validate pair
    pair = request_data.pair.upper()
    if pair not in PAIR_REGISTRY:
        raise HTTPException(
            status_code=422,
            detail=f"Unknown pair {pair!r}. Supported: {sorted(PAIR_REGISTRY.keys())}",
        )

    # Build SandboxCalculateRequest from the multi request fields
    sandbox_req = SandboxCalculateRequest(
        trades=request_data.trades,
        hedges=request_data.hedges,
        market=request_data.market,
        policy=request_data.policy,
    )

    try:
        result = sandbox_calculate_multi(str(current_user.id), sandbox_req, pair=pair)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Pipeline error: {exc}") from exc

    # Serialize sub-components for the response
    hedge_plan_dict: dict | None = None
    if result.get("hedge_plan") is not None:
        try:
            hedge_plan_dict = result["hedge_plan"].model_dump(mode="json")
        except Exception:
            hedge_plan_dict = None

    scenario_dict: dict | None = None
    if result.get("scenario_results") is not None:
        try:
            scenario_dict = result["scenario_results"].model_dump(mode="json")
        except Exception:
            scenario_dict = None

    waterfall_dict: dict | None = None
    if result.get("waterfall_result") is not None:
        try:
            waterfall_dict = result["waterfall_result"].model_dump(mode="json")
        except Exception:
            waterfall_dict = None

    envelope_dict: dict | None = None
    if result.get("run_envelope") is not None:
        try:
            envelope_dict = result["run_envelope"].model_dump(mode="json")
        except Exception:
            envelope_dict = None

    validation_report = result.get("validation_report")
    validation_status = validation_report.status if validation_report else "UNKNOWN"

    return MultiCalculateResponse(
        run_id=result["run_id"],
        pair=pair,
        validation_status=validation_status,
        v2_results=result.get("v2_results", {}),
        waterfall=waterfall_dict,
        hedge_plan=hedge_plan_dict,
        scenario_results=scenario_dict,
        run_envelope=envelope_dict,
    )
