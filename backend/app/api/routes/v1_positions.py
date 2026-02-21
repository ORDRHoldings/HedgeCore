"""
Position API routes — /api/v1/positions

Endpoints:
  GET    /v1/positions            → list (trades.view)
  POST   /v1/positions            → create (trades.create)
  PUT    /v1/positions/{id}       → update (trades.edit)
  DELETE /v1/positions/{id}       → soft-delete (trades.delete)
  POST   /v1/positions/import     → CSV bulk import (trades.create)
  GET    /v1/positions/exposure   → aggregated per-currency totals (trades.view)

All endpoints require JWT. Scope (company+branch) is resolved from the token.
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
from app.models.user import User
from app.schemas_v1.positions import (
    ExposureAggregation,
    PositionCreate,
    PositionListResponse,
    PositionResponse,
    PositionUpdate,
)
from app.services import position_service, rbac_service

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
