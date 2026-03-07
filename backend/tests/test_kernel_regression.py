"""
backend/tests/test_kernel_regression.py
USDMXN regression gate: kernel_multi must produce bit-identical results to kernel.

This test is the acceptance gate for the multi-currency engine.
USDMXN_REGRESSION_DELTA must be 0.0 for every numeric field.
"""
from __future__ import annotations

from datetime import date, datetime, timezone

import pandas as pd
import pytest


# Inline fixtures (cannot use engine/tests/conftest.py due to import path constraints)

@pytest.fixture
def sample_market():
    from app.schemas_v1.market import MarketSnapshot
    return MarketSnapshot(
        as_of=datetime(2026, 3, 1, tzinfo=timezone.utc),
        spot_rate=17.5,
        forward_points_by_month={"2026-01": 0.025, "2026-02": 0.05},
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


@pytest.fixture
def sample_trades_df():
    return pd.DataFrame([
        {"record_id": "T001", "entity": "E1", "type": "AR", "currency": "MXN",
         "amount": 1_000_000.0, "value_date": date(2026, 1, 15), "status": "CONFIRMED",
         "description": "Invoice", "bucket": "2026-01", "signed_mxn": 1_000_000.0,
         "signed_local": 1_000_000.0},
        {"record_id": "T002", "entity": "E1", "type": "AP", "currency": "MXN",
         "amount": 500_000.0, "value_date": date(2026, 2, 15), "status": "FORECAST",
         "description": "Payment", "bucket": "2026-02", "signed_mxn": -500_000.0,
         "signed_local": -500_000.0},
    ])


@pytest.fixture
def empty_hedges_df():
    return pd.DataFrame(columns=[
        "hedge_id", "instrument", "direction", "notional_mxn", "value_date",
        "status", "bucket", "signed_mxn", "signed_local", "pair", "notional_local",
    ])


class TestUSDMXNRegressionGate:
    """Every numeric field must match legacy kernel exactly (delta == 0.0)."""

    def test_bucket_count_matches(self, sample_trades_df, empty_hedges_df, sample_market, sample_policy):
        from app.engine_v1.kernel import compute_hedge_plan
        from app.engine_v1.kernel_multi import compute_hedge_plan_generic

        # Legacy kernel uses signed_mxn column
        legacy_plan, _ = compute_hedge_plan(
            sample_trades_df, empty_hedges_df, sample_market, sample_policy
        )
        multi_plan, _ = compute_hedge_plan_generic(
            sample_trades_df, empty_hedges_df, sample_market, sample_policy, pair="USDMXN"
        )
        assert len(legacy_plan.buckets) == len(multi_plan.buckets)

    def test_bucket_confirmed_flow_identical(self, sample_trades_df, empty_hedges_df, sample_market, sample_policy):
        from app.engine_v1.kernel import compute_hedge_plan
        from app.engine_v1.kernel_multi import compute_hedge_plan_generic

        legacy_plan, _ = compute_hedge_plan(sample_trades_df, empty_hedges_df, sample_market, sample_policy)
        multi_plan, _ = compute_hedge_plan_generic(sample_trades_df, empty_hedges_df, sample_market, sample_policy, pair="USDMXN")

        for lb, mb in zip(legacy_plan.buckets, multi_plan.buckets):
            assert lb.bucket == mb.bucket
            assert lb.confirmed_flow_mxn == mb.confirmed_flow_local, (
                f"Bucket {lb.bucket}: confirmed_flow delta = "
                f"{abs(lb.confirmed_flow_mxn - mb.confirmed_flow_local)}"
            )

    def test_bucket_forward_rate_identical(self, sample_trades_df, empty_hedges_df, sample_market, sample_policy):
        from app.engine_v1.kernel import compute_hedge_plan
        from app.engine_v1.kernel_multi import compute_hedge_plan_generic

        legacy_plan, _ = compute_hedge_plan(sample_trades_df, empty_hedges_df, sample_market, sample_policy)
        multi_plan, _ = compute_hedge_plan_generic(sample_trades_df, empty_hedges_df, sample_market, sample_policy, pair="USDMXN")

        for lb, mb in zip(legacy_plan.buckets, multi_plan.buckets):
            assert lb.forward_rate == mb.forward_rate, (
                f"Bucket {lb.bucket}: forward_rate delta = {abs(lb.forward_rate - mb.forward_rate)}"
            )

    def test_bucket_action_usd_identical(self, sample_trades_df, empty_hedges_df, sample_market, sample_policy):
        from app.engine_v1.kernel import compute_hedge_plan
        from app.engine_v1.kernel_multi import compute_hedge_plan_generic

        legacy_plan, _ = compute_hedge_plan(sample_trades_df, empty_hedges_df, sample_market, sample_policy)
        multi_plan, _ = compute_hedge_plan_generic(sample_trades_df, empty_hedges_df, sample_market, sample_policy, pair="USDMXN")

        for lb, mb in zip(legacy_plan.buckets, multi_plan.buckets):
            delta = abs(lb.action_usd - mb.action_usd)
            assert delta == 0.0, f"Bucket {lb.bucket}: action_usd delta = {delta}"

    def test_bucket_friction_usd_identical(self, sample_trades_df, empty_hedges_df, sample_market, sample_policy):
        from app.engine_v1.kernel import compute_hedge_plan
        from app.engine_v1.kernel_multi import compute_hedge_plan_generic

        legacy_plan, _ = compute_hedge_plan(sample_trades_df, empty_hedges_df, sample_market, sample_policy)
        multi_plan, _ = compute_hedge_plan_generic(sample_trades_df, empty_hedges_df, sample_market, sample_policy, pair="USDMXN")

        for lb, mb in zip(legacy_plan.buckets, multi_plan.buckets):
            delta = abs(lb.friction_usd - mb.friction_usd)
            assert delta == 0.0, f"Bucket {lb.bucket}: friction_usd delta = {delta}"

    def test_summary_total_action_usd_identical(self, sample_trades_df, empty_hedges_df, sample_market, sample_policy):
        from app.engine_v1.kernel import compute_hedge_plan
        from app.engine_v1.kernel_multi import compute_hedge_plan_generic

        legacy_plan, _ = compute_hedge_plan(sample_trades_df, empty_hedges_df, sample_market, sample_policy)
        multi_plan, _ = compute_hedge_plan_generic(sample_trades_df, empty_hedges_df, sample_market, sample_policy, pair="USDMXN")

        delta = abs(legacy_plan.summary.total_action_usd - multi_plan.summary.total_action_usd)
        assert delta == 0.0, f"Summary total_action_usd delta = {delta}"

    def test_to_legacy_plan_converts_correctly(self, sample_trades_df, empty_hedges_df, sample_market, sample_policy):
        """GenericHedgePlan.to_legacy_plan() must match compute_hedge_plan() output exactly."""
        from app.engine_v1.kernel import compute_hedge_plan
        from app.engine_v1.kernel_multi import compute_hedge_plan_generic

        legacy_plan, _ = compute_hedge_plan(sample_trades_df, empty_hedges_df, sample_market, sample_policy)
        multi_plan, _ = compute_hedge_plan_generic(sample_trades_df, empty_hedges_df, sample_market, sample_policy, pair="USDMXN")
        converted = multi_plan.to_legacy_plan()

        assert converted.summary.total_action_usd == legacy_plan.summary.total_action_usd
        assert converted.summary.total_friction_usd == legacy_plan.summary.total_friction_usd
        for lb, cb in zip(legacy_plan.buckets, converted.buckets):
            assert lb.action_usd == cb.action_usd
            assert lb.forward_rate == cb.forward_rate
