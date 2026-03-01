"""app/api/routes/v1_market_snapshots.py

Market Snapshot API (WORM store):

  POST /v1/market-snapshots        — ingest + persist a market snapshot, return id
  GET  /v1/market-snapshots/{id}   — load snapshot by UUID (tenant-scoped)

RBAC:
  POST: requires market.snapshot.create  (or is_superuser)
  GET:  requires market.snapshot.read    (or is_superuser)
"""

from __future__ import annotations

import uuid as _uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_async_session
from app.core.security import get_current_user
from app.models.user import User
from app.services import rbac_service
from app.services.market_snapshot_service import create_or_get, get_by_id

router = APIRouter(prefix="/v1/market-snapshots", tags=["v1-market-snapshots"])


# ─────────────────────────────────────────────────────────────────────────────
# Schemas
# ─────────────────────────────────────────────────────────────────────────────

class MarketSnapshotCreateRequest(BaseModel):
    """Accepts a raw MarketSnapshot-compatible payload dict."""
    payload: dict


class MarketSnapshotResponse(BaseModel):
    snapshot_id: str
    market_snapshot_hash: str
    provider: str
    data_class: str
    as_of: str
    fetched_at: str
    primary_currency: str
    spot_rate: float
    is_synthetic_forward: bool
    payload: dict


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _snap_to_response(snap) -> MarketSnapshotResponse:
    return MarketSnapshotResponse(
        snapshot_id          = str(snap.id),
        market_snapshot_hash = snap.market_snapshot_hash,
        provider             = snap.provider,
        data_class           = snap.data_class,
        as_of                = snap.as_of.isoformat(),
        fetched_at           = snap.fetched_at.isoformat(),
        primary_currency     = snap.primary_currency,
        spot_rate            = snap.spot_rate,
        is_synthetic_forward = snap.is_synthetic_forward,
        payload              = snap.payload,
    )


# ─────────────────────────────────────────────────────────────────────────────
# POST /v1/market-snapshots
# ─────────────────────────────────────────────────────────────────────────────

@router.post("", response_model=MarketSnapshotResponse, status_code=201)
async def create_market_snapshot(
    req: MarketSnapshotCreateRequest,
    session: AsyncSession = Depends(get_async_session),
    current_user: User    = Depends(get_current_user),
):
    """
    Ingest a market snapshot payload, hash it, and persist to WORM store.
    Idempotent: returns existing snapshot if identical payload was already submitted.
    """
    if not current_user.is_superuser:
        perms = await rbac_service.get_permissions_by_user(session, current_user.id)
        if "market.snapshot.create" not in perms:
            raise HTTPException(
                status_code=403,
                detail="Missing permission: market.snapshot.create",
            )

    snap = await create_or_get(session, current_user, req.payload)
    return _snap_to_response(snap)


# ─────────────────────────────────────────────────────────────────────────────
# GET /v1/market-snapshots/{snapshot_id}
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/{snapshot_id}", response_model=MarketSnapshotResponse)
async def get_market_snapshot(
    snapshot_id: str,
    session: AsyncSession = Depends(get_async_session),
    current_user: User    = Depends(get_current_user),
):
    """Retrieve a snapshot by UUID. Scoped to caller's company (tenant-isolated)."""
    if not current_user.is_superuser:
        perms = await rbac_service.get_permissions_by_user(session, current_user.id)
        if "market.snapshot.read" not in perms:
            raise HTTPException(
                status_code=403,
                detail="Missing permission: market.snapshot.read",
            )

    try:
        uuid_val = _uuid.UUID(snapshot_id)
    except ValueError:
        raise HTTPException(
            status_code=422,
            detail="Invalid UUID format for snapshot_id",
        )

    snap = await get_by_id(session, uuid_val, current_user.company_id)
    if not snap:
        raise HTTPException(
            status_code=404,
            detail=f"MarketSnapshot {snapshot_id!r} not found",
        )

    return _snap_to_response(snap)
