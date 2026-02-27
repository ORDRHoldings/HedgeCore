"""

Position ORM model -- FX exposure positions, fully tenant-scoped.



company_id + branch_id scoping enforced at query level (never filter in memory).

Soft delete via is_active=False (never hard delete positions).

record_id is unique per company (enforced via DB UNIQUE constraint + service pre-check).



Execution lifecycle state machine (Phase 0):

  NEW -> POLICY_ASSIGNED -> READY_TO_EXECUTE -> HEDGED

  Any state -> REJECTED (with reason)



Every lifecycle transition is enforced at the API layer (fail-closed) and emits

an audit_event row. This is the regulated backbone -- not feature work.

"""

import uuid as _uuid



from sqlalchemy import (
    select,

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



# Valid execution_status values -- enforced in service layer + DB CHECK

EXECUTION_STATUSES = ("NEW", "POLICY_ASSIGNED", "READY_TO_EXECUTE", "HEDGED", "REJECTED")



# Legal state machine transitions (from -> set of allowed next states)

EXECUTION_TRANSITIONS: dict[str, set[str]] = {

    "NEW":               {"POLICY_ASSIGNED", "REJECTED"},

    "POLICY_ASSIGNED":   {"READY_TO_EXECUTE", "REJECTED", "NEW", "POLICY_ASSIGNED"},  # allow re-assign

    "READY_TO_EXECUTE":  {"HEDGED", "REJECTED", "POLICY_ASSIGNED"},

    "HEDGED":            set(),          # terminal -- no transitions out

    "REJECTED":          {"NEW"},        # allow re-open

}





class Position(Base):

    __tablename__ = "positions"



    # Primary key

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=_uuid.uuid4)



    # Tenant scoping (no ORM FK relationships -- avoids session factory conflicts)

    company_id = Column(PGUUID(as_uuid=True), nullable=False)   # FK -> companies

    branch_id  = Column(PGUUID(as_uuid=True), nullable=True)    # FK -> branches

    created_by = Column(PGUUID(as_uuid=True), nullable=False)   # FK -> users



    # Business fields -- mirrors frontend TradeRow shape

    # Note: frontend uses `type`, backend uses `flow_type` (avoids Python keyword)

    record_id   = Column(String(128), nullable=False)            # unique per company

    entity      = Column(String(255), nullable=False)

    flow_type   = Column(String(4),   nullable=False)            # 'AR' | 'AP'

    currency    = Column(String(3),   nullable=False)            # ISO 4217 uppercase

    amount      = Column(Numeric(20, 6), nullable=False)         # > 0 enforced by CHECK

    value_date  = Column(String(10),  nullable=False)            # 'YYYY-MM-DD'

    status      = Column(String(16),  nullable=False, default="CONFIRMED")  # CONFIRMED | FORECAST

    description = Column(String(512), nullable=True)



    # ?? Execution lifecycle fields (Phase 0 regulated backbone) ??????????????

    # execution_status drives the workflow state machine; never set directly --

    # always transition via position_service.transition_execution_status()

    execution_status = Column(

        String(20), nullable=False, default="NEW",

        comment="Lifecycle: NEW|POLICY_ASSIGNED|READY_TO_EXECUTE|HEDGED|REJECTED",

    )

    # FK -> policy_instances.id -- which policy governs this position's hedge

    policy_id     = Column(PGUUID(as_uuid=True), nullable=True)

    # FK -> policy_revisions.id -- PINNED revision in force at assign-policy time.

    # This is the version-pinning anchor: allows exact replay of "which policy

    # config governed this position" even after subsequent policy changes.

    policy_revision_id = Column(PGUUID(as_uuid=True), nullable=True)

    # run_id from the last POST /v1/calculate that produced a hedge plan for this position

    last_run_id   = Column(String(64), nullable=True)

    # Wall-clock time when the execution was confirmed (IBKR ack / manual confirm)

    executed_at   = Column(DateTime(timezone=True), nullable=True)

    # External execution reference (IBKR order ID, bank ref, broker ticket number)

    execution_ref = Column(String(128), nullable=True)

    # Hedge notional and rate captured at execution time (immutable after HEDGED)

    hedge_amount  = Column(Numeric(20, 6), nullable=True)

    hedge_rate    = Column(Numeric(20, 8), nullable=True)

    # Rejection reason -- populated when execution_status = REJECTED

    rejection_reason = Column(String(512), nullable=True)



    # Soft delete + timestamps

    is_active  = Column(Boolean, nullable=False, default=True)

    created_at = Column(DateTime(timezone=True), server_default=text("NOW()"))

    updated_at = Column(

        DateTime(timezone=True),

        server_default=text("NOW()"),

        onupdate=text("NOW()"),

    )



    @classmethod
    def active_query(cls):
        """Base SELECT that filters out soft-deleted positions (is_active=False).

        Usage:
            stmt = Position.active_query().where(Position.company_id == company_id)
        """
        return select(cls).where(cls.is_active == True)  # noqa: E712

    __table_args__ = (

        # Unique: record_id must be unique per company (active positions)

        # Note: DB UNIQUE is on (company_id, record_id) -- service layer also pre-checks

        Index("ix_positions_company_record", "company_id", "record_id", unique=True),

        # Scoped list queries -- primary access pattern

        Index("ix_positions_scope", "company_id", "branch_id", "is_active"),

        # Currency aggregation for ExposureSummaryWidget

        Index("ix_positions_currency", "company_id", "currency"),

        # User history / audit trail

        Index("ix_positions_created_by", "created_by", "created_at"),

        # Lifecycle status queries (control tower filter presets)

        Index("ix_positions_exec_status", "company_id", "execution_status"),

        # Policy assignment queries

        Index("ix_positions_policy", "policy_id"),

        # Policy revision pinning -- for lineage and replay

        Index("ix_positions_policy_revision", "policy_revision_id"),

    )

