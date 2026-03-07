"""
tests/test_hedge_effectiveness_engine.py

Tests for app.engine.hedge_effectiveness_engine — IFRS 9 / ASC 815 effectiveness assessment.

Covers:
  - Data types (EffectivenessPeriod, EffectivenessConfig, TraceEvent, PeriodAnalysis)
  - _sha256_dict helper
  - run_effectiveness_assessment — dollar-offset, regression, combined
  - Edge cases (empty data, insufficient data, zero changes)
"""
from __future__ import annotations

import pytest

from app.engine.hedge_effectiveness_engine import (
    METHODOLOGY_VERSION,
    EffectivenessPeriod,
    EffectivenessConfig,
    TraceEvent,
    PeriodAnalysis,
    EffectivenessRunResult,
    _sha256_dict,
    run_hedge_effectiveness,
)


# ---------------------------------------------------------------------------
# Data type tests
# ---------------------------------------------------------------------------

class TestEffectivenessPeriod:
    def test_creation(self):
        p = EffectivenessPeriod(period_index=0, period_date="2026-01", hedged_item_fv_change=-100.0, instrument_fv_change=95.0)
        assert p.period_index == 0
        assert p.hedged_item_fv_change == -100.0

    def test_to_dict(self):
        p = EffectivenessPeriod(period_index=1, period_date="2026-02", hedged_item_fv_change=-200.0, instrument_fv_change=190.0)
        d = p.to_dict()
        assert d["period_index"] == 1
        assert d["period_date"] == "2026-02"

    def test_frozen(self):
        p = EffectivenessPeriod(period_index=0, period_date=None, hedged_item_fv_change=0.0, instrument_fv_change=0.0)
        with pytest.raises(AttributeError):
            p.period_index = 1


class TestEffectivenessConfig:
    def test_defaults(self):
        c = EffectivenessConfig()
        assert c.standard == "ASC_815"
        assert c.method == "both"
        assert c.hedge_type == "cash_flow"

    def test_to_dict(self):
        c = EffectivenessConfig(standard="IFRS_9", currency_pair="EURUSD")
        d = c.to_dict()
        assert d["standard"] == "IFRS_9"
        assert d["currency_pair"] == "EURUSD"


class TestTraceEvent:
    def test_creation(self):
        t = TraceEvent(step="validation", description="Input validated", data={"count": 10})
        assert t.step == "validation"
        assert t.timestamp  # auto-populated

    def test_to_dict(self):
        t = TraceEvent(step="calc", description="Calculation", data={})
        d = t.to_dict()
        assert "step" in d
        assert "timestamp" in d


class TestPeriodAnalysis:
    def test_to_dict(self):
        pa = PeriodAnalysis(
            period_index=0, period_date="2026-01",
            hedged_item_fv_change=-100.0, instrument_fv_change=95.0,
            cumulative_hedged=-100.0, cumulative_instrument=95.0,
            period_ratio=-0.95, cumulative_ratio=-0.95,
        )
        d = pa.to_dict()
        assert d["period_index"] == 0
        assert d["cumulative_ratio"] == -0.95


# ---------------------------------------------------------------------------
# SHA-256 helper
# ---------------------------------------------------------------------------

class TestSha256Dict:
    def test_returns_hex_string(self):
        h = _sha256_dict({"a": 1})
        assert isinstance(h, str)
        assert len(h) == 64

    def test_deterministic(self):
        a = _sha256_dict({"x": 1, "y": 2})
        b = _sha256_dict({"y": 2, "x": 1})
        assert a == b

    def test_different_values(self):
        a = _sha256_dict({"x": 1})
        b = _sha256_dict({"x": 2})
        assert a != b


# ---------------------------------------------------------------------------
# Helpers — generate test data
# ---------------------------------------------------------------------------

def _make_periods(n: int, ratio: float = 0.95) -> list[EffectivenessPeriod]:
    """Generate n periods where instrument offset = -ratio * hedged change."""
    periods = []
    for i in range(n):
        hedged = -(i + 1) * 100.0  # Increasingly negative
        instrument = (i + 1) * 100.0 * ratio  # Positive offset
        periods.append(EffectivenessPeriod(
            period_index=i,
            period_date=f"2026-{(i % 12) + 1:02d}",
            hedged_item_fv_change=hedged,
            instrument_fv_change=instrument,
        ))
    return periods


# ---------------------------------------------------------------------------
# run_effectiveness_assessment
# ---------------------------------------------------------------------------

class TestRunEffectivenessAssessment:
    def test_dollar_offset_only(self):
        periods = _make_periods(10, ratio=0.95)
        result = run_hedge_effectiveness("test-ds-001",
            periods=periods,
            config=EffectivenessConfig(method="dollar_offset"),
        )
        assert isinstance(result, EffectivenessRunResult)
        assert result.methodology_version == METHODOLOGY_VERSION
        assert result.dollar_offset is not None
        assert result.regression is None

    def test_regression_only_sufficient_data(self):
        periods = _make_periods(35, ratio=0.95)
        result = run_hedge_effectiveness("test-ds-001",
            periods=periods,
            config=EffectivenessConfig(method="regression"),
        )
        assert result.regression is not None

    def test_regression_insufficient_data(self):
        periods = _make_periods(5, ratio=0.95)
        result = run_hedge_effectiveness("test-ds-001",
            periods=periods,
            config=EffectivenessConfig(method="regression"),
        )
        # Should still produce a result (may be ineffective due to insufficient data)
        assert isinstance(result, EffectivenessRunResult)

    def test_both_methods(self):
        periods = _make_periods(35, ratio=0.95)
        result = run_hedge_effectiveness("test-ds-001",
            periods=periods,
            config=EffectivenessConfig(method="both"),
        )
        assert result.dollar_offset is not None
        assert result.regression is not None

    def test_effective_hedge(self):
        # Ratio 0.95 → good offset
        periods = _make_periods(10, ratio=0.95)
        result = run_hedge_effectiveness("test-ds-001",
            periods=periods,
            config=EffectivenessConfig(method="dollar_offset"),
        )
        # The dollar offset for ratio ~0.95 should be effective (within 0.80-1.25)
        assert result.overall_effective is True

    def test_ineffective_hedge(self):
        # Ratio 0.3 → very poor offset
        periods = _make_periods(10, ratio=0.30)
        result = run_hedge_effectiveness("test-ds-001",
            periods=periods,
            config=EffectivenessConfig(method="dollar_offset"),
        )
        assert result.overall_effective is False

    def test_result_has_hashes(self):
        periods = _make_periods(10, ratio=0.95)
        result = run_hedge_effectiveness("test-ds-001",
            periods=periods,
            config=EffectivenessConfig(method="dollar_offset"),
        )
        d = result.to_dict()
        assert "inputs_hash" in d
        assert "outputs_hash" in d
        assert "run_hash" in d

    def test_deterministic_hashes(self):
        periods = _make_periods(10, ratio=0.95)
        config = EffectivenessConfig(method="dollar_offset")
        a = run_hedge_effectiveness("test-ds-001",periods=periods, config=config)
        b = run_hedge_effectiveness("test-ds-001",periods=periods, config=config)
        assert a.to_dict()["inputs_hash"] == b.to_dict()["inputs_hash"]
        assert a.to_dict()["outputs_hash"] == b.to_dict()["outputs_hash"]

    def test_empty_periods_raises(self):
        with pytest.raises(ValueError, match="At least 2"):
            run_hedge_effectiveness("test-ds-001",
                periods=[],
                config=EffectivenessConfig(method="dollar_offset"),
            )

    def test_single_period_raises(self):
        periods = [EffectivenessPeriod(0, "2026-01", -100.0, 95.0)]
        with pytest.raises(ValueError, match="At least 2"):
            run_hedge_effectiveness("test-ds-001",
                periods=periods,
                config=EffectivenessConfig(method="dollar_offset"),
            )

    def test_two_periods_minimum(self):
        periods = [
            EffectivenessPeriod(0, "2026-01", -100.0, 95.0),
            EffectivenessPeriod(1, "2026-02", -200.0, 190.0),
        ]
        result = run_hedge_effectiveness("test-ds-001",
            periods=periods,
            config=EffectivenessConfig(method="dollar_offset"),
        )
        assert result.period_count == 2

    def test_zero_hedged_change(self):
        periods = [
            EffectivenessPeriod(0, "2026-01", 0.0, 50.0),
            EffectivenessPeriod(1, "2026-02", -100.0, 95.0),
        ]
        result = run_hedge_effectiveness("test-ds-001",
            periods=periods,
            config=EffectivenessConfig(method="dollar_offset"),
        )
        assert isinstance(result, EffectivenessRunResult)

    def test_config_passthrough(self):
        periods = _make_periods(10, ratio=0.95)
        result = run_hedge_effectiveness("test-ds-001",
            periods=periods,
            config=EffectivenessConfig(standard="IFRS_9", hedge_type="fair_value", currency_pair="USDMXN"),
        )
        assert result.standard == "IFRS_9"
        assert result.hedge_type == "fair_value"
        assert result.currency_pair == "USDMXN"


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

class TestConstants:
    def test_methodology_version(self):
        assert METHODOLOGY_VERSION == "1.0.0"
