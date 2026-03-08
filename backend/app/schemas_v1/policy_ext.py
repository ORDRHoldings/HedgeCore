"""Extended policy config with institutional governance parameters.

All new fields are Optional with defaults -- fully backward compatible with v1 PolicyConfig.
"""

from typing import Literal

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

    # --- Volatility Policy (Layer 2) ---
    volatility_lookback_days: int = 60
    volatility_method: Literal["EWMA", "REALIZED", "GARCH"] = "EWMA"
    volatility_ewma_lambda: float = Field(default=0.94, ge=0.8, le=0.99)
    volatility_regime_enabled: bool = False  # neutral by default
    volatility_band_widening_enabled: bool = False  # neutral by default
    volatility_ratio_adjustment_enabled: bool = False  # neutral by default
    fallback_volatilities: dict[str, float] = Field(
        default_factory=lambda: {
            "G10": 0.08, "EM_LATAM": 0.14, "EM_ASIA": 0.10, "EM_CEEMEA": 0.16
        },
        description="Region-aware fallback annualized volatilities. Source: BIS Triennial Survey 2022 median realized vol by region."
    )
    fallback_correlations: dict[str, float] = Field(
        default_factory=lambda: {"intra_region": 0.60, "cross_region": 0.30},
        description="Fallback correlation structure. Source: DCC-GARCH estimates on G10+EM FX pairs 2015-2024 (BIS WP No. 1012)."
    )

    # --- Geopolitical Overlay (Layer 3) ---
    geopolitical_overlay_enabled: bool = False  # neutralized
    geopolitical_source: str = "polisophic"
    geopolitical_escalation_threshold: float = Field(default=0.7, ge=0.0, le=1.0)
    geopolitical_ratio_haircut_max: float = Field(default=0.10, ge=0.0, le=0.5)

    # --- Enhanced Scenario Policy (Layer 4) ---
    scenario_shock_levels: list[float] = Field(
        default_factory=lambda: [-0.10, -0.05, 0.05, 0.10],
        description="Configurable spot shock levels. Default: +/-5%/+/-10% (approximately 1s/2s for 15% annualized EM vol)."
    )
    scenario_historical_var_enabled: bool = False
    scenario_var_confidence: float = Field(default=0.95, ge=0.90, le=0.99)
    scenario_var_lookback_days: int = Field(default=252, ge=60, le=1260)
    scenario_expected_shortfall_enabled: bool = False
    scenario_custom_shocks: list[dict[str, float]] = Field(default_factory=list)
    scenario_drawdown_tolerance_pct: float = Field(default=5.0, ge=0.0, le=50.0)

    # --- Prospective Effectiveness (Layer 5) ---
    prospective_effectiveness_method: Literal["CRITICAL_TERMS_MATCH", "STATISTICAL_FORECAST", "NONE"] = "NONE"
    prospective_effectiveness_confidence: float = Field(default=0.95, ge=0.80, le=0.99)
    retrospective_effectiveness_band_min: float = Field(default=0.80, ge=0.50, le=0.95,
        description="ASC 815-30-35 / IAS 39 AG105 lower bound. Industry standard: 80%.")
    retrospective_effectiveness_band_max: float = Field(default=1.25, ge=1.05, le=2.0,
        description="ASC 815-30-35 / IAS 39 AG105 upper bound. Industry standard: 125%.")
    regression_r_squared_min: float = Field(default=0.80, ge=0.50, le=1.0,
        description="Minimum R-squared for regression-based effectiveness. IAS 39 IG F.4.4 guidance.")
    regression_slope_band_min: float = Field(default=-1.25, le=-0.5)
    regression_slope_band_max: float = Field(default=-0.80, ge=-1.5, le=-0.1)

    # --- Decision Gate Policy (Layer 5) ---
    decision_gate_max_cost_bps: float = Field(default=75.0, ge=0.0,
        description="Maximum hedge cost in bps. Default 75bps = 0.75% of notional, aligned with GFMA best practice for EM FX.")
    decision_gate_max_cost_usd: float = Field(default=25000.0, ge=0.0)
    decision_gate_min_worst_case_pnl_usd: float = Field(default=-50000.0, le=0.0)
    decision_gate_min_effectiveness: float = Field(default=0.25, ge=0.0, le=2.0)
    decision_gate_max_rejected_legs: int = Field(default=0, ge=0)
    decision_gate_require_nonzero_hedges: bool = True
    decision_gate_reject_on_unhedged_material: bool = True
    decision_gate_material_risk_threshold: float = Field(default=0.50, ge=0.0, le=1.0)

    # --- Netting Policy ---
    netting_enabled: bool = False
    netting_net_confirmed_forecast: bool = False
    netting_settlement_cycle_days: int = Field(default=2, ge=0, le=30)

    # --- Instrument Policy ---
    instrument_allowed_types: list[str] = Field(default_factory=lambda: ["NDF", "FWD"])
    instrument_max_tenor_days: dict[str, int] = Field(default_factory=dict)
    instrument_requires_approval: dict[str, bool] = Field(default_factory=dict)
    instrument_max_notional_usd: dict[str, float] = Field(default_factory=dict)

    # --- Maturity Profile ---
    maturity_profile: Literal["SHORT", "MEDIUM", "LONG", "MIXED"] = "MEDIUM"
    maturity_short_max_months: int = Field(default=3, ge=1, le=12)
    maturity_long_min_months: int = Field(default=12, ge=6, le=60)

    # --- Governance Intensity ---
    governance_tier: Literal["STANDARD", "ENHANCED", "COMMITTEE"] = "STANDARD"
    evidence_grade: Literal["BASIC", "DOCUMENTED", "AUDITED"] = "BASIC"
    accounting_mode: Literal["FAIR_VALUE", "CASH_FLOW_HEDGE", "NET_INVESTMENT", "NONE"] = "NONE"

    # --- Liquidity Regime Policy ---
    liquidity_regime_stressed_threshold: float = Field(default=40.0, ge=10.0, le=90.0,
        description="Composite score threshold for STRESSED regime. Default: 40 (calibrated to BIS quarterly FX turnover data).")
    liquidity_regime_crisis_threshold: float = Field(default=70.0, ge=30.0, le=100.0,
        description="Composite score threshold for CRISIS regime. Default: 70.")
    liquidity_regime_weights: dict[str, float] = Field(
        default_factory=lambda: {"adv": 0.25, "spread": 0.25, "volatility": 0.30, "margin": 0.20},
        description="Composite score component weights. Must sum to 1.0."
    )
