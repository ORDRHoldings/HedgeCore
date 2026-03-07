"""
tests/test_audit_bundle.py

Comprehensive tests for app.engine.audit_bundle — immutable audit artifact builder.

Covers:
  - Canonical JSON determinism
  - Stable hashing
  - Timestamp stripping
  - Input validation (fail-closed)
  - Successful bundle creation
  - Rejection envelopes
  - Policy override
  - Edge cases
"""
from __future__ import annotations

import json
import math

import pytest

from app.engine.audit_bundle import (
    ENGINE_NAME,
    ENGINE_VERSION,
    build_audit_bundle,
    _canonical_json,
    _stable_hash,
    _strip_timestamps,
    _as_dict,
    _as_list,
    _require_str,
    _maybe_dict,
    _is_mapping,
)


# ---------------------------------------------------------------------------
# Minimal valid payload for build_audit_bundle
# ---------------------------------------------------------------------------
def _valid_payload(**overrides) -> dict:
    base = {
        "plan_id": "abc123def456",
        "plan": {"buckets": [{"month": "2026-04", "action_usd": 100000}]},
        "decision": {"verdict": "APPROVE", "decision_hash": "deadbeef1234"},
        "policy_bundle": {"policy_hash": "cafebabe5678"},
        "stage_traces": [
            {"stage": "exposure", "decision_trace": {"total_exposure": 500000}},
            {"stage": "risk_classifier", "decision_trace": {"risk_score": 0.3}},
        ],
    }
    base.update(overrides)
    return base


# ---------------------------------------------------------------------------
# Canonical JSON
# ---------------------------------------------------------------------------

class TestCanonicalJson:
    def test_deterministic_ordering(self):
        a = _canonical_json({"z": 1, "a": 2, "m": 3})
        b = _canonical_json({"a": 2, "m": 3, "z": 1})
        assert a == b

    def test_no_whitespace(self):
        result = _canonical_json({"key": "value"})
        assert " " not in result
        assert result == '{"key":"value"}'

    def test_rejects_nan(self):
        with pytest.raises(ValueError):
            _canonical_json({"val": float("nan")})

    def test_rejects_inf(self):
        with pytest.raises(ValueError):
            _canonical_json({"val": float("inf")})

    def test_unicode_stable(self):
        result = _canonical_json({"name": "Yen ¥"})
        assert "¥" in result

    def test_list_order_preserved(self):
        result = _canonical_json({"items": [3, 1, 2]})
        assert '"items":[3,1,2]' in result


# ---------------------------------------------------------------------------
# Stable hash
# ---------------------------------------------------------------------------

class TestStableHash:
    def test_returns_hex_string(self):
        h = _stable_hash({"x": 1})
        assert isinstance(h, str)
        assert len(h) == 64  # SHA-256 hex

    def test_deterministic(self):
        a = _stable_hash({"x": 1, "y": 2})
        b = _stable_hash({"y": 2, "x": 1})
        assert a == b

    def test_different_inputs_different_hashes(self):
        a = _stable_hash({"x": 1})
        b = _stable_hash({"x": 2})
        assert a != b


# ---------------------------------------------------------------------------
# Timestamp stripping
# ---------------------------------------------------------------------------

class TestStripTimestamps:
    def test_removes_known_keys(self):
        obj = {"data": 1, "timestamps": {}, "created_at": "2026-01-01", "duration_ms": 42}
        result = _strip_timestamps(obj)
        assert "timestamps" not in result
        assert "created_at" not in result
        assert "duration_ms" not in result
        assert result["data"] == 1

    def test_recursive_strip(self):
        obj = {"nested": {"created_at": "x", "value": 10}}
        result = _strip_timestamps(obj)
        assert "created_at" not in result["nested"]
        assert result["nested"]["value"] == 10

    def test_list_preserved(self):
        obj = [{"created_at": "x", "v": 1}, {"v": 2}]
        result = _strip_timestamps(obj)
        assert len(result) == 2
        assert "created_at" not in result[0]
        assert result[1]["v"] == 2

    def test_primitive_passthrough(self):
        assert _strip_timestamps(42) == 42
        assert _strip_timestamps("hello") == "hello"
        assert _strip_timestamps(None) is None


# ---------------------------------------------------------------------------
# Type helpers
# ---------------------------------------------------------------------------

class TestHelpers:
    def test_as_dict_valid(self):
        assert _as_dict({"a": 1}, name="test") == {"a": 1}

    def test_as_dict_invalid(self):
        with pytest.raises(TypeError, match="must be a dict"):
            _as_dict([1, 2], name="test")

    def test_as_list_valid(self):
        assert _as_list([1, 2], name="test") == [1, 2]

    def test_as_list_invalid(self):
        with pytest.raises(TypeError, match="must be a list"):
            _as_list({"a": 1}, name="test")

    def test_require_str_valid(self):
        assert _require_str("hello", name="test") == "hello"

    def test_require_str_strips_whitespace(self):
        assert _require_str("  hello  ", name="test") == "hello"

    def test_require_str_empty_rejects(self):
        with pytest.raises(ValueError, match="non-empty string"):
            _require_str("", name="test")

    def test_require_str_none_rejects(self):
        with pytest.raises(ValueError):
            _require_str(None, name="test")

    def test_maybe_dict_returns_dict(self):
        assert _maybe_dict({"a": 1}) == {"a": 1}

    def test_maybe_dict_returns_none_for_non_dict(self):
        assert _maybe_dict("string") is None
        assert _maybe_dict(42) is None

    def test_is_mapping(self):
        assert _is_mapping({"a": 1}) is True
        assert _is_mapping([]) is False
        assert _is_mapping("x") is False


# ---------------------------------------------------------------------------
# build_audit_bundle — success cases
# ---------------------------------------------------------------------------

class TestBuildAuditBundleSuccess:
    def test_valid_input_produces_bundle(self):
        result = build_audit_bundle(_valid_payload())
        assert result["bundle_id"] is not None
        assert isinstance(result["bundle_id"], str)
        assert len(result["bundle_id"]) == 64
        assert result["bundle"] is not None
        assert result["fingerprints"] is not None

    def test_bundle_contains_plan_id(self):
        result = build_audit_bundle(_valid_payload())
        assert result["bundle"]["plan_id"] == "abc123def456"

    def test_bundle_is_deterministic(self):
        a = build_audit_bundle(_valid_payload())
        b = build_audit_bundle(_valid_payload())
        assert a["bundle_id"] == b["bundle_id"]

    def test_fingerprints_all_present(self):
        result = build_audit_bundle(_valid_payload())
        fps = result["fingerprints"]
        assert "bundle_id" in fps
        assert "plan_fingerprint" in fps
        assert "decision_fingerprint" in fps
        assert "policy_bundle_fingerprint" in fps
        assert "stage_traces_fingerprint" in fps

    def test_meta_has_duration(self):
        result = build_audit_bundle(_valid_payload())
        assert "duration_ms" in result["meta"]

    def test_stage_traces_normalized(self):
        result = build_audit_bundle(_valid_payload())
        traces = result["bundle"]["stage_traces"]
        assert len(traces) == 2
        assert traces[0]["stage"] == "exposure"
        assert traces[1]["stage"] == "risk_classifier"
        assert all(t["status"] == "ok" for t in traces)

    def test_plan_included_by_default(self):
        result = build_audit_bundle(_valid_payload())
        assert result["bundle"]["plan"] is not None

    def test_plan_excluded_when_policy_says_no(self):
        result = build_audit_bundle(
            _valid_payload(),
            policy={"include_plan_object": False},
        )
        assert result["bundle"]["plan"] is None
        assert result["bundle"]["plan_fingerprint"] is not None  # fingerprint still computed

    def test_optional_registries_included(self):
        payload = _valid_payload(
            assumptions_registry={"hedge_cost_model": "linear"},
            disclosures_registry={"data_source": "manual"},
        )
        result = build_audit_bundle(payload)
        regs = result["bundle"]["registries"]
        assert regs["assumptions"]["hedge_cost_model"] == "linear"
        assert regs["disclosures"]["data_source"] == "manual"


# ---------------------------------------------------------------------------
# build_audit_bundle — rejection cases
# ---------------------------------------------------------------------------

class TestBuildAuditBundleRejection:
    def test_non_mapping_payload_rejected(self):
        result = build_audit_bundle("not a dict")
        assert result["rejected"]["reason"] == "bad_input"
        assert result["bundle_id"] is None

    def test_missing_plan_id_rejected(self):
        payload = _valid_payload()
        del payload["plan_id"]
        result = build_audit_bundle(payload)
        assert result["rejected"]["reason"] == "missing_plan_id"

    def test_empty_plan_id_rejected(self):
        result = build_audit_bundle(_valid_payload(plan_id=""))
        assert result["rejected"]["reason"] == "missing_plan_id"

    def test_missing_decision_rejected(self):
        result = build_audit_bundle(_valid_payload(decision=None))
        assert result["rejected"]["reason"] == "missing_decision"

    def test_non_dict_decision_rejected(self):
        result = build_audit_bundle(_valid_payload(decision="approve"))
        assert result["rejected"]["reason"] == "missing_decision"

    def test_missing_policy_bundle_rejected(self):
        result = build_audit_bundle(_valid_payload(policy_bundle=None))
        assert result["rejected"]["reason"] == "missing_policy"

    def test_missing_decision_hash_rejected(self):
        result = build_audit_bundle(_valid_payload(decision={"verdict": "APPROVE"}))
        assert result["rejected"]["reason"] == "missing_decision"

    def test_missing_policy_hash_rejected(self):
        result = build_audit_bundle(_valid_payload(policy_bundle={"name": "test"}))
        assert result["rejected"]["reason"] == "missing_policy"

    def test_policy_fingerprint_accepted_as_alternative(self):
        payload = _valid_payload(policy_bundle={"trace_fingerprint": "abc123"})
        result = build_audit_bundle(payload)
        assert result["bundle_id"] is not None  # accepted

    def test_missing_stage_traces_rejected(self):
        result = build_audit_bundle(_valid_payload(stage_traces=None))
        assert result["rejected"]["reason"] == "missing_trace"

    def test_invalid_assumptions_registry_rejected(self):
        result = build_audit_bundle(_valid_payload(assumptions_registry=[1, 2]))
        assert result["rejected"]["reason"] == "bad_input"

    def test_invalid_disclosures_registry_rejected(self):
        result = build_audit_bundle(_valid_payload(disclosures_registry="string"))
        assert result["rejected"]["reason"] == "bad_input"

    def test_rejected_envelope_has_meta(self):
        result = build_audit_bundle("not a dict")
        assert "meta" in result
        assert "decision_trace" in result["meta"]


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------

class TestEdgeCases:
    def test_empty_stage_traces_list(self):
        result = build_audit_bundle(_valid_payload(stage_traces=[]))
        assert result["bundle_id"] is not None
        assert len(result["bundle"]["stage_traces"]) == 0

    def test_non_dict_trace_entry_skipped(self):
        payload = _valid_payload(stage_traces=[
            "not_a_dict",
            {"stage": "real", "decision_trace": {"x": 1}},
        ])
        result = build_audit_bundle(payload)
        traces = result["bundle"]["stage_traces"]
        assert len(traces) == 1
        assert traces[0]["stage"] == "real"

    def test_trace_without_stage_gets_default_name(self):
        payload = _valid_payload(stage_traces=[
            {"decision_trace": {"value": 42}},
        ])
        result = build_audit_bundle(payload)
        traces = result["bundle"]["stage_traces"]
        assert traces[0]["stage"] == "stage_01"

    def test_max_stage_traces_cap(self):
        traces = [{"stage": f"s{i}", "decision_trace": {"i": i}} for i in range(100)]
        result = build_audit_bundle(
            _valid_payload(stage_traces=traces),
            policy={"max_stage_traces": 5},
        )
        assert len(result["bundle"]["stage_traces"]) == 5

    def test_timestamps_stripped_in_hash_domain(self):
        payload = _valid_payload()
        payload["decision"]["created_at"] = "2026-01-01T00:00:00Z"
        result = build_audit_bundle(payload)
        decision_in_bundle = result["bundle"]["decision"]
        assert "created_at" not in decision_in_bundle

    def test_no_plan_object(self):
        payload = _valid_payload()
        del payload["plan"]
        result = build_audit_bundle(payload)
        assert result["bundle_id"] is not None
        assert result["bundle"]["plan"] is None
        assert result["bundle"]["plan_fingerprint"] is None


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

class TestConstants:
    def test_engine_name(self):
        assert ENGINE_NAME == "audit_bundle"

    def test_engine_version(self):
        assert ENGINE_VERSION == "1.0.0"
