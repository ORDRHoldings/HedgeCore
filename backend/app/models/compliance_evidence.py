"""
ComplianceEvidence ORM model — WORM-governed SOC2 evidence table.

WORM semantics: rows are NEVER updated or deleted after insert.
A NO UPDATE, NO DELETE trigger is added via Alembic migration.
Evidence rows reference the existing audit_events hash chain
(via latest_audit_event_hash) rather than forming their own chain.

Evidence types collected nightly:
  user_count          — total active users per tenant
  policy_change_count — policy revision rows created in last 24h
  failed_auth_count   — failed login events in last 24h
"""
from __future__ import annotations

import uuid as _uuid

from sqlalchemy import Column, Date, DateTime, Index, String, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID

from app.core.db import Base

EVIDENCE_TYPES = ("user_count", "policy_change_count", "failed_auth_count")


class ComplianceEvidence(Base):
    __tablename__ = "compliance_evidence"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=_uuid.uuid4)
    company_id = Column(PGUUID(as_uuid=True), nullable=True)
    evidence_date = Column(Date, nullable=False)
    evidence_type = Column(String(64), nullable=False)
    payload = Column(JSONB, nullable=False, default=dict)
    latest_audit_event_hash = Column(String(64), nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("NOW()"),
    )

    __table_args__ = (
        Index("ix_compliance_evidence_date", "evidence_date"),
        Index("ix_compliance_evidence_tenant_date", "company_id", "evidence_date"),
        Index("ix_compliance_evidence_type", "evidence_type"),
    )
