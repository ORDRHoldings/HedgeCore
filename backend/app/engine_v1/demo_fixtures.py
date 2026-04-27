"""Demo fixtures: synthetic data for all v2 engine modules.



Provides realistic institutional-grade market data for development and testing.

Production readiness requires external data feeds -- module logic remains unchanged.

"""



from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, cast

from app.schemas_v1.market_ext import ExtendedMarketSnapshot
from app.schemas_v1.policy import CostAssumptions, HedgeRatios
from app.schemas_v1.policy_ext import ExtendedPolicyConfig

# ---------------------------------------------------------------------------

# Market data fixtures

# ---------------------------------------------------------------------------



def demo_market_snapshot() -> ExtendedMarketSnapshot:
    """Full 26-pair institutional market snapshot."""
    return ExtendedMarketSnapshot(
        as_of=datetime.now(UTC),
        spot_rate=17.15,
        forward_points_by_month={
            "2025-07": 0.325,
            "2025-08": 0.370,
            "2025-09": 0.418,
            "2025-10": 0.465,
            "2025-11": 0.510,
            "2025-12": 0.558,
            "2026-01": 0.045,
            "2026-02": 0.092,
            "2026-03": 0.138,
            "2026-04": 0.185,
            "2026-05": 0.230,
            "2026-06": 0.278,
        },
        fx_rates={
            # G10
            "EURUSD": 1.0850, "GBPUSD": 1.2720, "AUDUSD": 0.6540,
            "NZDUSD": 0.6080, "USDJPY": 149.50, "USDCHF": 0.8830,
            "USDCAD": 1.3580, "USDSEK": 10.45, "USDNOK": 10.65,
            "USDDKK": 6.88,
            # EM LATAM
            "USDMXN": 17.15, "USDBRL": 4.975, "USDCLP": 880.0,
            "USDCOP": 3950.0, "USDPEN": 3.72,
            # EM ASIA
            "USDCNH": 7.245, "USDINR": 83.25, "USDKRW": 1320.0,
            "USDSGD": 1.345, "USDTWD": 31.50,
            # EM CEEMEA
            "USDZAR": 18.75, "USDTRY": 32.50, "USDHUF": 365.0,
            "USDPLN": 4.05, "USDCZK": 23.20, "USDILS": 3.65,
        },
        pair_forward_points={
            "EURUSD": {"2025-07": -0.0015, "2025-08": -0.0032, "2025-09": -0.0048,
                       "2025-10": -0.0065, "2025-11": -0.0081, "2025-12": -0.0098},
            "GBPUSD": {"2025-07": -0.0012, "2025-08": -0.0025, "2025-09": -0.0038,
                       "2025-10": -0.0051, "2025-11": -0.0064, "2025-12": -0.0077},
            "USDJPY": {"2025-07": -0.45, "2025-08": -0.92, "2025-09": -1.38,
                       "2025-10": -1.85, "2025-11": -2.30, "2025-12": -2.78},
            "USDMXN": {"2025-07": 0.325, "2025-08": 0.370, "2025-09": 0.418,
                       "2025-10": 0.465, "2025-11": 0.510, "2025-12": 0.558},
            "USDBRL": {"2025-07": 0.8, "2025-08": 1.6, "2025-09": 2.5,
                       "2025-10": 3.3, "2025-11": 4.2, "2025-12": 5.0},
            "USDINR": {"2025-07": 0.5, "2025-08": 1.0, "2025-09": 1.5,
                       "2025-10": 2.0, "2025-11": 2.5, "2025-12": 3.0},
            "USDKRW": {"2025-07": 0.4, "2025-08": 0.8, "2025-09": 1.2,
                       "2025-10": 1.6, "2025-11": 2.0, "2025-12": 2.4},
            "USDTWD": {"2025-07": 0.3, "2025-08": 0.6, "2025-09": 0.9,
                       "2025-10": 1.2, "2025-11": 1.5, "2025-12": 1.8},
            "USDCNH": {"2025-07": 0.15, "2025-08": 0.30, "2025-09": 0.45,
                       "2025-10": 0.60, "2025-11": 0.75, "2025-12": 0.90},
            "USDZAR": {"2025-07": 1.2, "2025-08": 2.4, "2025-09": 3.6,
                       "2025-10": 4.8, "2025-11": 6.0, "2025-12": 7.2},
            "USDTRY": {"2025-07": 8.5, "2025-08": 17.5, "2025-09": 27.0,
                       "2025-10": 37.0, "2025-11": 47.5, "2025-12": 58.5},
        },
        interest_curves={
            "USD": {"1M": 5.33, "3M": 5.40, "6M": 5.35, "12M": 5.10},
            "EUR": {"1M": 3.75, "3M": 3.85, "6M": 3.70, "12M": 3.50},
            "GBP": {"1M": 5.25, "3M": 5.30, "6M": 5.15, "12M": 4.90},
            "JPY": {"1M": -0.05, "3M": 0.00, "6M": 0.10, "12M": 0.30},
            "MXN": {"1M": 11.00, "3M": 11.10, "6M": 10.80, "12M": 10.25},
            "BRL": {"1M": 13.75, "3M": 13.50, "6M": 12.80, "12M": 11.50},
            "INR": {"1M": 6.50, "3M": 6.70, "6M": 6.60, "12M": 6.40},
            "TRY": {"1M": 45.00, "3M": 42.00, "6M": 38.00, "12M": 35.00},
            "ZAR": {"1M": 8.25, "3M": 8.40, "6M": 8.20, "12M": 7.80},
            "AUD": {"1M": 4.35, "3M": 4.40, "6M": 4.30, "12M": 4.10},
            "CAD": {"1M": 5.00, "3M": 4.95, "6M": 4.85, "12M": 4.60},
            "CHF": {"1M": 1.75, "3M": 1.80, "6M": 1.70, "12M": 1.50},
            "KRW": {"1M": 3.50, "3M": 3.55, "6M": 3.45, "12M": 3.30},
            "CNH": {"1M": 2.80, "3M": 2.85, "6M": 2.75, "12M": 2.60},
        },
        basis_spreads={
            "USDMXN": -15.0, "EURUSD": 5.0, "GBPUSD": 3.0, "USDJPY": -8.0,
            "USDCAD": 2.0, "USDBRL": -25.0, "USDTRY": -180.0, "USDZAR": -40.0,
        },
        adv_data={
            "EURUSD": 750_000_000_000, "GBPUSD": 420_000_000_000,
            "USDJPY": 580_000_000_000, "USDMXN": 55_000_000_000,
            "USDMXN_FWD": 5_000_000_000, "USDMXN_NDF": 3_000_000_000,
            "USDBRL": 25_000_000_000, "USDBRL_NDF": 2_000_000_000,
            "USDCNH": 60_000_000_000, "USDZAR": 25_000_000_000,
            "USDTRY": 15_000_000_000, "USDCOP": 3_000_000_000,
            "USDCLP": 5_000_000_000, "USDPEN": 1_500_000_000,
            "USDINR": 30_000_000_000, "USDKRW": 45_000_000_000,
            "EURUSD_FWD": 50_000_000_000, "GBPUSD_FWD": 20_000_000_000,
            "USDJPY_FWD": 30_000_000_000,
        },
        vol_surface={
            "VIX_1M": 16.5, "VIX_3M": 18.2,
            "EURUSD_1M": 7.5, "GBPUSD_1M": 8.2, "USDJPY_1M": 9.0,
            "AUDUSD_1M": 10.0, "USDCAD_1M": 7.8, "USDCHF_1M": 7.2,
            "USDMXN_1M": 12.5, "USDMXN_3M": 13.0,
            "USDBRL_1M": 16.0, "USDBRL_3M": 17.5,
            "USDTRY_1M": 28.0, "USDTRY_3M": 30.0,
            "USDCNH_1M": 6.5, "USDINR_1M": 5.5, "USDKRW_1M": 6.8,
            "USDZAR_1M": 15.5, "USDZAR_3M": 16.5,
            "USDCOP_1M": 12.0, "USDCLP_1M": 11.0,
            "SPX_REALIZED_1M": 15.0, "HYG_SPREAD_VOL": 0.07,
        },
        margin_rates={
            "FWD": {"initial": 0.03, "maintenance": 0.02},
            "NDF": {"initial": 0.02, "maintenance": 0.015},
            "OPTION": {"initial": 0.05, "maintenance": 0.04},
        },
        funding_rate_bps=5.33,
        factor_covariance={
            "USDMXN": {"USDMXN": 0.0156, "EURUSD": -0.0042, "GBPUSD": -0.0038, "USDJPY": 0.0025},
            "EURUSD": {"USDMXN": -0.0042, "EURUSD": 0.0056, "GBPUSD": 0.0048, "USDJPY": -0.0015},
            "GBPUSD": {"USDMXN": -0.0038, "GBPUSD": 0.0052, "EURUSD": 0.0048, "USDJPY": -0.0012},
            "USDJPY": {"USDMXN": 0.0025, "EURUSD": -0.0015, "GBPUSD": -0.0012, "USDJPY": 0.0064},
        },
        fee_schedule={
            "FWD": {"broker": 2.0, "exchange": 1.5, "clearing": 0.5},
            "NDF": {"broker": 3.0, "exchange": 2.0, "clearing": 1.0},
            "OPTION": {"broker": 5.0, "exchange": 3.0, "clearing": 1.5},
        },
        fx_deltas={},
        previous_close_rates={},
    )

def demo_policy_config() -> ExtendedPolicyConfig:

    """Full institutional policy configuration with governance parameters."""

    return ExtendedPolicyConfig(

        bucket_mode="CALENDAR_MONTH",

        hedge_ratios=HedgeRatios(confirmed=0.80, forecast=0.50),

        cost_assumptions=CostAssumptions(spread_bps=5.0),

        execution_product="FWD",

        min_trade_size_usd=50_000.0,

        # Hedge band enforcement

        hedge_bands={

            "confirmed": [0.50, 1.00],

            "forecast": [0.30, 0.90],

        },

        # Margin/capital constraints

        margin_budget_usd=5_000_000.0,

        max_hedge_cost_bps=50.0,

        min_liquidity_score=0.3,

        # Scenario families

        enabled_scenarios=["vol_crush", "regime_shift", "funding_squeeze"],

        # Vol/credit parameters

        vix_contract_vega=400.0,

        credit_equity_correlation=0.70,

        # Governance

        cooling_off_minutes=15,

        dual_approval_threshold_usd=10_000_000.0,

        # Costs

        broker_commission_bps=2.0,

        # Forward arbitrage

        forward_arbitrage_soft_tolerance=0.005,

        forward_arbitrage_hard_tolerance=0.02,

        # Rounding

        rounding_precision={"ratio": 6, "currency": 2, "fx_rate": 8},

        # Capital adequacy

        min_capital_ratio=1.5,

        max_instrument_concentration_pct=0.25,
        portfolio_equity_usd=None,
        portfolio_equity_ratio=0.10,
        execution_window_hours=24.0,
        waterfall_weights={},
        pair_concentration_overrides={},
    )





# ---------------------------------------------------------------------------

# Convenience: raw dict forms for engine functions that accept dicts

# ---------------------------------------------------------------------------



def demo_market_dict() -> dict[str, Any]:

    """Market snapshot as a plain dict."""

    return cast(dict[str, Any], demo_market_snapshot().model_dump(mode="json"))





def demo_policy_dict() -> dict[str, Any]:

    """Policy config as a plain dict."""

    return cast(dict[str, Any], demo_policy_config().model_dump(mode="json"))





# ---------------------------------------------------------------------------

# Multi-currency trade fixtures

# ---------------------------------------------------------------------------



def demo_multi_currency_trades() -> list[dict[str, Any]]:

    """Sample multi-currency trade book for tensor testing."""

    return [

        {

            "trade_id": "T-MC-001",

            "type": "AR",

            "currency": "MXN",

            "asset_currency": "MXN",

            "funding_currency": "USD",

            "amount_local": 10_000_000.0,

            "amount_usd": 583_090.38,

            "maturity": "2025-03",

            "entity": "MexOps",

            "confidence": "confirmed",

        },

        {

            "trade_id": "T-MC-002",

            "type": "AP",

            "currency": "EUR",

            "asset_currency": "EUR",

            "funding_currency": "USD",

            "amount_local": -500_000.0,

            "amount_usd": -542_500.0,

            "maturity": "2025-03",

            "entity": "EuroDiv",

            "confidence": "confirmed",

        },

        {

            "trade_id": "T-MC-003",

            "type": "AR",

            "currency": "GBP",

            "asset_currency": "GBP",

            "funding_currency": "USD",

            "amount_local": 300_000.0,

            "amount_usd": 381_600.0,

            "maturity": "2025-06",

            "entity": "UKDiv",

            "confidence": "forecast",

        },

        {

            "trade_id": "T-MC-004",

            "type": "AP",

            "currency": "JPY",

            "asset_currency": "JPY",

            "funding_currency": "USD",

            "amount_local": -50_000_000.0,

            "amount_usd": -334_448.16,

            "maturity": "2025-06",

            "entity": "AsiaOps",

            "confidence": "forecast",

        },

        {

            "trade_id": "T-MC-005",

            "type": "AR",

            "currency": "BRL",

            "asset_currency": "BRL",

            "funding_currency": "USD",

            "amount_local": 2_000_000.0,

            "amount_usd": 402_010.05,

            "maturity": "2025-09",

            "entity": "LatAmOps",

            "confidence": "forecast",

        },

    ]

