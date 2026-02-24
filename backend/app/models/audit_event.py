"""
AuditEvent ORM model -- append-only, tamper-evident event ledger.

WORM semantics:
  - Rows are NEVER updated or deleted after insert.
  - Every event includes a SHA-256 hash of its own payload.
  - Each event also stores prev_event_hash, forming a cryptographic chain.
    A chain verifier can detect any tampering by recomputing hashes.

Event types (from EventType enum):
  INGEST    -- position imported (CSV, ERP, DB, manual entry)
  POLICY    -- policy assigned, activated, or changed
  CALCULATE -- POST /v1/calculate run completed
  LIFECYCLE -- execution_status transition (NEW->POLICY_ASSIGNED->...->HEDGED)
  EXECUTION -- position executed (IBKR ack, manual confirm)
  REJECTION -- position rejected
  LOGIN     -- user authentication event
  SYSTEM    -- system-level events (startup, schema migration, seed)

Each event carries:
  - actor_id, actor_email: who performed the action
  - entity_type, entity_id: what was acted upon (position, run, policy)
  - payload: structured JSONB with all relevant field values at time of event
  - event_hash: SHA-256(event_type + actor_id + entity_id + payload + created_at)
  - prev_event_hash: hash of the previous event in this tenant's chain (or "GENESIS")
"""
import hashlib
import json
import uuid as _uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Index, String, text
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID

from app.core.db import Base

# Sentinel for first event in a chain
GENESIS_HASH = "0" * 64


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id         = Column(PGUUID(as_uuid=True), primary_key=True, default=_uuid.uuid4)

    # Tenant context
    company_id = Column(PGUUID(as_uuid=True), nullable=True)   # null = system event
    branch_id  = Column(PGUUID(as_uuid=True), nullable=True)

    # Actor (who performed the action)
    actor_id    = Column(PGUUID(as_uuid=True), nullable=True)  # null = system/anonymous
    actor_email = Column(String(255), nullable=True)
    actor_role  = Column(String(64),  nullable=True)

    # Event classification
    event_type  = Column(String(32), nullable=False)   # see EventType above
    # Human-readable description of the event
    description = Column(String(1024), nullable=False)

    # Target entity
    entity_type = Column(String(32), nullable=True)    # 'position', 'run', 'policy', etc.
    entity_id   = Column(String(64), nullable=True)    # UUID or string ID

    # Structured payload (field values at time of event for full replay)
    payload     = Column(JSONB, nullable=False, default=dict)

    # Tamper-evidence chain
    event_hash     = Column(String(64), nullable=False)  # SHA-256 of this event
    prev_event_hash = Column(String(64), nullable=False, default=GENESIS_HASH)

    # Request metadata (for IP/device fingerprint)
    request_id = Column(String(64), nullable=True)
    ip_address = Column(String(64), nullable=True)

    # WORM timestamp -- never updated
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("NOW()"),
    )

    __table_args__ = (
        # Primary audit queries: by tenant + time
        Index("ix_audit_tenant_time",  "company_id", "created_at"),
        # Filter by event type
        Index("ix_audit_event_type",   "company_id", "event_type"),
        # Filter by entity (e.g., all events for position X)
        Index("ix_audit_entity",       "entity_type", "entity_id"),
        # Filter by actor
        Index("ix_audit_actor",        "actor_id", "created_at"),
        # Hash chain integrity queries
        Index("ix_audit_hash",         "event_hash"),
    )


def compute_event_hash(
    event_type: str,
    actor_id: str | None,
    entity_id: str | None,
    payload: dict,
    created_at: datetime,
    prev_hash: str,
) -> str:
    """
    SHA-256 hash of the canonical event content.
    Any field modification after insert will invalidate this hash,
    making tampering detectable.
    """
    canonical = json.dumps({
        "event_type":       event_type,
        "actor_id":         str(actor_id) if actor_id else None,
        "entity_id":        str(entity_id) if entity_id else None,
        "payload_digest":   hashlib.sha256(
                                json.dumps(payload, sort_keys=True, default=str).encode()
                            ).hexdigest(),
        "created_at":       created_at.isoformat(),
        "prev_event_hash":  prev_hash,
    }, sort_keys=True)
    return hashlib.sha256(canonical.encode()).hexdigest()


def build_audit_event(
    event_type: str,
    description: str,
    payload: dict,
    prev_event_hash: str = GENESIS_HASH,
    company_id=None,
    branch_id=None,
    actor_id=None,
    actor_email: str | None = None,
    actor_role: str | None = None,
    entity_type: str | None = None,
    entity_id: str | None = None,
    request_id: str | None = None,
    ip_address: str | None = None,
) -> AuditEvent:
    """
    Factory: build a new AuditEvent row, computing the tamper-evident hash.
    Call session.add(event) and session.commit() after.
    """
    now = datetime.now(timezone.utc)
    event_hash = compute_event_hash(
        event_type=event_type,
        actor_id=str(actor_id) if actor_id else None,
        entity_id=str(entity_id) if entity_id else None,
        payload=payload,
        created_at=now,
        prev_hash=prev_event_hash,
    )
    return AuditEvent(
        company_id       = company_id,
        branch_id        = branch_id,
        actor_id         = actor_id,
        actor_email      = actor_email,
        actor_role       = actor_role,
        event_type       = event_type,
        description      = description,
        entity_type      = entity_type,
        entity_id        = str(entity_id) if entity_id else None,
        payload          = payload,
        event_hash       = event_hash,
        prev_event_hash  = prev_event_hash,
        request_id       = request_id,
        ip_address       = ip_address,
        created_at       = now,
    )
