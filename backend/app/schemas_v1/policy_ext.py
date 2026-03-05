"""Extended policy config with institutional governance parameters.



All new fields are Optional with defaults -- fully backward compatible with v1 PolicyConfig.

"""



from pydantic import Field

from app.schemas_v1.policy import PolicyConfig


class ExtendedPolicyConfig(PolicyConfig):

    """Institutional-grade policy configuration."""



    # Hedge band enforcement  {"confirmed": [0.5, 1.0], "forecast": [0.3, 0.9]}

    hedge_bands: dict[str, list[float]] = Field(default_factory=dict)



    # Portfolio margin cap in USD (None = unconstrained)

    margin_budget_usd: float | None = None



    # Total hedge cost ceiling in bps (None = unconstrained)

    max_hedge_cost_bps: float | None = None



    # Minimum liquidity threshold (0.0 = disabled)

    min_liquidity_score: float = 0.0



    # Additional scenario families to enable

    enabled_scenarios: list[str] = Field(default_factory=list)



    # VIX contract vega ($/point) for vol mapping

    vix_contract_vega: float = 400.0



    # Equity-to-credit beta proxy for credit duration mapping

    credit_equity_correlation: float = 0.7



    # Cooling-off period in minutes (0 = disabled)

    cooling_off_minutes: int = 0



    # Dual approval threshold in USD (None = single approval always)

    dual_approval_threshold_usd: float | None = None



    # Broker commission in bps

    broker_commission_bps: float = 0.0



    # FX forward arbitrage tolerances

    forward_arbitrage_soft_tolerance: float = 0.005  # 50 bps

    forward_arbitrage_hard_tolerance: float = 0.02   # 200 bps



    # Deterministic rounding precision

    rounding_precision: dict[str, int] = Field(

        default_factory=lambda: {"ratio": 6, "currency": 2, "fx_rate": 8}

    )



    # Capital adequacy minimum buffer ratio

    min_capital_ratio: float = 1.5



    # Maximum concentration per instrument (as fraction)

    max_instrument_concentration_pct: float = 0.25

    # Portfolio equity (actual USD amount)
    portfolio_equity_usd: float | None = Field(
        default=None,
        description="Actual portfolio equity in USD. When None, computed as total_exposure x portfolio_equity_ratio."
    )
    portfolio_equity_ratio: float = Field(
        default=0.10, ge=0.01, le=1.0,
        description="Equity/exposure ratio used when portfolio_equity_usd is not provided."
    )
    # Execution window (from Prompt 2, FIX-07)
    execution_window_hours: float = Field(
        default=24.0, ge=1.0, le=720.0,
        description="Expected execution window in hours for vol drift estimation."
    )
    # Waterfall weight overrides (from Prompt 2, FIX-09)
    waterfall_weights: dict[str, int] = Field(
        default_factory=dict,
        description="Waterfall rule weight overrides. Key=R1..R8, Value=0-100."
    )
    # Per-pair concentration limits
    pair_concentration_overrides: dict[str, float] = Field(
        default_factory=dict,
        description="Per-pair concentration limits as fraction. E.g., {USDTRY: 0.15, EURUSD: 0.40}"
    )
