# backend/app/services/ir_swap_service.py
"""IR swap lifecycle management service."""
from __future__ import annotations

import logging
import uuid
from datetime import UTC, date, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.engine_v1.ir_curve_engine import RateQuote, bootstrap_curve
from app.engine_v1.swap_valuator import SwapSpec, value_swap
from app.models.ir_risk import IRSwap

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
    Lightweight audit event emitter for IR swap service operations.

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
            actor_email="system@ir-swap-service",
            entity_type="ir_swap",
            entity_id=entity_id,
        )
        session.add(event)
    except Exception:
        logger.warning(
            "Failed to emit IR swap audit event event_type=%s entity_id=%s",
            event_type, entity_id,
            exc_info=True,
        )


async def _fetch_rate_quotes(
    session: AsyncSession, index: str, tenant_id: uuid.UUID
) -> list[RateQuote]:
    """Fetch rate quotes for curve bootstrap — fail-open, returns [] if unavailable."""
    try:
        from app.models.market_data import ForwardCurveSnapshot

        result = await session.execute(
            select(ForwardCurveSnapshot)
            .where(ForwardCurveSnapshot.pair.like(f"%{index}%"))
            .order_by(ForwardCurveSnapshot.as_of.desc())
            .limit(10)
        )
        rows = result.scalars().all()
        quotes: list[RateQuote] = []
        for r in rows:
            try:
                quotes.append(
                    RateQuote(
                        tenor=str(getattr(r, "tenor_months", "1Y") or "1Y"),
                        rate=float(r.swap_rate_annualized or 0.05),
                        instrument="OIS",
                        index=index,
                    )
                )
            except Exception:
                continue
        return quotes
    except Exception:
        return []


async def create_swap(
    session: AsyncSession, *, tenant_id: uuid.UUID, spec: dict[str, Any]
) -> IRSwap:
    """Create a new IR swap and emit an audit event."""
    swap = IRSwap(
        tenant_id=tenant_id,
        legal_entity_id=spec.get("legal_entity_id"),
        linked_facility_id=spec.get("linked_facility_id"),
        instrument_type=spec["instrument_type"],
        notional=spec["notional"],
        currency=spec["currency"],
        fixed_rate=spec.get("fixed_rate"),
        strike=spec.get("strike"),
        float_index=spec.get("float_index", "SOFR"),
        start_date=spec["start_date"],
        maturity_date=spec["maturity_date"],
        pay_fixed=spec.get("pay_fixed", True),
        day_count=spec.get("day_count", "ACT365"),
        reset_frequency=spec.get("reset_frequency", "QUARTERLY"),
        status="ACTIVE",
    )
    session.add(swap)
    await session.flush()
    await session.refresh(swap)
    await emit_audit_event(
        session,
        tenant_id=tenant_id,
        event_type="IR_SWAP_CREATED",
        entity_id=str(swap.id),
        details={"instrument_type": swap.instrument_type, "notional": swap.notional},
    )
    return swap


async def mark_to_market(
    session: AsyncSession, *, swap_id: uuid.UUID, tenant_id: uuid.UUID
) -> dict:
    """Mark a single IR swap to market using the bootstrapped OIS curve."""
    swap = await session.get(IRSwap, swap_id)
    if not swap or swap.tenant_id != tenant_id:
        raise ValueError("Swap not found")

    quotes = await _fetch_rate_quotes(session, swap.float_index, tenant_id)
    if not quotes:
        return {
            "swap_id": str(swap_id),
            "npv": float(swap.last_npv or 0),
            "dv01": float(swap.last_dv01 or 0),
            "skipped": True,
        }

    curve = bootstrap_curve(quotes, as_of=date.today())
    swap_spec = SwapSpec(
        notional=float(swap.notional),
        currency=swap.currency,
        fixed_rate=float(swap.fixed_rate or 0),
        float_index=swap.float_index,
        start_date=swap.start_date,
        maturity_date=swap.maturity_date,
        pay_fixed=swap.pay_fixed,
        day_count=swap.day_count,
        reset_frequency=swap.reset_frequency,
        amortization_schedule=None,
        fx_basis_bps=0.0,
    )
    val = value_swap(swap_spec, curve)

    swap.last_npv = val.npv
    swap.last_dv01 = val.dv01
    swap.last_mtm_at = datetime.now(UTC)
    await session.flush()

    await emit_audit_event(
        session,
        tenant_id=tenant_id,
        event_type="IR_SWAP_MTM",
        entity_id=str(swap_id),
        details={"npv": val.npv, "dv01": val.dv01},
    )
    return {
        "swap_id": str(swap_id),
        "npv": val.npv,
        "dv01": val.dv01,
        "par_rate": val.par_rate,
    }


async def mark_to_market_all(
    session: AsyncSession, *, tenant_id: uuid.UUID
) -> dict:
    """Mark all active swaps to market for a tenant. Fail-open per swap."""
    result = await session.execute(
        select(IRSwap).where(
            IRSwap.tenant_id == tenant_id, IRSwap.status == "ACTIVE"
        )
    )
    swaps = result.scalars().all()
    succeeded, failed = 0, 0
    for swap in swaps:
        try:
            await mark_to_market(session, swap_id=swap.id, tenant_id=tenant_id)
            succeeded += 1
        except Exception:
            failed += 1

    await emit_audit_event(
        session,
        tenant_id=tenant_id,
        event_type="IR_SWAP_MTM_BATCH",
        entity_id=str(tenant_id),
        details={"succeeded": succeeded, "failed": failed},
    )
    return {"succeeded": succeeded, "failed": failed}


async def list_swaps(
    session: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    status: str | None = None,
) -> list[IRSwap]:
    """List IR swaps for a tenant, optionally filtered by status."""
    q = select(IRSwap).where(IRSwap.tenant_id == tenant_id)
    if status:
        q = q.where(IRSwap.status == status)
    result = await session.execute(q)
    return list(result.scalars().all())


async def terminate_swap(
    session: AsyncSession, *, swap_id: uuid.UUID, tenant_id: uuid.UUID
) -> IRSwap:
    """Terminate an active IR swap."""
    swap = await session.get(IRSwap, swap_id)
    if not swap or swap.tenant_id != tenant_id:
        raise ValueError("Swap not found")
    swap.status = "TERMINATED"
    await session.flush()
    await emit_audit_event(
        session,
        tenant_id=tenant_id,
        event_type="IR_SWAP_TERMINATED",
        entity_id=str(swap_id),
        details={"last_npv": float(swap.last_npv or 0)},
    )
    return swap


async def get_dv01_ladder(
    session: AsyncSession, *, tenant_id: uuid.UUID
) -> dict[str, float]:
    """Bucket DV01 by maturity tenor for all active swaps."""
    result = await session.execute(
        select(IRSwap).where(
            IRSwap.tenant_id == tenant_id, IRSwap.status == "ACTIVE"
        )
    )
    buckets: dict[str, float] = {
        "1Y": 0.0, "2Y": 0.0, "5Y": 0.0, "10Y": 0.0, "30Y": 0.0,
    }
    for swap in result.scalars().all():
        if swap.last_dv01 is None:
            continue
        years = (swap.maturity_date - date.today()).days / 365.0
        if years <= 1.5:
            buckets["1Y"] += float(swap.last_dv01)
        elif years <= 3.5:
            buckets["2Y"] += float(swap.last_dv01)
        elif years <= 7.5:
            buckets["5Y"] += float(swap.last_dv01)
        elif years <= 20.0:
            buckets["10Y"] += float(swap.last_dv01)
        else:
            buckets["30Y"] += float(swap.last_dv01)
    return buckets
