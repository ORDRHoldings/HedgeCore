# backend/app/services/debt_service.py
"""Debt facility management service."""
from __future__ import annotations

import logging
import uuid
from datetime import UTC, date, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.debt import DebtCovenant, DebtDrawdown, DebtFacility

logger = logging.getLogger(__name__)


async def emit_audit_event(
    session: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    event_type: str,
    entity_id: str,
    details: dict[str, Any] | None = None,
) -> None:
    """
    Lightweight audit event emitter for debt service operations.

    Non-fatal: exceptions are caught and logged so callers always succeed.
    Uses the main AuditEvent hash-chain for the tenant.
    """
    try:
        from app.models.audit_event import GENESIS_HASH, AuditEvent, build_audit_event

        result = await session.execute(
            select(AuditEvent.event_hash)
            .where(AuditEvent.company_id == tenant_id)
            .order_by(AuditEvent.created_at.desc())
            .limit(1)
        )
        prev_hash = result.scalars().first() or GENESIS_HASH

        event = build_audit_event(
            event_type=event_type,
            description=f"{event_type} entity_id={entity_id}",
            payload=details or {},
            prev_event_hash=prev_hash,
            company_id=tenant_id,
            branch_id=None,
            actor_id=tenant_id,
            actor_email="system@debt-service",
            entity_type="debt_facility",
            entity_id=entity_id,
        )
        session.add(event)
    except Exception:
        logger.warning(
            "Failed to emit debt audit event event_type=%s entity_id=%s",
            event_type, entity_id,
            exc_info=True,
        )


async def create_facility(
    session: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    spec: dict[str, Any],
    created_by: uuid.UUID | None = None,
) -> DebtFacility:
    """Create a new debt facility and emit an audit event."""
    facility = DebtFacility(
        tenant_id=tenant_id,
        legal_entity_id=spec.get("legal_entity_id"),
        facility_type=spec["facility_type"],
        counterparty=spec["counterparty"],
        currency=spec["currency"],
        committed_amount=spec["committed_amount"],
        drawn_amount=0.0,
        margin_bps=spec.get("margin_bps", 0),
        rate_index=spec.get("rate_index", "FIXED"),
        maturity_date=spec["maturity_date"],
        day_count=spec.get("day_count", "ACT365"),
        payment_frequency=spec.get("payment_frequency", "QUARTERLY"),
        repayment_type=spec.get("repayment_type", "BULLET"),
        status="ACTIVE",
    )
    session.add(facility)
    await session.flush()
    await session.refresh(facility)
    await emit_audit_event(
        session,
        tenant_id=tenant_id,
        event_type="DEBT_FACILITY_CREATED",
        entity_id=str(facility.id),
        details={"facility_type": facility.facility_type, "currency": facility.currency},
    )
    return facility


async def record_drawdown(
    session: AsyncSession,
    *,
    facility_id: uuid.UUID,
    tenant_id: uuid.UUID,
    amount: float,
    drawdown_date: date,
    repayment_date: date | None = None,
    rate_fixed_at: float | None = None,
) -> DebtDrawdown:
    """Record a drawdown against a facility, updating drawn_amount."""
    facility = await session.get(DebtFacility, facility_id)
    if not facility or facility.tenant_id != tenant_id:
        raise ValueError("Facility not found")
    facility.drawn_amount = (facility.drawn_amount or 0.0) + amount
    drawdown = DebtDrawdown(
        tenant_id=tenant_id,
        facility_id=facility_id,
        drawdown_date=drawdown_date,
        amount=amount,
        repayment_date=repayment_date,
        rate_fixed_at=rate_fixed_at,
        drawdown_hash=DebtDrawdown.compute_hash(facility_id, amount, drawdown_date),
    )
    session.add(drawdown)
    await session.flush()
    await emit_audit_event(
        session,
        tenant_id=tenant_id,
        event_type="DEBT_DRAWDOWN_RECORDED",
        entity_id=str(facility_id),
        details={"amount": amount, "drawdown_date": str(drawdown_date)},
    )
    return drawdown


async def get_maturity_calendar(
    session: AsyncSession,
    *,
    tenant_id: uuid.UUID,
) -> list[dict]:
    """Return active facilities ordered by maturity date."""
    result = await session.execute(
        select(DebtFacility)
        .where(DebtFacility.tenant_id == tenant_id, DebtFacility.status == "ACTIVE")
        .order_by(DebtFacility.maturity_date)
    )
    facilities = result.scalars().all()
    today = date.today()
    return [
        {
            "id": str(f.id),
            "counterparty": f.counterparty,
            "facility_type": f.facility_type,
            "currency": f.currency,
            "committed_amount": float(f.committed_amount),
            "drawn_amount": float(f.drawn_amount or 0),
            "maturity_date": str(f.maturity_date),
            "days_to_maturity": (f.maturity_date - today).days if hasattr(f.maturity_date, "__sub__") else None,
        }
        for f in facilities
    ]


async def get_debt_schedule(
    session: AsyncSession,
    *,
    facility_id: uuid.UUID,
    tenant_id: uuid.UUID,
) -> dict:
    """Compute the amortization / cashflow schedule for a facility."""
    from app.engine_v1.debt_cashflow_engine import DebtFacilitySpec, compute_debt_schedule

    facility = await session.get(DebtFacility, facility_id)
    if not facility or facility.tenant_id != tenant_id:
        raise ValueError("Facility not found")
    spec = DebtFacilitySpec(
        principal=float(facility.drawn_amount or facility.committed_amount),
        margin_bps=facility.margin_bps or 0,
        rate_index=facility.rate_index,
        index_rate=0.0,
        day_count=facility.day_count,
        repayment_type=facility.repayment_type,
        start_date=date.today(),
        maturity_date=facility.maturity_date,
        payment_frequency=facility.payment_frequency,
        covenants=[],
    )
    schedule = compute_debt_schedule(spec)
    return {
        "facility_id": str(facility_id),
        "periods": schedule.periods,
        "total_interest_expense": schedule.total_interest_expense,
        "weighted_avg_life": schedule.weighted_avg_life,
    }


async def check_covenants(
    session: AsyncSession,
    *,
    facility_id: uuid.UUID,
    tenant_id: uuid.UUID,
) -> list[dict]:
    """
    Evaluate all covenants for a facility.

    DSCR and similar metrics: compliant when current_value >= threshold.
    LTV / NET_LEVERAGE (inverted): compliant when current_value <= threshold.
    Sets status to COMPLIANT | WARNING | BREACH and emits audit event on breach.
    """
    result = await session.execute(
        select(DebtCovenant).where(
            DebtCovenant.facility_id == facility_id,
            DebtCovenant.tenant_id == tenant_id,
        )
    )
    covenants = result.scalars().all()
    results = []
    for cov in covenants:
        threshold = float(cov.threshold)
        current = float(cov.current_value or 0)
        inverted = cov.covenant_type in ("LTV", "NET_LEVERAGE")
        if inverted:
            headroom = (threshold - current) / threshold * 100.0 if threshold else 0.0
            compliant = current <= threshold
        else:
            headroom = (current - threshold) / threshold * 100.0 if threshold else 0.0
            compliant = current >= threshold
        warning = (not compliant) and abs(headroom) < 15.0
        status = "COMPLIANT" if compliant else ("WARNING" if warning else "BREACH")
        cov.status = status
        cov.headroom_pct = round(headroom, 4)
        cov.tested_at = datetime.now(UTC)
        results.append({"covenant_type": cov.covenant_type, "status": status, "headroom_pct": headroom})
    await session.flush()
    if any(r["status"] == "BREACH" for r in results):
        await emit_audit_event(
            session,
            tenant_id=tenant_id,
            event_type="DEBT_COVENANT_BREACH",
            entity_id=str(facility_id),
            details={"breached": [r["covenant_type"] for r in results if r["status"] == "BREACH"]},
        )
    return results


async def get_total_exposure(
    session: AsyncSession,
    *,
    tenant_id: uuid.UUID,
) -> list[dict]:
    """Aggregate committed and drawn amounts by currency for a tenant."""
    result = await session.execute(
        select(DebtFacility).where(
            DebtFacility.tenant_id == tenant_id,
            DebtFacility.status == "ACTIVE",
        )
    )
    rows: dict[str, dict] = {}
    for f in result.scalars().all():
        key = f.currency
        if key not in rows:
            rows[key] = {"currency": key, "committed": 0.0, "drawn": 0.0}
        rows[key]["committed"] += float(f.committed_amount)
        rows[key]["drawn"] += float(f.drawn_amount or 0)
    return list(rows.values())
