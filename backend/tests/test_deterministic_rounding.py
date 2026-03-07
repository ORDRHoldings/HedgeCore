"""Tests for engine_v1/deterministic_rounding.py — Audit-critical rounding layer."""

import pytest

from app.engine_v1.deterministic_rounding import (
    round_value,
    round_dict,
    round_list,
    round_freeze_artifact,
    _classify_field,
    DEFAULT_PRECISION,
)


class TestFieldClassification:
    def test_ratio_fields(self):
        assert _classify_field("hedge_ratio") == "ratio"
        assert _classify_field("concentration_pct") == "ratio"
        assert _classify_field("hedge_effectiveness") == "ratio"
        assert _classify_field("custom_ratio") == "ratio"
        assert _classify_field("custom_pct") == "ratio"

    def test_currency_fields(self):
        assert _classify_field("amount_usd") == "currency"
        assert _classify_field("action_mxn") == "currency"
        assert _classify_field("notional_usd") == "currency"
        assert _classify_field("total_cost") == "currency"
        assert _classify_field("custom_usd") == "currency"

    def test_fx_fields(self):
        assert _classify_field("spot_rate") == "fx_rate"
        assert _classify_field("fx_rate") == "fx_rate"
        assert _classify_field("forward_points") == "fx_rate"

    def test_unknown_defaults_to_ratio(self):
        assert _classify_field("some_random_field") == "ratio"


class TestRoundValue:
    def test_ratio_6_decimals(self):
        assert round_value(0.123456789, "hedge_ratio") == pytest.approx(0.123457)

    def test_currency_2_decimals(self):
        assert round_value(1234.5678, "amount_usd") == pytest.approx(1234.57)

    def test_fx_rate_8_decimals(self):
        assert round_value(17.123456789012, "spot_rate") == pytest.approx(17.12345679)

    def test_custom_precision(self):
        custom = {"ratio": 4, "currency": 0, "fx_rate": 4}
        assert round_value(0.123456, "hedge_ratio", custom) == pytest.approx(0.1235)
        assert round_value(1234.56, "amount_usd", custom) == pytest.approx(1235.0)

    def test_zero_unchanged(self):
        assert round_value(0.0, "amount_usd") == 0.0

    def test_negative_values(self):
        assert round_value(-1234.5678, "amount_usd") == pytest.approx(-1234.57)


class TestRoundDict:
    def test_flat_dict(self):
        data = {"hedge_ratio": 0.123456789, "amount_usd": 1234.5678, "spot_rate": 17.123456789012}
        result = round_dict(data)
        assert result["hedge_ratio"] == pytest.approx(0.123457)
        assert result["amount_usd"] == pytest.approx(1234.57)
        assert result["spot_rate"] == pytest.approx(17.12345679)

    def test_nested_dict(self):
        data = {"outer": {"amount_usd": 1234.5678}}
        result = round_dict(data)
        assert result["outer"]["amount_usd"] == pytest.approx(1234.57)

    def test_non_float_preserved(self):
        data = {"name": "test", "count": 42, "active": True, "amount_usd": 1.234}
        result = round_dict(data)
        assert result["name"] == "test"
        assert result["count"] == 42
        assert result["active"] is True

    def test_list_in_dict(self):
        data = {"items": [{"amount_usd": 1.2345}, {"amount_usd": 6.7891}]}
        result = round_dict(data)
        assert result["items"][0]["amount_usd"] == pytest.approx(1.23)
        assert result["items"][1]["amount_usd"] == pytest.approx(6.79)


class TestRoundList:
    def test_list_of_floats(self):
        data = [1.23456, 2.34567, 3.45678]
        result = round_list(data, "amount_usd")
        assert result == [pytest.approx(1.23), pytest.approx(2.35), pytest.approx(3.46)]

    def test_list_of_dicts(self):
        data = [{"hedge_ratio": 0.1234567}]
        result = round_list(data)
        assert result[0]["hedge_ratio"] == pytest.approx(0.123457)

    def test_nested_list(self):
        data = [[1.234567]]
        result = round_list(data, "amount_usd")
        assert result[0][0] == pytest.approx(1.23)

    def test_mixed_types(self):
        data = [1.234, "text", 42, {"amount_usd": 5.678}]
        result = round_list(data, "amount_usd")
        assert result[0] == pytest.approx(1.23)
        assert result[1] == "text"
        assert result[2] == 42
        assert result[3]["amount_usd"] == pytest.approx(5.68)


class TestRoundFreezeArtifact:
    def test_complete_artifact(self):
        artifact = {
            "hedge_plan": {
                "buckets": [
                    {
                        "hedge_ratio": 0.854321654,
                        "amount_usd": 29123.456789,
                        "spot_rate": 17.12345678901234,
                        "action_mxn": -500123.987654,
                    }
                ],
                "total_exposure_usd": 100000.123456,
            },
            "run_id": "abc-123",
            "timestamp": "2026-01-01T00:00:00Z",
        }
        result = round_freeze_artifact(artifact)
        bucket = result["hedge_plan"]["buckets"][0]
        assert bucket["hedge_ratio"] == pytest.approx(0.854322)  # 6 dp
        assert bucket["amount_usd"] == pytest.approx(29123.46)   # 2 dp
        assert bucket["spot_rate"] == pytest.approx(17.12345679)  # 8 dp
        assert bucket["action_mxn"] == pytest.approx(-500123.99)  # 2 dp
        assert result["run_id"] == "abc-123"  # non-float preserved

    def test_idempotent(self):
        """Rounding twice should produce the same result."""
        artifact = {"hedge_ratio": 0.123456789, "amount_usd": 1234.5678}
        r1 = round_freeze_artifact(artifact)
        r2 = round_freeze_artifact(r1)
        assert r1 == r2

    def test_empty_artifact(self):
        assert round_freeze_artifact({}) == {}
