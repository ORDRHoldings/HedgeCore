"""app/services/volatility_snapshot_service.py

VolatilitySnapshot service layer:
  - create_or_get: persist snapshot, return existing on hash collision (idempotent)
  - get_by_id: load snapshot by UUID (tenant-scoped)
  - get_latest_by_pair: most recent vol snapshot for a currency pair
  - derive_vol_regime: deterministic regime classification from vol levels

Hash contract: same as forward_curve_service (canonical JSON + SHA-256).
"""

from __future__ import annotations

import hashlib
import json as _json
import uuid as _uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.market_data import VolatilitySnapshot
from app.models.user import User

# ─────────────────────────────────────────────────────────────────────────────
# Hash contract
# ─────────────────────────────────────────────────────────────────────────────

def build_canonical_payload(payload: dict) -> str:
    return _json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str, ensure_ascii=True)


def build_snapshot_hash(canonical_json: str) -> str:
    return hashlib.sha256(canonical_json.encode("utf-8")).hexdigest()


# ─────────────────────────────────────────────────────────────────────────────
# Vol regime classification (deterministic, no ML)
# ─────────────────────────────────────────────────────────────────────────────

# Thresholds calibrated to BIS Triennial Survey 2022 FX vol data
# See docs/architecture/whitepapers/scenario-methodology.md
VOL_REGIME_THRESHOLDS = {
    "LOW":      0.06,   # < 6% annualized
    "NORMAL":   0.14,   # 6-14% annualized
    "ELEVATED": 0.22,   # 14-22% annualized
    # > 22% = CRISIS
}


def classify_vol_regime(vol_annualized: float | None) -> str:
    """Deterministic vol regime from annualized vol level.

    Thresholds:
      LOW:      vol < 6%
      NORMAL:   6% <= vol < 14%
      ELEVATED: 14% <= vol < 22%
      CRISIS:   vol >= 22%
    """
    if vol_annualized is None:
        return "NORMAL"  # neutral default
    if vol_annualized < VOL_REGIME_THRESHOLDS["LOW"]:
        return "LOW"
    if vol_annualized < VOL_REGIME_THRESHOLDS["NORMAL"]:
        return "NORMAL"
    if vol_annualized < VOL_REGIME_THRESHOLDS["ELEVATED"]:
        return "ELEVATED"
    return "CRISIS"


def compute_z_score(current_vol: float, lookback_mean: float, lookback_std: float) -> float:
    """Z-score of current vol vs lookback distribution. Returns 0.0 if std is zero."""
    if lookback_std <= 0.0:
        return 0.0
    return (current_vol - lookback_mean) / lookback_std


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
    data_class: str = "FALLBACK",
    realized_vol_annualized: float | None = None,
    ewma_vol_annualized: float | None = None,
    implied_vol_atm: float | None = None,
    vol_z_score: float | None = None,
    vol_regime: str | None = None,
    term_structure_slope: float | None = None,
    lookback_days: int | None = None,
    ewma_lambda: float | None = None,
    surface_json: dict | None = None,
) -> VolatilitySnapshot:
    """Persist a VolatilitySnapshot, deduplicating by hash."""
    pair = pair.upper().strip()
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

    # Auto-derive regime if not provided
    primary_vol = ewma_vol_annualized or realized_vol_annualized or implied_vol_atm
    if vol_regime is None:
        vol_regime = classify_vol_regime(primary_vol)

    hash_payload = {
        "pair": pair,
        "as_of": as_of_dt.isoformat(),
        "source": source,
        "realized_vol": realized_vol_annualized,
        "ewma_vol": ewma_vol_annualized,
        "implied_vol": implied_vol_atm,
    }
    canonical = build_canonical_payload(hash_payload)
    snapshot_hash = build_snapshot_hash(canonical)

    existing = await _find_by_hash(session, user.company_id, snapshot_hash)
    if existing:
        return existing

    row = VolatilitySnapshot(
        id=_uuid.uuid4(),
        pair=pair,
        as_of=as_of_dt,
        source=source,
        data_class=data_class,
        realized_vol_annualized=realized_vol_annualized,
        ewma_vol_annualized=ewma_vol_annualized,
        implied_vol_atm=implied_vol_atm,
        vol_z_score=vol_z_score,
        vol_regime=vol_regime,
        term_structure_slope=term_structure_slope,
        lookback_days=lookback_days,
        ewma_lambda=ewma_lambda,
        surface_json=surface_json,
        snapshot_hash=snapshot_hash,
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
) -> VolatilitySnapshot | None:
    row = await session.get(VolatilitySnapshot, snapshot_id)
    if not row or row.company_id != company_id:
        return None
    return row


async def get_latest_by_pair(
    session: AsyncSession,
    pair: str,
    company_id: _uuid.UUID,
) -> VolatilitySnapshot | None:
    q = (
        select(VolatilitySnapshot)
        .where(
            VolatilitySnapshot.pair == pair.upper(),
            VolatilitySnapshot.company_id == company_id,
        )
        .order_by(VolatilitySnapshot.as_of.desc())
        .limit(1)
    )
    result = await session.execute(q)
    return result.scalars().first()


async def _find_by_hash(
    session: AsyncSession,
    company_id: _uuid.UUID,
    snapshot_hash: str,
) -> VolatilitySnapshot | None:
    q = (
        select(VolatilitySnapshot)
        .where(
            VolatilitySnapshot.company_id == company_id,
            VolatilitySnapshot.snapshot_hash == snapshot_hash,
        )
        .limit(1)
    )
    result = await session.execute(q)
    return result.scalars().first()
