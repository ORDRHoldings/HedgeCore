"""
engine_v1/debt_cashflow_engine.py
Amortization schedules, interest accruals, and covenant ratio calculations.

Pure computation — no I/O, no state.
"""
from __future__ import annotations

import calendar
from dataclasses import dataclass
from datetime import date


@dataclass
class CovenantSpec:
    covenant_type: str  # DSCR | LTV | INTEREST_COVERAGE | NET_LEVERAGE | MIN_LIQUIDITY
    threshold: float
    current_value: float


@dataclass
class DebtFacilitySpec:
    principal: float
    margin_bps: int
    rate_index: str       # SOFR | EURIBOR | SONIA | FIXED
    index_rate: float     # current index fixing (0.0 for FIXED)
    day_count: str        # ACT360 | ACT365 | 30_360 | ACTACT
    repayment_type: str   # BULLET | AMORTIZING | BALLOON
    start_date: date
    maturity_date: date
    payment_frequency: str  # MONTHLY | QUARTERLY | SEMI | ANNUAL
    covenants: list[CovenantSpec]


@dataclass
class DebtSchedule:
    periods: list[dict]          # period_start, period_end, principal_payment, interest_payment, total_payment, outstanding_balance
    total_interest_expense: float
    weighted_avg_life: float
    covenant_results: list[dict]


_FREQ_MONTHS: dict[str, int] = {
    "MONTHLY": 1, "QUARTERLY": 3, "SEMI": 6, "ANNUAL": 12,
}


def _next_date(d: date, months: int) -> date:
    m = d.month + months
    y = d.year + (m - 1) // 12
    m = (m - 1) % 12 + 1
    day = min(d.day, calendar.monthrange(y, m)[1])
    return date(y, m, day)


def _year_frac(start: date, end: date, day_count: str) -> float:
    days = (end - start).days
    if day_count == "ACT360":
        return days / 360.0
    if day_count in ("ACT365", "ACTACT"):
        return days / 365.0
    if day_count == "30_360":
        d1 = min(start.day, 30)
        d2 = min(end.day, 30)
        return (360 * (end.year - start.year) + 30 * (end.month - start.month) + (d2 - d1)) / 360.0
    return days / 365.0


def compute_debt_schedule(spec: DebtFacilitySpec) -> DebtSchedule:
    """Compute full amortization schedule and covenant ratios."""
    rate = spec.index_rate + spec.margin_bps / 10_000.0
    months = _FREQ_MONTHS.get(spec.payment_frequency, 12)
    outstanding = spec.principal

    periods = []
    current = spec.start_date
    total_periods = 0

    while current < spec.maturity_date:
        next_d = min(_next_date(current, months), spec.maturity_date)
        tau = _year_frac(current, next_d, spec.day_count)
        interest = outstanding * rate * tau
        is_last = (next_d >= spec.maturity_date)

        if spec.repayment_type == "BULLET":
            principal_pmt = outstanding if is_last else 0.0
        elif spec.repayment_type == "AMORTIZING":
            n_remaining = max(1, round((spec.maturity_date - current).days / ((next_d - current).days or 1)))
            principal_pmt = outstanding / n_remaining
        else:  # BALLOON
            principal_pmt = outstanding * 0.1 if not is_last else outstanding

        principal_pmt = min(principal_pmt, outstanding)
        outstanding_after = outstanding - principal_pmt

        periods.append({
            "period_start": current,
            "period_end": next_d,
            "principal_payment": round(principal_pmt, 2),
            "interest_payment": round(interest, 2),
            "total_payment": round(principal_pmt + interest, 2),
            "outstanding_balance": round(outstanding_after, 2),
        })
        outstanding = outstanding_after
        current = next_d
        total_periods += 1

    total_interest = sum(p["interest_payment"] for p in periods)
    wal = sum(
        p["principal_payment"] * (p["period_end"] - spec.start_date).days / 365.0
        for p in periods
    ) / spec.principal if spec.principal > 0 else 0.0

    # Covenant results
    covenant_results = []
    for cov in spec.covenants:
        threshold = cov.threshold
        current_val = cov.current_value
        headroom = (current_val - threshold) / threshold * 100.0 if threshold else 0.0
        # For DSCR, ICR, INTEREST_COVERAGE, MIN_LIQUIDITY: current >= threshold = compliant
        # For LTV, NET_LEVERAGE: current <= threshold = compliant
        inverted = cov.covenant_type in ("LTV", "NET_LEVERAGE")
        if inverted:
            compliant = current_val <= threshold
            headroom = (threshold - current_val) / threshold * 100.0 if threshold else 0.0
        else:
            compliant = current_val >= threshold
        warning = (not compliant) and abs(headroom) < 15.0
        status = "COMPLIANT" if compliant else ("WARNING" if warning else "BREACH")
        covenant_results.append({
            "type": cov.covenant_type, "threshold": threshold,
            "current_value": current_val, "headroom_pct": round(headroom, 2),
            "status": status,
        })

    return DebtSchedule(
        periods=periods,
        total_interest_expense=round(total_interest, 2),
        weighted_avg_life=round(wal, 4),
        covenant_results=covenant_results,
    )
