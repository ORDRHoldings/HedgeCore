"""
backend/tests/test_tca_exec_window.py
FIX-07: Configurable execution window for vol drift estimation.
"""
from __future__ import annotations
import math
import pytest


class TestExecutionWindow:
    def test_longer_window_higher_vol_drift(self):
        """5-day execution window → higher vol drift than 1-day."""
        from app.engine_v1.transaction_cost_model import compute_transaction_costs
        actions = [{"bucket": "2026-01", "action_usd": 1_000_000}]
        market = {"vol_surface": {"USDMXN_1M": 12.5}, "fee_schedule": {}}
        policy = {"execution_product": "FWD", "cost_assumptions": {"spread_bps": 5.0}, "broker_commission_bps": 0}

        result_1d = compute_transaction_costs(actions, [], market, policy, execution_window_hours=24.0)
        result_5d = compute_transaction_costs(actions, [], market, policy, execution_window_hours=120.0)

        drift_1d = result_1d.total_vol_drift
        drift_5d = result_5d.total_vol_drift
        assert drift_5d > drift_1d, f"5-day drift ({drift_5d:.2f}) must exceed 1-day ({drift_1d:.2f})"

    def test_execution_window_scales_sqrt(self):
        """Vol drift scales as sqrt(execution_time) — 4× time → 2× drift."""
        from app.engine_v1.transaction_cost_model import compute_transaction_costs
        actions = [{"bucket": "2026-01", "action_usd": 1_000_000}]
        market = {"vol_surface": {"USDMXN_1M": 12.5}, "fee_schedule": {}}
        policy = {"execution_product": "FWD", "cost_assumptions": {"spread_bps": 5.0}, "broker_commission_bps": 0}

        result_1d = compute_transaction_costs(actions, [], market, policy, execution_window_hours=24.0)
        result_4d = compute_transaction_costs(actions, [], market, policy, execution_window_hours=96.0)

        ratio = result_4d.total_vol_drift / result_1d.total_vol_drift
        assert abs(ratio - 2.0) < 0.05, f"4× time should give 2× drift (sqrt), got ratio={ratio:.3f}"
