"""
Settlement Service — confirmation, reconciliation, variance reporting.

confirm_settlement:
  1. Fetch LedgerEntry (ValueError if not found)
  2. Check not already settled (ValueError if exists)
  3. Compute P&L variance = (actual - hedge) x amount
  4. Create SettlementEvent (CONFIRMED)
  5. Create JournalEntry for SETTLEMENT_VARIANCE (DRAFT — NOT auto-approved)
  6. Caller must run separate 4-eyes approval flow before posting
"""
from __future__ import annotations

import uuid
from datetime import UTC, date, datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.journal_entry import (
    GENESIS_HASH as JE_GENESIS,
    JournalEntry,
    JournalEntryStatus,
    _compute_entry_hash,
)
from app.models.settlement_event import SettlementEvent, SettlementStatus, _compute_event_hash
from app.models.user import User


async def confirm_settlement(
    session: AsyncSession,
    *,
    ledger_entry_id: uuid.UUID,
    actual_rate: Decimal,
    settlement_ref: str,
    hedge_rate: Decimal,
    hedge_notional: Decimal,
    currency: str = "USD",
    standard: str = "IFRS_9",
    user: User,
) -> tuple[SettlementEvent, JournalEntry | None]:
    """
    Confirm settlement of a ledger entry.

    NOTE: hedge_rate and hedge_notional are supplied explicitly by the caller
    (from the frontend UI) because LedgerEntry.frozen_artifact is a complex
    FreezeArtifact blob and does not have top-level "rate" / "notional" keys.

    Returns (SettlementEvent, DRAFT JournalEntry | None).
    JournalEntry is None if variance is zero or GL mapping not configured.
    """
    from app.models.ledger import LedgerEntry  # noqa: PLC0415

    # Fetch the ledger entry
    result = await session.execute(
        select(LedgerEntry).where(LedgerEntry.id == ledger_entry_id)
    )
    ledger = result.scalar_one_or_none()
    if ledger is None:
        raise ValueError(f"LedgerEntry {ledger_entry_id} not found")

    # Cross-tenant isolation: ensure the ledger entry belongs to the caller's company
    if ledger.company_id != user.company.id:
        raise ValueError(f"LedgerEntry {ledger_entry_id} not found")

    # Check not already settled
    result = await session.execute(
        select(SettlementEvent).where(
            SettlementEvent.ledger_entry_id == ledger_entry_id
        ).limit(1)
    )
    existing = result.scalar_one_or_none()
    if existing is not None:
        raise ValueError(
            f"LedgerEntry {ledger_entry_id} is already settled "
            f"(SettlementEvent {existing.id})"
        )

    # Use caller-supplied values (frozen_artifact has no top-level rate/notional)
    hedge_amount = hedge_notional
    company_id = ledger.company_id

    # P&L variance
    rate_variance = actual_rate - hedge_rate
    pnl_impact = rate_variance * hedge_amount
    settlement_amount = actual_rate * hedge_amount
    today = date.today()

    event_hash = _compute_event_hash(
        ledger_entry_id=ledger_entry_id,
        hedge_rate=hedge_rate,
        actual_rate=actual_rate,
        hedge_amount=hedge_amount,
        settlement_date=today,
        settlement_ref=settlement_ref,
    )

    se = SettlementEvent(
        ledger_entry_id=ledger_entry_id,
        company_id=company_id,
        hedge_rate=hedge_rate,
        actual_rate=actual_rate,
        hedge_amount=hedge_amount,
        settlement_amount=settlement_amount,
        rate_variance=rate_variance,
        pnl_impact=pnl_impact,
        settlement_date=today,
        value_date=None,
        settlement_ref=settlement_ref,
        status=SettlementStatus.CONFIRMED.value,
        event_hash=event_hash,
    )
    session.add(se)
    await session.flush()

    # Create DRAFT JournalEntry for settlement variance (only if non-zero)
    draft_je = None
    if abs(pnl_impact) > Decimal("0.001"):
        company_settings = user.company.settings if hasattr(user, "company") else {}
        base_currency = (company_settings or {}).get("base_currency", "USD")

        try:
            from app.services.gl_service import _extend_journal_chain, _get_gl_mapping, GLMappingNotConfiguredError  # noqa: PLC0415
        except ImportError:
            pass
        else:
            try:
                mapping = await _get_gl_mapping(
                    session, company_id, "SETTLEMENT_VARIANCE", standard
                )
                now = datetime.now(UTC)
                chain_seq, prev_hash = await _extend_journal_chain(session, company_id)
                entry_hash = _compute_entry_hash(
                    company_id=company_id,
                    entry_type="SETTLEMENT_VARIANCE",
                    standard=standard,
                    debit_account=mapping.debit_account,
                    credit_account=mapping.credit_account,
                    amount=abs(pnl_impact),
                    currency=currency,
                    period_date=today,
                    created_at=now,
                    chain_seq=chain_seq,
                    prev_entry_hash=prev_hash,
                )
                draft_je = JournalEntry(
                    company_id=company_id,
                    settlement_event_id=se.id,
                    entry_type="SETTLEMENT_VARIANCE",
                    standard=standard,
                    debit_account=mapping.debit_account,
                    credit_account=mapping.credit_account,
                    amount=abs(pnl_impact),
                    currency=currency,
                    base_amount=abs(pnl_impact),
                    base_currency=base_currency,
                    fx_rate_used=actual_rate,
                    period_date=today,
                    description=f"Settlement variance: hedge={hedge_rate} actual={actual_rate}",
                    status=JournalEntryStatus.DRAFT.value,
                    entry_hash=entry_hash,
                    prev_entry_hash=prev_hash,
                    chain_seq=chain_seq,
                    created_at=now,
                    created_by=user.id,
                )
                session.add(draft_je)
                await session.flush()
            except GLMappingNotConfiguredError:
                pass

    # Commit the settlement + draft JE before invoking the TCA hook.
    # auto_reconcile_on_settlement calls reconcile_actual which commits internally;
    # we must NOT let it promote an incomplete outer transaction.
    await session.commit()
    await session.refresh(se)
    if draft_je is not None:
        await session.refresh(draft_je)

    # After SettlementEvent.commit — best-effort TCA reconcile
    from app.services.tca_service import auto_reconcile_on_settlement
    await auto_reconcile_on_settlement(session, se)

    return se, draft_je


async def list_pending_settlements(
    session: AsyncSession,
    company_id: uuid.UUID,
) -> list:
    """Return LedgerEntries with no SettlementEvent for the given company."""
    from app.models.ledger import LedgerEntry  # noqa: PLC0415
    se_subq = (
        select(SettlementEvent.ledger_entry_id)
        .where(SettlementEvent.company_id == company_id)
    ).scalar_subquery()

    result = await session.execute(
        select(LedgerEntry).where(
            LedgerEntry.company_id == company_id,
            LedgerEntry.id.not_in(se_subq),
        )
    )
    return list(result.scalars().all())
