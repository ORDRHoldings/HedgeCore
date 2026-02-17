"""Demo fixtures: synthetic data for all v2 engine modules.

Provides realistic institutional-grade market data for development and testing.
Production readiness requires external data feeds — module logic remains unchanged.
"""

from __future__ import annotations

from datetime import datetime, timezone

from app.schemas_v1.market_ext import ExtendedMarketSnapshot
from app.schemas_v1.policy_ext import ExtendedPolicyConfig
from app.schemas_v1.policy import HedgeRatios, CostAssumptions


# ---------------------------------------------------------------------------
# Market data fixtures
# ---------------------------------------------------------------------------

def demo_market_snapshot() -> ExtendedMarketSnapshot:
    """Full institutional market snapshot with multi-currency data."""
    return ExtendedMarketSnapshot(
        as_of=datetime.now(timezone.utc),
        spot_usdmxn=17.15,
        forward_points_by_month={
            "2025-01": 0.045,
            "2025-02": 0.092,
            "2025-03": 0.138,
            "2025-04": 0.185,
            "2025-05": 0.230,
            "2025-06": 0.278,
            "2025-07": 0.325,
            "2025-08": 0.370,
            "2025-09": 0.418,
            "2025-10": 0.465,
            "2025-11": 0.510,
            "2025-12": 0.558,
        },
        # Multi-currency FX rates (vs USD)
        fx_rates={
            "USDMXN": 17.15,
            "EURUSD": 1.0850,
            "GBPUSD": 1.2720,
            "USDJPY": 149.50,
            "USDCAD": 1.3580,
            "AUDUSD": 0.6540,
            "USDCHF": 0.8830,
            "USDCNY": 7.2450,
            "USDBRL": 4.9750,
        },
        # Interest rate curves by currency (annualized %)
        interest_curves={
            "USD": {"1M": 5.33, "3M": 5.40, "6M": 5.38, "12M": 5.10},
            "MXN": {"1M": 11.25, "3M": 11.20, "6M": 11.00, "12M": 10.50},
            "EUR": {"1M": 3.90, "3M": 3.85, "6M": 3.75, "12M": 3.50},
            "GBP": {"1M": 5.25, "3M": 5.20, "6M": 5.10, "12M": 4.80},
            "JPY": {"1M": -0.05, "3M": 0.00, "6M": 0.05, "12M": 0.10},
            "CAD": {"1M": 5.00, "3M": 4.95, "6M": 4.85, "12M": 4.60},
            "BRL": {"1M": 11.75, "3M": 11.60, "6M": 11.30, "12M": 10.80},
        },
        # Cross-currency basis spreads (bps)
        basis_spreads={
            "USDMXN": -15.0,
            "EURUSD": 5.0,
            "GBPUSD": 3.0,
            "USDJPY": -8.0,
            "USDCAD": 2.0,
            "USDBRL": -25.0,
        },
        # Volatility surface
        vol_surface={
            "VIX_1M": 18.5,
            "VIX_3M": 20.0,
            "USDMXN_1M": 12.5,
            "USDMXN_3M": 13.0,
            "EURUSD_1M": 7.5,
            "EURUSD_3M": 8.0,
        },
        # Average daily volume (USD equivalent)
        adv_data={
            "USDMXN_FWD": 5_000_000_000,
            "USDMXN_NDF": 3_000_000_000,
            "EURUSD_FWD": 50_000_000_000,
            "GBPUSD_FWD": 20_000_000_000,
            "USDJPY_FWD": 30_000_000_000,
            "USDBRL_NDF": 2_000_000_000,
        },
        # Margin rates by instrument type
        margin_rates={
            "FWD": {"initial": 0.03, "maintenance": 0.02},
            "NDF": {"initial": 0.02, "maintenance": 0.015},
            "OPTION": {"initial": 0.05, "maintenance": 0.04},
        },
        # Overnight funding rate (bps)
        funding_rate_bps=5.33,
        # Factor covariance matrix (annualized variance/covariance)
        factor_covariance={
            "USDMXN": {"USDMXN": 0.0156, "EURUSD": -0.0042, "GBPUSD": -0.0038, "USDJPY": 0.0025},
            "EURUSD": {"USDMXN": -0.0042, "EURUSD": 0.0056, "GBPUSD": 0.0048, "USDJPY": -0.0015},
            "GBPUSD": {"USDMXN": -0.0038, "GBPUSD": 0.0052, "EURUSD": 0.0048, "USDJPY": -0.0012},
            "USDJPY": {"USDMXN": 0.0025, "EURUSD": -0.0015, "GBPUSD": -0.0012, "USDJPY": 0.0064},
        },
        # Fee schedule (bps per instrument)
        fee_schedule={
            "FWD": {"broker": 2.0, "exchange": 1.5, "clearing": 0.5},
            "NDF": {"broker": 3.0, "exchange": 2.0, "clearing": 1.0},
            "OPTION": {"broker": 5.0, "exchange": 3.0, "clearing": 1.5},
        },
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
    )


# ---------------------------------------------------------------------------
# Convenience: raw dict forms for engine functions that accept dicts
# ---------------------------------------------------------------------------

def demo_market_dict() -> dict:
    """Market snapshot as a plain dict."""
    return demo_market_snapshot().model_dump(mode="json")


def demo_policy_dict() -> dict:
    """Policy config as a plain dict."""
    return demo_policy_config().model_dump(mode="json")


# ---------------------------------------------------------------------------
# Multi-currency trade fixtures
# ---------------------------------------------------------------------------

def demo_multi_currency_trades() -> list[dict]:
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
