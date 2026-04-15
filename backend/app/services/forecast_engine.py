# backend/app/services/forecast_engine.py
"""
Pure-function cash flow forecast engine.

Deterministic. No DB access. No side effects. No ML.
Takes structured inputs → returns forecast buckets.
"""
from __future__ import annotations

import calendar
from datetime import date, timedelta
from decimal import Decimal
from typing import Any

CONFIDENCE_LEVELS = ("COMMITTED", "PROBABLE", "POSSIBLE")


def compute_forecast(
    *,
    opening_balances: dict[str, Decimal],
    cash_flows: list[dict[str, Any]],
    horizon: str,
    as_of_date: date,
    gap_threshold: Decimal,
    scenario: dict[str, Decimal] | None = None,
) -> list[dict[str, Any]]:
    """Compute a rolling forecast.

    Args:
        opening_balances: {currency: balance} from latest bank statements
        cash_flows: list of dicts with keys: date, amount, direction, currency, confidence, label
        horizon: "13w" (13 weekly buckets) or "12m" (12 monthly buckets)
        as_of_date: forecast anchor date
        gap_threshold: closing balance below this -> liquidity_gap=True
        scenario: optional shifts, e.g. {"inflow_shift": Decimal("-0.20")}

    Returns:
        List of bucket dicts, one per period.
    """
    periods = _build_periods(as_of_date, horizon)
    currencies = set(opening_balances.keys())
    for cf in cash_flows:
        currencies.add(cf["currency"])

    adjusted_flows = _apply_scenario(cash_flows, scenario) if scenario else cash_flows
    binned = _bin_cash_flows(adjusted_flows, periods)

    running_balances: dict[str, Decimal] = {c: opening_balances.get(c, Decimal("0")) for c in currencies}
    result: list[dict[str, Any]] = []

    for i, (period_start, period_end) in enumerate(periods):
        period_flows = binned.get(i, [])
        bucket = _compute_bucket(period_start, period_end, running_balances, period_flows, gap_threshold)
        result.append(bucket)
        for ccy, data in bucket["by_currency"].items():
            running_balances[ccy] = Decimal(str(data["closing_balance"]))

    return result


def _build_periods(as_of_date: date, horizon: str) -> list[tuple[date, date]]:
    """Build period boundaries for the given horizon."""
    if horizon == "13w":
        monday = as_of_date - timedelta(days=as_of_date.weekday())
        periods = []
        for i in range(13):
            start = monday + timedelta(weeks=i)
            end = start + timedelta(days=6)
            periods.append((start, end))
        return periods
    elif horizon == "12m":
        periods = []
        year, month = as_of_date.year, as_of_date.month
        for _ in range(12):
            start = date(year, month, 1)
            last_day = calendar.monthrange(year, month)[1]
            end = date(year, month, last_day)
            periods.append((start, end))
            month += 1
            if month > 12:
                month = 1
                year += 1
        return periods
    else:
        raise ValueError(f"Unknown horizon: {horizon}")


def _apply_scenario(
    cash_flows: list[dict[str, Any]],
    scenario: dict[str, Decimal],
) -> list[dict[str, Any]]:
    """Apply scenario shifts to cash flows."""
    inflow_shift = scenario.get("inflow_shift", Decimal("0"))
    outflow_shift = scenario.get("outflow_shift", Decimal("0"))

    adjusted = []
    for cf in cash_flows:
        cf_copy = dict(cf)
        if cf["direction"] == "INFLOW" and inflow_shift:
            cf_copy["amount"] = cf["amount"] * (Decimal("1") + inflow_shift)
        elif cf["direction"] == "OUTFLOW" and outflow_shift:
            cf_copy["amount"] = cf["amount"] * (Decimal("1") + outflow_shift)
        adjusted.append(cf_copy)
    return adjusted


def _bin_cash_flows(
    cash_flows: list[dict[str, Any]],
    periods: list[tuple[date, date]],
) -> dict[int, list[dict[str, Any]]]:
    """Assign each cash flow to the period it falls in."""
    binned: dict[int, list[dict[str, Any]]] = {}
    for cf in cash_flows:
        cf_date = cf["date"]
        for i, (start, end) in enumerate(periods):
            if start <= cf_date <= end:
                binned.setdefault(i, []).append(cf)
                break
    return binned


def _compute_bucket(
    period_start: date,
    period_end: date,
    running_balances: dict[str, Decimal],
    period_flows: list[dict[str, Any]],
    gap_threshold: Decimal,
) -> dict[str, Any]:
    """Compute a single forecast bucket."""
    by_currency: dict[str, dict[str, Any]] = {}

    for ccy, bal in running_balances.items():
        by_currency[ccy] = {
            "opening_balance": bal,
            "inflows": Decimal("0"),
            "outflows": Decimal("0"),
            "closing_balance": bal,
            "confidence_breakdown": {"COMMITTED": Decimal("0"), "PROBABLE": Decimal("0"), "POSSIBLE": Decimal("0")},
        }

    for cf in period_flows:
        ccy = cf["currency"]
        if ccy not in by_currency:
            by_currency[ccy] = {
                "opening_balance": Decimal("0"),
                "inflows": Decimal("0"),
                "outflows": Decimal("0"),
                "closing_balance": Decimal("0"),
                "confidence_breakdown": {"COMMITTED": Decimal("0"), "PROBABLE": Decimal("0"), "POSSIBLE": Decimal("0")},
            }
        amount = Decimal(str(cf["amount"]))
        confidence = cf.get("confidence", "COMMITTED")
        if cf["direction"] == "INFLOW":
            by_currency[ccy]["inflows"] += amount
            by_currency[ccy]["closing_balance"] += amount
        else:
            by_currency[ccy]["outflows"] += amount
            by_currency[ccy]["closing_balance"] -= amount
        by_currency[ccy]["confidence_breakdown"][confidence] += amount

    total_opening = sum(d["opening_balance"] for d in by_currency.values())
    total_inflows = sum(d["inflows"] for d in by_currency.values())
    total_outflows = sum(d["outflows"] for d in by_currency.values())
    total_closing = sum(d["closing_balance"] for d in by_currency.values())

    total_confidence = {"COMMITTED": Decimal("0"), "PROBABLE": Decimal("0"), "POSSIBLE": Decimal("0")}
    for d in by_currency.values():
        for level in CONFIDENCE_LEVELS:
            total_confidence[level] += d["confidence_breakdown"][level]

    return {
        "period_start": period_start,
        "period_end": period_end,
        "opening_balance": total_opening,
        "inflows": total_inflows,
        "outflows": total_outflows,
        "closing_balance": total_closing,
        "confidence_breakdown": total_confidence,
        "liquidity_gap": total_closing < gap_threshold,
        "by_currency": by_currency,
    }


def expand_recurring_items(
    items: list[dict[str, Any]],
    *,
    horizon_start: date,
    horizon_end: date,
) -> list[dict[str, Any]]:
    """Expand recurring forecast items into individual dated cash flows.

    Each item produces zero or more flows within [horizon_start, horizon_end].
    """
    flows: list[dict[str, Any]] = []

    for item in items:
        recurrence = item["recurrence"]
        start = item["start_date"]
        end = item.get("end_date") or horizon_end
        effective_start = max(start, horizon_start)
        effective_end = min(end, horizon_end)

        if effective_start > effective_end:
            continue

        if recurrence == "ONCE":
            if horizon_start <= start <= horizon_end:
                flows.append(_item_to_flow(item, start))

        elif recurrence == "WEEKLY":
            current = effective_start
            while current <= effective_end:
                flows.append(_item_to_flow(item, current))
                current += timedelta(days=7)

        elif recurrence == "BIWEEKLY":
            current = effective_start
            while current <= effective_end:
                flows.append(_item_to_flow(item, current))
                current += timedelta(days=14)

        elif recurrence == "MONTHLY":
            day = item.get("day_of_month") or effective_start.day
            day = min(day, 28)
            y, m = effective_start.year, effective_start.month
            while True:
                try:
                    d = date(y, m, day)
                except ValueError:
                    d = date(y, m, min(day, calendar.monthrange(y, m)[1]))
                if d > effective_end:
                    break
                if d >= effective_start:
                    flows.append(_item_to_flow(item, d))
                m += 1
                if m > 12:
                    m = 1
                    y += 1

        elif recurrence == "QUARTERLY":
            day = item.get("day_of_month") or effective_start.day
            day = min(day, 28)
            y, m = effective_start.year, effective_start.month
            while True:
                try:
                    d = date(y, m, day)
                except ValueError:
                    d = date(y, m, min(day, calendar.monthrange(y, m)[1]))
                if d > effective_end:
                    break
                if d >= effective_start:
                    flows.append(_item_to_flow(item, d))
                m += 3
                if m > 12:
                    m -= 12
                    y += 1

        elif recurrence == "ANNUALLY":
            y = effective_start.year
            while True:
                d = date(y, start.month, min(start.day, 28))
                if d > effective_end:
                    break
                if d >= effective_start:
                    flows.append(_item_to_flow(item, d))
                y += 1

    return flows


def _item_to_flow(item: dict[str, Any], flow_date: date) -> dict[str, Any]:
    """Convert a forecast item + date into a cash flow dict."""
    return {
        "date": flow_date,
        "amount": Decimal(str(item["amount"])),
        "direction": item["direction"],
        "currency": item["currency"],
        "confidence": item.get("confidence", "COMMITTED"),
        "label": item["label"],
    }
