"""Pure-function tests for swaption / cap / floor pricing."""
from datetime import date
import math


def _base_spec(model="BLACK76"):
    from app.engine_v1.swaption_engine import SwaptionSpec
    from app.engine_v1.swap_valuator import SwapSpec
    underlying = SwapSpec(
        notional=1_000_000.0, currency="USD",
        fixed_rate=0.05, float_index="SOFR",
        start_date=date(2027, 1, 1), maturity_date=date(2032, 1, 1),
        pay_fixed=True, day_count="ACT365",
        reset_frequency="ANNUAL",
        amortization_schedule=None, fx_basis_bps=0.0,
    )
    return SwaptionSpec(
        instrument_type="SWAPTION",
        notional=1_000_000.0,
        option_expiry=date(2027, 1, 1),
        underlying_swap=underlying,
        strike=0.05,
        vol=0.20,
        model=model,
    )


def test_black76_premium_positive():
    """Black-76 swaption premium must be strictly positive."""
    from app.engine_v1.swaption_engine import price_swaption
    from app.engine_v1.ir_curve_engine import bootstrap_curve, RateQuote
    curve = bootstrap_curve(
        [RateQuote(tenor="5Y", rate=0.05, instrument="OIS", index="SOFR")],
        as_of=date(2026, 1, 1),
    )
    val = price_swaption(_base_spec("BLACK76"), curve, as_of=date(2026, 1, 1))
    assert val.premium > 0.0


def test_bachelier_premium_positive():
    """Bachelier premium must be positive."""
    from app.engine_v1.swaption_engine import price_swaption
    from app.engine_v1.ir_curve_engine import bootstrap_curve, RateQuote
    curve = bootstrap_curve(
        [RateQuote(tenor="5Y", rate=0.005, instrument="OIS", index="EURIBOR")],
        as_of=date(2026, 1, 1),
    )
    spec = _base_spec("BACHELIER")
    val = price_swaption(spec, curve, as_of=date(2026, 1, 1))
    assert val.premium > 0.0


def test_model_auto_selects_bachelier_for_low_rates():
    """Auto-selection uses Bachelier when forward rate <= 0.5%."""
    from app.engine_v1.swaption_engine import price_swaption, SwaptionSpec
    from app.engine_v1.swap_valuator import SwapSpec
    from app.engine_v1.ir_curve_engine import bootstrap_curve, RateQuote
    curve = bootstrap_curve(
        [RateQuote(tenor="5Y", rate=0.003, instrument="OIS", index="EURIBOR")],
        as_of=date(2026, 1, 1),
    )
    underlying = SwapSpec(
        notional=1_000_000.0, currency="EUR",
        fixed_rate=0.003, float_index="EURIBOR",
        start_date=date(2027, 1, 1), maturity_date=date(2032, 1, 1),
        pay_fixed=True, day_count="ACT365",
        reset_frequency="ANNUAL",
        amortization_schedule=None, fx_basis_bps=0.0,
    )
    spec = SwaptionSpec(
        instrument_type="SWAPTION", notional=1_000_000.0,
        option_expiry=date(2027, 1, 1), underlying_swap=underlying,
        strike=0.003, vol=0.005, model="AUTO",
    )
    val = price_swaption(spec, curve, as_of=date(2026, 1, 1))
    assert val.model_used == "BACHELIER"


def test_zero_vol_premium_equals_intrinsic():
    """With zero vol, ATM swaption premium approaches zero (no time value)."""
    from app.engine_v1.swaption_engine import price_swaption
    from app.engine_v1.ir_curve_engine import bootstrap_curve, RateQuote
    curve = bootstrap_curve(
        [RateQuote(tenor="5Y", rate=0.05, instrument="OIS", index="SOFR")],
        as_of=date(2026, 1, 1),
    )
    spec = _base_spec("BLACK76")
    spec.vol = 1e-10  # essentially zero vol
    val = price_swaption(spec, curve, as_of=date(2026, 1, 1))
    assert val.premium < 100.0  # near-zero intrinsic for ATM
