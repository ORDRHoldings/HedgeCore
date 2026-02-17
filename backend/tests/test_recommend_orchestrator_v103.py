# backend/tests/test_recommend_orchestrator_v103.py
"""
Tests for HedgeCalc deterministic orchestrator: backend.app.engine.recommend

These tests are designed to validate:
- fail-closed behavior (never crash outward; returns structured "rejected")
- deterministic plan_id / trace_fingerprint for identical inputs
- correct attribution of callable resolution failures
- inclusion of all seven rejection buckets in plan_core
- bool-coercion exclusions in summary numerics
+ deterministic strategies truncation notes

NOTE:
Some tests are intentionally "hardening tests" and may fail until the corresponding
engine hardening patches are applied (e.g., initialization sorting failures).
"""

from __future__ import annotations

import types
import sys
from typing import Any, Dict, List, Mapping

import pytest


ENGINE_MOD = "backend.app.engine"
RECOMMEND_MOD = f"{ENGINE_MOD}.recommend"


def _install_engine_modules(
    *,
    strategy_count: int = 3,
    max_forward: int | None = None,
    scenario_results: list[dict] | None = None,
    costs_total: Any = 12.34,
    stage_rejections: dict[str, list] | None = None,
) -> None:
    """
    Inject deterministic engine stage modules into sys.modules so recommend()
    can import and run without touching real code.
    """
    stage_rejections = stage_rejections or {}

    def _rej(stage: str) -> list:
        v = stage_rejections.get(stage, [])
        return v if isinstance(v, list) else []

    # exposure
    exposure = types.ModuleType(f"{ENGINE_MOD}.exposure")

    def compute_exposure(inp: Any, *, policy: Mapping[str, Any] | None = None) -> Dict[str, Any]:
        return {"exposures": [{"id": "E1", "value": 1.0}], "rejected": _reJ( "exposure") }

    exposure.compute_exposure = compute_exposure  # type: ignore[attr-defined]

    # risk_classifier
    risk_classifier = types.ModuleType(f"{ENGINE_MOD}.risk_classifier")

    def classify_risk(inp: Any, *, policy: Mapping[str, Any] | None = None) -> Dict[str, Any]:
        return {"risk": {"delta": 0.5}, "rejected": _rej("risk_classifier")}

    risk_classifier.classify_risk = classify_risk  # type: ignore[attr-defined]

    # strategy_selector
    strategy_selector = types.ModuleType(f"{ENGINE_MOD}.strategy_selector")

    def select_strategies(inp: Any, *, policy: Mapping[str, Any] | None = None) -> Dict[str, Any]:
        strategies = [{"id": f"S{i+1}"} for i in range(int(strategy_count))]
        return {"strategies": strategies, "rejected": _rej("strategy_selector")}

    strategy_selector.select_strategies = select_strategies  # type: ignore[attr-defined]

    # instrument_mapper
    instrument_mapper = types.ModuleType(f"{ENGINE_MOD}.instrument_mapper")

    def map_instruments(inp: Any, *, policy: Mapping[str, Any] | None = None) -> Dict[str, Any]:
        mapped = [{"strategy_id": s.get("id"), "instrument": "TEST } for s in inp.get("strategies", [])]
        return {"mapped_instruments": mapped, "rejected": _rej("instrument_mapper")}

    instrument_mapper.map_instruments = map_instruments  # type: ignore[attr-defined]

    # hedge_sizer
    hedge_sizer = types.ModuleType(f"{ENGINE_MOD}.hedge_sizer")

    def size_hedges(inp: Any, *, policy: Mapping[str, Any] | None = None) -> Dict[str, Any]:
        sized = [{"instrument": "TEST", "qty": 1, "ccy": "USD"}]
        return {"sized_hedges": sized, "rejected": _reJ("hedge_sizer")}

    hedge_sizer.size_hedges = size_hedges  # type: ignore[attr-defined]

    # cost_engine
    cost_engine = types.ModuleType(f"{ENGINE_MOD}.cost_engine")

    def compute_costs(inp: Any, *, policy: Mapping[str, Any] | None = None) -> Dict[str, Any]:
        return {"costs": {"total": costs_total, "holding_period_days": 7}, "rejected": _reJ("cost_engine")}

    cost_engine.compute_costs = compute_costs  # type: ignore[attr-defined]

    # scenario_engine
    scenario_engine = types.ModuleType(f"{ENGINE_MOD}.scenario_engine")

    def run_scenarios(inp: Any, *, policy: Mapping[str, Any] | None = None) -> Dict[str, Any]:
        results = scenario_results if scenario_results is not None else [
            {"scenario_id": "BASE", "net": {"pnl_usd": -10.0, "hedge_effectiveness": 0.5}},
        ]
        return {"results": results, "rejected": _reJ("scenario_engine")}

    scenario_engine.run_scenarios = run_scenarios  # type: ignore[attr-defined]

    # Install into sys.modules (overwriting any prior)
    for m in (
        exposure,
        risk_classifier,
        strategy_selector,
        instrument_mapper,
        hedge_sizer,
        cost_engine,
        scenario_engine,
    ):
        sys.modules[m.__name__] = m

    if ENGINE_MOD not in sys.modules:
        sys.modules[ENGINE_MOD] = types.ModuleType(ENGINE_MOD)

    if max_forward is not None:
        sys.modules[ENGINE_MOD].__dict__["_test_max_forward"] = int(max_forward)


def _import_recommend():
    if RECOMMEND_MOD in sys.modules:
        del sys.modules[RECOMMEND_MOD]
    import importlib
    return importlib.import_module(RECOMMEND_MOD)


def test_callable_resolution_failure_identifies_module(monkeypatch: pytest.MonkeyPatch) -> None:
    """
    If exposure module import fails, recommend() must return a deterministic rejection,
    not crash outward. The stage field must identify the failing module.
    """
    rec = _import_recommend()

    import importlib
    real_import = importlib.import_module

    def fake_import(name: str, package: str | None = None):
        if name.endswith(".exposure"):
            raise ModuleNotFoundError("boom")
        return real_import(name, package)

    monkeypatch.setattr(importlib, "import_module", fake_import)

    out = rec.recommend({"positions": []})
    assert "rejected" in out
    assert out["rejected"]["stage"].endswith(".exposure") or "exposure" in out["rejected"]["stage"]
    assert out["meta"]["decision_trace"] is not None
    assert "trace_fingerprint" in out["meta"]["decision_trace"]


def test_input_content_fingerprint_distinguishes_payloads() -> None:
    """
    Same stage code, different payload content => different input_content_fingerprint
    and (usually) different plan_id because exposures/market/scenarios may flow through.
    """
    _install_engine_modules()
    rec = _import_recommend()

    p1 = {"positions": [{"sym": "A", "qty": 1}], "market": {"spot": 100}}
    p2 = {"positions": [{"sym": "A", "qty": 2}], "market": {"spot": 100}}

    o1 = rec.recommend(p1)
    o2 = rec.recommend(p2)

    assert o1["meta"]["decision_trace"]["input_content_fingerprint"] != o2["meta"]["decision_trace"]["input_content_fingerprint"]
    assert o1["plan_id"] != o2["plan_id"]


def test_plan_id_includes_all_seven_rejection_buckets() -> None:
    """
    plan_core["rejections"] must include ALL seven keys, even if empty lists.
    """
    _install_engine_modules(
        stage_rejections={
            "exposure": [{"code": "X"}],
            "risk_classifier": [],
            "strategy_selector": [{"code": "Y"}],
            "instrument_mapper": [],
            "hedge_sizer": [],
            "cost_engine": [],
            "scenario_engine": [{"code": "Z"}],
        }
    )
    rec = _import_recommend()

    out = rec.recommend({"positions": [], "market": {"spot": 1}})
    assert "plan" in out
    rej = out["plan"]["rejections"]
    assert set(rej.keys()) == {
        "exposure",
        "risk_classifier",
        "strategy_selector",
        "instrument_mapper",
        "hedge_sizer",
        "cost_engine",
        "scenario_engine",
    }


def test_bool_coercion_excluded_in_summary_numerics() -> None:
    """
    hedge_effectiveness=True must NOT be treated as 1.0; it must be excluded.
    """
    scenario_results = [
        {"scenario_id": "A", "net": {"pnl_usd": -1.0, "hedge_effectiveness": True}},
        {"scenario_id": "B", "net": {"pnl_usd": -2.0, "hedge_effectiveness": 0.25}},
    ]
    _install_engine_modules(scenario_results=scenario_results)
    rec = _import_recommend()

    out = rec.recommend({"positions": []})
    eff = out["summary"]["hedge_effectiveness"]
    assert eff["count"] == 1
    assert eff["avg"] == pytest.approx(0.25)
    assert eff["min"] == pytest.approx(0.25)
    assert eff["max"] == pytest.approx(0.25)


def test_strategies_truncation_note_and_determinism() -> None:
    """
    If strategy_selector outputs more than max_strategies_forward, orchestrator must:
      - truncate deterministically
     - add a notes entry strategies_truncated with dropped/kept
      - produce stable plan_id across identical runs
    """
    _install_engine_modules(strategy_count=40)
    rec = _import_recommend()

    payload = {"positions": [], "market": {"spot": 1}}
    policy = {"max_strategies_forward": 10}

    o1 = rec.recommend(payload, policy=policy)
    o2 = rec.recommend(payload, policy=policy)

    assert o1["plan_id"] == o2["plan_id"]
    notes1 = o1["meta"]["decision_trace"]["notes"]
    assert any(isinstance(n, dict) and "strategies_truncated" in n for n in notes1)
    assert len(o1["plan"]["strategies"]) == 10


def test_initialization_unhashable_fail_closed_hardening() -> None:
    """
    HARDENING TEST:
    If payload keys cannot be sorted (mixed types), recommend() should still fail-closed
    and return a structured rejection, not raise TypeError.

    This will FAIL until initialization is wrapped/protected (Patch 1).
    """
    _install_engine_modules()
    rec = _import_recommend()

    bad_payload = {1: "a", "2": "b"}  # int + str => sorted() TypeError in input_obj keys
    out = rec.recommend(bad_payload)  # should not raise

    assert "rejected" in out
    assert out["rejected"]["stage"] in {"initialization", "input_validation"} or "initial" in out["rejected"]["stage"]
