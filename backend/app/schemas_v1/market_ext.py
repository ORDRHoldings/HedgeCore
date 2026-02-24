"""Extended market snapshot with multi-currency, vol, liquidity, and margin data.

All new fields are Optional with defaults -- fully backward compatible with v1 MarketSnapshot.
"""

from pydantic import Field

from app.schemas_v1.market import MarketSnapshot


class ExtendedMarketSnapshot(MarketSnapshot):
    """Institutional-grade market data container."""

    # Multi-currency FX rates  {"EURUSD": 1.10, "GBPUSD": 1.28, ...}
    fx_rates: dict[str, float] = Field(default_factory=dict)

    # Interest rate curves per currency per tenor  {"USD": {"1M": 5.0, "3M": 5.2}, ...}
    interest_curves: dict[str, dict[str, float]] = Field(default_factory=dict)

    # Cross-currency basis spreads in bps  {"USDMXN": -15, "EURUSD": 5}
    basis_spreads: dict[str, float] = Field(default_factory=dict)

    # Volatility surface  {"VIX_1M": 18.5, "VIX_3M": 20.0}
    vol_surface: dict[str, float] = Field(default_factory=dict)

    # Average daily volume  {"USDMXN_FWD": 5_000_000_000}
    adv_data: dict[str, float] = Field(default_factory=dict)

    # Margin rates per instrument  {"FWD": {"initial": 0.03, "maintenance": 0.02}}
    margin_rates: dict[str, dict[str, float]] = Field(default_factory=dict)

    # Overnight funding rate in bps
    funding_rate_bps: float = 0.0

    # Factor covariance matrix  {"USDMXN": {"USDMXN": 0.01, "EURUSD": 0.005}}
    factor_covariance: dict[str, dict[str, float]] = Field(default_factory=dict)

    # Fee schedule per instrument  {"FWD": {"broker": 2.0, "exchange": 1.5, "clearing": 0.5}}
    fee_schedule: dict[str, dict[str, float]] = Field(default_factory=dict)
