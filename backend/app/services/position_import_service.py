"""
Position import service -- institutional-grade CSV ingest pipeline.

Four-phase workflow:
  1. Upload & parse (detect encoding, parse CSV, auto-map columns)
  2. Validate (I-001..I-010 codes, currency/type/date checks, duplicate detection)
  3. Preview (return validated rows + errors for UI review)
  4. Commit (bulk-create positions from validated rows)

Validation codes:
  I-001  Missing required field
  I-002  Invalid currency (not in FUTURES_CURRENCIES)
  I-003  Invalid flow type (not AR/AP)
  I-004  Invalid status (not CONFIRMED/FORECAST)
  I-005  Amount not positive
  I-006  Invalid date format
  I-007  Duplicate record_id within file
  I-008  Duplicate record_id in database
  I-009  Empty row (all fields blank)
  I-010  Row parse error
"""
from __future__ import annotations

import csv
import hashlib
import io
import logging
import re
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.import_batch import ImportBatch
from app.models.position import Position
from app.models.user import User
from app.schemas_v1.trades import FUTURES_CURRENCIES

log = logging.getLogger(__name__)

# ── Column auto-mapping ──────────────────────────────────────────────
# Maps common CSV header variations to our canonical field names.
_COLUMN_ALIASES: dict[str, list[str]] = {
    "record_id":   ["record_id", "id", "ref", "reference", "trade_id", "trade_ref", "position_id", "external_id", "ext_id"],
    "entity":      ["entity", "company", "counterparty", "legal_entity", "subsidiary", "business_unit", "bu"],
    "flow_type":   ["flow_type", "type", "direction", "side", "ar_ap", "flow"],
    "currency":    ["currency", "ccy", "curr", "iso_currency", "fx_currency", "currency_code"],
    "amount":      ["amount", "notional", "value", "exposure", "nominal", "size", "quantity", "qty"],
    "value_date":  ["value_date", "date", "settlement_date", "maturity", "maturity_date", "settle_date", "expiry", "delivery_date"],
    "status":      ["status", "confirmation", "confirm_status", "state"],
    "description": ["description", "desc", "notes", "memo", "comment", "remarks"],
}

_REQUIRED_FIELDS = {"record_id", "entity", "flow_type", "currency", "amount", "value_date"}
_VALID_FLOW_TYPES = {"AR", "AP"}
_VALID_STATUSES = {"CONFIRMED", "FORECAST"}
_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def auto_map_columns(csv_headers: list[str]) -> dict[str, str | None]:
    """
    Fuzzy-match CSV headers to canonical field names.
    Returns {canonical_field: csv_header_or_None}.
    """
    mapping: dict[str, str | None] = {}
    normalized = {h.strip().lower().replace(" ", "_").replace("-", "_"): h for h in csv_headers}

    for field, aliases in _COLUMN_ALIASES.items():
        matched = None
        for alias in aliases:
            if alias in normalized:
                matched = normalized[alias]
                break
        mapping[field] = matched

    return mapping


def _parse_csv(raw_bytes: bytes) -> tuple[list[str], list[dict[str, str]]]:
    """Parse CSV bytes, handling BOM and encoding. Returns (headers, rows)."""
    for encoding in ("utf-8-sig", "utf-8", "latin-1"):
        try:
            text = raw_bytes.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    else:
        text = raw_bytes.decode("latin-1", errors="replace")

    reader = csv.DictReader(io.StringIO(text))
    headers = reader.fieldnames or []
    rows = list(reader)
    return headers, rows


def _extract_field(row: dict[str, str], mapping: dict[str, str | None], field: str) -> str:
    """Extract a field value from a row using the column mapping."""
    csv_col = mapping.get(field)
    if csv_col is None:
        return ""
    return (row.get(csv_col) or "").strip()


def validate_rows(
    rows: list[dict[str, str]],
    mapping: dict[str, str | None],
    existing_record_ids: set[str],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """
    Validate parsed CSV rows against business rules.
    Returns (valid_rows, errors) where each valid_row is a dict ready for PositionCreate
    and each error is {row, code, field, message, value}.
    """
    valid: list[dict[str, Any]] = []
    errors: list[dict[str, Any]] = []
    seen_ids: set[str] = set()

    for idx, row in enumerate(rows):
        row_num = idx + 2  # 1-indexed, header is row 1
        row_errors: list[dict[str, Any]] = []

        # I-009: empty row
        values = [_extract_field(row, mapping, f) for f in _COLUMN_ALIASES]
        if all(v == "" for v in values):
            errors.append({"row": row_num, "code": "I-009", "field": None, "message": "Empty row", "value": None})
            continue

        # Extract fields
        record_id = _extract_field(row, mapping, "record_id")
        entity = _extract_field(row, mapping, "entity")
        flow_type = _extract_field(row, mapping, "flow_type").upper()
        currency = _extract_field(row, mapping, "currency").upper()
        amount_str = _extract_field(row, mapping, "amount")
        value_date = _extract_field(row, mapping, "value_date")
        status = _extract_field(row, mapping, "status").upper() or "CONFIRMED"
        description = _extract_field(row, mapping, "description")

        # I-001: missing required fields
        field_map = {"record_id": record_id, "entity": entity, "flow_type": flow_type, "currency": currency, "amount": amount_str, "value_date": value_date}
        for f, v in field_map.items():
            if not v:
                row_errors.append({"row": row_num, "code": "I-001", "field": f, "message": f"Missing required field: {f}", "value": None})

        # I-002: invalid currency
        if currency and currency not in FUTURES_CURRENCIES:
            row_errors.append({"row": row_num, "code": "I-002", "field": "currency", "message": f"Invalid currency: {currency}", "value": currency})

        # I-003: invalid flow type
        if flow_type and flow_type not in _VALID_FLOW_TYPES:
            row_errors.append({"row": row_num, "code": "I-003", "field": "flow_type", "message": f"Invalid flow type: {flow_type} (must be AR or AP)", "value": flow_type})

        # I-004: invalid status
        if status and status not in _VALID_STATUSES:
            row_errors.append({"row": row_num, "code": "I-004", "field": "status", "message": f"Invalid status: {status} (must be CONFIRMED or FORECAST)", "value": status})

        # I-005: amount not positive
        amount: float | None = None
        if amount_str:
            try:
                cleaned = amount_str.replace(",", "").replace("$", "").replace(" ", "")
                amount = float(cleaned)
                if amount <= 0:
                    row_errors.append({"row": row_num, "code": "I-005", "field": "amount", "message": f"Amount must be positive: {amount}", "value": amount_str})
            except ValueError:
                row_errors.append({"row": row_num, "code": "I-005", "field": "amount", "message": f"Cannot parse amount: {amount_str}", "value": amount_str})

        # I-006: invalid date
        if value_date and not _DATE_RE.match(value_date):
            # Try common date formats
            parsed_date = _try_parse_date(value_date)
            if parsed_date:
                value_date = parsed_date
            else:
                row_errors.append({"row": row_num, "code": "I-006", "field": "value_date", "message": f"Invalid date format: {value_date} (expected YYYY-MM-DD)", "value": value_date})

        # I-007: duplicate within file
        if record_id and record_id in seen_ids:
            row_errors.append({"row": row_num, "code": "I-007", "field": "record_id", "message": f"Duplicate record_id in file: {record_id}", "value": record_id})

        # I-008: duplicate in database
        if record_id and record_id in existing_record_ids:
            row_errors.append({"row": row_num, "code": "I-008", "field": "record_id", "message": f"record_id already exists in database: {record_id}", "value": record_id})

        if record_id:
            seen_ids.add(record_id)

        if row_errors:
            errors.extend(row_errors)
        else:
            valid.append({
                "record_id": record_id,
                "entity": entity,
                "flow_type": flow_type,
                "currency": currency,
                "amount": amount,
                "value_date": value_date,
                "status": status,
                "description": description or None,
            })

    return valid, errors


def _try_parse_date(s: str) -> str | None:
    """Try common date formats and return YYYY-MM-DD or None."""
    for fmt in ("%m/%d/%Y", "%d/%m/%Y", "%m-%d-%Y", "%d-%m-%Y", "%Y/%m/%d", "%d.%m.%Y"):
        try:
            from datetime import datetime as dt
            parsed = dt.strptime(s, fmt)
            return parsed.strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None


# ── Service functions ────────────────────────────────────────────────

async def upload_and_parse(
    session: AsyncSession,
    user: User,
    filename: str,
    raw_bytes: bytes,
) -> ImportBatch:
    """
    Phase 1: Upload file, parse CSV, auto-map columns, store preview.
    Returns the created ImportBatch with status=UPLOADED.
    """
    file_hash = hashlib.sha256(raw_bytes).hexdigest()

    headers, rows = _parse_csv(raw_bytes)
    mapping = auto_map_columns(headers)

    batch = ImportBatch(
        company_id=user.company_id,
        created_by=user.id,
        filename=filename,
        file_hash=file_hash,
        file_size_bytes=len(raw_bytes),
        row_count=len(rows),
        status="UPLOADED",
        column_mapping=mapping,
        raw_preview=rows,  # Store all rows for validation/commit phases
    )
    session.add(batch)
    await session.commit()
    await session.refresh(batch)
    return batch


async def validate_batch(
    session: AsyncSession,
    user: User,
    batch_id: UUID,
    column_mapping: dict[str, str | None] | None = None,
) -> ImportBatch:
    """
    Phase 2: Validate all rows using the (possibly user-adjusted) column mapping.
    Updates batch with validation results.
    """
    batch = await _get_batch(session, user, batch_id)
    if batch.status not in ("UPLOADED", "VALIDATED"):
        raise ValueError(f"Batch {batch_id} is in status {batch.status}, cannot re-validate")

    # Use user-provided mapping or the auto-detected one
    mapping = column_mapping or batch.column_mapping
    if column_mapping:
        batch.column_mapping = mapping

    # Re-parse the file from raw_preview? No — we need full rows.
    # We stored preview only. For validation we need to re-read.
    # The raw file isn't stored, but we can re-parse from the preview for demo,
    # OR we require the file to be re-sent. Better: store all parsed rows.
    # For production: store parsed rows in the batch.
    # Since we have raw_preview with only 5 rows, let's use the batch's stored data.
    # Actually, for real implementation, the upload stores ALL parsed rows.
    # Let's fix: raw_preview stores ALL rows, preview is just first 5 in the response.

    all_rows = batch.raw_preview or []

    # Fetch existing record_ids for this company
    result = await session.execute(
        select(Position.record_id).where(
            Position.company_id == user.company_id,
            Position.is_active,
        )
    )
    existing_ids = {r[0] for r in result.fetchall()}

    valid_rows, errors = validate_rows(all_rows, mapping, existing_ids)

    batch.valid_count = len(valid_rows)
    batch.error_count = len(errors)
    batch.duplicate_count = sum(1 for e in errors if e["code"] in ("I-007", "I-008"))
    batch.validation_errors = errors
    batch.status = "VALIDATED"
    batch.validated_at = datetime.now(UTC)

    await session.commit()
    await session.refresh(batch)
    return batch


async def commit_batch(
    session: AsyncSession,
    user: User,
    batch_id: UUID,
) -> ImportBatch:
    """
    Phase 3: Create positions from all valid rows.
    Only works on VALIDATED batches with valid_count > 0.
    """
    batch = await _get_batch(session, user, batch_id)
    if batch.status != "VALIDATED":
        raise ValueError(f"Batch {batch_id} must be VALIDATED to commit (current: {batch.status})")
    if batch.valid_count == 0:
        raise ValueError("No valid rows to commit")

    mapping = batch.column_mapping
    all_rows = batch.raw_preview or []

    # Fetch existing record_ids again (may have changed since validation)
    result = await session.execute(
        select(Position.record_id).where(
            Position.company_id == user.company_id,
            Position.is_active,
        )
    )
    existing_ids = {r[0] for r in result.fetchall()}

    valid_rows, _ = validate_rows(all_rows, mapping, existing_ids)

    created_ids: list[str] = []
    commit_errors: list[dict] = []

    for row_data in valid_rows:
        try:
            pos = Position(
                company_id=user.company_id,
                branch_id=user.branch_id,
                created_by=user.id,
                record_id=row_data["record_id"],
                entity=row_data["entity"],
                flow_type=row_data["flow_type"],
                currency=row_data["currency"],
                amount=row_data["amount"],
                value_date=row_data["value_date"],
                status=row_data["status"],
                description=row_data.get("description"),
            )
            session.add(pos)
            await session.flush()
            created_ids.append(str(pos.id))
        except Exception as e:
            commit_errors.append({"record_id": row_data.get("record_id", "?"), "error": str(e)})

    batch.created_count = len(created_ids)
    batch.created_position_ids = created_ids
    batch.status = "COMMITTED"
    batch.committed_at = datetime.now(UTC)

    if commit_errors:
        existing_errors = batch.validation_errors or []
        existing_errors.extend([
            {"row": 0, "code": "I-010", "field": None, "message": e["error"], "value": e["record_id"]}
            for e in commit_errors
        ])
        batch.validation_errors = existing_errors
        batch.error_count = len(existing_errors)

    await session.commit()
    await session.refresh(batch)

    log.info(
        "Import batch %s committed: %d positions created, %d errors",
        batch_id, len(created_ids), len(commit_errors),
    )
    return batch


async def get_batch_history(
    session: AsyncSession,
    user: User,
    limit: int = 50,
) -> list[ImportBatch]:
    """List recent import batches for this company."""
    result = await session.execute(
        select(ImportBatch)
        .where(ImportBatch.company_id == user.company_id)
        .order_by(ImportBatch.created_at.desc())
        .limit(limit)
    )
    return list(result.scalars().all())


async def get_batch(
    session: AsyncSession,
    user: User,
    batch_id: UUID,
) -> ImportBatch:
    """Get a single batch by ID (tenant-scoped)."""
    return await _get_batch(session, user, batch_id)


def generate_template_csv() -> str:
    """Generate a CSV template with headers and example rows."""
    lines = [
        "record_id,entity,flow_type,currency,amount,value_date,status,description",
        "POS-001,Acme Corp,AR,MXN,500000,2026-06-15,CONFIRMED,Q2 receivable from Acme",
        "POS-002,Beta Inc,AP,EUR,250000,2026-07-01,CONFIRMED,Vendor payment to Beta",
        "POS-003,Gamma Ltd,AR,GBP,100000,2026-09-30,FORECAST,Projected Q3 revenue",
    ]
    return "\n".join(lines)


# ── Internal helpers ─────────────────────────────────────────────────

async def _get_batch(session: AsyncSession, user: User, batch_id: UUID) -> ImportBatch:
    batch = await session.get(ImportBatch, batch_id)
    if not batch:
        raise ValueError(f"Import batch {batch_id} not found")
    if batch.company_id != user.company_id:
        raise ValueError(f"Import batch {batch_id} not found")
    return batch
