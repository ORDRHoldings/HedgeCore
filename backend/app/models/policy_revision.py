"""
app/models/policy_revision.py
Policy Revision -- immutable versioned audit trail of all policy changes.

INSTITUTIONAL REQUIREMENT:
  Every RunEnvelope must be able to prove, byte-for-byte, which exact policy
  configuration was in force at the time of calculation. This requires pinning
  the policy_revision_id (not just the policy_instance_id) to both Position
  and CalculationRun rows.

SCHEMA DESIGN:
  PolicyRevision is append-only (WORM). Each activation of a PolicyTemplate
  produces a new revision row containing:
    - The full canonical policy config (canonical_policy JSONB -- immutable snapshot)
    - A SHA-256 hash of that config (policy_hash -- for determinism verification)
    - The revision number within that policy instance (revision, monotonically increasing)
    - Who made the change and why (created_by, change_reason)
    - A link to the previous revision (prev_revision_id -- for diff traversal)

HASH CONTRACT:
  policy_hash = SHA-256(canonical_json(canonical_policy))
  where canonical_json uses sort_keys=True, no whitespace, UTF-8 encoding.
  This means:
    - Same policy config -> same hash (deterministic)
    - Any config change -> different hash (tamper-evident)
    - RunEnvelope can include policy_hash as proof of policy at calc time

DIFF CONTRACT:
  GET /v1/policies/revisions/{a}/diff/{b} returns a structured diff between
  two revision objects. Both the raw diff and a human-readable summary are
  returned for committee-pack use.

WORM:
  No UPDATE or DELETE on policy_revisions. BEFORE UPDATE/DELETE triggers
  (installed by migration) enforce this at the DB layer.
"""
from __future__ import annotations

import hashlib
import json
import uuid as _uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Index, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID

from app.core.db import Base


class PolicyRevision(Base):
    """
    Immutable, versioned snapshot of a PolicyInstance's effective configuration.

    One row is created each time a policy is activated or its config changes.
    The row is never updated or deleted (WORM semantics -- enforced at DB layer
    by migration a4e9f2b3c1d6).
    """
    __tablename__ = "policy_revisions"

    # Primary key -- UUID for external reference
    id = Column(PGUUID(as_uuid=True), primary_key=True, default=_uuid.uuid4)

    # FK -> policy_instances.id -- which instance this revision belongs to
    policy_instance_id = Column(PGUUID(as_uuid=True), nullable=False)

    # FK -> policy_templates.id -- which template was in force
    template_id = Column(PGUUID(as_uuid=True), nullable=False)

    # Tenant context
    company_id = Column(PGUUID(as_uuid=True), nullable=False)
    branch_id  = Column(PGUUID(as_uuid=True), nullable=True)

    # Monotonically increasing revision number within this policy_instance_id
    # Revision 1 = first activation. Revision N = Nth config change.
    revision = Column(Integer, nullable=False, default=1)

    # Full canonical policy config -- immutable snapshot of what was in force.
    # JSON includes all fields from PolicyConfig: bucket_mode, hedge_ratios,
    # cost_assumptions, execution_product, min_trade_size_usd, etc.
    canonical_policy = Column(JSONB, nullable=False)

    # SHA-256 of canonical_json(canonical_policy) -- for determinism verification.
    # Stored as 64 hex chars. Computed by build_policy_revision() factory.
    policy_hash = Column(String(64), nullable=False)

    # Governance metadata
    created_by    = Column(PGUUID(as_uuid=True), nullable=False)    # FK -> users.id
    created_by_email = Column(String(255), nullable=True)
    change_reason = Column(Text, nullable=True)                     # why this revision?

    # Chain linkage -- FK to previous revision for diff traversal
    # NULL for the first revision of a policy instance
    prev_revision_id = Column(PGUUID(as_uuid=True), nullable=True)

    # WORM timestamp -- never updated
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("NOW()"),
    )

    __table_args__ = (
        # Primary lookup: all revisions for a policy instance (ordered by revision)
        Index("ix_policy_rev_instance",  "policy_instance_id", "revision"),
        # Lookup by hash -- for replay verification
        Index("ix_policy_rev_hash",      "policy_hash"),
        # Tenant-scoped listing
        Index("ix_policy_rev_tenant",    "company_id", "created_at"),
    )


# ---------------------------------------------------------------------------
# Factory + hashing
# ---------------------------------------------------------------------------

def _canonical_json(obj: dict) -> str:
    """Deterministic canonical JSON: sorted keys, no whitespace, UTF-8."""
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False, default=str)


def compute_policy_hash(canonical_policy: dict) -> str:
    """
    SHA-256 of the canonical policy config.
    Identical configs always produce the same hash.
    Any change to any field produces a different hash.
    """
    return hashlib.sha256(_canonical_json(canonical_policy).encode("utf-8")).hexdigest()


def build_policy_revision(
    *,
    policy_instance_id: _uuid.UUID,
    template_id: _uuid.UUID,
    company_id: _uuid.UUID,
    branch_id: _uuid.UUID | None,
    canonical_policy: dict,
    created_by: _uuid.UUID,
    created_by_email: str | None,
    change_reason: str | None,
    prev_revision_id: _uuid.UUID | None,
    revision: int,
) -> PolicyRevision:
    """
    Factory: build a new PolicyRevision row, computing the policy_hash.
    Call session.add(rev) and session.commit() after.
    """
    return PolicyRevision(
        id                  = _uuid.uuid4(),
        policy_instance_id  = policy_instance_id,
        template_id         = template_id,
        company_id          = company_id,
        branch_id           = branch_id,
        revision            = revision,
        canonical_policy    = canonical_policy,
        policy_hash         = compute_policy_hash(canonical_policy),
        created_by          = created_by,
        created_by_email    = created_by_email,
        change_reason       = change_reason,
        prev_revision_id    = prev_revision_id,
        created_at          = datetime.now(timezone.utc),
    )
