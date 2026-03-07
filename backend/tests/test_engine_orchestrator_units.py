"""
Comprehensive unit tests for backend engine orchestrator modules.

Covers:
  - orchestrator.py: canonical JSON, stable hashing, rejection, run_engine
  - strategy_selector.py: axis helpers, clamp, normalization, catalog constants
  - hedge_sizer.py: rounding modes, sizing logic, margin resolution
  - cost_engine.py: price key selection, cost computation, rejection paths
  - scenario_engine.py: scenario generation, effectiveness, clamp, helpers
"""
from __future__ import annotations

import json
import math
from collections.abc import Mapping
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

# =====================================================================
# 1. ORCHESTRATOR TESTS
# =====================================================================
from app.engine.orchestrator import (
    ENGINE_NAME as ORCH_ENGINE_NAME,
    ENGINE_VERSION as ORCH_ENGINE_VERSION,
    _canonical_json as orch_canonical_json,
    _now_ms as orch_now_ms,
    _reject,
    _stable_hash as orch_stable_hash,
    run_engine,
)


class TestOrchestratorCanonicalJson:
    """Tests for orchestrator._canonical_json deterministic serialization."""

    def test_sort_keys(self):
        result = orch_canonical_json({"b": 2, "a": 1})
        assert result == '{"a":1,"b":2}'

    def test_no_spaces(self):
        result = orch_canonical_json({"key": "value"})
        assert " " not in result
        assert result == '{"key":"value"}'

    def test_nested_sort(self):
        obj = {"z": {"b": 2, "a": 1}, "a": 0}
        result = orch_canonical_json(obj)
        parsed = json.loads(result)
        assert list(parsed.keys()) == ["a", "z"]

    def test_rejects_nan(self):
        with pytest.raises(ValueError):
            orch_canonical_json({"x": float("nan")})

    def test_rejects_inf(self):
        with pytest.raises(ValueError):
            orch_canonical_json({"x": float("inf")})

    def test_unicode_preserved(self):
        result = orch_canonical_json({"name": "cafe\u0301"})
        assert "caf" in result

    def test_empty_object(self):
        assert orch_canonical_json({}) == "{}"

    def test_list_values(self):
        result = orch_canonical_json({"items": [3, 1, 2]})
        assert result == '{"items":[3,1,2]}'


class TestOrchestratorStableHash:
    """Tests for orchestrator._stable_hash determinism."""

    def test_same_input_same_hash(self):
        obj = {"a": 1, "b": 2}
        h1 = orch_stable_hash(obj)
        h2 = orch_stable_hash(obj)
        assert h1 == h2

    def test_key_order_irrelevant(self):
        h1 = orch_stable_hash({"a": 1, "b": 2})
        h2 = orch_stable_hash({"b": 2, "a": 1})
        assert h1 == h2

    def test_different_values_different_hash(self):
        h1 = orch_stable_hash({"a": 1})
        h2 = orch_stable_hash({"a": 2})
        assert h1 != h2

    def test_hash_is_sha256_hex(self):
        h = orch_stable_hash({"test": True})
        assert len(h) == 64
        assert all(c in "0123456789abcdef" for c in h)


class TestOrchestratorNowMs:
    """Tests for orchestrator._now_ms."""

    def test_returns_int(self):
        result = orch_now_ms()
        assert isinstance(result, int)

    def test_positive(self):
        result = orch_now_ms()
        assert result > 0

    def test_reasonable_range(self):
        result = orch_now_ms()
        # Should be after 2020-01-01 in ms
        assert result > 1577836800000


class TestOrchestratorReject:
    """Tests for orchestrator._reject helper."""

    def test_reject_structure(self):
        import time

        result = _reject(
            reason="test_reason",
            details={"field": "test"},
            started_at=time.perf_counter(),
        )
        assert result["status"] == "rejected"
        assert "trace" in result
        assert "rejection" in result
        assert result["rejection"]["reason"] == "test_reason"
        assert result["rejection"]["details"]["field"] == "test"

    def test_reject_includes_engine_info_without_trace(self):
        import time

        result = _reject(
            reason="bad",
            details={},
            started_at=time.perf_counter(),
        )
        trace = result["trace"]
        assert trace["engine"]["name"] == ORCH_ENGINE_NAME
        assert trace["engine"]["version"] == ORCH_ENGINE_VERSION

    def test_reject_with_existing_trace(self):
        import time

        existing_trace = {
            "engine": {"name": "test", "version": "0.0"},
            "run_id": "abc",
        }
        result = _reject(
            reason="err",
            details={"x": 1},
            started_at=time.perf_counter(),
            trace=existing_trace,
        )
        # Should mutate existing trace, not create new one
        assert result["trace"]["run_id"] == "abc"
        assert result["trace"]["rejection"]["reason"] == "err"

    def test_reject_has_trace_bundle_fingerprint(self):
        import time

        result = _reject(
            reason="test",
            details={},
            started_at=time.perf_counter(),
        )
        assert "trace_bundle_fingerprint" in result["trace"]
        fp = result["trace"]["trace_bundle_fingerprint"]
        assert len(fp) == 64

    def test_reject_duration_ms_non_negative(self):
        import time

        t0 = time.perf_counter()
        result = _reject(reason="x", details={}, started_at=t0)
        assert result["rejection"]["duration_ms"] >= 0


class TestRunEngine:
    """Tests for orchestrator.run_engine main entrypoint."""

    def test_non_mapping_envelope_rejected(self):
        result = run_engine("not a mapping")
        assert result["status"] == "rejected"
        assert result["rejection"]["reason"] == "bad_envelope"

    def test_non_mapping_payload_rejected(self):
        result = run_engine({"run_id": "r1", "payload": "string"})
        assert result["status"] == "rejected"
        assert result["rejection"]["reason"] == "missing_payload"

    def test_missing_payload_rejected(self):
        result = run_engine({"run_id": "r1"})
        assert result["status"] == "rejected"
        assert result["rejection"]["reason"] == "missing_payload"

    @patch("app.engine.orchestrator.recommend")
    def test_successful_run(self, mock_recommend):
        mock_recommend.return_value = {
            "plan_id": "plan_abc",
            "meta": {
                "decision_trace": {
                    "trace_fingerprint": "abc123def456" * 4 + "abcdef0123456789",
                },
            },
        }
        envelope = {
            "run_id": "run_001",
            "market_snapshot": {"rates": {"USD": 1.0}},
            "policy_bundle": {"min_score": 0.1},
            "payload": {"positions": [{"id": 1}]},
        }
        result = run_engine(envelope)
        assert result["status"] == "ok"
        assert result["run_id"] == "run_001"
        assert result["plan_id"] == "plan_abc"
        assert "trace" in result
        assert result["trace"]["run_id"] == "run_001"
        assert result["trace"]["snapshot_hash"] is not None
        assert result["trace"]["policy_hash"] is not None
        mock_recommend.assert_called_once()

    @patch("app.engine.orchestrator.recommend")
    def test_recommend_exception_produces_rejection(self, mock_recommend):
        mock_recommend.side_effect = ValueError("engine failed")
        envelope = {
            "run_id": "run_002",
            "market_snapshot": None,
            "policy_bundle": None,
            "payload": {"data": 1},
        }
        result = run_engine(envelope)
        assert result["status"] == "rejected"
        assert result["rejection"]["reason"] == "engine_exception"
        assert result["rejection"]["details"]["type"] == "ValueError"

    @patch("app.engine.orchestrator.recommend")
    def test_none_market_snapshot_hash(self, mock_recommend):
        mock_recommend.return_value = {"plan_id": None, "meta": {}}
        envelope = {
            "run_id": "r",
            "market_snapshot": None,
            "policy_bundle": None,
            "payload": {"x": 1},
        }
        result = run_engine(envelope)
        assert result["status"] == "ok"
        assert result["trace"]["snapshot_hash"] is None
        assert result["trace"]["policy_hash"] is None

    @patch("app.engine.orchestrator.recommend")
    def test_trace_has_duration(self, mock_recommend):
        mock_recommend.return_value = {"plan_id": "p", "meta": {}}
        envelope = {
            "run_id": "r",
            "payload": {"a": 1},
        }
        result = run_engine(envelope)
        assert result["trace"]["duration_ms"] >= 0

    @patch("app.engine.orchestrator.recommend")
    def test_trace_bundle_fingerprint_deterministic(self, mock_recommend):
        mock_recommend.return_value = {
            "plan_id": "plan_x",
            "meta": {"decision_trace": {"trace_fingerprint": "abc" * 20 + "abcd"}},
        }
        envelope = {
            "run_id": "r",
            "market_snapshot": {"a": 1},
            "policy_bundle": {"b": 2},
            "payload": {"c": 3},
        }
        r1 = run_engine(envelope)
        r2 = run_engine(envelope)
        assert r1["trace"]["trace_bundle_fingerprint"] == r2["trace"]["trace_bundle_fingerprint"]


# =====================================================================
# 2. STRATEGY SELECTOR HELPER TESTS
# =====================================================================
from app.engine.strategy_selector import (
    _AXIS_ALIASES,
    _CANONICAL_AXES,
    STRATEGY_CATALOG,
    _as_float as ss_as_float,
    _as_int as ss_as_int,
    _as_list as ss_as_list,
    _as_str as ss_as_str,
    _clamp01,
    _normalize_axis_id,
    _validate_axis_id,
)


class TestStrategyHelpers:
    """Tests for strategy_selector pure helper functions."""

    def test_as_float_normal(self):
        assert ss_as_float(3.14) == pytest.approx(3.14)

    def test_as_float_string(self):
        assert ss_as_float("2.5") == pytest.approx(2.5)

    def test_as_float_nan_returns_default(self):
        assert ss_as_float(float("nan")) == 0.0

    def test_as_float_inf_returns_default(self):
        assert ss_as_float(float("inf"), 99.0) == 99.0

    def test_as_float_none_returns_default(self):
        assert ss_as_float(None, 5.0) == 5.0

    def test_as_float_non_numeric_returns_default(self):
        assert ss_as_float("abc", 7.0) == 7.0

    def test_as_int_normal(self):
        assert ss_as_int(42) == 42

    def test_as_int_string(self):
        assert ss_as_int("10") == 10

    def test_as_int_none_returns_default(self):
        assert ss_as_int(None, 5) == 5

    def test_as_int_invalid_returns_default(self):
        assert ss_as_int("not_a_number", 99) == 99

    def test_as_str_none(self):
        assert ss_as_str(None) == ""

    def test_as_str_with_spaces(self):
        assert ss_as_str("  hello  ") == "hello"

    def test_as_str_int(self):
        assert ss_as_str(42) == "42"

    def test_as_list_actual_list(self):
        assert ss_as_list([1, 2, 3]) == [1, 2, 3]

    def test_as_list_non_list(self):
        assert ss_as_list("not_a_list") == []

    def test_as_list_none(self):
        assert ss_as_list(None) == []


class TestClamp01:
    """Tests for strategy_selector._clamp01."""

    def test_below_zero(self):
        assert _clamp01(-0.5) == 0.0

    def test_above_one(self):
        assert _clamp01(1.5) == 1.0

    def test_within_range(self):
        assert _clamp01(0.5) == 0.5

    def test_exact_zero(self):
        assert _clamp01(0.0) == 0.0

    def test_exact_one(self):
        assert _clamp01(1.0) == 1.0


class TestValidateAxisId:
    """Tests for strategy_selector._validate_axis_id."""

    def test_valid_axis(self):
        assert _validate_axis_id("R1_DELTA", _CANONICAL_AXES) is True

    def test_invalid_axis(self):
        assert _validate_axis_id("R99_FAKE", _CANONICAL_AXES) is False

    def test_empty_string(self):
        assert _validate_axis_id("", _CANONICAL_AXES) is False

    def test_all_canonical_axes_valid(self):
        for axis in _CANONICAL_AXES:
            assert _validate_axis_id(axis, _CANONICAL_AXES) is True


class TestNormalizeAxisId:
    """Tests for strategy_selector._normalize_axis_id."""

    def test_canonical_axis_unchanged(self):
        axis, alias = _normalize_axis_id("R1_DELTA", _CANONICAL_AXES)
        assert axis == "R1_DELTA"
        assert alias is None

    def test_known_alias_mapped(self):
        axis, alias = _normalize_axis_id("R2_GAMMA", _CANONICAL_AXES)
        assert axis == "R3_GAMMA"
        assert alias == "R2_GAMMA"

    def test_another_alias(self):
        axis, alias = _normalize_axis_id("R3_VEGA", _CANONICAL_AXES)
        assert axis == "R2_VEGA"
        assert alias == "R3_VEGA"

    def test_unknown_axis(self):
        axis, alias = _normalize_axis_id("R99_UNKNOWN", _CANONICAL_AXES)
        assert axis == ""
        assert alias is None

    def test_empty_string(self):
        axis, alias = _normalize_axis_id("", _CANONICAL_AXES)
        assert axis == ""
        assert alias is None

    def test_none_input(self):
        axis, alias = _normalize_axis_id(None, _CANONICAL_AXES)
        assert axis == ""
        assert alias is None


class TestCanonicalAxes:
    """Tests for strategy_selector canonical axis constants."""

    def test_eight_axes(self):
        assert len(_CANONICAL_AXES) == 8

    def test_starts_with_r1(self):
        assert _CANONICAL_AXES[0] == "R1_DELTA"

    def test_ends_with_r8(self):
        assert _CANONICAL_AXES[-1] == "R8_TAIL"

    def test_all_aliases_map_to_canonical(self):
        for alias, canonical in _AXIS_ALIASES.items():
            assert canonical in _CANONICAL_AXES, f"Alias {alias} maps to non-canonical {canonical}"


class TestStrategyCatalog:
    """Tests for the frozen STRATEGY_CATALOG."""

    def test_catalog_not_empty(self):
        assert len(STRATEGY_CATALOG) > 0

    def test_all_have_strategy_id(self):
        for s in STRATEGY_CATALOG:
            assert s.strategy_id, f"Strategy missing strategy_id: {s}"

    def test_unique_strategy_ids(self):
        ids = [s.strategy_id for s in STRATEGY_CATALOG]
        assert len(ids) == len(set(ids)), "Duplicate strategy IDs found"

    def test_all_cover_canonical_axes(self):
        for s in STRATEGY_CATALOG:
            for axis in s.covers_axes:
                assert axis in _CANONICAL_AXES, (
                    f"Strategy {s.strategy_id} covers non-canonical axis {axis}"
                )

    def test_complexity_positive(self):
        for s in STRATEGY_CATALOG:
            assert s.complexity >= 1

    def test_max_instruments_positive(self):
        for s in STRATEGY_CATALOG:
            assert s.max_instruments >= 1


# =====================================================================
# 3. HEDGE SIZER TESTS
# =====================================================================
from app.engine.hedge_sizer import (
    REASON_BAD_INPUT,
    REASON_MISSING_EXPOSURE,
    REASON_MISSING_INSTRUMENT_SPEC,
    REASON_MISSING_MARGIN_MODEL,
    REASON_MISSING_MARKET_INPUT,
    REASON_UNSUPPORTED_SIZING,
    REASON_ZERO_SENSITIVITY,
    ROUNDING_AWAY_FROM_ZERO,
    ROUNDING_CEIL,
    ROUNDING_FLOOR,
    ROUNDING_NEAREST,
    ROUNDING_TOWARD_ZERO,
    _as_float as hs_as_float,
    _as_int as hs_as_int,
    _clamp_int as hs_clamp_int,
    _is_finite_number as hs_is_finite,
    _round_contracts,
    size_hedges,
)


class TestHedgeSizerRounding:
    """Tests for hedge_sizer._round_contracts deterministic rounding."""

    def test_nearest_round_down(self):
        assert _round_contracts(2.3, ROUNDING_NEAREST) == 2

    def test_nearest_round_up(self):
        assert _round_contracts(2.7, ROUNDING_NEAREST) == 3

    def test_nearest_tie_away_from_zero(self):
        # 0.5 -> 1 (away from zero)
        assert _round_contracts(2.5, ROUNDING_NEAREST) == 3

    def test_nearest_negative_tie(self):
        # -2.5 -> -3 (away from zero)
        assert _round_contracts(-2.5, ROUNDING_NEAREST) == -3

    def test_floor(self):
        assert _round_contracts(2.9, ROUNDING_FLOOR) == 2

    def test_floor_negative(self):
        assert _round_contracts(-2.1, ROUNDING_FLOOR) == -3

    def test_ceil(self):
        assert _round_contracts(2.1, ROUNDING_CEIL) == 3

    def test_ceil_negative(self):
        assert _round_contracts(-2.9, ROUNDING_CEIL) == -2

    def test_toward_zero(self):
        assert _round_contracts(2.9, ROUNDING_TOWARD_ZERO) == 2

    def test_toward_zero_negative(self):
        assert _round_contracts(-2.9, ROUNDING_TOWARD_ZERO) == -2

    def test_away_from_zero(self):
        assert _round_contracts(2.1, ROUNDING_AWAY_FROM_ZERO) == 3

    def test_away_from_zero_negative(self):
        assert _round_contracts(-2.1, ROUNDING_AWAY_FROM_ZERO) == -3

    def test_nan_returns_zero(self):
        assert _round_contracts(float("nan"), ROUNDING_NEAREST) == 0

    def test_inf_returns_zero(self):
        assert _round_contracts(float("inf"), ROUNDING_NEAREST) == 0

    def test_zero_stays_zero(self):
        assert _round_contracts(0.0, ROUNDING_NEAREST) == 0

    def test_exact_integer(self):
        assert _round_contracts(5.0, ROUNDING_NEAREST) == 5


class TestHedgeSizerHelpers:
    """Tests for hedge_sizer helper functions."""

    def test_is_finite_number_int(self):
        assert hs_is_finite(42) is True

    def test_is_finite_number_float(self):
        assert hs_is_finite(3.14) is True

    def test_is_finite_number_nan(self):
        assert hs_is_finite(float("nan")) is False

    def test_is_finite_number_inf(self):
        assert hs_is_finite(float("inf")) is False

    def test_is_finite_number_string(self):
        assert hs_is_finite("42") is False

    def test_is_finite_number_none(self):
        assert hs_is_finite(None) is False

    def test_clamp_int_below(self):
        assert hs_clamp_int(-5, 0, 100) == 0

    def test_clamp_int_above(self):
        assert hs_clamp_int(200, 0, 100) == 100

    def test_clamp_int_within(self):
        assert hs_clamp_int(50, 0, 100) == 50


class TestSizeHedgesDeltaNeutral:
    """Tests for hedge_sizer.size_hedges with delta-neutral sizing."""

    def _make_futures_payload(
        self,
        *,
        delta_usd: float = -125000.0,
        price: float = 17500.0,
        multiplier: float = 2.0,
        strategy_id: str = "index_futures",
        instrument_id: str = "MNQ_FUT",
        margin_per_contract: float = 1800.0,
    ) -> dict[str, Any]:
        return {
            "exposures": {"delta_usd": delta_usd},
            "mapped_instruments": [
                {
                    "strategy_id": strategy_id,
                    "instrument_id": instrument_id,
                    "asset_class": "futures",
                }
            ],
            "instrument_specs": {
                instrument_id: {
                    "asset_class": "futures",
                    "contract_multiplier": multiplier,
                    "constraints": {
                        "min_contract": 1,
                        "max_contract": 200,
                        "initial_margin_per_contract": margin_per_contract,
                    },
                }
            },
            "market": {
                "prices": {instrument_id: price},
            },
        }

    def test_basic_futures_sizing(self):
        payload = self._make_futures_payload()
        result = size_hedges(payload)
        assert len(result["sized_hedges"]) == 1
        h = result["sized_hedges"][0]
        assert h["instrument_id"] == "MNQ_FUT"
        assert h["sizing_method"] == "delta_neutral"
        # delta_usd / (price * multiplier) = -(-125000) / (17500*2) = 125000/35000 ~= 3.57 -> 4
        assert h["contracts"] == 4

    def test_zero_exposure_clamped_to_min_contract(self):
        """When delta_usd=0, raw contracts=0 but _apply_caps clamps to min_contract=1."""
        payload = self._make_futures_payload(delta_usd=0.0)
        result = size_hedges(payload)
        assert len(result["sized_hedges"]) == 1
        # min_contract=1 in constraints forces clamping from 0 to 1
        assert result["sized_hedges"][0]["contracts"] == 1

    def test_zero_exposure_zero_contracts_when_min_zero(self):
        """When min_contract=0 and delta_usd=0, contracts stays 0."""
        payload = self._make_futures_payload(delta_usd=0.0)
        payload["instrument_specs"]["MNQ_FUT"]["constraints"]["min_contract"] = 0
        result = size_hedges(payload)
        assert len(result["sized_hedges"]) == 1
        assert result["sized_hedges"][0]["contracts"] == 0

    def test_missing_price_rejected(self):
        payload = self._make_futures_payload()
        payload["market"]["prices"] = {}
        result = size_hedges(payload)
        assert len(result["rejected"]) >= 1
        assert result["rejected"][0]["reason"] == REASON_MISSING_MARKET_INPUT

    def test_missing_instrument_spec_rejected(self):
        payload = self._make_futures_payload()
        payload["instrument_specs"] = {}
        result = size_hedges(payload)
        assert len(result["rejected"]) >= 1
        assert result["rejected"][0]["reason"] == REASON_MISSING_INSTRUMENT_SPEC

    def test_non_dict_row_rejected(self):
        payload = {
            "exposures": {"delta_usd": -100.0},
            "mapped_instruments": ["not_a_dict"],
            "instrument_specs": {},
            "market": {"prices": {}},
        }
        result = size_hedges(payload)
        assert len(result["rejected"]) >= 1
        assert result["rejected"][0]["reason"] == REASON_BAD_INPUT

    def test_missing_instrument_id_rejected(self):
        payload = {
            "exposures": {"delta_usd": -100.0},
            "mapped_instruments": [{"strategy_id": "x", "instrument_id": "", "asset_class": "futures"}],
            "instrument_specs": {},
            "market": {"prices": {}},
        }
        result = size_hedges(payload)
        assert len(result["rejected"]) >= 1
        assert result["rejected"][0]["reason"] == REASON_BAD_INPUT

    def test_unsupported_strategy_rejected(self):
        payload = self._make_futures_payload(strategy_id="unknown_strategy")
        result = size_hedges(payload)
        assert len(result["rejected"]) >= 1
        assert result["rejected"][0]["reason"] == REASON_UNSUPPORTED_SIZING

    def test_meta_has_duration(self):
        payload = self._make_futures_payload()
        result = size_hedges(payload)
        assert "duration_ms" in result["meta"]
        assert result["meta"]["duration_ms"] >= 0

    def test_meta_has_total_margin(self):
        payload = self._make_futures_payload()
        result = size_hedges(payload)
        assert "total_estimated_margin_usd" in result["meta"]
        assert result["meta"]["total_estimated_margin_usd"] >= 0

    def test_margin_per_contract_model(self):
        payload = self._make_futures_payload(margin_per_contract=2000.0)
        result = size_hedges(payload)
        h = result["sized_hedges"][0]
        expected_margin = abs(h["contracts"]) * 2000.0
        assert h["estimated_margin_usd"] == pytest.approx(expected_margin)

    def test_options_sizing_requires_underlying_and_delta(self):
        payload = {
            "exposures": {"delta_usd": -50000.0},
            "mapped_instruments": [
                {
                    "strategy_id": "index_futures",
                    "instrument_id": "SPY_OPT",
                    "asset_class": "options",
                }
            ],
            "instrument_specs": {
                "SPY_OPT": {
                    "asset_class": "options",
                    "contract_multiplier": 100.0,
                    "constraints": {
                        "min_contract": 1,
                        "max_contract": 500,
                        "margin_pct_notional": 0.10,
                    },
                }
            },
            "market": {
                "prices": {"SPY_OPT_UNDERLYING": 510.0},
                "option_deltas": {"SPY_OPT": -0.30},
            },
        }
        result = size_hedges(payload)
        assert len(result["sized_hedges"]) == 1
        h = result["sized_hedges"][0]
        # per_contract = -0.30 * 510 * 100 = -15300
        # contracts = -(-50000) / -15300 = -3.27 -> -3 (nearest)
        assert h["sizing_method"] == "delta_neutral"
        assert h["contracts"] != 0

    def test_options_missing_underlying_price_rejected(self):
        payload = {
            "exposures": {"delta_usd": -50000.0},
            "mapped_instruments": [
                {
                    "strategy_id": "index_futures",
                    "instrument_id": "SPY_OPT",
                    "asset_class": "options",
                }
            ],
            "instrument_specs": {
                "SPY_OPT": {
                    "asset_class": "options",
                    "contract_multiplier": 100.0,
                    "constraints": {"min_contract": 1, "max_contract": 500},
                }
            },
            "market": {
                "prices": {},
                "option_deltas": {"SPY_OPT": -0.30},
            },
        }
        result = size_hedges(payload)
        assert len(result["rejected"]) >= 1

    def test_vega_driven_sizing(self):
        payload = {
            "exposures": {"delta_usd": 0.0, "vega_usd": 24000.0},
            "mapped_instruments": [
                {
                    "strategy_id": "volatility_futures",
                    "instrument_id": "VIX_FUT",
                    "asset_class": "futures",
                }
            ],
            "instrument_specs": {
                "VIX_FUT": {
                    "asset_class": "futures",
                    "contract_multiplier": 1000.0,
                    "constraints": {
                        "min_contract": 1,
                        "max_contract": 100,
                        "initial_margin_per_contract": 5000.0,
                    },
                }
            },
            "market": {
                "prices": {"VIX_FUT": 18.0},
                "sensitivities": {
                    "VIX_FUT": {"vega_usd_per_contract": 1200.0},
                },
            },
        }
        result = size_hedges(payload)
        assert len(result["sized_hedges"]) == 1
        h = result["sized_hedges"][0]
        assert h["sizing_method"] == "vega_target"
        # contracts_float = -24000 / 1200 = -20, but _apply_caps clamps
        # between min_contract=1 and max_contract=100, so -20 -> 1
        # (negative values get clamped to the min_contract floor)
        assert h["contracts"] == 1


class TestSizeHedgesEdgeCases:
    """Edge case tests for hedge_sizer.size_hedges."""

    def test_empty_mapped_instruments(self):
        payload = {
            "exposures": {"delta_usd": -100.0},
            "mapped_instruments": [],
            "instrument_specs": {},
            "market": {"prices": {}},
        }
        result = size_hedges(payload)
        assert result["sized_hedges"] == []
        assert result["rejected"] == []

    def test_none_exposures(self):
        payload = {
            "exposures": None,
            "mapped_instruments": [],
            "instrument_specs": {},
            "market": {"prices": {}},
        }
        result = size_hedges(payload)
        assert result["sized_hedges"] == []

    def test_missing_margin_model_rejection(self):
        """When contracts != 0 and no margin model found, it should reject."""
        payload = {
            "exposures": {"delta_usd": -100000.0},
            "mapped_instruments": [
                {
                    "strategy_id": "index_futures",
                    "instrument_id": "TEST_FUT",
                    "asset_class": "futures",
                }
            ],
            "instrument_specs": {
                "TEST_FUT": {
                    "asset_class": "futures",
                    "contract_multiplier": 50.0,
                    "constraints": {
                        "min_contract": 1,
                        "max_contract": 100,
                        # No margin fields at all
                    },
                }
            },
            "market": {"prices": {"TEST_FUT": 5000.0}},
        }
        result = size_hedges(payload)
        assert len(result["rejected"]) >= 1
        assert any(r["reason"] == REASON_MISSING_MARGIN_MODEL for r in result["rejected"])


# =====================================================================
# 4. COST ENGINE TESTS
# =====================================================================
from app.engine.cost_engine import (
    COST_METHODOLOGY,
    REASON_BAD_INPUT as CE_REASON_BAD_INPUT,
    REASON_INVALID_CONTRACTS as CE_REASON_INVALID_CONTRACTS,
    REASON_MISSING_MARKET_INPUT as CE_REASON_MISSING_MARKET_INPUT,
    REASON_UNSUPPORTED_COST_MODEL as CE_REASON_UNSUPPORTED_COST_MODEL,
    _clamp_float,
    _is_finite_number as ce_is_finite,
    _pick_price_key,
    compute_costs,
)


class TestCostEnginePickPriceKey:
    """Tests for cost_engine._pick_price_key."""

    def test_futures_uses_instrument_id(self):
        prices = {"MNQ_FUT": 17500.0}
        key, px = _pick_price_key("MNQ_FUT", "futures", prices)
        assert key == "MNQ_FUT"
        assert px == 17500.0

    def test_options_uses_underlying_key(self):
        prices = {"SPY_OPT_UNDERLYING": 510.0}
        key, px = _pick_price_key("SPY_OPT", "options", prices)
        assert key == "SPY_OPT_UNDERLYING"
        assert px == 510.0

    def test_missing_price_returns_none(self):
        key, px = _pick_price_key("MISSING", "futures", {})
        assert key is None
        assert px is None

    def test_zero_price_returns_none(self):
        key, px = _pick_price_key("TEST", "futures", {"TEST": 0.0})
        assert key is None
        assert px is None

    def test_negative_price_returns_none(self):
        key, px = _pick_price_key("TEST", "futures", {"TEST": -1.0})
        assert key is None
        assert px is None


class TestCostEngineClampFloat:
    """Tests for cost_engine._clamp_float."""

    def test_below_range(self):
        assert _clamp_float(-5.0, 0.0, 10.0) == 0.0

    def test_above_range(self):
        assert _clamp_float(15.0, 0.0, 10.0) == 10.0

    def test_within_range(self):
        assert _clamp_float(5.0, 0.0, 10.0) == 5.0


class TestComputeCosts:
    """Tests for cost_engine.compute_costs."""

    def _make_payload(self) -> dict[str, Any]:
        return {
            "sized_hedges": [
                {
                    "strategy_id": "index_futures",
                    "instrument_id": "MNQ_FUT",
                    "contracts": 4,
                    "notional_usd": 140000.0,
                }
            ],
            "instrument_meta": {
                "MNQ_FUT": {
                    "asset_class": "futures",
                    "cost_model": "spread_plus_margin",
                    "contract_multiplier": 2.0,
                }
            },
            "market": {
                "prices": {"MNQ_FUT": 17500.0},
            },
            "assumptions": {
                "spreads_bps": {"MNQ_FUT": 0.4},
                "fees_per_contract": {"MNQ_FUT": 2.20},
                "margin_rate": {"MNQ_FUT": 0.05},
                "holding_period_days": 21,
            },
        }

    def test_basic_cost_computation(self):
        result = compute_costs(self._make_payload())
        assert "costs" in result
        assert "breakdown" in result
        assert len(result["breakdown"]) == 1
        costs = result["costs"]
        assert costs["total"] >= 0
        assert costs["cost_methodology"] == COST_METHODOLOGY

    def test_zero_contracts_zero_cost(self):
        payload = self._make_payload()
        payload["sized_hedges"][0]["contracts"] = 0
        result = compute_costs(payload)
        assert len(result["breakdown"]) == 1
        assert result["breakdown"][0]["total"] == 0.0

    def test_non_int_contracts_rejected(self):
        payload = self._make_payload()
        payload["sized_hedges"][0]["contracts"] = 2.5
        result = compute_costs(payload)
        assert len(result["rejected"]) >= 1
        assert result["rejected"][0]["reason"] == CE_REASON_INVALID_CONTRACTS

    def test_missing_instrument_meta_rejected(self):
        payload = self._make_payload()
        payload["instrument_meta"] = {}
        result = compute_costs(payload)
        assert len(result["rejected"]) >= 1
        assert result["rejected"][0]["reason"] == CE_REASON_BAD_INPUT

    def test_missing_price_rejected(self):
        payload = self._make_payload()
        payload["market"]["prices"] = {}
        result = compute_costs(payload)
        assert len(result["rejected"]) >= 1
        assert result["rejected"][0]["reason"] == CE_REASON_MISSING_MARKET_INPUT

    def test_unsupported_cost_model_rejected(self):
        payload = self._make_payload()
        payload["instrument_meta"]["MNQ_FUT"]["cost_model"] = "unknown_model"
        result = compute_costs(payload)
        assert len(result["rejected"]) >= 1
        assert result["rejected"][0]["reason"] == CE_REASON_UNSUPPORTED_COST_MODEL

    def test_round_trip_doubles_spread_and_fees(self):
        payload = self._make_payload()
        result_single = compute_costs(payload)

        result_round = compute_costs(payload, policy={"assume_round_trip": True})
        single_one_time = result_single["costs"]["one_time"]["total"]
        round_one_time = result_round["costs"]["one_time"]["total"]
        # Round trip should approximately double spread+fees (premium excluded from doubling for options)
        assert round_one_time > single_one_time

    def test_holding_period_affects_carry(self):
        payload = self._make_payload()
        result_short = compute_costs(payload, policy={"default_holding_period_days": 7})
        result_long = compute_costs(payload, policy={"default_holding_period_days": 90})
        # The payload itself specifies 21 days, so we must override that too
        payload_short = self._make_payload()
        payload_short["assumptions"]["holding_period_days"] = 7
        payload_long = self._make_payload()
        payload_long["assumptions"]["holding_period_days"] = 90
        r_short = compute_costs(payload_short)
        r_long = compute_costs(payload_long)
        # Longer holding period -> higher carry (margin financing)
        assert r_long["costs"]["carry"]["total"] >= r_short["costs"]["carry"]["total"]

    def test_empty_sized_hedges(self):
        payload = self._make_payload()
        payload["sized_hedges"] = []
        result = compute_costs(payload)
        assert result["costs"]["total"] == 0.0
        assert result["breakdown"] == []
        assert result["rejected"] == []

    def test_non_dict_row_rejected(self):
        payload = self._make_payload()
        payload["sized_hedges"] = ["not_a_dict"]
        result = compute_costs(payload)
        assert len(result["rejected"]) >= 1
        assert result["rejected"][0]["reason"] == CE_REASON_BAD_INPUT


# =====================================================================
# 5. SCENARIO ENGINE TESTS
# =====================================================================
from app.engine.scenario_engine import (
    REASON_BAD_INPUT as SE_REASON_BAD_INPUT,
    REASON_INVALID_SCENARIOS,
    REASON_MISSING_MARKET_INPUT as SE_REASON_MISSING_MARKET_INPUT,
    REASON_NO_VALID_HEDGES,
    REASON_UNSUPPORTED_ASSET_CLASS,
    _clamp as se_clamp,
    _is_effectively_zero as se_is_eff_zero,
    _price_key_for_instrument,
    _scenario_id_from_obj,
    run_scenarios,
)


class TestScenarioHelpers:
    """Tests for scenario_engine helper functions."""

    def test_clamp_below(self):
        assert se_clamp(-5.0, 0.0, 1.0) == 0.0

    def test_clamp_above(self):
        assert se_clamp(5.0, 0.0, 1.0) == 1.0

    def test_clamp_within(self):
        assert se_clamp(0.5, 0.0, 1.0) == 0.5

    def test_is_effectively_zero_true(self):
        assert se_is_eff_zero(1e-15, 1e-12) is True

    def test_is_effectively_zero_false(self):
        assert se_is_eff_zero(0.1, 1e-12) is False

    def test_is_effectively_zero_nan(self):
        # math.isfinite(nan) is False, so the function returns False (not zero)
        assert se_is_eff_zero(float("nan"), 1e-12) is False

    def test_price_key_futures(self):
        assert _price_key_for_instrument("MNQ_FUT", "futures") == "MNQ_FUT"

    def test_price_key_options(self):
        assert _price_key_for_instrument("SPY_OPT", "options") == "SPY_OPT_UNDERLYING"

    def test_price_key_perp(self):
        assert _price_key_for_instrument("BTC_PERP", "perp") == "BTC_PERP"

    def test_scenario_id_from_obj_explicit(self):
        assert _scenario_id_from_obj({"scenario_id": "crash_10"}, 0) == "crash_10"

    def test_scenario_id_from_obj_fallback(self):
        assert _scenario_id_from_obj({}, 0) == "SCENARIO_01"

    def test_scenario_id_from_obj_empty_string(self):
        assert _scenario_id_from_obj({"scenario_id": "  "}, 2) == "SCENARIO_03"

    def test_scenario_id_from_obj_none(self):
        assert _scenario_id_from_obj({"scenario_id": None}, 5) == "SCENARIO_06"


class TestRunScenarios:
    """Tests for scenario_engine.run_scenarios."""

    def _make_payload(self) -> dict[str, Any]:
        return {
            "portfolio": {
                "exposures": {"delta_usd": -100000.0, "vega_usd": 20000.0},
                "baseline_pnl_proxy_usd": 0.0,
            },
            "sized_hedges": [
                {
                    "strategy_id": "index_futures",
                    "instrument_id": "MNQ_FUT",
                    "contracts": 3,
                }
            ],
            "instrument_meta": {
                "MNQ_FUT": {
                    "asset_class": "futures",
                    "contract_multiplier": 2.0,
                    "underlying": "SPX",
                }
            },
            "market": {
                "prices": {"MNQ_FUT": 17500.0},
            },
            "scenarios": [
                {
                    "scenario_id": "crash_10pct",
                    "shocks": {"equity_move_pct": -0.10, "vol_move_pct": 0.30},
                }
            ],
            "costs": {"total": 500.0},
        }

    def test_basic_scenario(self):
        result = run_scenarios(self._make_payload())
        assert len(result["results"]) == 1
        r = result["results"][0]
        assert r["scenario_id"] == "crash_10pct"
        assert "portfolio" in r
        assert "net" in r
        assert r["portfolio"]["pnl_usd"] != 0.0

    def test_portfolio_pnl_computation(self):
        payload = self._make_payload()
        result = run_scenarios(payload)
        r = result["results"][0]
        # port_delta = -100000 * -0.10 = 10000
        # port_vega  = 20000 * 0.30 = 6000
        # portfolio_pnl = 0 + 10000 + 6000 = 16000
        assert r["portfolio"]["pnl_usd"] == pytest.approx(16000.0)
        assert r["portfolio"]["delta_component_usd"] == pytest.approx(10000.0)
        assert r["portfolio"]["vega_component_usd"] == pytest.approx(6000.0)

    def test_hedge_pnl_futures(self):
        payload = self._make_payload()
        result = run_scenarios(payload)
        r = result["results"][0]
        # hedge pnl = contracts * multiplier * price * eq_move
        # = 3 * 2.0 * 17500 * -0.10 = -10500
        hedge_row = r["hedges"][0]
        assert hedge_row["pnl_usd"] == pytest.approx(-10500.0)

    def test_net_after_costs(self):
        payload = self._make_payload()
        result = run_scenarios(payload)
        r = result["results"][0]
        assert r["net"]["net_after_costs_usd"] is not None
        # net_pnl - costs_total
        expected_after_costs = r["net"]["pnl_usd"] - 500.0
        assert r["net"]["net_after_costs_usd"] == pytest.approx(expected_after_costs)

    def test_no_scenarios_rejected(self):
        payload = self._make_payload()
        payload["scenarios"] = []
        result = run_scenarios(payload)
        assert result["results"] == []
        assert len(result["rejected"]) >= 1
        assert result["rejected"][0]["reason"] == REASON_INVALID_SCENARIOS

    def test_non_dict_scenario_rejected(self):
        payload = self._make_payload()
        payload["scenarios"] = ["not_a_dict"]
        result = run_scenarios(payload)
        assert len(result["rejected"]) >= 1
        assert result["rejected"][0]["reason"] == SE_REASON_BAD_INPUT

    def test_no_valid_hedges_produces_rejection(self):
        payload = self._make_payload()
        payload["sized_hedges"] = []
        result = run_scenarios(payload)
        assert any(r["reason"] == REASON_NO_VALID_HEDGES for r in result["rejected"])

    def test_unsupported_asset_class_rejected(self):
        payload = self._make_payload()
        payload["instrument_meta"]["MNQ_FUT"]["asset_class"] = "bond"
        result = run_scenarios(payload)
        assert any(r["reason"] == REASON_UNSUPPORTED_ASSET_CLASS for r in result["rejected"])

    def test_missing_price_rejected(self):
        payload = self._make_payload()
        payload["market"]["prices"] = {}
        result = run_scenarios(payload)
        assert any(r.get("reason") == SE_REASON_MISSING_MARKET_INPUT for r in result["rejected"])

    def test_effectiveness_when_portfolio_loses(self):
        payload = self._make_payload()
        # Set up so portfolio loses money
        payload["portfolio"]["exposures"]["delta_usd"] = 100000.0
        payload["portfolio"]["exposures"]["vega_usd"] = 0.0
        payload["scenarios"] = [
            {"scenario_id": "down_5", "shocks": {"equity_move_pct": -0.05, "vol_move_pct": 0.0}}
        ]
        result = run_scenarios(payload)
        r = result["results"][0]
        # portfolio_pnl = 100000 * -0.05 = -5000 (loss)
        # hedge_pnl = 3 * 2 * 17500 * -0.05 = -5250 (hedge also loses)
        # offset = max(0, -(-5250)) = 5250
        # effectiveness = 5250 / 5000 = 1.05 (clamped to 2.0 max)
        assert r["net"]["hedge_effectiveness"] is not None
        assert r["net"]["hedge_effectiveness"] >= 0.0
        assert r["net"]["hedge_effectiveness"] <= 2.0

    def test_effectiveness_none_when_portfolio_gains(self):
        payload = self._make_payload()
        payload["portfolio"]["exposures"]["delta_usd"] = -100000.0
        payload["scenarios"] = [
            {"scenario_id": "up_5", "shocks": {"equity_move_pct": 0.05, "vol_move_pct": 0.0}}
        ]
        result = run_scenarios(payload)
        r = result["results"][0]
        # portfolio_pnl = -100000 * 0.05 = -5000 (loss)
        # Actually this IS a loss, so effectiveness should be calculated
        # Let's test the gain scenario explicitly
        payload["portfolio"]["exposures"]["delta_usd"] = 100000.0
        payload["scenarios"] = [
            {"scenario_id": "up_10", "shocks": {"equity_move_pct": 0.10, "vol_move_pct": 0.0}}
        ]
        result = run_scenarios(payload)
        r = result["results"][0]
        # portfolio_pnl = 100000 * 0.10 = 10000 (gain)
        assert r["net"]["hedge_effectiveness"] is None

    def test_multiple_scenarios(self):
        payload = self._make_payload()
        payload["scenarios"] = [
            {"scenario_id": "s1", "shocks": {"equity_move_pct": -0.05}},
            {"scenario_id": "s2", "shocks": {"equity_move_pct": -0.10}},
            {"scenario_id": "s3", "shocks": {"equity_move_pct": 0.05}},
        ]
        result = run_scenarios(payload)
        assert len(result["results"]) == 3
        ids = [r["scenario_id"] for r in result["results"]]
        assert ids == ["s1", "s2", "s3"]

    def test_clamp_equity_move_policy(self):
        payload = self._make_payload()
        # Set extreme shock that should be clamped
        payload["scenarios"] = [
            {"scenario_id": "extreme", "shocks": {"equity_move_pct": -5.0}}
        ]
        result = run_scenarios(payload, policy={"clamp_equity_move_pct": 0.5})
        r = result["results"][0]
        # Move should be clamped to -0.5
        # portfolio_pnl = 0 + (-100000 * -0.5) + (20000 * 0) = 50000
        assert r["portfolio"]["delta_component_usd"] == pytest.approx(50000.0)

    def test_zero_contracts_hedge_pnl_zero(self):
        payload = self._make_payload()
        payload["sized_hedges"][0]["contracts"] = 0
        result = run_scenarios(payload)
        r = result["results"][0]
        hedge_row = r["hedges"][0]
        assert hedge_row["pnl_usd"] == 0.0

    def test_options_with_delta(self):
        payload = self._make_payload()
        payload["sized_hedges"] = [
            {
                "strategy_id": "index_puts",
                "instrument_id": "SPY_OPT",
                "contracts": -5,
            }
        ]
        payload["instrument_meta"] = {
            "SPY_OPT": {
                "asset_class": "options",
                "contract_multiplier": 100.0,
                "underlying": "SPY",
            }
        }
        payload["market"]["prices"]["SPY_OPT_UNDERLYING"] = 510.0
        payload["market"]["option_deltas"] = {"SPY_OPT": -0.30}
        result = run_scenarios(payload)
        r = result["results"][0]
        # pnl = contracts * delta * price * eq_move * multiplier
        # = -5 * -0.30 * 510.0 * -0.10 * 100 = -7650
        hedge_row = [h for h in r["hedges"] if h["instrument_id"] == "SPY_OPT"]
        assert len(hedge_row) == 1
        assert hedge_row[0]["pnl_usd"] == pytest.approx(-7650.0)

    def test_trace_fingerprint_present(self):
        result = run_scenarios(self._make_payload())
        trace = result["meta"]["decision_trace"]
        assert "trace_fingerprint" in trace
        assert len(trace["trace_fingerprint"]) == 64


# =====================================================================
# 6. CROSS-MODULE DETERMINISM TESTS
# =====================================================================
class TestCrossModuleDeterminism:
    """Verify that the shared _canonical_json / _stable_hash primitives
    are consistent across modules."""

    def test_orchestrator_and_sizer_same_hash(self):
        from app.engine.hedge_sizer import _stable_hash as sizer_hash

        obj = {"key": "value", "num": 42}
        # Both use the same canonical JSON approach (though sizer uses default=str)
        # For standard types they should agree
        h_orch = orch_stable_hash(obj)
        h_sizer = sizer_hash(obj)
        # Both are SHA-256 but orchestrator's canonical_json uses allow_nan=False
        # while sizer uses default=str. For standard objects the output should be identical.
        assert h_orch == h_sizer

    def test_cost_engine_hash_matches(self):
        from app.engine.cost_engine import _stable_hash as cost_hash

        obj = {"test": [1, 2, 3]}
        h_orch = orch_stable_hash(obj)
        h_cost = cost_hash(obj)
        # cost_engine uses default=str while orchestrator doesn't,
        # but for standard JSON types they produce identical output
        assert h_orch == h_cost

    def test_scenario_engine_hash_consistency(self):
        from app.engine.scenario_engine import _stable_hash as scenario_hash

        obj = {"a": 1, "b": [True, None, "x"]}
        # scenario_engine uses strict canonical (no default=str, allow_nan=False)
        h_orch = orch_stable_hash(obj)
        h_scen = scenario_hash(obj)
        assert h_orch == h_scen
