"""natural_hedging_service — Natural-hedging optimizer.

Thin adapter around `engine_v1.currency_netting_matrix.compute_currency_netting`.
The engine is a pure function — this service adds:
  1. A request-shape wrapper for ad-hoc analysis (exposures dict → result)
  2. A position-aggregator that turns tenant A/R + A/P positions into
     per-pair net exposures (convention: `<CCY><REPORTING>`).

No WORM / no DB mutation. Results are compute-only and safe to call repeatedly.

Public surface:
  - analyze(exposures, fx_rates) -> NettingResult.to_dict()
  - analyze_from_positions(db, tenant_id, reporting_currency, fx_rates, statuses)
"""
from __future__ import annotations

from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.engine_v1.currency_netting_matrix import (
    NettingResult,
    compute_currency_netting,
)
from app.models.position import Position


def analyze(
    exposures: dict[str, float],
    fx_rates: dict[str, float] | None = None,
) -> dict[str, Any]:
    """Run natural-hedging netting on an ad-hoc exposures dict."""
    result: NettingResult = compute_currency_netting(exposures, fx_rates or {})
    return result.to_dict()


async def _aggregate_positions(
    db: AsyncSession,
    tenant_id: UUID,
    reporting_currency: str,
    statuses: list[str] | None = None,
) -> tuple[dict[str, float], dict[str, dict[str, float]]]:
    """Aggregate active positions into per-pair net exposures.

    Convention: for each non-reporting currency `CCY`, the pair is
    `<CCY><REPORTING>` and the amount is net_amount_ccy (AR positive, AP
    negative). Positions already in `reporting_currency` are skipped (no FX
    exposure).

    Returns:
      exposures_by_pair: {pair: net_amount_in_foreign_ccy}
      breakdown_by_ccy: {ccy: {"ar": sum_ar, "ap": sum_ap, "net": net}}
    """
    stmt = select(Position).where(
        Position.company_id == tenant_id,
        Position.is_active.is_(True),
    )
    if statuses:
        stmt = stmt.where(Position.status.in_(statuses))
    rows = (await db.execute(stmt)).scalars().all()

    breakdown: dict[str, dict[str, float]] = {}
    reporting = reporting_currency.upper()

    for p in rows:
        ccy = (p.currency or "").upper()
        if not ccy or ccy == reporting:
            continue
        amt = float(p.amount) if isinstance(p.amount, Decimal) else float(p.amount or 0)
        entry = breakdown.setdefault(ccy, {"ar": 0.0, "ap": 0.0, "net": 0.0})
        flow = (p.flow_type or "").upper()
        if flow == "AR":
            entry["ar"] += amt
        elif flow == "AP":
            entry["ap"] += amt

    for ccy, entry in breakdown.items():
        entry["net"] = entry["ar"] - entry["ap"]

    exposures: dict[str, float] = {
        f"{ccy}{reporting}": entry["net"]
        for ccy, entry in breakdown.items()
        if entry["net"] != 0.0
    }
    return exposures, breakdown


async def analyze_from_positions(
    db: AsyncSession,
    tenant_id: UUID,
    reporting_currency: str = "USD",
    fx_rates: dict[str, float] | None = None,
    statuses: list[str] | None = None,
) -> dict[str, Any]:
    """Aggregate tenant positions into pair exposures, then run the optimizer.

    Returns the engine's NettingResult dict plus a `source` payload showing
    the derived exposures and per-currency AR/AP breakdown (so the UI can
    explain *why* the optimizer produced its recommendations).
    """
    exposures, breakdown = await _aggregate_positions(
        db, tenant_id, reporting_currency, statuses
    )
    result = analyze(exposures, fx_rates)
    return {
        "source": {
            "reporting_currency": reporting_currency.upper(),
            "derived_exposures": exposures,
            "per_currency_breakdown": breakdown,
        },
        "netting": result,
    }
