"""app/api/routes/v1_geo_snapshots.py

Geopolitical Risk Snapshot API:
  POST /v1/geo-snapshots         — ingest geo risk snapshot (idempotent)
  GET  /v1/geo-snapshots/{id}    — load snapshot by UUID (tenant-scoped)
  GET  /v1/geo-snapshots/latest/{corridor} — latest score for a corridor
  GET  /v1/geo-snapshots/map     — all latest corridor scores

RBAC:
  POST: requires geo.snapshot.create (or is_superuser)
  GET:  requires geo.snapshot.read   (or is_superuser)
"""

import uuid as _uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_async_session
from app.core.security import get_current_user
from app.models.user import User
from app.services import geo_snapshot_service as gss
from app.services import rbac_service

router = APIRouter(prefix="/v1/geo-snapshots", tags=["v1-geo-snapshots"])
# ─────────────────────────────────────────────────────────────────────────────
# Schemas
# ─────────────────────────────────────────────────────────────────────────────

class GeoSnapshotCreateRequest(BaseModel):
    corridor: str = Field(..., min_length=3, max_length=32)
    as_of: str
    source: str = Field(default="polisophic", max_length=32)
    normalized_score: float = Field(..., ge=0.0, le=1.0)
    regime: str | None = None
    evidence_summary: str | None = None
    confidence: float | None = Field(None, ge=0.0, le=1.0)
    factors_json: dict | None = None
class GeoSnapshotResponse(BaseModel):
    snapshot_id: str
    corridor: str
    as_of: str
    source: str
    normalized_score: float
    regime: str
    is_stale: bool
    confidence: float | None
    snapshot_hash: str | None
class CorridorMapResponse(BaseModel):
    corridors: dict[str, dict]
# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _to_response(snap) -> GeoSnapshotResponse:
    return GeoSnapshotResponse(
        snapshot_id=str(snap.id),
        corridor=snap.corridor,
        as_of=snap.as_of.isoformat() if isinstance(snap.as_of, datetime) else str(snap.as_of),
        source=snap.source,
        normalized_score=snap.normalized_score,
        regime=snap.regime,
        is_stale=snap.is_stale or False,
        confidence=snap.confidence,
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

@router.post("", response_model=GeoSnapshotResponse, status_code=201)
async def create_geo_snapshot(
    req: GeoSnapshotCreateRequest,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """Ingest a geopolitical risk snapshot. Idempotent by hash."""
    await _check_perm(session, current_user, "geo.snapshot.create")

    snap = await gss.create_or_get(
        session,
        current_user,
        corridor=req.corridor,
        as_of=req.as_of,
        source=req.source,
        normalized_score=req.normalized_score,
        regime=req.regime,
        evidence_summary=req.evidence_summary,
        confidence=req.confidence,
        factors_json=req.factors_json,
    )
    return _to_response(snap)
@router.get("/map", response_model=CorridorMapResponse)
async def get_corridor_map(
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """Return latest scores for all corridors."""
    await _check_perm(session, current_user, "geo.snapshot.read")
    corridors = await gss.get_corridor_map(session, current_user.company_id)
    return CorridorMapResponse(corridors=corridors)
@router.get("/{snapshot_id}", response_model=GeoSnapshotResponse)
async def get_geo_snapshot(
    snapshot_id: str,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """Retrieve a geopolitical risk snapshot by UUID."""
    await _check_perm(session, current_user, "geo.snapshot.read")

    try:
        uuid_val = _uuid.UUID(snapshot_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid UUID format")

    snap = await gss.get_by_id(session, uuid_val, current_user.company_id)
    if not snap:
        raise HTTPException(status_code=404, detail=f"Geo snapshot {snapshot_id!r} not found")
    return _to_response(snap)
@router.get("/latest/{corridor}", response_model=GeoSnapshotResponse)
async def get_latest_geo_snapshot(
    corridor: str,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """Return the most recent geo risk score for a corridor."""
    await _check_perm(session, current_user, "geo.snapshot.read")

    snap = await gss.get_latest_by_corridor(session, corridor, current_user.company_id)
    if not snap:
        raise HTTPException(status_code=404, detail=f"No geo data for corridor {corridor}")
    return _to_response(snap)
