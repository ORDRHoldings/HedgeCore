# backend/app/services/forecast_service.py
"""
Forecast service — orchestrates DB data gathering + pure-function engine.
"""
from __future__ import annotations

import uuid
from datetime import date, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.cash import (
    BankAccount,
    CashAuditEventType,
    CashBalance,
    LegalEntity,
)
from app.models.cash_forecast import CashForecastItem, CashForecastSnapshot
from app.services.cash_audit_service import append_event
from app.services.forecast_engine import compute_forecast, expand_recurring_items


async def get_forecast(
    session: AsyncSession,
    *,
    company_id: uuid.UUID,
    entity_id: uuid.UUID | None,
    horizon: str,
    as_of_date: date,
    scenario: dict[str, Decimal] | None = None,
) -> list[dict[str, Any]]:
    """Compute forecast for a company (or single entity)."""
    opening = await _get_opening_balances(session, company_id=company_id, entity_id=entity_id, as_of_date=as_of_date)
    recurring = await _get_recurring_flows(session, company_id=company_id, entity_id=entity_id, as_of_date=as_of_date, horizon=horizon)
    settlements = await _get_settlement_flows(session, company_id=company_id, entity_id=entity_id, as_of_date=as_of_date, horizon=horizon)

    all_flows = recurring + settlements

    threshold = await _get_gap_threshold(session, company_id=company_id, entity_id=entity_id)

    return compute_forecast(
        opening_balances=opening,
        cash_flows=all_flows,
        horizon=horizon,
        as_of_date=as_of_date,
        gap_threshold=threshold,
        scenario=scenario,
    )


async def create_forecast_item(
    session: AsyncSession,
    *,
    company_id: uuid.UUID,
    payload: dict[str, Any],
    created_by: uuid.UUID,
) -> CashForecastItem:
    """Create a new recurring forecast item."""
    item = CashForecastItem(
        company_id=company_id,
        created_by=created_by,
        **{k: v for k, v in payload.items() if hasattr(CashForecastItem, k)},
    )
    session.add(item)
    await session.flush()
    await append_event(
        session,
        company_id=company_id,
        event_type=CashAuditEventType.FORECAST_CREATED,
        payload={"label": item.label, "recurrence": item.recurrence, "amount": str(item.amount)},
        performed_by=created_by,
    )
    return item


async def list_forecast_items(
    session: AsyncSession,
    *,
    company_id: uuid.UUID,
    active_only: bool = True,
) -> list[CashForecastItem]:
    """List forecast items for a company."""
    q = select(CashForecastItem).where(CashForecastItem.company_id == company_id)
    if active_only:
        q = q.where(CashForecastItem.is_active == True)  # noqa: E712
    result = await session.execute(q.order_by(CashForecastItem.start_date))
    return list(result.scalars().all())


async def update_forecast_item(
    session: AsyncSession,
    *,
    item_id: uuid.UUID,
    company_id: uuid.UUID,
    payload: dict[str, Any],
) -> CashForecastItem:
    """Update a forecast item."""
    result = await session.execute(
        select(CashForecastItem).where(
            CashForecastItem.id == item_id,
            CashForecastItem.company_id == company_id,
        )
    )
    item = result.scalar_one_or_none()
    if item is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Forecast item not found")
    for k, v in payload.items():
        if v is not None and hasattr(item, k):
            setattr(item, k, v)
    await session.flush()
    return item


async def run_scenario(
    session: AsyncSession,
    *,
    company_id: uuid.UUID,
    entity_id: uuid.UUID | None,
    horizon: str,
    scenario: dict[str, Decimal],
    created_by: uuid.UUID,
) -> list[dict[str, Any]]:
    """Run a what-if scenario and audit-log it."""
    result = await get_forecast(
        session,
        company_id=company_id,
        entity_id=entity_id,
        horizon=horizon,
        as_of_date=date.today(),
        scenario=scenario,
    )
    await append_event(
        session,
        company_id=company_id,
        event_type=CashAuditEventType.FORECAST_SCENARIO_RUN,
        payload={"horizon": horizon, "scenario": {k: str(v) for k, v in scenario.items()}},
        performed_by=created_by,
    )
    return result


async def get_liquidity_gaps(
    session: AsyncSession,
    *,
    company_id: uuid.UUID,
    entity_id: uuid.UUID | None,
    gap_threshold: Decimal | None = None,
) -> list[dict[str, Any]]:
    """Identify future periods where closing balance falls below threshold."""
    threshold = gap_threshold or await _get_gap_threshold(session, company_id=company_id, entity_id=entity_id)
    buckets = await get_forecast(
        session,
        company_id=company_id,
        entity_id=entity_id,
        horizon="13w",
        as_of_date=date.today(),
    )
    gaps = []
    for bucket in buckets:
        if bucket["liquidity_gap"]:
            for ccy, data in bucket["by_currency"].items():
                if data["closing_balance"] < threshold:
                    gaps.append({
                        "period_start": bucket["period_start"],
                        "period_end": bucket["period_end"],
                        "currency": ccy,
                        "closing_balance": data["closing_balance"],
                        "gap_threshold": threshold,
                        "shortfall": data["closing_balance"] - threshold,
                    })
    return gaps


async def save_snapshot(
    session: AsyncSession,
    *,
    company_id: uuid.UUID,
    entity_id: uuid.UUID | None,
    horizon: str,
    buckets: list[dict[str, Any]],
    parameters: dict[str, Any],
    created_by: uuid.UUID,
) -> CashForecastSnapshot:
    """Save a point-in-time forecast snapshot for variance tracking."""
    serializable = []
    for b in buckets:
        sb = dict(b)
        sb["period_start"] = b["period_start"].isoformat() if isinstance(b["period_start"], date) else b["period_start"]
        sb["period_end"] = b["period_end"].isoformat() if isinstance(b["period_end"], date) else b["period_end"]
        for key in ("opening_balance", "inflows", "outflows", "closing_balance"):
            sb[key] = str(sb[key])
        if "confidence_breakdown" in sb:
            sb["confidence_breakdown"] = {k: str(v) for k, v in sb["confidence_breakdown"].items()}
        if "by_currency" in sb:
            by_ccy = {}
            for ccy, data in sb["by_currency"].items():
                by_ccy[ccy] = {k: str(v) if isinstance(v, Decimal) else v for k, v in data.items()}
                if "confidence_breakdown" in by_ccy[ccy]:
                    by_ccy[ccy]["confidence_breakdown"] = {k: str(v) for k, v in data["confidence_breakdown"].items()}
            sb["by_currency"] = by_ccy
        serializable.append(sb)

    snapshot = CashForecastSnapshot(
        company_id=company_id,
        entity_id=entity_id,
        snapshot_date=date.today(),
        horizon=horizon,
        buckets=serializable,
        parameters={k: str(v) for k, v in parameters.items()} if parameters else {},
        created_by=created_by,
    )
    session.add(snapshot)
    await session.flush()
    return snapshot


async def get_variance(
    session: AsyncSession,
    *,
    company_id: uuid.UUID,
    entity_id: uuid.UUID | None,
) -> list[dict[str, Any]]:
    """Compare most recent forecast snapshot against actual balances."""
    q = select(CashForecastSnapshot).where(
        CashForecastSnapshot.company_id == company_id,
        CashForecastSnapshot.horizon == "13w",
    )
    if entity_id:
        q = q.where(CashForecastSnapshot.entity_id == entity_id)
    else:
        q = q.where(CashForecastSnapshot.entity_id.is_(None))
    q = q.order_by(CashForecastSnapshot.snapshot_date.desc()).limit(1)

    result = await session.execute(q)
    snapshot = result.scalar_one_or_none()
    if snapshot is None:
        return []

    rows = []
    for bucket_data in snapshot.buckets:
        period_start = date.fromisoformat(bucket_data["period_start"]) if isinstance(bucket_data["period_start"], str) else bucket_data["period_start"]
        period_end = date.fromisoformat(bucket_data["period_end"]) if isinstance(bucket_data["period_end"], str) else bucket_data["period_end"]
        forecast_closing = Decimal(str(bucket_data["closing_balance"]))

        actual = await _get_actual_balance(session, company_id=company_id, entity_id=entity_id, as_of_date=period_end)
        actual_closing = actual if actual is not None else None
        variance = (actual_closing - forecast_closing) if actual_closing is not None else None
        variance_pct = (variance / forecast_closing * 100) if variance is not None and forecast_closing != 0 else None

        rows.append({
            "period_start": period_start,
            "period_end": period_end,
            "forecast_closing": forecast_closing,
            "actual_closing": actual_closing,
            "variance": variance,
            "variance_pct": variance_pct,
        })
    return rows


# ── Internal data-gathering helpers ──────────────────────────────────────

async def _get_opening_balances(
    session: AsyncSession,
    *,
    company_id: uuid.UUID,
    entity_id: uuid.UUID | None,
    as_of_date: date,
) -> dict[str, Decimal]:
    """Get latest balance per currency from cash_balances as of given date."""
    q = (
        select(
            CashBalance.currency,
            func.sum(CashBalance.ledger_balance).label("total"),
        )
        .join(BankAccount, CashBalance.account_id == BankAccount.id)
        .join(LegalEntity, BankAccount.entity_id == LegalEntity.id)
        .where(LegalEntity.company_id == company_id, CashBalance.balance_date <= as_of_date)
    )
    if entity_id:
        q = q.where(LegalEntity.id == entity_id)
    q = q.group_by(CashBalance.currency)
    result = await session.execute(q)
    return {r.currency: Decimal(str(r.total)) for r in result.all()}


async def _get_recurring_flows(
    session: AsyncSession,
    *,
    company_id: uuid.UUID,
    entity_id: uuid.UUID | None,
    as_of_date: date,
    horizon: str,
) -> list[dict[str, Any]]:
    """Expand active recurring forecast items into dated cash flows."""
    q = select(CashForecastItem).where(
        CashForecastItem.company_id == company_id,
        CashForecastItem.is_active == True,  # noqa: E712
    )
    if entity_id:
        q = q.where(CashForecastItem.entity_id == entity_id)
    result = await session.execute(q)
    items = result.scalars().all()

    if not items:
        return []

    if horizon == "13w":
        horizon_end = as_of_date + timedelta(weeks=13)
    else:
        from dateutil.relativedelta import relativedelta
        horizon_end = as_of_date + relativedelta(months=12)

    item_dicts = [
        {
            "label": it.label,
            "direction": it.direction,
            "amount": it.amount,
            "currency": it.currency,
            "confidence": it.confidence,
            "recurrence": it.recurrence,
            "start_date": it.start_date,
            "end_date": it.end_date,
            "day_of_month": it.day_of_month,
        }
        for it in items
    ]
    return expand_recurring_items(item_dicts, horizon_start=as_of_date, horizon_end=horizon_end)


async def _get_settlement_flows(
    session: AsyncSession,
    *,
    company_id: uuid.UUID,
    entity_id: uuid.UUID | None,
    as_of_date: date,
    horizon: str,
) -> list[dict[str, Any]]:
    """Get future settlement events as cash flows."""
    from app.models.settlement_event import SettlementEvent

    if horizon == "13w":
        horizon_end = as_of_date + timedelta(weeks=13)
    else:
        from dateutil.relativedelta import relativedelta
        horizon_end = as_of_date + relativedelta(months=12)

    try:
        q = (
            select(SettlementEvent)
            .where(
                SettlementEvent.company_id == company_id,
                SettlementEvent.settlement_date >= as_of_date,
                SettlementEvent.settlement_date <= horizon_end,
            )
        )
        result = await session.execute(q)
        events = result.scalars().all()
    except Exception:
        return []

    flows = []
    for ev in events:
        amount = abs(Decimal(str(getattr(ev, "amount", 0) or 0)))
        if amount == 0:
            continue
        direction = "INFLOW" if getattr(ev, "amount", 0) >= 0 else "OUTFLOW"
        flows.append({
            "date": ev.settlement_date,
            "amount": amount,
            "direction": direction,
            "currency": getattr(ev, "currency", "USD"),
            "confidence": "COMMITTED",
            "label": f"Settlement #{getattr(ev, 'id', 'unknown')}",
        })
    return flows


async def _get_gap_threshold(
    session: AsyncSession,
    *,
    company_id: uuid.UUID,
    entity_id: uuid.UUID | None,
) -> Decimal:
    """Get aggregate minimum balance threshold from bank accounts."""
    q = (
        select(func.coalesce(func.sum(BankAccount.min_balance_threshold), 0))
        .join(LegalEntity, BankAccount.entity_id == LegalEntity.id)
        .where(LegalEntity.company_id == company_id)
    )
    if entity_id:
        q = q.where(LegalEntity.id == entity_id)
    result = await session.execute(q)
    return Decimal(str(result.scalar() or 0))


async def _get_actual_balance(
    session: AsyncSession,
    *,
    company_id: uuid.UUID,
    entity_id: uuid.UUID | None,
    as_of_date: date,
) -> Decimal | None:
    """Get actual total balance for a given date (for variance tracking)."""
    q = (
        select(func.sum(CashBalance.ledger_balance))
        .join(BankAccount, CashBalance.account_id == BankAccount.id)
        .join(LegalEntity, BankAccount.entity_id == LegalEntity.id)
        .where(LegalEntity.company_id == company_id, CashBalance.balance_date == as_of_date)
    )
    if entity_id:
        q = q.where(LegalEntity.id == entity_id)
    result = await session.execute(q)
    total = result.scalar()
    return Decimal(str(total)) if total is not None else None
