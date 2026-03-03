"""
CalculationRun ORM model -- persists every POST /v1/calculate result.

The run_envelope (inputs/output hashes) and trace_lite (stage-by-stage trace)
are stored as JSONB. This makes every calculation:
  - Replayable: inputs_hash + policy_hash uniquely identify the computation
  - Auditable: trace_lite shows exactly what the engine did at each stage
  - Diffable: outputs_hash detects any non-determinism between runs

The _run_store dict in v1_calculate.py is kept as a fast in-process cache
(bounded to 50 items) but every run is also written here for permanence.

WORM semantics: this table is append-only. Rows are never updated or deleted.
"""
import uuid as _uuid

from sqlalchemy import Column, DateTime, Index, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID

from app.core.db import Base


class CalculationRun(Base):
    __tablename__ = "calculation_runs"

    # Primary key -- matches the run_id returned to the frontend
    id = Column(String(64), primary_key=True)

    # Tenant context (nullable for unauthenticated calculate calls)
    company_id = Column(PGUUID(as_uuid=True), nullable=True)
    user_id    = Column(PGUUID(as_uuid=True), nullable=True)

    # Hash chain -- from RunEnvelope
    inputs_hash  = Column(String(128), nullable=False)
    outputs_hash = Column(String(128), nullable=False)
    run_hash     = Column(String(128), nullable=False)   # determinism key

    # Position IDs that were part of this run (array stored as JSON list)
    position_ids = Column(JSONB, nullable=False, default=list)

    # Full RunEnvelope + TraceLite stored as JSONB for replay/export
    run_envelope = Column(JSONB, nullable=False)
    trace_lite   = Column(JSONB, nullable=True)

    # Summary stats (for list view without deserializing JSONB)
    trade_count   = Column(Integer, nullable=False, default=0)
    hedge_count   = Column(Integer, nullable=False, default=0)
    # Policy version pinning (Sprint 1.0):
    #   policy_revision_id -- UUID of the PolicyRevision row in force at calc time
    #   policy_hash        -- SHA-256 of canonical_policy at that revision
    # These two fields together allow byte-for-byte proof of which policy
    # governed this calculation, satisfying the BlackRock replay requirement:
    #   "same snapshots + same policy revision -> identical outputs + identical hashes"
    policy_revision_id = Column(String(64), nullable=True)   # UUID -> policy_revisions.id
    policy_hash        = Column(String(128), nullable=True)  # SHA-256 hex

    # WORM timestamp -- set once at insert, never updated
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("NOW()"),
    )

    __table_args__ = (
        # Primary lookup: by tenant + time (for run list)
        Index("ix_calc_runs_tenant", "company_id", "created_at"),
        # Determinism verification: same run_hash should never produce different outputs
        Index("ix_calc_runs_hash", "run_hash"),
        # Lookup by position IDs (GIN index for JSONB array containment)
        Index("ix_calc_runs_positions", "position_ids", postgresql_using="gin"),
    )
