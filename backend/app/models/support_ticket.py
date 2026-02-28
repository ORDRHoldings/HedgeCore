"""
SupportTicket and TicketEvent ORM models -- tenant-scoped ticketing system.

SupportTicket:
  - Tenant-scoped (company_id) support request with severity, category, status lifecycle.
  - Mutable: status, resolution_notes, updated_at, resolved_at may be updated.

TicketEvent:
  - WORM append-only event log for every ticket state transition or comment.
  - Rows are NEVER updated or deleted after insert.
"""

import uuid as _uuid

from sqlalchemy import Column, DateTime, Index, String, Text, ForeignKey, text
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID

from app.core.db import Base


class SupportTicket(Base):
    __tablename__ = "support_tickets"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=_uuid.uuid4)

    # Tenant context
    company_id = Column(PGUUID(as_uuid=True), nullable=False)
    branch_id  = Column(PGUUID(as_uuid=True), nullable=True)

    # Submitter
    submitted_by       = Column(PGUUID(as_uuid=True), nullable=False)
    submitted_by_email = Column(String(255), nullable=True)

    # Human-readable reference: TKT-0001, UNIQUE per company
    ticket_ref = Column(String(16), nullable=False)

    # Content
    subject     = Column(String(255), nullable=False)
    description = Column(Text, nullable=False)

    # Classification
    severity = Column(String(4),  nullable=False, server_default="S3")
    category = Column(String(32), nullable=False, server_default="other")

    # Lifecycle
    status           = Column(String(16), nullable=False, server_default="OPEN")
    resolution_notes = Column(Text, nullable=True)

    # Optional diagnostics snapshot (JSONB)
    diagnostics_bundle = Column(JSONB, nullable=True)

    # Timestamps
    created_at  = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("NOW()"),
    )
    updated_at  = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("NOW()"),
    )
    resolved_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        # Tenant + time (primary list query)
        Index("ix_tickets_tenant", "company_id", "created_at"),
        # Status filter (queue views)
        Index("ix_tickets_status", "company_id", "status"),
        # Per-user history
        Index("ix_tickets_user", "submitted_by", "created_at"),
    )


class TicketEvent(Base):
    """WORM append-only event log for a SupportTicket."""

    __tablename__ = "ticket_events"

    id        = Column(PGUUID(as_uuid=True), primary_key=True, default=_uuid.uuid4)
    ticket_id = Column(
        PGUUID(as_uuid=True),
        ForeignKey("support_tickets.id", ondelete="CASCADE"),
        nullable=False,
    )
    company_id = Column(PGUUID(as_uuid=True), nullable=False)

    # Actor (nullable for system-generated events)
    actor_id    = Column(PGUUID(as_uuid=True), nullable=True)
    actor_email = Column(String(255), nullable=True)

    # Event classification
    event_type = Column(String(32), nullable=False)  # CREATED, STATUS_CHANGED, COMMENT_ADDED, RESOLVED, CLOSED

    # Status transition (populated for STATUS_CHANGED / RESOLVED / CLOSED)
    old_status = Column(String(16), nullable=True)
    new_status = Column(String(16), nullable=True)

    # Free-text comment (populated for COMMENT_ADDED)
    comment = Column(Text, nullable=True)

    # WORM timestamp -- never updated
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("NOW()"),
    )

    __table_args__ = (
        Index("ix_ticket_events_ticket", "ticket_id", "created_at"),
    )
