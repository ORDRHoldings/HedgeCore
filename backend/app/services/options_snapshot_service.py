"""app/services/options_snapshot_service.py

OptionsSnapshot service layer — WORM options chain snapshots.
Follows forward_curve_service.py pattern exactly.
"""
from __future__ import annotations

import hashlib
import json as _json
import uuid as _uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.options_snapshot import OptionsSnapshot
from app.models.user import User


def build_canonical_payload(payload: dict) -> str:
    return _json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str, ensure_ascii=True)


def build_snapshot_hash(canonical_json: str) -> str:
    return hashlib.sha256(canonical_json.encode("utf-8")).hexdigest()


async def create_or_get(
    session: AsyncSession,
    user: User,
    *,
    underlying: str,
    expiry: str,
    strike: float,
    option_type: str,
    as_of: datetime | str,
    source: str,
    bid: float | None = None,
    ask: float | None = None,
    last: float | None = None,
    volume: int | None = None,
    open_interest: int | None = None,
    implied_vol: float | None = None,
    delta: float | None = None,
    gamma: float | None = None,
    theta: float | None = None,
    vega: float | None = None,
    payload: dict | None = None,
) -> OptionsSnapshot:
    underlying = underlying.upper().strip()
    option_type = option_type.upper().strip()
    source = source.upper().strip()

    if isinstance(as_of, str):
        try:
            as_of_dt = datetime.fromisoformat(as_of.replace("Z", "+00:00"))
        except (ValueError, TypeError):
            as_of_dt = datetime.now(UTC)
    else:
        as_of_dt = as_of
    if as_of_dt.tzinfo is None:
        as_of_dt = as_of_dt.replace(tzinfo=UTC)

    hash_payload = {
        "underlying": underlying,
        "expiry": expiry,
        "strike": strike,
        "option_type": option_type,
        "as_of": as_of_dt.isoformat(),
        "source": source,
    }
    canonical = build_canonical_payload(hash_payload)
    snapshot_hash = build_snapshot_hash(canonical)

    existing = await _find_by_hash(session, user.company_id, snapshot_hash)
    if existing:
        return existing

    row = OptionsSnapshot(
        id=_uuid.uuid4(),
        company_id=user.company_id,
        underlying=underlying,
        expiry=expiry,
        strike=strike,
        option_type=option_type,
        as_of=as_of_dt,
        source=source,
        data_class="LIVE",
        bid=bid,
        ask=ask,
        last=last,
        volume=volume,
        open_interest=open_interest,
        implied_vol=implied_vol,
        delta=delta,
        gamma=gamma,
        theta=theta,
        vega=vega,
        payload=payload,
        snapshot_hash=snapshot_hash,
    )
    session.add(row)
    try:
        await session.commit()
        await session.refresh(row)
    except Exception:
        await session.rollback()
        existing = await _find_by_hash(session, user.company_id, snapshot_hash)
        if existing:
            return existing
        raise

    return row


async def get_by_id(session: AsyncSession, snapshot_id: _uuid.UUID, company_id: _uuid.UUID) -> OptionsSnapshot | None:
    row = await session.get(OptionsSnapshot, snapshot_id)
    if not row:
        return None
    if row.company_id != company_id:
        return None
    return row


async def get_latest_by_underlying(session: AsyncSession, underlying: str, company_id: _uuid.UUID) -> list[OptionsSnapshot]:
    q = (
        select(OptionsSnapshot)
        .where(OptionsSnapshot.underlying == underlying.upper(), OptionsSnapshot.company_id == company_id)
        .order_by(OptionsSnapshot.as_of.desc())
        .limit(100)
    )
    result = await session.execute(q)
    return list(result.scalars().all())


async def _find_by_hash(session: AsyncSession, company_id: _uuid.UUID, snapshot_hash: str) -> OptionsSnapshot | None:
    q = (
        select(OptionsSnapshot)
        .where(OptionsSnapshot.company_id == company_id, OptionsSnapshot.snapshot_hash == snapshot_hash)
        .limit(1)
    )
    result = await session.execute(q)
    return result.scalars().first()
