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
