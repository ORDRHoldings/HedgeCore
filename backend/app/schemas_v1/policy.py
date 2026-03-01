from typing import Literal

from pydantic import BaseModel, Field


class HedgeRatios(BaseModel):
    confirmed: float = Field(..., ge=0, le=1.0)
    forecast: float = Field(..., ge=0, le=1.0)


class CostAssumptions(BaseModel):
    spread_bps: float = Field(..., ge=0)


class PolicyConfig(BaseModel):
    bucket_mode: Literal["CALENDAR_MONTH"] = "CALENDAR_MONTH"
    hedge_ratios: HedgeRatios
    cost_assumptions: CostAssumptions
    execution_product: Literal["NDF", "FWD"]
    min_trade_size_usd: float = Field(..., ge=0)
    dual_key_threshold_usd: float = Field(
        default=1_000_000.0,
        ge=0,
        description="Positions with notional above this USD amount require a second approver",
    )
    dual_key_required: bool = Field(
        default=False,
        description="Master switch: enable dual-key approval workflow",
    )
    allow_indicative_proxy: bool = Field(
        default=False,
        description=(
            "Production gate: when False (default), calculations using INDICATIVE_FALLBACK "
            "market data are rejected with V-024 CRITICAL. Set True only for sandbox/demo "
            "workflows where live market data is unavailable."
        ),
    )
