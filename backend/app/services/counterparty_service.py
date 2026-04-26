"""counterparty_service — Counterparty Hub orchestrator.

Public surface:
  - create_counterparty / list / get / update
  - create_credit_limit / list_credit_limits / deactivate_credit_limit
  - compute_exposure(counterparty_id, positions)  -> wraps engine
  - compute_portfolio_risk(positions)             -> portfolio-wide view

WORM audit: every mutation emits into audit_events via build_audit_event()
with per-tenant SHA-256 hash chain (FOR UPDATE on prev_hash to prevent race).
"""
from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.engine_v1.counterparty_risk import (
    CounterpartyRiskResult,
    compute_counterparty_exposure,
)
from app.models.counterparty import Counterparty, CreditLimit
from app.schemas_v1.counterparty import (
    CounterpartyCreate,
    CounterpartyUpdate,
    CreditLimitCreate,
    ExposureBreakdown,
    ExposureResponse,
    LimitBreach,
    PortfolioRiskResponse,
)


class CounterpartyServiceError(Exception):
    def __init__(self, code: str, message: str = "") -> None:
        self.code = code
        self.message = message or code
        super().__init__(self.message)


class LimitBreachError(CounterpartyServiceError):
    def __init__(self, breaches: list[LimitBreach]) -> None:
        super().__init__("limit_breach", f"{len(breaches)} limit breach(es) detected")
        self.breaches = breaches


async def _emit_counterparty_audit(
    db: AsyncSession,
    tenant_id: UUID,
    user_id: UUID,
    event_type: str,
    entity_id: UUID,
    entity_type: str = "counterparty",
    extra_payload: dict[str, Any] | None = None,
) -> None:
    """Emit into the WORM audit chain. Mirrors tca_service._emit_tca_audit."""
    from app.models.audit_event import GENESIS_HASH, AuditEvent, build_audit_event

    prev_hash_row = (
        await db.execute(
            select(AuditEvent.event_hash)
            .where(AuditEvent.company_id == tenant_id)
            .order_by(AuditEvent.created_at.desc())
            .limit(1)
            .with_for_update()
        )
    ).scalar_one_or_none()
    prev_hash = prev_hash_row or GENESIS_HASH

    payload: dict[str, Any] = {"entity_id": str(entity_id), "entity_type": entity_type}
    if extra_payload:
        payload.update(extra_payload)

    event = build_audit_event(
        event_type=event_type,
        description=f"{event_type} for {entity_type} {entity_id}",
        payload=payload,
        prev_event_hash=prev_hash,
        company_id=tenant_id,
        actor_id=user_id,
        entity_type=entity_type,
        entity_id=str(entity_id),
    )
    db.add(event)


# ---------------- Counterparty CRUD ----------------


async def create_counterparty(
    db: AsyncSession,
    tenant_id: UUID,
    user_id: UUID,
    request: CounterpartyCreate,
) -> Counterparty:
    dupe = (
        await db.execute(
            select(Counterparty).where(
                Counterparty.tenant_id == tenant_id,
                Counterparty.name == request.name,
            )
        )
    ).scalar_one_or_none()
    if dupe is not None:
        raise CounterpartyServiceError(
            "duplicate_name", f"counterparty '{request.name}' already exists"
        )

    cp = Counterparty(
        tenant_id=tenant_id,
        name=request.name,
        internal_code=request.internal_code,
        legal_entity_name=request.legal_entity_name,
        lei=request.lei,
        credit_rating=request.credit_rating,
        rating_agency=request.rating_agency,
        country_iso=request.country_iso.upper() if request.country_iso else None,
    )
    db.add(cp)
    await db.flush()
    await _emit_counterparty_audit(
        db, tenant_id, user_id, "COUNTERPARTY_CREATED", cp.id
    )
    await db.commit()
    await db.refresh(cp)
    return cp


async def list_counterparties(
    db: AsyncSession,
    tenant_id: UUID,
    active_only: bool = True,
) -> list[Counterparty]:
    stmt = select(Counterparty).where(Counterparty.tenant_id == tenant_id)
    if active_only:
        stmt = stmt.where(Counterparty.active.is_(True))
    stmt = stmt.order_by(Counterparty.name)
    return list((await db.execute(stmt)).scalars().all())


async def get_counterparty(
    db: AsyncSession,
    counterparty_id: UUID,
    tenant_id: UUID,
) -> Counterparty:
    cp = (
        await db.execute(
            select(Counterparty).where(
                Counterparty.id == counterparty_id,
                Counterparty.tenant_id == tenant_id,
            )
        )
    ).scalar_one_or_none()
    if cp is None:
        raise CounterpartyServiceError("counterparty_not_found")
    return cp


async def update_counterparty(
    db: AsyncSession,
    counterparty_id: UUID,
    tenant_id: UUID,
    user_id: UUID,
    update: CounterpartyUpdate,
) -> Counterparty:
    cp = await get_counterparty(db, counterparty_id, tenant_id)
    changed: dict[str, Any] = {}
    for field in (
        "name",
        "internal_code",
        "legal_entity_name",
        "lei",
        "credit_rating",
        "rating_agency",
        "country_iso",
        "active",
    ):
        new_val = getattr(update, field)
        if new_val is not None:
            if field == "country_iso":
                new_val = new_val.upper()
            setattr(cp, field, new_val)
            changed[field] = new_val

    if not changed:
        return cp

    cp.updated_at = datetime.now(UTC)
    await db.flush()
    await _emit_counterparty_audit(
        db, tenant_id, user_id, "COUNTERPARTY_UPDATED", cp.id,
        extra_payload={"changed_fields": list(changed.keys())},
    )
    await db.commit()
    await db.refresh(cp)
    return cp


# ---------------- Credit Limit CRUD ----------------


async def create_credit_limit(
    db: AsyncSession,
    tenant_id: UUID,
    user_id: UUID,
    request: CreditLimitCreate,
) -> CreditLimit:
    # Verify counterparty exists + belongs to tenant
    await get_counterparty(db, request.counterparty_id, tenant_id)

    # Deactivate prior active limit of same type (single-active-per-type invariant)
    prior = (
        await db.execute(
            select(CreditLimit).where(
                CreditLimit.counterparty_id == request.counterparty_id,
                CreditLimit.tenant_id == tenant_id,
                CreditLimit.limit_type == request.limit_type,
                CreditLimit.active.is_(True),
            )
        )
    ).scalars().all()
    for p in prior:
        p.active = False

    limit = CreditLimit(
        counterparty_id=request.counterparty_id,
        tenant_id=tenant_id,
        limit_type=request.limit_type,
        limit_amount_usd=Decimal(str(request.limit_amount_usd)),
        currency=request.currency.upper(),
        effective_date=request.effective_date,
        expiry_date=request.expiry_date,
        created_by_user_id=user_id,
    )
    db.add(limit)
    await db.flush()
    await _emit_counterparty_audit(
        db, tenant_id, user_id, "CREDIT_LIMIT_CREATED", limit.id,
        entity_type="credit_limit",
        extra_payload={
            "counterparty_id": str(request.counterparty_id),
            "limit_type": request.limit_type,
            "limit_amount_usd": float(request.limit_amount_usd),
        },
    )
    await db.commit()
    await db.refresh(limit)
    return limit


async def list_credit_limits(
    db: AsyncSession,
    counterparty_id: UUID,
    tenant_id: UUID,
    active_only: bool = True,
) -> list[CreditLimit]:
    # Cross-tenant guard: verify ownership
    await get_counterparty(db, counterparty_id, tenant_id)

    stmt = select(CreditLimit).where(
        CreditLimit.counterparty_id == counterparty_id,
        CreditLimit.tenant_id == tenant_id,
    )
    if active_only:
        stmt = stmt.where(CreditLimit.active.is_(True))
    stmt = stmt.order_by(CreditLimit.limit_type, CreditLimit.created_at.desc())
    return list((await db.execute(stmt)).scalars().all())


async def deactivate_credit_limit(
    db: AsyncSession,
    limit_id: UUID,
    tenant_id: UUID,
    user_id: UUID,
) -> CreditLimit:
    limit = (
        await db.execute(
            select(CreditLimit).where(
                CreditLimit.id == limit_id,
                CreditLimit.tenant_id == tenant_id,
            )
        )
    ).scalar_one_or_none()
    if limit is None:
        raise CounterpartyServiceError("credit_limit_not_found")
    if not limit.active:
        return limit
    limit.active = False
    await db.flush()
    await _emit_counterparty_audit(
        db, tenant_id, user_id, "CREDIT_LIMIT_DEACTIVATED", limit.id,
        entity_type="credit_limit",
    )
    await db.commit()
    await db.refresh(limit)
    return limit


# ---------------- Exposure Computation ----------------


def _exposure_to_schema(exp: Any) -> ExposureBreakdown:
    """Convert engine's CounterpartyExposure dataclass to Pydantic schema."""
    return ExposureBreakdown(
        counterparty_id=exp.counterparty_id,
        counterparty_name=exp.counterparty_name,
        gross_notional_usd=exp.gross_notional_usd,
        net_notional_usd=exp.net_notional_usd,
        pfe_97_5=exp.pfe_97_5,
        mark_to_market=exp.mark_to_market,
        isda_threshold=exp.isda_threshold,
        exposure_above_threshold=exp.exposure_above_threshold,
        concentration_pct=exp.concentration_pct,
    )


def _detect_breaches(
    exposure: Any,
    limits: list[CreditLimit],
) -> list[LimitBreach]:
    """Compare engine exposure metrics against active credit limits."""
    breaches: list[LimitBreach] = []
    metric_map = {
        "notional": abs(exposure.net_notional_usd),
        "pfe": exposure.pfe_97_5,
        "settlement": exposure.mark_to_market,
        "isda_threshold": exposure.exposure_above_threshold,
    }
    for lim in limits:
        actual = metric_map.get(lim.limit_type, 0.0)
        limit_amt = float(lim.limit_amount_usd)
        if limit_amt <= 0:
            continue
        util = actual / limit_amt
        if util < 0.80:
            continue
        breaches.append(
            LimitBreach(
                limit_id=lim.id,
                limit_type=lim.limit_type,  # type: ignore[arg-type]
                limit_amount_usd=limit_amt,
                actual_amount_usd=actual,
                utilization_pct=round(util * 100, 2),
                severity="BREACH" if util >= 1.0 else "WARNING",
            )
        )
    return breaches


async def compute_exposure(
    db: AsyncSession,
    counterparty_id: UUID,
    tenant_id: UUID,
    user_id: UUID,
    positions: list[dict[str, Any]],
    volatility_annual: float = 0.10,
    time_horizon_years: float = 1.0,
) -> ExposureResponse:
    """Compute exposure for a single counterparty and persist cached metrics.

    `positions` is caller-supplied (positions model has no counterparty_id yet);
    caller filters to positions attributable to this counterparty.
    """
    cp = await get_counterparty(db, counterparty_id, tenant_id)

    # Stamp each position with counterparty identity so the engine groups correctly
    enriched: list[dict[str, Any]] = []
    for pos in positions:
        p = dict(pos)
        p.setdefault("counterparty_id", str(cp.id))
        p.setdefault("counterparty_name", cp.name)
        enriched.append(p)

    result = compute_counterparty_exposure(
        positions=enriched,
        volatility_annual=volatility_annual,
        time_horizon_years=time_horizon_years,
    )
    cp_exp = next(
        (e for e in result.exposures if e.counterparty_id == str(cp.id)),
        None,
    )
    if cp_exp is None:
        # No positions → empty exposure
        from app.engine_v1.counterparty_risk import CounterpartyExposure
        cp_exp = CounterpartyExposure(
            counterparty_id=str(cp.id),
            counterparty_name=cp.name,
            gross_notional_usd=0.0,
            net_notional_usd=0.0,
            pfe_97_5=0.0,
            mark_to_market=0.0,
            isda_threshold=0.0,
            exposure_above_threshold=0.0,
            concentration_pct=0.0,
        )

    limits = await list_credit_limits(db, counterparty_id, tenant_id, active_only=True)
    breaches = _detect_breaches(cp_exp, limits)

    # Persist cached metrics
    cp.last_exposure_usd = Decimal(str(round(abs(cp_exp.net_notional_usd), 2)))
    cp.last_pfe_usd = Decimal(str(round(cp_exp.pfe_97_5, 2)))
    cp.risk_level_cached = result.risk_level
    cp.last_scored_at = datetime.now(UTC)
    await db.flush()
    await _emit_counterparty_audit(
        db, tenant_id, user_id, "COUNTERPARTY_EXPOSURE_COMPUTED", cp.id,
        extra_payload={
            "gross_usd": cp_exp.gross_notional_usd,
            "pfe_97_5": cp_exp.pfe_97_5,
            "breach_count": len(breaches),
            "risk_level": result.risk_level,
        },
    )
    await db.commit()
    await db.refresh(cp)

    from app.schemas_v1.counterparty import CreditLimitResponse
    return ExposureResponse(
        counterparty_id=cp.id,
        counterparty_name=cp.name,
        as_of=cp.last_scored_at or datetime.now(UTC),
        exposure=_exposure_to_schema(cp_exp),
        limits=[CreditLimitResponse.model_validate(lim) for lim in limits],
        breaches=breaches,
        risk_level=result.risk_level,  # type: ignore[arg-type]
    )


async def compute_portfolio_risk(
    db: AsyncSession,
    tenant_id: UUID,
    positions: list[dict[str, Any]],
    volatility_annual: float = 0.10,
    time_horizon_years: float = 1.0,
) -> PortfolioRiskResponse:
    """Portfolio-wide concentration + PFE view across all counterparties."""
    result: CounterpartyRiskResult = compute_counterparty_exposure(
        positions=positions,
        volatility_annual=volatility_annual,
        time_horizon_years=time_horizon_years,
    )
    return PortfolioRiskResponse(
        as_of=datetime.now(UTC),
        total_gross_usd=result.total_gross_usd,
        total_net_usd=result.total_net_usd,
        total_pfe_usd=result.total_pfe_usd,
        largest_cp_pct=result.largest_cp_pct,
        risk_level=result.risk_level,  # type: ignore[arg-type]
        exposures=[_exposure_to_schema(e) for e in result.exposures],
    )
