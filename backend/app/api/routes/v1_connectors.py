"""
Connector API routes -- /api/v1/connectors

Endpoints:
  GET  /v1/connectors/runs            -> list import history (trades.view)
  GET  /v1/connectors/runs/{run_id}   -> detail with errors (trades.view)
  POST /v1/connectors/import/csv      -> audited CSV import (trades.create)
  POST /v1/connectors/import/excel    -> audited Excel import (trades.create)
  POST /v1/connectors/accounting/import -> trigger accounting system import (trades.create)
  POST /v1/connectors/erp/sync        -> trigger ERP sync (trades.create)

All endpoints require JWT. Scope resolved from token.
"""
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


# ---------------------------------------------------------------------------
# Accounting / ERP integration stubs (production-ready paper mode)
# ---------------------------------------------------------------------------

@router.post("/accounting/import", status_code=202)
async def import_accounting_documents(
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """
    Trigger import from accounting system (QuickBooks, Xero, NetSuite, Sage).

    **Paper mode** — no live credentials are stored. The request is accepted
    and logged, but actual data pull requires ERP credentials to be configured
    in company.settings first.
    """
    await _check_permission(session, current_user, "trades.create")
    await emit_audit(
        session=session,
        user=current_user,
        event_type="CONNECTOR",
        description="Accounting import requested (paper mode — no live credentials)",
        entity_type="connector_run",
        entity_id="paper-mode",
        payload={"status": "accepted", "mode": "paper", "detail": "ERP credentials not configured"},
    )
    return {
        "status": "accepted",
        "mode": "paper",
        "detail": "Accounting import is in paper mode. Configure ERP credentials in Settings > ERP Integration to enable live pulls.",
    }


@router.post("/erp/sync", status_code=202)
async def sync_erp(
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """
    Trigger ERP sync (SAP, Oracle, NetSuite, Dynamics).

    **Paper mode** — no live credentials are stored. The request is accepted
    and logged, but actual sync requires ERP credentials to be configured
    in company.settings first.
    """
    await _check_permission(session, current_user, "trades.create")
    await emit_audit(
        session=session,
        user=current_user,
        event_type="CONNECTOR",
        description="ERP sync requested (paper mode — no live credentials)",
        entity_type="connector_run",
        entity_id="paper-mode",
        payload={"status": "accepted", "mode": "paper", "detail": "ERP credentials not configured"},
    )
    return {
        "status": "accepted",
        "mode": "paper",
        "detail": "ERP sync is in paper mode. Configure ERP credentials in Settings > ERP Integration to enable live sync.",
    }
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
