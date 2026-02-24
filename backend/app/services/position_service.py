"""
Position service -- CRUD + lifecycle transitions + bulk import + exposure aggregation.

All queries enforce company_id + branch_id scoping at the SQL level.
Soft delete only (is_active=False). Hard deletes are never performed.

Lifecycle transitions (Phase 0 regulated backbone):
  assign_policy()        NEW -> POLICY_ASSIGNED
  mark_ready()           POLICY_ASSIGNED -> READY_TO_EXECUTE
  execute_position()     READY_TO_EXECUTE -> HEDGED
  reject_position()      any -> REJECTED
  reopen_position()      REJECTED -> NEW

All transitions are fail-closed (illegal transitions raise ValueError) and return
the updated Position so the caller can emit an audit event.
"""
from __future__ import annotations

import uuid as _uuid
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.position import EXECUTION_TRANSITIONS, Position
from app.models.user import User
from app.schemas_v1.positions import (
    AssignPolicyRequest,
    ExecutePositionRequest,
    PositionCreate,
    PositionUpdate,
    ReadyToExecuteRequest,
    RejectPositionRequest,
)


# ---------------------------------------------------------------------------
# Scope helpers
# ---------------------------------------------------------------------------

def _scope_clause(user: User, all_branches: bool):
    """
    Returns a SQLAlchemy WHERE clause for company + optional branch scoping.
    Never filters in memory -- always pushes the predicate to SQL.
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
    """Soft delete -- sets is_active=False. Never hard-deletes."""
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
# Lifecycle transition helpers (Phase 0 regulated backbone)
# ---------------------------------------------------------------------------

def _assert_transition(current: str, target: str, position_id: _uuid.UUID) -> None:
    """
    Fail-closed transition guard. Raises ValueError if the transition is illegal.
    This is enforced at service layer -- not just API layer -- so any internal
    caller also gets protection.
    """
    allowed = EXECUTION_TRANSITIONS.get(current, set())
    if target not in allowed:
        raise ValueError(
            f"Illegal lifecycle transition for position {position_id}: "
            f"{current!r} -> {target!r}. "
            f"Allowed transitions from {current!r}: {sorted(allowed) or 'none (terminal state)'}"
        )


async def assign_policy(
    session: AsyncSession,
    user: User,
    position_id: _uuid.UUID,
    data: AssignPolicyRequest,
    all_branches: bool,
) -> Position:
    """
    Assign a policy instance to a position and transition execution_status
    NEW -> POLICY_ASSIGNED (or re-assign from POLICY_ASSIGNED -> POLICY_ASSIGNED via NEW path).
    Returns the updated Position. Caller must emit an audit_event.

    Sprint 1.0: Also pins the latest PolicyRevision for the assigned policy
    instance onto the position (position.policy_revision_id). This satisfies the
    version-pinning requirement: "which exact policy revision governed this
    position?" is answerable even after subsequent policy changes.
    """
    from app.services import policy_revision_service as pr_service
    import logging
    _log = logging.getLogger(__name__)

    pos = await _get_in_scope(session, user, position_id, all_branches)
    _assert_transition(pos.execution_status, "POLICY_ASSIGNED", position_id)
    pos.policy_id        = data.policy_instance_id
    pos.execution_status = "POLICY_ASSIGNED"

    # Pin the latest policy revision at assignment time (non-fatal if missing)
    try:
        latest_rev = await pr_service.get_latest_revision(
            session, data.policy_instance_id
        )
        if latest_rev:
            pos.policy_revision_id = latest_rev.id
    except Exception:
        _log.warning(
            "Failed to pin policy_revision_id for position %s. "
            "Version pinning incomplete for this assignment.",
            position_id, exc_info=True,
        )

    await session.commit()
    await session.refresh(pos)
    return pos


async def mark_ready(
    session: AsyncSession,
    user: User,
    position_id: _uuid.UUID,
    data: ReadyToExecuteRequest,
    all_branches: bool,
) -> Position:
    """
    Link a calculation run and transition POLICY_ASSIGNED -> READY_TO_EXECUTE.
    Locks in hedge_amount and hedge_rate from the run result.
    Returns the updated Position. Caller must emit an audit_event.
    """
    pos = await _get_in_scope(session, user, position_id, all_branches)
    _assert_transition(pos.execution_status, "READY_TO_EXECUTE", position_id)
    pos.last_run_id      = data.run_id
    pos.execution_status = "READY_TO_EXECUTE"
    if data.hedge_amount is not None:
        pos.hedge_amount = data.hedge_amount  # type: ignore[assignment]
    if data.hedge_rate is not None:
        pos.hedge_rate = data.hedge_rate      # type: ignore[assignment]
    await session.commit()
    await session.refresh(pos)
    return pos


async def execute_position(
    session: AsyncSession,
    user: User,
    position_id: _uuid.UUID,
    data: ExecutePositionRequest,
    all_branches: bool,
) -> Position:
    """
    Confirm execution (IBKR ack / manual confirm) and transition
    READY_TO_EXECUTE -> HEDGED. execution_ref, executed_at, hedge_amount,
    hedge_rate are written and become IMMUTABLE (service rejects any further
    calls on a HEDGED position).
    Returns the updated Position. Caller must emit an audit_event.
    """
    pos = await _get_in_scope(session, user, position_id, all_branches)
    _assert_transition(pos.execution_status, "HEDGED", position_id)
    pos.execution_ref    = data.execution_ref
    pos.executed_at      = datetime.now(timezone.utc)
    pos.execution_status = "HEDGED"
    if data.hedge_amount is not None:
        pos.hedge_amount = data.hedge_amount  # type: ignore[assignment]
    if data.hedge_rate is not None:
        pos.hedge_rate = data.hedge_rate      # type: ignore[assignment]
    await session.commit()
    await session.refresh(pos)
    return pos


async def reject_position(
    session: AsyncSession,
    user: User,
    position_id: _uuid.UUID,
    data: RejectPositionRequest,
    all_branches: bool,
) -> Position:
    """
    Reject a position from any non-terminal state -> REJECTED.
    Stores mandatory rejection_reason for audit.
    Returns the updated Position. Caller must emit an audit_event.
    """
    pos = await _get_in_scope(session, user, position_id, all_branches)
    _assert_transition(pos.execution_status, "REJECTED", position_id)
    pos.execution_status  = "REJECTED"
    pos.rejection_reason  = data.reason
    await session.commit()
    await session.refresh(pos)
    return pos


async def reopen_position(
    session: AsyncSession,
    user: User,
    position_id: _uuid.UUID,
    all_branches: bool,
) -> Position:
    """
    Re-open a REJECTED position -> NEW, clearing rejection metadata.
    Used when a rejection was made in error or circumstances changed.
    Returns the updated Position. Caller must emit an audit_event.
    """
    pos = await _get_in_scope(session, user, position_id, all_branches)
    _assert_transition(pos.execution_status, "NEW", position_id)
    pos.execution_status  = "NEW"
    pos.rejection_reason  = None
    pos.policy_id         = None
    pos.last_run_id       = None
    await session.commit()
    await session.refresh(pos)
    return pos


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
