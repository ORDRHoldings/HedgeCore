"""Tests for app.engine_v1.capital_adequacy."""

import math

import pytest

from app.engine_v1.capital_adequacy import (
    CapitalAdequacyResult,
    assess_capital_adequacy,
)


class TestCapitalAdequacyResult:
    def test_to_dict(self):
        r = CapitalAdequacyResult(
            portfolio_equity=10_000_000,
            margin_required=1_000_000,
            available_capital=9_000_000,
            stress_loss=3_000_000,
            capital_buffer_ratio=3.0,
            min_required_ratio=1.5,
            breach_flag=False,
            headroom_usd=4_500_000,
        )
        d = r.to_dict()
        assert d["portfolio_equity"] == 10_000_000
        assert d["margin_required"] == 1_000_000
        assert d["available_capital"] == 9_000_000
        assert d["stress_loss"] == 3_000_000
        assert d["capital_buffer_ratio"] == 3.0
        assert d["min_required_ratio"] == 1.5
        assert d["breach_flag"] is False
        assert d["headroom_usd"] == 4_500_000


class TestAssessCapitalAdequacy:
    def test_no_breach(self):
        result = assess_capital_adequacy(
            portfolio_equity=10_000_000,
            margin_required=1_000_000,
            worst_case_loss=2_000_000,
            policy={"min_capital_ratio": 1.5},
        )
        assert result.available_capital == 9_000_000
        assert result.stress_loss == 2_000_000
        assert result.capital_buffer_ratio == pytest.approx(4.5)
        assert result.breach_flag is False
        assert result.headroom_usd == pytest.approx(9_000_000 - 2_000_000 * 1.5)

    def test_breach(self):
        result = assess_capital_adequacy(
            portfolio_equity=2_000_000,
            margin_required=1_000_000,
            worst_case_loss=1_000_000,
            policy={"min_capital_ratio": 1.5},
        )
        # available = 1M, buffer_ratio = 1M/1M = 1.0 < 1.5
        assert result.breach_flag is True
        assert result.capital_buffer_ratio == pytest.approx(1.0)

    def test_default_min_ratio(self):
        result = assess_capital_adequacy(
            portfolio_equity=10_000_000,
            margin_required=0,
            worst_case_loss=1_000_000,
            policy={},  # No min_capital_ratio -> default 1.5
        )
        assert result.min_required_ratio == 1.5

    def test_zero_worst_case_loss(self):
        result = assess_capital_adequacy(
            portfolio_equity=10_000_000,
            margin_required=1_000_000,
            worst_case_loss=0,
            policy={},
        )
        # worst_case_loss=0 -> stress_loss=1.0 (guard)
        assert result.stress_loss == 1.0
        assert result.capital_buffer_ratio == pytest.approx(9_000_000 / 1.0)
        assert result.breach_flag is False

    def test_negative_worst_case_loss_uses_abs(self):
        result = assess_capital_adequacy(
            portfolio_equity=10_000_000,
            margin_required=1_000_000,
            worst_case_loss=-3_000_000,
            policy={},
        )
        assert result.stress_loss == 3_000_000

    def test_headroom_calculation(self):
        result = assess_capital_adequacy(
            portfolio_equity=5_000_000,
            margin_required=500_000,
            worst_case_loss=2_000_000,
            policy={"min_capital_ratio": 2.0},
        )
        expected_headroom = 4_500_000 - (2_000_000 * 2.0)
        assert result.headroom_usd == pytest.approx(expected_headroom)

    def test_negative_headroom(self):
        result = assess_capital_adequacy(
            portfolio_equity=2_000_000,
            margin_required=500_000,
            worst_case_loss=2_000_000,
            policy={"min_capital_ratio": 2.0},
        )
        # available = 1.5M, headroom = 1.5M - 2M*2 = -2.5M
        assert result.headroom_usd < 0
        assert result.breach_flag is True

    def test_zero_margin(self):
        result = assess_capital_adequacy(
            portfolio_equity=10_000_000,
            margin_required=0,
            worst_case_loss=5_000_000,
            policy={},
        )
        assert result.available_capital == 10_000_000

    def test_margin_exceeds_equity(self):
        result = assess_capital_adequacy(
            portfolio_equity=1_000_000,
            margin_required=2_000_000,
            worst_case_loss=500_000,
            policy={},
        )
        assert result.available_capital == -1_000_000
        assert result.capital_buffer_ratio < 0
        assert result.breach_flag is True

    def test_exact_threshold(self):
        # buffer_ratio == min_ratio -> NOT a breach (< is strict)
        result = assess_capital_adequacy(
            portfolio_equity=3_000_000,
            margin_required=0,
            worst_case_loss=2_000_000,
            policy={"min_capital_ratio": 1.5},
        )
        # buffer = 3M/2M = 1.5 == min_ratio -> not < -> no breach
        assert result.breach_flag is False

    def test_just_below_threshold(self):
        result = assess_capital_adequacy(
            portfolio_equity=2_999_999,
            margin_required=0,
            worst_case_loss=2_000_000,
            policy={"min_capital_ratio": 1.5},
        )
        assert result.breach_flag is True

    def test_very_large_numbers(self):
        result = assess_capital_adequacy(
            portfolio_equity=1e12,
            margin_required=1e9,
            worst_case_loss=1e10,
            policy={"min_capital_ratio": 1.5},
        )
        assert result.breach_flag is False
        assert result.capital_buffer_ratio > 1.5

    def test_to_dict_complete(self):
        result = assess_capital_adequacy(
            portfolio_equity=10_000_000,
            margin_required=1_000_000,
            worst_case_loss=2_000_000,
            policy={},
        )
        d = result.to_dict()
        required_keys = [
            "portfolio_equity", "margin_required", "available_capital",
            "stress_loss", "capital_buffer_ratio", "min_required_ratio",
            "breach_flag", "headroom_usd",
        ]
        for key in required_keys:
            assert key in d
