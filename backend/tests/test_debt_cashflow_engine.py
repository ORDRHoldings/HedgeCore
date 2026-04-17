"""Pure-function tests for the debt cashflow + covenant engine."""
from datetime import date


def test_bullet_loan_cashflows_sum_to_principal():
    """All principal payments in a bullet loan sum to the original principal."""
    from app.engine_v1.debt_cashflow_engine import compute_debt_schedule, DebtFacilitySpec
    spec = DebtFacilitySpec(
        principal=1_000_000.0, margin_bps=150,
        rate_index="SOFR", index_rate=0.05,
        day_count="ACT365", repayment_type="BULLET",
        start_date=date(2026, 1, 1), maturity_date=date(2028, 1, 1),
        payment_frequency="ANNUAL", covenants=[],
    )
    schedule = compute_debt_schedule(spec)
    total_principal = sum(p["principal_payment"] for p in schedule.periods)
    assert abs(total_principal - 1_000_000.0) < 1.0


def test_amortizing_outstanding_decreases_each_period():
    """Outstanding balance decreases monotonically for amortizing loan."""
    from app.engine_v1.debt_cashflow_engine import compute_debt_schedule, DebtFacilitySpec
    spec = DebtFacilitySpec(
        principal=600_000.0, margin_bps=200,
        rate_index="FIXED", index_rate=0.0,
        day_count="ACT365", repayment_type="AMORTIZING",
        start_date=date(2026, 1, 1), maturity_date=date(2029, 1, 1),
        payment_frequency="ANNUAL", covenants=[],
    )
    schedule = compute_debt_schedule(spec)
    outstandings = [p["outstanding_balance"] for p in schedule.periods]
    for i in range(len(outstandings) - 1):
        assert outstandings[i] >= outstandings[i + 1]


def test_act360_vs_act365_interest_difference():
    """ACT/360 produces higher interest than ACT/365 for same rate."""
    from app.engine_v1.debt_cashflow_engine import compute_debt_schedule, DebtFacilitySpec
    base = dict(
        principal=1_000_000.0, margin_bps=0,
        rate_index="FIXED", index_rate=0.05,
        repayment_type="BULLET",
        start_date=date(2026, 1, 1), maturity_date=date(2027, 1, 1),
        payment_frequency="ANNUAL", covenants=[],
    )
    s360 = compute_debt_schedule(DebtFacilitySpec(**{**base, "day_count": "ACT360"}))
    s365 = compute_debt_schedule(DebtFacilitySpec(**{**base, "day_count": "ACT365"}))
    interest_360 = sum(p["interest_payment"] for p in s360.periods)
    interest_365 = sum(p["interest_payment"] for p in s365.periods)
    assert interest_360 > interest_365


def test_dscr_covenant_breach_detected():
    """A DSCR below threshold is flagged as BREACH."""
    from app.engine_v1.debt_cashflow_engine import compute_debt_schedule, DebtFacilitySpec, CovenantSpec
    spec = DebtFacilitySpec(
        principal=1_000_000.0, margin_bps=200,
        rate_index="FIXED", index_rate=0.0,
        day_count="ACT365", repayment_type="BULLET",
        start_date=date(2026, 1, 1), maturity_date=date(2027, 1, 1),
        payment_frequency="ANNUAL",
        covenants=[CovenantSpec(covenant_type="DSCR", threshold=1.5, current_value=1.2)],
    )
    schedule = compute_debt_schedule(spec)
    dscr_result = next(c for c in schedule.covenant_results if c["type"] == "DSCR")
    assert dscr_result["status"] == "BREACH"
