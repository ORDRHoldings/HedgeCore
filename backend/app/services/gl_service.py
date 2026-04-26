# backend/app/services/gl_service.py
"""
app/services/gl_service.py

GL Journal Entry service:
  - generate_journal_entries: create DRAFT entries from an effectiveness run
  - submit_for_approval: DRAFT → PENDING_APPROVAL
  - approve_journal_entry: PENDING_APPROVAL → APPROVED (checker ≠ creator)
  - reject_journal_entry: PENDING_APPROVAL → REJECTED (checker ≠ creator)
  - _extend_journal_chain: atomic chain_seq + prev_entry_hash computation (FOR UPDATE)
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

if TYPE_CHECKING:
    from app.schemas_v1.gl import GLAccountMappingCreate

from app.models.journal_entry import (
    GENESIS_HASH,
    JOURNAL_ENTRY_TRANSITIONS,
    GLAccountMapping,
    GLMappingNotConfiguredError,
    JournalEntry,
    JournalEntryStatus,
    _compute_entry_hash,
)
from app.models.user import User


async def _get_gl_mapping(
    session: AsyncSession,
    company_id: uuid.UUID,
    entry_type: str,
    standard: str,
) -> GLAccountMapping:
    result = await session.execute(
        select(GLAccountMapping).where(
            GLAccountMapping.company_id == company_id,
            GLAccountMapping.entry_type == entry_type,
            GLAccountMapping.standard == standard,
        )
    )
    mapping = result.scalar_one_or_none()
    if mapping is None:
        raise GLMappingNotConfiguredError(
            f"No GL mapping for company={company_id} "
            f"entry_type={entry_type} standard={standard}. "
            f"Configure at /settings/gl-accounts."
        )
    return mapping


async def _extend_journal_chain(
    session: AsyncSession,
    company_id: uuid.UUID,
) -> tuple[int, str]:
    """
    Returns (new_chain_seq, prev_entry_hash) with a row-level lock.

    Fetches and locks the most recent chain row via ORDER BY chain_seq DESC
    LIMIT 1 FOR UPDATE. Concurrent callers block on this lock until the current
    transaction commits, preventing duplicate chain_seq values.

    Note: SELECT MAX(...) FOR UPDATE is illegal in PostgreSQL (aggregate + FOR
    UPDATE is rejected). Row-level locking on the last entry is the correct
    approach.
    """
    result = await session.execute(
        select(JournalEntry.chain_seq, JournalEntry.entry_hash)
        .where(JournalEntry.company_id == company_id)
        .order_by(JournalEntry.chain_seq.desc())
        .limit(1)
        .with_for_update()
    )
    row = result.first()
    if row is None:
        return 1, GENESIS_HASH
    max_seq, prev_hash = row
    return max_seq + 1, prev_hash or GENESIS_HASH


def _assert_je_transition(
    current: str,
    target: JournalEntryStatus,
    entry_id: uuid.UUID,
) -> None:
    current_status = JournalEntryStatus(current)
    if target not in JOURNAL_ENTRY_TRANSITIONS.get(current_status, set()):
        raise ValueError(
            f"Illegal JournalEntry transition: {current} → {target.value} "
            f"(id={entry_id})"
        )


async def generate_journal_entries(
    session: AsyncSession,
    run,  # HedgeEffectivenessRun ORM object
    user: User,
) -> list[JournalEntry]:
    """
    Create DRAFT JournalEntry records from a hedge effectiveness run.
    Raises GLMappingNotConfiguredError if mapping not configured.
    """
    company_id = run.company_id
    standard = run.standard
    entries: list[JournalEntry] = []

    entry_specs = _extract_entry_specs(run)

    for spec in entry_specs:
        mapping = await _get_gl_mapping(
            session, company_id, spec["entry_type"], standard
        )
        now = datetime.now(UTC)
        chain_seq, prev_hash = await _extend_journal_chain(session, company_id)

        entry_hash = _compute_entry_hash(
            company_id=company_id,
            entry_type=spec["entry_type"],
            standard=standard,
            debit_account=mapping.debit_account,
            credit_account=mapping.credit_account,
            amount=spec["amount"],
            currency=spec["currency"],
            period_date=spec["period_date"],
            created_at=now,
            chain_seq=chain_seq,
            prev_entry_hash=prev_hash,  # REQUIRED: hash chain integrity
        )

        je = JournalEntry(
            company_id=company_id,
            run_id=run.id,
            entry_type=spec["entry_type"],
            standard=standard,
            debit_account=mapping.debit_account,
            credit_account=mapping.credit_account,
            amount=spec["amount"],
            currency=spec["currency"],
            base_amount=spec.get("base_amount", spec["amount"]),
            base_currency=spec.get("base_currency", spec["currency"]),
            fx_rate_used=spec.get("fx_rate", 1.0),
            period_date=spec["period_date"],
            description=spec.get("description", ""),
            status=JournalEntryStatus.DRAFT.value,
            entry_hash=entry_hash,
            prev_entry_hash=prev_hash,
            chain_seq=chain_seq,
            created_at=now,
            created_by=user.id,
        )
        session.add(je)
        entries.append(je)

    await session.flush()
    return entries


def _extract_entry_specs(run) -> list[dict]:
    """
    Extract entry specification dicts from a run's results payload.
    Returns list of {entry_type, amount, currency, period_date, ...}.

    Handles two formats:
    1. Structured results with named amount keys (oci_amount, ineffectiveness_amount).
    2. A single entry_type key in results — used when the run encodes one entry
       inline (e.g. {"entry_type": "OCI_RECOGNITION", "amount": 1000}).
    """
    results = run.report_json or {}
    specs = []

    if "oci_amount" in results:
        specs.append({
            "entry_type": "OCI_RECOGNITION",
            "amount": results["oci_amount"],
            "currency": results.get("currency", "USD"),
            "period_date": run.created_at.date(),
        })

    if "ineffectiveness_amount" in results:
        specs.append({
            "entry_type": "INEFFECTIVENESS",
            "amount": results["ineffectiveness_amount"],
            "currency": results.get("currency", "USD"),
            "period_date": run.created_at.date(),
        })

    # Fallback: single inline entry_type (e.g. {"entry_type": "OCI_RECOGNITION"})
    if not specs and "entry_type" in results:
        specs.append({
            "entry_type": results["entry_type"],
            "amount": results.get("amount", 0),
            "currency": results.get("currency", "USD"),
            "period_date": run.created_at.date(),
        })

    return specs


async def submit_for_approval(
    session: AsyncSession,
    entry_id: uuid.UUID,
    user: User,
) -> JournalEntry:
    result = await session.execute(
        select(JournalEntry).where(
            JournalEntry.id == entry_id,
            JournalEntry.company_id == user.company.id,
        )
    )
    je = result.scalar_one_or_none()
    if je is None:
        raise ValueError(f"JournalEntry {entry_id} not found")
    _assert_je_transition(je.status, JournalEntryStatus.PENDING_APPROVAL, entry_id)
    je.status = JournalEntryStatus.PENDING_APPROVAL.value
    await session.flush()
    return je


async def approve_journal_entry(
    session: AsyncSession,
    entry_id: uuid.UUID,
    checker: User,
) -> JournalEntry:
    result = await session.execute(
        select(JournalEntry).where(
            JournalEntry.id == entry_id,
            JournalEntry.company_id == checker.company.id,
        )
    )
    je = result.scalar_one_or_none()
    if je is None:
        raise ValueError(f"JournalEntry {entry_id} not found")

    # SoD must be checked first — a SoD violation should not be masked by a
    # transition error. An unauthorized user should always get a SoD error.
    if je.created_by == checker.id:
        raise ValueError(
            f"SoD violation: checker cannot be the creator of "
            f"JournalEntry {entry_id}"
        )

    _assert_je_transition(je.status, JournalEntryStatus.APPROVED, entry_id)

    je.status = JournalEntryStatus.APPROVED.value
    await session.flush()
    return je


async def reject_journal_entry(
    session: AsyncSession,
    entry_id: uuid.UUID,
    checker: User,
    *,
    reason: str,
) -> JournalEntry:
    if not reason or not reason.strip():
        raise ValueError("reason is required to reject a journal entry")

    result = await session.execute(
        select(JournalEntry).where(
            JournalEntry.id == entry_id,
            JournalEntry.company_id == checker.company.id,
        )
    )
    je = result.scalar_one_or_none()
    if je is None:
        raise ValueError(f"JournalEntry {entry_id} not found")

    # SoD must be checked first — a SoD violation should not be masked by a
    # transition error. An unauthorized user should always get a SoD error.
    if je.created_by == checker.id:
        raise ValueError(
            f"SoD violation: checker cannot be the creator of "
            f"JournalEntry {entry_id}"
        )

    _assert_je_transition(je.status, JournalEntryStatus.REJECTED, entry_id)

    je.status = JournalEntryStatus.REJECTED.value
    await session.flush()
    return je


async def list_journal_entries(
    session: AsyncSession,
    company_id: uuid.UUID,
    *,
    status: str | None = None,
    run_id: uuid.UUID | None = None,
) -> list[JournalEntry]:
    q = select(JournalEntry).where(JournalEntry.company_id == company_id)
    if status:
        q = q.where(JournalEntry.status == status)
    if run_id:
        q = q.where(JournalEntry.run_id == run_id)
    q = q.order_by(JournalEntry.chain_seq.asc())
    result = await session.execute(q)
    return list(result.scalars().all())


async def upsert_gl_mapping(
    session: AsyncSession,
    company_id: uuid.UUID,
    data: GLAccountMappingCreate,
    user: User,
) -> GLAccountMapping:

    result = await session.execute(
        select(GLAccountMapping).where(
            GLAccountMapping.company_id == company_id,
            GLAccountMapping.entry_type == data.entry_type,
            GLAccountMapping.standard == data.standard,
        )
    )
    mapping = result.scalar_one_or_none()
    if mapping is None:
        mapping = GLAccountMapping(
            company_id=company_id,
            entry_type=data.entry_type,
            standard=data.standard,
            debit_account=data.debit_account,
            credit_account=data.credit_account,
            account_label=data.account_label,
            erp_system=data.erp_system,
            created_by=user.id,
            updated_by=user.id,
        )
        session.add(mapping)
    else:
        mapping.debit_account = data.debit_account
        mapping.credit_account = data.credit_account
        mapping.account_label = data.account_label
        mapping.erp_system = data.erp_system
        mapping.updated_by = user.id
    await session.flush()
    return mapping


async def list_gl_mappings(
    session: AsyncSession,
    company_id: uuid.UUID,
) -> list[GLAccountMapping]:
    result = await session.execute(
        select(GLAccountMapping).where(GLAccountMapping.company_id == company_id)
    )
    return list(result.scalars().all())
