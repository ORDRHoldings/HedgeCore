# backend/tests/test_contract_cost_and_scenario_case01.py
from __future__ import annotations

import copy
from typing import Any, Dict, Mapping

import pytest

from backend.app.engine.cost_engine import compute_costs
from backend.app.engine.scenario_engine import run_scenarios


def _strip_runtime_fields(obj: Any) -> Any:
    """
    Remove runtime-variant fields so determinism assertions validate semantic stability.
    """
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


def _case01_cost_payload_strict() -> Dict[str, Any]:
    """
    Case 01 (Cost Engine):
      - One futures hedge (MNQ) with explicit spreads/fees/margin and price.
      - Deterministic holding period.
      - Strict defaults (missing fields should reject).
    """
    return {
        "sized_hedges": [
            {
                "strategy_id": "index_futures",
                "instrument_id": "MNQ_FUT",
                "contracts": 10,
                "notional_usd": 350_000.0,
                "sizing_method": "delta_neutral",
                "constraints_applied": {"min_contract": 1, "max_contract": 200},
                "inputs_used": {"note": "fixture"},
            }
        ],
        "instrument_meta": {
            "MNQ_FUT": {
                "asset_class": "futures",
                "cost_model": "spread_plus_margin",
                "contract_multiplier": 2.0,
                "underlying": "NDX",
            }
        },
        "market": {"prices": {"MNQ_FUT": 17_500.0}},
        "assumptions": {
            "holding_period_days": 21,
            "spreads_bps": {"MNQ_FUT": 0.5},  # 0.5 bps
            "fees_per_contract": {"MNQ_FUT": 2.20},
            "margin_rate": {"MNQ_FUT": 0.05},  # 5% margin on notional
            "funding_rate_annual": {},
            "option_premium_per_contract": {},
        },
    }


def _case01_scenario_payload() -> Dict[str, Any]:
    """
    Case 01 (Scenario Engine):
      - Portfolio exposures supplied directly.
      - One futures hedge with price proxy.
      - One scenario with equity down 10%.
    """
    return {
        "portfolio": {"exposures": {"delta_usd": 100_000.0, "vega_usd": 20_000.0}},
        "sized_hedges": [
            {"strategy_id": "index_futures", "instrument_id": "MNQ_FUT", "contracts": -10, "notional_usd": 350_000.0}
        ],
        "instrument_meta": {
            "MNQ_FUT": {"asset_class": "futures", "contract_multiplier": 2.0, "underlying": "NDX"},
        },
        "market": {
            "prices": {"MNQ_FUT": 17_500.0},
            "option_deltas": {},
            "sensitivities": {},
        },
        "scenarios": [
            {"scenario_id": "EQ_DOWN_10", "shocks": {"equity_move_pct": -0.10, "vol_move_pct": 0.0, "rates_move_bps": 0.0}}
        ],
    }


def test_cost_engine_case01_deterministic() -> None:
    payload = _case01_cost_payload_strict()

    out1 = compute_costs(copy.deepcopy(payload))
    out2 = compute_costs(copy.deepcopy(payload))

    n1 = _strip_runtime_fields(out1)
    n2 = _strip_runtime_fields(out2)

    assert n1 == n2
    assert isinstance(n1.get("costs"), dict)
    assert isinstance(n1.get("breakdown"), list)
    assert isinstance(n1.get("rejected"), list)


def test_cost_engine_case01_math_sanity() -> None:
    """
    Validate key components:
      - spread_cost = notional * (bps/10000)
      - fees_cost = abs(contracts) * fee_per_contract
      - margin_financing = (notional*margin_rate) * default_margin_financing_annual * (days/365)
        (default_margin_financing_annual is 0.05 in engine policy)
    """
    payload = _case01_cost_payload_strict()
    out = compute_costs(copy.deepcopy(payload))
    out = _strip_runtime_fields(out)

    assert out["rejected"] == []

    costs = out["costs"]
    assert costs["holding_period_days"] == 21

    # expected deterministic one-time components
    notional = 350_000.0
    spread_bps = 0.5
    fee_pc = 2.20
    contracts = 10

    expected_spread = notional * (spread_bps / 10_000.0)  # entry only by default
    expected_fees = abs(contracts) * fee_pc

    # margin financing: notional*0.05 posted * 0.05 annual * 21/365
    posted = notional * 0.05
    expected_margin_fin = posted * 0.05 * (21.0 / 365.0)

    assert pytest.approx(costs["one_time"]["spread"], rel=1e-12, abs=1e-9) == expected_spread
    assert pytest.approx(costs["one_time"]["fees"], rel=1e-12, abs=1e-9) == expected_fees
    assert pytest.approx(costs["carry"]["margin_financing"], rel=1e-12, abs=1e-6) == expected_margin_fin

    # totals are consistent
    assert pytest.approx(costs["one_time"]["total"], rel=1e-12, abs=1e-9) == (expected_spread + expected_fees)
    assert pytest.approx(costs["carry"]["total"], rel=1e-12, abs=1e-6) == expected_margin_fin
    assert pytest.approx(costs["total"], rel=1e-12, abs=1e-6) == (expected_spread + expected_fees + expected_margin_fin)


def test_cost_engine_rejects_missing_spread_when_strict() -> None:
    payload = _case01_cost_payload_strict()
    payload["assumptions"]["spreads_bps"] = {}  # remove spread

    out = compute_costs(copy.deepcopy(payload))
    out = _strip_runtime_fields(out)

    # strict defaults => rejects row
    assert len(out["rejected"]) == 1
    assert out["breakdown"] == []


def test_scenario_engine_case01_deterministic() -> None:
    payload = _case01_scenario_payload()

    out1 = run_scenarios(copy.deepcopy(payload))
    out2 = run_scenarios(copy.deepcopy(payload))

    n1 = _strip_runtime_fields(out1)
    n2 = _strip_runtime_fields(out2)

    assert n1 == n2
    assert isinstance(n1.get("results"), list)
    assert isinstance(n1.get("rejected"), list)


def test_scenario_engine_case01_math_sanity() -> None:
    """
    Portfolio proxy P&L:
      pnl = delta_usd * equity_move + vega_usd * vol_move
      = 100k * (-0.10) + 20k * 0 = -10,000

    Hedge futures proxy P&L:
      pnl = contracts * multiplier * (price * equity_move)
      contracts=-10, multiplier=2, price=17500, equity_move=-0.10
      pnl = -10*2*(17500*-0.10) = -10*2*(-1750) = +35,000
    """
    payload = _case01_scenario_payload()
    out = run_scenarios(copy.deepcopy(payload))
    out = _strip_runtime_fields(out)

    assert out["rejected"] == []
    assert len(out["results"]) == 1

    r = out["results"][0]
    assert r["scenario_id"] == "EQ_DOWN_10"

    portfolio_pnl = r["portfolio"]["pnl_usd"]
    hedge_pnl = r["net"]["hedge_pnl_usd"]
    net_pnl = r["net"]["pnl_usd"]

    assert pytest.approx(portfolio_pnl, rel=1e-12, abs=1e-9) == -10_000.0
    assert pytest.approx(hedge_pnl, rel=1e-12, abs=1e-6) == 35_000.0
    assert pytest.approx(net_pnl, rel=1e-12, abs=1e-6) == 25_000.0

    # Effectiveness is defined because portfolio_pnl < 0:
    # offset = max(0, -hedge_pnl) = 0 because hedge_pnl positive (profit), hedge_total_pnl=+35000 => -hedge=-35000
    # BUT engine defines offset as max(0, -hedge_total_pnl); hedge_total_pnl=+35000 => offset=0 => effectiveness=0
    assert r["net"]["hedge_effectiveness"] == 0.0
