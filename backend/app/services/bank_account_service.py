"""
app/services/bank_account_service.py

BankAccount lifecycle management with state machine, SoD enforcement,
AES-256-GCM field encryption, and role-gated decryption.
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.cash import (
    BANK_ACCOUNT_TRANSITIONS,
    BankAccount,
    BankAccountStatus,
    CashAuditEventType,
)
from app.services.cash_audit_service import append_event
from app.services.cash_encryption import decrypt_field, encrypt_field, mask_account_number


class AccountNotFoundError(Exception):
    pass


class SoDViolationError(HTTPException):
    def __init__(self):
        super().__init__(status_code=403, detail="Cannot verify your own account (Separation of Duties)")


class InvalidStateTransitionError(HTTPException):
    def __init__(self, from_status: str, to_status: str):
        super().__init__(
            status_code=422,
            detail=f"Invalid state transition: {from_status} -> {to_status}",
        )


async def _get_account(
    session: AsyncSession, account_id: uuid.UUID, company_id: uuid.UUID
) -> BankAccount:
    """Fetch BankAccount scoped to tenant via JOIN on LegalEntity."""
    from app.models.cash import LegalEntity

    result = await session.execute(
        select(BankAccount)
        .join(LegalEntity, BankAccount.entity_id == LegalEntity.id)
        .where(BankAccount.id == account_id, LegalEntity.company_id == company_id)
    )
    account = result.scalar_one_or_none()
    if account is None:
        raise AccountNotFoundError(f"BankAccount {account_id} not found")
    return account


def _assert_transition(account: BankAccount, to_status: BankAccountStatus) -> None:
    from_status = BankAccountStatus(account.status)
    allowed = BANK_ACCOUNT_TRANSITIONS[from_status]
    if to_status not in allowed:
        raise InvalidStateTransitionError(account.status, to_status.value)


async def create_account(
    session: AsyncSession,
    *,
    entity_id: uuid.UUID,
    company_id: uuid.UUID,
    payload: dict[str, Any],
    created_by: uuid.UUID,
) -> BankAccount:
    """Create a new BankAccount, encrypting sensitive fields before persisting."""
    # Pop plaintext sensitive values before constructing the ORM object
    account_number_plain = payload.pop("account_number", None)
    iban_plain = payload.pop("iban", None)
    # Also remove entity_id from payload to avoid duplicate kwarg
    payload.pop("entity_id", None)

    # Only pass payload keys that are valid BankAccount column attributes
    safe_payload = {k: v for k, v in payload.items() if hasattr(BankAccount, k)}

    account = BankAccount(
        entity_id=entity_id,
        created_by=created_by,
        account_number_enc=encrypt_field(account_number_plain, str(company_id))
        if account_number_plain else None,
        iban_enc=encrypt_field(iban_plain, str(company_id)) if iban_plain else None,
        **safe_payload,
    )
    session.add(account)
    await session.flush()
    await append_event(
        session,
        company_id=company_id,
        event_type=CashAuditEventType.ACCOUNT_CREATED,
        payload={
            "nickname": account.nickname,
            "currency": account.currency,
            "bank_name": account.bank_name,
        },
        performed_by=created_by,
        account_id=account.id,
    )
    return account


async def verify_account(
    session: AsyncSession,
    *,
    account_id: uuid.UUID,
    company_id: uuid.UUID,
    verifier_id: uuid.UUID,
) -> BankAccount:
    """Verify a PENDING_VERIFICATION account. Raises SoDViolationError if same user."""
    account = await _get_account(session, account_id, company_id)
    if account.created_by == verifier_id:
        raise SoDViolationError()
    _assert_transition(account, BankAccountStatus.ACTIVE)
    account.status = BankAccountStatus.ACTIVE.value
    account.verified_by = verifier_id
    account.verified_at = datetime.now(UTC)
    account.approved_by = verifier_id
    account.approved_at = datetime.now(UTC)
    account.version += 1
    await append_event(
        session,
        company_id=company_id,
        event_type=CashAuditEventType.ACCOUNT_VERIFIED,
        payload={"verified_by": str(verifier_id)},
        performed_by=verifier_id,
        account_id=account_id,
    )
    return account


async def freeze_account(
    session: AsyncSession,
    *,
    account_id: uuid.UUID,
    company_id: uuid.UUID,
    actor_id: uuid.UUID,
) -> BankAccount:
    """Freeze an ACTIVE account."""
    account = await _get_account(session, account_id, company_id)
    _assert_transition(account, BankAccountStatus.FROZEN)
    account.status = BankAccountStatus.FROZEN.value
    account.version += 1
    await append_event(
        session,
        company_id=company_id,
        event_type=CashAuditEventType.ACCOUNT_FROZEN,
        payload={},
        performed_by=actor_id,
        account_id=account_id,
    )
    return account


async def unfreeze_account(
    session: AsyncSession,
    *,
    account_id: uuid.UUID,
    company_id: uuid.UUID,
    actor_id: uuid.UUID,
) -> BankAccount:
    """Unfreeze a FROZEN account back to ACTIVE.

    Explicitly guards FROZEN pre-condition: PENDING_VERIFICATION → ACTIVE is also
    a valid state-machine transition (via verify_account), but unfreeze must only
    operate on FROZEN accounts to prevent bypassing the SoD verification check.
    """
    account = await _get_account(session, account_id, company_id)
    if account.status != BankAccountStatus.FROZEN.value:
        raise InvalidStateTransitionError(account.status, BankAccountStatus.ACTIVE.value)
    _assert_transition(account, BankAccountStatus.ACTIVE)
    account.status = BankAccountStatus.ACTIVE.value
    account.version += 1
    await append_event(
        session,
        company_id=company_id,
        event_type=CashAuditEventType.ACCOUNT_UNFROZEN,
        payload={},
        performed_by=actor_id,
        account_id=account_id,
    )
    return account


async def close_account(
    session: AsyncSession,
    *,
    account_id: uuid.UUID,
    company_id: uuid.UUID,
    actor_id: uuid.UUID,
) -> BankAccount:
    """Permanently close an account (terminal state)."""
    account = await _get_account(session, account_id, company_id)
    _assert_transition(account, BankAccountStatus.CLOSED)
    account.status = BankAccountStatus.CLOSED.value
    account.closed_at = datetime.now(UTC)
    account.version += 1
    await append_event(
        session,
        company_id=company_id,
        event_type=CashAuditEventType.ACCOUNT_CLOSED,
        payload={},
        performed_by=actor_id,
        account_id=account_id,
    )
    return account


def decrypt_account_details(
    account: BankAccount, company_id: uuid.UUID, is_cfo: bool
) -> dict:
    """Return account_number and iban — decrypted (CFO) or masked (others).

    CFO: full plaintext.
    Others: last-4 masked (****XXXX). Decryption is required to build the mask,
    but the full plaintext is never returned to non-CFO callers.
    """
    cid = str(company_id)
    if is_cfo:
        return {
            "account_number": decrypt_field(account.account_number_enc, cid),
            "iban": decrypt_field(account.iban_enc, cid),
        }
    return {
        "account_number": mask_account_number(decrypt_field(account.account_number_enc, cid))
        if account.account_number_enc else None,
        "iban": mask_account_number(decrypt_field(account.iban_enc, cid))
        if account.iban_enc else None,
    }
