"""Tests for app.engine_v1.demo_fixtures."""

import pytest

from app.engine_v1.demo_fixtures import (
    demo_market_dict,
    demo_market_snapshot,
    demo_multi_currency_trades,
    demo_policy_config,
    demo_policy_dict,
)
from app.schemas_v1.market_ext import ExtendedMarketSnapshot
from app.schemas_v1.policy_ext import ExtendedPolicyConfig


class TestDemoMarketSnapshot:
    def test_returns_correct_type(self):
        snap = demo_market_snapshot()
        assert isinstance(snap, ExtendedMarketSnapshot)

    def test_spot_rate(self):
        snap = demo_market_snapshot()
        assert snap.spot_rate == 17.15

    def test_fx_rates_populated(self):
        snap = demo_market_snapshot()
        assert len(snap.fx_rates) >= 26
        assert snap.fx_rates["EURUSD"] == 1.0850
        assert snap.fx_rates["USDMXN"] == 17.15
        assert snap.fx_rates["USDJPY"] == 149.50

    def test_forward_points_by_month(self):
        snap = demo_market_snapshot()
        assert len(snap.forward_points_by_month) == 12

    def test_pair_forward_points(self):
        snap = demo_market_snapshot()
        assert "USDMXN" in snap.pair_forward_points
        assert "EURUSD" in snap.pair_forward_points
        assert len(snap.pair_forward_points) >= 10

    def test_interest_curves(self):
        snap = demo_market_snapshot()
        assert "USD" in snap.interest_curves
        assert "MXN" in snap.interest_curves
        assert "EUR" in snap.interest_curves
        for ccy, curve in snap.interest_curves.items():
            assert "1M" in curve
            assert "12M" in curve

    def test_vol_surface(self):
        snap = demo_market_snapshot()
        assert "VIX_1M" in snap.vol_surface
        assert snap.vol_surface["VIX_1M"] == 16.5
        assert "USDMXN_1M" in snap.vol_surface

    def test_margin_rates(self):
        snap = demo_market_snapshot()
        assert "FWD" in snap.margin_rates
        assert "NDF" in snap.margin_rates
        assert "OPTION" in snap.margin_rates
        assert snap.margin_rates["FWD"]["initial"] == 0.03

    def test_factor_covariance(self):
        snap = demo_market_snapshot()
        assert "USDMXN" in snap.factor_covariance
        assert "EURUSD" in snap.factor_covariance
        # Symmetric check
        assert snap.factor_covariance["USDMXN"]["EURUSD"] == snap.factor_covariance["EURUSD"]["USDMXN"]

    def test_adv_data(self):
        snap = demo_market_snapshot()
        assert "EURUSD" in snap.adv_data
        assert snap.adv_data["EURUSD"] == 750_000_000_000

    def test_basis_spreads(self):
        snap = demo_market_snapshot()
        assert "USDMXN" in snap.basis_spreads

    def test_fee_schedule(self):
        snap = demo_market_snapshot()
        assert "FWD" in snap.fee_schedule
        assert "broker" in snap.fee_schedule["FWD"]

    def test_funding_rate(self):
        snap = demo_market_snapshot()
        assert snap.funding_rate_bps == 5.33

    def test_as_of_set(self):
        snap = demo_market_snapshot()
        assert snap.as_of is not None


class TestDemoPolicyConfig:
    def test_returns_correct_type(self):
        policy = demo_policy_config()
        assert isinstance(policy, ExtendedPolicyConfig)

    def test_bucket_mode(self):
        policy = demo_policy_config()
        assert policy.bucket_mode == "CALENDAR_MONTH"

    def test_hedge_ratios(self):
        policy = demo_policy_config()
        assert policy.hedge_ratios.confirmed == 0.80
        assert policy.hedge_ratios.forecast == 0.50

    def test_cost_assumptions(self):
        policy = demo_policy_config()
        assert policy.cost_assumptions.spread_bps == 5.0

    def test_execution_product(self):
        policy = demo_policy_config()
        assert policy.execution_product == "FWD"

    def test_hedge_bands(self):
        policy = demo_policy_config()
        assert "confirmed" in policy.hedge_bands
        assert "forecast" in policy.hedge_bands
        assert policy.hedge_bands["confirmed"] == [0.50, 1.00]

    def test_margin_budget(self):
        policy = demo_policy_config()
        assert policy.margin_budget_usd == 5_000_000.0

    def test_governance_params(self):
        policy = demo_policy_config()
        assert policy.cooling_off_minutes == 15
        assert policy.dual_approval_threshold_usd == 10_000_000.0

    def test_capital_adequacy_params(self):
        policy = demo_policy_config()
        assert policy.min_capital_ratio == 1.5
        assert policy.max_instrument_concentration_pct == 0.25

    def test_forward_arbitrage_tolerances(self):
        policy = demo_policy_config()
        assert policy.forward_arbitrage_soft_tolerance == 0.005
        assert policy.forward_arbitrage_hard_tolerance == 0.02


class TestDemoMarketDict:
    def test_returns_dict(self):
        d = demo_market_dict()
        assert isinstance(d, dict)

    def test_contains_expected_keys(self):
        d = demo_market_dict()
        assert "spot_rate" in d
        assert "fx_rates" in d
        assert "forward_points_by_month" in d
        assert "interest_curves" in d
        assert "vol_surface" in d

    def test_serializable_values(self):
        import json
        d = demo_market_dict()
        # Should be JSON-serializable
        json_str = json.dumps(d)
        assert len(json_str) > 0


class TestDemoPolicyDict:
    def test_returns_dict(self):
        d = demo_policy_dict()
        assert isinstance(d, dict)

    def test_contains_expected_keys(self):
        d = demo_policy_dict()
        assert "bucket_mode" in d
        assert "hedge_ratios" in d
        assert "execution_product" in d

    def test_serializable_values(self):
        import json
        d = demo_policy_dict()
        json_str = json.dumps(d)
        assert len(json_str) > 0


class TestDemoMultiCurrencyTrades:
    def test_returns_list(self):
        trades = demo_multi_currency_trades()
        assert isinstance(trades, list)

    def test_five_trades(self):
        trades = demo_multi_currency_trades()
        assert len(trades) == 5

    def test_trade_structure(self):
        trades = demo_multi_currency_trades()
        for t in trades:
            assert "trade_id" in t
            assert "type" in t
            assert "currency" in t
            assert "amount_local" in t
            assert "amount_usd" in t
            assert "maturity" in t
            assert "entity" in t
            assert "confidence" in t

    def test_currencies_diverse(self):
        trades = demo_multi_currency_trades()
        currencies = {t["currency"] for t in trades}
        assert len(currencies) >= 4
        assert "MXN" in currencies
        assert "EUR" in currencies
        assert "GBP" in currencies

    def test_trade_types(self):
        trades = demo_multi_currency_trades()
        types = {t["type"] for t in trades}
        assert "AR" in types
        assert "AP" in types

    def test_confidences(self):
        trades = demo_multi_currency_trades()
        confidences = {t["confidence"] for t in trades}
        assert "confirmed" in confidences
        assert "forecast" in confidences

    def test_unique_trade_ids(self):
        trades = demo_multi_currency_trades()
        ids = [t["trade_id"] for t in trades]
        assert len(set(ids)) == len(ids)
