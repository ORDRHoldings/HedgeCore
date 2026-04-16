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
        market = {"forward_points_by_month": {}, "spot_rate": 5.20}
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
        market = {"forward_points_by_month": {}, "spot_rate": 17.5}
        policy = {"execution_product": "FWD", "cost_assumptions": {"spread_bps": 5.0}}
        result = generate_roll_ladder(positions, market, policy, pair="USDMXN")
        fwd_rolls = [r for r in result.rolls if r.instrument == "FWD"]
        assert len(fwd_rolls) > 0, "Short-dated USDMXN should remain FWD"


# ── Regression: A3 carry-cost sign fix ───────────────────────────────────────

class TestRollCarryCostSign:
    """Regression for A3 bug: abs(carry_cost) incorrectly treated carry
    benefits as costs in total_roll_cost_usd.

    Pre-A3 bug: total_cost = abs(carry_cost) + slippage
    A3 fix:     total_cost = carry_cost + slippage  (sign preserved)
    """

    def _positions(self):
        return [{"bucket": "2026-03", "notional_usd": 1_000_000, "instrument": "FWD"}]

    def test_carry_benefit_reduces_total_roll_cost(self):
        """When new forward is cheaper (fwd_new < fwd_old), carry_cost is negative.
        The total_roll_cost should be less than slippage alone (carry benefit offsets it).
        """
        from app.engine_v1.fx_roll_engine import generate_roll_ladder

        # fwd_new < fwd_old: rolling into cheaper curve → carry benefit
        market = {
            "forward_points_by_month": {
                "2026-03": 0.50,  # old (higher premium)
                "2026-04": 0.30,  # new (lower premium → cheaper to roll)
            },
            "spot_rate": 17.15,
        }
        policy = {"cost_assumptions": {"spread_bps": 5.0}}
        result = generate_roll_ladder(self._positions(), market, policy, roll_horizon_months=1)

        assert len(result.rolls) == 1
        roll = result.rolls[0]

        # carry_cost = (0.30 - 0.50) * 1_000_000 / 17.15 ≈ -11,662 (benefit)
        assert roll.carry_cost_usd < 0, "Rolling into cheaper forward must give negative carry_cost (benefit)"

        # total_roll_cost = carry_cost + slippage = negative + small positive
        # With the A3 fix, total can be negative when benefit exceeds slippage
        slippage = roll.slippage_usd
        assert roll.total_roll_cost_usd == pytest.approx(roll.carry_cost_usd + slippage)

        # Pre-A3 bug: total would have been abs(carry_cost) + slippage = large positive
        # Confirm it is NOT equal to abs(carry_cost) + slippage
        wrong_total = abs(roll.carry_cost_usd) + slippage
        assert roll.total_roll_cost_usd != pytest.approx(wrong_total), (
            "total_roll_cost_usd should NOT equal abs(carry_cost)+slippage (that was the pre-A3 bug)"
        )

    def test_carry_cost_positive_when_more_expensive(self):
        """When new forward is more expensive (fwd_new > fwd_old), carry_cost > 0 (a real cost)."""
        from app.engine_v1.fx_roll_engine import generate_roll_ladder

        market = {
            "forward_points_by_month": {
                "2026-03": 0.30,  # old (cheaper)
                "2026-04": 0.50,  # new (more expensive)
            },
            "spot_rate": 17.15,
        }
        policy = {"cost_assumptions": {"spread_bps": 5.0}}
        result = generate_roll_ladder(self._positions(), market, policy, roll_horizon_months=1)

        roll = result.rolls[0]
        assert roll.carry_cost_usd > 0, "Rolling into pricier forward must give positive carry_cost"
        assert roll.total_roll_cost_usd == pytest.approx(roll.carry_cost_usd + roll.slippage_usd)

    def test_total_ladder_cost_sums_correctly(self):
        """total_roll_cost_usd in the ladder result must equal sum of per-roll totals."""
        from app.engine_v1.fx_roll_engine import generate_roll_ladder

        # Mix of cheaper and more expensive rolls
        market = {
            "forward_points_by_month": {
                "2026-03": 0.50,
                "2026-04": 0.30,  # cheaper roll (benefit)
                "2026-05": 0.60,  # more expensive roll (cost)
            },
            "spot_rate": 17.15,
        }
        policy = {"cost_assumptions": {"spread_bps": 5.0}}
        result = generate_roll_ladder(self._positions(), market, policy, roll_horizon_months=2)

        expected_total = sum(r.total_roll_cost_usd for r in result.rolls)
        assert result.total_roll_cost_usd == pytest.approx(expected_total)
