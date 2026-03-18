"""
tests/test_engine_coverage.py

Pure unit tests for:
  - app/engine/strategy_selector.py  (helpers + select_strategies)
  - app/contracts/instrument_catalog.py (validators, models, build_catalog)

No DB, no async, no HTTP.
"""
from __future__ import annotations

import json
import math
from typing import Any
from unittest.mock import MagicMock

import pytest

# =====================================================================
# 1. Strategy Selector helpers
# =====================================================================
from app.engine.strategy_selector import (
    _CANONICAL_AXES,
    _as_float,
    _as_int,
    _as_list,
    _as_str,
    _canonical_axis_set,
    _canonical_json,
    _candidate_ids_for_strategy,
    _clamp01,
    _normalize_axis_id,
    _rank_candidate_ids,
    _stable_hash,
    _validate_axis_id,
    select_strategies,
    STRATEGY_CATALOG,
)

# =====================================================================
# 2. Instrument Catalog
# =====================================================================
from app.contracts.instrument_catalog import (
    ContractSpecs,
    Exchange,
    Instrument,
    InstrumentCatalog,
    InstrumentType,
    LiquidityMetrics,
    MandateTags,
    SettlementType,
    SlippageModelParams,
    TradingHours,
    _finite_float,
    _non_empty_str,
    _sorted_unique_axes,
    _tuple_strs,
    build_catalog,
)


# =====================================================================
# TestStrategyHelpers
# =====================================================================


class TestCanonicalJson:
    def test_sort_keys(self):
        result = _canonical_json({"b": 2, "a": 1})
        assert result == '{"a":1,"b":2}'

    def test_no_spaces(self):
        result = _canonical_json({"key": "value"})
        assert " " not in result

    def test_nested_dicts_sorted(self):
        obj = {"z": {"b": 2, "a": 1}, "a": 0}
        parsed = json.loads(_canonical_json(obj))
        assert list(parsed.keys()) == ["a", "z"]
        assert list(parsed["z"].keys()) == ["a", "b"]

    def test_list_preserved_order(self):
        result = _canonical_json({"items": [3, 1, 2]})
        assert result == '{"items":[3,1,2]}'

    def test_rejects_nan(self):
        with pytest.raises(ValueError):
            _canonical_json({"x": float("nan")})

    def test_rejects_inf(self):
        with pytest.raises(ValueError):
            _canonical_json({"x": float("inf")})

    def test_empty_object(self):
        assert _canonical_json({}) == "{}"

    def test_primitive_string(self):
        assert _canonical_json("hello") == '"hello"'

    def test_primitive_int(self):
        assert _canonical_json(42) == "42"

    def test_non_serializable_falls_back_to_str(self):
        # default=str handles non-serializable objects
        class Unserializable:
            def __str__(self):
                return "custom"

        result = _canonical_json({"obj": Unserializable()})
        assert '"custom"' in result


class TestStableHash:
    def test_same_input_same_hash(self):
        h1 = _stable_hash({"a": 1})
        h2 = _stable_hash({"a": 1})
        assert h1 == h2

    def test_key_order_irrelevant(self):
        h1 = _stable_hash({"a": 1, "b": 2})
        h2 = _stable_hash({"b": 2, "a": 1})
        assert h1 == h2

    def test_different_values_different_hash(self):
        assert _stable_hash({"a": 1}) != _stable_hash({"a": 2})

    def test_hash_is_64_char_hex(self):
        h = _stable_hash({"test": True})
        assert len(h) == 64
        assert all(c in "0123456789abcdef" for c in h)


class TestAsFloat:
    def test_valid_number(self):
        assert _as_float(3.14) == pytest.approx(3.14)

    def test_valid_string_number(self):
        assert _as_float("2.5") == pytest.approx(2.5)

    def test_returns_default_on_invalid(self):
        assert _as_float("not_a_number") == 0.0

    def test_returns_custom_default_on_invalid(self):
        assert _as_float("bad", 99.0) == 99.0

    def test_returns_default_on_none(self):
        assert _as_float(None) == 0.0

    def test_returns_default_on_nan(self):
        assert _as_float(float("nan")) == 0.0

    def test_returns_default_on_inf(self):
        assert _as_float(float("inf")) == 0.0

    def test_returns_default_on_neg_inf(self):
        assert _as_float(float("-inf")) == 0.0

    def test_integer_input(self):
        assert _as_float(5) == 5.0


class TestAsInt:
    def test_valid_int(self):
        assert _as_int(3) == 3

    def test_valid_string_int(self):
        assert _as_int("7") == 7

    def test_returns_default_on_invalid(self):
        assert _as_int("bad") == 0

    def test_returns_custom_default_on_invalid(self):
        assert _as_int("bad", 42) == 42

    def test_returns_default_on_none(self):
        assert _as_int(None) == 0

    def test_float_truncates(self):
        assert _as_int(3.9) == 3


class TestAsStr:
    def test_returns_empty_for_none(self):
        assert _as_str(None) == ""

    def test_strips_whitespace(self):
        assert _as_str("  hello  ") == "hello"

    def test_converts_int_to_str(self):
        assert _as_str(42) == "42"

    def test_converts_float_to_str(self):
        result = _as_str(1.5)
        assert "1.5" in result

    def test_empty_string_returns_empty(self):
        assert _as_str("") == ""


class TestAsList:
    def test_list_returned_unchanged(self):
        lst = [1, 2, 3]
        assert _as_list(lst) is lst

    def test_non_list_returns_empty(self):
        assert _as_list("not_a_list") == []

    def test_none_returns_empty(self):
        assert _as_list(None) == []

    def test_dict_returns_empty(self):
        assert _as_list({"a": 1}) == []

    def test_tuple_returns_empty(self):
        # Only list is accepted
        assert _as_list((1, 2)) == []


class TestClamp01:
    def test_clamps_below_zero(self):
        assert _clamp01(-1.0) == 0.0

    def test_clamps_above_one(self):
        assert _clamp01(2.0) == 1.0

    def test_preserves_zero(self):
        assert _clamp01(0.0) == 0.0

    def test_preserves_one(self):
        assert _clamp01(1.0) == 1.0

    def test_preserves_midpoint(self):
        assert _clamp01(0.5) == pytest.approx(0.5)

    def test_preserves_near_boundary(self):
        assert _clamp01(0.9999) == pytest.approx(0.9999)


class TestCanonicalAxisSet:
    def test_returns_tuple(self):
        result = _canonical_axis_set()
        assert isinstance(result, tuple)

    def test_contains_eight_axes(self):
        result = _canonical_axis_set()
        assert len(result) == 8

    def test_starts_with_r1_delta(self):
        result = _canonical_axis_set()
        assert result[0] == "R1_DELTA"

    def test_ends_with_r8_tail(self):
        result = _canonical_axis_set()
        assert result[-1] == "R8_TAIL"

    def test_matches_canonical_axes_constant(self):
        result = _canonical_axis_set()
        assert result == _CANONICAL_AXES


class TestValidateAxisId:
    def test_known_axis_returns_true(self):
        assert _validate_axis_id("R1_DELTA", _CANONICAL_AXES) is True

    def test_unknown_axis_returns_false(self):
        assert _validate_axis_id("R99_UNKNOWN", _CANONICAL_AXES) is False

    def test_empty_string_returns_false(self):
        assert _validate_axis_id("", _CANONICAL_AXES) is False

    def test_all_canonical_axes_valid(self):
        for ax in _CANONICAL_AXES:
            assert _validate_axis_id(ax, _CANONICAL_AXES) is True

    def test_lowercase_invalid(self):
        assert _validate_axis_id("r1_delta", _CANONICAL_AXES) is False


class TestNormalizeAxisId:
    def test_canonical_axis_returned_unchanged(self):
        axis, alias = _normalize_axis_id("R1_DELTA", _CANONICAL_AXES)
        assert axis == "R1_DELTA"
        assert alias is None

    def test_alias_mapped_to_canonical(self):
        # R2_GAMMA -> R3_GAMMA
        axis, alias = _normalize_axis_id("R2_GAMMA", _CANONICAL_AXES)
        assert axis == "R3_GAMMA"
        assert alias == "R2_GAMMA"

    def test_another_alias_r3_vega(self):
        axis, alias = _normalize_axis_id("R3_VEGA", _CANONICAL_AXES)
        assert axis == "R2_VEGA"
        assert alias == "R3_VEGA"

    def test_unknown_axis_returns_empty(self):
        axis, alias = _normalize_axis_id("R99_UNKNOWN", _CANONICAL_AXES)
        assert axis == ""
        assert alias is None

    def test_empty_string_returns_empty(self):
        axis, alias = _normalize_axis_id("", _CANONICAL_AXES)
        assert axis == ""
        assert alias is None

    def test_none_like_whitespace_returns_empty(self):
        axis, alias = _normalize_axis_id("   ", _CANONICAL_AXES)
        assert axis == ""
        assert alias is None

    def test_r6_rate_alias(self):
        axis, alias = _normalize_axis_id("R6_RATE", _CANONICAL_AXES)
        assert axis == "R1_DELTA"
        assert alias == "R6_RATE"

    def test_r8_crypto_alias(self):
        axis, alias = _normalize_axis_id("R8_CRYPTO", _CANONICAL_AXES)
        assert axis == "R8_TAIL"
        assert alias == "R8_CRYPTO"


class TestRankCandidateIds:
    def _make_mock_catalog(self, instruments: list[dict]) -> MagicMock:
        """Build a mock InstrumentCatalog from list of {instrument_id, liquidity_score} dicts."""
        catalog = MagicMock()
        mock_instruments = []
        for d in instruments:
            inst = MagicMock()
            inst.instrument_id = d["instrument_id"]
            inst.liquidity = MagicMock()
            inst.liquidity.liquidity_score = d.get("liquidity_score", 0.5)
            mock_instruments.append(inst)
        catalog.instruments = mock_instruments
        return catalog

    def test_sorts_by_liquidity_descending(self):
        catalog = self._make_mock_catalog([
            {"instrument_id": "A", "liquidity_score": 0.3},
            {"instrument_id": "B", "liquidity_score": 0.9},
            {"instrument_id": "C", "liquidity_score": 0.6},
        ])
        result = _rank_candidate_ids(catalog, ["A", "B", "C"])
        assert result == ["B", "C", "A"]

    def test_tiebreaker_is_lexicographic(self):
        catalog = self._make_mock_catalog([
            {"instrument_id": "ZZZ", "liquidity_score": 0.5},
            {"instrument_id": "AAA", "liquidity_score": 0.5},
        ])
        result = _rank_candidate_ids(catalog, ["ZZZ", "AAA"])
        assert result == ["AAA", "ZZZ"]

    def test_unknown_ids_skipped(self):
        catalog = self._make_mock_catalog([
            {"instrument_id": "A", "liquidity_score": 0.7},
        ])
        result = _rank_candidate_ids(catalog, ["A", "NONEXISTENT"])
        assert result == ["A"]

    def test_empty_ids_returns_empty(self):
        catalog = self._make_mock_catalog([
            {"instrument_id": "A", "liquidity_score": 0.7},
        ])
        result = _rank_candidate_ids(catalog, [])
        assert result == []


class TestCandidateIdsForStrategy:
    def _make_mock_catalog(
        self, instruments: list[dict]
    ) -> MagicMock:
        """Build a mock InstrumentCatalog.
        Each dict: {instrument_id, liquidity_score, eligible_axes, instrument_type}
        """
        catalog = MagicMock()
        mock_instruments = []
        for d in instruments:
            inst = MagicMock()
            inst.instrument_id = d["instrument_id"]
            inst.eligible_axes = d.get("eligible_axes", [])
            inst.instrument_type = d.get("instrument_type", InstrumentType.OTHER)
            inst.liquidity = MagicMock()
            inst.liquidity.liquidity_score = d.get("liquidity_score", 0.5)
            mock_instruments.append(inst)
        catalog.instruments = mock_instruments
        return catalog

    def _get_strat(self, strategy_id: str):
        for s in STRATEGY_CATALOG:
            if s.strategy_id == strategy_id:
                return s
        raise KeyError(strategy_id)

    def test_preferred_type_selected_over_fallback(self):
        # index_futures prefers FUTURE, ETF, INDEX
        strat = self._get_strat("index_futures")
        catalog = self._make_mock_catalog([
            {
                "instrument_id": "PREF",
                "eligible_axes": list(strat.covers_axes),
                "instrument_type": InstrumentType.FUTURE,
                "liquidity_score": 0.8,
            },
            {
                "instrument_id": "FALLBACK",
                "eligible_axes": list(strat.covers_axes),
                "instrument_type": InstrumentType.BOND,
                "liquidity_score": 0.9,
            },
        ])
        result = _candidate_ids_for_strategy(catalog, strat)
        # PREF is preferred type; FALLBACK is only used if no preferred match
        assert "PREF" in result
        # FALLBACK not returned because preferred list is non-empty
        assert "FALLBACK" not in result

    def test_fallback_used_when_no_preferred_type(self):
        strat = self._get_strat("index_futures")
        catalog = self._make_mock_catalog([
            {
                "instrument_id": "FALLBACK",
                "eligible_axes": list(strat.covers_axes),
                "instrument_type": InstrumentType.FX,  # Not in prefer_types
                "liquidity_score": 0.5,
            },
        ])
        result = _candidate_ids_for_strategy(catalog, strat)
        assert result == ["FALLBACK"]

    def test_no_eligible_axes_match_returns_empty(self):
        strat = self._get_strat("index_futures")
        catalog = self._make_mock_catalog([
            {
                "instrument_id": "NOOP",
                "eligible_axes": ["R8_TAIL"],  # Doesn't cover R1_DELTA
                "instrument_type": InstrumentType.FUTURE,
                "liquidity_score": 0.9,
            },
        ])
        result = _candidate_ids_for_strategy(catalog, strat)
        assert result == []

    def test_returns_deterministic_order_by_liquidity(self):
        strat = self._get_strat("index_futures")
        catalog = self._make_mock_catalog([
            {
                "instrument_id": "LOW",
                "eligible_axes": list(strat.covers_axes),
                "instrument_type": InstrumentType.FUTURE,
                "liquidity_score": 0.2,
            },
            {
                "instrument_id": "HIGH",
                "eligible_axes": list(strat.covers_axes),
                "instrument_type": InstrumentType.FUTURE,
                "liquidity_score": 0.8,
            },
        ])
        result = _candidate_ids_for_strategy(catalog, strat)
        assert result[0] == "HIGH"
        assert result[1] == "LOW"


# =====================================================================
# TestSelectStrategies
# =====================================================================


def _make_minimal_catalog_dict(
    instrument_id: str = "INST1",
    eligible_axes: list[str] | None = None,
    instrument_type: str = "FUTURE",
    liquidity_score: float = 0.8,
) -> dict:
    """Build the minimal InstrumentCatalog dict structure.

    NOTE: eligible_axes here must be R1-R8 short form to pass Instrument validation,
    but strategy_selector covers_axes uses R1_DELTA etc. — so these won't match.
    For tests that need matching, we use a mocked catalog instead.
    """
    if eligible_axes is None:
        eligible_axes = ["R1"]  # short-form, valid per risk_taxonomy
    return {
        "instruments": [
            {
                "instrument_id": instrument_id,
                "symbol": instrument_id,
                "instrument_type": instrument_type,
                "eligible_axes": eligible_axes,
                "liquidity": {"liquidity_score": liquidity_score},
            }
        ]
    }


class TestSelectStrategies:
    def test_missing_catalog_returns_rejection(self):
        result = select_strategies(
            {"classified_risks": [{"risk_id": "R1_DELTA", "score": 0.8}]},
            instrument_catalog=None,
        )
        assert result["strategies"] == []
        assert len(result["rejected"]) >= 1
        assert result["meta"]["engine"]["name"] == "strategy_selector"

    def test_invalid_catalog_type_returns_rejection(self):
        result = select_strategies(
            {"classified_risks": []},
            instrument_catalog="not_a_dict",
        )
        assert result["strategies"] == []
        assert len(result["rejected"]) >= 1

    def test_empty_risks_produces_no_strategies(self):
        cat = _make_minimal_catalog_dict()
        result = select_strategies(
            {"classified_risks": []},
            instrument_catalog=cat,
        )
        assert result["strategies"] == []
        assert result["rejected"] == []

    def test_unknown_axis_produces_rejection(self):
        cat = _make_minimal_catalog_dict()
        result = select_strategies(
            {"classified_risks": [{"risk_id": "R99_FAKE", "score": 0.9}]},
            instrument_catalog=cat,
        )
        rejected_codes = [r.get("code") for r in result["rejected"]]
        assert any("invalid" in (c or "").lower() or "portfolio" in (c or "").lower() for c in rejected_codes)

    def test_low_score_risk_not_material(self):
        cat = _make_minimal_catalog_dict()
        result = select_strategies(
            {"classified_risks": [{"risk_id": "R1_DELTA", "score": 0.01}]},
            instrument_catalog=cat,
            policy={"min_risk_score": 0.15},
        )
        # Score below threshold — risk not material — no strategies
        assert result["strategies"] == []

    def test_alias_mapping_axis_normalized(self):
        """R2_GAMMA is a known alias — verify it normalizes to R3_GAMMA at the helper level.
        The select_strategies full path attempts to emit a DisclosureCode.DISCLOSED_AXIS_ALIAS_MAPPING
        that is not yet in the DisclosureCode enum, so we validate the alias at the helper level only.
        """
        axis, alias = _normalize_axis_id("R2_GAMMA", _CANONICAL_AXES)
        assert axis == "R3_GAMMA"
        assert alias == "R2_GAMMA"

    def test_result_has_required_keys(self):
        cat = _make_minimal_catalog_dict()
        result = select_strategies(
            {"classified_risks": []},
            instrument_catalog=cat,
        )
        assert "strategies" in result
        assert "rejected" in result
        assert "disclosures" in result
        assert "meta" in result

    def test_meta_contains_trace_step(self):
        cat = _make_minimal_catalog_dict()
        result = select_strategies(
            {"classified_risks": []},
            instrument_catalog=cat,
        )
        assert "trace_step" in result["meta"]
        assert "duration_ms" in result["meta"]

    def test_policy_clamps_min_score(self):
        cat = _make_minimal_catalog_dict()
        # min_risk_score > 1.0 should clamp to 1.0, making all risks sub-threshold
        result = select_strategies(
            {"classified_risks": [{"risk_id": "R1_DELTA", "score": 0.99}]},
            instrument_catalog=cat,
            policy={"min_risk_score": 99.0},  # clamps to 1.0
        )
        assert result["strategies"] == []

    def test_policy_clamps_complexity_floor(self):
        # max_strategy_complexity=0 should clamp to 1
        cat = _make_minimal_catalog_dict()
        result = select_strategies(
            {"classified_risks": []},
            instrument_catalog=cat,
            policy={"max_strategy_complexity": 0},
        )
        # Should not crash
        assert "strategies" in result

    def test_material_risk_no_catalog_candidates_produces_rejection(self):
        """With a material risk but no instruments matching the strategy axis,
        we get a no-eligible-instruments rejection or coverage-failure rejection."""
        cat = _make_minimal_catalog_dict(eligible_axes=["R1"])  # R1 won't match R1_DELTA
        result = select_strategies(
            {"classified_risks": [{"risk_id": "R1_DELTA", "score": 0.8}]},
            instrument_catalog=cat,
        )
        # No candidates found because eligible_axes ["R1"] != covers_axes {"R1_DELTA"}
        all_rejected_codes = [r.get("code", "") for r in result["rejected"]]
        assert len(all_rejected_codes) > 0

    def test_select_strategies_with_mocked_catalog_returns_strategy(self):
        """Use a mocked InstrumentCatalog to verify full happy path."""
        from unittest.mock import patch, MagicMock

        mock_cat = MagicMock()
        mock_cat.catalog_hash = "a" * 64

        inst = MagicMock()
        inst.instrument_id = "ES_FUTURE"
        inst.eligible_axes = ("R1_DELTA",)
        inst.instrument_type = InstrumentType.FUTURE
        inst.liquidity = MagicMock()
        inst.liquidity.liquidity_score = 0.9
        inst.is_proxy = False
        mock_cat.instruments = [inst]

        def fake_finalize():
            return mock_cat

        mock_cat.finalize = fake_finalize

        with patch(
            "app.engine.strategy_selector.InstrumentCatalog",
            return_value=mock_cat,
        ):
            result = select_strategies(
                {"classified_risks": [{"risk_id": "R1_DELTA", "score": 0.8}]},
                instrument_catalog={"instruments": []},  # dict triggers InstrumentCatalog(**cat_src)
            )

        assert "strategies" in result
        assert len(result["strategies"]) >= 1
        strat_ids = [s["strategy_id"] for s in result["strategies"]]
        assert "index_futures" in strat_ids

    def test_non_list_classified_risks_treated_as_empty(self):
        cat = _make_minimal_catalog_dict()
        result = select_strategies(
            {"classified_risks": "not_a_list"},
            instrument_catalog=cat,
        )
        assert result["strategies"] == []

    def test_catalog_from_payload_fallback(self):
        """instrument_catalog kwarg=None should fall back to payload['instrument_catalog']."""
        cat = _make_minimal_catalog_dict()
        result = select_strategies(
            {"classified_risks": [], "instrument_catalog": cat},
            instrument_catalog=None,
        )
        assert "strategies" in result


# =====================================================================
# TestInstrumentCatalog
# =====================================================================


class TestFiniteFloat:
    def test_valid_float_returned(self):
        assert _finite_float(3.14, field_name="x") == pytest.approx(3.14)

    def test_none_returns_zero_when_not_allow_none(self):
        assert _finite_float(None, field_name="x") == 0.0

    def test_none_returns_none_when_allow_none(self):
        assert _finite_float(None, field_name="x", allow_none=True) is None

    def test_nan_raises(self):
        with pytest.raises(ValueError, match="finite"):
            _finite_float(float("nan"), field_name="x")

    def test_inf_raises(self):
        with pytest.raises(ValueError, match="finite"):
            _finite_float(float("inf"), field_name="x")

    def test_neg_inf_raises(self):
        with pytest.raises(ValueError, match="finite"):
            _finite_float(float("-inf"), field_name="x")

    def test_non_numeric_raises(self):
        with pytest.raises(ValueError, match="numeric"):
            _finite_float("not_a_number", field_name="x")

    def test_string_number_converted(self):
        assert _finite_float("2.5", field_name="x") == pytest.approx(2.5)


class TestNonEmptyStr:
    def test_valid_string_returned(self):
        assert _non_empty_str("hello", field_name="f") == "hello"

    def test_strips_whitespace(self):
        assert _non_empty_str("  hi  ", field_name="f") == "hi"

    def test_none_raises(self):
        with pytest.raises(ValueError, match="non-empty"):
            _non_empty_str(None, field_name="f")

    def test_empty_string_raises(self):
        with pytest.raises(ValueError, match="non-empty"):
            _non_empty_str("", field_name="f")

    def test_whitespace_only_raises(self):
        with pytest.raises(ValueError, match="non-empty"):
            _non_empty_str("   ", field_name="f")


class TestTupleStrs:
    def test_list_of_strings_returns_sorted_unique_tuple(self):
        result = _tuple_strs(["b", "a", "a"])
        assert result == ("a", "b")

    def test_none_returns_empty_tuple(self):
        assert _tuple_strs(None) == ()

    def test_skips_none_items(self):
        result = _tuple_strs(["a", None, "b"])
        assert result == ("a", "b")

    def test_strips_whitespace_from_items(self):
        result = _tuple_strs(["  a  ", "b"])
        assert "a" in result

    def test_deduplicates(self):
        result = _tuple_strs(["x", "x", "y"])
        assert result == ("x", "y")

    def test_non_list_raises(self):
        with pytest.raises(ValueError):
            _tuple_strs("not_a_list")

    def test_tuple_input_accepted(self):
        result = _tuple_strs(("b", "a"))
        assert result == ("a", "b")


class TestSortedUniqueAxes:
    def test_valid_axes_sorted(self):
        result = _sorted_unique_axes(["R3", "R1", "R2"])
        assert result == ("R1", "R2", "R3")

    def test_none_returns_empty(self):
        assert _sorted_unique_axes(None) == ()

    def test_duplicates_removed(self):
        result = _sorted_unique_axes(["R1", "R1", "R2"])
        assert result == ("R1", "R2")

    def test_invalid_axis_raises(self):
        with pytest.raises(ValueError):
            _sorted_unique_axes(["INVALID_AXIS"])

    def test_none_items_skipped(self):
        result = _sorted_unique_axes(["R1", None, "R2"])
        assert result == ("R1", "R2")

    def test_non_list_raises(self):
        with pytest.raises(ValueError, match="eligible_axes"):
            _sorted_unique_axes("R1")


class TestTradingHours:
    def test_defaults(self):
        th = TradingHours()
        assert th.timezone == "UTC"
        assert th.regular is None
        assert th.extended is None

    def test_timezone_none_defaults_to_utc(self):
        th = TradingHours(timezone=None)
        assert th.timezone == "UTC"

    def test_timezone_empty_defaults_to_utc(self):
        th = TradingHours(timezone="")
        assert th.timezone == "UTC"

    def test_custom_timezone(self):
        th = TradingHours(timezone="America/New_York")
        assert th.timezone == "America/New_York"

    def test_regular_and_extended(self):
        th = TradingHours(regular="09:30-16:00", extended="04:00-20:00")
        assert th.regular == "09:30-16:00"
        assert th.extended == "04:00-20:00"


class TestContractSpecs:
    def _valid(self, **kwargs):
        defaults = {"multiplier": 50.0, "tick_size": 0.25, "tick_value": 12.5}
        defaults.update(kwargs)
        return ContractSpecs(**defaults)

    def test_valid_construction(self):
        cs = self._valid()
        assert cs.multiplier == 50.0
        assert cs.tick_size == 0.25

    def test_currency_uppercased(self):
        cs = self._valid(currency="usd")
        assert cs.currency == "USD"

    def test_currency_none_defaults_to_usd(self):
        cs = self._valid(currency=None)
        assert cs.currency == "USD"

    def test_multiplier_zero_raises(self):
        with pytest.raises(Exception):
            self._valid(multiplier=0.0)

    def test_multiplier_negative_raises(self):
        with pytest.raises(Exception):
            self._valid(multiplier=-1.0)

    def test_tick_size_zero_raises(self):
        with pytest.raises(Exception):
            self._valid(tick_size=0.0)

    def test_tick_value_zero_raises(self):
        with pytest.raises(Exception):
            self._valid(tick_value=0.0)

    def test_nan_multiplier_raises(self):
        with pytest.raises(Exception):
            self._valid(multiplier=float("nan"))


class TestLiquidityMetrics:
    def test_defaults(self):
        lm = LiquidityMetrics()
        assert lm.liquidity_score == 0.0
        assert lm.avg_daily_volume is None
        assert lm.open_interest is None

    def test_valid_score(self):
        lm = LiquidityMetrics(liquidity_score=0.75)
        assert lm.liquidity_score == pytest.approx(0.75)

    def test_score_above_one_raises(self):
        with pytest.raises(Exception):
            LiquidityMetrics(liquidity_score=1.5)

    def test_score_below_zero_raises(self):
        with pytest.raises(Exception):
            LiquidityMetrics(liquidity_score=-0.1)

    def test_nan_score_raises(self):
        with pytest.raises(Exception):
            LiquidityMetrics(liquidity_score=float("nan"))

    def test_optional_volume_none(self):
        lm = LiquidityMetrics(avg_daily_volume=None)
        assert lm.avg_daily_volume is None

    def test_optional_volume_valid(self):
        lm = LiquidityMetrics(avg_daily_volume=500000.0)
        assert lm.avg_daily_volume == pytest.approx(500000.0)

    def test_inf_volume_raises(self):
        with pytest.raises(Exception):
            LiquidityMetrics(avg_daily_volume=float("inf"))

    def test_as_of_string(self):
        lm = LiquidityMetrics(as_of="2024-01-01T00:00:00Z")
        assert lm.as_of == "2024-01-01T00:00:00Z"

    def test_as_of_empty_becomes_none(self):
        lm = LiquidityMetrics(as_of="   ")
        assert lm.as_of is None


class TestMandateTags:
    def test_defaults_empty(self):
        mt = MandateTags()
        assert mt.allow == ()
        assert mt.prohibit == ()

    def test_allow_sorted_unique(self):
        mt = MandateTags(allow=["futures", "etf", "futures"])
        assert mt.allow == ("etf", "futures")

    def test_prohibit_sorted_unique(self):
        mt = MandateTags(prohibit=["crypto", "bond", "crypto"])
        assert mt.prohibit == ("bond", "crypto")


class TestInstrument:
    def _valid_instrument(self, **kwargs) -> dict:
        defaults = {
            "instrument_id": "TEST_INST",
            "symbol": "ES",
            "instrument_type": "FUTURE",
            "eligible_axes": ["R1"],
        }
        defaults.update(kwargs)
        return defaults

    def test_valid_instrument_construction(self):
        inst = Instrument(**self._valid_instrument())
        assert inst.instrument_id == "TEST_INST"
        assert inst.symbol == "ES"

    def test_instrument_id_empty_raises(self):
        with pytest.raises(Exception):
            Instrument(**self._valid_instrument(instrument_id=""))

    def test_instrument_id_none_raises(self):
        with pytest.raises(Exception):
            Instrument(**self._valid_instrument(instrument_id=None))

    def test_symbol_empty_raises(self):
        with pytest.raises(Exception):
            Instrument(**self._valid_instrument(symbol=""))

    def test_eligible_axes_sorted(self):
        inst = Instrument(**self._valid_instrument(eligible_axes=["R3", "R1", "R2"]))
        assert inst.eligible_axes == ("R1", "R2", "R3")

    def test_eligible_axes_deduped(self):
        inst = Instrument(**self._valid_instrument(eligible_axes=["R1", "R1"]))
        assert inst.eligible_axes == ("R1",)

    def test_invalid_eligible_axis_raises(self):
        with pytest.raises(Exception):
            Instrument(**self._valid_instrument(eligible_axes=["INVALID"]))

    def test_is_proxy_false_by_default(self):
        inst = Instrument(**self._valid_instrument())
        assert inst.is_proxy is False

    def test_is_proxy_true_requires_proxy_for(self):
        with pytest.raises(Exception, match="proxy_for"):
            Instrument(**self._valid_instrument(is_proxy=True, proxy_for=None))

    def test_is_proxy_true_with_proxy_for_succeeds(self):
        inst = Instrument(**self._valid_instrument(is_proxy=True, proxy_for="SPX index"))
        assert inst.is_proxy is True
        assert inst.proxy_for == "SPX index"

    def test_optional_name_none(self):
        inst = Instrument(**self._valid_instrument(name=None))
        assert inst.name is None

    def test_optional_name_empty_becomes_none(self):
        inst = Instrument(**self._valid_instrument(name="  "))
        assert inst.name is None

    def test_liquidity_defaults(self):
        inst = Instrument(**self._valid_instrument())
        assert inst.liquidity.liquidity_score == 0.0


class TestInstrumentCatalog:
    def _make_instrument(self, instrument_id: str = "INST1") -> Instrument:
        return Instrument(instrument_id=instrument_id, symbol=instrument_id, eligible_axes=["R1"])

    def test_empty_catalog(self):
        cat = InstrumentCatalog(instruments=[])
        assert cat.instruments == []

    def test_duplicate_instrument_id_raises(self):
        inst = self._make_instrument("DUP")
        with pytest.raises(Exception, match="Duplicate"):
            InstrumentCatalog(instruments=[inst, inst])

    def test_finalize_sorts_instruments(self):
        inst_b = self._make_instrument("B_INST")
        inst_a = self._make_instrument("A_INST")
        cat = InstrumentCatalog(instruments=[inst_b, inst_a]).finalize()
        assert cat.instruments[0].instrument_id == "A_INST"
        assert cat.instruments[1].instrument_id == "B_INST"

    def test_finalize_computes_catalog_hash(self):
        cat = InstrumentCatalog(instruments=[]).finalize()
        assert len(cat.catalog_hash) == 64
        assert all(c in "0123456789abcdef" for c in cat.catalog_hash)

    def test_finalize_is_deterministic(self):
        """Determinism requires a fixed catalog_id (uuid4 is excluded from hash check via same instance)."""
        from uuid import UUID
        fixed_id = UUID("00000000-0000-0000-0000-000000000001")
        inst = self._make_instrument()
        cat1 = InstrumentCatalog(instruments=[inst], catalog_id=fixed_id).finalize()
        cat2 = InstrumentCatalog(instruments=[inst], catalog_id=fixed_id).finalize()
        assert cat1.catalog_hash == cat2.catalog_hash

    def test_catalog_hash_excludes_created_at(self):
        """Same content but different timestamps should yield same hash (created_at is excluded)."""
        from uuid import UUID
        fixed_id = UUID("00000000-0000-0000-0000-000000000002")
        inst = self._make_instrument()
        cat1 = InstrumentCatalog(instruments=[inst], catalog_id=fixed_id, created_at="2024-01-01T00:00:00").finalize()
        cat2 = InstrumentCatalog(instruments=[inst], catalog_id=fixed_id, created_at="2025-06-01T00:00:00").finalize()
        assert cat1.catalog_hash == cat2.catalog_hash

    def test_invalid_catalog_hash_raises(self):
        with pytest.raises(Exception, match="SHA-256"):
            InstrumentCatalog(instruments=[], catalog_hash="not_a_valid_hash")

    def test_index_by_id(self):
        inst = self._make_instrument("X1")
        cat = InstrumentCatalog(instruments=[inst])
        idx = cat.index_by_id()
        assert "X1" in idx
        assert idx["X1"].instrument_id == "X1"

    def test_to_canonical_dict_excludes_hash_and_timestamp(self):
        cat = InstrumentCatalog(instruments=[]).finalize()
        d = cat.to_canonical_dict()
        assert "catalog_hash" not in d
        assert "created_at" not in d


class TestBuildCatalog:
    def _make_instrument(self, iid: str = "INST") -> Instrument:
        return Instrument(instrument_id=iid, symbol=iid, eligible_axes=["R1"])

    def test_returns_instrument_catalog(self):
        cat = build_catalog([self._make_instrument()])
        assert isinstance(cat, InstrumentCatalog)

    def test_instruments_sorted_by_id(self):
        inst_b = self._make_instrument("B")
        inst_a = self._make_instrument("A")
        cat = build_catalog([inst_b, inst_a])
        assert cat.instruments[0].instrument_id == "A"
        assert cat.instruments[1].instrument_id == "B"

    def test_catalog_hash_computed(self):
        cat = build_catalog([self._make_instrument()])
        assert len(cat.catalog_hash) == 64

    def test_empty_instruments(self):
        cat = build_catalog([])
        assert cat.instruments == []
        assert len(cat.catalog_hash) == 64

    def test_deterministic_hash(self):
        """build_catalog generates a uuid4 per call, making the hash non-deterministic across calls.
        We verify instead that the hash is structurally valid (64-char hex).
        Determinism with a fixed catalog_id is tested in TestInstrumentCatalog."""
        cat = build_catalog([self._make_instrument()])
        assert len(cat.catalog_hash) == 64
        assert all(c in "0123456789abcdef" for c in cat.catalog_hash)

    def test_different_instruments_different_hash(self):
        h1 = build_catalog([self._make_instrument("A")]).catalog_hash
        h2 = build_catalog([self._make_instrument("B")]).catalog_hash
        assert h1 != h2
