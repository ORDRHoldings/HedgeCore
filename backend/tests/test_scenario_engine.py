"""Tests for engine/scenario_engine.py — deterministic portfolio stress scenarios."""
from __future__ import annotations

import pytest

from app.engine.scenario_engine import run_scenarios


# ── Minimal helpers ────────────────────────────────────────────────────

def _base_payload(
    delta_usd: float = -100_000.0,
    vega_usd: float = 0.0,
    eq_move: float = -0.10,
    vol_move: float = 0.0,
    contracts: int = 1,
    asset_class: str = "futures",
    price: float = 100.0,
    multiplier: float = 10.0,
    option_delta: float | None = None,
) -> dict:
    instrument_id = "TEST_FUT_001"
    payload: dict = {
        "portfolio": {
            "exposures": {"delta_usd": delta_usd, "vega_usd": vega_usd},
            "baseline_pnl_proxy_usd": 0.0,
        },
        "sized_hedges": [
            {"instrument_id": instrument_id, "contracts": contracts}
        ],
        "instrument_meta": {
            instrument_id: {
                "asset_class": asset_class,
                "underlying": "SPX",
                "contract_multiplier": multiplier,
            }
        },
        "market": {
            "prices": {instrument_id: price},
        },
        "scenarios": [
            {
                "scenario_id": "TEST_S1",
                "shocks": {"equity_move_pct": eq_move, "vol_move_pct": vol_move},
            }
        ],
        "costs": {},
    }
    if option_delta is not None:
        payload["market"]["option_deltas"] = {instrument_id: option_delta}
    return payload


# ── Smoke test ─────────────────────────────────────────────────────────

class TestRunScenariosSmoke:
    def test_basic_futures_scenario(self):
        out = run_scenarios(_base_payload())
        assert "results" in out
        assert len(out["results"]) == 1
        r = out["results"][0]
        assert r["scenario_id"] == "TEST_S1"
        assert "portfolio" in r
        assert "hedges" in r
        assert "net" in r

    def test_empty_scenarios(self):
        payload = _base_payload()
        payload["scenarios"] = []
        out = run_scenarios(payload)
        assert out["results"] == []
        assert any(r.get("reason") == "invalid_scenarios" for r in out["rejected"])


# ── Hedge effectiveness regression: A2 fix ────────────────────────────

class TestHedgeEffectiveness:
    """Regression for A2 effectiveness inversion bug.

    Prior to fix, effectiveness used max(0, -hedge_pnl):
      - When hedge_pnl > 0 (hedge profits, i.e. working correctly), offset = 0 → 0% effective
      - When hedge_pnl < 0 (hedge loses, i.e. broken), offset = |loss| → positive effectiveness

    Fix: effectiveness = max(0, hedge_pnl) / abs(portfolio_pnl)
    The hedge absorbs portfolio losses by *profiting*, not by losing.
    """

    def test_effective_hedge_shows_positive_effectiveness(self):
        """A long futures position profits when portfolio loses → effectiveness > 0."""
        # portfolio: delta=-100k, equity_move=-10% → portfolio_pnl = -100k * -0.10 = +10k
        # Wait — portfolio loss requires negative portfolio_pnl.
        # portfolio_pnl = baseline + delta*eq_move + vega*vol_move
        # = 0 + (-100_000)*(-0.10) + 0 = +10_000 (portfolio GAINS when short delta + market falls)
        # We need portfolio to LOSE. Use positive delta + market falls:
        # delta_usd=+100_000, eq_move=-0.10 → port_delta = 100_000 * (-0.10) = -10_000 (loss)
        # hedge: 1 futures, contracts=+1, price=100, mult=10, eq_move=-0.10
        # hedge_pnl = 1 * 10 * 100 * (-0.10) = -100 (also loses — bad hedge for this)
        # Let's use a SHORT hedge (negative contracts) to profit when market falls:
        # contracts=-1, eq_move=-0.10
        # hedge_pnl = -1 * 10 * 100 * (-0.10) = +100 (profits when market falls)
        payload = _base_payload(
            delta_usd=100_000.0,   # long delta → loses when market falls
            eq_move=-0.10,
            contracts=-1,          # short futures → profits when market falls
            price=100.0,
            multiplier=10.0,
        )
        out = run_scenarios(payload)
        r = out["results"][0]
        # portfolio_pnl = 100_000 * (-0.10) = -10_000 (loss) ✓
        assert r["portfolio"]["pnl_usd"] == pytest.approx(-10_000.0)
        # hedge_pnl = -1 * 10 * 100 * (-0.10) = +100 (profit) ✓
        assert r["net"]["hedge_pnl_usd"] == pytest.approx(100.0)
        # effectiveness = max(0, +100) / 10_000 = 0.01 → positive (1%)
        eff = r["net"]["hedge_effectiveness"]
        assert eff is not None
        assert eff > 0.0, (
            f"Expected positive effectiveness for a working hedge, got {eff}. "
            "Check: effectiveness inversion bug (max(0, -hedge_pnl) vs max(0, hedge_pnl))"
        )

    def test_ineffective_hedge_shows_zero_effectiveness(self):
        """A hedge that loses while portfolio also loses should show 0% effectiveness."""
        # Both portfolio and hedge lose money
        # portfolio: long delta, market falls → loss
        # hedge: also long futures → also loses
        payload = _base_payload(
            delta_usd=100_000.0,
            eq_move=-0.10,
            contracts=1,   # long futures → loses when market falls (bad hedge)
            price=100.0,
            multiplier=10.0,
        )
        out = run_scenarios(payload)
        r = out["results"][0]
        # portfolio_pnl = -10_000 (loss)
        assert r["portfolio"]["pnl_usd"] == pytest.approx(-10_000.0)
        # hedge_pnl = 1 * 10 * 100 * (-0.10) = -100 (also loses)
        assert r["net"]["hedge_pnl_usd"] == pytest.approx(-100.0)
        # effectiveness = max(0, -100) / 10_000 = 0.0 → zero (hedge is harmful, not helpful)
        eff = r["net"]["hedge_effectiveness"]
        assert eff is not None
        assert eff == pytest.approx(0.0), (
            f"Expected 0% effectiveness for a harmful hedge, got {eff}. "
            "Check: effectiveness inversion bug"
        )

    def test_effectiveness_none_when_portfolio_not_losing(self):
        """Effectiveness is None when portfolio_pnl >= 0 (no loss to offset)."""
        # portfolio gains: short delta + market falls
        payload = _base_payload(
            delta_usd=-100_000.0,  # short delta → profits when market falls
            eq_move=-0.10,
        )
        out = run_scenarios(payload)
        r = out["results"][0]
        # portfolio_pnl = -100_000 * (-0.10) = +10_000 (gain)
        assert r["portfolio"]["pnl_usd"] == pytest.approx(10_000.0)
        # effectiveness undefined when no portfolio loss
        assert r["net"]["hedge_effectiveness"] is None

    def test_effectiveness_clamped_at_200pct(self):
        """Effectiveness is clamped at 2.0 (200%) — hedge cannot exceed 2× portfolio loss."""
        # portfolio loses 100, hedge profits 1000 → raw effectiveness = 10.0 → clamped to 2.0
        payload = _base_payload(
            delta_usd=1_000.0,    # small long delta
            eq_move=-0.10,        # market falls → portfolio loses 100
            contracts=-100,       # large short position → hedge profits 1000 * 10 * 100 * 0.10 = 10_000... wait
            # Actually: hedge_pnl = contracts * multiplier * price * eq_move
            # = -100 * 10 * 100 * (-0.10) = 10_000
            # portfolio_pnl = 1_000 * (-0.10) = -100
            # raw_effectiveness = 10_000 / 100 = 100 → clamped to 2.0
            price=100.0,
            multiplier=10.0,
        )
        out = run_scenarios(payload)
        r = out["results"][0]
        eff = r["net"]["hedge_effectiveness"]
        assert eff is not None
        assert eff == pytest.approx(2.0)


# ── Other coverage ─────────────────────────────────────────────────────

class TestScenarioRejectPaths:
    def test_missing_price_rejects_hedge(self):
        payload = _base_payload()
        # Remove the price to trigger REASON_MISSING_MARKET_INPUT
        del payload["market"]["prices"]["TEST_FUT_001"]
        out = run_scenarios(payload)
        rejected_reasons = [r.get("reason") for r in out["rejected"]]
        assert "missing_market_input" in rejected_reasons

    def test_unsupported_asset_class_rejected(self):
        payload = _base_payload()
        payload["instrument_meta"]["TEST_FUT_001"]["asset_class"] = "swap"
        out = run_scenarios(payload)
        rejected_reasons = [r.get("reason") for r in out["rejected"]]
        assert "unsupported_asset_class" in rejected_reasons

    def test_options_missing_delta_rejected(self):
        payload = _base_payload(asset_class="options")
        # Options use <instrument_id>_UNDERLYING as the price key — supply it so
        # the engine reaches the delta check (not short-circuit on missing price)
        payload["market"]["prices"]["TEST_FUT_001_UNDERLYING"] = 100.0
        del payload["market"]["prices"]["TEST_FUT_001"]
        # No option_deltas supplied → should reject with option_delta_missing
        out = run_scenarios(payload)
        rejected_reasons = [r.get("reason") for r in out["rejected"]]
        assert "option_delta_missing" in rejected_reasons

    def test_options_with_delta_computes_pnl(self):
        payload = _base_payload(asset_class="options", option_delta=0.50)
        # Need underlying price key for options: instrument_id + "_UNDERLYING"
        payload["market"]["prices"]["TEST_FUT_001_UNDERLYING"] = 100.0
        del payload["market"]["prices"]["TEST_FUT_001"]
        out = run_scenarios(payload)
        r = out["results"][0]
        # hedge_pnl = contracts * delta * price * eq_move * multiplier
        # = 1 * 0.50 * 100 * (-0.10) * 10 = -50
        assert r["net"]["hedge_pnl_usd"] == pytest.approx(-50.0)

    def test_costs_net_after_costs(self):
        payload = _base_payload()
        payload["costs"] = {"total": 500.0}
        out = run_scenarios(payload)
        r = out["results"][0]
        net = r["net"]["net_after_costs_usd"]
        assert net is not None
        assert net == pytest.approx(r["net"]["pnl_usd"] - 500.0)

    def test_trace_fingerprint_present(self):
        out = run_scenarios(_base_payload())
        trace = out["meta"]["decision_trace"]
        assert "trace_fingerprint" in trace
        assert "output_fingerprint" in trace

    def test_zero_contracts_hedge_skipped_with_zero_pnl(self):
        payload = _base_payload(contracts=0)
        out = run_scenarios(payload)
        r = out["results"][0]
        assert r["net"]["hedge_pnl_usd"] == pytest.approx(0.0)
