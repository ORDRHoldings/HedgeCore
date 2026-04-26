"""WORM options snapshot model."""
from __future__ import annotations

import uuid as _uuid

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    Index,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.sql import func

from app.core.db import Base


class OptionsSnapshot(Base):
    __tablename__ = "options_snapshots"
    __table_args__ = (
        UniqueConstraint("company_id", "snapshot_hash", name="uix_options_snap_company_hash"),
        Index("ix_options_snap_company_underlying", "company_id", "underlying"),
        Index("ix_options_snap_company_as_of", "company_id", "as_of"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=_uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    underlying = Column(String(20), nullable=False)
    expiry = Column(String(10), nullable=False)
    strike = Column(Float, nullable=False)
    option_type = Column(String(4), nullable=False)  # CALL | PUT
    as_of = Column(DateTime(timezone=True), nullable=False)
    source = Column(String(64), nullable=False, default="ibkr")
    data_class = Column(String(32), nullable=False, default="LIVE")

    bid = Column(Float, nullable=True)
    ask = Column(Float, nullable=True)
    last = Column(Float, nullable=True)
    volume = Column(Integer, nullable=True)
    open_interest = Column(Integer, nullable=True)
    implied_vol = Column(Float, nullable=True)
    delta = Column(Float, nullable=True)
    gamma = Column(Float, nullable=True)
    theta = Column(Float, nullable=True)
    vega = Column(Float, nullable=True)

    payload = Column(JSONB, nullable=True)
    snapshot_hash = Column(String(64), nullable=False)
    is_stale = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
