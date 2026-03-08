"""app/api/routes/v1_volatility_snapshots.py

Volatility Snapshot API:
  POST /v1/volatility-snapshots        — ingest vol snapshot (idempotent)
  GET  /v1/volatility-snapshots/{id}   — load snapshot by UUID (tenant-scoped)
  GET  /v1/volatility-snapshots/latest/{pair} — latest vol for a pair

RBAC:
  POST: requires volatility.snapshot.create (or is_superuser)
  GET:  requires volatility.snapshot.read   (or is_superuser)
"""

from __future__ import annotations

import uuid as _uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_async_session
from app.core.security import get_current_user
from app.models.user import User
from app.services import rbac_service
from app.services import volatility_snapshot_service as vss

router = APIRouter(prefix="/v1/volatility-snapshots", tags=["v1-volatility-snapshots"])


# ─────────────────────────────────────────────────────────────────────────────
# Schemas
# ─────────────────────────────────────────────────────────────────────────────

class VolSnapshotCreateRequest(BaseModel):
    pair: str = Field(..., min_length=6, max_length=12)
    as_of: str
    source: str = Field(default="CALCULATED", max_length=32)
    data_class: str = Field(default="FALLBACK", max_length=32)
    realized_vol_annualized: float | None = None
    ewma_vol_annualized: float | None = None
    implied_vol_atm: float | None = None
    vol_z_score: float | None = None
    vol_regime: str | None = None
    term_structure_slope: float | None = None
    lookback_days: int | None = None
    ewma_lambda: float | None = None
    surface_json: dict | None = None


class VolSnapshotResponse(BaseModel):
    snapshot_id: str
    pair: str
    as_of: str
    source: str
    data_class: str
    realized_vol_annualized: float | None
    ewma_vol_annualized: float | None
    implied_vol_atm: float | None
    vol_z_score: float | None
    vol_regime: str | None
    term_structure_slope: float | None
    snapshot_hash: str | None


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _to_response(snap) -> VolSnapshotResponse:
    return VolSnapshotResponse(
        snapshot_id=str(snap.id),
        pair=snap.pair,
        as_of=snap.as_of.isoformat() if isinstance(snap.as_of, datetime) else str(snap.as_of),
        source=snap.source,
        data_class=snap.data_class,
        realized_vol_annualized=snap.realized_vol_annualized,
        ewma_vol_annualized=snap.ewma_vol_annualized,
        implied_vol_atm=snap.implied_vol_atm,
        vol_z_score=snap.vol_z_score,
        vol_regime=snap.vol_regime,
        term_structure_slope=snap.term_structure_slope,
        snapshot_hash=snap.snapshot_hash,
    )


async def _check_perm(session, user, perm: str):
    if user.is_superuser:
        return
    perms = await rbac_service.get_permissions_by_user(session, user.id)
    if perm not in perms:
        raise HTTPException(status_code=403, detail=f"Missing permission: {perm}")


# ─────────────────────────────────────────────────────────────────────────────
# Routes
# ─────────────────────────────────────────────────────────────────────────────

@router.post("", response_model=VolSnapshotResponse, status_code=201)
async def create_volatility_snapshot(
    req: VolSnapshotCreateRequest,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """Ingest a volatility snapshot. Idempotent by hash."""
    await _check_perm(session, current_user, "volatility.snapshot.create")

    snap = await vss.create_or_get(
        session,
        current_user,
        pair=req.pair,
        as_of=req.as_of,
        source=req.source,
        data_class=req.data_class,
        realized_vol_annualized=req.realized_vol_annualized,
        ewma_vol_annualized=req.ewma_vol_annualized,
        implied_vol_atm=req.implied_vol_atm,
        vol_z_score=req.vol_z_score,
        vol_regime=req.vol_regime,
        term_structure_slope=req.term_structure_slope,
        lookback_days=req.lookback_days,
        ewma_lambda=req.ewma_lambda,
        surface_json=req.surface_json,
    )
    return _to_response(snap)


@router.get("/{snapshot_id}", response_model=VolSnapshotResponse)
async def get_volatility_snapshot(
    snapshot_id: str,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """Retrieve a volatility snapshot by UUID."""
    await _check_perm(session, current_user, "volatility.snapshot.read")

    try:
        uuid_val = _uuid.UUID(snapshot_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid UUID format")

    snap = await vss.get_by_id(session, uuid_val, current_user.company_id)
    if not snap:
        raise HTTPException(status_code=404, detail=f"Volatility snapshot {snapshot_id!r} not found")
    return _to_response(snap)


@router.get("/latest/{pair}", response_model=VolSnapshotResponse)
async def get_latest_volatility(
    pair: str,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """Return the most recent volatility snapshot for a currency pair."""
    await _check_perm(session, current_user, "volatility.snapshot.read")

    snap = await vss.get_latest_by_pair(session, pair, current_user.company_id)
    if not snap:
        raise HTTPException(status_code=404, detail=f"No volatility data for {pair}")
    return _to_response(snap)
