from typing import Literal

from pydantic import BaseModel, Field


class PerPairPolicy(BaseModel):
    """Per-pair policy overrides. When absent, global values apply."""
    hedge_ratios: "HedgeRatios | None" = None
    spread_bps: float | None = None
    execution_product: "Literal['NDF', 'FWD'] | None" = None
    min_trade_size_usd: float | None = None
    max_tenor_months: int | None = None


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
    pair_overrides: dict[str, "PerPairPolicy"] = Field(
        default_factory=dict,
        description="Per-pair policy overrides. Key = pair code (EURUSD, USDJPY, etc.)"
    )

    def get_hedge_ratios(self, pair: str = "USDMXN") -> "HedgeRatios":
        override = self.pair_overrides.get(pair)
        if override and override.hedge_ratios:
            return override.hedge_ratios
        return self.hedge_ratios

    def get_spread_bps(self, pair: str = "USDMXN") -> float:
        override = self.pair_overrides.get(pair)
        if override and override.spread_bps is not None:
            return override.spread_bps
        return self.cost_assumptions.spread_bps

    def get_execution_product(self, pair: str = "USDMXN") -> str:
        override = self.pair_overrides.get(pair)
        if override and override.execution_product:
            return override.execution_product
        from app.engine_v1.pair_registry import get_pair_meta
        try:
            meta = get_pair_meta(pair)
            if meta.is_ndf:
                return "NDF"
        except ValueError:
            pass
        return self.execution_product

    def get_min_trade_size(self, pair: str = "USDMXN") -> float:
        override = self.pair_overrides.get(pair)
        if override and override.min_trade_size_usd is not None:
            return override.min_trade_size_usd
        return self.min_trade_size_usd
