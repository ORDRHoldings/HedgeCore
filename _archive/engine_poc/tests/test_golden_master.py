"""Golden-master regression tests -- determinism and correctness."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.engine.audit import build_run_envelope
from app.engine.kernel import compute_hedge_plan
from app.engine.normalizer import normalize_hedges, normalize_trades
from app.engine.scenarios import compute_scenarios
from app.engine.validator import validate_all

GOLDEN_DIR = Path(__file__).parent / "fixtures" / "golden"


def _run_pipeline(trades, hedges, market, policy, market_raw=None, policy_raw=None):
    report = validate_all(trades, hedges, market, policy)
    assert report.status == "PASS"

    trades_df = normalize_trades(trades)
    hedges_df = normalize_hedges(hedges)
    hedge_plan, _ = compute_hedge_plan(trades_df, hedges_df, market, policy)
    scenarios = compute_scenarios(hedge_plan.buckets, market)

    trades_raw = [t.model_dump(mode="json") for t in trades]
    hedges_raw = [h.model_dump(mode="json") for h in hedges]
    m_raw = market_raw or market.model_dump(mode="json")
    p_raw = policy_raw or policy.model_dump(mode="json")
    outputs_raw = {
        "hedge_plan": hedge_plan.model_dump(mode="json"),
        "scenario_results": scenarios.model_dump(mode="json"),
    }
    envelope = build_run_envelope("golden-run", trades_raw, hedges_raw, m_raw, p_raw, outputs_raw)

    return hedge_plan, scenarios, envelope


def test_golden_validation_passes(golden_trades, golden_hedges, golden_market, golden_policy):
    report = validate_all(golden_trades, golden_hedges, golden_market, golden_policy)
    assert report.status == "PASS"
    assert len(report.errors) == 0


def test_golden_hedge_plan(
    golden_trades, golden_hedges, golden_market, golden_policy, golden_market_raw, golden_policy_raw, update_golden
):
    hedge_plan, _, _ = _run_pipeline(
        golden_trades, golden_hedges, golden_market, golden_policy, golden_market_raw, golden_policy_raw
    )
    actual = hedge_plan.model_dump(mode="json")

    expected_path = GOLDEN_DIR / "expected_hedge_plan.json"
    if update_golden:
        with open(expected_path, "w") as f:
            json.dump(actual, f, indent=2, default=str)
        pytest.skip("Golden file updated.")

    with open(expected_path) as f:
        expected = json.load(f)

    # Compare bucket by bucket with tolerance
    assert len(actual["buckets"]) == len(expected["buckets"])
    for a, e in zip(actual["buckets"], expected["buckets"]):
        assert a["bucket"] == e["bucket"]
        for key in [
            "confirmed_flow_mxn", "forecast_flow_mxn", "commercial_exposure_mxn",
            "existing_hedges_mxn", "target_signed_mxn", "action_mxn",
            "forward_rate", "action_usd", "friction_usd",
            "hedge_position_mxn", "residual_mxn",
        ]:
            assert abs(a[key] - e[key]) < 1e-6, f"Bucket {a['bucket']}.{key}: {a[key]} != {e[key]}"
        assert a["action_direction"] == e["action_direction"]
        assert a["suppressed"] == e["suppressed"]


def test_golden_scenarios(
    golden_trades, golden_hedges, golden_market, golden_policy, golden_market_raw, golden_policy_raw, update_golden
):
    _, scenarios, _ = _run_pipeline(
        golden_trades, golden_hedges, golden_market, golden_policy, golden_market_raw, golden_policy_raw
    )
    actual = scenarios.model_dump(mode="json")

    expected_path = GOLDEN_DIR / "expected_scenarios.json"
    if update_golden:
        with open(expected_path, "w") as f:
            json.dump(actual, f, indent=2, default=str)
        pytest.skip("Golden file updated.")

    with open(expected_path) as f:
        expected = json.load(f)

    for a, e in zip(actual["per_bucket"], expected["per_bucket"]):
        assert a["bucket"] == e["bucket"]
        assert abs(a["sigma"] - e["sigma"]) < 1e-10
        for key in ["unhedged_usd", "hedged_usd", "hedge_benefit_usd"]:
            assert abs(a[key] - e[key]) < 1e-4, f"{a['bucket']} sigma={a['sigma']} {key}: {a[key]} != {e[key]}"


def test_golden_determinism(
    golden_trades, golden_hedges, golden_market, golden_policy, golden_market_raw, golden_policy_raw
):
    _, _, env1 = _run_pipeline(
        golden_trades, golden_hedges, golden_market, golden_policy, golden_market_raw, golden_policy_raw
    )
    _, _, env2 = _run_pipeline(
        golden_trades, golden_hedges, golden_market, golden_policy, golden_market_raw, golden_policy_raw
    )
    assert env1.inputs_hash == env2.inputs_hash
    assert env1.outputs_hash == env2.outputs_hash


def test_golden_envelope_hashes(
    golden_trades, golden_hedges, golden_market, golden_policy, golden_market_raw, golden_policy_raw, update_golden
):
    _, _, envelope = _run_pipeline(
        golden_trades, golden_hedges, golden_market, golden_policy, golden_market_raw, golden_policy_raw
    )

    expected_path = GOLDEN_DIR / "expected_envelope.json"
    if update_golden:
        with open(expected_path, "w") as f:
            json.dump(
                {
                    "inputs_hash": envelope.inputs_hash,
                    "outputs_hash": envelope.outputs_hash,
                    "trades_hash": envelope.trades_hash,
                    "hedges_hash": envelope.hedges_hash,
                    "market_hash": envelope.market_hash,
                    "policy_hash": envelope.policy_hash,
                },
                f,
                indent=2,
            )
        pytest.skip("Golden file updated.")

    with open(expected_path) as f:
        expected = json.load(f)

    assert envelope.inputs_hash == expected["inputs_hash"]
    assert envelope.outputs_hash == expected["outputs_hash"]
    assert envelope.trades_hash == expected["trades_hash"]
    assert envelope.hedges_hash == expected["hedges_hash"]
    assert envelope.market_hash == expected["market_hash"]
    assert envelope.policy_hash == expected["policy_hash"]
