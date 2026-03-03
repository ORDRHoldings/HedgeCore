# backend/tests/test_killswitch_edge_cases.py
from __future__ import annotations

import copy
from typing import Any, Dict, List, Mapping, Optional
from unittest.mock import patch

import pytest

from backend.app.engine.instrument_mapper import map_instruments
from backend.app.engine.cost_engine import compute_costs
from backend.app.engine.scenario_engine import run_scenarios
from backend.app.engine.recommend import recommend


def _mock_exposure(payload: Any, *, policy: Optional[Mapping[str, Any]] = None) -> Dict[str, Any]:
    """Stub exposure engine that returns the format recommend.py expects."""
    return {"exposures": [], "rejected": []}


def _mock_mapper(payload: Any, *, policy: Optional[Mapping[str, Any]] = None) -> Dict[str, Any]:
    """Stub instrument mapper that returns the format recommend.py expects."""
    return {"mapped_instruments": [], "rejected": []}


def _strip_runtime_fields(obj: Any) -> Any:
    if isinstance(obj, dict):
        out: Dict[str, Any] = {}
        for k, v in obj.items():
            if k in ("duration_ms", "timestamps", "generated_at_ms", "started_at_ms", "ended_at_ms"):
                continue
            out[k] = _strip_runtime_fields(v)
        return out
    if isinstance(obj, list):
        return [_strip_runtime_fields(x) for x in obj]
    return obj


# -----------------------------
# Instrument Mapper kill-switch
# -----------------------------
def test_instrument_mapper_rejects_unknown_strategy() -> None:
    payload = {"strategies": [{"strategy_id": "does_not_exist", "score": 10, "risks": ["R1_DELTA"], "liquidity": 5, "complexity": 1}]}
    out = map_instruments(copy.deepcopy(payload))
    out = _strip_runtime_fields(out)

    assert out["mapped_instruments"] == []
    assert len(out["rejected"]) >= 1
    # mapper uses "code" field (not "reason") and emits REJECT_* codes
    assert "code" in out["rejected"][0]


def test_instrument_mapper_rejects_risk_incompatible() -> None:
    # volatility_futures requires R2_GAMMA or R3_VEGA; providing only R1_DELTA should result in rejection
    payload = {"strategies": [{"strategy_id": "volatility_futures", "score": 50, "risks": ["R1_DELTA"], "liquidity": 5, "complexity": 1}]}
    out = map_instruments(copy.deepcopy(payload))
    out = _strip_runtime_fields(out)

    assert out["mapped_instruments"] == []
    assert len(out["rejected"]) >= 1
    assert "code" in out["rejected"][0]


def test_instrument_mapper_rejects_low_strategy_liquidity() -> None:
    payload = {"strategies": [{"strategy_id": "index_futures", "score": 50, "risks": ["R1_DELTA"], "liquidity": 1, "complexity": 1}]}
    out = map_instruments(copy.deepcopy(payload))
    out = _strip_runtime_fields(out)

    assert out["mapped_instruments"] == []
    assert len(out["rejected"]) >= 1
    assert "code" in out["rejected"][0]


# -----------------------------
# Cost Engine kill-switch
# -----------------------------
def test_cost_engine_rejects_missing_price_when_required() -> None:
    payload = {
        "sized_hedges": [{"strategy_id": "index_futures", "instrument_id": "MNQ_FUT", "contracts": 5, "notional_usd": 100_000.0}],
        "instrument_meta": {"MNQ_FUT": {"asset_class": "futures", "cost_model": "spread_plus_margin", "contract_multiplier": 2.0, "underlying": "NDX"}},
        "market": {"prices": {}},  # missing MNQ_FUT price
        "assumptions": {
            "holding_period_days": 10,
            "spreads_bps": {"MNQ_FUT": 1.0},
            "fees_per_contract": {"MNQ_FUT": 1.25},
            "margin_rate": {"MNQ_FUT": 0.05},
            "funding_rate_annual": {},
            "option_premium_per_contract": {},
        },
    }

    out = compute_costs(copy.deepcopy(payload))
    out = _strip_runtime_fields(out)

    assert out["breakdown"] == []
    assert len(out["rejected"]) == 1


def test_cost_engine_rejects_missing_fee_or_spread_when_strict() -> None:
    payload = {
        "sized_hedges": [{"strategy_id": "index_futures", "instrument_id": "MNQ_FUT", "contracts": 5, "notional_usd": 100_000.0}],
        "instrument_meta": {"MNQ_FUT": {"asset_class": "futures", "cost_model": "spread_plus_margin", "contract_multiplier": 2.0, "underlying": "NDX"}},
        "market": {"prices": {"MNQ_FUT": 17_500.0}},
        "assumptions": {
            "holding_period_days": 10,
            "spreads_bps": {},  # missing spread
            "fees_per_contract": {},  # missing fee
            "margin_rate": {"MNQ_FUT": 0.05},
            "funding_rate_annual": {},
            "option_premium_per_contract": {},
        },
    }

    out = compute_costs(copy.deepcopy(payload))
    out = _strip_runtime_fields(out)

    assert out["breakdown"] == []
    assert len(out["rejected"]) == 1


# -----------------------------
# Scenario Engine kill-switch
# -----------------------------
def test_scenario_engine_rejects_missing_price_when_required() -> None:
    payload = {
        "portfolio": {"exposures": {"delta_usd": 100_000.0, "vega_usd": 0.0}},
        "sized_hedges": [{"strategy_id": "index_futures", "instrument_id": "MNQ_FUT", "contracts": -5}],
        "instrument_meta": {"MNQ_FUT": {"asset_class": "futures", "contract_multiplier": 2.0, "underlying": "NDX"}},
        "market": {"prices": {}, "option_deltas": {}, "sensitivities": {}},  # missing price
        "scenarios": [{"scenario_id": "EQ_DOWN_05", "shocks": {"equity_move_pct": -0.05, "vol_move_pct": 0.0, "rates_move_bps": 0.0}}],
    }

    out = run_scenarios(copy.deepcopy(payload))
    out = _strip_runtime_fields(out)

    # Scenario should still exist, but hedge row will be rejected (captured in top-level rejected list)
    assert len(out["results"]) == 1
    assert len(out["rejected"]) >= 1


def test_scenario_engine_rejects_missing_option_delta_when_required() -> None:
    payload = {
        "portfolio": {"exposures": {"delta_usd": 100_000.0, "vega_usd": 0.0}},
        "sized_hedges": [{"strategy_id": "index_options_puts", "instrument_id": "SPY_OPT", "contracts": 2}],
        "instrument_meta": {"SPY_OPT": {"asset_class": "options", "contract_multiplier": 100.0, "underlying": "SPY"}},
        "market": {"prices": {"SPY_OPT_UNDERLYING": 500.0}, "option_deltas": {}, "sensitivities": {}},  # missing delta
        "scenarios": [{"scenario_id": "EQ_DOWN_05", "shocks": {"equity_move_pct": -0.05, "vol_move_pct": 0.0, "rates_move_bps": 0.0}}],
    }

    out = run_scenarios(copy.deepcopy(payload))
    out = _strip_runtime_fields(out)

    assert len(out["results"]) == 1
    assert len(out["rejected"]) >= 1


# -----------------------------
# Orchestrator kill-switch
# -----------------------------
def test_recommend_preserves_rejections_and_never_crashes_on_missing_inputs() -> None:
    """
    End-to-end safety: missing instrument_specs/meta/prices must not crash orchestration.
    It should return a plan_id and carry rejections downstream.
    """
    payload = {
        "positions": [],  # empty positions list satisfies exposure engine requirement
        "market": {"prices": {}, "option_deltas": {}, "sensitivities": {}},
        "instrument_specs": {},   # missing sizing specs -> hedge_sizer should reject deterministically
        "instrument_meta": {},    # missing meta -> cost/scenario should reject deterministically
        "assumptions": {
            "holding_period_days": 10,
            "spreads_bps": {},
            "fees_per_contract": {},
            "margin_rate": {},
            "funding_rate_annual": {},
            "option_premium_per_contract": {},
        },
        "scenarios": [{"scenario_id": "BASE", "shocks": {"equity_move_pct": 0.0, "vol_move_pct": 0.0, "rates_move_bps": 0.0}}],
        "policy": {"include_stage_outputs": True},
    }

    with patch("backend.app.engine.exposure.compute_exposure", side_effect=_mock_exposure), \
         patch("backend.app.engine.instrument_mapper.map_instruments", side_effect=_mock_mapper):
        out1 = recommend(copy.deepcopy(payload), policy=payload.get("policy"))
        out2 = recommend(copy.deepcopy(payload), policy=payload.get("policy"))

    n1 = _strip_runtime_fields(out1)
    n2 = _strip_runtime_fields(out2)

    assert n1["plan_id"] == n2["plan_id"]
    assert isinstance(n1.get("summary"), dict)
    assert "meta" in n1 and "decision_trace" in n1["meta"]
    assert "plan" in n1 and isinstance(n1["plan"], dict)

    rejs = n1["plan"].get("rejections", {})
    assert isinstance(rejs, dict)
    # v1.0.3: all 7 stages contribute rejections to plan_core
    for bucket in (
        "exposure",
        "risk_classifier",
        "strategy_selector",
        "instrument_mapper",
        "hedge_sizer",
        "cost_engine",
        "scenario_engine",
    ):
        assert bucket in rejs, f"Missing rejection bucket: {bucket}"
        assert isinstance(rejs[bucket], list)
