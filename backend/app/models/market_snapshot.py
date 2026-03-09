"""app/models/market_snapshot.py

MarketSnapshot — backend-authoritative WORM market data record.

Each row represents a single market data capture event:
  - fetched from Finnhub (or fallback) at a point in time
  - hashed for tamper-evidence (SHA-256 of canonical JSON)
  - immutable after insert (WORM-enforced by DB trigger)
  - scoped to a company (tenant isolation)

Uniqueness contract: UNIQUE(company_id, market_snapshot_hash)
  → duplicate payloads from the same tenant are idempotent (no second row).
"""

from __future__ import annotations

import uuid as _uuid
from datetime import datetime

from sqlalchemy import (
    UUID,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class MarketSnapshot(Base):
    __tablename__ = "market_snapshots"

    id: Mapped[_uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=_uuid.uuid4,
        doc="Stable reference UUID. Clients pass this as market_snapshot_id.",
    )

    company_id: Mapped[_uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False, index=True,
        doc="Tenant scope — snapshot is only visible to this company.",
    )

    market_snapshot_hash: Mapped[str] = mapped_column(
        String(64), nullable=False,
        doc="SHA-256 of canonical_payload_json. Tamper-evident fingerprint.",
    )

    provider: Mapped[str] = mapped_column(
        String(64), nullable=False, default="unknown",
        doc="Source provider: 'finnhub_live' | 'indicative_fallback' | 'manual'.",
    )

    data_class: Mapped[str] = mapped_column(
        String(32), nullable=False, default="INDICATIVE_FALLBACK",
        doc="Data quality class: 'LIVE' | 'INDICATIVE_FALLBACK'.",
    )

    as_of: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        doc="Market data as-of timestamp (from the source, not our server clock).",
    )

    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(),
        doc="Wall-clock timestamp when our server fetched + persisted this snapshot.",
    )

    primary_currency: Mapped[str] = mapped_column(
        String(8), nullable=False, default="MXN",
        doc="Primary currency of the snapshot (e.g. 'MXN', 'BRL').",
    )

    spot_rate: Mapped[float] = mapped_column(
        Float, nullable=False,
        doc="Spot rate (USD per primary_currency, or primary_currency per USD depending on convention).",
    )

    bid_rate: Mapped[float | None] = mapped_column(
        Float, nullable=True,
        doc="Bid rate (buy side). Nullable for backward compatibility.",
    )

    ask_rate: Mapped[float | None] = mapped_column(
        Float, nullable=True,
        doc="Ask rate (sell side). Nullable for backward compatibility.",
    )

    payload: Mapped[dict] = mapped_column(
        JSONB, nullable=False,
        doc="Full MarketSnapshot payload (spot_rate, forward_points_by_month, provider_metadata).",
    )

    canonical_payload_json: Mapped[str] = mapped_column(
        Text, nullable=False,
        doc="Canonical JSON string used to compute market_snapshot_hash (sort_keys=True).",
    )

    raw_payload_hash: Mapped[str] = mapped_column(
        String(64), nullable=True,
        doc="SHA-256 of the raw (pre-canonicalization) payload. Optional evidence field.",
    )

    is_synthetic_forward: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True,
        doc="True when forward_points_by_month are carry-estimated (not live interbank).",
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(),
    )

    __table_args__ = (
        # Idempotency: one row per (company, hash) — duplicate suppressed
        UniqueConstraint(
            "company_id", "market_snapshot_hash",
            name="uix_market_snapshots_company_hash",
        ),
        Index("ix_market_snapshots_company_as_of", "company_id", "as_of"),
        Index("ix_market_snapshots_company_currency", "company_id", "primary_currency"),
    )

    def __repr__(self) -> str:
        return (
            f"<MarketSnapshot id={self.id} provider={self.provider!r} "
            f"as_of={self.as_of.isoformat() if self.as_of else None} "
            f"hash={self.market_snapshot_hash[:8]}...>"
        )
