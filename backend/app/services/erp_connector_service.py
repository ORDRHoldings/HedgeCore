"""
ERP Connector Service.

Orchestrates pull -> dedup -> auto-position creation.

Dedup: positions are identified by record_id prefix f"ERP-{dedup_hash[:16]}".
Status: execution_status="NEW" (correct entry point per Position state machine).
Field mapping: entity=counterparty, flow_type=direction, value_date=ISO string.
Note: Position has no source/source_ref/erp_ref/direction/counterparty fields.
"""
from __future__ import annotations

import logging
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.position import Position
from app.models.user import User
from app.services.erp_adapters.base import ERPInvoice

logger = logging.getLogger(__name__)


async def _is_duplicate(
    session: AsyncSession,
    dedup_hash: str,
    company_id: uuid.UUID,
) -> bool:
    """Return True if a position with this dedup_hash already exists.

    Dedup is encoded in record_id as "ERP-<first 16 chars of hash>".
    NOTE: Position model does not have source/source_ref columns in Phase 1.
    """
    prefix = f"ERP-{dedup_hash[:16]}"
    result = await session.execute(
        select(Position).where(
            Position.company_id == company_id,
            Position.record_id == prefix,
        ).limit(1)
    )
    return result.scalar_one_or_none() is not None


async def process_invoices(
    session: AsyncSession,
    invoices: list[ERPInvoice],
    company_id: uuid.UUID,
    user: User,
) -> tuple[list[Position], int]:
    """
    Create NEW-status positions from ERP invoices (deduplicated via record_id prefix).
    Returns (created_positions, skipped_count).
    """
    created: list[Position] = []
    skipped = 0

    for inv in invoices:
        if await _is_duplicate(session, inv.dedup_hash, company_id):
            skipped += 1
            continue

        # Build a minimal position from the invoice.
        # Maps ERP invoice fields to existing Position columns:
        #   entity=counterparty, flow_type=direction, currency=exposure_currency,
        #   amount=notional, value_date=due_date (YYYY-MM-DD string)
        # record_id encodes dedup hash for idempotent re-pulls.
        pos = Position(
            company_id=company_id,
            record_id=f"ERP-{inv.dedup_hash[:16]}",
            entity=inv.counterparty,
            flow_type=inv.direction,      # "AR" or "AP"
            currency=inv.currency,
            amount=inv.amount,
            value_date=inv.due_date.isoformat(),
            execution_status="NEW",       # correct state-machine entry point
            status="CONFIRMED",           # Position.status field default
            description=f"{inv.source_system}:{inv.source_ref}",
            created_by=user.id,
        )
        session.add(pos)
        created.append(pos)

    await session.flush()
    logger.info(
        "ERP pull: %d new positions created, %d duplicates skipped",
        len(created), skipped,
    )
    return created, skipped
