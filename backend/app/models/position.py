"""
Position ORM model — FX exposure positions, fully tenant-scoped.

company_id + branch_id scoping enforced at query level (never filter in memory).
Soft delete via is_active=False (never hard delete positions).
record_id is unique per company (enforced via DB UNIQUE constraint + service pre-check).
"""
import uuid as _uuid

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Index,
    Numeric,
    String,
    text,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID

from app.core.db import Base


class Position(Base):
    __tablename__ = "positions"

    # Primary key
    id = Column(PGUUID(as_uuid=True), primary_key=True, default=_uuid.uuid4)

    # Tenant scoping (no ORM FK relationships — avoids session factory conflicts)
    company_id = Column(PGUUID(as_uuid=True), nullable=False)   # FK → companies
    branch_id  = Column(PGUUID(as_uuid=True), nullable=True)    # FK → branches
    created_by = Column(PGUUID(as_uuid=True), nullable=False)   # FK → users

    # Business fields — mirrors frontend TradeRow shape
    # Note: frontend uses `type`, backend uses `flow_type` (avoids Python keyword)
    record_id   = Column(String(128), nullable=False)            # unique per company
    entity      = Column(String(255), nullable=False)
    flow_type   = Column(String(4),   nullable=False)            # 'AR' | 'AP'
    currency    = Column(String(3),   nullable=False)            # ISO 4217 uppercase
    amount      = Column(Numeric(20, 6), nullable=False)         # > 0 enforced by CHECK
    value_date  = Column(String(10),  nullable=False)            # 'YYYY-MM-DD'
    status      = Column(String(16),  nullable=False, default="CONFIRMED")  # CONFIRMED | FORECAST
    description = Column(String(512), nullable=True)

    # Soft delete + timestamps
    is_active  = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=text("NOW()"))
    updated_at = Column(
        DateTime(timezone=True),
        server_default=text("NOW()"),
        onupdate=text("NOW()"),
    )

    __table_args__ = (
        # Unique: record_id must be unique per company (active positions)
        # Note: DB UNIQUE is on (company_id, record_id) — service layer also pre-checks
        Index("ix_positions_company_record", "company_id", "record_id", unique=True),
        # Scoped list queries — primary access pattern
        Index("ix_positions_scope", "company_id", "branch_id", "is_active"),
        # Currency aggregation for ExposureSummaryWidget
        Index("ix_positions_currency", "company_id", "currency"),
        # User history / audit trail
        Index("ix_positions_created_by", "created_by", "created_at"),
    )
