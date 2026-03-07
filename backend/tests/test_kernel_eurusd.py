"""
backend/tests/test_kernel_eurusd.py
EURUSD kernel validation: INDIRECT quote convention (multiply, not divide).
"""
from __future__ import annotations

from datetime import date, datetime, timezone

import pandas as pd
import pytest


@pytest.fixture
def eurusd_market():
    from app.schemas_v1.market import MultiCurrencyMarketSnapshot, PairMarketData
    return MultiCurrencyMarketSnapshot(
        as_of=datetime(2026, 3, 1, tzinfo=timezone.utc),
        spot_rate=17.5,  # required by base class
        forward_points_by_month={},
        pairs={
            "EURUSD": PairMarketData(
                spot=1.085,
                forward_points_by_month={"2026-01": 0.001, "2026-02": 0.002},
            )
        },
    )


@pytest.fixture
def eurusd_policy():
    from app.schemas_v1.policy import PolicyConfig, HedgeRatios, CostAssumptions
    return PolicyConfig(
        hedge_ratios=HedgeRatios(confirmed=1.0, forecast=0.5),
        cost_assumptions=CostAssumptions(spread_bps=3.0),
        execution_product="FWD",
        min_trade_size_usd=10_000.0,
    )


@pytest.fixture
def eurusd_trades_df():
    return pd.DataFrame([
        {"record_id": "E001", "entity": "EU1", "type": "AR", "currency": "EUR",
         "amount": 100_000.0, "value_date": date(2026, 1, 20), "status": "CONFIRMED",
         "description": "Export", "bucket": "2026-01", "signed_local": 100_000.0},
    ])


@pytest.fixture
def empty_hedges_df():
    return pd.DataFrame(columns=["hedge_id", "pair", "instrument", "direction",
                                  "notional_local", "value_date", "status",
                                  "bucket", "signed_local"])


class TestEURUSDKernel:
    def test_forward_rate_additive(self, eurusd_trades_df, empty_hedges_df, eurusd_market, eurusd_policy):
        """EURUSD: forward_rate = spot + points (ADDITIVE)."""
        from app.engine_v1.kernel_multi import compute_hedge_plan_generic
        plan, _ = compute_hedge_plan_generic(eurusd_trades_df, empty_hedges_df, eurusd_market, eurusd_policy, pair="EURUSD")
        b = plan.buckets[0]
        assert abs(b.forward_rate - (1.085 + 0.001)) < 1e-9

    def test_action_usd_uses_multiply_not_divide(self, eurusd_trades_df, empty_hedges_df, eurusd_market, eurusd_policy):
        """INDIRECT: USD = EUR * rate (not EUR / rate)."""
        from app.engine_v1.kernel_multi import compute_hedge_plan_generic
        plan, _ = compute_hedge_plan_generic(eurusd_trades_df, empty_hedges_df, eurusd_market, eurusd_policy, pair="EURUSD")
        b = plan.buckets[0]
        # 100,000 EUR confirmed, ratio 1.0 => action = 100,000 EUR
        # action_usd = 100,000 * (1.085 + 0.001) = 108,600
        forward_rate = 1.085 + 0.001
        expected_usd = 100_000.0 * forward_rate
        assert abs(b.action_usd - expected_usd) < 0.01

    def test_action_usd_is_not_divide(self, eurusd_trades_df, empty_hedges_df, eurusd_market, eurusd_policy):
        """INDIRECT: must NOT divide (wrong USDMXN formula applied to EUR)."""
        from app.engine_v1.kernel_multi import compute_hedge_plan_generic
        plan, _ = compute_hedge_plan_generic(eurusd_trades_df, empty_hedges_df, eurusd_market, eurusd_policy, pair="EURUSD")
        b = plan.buckets[0]
        forward_rate = 1.085 + 0.001
        wrong_usd = 100_000.0 / forward_rate  # ~92,081 (wrong!)
        correct_usd = 100_000.0 * forward_rate  # ~108,600 (correct)
        assert abs(b.action_usd - correct_usd) < 0.01
        assert abs(b.action_usd - wrong_usd) > 100.0  # very different

    def test_local_ccy_is_eur(self, eurusd_trades_df, empty_hedges_df, eurusd_market, eurusd_policy):
        from app.engine_v1.kernel_multi import compute_hedge_plan_generic
        plan, _ = compute_hedge_plan_generic(eurusd_trades_df, empty_hedges_df, eurusd_market, eurusd_policy, pair="EURUSD")
        assert plan.local_ccy == "EUR"

    def test_direction_string_uses_eur(self, eurusd_trades_df, empty_hedges_df, eurusd_market, eurusd_policy):
        from app.engine_v1.kernel_multi import compute_hedge_plan_generic
        plan, _ = compute_hedge_plan_generic(eurusd_trades_df, empty_hedges_df, eurusd_market, eurusd_policy, pair="EURUSD")
        b = plan.buckets[0]
        # AR trade => positive flow => target negative => SELL_EUR_BUY_USD
        assert b.action_direction == "SELL_EUR_BUY_USD"
