"""
engine_v1/swap_valuator.py
Value interest rate swaps (IRS) and cross-currency swaps (XCCY).

Pure computation — no I/O, no state.
"""
from __future__ import annotations

import calendar
from dataclasses import dataclass
from datetime import date

from app.engine_v1.ir_curve_engine import IRCurve


@dataclass
class SwapSpec:
    notional: float
    currency: str
    fixed_rate: float
    float_index: str        # "SOFR" | "EURIBOR" | "SONIA"
    start_date: date
    maturity_date: date
    pay_fixed: bool
    day_count: str          # "ACT360" | "ACT365" | "30_360" | "ACTACT"
    reset_frequency: str    # "MONTHLY" | "QUARTERLY" | "SEMI" | "ANNUAL"
    amortization_schedule: list[tuple[date, float]] | None
    fx_basis_bps: float     # 0.0 for plain IRS; basis spread for XCCY


@dataclass
class SwapValuation:
    npv: float
    dv01: float
    pvbp: float
    accrued_interest: float
    par_rate: float
    fixed_leg_pv: float
    floating_leg_pv: float

    def to_dict(self) -> dict:
        return {
            "npv": self.npv, "dv01": self.dv01, "pvbp": self.pvbp,
            "accrued_interest": self.accrued_interest, "par_rate": self.par_rate,
            "fixed_leg_pv": self.fixed_leg_pv, "floating_leg_pv": self.floating_leg_pv,
        }


_FREQ_PERIODS: dict[str, int] = {
    "MONTHLY": 12, "QUARTERLY": 4, "SEMI": 2, "ANNUAL": 1,
}


def _year_fraction(start: date, end: date, day_count: str) -> float:
    days = (end - start).days
    if day_count in ("ACT360",):
        return days / 360.0
    if day_count in ("ACT365",):
        return days / 365.0
    if day_count == "ACTACT":
        raise NotImplementedError("ACTACT requires leap-year aware calculation; use ACT365 or ACT360")
    if day_count == "30_360":
        d1, d2 = min(start.day, 30), min(end.day, 30)
        return (360 * (end.year - start.year) + 30 * (end.month - start.month) + (d2 - d1)) / 360.0
    return days / 365.0


def _payment_schedule(spec: SwapSpec) -> list[tuple[date, date, float]]:
    """Return list of (period_start, period_end, notional) tuples."""
    freq = _FREQ_PERIODS.get(spec.reset_frequency, 1)
    months_per_period = 12 // freq
    periods = []
    current = spec.start_date
    notional = spec.notional

    while current < spec.maturity_date:
        m = current.month + months_per_period
        y = current.year + (m - 1) // 12
        m = (m - 1) % 12 + 1
        day = min(current.day, calendar.monthrange(y, m)[1])
        next_date = min(date(y, m, day), spec.maturity_date)

        if spec.amortization_schedule:
            for amort_date, remaining in spec.amortization_schedule:
                if amort_date < next_date:
                    notional = remaining
        periods.append((current, next_date, notional))
        current = next_date

    return periods


def value_swap(spec: SwapSpec, curve: IRCurve) -> SwapValuation:
    """Value an IRS or XCCY swap using the provided discount curve."""
    basis_adj = spec.fx_basis_bps / 10_000.0
    periods = _payment_schedule(spec)

    fixed_leg_pv = 0.0
    floating_leg_pv = 0.0
    annuity = 0.0

    for p_start, p_end, notional in periods:
        t_start = (p_start - spec.start_date).days / 365.0
        t_end = (p_end - spec.start_date).days / 365.0
        tau = _year_fraction(p_start, p_end, spec.day_count)

        df_start = curve.discount_factor(t_start)
        df_end = curve.discount_factor(t_end)

        fixed_coupon = notional * spec.fixed_rate * tau
        fixed_leg_pv += fixed_coupon * df_end

        fwd_rate = (df_start / df_end - 1.0) / tau if tau > 0 else 0.0
        float_coupon = notional * (fwd_rate + basis_adj) * tau
        floating_leg_pv += float_coupon * df_end

        annuity += notional * tau * df_end

    npv_pay_fixed = floating_leg_pv - fixed_leg_pv
    npv = npv_pay_fixed if spec.pay_fixed else -npv_pay_fixed

    par_rate = floating_leg_pv / annuity if annuity > 0 else spec.fixed_rate

    # DV01: fixed-leg sensitivity to +1bp shift in fixed coupon rate (not a parallel curve shift)
    shifted_fixed = spec.fixed_rate + 0.0001
    bump_fixed_pv = sum(
        notional * shifted_fixed * _year_fraction(ps, pe, spec.day_count) * curve.discount_factor((pe - spec.start_date).days / 365.0)
        for ps, pe, notional in periods
    )
    dv01_raw = bump_fixed_pv - fixed_leg_pv
    dv01 = -dv01_raw if spec.pay_fixed else dv01_raw
    pvbp = abs(dv01)

    return SwapValuation(
        npv=npv, dv01=dv01, pvbp=pvbp,
        accrued_interest=0.0,
        par_rate=par_rate,
        fixed_leg_pv=fixed_leg_pv,
        floating_leg_pv=floating_leg_pv,
    )
