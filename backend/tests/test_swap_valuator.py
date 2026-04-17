"""Pure-function tests for IRS / XCCY swap valuation."""
from datetime import date


def test_par_swap_npv_is_zero():
    """A swap struck at the par rate has NPV = 0 at inception."""
    from app.engine_v1.swap_valuator import value_swap, SwapSpec
    from app.engine_v1.ir_curve_engine import bootstrap_curve, RateQuote

    curve = bootstrap_curve(
        [RateQuote(tenor="2Y", rate=0.05, instrument="OIS", index="SOFR")],
        as_of=date(2026, 1, 1),
    )
    spec = SwapSpec(
        notional=1_000_000.0, currency="USD",
        fixed_rate=0.05, float_index="SOFR",
        start_date=date(2026, 1, 1), maturity_date=date(2028, 1, 1),
        pay_fixed=True, day_count="ACT365",
        reset_frequency="ANNUAL",
        amortization_schedule=None, fx_basis_bps=0.0,
    )
    val = value_swap(spec, curve)
    assert abs(val.npv) < 1000.0  # par swap ≈ 0 NPV (within rounding)


def test_pay_fixed_dv01_is_negative():
    """Pay-fixed swap loses value when rates fall → DV01 is negative."""
    from app.engine_v1.swap_valuator import value_swap, SwapSpec
    from app.engine_v1.ir_curve_engine import bootstrap_curve, RateQuote

    curve = bootstrap_curve(
        [RateQuote(tenor="5Y", rate=0.05, instrument="OIS", index="SOFR")],
        as_of=date(2026, 1, 1),
    )
    spec = SwapSpec(
        notional=1_000_000.0, currency="USD",
        fixed_rate=0.05, float_index="SOFR",
        start_date=date(2026, 1, 1), maturity_date=date(2031, 1, 1),
        pay_fixed=True, day_count="ACT365",
        reset_frequency="ANNUAL",
        amortization_schedule=None, fx_basis_bps=0.0,
    )
    val = value_swap(spec, curve)
    assert val.dv01 < 0.0


def test_receive_fixed_dv01_is_positive():
    """Receive-fixed swap gains when rates fall → DV01 is positive."""
    from app.engine_v1.swap_valuator import value_swap, SwapSpec
    from app.engine_v1.ir_curve_engine import bootstrap_curve, RateQuote

    curve = bootstrap_curve(
        [RateQuote(tenor="5Y", rate=0.05, instrument="OIS", index="SOFR")],
        as_of=date(2026, 1, 1),
    )
    spec = SwapSpec(
        notional=1_000_000.0, currency="USD",
        fixed_rate=0.05, float_index="SOFR",
        start_date=date(2026, 1, 1), maturity_date=date(2031, 1, 1),
        pay_fixed=False, day_count="ACT365",
        reset_frequency="ANNUAL",
        amortization_schedule=None, fx_basis_bps=0.0,
    )
    val = value_swap(spec, curve)
    assert val.dv01 > 0.0


def test_valuation_fields_present():
    """SwapValuation returns all required fields."""
    from app.engine_v1.swap_valuator import value_swap, SwapSpec
    from app.engine_v1.ir_curve_engine import bootstrap_curve, RateQuote

    curve = bootstrap_curve(
        [RateQuote(tenor="3Y", rate=0.045, instrument="OIS", index="SOFR")],
        as_of=date(2026, 1, 1),
    )
    spec = SwapSpec(
        notional=500_000.0, currency="USD",
        fixed_rate=0.045, float_index="SOFR",
        start_date=date(2026, 1, 1), maturity_date=date(2029, 1, 1),
        pay_fixed=True, day_count="ACT365",
        reset_frequency="ANNUAL",
        amortization_schedule=None, fx_basis_bps=0.0,
    )
    val = value_swap(spec, curve)
    assert hasattr(val, "npv")
    assert hasattr(val, "dv01")
    assert hasattr(val, "pvbp")
    assert hasattr(val, "par_rate")
    assert hasattr(val, "fixed_leg_pv")
    assert hasattr(val, "floating_leg_pv")
