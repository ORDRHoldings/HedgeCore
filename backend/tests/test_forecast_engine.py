# backend/tests/test_forecast_engine.py
"""Pure-function tests for the cash flow forecast engine.

No DB, no mocks, no async — just input → output verification.
"""
from datetime import date
from decimal import Decimal
import pytest


def test_weekly_13w_basic_structure():
    """13-week forecast returns exactly 13 buckets with correct period boundaries."""
    from app.services.forecast_engine import compute_forecast

    result = compute_forecast(
        opening_balances={"EUR": Decimal("100000")},
        cash_flows=[],
        horizon="13w",
        as_of_date=date(2026, 4, 13),  # a Monday
        gap_threshold=Decimal("0"),
    )
    assert len(result) == 13
    assert result[0]["period_start"] == date(2026, 4, 13)
    assert result[0]["period_end"] == date(2026, 4, 19)
    assert result[12]["period_start"] == date(2026, 7, 6)
    assert Decimal(str(result[0]["opening_balance"])) == Decimal("100000")
    assert Decimal(str(result[0]["closing_balance"])) == Decimal("100000")
    assert result[1]["opening_balance"] == result[0]["closing_balance"]


def test_monthly_12m_basic_structure():
    """12-month forecast returns exactly 12 buckets."""
    from app.services.forecast_engine import compute_forecast

    result = compute_forecast(
        opening_balances={"USD": Decimal("500000")},
        cash_flows=[],
        horizon="12m",
        as_of_date=date(2026, 4, 14),
        gap_threshold=Decimal("0"),
    )
    assert len(result) == 12
    assert result[0]["period_start"] == date(2026, 4, 1)
    assert result[0]["period_end"] == date(2026, 4, 30)
    assert result[11]["period_start"] == date(2027, 3, 1)


def test_inflows_and_outflows_applied():
    """Cash flows are applied to the correct bucket."""
    from app.services.forecast_engine import compute_forecast

    flows = [
        {"date": date(2026, 4, 15), "amount": Decimal("20000"), "direction": "INFLOW",
         "currency": "EUR", "confidence": "COMMITTED", "label": "Client payment"},
        {"date": date(2026, 4, 16), "amount": Decimal("5000"), "direction": "OUTFLOW",
         "currency": "EUR", "confidence": "COMMITTED", "label": "Rent"},
    ]
    result = compute_forecast(
        opening_balances={"EUR": Decimal("100000")},
        cash_flows=flows,
        horizon="13w",
        as_of_date=date(2026, 4, 13),
        gap_threshold=Decimal("0"),
    )
    bucket0 = result[0]
    assert Decimal(str(bucket0["inflows"])) == Decimal("20000")
    assert Decimal(str(bucket0["outflows"])) == Decimal("5000")
    assert Decimal(str(bucket0["closing_balance"])) == Decimal("115000")


def test_liquidity_gap_flagged():
    """When closing balance drops below threshold, liquidity_gap is True."""
    from app.services.forecast_engine import compute_forecast

    flows = [
        {"date": date(2026, 4, 14), "amount": Decimal("150000"), "direction": "OUTFLOW",
         "currency": "EUR", "confidence": "COMMITTED", "label": "Large payment"},
    ]
    result = compute_forecast(
        opening_balances={"EUR": Decimal("100000")},
        cash_flows=flows,
        horizon="13w",
        as_of_date=date(2026, 4, 13),
        gap_threshold=Decimal("10000"),
    )
    assert result[0]["liquidity_gap"] is True
    assert Decimal(str(result[0]["closing_balance"])) == Decimal("-50000")


def test_confidence_breakdown():
    """Each bucket has a confidence breakdown dict."""
    from app.services.forecast_engine import compute_forecast

    flows = [
        {"date": date(2026, 4, 14), "amount": Decimal("10000"), "direction": "INFLOW",
         "currency": "EUR", "confidence": "COMMITTED", "label": "A"},
        {"date": date(2026, 4, 15), "amount": Decimal("5000"), "direction": "INFLOW",
         "currency": "EUR", "confidence": "PROBABLE", "label": "B"},
    ]
    result = compute_forecast(
        opening_balances={"EUR": Decimal("0")},
        cash_flows=flows,
        horizon="13w",
        as_of_date=date(2026, 4, 13),
        gap_threshold=Decimal("0"),
    )
    breakdown = result[0]["confidence_breakdown"]
    assert Decimal(str(breakdown["COMMITTED"])) == Decimal("10000")
    assert Decimal(str(breakdown["PROBABLE"])) == Decimal("5000")
    assert Decimal(str(breakdown.get("POSSIBLE", "0"))) == Decimal("0")


def test_scenario_shift_applied():
    """Scenario parameters shift cash flows by a percentage."""
    from app.services.forecast_engine import compute_forecast

    flows = [
        {"date": date(2026, 4, 14), "amount": Decimal("10000"), "direction": "INFLOW",
         "currency": "EUR", "confidence": "COMMITTED", "label": "Receivable"},
    ]
    result = compute_forecast(
        opening_balances={"EUR": Decimal("0")},
        cash_flows=flows,
        horizon="13w",
        as_of_date=date(2026, 4, 13),
        gap_threshold=Decimal("0"),
        scenario={"inflow_shift": Decimal("-0.20")},
    )
    assert Decimal(str(result[0]["inflows"])) == Decimal("8000")
    assert Decimal(str(result[0]["closing_balance"])) == Decimal("8000")


def test_multi_currency_separate_tracks():
    """Currencies are tracked independently — no cross-currency netting."""
    from app.services.forecast_engine import compute_forecast

    flows = [
        {"date": date(2026, 4, 14), "amount": Decimal("5000"), "direction": "INFLOW",
         "currency": "EUR", "confidence": "COMMITTED", "label": "EUR recv"},
        {"date": date(2026, 4, 14), "amount": Decimal("3000"), "direction": "INFLOW",
         "currency": "USD", "confidence": "COMMITTED", "label": "USD recv"},
    ]
    result = compute_forecast(
        opening_balances={"EUR": Decimal("10000"), "USD": Decimal("20000")},
        cash_flows=flows,
        horizon="13w",
        as_of_date=date(2026, 4, 13),
        gap_threshold=Decimal("0"),
    )
    bucket0 = result[0]
    eur = bucket0["by_currency"]["EUR"]
    usd = bucket0["by_currency"]["USD"]
    assert Decimal(str(eur["closing_balance"])) == Decimal("15000")
    assert Decimal(str(usd["closing_balance"])) == Decimal("23000")


def test_empty_opening_balance_defaults_zero():
    """If no opening balance for a currency, it starts at zero."""
    from app.services.forecast_engine import compute_forecast

    flows = [
        {"date": date(2026, 4, 14), "amount": Decimal("1000"), "direction": "INFLOW",
         "currency": "GBP", "confidence": "COMMITTED", "label": "New currency"},
    ]
    result = compute_forecast(
        opening_balances={},
        cash_flows=flows,
        horizon="13w",
        as_of_date=date(2026, 4, 13),
        gap_threshold=Decimal("0"),
    )
    gbp = result[0]["by_currency"]["GBP"]
    assert Decimal(str(gbp["opening_balance"])) == Decimal("0")
    assert Decimal(str(gbp["closing_balance"])) == Decimal("1000")


def test_expand_monthly_recurrence():
    """Monthly item generates one flow per month within the horizon."""
    from app.services.forecast_engine import expand_recurring_items

    items = [
        {
            "label": "Monthly rent",
            "direction": "OUTFLOW",
            "amount": Decimal("5000"),
            "currency": "EUR",
            "confidence": "COMMITTED",
            "recurrence": "MONTHLY",
            "start_date": date(2026, 1, 1),
            "end_date": None,
            "day_of_month": 1,
        },
    ]
    flows = expand_recurring_items(items, horizon_start=date(2026, 4, 1), horizon_end=date(2026, 6, 30))
    assert len(flows) == 3  # Apr, May, Jun
    assert all(f["direction"] == "OUTFLOW" for f in flows)
    assert flows[0]["date"] == date(2026, 4, 1)
    assert flows[1]["date"] == date(2026, 5, 1)
    assert flows[2]["date"] == date(2026, 6, 1)


def test_expand_weekly_recurrence():
    """Weekly item generates one flow per week."""
    from app.services.forecast_engine import expand_recurring_items

    items = [
        {
            "label": "Weekly payroll",
            "direction": "OUTFLOW",
            "amount": Decimal("15000"),
            "currency": "USD",
            "confidence": "COMMITTED",
            "recurrence": "WEEKLY",
            "start_date": date(2026, 4, 6),
            "end_date": date(2026, 4, 27),
            "day_of_month": None,
        },
    ]
    flows = expand_recurring_items(items, horizon_start=date(2026, 4, 1), horizon_end=date(2026, 4, 30))
    assert len(flows) == 4  # Apr 6, 13, 20, 27


def test_expand_once_item():
    """ONCE item generates exactly one flow if within horizon."""
    from app.services.forecast_engine import expand_recurring_items

    items = [
        {
            "label": "Tax payment",
            "direction": "OUTFLOW",
            "amount": Decimal("50000"),
            "currency": "EUR",
            "confidence": "COMMITTED",
            "recurrence": "ONCE",
            "start_date": date(2026, 5, 15),
            "end_date": None,
            "day_of_month": None,
        },
    ]
    flows = expand_recurring_items(items, horizon_start=date(2026, 4, 1), horizon_end=date(2026, 6, 30))
    assert len(flows) == 1
    assert flows[0]["date"] == date(2026, 5, 15)


def test_expand_item_outside_horizon_excluded():
    """Items entirely outside the horizon produce no flows."""
    from app.services.forecast_engine import expand_recurring_items

    items = [
        {
            "label": "Future item",
            "direction": "INFLOW",
            "amount": Decimal("1000"),
            "currency": "EUR",
            "confidence": "PROBABLE",
            "recurrence": "ONCE",
            "start_date": date(2027, 1, 1),
            "end_date": None,
            "day_of_month": None,
        },
    ]
    flows = expand_recurring_items(items, horizon_start=date(2026, 4, 1), horizon_end=date(2026, 6, 30))
    assert len(flows) == 0
