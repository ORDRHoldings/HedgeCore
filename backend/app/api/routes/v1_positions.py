"""
Position API routes — /api/v1/positions

Standard CRUD:
  GET    /v1/positions                    → list (trades.view)
  POST   /v1/positions                    → create (trades.create)
  PUT    /v1/positions/{id}               → update (trades.edit)
  DELETE /v1/positions/{id}               → soft-delete (trades.delete)
  POST   /v1/positions/import             → CSV bulk import (trades.create)
  GET    /v1/positions/exposure           → aggregated per-currency totals (trades.view)

Lifecycle transitions (Phase 0 regulated backbone — fail-closed):
  PATCH  /v1/positions/{id}/assign-policy → NEW → POLICY_ASSIGNED (trades.edit)
  PATCH  /v1/positions/{id}/ready         → POLICY_ASSIGNED → READY_TO_EXECUTE (trades.edit)
  PATCH  /v1/positions/{id}/execute       → READY_TO_EXECUTE → HEDGED (trades.execute)
  PATCH  /v1/positions/{id}/reject        → any → REJECTED (trades.edit)
  PATCH  /v1/positions/{id}/reopen        → REJECTED → NEW (trades.edit)

All endpoints require JWT. Scope (company+branch) is resolved from the token.
Illegal lifecycle transitions return 409 Conflict with a structured error body.
"""
from __future__ import annotations

import csv
import io
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_async_session
from app.core.security import get_current_user
from app.models.audit_event import GENESIS_HASH, AuditEvent, build_audit_event
from app.models.user import User
from app.schemas_v1.positions import (
    AssignPolicyRequest,
    ExecutePositionRequest,
    ExposureAggregation,
    PositionCreate,
    PositionListResponse,
    PositionResponse,
    PositionUpdate,
    ReadyToExecuteRequest,
    RejectPositionRequest,
)
from app.services import position_service, rbac_service
from sqlalchemy import select as sa_select

router = APIRouter(prefix="/v1/positions", tags=["v1-positions"])


# ---------------------------------------------------------------------------
# Auth/RBAC helpers (inline — avoids session factory mismatch)
# ---------------------------------------------------------------------------

async def _check_permission(
    session: AsyncSession, user: User, codename: str
) -> None:
    if user.is_superuser:
        return
    perms = await rbac_service.get_permissions_by_user(session, user.id)
    if codename not in perms:
        raise HTTPException(
            status_code=403, detail=f"Missing permission: {codename}"
        )


async def _resolve_scope(session: AsyncSession, user: User) -> bool:
    """Returns True if the user may see all branches in their company."""
    if user.is_superuser:
        return True
    perms = await rbac_service.get_permissions_by_user(session, user.id)
    return "reports.view_all_branches" in perms


# ---------------------------------------------------------------------------
# Routes — NOTE: /exposure and /import must come before /{position_id}
# ---------------------------------------------------------------------------

@router.get("/exposure", response_model=list[ExposureAggregation])
async def get_exposure(
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """
    Aggregate active positions by currency.
    Returns confirmed + forecast totals per currency.
    Empty list when no positions exist (never returns fake zeros).
    """
    await _check_permission(session, current_user, "trades.view")
    all_branches = await _resolve_scope(session, current_user)
    return await position_service.get_exposure_aggregation(
        session, current_user, all_branches
    )


@router.post("/import", status_code=200)
async def import_positions_csv(
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """
    Bulk-import positions from CSV.
    Expected columns: record_id, entity, flow_type, currency, amount, value_date,
                      status (optional), description (optional)
    Returns: { created: int, errors: [{row, record_id, error}], total_rows: int }
    """
    await _check_permission(session, current_user, "trades.create")

    content = await file.read()
    try:
        text = content.decode("utf-8-sig")  # handle BOM from Excel exports
    except UnicodeDecodeError:
        text = content.decode("latin-1")

    reader = csv.DictReader(io.StringIO(text))
    rows: list[PositionCreate] = []
    parse_errors: list[dict] = []

    for i, row in enumerate(reader):
        try:
            rows.append(
                PositionCreate(
                    record_id=row["record_id"],
                    entity=row["entity"],
                    flow_type=row["flow_type"],
                    currency=row["currency"],
                    amount=float(row["amount"]),
                    value_date=row["value_date"],
                    status=row.get("status") or "CONFIRMED",
                    description=row.get("description") or None,
                )
            )
        except Exception as e:
            parse_errors.append({"row": i + 2, "error": str(e)})  # +2: header row + 0-index

    if parse_errors:
        raise HTTPException(
            status_code=422,
            detail={"parse_errors": parse_errors},
        )

    created, import_errors = await position_service.bulk_import(
        session, current_user, rows
    )
    return {
        "created": len(created),
        "errors": import_errors,
        "total_rows": len(rows),
    }


@router.get("", response_model=PositionListResponse)
async def list_positions(
    status:    Optional[str] = Query(default=None, description="CONFIRMED or FORECAST"),
    currency:  Optional[str] = Query(default=None, description="ISO 4217 code"),
    flow_type: Optional[str] = Query(default=None, description="AR or AP"),
    session:   AsyncSession  = Depends(get_async_session),
    current_user: User       = Depends(get_current_user),
):
    await _check_permission(session, current_user, "trades.view")
    all_branches = await _resolve_scope(session, current_user)
    items = await position_service.list_positions(
        session, current_user, all_branches, status, currency, flow_type
    )
    return {"items": items, "total": len(items)}


@router.post("", response_model=PositionResponse, status_code=201)
async def create_position(
    data:         PositionCreate,
    session:      AsyncSession = Depends(get_async_session),
    current_user: User         = Depends(get_current_user),
):
    await _check_permission(session, current_user, "trades.create")
    try:
        pos = await position_service.create_position(session, current_user, data)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return pos


@router.put("/{position_id}", response_model=PositionResponse)
async def update_position(
    position_id:  UUID,
    data:         PositionUpdate,
    session:      AsyncSession = Depends(get_async_session),
    current_user: User         = Depends(get_current_user),
):
    await _check_permission(session, current_user, "trades.edit")
    all_branches = await _resolve_scope(session, current_user)
    try:
        pos = await position_service.update_position(
            session, current_user, position_id, data, all_branches
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return pos


@router.delete("/{position_id}", status_code=204)
async def delete_position(
    position_id:  UUID,
    session:      AsyncSession = Depends(get_async_session),
    current_user: User         = Depends(get_current_user),
):
    await _check_permission(session, current_user, "trades.delete")
    all_branches = await _resolve_scope(session, current_user)
    try:
        await position_service.delete_position(
            session, current_user, position_id, all_branches
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ---------------------------------------------------------------------------
# Lifecycle transition endpoints (Phase 0 regulated backbone)
#
# All transitions are fail-closed: illegal transitions return 409 Conflict
# with a structured body: {"error": "ILLEGAL_TRANSITION", "detail": "...",
#                          "current_status": "...", "requested": "..."}
# ---------------------------------------------------------------------------

def _lifecycle_error(e: ValueError, current: str, target: str) -> HTTPException:
    return HTTPException(
        status_code=409,
        detail={
            "error":          "ILLEGAL_TRANSITION",
            "detail":         str(e),
            "current_status": current,
            "requested":      target,
        },
    )


async def _emit_lifecycle_audit(
    session:      AsyncSession,
    user:         User,
    event_type:   str,
    description:  str,
    position_id:  str,
    payload:      dict,
) -> None:
    """
    Append an audit event for a lifecycle transition.
    Fetches the most recent event_hash for this tenant to maintain chain linkage.
    Non-fatal: any DB error is swallowed so lifecycle responses always succeed.
    """
    try:
        q = (
            sa_select(AuditEvent.event_hash)
            .where(AuditEvent.company_id == user.company_id)
            .order_by(AuditEvent.created_at.desc())
            .limit(1)
        )
        result = await session.execute(q)
        prev_hash = result.scalar_one_or_none() or GENESIS_HASH

        event = build_audit_event(
            event_type      = event_type,
            description     = description,
            payload         = payload,
            prev_event_hash = prev_hash,
            company_id      = user.company_id,
            branch_id       = user.branch_id,
            actor_id        = user.id,
            actor_email     = user.email,
            entity_type     = "position",
            entity_id       = position_id,
        )
        session.add(event)
        await session.commit()
    except Exception:
        import logging
        logging.getLogger(__name__).warning(
            "Failed to emit audit event for position %s event_type=%s",
            position_id, event_type, exc_info=True,
        )


@router.patch("/{position_id}/assign-policy", response_model=PositionResponse)
async def assign_policy(
    position_id:  UUID,
    data:         AssignPolicyRequest,
    session:      AsyncSession = Depends(get_async_session),
    current_user: User         = Depends(get_current_user),
):
    """
    Assign a policy instance to a position.
    Transitions: NEW → POLICY_ASSIGNED (or POLICY_ASSIGNED → POLICY_ASSIGNED re-assign).
    Required permission: trades.edit
    """
    await _check_permission(session, current_user, "trades.edit")
    all_branches = await _resolve_scope(session, current_user)
    try:
        pos = await position_service.assign_policy(
            session, current_user, position_id, data, all_branches
        )
    except ValueError as e:
        msg = str(e)
        if "Illegal lifecycle" in msg:
            raise _lifecycle_error(e, "unknown", "POLICY_ASSIGNED")
        raise HTTPException(status_code=404, detail=msg)
    await _emit_lifecycle_audit(
        session, current_user,
        event_type  = "LIFECYCLE",
        description = f"Position {pos.record_id} policy assigned → POLICY_ASSIGNED",
        position_id = str(pos.id),
        payload     = {
            "transition":         "POLICY_ASSIGNED",
            "policy_instance_id": str(data.policy_instance_id),
            "record_id":          pos.record_id,
        },
    )
    return pos


@router.patch("/{position_id}/ready", response_model=PositionResponse)
async def mark_ready(
    position_id:  UUID,
    data:         ReadyToExecuteRequest,
    session:      AsyncSession = Depends(get_async_session),
    current_user: User         = Depends(get_current_user),
):
    """
    Link a calculation run and mark position ready to execute.
    Transitions: POLICY_ASSIGNED → READY_TO_EXECUTE.
    Required permission: trades.edit
    """
    await _check_permission(session, current_user, "trades.edit")
    all_branches = await _resolve_scope(session, current_user)
    try:
        pos = await position_service.mark_ready(
            session, current_user, position_id, data, all_branches
        )
    except ValueError as e:
        msg = str(e)
        if "Illegal lifecycle" in msg:
            raise _lifecycle_error(e, "unknown", "READY_TO_EXECUTE")
        raise HTTPException(status_code=404, detail=msg)
    await _emit_lifecycle_audit(
        session, current_user,
        event_type  = "LIFECYCLE",
        description = f"Position {pos.record_id} run linked → READY_TO_EXECUTE",
        position_id = str(pos.id),
        payload     = {
            "transition":   "READY_TO_EXECUTE",
            "run_id":       data.run_id,
            "hedge_amount": data.hedge_amount,
            "hedge_rate":   data.hedge_rate,
            "record_id":    pos.record_id,
        },
    )
    return pos


@router.patch("/{position_id}/execute", response_model=PositionResponse)
async def execute_position(
    position_id:  UUID,
    data:         ExecutePositionRequest,
    session:      AsyncSession = Depends(get_async_session),
    current_user: User         = Depends(get_current_user),
):
    """
    Confirm execution — IBKR ack, bank confirmation, or manual attestation.
    Transitions: READY_TO_EXECUTE → HEDGED (terminal — no further transitions).
    execution_ref, executed_at, hedge_amount, hedge_rate become immutable.
    Required permission: trades.execute (separate from trades.edit — SoD gate)
    """
    await _check_permission(session, current_user, "trades.execute")
    all_branches = await _resolve_scope(session, current_user)
    try:
        pos = await position_service.execute_position(
            session, current_user, position_id, data, all_branches
        )
    except ValueError as e:
        msg = str(e)
        if "Illegal lifecycle" in msg:
            raise _lifecycle_error(e, "unknown", "HEDGED")
        raise HTTPException(status_code=404, detail=msg)
    await _emit_lifecycle_audit(
        session, current_user,
        event_type  = "EXECUTION",
        description = f"Position {pos.record_id} executed → HEDGED (ref: {data.execution_ref})",
        position_id = str(pos.id),
        payload     = {
            "transition":    "HEDGED",
            "execution_ref": data.execution_ref,
            "hedge_amount":  float(pos.hedge_amount) if pos.hedge_amount else None,
            "hedge_rate":    float(pos.hedge_rate)   if pos.hedge_rate   else None,
            "executed_at":   pos.executed_at.isoformat() if pos.executed_at else None,
            "record_id":     pos.record_id,
        },
    )
    return pos


@router.patch("/{position_id}/reject", response_model=PositionResponse)
async def reject_position(
    position_id:  UUID,
    data:         RejectPositionRequest,
    session:      AsyncSession = Depends(get_async_session),
    current_user: User         = Depends(get_current_user),
):
    """
    Reject a position from any non-terminal state.
    rejection_reason is mandatory for audit trail completeness.
    Transitions: any → REJECTED.
    Required permission: trades.edit
    """
    await _check_permission(session, current_user, "trades.edit")
    all_branches = await _resolve_scope(session, current_user)
    try:
        pos = await position_service.reject_position(
            session, current_user, position_id, data, all_branches
        )
    except ValueError as e:
        msg = str(e)
        if "Illegal lifecycle" in msg:
            raise _lifecycle_error(e, "unknown", "REJECTED")
        raise HTTPException(status_code=404, detail=msg)
    await _emit_lifecycle_audit(
        session, current_user,
        event_type  = "REJECTION",
        description = f"Position {pos.record_id} rejected → REJECTED: {data.reason}",
        position_id = str(pos.id),
        payload     = {
            "transition":       "REJECTED",
            "rejection_reason": data.reason,
            "record_id":        pos.record_id,
        },
    )
    return pos


@router.patch("/{position_id}/reopen", response_model=PositionResponse)
async def reopen_position(
    position_id:  UUID,
    session:      AsyncSession = Depends(get_async_session),
    current_user: User         = Depends(get_current_user),
):
    """
    Re-open a rejected position. Clears policy/run linkage and returns to NEW.
    Transitions: REJECTED → NEW.
    Required permission: trades.edit
    """
    await _check_permission(session, current_user, "trades.edit")
    all_branches = await _resolve_scope(session, current_user)
    try:
        pos = await position_service.reopen_position(
            session, current_user, position_id, all_branches
        )
    except ValueError as e:
        msg = str(e)
        if "Illegal lifecycle" in msg:
            raise _lifecycle_error(e, "unknown", "NEW")
        raise HTTPException(status_code=404, detail=msg)
    await _emit_lifecycle_audit(
        session, current_user,
        event_type  = "LIFECYCLE",
        description = f"Position {pos.record_id} re-opened → NEW",
        position_id = str(pos.id),
        payload     = {
            "transition": "NEW",
            "record_id":  pos.record_id,
        },
    )
    return pos
