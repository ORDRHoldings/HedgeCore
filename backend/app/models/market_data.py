"""Market data snapshot models for forward curves, volatility, and liquidity.

These models support the transition from synthetic forward points to
market-sourced data. Until live feeds are connected, the system operates
with indicative/fallback data governed by V-022/V-024 validator codes.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Column, String, DateTime, Float, Integer, Boolean, Text
from sqlalchemy.dialects.postgresql import UUID as PGUUID, JSONB

from app.core.db import Base


class ForwardCurveSnapshot(Base):
    """Snapshot of forward curve data for a currency pair.

    Replaces synthetic carry-differential estimates with market-sourced
    or provider-sourced forward points. Staleness governed by V-023.
    """
    __tablename__ = "forward_curve_snapshots"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    pair = Column(String(12), nullable=False, index=True)
    as_of = Column(DateTime(timezone=True), nullable=False)
    source = Column(String(32), nullable=False)  # "CME", "BLOOMBERG", "SYNTHETIC", "INDICATIVE"
    data_class = Column(String(32), nullable=False, default="INDICATIVE")  # LIVE, DELAYED, INDICATIVE, SYNTHETIC
    spot_mid = Column(Float, nullable=True)
    forward_points = Column(JSONB, nullable=False)  # {"2026-04": 0.15, "2026-05": 0.28, ...}
    tenor_months = Column(Integer, nullable=True)
    bid_ask_spread_pips = Column(Float, nullable=True)
    swap_rate_annualized = Column(Float, nullable=True)
    is_stale = Column(Boolean, default=False)
    staleness_minutes = Column(Integer, nullable=True)
    snapshot_hash = Column(String(64), nullable=True)
    metadata_json = Column(JSONB, nullable=True)  # provider-specific metadata
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    company_id = Column(PGUUID(as_uuid=True), nullable=True)


class VolatilitySnapshot(Base):
    """Snapshot of volatility surface data for a currency pair.

    Supports EWMA, realized, and implied volatility. Ready for
    CME contract-level vol data when live feeds connect.
    """
    __tablename__ = "volatility_snapshots"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    pair = Column(String(12), nullable=False, index=True)
    as_of = Column(DateTime(timezone=True), nullable=False)
    source = Column(String(32), nullable=False)  # "CME", "CALCULATED", "FALLBACK"
    data_class = Column(String(32), nullable=False, default="FALLBACK")
    realized_vol_annualized = Column(Float, nullable=True)
    ewma_vol_annualized = Column(Float, nullable=True)
    implied_vol_atm = Column(Float, nullable=True)
    vol_z_score = Column(Float, nullable=True)  # current vol vs lookback mean
    vol_regime = Column(String(16), nullable=True)  # "LOW", "NORMAL", "ELEVATED", "CRISIS"
    term_structure_slope = Column(Float, nullable=True)  # 3M-1M vol spread
    lookback_days = Column(Integer, nullable=True)
    ewma_lambda = Column(Float, nullable=True)
    surface_json = Column(JSONB, nullable=True)  # full vol surface by tenor/strike
    snapshot_hash = Column(String(64), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    company_id = Column(PGUUID(as_uuid=True), nullable=True)


class GeopoliticalRiskSnapshot(Base):
    """Snapshot of geopolitical risk scores from Polisophic.

    Currently neutralized (enabled=False in policy). Fully wired
    in schemas, contracts, and audit trail for activation-ready use.
    """
    __tablename__ = "geopolitical_risk_snapshots"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    corridor = Column(String(32), nullable=False, index=True)  # e.g., "US-MX", "US-BR"
    as_of = Column(DateTime(timezone=True), nullable=False)
    source = Column(String(32), nullable=False, default="polisophic")
    normalized_score = Column(Float, nullable=False)  # 0.0 = no risk, 1.0 = extreme
    regime = Column(String(16), nullable=False)  # "STABLE", "ELEVATED", "CRISIS"
    evidence_summary = Column(Text, nullable=True)
    confidence = Column(Float, nullable=True)  # source confidence [0,1]
    factors_json = Column(JSONB, nullable=True)  # breakdown of risk factors
    snapshot_hash = Column(String(64), nullable=True)
    is_stale = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    company_id = Column(PGUUID(as_uuid=True), nullable=True)
