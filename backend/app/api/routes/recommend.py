# backend/app/api/routes/recommend.py
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from backend.app.engine.recommend import recommend as recommend_engine

router = APIRouter(prefix="/engine", tags=["engine"])


# -----------------------------
# Request / Response Contracts
# -----------------------------
class RecommendRequest(BaseModel):
    """
    Minimal, forward-compatible contract for HedgeCalc Engine orchestration.

    This endpoint is intentionally a thin wrapper around `engine.recommend.recommend()`.
    It does not invent missing market data; downstream engines will reject rows deterministically
    with explicit reasons when required inputs are absent.
    """

    model_config = ConfigDict(extra="allow")  # forward-compatible, engine remains strict where needed

    # Either provide positions (engine will pass through to exposure engine) OR provide exposure_input directly.
    positions: Any | None = Field(default=None, description="Positions payload accepted by Exposure Engine.")
    exposure_input: dict[str, Any] | None = Field(
        default=None, description="Optional direct input for Exposure Engine (bypasses positions wrapper)."
    )

    # Market & instrument data consumed by sizing/cost/scenario engines
    market: dict[str, Any] | None = Field(default_factory=dict, description="Market inputs (prices, deltas, etc.).")
    instrument_specs: dict[str, Any] | None = Field(
        default_factory=dict, description="Sizing specs per instrument_id (required by hedge_sizer)."
    )
    instrument_meta: dict[str, Any] | None = Field(
        default_factory=dict, description="Instrument metadata per instrument_id (required by cost/scenario)."
    )

    # Cost model assumptions (no live feeds)
    assumptions: dict[str, Any] | None = Field(
        default_factory=dict, description="Cost assumptions (spreads_bps, fees_per_contract, margin_rate, etc.)."
    )

    # Deterministic scenario set
    scenarios: list[dict[str, Any]] | None = Field(
        default_factory=list, description="Explicit scenarios for deterministic stress testing."
    )

    # Optional engine-wide policy overrides
    policy: dict[str, Any] | None = Field(default=None, description="Optional policy overrides for orchestration.")


class RecommendResponse(BaseModel):
    model_config = ConfigDict(extra="allow")

    plan_id: str
    summary: dict[str, Any]
    meta: dict[str, Any]

    # present when orchestration policy includes stage outputs
    stages: dict[str, Any] | None = None
    plan: dict[str, Any] | None = None


# -----------------------------
# Endpoint
# -----------------------------
@router.post(
    "/recommend",
    response_model=RecommendResponse,
    summary="Run full HedgeCalc hedge recommendation pipeline",
)
def recommend_endpoint(payload: RecommendRequest = Body(...)) -> RecommendResponse:
    """
    Deterministic HedgeCalc hedge recommendation.

    Thin wrapper over:
      backend.app.engine.recommend.recommend(payload_dict, policy=payload.policy)

    Returns:
      - plan_id (stable hash for identical inputs)
      - summary (cost + effectiveness stats)
      - meta.decision_trace (full audit trace)
      - optionally: stages + plan (when enabled by orchestration policy)
    """
    try:
        req = payload.model_dump()
        pol = req.pop("policy", None)

        # Ensure we always pass a dict to the engine (deterministic)
        engine_in: dict[str, Any] = dict(req)

        out = recommend_engine(engine_in, policy=pol)
        return RecommendResponse.model_validate(out)
    except HTTPException:
        raise
    except Exception as e:
        # Do not leak internals; keep it clean and operationally safe.
        raise HTTPException(status_code=400, detail=f"recommend_failed: {type(e).__name__}") from e


__all__ = ["router"]
