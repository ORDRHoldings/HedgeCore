"""
backend/tests/test_risk_allocator_mctr.py
FIX-01: MCTR-based risk allocation — replaces linear index decay.
"""
from __future__ import annotations
import math
import pytest


class TestMCTRNotLinearDecay:
    def test_uniform_notional_same_var_proxy(self):
        """All buckets with same notional and same pair → same risk_reduction (no decay)."""
        from app.engine_v1.risk_allocator import _build_candidates
        actions = [
            {"bucket": f"2026-{m:02d}", "action_usd": 500_000, "pair": "USDMXN"}
            for m in range(1, 7)
        ]
        market = {"vol_surface": {"USDMXN_1M": 12.5}}
        policy = {"execution_product": "NDF", "cost_assumptions": {"spread_bps": 5.0}}
        candidates = _build_candidates(actions, [], [], policy, market)
        values = [c.marginal_risk_reduction for c in candidates]
        # VaR proxy depends only on notional × vol — not on bucket index
        assert max(values) - min(values) < 1.0, (
            f"MCTR must not decay linearly by index: spread={max(values)-min(values):.2f}"
        )

    def test_fallback_var_proxy_formula(self):
        """VaR proxy = notional × vol × sqrt(10/252) × 1.645."""
        from app.engine_v1.risk_allocator import _build_candidates
        actions = [{"bucket": "2026-01", "action_usd": 1_000_000, "pair": "USDMXN"}]
        market = {"vol_surface": {"USDMXN_1M": 15.0}}  # 15% vol
        policy = {"execution_product": "NDF", "cost_assumptions": {"spread_bps": 5.0}}
        candidates = _build_candidates(actions, [], [], policy, market)
        assert len(candidates) == 1
        expected = 1_000_000 * 0.15 * math.sqrt(10 / 252.0) * 1.645
        assert abs(candidates[0].marginal_risk_reduction - expected) < 1.0

    def test_factor_risk_overrides_var_proxy(self):
        """When _factor_risk_contributions present, MCTR × notional is used."""
        from app.engine_v1.risk_allocator import _build_candidates
        actions = [{"bucket": "2026-01", "action_usd": 1_000_000, "pair": "USDMXN"}]
        market = {
            "_factor_risk_contributions": {"USDMXN": {"marginal_contribution": 0.42}},
            "vol_surface": {"USDMXN_1M": 12.5},
        }
        policy = {"execution_product": "NDF", "cost_assumptions": {"spread_bps": 5.0}}
        candidates = _build_candidates(actions, [], [], policy, market)
        expected = 0.42 * 1_000_000
        assert abs(candidates[0].marginal_risk_reduction - expected) < 0.01

    def test_backward_compat_no_market_arg(self):
        """_build_candidates still works without market param (backward compat)."""
        from app.engine_v1.risk_allocator import _build_candidates
        actions = [{"bucket": "2026-01", "action_usd": 500_000}]
        policy = {"execution_product": "NDF", "cost_assumptions": {"spread_bps": 5.0}}
        candidates = _build_candidates(actions, [], [], policy)
        assert len(candidates) == 1
        assert candidates[0].marginal_risk_reduction > 0
