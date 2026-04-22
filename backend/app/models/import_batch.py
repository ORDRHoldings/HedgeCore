"""
ImportBatch ORM model -- tracks CSV position import jobs.

Each batch represents one file upload and tracks its lifecycle:
  UPLOADED -> VALIDATED -> COMMITTED
  UPLOADED -> VALIDATED -> FAILED (validation errors prevent commit)
  UPLOADED -> FAILED (parse failure)

Tenant-scoped via company_id. SHA-256 file hash for dedup.
"""

import uuid as _uuid

from sqlalchemy import (
    Column,
    DateTime,
    Integer,
    String,
    text,
)
from sqlalchemy.dialects.postgresql import JSON as PGJSON
from sqlalchemy.dialects.postgresql import UUID as PGUUID

from app.core.db import Base

IMPORT_STATUSES = ("UPLOADED", "VALIDATED", "COMMITTED", "FAILED")


class ImportBatch(Base):
    __tablename__ = "import_batches"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=_uuid.uuid4)
    company_id = Column(PGUUID(as_uuid=True), nullable=False)
    created_by = Column(PGUUID(as_uuid=True), nullable=False)

    # File metadata
    filename = Column(String(512), nullable=False)
    file_hash = Column(String(64), nullable=False)  # SHA-256 of raw file
    file_size_bytes = Column(Integer, nullable=False, default=0)

    # Counts
    row_count = Column(Integer, nullable=False, default=0)
    valid_count = Column(Integer, nullable=False, default=0)
    error_count = Column(Integer, nullable=False, default=0)
    duplicate_count = Column(Integer, nullable=False, default=0)
    created_count = Column(Integer, nullable=False, default=0)

    # Lifecycle
    status = Column(String(20), nullable=False, default="UPLOADED")

    # JSONB payloads
    column_mapping = Column(PGJSON, nullable=True)  # {csv_col: target_field}
    validation_errors = Column(PGJSON, nullable=True)  # [{row, code, field, message}]
    created_position_ids = Column(PGJSON, nullable=True)  # [uuid_str, ...]
    raw_preview = Column(PGJSON, nullable=True)  # first 5 rows for UI preview

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=text("NOW()"))
    validated_at = Column(DateTime(timezone=True), nullable=True)
    committed_at = Column(DateTime(timezone=True), nullable=True)
