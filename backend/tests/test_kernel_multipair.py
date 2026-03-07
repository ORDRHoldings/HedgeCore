"""
backend/engine/tests/test_kernel_multipair.py
ARCH-01: Multi-currency kernel wrapper tests.

CRITICAL: USDMXN output must be IDENTICAL through multi-pair wrapper.
"""

from __future__ import annotations

import pytest
import pandas as pd


@pytest.fixture
def sample_trades_df():
    return pd.DataFrame([
        {"bucket": "2026-01", "status": "CONFIRMED", "signed_mxn": -1_000_000.0, "currency": "MXN"},
        {"bucket": "2026-02", "status": "FORECAST",  "signed_mxn":  500_000.0,  "currency": "MXN"},
    ])


@pytest.fixture
def sample_hedges_df():
    return pd.DataFrame([], columns=["bucket", "signed_mxn"])


@pytest.fixture
def sample_market():
    from datetime import datetime, timezone
    from app.schemas_v1.market import MarketSnapshot
    return MarketSnapshot(
        as_of=datetime(2026, 3, 1, tzinfo=timezone.utc),
        spot_rate=17.5,
        forward_points_by_month={"2026-01": 250.0, "2026-02": 500.0},
    )


@pytest.fixture
def sample_policy():
    from app.schemas_v1.policy import PolicyConfig, HedgeRatios, CostAssumptions
    return PolicyConfig(
        hedge_ratios=HedgeRatios(confirmed=1.0, forecast=0.5),
        cost_assumptions=CostAssumptions(spread_bps=5.0),
        execution_product="NDF",
        min_trade_size_usd=50_000.0,
    )


class TestMultiPairKernel:
    def test_usdmxn_produces_identical_output(
        self, sample_trades_df, sample_hedges_df, sample_market, sample_policy
    ):
        """CRITICAL: USDMXN path through multi-pair wrapper must equal legacy kernel exactly."""
        from app.engine_v1.kernel import compute_hedge_plan, compute_hedge_plan_multi

        legacy_plan, legacy_traces = compute_hedge_plan(
            sample_trades_df, sample_hedges_df, sample_market, sample_policy
        )
        multi_plan, multi_traces = compute_hedge_plan_multi(
            sample_trades_df, sample_hedges_df, sample_market, sample_policy, pair="USDMXN"
        )

        assert len(legacy_plan.buckets) == len(multi_plan.buckets)
        for lb, mb in zip(legacy_plan.buckets, multi_plan.buckets):
            assert lb.confirmed_flow_mxn == mb.confirmed_flow_mxn
            assert lb.forecast_flow_mxn == mb.forecast_flow_mxn
            assert lb.target_signed_mxn == mb.target_signed_mxn
            assert lb.forward_rate == mb.forward_rate

    def test_unknown_pair_raises(
        self, sample_trades_df, sample_hedges_df, sample_market, sample_policy
    ):
        """Unknown currency pair must raise ValueError."""
        from app.engine_v1.kernel import compute_hedge_plan_multi

        with pytest.raises(ValueError, match="No market data"):
            compute_hedge_plan_multi(
                sample_trades_df, sample_hedges_df, sample_market, sample_policy, pair="USDXYZ"
            )

    def test_default_pair_is_usdmxn(
        self, sample_trades_df, sample_hedges_df, sample_market, sample_policy
    ):
        """Default pair parameter must be USDMXN (backward compat)."""
        from app.engine_v1.kernel import compute_hedge_plan, compute_hedge_plan_multi

        legacy_plan, _ = compute_hedge_plan(
            sample_trades_df, sample_hedges_df, sample_market, sample_policy
        )
        default_plan, _ = compute_hedge_plan_multi(
            sample_trades_df, sample_hedges_df, sample_market, sample_policy
            # pair not specified — must default to USDMXN
        )
        assert len(legacy_plan.buckets) == len(default_plan.buckets)

    def test_wrapper_function_exists(self):
        """compute_hedge_plan_multi must be importable."""
        from app.engine_v1.kernel import compute_hedge_plan_multi
        assert callable(compute_hedge_plan_multi)
