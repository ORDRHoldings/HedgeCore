"""
backend/tests/test_roll_mixed_instrument.py
FIX-08: FWD→NDF instrument transition in roll ladder.
"""
from __future__ import annotations
import pytest


class TestRollMixedInstrument:
    def test_ndf_pair_forced_to_ndf(self):
        """USDBRL (NDF pair) forces instrument to NDF even if FWD requested."""
        from app.engine_v1.fx_roll_engine import generate_roll_ladder
        positions = [{"bucket": "2026-03", "notional_usd": 500_000, "instrument": "FWD"}]
        market = {"forward_points_by_month": {}, "spot_usdmxn": 5.20}
        policy = {"execution_product": "FWD", "cost_assumptions": {"spread_bps": 15.0}}
        result = generate_roll_ladder(positions, market, policy, pair="USDBRL")
        # USDBRL is NDF-only — all rolls should transition to NDF
        ndf_rolls = [r for r in result.rolls if r.instrument == "NDF"]
        assert len(ndf_rolls) > 0, "USDBRL rolls must use NDF instrument"

    def test_roll_entry_has_instrument_field(self):
        """RollEntry dataclass includes instrument and instrument_transition fields."""
        from app.engine_v1.fx_roll_engine import RollEntry
        entry = RollEntry(
            roll_date="2026-04",
            from_bucket="2026-03",
            to_bucket="2026-04",
            notional_usd=100_000,
            forward_points_old=0.025,
            forward_points_new=0.050,
            carry_cost_usd=250.0,
            slippage_usd=50.0,
            total_roll_cost_usd=300.0,
            instrument="NDF",
            instrument_transition="FWD→NDF",
        )
        d = entry.to_dict()
        assert d["instrument"] == "NDF"
        assert d["instrument_transition"] == "FWD→NDF"

    def test_usdmxn_stays_fwd(self):
        """USDMXN (deliverable) within normal tenor stays FWD."""
        from app.engine_v1.fx_roll_engine import generate_roll_ladder
        positions = [{"bucket": "2026-03", "notional_usd": 500_000, "instrument": "FWD"}]
        market = {"forward_points_by_month": {}, "spot_usdmxn": 17.5}
        policy = {"execution_product": "FWD", "cost_assumptions": {"spread_bps": 5.0}}
        result = generate_roll_ladder(positions, market, policy, pair="USDMXN")
        fwd_rolls = [r for r in result.rolls if r.instrument == "FWD"]
        assert len(fwd_rolls) > 0, "Short-dated USDMXN should remain FWD"
