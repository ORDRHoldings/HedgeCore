"""Tests for IFRS 9 IR hedge effectiveness engine."""


def test_dollar_offset_pass_at_80_percent():
    from app.engine_v1.ir_hedge_effectiveness import test_ir_effectiveness
    result = test_ir_effectiveness(
        hedged_item_fv_changes=[-100.0, -200.0],
        instrument_fv_changes=[100.0, 200.0],
        method="DOLLAR_OFFSET",
    )
    assert result.passed is True
    assert abs(result.ratio - 1.0) < 0.01


def test_dollar_offset_fail_below_80():
    from app.engine_v1.ir_hedge_effectiveness import test_ir_effectiveness
    result = test_ir_effectiveness(
        hedged_item_fv_changes=[-100.0],
        instrument_fv_changes=[50.0],
        method="DOLLAR_OFFSET",
    )
    assert result.passed is False
    assert result.ratio < 0.80


def test_dollar_offset_fail_above_125():
    from app.engine_v1.ir_hedge_effectiveness import test_ir_effectiveness
    result = test_ir_effectiveness(
        hedged_item_fv_changes=[-100.0],
        instrument_fv_changes=[150.0],
        method="DOLLAR_OFFSET",
    )
    assert result.passed is False
    assert result.ratio > 1.25


def test_dollar_offset_pass_at_125_boundary():
    from app.engine_v1.ir_hedge_effectiveness import test_ir_effectiveness
    result = test_ir_effectiveness(
        hedged_item_fv_changes=[-100.0],
        instrument_fv_changes=[125.0],
        method="DOLLAR_OFFSET",
    )
    assert result.passed is True


def test_result_has_evidence_bundle():
    from app.engine_v1.ir_hedge_effectiveness import test_ir_effectiveness
    result = test_ir_effectiveness(
        hedged_item_fv_changes=[-100.0, -50.0],
        instrument_fv_changes=[95.0, 48.0],
        method="DOLLAR_OFFSET",
    )
    assert "hedged_item_fv_changes" in result.evidence_bundle
    assert "instrument_fv_changes" in result.evidence_bundle
    assert "ratio" in result.evidence_bundle


def test_regression_pass_high_r_squared():
    """Regression method passes when R² >= 0.80 and slope in [-1.25, -0.80]."""
    from app.engine_v1.ir_hedge_effectiveness import test_ir_effectiveness
    hedged = [-100.0, -200.0, -150.0, -50.0, -300.0]
    instrument = [100.0, 200.0, 150.0, 50.0, 300.0]
    result = test_ir_effectiveness(hedged, instrument, method="REGRESSION")
    assert result.passed is True
    assert result.ratio >= 0.80


def test_regression_fail_low_r_squared():
    """Regression method fails when R² < 0.80 (noisy hedge)."""
    from app.engine_v1.ir_hedge_effectiveness import test_ir_effectiveness
    hedged = [-100.0, -100.0, -100.0]
    instrument = [50.0, 200.0, 10.0]
    result = test_ir_effectiveness(hedged, instrument, method="REGRESSION")
    assert result.passed is False
