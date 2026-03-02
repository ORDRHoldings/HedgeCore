"""
backend/tests/test_nav_attribution_delta.py
FIX-04: NAV attribution uses actual FX delta cascade, not flat 1%.
"""
from __future__ import annotations
import pytest


POSITIONS = [
    {"trade_id": "T1", "currency": "MXN", "amount_local": 1_000_000, "amount_usd": 57_143},
]


class TestNavAttributionDelta:
    def test_fx_deltas_from_market_snapshot(self):
        """When market.fx_deltas present, uses actual delta not 1%."""
        from app.engine_v1.nav_attribution_engine import compute_nav_attribution
        market = {
            "fx_rates": {"USDMXN": 17.5},
            "fx_deltas": {"USDMXN": 0.025},  # 2.5% actual move
            "interest_curves": {},
            "basis_spreads": {},
            "funding_rate_bps": 0,
        }
        result = compute_nav_attribution(POSITIONS, market)
        pos = result.positions[0]
        expected = 57_143 * 0.025
        assert abs(pos.fx_contribution - expected) < 1.0

    def test_flat_1pct_not_used_when_delta_available(self):
        """Flat 1% fallback must NOT be used when fx_deltas are present."""
        from app.engine_v1.nav_attribution_engine import compute_nav_attribution
        market = {
            "fx_rates": {"USDMXN": 17.5},
            "fx_deltas": {"USDMXN": 0.05},  # 5% — clearly different from 1%
            "interest_curves": {},
            "basis_spreads": {},
            "funding_rate_bps": 0,
        }
        result = compute_nav_attribution(POSITIONS, market)
        pos = result.positions[0]
        flat_1pct = 57_143 * 0.01
        assert abs(pos.fx_contribution - flat_1pct) > 100.0, (
            "Should NOT use flat 1% when fx_deltas are provided"
        )

    def test_backward_compat_with_fx_delta_arg(self):
        """Explicit fx_delta= arg still works (backward compat)."""
        from app.engine_v1.nav_attribution_engine import compute_nav_attribution
        market = {
            "fx_rates": {},
            "interest_curves": {},
            "basis_spreads": {},
            "funding_rate_bps": 0,
        }
        result = compute_nav_attribution(POSITIONS, market, fx_delta=0.03)
        pos = result.positions[0]
        expected = 57_143 * 0.03
        assert abs(pos.fx_contribution - expected) < 1.0
