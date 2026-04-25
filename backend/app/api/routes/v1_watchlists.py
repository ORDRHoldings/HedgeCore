"""app/api/routes/v1_watchlists.py

Watchlist CRUD — user-scoped symbol lists, backend-persisted.

GET    /v1/watchlists          — list all watchlists for current user
POST   /v1/watchlists          — create a new watchlist
PUT    /v1/watchlists/{id}     — update name / symbols (owner only)
DELETE /v1/watchlists/{id}     — delete (owner only)
"""
from __future__ import annotations

import uuid


from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_async_session
from app.core.security import get_current_user
from app.models.user import User
from app.models.user_watchlist import UserWatchlist

router = APIRouter(prefix="/v1/watchlists", tags=["v1-watchlists"])

# ── Schemas ────────────────────────────────────────────────────────────────────

class WatchlistCreate(BaseModel):
    name: str = "My Watchlist"
    symbols: list[str] = []


class WatchlistUpdate(BaseModel):
    name: str | None = None
    symbols: list[str] | None = None


class WatchlistResponse(BaseModel):
    id: str
    name: str
    symbols: list[str]
    created_at: str
    updated_at: str


def _to_resp(w: UserWatchlist) -> WatchlistResponse:
    return WatchlistResponse(
        id=str(w.id),
        name=w.name,
        symbols=w.symbols or [],
        created_at=w.created_at.isoformat() if w.created_at else "",
        updated_at=w.updated_at.isoformat() if w.updated_at else "",
    )


# ── GET /v1/watchlists ─────────────────────────────────────────────────────────

@router.get("", response_model=list[WatchlistResponse])
async def list_watchlists(
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """Return all watchlists for the authenticated user, ordered by creation time."""
    result = await session.execute(
        select(UserWatchlist)
        .where(UserWatchlist.user_id == current_user.id)
        .order_by(UserWatchlist.created_at)
    )
    return [_to_resp(w) for w in result.scalars().all()]


# ── POST /v1/watchlists ────────────────────────────────────────────────────────

@router.post("", response_model=WatchlistResponse, status_code=201)
async def create_watchlist(
    req: WatchlistCreate,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """Create a new watchlist for the authenticated user."""
    w = UserWatchlist(
        user_id=current_user.id,
        name=req.name.strip() or "My Watchlist",
        symbols=[s.strip().upper() for s in req.symbols if s.strip()],
    )
    session.add(w)
    try:
        await session.commit()
        await session.refresh(w)
    except Exception:
        await session.rollback()
        raise HTTPException(
            status_code=409,
            detail=f"A watchlist named {req.name!r} already exists.",
        )
    return _to_resp(w)


# ── PUT /v1/watchlists/{watchlist_id} ─────────────────────────────────────────

@router.put("/{watchlist_id}", response_model=WatchlistResponse)
async def update_watchlist(
    watchlist_id: str,
    req: WatchlistUpdate,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """Update name and/or symbols of an owned watchlist."""
    try:
        uid = uuid.UUID(watchlist_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid watchlist ID format.")

    result = await session.execute(
        select(UserWatchlist).where(
            UserWatchlist.id == uid,
            UserWatchlist.user_id == current_user.id,
        )
    )
    w = result.scalar_one_or_none()
    if not w:
        raise HTTPException(status_code=404, detail="Watchlist not found.")

    if req.name is not None:
        w.name = req.name.strip() or w.name
    if req.symbols is not None:
        w.symbols = [s.strip().upper() for s in req.symbols if s.strip()]

    await session.commit()
    await session.refresh(w)
    return _to_resp(w)


# ── DELETE /v1/watchlists/{watchlist_id} ──────────────────────────────────────

@router.delete("/{watchlist_id}", status_code=204)
async def delete_watchlist(
    watchlist_id: str,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """Delete an owned watchlist."""
    try:
        uid = uuid.UUID(watchlist_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid watchlist ID format.")

    result = await session.execute(
        delete(UserWatchlist)
        .where(
            UserWatchlist.id == uid,
            UserWatchlist.user_id == current_user.id,
        )
        .returning(UserWatchlist.id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Watchlist not found.")
    await session.commit()
