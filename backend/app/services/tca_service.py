"""tca_service — Pre-Trade TCA orchestrator.

Public surface:
  - estimate_pre_trade(db, tenant_id, user_id, request) -> TransactionCostEstimate
  - attach_to_calc_run(...)  — implemented in Task 6
  - reconcile_actual(...)    — implemented in Task 7
  - get_accuracy_report(...) — implemented in Task 8
"""
from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.engine_v1.transaction_cost_model import compute_transaction_costs
from app.models.transaction_cost_estimate import TransactionCostEstimate
from app.schemas_v1.tca import PreTradeEstimateRequest


class TCAServiceError(Exception):
    def __init__(self, code: str, message: str = "") -> None:
        self.code = code
        self.message = message or code
        super().__init__(self.message)


class SODViolationError(TCAServiceError):
    def __init__(self) -> None:
        super().__init__("sod_violation", "creator cannot reconcile post_calc estimate")


async def _get_market_snapshot_for_pretrade(db: AsyncSession, tenant_id: UUID):
    """Load latest MarketSnapshot for tenant, or specific id if requested."""
    from app.models.market_snapshot import MarketSnapshot
    stmt = (
        select(MarketSnapshot)
        .where(MarketSnapshot.company_id == tenant_id)
        .order_by(MarketSnapshot.created_at.desc())
        .limit(1)
    )
    return (await db.execute(stmt)).scalar_one_or_none()


def _estimate_slippage(pair: str, notional_usd: float) -> list[dict[str, Any]]:
    """Lightweight slippage proxy for pre-trade (no portfolio context)."""
    # Simple linear proxy: 1 bps at $1M, scaling sublinearly
    bps = 1.0 + (notional_usd / 10_000_000.0) * 0.5
    return [{
        "bucket": "PRE_TRADE",
        "slippage_bps": bps,
        "slippage_usd": notional_usd * bps / 10_000.0,
    }]


async def _emit_tca_audit(
    db: AsyncSession, tenant_id: UUID, user_id: UUID,
    event_type: str, entity_id: UUID,
) -> None:
    """Emit into existing hash-chain audit_events table via build_audit_event()."""
    from app.models.audit_event import GENESIS_HASH, AuditEvent, build_audit_event
    prev_hash_row = (await db.execute(
        select(AuditEvent.event_hash)
        .where(AuditEvent.company_id == tenant_id)
        .order_by(AuditEvent.created_at.desc())
        .limit(1)
    )).scalar_one_or_none()
    prev_hash = prev_hash_row or GENESIS_HASH
    event = build_audit_event(
        company_id=tenant_id,
        user_id=user_id,
        event_type=event_type,  # "TCA_ESTIMATE_CREATED" or "TCA_RECONCILED"
        entity_type="transaction_cost_estimate",
        entity_id=entity_id,
        prev_hash=prev_hash,
        payload={},
    )
    db.add(event)


async def _compute_benchmark(
    db: AsyncSession, tenant_id: UUID, pair: str, current_bps: float,
) -> dict | None:
    """Derive 90-day historical benchmark. Returns None if sample_size < 5."""
    from datetime import timedelta
    cutoff = datetime.now(UTC) - timedelta(days=90)
    stmt = (
        select(TransactionCostEstimate.total_cost_bps)
        .where(
            TransactionCostEstimate.tenant_id == tenant_id,
            TransactionCostEstimate.created_at >= cutoff,
            TransactionCostEstimate.inputs["pair"].astext == pair,
        )
    )
    rows = (await db.execute(stmt)).scalars().all()
    if len(rows) < 5:
        return None
    values = sorted(float(v) for v in rows)
    avg = sum(values) / len(values)
    # percentile of current_bps within historical distribution
    below = sum(1 for v in values if v < current_bps)
    percentile = int((below / len(values)) * 100)
    return {
        "historical_avg_bps_same_pair": round(avg, 4),
        "percentile": percentile,
        "sample_size": len(values),
    }


async def estimate_pre_trade(
    db: AsyncSession,
    tenant_id: UUID,
    user_id: UUID,
    request: PreTradeEstimateRequest,
) -> TransactionCostEstimate:
    """Compute pre-trade cost estimate; persist and return."""
    snapshot = await _get_market_snapshot_for_pretrade(db, tenant_id)
    if snapshot is None:
        raise TCAServiceError("no_market_snapshot", "tenant has no market snapshots")

    # Build synthetic 1-element hedge_actions from trade intent
    hedge_actions = [{
        "bucket": "PRE_TRADE",
        "action_usd": float(request.notional_usd),
        "instrument": request.instrument,
    }]
    slippage_estimates = _estimate_slippage(request.pair, float(request.notional_usd))

    market = snapshot.market_data or {}
    policy = {
        "broker_commission_bps": market.get("default_broker_bps", 2.5),
        "execution_product": request.instrument,
    }

    result = compute_transaction_costs(
        hedge_actions=hedge_actions,
        slippage_estimates=slippage_estimates,
        market=market,
        policy=policy,
        execution_window_hours=float(request.execution_window_hours),
    )
    # Extract single position (pre-trade has exactly one)
    position = result.positions[0] if result.positions else None
    if position is None:
        raise TCAServiceError("engine_produced_no_positions", "engine returned empty")

    outputs = position.to_dict()
    estimate = TransactionCostEstimate(
        tenant_id=tenant_id,
        user_id=user_id,
        estimate_type="pre_trade",
        calculation_run_id=None,
        market_snapshot_id=snapshot.id,
        inputs=request.model_dump(mode="json"),
        outputs=outputs,
        total_cost_usd=Decimal(str(round(position.total_cost, 2))),
        total_cost_bps=Decimal(str(round(position.total_cost_bps, 4))),
    )
    db.add(estimate)
    await db.commit()
    await db.refresh(estimate)

    await _emit_tca_audit(db, tenant_id, user_id, "TCA_ESTIMATE_CREATED", estimate.id)
    await db.commit()

    # Attach benchmark (as a cached attribute — not persisted, re-derived on read)
    estimate._benchmark = await _compute_benchmark(db, tenant_id, request.pair, position.total_cost_bps)

    return estimate


async def _find_estimate_by_run_id(
    db: AsyncSession, calculation_run_id: str,
) -> TransactionCostEstimate | None:
    stmt = select(TransactionCostEstimate).where(
        TransactionCostEstimate.calculation_run_id == calculation_run_id
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def attach_to_calc_run(
    db: AsyncSession,
    calculation_run_id: str,
    tenant_id: UUID,
    user_id: UUID,
    hedge_actions: list[dict],
    slippage_estimates: list[dict],
    market: dict,
    policy: dict,
    market_snapshot_id: UUID,
) -> TransactionCostEstimate:
    """Eagerly called from v1_calculate.py at run time. Idempotent."""
    existing = await _find_estimate_by_run_id(db, calculation_run_id)
    if existing is not None:
        return existing

    result = compute_transaction_costs(
        hedge_actions=hedge_actions,
        slippage_estimates=slippage_estimates,
        market=market,
        policy=policy,
    )
    outputs = result.to_dict()
    total_notional = sum(abs(float(a.get("action_usd", 0))) for a in hedge_actions)

    estimate = TransactionCostEstimate(
        tenant_id=tenant_id,
        user_id=user_id,
        estimate_type="post_calc",
        calculation_run_id=calculation_run_id,
        market_snapshot_id=market_snapshot_id,
        inputs={
            "calculation_run_id": calculation_run_id,
            "hedge_actions_count": len(hedge_actions),
            "total_notional_usd": total_notional,
        },
        outputs=outputs,
        total_cost_usd=Decimal(str(round(result.total_transaction_cost, 2))),
        total_cost_bps=Decimal(str(round(result.total_cost_bps, 4))),
    )
    db.add(estimate)
    await db.commit()
    await db.refresh(estimate)

    await _emit_tca_audit(db, tenant_id, user_id, "TCA_ESTIMATE_CREATED", estimate.id)
    await db.commit()
    return estimate
