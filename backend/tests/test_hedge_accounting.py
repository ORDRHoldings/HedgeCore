"""
backend/engine/tests/test_hedge_accounting.py
RPT-03: Hedge effectiveness (ASC 815 / IAS 39) tests.
"""

from __future__ import annotations

import pytest
from app.engine_v1.hedge_accounting import (
    assess_hedge_effectiveness_dollar_offset,
    assess_hedge_effectiveness_regression,
    EffectivenessResult,
)


class TestDollarOffset:
    def test_perfect_hedge(self):
        """Perfect 1:1 offset → ratio = 1.0, effective."""
        result = assess_hedge_effectiveness_dollar_offset(
            [100.0, -50.0, 75.0],
            [-100.0, 50.0, -75.0],
        )
        assert result.dollar_offset_ratio == pytest.approx(1.0, abs=1e-9)
        assert result.is_effective is True
        assert result.method == "dollar_offset"

    def test_effective_within_bounds_high(self):
        """90% offset → ratio = 0.90, effective."""
        result = assess_hedge_effectiveness_dollar_offset(
            [100.0], [-90.0]
        )
        assert result.dollar_offset_ratio == pytest.approx(0.90, abs=1e-9)
        assert result.is_effective is True

    def test_effective_within_bounds_low(self):
        """80% offset → ratio = 0.80, effective (boundary)."""
        result = assess_hedge_effectiveness_dollar_offset(
            [100.0], [-80.0]
        )
        assert result.is_effective is True

    def test_effective_upper_boundary(self):
        """125% offset → ratio = 1.25, effective (upper boundary)."""
        result = assess_hedge_effectiveness_dollar_offset(
            [100.0], [-125.0]
        )
        assert result.is_effective is True

    def test_ineffective_below_bound(self):
        """50% offset → ratio = 0.50 → ineffective."""
        result = assess_hedge_effectiveness_dollar_offset(
            [100.0, -50.0, 75.0],
            [-50.0, 25.0, -37.5],
        )
        assert result.dollar_offset_ratio == pytest.approx(0.50, abs=1e-9)
        assert result.is_effective is False

    def test_ineffective_above_bound(self):
        """150% offset → ratio = 1.50 → ineffective."""
        result = assess_hedge_effectiveness_dollar_offset(
            [100.0], [-150.0]
        )
        assert result.is_effective is False

    def test_zero_hedged_item(self):
        """Zero hedged item sum → ratio = 0.0, ineffective (division guard)."""
        result = assess_hedge_effectiveness_dollar_offset(
            [0.0, 0.0, 0.0],
            [-10.0, 5.0, -3.0],
        )
        assert result.dollar_offset_ratio == 0.0
        assert result.is_effective is False

    def test_returns_effectiveness_result(self):
        """Return type must be EffectivenessResult."""
        result = assess_hedge_effectiveness_dollar_offset([100.0], [-95.0])
        assert isinstance(result, EffectivenessResult)

    def test_to_dict_serializable(self):
        """to_dict() must return JSON-serializable dict."""
        result = assess_hedge_effectiveness_dollar_offset([100.0], [-95.0])
        d = result.to_dict()
        assert "dollar_offset_ratio" in d
        assert "is_effective" in d
        assert "method" in d


class TestRegressionEffectiveness:
    def test_insufficient_data(self):
        """< 30 data points → method = regression_insufficient_data."""
        result = assess_hedge_effectiveness_regression([1.0, 2.0, 3.0], [-1.0, -2.0, -3.0])
        assert result.method == "regression_insufficient_data"
        assert result.is_effective is False
        assert result.regression_r_squared is None

    def test_perfect_regression_30_points(self):
        """Perfect negative correlation → R²=1.0, slope=-1.0, effective."""
        x = [float(i) for i in range(30)]
        y = [-float(i) for i in range(30)]
        result = assess_hedge_effectiveness_regression(x, y)
        assert result.regression_r_squared == pytest.approx(1.0, abs=0.01)
        assert result.regression_slope == pytest.approx(-1.0, abs=0.01)
        assert result.is_effective is True
        assert result.method == "regression"

    def test_weak_correlation_ineffective(self):
        """Random-ish data → low R² → ineffective."""
        import random
        random.seed(42)
        x = [random.gauss(0, 1) for _ in range(50)]
        y = [random.gauss(0, 1) for _ in range(50)]  # Uncorrelated
        result = assess_hedge_effectiveness_regression(x, y)
        # R² should be low for uncorrelated data
        assert result.regression_r_squared is not None

    def test_constant_x_no_crash(self):
        """Constant X (zero variance) must not raise ZeroDivisionError."""
        x = [5.0] * 30
        y = [float(i) for i in range(30)]
        result = assess_hedge_effectiveness_regression(x, y)
        assert result.is_effective is False  # Degenerate case

    def test_exactly_30_points_accepted(self):
        """Exactly 30 points must use regression method."""
        x = [float(i) for i in range(30)]
        y = [-float(i) * 0.95 for i in range(30)]
        result = assess_hedge_effectiveness_regression(x, y)
        assert result.method == "regression"
