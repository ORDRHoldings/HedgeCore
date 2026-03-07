"""
backend/tests/test_kernel_ndf.py
USDBRL NDF kernel validation: PERCENTAGE forward point format.

Critical test: 5.20 * 1.025 = 5.33 (not 5.20 + 2.5 = 7.70).
"""
from __future__ import annotations

from datetime import date, datetime, timezone

import pandas as pd
import pytest


@pytest.fixture
def brl_market():
    from app.schemas_v1.market import MultiCurrencyMarketSnapshot, PairMarketData
    return MultiCurrencyMarketSnapshot(
        as_of=datetime(2026, 3, 1, tzinfo=timezone.utc),
        spot_rate=17.5,
        forward_points_by_month={},
        pairs={
            "USDBRL": PairMarketData(
                spot=5.20,
                forward_points_by_month={"2026-01": 2.5},  # 2.5% annualized differential
            )
        },
    )


@pytest.fixture
def brl_policy():
    from app.schemas_v1.policy import PolicyConfig, HedgeRatios, CostAssumptions
    return PolicyConfig(
        hedge_ratios=HedgeRatios(confirmed=1.0, forecast=0.5),
        cost_assumptions=CostAssumptions(spread_bps=15.0),
        execution_product="NDF",
        min_trade_size_usd=10_000.0,
    )


@pytest.fixture
def brl_trades_df():
    return pd.DataFrame([
        {"record_id": "B001", "entity": "BR1", "type": "AR", "currency": "BRL",
         "amount": 1_000_000.0, "value_date": date(2026, 1, 25), "status": "CONFIRMED",
         "description": "Export", "bucket": "2026-01", "signed_local": 1_000_000.0},
    ])


@pytest.fixture
def empty_hedges_df():
    return pd.DataFrame(columns=["hedge_id", "pair", "instrument", "direction",
                                  "notional_local", "value_date", "status",
                                  "bucket", "signed_local"])


class TestUSDBRLNDFKernel:
    def test_forward_rate_is_percentage_not_additive(self, brl_trades_df, empty_hedges_df, brl_market, brl_policy):
        """PERCENTAGE: 5.20 * (1 + 2.5/100) = 5.33, NOT 5.20 + 2.5 = 7.70."""
        from app.engine_v1.kernel_multi import compute_hedge_plan_generic
        plan, _ = compute_hedge_plan_generic(brl_trades_df, empty_hedges_df, brl_market, brl_policy, pair="USDBRL")
        b = plan.buckets[0]
        expected_fwd = 5.20 * (1 + 2.5 / 100)  # 5.33
        wrong_fwd = 5.20 + 2.5  # 7.70 (additive — wrong)
        assert abs(b.forward_rate - expected_fwd) < 1e-9, (
            f"forward_rate should be {expected_fwd:.4f} (percentage), got {b.forward_rate:.4f}"
        )
        assert abs(b.forward_rate - wrong_fwd) > 1.0, (
            f"forward_rate must NOT be the additive result {wrong_fwd}"
        )

    def test_action_usd_uses_correct_forward(self, brl_trades_df, empty_hedges_df, brl_market, brl_policy):
        """DIRECT + PERCENTAGE: action_usd = BRL / (5.20 * 1.025)."""
        from app.engine_v1.kernel_multi import compute_hedge_plan_generic
        plan, _ = compute_hedge_plan_generic(brl_trades_df, empty_hedges_df, brl_market, brl_policy, pair="USDBRL")
        b = plan.buckets[0]
        correct_fwd = 5.20 * 1.025
        expected_usd = 1_000_000.0 / correct_fwd
        wrong_usd = 1_000_000.0 / (5.20 + 2.5)  # additive forward error
        assert abs(b.action_usd - expected_usd) < 0.01
        assert abs(b.action_usd - wrong_usd) > 1000.0  # significant difference

    def test_ndf_settlement_flag(self):
        """USDBRL must be marked as NDF."""
        from app.engine_v1.pair_registry import PAIR_REGISTRY
        assert PAIR_REGISTRY["USDBRL"].is_ndf is True

    def test_carry_note_mentions_ndf(self, brl_trades_df, empty_hedges_df, brl_market, brl_policy):
        from app.engine_v1.kernel_multi import compute_hedge_plan_generic
        plan, _ = compute_hedge_plan_generic(brl_trades_df, empty_hedges_df, brl_market, brl_policy, pair="USDBRL")
        b = plan.buckets[0]
        assert "NDF" in b.carry_note or "ndf" in b.carry_note.lower()

    def test_local_ccy_is_brl(self, brl_trades_df, empty_hedges_df, brl_market, brl_policy):
        from app.engine_v1.kernel_multi import compute_hedge_plan_generic
        plan, _ = compute_hedge_plan_generic(brl_trades_df, empty_hedges_df, brl_market, brl_policy, pair="USDBRL")
        assert plan.local_ccy == "BRL"
