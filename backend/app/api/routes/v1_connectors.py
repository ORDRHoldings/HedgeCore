"""
Connector API routes -- /api/v1/connectors

Endpoints:
  GET  /v1/connectors/runs            -> list import history (trades.view)
  GET  /v1/connectors/runs/{run_id}   -> detail with errors (trades.view)
  POST /v1/connectors/import/csv      -> audited CSV import (trades.create)
  POST /v1/connectors/import/excel    -> audited Excel import (trades.create)

All endpoints require JWT. Scope resolved from token.
"""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_async_session
from app.core.security import get_current_user
from app.models.user import User
from app.schemas_v1.connectors import (
    ConnectorRunDetailResponse,
    ConnectorRunListResponse,
    ConnectorRunResponse,
)
from app.services import connector_service, rbac_service
from app.services.audit_emit import emit_audit

router = APIRouter(prefix="/v1/connectors", tags=["v1-connectors"])


# ---------------------------------------------------------------------------
# Auth/RBAC helpers
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
    if user.is_superuser:
        return True
    perms = await rbac_service.get_permissions_by_user(session, user.id)
    return "reports.view_all_branches" in perms


# ---------------------------------------------------------------------------
# Routes -- /runs must come before /import to avoid routing ambiguity
# ---------------------------------------------------------------------------

@router.get("/runs", response_model=ConnectorRunListResponse)
async def list_connector_runs(
    limit: int = Query(default=50, ge=1, le=200),
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """List import history for this company/branch, newest first."""
    await _check_permission(session, current_user, "trades.view")
    all_branches = await _resolve_scope(session, current_user)
    items = await connector_service.list_runs(
        session, current_user, all_branches, limit=limit
    )
    return {"items": items, "total": len(items)}


@router.get("/runs/{run_id}", response_model=ConnectorRunDetailResponse)
async def get_connector_run_detail(
    run_id: UUID,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """Return a single ConnectorRun with its per-row errors."""
    await _check_permission(session, current_user, "trades.view")
    try:
        run, errors = await connector_service.get_run_detail(
            session, current_user, run_id
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return ConnectorRunDetailResponse(
        **ConnectorRunResponse.model_validate(run).model_dump(),
        errors=errors,
    )


@router.post("/import/csv", response_model=ConnectorRunResponse, status_code=200)
async def import_csv(
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """
    Audited CSV import. Creates positions + a ConnectorRun audit record.
    Returns the ConnectorRun regardless of row-level errors.
    """
    await _check_permission(session, current_user, "trades.create")
    content = await file.read()
    run = await connector_service.import_csv_audited(
        session, current_user, content, file.filename or "upload.csv"
    )
    # PLAN-07a: audit event — CSV import completed
    await emit_audit(
        session=session,
        user=current_user,
        event_type="TRADE",
        description=f"CSV import: {file.filename or 'upload.csv'} ({run.rows_ok} ok, {run.rows_error} errors)",
        entity_type="connector_run",
        entity_id=str(run.id),
        payload={"filename": file.filename, "rows_ok": run.rows_ok, "rows_error": run.rows_error, "status": run.status},
    )
    return run


@router.post("/import/excel", response_model=ConnectorRunResponse, status_code=200)
async def import_excel(
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """
    Audited Excel (.xlsx) import. Creates positions + a ConnectorRun audit record.
    Returns the ConnectorRun regardless of row-level errors.
    """
    await _check_permission(session, current_user, "trades.create")
    content = await file.read()
    run = await connector_service.import_excel_audited(
        session, current_user, content, file.filename or "upload.xlsx"
    )
    # PLAN-07b: audit event — Excel import completed
    await emit_audit(
        session=session,
        user=current_user,
        event_type="TRADE",
        description=f"Excel import: {file.filename or 'upload.xlsx'} ({run.rows_ok} ok, {run.rows_error} errors)",
        entity_type="connector_run",
        entity_id=str(run.id),
        payload={"filename": file.filename, "rows_ok": run.rows_ok, "rows_error": run.rows_error, "status": run.status},
    )
    return run
