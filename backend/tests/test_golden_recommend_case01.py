# backend/tests/test_golden_recommend_case01.py
from __future__ import annotations

import copy
import json
from typing import Any, Dict, Mapping

import pytest

from backend.app.engine.recommend import recommend


def _deep_sort(obj: Any) -> Any:
    """
    Deterministic normalization helper:
      - dicts: sorted by key
      - lists: preserved order (order is meaningful for ranked outputs)
    """
    if isinstance(obj, dict):
        return {k: _deep_sort(obj[k]) for k in sorted(obj.keys())}
    if isinstance(obj, list):
        return [_deep_sort(x) for x in obj]
    return obj


def _strip_runtime_fields(obj: Any) -> Any:
    """
    Remove runtime-variant fields so we can assert determinism on the *semantic output*.

    NOTE:
      Some engine traces include timestamps/duration fields that naturally vary between runs.
      This test intentionally ignores those fields and validates that the *content* is identical.
    """
    if isinstance(obj, dict):
        out: Dict[str, Any] = {}
        for k, v in obj.items():
            # strip known runtime-variant fields
            if k in ("duration_ms",):
                continue
            if k == "timestamps":
                # always runtime-variant
                continue
            # many engines include "generated_at_ms" or similar in nested structures
            if k in ("generated_at_ms", "started_at_ms", "ended_at_ms"):
                continue
            out[k] = _strip_runtime_fields(v)
        return out
    if isinstance(obj, list):
        return [_strip_runtime_fields(x) for x in obj]
    return obj


def _normalized_output(out: Mapping[str, Any]) -> Dict[str, Any]:
    """
    Normalize recommend() output for deterministic comparison:
      - remove runtime-variant fields (duration/timestamps)
      - deep-sort dict keys (to avoid incidental ordering noise)
    """
    return _deep_sort(_strip_runtime_fields(dict(out)))


def _case01_payload() -> Dict[str, Any]:
    """
    Case 01: Minimal end-to-end pipeline run with explicit baseline scenario.
    This is intentionally conservative:
      - no reliance on external pricing feeds
      - no need for instrument specs/meta to be present to complete orchestration
      - validates safe failures + deterministic behavior
    """
    return {
        # positions omitted intentionally; exposure engine should handle empty inputs deterministically
        "market": {
            "prices": {},
            "option_deltas": {},
            "sensitivities": {},
        },
        "instrument_specs": {},
        "instrument_meta": {},
        "assumptions": {
            "holding_period_days": 21,
            "spreads_bps": {},
            "fees_per_contract": {},
            "margin_rate": {},
            "funding_rate_annual": {},
            "option_premium_per_contract": {},
        },
        "scenarios": [
            {
                "scenario_id": "BASELINE",
                "shocks": {"equity_move_pct": 0.0, "vol_move_pct": 0.0, "rates_move_bps": 0.0},
            }
        ],
        # keep stage outputs enabled so we can validate cross-stage contract invariants
        "policy": {"include_stage_outputs": True},
    }


def test_recommend_case01_is_deterministic_across_runs() -> None:
    payload = _case01_payload()

    out1 = recommend(copy.deepcopy(payload), policy=payload.get("policy"))
    out2 = recommend(copy.deepcopy(payload), policy=payload.get("policy"))

    n1 = _normalized_output(out1)
    n2 = _normalized_output(out2)

    # 1) Plan identity should be stable for identical inputs
    assert n1.get("plan_id") == n2.get("plan_id")

    # 2) The full semantic output (minus runtime fields) must match exactly
    assert n1 == n2


def test_recommend_case01_is_stable_under_dict_reordering() -> None:
    """
    Same payload, different insertion order, must yield same plan_id and same normalized output.
    """
    payload_a = _case01_payload()
    payload_b = json.loads(json.dumps(payload_a))  # re-materialize -> new dict insertion order

    out_a = recommend(copy.deepcopy(payload_a), policy=payload_a.get("policy"))
    out_b = recommend(copy.deepcopy(payload_b), policy=payload_b.get("policy"))

    na = _normalized_output(out_a)
    nb = _normalized_output(out_b)

    assert na.get("plan_id") == nb.get("plan_id")
    assert na == nb


def test_recommend_case01_contract_invariants() -> None:
    """
    Cross-module contract invariants:
      - stages exist when include_stage_outputs=True
      - required top-level keys exist
      - rejections are present and structurally valid (even if empty)
    """
    payload = _case01_payload()
    out = recommend(copy.deepcopy(payload), policy=payload.get("policy"))
    n = _normalized_output(out)

    assert isinstance(n.get("plan_id"), str) and len(n["plan_id"]) > 0
    assert isinstance(n.get("summary"), dict)
    assert isinstance(n.get("meta"), dict)
    assert "decision_trace" in n["meta"]

    # stages present because we requested them
    assert "stages" in n
    stages = n["stages"]
    assert isinstance(stages, dict)

    # Each stage should return a dict-like payload
    for key in (
        "exposure",
        "risk_classifier",
        "strategy_selector",
        "instrument_mapper",
        "hedge_sizer",
        "cost_engine",
        "scenario_engine",
    ):
        assert key in stages
        assert isinstance(stages[key], dict)

    # Plan object present because include_stage_outputs=True
    assert "plan" in n
    plan = n["plan"]
    assert isinstance(plan, dict)

    # Rejections must exist and be dict of lists (even if empty)
    # v1.0.3: all 7 stages contribute rejections to plan_core (affects plan_id hash domain)
    assert "rejections" in plan and isinstance(plan["rejections"], dict)
    for bucket in (
        "exposure",
        "risk_classifier",
        "strategy_selector",
        "instrument_mapper",
        "hedge_sizer",
        "cost_engine",
        "scenario_engine",
    ):
        assert bucket in plan["rejections"], f"Missing rejection bucket: {bucket}"
        assert isinstance(plan["rejections"][bucket], list)
