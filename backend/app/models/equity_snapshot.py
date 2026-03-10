"""WORM equity/index snapshot model."""
from __future__ import annotations

import uuid as _uuid

from sqlalchemy import (
    Boolean, Column, DateTime, Float, Index, Integer, String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.sql import func

from app.core.db import Base


class EquitySnapshot(Base):
    __tablename__ = "equity_snapshots"
    __table_args__ = (
        UniqueConstraint("company_id", "snapshot_hash", name="uix_equity_snap_company_hash"),
        Index("ix_equity_snap_company_symbol", "company_id", "symbol"),
        Index("ix_equity_snap_company_as_of", "company_id", "as_of"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=_uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    symbol = Column(String(20), nullable=False)
    as_of = Column(DateTime(timezone=True), nullable=False)
    source = Column(String(64), nullable=False, default="twelvedata")
    data_class = Column(String(32), nullable=False, default="LIVE")

    open = Column(Float, nullable=True)
    high = Column(Float, nullable=True)
    low = Column(Float, nullable=True)
    close = Column(Float, nullable=False)
    volume = Column(Integer, nullable=True)
    vwap = Column(Float, nullable=True)
    change_pct = Column(Float, nullable=True)
    market_cap = Column(Float, nullable=True)
    pe_ratio = Column(Float, nullable=True)

    payload = Column(JSONB, nullable=True)
    snapshot_hash = Column(String(64), nullable=False)
    is_stale = Column(Boolean, default=False)
    staleness_minutes = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
