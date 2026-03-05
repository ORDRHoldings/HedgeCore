"""
ReportSchedule ORM model -- persists user-configured report delivery schedules.

RPT-06: Report Scheduling (API layer only; no live email delivery in v1).

Each row represents a recurring schedule (DAILY / WEEKLY / MONTHLY) for a
named report type. The actual email delivery requires SMTP configuration
outside v1 scope. next_run_at / last_run_at are informational fields that
would be maintained by a Celery beat task in a future phase.
"""

import uuid as _uuid

from sqlalchemy import Boolean, Column, DateTime, Index, String, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID

from app.core.db import Base


class ReportSchedule(Base):
    __tablename__ = "report_schedules"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=_uuid.uuid4)

    # Tenant context
    user_id    = Column(PGUUID(as_uuid=True), nullable=False)  # FK -> users.id
    company_id = Column(PGUUID(as_uuid=True), nullable=False)  # FK -> companies.id

    # Human-readable schedule name e.g. "Weekly FX Pack"
    name = Column(String(255), nullable=False)

    # Recurrence: DAILY | WEEKLY | MONTHLY
    frequency = Column(String(16), nullable=False)

    # Which report type: committee_pack | coverage | compliance
    report_type = Column(String(64), nullable=False)

    # Delivery recipients -- list of email address strings
    recipients = Column(JSONB, nullable=False, default=list)

    # Scheduling bookkeeping (maintained by task runner, nullable until first run)
    last_run_at = Column(DateTime(timezone=True), nullable=True)
    next_run_at = Column(DateTime(timezone=True), nullable=True)

    # Soft disable without deletion
    is_active = Column(Boolean, nullable=False, default=True)

    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("NOW()"),
    )

    __table_args__ = (
        # Primary access pattern: user's schedules
        Index("ix_report_schedules_user", "user_id", "created_at"),
        # Tenant-wide schedule list
        Index("ix_report_schedules_company", "company_id", "is_active"),
        # Task runner: find active schedules due to run
        Index("ix_report_schedules_next_run", "is_active", "next_run_at"),
    )
