"""
Position service — CRUD + bulk import + exposure aggregation.

All queries enforce company_id + branch_id scoping at the SQL level.
Soft delete only (is_active=False). Hard deletes are never performed.
"""
from __future__ import annotations

import uuid as _uuid
from typing import Optional

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.position import Position
from app.models.user import User
from app.schemas_v1.positions import PositionCreate, PositionUpdate


# ---------------------------------------------------------------------------
# Scope helpers
# ---------------------------------------------------------------------------

def _scope_clause(user: User, all_branches: bool):
    """
    Returns a SQLAlchemy WHERE clause for company + optional branch scoping.
    Never filters in memory — always pushes the predicate to SQL.
    """
    if all_branches or user.branch_id is None:
        # Company-wide: all branches
        return Position.company_id == user.company_id
    # Branch-scoped
    return and_(
        Position.company_id == user.company_id,
        Position.branch_id == user.branch_id,
    )


# ---------------------------------------------------------------------------
# CRUD operations
# ---------------------------------------------------------------------------

async def list_positions(
    session: AsyncSession,
    user: User,
    all_branches: bool,
    status: Optional[str] = None,
    currency: Optional[str] = None,
    flow_type: Optional[str] = None,
) -> list[Position]:
    q = (
        select(Position)
        .where(
            _scope_clause(user, all_branches),
            Position.is_active == True,
        )
        .order_by(Position.created_at.desc())
    )
    if status:
        q = q.where(Position.status == status.upper())
    if currency:
        q = q.where(Position.currency == currency.upper())
    if flow_type:
        q = q.where(Position.flow_type == flow_type.upper())
    result = await session.execute(q)
    return list(result.scalars().all())


async def create_position(
    session: AsyncSession,
    user: User,
    data: PositionCreate,
) -> Position:
    """
    Create a new position. Raises ValueError if record_id already exists (active)
    for this company. DB UNIQUE constraint provides concurrency safety.
    """
    existing = await session.execute(
        select(Position).where(
            Position.company_id == user.company_id,
            Position.record_id == data.record_id,
            Position.is_active == True,
        )
    )
    if existing.scalar_one_or_none():
        raise ValueError(
            f"record_id '{data.record_id}' already exists in this company"
        )

    pos = Position(
        company_id=user.company_id,
        branch_id=user.branch_id,
        created_by=user.id,
        **data.model_dump(),
    )
    session.add(pos)
    await session.commit()
    await session.refresh(pos)
    return pos


async def update_position(
    session: AsyncSession,
    user: User,
    position_id: _uuid.UUID,
    data: PositionUpdate,
    all_branches: bool,
) -> Position:
    pos = await _get_in_scope(session, user, position_id, all_branches)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(pos, field, value)
    await session.commit()
    await session.refresh(pos)
    return pos


async def delete_position(
    session: AsyncSession,
    user: User,
    position_id: _uuid.UUID,
    all_branches: bool,
) -> None:
    """Soft delete — sets is_active=False. Never hard-deletes."""
    pos = await _get_in_scope(session, user, position_id, all_branches)
    pos.is_active = False
    await session.commit()


# ---------------------------------------------------------------------------
# Exposure aggregation
# ---------------------------------------------------------------------------

async def get_exposure_aggregation(
    session: AsyncSession,
    user: User,
    all_branches: bool,
) -> list[dict]:
    """
    Aggregate confirmed + forecast amounts per currency.
    Returns a list of dicts matching ExposureAggregation schema.
    Empty list when no active positions exist.
    """
    q = (
        select(
            Position.currency,
            Position.status,
            func.sum(Position.amount).label("total"),
            func.count(Position.id).label("count"),
        )
        .where(
            _scope_clause(user, all_branches),
            Position.is_active == True,
        )
        .group_by(Position.currency, Position.status)
    )
    rows = (await session.execute(q)).all()

    # Reshape: one dict per currency with confirmed + forecast breakdowns
    agg: dict[str, dict] = {}
    for row in rows:
        if row.currency not in agg:
            agg[row.currency] = {
                "currency": row.currency,
                "total_confirmed": 0.0,
                "total_forecast":  0.0,
                "count_confirmed": 0,
                "count_forecast":  0,
            }
        if row.status == "CONFIRMED":
            agg[row.currency]["total_confirmed"] = float(row.total)
            agg[row.currency]["count_confirmed"] = int(row.count)
        else:
            agg[row.currency]["total_forecast"] = float(row.total)
            agg[row.currency]["count_forecast"] = int(row.count)

    # Sort by total exposure descending for deterministic UI ordering
    return sorted(
        agg.values(),
        key=lambda x: x["total_confirmed"] + x["total_forecast"],
        reverse=True,
    )


# ---------------------------------------------------------------------------
# Bulk import
# ---------------------------------------------------------------------------

async def bulk_import(
    session: AsyncSession,
    user: User,
    rows: list[PositionCreate],
) -> tuple[list[Position], list[dict]]:
    """
    Import multiple positions in a single call.
    Returns (created_positions, error_list).
    Each error: {"row": int, "record_id": str, "error": str}
    """
    created: list[Position] = []
    errors:  list[dict]     = []

    for i, row in enumerate(rows):
        try:
            pos = await create_position(session, user, row)
            created.append(pos)
        except ValueError as e:
            errors.append({
                "row": i + 1,
                "record_id": row.record_id,
                "error": str(e),
            })

    return created, errors


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

async def _get_in_scope(
    session: AsyncSession,
    user: User,
    position_id: _uuid.UUID,
    all_branches: bool,
) -> Position:
    """Fetch a position and verify it belongs to the user's company+branch scope."""
    pos = await session.get(Position, position_id)
    if not pos or not pos.is_active:
        raise ValueError("Position not found")
    if pos.company_id != user.company_id:
        raise ValueError("Position not found")  # obscure cross-tenant
    if not all_branches and user.branch_id and pos.branch_id != user.branch_id:
        raise ValueError("Position not in your branch scope")
    return pos
