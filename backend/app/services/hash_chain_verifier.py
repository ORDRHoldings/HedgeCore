"""
app/services/hash_chain_verifier.py

Integrity verifier for the WORM audit_events hash chain.

Walks events per tenant in chronological order and confirms:
  1) recomputed SHA-256 matches stored event_hash (record-level tamper check)
  2) prev_event_hash of event N equals event_hash of event N-1 (chain linkage)
  3) first event in each tenant's chain links to GENESIS_HASH

Returns a structured report listing breaks, not an exception, so callers
(cron, admin endpoint, deep-health probe) can present findings.

This module is read-only. It never modifies audit_events.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Sequence
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_event import (
    GENESIS_HASH,
    AuditEvent,
    compute_event_hash,
)


@dataclass
class ChainBreak:
    """A single integrity violation detected during chain verification."""

    company_id: str
    event_id: str
    sequence_index: int
    kind: str  # "hash_mismatch" | "prev_hash_mismatch" | "genesis_mismatch"
    detail: str


@dataclass
class ChainReport:
    """Outcome of a hash-chain verification pass."""

    checked_at: datetime
    tenants_checked: int
    events_checked: int
    breaks: list[ChainBreak] = field(default_factory=list)

    @property
    def healthy(self) -> bool:
        return not self.breaks

    def to_dict(self) -> dict:
        return {
            "checked_at": self.checked_at.isoformat(),
            "tenants_checked": self.tenants_checked,
            "events_checked": self.events_checked,
            "healthy": self.healthy,
            "break_count": len(self.breaks),
            "breaks": [
                {
                    "company_id": b.company_id,
                    "event_id": b.event_id,
                    "sequence_index": b.sequence_index,
                    "kind": b.kind,
                    "detail": b.detail,
                }
                for b in self.breaks
            ],
        }


async def verify_tenant_chain(
    session: AsyncSession,
    company_id: UUID,
) -> list[ChainBreak]:
    """Verify the hash chain for a single tenant. Returns list of breaks (empty = OK)."""
    stmt = (
        select(AuditEvent)
        .where(AuditEvent.company_id == company_id)
        .order_by(AuditEvent.created_at, AuditEvent.id)
    )
    result = await session.execute(stmt)
    events: Sequence[AuditEvent] = result.scalars().all()

    breaks: list[ChainBreak] = []
    prev_hash = GENESIS_HASH

    for idx, ev in enumerate(events):
        recomputed = compute_event_hash(
            event_type=ev.event_type,
            actor_id=str(ev.actor_id) if ev.actor_id else None,
            entity_id=str(ev.entity_id) if ev.entity_id else None,
            payload=ev.payload or {},
            created_at=ev.created_at,
            prev_hash=ev.prev_event_hash,
        )
        if recomputed != ev.event_hash:
            breaks.append(
                ChainBreak(
                    company_id=str(company_id),
                    event_id=str(ev.id),
                    sequence_index=idx,
                    kind="hash_mismatch",
                    detail=f"stored={ev.event_hash[:12]}… computed={recomputed[:12]}…",
                )
            )

        if ev.prev_event_hash != prev_hash:
            breaks.append(
                ChainBreak(
                    company_id=str(company_id),
                    event_id=str(ev.id),
                    sequence_index=idx,
                    kind="genesis_mismatch" if idx == 0 else "prev_hash_mismatch",
                    detail=(
                        f"prev_event_hash={ev.prev_event_hash[:12]}… "
                        f"expected={prev_hash[:12]}…"
                    ),
                )
            )

        prev_hash = ev.event_hash

    return breaks


async def verify_all_chains(session: AsyncSession) -> ChainReport:
    """Verify hash chains for every tenant that has at least one audit event."""
    tenants_stmt = select(AuditEvent.company_id).distinct()
    result = await session.execute(tenants_stmt)
    tenant_ids = [row[0] for row in result.all() if row[0] is not None]

    total_events = 0
    all_breaks: list[ChainBreak] = []

    for tenant_id in tenant_ids:
        count_stmt = select(AuditEvent.id).where(AuditEvent.company_id == tenant_id)
        count_result = await session.execute(count_stmt)
        total_events += len(count_result.all())
        all_breaks.extend(await verify_tenant_chain(session, tenant_id))

    return ChainReport(
        checked_at=datetime.now(UTC),
        tenants_checked=len(tenant_ids),
        events_checked=total_events,
        breaks=all_breaks,
    )
