"""app/services/equity_snapshot_service.py

EquitySnapshot service layer — WORM equity/index snapshots.
Follows forward_curve_service.py pattern exactly.
"""
from __future__ import annotations

import hashlib
import json as _json
import uuid as _uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.equity_snapshot import EquitySnapshot
from app.models.user import User


def build_canonical_payload(payload: dict) -> str:
    return _json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str, ensure_ascii=True)


def build_snapshot_hash(canonical_json: str) -> str:
    return hashlib.sha256(canonical_json.encode("utf-8")).hexdigest()


DEFAULT_STALENESS_THRESHOLD_MINUTES = 5  # 5 min for equity


def evaluate_staleness(as_of: datetime, threshold_minutes: int = DEFAULT_STALENESS_THRESHOLD_MINUTES) -> tuple[bool, int]:
    now = datetime.now(UTC)
    if as_of.tzinfo is None:
        as_of = as_of.replace(tzinfo=UTC)
    delta = now - as_of
    staleness_minutes = int(delta.total_seconds() / 60)
    return staleness_minutes > threshold_minutes, staleness_minutes


async def create_or_get(
    session: AsyncSession,
    user: User,
    *,
    symbol: str,
    as_of: datetime | str,
    source: str,
    data_class: str,
    open_: float | None = None,
    high: float | None = None,
    low: float | None = None,
    close: float,
    volume: int | None = None,
    change_pct: float | None = None,
    market_cap: float | None = None,
    vwap: float | None = None,
    pe_ratio: float | None = None,
    payload: dict | None = None,
) -> EquitySnapshot:
    symbol = symbol.upper().strip()
    source = source.upper().strip()
    data_class = data_class.upper().strip()

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
        "symbol": symbol,
        "as_of": as_of_dt.isoformat(),
        "source": source,
        "close": close,
    }
    canonical = build_canonical_payload(hash_payload)
    snapshot_hash = build_snapshot_hash(canonical)

    existing = await _find_by_hash(session, user.company_id, snapshot_hash)
    if existing:
        return existing

    is_stale, staleness_minutes = evaluate_staleness(as_of_dt)

    row = EquitySnapshot(
        id=_uuid.uuid4(),
        company_id=user.company_id,
        symbol=symbol,
        as_of=as_of_dt,
        source=source,
        data_class=data_class,
        open=open_,
        high=high,
        low=low,
        close=close,
        volume=volume,
        vwap=vwap,
        change_pct=change_pct,
        market_cap=market_cap,
        pe_ratio=pe_ratio,
        payload=payload,
        snapshot_hash=snapshot_hash,
        is_stale=is_stale,
        staleness_minutes=staleness_minutes,
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


async def get_by_id(session: AsyncSession, snapshot_id: _uuid.UUID, company_id: _uuid.UUID) -> EquitySnapshot | None:
    row = await session.get(EquitySnapshot, snapshot_id)
    if not row:
        return None
    if row.company_id != company_id:
        return None
    return row


async def get_latest_by_symbol(session: AsyncSession, symbol: str, company_id: _uuid.UUID) -> EquitySnapshot | None:
    q = (
        select(EquitySnapshot)
        .where(EquitySnapshot.symbol == symbol.upper(), EquitySnapshot.company_id == company_id)
        .order_by(EquitySnapshot.as_of.desc())
        .limit(1)
    )
    result = await session.execute(q)
    return result.scalars().first()


async def list_by_symbol(session: AsyncSession, symbol: str, company_id: _uuid.UUID, *, limit: int = 50) -> list[EquitySnapshot]:
    q = (
        select(EquitySnapshot)
        .where(EquitySnapshot.symbol == symbol.upper(), EquitySnapshot.company_id == company_id)
        .order_by(EquitySnapshot.as_of.desc())
        .limit(limit)
    )
    result = await session.execute(q)
    return list(result.scalars().all())


async def _find_by_hash(session: AsyncSession, company_id: _uuid.UUID, snapshot_hash: str) -> EquitySnapshot | None:
    q = (
        select(EquitySnapshot)
        .where(EquitySnapshot.company_id == company_id, EquitySnapshot.snapshot_hash == snapshot_hash)
        .limit(1)
    )
    result = await session.execute(q)
    return result.scalars().first()
