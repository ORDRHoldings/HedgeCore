# backend/app/models/cash_forecast.py
"""
Cash flow forecast models.

CashForecastItem   — user-defined recurring cash flow items (rent, payroll, etc.)
CashForecastSnapshot — point-in-time forecast snapshots for variance tracking
"""
from __future__ import annotations

import uuid
from datetime import UTC, date, datetime

from sqlalchemy import Date, DateTime, Integer, Numeric, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class CashForecastItem(Base):
    """A recurring or one-off cash flow item for forecasting.

    Examples: monthly rent, quarterly tax payment, weekly payroll.
    Each item produces one cash flow per recurrence within the forecast horizon.
    """
    __tablename__ = "cash_forecast_items"

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    entity_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    account_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    counterparty_entity_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    direction: Mapped[str] = mapped_column(String(7), nullable=False)  # "INFLOW" or "OUTFLOW"
    amount: Mapped[float] = mapped_column(Numeric(20, 6), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    confidence: Mapped[str] = mapped_column(String(16), nullable=False, default="COMMITTED")  # COMMITTED | PROBABLE | POSSIBLE
    recurrence: Mapped[str] = mapped_column(String(16), nullable=False)  # ONCE | WEEKLY | BIWEEKLY | MONTHLY | QUARTERLY | ANNUALLY
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)  # NULL = indefinite
    day_of_month: Mapped[int | None] = mapped_column(Integer, nullable=True)  # for MONTHLY/QUARTERLY: which day (1-28)
    is_active: Mapped[bool] = mapped_column(nullable=False, default=True)
    created_by: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC))


class CashForecastSnapshot(Base):
    """Point-in-time forecast snapshot for variance tracking.

    Stores the full forecast result as JSONB so we can compare
    'what we predicted last week for this week' vs 'what actually happened'.
    One row per (company, entity, snapshot_date, horizon) tuple.
    """
    __tablename__ = "cash_forecast_snapshots"
    __table_args__ = (
        UniqueConstraint("company_id", "entity_id", "snapshot_date", "horizon",
                         name="uq_forecast_snapshot"),
    )

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    entity_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)  # NULL = consolidated
    snapshot_date: Mapped[date] = mapped_column(Date, nullable=False)
    horizon: Mapped[str] = mapped_column(String(4), nullable=False)  # "13w" or "12m"
    buckets: Mapped[dict] = mapped_column(JSONB, nullable=False)  # list of bucket dicts
    parameters: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)  # scenario params used
    created_by: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))
