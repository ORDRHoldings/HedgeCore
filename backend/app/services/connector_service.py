"""
connector_service.py -- Audited import service for the Ingestion Desk.

Wraps position_service bulk_import with ConnectorRun artifact creation.
All imports produce a ConnectorRun record (audit trail) regardless of outcome.
"""
from __future__ import annotations

import csv
import hashlib
import io
import uuid as _uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.connector import ConnectorRun, ConnectorRunError
from app.models.user import User
from app.schemas_v1.positions import PositionCreate
from app.services import position_service


class DuplicateImportError(Exception):
    """Raised when an identical file (same SHA-256 hash) has already been imported."""
    def __init__(self, file_hash: str, existing_run_id: _uuid.UUID):
        self.file_hash = file_hash
        self.existing_run_id = existing_run_id
        super().__init__(f"Duplicate import: file hash {file_hash[:16]}... already imported in run {existing_run_id}")



# ---------------------------------------------------------------------------
# Core audit helpers
# ---------------------------------------------------------------------------

async def _check_duplicate_hash(
    session: AsyncSession,
    user: User,
    file_hash: str,
) -> None:
    """Raise DuplicateImportError if this exact file was already imported by this company."""
    if not file_hash:
        return
    q = select(ConnectorRun).where(
        ConnectorRun.company_id == user.company_id,
        ConnectorRun.source_hash == file_hash,
        ConnectorRun.status.in_(["COMPLETED", "RUNNING"]),
    ).limit(1)
    result = await session.execute(q)
    existing = result.scalars().first()
    if existing:
        raise DuplicateImportError(file_hash, existing.id)


async def create_run(
    session: AsyncSession,
    user: User,
    connector_type: str,
    filename: Optional[str] = None,
    file_hash: Optional[str] = None,
) -> ConnectorRun:
    """Start a ConnectorRun audit record (status=RUNNING)."""
    run = ConnectorRun(
        company_id=user.company_id,
        branch_id=user.branch_id,
        triggered_by=user.id,
        connector_type=connector_type,
        source_filename=filename,
        source_hash=file_hash,
        status="RUNNING",
    )
    session.add(run)
    await session.flush()   # assign PK without committing
    return run


async def record_error(
    session: AsyncSession,
    run_id: _uuid.UUID,
    error_message: str,
    row_number: Optional[int] = None,
    field_name: Optional[str] = None,
    raw_data: Optional[dict] = None,
) -> None:
    """Append a per-row error to a ConnectorRun."""
    err = ConnectorRunError(
        run_id=run_id,
        row_number=row_number,
        field_name=field_name,
        error_message=error_message,
        raw_data=raw_data,
    )
    session.add(err)


async def complete_run(
    session: AsyncSession,
    run: ConnectorRun,
    total_rows: int,
    created_ok: int,
    error_count: int,
) -> ConnectorRun:
    """Finalise a ConnectorRun and commit."""
    run.status = "COMPLETED" if error_count < total_rows else "FAILED"
    run.total_rows = total_rows
    run.created_ok = created_ok
    run.error_count = error_count
    run.completed_at = datetime.now(timezone.utc)
    await session.commit()
    await session.refresh(run)
    return run


# ---------------------------------------------------------------------------
# Query helpers
# ---------------------------------------------------------------------------

async def list_runs(
    session: AsyncSession,
    user: User,
    all_branches: bool,
    limit: int = 50,
) -> list[ConnectorRun]:
    q = select(ConnectorRun).where(
        ConnectorRun.company_id == user.company_id,
    )
    if not all_branches and user.branch_id is not None:
        q = q.where(ConnectorRun.branch_id == user.branch_id)
    q = q.order_by(ConnectorRun.started_at.desc()).limit(limit)
    result = await session.execute(q)
    return list(result.scalars().all())


async def get_run_detail(
    session: AsyncSession,
    user: User,
    run_id: _uuid.UUID,
) -> tuple[ConnectorRun, list[ConnectorRunError]]:
    run = await session.get(ConnectorRun, run_id)
    if not run or run.company_id != user.company_id:
        raise ValueError("ConnectorRun not found")
    errors_q = (
        select(ConnectorRunError)
        .where(ConnectorRunError.run_id == run_id)
        .order_by(ConnectorRunError.row_number)
    )
    errors = list((await session.execute(errors_q)).scalars().all())
    return run, errors


# ---------------------------------------------------------------------------
# Audited CSV import
# ---------------------------------------------------------------------------

async def import_csv_audited(
    session: AsyncSession,
    user: User,
    content: bytes,
    filename: str,
) -> ConnectorRun:
    """
    Parse a CSV file and create positions row-by-row.
    Every call produces a ConnectorRun audit record regardless of outcome.
    """
    file_hash = hashlib.sha256(content).hexdigest()
    await _check_duplicate_hash(session, user, file_hash)
    run = await create_run(
        session, user, "UPLOAD_CSV", filename, file_hash
    )

    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = content.decode("latin-1")

    reader = csv.DictReader(io.StringIO(text))
    total = 0
    created_ok = 0
    error_count = 0

    for i, row in enumerate(reader):
        total += 1
        row_num = i + 2  # +2: header + 0-index
        try:
            data = PositionCreate(
                record_id=row["record_id"],
                entity=row["entity"],
                flow_type=row["flow_type"],
                currency=row["currency"],
                amount=float(row["amount"]),
                value_date=row["value_date"],
                status=row.get("status") or "CONFIRMED",
                description=row.get("description") or None,
            )
            await position_service.create_position(session, user, data)
            created_ok += 1
        except Exception as e:
            error_count += 1
            await record_error(
                session,
                run.id,
                str(e),
                row_number=row_num,
                raw_data=dict(row),
            )

    return await complete_run(session, run, total, created_ok, error_count)


# ---------------------------------------------------------------------------
# Audited Excel import (openpyxl)
# ---------------------------------------------------------------------------

async def import_excel_audited(
    session: AsyncSession,
    user: User,
    content: bytes,
    filename: str,
) -> ConnectorRun:
    """
    Parse an Excel (.xlsx) file using openpyxl and create positions row-by-row.
    Assumes first row is the header row.
    """
    file_hash = hashlib.sha256(content).hexdigest()
    await _check_duplicate_hash(session, user, file_hash)
    run = await create_run(
        session, user, "UPLOAD_EXCEL", filename, file_hash
    )

    total = 0
    created_ok = 0
    error_count = 0

    try:
        import openpyxl  # optional dependency
        wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
        ws = wb.active

        rows_iter = iter(ws.rows)
        header_row = next(rows_iter, None)
        if header_row is None:
            return await complete_run(session, run, 0, 0, 0)

        headers = [str(cell.value).strip() if cell.value is not None else "" for cell in header_row]

        for i, xl_row in enumerate(rows_iter):
            total += 1
            row_num = i + 2
            row_dict = {
                headers[j]: (str(xl_row[j].value).strip() if xl_row[j].value is not None else "")
                for j in range(min(len(headers), len(xl_row)))
            }
            try:
                data = PositionCreate(
                    record_id=row_dict["record_id"],
                    entity=row_dict["entity"],
                    flow_type=row_dict["flow_type"],
                    currency=row_dict["currency"],
                    amount=float(row_dict["amount"]),
                    value_date=row_dict["value_date"],
                    status=row_dict.get("status") or "CONFIRMED",
                    description=row_dict.get("description") or None,
                )
                await position_service.create_position(session, user, data)
                created_ok += 1
            except Exception as e:
                error_count += 1
                await record_error(
                    session,
                    run.id,
                    str(e),
                    row_number=row_num,
                    raw_data=row_dict,
                )

    except ImportError:
        run.status = "FAILED"
        run.completed_at = datetime.now(timezone.utc)
        await record_error(
            session, run.id, "openpyxl is not installed on this server."
        )
        await session.commit()
        await session.refresh(run)
        return run

    return await complete_run(session, run, total, created_ok, error_count)
