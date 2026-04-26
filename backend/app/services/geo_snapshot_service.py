"""app/services/geo_snapshot_service.py

GeopoliticalRiskSnapshot service layer:
  - create_or_get: persist snapshot, return existing on hash collision (idempotent)
  - get_by_id: load snapshot by UUID (tenant-scoped)
  - get_latest_by_corridor: most recent score for a geopolitical corridor
  - get_corridor_map: all latest scores by corridor for a company

Hash contract: same canonical JSON + SHA-256 pattern.
"""

from __future__ import annotations

import hashlib
import json as _json
import uuid as _uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.market_data import GeopoliticalRiskSnapshot
from app.models.user import User

# ─────────────────────────────────────────────────────────────────────────────
# Hash contract
# ─────────────────────────────────────────────────────────────────────────────

def build_canonical_payload(payload: dict) -> str:
    return _json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str, ensure_ascii=True)


def build_snapshot_hash(canonical_json: str) -> str:
    return hashlib.sha256(canonical_json.encode("utf-8")).hexdigest()


# ─────────────────────────────────────────────────────────────────────────────
# Regime classification (deterministic)
# ─────────────────────────────────────────────────────────────────────────────

def classify_geo_regime(normalized_score: float) -> str:
    """Deterministic regime from normalized score [0.0, 1.0].

    Thresholds (from scenario-methodology.md):
      STABLE:   score < 0.3
      ELEVATED: 0.3 <= score < 0.7
      CRISIS:   score >= 0.7
    """
    if normalized_score < 0.3:
        return "STABLE"
    if normalized_score < 0.7:
        return "ELEVATED"
    return "CRISIS"


# ─────────────────────────────────────────────────────────────────────────────
# Core service functions
# ─────────────────────────────────────────────────────────────────────────────

async def create_or_get(
    session: AsyncSession,
    user: User,
    *,
    corridor: str,
    as_of: datetime | str,
    source: str = "polisophic",
    normalized_score: float,
    regime: str | None = None,
    evidence_summary: str | None = None,
    confidence: float | None = None,
    factors_json: dict | None = None,
) -> GeopoliticalRiskSnapshot:
    """Persist a GeopoliticalRiskSnapshot, deduplicating by hash."""
    corridor = corridor.upper().strip()
    source = source.lower().strip()

    if not 0.0 <= normalized_score <= 1.0:
        raise ValueError(f"normalized_score must be [0.0, 1.0], got {normalized_score}")

    if isinstance(as_of, str):
        try:
            as_of_dt = datetime.fromisoformat(as_of.replace("Z", "+00:00"))
        except (ValueError, TypeError):
            as_of_dt = datetime.now(UTC)
    else:
        as_of_dt = as_of
    if as_of_dt.tzinfo is None:
        as_of_dt = as_of_dt.replace(tzinfo=UTC)

    if regime is None:
        regime = classify_geo_regime(normalized_score)

    hash_payload = {
        "corridor": corridor,
        "as_of": as_of_dt.isoformat(),
        "source": source,
        "normalized_score": normalized_score,
    }
    canonical = build_canonical_payload(hash_payload)
    snapshot_hash = build_snapshot_hash(canonical)

    existing = await _find_by_hash(session, user.company_id, snapshot_hash)
    if existing:
        return existing

    # Staleness: > 48h for geo data
    now = datetime.now(UTC)
    delta = now - as_of_dt
    is_stale = delta.total_seconds() > 48 * 3600

    row = GeopoliticalRiskSnapshot(
        id=_uuid.uuid4(),
        corridor=corridor,
        as_of=as_of_dt,
        source=source,
        normalized_score=normalized_score,
        regime=regime,
        evidence_summary=evidence_summary,
        confidence=confidence,
        factors_json=factors_json,
        snapshot_hash=snapshot_hash,
        is_stale=is_stale,
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
) -> GeopoliticalRiskSnapshot | None:
    row = await session.get(GeopoliticalRiskSnapshot, snapshot_id)
    if not row or row.company_id != company_id:
        return None
    return row


async def get_latest_by_corridor(
    session: AsyncSession,
    corridor: str,
    company_id: _uuid.UUID,
) -> GeopoliticalRiskSnapshot | None:
    q = (
        select(GeopoliticalRiskSnapshot)
        .where(
            GeopoliticalRiskSnapshot.corridor == corridor.upper(),
            GeopoliticalRiskSnapshot.company_id == company_id,
        )
        .order_by(GeopoliticalRiskSnapshot.as_of.desc())
        .limit(1)
    )
    result = await session.execute(q)
    return result.scalars().first()


async def get_corridor_map(
    session: AsyncSession,
    company_id: _uuid.UUID,
) -> dict[str, dict]:
    """Return latest score for each corridor as {corridor: {score, regime, as_of, ...}}."""
    q = (
        select(GeopoliticalRiskSnapshot)
        .where(GeopoliticalRiskSnapshot.company_id == company_id)
        .order_by(
            GeopoliticalRiskSnapshot.corridor,
            GeopoliticalRiskSnapshot.as_of.desc(),
        )
    )
    result = await session.execute(q)
    rows = result.scalars().all()

    corridor_map: dict[str, dict] = {}
    for row in rows:
        if row.corridor not in corridor_map:
            corridor_map[row.corridor] = {
                "corridor": row.corridor,
                "normalized_score": row.normalized_score,
                "regime": row.regime,
                "source": row.source,
                "as_of": row.as_of.isoformat() if row.as_of else None,
                "is_stale": row.is_stale,
                "confidence": row.confidence,
            }
    return corridor_map


async def _find_by_hash(
    session: AsyncSession,
    company_id: _uuid.UUID,
    snapshot_hash: str,
) -> GeopoliticalRiskSnapshot | None:
    q = (
        select(GeopoliticalRiskSnapshot)
        .where(
            GeopoliticalRiskSnapshot.company_id == company_id,
            GeopoliticalRiskSnapshot.snapshot_hash == snapshot_hash,
        )
        .limit(1)
    )
    result = await session.execute(q)
    return result.scalars().first()
