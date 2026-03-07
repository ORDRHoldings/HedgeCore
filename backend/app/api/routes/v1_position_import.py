"""
Position Import API -- /api/v1/positions/import

Institutional-grade CSV import pipeline:
  POST   /v1/positions/import/upload     -> Upload & parse CSV
  POST   /v1/positions/import/validate   -> Validate with column mapping
  POST   /v1/positions/import/commit     -> Create positions from valid rows
  GET    /v1/positions/import/template   -> Download CSV template
  GET    /v1/positions/import/history    -> List past import batches
  GET    /v1/positions/import/{batch_id} -> Get batch detail

All endpoints require JWT + trades.create permission.
"""
from __future__ import annotations

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_async_session
from app.core.security import get_current_user
from app.models.user import User
from app.services import position_import_service as import_svc
from app.services.audit_emit import emit_audit

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/positions/import", tags=["v1-position-import"])


# ── Request/Response schemas ─────────────────────────────────────────

class ValidateRequest(BaseModel):
    batch_id: UUID
    column_mapping: dict[str, str | None] | None = Field(
        default=None,
        description="Override auto-detected column mapping. Keys are canonical fields, values are CSV column names.",
    )

class CommitRequest(BaseModel):
    batch_id: UUID

class ImportBatchResponse(BaseModel):
    id: UUID
    filename: str
    file_hash: str
    file_size_bytes: int
    row_count: int
    valid_count: int
    error_count: int
    duplicate_count: int
    created_count: int
    status: str
    column_mapping: dict | None = None
    validation_errors: list | None = None
    created_position_ids: list | None = None
    raw_preview: list | None = None
    created_at: str | None = None
    validated_at: str | None = None
    committed_at: str | None = None

    @classmethod
    def from_batch(cls, batch) -> "ImportBatchResponse":
        return cls(
            id=batch.id,
            filename=batch.filename,
            file_hash=batch.file_hash,
            file_size_bytes=batch.file_size_bytes,
            row_count=batch.row_count,
            valid_count=batch.valid_count,
            error_count=batch.error_count,
            duplicate_count=batch.duplicate_count,
            created_count=batch.created_count,
            status=batch.status,
            column_mapping=batch.column_mapping,
            validation_errors=batch.validation_errors,
            created_position_ids=batch.created_position_ids,
            raw_preview=(batch.raw_preview or [])[:5],  # Only preview first 5
            created_at=batch.created_at.isoformat() if batch.created_at else None,
            validated_at=batch.validated_at.isoformat() if batch.validated_at else None,
            committed_at=batch.committed_at.isoformat() if batch.committed_at else None,
        )


class ImportBatchListResponse(BaseModel):
    items: list[ImportBatchResponse]
    total: int


# ── Auth helper ──────────────────────────────────────────────────────

async def _check_import_permission(session: AsyncSession, user: User) -> None:
    if user.is_superuser:
        return
    from app.services import rbac_service
    perms = await rbac_service.get_permissions_by_user(session, user.id)
    if "trades.create" not in perms:
        raise HTTPException(status_code=403, detail="Missing permission: trades.create")


# ── Routes ───────────────────────────────────────────────────────────

@router.post("/upload", response_model=ImportBatchResponse, status_code=201)
async def upload_csv(
    file: UploadFile = File(...),
    request: Request = None,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """
    Upload a CSV file for position import.
    Parses the file, auto-detects column mapping, and returns a batch with preview.
    Max file size: 10MB.
    """
    await _check_import_permission(session, current_user)

    raw = await file.read()
    if len(raw) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large (max 10MB)")
    if len(raw) == 0:
        raise HTTPException(status_code=422, detail="Empty file")

    try:
        batch = await import_svc.upload_and_parse(
            session, current_user, file.filename or "upload.csv", raw
        )
    except Exception as e:
        logger.exception("Import upload failed")
        raise HTTPException(status_code=422, detail=str(e))

    await emit_audit(
        session=session, user=current_user,
        event_type="IMPORT",
        description=f"Position import uploaded: {batch.filename} ({batch.row_count} rows)",
        entity_type="import_batch",
        entity_id=str(batch.id),
        payload={"filename": batch.filename, "row_count": batch.row_count, "file_hash": batch.file_hash},
    )

    return ImportBatchResponse.from_batch(batch)


@router.post("/validate", response_model=ImportBatchResponse)
async def validate_csv(
    data: ValidateRequest,
    request: Request = None,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """
    Validate an uploaded batch. Optionally override column mapping.
    Returns validation results: valid_count, error_count, validation_errors[].
    """
    await _check_import_permission(session, current_user)

    try:
        batch = await import_svc.validate_batch(
            session, current_user, data.batch_id, data.column_mapping
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    return ImportBatchResponse.from_batch(batch)


@router.post("/commit", response_model=ImportBatchResponse)
async def commit_csv(
    data: CommitRequest,
    request: Request = None,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """
    Commit a validated batch -- creates positions from all valid rows.
    Only works on VALIDATED batches with valid_count > 0.
    """
    await _check_import_permission(session, current_user)

    try:
        batch = await import_svc.commit_batch(session, current_user, data.batch_id)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    await emit_audit(
        session=session, user=current_user,
        event_type="IMPORT",
        description=f"Position import committed: {batch.created_count} positions from {batch.filename}",
        entity_type="import_batch",
        entity_id=str(batch.id),
        payload={
            "filename": batch.filename,
            "created_count": batch.created_count,
            "error_count": batch.error_count,
        },
    )

    return ImportBatchResponse.from_batch(batch)


@router.get("/template")
async def download_template(
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """Download a CSV template with example rows."""
    csv_content = import_svc.generate_template_csv()
    return PlainTextResponse(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=position_import_template.csv"},
    )


@router.get("/history", response_model=ImportBatchListResponse)
async def get_import_history(
    limit: int = Query(default=50, ge=1, le=200),
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """List recent import batches for the current company."""
    await _check_import_permission(session, current_user)
    batches = await import_svc.get_batch_history(session, current_user, limit)
    items = [ImportBatchResponse.from_batch(b) for b in batches]
    return {"items": items, "total": len(items)}


@router.get("/{batch_id}", response_model=ImportBatchResponse)
async def get_import_batch(
    batch_id: UUID,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """Get detail for a single import batch."""
    await _check_import_permission(session, current_user)
    try:
        batch = await import_svc.get_batch(session, current_user, batch_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return ImportBatchResponse.from_batch(batch)
