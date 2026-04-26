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
        .with_for_update()
    )).scalar_one_or_none()
    prev_hash = prev_hash_row or GENESIS_HASH
    event = build_audit_event(
        event_type=event_type,  # "TCA_ESTIMATE_CREATED" or "TCA_RECONCILED"
        description=f"{event_type} for transaction_cost_estimate {entity_id}",
        payload={"entity_id": str(entity_id)},
        prev_event_hash=prev_hash,
        company_id=tenant_id,
        actor_id=user_id,
        entity_type="transaction_cost_estimate",
        entity_id=str(entity_id),
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

    market = snapshot.payload or {}
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
    await db.flush()

    await _emit_tca_audit(db, tenant_id, user_id, "TCA_ESTIMATE_CREATED", estimate.id)
    await db.commit()
    await db.refresh(estimate)

    # Attach benchmark (as a cached attribute — not persisted, re-derived on read)
    estimate._benchmark = await _compute_benchmark(db, tenant_id, request.pair, position.total_cost_bps)

    return estimate


async def _find_estimate_by_run_id(
    db: AsyncSession, calculation_run_id: str, tenant_id: UUID,
) -> TransactionCostEstimate | None:
    stmt = select(TransactionCostEstimate).where(
        TransactionCostEstimate.calculation_run_id == calculation_run_id,
        TransactionCostEstimate.tenant_id == tenant_id,
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
    existing = await _find_estimate_by_run_id(db, calculation_run_id, tenant_id)
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
    await db.flush()

    await _emit_tca_audit(db, tenant_id, user_id, "TCA_ESTIMATE_CREATED", estimate.id)
    await db.commit()
    await db.refresh(estimate)
    return estimate


async def _load_estimate_and_settlement(
    db: AsyncSession,
    estimate_id: UUID,
    settlement_event_id: UUID,
    caller_tenant_id: UUID | None = None,
):
    from app.models.settlement_event import SettlementEvent
    est_stmt = select(TransactionCostEstimate).where(TransactionCostEstimate.id == estimate_id)
    if caller_tenant_id is not None:
        est_stmt = est_stmt.where(TransactionCostEstimate.tenant_id == caller_tenant_id)
    est = (await db.execute(est_stmt)).scalar_one_or_none()
    if est is None:
        raise TCAServiceError("estimate_not_found")
    settle_stmt = select(SettlementEvent).where(SettlementEvent.id == settlement_event_id)
    if caller_tenant_id is not None:
        settle_stmt = settle_stmt.where(SettlementEvent.company_id == caller_tenant_id)
    settle = (await db.execute(settle_stmt)).scalar_one_or_none()
    if settle is None:
        raise TCAServiceError("settlement_not_found")
    # Cross-tenant isolation guard (belt-and-suspenders)
    if settle.company_id != est.tenant_id:
        raise TCAServiceError("cross_tenant", "settlement and estimate belong to different tenants")
    return est, settle


async def reconcile_actual(
    db: AsyncSession,
    estimate_id: UUID,
    settlement_event_id: UUID,
    reconciling_user_id: UUID,
    caller_tenant_id: UUID | None = None,
) -> TransactionCostEstimate:
    """Backfill actual_cost_usd + variance_bps from settlement.pnl_impact.

    SoD: post_calc estimates can't be reconciled by their creator.
    Pre-trade estimates can be self-reconciled (advisory, not governance).
    """
    estimate, settlement = await _load_estimate_and_settlement(
        db, estimate_id, settlement_event_id, caller_tenant_id=caller_tenant_id,
    )
    if estimate.reconciled_at is not None:
        raise TCAServiceError("already_reconciled")

    if estimate.estimate_type == "post_calc" and estimate.user_id == reconciling_user_id:
        raise SODViolationError()

    # v1 proxy: actual execution cost = |pnl_impact| (rate deviation × notional)
    actual_cost_usd = abs(float(settlement.pnl_impact))
    notional = float(estimate.inputs.get("notional_usd") or estimate.inputs.get("total_notional_usd") or 1.0)
    variance_bps = (actual_cost_usd - float(estimate.total_cost_usd)) / notional * 10_000.0

    estimate.actual_cost_usd = Decimal(str(round(actual_cost_usd, 2)))
    estimate.variance_bps = Decimal(str(round(variance_bps, 4)))
    estimate.settlement_event_id = settlement.id
    estimate.reconciled_at = datetime.now(UTC)
    await db.flush()

    await _emit_tca_audit(
        db, estimate.tenant_id, reconciling_user_id,
        "TCA_RECONCILED", estimate.id,
    )
    await db.commit()
    await db.refresh(estimate)
    return estimate


async def auto_reconcile_on_settlement(
    db: AsyncSession, settlement_event,
) -> None:
    """Best-effort match SettlementEvent → open estimate. Non-fatal on failure."""
    try:
        lo = float(settlement_event.hedge_amount) * 0.95
        hi = float(settlement_event.hedge_amount) * 1.05
        stmt = (
            select(TransactionCostEstimate)
            .where(
                TransactionCostEstimate.tenant_id == settlement_event.company_id,
                TransactionCostEstimate.reconciled_at.is_(None),
            )
        )
        candidates = (await db.execute(stmt)).scalars().all()
        # Filter by notional band + settlement_date equality in Python (inputs is JSONB)
        matches = []
        for c in candidates:
            notional = float(c.inputs.get("notional_usd") or c.inputs.get("total_notional_usd") or 0)
            if lo <= notional <= hi:
                matches.append(c)
        if len(matches) != 1:
            return  # 0 or >1 → skip, user can manually reconcile

        # System-principal reconcile — bypass SoD by using a sentinel user_id
        await reconcile_actual(
            db=db,
            estimate_id=matches[0].id,
            settlement_event_id=settlement_event.id,
            reconciling_user_id=UUID("00000000-0000-0000-0000-000000000000"),  # system
            caller_tenant_id=settlement_event.company_id,
        )
    except Exception:  # non-fatal
        import logging
        logging.getLogger(__name__).warning(
            "auto_reconcile_on_settlement failed for settlement_event=%s", settlement_event.id,
            exc_info=True,
        )


async def get_accuracy_report(
    db: AsyncSession,
    tenant_id: UUID,
    period: str,
    group_by: str = "pair",
):
    import math

    from app.schemas_v1.tca import AccuracyBucket, AccuracyReportResponse

    # Load all reconciled estimates for the tenant (period filter in Python for SQLite compat)
    stmt = (
        select(TransactionCostEstimate)
        .where(
            TransactionCostEstimate.tenant_id == tenant_id,
            TransactionCostEstimate.reconciled_at.isnot(None),
        )
    )
    rows = (await db.execute(stmt)).scalars().all()

    if not rows:
        return AccuracyReportResponse(
            period=period, group_by=group_by,
            total_reconciled=0, buckets=[],
        )

    # Group by key
    groups: dict[str, list[float]] = {}
    for r in rows:
        if group_by == "pair":
            key = r.inputs.get("pair", "UNKNOWN")
        elif group_by == "instrument":
            key = r.inputs.get("instrument", "UNKNOWN")
        elif group_by == "month":
            key = r.reconciled_at.strftime("%Y-%m")
        else:
            key = "all"
        groups.setdefault(key, []).append(float(r.variance_bps or 0))

    buckets = []
    for key, values in sorted(groups.items()):
        n = len(values)
        mean = sum(values) / n
        stdev = math.sqrt(sum((v - mean) ** 2 for v in values) / n) if n > 1 else 0.0
        mae = sum(abs(v) for v in values) / n
        rmse = math.sqrt(sum(v ** 2 for v in values) / n)
        bias = "OVER_ESTIMATE" if mean > 0.1 else "UNDER_ESTIMATE" if mean < -0.1 else "NEUTRAL"
        buckets.append(AccuracyBucket(
            key=key, sample_size=n,
            mean_variance_bps=round(mean, 4),
            stdev_variance_bps=round(stdev, 4),
            mae_bps=round(mae, 4),
            rmse_bps=round(rmse, 4),
            bias_direction=bias,
        ))

    return AccuracyReportResponse(
        period=period, group_by=group_by,
        total_reconciled=len(rows), buckets=buckets,
    )
