"""Tests for app.engine_v1.transaction_cost_model."""

import math
import pytest

from app.engine_v1.transaction_cost_model import (
    PositionCost,
    TransactionCostResult,
    compute_transaction_costs,
)


def _action(bucket="2026-03", action_usd=1_000_000, instrument="FWD"):
    return {"bucket": bucket, "action_usd": action_usd, "instrument": instrument}


def _slippage(bucket="2026-03", slippage_usd=500, slippage_bps=5.0):
    return {"bucket": bucket, "slippage_usd": slippage_usd, "slippage_bps": slippage_bps}


def _base_market(**overrides):
    m = {
        "fee_schedule": {
            "FWD": {"exchange": 0.5, "clearing": 0.3},
            "NDF": {"exchange": 1.0, "clearing": 0.5},
        },
        "vol_surface": {"USDMXN_1M": 12.5},
    }
    m.update(overrides)
    return m


def _base_policy(**overrides):
    p = {
        "broker_commission_bps": 2.0,
        "execution_product": "FWD",
    }
    p.update(overrides)
    return p


# ---------------------------------------------------------------------------
# Dataclass serialization
# ---------------------------------------------------------------------------

class TestPositionCostToDict:
    def test_to_dict(self):
        pc = PositionCost(
            bucket="2026-03", instrument="FWD", notional_usd=1_000_000,
            slippage_cost=500, broker_commission=200, exchange_fee=50,
            clearing_fee=30, vol_drift_adjustment=100, total_cost=880,
            total_cost_bps=8.8,
        )
        d = pc.to_dict()
        assert d["bucket"] == "2026-03"
        assert d["total_cost"] == 880


class TestTransactionCostResultToDict:
    def test_to_dict_empty(self):
        r = TransactionCostResult()
        d = r.to_dict()
        assert d["positions"] == []
        assert d["total_transaction_cost"] == 0.0


# ---------------------------------------------------------------------------
# compute_transaction_costs
# ---------------------------------------------------------------------------

class TestComputeTransactionCosts:
    def test_empty_actions(self):
        result = compute_transaction_costs([], [], _base_market(), _base_policy())
        assert result.total_transaction_cost == 0.0
        assert result.positions == []

    def test_sub_one_notional_skipped(self):
        result = compute_transaction_costs(
            [_action(action_usd=0.5)], [], _base_market(), _base_policy()
        )
        assert len(result.positions) == 0

    def test_single_position_cost_breakdown(self):
        actions = [_action(action_usd=1_000_000)]
        slippages = [_slippage(slippage_usd=500)]
        result = compute_transaction_costs(actions, slippages, _base_market(), _base_policy())
        assert len(result.positions) == 1
        pc = result.positions[0]
        assert pc.slippage_cost == 500
        assert pc.broker_commission == pytest.approx(200.0)  # 2bps on 1M
        assert pc.exchange_fee == pytest.approx(50.0)  # 0.5bps on 1M
        assert pc.clearing_fee == pytest.approx(30.0)  # 0.3bps on 1M

    def test_vol_drift_positive(self):
        actions = [_action(action_usd=1_000_000)]
        result = compute_transaction_costs(actions, [], _base_market(), _base_policy())
        pc = result.positions[0]
        assert pc.vol_drift_adjustment > 0

    def test_vol_drift_formula(self):
        """vol_drift = pair_vol * sqrt(exec_days/252) * notional."""
        notional = 1_000_000
        pair_vol = 12.5 / 100.0  # 0.125
        exec_window_hours = 24.0
        exec_days = exec_window_hours / 24.0
        execution_time = exec_days / 252.0
        expected_drift = pair_vol * math.sqrt(execution_time) * notional

        actions = [_action(action_usd=notional)]
        result = compute_transaction_costs(
            actions, [], _base_market(), _base_policy(), execution_window_hours=24.0
        )
        assert result.positions[0].vol_drift_adjustment == pytest.approx(expected_drift, rel=1e-6)

    def test_custom_execution_window(self):
        actions = [_action(action_usd=1_000_000)]
        result_24h = compute_transaction_costs(
            actions, [], _base_market(), _base_policy(), execution_window_hours=24.0
        )
        result_48h = compute_transaction_costs(
            actions, [], _base_market(), _base_policy(), execution_window_hours=48.0
        )
        # Longer window = more drift
        assert result_48h.positions[0].vol_drift_adjustment > result_24h.positions[0].vol_drift_adjustment

    def test_total_cost_is_sum_of_components(self):
        actions = [_action(action_usd=1_000_000)]
        slippages = [_slippage(slippage_usd=500)]
        result = compute_transaction_costs(actions, slippages, _base_market(), _base_policy())
        pc = result.positions[0]
        expected = pc.slippage_cost + pc.broker_commission + pc.exchange_fee + pc.clearing_fee + pc.vol_drift_adjustment
        assert pc.total_cost == pytest.approx(expected, rel=1e-9)

    def test_total_cost_bps_calculation(self):
        actions = [_action(action_usd=1_000_000)]
        result = compute_transaction_costs(actions, [], _base_market(), _base_policy())
        pc = result.positions[0]
        expected_bps = pc.total_cost / pc.notional_usd * 10000
        assert pc.total_cost_bps == pytest.approx(expected_bps, rel=1e-9)

    def test_portfolio_totals_match_position_sums(self):
        actions = [_action(bucket="2026-03"), _action(bucket="2026-06", action_usd=500_000)]
        slippages = [_slippage(bucket="2026-03", slippage_usd=500), _slippage(bucket="2026-06", slippage_usd=200)]
        result = compute_transaction_costs(actions, slippages, _base_market(), _base_policy())
        assert result.total_slippage == pytest.approx(sum(p.slippage_cost for p in result.positions))
        assert result.total_commission == pytest.approx(sum(p.broker_commission for p in result.positions))
        assert result.total_transaction_cost == pytest.approx(sum(p.total_cost for p in result.positions))

    def test_ndf_instrument_uses_ndf_fees(self):
        actions = [_action(action_usd=1_000_000, instrument="NDF")]
        result = compute_transaction_costs(actions, [], _base_market(), _base_policy())
        pc = result.positions[0]
        assert pc.exchange_fee == pytest.approx(100.0)  # 1.0bps on 1M
        assert pc.clearing_fee == pytest.approx(50.0)   # 0.5bps on 1M

    def test_no_fee_schedule_uses_zero(self):
        market = _base_market(fee_schedule={})
        actions = [_action(action_usd=1_000_000)]
        result = compute_transaction_costs(actions, [], market, _base_policy())
        pc = result.positions[0]
        assert pc.exchange_fee == 0.0
        assert pc.clearing_fee == 0.0

    def test_negative_action_usd_uses_absolute(self):
        actions = [_action(action_usd=-1_000_000)]
        result = compute_transaction_costs(actions, [], _base_market(), _base_policy())
        assert result.positions[0].notional_usd == 1_000_000

    def test_total_cost_bps_portfolio_level(self):
        actions = [_action(action_usd=1_000_000), _action(bucket="2026-06", action_usd=1_000_000)]
        result = compute_transaction_costs(actions, [], _base_market(), _base_policy())
        total_notional = sum(p.notional_usd for p in result.positions)
        expected_bps = result.total_transaction_cost / total_notional * 10000
        assert result.total_cost_bps == pytest.approx(expected_bps, rel=1e-9)
