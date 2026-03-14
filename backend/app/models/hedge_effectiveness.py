"""app/models/hedge_effectiveness.py

Hedge Effectiveness ORM models — IFRS 9 / ASC 815 compliance testing.

Tables:
  - hedge_effectiveness_datasets   FV change time-series datasets
  - hedge_effectiveness_runs       Assessment results (WORM — append-only)
"""

from __future__ import annotations

import uuid as _uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID

from app.core.db import Base


class HedgeEffectivenessDataset(Base):
    """Dataset of hedged-item vs instrument FV changes for effectiveness testing."""

    __tablename__ = "hedge_effectiveness_datasets"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=_uuid.uuid4)
    company_id = Column(PGUUID(as_uuid=True), nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    currency_pair = Column(String(16), nullable=True)
    hedge_type = Column(String(32), nullable=False, default="cash_flow")
    designation_date = Column(String(32), nullable=True)
    source = Column(String(32), nullable=False, default="manual")
    period_count = Column(Integer, nullable=False)
    data_json = Column(JSONB, nullable=False)
    source_hash = Column(String(64), nullable=False)
    created_by = Column(PGUUID(as_uuid=True), nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))

    __table_args__ = (
        Index("ix_he_datasets_company", "company_id"),
    )


class HedgeEffectivenessRun(Base):
    """WORM assessment run — append-only, no UPDATE/DELETE."""

    __tablename__ = "hedge_effectiveness_runs"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=_uuid.uuid4)
    company_id = Column(PGUUID(as_uuid=True), nullable=False)
    dataset_id = Column(PGUUID(as_uuid=True), ForeignKey("hedge_effectiveness_datasets.id"), nullable=False)
    methodology_version = Column(String(16), nullable=False)
    standard = Column(String(16), nullable=False, default="ASC_815")
    method_requested = Column(String(16), nullable=True)
    dollar_offset_ratio = Column(Float, nullable=True)
    dollar_offset_effective = Column(Boolean, nullable=True)
    regression_r_squared = Column(Float, nullable=True)
    regression_slope = Column(Float, nullable=True)
    regression_effective = Column(Boolean, nullable=True)
    regression_method = Column(String(32), nullable=True)
    overall_effective = Column(Boolean, nullable=False, default=False)
    run_hash = Column(String(64), nullable=False)
    inputs_hash = Column(String(64), nullable=True)
    outputs_hash = Column(String(64), nullable=True)
    report_json = Column(JSONB, nullable=True)
    trace_bundle = Column(JSONB, nullable=True)
    status = Column(String(16), nullable=False, default="COMPLETED")
    created_by = Column(PGUUID(as_uuid=True), nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))

    __table_args__ = (
        Index("ix_he_runs_company", "company_id"),
        Index("ix_he_runs_dataset", "dataset_id"),
    )
