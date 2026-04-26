"""app/services/forward_curve_service.py

ForwardCurveSnapshot service layer:
  - create_or_get: persist snapshot, return existing on hash collision (idempotent)
  - get_by_id: load snapshot by UUID (tenant-scoped)
  - get_latest_by_pair: most recent snapshot for a currency pair
  - check_staleness: evaluate staleness against policy thresholds

Hash contract:
  canonical_json = json.dumps(payload, sort_keys=True, separators=(',',':'), default=str, ensure_ascii=True)
  snapshot_hash = sha256(canonical_json.encode('utf-8')).hexdigest()
"""

from __future__ import annotations

import hashlib
import json as _json
import uuid as _uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.market_data import ForwardCurveSnapshot
from app.models.user import User

# ─────────────────────────────────────────────────────────────────────────────
# Hash contract (public — used by tests and endpoints)
# ─────────────────────────────────────────────────────────────────────────────

def build_canonical_payload(payload: dict) -> str:
    """Return canonical JSON string: sort_keys=True, compact, ASCII-safe."""
    return _json.dumps(
        payload,
        sort_keys=True,
        separators=(",", ":"),
        default=str,
        ensure_ascii=True,
    )


def build_snapshot_hash(canonical_json: str) -> str:
    """SHA-256 of UTF-8 encoded canonical JSON string."""
    return hashlib.sha256(canonical_json.encode("utf-8")).hexdigest()


# ─────────────────────────────────────────────────────────────────────────────
# Staleness evaluation
# ─────────────────────────────────────────────────────────────────────────────

DEFAULT_STALENESS_THRESHOLD_MINUTES = 1440  # 24 hours — matches V-023

VALID_SOURCES = {"CME", "BLOOMBERG", "REFINITIV", "SYNTHETIC", "INDICATIVE", "MANUAL"}
VALID_DATA_CLASSES = {"LIVE", "DELAYED", "INDICATIVE", "SYNTHETIC"}


def evaluate_staleness(
    as_of: datetime,
    threshold_minutes: int = DEFAULT_STALENESS_THRESHOLD_MINUTES,
) -> tuple[bool, int]:
    """Return (is_stale, staleness_minutes) relative to now(UTC)."""
    now = datetime.now(UTC)
    if as_of.tzinfo is None:
        as_of = as_of.replace(tzinfo=UTC)
    delta = now - as_of
    staleness_minutes = int(delta.total_seconds() / 60)
    return staleness_minutes > threshold_minutes, staleness_minutes


def classify_data_provenance(source: str, data_class: str) -> dict:
    """Return provenance metadata for audit/governance trace."""
    return {
        "source": source,
        "data_class": data_class,
        "is_live": data_class == "LIVE",
        "is_indicative": data_class in ("INDICATIVE", "SYNTHETIC"),
        "requires_fallback_governance": data_class != "LIVE",
        "audit_label": f"{source}:{data_class}",
    }


# ─────────────────────────────────────────────────────────────────────────────
# Core service functions
# ─────────────────────────────────────────────────────────────────────────────

async def create_or_get(
    session: AsyncSession,
    user: User,
    *,
    pair: str,
    as_of: datetime | str,
    source: str,
    data_class: str,
    forward_points: dict,
    spot_mid: float | None = None,
    tenor_months: int | None = None,
    bid_ask_spread_pips: float | None = None,
    swap_rate_annualized: float | None = None,
    metadata_json: dict | None = None,
) -> ForwardCurveSnapshot:
    """
    Persist a ForwardCurveSnapshot, deduplicating by hash.
    Returns existing row if identical payload was already submitted.
    """
    # Validate inputs
    pair = pair.upper().strip()
    if len(pair) < 6:
        raise ValueError(f"Invalid currency pair: {pair}")
    source = source.upper().strip()
    data_class = data_class.upper().strip()

    # Parse as_of
    if isinstance(as_of, str):
        try:
            as_of_dt = datetime.fromisoformat(as_of.replace("Z", "+00:00"))
        except (ValueError, TypeError):
            as_of_dt = datetime.now(UTC)
    else:
        as_of_dt = as_of
    if as_of_dt.tzinfo is None:
        as_of_dt = as_of_dt.replace(tzinfo=UTC)

    # Build hash payload (deterministic — excludes mutable fields)
    hash_payload = {
        "pair": pair,
        "as_of": as_of_dt.isoformat(),
        "source": source,
        "data_class": data_class,
        "forward_points": forward_points,
        "spot_mid": spot_mid,
    }
    canonical = build_canonical_payload(hash_payload)
    snapshot_hash = build_snapshot_hash(canonical)

    # Check for existing row (idempotency)
    existing = await _find_by_hash(session, user.company_id, snapshot_hash)
    if existing:
        return existing

    # Evaluate staleness
    is_stale, staleness_minutes = evaluate_staleness(as_of_dt)

    # Insert
    row = ForwardCurveSnapshot(
        id=_uuid.uuid4(),
        pair=pair,
        as_of=as_of_dt,
        source=source,
        data_class=data_class,
        spot_mid=spot_mid,
        forward_points=forward_points,
        tenor_months=tenor_months,
        bid_ask_spread_pips=bid_ask_spread_pips,
        swap_rate_annualized=swap_rate_annualized,
        is_stale=is_stale,
        staleness_minutes=staleness_minutes,
        snapshot_hash=snapshot_hash,
        metadata_json=metadata_json,
        created_at=datetime.now(UTC),
        company_id=user.company_id,
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


async def get_by_id(
    session: AsyncSession,
    snapshot_id: _uuid.UUID,
    company_id: _uuid.UUID,
) -> ForwardCurveSnapshot | None:
    """Load snapshot by UUID, scoped to company."""
    row = await session.get(ForwardCurveSnapshot, snapshot_id)
    if not row:
        return None
    if row.company_id != company_id:
        return None
    return row


async def get_latest_by_pair(
    session: AsyncSession,
    pair: str,
    company_id: _uuid.UUID,
    *,
    data_class_filter: str | None = None,
) -> ForwardCurveSnapshot | None:
    """Return the most recent snapshot for a currency pair."""
    q = (
        select(ForwardCurveSnapshot)
        .where(
            ForwardCurveSnapshot.pair == pair.upper(),
            ForwardCurveSnapshot.company_id == company_id,
        )
    )
    if data_class_filter:
        q = q.where(ForwardCurveSnapshot.data_class == data_class_filter.upper())
    q = q.order_by(ForwardCurveSnapshot.as_of.desc()).limit(1)
    result = await session.execute(q)
    return result.scalars().first()


async def list_by_pair(
    session: AsyncSession,
    pair: str,
    company_id: _uuid.UUID,
    *,
    limit: int = 50,
) -> list[ForwardCurveSnapshot]:
    """Return recent snapshots for a pair, newest first."""
    q = (
        select(ForwardCurveSnapshot)
        .where(
            ForwardCurveSnapshot.pair == pair.upper(),
            ForwardCurveSnapshot.company_id == company_id,
        )
        .order_by(ForwardCurveSnapshot.as_of.desc())
        .limit(limit)
    )
    result = await session.execute(q)
    return list(result.scalars().all())


async def _find_by_hash(
    session: AsyncSession,
    company_id: _uuid.UUID,
    snapshot_hash: str,
) -> ForwardCurveSnapshot | None:
    q = (
        select(ForwardCurveSnapshot)
        .where(
            ForwardCurveSnapshot.company_id == company_id,
            ForwardCurveSnapshot.snapshot_hash == snapshot_hash,
        )
        .limit(1)
    )
    result = await session.execute(q)
    return result.scalars().first()
