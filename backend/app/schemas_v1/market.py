from datetime import datetime

from pydantic import BaseModel, Field


class MarketSnapshot(BaseModel):
    as_of: datetime
    spot_rate: float = Field(..., gt=0)
    forward_points_by_month: dict[str, float]
    provider_metadata: dict = Field(default_factory=dict)


class PairMarketData(BaseModel):
    """Market data for a single currency pair."""
    spot: float = Field(..., gt=0)
    forward_points_by_month: dict[str, float] = Field(default_factory=dict)
    bid_ask_spread_bps: float = Field(default=0.0, ge=0)
    adv_usd: float | None = None
    vol_surface: dict[str, float] = Field(default_factory=dict)
    margin_rates: dict[str, dict[str, float]] = Field(default_factory=dict)


class MultiCurrencyMarketSnapshot(MarketSnapshot):
    """Extended market snapshot supporting multiple currency pairs.

    Backward compatible: spot_rate and forward_points_by_month still work
    for the legacy USDMXN kernel path.
    """
    pairs: dict[str, "PairMarketData"] = Field(
        default_factory=dict,
        description="Keyed by pair code: EURUSD, USDJPY, etc."
    )

    def get_spot(self, pair: str) -> float:
        if pair == "USDMXN":
            return self.spot_rate
        pd_data = self.pairs.get(pair)
        if pd_data is None:
            raise ValueError(f"No market data for pair: {pair}")
        return pd_data.spot

    def get_forward_points(self, pair: str) -> dict[str, float]:
        if pair == "USDMXN":
            return self.forward_points_by_month
        pd_data = self.pairs.get(pair)
        if pd_data is None:
            raise ValueError(f"No market data for pair: {pair}")
        return pd_data.forward_points_by_month

    def get_spread_bps(self, pair: str) -> float:
        pd_data = self.pairs.get(pair)
        if pd_data and pd_data.bid_ask_spread_bps > 0:
            return pd_data.bid_ask_spread_bps
        from app.engine_v1.pair_registry import get_pair_meta
        return get_pair_meta(pair).typical_spread_bps

    def get_adv(self, pair: str) -> float:
        pd_data = self.pairs.get(pair)
        if pd_data and pd_data.adv_usd:
            return pd_data.adv_usd
        from app.engine_v1.pair_registry import get_pair_meta
        return get_pair_meta(pair).typical_adv_usd
