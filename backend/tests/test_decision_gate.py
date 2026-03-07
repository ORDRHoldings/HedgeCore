"""
tests/test_decision_gate.py

Comprehensive tests for app.engine.decision_gate — institutional hedge plan gating.

Covers:
  - Helper functions (_is_finite_number, _as_float, _clamp, etc.)
  - Policy defaults and merging
  - Extraction helpers (rejections, costs, worst_case, effectiveness)
  - Verdict logic (APPROVE, APPROVE_WITH_CONDITIONS, REJECT)
  - Cost governance (bps and absolute)
  - Worst-case governance
  - Effectiveness governance
  - Residual risk detection
  - Deterministic hashing
"""
from __future__ import annotations

import math

import pytest

from app.engine.decision_gate import (
    ENGINE_NAME,
    ENGINE_VERSION,
    VERDICT_APPROVE,
    VERDICT_APPROVE_WITH_CONDITIONS,
    VERDICT_REJECT,
    REASON_COST_TOO_HIGH,
    REASON_EMPTY_HEDGE_PLAN,
    REASON_MISSING_REQUIRED_INPUT,
    REASON_TOO_MANY_REJECTIONS,
    REASON_WORST_CASE_TOO_LOW,
    REASON_EFFECTIVENESS_TOO_LOW,
    REASON_UNHEDGED_MATERIAL_RISK,
    decision_gate,
    _is_finite_number,
    _as_float,
    _as_int,
    _clamp,
    _as_str,
    _policy_defaults,
    _merge_policy,
    _extract_rejections,
    _count_rejected_legs,
    _extract_sized_hedges,
    _has_nonzero_hedges,
    _extract_cost_total_usd,
    _extract_summary,
    _extract_worst_case,
    _extract_effectiveness_min,
    _extract_portfolio_notional,
)


# ---------------------------------------------------------------------------
# Minimal valid inputs for decision_gate
# ---------------------------------------------------------------------------
def _valid_plan(**overrides) -> dict:
    base = {
        "sized_hedges": [{"instrument_id": "FWD_1", "contracts": 10}],
        "costs": {"total": 500.0},
        "summary": {
            "worst_case": {"scenario_id": "shock_-10pct", "net_pnl_usd": -10000.0},
            "hedge_effectiveness": {"min": 0.65},
        },
    }
    base.update(overrides)
    return base


def _valid_payload(**overrides) -> dict:
    base = {"portfolio_notional_usd": 1000000.0}
    base.update(overrides)
    return base


# ---------------------------------------------------------------------------
# Primitive helpers
# ---------------------------------------------------------------------------

class TestIsFiniteNumber:
    def test_int(self):
        assert _is_finite_number(42) is True

    def test_float(self):
        assert _is_finite_number(3.14) is True

    def test_nan(self):
        assert _is_finite_number(float("nan")) is False

    def test_inf(self):
        assert _is_finite_number(float("inf")) is False

    def test_string(self):
        assert _is_finite_number("42") is False

    def test_none(self):
        assert _is_finite_number(None) is False

    def test_zero(self):
        assert _is_finite_number(0) is True

    def test_negative(self):
        assert _is_finite_number(-100.5) is True


class TestAsFloat:
    def test_int_conversion(self):
        assert _as_float(42) == 42.0

    def test_string_conversion(self):
        assert _as_float("3.14") == pytest.approx(3.14)

    def test_nan_returns_default(self):
        assert _as_float(float("nan")) == 0.0

    def test_invalid_returns_default(self):
        assert _as_float("abc") == 0.0

    def test_custom_default(self):
        assert _as_float("abc", 99.9) == 99.9


class TestClamp:
    def test_within_range(self):
        assert _clamp(5.0, 0.0, 10.0) == 5.0

    def test_below_min(self):
        assert _clamp(-5.0, 0.0, 10.0) == 0.0

    def test_above_max(self):
        assert _clamp(15.0, 0.0, 10.0) == 10.0


class TestAsInt:
    def test_int(self):
        assert _as_int(42) == 42

    def test_float(self):
        assert _as_int(3.7) == 3

    def test_string(self):
        assert _as_int("10") == 10

    def test_invalid(self):
        assert _as_int("abc") == 0

    def test_custom_default(self):
        assert _as_int("abc", -1) == -1


class TestAsStr:
    def test_string(self):
        assert _as_str("hello") == "hello"

    def test_int_to_string(self):
        assert _as_str(42) == "42"

    def test_none_to_string(self):
        assert _as_str(None) == "None"


# ---------------------------------------------------------------------------
# Policy
# ---------------------------------------------------------------------------

class TestPolicyDefaults:
    def test_returns_dict(self):
        d = _policy_defaults()
        assert isinstance(d, dict)

    def test_has_cost_keys(self):
        d = _policy_defaults()
        assert "max_total_cost_bps" in d
        assert "max_total_cost_usd" in d

    def test_has_worst_case_key(self):
        d = _policy_defaults()
        assert "min_worst_case_net_pnl_usd" in d

    def test_has_effectiveness_key(self):
        d = _policy_defaults()
        assert "min_effectiveness" in d

    def test_default_cost_bps(self):
        assert _policy_defaults()["max_total_cost_bps"] == 75.0


class TestMergePolicy:
    def test_none_policy_returns_defaults(self):
        p = _merge_policy(None)
        assert p["max_total_cost_bps"] == 75.0

    def test_override_recognized_key(self):
        p = _merge_policy({"max_total_cost_bps": 100.0})
        assert p["max_total_cost_bps"] == 100.0

    def test_unknown_key_ignored(self):
        p = _merge_policy({"unknown_key": "value"})
        assert "unknown_key" not in p

    def test_numeric_sanitization(self):
        p = _merge_policy({"min_effectiveness": 5.0})  # above 2.0 clamp
        assert p["min_effectiveness"] == 2.0


# ---------------------------------------------------------------------------
# Extraction helpers
# ---------------------------------------------------------------------------

class TestExtractRejections:
    def test_no_rejections(self):
        r = _extract_rejections({"strategies": []})
        assert all(len(v) == 0 for v in r.values())

    def test_with_rejections(self):
        plan = {"rejections": {"instrument_mapper": [{"instrument_id": "A", "reason": "invalid"}]}}
        r = _extract_rejections(plan)
        assert len(r["instrument_mapper"]) == 1

    def test_non_dict_rejections(self):
        r = _extract_rejections({"rejections": "invalid"})
        assert all(len(v) == 0 for v in r.values())


class TestCountRejectedLegs:
    def test_zero_for_empty(self):
        r = {"instrument_mapper": [], "hedge_sizer": [], "cost_engine": [], "scenario_engine": []}
        assert _count_rejected_legs(r) == 0

    def test_counts_unique(self):
        r = {
            "instrument_mapper": [{"instrument_id": "A"}],
            "hedge_sizer": [{"instrument_id": "B"}, {"instrument_id": "A"}],
            "cost_engine": [],
            "scenario_engine": [],
        }
        # A in mapper + B in sizer + A in sizer (duplicate A but different stage) = 3
        assert _count_rejected_legs(r) == 3


class TestExtractSizedHedges:
    def test_normal(self):
        result = _extract_sized_hedges({"sized_hedges": [{"contracts": 10}]})
        assert len(result) == 1

    def test_missing_key(self):
        assert _extract_sized_hedges({}) == []

    def test_non_list(self):
        assert _extract_sized_hedges({"sized_hedges": "invalid"}) == []


class TestHasNonzeroHedges:
    def test_with_nonzero(self):
        assert _has_nonzero_hedges([{"contracts": 10}]) is True

    def test_all_zero(self):
        assert _has_nonzero_hedges([{"contracts": 0}]) is False

    def test_empty(self):
        assert _has_nonzero_hedges([]) is False

    def test_non_dict_entries(self):
        assert _has_nonzero_hedges(["not_a_dict"]) is False


class TestExtractCostTotalUsd:
    def test_normal(self):
        assert _extract_cost_total_usd({"costs": {"total": 500.0}}) == 500.0

    def test_missing_costs(self):
        assert _extract_cost_total_usd({}) is None

    def test_nested_costs(self):
        assert _extract_cost_total_usd({"costs": {"costs": {"total": 300.0}}}) == 300.0


class TestExtractWorstCase:
    def test_normal(self):
        plan = {"summary": {"worst_case": {"scenario_id": "s1", "net_pnl_usd": -5000.0}}}
        sid, pnl = _extract_worst_case(plan)
        assert sid == "s1"
        assert pnl == -5000.0

    def test_missing_summary(self):
        sid, pnl = _extract_worst_case({})
        assert sid is None
        assert pnl is None


class TestExtractEffectivenessMin:
    def test_normal(self):
        plan = {"summary": {"hedge_effectiveness": {"min": 0.75}}}
        assert _extract_effectiveness_min(plan) == 0.75

    def test_missing(self):
        assert _extract_effectiveness_min({}) is None


class TestExtractPortfolioNotional:
    def test_direct(self):
        assert _extract_portfolio_notional({"portfolio_notional_usd": 1e6}) == 1e6

    def test_nested(self):
        assert _extract_portfolio_notional({"portfolio": {"notional_usd": 2e6}}) == 2e6

    def test_missing(self):
        assert _extract_portfolio_notional({}) is None

    def test_zero(self):
        assert _extract_portfolio_notional({"portfolio_notional_usd": 0.0}) is None


# ---------------------------------------------------------------------------
# decision_gate — APPROVE
# ---------------------------------------------------------------------------

class TestDecisionGateApprove:
    def test_valid_inputs_approve(self):
        result = decision_gate(_valid_payload(), plan=_valid_plan())
        assert result["verdict"] == VERDICT_APPROVE
        assert len(result["reasons"]) == 0

    def test_deterministic_hash(self):
        a = decision_gate(_valid_payload(), plan=_valid_plan())
        b = decision_gate(_valid_payload(), plan=_valid_plan())
        assert a["decision_hash"] == b["decision_hash"]

    def test_has_meta(self):
        result = decision_gate(_valid_payload(), plan=_valid_plan())
        assert "meta" in result
        assert "duration_ms" in result["meta"]


# ---------------------------------------------------------------------------
# decision_gate — REJECT scenarios
# ---------------------------------------------------------------------------

class TestDecisionGateReject:
    def test_empty_hedge_plan_rejected(self):
        plan = _valid_plan(sized_hedges=[{"contracts": 0}])
        result = decision_gate(_valid_payload(), plan=plan)
        assert result["verdict"] == VERDICT_REJECT
        codes = [r["code"] for r in result["reasons"]]
        assert REASON_EMPTY_HEDGE_PLAN in codes

    def test_cost_too_high_bps(self):
        # 5000 USD cost on 100,000 USD notional = 500 bps (>75 default)
        plan = _valid_plan(costs={"total": 5000.0})
        payload = _valid_payload(portfolio_notional_usd=100000.0)
        result = decision_gate(payload, plan=plan)
        assert result["verdict"] == VERDICT_REJECT
        codes = [r["code"] for r in result["reasons"]]
        assert REASON_COST_TOO_HIGH in codes

    def test_cost_too_high_absolute(self):
        # No notional, absolute cost > 25000
        plan = _valid_plan(costs={"total": 30000.0})
        payload = {}
        result = decision_gate(payload, plan=plan)
        assert result["verdict"] == VERDICT_REJECT
        codes = [r["code"] for r in result["reasons"]]
        assert REASON_COST_TOO_HIGH in codes

    def test_worst_case_too_low(self):
        plan = _valid_plan()
        plan["summary"]["worst_case"]["net_pnl_usd"] = -100000.0  # below -50000 default
        result = decision_gate(_valid_payload(), plan=plan)
        assert result["verdict"] == VERDICT_REJECT
        codes = [r["code"] for r in result["reasons"]]
        assert REASON_WORST_CASE_TOO_LOW in codes

    def test_effectiveness_too_low(self):
        plan = _valid_plan()
        plan["summary"]["hedge_effectiveness"]["min"] = 0.10  # below 0.25 default
        result = decision_gate(_valid_payload(), plan=plan)
        assert result["verdict"] == VERDICT_REJECT
        codes = [r["code"] for r in result["reasons"]]
        assert REASON_EFFECTIVENESS_TOO_LOW in codes

    def test_too_many_rejections(self):
        plan = _valid_plan(rejections={
            "instrument_mapper": [{"instrument_id": "A", "reason": "invalid"}],
        })
        result = decision_gate(_valid_payload(), plan=plan)
        assert result["verdict"] == VERDICT_REJECT
        codes = [r["code"] for r in result["reasons"]]
        assert REASON_TOO_MANY_REJECTIONS in codes

    def test_non_mapping_plan(self):
        result = decision_gate(_valid_payload(), plan="not_a_dict")
        assert result["verdict"] == VERDICT_REJECT
        codes = [r["code"] for r in result["reasons"]]
        assert REASON_MISSING_REQUIRED_INPUT in codes

    def test_non_mapping_payload(self):
        result = decision_gate("not_a_dict", plan=_valid_plan())
        assert result["verdict"] == VERDICT_REJECT


# ---------------------------------------------------------------------------
# decision_gate — APPROVE_WITH_CONDITIONS
# ---------------------------------------------------------------------------

class TestDecisionGateConditions:
    def test_missing_effectiveness_adds_condition(self):
        plan = _valid_plan()
        del plan["summary"]["hedge_effectiveness"]
        result = decision_gate(_valid_payload(), plan=plan)
        # Should add condition (review needed) but not reject
        assert len(result["conditions"]) > 0

    def test_unhedged_material_risk_not_rejecting(self):
        payload = _valid_payload(risk_classifier_output={
            "risks": [{"risk_id": "R1", "score": 0.8, "covered": False}],
        })
        result = decision_gate(
            payload,
            plan=_valid_plan(),
            policy={"reject_on_unhedged_material_risks": False},
        )
        assert result["verdict"] == VERDICT_APPROVE_WITH_CONDITIONS
        assert len(result["residual_risks"]) > 0

    def test_unhedged_material_risk_rejecting(self):
        payload = _valid_payload(risk_classifier_output={
            "risks": [{"risk_id": "R1", "score": 0.8, "covered": False}],
        })
        result = decision_gate(
            payload,
            plan=_valid_plan(),
            policy={"reject_on_unhedged_material_risks": True},
        )
        assert result["verdict"] == VERDICT_REJECT


# ---------------------------------------------------------------------------
# Policy overrides
# ---------------------------------------------------------------------------

class TestPolicyOverrides:
    def test_relaxed_cost_bps(self):
        plan = _valid_plan(costs={"total": 5000.0})
        payload = _valid_payload(portfolio_notional_usd=100000.0)
        result = decision_gate(payload, plan=plan, policy={"max_total_cost_bps": 1000.0})
        # 500 bps < 1000 bps, should pass
        codes = [r["code"] for r in result["reasons"]]
        assert REASON_COST_TOO_HIGH not in codes

    def test_relaxed_rejected_legs(self):
        plan = _valid_plan(rejections={
            "instrument_mapper": [{"instrument_id": "A"}],
        })
        result = decision_gate(_valid_payload(), plan=plan, policy={"max_rejected_legs": 5})
        codes = [r["code"] for r in result["reasons"]]
        assert REASON_TOO_MANY_REJECTIONS not in codes


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

class TestConstants:
    def test_engine_name(self):
        assert ENGINE_NAME == "decision_gate"

    def test_engine_version(self):
        assert ENGINE_VERSION == "1.0.0"

    def test_verdicts(self):
        assert VERDICT_APPROVE == "APPROVE"
        assert VERDICT_APPROVE_WITH_CONDITIONS == "APPROVE_WITH_CONDITIONS"
        assert VERDICT_REJECT == "REJECT"
