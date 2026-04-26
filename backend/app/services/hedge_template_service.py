"""
Hedge Templates service (P2-C).

A library of reusable hedge strategy blueprints. System templates are seeded
once and visible to all tenants. Company templates are tenant-scoped.

Apply logic converts a template + exposure (position) into a concrete list of
proposed hedge legs, each with a resolved value_date, notional, and direction.
No DB mutation — the applied output is a spec the caller can feed to the
execution proposal pipeline.
"""
from __future__ import annotations

import logging
from datetime import UTC, date, datetime, timedelta
from typing import Any
from uuid import UUID

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.hedge_template import HedgeTemplate
from app.models.position import Position
from app.models.user import User

log = logging.getLogger(__name__)

_VALID_INSTRUMENTS = {"FORWARD", "VANILLA_CALL", "VANILLA_PUT", "NDF", "COLLAR"}
_VALID_CATEGORIES = {"FORWARD", "OPTION", "LAYERED", "ROLLING", "COLLAR", "MIXED"}
_VALID_DIRECTIONS = {"BUY", "SELL"}
_WEIGHT_TOLERANCE = 1e-4


class HedgeTemplateError(ValueError):
    """Raised when template input fails validation."""


# ── System template seeds ────────────────────────────────────────────

SYSTEM_TEMPLATES: list[dict[str, Any]] = [
    {
        "short_name": "FWD100",
        "name": "Forward Hedge 100%",
        "description": "Single forward contract covering 100% of notional, maturing at the position's value date. Simplest, full-coverage strategy.",
        "category": "FORWARD",
        "instrument_mix": [
            {
                "instrument": "FORWARD", "weight": 1.0,
                "tenor_days": None, "strike_pct": None,
                "direction": "SELL", "tranche_label": "Full",
            },
        ],
    },
    {
        "short_name": "LAY3",
        "name": "Layered Hedge (3 Tranches)",
        "description": "Phased forward coverage: 50% at 3 months, 30% at 6 months, 20% at 12 months. Reduces point-in-time execution risk.",
        "category": "LAYERED",
        "instrument_mix": [
            {"instrument": "FORWARD", "weight": 0.50, "tenor_days": 90,
             "strike_pct": None, "direction": "SELL", "tranche_label": "3-Month"},
            {"instrument": "FORWARD", "weight": 0.30, "tenor_days": 180,
             "strike_pct": None, "direction": "SELL", "tranche_label": "6-Month"},
            {"instrument": "FORWARD", "weight": 0.20, "tenor_days": 365,
             "strike_pct": None, "direction": "SELL", "tranche_label": "12-Month"},
        ],
    },
    {
        "short_name": "ROLL12",
        "name": "Rolling 12-Month",
        "description": "12 equal monthly forwards (1/12 notional each) rolling out one year. Smooths execution cost across the forward curve.",
        "category": "ROLLING",
        "instrument_mix": [
            {"instrument": "FORWARD", "weight": 1.0 / 12, "tenor_days": 30 * i,
             "strike_pct": None, "direction": "SELL",
             "tranche_label": f"Month {i}"}
            for i in range(1, 13)
        ],
    },
    {
        "short_name": "COLLAR95",
        "name": "Collar 95/105",
        "description": "Protective put at 95% of spot + covered call at 105%. Costless (or near-costless) band hedge with upside participation up to 5%.",
        "category": "COLLAR",
        "instrument_mix": [
            {"instrument": "VANILLA_PUT", "weight": 1.0, "tenor_days": None,
             "strike_pct": 0.95, "direction": "BUY", "tranche_label": "Put floor"},
            {"instrument": "VANILLA_CALL", "weight": 1.0, "tenor_days": None,
             "strike_pct": 1.05, "direction": "SELL", "tranche_label": "Call cap"},
        ],
    },
    {
        "short_name": "FWDOPT5050",
        "name": "50/50 Forward + Option",
        "description": "Half notional locked via forward, half via ATM vanilla option. Balances cost certainty and flexibility.",
        "category": "MIXED",
        "instrument_mix": [
            {"instrument": "FORWARD", "weight": 0.50, "tenor_days": None,
             "strike_pct": None, "direction": "SELL", "tranche_label": "Locked"},
            {"instrument": "VANILLA_PUT", "weight": 0.50, "tenor_days": None,
             "strike_pct": 1.00, "direction": "BUY", "tranche_label": "Flex"},
        ],
    },
]


# ── Validation ───────────────────────────────────────────────────────

def validate_instrument_mix(mix: list[dict[str, Any]]) -> None:
    """Raise HedgeTemplateError if the instrument mix is malformed."""
    if not isinstance(mix, list) or not mix:
        raise HedgeTemplateError("instrument_mix must be a non-empty list")

    total_weight = 0.0
    for i, leg in enumerate(mix):
        if not isinstance(leg, dict):
            raise HedgeTemplateError(f"leg[{i}] must be an object")
        instrument = leg.get("instrument")
        if instrument not in _VALID_INSTRUMENTS:
            raise HedgeTemplateError(
                f"leg[{i}].instrument '{instrument}' must be one of {sorted(_VALID_INSTRUMENTS)}"
            )
        weight = leg.get("weight")
        if not isinstance(weight, int | float) or not 0 < weight <= 1:
            raise HedgeTemplateError(f"leg[{i}].weight must be a number in (0, 1]")
        total_weight += float(weight)
        direction = leg.get("direction")
        if direction not in _VALID_DIRECTIONS:
            raise HedgeTemplateError(
                f"leg[{i}].direction must be BUY or SELL"
            )
        tenor = leg.get("tenor_days")
        if tenor is not None and (not isinstance(tenor, int) or tenor <= 0):
            raise HedgeTemplateError(
                f"leg[{i}].tenor_days must be a positive int or null"
            )
        strike = leg.get("strike_pct")
        if strike is not None and (not isinstance(strike, int | float) or strike <= 0):
            raise HedgeTemplateError(
                f"leg[{i}].strike_pct must be a positive number or null"
            )
        if instrument in {"VANILLA_CALL", "VANILLA_PUT"} and strike is None:
            raise HedgeTemplateError(
                f"leg[{i}]: option instruments require a strike_pct"
            )

    # Sum-of-weights check: for collars, weights can double up (put+call on same notional);
    # otherwise weights should sum to 1.0. We allow either exactly 1.0 or exactly 2.0 for
    # hedge-pair constructs like collar/put-call-spread.
    if abs(total_weight - 1.0) > _WEIGHT_TOLERANCE and abs(total_weight - 2.0) > _WEIGHT_TOLERANCE:
        raise HedgeTemplateError(
            f"sum(weight) must be 1.0 (sequential tranches) or 2.0 (paired legs); got {total_weight:.4f}"
        )


# ── CRUD ─────────────────────────────────────────────────────────────

async def list_templates(
    session: AsyncSession,
    user: User,
    *,
    category: str | None = None,
    include_system: bool = True,
    include_inactive: bool = False,
) -> list[HedgeTemplate]:
    """Return system templates + this tenant's custom templates."""
    filters = []
    visibility = []
    if include_system:
        visibility.append(HedgeTemplate.company_id.is_(None))
    visibility.append(HedgeTemplate.company_id == user.company_id)
    filters.append(or_(*visibility))
    if category:
        filters.append(HedgeTemplate.category == category.upper())
    if not include_inactive:
        filters.append(HedgeTemplate.is_active.is_(True))

    stmt = (
        select(HedgeTemplate)
        .where(and_(*filters))
        .order_by(HedgeTemplate.is_system.desc(), HedgeTemplate.name.asc())
    )
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def get_template(
    session: AsyncSession, user: User, template_id: UUID,
) -> HedgeTemplate:
    tmpl = await session.get(HedgeTemplate, template_id)
    if tmpl is None:
        raise HedgeTemplateError(f"template {template_id} not found")
    if tmpl.company_id is not None and tmpl.company_id != user.company_id:
        raise HedgeTemplateError(f"template {template_id} not found")
    return tmpl


async def create_template(
    session: AsyncSession,
    user: User,
    *,
    name: str,
    short_name: str,
    category: str,
    instrument_mix: list[dict[str, Any]],
    description: str | None = None,
) -> HedgeTemplate:
    if category.upper() not in _VALID_CATEGORIES:
        raise HedgeTemplateError(
            f"category must be one of {sorted(_VALID_CATEGORIES)}"
        )
    validate_instrument_mix(instrument_mix)

    tmpl = HedgeTemplate(
        company_id=user.company_id,
        name=name.strip(),
        short_name=short_name.strip().upper(),
        description=description,
        category=category.upper(),
        instrument_mix=instrument_mix,
        is_system=False,
        is_active=True,
        created_by=user.id,
    )
    session.add(tmpl)
    await session.commit()
    await session.refresh(tmpl)
    return tmpl


async def update_template(
    session: AsyncSession,
    user: User,
    template_id: UUID,
    *,
    name: str | None = None,
    description: str | None = None,
    category: str | None = None,
    instrument_mix: list[dict[str, Any]] | None = None,
    is_active: bool | None = None,
) -> HedgeTemplate:
    tmpl = await get_template(session, user, template_id)
    if tmpl.is_system:
        raise HedgeTemplateError("system templates are immutable")
    if tmpl.company_id != user.company_id:
        raise HedgeTemplateError("cross-tenant modification denied")

    if name is not None:
        tmpl.name = name.strip()
    if description is not None:
        tmpl.description = description
    if category is not None:
        if category.upper() not in _VALID_CATEGORIES:
            raise HedgeTemplateError(
                f"category must be one of {sorted(_VALID_CATEGORIES)}"
            )
        tmpl.category = category.upper()
    if instrument_mix is not None:
        validate_instrument_mix(instrument_mix)
        tmpl.instrument_mix = instrument_mix
        tmpl.version = (tmpl.version or 1) + 1
    if is_active is not None:
        tmpl.is_active = is_active
    tmpl.updated_at = datetime.now(UTC)
    tmpl.updated_by = user.id

    await session.commit()
    await session.refresh(tmpl)
    return tmpl


async def delete_template(
    session: AsyncSession, user: User, template_id: UUID,
) -> None:
    tmpl = await get_template(session, user, template_id)
    if tmpl.is_system:
        raise HedgeTemplateError("system templates cannot be deleted")
    if tmpl.company_id != user.company_id:
        raise HedgeTemplateError("cross-tenant deletion denied")
    tmpl.is_active = False
    tmpl.updated_at = datetime.now(UTC)
    tmpl.updated_by = user.id
    await session.commit()


# ── Apply ────────────────────────────────────────────────────────────

def apply_template_to_position(
    template: HedgeTemplate,
    position: Position,
    *,
    today: date | None = None,
) -> list[dict[str, Any]]:
    """
    Resolve a template + exposure into a concrete list of hedge leg specs.

    Each returned leg has:
      instrument, notional, currency, value_date, strike_pct, direction,
      tranche_label, weight

    No DB side effect — this is a pure-function projection the caller can feed
    to the execution proposal pipeline.
    """
    ref_date = today or datetime.now(UTC).date()
    exposure_value_date = position.value_date
    if isinstance(exposure_value_date, str):
        exposure_value_date = date.fromisoformat(exposure_value_date)

    # AR → we're net long the foreign currency on value_date → default SELL foreign forward
    # AP → we're net short → default BUY foreign forward
    # Template legs define their own direction; we just pass through.

    notional = float(position.amount)
    currency = position.currency

    legs: list[dict[str, Any]] = []
    for leg in template.instrument_mix:
        tenor = leg.get("tenor_days")
        if tenor is None:
            value_date = exposure_value_date
        else:
            value_date = ref_date + timedelta(days=int(tenor))

        legs.append({
            "instrument": leg["instrument"],
            "notional": round(notional * float(leg["weight"]), 2),
            "currency": currency,
            "value_date": value_date.isoformat(),
            "strike_pct": leg.get("strike_pct"),
            "direction": leg["direction"],
            "tranche_label": leg.get("tranche_label"),
            "weight": float(leg["weight"]),
        })
    return legs


# ── Seed ─────────────────────────────────────────────────────────────

async def seed_system_templates(session: AsyncSession) -> int:
    """
    Idempotently seed the 5 system templates. Returns count of templates inserted.
    Safe to call at app startup or via a one-shot admin command.
    """
    inserted = 0
    for spec in SYSTEM_TEMPLATES:
        stmt = select(HedgeTemplate).where(
            HedgeTemplate.short_name == spec["short_name"],
            HedgeTemplate.is_system.is_(True),
        )
        existing = (await session.execute(stmt)).scalar_one_or_none()
        if existing is not None:
            continue
        tmpl = HedgeTemplate(
            company_id=None,
            name=spec["name"],
            short_name=spec["short_name"],
            description=spec["description"],
            category=spec["category"],
            instrument_mix=spec["instrument_mix"],
            is_system=True,
            is_active=True,
        )
        session.add(tmpl)
        inserted += 1
    if inserted:
        await session.commit()
        log.info("Seeded %d system hedge templates", inserted)
    return inserted
