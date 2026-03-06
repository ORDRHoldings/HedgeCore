"""
app/services/audit_emit.py

Shared, non-fatal audit event emitter used across all route files.

Usage:
    from app.services.audit_emit import emit_audit

    await emit_audit(
        session=session, user=current_user,
        event_type="SYSTEM",
        description="Decision run created: 3 proposals",
        entity_type="decision_run",
        entity_id=run_id,
        payload={"proposal_count": 3},
    )

Guarantees:
- Fetches previous event_hash for this company to maintain the SHA-256 chain.
- Non-fatal: any DB error is swallowed + logged so the calling endpoint
  always returns its response even if audit emission fails.
- Commits its own unit of work — independent of the caller's transaction state.
"""
from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_event import GENESIS_HASH, AuditEvent, build_audit_event
from app.models.user import User

logger = logging.getLogger(__name__)


async def emit_audit(
    session: AsyncSession,
    user: User,
    event_type: str,
    description: str,
    entity_type: str,
    entity_id: str,
    payload: dict | None = None,
) -> None:
    """
    Append one audit event to the company's hash chain.
    Non-fatal: exceptions are caught and logged, never re-raised.
    """
    try:
        result = await session.execute(
            select(AuditEvent.event_hash)
            .where(AuditEvent.company_id == user.company_id)
            .order_by(AuditEvent.created_at.desc())
            .limit(1)
        )
        prev_hash = result.scalars().first() or GENESIS_HASH

        event = build_audit_event(
            event_type=event_type,
            description=description,
            payload=payload or {},
            prev_event_hash=prev_hash,
            company_id=user.company_id,
            branch_id=user.branch_id,
            actor_id=user.id,
            actor_email=user.email,
            entity_type=entity_type,
            entity_id=entity_id,
        )
        session.add(event)
        await session.commit()
    except Exception:
        logger.warning(
            "Failed to emit audit event event_type=%s entity_type=%s entity_id=%s",
            event_type, entity_type, entity_id,
            exc_info=True,
        )
