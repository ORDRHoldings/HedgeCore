"""
connector.py -- ORM models for the connector/import audit framework.

ConnectorRun: Audit artifact per import execution.
ConnectorRunError: Per-row errors within a run.
"""
import uuid as _uuid
from sqlalchemy import Boolean, Column, DateTime, Index, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import UUID as PGUUID, JSONB
from app.core.db import Base


class ConnectorRun(Base):
    __tablename__ = "connector_runs"

    id           = Column(PGUUID(as_uuid=True), primary_key=True, default=_uuid.uuid4)
    company_id   = Column(PGUUID(as_uuid=True), nullable=False)
    branch_id    = Column(PGUUID(as_uuid=True), nullable=True)
    triggered_by = Column(PGUUID(as_uuid=True), nullable=False)

    # UPLOAD_CSV | UPLOAD_EXCEL | DATABASE | ERP | ACCOUNTING
    connector_type  = Column(String(32), nullable=False)

    # Audit metadata
    source_filename = Column(String(512), nullable=True)
    source_hash     = Column(String(128), nullable=True)   # SHA-256 of uploaded file

    # Outcome
    status      = Column(String(20), nullable=False, default="RUNNING")  # RUNNING | COMPLETED | FAILED
    total_rows  = Column(Integer, nullable=False, default=0)
    created_ok  = Column(Integer, nullable=False, default=0)
    error_count = Column(Integer, nullable=False, default=0)

    started_at   = Column(DateTime(timezone=True), server_default=text("NOW()"))
    completed_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("ix_connector_runs_scope", "company_id", "branch_id"),
        Index("ix_connector_runs_user",  "triggered_by", "started_at"),
    )


class ConnectorRunError(Base):
    __tablename__ = "connector_run_errors"

    id         = Column(PGUUID(as_uuid=True), primary_key=True, default=_uuid.uuid4)
    run_id     = Column(PGUUID(as_uuid=True), nullable=False)   # FK connector_runs.id (CASCADE)
    row_number = Column(Integer, nullable=True)
    field_name = Column(String(128), nullable=True)
    error_message = Column(Text, nullable=False)
    raw_data   = Column(JSONB, nullable=True)

    __table_args__ = (
        Index("ix_connector_run_errors_run", "run_id"),
    )
