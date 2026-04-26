"""Equity/index snapshot CRUD routes — follows v1_forward_curves.py pattern."""
from __future__ import annotations

import uuid as _uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_async_session
from app.core.security import get_current_user
from app.models.user import User
from app.services import equity_snapshot_service as ess
from app.services import rbac_service

router = APIRouter(prefix="/v1/equity-snapshots", tags=["v1-equity-snapshots"])


# ── Schemas ──────────────────────────────────────────────

class EquitySnapshotCreateRequest(BaseModel):
    symbol: str
    as_of: str
    source: str = "TWELVEDATA"
    data_class: str = "LIVE"
    open: float | None = None
    high: float | None = None
    low: float | None = None
    close: float
    volume: int | None = None
    change_pct: float | None = None
    market_cap: float | None = None
    vwap: float | None = None
    pe_ratio: float | None = None


class EquitySnapshotResponse(BaseModel):
    snapshot_id: str
    symbol: str
    as_of: str
    source: str
    data_class: str
    close: float
    open: float | None = None
    high: float | None = None
    low: float | None = None
    volume: int | None = None
    change_pct: float | None = None
    is_stale: bool | None = None
    staleness_minutes: int | None = None
    snapshot_hash: str


# ── Helpers ──────────────────────────────────────────────

def _to_response(snap) -> EquitySnapshotResponse:
    return EquitySnapshotResponse(
        snapshot_id=str(snap.id),
        symbol=snap.symbol,
        as_of=snap.as_of.isoformat() if snap.as_of else "",
        source=snap.source or "",
        data_class=snap.data_class or "",
        close=snap.close,
        open=snap.open,
        high=snap.high,
        low=snap.low,
        volume=snap.volume,
        change_pct=snap.change_pct,
        is_stale=snap.is_stale,
        staleness_minutes=snap.staleness_minutes,
        snapshot_hash=snap.snapshot_hash or "",
    )


async def _check_perm(session, user, perm: str):
    if user.is_superuser:
        return
    perms = await rbac_service.get_permissions_by_user(session, user.id)
    if perm not in perms:
        raise HTTPException(status_code=403, detail=f"Missing permission: {perm}")


# ── Endpoints ────────────────────────────────────────────

@router.post("", response_model=EquitySnapshotResponse, status_code=201)
async def create_equity_snapshot(
    req: EquitySnapshotCreateRequest,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """Ingest an equity/index snapshot. Idempotent by hash."""
    await _check_perm(session, current_user, "equity.snapshot.create")
    snap = await ess.create_or_get(
        session, current_user,
        symbol=req.symbol,
        as_of=req.as_of,
        source=req.source,
        data_class=req.data_class,
        open_=req.open,
        high=req.high,
        low=req.low,
        close=req.close,
        volume=req.volume,
        change_pct=req.change_pct,
        market_cap=req.market_cap,
        vwap=req.vwap,
        pe_ratio=req.pe_ratio,
    )
    return _to_response(snap)


@router.get("/{snapshot_id}", response_model=EquitySnapshotResponse)
async def get_equity_snapshot(
    snapshot_id: str,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """Get equity snapshot by UUID."""
    await _check_perm(session, current_user, "equity.snapshot.read")
    try:
        uuid_val = _uuid.UUID(snapshot_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid UUID")
    snap = await ess.get_by_id(session, uuid_val, current_user.company_id)
    if not snap:
        raise HTTPException(status_code=404, detail="Equity snapshot not found")
    return _to_response(snap)


@router.get("/latest/{symbol}", response_model=EquitySnapshotResponse)
async def get_latest_equity_snapshot(
    symbol: str,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """Get latest equity snapshot for a symbol."""
    await _check_perm(session, current_user, "equity.snapshot.read")
    snap = await ess.get_latest_by_symbol(session, symbol, current_user.company_id)
    if not snap:
        raise HTTPException(status_code=404, detail=f"No equity snapshots for {symbol}")
    return _to_response(snap)


@router.get("/symbol/{symbol}", response_model=list[EquitySnapshotResponse])
async def list_equity_snapshots(
    symbol: str,
    limit: int = Query(50, ge=1, le=500),
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """List recent equity snapshots for a symbol."""
    await _check_perm(session, current_user, "equity.snapshot.read")
    snaps = await ess.list_by_symbol(session, symbol, current_user.company_id, limit=limit)
    return [_to_response(s) for s in snaps]
