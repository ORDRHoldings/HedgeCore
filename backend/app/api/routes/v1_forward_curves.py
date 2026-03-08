"""app/api/routes/v1_forward_curves.py

Forward Curve Snapshot API:
  POST /v1/forward-curves         — ingest forward curve snapshot (idempotent)
  GET  /v1/forward-curves/{id}    — load snapshot by UUID (tenant-scoped)
  GET  /v1/forward-curves/latest/{pair} — latest snapshot for a pair
  GET  /v1/forward-curves/pair/{pair}   — recent history for a pair

RBAC:
  POST:  requires forward_curve.create (or is_superuser)
  GET:   requires forward_curve.read   (or is_superuser)
"""

import uuid as _uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_async_session
from app.core.security import get_current_user
from app.models.user import User
from app.services import rbac_service
from app.services import forward_curve_service as fcs

router = APIRouter(prefix="/v1/forward-curves", tags=["v1-forward-curves"])
# ─────────────────────────────────────────────────────────────────────────────
# Schemas
# ─────────────────────────────────────────────────────────────────────────────

class ForwardCurveCreateRequest(BaseModel):
    pair: str = Field(..., min_length=6, max_length=12)
    as_of: str
    source: str = Field(default="INDICATIVE", max_length=32)
    data_class: str = Field(default="INDICATIVE", max_length=32)
    forward_points: dict = Field(..., description="Tenor-keyed: {'2026-04': 0.15, ...}")
    spot_mid: float | None = None
    tenor_months: int | None = None
    bid_ask_spread_pips: float | None = None
    swap_rate_annualized: float | None = None
    metadata_json: dict | None = None
class ForwardCurveResponse(BaseModel):
    snapshot_id: str
    pair: str
    as_of: str
    source: str
    data_class: str
    spot_mid: float | None
    forward_points: dict
    is_stale: bool
    staleness_minutes: int | None
    snapshot_hash: str | None
    provenance: dict
# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _to_response(snap) -> ForwardCurveResponse:
    return ForwardCurveResponse(
        snapshot_id=str(snap.id),
        pair=snap.pair,
        as_of=snap.as_of.isoformat() if isinstance(snap.as_of, datetime) else str(snap.as_of),
        source=snap.source,
        data_class=snap.data_class,
        spot_mid=snap.spot_mid,
        forward_points=snap.forward_points or {},
        is_stale=snap.is_stale or False,
        staleness_minutes=snap.staleness_minutes,
        snapshot_hash=snap.snapshot_hash,
        provenance=fcs.classify_data_provenance(snap.source, snap.data_class),
    )
async def _check_perm(session, user, perm: str):
    if user.is_superuser:
        return
    perms = await rbac_service.get_permissions_by_user(session, user.id)
    if perm not in perms:
        raise HTTPException(status_code=403, detail=f"Missing permission: {perm}")
# ─────────────────────────────────────────────────────────────────────────────
# POST /v1/forward-curves
# ─────────────────────────────────────────────────────────────────────────────

@router.post("", response_model=ForwardCurveResponse, status_code=201)
async def create_forward_curve(
    req: ForwardCurveCreateRequest,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """Ingest a forward curve snapshot. Idempotent by hash."""
    await _check_perm(session, current_user, "forward_curve.create")

    snap = await fcs.create_or_get(
        session,
        current_user,
        pair=req.pair,
        as_of=req.as_of,
        source=req.source,
        data_class=req.data_class,
        forward_points=req.forward_points,
        spot_mid=req.spot_mid,
        tenor_months=req.tenor_months,
        bid_ask_spread_pips=req.bid_ask_spread_pips,
        swap_rate_annualized=req.swap_rate_annualized,
        metadata_json=req.metadata_json,
    )
    return _to_response(snap)
# ─────────────────────────────────────────────────────────────────────────────
# GET /v1/forward-curves/{snapshot_id}
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/{snapshot_id}", response_model=ForwardCurveResponse)
async def get_forward_curve(
    snapshot_id: str,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """Retrieve a forward curve snapshot by UUID."""
    await _check_perm(session, current_user, "forward_curve.read")

    try:
        uuid_val = _uuid.UUID(snapshot_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid UUID format")

    snap = await fcs.get_by_id(session, uuid_val, current_user.company_id)
    if not snap:
        raise HTTPException(status_code=404, detail=f"Forward curve {snapshot_id!r} not found")
    return _to_response(snap)
# ─────────────────────────────────────────────────────────────────────────────
# GET /v1/forward-curves/latest/{pair}
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/latest/{pair}", response_model=ForwardCurveResponse)
async def get_latest_forward_curve(
    pair: str,
    data_class: str | None = Query(None, description="Filter by data class"),
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """Return the most recent forward curve snapshot for a currency pair."""
    await _check_perm(session, current_user, "forward_curve.read")

    snap = await fcs.get_latest_by_pair(
        session, pair, current_user.company_id,
        data_class_filter=data_class,
    )
    if not snap:
        raise HTTPException(status_code=404, detail=f"No forward curve found for {pair}")
    return _to_response(snap)
# ─────────────────────────────────────────────────────────────────────────────
# GET /v1/forward-curves/pair/{pair}
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/pair/{pair}", response_model=list[ForwardCurveResponse])
async def list_forward_curves(
    pair: str,
    limit: int = Query(50, ge=1, le=500),
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """Return recent forward curve history for a pair."""
    await _check_perm(session, current_user, "forward_curve.read")

    snaps = await fcs.list_by_pair(session, pair, current_user.company_id, limit=limit)
    return [_to_response(s) for s in snaps]
