"""
SavedReport ORM model -- persists user-saved report snapshots.

RPT-04: Report Persistence.

Each row stores a serialised report state (snapshot JSONB) keyed to a
calculation run. Users may save up to 20 reports; older rows are culled
automatically by the v1_reports POST handler.

Mutable: name may be updated. snapshot is write-once by convention (the
frontend saves a new row rather than overwriting, but the ORM allows it).
"""

import uuid as _uuid

from sqlalchemy import Column, DateTime, Index, Integer, String, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID

from app.core.db import Base


class SavedReport(Base):
    __tablename__ = "saved_reports"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=_uuid.uuid4)

    # Tenant context
    user_id    = Column(PGUUID(as_uuid=True), nullable=False)  # FK -> users.id
    company_id = Column(PGUUID(as_uuid=True), nullable=False)  # FK -> companies.id

    # Reference to the calculation run this report was built from
    run_id = Column(String(64), nullable=False)

    # Human-readable label e.g. "Report v1 — 2026-02-28 14:32"
    name = Column(String(255), nullable=False)

    # Full serialised report state (all sections, filters, tab state, etc.)
    snapshot = Column(JSONB, nullable=False, default=dict)

    # Monotonically increasing version within the same run (starts at 1)
    version_number = Column(Integer, nullable=False, default=1)

    # Timestamp -- set once at insert; not auto-updated
    saved_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("NOW()"),
    )

    __table_args__ = (
        # Primary access pattern: user's own saved reports, newest first
        Index("ix_saved_reports_user", "user_id", "saved_at"),
        # Tenant-wide query (admin views)
        Index("ix_saved_reports_company", "company_id", "saved_at"),
        # Lookup by run_id (which reports reference a given run)
        Index("ix_saved_reports_run", "run_id"),
    )
