"""
CustomReportTemplate -- user-defined, tenant-scoped reusable report template
(P2-B).

Distinct from:
  - SavedReport: a run-bound *snapshot* of a filled-in report. Has run_id.
  - REPORT_PRESETS (frontend): the 46 hardcoded system presets.

A CustomReportTemplate is a *reusable blueprint*. Users pick "Custom Report" in
the Studio, design their section mix + default bindings, then save as template.
Future runs can select it from "My Templates" in the template dropdown.

sections schema (JSONB array, shape mirrors ReportSection minus runtime ids):
    [
      {
        "type": SectionType,        # EXECUTIVE_SUMMARY, HEDGE_PLAN_TABLE, ...
        "title": str,
        "order": int,
        "status": "INCLUDED" | "EXCLUDED" | "DRAFT",
        "page_break_before": bool,
      },
      ...
    ]

default_bindings schema (JSONB dict, optional):
    {
      "reporting_currency": "EUR",
      "as_of_date": "2026-04-18",
      ...
    }
"""

import uuid as _uuid

from sqlalchemy import Boolean, Column, DateTime, Index, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID

from app.core.db import Base


class CustomReportTemplate(Base):
    __tablename__ = "custom_report_templates"

    id          = Column(PGUUID(as_uuid=True), primary_key=True, default=_uuid.uuid4)
    company_id  = Column(PGUUID(as_uuid=True), nullable=False)   # strict tenant scope
    user_id     = Column(PGUUID(as_uuid=True), nullable=False)   # owner (for attribution)

    name        = Column(String(255), nullable=False)
    short_name  = Column(String(64),  nullable=False)
    description = Column(Text, nullable=True)
    category    = Column(String(48),  nullable=False)            # ReportCategory enum
    audience    = Column(JSONB, nullable=False, default=list)    # list[str] ReportAudience
    sections    = Column(JSONB, nullable=False)                  # list[section spec]
    default_bindings = Column(JSONB, nullable=False, default=dict)
    tags        = Column(JSONB, nullable=False, default=list)    # list[str]

    is_active   = Column(Boolean, nullable=False, default=True)

    created_at  = Column(DateTime(timezone=True), server_default=text("NOW()"))
    updated_at  = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("ix_custom_report_templates_company", "company_id"),
        Index("ix_custom_report_templates_company_active", "company_id", "is_active"),
        Index("ix_custom_report_templates_user", "user_id"),
    )
