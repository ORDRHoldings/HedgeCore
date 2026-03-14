"""

app/models/execution_proposal.py

ExecutionProposal -- True 4-Eyes Maker/Checker Workflow



INSTITUTIONAL REQUIREMENT:

  Any action that moves a position to HEDGED must be sequenced through a

  two-actor approval chain. The maker proposes; a different checker approves.

  A single actor cannot both propose and approve their own execution

  (enforced at the DB layer by a CHECK constraint + service guard).



  This is the difference between:

    - Permission-gated SoD (what we had): a role can execute IF they have trades.execute

    - Workflow-sequenced SoD (what regulators require): a DIFFERENT actor must approve



STATE MACHINE:

  PROPOSED -> APPROVED  -> EXECUTED  (position transitions to HEDGED)

  PROPOSED -> WITHDRAWN             (maker withdraws before approval)

  PROPOSED -> REJECTED              (checker rejects proposal)



MUTABILITY CONTRACT:

  DELETE-protected (trigger blocks DELETE). UPDATE allowed for status
  transitions and fill recording. Not a full WORM table -- only
  audit_events, calculation_runs, and policy_revisions are true WORM.

  Terminal states (EXECUTED, WITHDRAWN, REJECTED) are immutable.

  A new proposal must be created for any re-attempt.



HASH CONTRACT:

  proposal_hash   = SHA-256(proposal_payload) -- tamper evidence for maker's submission

  approval_hash   = SHA-256(approval_payload + proposal_hash) -- chains to proposal

  Both are stored and verifiable.



SOD ENFORCEMENT:

  DB CHECK constraint: approved_by IS NULL OR approved_by != proposed_by

  Service guard: raises ValueError if same actor attempts to approve own proposal

  Both layers enforce SoD -- defense in depth.



LINEAGE:

  Each proposal links position_id + policy_revision_id + last_run_id,

  forming the complete provenance chain for the execution.

"""

from __future__ import annotations

import hashlib
import json
import uuid as _uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    Float,
    Index,
    Numeric,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID

from app.core.db import Base

# Valid proposal statuses

PROPOSAL_STATUSES = ("PROPOSED", "APPROVED", "EXECUTED", "WITHDRAWN", "REJECTED")



# Legal state transitions for proposals

PROPOSAL_TRANSITIONS: dict[str, set[str]] = {

    "PROPOSED":  {"APPROVED", "WITHDRAWN", "REJECTED"},

    "APPROVED":  {"EXECUTED", "WITHDRAWN"},       # approved but not yet executed

    "EXECUTED":  set(),   # terminal

    "WITHDRAWN": set(),   # terminal

    "REJECTED":  set(),   # terminal

}





class ExecutionProposal(Base):

    """

    Execution proposal -- the 4-eyes approval record for a position execution.



    One row per proposal attempt. A position can have multiple proposals

    (e.g., if earlier ones were rejected/withdrawn and a new one is created).

    Only one PROPOSED or APPROVED proposal is allowed per position at a time

    (enforced at service layer with a DB-level unique partial index).

    """

    __tablename__ = "execution_proposals"



    # Primary key

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=_uuid.uuid4)



    # Target position

    position_id = Column(PGUUID(as_uuid=True), nullable=False)



    # Tenant context

    company_id = Column(PGUUID(as_uuid=True), nullable=False)

    branch_id  = Column(PGUUID(as_uuid=True), nullable=True)



    # State machine

    status = Column(

        String(16), nullable=False, default="PROPOSED",

        comment="PROPOSED|APPROVED|EXECUTED|WITHDRAWN|REJECTED",

    )



    # ?? Maker fields (set at proposal time) ???????????????????????????????

    proposed_by       = Column(PGUUID(as_uuid=True), nullable=False)

    proposed_by_email = Column(String(255), nullable=True)

    proposed_at       = Column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))



    # Proposal payload -- full execution intent:

    # { execution_ref, hedge_amount, hedge_rate, run_id, policy_revision_id,

    #   notes, instrument, settlement_date }

    proposal_payload = Column(JSONB, nullable=False, default=dict)



    # SHA-256 of canonical_json(proposal_payload) -- tamper evidence

    proposal_hash = Column(String(64), nullable=False)



    # ?? Checker fields (set at approval/rejection time) ???????????????????

    # DB CHECK: approved_by IS NULL OR approved_by != proposed_by

    # This is the DB-level SoD enforcement (defense layer 2 after service guard)

    approved_by       = Column(PGUUID(as_uuid=True), nullable=True)

    approved_by_email = Column(String(255), nullable=True)

    approved_at       = Column(DateTime(timezone=True), nullable=True)

    approval_notes    = Column(Text, nullable=True)



    # SHA-256 of canonical_json({approval_notes, approved_by, approved_at, proposal_hash})

    # Chains approval to proposal -- tamper-evident approval record

    approval_hash = Column(String(64), nullable=True)



    # ?? Outcome fields ????????????????????????????????????????????????????

    # Set when status = EXECUTED (mirrors position.execution_ref, executed_at)

    execution_ref   = Column(String(128), nullable=True)

    executed_at     = Column(DateTime(timezone=True), nullable=True)



    # Set when status = WITHDRAWN or REJECTED

    rejection_reason = Column(Text, nullable=True)

    # -- Dual-key approval (L-12) -----------------------------------------------
    # Flags whether a second approver is required (set at proposal creation time
    # based on notional size vs. policy.dual_key_threshold_usd).
    second_approver_required = Column(
        Boolean, default=False, nullable=False, server_default="false",
    )
    # Set when the second approver confirms the proposal
    second_approver_id    = Column(PGUUID(as_uuid=True), nullable=True)
    second_approver_email = Column(String(128), nullable=True)
    second_approved_at    = Column(DateTime(timezone=True), nullable=True)
    second_approval_notes = Column(String(1024), nullable=True)
    # SHA-256 that chains second approval to the primary approval_hash
    second_approval_hash  = Column(String(64), nullable=True)
    # Risk check decision hash (links proposal to the risk gate verdict)
    risk_decision_hash = Column(String(64), nullable=True)

    # Risk verdict from /v1/risk-check (APPROVE | APPROVE_WITH_CONDITIONS | REJECT)
    risk_verdict = Column(String(32), nullable=True)

    # Fill execution data (recorded after actual trade execution)
    actual_fill_rate     = Column(Numeric(20, 6), nullable=True)
    actual_fill_notional = Column(Numeric(20, 6), nullable=True)
    slippage_bps         = Column(Float, nullable=True)
    fill_timestamp       = Column(String(64), nullable=True)
    fill_hash            = Column(String(64), nullable=True)



    # WORM timestamp

    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))

    updated_at = Column(

        DateTime(timezone=True),

        nullable=False,

        server_default=text("NOW()"),

        onupdate=text("NOW()"),

    )



    __table_args__ = (

        # DB-level SoD: approver cannot be the same person as proposer

        CheckConstraint(

            "approved_by IS NULL OR approved_by != proposed_by",

            name="ck_execution_proposals_sod",

        ),

        # Primary lookup: all proposals for a position

        Index("ix_exec_proposals_position", "position_id", "status"),

        # Active proposals per company (for dashboard)

        Index("ix_exec_proposals_company", "company_id", "status", "proposed_at"),

        # Maker lookups

        Index("ix_exec_proposals_proposer", "proposed_by", "status"),

    )





# ---------------------------------------------------------------------------

# Hash helpers

# ---------------------------------------------------------------------------



def _canonical_json(obj: dict) -> str:

    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False, default=str)





def compute_proposal_hash(payload: dict) -> str:

    """SHA-256 of the canonical proposal payload."""

    return hashlib.sha256(_canonical_json(payload).encode("utf-8")).hexdigest()





def compute_approval_hash(

    approved_by: str,

    approved_at: datetime,

    approval_notes: str | None,

    proposal_hash: str,

) -> str:

    """

    SHA-256 chains the approval record to the proposal_hash.

    Changing any approval field invalidates this hash -- tamper-evident.

    """

    content = {

        "approved_by":    approved_by,

        "approved_at":    approved_at.isoformat(),

        "approval_notes": approval_notes,

        "proposal_hash":  proposal_hash,

    }

    return hashlib.sha256(_canonical_json(content).encode("utf-8")).hexdigest()





def _assert_proposal_transition(current: str, target: str, proposal_id: _uuid.UUID) -> None:

    """Fail-closed transition guard for ExecutionProposal state machine."""

    allowed = PROPOSAL_TRANSITIONS.get(current, set())

    if target not in allowed:

        raise ValueError(

            f"Illegal proposal transition for {proposal_id}: "

            f"{current!r} -> {target!r}. "

            f"Allowed from {current!r}: {sorted(allowed) or 'none (terminal)'}"

        )

