"""app/services/market_snapshot_service.py

MarketSnapshot service layer:
  - create_or_get: persist snapshot, return existing on hash collision (idempotent)
  - get_by_id: load snapshot by UUID (tenant-scoped)
  - build_canonical_hash / build_canonical_payload: deterministic SHA-256

Hash contract:
  canonical_json = json.dumps(payload, sort_keys=True, separators=(',',':'), default=str, ensure_ascii=True)
  market_snapshot_hash = sha256(canonical_json.encode('utf-8')).hexdigest()
"""

from __future__ import annotations

import hashlib
import json as _json
import uuid as _uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.market_snapshot import MarketSnapshot
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
# Core service functions
# ─────────────────────────────────────────────────────────────────────────────

async def create_or_get(
    session: AsyncSession,
    user: User,
    payload: dict,
) -> MarketSnapshot:
    """
    Persist a MarketSnapshot for the caller's company, deduplicating by hash.

    If an identical snapshot (same company_id + market_snapshot_hash) already
    exists, returns the existing row without inserting a duplicate (idempotent).

    payload must be a MarketSnapshot-compatible dict:
        { as_of, spot_usdmxn, forward_points_by_month, provider_metadata }
    """
    # 1. Build canonical representation + hash
    canonical_json  = build_canonical_payload(payload)
    snapshot_hash   = build_snapshot_hash(canonical_json)

    # 2. Check for existing row (idempotency guard)
    existing = await _find_by_hash(session, user.company_id, snapshot_hash)
    if existing:
        return existing

    # 3. Extract metadata from payload
    provider_meta   = payload.get("provider_metadata") or {}
    provider        = str(provider_meta.get("source", "unknown"))
    data_class      = str(provider_meta.get("data_class", "INDICATIVE_FALLBACK"))
    primary_ccy     = str(provider_meta.get("primary_currency", "MXN"))
    spot            = float(payload.get("spot_usdmxn", 0.0))
    is_synthetic    = data_class != "LIVE"

    # 4. Parse as_of
    raw_as_of = payload.get("as_of", "")
    if isinstance(raw_as_of, datetime):
        as_of_dt = raw_as_of
    else:
        try:
            as_of_dt = datetime.fromisoformat(str(raw_as_of).replace("Z", "+00:00"))
        except (ValueError, TypeError):
            as_of_dt = datetime.now(UTC)
    if as_of_dt.tzinfo is None:
        as_of_dt = as_of_dt.replace(tzinfo=UTC)

    # 5. Insert new row
    row = MarketSnapshot(
        id                    = _uuid.uuid4(),
        company_id            = user.company_id,
        market_snapshot_hash  = snapshot_hash,
        provider              = provider,
        data_class            = data_class,
        as_of                 = as_of_dt,
        fetched_at            = datetime.now(UTC),
        primary_currency      = primary_ccy,
        spot_rate             = spot,
        payload               = payload,
        canonical_payload_json = canonical_json,
        raw_payload_hash      = snapshot_hash,
        is_synthetic_forward  = is_synthetic,
    )
    session.add(row)
    try:
        await session.commit()
        await session.refresh(row)
    except Exception:
        # Race condition: concurrent request already inserted same hash
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
) -> MarketSnapshot | None:
    """Load snapshot by UUID, scoped to company. Returns None if not found."""
    row = await session.get(MarketSnapshot, snapshot_id)
    if not row:
        return None
    if row.company_id != company_id:
        return None  # tenant isolation — treat as not-found
    return row


async def _find_by_hash(
    session: AsyncSession,
    company_id: _uuid.UUID,
    snapshot_hash: str,
) -> MarketSnapshot | None:
    q = (
        select(MarketSnapshot)
        .where(
            MarketSnapshot.company_id == company_id,
            MarketSnapshot.market_snapshot_hash == snapshot_hash,
        )
        .limit(1)
    )
    result = await session.execute(q)
    return result.scalars().first()
