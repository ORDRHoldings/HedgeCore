# backend/app/services/cash_audit_service.py
"""
app/services/cash_audit_service.py

SHA-256 hash chain for cash_audit_events.

Pattern: identical to gl_service._extend_journal_chain.
  SELECT chain_seq, event_hash ... ORDER BY chain_seq DESC LIMIT 1 FOR UPDATE
  Never use SELECT MAX(...) FOR UPDATE — illegal in PostgreSQL.
"""
from __future__ import annotations

import hashlib
import json
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.cash import GENESIS_HASH, CashAuditEvent, CashAuditEventType


async def _extend_chain(
    session: AsyncSession,
    company_id: uuid.UUID,
) -> tuple[int, str]:
    """
    Returns (new_chain_seq, prev_event_hash) with row-level lock.
    ORDER BY chain_seq DESC LIMIT 1 FOR UPDATE — matches gl_service pattern.
    """
    result = await session.execute(
        select(CashAuditEvent.chain_seq, CashAuditEvent.event_hash)
        .where(CashAuditEvent.company_id == company_id)
        .order_by(CashAuditEvent.chain_seq.desc())
        .limit(1)
        .with_for_update()
    )
    row = result.first()
    if row is None:
        return 1, GENESIS_HASH
    return row[0] + 1, row[1]


def _compute_event_hash(
    *,
    prev_event_hash: str,
    event_type: str,
    payload: dict,
    performed_by: uuid.UUID,
    created_at: datetime,
) -> str:
    parts = "|".join([
        prev_event_hash,
        event_type,
        json.dumps(payload, sort_keys=True, default=str),
        str(performed_by),
        created_at.isoformat(),
    ])
    return hashlib.sha256(parts.encode()).hexdigest()


async def append_event(
    session: AsyncSession,
    *,
    company_id: uuid.UUID,
    event_type: CashAuditEventType,
    payload: dict[str, Any],
    performed_by: uuid.UUID,
    entity_id: uuid.UUID | None = None,
    account_id: uuid.UUID | None = None,
    balance_id: uuid.UUID | None = None,
) -> CashAuditEvent:
    chain_seq, prev_hash = await _extend_chain(session, company_id)
    now = datetime.now(UTC)
    event_hash = _compute_event_hash(
        prev_event_hash=prev_hash,
        event_type=event_type.value,
        payload=payload,
        performed_by=performed_by,
        created_at=now,
    )
    event = CashAuditEvent(
        company_id=company_id,
        entity_id=entity_id,
        account_id=account_id,
        balance_id=balance_id,
        event_type=event_type.value,
        payload=payload,
        performed_by=performed_by,
        event_hash=event_hash,
        prev_event_hash=prev_hash,
        chain_seq=chain_seq,
        created_at=now,
    )
    session.add(event)
    return event


async def verify_chain(
    session: AsyncSession,
    *,
    company_id: uuid.UUID,
) -> dict:
    """Verify SHA-256 chain integrity for this tenant.

    Returns {ok: True, event_count: N} or {ok: False, broken_at_seq: N}.
    Checks both prev_event_hash linkage AND recomputes each event_hash to detect
    payload tampering (a tampered row with correct linkage is still detected).
    """
    result = await session.execute(
        select(CashAuditEvent)
        .where(CashAuditEvent.company_id == company_id)
        .order_by(CashAuditEvent.chain_seq.asc())
    )
    events = result.scalars().all()
    if not events:
        return {"ok": True, "event_count": 0}

    prev_hash = GENESIS_HASH
    for event in events:
        if event.prev_event_hash != prev_hash:
            return {"ok": False, "broken_at_seq": event.chain_seq}
        expected = _compute_event_hash(
            prev_event_hash=event.prev_event_hash,
            event_type=event.event_type,
            payload=event.payload,
            performed_by=event.performed_by,
            created_at=event.created_at,
        )
        if event.event_hash != expected:
            return {"ok": False, "broken_at_seq": event.chain_seq}
        prev_hash = event.event_hash

    return {"ok": True, "event_count": len(events)}
