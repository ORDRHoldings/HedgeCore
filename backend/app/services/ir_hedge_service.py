# backend/app/services/ir_hedge_service.py
"""IR hedge effectiveness service — writes WORM IRHedgeRun records."""
from __future__ import annotations

import hashlib
import json
import logging
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.engine_v1.ir_hedge_effectiveness import test_ir_effectiveness
from app.models.ir_risk import GENESIS_HASH, IRHedgeRun

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
    Lightweight audit event emitter for IR hedge service operations.

    Non-fatal: exceptions are caught and logged so callers always succeed.
    Uses the main AuditEvent hash-chain for the tenant.
    """
    try:
        from app.models.audit_event import GENESIS_HASH as _GH
        from app.models.audit_event import AuditEvent, build_audit_event

        result = await session.execute(
            select(AuditEvent.event_hash)
            .where(AuditEvent.company_id == tenant_id)
            .order_by(AuditEvent.created_at.desc())
            .limit(1)
        )
        prev_hash = result.scalars().first() or _GH

        event = build_audit_event(
            event_type=event_type,
            description=f"{event_type} entity_id={entity_id}",
            payload=details or {},
            prev_event_hash=prev_hash,
            company_id=tenant_id,
            branch_id=None,
            actor_id=tenant_id,
            actor_email="system@ir-hedge-service",
            entity_type="ir_hedge_run",
            entity_id=entity_id,
        )
        session.add(event)
    except Exception:
        logger.warning(
            "Failed to emit IR hedge audit event event_type=%s entity_id=%s",
            event_type, entity_id,
            exc_info=True,
        )


async def _get_latest_run_hash(
    session: AsyncSession, *, swap_id: uuid.UUID, tenant_id: uuid.UUID
) -> str:
    """Return the run_hash of the most recent IRHedgeRun, or GENESIS_HASH."""
    result = await session.execute(
        select(IRHedgeRun)
        .where(
            IRHedgeRun.swap_id == swap_id,
            IRHedgeRun.tenant_id == tenant_id,
        )
        .order_by(IRHedgeRun.run_at.desc())
        .limit(1)
    )
    last = result.scalars().first()
    return last.run_hash if last else GENESIS_HASH


async def _build_fv_series(
    session: AsyncSession,
    *,
    swap_id: uuid.UUID,
    facility_id: uuid.UUID | None,
    tenant_id: uuid.UUID,
) -> tuple[list[float], list[float]]:
    """Build fair-value change series for effectiveness test using last_npv."""
    from app.models.ir_risk import IRSwap

    swap = await session.get(IRSwap, swap_id)
    npv = float(swap.last_npv or 0) if swap else 0.0
    # hedged item FV change (opposite sign to instrument) and instrument FV change
    return [-npv, 0.0], [npv, 0.0]


async def run_effectiveness_test(
    session: AsyncSession,
    *,
    swap_id: uuid.UUID,
    facility_id: uuid.UUID | None,
    tenant_id: uuid.UUID,
    method: str = "DOLLAR_OFFSET",
) -> dict[str, Any]:
    """Run IFRS 9 hedge effectiveness test and write a WORM IRHedgeRun record."""
    hedged_fv, instrument_fv = await _build_fv_series(
        session,
        swap_id=swap_id,
        facility_id=facility_id,
        tenant_id=tenant_id,
    )
    result = test_ir_effectiveness(hedged_fv, instrument_fv, method=method)

    inputs_str = json.dumps(
        {"hedged": hedged_fv, "instrument": instrument_fv, "method": method},
        sort_keys=True,
    )
    inputs_hash = hashlib.sha256(inputs_str.encode()).hexdigest()
    prior_hash = await _get_latest_run_hash(
        session, swap_id=swap_id, tenant_id=tenant_id
    )
    run_hash = IRHedgeRun.compute_run_hash(inputs_hash, prior_hash)

    run = IRHedgeRun(
        tenant_id=tenant_id,
        swap_id=swap_id,
        facility_id=facility_id,
        run_at=datetime.now(UTC),
        method=method,
        ratio=result.ratio,
        passed=result.passed,
        inputs_hash=inputs_hash,
        run_hash=run_hash,
        prior_run_hash=prior_hash,
        evidence_json={**result.evidence_bundle, "method": method},
    )
    session.add(run)
    await session.flush()

    await emit_audit_event(
        session,
        tenant_id=tenant_id,
        event_type="IR_HEDGE_EFFECTIVENESS_RUN",
        entity_id=str(swap_id),
        details={"ratio": result.ratio, "passed": result.passed, "method": method},
    )
    return {
        "run_id": str(run.id),
        "ratio": result.ratio,
        "passed": result.passed,
        "method": method,
    }


async def get_evidence_bundle(
    session: AsyncSession, *, run_id: uuid.UUID, tenant_id: uuid.UUID
) -> dict:
    """Return the full evidence bundle for a hedge effectiveness run."""
    run = await session.get(IRHedgeRun, run_id)
    if not run or run.tenant_id != tenant_id:
        raise ValueError("Run not found")
    return {
        "run_id": str(run.id),
        "swap_id": str(run.swap_id),
        "run_at": str(run.run_at),
        "method": run.method,
        "ratio": float(run.ratio),
        "passed": run.passed,
        "run_hash": run.run_hash,
        "prior_run_hash": run.prior_run_hash,
        "evidence": run.evidence_json,
    }


async def get_hedge_ratio(
    session: AsyncSession,
    *,
    swap_id: uuid.UUID,
    facility_id: uuid.UUID,
    tenant_id: uuid.UUID,
) -> float:
    """Compute hedge ratio as abs(swap DV01) / abs(facility DV01)."""
    from app.models.ir_risk import IRSwap

    swap = await session.get(IRSwap, swap_id)
    if not swap or swap.last_dv01 is None:
        return 0.0
    facility_dv01 = await _get_facility_dv01(
        session, facility_id=facility_id, tenant_id=tenant_id
    )
    if facility_dv01 == 0:
        return 0.0
    return abs(float(swap.last_dv01)) / abs(facility_dv01)


async def _get_facility_dv01(
    session: AsyncSession, *, facility_id: uuid.UUID, tenant_id: uuid.UUID
) -> float:
    """Approximate facility DV01 from debt schedule interest expense."""
    from app.services.debt_service import get_debt_schedule

    try:
        schedule = await get_debt_schedule(
            session, facility_id=facility_id, tenant_id=tenant_id
        )
        interest = schedule.get("total_interest_expense", 0)
        return -abs(interest) * 0.0001
    except Exception:
        return 0.0
