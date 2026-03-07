from __future__ import annotations

"""
Pure unit tests for:
  - app.engine.exposure  (all public functions + helpers)
  - app.engine.instrument_mapper  (pure helper functions, mocked imports)

No database, no async, no network -- deterministic computation only.
"""

import hashlib
import importlib
import json
import math
import sys
import types
from dataclasses import FrozenInstanceError
from typing import Any
from unittest.mock import MagicMock

import pytest

# =====================================================================
# PART 1: exposure.py tests (direct import -- stdlib only)
# =====================================================================
from app.engine.exposure import (
    ENGINE_NAME,
    ENGINE_VERSION,
    REJECT_ALL_POSITIONS_INVALID,
    REJECT_EMPTY_POSITIONS,
    REJECT_INVALID_PAYLOAD,
    ExposureError,
    Position,
    StageTrace,
    ValidationError,
    _canonical_json,
    _extract_policy,
    _extract_positions,
    _is_finite,
    _norm_cdf,
    _norm_pdf,
    _stable_hash,
    bs_greeks,
    compute_exposure,
    compute_portfolio_exposure,
    normalize_position,
)


# ---------------------------------------------------------------------
# Module-level constants
# ---------------------------------------------------------------------
class TestConstants:
    def test_engine_name(self):
        assert ENGINE_NAME == "exposure"

    def test_engine_version_format(self):
        parts = ENGINE_VERSION.split(".")
        assert len(parts) == 3
        assert all(p.isdigit() for p in parts)

    def test_rejection_codes_are_strings(self):
        assert isinstance(REJECT_INVALID_PAYLOAD, str)
        assert isinstance(REJECT_EMPTY_POSITIONS, str)
        assert isinstance(REJECT_ALL_POSITIONS_INVALID, str)

    def test_rejection_codes_unique(self):
        codes = {REJECT_INVALID_PAYLOAD, REJECT_EMPTY_POSITIONS, REJECT_ALL_POSITIONS_INVALID}
        assert len(codes) == 3


# ---------------------------------------------------------------------
# Exception hierarchy
# ---------------------------------------------------------------------
class TestExceptions:
    def test_exposure_error_is_exception(self):
        assert issubclass(ExposureError, Exception)

    def test_validation_error_is_exposure_error(self):
        assert issubclass(ValidationError, ExposureError)

    def test_validation_error_raises(self):
        with pytest.raises(ValidationError):
            raise ValidationError("test")


# ---------------------------------------------------------------------
# Position dataclass
# ---------------------------------------------------------------------
class TestPositionDataclass:
    def test_basic_creation(self):
        p = Position(type="equity", symbol="AAPL", qty=100.0)
        assert p.type == "equity"
        assert p.symbol == "AAPL"
        assert p.qty == 100.0

    def test_default_values(self):
        p = Position(type="cash", symbol="USD", qty=1_000_000.0)
        assert p.price is None
        assert p.underlying_price is None
        assert p.strike is None
        assert p.days_to_expiry is None
        assert p.implied_vol is None
        assert p.option_type is None
        assert p.contract_multiplier == 100.0
        assert p.risk_free_rate == 0.02
        assert p.delta is None
        assert p.gamma is None
        assert p.vega is None
        assert p.theta is None
        assert p.meta is None

    def test_frozen(self):
        p = Position(type="equity", symbol="X", qty=1.0)
        with pytest.raises(FrozenInstanceError):
            p.qty = 999.0  # type: ignore[misc]

    def test_option_creation_full(self):
        p = Position(
            type="option",
            symbol="AAPL240119C00150000",
            qty=10.0,
            price=5.0,
            underlying_price=155.0,
            strike=150.0,
            days_to_expiry=30.0,
            implied_vol=0.25,
            option_type="call",
            contract_multiplier=100.0,
            risk_free_rate=0.05,
            delta=0.65,
            gamma=0.03,
            vega=0.15,
            theta=-0.05,
            meta={"source": "test"},
        )
        assert p.option_type == "call"
        assert p.meta == {"source": "test"}


# ---------------------------------------------------------------------
# StageTrace dataclass
# ---------------------------------------------------------------------
class TestStageTrace:
    def test_creation(self):
        st = StageTrace(
            stage="exposure",
            engine={"name": "exposure", "version": "1.0.0"},
            input_hash="abc",
            output_hash="def",
            duration_ms=5,
            decisions=[],
            disclosures=["d1"],
            rejections=[],
        )
        assert st.stage == "exposure"
        assert st.duration_ms == 5
        assert st.disclosures == ["d1"]

    def test_dict_conversion(self):
        st = StageTrace(
            stage="x", engine={}, input_hash="", output_hash="",
            duration_ms=0, decisions=[], disclosures=[], rejections=[],
        )
        d = st.__dict__
        assert "stage" in d
        assert "rejections" in d


# ---------------------------------------------------------------------
# _canonical_json
# ---------------------------------------------------------------------
class TestCanonicalJson:
    def test_sorted_keys(self):
        result = _canonical_json({"z": 1, "a": 2})
        assert result == '{"a":2,"z":1}'

    def test_no_spaces(self):
        result = _canonical_json({"key": "value"})
        assert " " not in result

    def test_nested_sort(self):
        result = _canonical_json({"b": {"z": 1, "a": 2}, "a": 0})
        assert result.index('"a":0') < result.index('"b"')

    def test_nan_raises(self):
        with pytest.raises(ValueError):
            _canonical_json({"x": float("nan")})

    def test_inf_raises(self):
        with pytest.raises(ValueError):
            _canonical_json({"x": float("inf")})

    def test_list_preserved_order(self):
        result = _canonical_json([3, 1, 2])
        assert result == "[3,1,2]"


# ---------------------------------------------------------------------
# _stable_hash
# ---------------------------------------------------------------------
class TestStableHash:
    def test_deterministic(self):
        obj = {"a": 1, "b": [2, 3]}
        assert _stable_hash(obj) == _stable_hash(obj)

    def test_key_order_independent(self):
        assert _stable_hash({"a": 1, "b": 2}) == _stable_hash({"b": 2, "a": 1})

    def test_sha256_length(self):
        h = _stable_hash({"x": 1})
        assert len(h) == 64
        assert all(c in "0123456789abcdef" for c in h)

    def test_different_inputs_different_hash(self):
        assert _stable_hash({"a": 1}) != _stable_hash({"a": 2})

    def test_matches_manual_sha256(self):
        obj = {"key": "val"}
        canonical = json.dumps(obj, sort_keys=True, separators=(",", ":"),
                               ensure_ascii=False, allow_nan=False)
        expected = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
        assert _stable_hash(obj) == expected


# ---------------------------------------------------------------------
# _is_finite
# ---------------------------------------------------------------------
class TestIsFinite:
    def test_normal_int(self):
        assert _is_finite(42) is True

    def test_normal_float(self):
        assert _is_finite(3.14) is True

    def test_zero(self):
        assert _is_finite(0) is True
        assert _is_finite(0.0) is True

    def test_negative(self):
        assert _is_finite(-999.9) is True

    def test_nan(self):
        assert _is_finite(float("nan")) is False

    def test_inf(self):
        assert _is_finite(float("inf")) is False
        assert _is_finite(float("-inf")) is False

    def test_none(self):
        assert _is_finite(None) is False

    def test_string(self):
        assert _is_finite("42") is False

    def test_bool_true(self):
        # bool is subclass of int in Python
        assert _is_finite(True) is True

    def test_list(self):
        assert _is_finite([1]) is False


# ---------------------------------------------------------------------
# _norm_pdf / _norm_cdf
# ---------------------------------------------------------------------
class TestMathHelpers:
    def test_norm_pdf_at_zero(self):
        expected = 1.0 / math.sqrt(2.0 * math.pi)
        assert abs(_norm_pdf(0.0) - expected) < 1e-12

    def test_norm_pdf_symmetric(self):
        assert abs(_norm_pdf(1.0) - _norm_pdf(-1.0)) < 1e-12

    def test_norm_pdf_positive(self):
        assert _norm_pdf(2.0) > 0

    def test_norm_pdf_tails(self):
        assert _norm_pdf(10.0) < 1e-20

    def test_norm_cdf_at_zero(self):
        assert abs(_norm_cdf(0.0) - 0.5) < 1e-12

    def test_norm_cdf_bounds(self):
        assert _norm_cdf(-10.0) < 1e-10
        assert _norm_cdf(10.0) > 1.0 - 1e-10

    def test_norm_cdf_monotonic(self):
        assert _norm_cdf(-1.0) < _norm_cdf(0.0) < _norm_cdf(1.0)

    def test_norm_cdf_known_value(self):
        # N(1.96) ~ 0.975
        assert abs(_norm_cdf(1.96) - 0.975) < 0.001


# ---------------------------------------------------------------------
# bs_greeks
# ---------------------------------------------------------------------
class TestBsGreeks:
    def test_call_delta_range(self):
        g = bs_greeks(S=100, K=100, T_years=1.0, r=0.05, sigma=0.2, option_type="call")
        assert 0.0 < g["delta"] < 1.0

    def test_put_delta_range(self):
        g = bs_greeks(S=100, K=100, T_years=1.0, r=0.05, sigma=0.2, option_type="put")
        assert -1.0 < g["delta"] < 0.0

    def test_gamma_positive(self):
        g = bs_greeks(S=100, K=100, T_years=1.0, r=0.05, sigma=0.2, option_type="call")
        assert g["gamma"] > 0

    def test_call_put_gamma_equal(self):
        call = bs_greeks(S=100, K=100, T_years=1.0, r=0.05, sigma=0.2, option_type="call")
        put = bs_greeks(S=100, K=100, T_years=1.0, r=0.05, sigma=0.2, option_type="put")
        assert abs(call["gamma"] - put["gamma"]) < 1e-12

    def test_vega_positive(self):
        g = bs_greeks(S=100, K=100, T_years=1.0, r=0.05, sigma=0.2, option_type="call")
        assert g["vega"] > 0

    def test_call_put_vega_equal(self):
        call = bs_greeks(S=100, K=100, T_years=1.0, r=0.05, sigma=0.2, option_type="call")
        put = bs_greeks(S=100, K=100, T_years=1.0, r=0.05, sigma=0.2, option_type="put")
        assert abs(call["vega"] - put["vega"]) < 1e-12

    def test_call_theta_negative(self):
        g = bs_greeks(S=100, K=100, T_years=1.0, r=0.05, sigma=0.2, option_type="call")
        assert g["theta"] < 0

    def test_deep_itm_call_delta_near_one(self):
        g = bs_greeks(S=200, K=50, T_years=0.01, r=0.05, sigma=0.2, option_type="call")
        assert g["delta"] > 0.99

    def test_deep_otm_call_delta_near_zero(self):
        g = bs_greeks(S=50, K=200, T_years=0.01, r=0.05, sigma=0.2, option_type="call")
        assert g["delta"] < 0.01

    def test_put_call_delta_parity(self):
        call = bs_greeks(S=100, K=100, T_years=1.0, r=0.05, sigma=0.2, option_type="call")
        put = bs_greeks(S=100, K=100, T_years=1.0, r=0.05, sigma=0.2, option_type="put")
        # delta_call - delta_put = 1
        assert abs((call["delta"] - put["delta"]) - 1.0) < 1e-10

    def test_invalid_zero_spot(self):
        with pytest.raises(ValidationError):
            bs_greeks(S=0, K=100, T_years=1.0, r=0.05, sigma=0.2, option_type="call")

    def test_invalid_zero_strike(self):
        with pytest.raises(ValidationError):
            bs_greeks(S=100, K=0, T_years=1.0, r=0.05, sigma=0.2, option_type="call")

    def test_invalid_zero_time(self):
        with pytest.raises(ValidationError):
            bs_greeks(S=100, K=100, T_years=0, r=0.05, sigma=0.2, option_type="call")

    def test_invalid_zero_sigma(self):
        with pytest.raises(ValidationError):
            bs_greeks(S=100, K=100, T_years=1.0, r=0.05, sigma=0, option_type="call")

    def test_negative_spot_raises(self):
        with pytest.raises(ValidationError):
            bs_greeks(S=-100, K=100, T_years=1.0, r=0.05, sigma=0.2, option_type="call")

    def test_all_keys_present(self):
        g = bs_greeks(S=100, K=100, T_years=1.0, r=0.05, sigma=0.2, option_type="call")
        assert set(g.keys()) == {"delta", "gamma", "vega", "theta"}

    def test_high_vol_gamma_lower(self):
        # Gamma at ATM is inversely proportional to vol (for fixed S*sqrt(T))
        g_low = bs_greeks(S=100, K=100, T_years=1.0, r=0.05, sigma=0.1, option_type="call")
        g_high = bs_greeks(S=100, K=100, T_years=1.0, r=0.05, sigma=0.5, option_type="call")
        assert g_low["gamma"] > g_high["gamma"]


# ---------------------------------------------------------------------
# normalize_position
# ---------------------------------------------------------------------
class TestNormalizePosition:
    def test_basic_equity(self):
        p = normalize_position({"type": "equity", "symbol": "AAPL", "qty": 100, "price": 150.0})
        assert p.type == "equity"
        assert p.symbol == "AAPL"
        assert p.qty == 100.0
        assert p.price == 150.0

    def test_type_case_insensitive(self):
        p = normalize_position({"type": "EQUITY", "symbol": "X", "qty": 1})
        assert p.type == "equity"

    def test_type_whitespace_stripped(self):
        p = normalize_position({"type": "  cash  ", "symbol": "USD", "qty": 1})
        assert p.type == "cash"

    def test_invalid_type_raises(self):
        with pytest.raises(ValidationError, match="Invalid position.type"):
            normalize_position({"type": "bond", "symbol": "X", "qty": 1})

    def test_missing_type_raises(self):
        with pytest.raises(ValidationError, match="Invalid position.type"):
            normalize_position({"symbol": "X", "qty": 1})

    def test_empty_symbol_raises(self):
        with pytest.raises(ValidationError, match="symbol required"):
            normalize_position({"type": "equity", "symbol": "", "qty": 1})

    def test_missing_symbol_raises(self):
        with pytest.raises(ValidationError, match="symbol required"):
            normalize_position({"type": "equity", "qty": 1})

    def test_non_dict_raises(self):
        with pytest.raises(ValidationError, match="must be dict"):
            normalize_position("not a dict")  # type: ignore

    def test_nan_qty_raises(self):
        with pytest.raises(ValidationError, match="qty must be finite"):
            normalize_position({"type": "equity", "symbol": "X", "qty": float("nan")})

    def test_inf_qty_raises(self):
        with pytest.raises(ValidationError, match="qty must be finite"):
            normalize_position({"type": "equity", "symbol": "X", "qty": float("inf")})

    def test_missing_qty_raises(self):
        with pytest.raises((ValidationError, TypeError)):
            normalize_position({"type": "equity", "symbol": "X"})

    def test_option_fields_from_top_level(self):
        p = normalize_position({
            "type": "option", "symbol": "AAPL C", "qty": 5,
            "underlying_price": 155.0, "strike": 150.0,
            "days_to_expiry": 30, "implied_vol": 0.25,
            "option_type": "call",
        })
        assert p.underlying_price == 155.0
        assert p.strike == 150.0
        assert p.option_type == "call"

    def test_option_fields_from_nested_option_dict(self):
        p = normalize_position({
            "type": "option", "symbol": "SPY P", "qty": 10,
            "option": {
                "underlying_price": 450.0, "strike": 440.0,
                "days_to_expiry": 60, "implied_vol": 0.18,
                "option_type": "put",
            },
        })
        assert p.underlying_price == 450.0
        assert p.option_type == "put"

    def test_invalid_option_type_becomes_none(self):
        p = normalize_position({
            "type": "option", "symbol": "X", "qty": 1,
            "option_type": "straddle",
        })
        assert p.option_type is None

    def test_contract_multiplier_default(self):
        p = normalize_position({"type": "equity", "symbol": "X", "qty": 1})
        assert p.contract_multiplier == 100.0

    def test_contract_multiplier_override(self):
        p = normalize_position({
            "type": "option", "symbol": "X", "qty": 1,
            "contract_multiplier": 50.0,
        })
        assert p.contract_multiplier == 50.0

    def test_risk_free_rate_default(self):
        p = normalize_position({"type": "equity", "symbol": "X", "qty": 1})
        assert p.risk_free_rate == 0.02

    def test_caller_greeks_passthrough(self):
        p = normalize_position({
            "type": "equity", "symbol": "X", "qty": 1,
            "delta": 0.5, "gamma": 0.01, "vega": 0.1, "theta": -0.05,
        })
        assert p.delta == 0.5
        assert p.gamma == 0.01
        assert p.vega == 0.1
        assert p.theta == -0.05

    def test_meta_passthrough(self):
        p = normalize_position({
            "type": "equity", "symbol": "X", "qty": 1,
            "meta": {"source": "bloomberg"},
        })
        assert p.meta == {"source": "bloomberg"}

    def test_all_valid_types(self):
        for t in ("equity", "option", "future", "crypto", "cash", "other"):
            p = normalize_position({"type": t, "symbol": "X", "qty": 1})
            assert p.type == t

    def test_negative_qty_allowed(self):
        p = normalize_position({"type": "equity", "symbol": "X", "qty": -50})
        assert p.qty == -50.0

    def test_zero_qty_allowed(self):
        p = normalize_position({"type": "equity", "symbol": "X", "qty": 0})
        assert p.qty == 0.0


# ---------------------------------------------------------------------
# _extract_positions
# ---------------------------------------------------------------------
class TestExtractPositions:
    def test_list_input(self):
        data = [{"type": "equity", "symbol": "X", "qty": 1}]
        assert _extract_positions(data) == data

    def test_dict_with_positions_key(self):
        data = {"positions": [{"x": 1}]}
        assert _extract_positions(data) == [{"x": 1}]

    def test_nested_portfolio(self):
        data = {"portfolio": {"positions": [{"x": 2}]}}
        assert _extract_positions(data) == [{"x": 2}]

    def test_nested_exposure_input(self):
        data = {"exposure_input": {"positions": [{"x": 3}]}}
        assert _extract_positions(data) == [{"x": 3}]

    def test_priority_positions_over_portfolio(self):
        data = {
            "positions": [{"a": 1}],
            "portfolio": {"positions": [{"b": 2}]},
        }
        assert _extract_positions(data) == [{"a": 1}]

    def test_invalid_string_raises(self):
        with pytest.raises(ValidationError):
            _extract_positions("not valid")

    def test_invalid_dict_no_positions(self):
        with pytest.raises(ValidationError):
            _extract_positions({"data": [1, 2]})

    def test_empty_list_returns_empty(self):
        assert _extract_positions([]) == []

    def test_none_raises(self):
        with pytest.raises(ValidationError):
            _extract_positions(None)

    def test_int_raises(self):
        with pytest.raises(ValidationError):
            _extract_positions(42)


# ---------------------------------------------------------------------
# _extract_policy
# ---------------------------------------------------------------------
class TestExtractPolicy:
    def test_explicit_policy_wins(self):
        result = _extract_policy(
            {"policy_bundle": {"a": 1}},
            {"b": 2},
        )
        assert result == {"b": 2}

    def test_policy_bundle_from_payload(self):
        result = _extract_policy({"policy_bundle": {"x": 10}}, None)
        assert result == {"x": 10}

    def test_policy_from_payload(self):
        result = _extract_policy({"policy": {"y": 20}}, None)
        assert result == {"y": 20}

    def test_policy_bundle_over_policy(self):
        result = _extract_policy(
            {"policy_bundle": {"a": 1}, "policy": {"b": 2}},
            None,
        )
        assert result == {"a": 1}

    def test_empty_when_nothing(self):
        result = _extract_policy({}, None)
        assert result == {}

    def test_non_dict_payload(self):
        result = _extract_policy("string", None)
        assert result == {}

    def test_none_payload(self):
        result = _extract_policy(None, None)
        assert result == {}


# ---------------------------------------------------------------------
# compute_portfolio_exposure
# ---------------------------------------------------------------------
class TestComputePortfolioExposure:
    def test_empty_positions_rejection(self):
        result = compute_portfolio_exposure([])
        assert result["delta_usd"] == 0.0
        assert result["gamma_proxy"] == 0.0
        assert result["vega_usd"] == 0.0
        assert result["theta_usd"] == 0.0
        trace = result["stage_trace"]
        assert len(trace["rejections"]) == 1
        assert trace["rejections"][0]["code"] == REJECT_EMPTY_POSITIONS

    def test_spot_delta_single(self):
        positions = [{"type": "equity", "symbol": "AAPL", "qty": 100, "price": 150.0}]
        result = compute_portfolio_exposure(positions)
        assert result["delta_usd"] == pytest.approx(15_000.0)
        assert result["gamma_proxy"] == 0.0
        assert result["vega_usd"] == 0.0
        assert result["theta_usd"] == 0.0

    def test_spot_delta_multiple(self):
        positions = [
            {"type": "equity", "symbol": "A", "qty": 10, "price": 100.0},
            {"type": "equity", "symbol": "B", "qty": 20, "price": 50.0},
        ]
        result = compute_portfolio_exposure(positions)
        assert result["delta_usd"] == pytest.approx(2_000.0)

    def test_spot_negative_qty(self):
        positions = [{"type": "equity", "symbol": "X", "qty": -50, "price": 200.0}]
        result = compute_portfolio_exposure(positions)
        assert result["delta_usd"] == pytest.approx(-10_000.0)

    def test_spot_missing_price_not_strict(self):
        positions = [{"type": "equity", "symbol": "X", "qty": 100}]
        result = compute_portfolio_exposure(positions)
        # Missing price => usable_count stays 0
        assert result["delta_usd"] == 0.0
        trace = result["stage_trace"]
        decisions = trace["decisions"]
        assert any(d.get("mode") == "spot_missing_price" for d in decisions)

    def test_spot_missing_price_strict_policy(self):
        positions = [{"type": "equity", "symbol": "X", "qty": 100}]
        result = compute_portfolio_exposure(
            positions, policy={"strict_spot_price_required": True}
        )
        trace = result["stage_trace"]
        decisions = trace["decisions"]
        assert any(d.get("mode") == "spot_skipped_missing_price" for d in decisions)

    def test_spot_zero_price_skipped(self):
        positions = [{"type": "equity", "symbol": "X", "qty": 100, "price": 0.0}]
        result = compute_portfolio_exposure(positions)
        assert result["delta_usd"] == 0.0

    def test_spot_negative_price_skipped(self):
        positions = [{"type": "equity", "symbol": "X", "qty": 100, "price": -10.0}]
        result = compute_portfolio_exposure(positions)
        assert result["delta_usd"] == 0.0

    def test_provided_greeks_scaled(self):
        positions = [{
            "type": "equity", "symbol": "AAPL", "qty": 100, "price": 150.0,
            "delta": 1.0, "gamma": 0.0, "vega": 0.0, "theta": 0.0,
        }]
        result = compute_portfolio_exposure(positions)
        # delta=1.0 * qty=100 * mult=1 (equity) * price=150 = 15000
        assert result["delta_usd"] == pytest.approx(15_000.0)

    def test_provided_greeks_option_scaled(self):
        positions = [{
            "type": "option", "symbol": "X C", "qty": 10,
            "underlying_price": 100.0,
            "delta": 0.5, "gamma": 0.02, "vega": 0.1, "theta": -0.03,
            "contract_multiplier": 100.0,
        }]
        result = compute_portfolio_exposure(positions)
        # delta=0.5 * qty=10 * mult=100 * underlying_price=100 = 50000
        assert result["delta_usd"] == pytest.approx(50_000.0)
        # gamma=0.02 * 10 * 100 * 100 = 2000
        assert result["gamma_proxy"] == pytest.approx(2_000.0)
        # vega=0.1 * 10 * 100 = 100
        assert result["vega_usd"] == pytest.approx(100.0)
        # theta=-0.03 * 10 * 100 = -30
        assert result["theta_usd"] == pytest.approx(-30.0)

    def test_provided_greeks_unscaled_no_price(self):
        positions = [{
            "type": "equity", "symbol": "X", "qty": 100,
            "delta": 1.0, "gamma": 0.0, "vega": 0.0, "theta": 0.0,
        }]
        result = compute_portfolio_exposure(positions)
        # No price => unscaled: delta=1*100*1 = 100
        assert result["delta_usd"] == pytest.approx(100.0)
        decisions = result["stage_trace"]["decisions"]
        assert any(d.get("mode") == "provided_greeks_unscaled" for d in decisions)

    def test_bs_fallback_call(self):
        positions = [{
            "type": "option", "symbol": "X C",
            "qty": 1,
            "underlying_price": 100.0,
            "strike": 100.0,
            "days_to_expiry": 365,
            "implied_vol": 0.2,
            "option_type": "call",
            "contract_multiplier": 100.0,
            "risk_free_rate": 0.05,
        }]
        result = compute_portfolio_exposure(positions)
        assert result["delta_usd"] != 0.0
        decisions = result["stage_trace"]["decisions"]
        assert any(d.get("mode") == "bs_fallback" for d in decisions)

    def test_bs_fallback_missing_inputs_skipped(self):
        positions = [{
            "type": "option", "symbol": "X C", "qty": 1,
            # missing underlying_price, strike, etc.
        }]
        result = compute_portfolio_exposure(positions)
        assert result["delta_usd"] == 0.0
        decisions = result["stage_trace"]["decisions"]
        assert any(d.get("mode") == "option_skipped_invalid_inputs" for d in decisions)

    def test_bs_fallback_zero_days_to_expiry_skipped(self):
        positions = [{
            "type": "option", "symbol": "X C", "qty": 1,
            "underlying_price": 100.0, "strike": 100.0,
            "days_to_expiry": 0, "implied_vol": 0.2,
            "option_type": "call",
        }]
        result = compute_portfolio_exposure(positions)
        decisions = result["stage_trace"]["decisions"]
        assert any(d.get("mode") == "option_skipped_invalid_inputs" for d in decisions)

    def test_all_invalid_positions_rejection(self):
        positions = [
            {"type": "invalid_type", "symbol": "X", "qty": 1},
            {"type": "equity", "symbol": "", "qty": 1},
        ]
        result = compute_portfolio_exposure(positions)
        rejections = result["stage_trace"]["rejections"]
        assert len(rejections) == 1
        assert rejections[0]["code"] == REJECT_ALL_POSITIONS_INVALID

    def test_mixed_valid_invalid(self):
        positions = [
            {"type": "invalid", "symbol": "X", "qty": 1},  # invalid type
            {"type": "equity", "symbol": "AAPL", "qty": 10, "price": 100.0},  # valid
        ]
        result = compute_portfolio_exposure(positions)
        assert result["delta_usd"] == pytest.approx(1_000.0)
        rejections = result["stage_trace"]["rejections"]
        assert len(rejections) == 0  # at least one usable, no overall rejection
        decisions = result["stage_trace"]["decisions"]
        assert any(d.get("mode") == "position_rejected_validation" for d in decisions)

    def test_output_contains_engine_info(self):
        result = compute_portfolio_exposure([
            {"type": "equity", "symbol": "X", "qty": 1, "price": 10.0}
        ])
        assert result["engine"]["name"] == ENGINE_NAME
        assert result["engine"]["version"] == ENGINE_VERSION

    def test_output_contains_stage_trace(self):
        result = compute_portfolio_exposure([
            {"type": "equity", "symbol": "X", "qty": 1, "price": 10.0}
        ])
        trace = result["stage_trace"]
        assert "input_hash" in trace
        assert "output_hash" in trace
        assert "duration_ms" in trace
        assert "decisions" in trace
        assert "disclosures" in trace
        assert "rejections" in trace

    def test_output_contains_meta(self):
        result = compute_portfolio_exposure(
            [{"type": "equity", "symbol": "X", "qty": 1, "price": 10.0}],
            request_id="test-123",
            user_id="user-456",
        )
        assert result["meta"]["request_id"] == "test-123"
        assert result["meta"]["user_id"] == "user-456"

    def test_disclosures_present(self):
        result = compute_portfolio_exposure([
            {"type": "equity", "symbol": "X", "qty": 1, "price": 10.0}
        ])
        disclosures = result["stage_trace"]["disclosures"]
        assert len(disclosures) >= 3
        assert any("first-order" in d.lower() for d in disclosures)

    def test_deterministic_hashes(self):
        positions = [{"type": "equity", "symbol": "X", "qty": 100, "price": 50.0}]
        r1 = compute_portfolio_exposure(positions)
        r2 = compute_portfolio_exposure(positions)
        assert r1["stage_trace"]["input_hash"] == r2["stage_trace"]["input_hash"]
        assert r1["stage_trace"]["output_hash"] == r2["stage_trace"]["output_hash"]

    def test_request_id_auto_generated(self):
        result = compute_portfolio_exposure([
            {"type": "equity", "symbol": "X", "qty": 1, "price": 10.0}
        ])
        assert result["meta"]["request_id"].startswith("exp_")

    def test_cash_type_spot_delta(self):
        result = compute_portfolio_exposure([
            {"type": "cash", "symbol": "USD", "qty": 1_000_000, "price": 1.0}
        ])
        assert result["delta_usd"] == pytest.approx(1_000_000.0)

    def test_future_type_spot_delta(self):
        result = compute_portfolio_exposure([
            {"type": "future", "symbol": "ES", "qty": 5, "price": 5000.0}
        ])
        assert result["delta_usd"] == pytest.approx(25_000.0)

    def test_crypto_type_spot_delta(self):
        result = compute_portfolio_exposure([
            {"type": "crypto", "symbol": "BTC", "qty": 2, "price": 60000.0}
        ])
        assert result["delta_usd"] == pytest.approx(120_000.0)


# ---------------------------------------------------------------------
# compute_exposure (wrapper)
# ---------------------------------------------------------------------
class TestComputeExposure:
    def test_list_payload(self):
        result = compute_exposure([
            {"type": "equity", "symbol": "X", "qty": 10, "price": 100.0}
        ])
        assert result["delta_usd"] == pytest.approx(1_000.0)

    def test_dict_payload_with_positions(self):
        result = compute_exposure({"positions": [
            {"type": "equity", "symbol": "X", "qty": 5, "price": 200.0}
        ]})
        assert result["delta_usd"] == pytest.approx(1_000.0)

    def test_policy_from_payload_policy_bundle(self):
        result = compute_exposure({
            "positions": [{"type": "equity", "symbol": "X", "qty": 1}],
            "policy_bundle": {"strict_spot_price_required": True},
        })
        decisions = result["stage_trace"]["decisions"]
        assert any(d.get("mode") == "spot_skipped_missing_price" for d in decisions)

    def test_explicit_policy_overrides_payload(self):
        result = compute_exposure(
            {
                "positions": [{"type": "equity", "symbol": "X", "qty": 1}],
                "policy_bundle": {"strict_spot_price_required": False},
            },
            policy={"strict_spot_price_required": True},
        )
        decisions = result["stage_trace"]["decisions"]
        assert any(d.get("mode") == "spot_skipped_missing_price" for d in decisions)

    def test_empty_list_payload(self):
        result = compute_exposure([])
        assert result["stage_trace"]["rejections"][0]["code"] == REJECT_EMPTY_POSITIONS

    def test_invalid_payload_raises(self):
        with pytest.raises(ValidationError):
            compute_exposure("not valid at all")


# =====================================================================
# PART 2: instrument_mapper.py helper functions (mocked contract imports)
# =====================================================================

# The instrument_mapper module imports from app.contracts.* which doesn't
# exist on disk. We mock these modules at sys.modules level, import the
# module, and then test its pure helper functions.

@pytest.fixture(scope="module")
def instrument_mapper_module():
    """
    Import instrument_mapper with mocked contract dependencies.
    Returns the module object so tests can access its functions.
    """
    # Build mock modules for all contract imports
    mock_instrument_catalog = types.ModuleType("app.contracts.instrument_catalog")
    mock_instrument_catalog.InstrumentCatalog = MagicMock  # type: ignore
    mock_instrument_catalog.InstrumentType = MagicMock()  # type: ignore
    # Create enum-like values for InstrumentType
    mock_instrument_catalog.InstrumentType.FUTURE = "FUTURE"  # type: ignore
    mock_instrument_catalog.InstrumentType.FUTURE_OPTION = "FUTURE_OPTION"  # type: ignore
    mock_instrument_catalog.InstrumentType.OPTION = "OPTION"  # type: ignore

    mock_policy_bundle = types.ModuleType("app.contracts.policy_bundle")
    mock_policy_bundle.PolicyBundle = MagicMock  # type: ignore

    mock_run_envelope = types.ModuleType("app.contracts.run_envelope")
    mock_run_envelope.hash_canonical = lambda x: _stable_hash(x)  # type: ignore

    mock_trace_bundle = types.ModuleType("app.contracts.trace_bundle")
    # Create mock classes for trace_bundle types
    mock_trace_bundle.Disclosure = MagicMock  # type: ignore
    mock_trace_bundle.DisclosureCode = MagicMock()  # type: ignore
    mock_trace_bundle.DisclosureCode.DISCLOSED_PROXY_INSTRUMENT_USED = "DISCLOSED_PROXY_INSTRUMENT_USED"  # type: ignore
    mock_trace_bundle.Rejection = MagicMock  # type: ignore
    mock_trace_bundle.RejectionCode = MagicMock()  # type: ignore
    mock_trace_bundle.RejectionCode.REJECT_INVALID_PORTFOLIO = "REJECT_INVALID_PORTFOLIO"  # type: ignore
    mock_trace_bundle.RejectionCode.REJECT_MISSING_MARKET_FIELDS = "REJECT_MISSING_MARKET_FIELDS"  # type: ignore
    mock_trace_bundle.RejectionCode.REJECT_COVERAGE_FAILURE = "REJECT_COVERAGE_FAILURE"  # type: ignore
    mock_trace_bundle.RejectionCode.REJECT_NO_ELIGIBLE_INSTRUMENTS = "REJECT_NO_ELIGIBLE_INSTRUMENTS"  # type: ignore
    mock_trace_bundle.StageName = MagicMock()  # type: ignore
    mock_trace_bundle.StageName.INSTRUMENT_MAPPER = "INSTRUMENT_MAPPER"  # type: ignore
    mock_trace_bundle.TraceStep = MagicMock  # type: ignore

    # Also mock parent modules
    mock_contracts = types.ModuleType("app.contracts")

    saved = {}
    modules_to_mock = {
        "app.contracts": mock_contracts,
        "app.contracts.instrument_catalog": mock_instrument_catalog,
        "app.contracts.policy_bundle": mock_policy_bundle,
        "app.contracts.run_envelope": mock_run_envelope,
        "app.contracts.trace_bundle": mock_trace_bundle,
    }

    for mod_name, mock_mod in modules_to_mock.items():
        saved[mod_name] = sys.modules.get(mod_name)
        sys.modules[mod_name] = mock_mod

    # Remove cached module if previously imported
    cached_key = "app.engine.instrument_mapper"
    if cached_key in sys.modules:
        saved[cached_key] = sys.modules.pop(cached_key)

    try:
        mod = importlib.import_module("app.engine.instrument_mapper")
        yield mod
    finally:
        # Restore original sys.modules state
        for mod_name, original in saved.items():
            if original is None:
                sys.modules.pop(mod_name, None)
            else:
                sys.modules[mod_name] = original


# ---------------------------------------------------------------------
# instrument_mapper pure helpers
# ---------------------------------------------------------------------
class TestInstrumentMapperConstants:
    def test_engine_name(self, instrument_mapper_module):
        assert instrument_mapper_module.ENGINE_NAME == "instrument_mapper"

    def test_engine_version(self, instrument_mapper_module):
        parts = instrument_mapper_module.ENGINE_VERSION.split(".")
        assert len(parts) == 3


class TestMapperCanonicalJson:
    def test_sorted_keys(self, instrument_mapper_module):
        result = instrument_mapper_module._canonical_json({"z": 1, "a": 2})
        assert result == '{"a":2,"z":1}'

    def test_no_spaces(self, instrument_mapper_module):
        result = instrument_mapper_module._canonical_json({"key": "value"})
        assert " " not in result

    def test_nan_raises(self, instrument_mapper_module):
        with pytest.raises(ValueError):
            instrument_mapper_module._canonical_json({"x": float("nan")})


class TestMapperStableHash:
    def test_deterministic(self, instrument_mapper_module):
        obj = {"a": 1}
        h1 = instrument_mapper_module._stable_hash(obj)
        h2 = instrument_mapper_module._stable_hash(obj)
        assert h1 == h2

    def test_sha256_hex(self, instrument_mapper_module):
        h = instrument_mapper_module._stable_hash({"x": 1})
        assert len(h) == 64

    def test_key_order_independent(self, instrument_mapper_module):
        h1 = instrument_mapper_module._stable_hash({"a": 1, "b": 2})
        h2 = instrument_mapper_module._stable_hash({"b": 2, "a": 1})
        assert h1 == h2


class TestAsInt:
    def test_normal(self, instrument_mapper_module):
        assert instrument_mapper_module._as_int(42) == 42

    def test_string_number(self, instrument_mapper_module):
        assert instrument_mapper_module._as_int("7") == 7

    def test_float_truncates(self, instrument_mapper_module):
        assert instrument_mapper_module._as_int(3.9) == 3

    def test_invalid_returns_default(self, instrument_mapper_module):
        assert instrument_mapper_module._as_int("abc") == 0

    def test_custom_default(self, instrument_mapper_module):
        assert instrument_mapper_module._as_int("abc", 99) == 99

    def test_none_returns_default(self, instrument_mapper_module):
        assert instrument_mapper_module._as_int(None) == 0


class TestAsStr:
    def test_normal(self, instrument_mapper_module):
        assert instrument_mapper_module._as_str("hello") == "hello"

    def test_none_returns_empty(self, instrument_mapper_module):
        assert instrument_mapper_module._as_str(None) == ""

    def test_int_coerced(self, instrument_mapper_module):
        assert instrument_mapper_module._as_str(42) == "42"

    def test_whitespace_stripped(self, instrument_mapper_module):
        assert instrument_mapper_module._as_str("  foo  ") == "foo"

    def test_empty_string(self, instrument_mapper_module):
        assert instrument_mapper_module._as_str("") == ""


class TestAsList:
    def test_list_passthrough(self, instrument_mapper_module):
        assert instrument_mapper_module._as_list([1, 2]) == [1, 2]

    def test_non_list_returns_empty(self, instrument_mapper_module):
        assert instrument_mapper_module._as_list("not a list") == []

    def test_none_returns_empty(self, instrument_mapper_module):
        assert instrument_mapper_module._as_list(None) == []

    def test_dict_returns_empty(self, instrument_mapper_module):
        assert instrument_mapper_module._as_list({"a": 1}) == []

    def test_tuple_returns_empty(self, instrument_mapper_module):
        assert instrument_mapper_module._as_list((1, 2)) == []

    def test_empty_list(self, instrument_mapper_module):
        assert instrument_mapper_module._as_list([]) == []


class TestClampInt:
    def test_within_range(self, instrument_mapper_module):
        assert instrument_mapper_module._clamp_int(5, 0, 10) == 5

    def test_below_range(self, instrument_mapper_module):
        assert instrument_mapper_module._clamp_int(-5, 0, 10) == 0

    def test_above_range(self, instrument_mapper_module):
        assert instrument_mapper_module._clamp_int(15, 0, 10) == 10

    def test_at_lower_bound(self, instrument_mapper_module):
        assert instrument_mapper_module._clamp_int(0, 0, 10) == 0

    def test_at_upper_bound(self, instrument_mapper_module):
        assert instrument_mapper_module._clamp_int(10, 0, 10) == 10

    def test_equal_bounds(self, instrument_mapper_module):
        assert instrument_mapper_module._clamp_int(5, 3, 3) == 3

    def test_negative_range(self, instrument_mapper_module):
        assert instrument_mapper_module._clamp_int(-7, -10, -1) == -7


class TestInstrumentHasRequiredSpecs:
    def test_future_with_contract(self, instrument_mapper_module):
        InstrumentType = sys.modules["app.contracts.instrument_catalog"].InstrumentType
        inst = MagicMock()
        inst.instrument_type = InstrumentType.FUTURE
        inst.contract = MagicMock()
        assert instrument_mapper_module._instrument_has_required_specs(inst) is True

    def test_future_without_contract(self, instrument_mapper_module):
        InstrumentType = sys.modules["app.contracts.instrument_catalog"].InstrumentType
        inst = MagicMock()
        inst.instrument_type = InstrumentType.FUTURE
        inst.contract = None
        assert instrument_mapper_module._instrument_has_required_specs(inst) is False

    def test_option_with_contract(self, instrument_mapper_module):
        InstrumentType = sys.modules["app.contracts.instrument_catalog"].InstrumentType
        inst = MagicMock()
        inst.instrument_type = InstrumentType.OPTION
        inst.contract = MagicMock()
        assert instrument_mapper_module._instrument_has_required_specs(inst) is True

    def test_option_without_contract(self, instrument_mapper_module):
        InstrumentType = sys.modules["app.contracts.instrument_catalog"].InstrumentType
        inst = MagicMock()
        inst.instrument_type = InstrumentType.OPTION
        inst.contract = None
        assert instrument_mapper_module._instrument_has_required_specs(inst) is False

    def test_spot_always_true(self, instrument_mapper_module):
        inst = MagicMock()
        inst.instrument_type = "SPOT"  # not in derivative set
        inst.contract = None
        assert instrument_mapper_module._instrument_has_required_specs(inst) is True


class TestAxesAllowed:
    def test_empty_required_allows_all(self, instrument_mapper_module):
        inst = MagicMock()
        inst.eligible_axes = ["fx", "rates"]
        assert instrument_mapper_module._axes_allowed(inst, []) is True

    def test_matching_axis(self, instrument_mapper_module):
        inst = MagicMock()
        inst.eligible_axes = ["fx", "rates"]
        assert instrument_mapper_module._axes_allowed(inst, ["fx"]) is True

    def test_no_matching_axis(self, instrument_mapper_module):
        inst = MagicMock()
        inst.eligible_axes = ["fx"]
        assert instrument_mapper_module._axes_allowed(inst, ["rates"]) is False

    def test_partial_match_any(self, instrument_mapper_module):
        inst = MagicMock()
        inst.eligible_axes = ["fx"]
        assert instrument_mapper_module._axes_allowed(inst, ["rates", "fx"]) is True

    def test_none_eligible_axes(self, instrument_mapper_module):
        inst = MagicMock()
        inst.eligible_axes = None
        assert instrument_mapper_module._axes_allowed(inst, ["fx"]) is False

    def test_empty_string_in_required_ignored(self, instrument_mapper_module):
        inst = MagicMock()
        inst.eligible_axes = ["fx"]
        # Empty strings after strip should be filtered out
        assert instrument_mapper_module._axes_allowed(inst, ["", "  "]) is True


class TestMandateAllowed:
    def test_no_mandates_allows(self, instrument_mapper_module):
        inst = MagicMock()
        inst.mandates.allow = []
        inst.mandates.prohibit = []
        assert instrument_mapper_module._mandate_allowed(inst, [], []) is True

    def test_prohibit_match_blocks(self, instrument_mapper_module):
        inst = MagicMock()
        inst.mandates.allow = ["esg"]
        inst.mandates.prohibit = []
        assert instrument_mapper_module._mandate_allowed(inst, [], ["esg"]) is False

    def test_allow_match_passes(self, instrument_mapper_module):
        inst = MagicMock()
        inst.mandates.allow = ["esg"]
        inst.mandates.prohibit = []
        assert instrument_mapper_module._mandate_allowed(inst, ["esg"], []) is True

    def test_allow_no_match_fails(self, instrument_mapper_module):
        inst = MagicMock()
        inst.mandates.allow = ["esg"]
        inst.mandates.prohibit = []
        assert instrument_mapper_module._mandate_allowed(inst, ["shariah"], []) is False

    def test_prohibit_on_inst_prohibit_set(self, instrument_mapper_module):
        inst = MagicMock()
        inst.mandates.allow = []
        inst.mandates.prohibit = ["restricted"]
        assert instrument_mapper_module._mandate_allowed(inst, [], ["restricted"]) is False


class TestRankInstruments:
    def test_ranks_by_liquidity_desc(self, instrument_mapper_module):
        inst_a = MagicMock()
        inst_a.liquidity.liquidity_score = 0.8
        inst_a.instrument_id = "A"

        inst_b = MagicMock()
        inst_b.liquidity.liquidity_score = 0.95
        inst_b.instrument_id = "B"

        result = instrument_mapper_module._rank_instruments([inst_a, inst_b])
        assert result[0].instrument_id == "B"
        assert result[1].instrument_id == "A"

    def test_tiebreak_by_instrument_id(self, instrument_mapper_module):
        inst_a = MagicMock()
        inst_a.liquidity.liquidity_score = 0.9
        inst_a.instrument_id = "A"

        inst_b = MagicMock()
        inst_b.liquidity.liquidity_score = 0.9
        inst_b.instrument_id = "B"

        result = instrument_mapper_module._rank_instruments([inst_b, inst_a])
        assert result[0].instrument_id == "A"
        assert result[1].instrument_id == "B"

    def test_empty_list(self, instrument_mapper_module):
        assert instrument_mapper_module._rank_instruments([]) == []

    def test_single_item(self, instrument_mapper_module):
        inst = MagicMock()
        inst.liquidity.liquidity_score = 0.5
        inst.instrument_id = "X"
        result = instrument_mapper_module._rank_instruments([inst])
        assert len(result) == 1


class TestLiquidityAllowed:
    def test_score_above_min(self, instrument_mapper_module):
        inst = MagicMock()
        inst.liquidity.liquidity_score = 0.8
        inst.liquidity.avg_daily_volume = 1_000_000
        inst.liquidity.open_interest = 50_000

        policy = MagicMock()
        policy.liquidity.min_liquidity_score = 0.5
        policy.liquidity.min_avg_daily_volume = None
        policy.liquidity.min_open_interest = None

        assert instrument_mapper_module._liquidity_allowed(inst, policy) is True

    def test_score_below_min(self, instrument_mapper_module):
        inst = MagicMock()
        inst.liquidity.liquidity_score = 0.3

        policy = MagicMock()
        policy.liquidity.min_liquidity_score = 0.5
        policy.liquidity.min_avg_daily_volume = None
        policy.liquidity.min_open_interest = None

        assert instrument_mapper_module._liquidity_allowed(inst, policy) is False

    def test_adv_below_min(self, instrument_mapper_module):
        inst = MagicMock()
        inst.liquidity.liquidity_score = 0.9
        inst.liquidity.avg_daily_volume = 100

        policy = MagicMock()
        policy.liquidity.min_liquidity_score = 0.5
        policy.liquidity.min_avg_daily_volume = 1000
        policy.liquidity.min_open_interest = None

        assert instrument_mapper_module._liquidity_allowed(inst, policy) is False

    def test_adv_none_when_policy_requires(self, instrument_mapper_module):
        inst = MagicMock()
        inst.liquidity.liquidity_score = 0.9
        inst.liquidity.avg_daily_volume = None

        policy = MagicMock()
        policy.liquidity.min_liquidity_score = 0.5
        policy.liquidity.min_avg_daily_volume = 1000
        policy.liquidity.min_open_interest = None

        assert instrument_mapper_module._liquidity_allowed(inst, policy) is False

    def test_open_interest_below_min(self, instrument_mapper_module):
        inst = MagicMock()
        inst.liquidity.liquidity_score = 0.9
        inst.liquidity.avg_daily_volume = 1_000_000
        inst.liquidity.open_interest = 10

        policy = MagicMock()
        policy.liquidity.min_liquidity_score = 0.5
        policy.liquidity.min_avg_daily_volume = None
        policy.liquidity.min_open_interest = 1000

        assert instrument_mapper_module._liquidity_allowed(inst, policy) is False

    def test_open_interest_none_when_policy_requires(self, instrument_mapper_module):
        inst = MagicMock()
        inst.liquidity.liquidity_score = 0.9
        inst.liquidity.avg_daily_volume = 1_000_000
        inst.liquidity.open_interest = None

        policy = MagicMock()
        policy.liquidity.min_liquidity_score = 0.5
        policy.liquidity.min_avg_daily_volume = None
        policy.liquidity.min_open_interest = 1000

        assert instrument_mapper_module._liquidity_allowed(inst, policy) is False
