"""
HedgeTemplate -- reusable hedge strategy blueprint (P2-C).

System templates: company_id=NULL, is_system=True -- seeded once, never deleted.
Company templates: company_id set, is_system=False -- created by users with
                   trades.create permission.

Distinct from PolicyTemplate: a PolicyTemplate governs *rules* (when/whether to
hedge, ratio floors/caps). A HedgeTemplate is an *execution blueprint* (what
mix of instruments to deploy on a single exposure, at what tranches).

instrument_mix schema (JSONB array of legs):
    [
      {
        "instrument": "FORWARD" | "VANILLA_CALL" | "VANILLA_PUT" | "NDF" | "COLLAR",
        "weight": 0.0..1.0,                 # fraction of notional
        "tenor_days": int | null,            # null => match exposure value_date
        "strike_pct": float | null,          # 1.0 = ATM (options only)
        "direction": "BUY" | "SELL",
        "tranche_label": str | null,
      },
      ...
    ]

Service layer enforces sum(weight) ≈ 1.0 and that tranche dates are monotonically
increasing when tenor_days is set.
"""

import uuid as _uuid

from sqlalchemy import Boolean, Column, DateTime, Index, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID

from app.core.db import Base


class HedgeTemplate(Base):
    __tablename__ = "hedge_templates"

    id          = Column(PGUUID(as_uuid=True), primary_key=True, default=_uuid.uuid4)
    company_id  = Column(PGUUID(as_uuid=True), nullable=True)   # NULL = system-wide
    name        = Column(String(255), nullable=False)
    short_name  = Column(String(32),  nullable=False)           # e.g. 'FWD100', 'LAY3'
    description = Column(Text, nullable=True)
    category    = Column(String(32),  nullable=False)           # FORWARD|OPTION|LAYERED|ROLLING|COLLAR|MIXED
    instrument_mix = Column(JSONB, nullable=False)              # list[leg]
    version     = Column(Integer, nullable=False, default=1)
    is_system   = Column(Boolean, nullable=False, default=False)
    is_active   = Column(Boolean, nullable=False, default=True)

    created_at  = Column(DateTime(timezone=True), server_default=text("NOW()"))
    created_by  = Column(PGUUID(as_uuid=True), nullable=True)
    updated_at  = Column(DateTime(timezone=True), nullable=True)
    updated_by  = Column(PGUUID(as_uuid=True), nullable=True)

    __table_args__ = (
        Index("ix_hedge_templates_company_id", "company_id"),
        Index("ix_hedge_templates_category", "category"),
        Index("ix_hedge_templates_company_active", "company_id", "is_active"),
    )
