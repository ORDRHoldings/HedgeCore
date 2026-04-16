# backend/app/services/payment_service.py
"""
Payment Initiation service — Phase 2 §4.4

State machine: PENDING_APPROVAL → APPROVED → TRANSMITTED
               PENDING_APPROVAL → REJECTED
               DRAFT → CANCELLED  (defensive; items start as PENDING_APPROVAL)

SoD enforcement: approved_by / rejected_by must differ from created_by.
"""
from __future__ import annotations

import hashlib
import uuid
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.cash import CashAuditEventType
from app.models.payment import PaymentBeneficiary, PaymentInstruction
from app.services.cash_audit_service import append_event

VALID_PAYMENT_TYPES = {"SEPA", "SWIFT", "ACH", "CHAPS", "FPS"}


def compute_instruction_hash(
    company_id: uuid.UUID,
    beneficiary_id: uuid.UUID,
    payment_type: str,
    amount: Decimal,
    currency: str,
    execution_date: date,
    reference: str,
    created_by: uuid.UUID,
    created_at: datetime,
) -> str:
    """SHA-256 over pipe-separated immutable fields. Deterministic."""
    raw = "|".join([
        str(company_id),
        str(beneficiary_id),
        payment_type,
        str(amount),
        currency,
        str(execution_date),
        reference,
        str(created_by),
        created_at.isoformat(),
    ])
    return hashlib.sha256(raw.encode()).hexdigest()


# ── Beneficiary CRUD ────────────────────────────────────────────────────────

async def list_beneficiaries(
    session: AsyncSession,
    *,
    company_id: uuid.UUID,
    active_only: bool = True,
) -> list[PaymentBeneficiary]:
    stmt = select(PaymentBeneficiary).where(
        PaymentBeneficiary.company_id == company_id,
    )
    if active_only:
        stmt = stmt.where(PaymentBeneficiary.is_active == True)  # noqa: E712
    stmt = stmt.order_by(PaymentBeneficiary.created_at.desc())
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def create_beneficiary(
    session: AsyncSession,
    *,
    company_id: uuid.UUID,
    payload: dict[str, Any],
    created_by: uuid.UUID,
) -> PaymentBeneficiary:
    bene = PaymentBeneficiary(
        company_id=company_id,
        name=payload["name"],
        bank_name=payload["bank_name"],
        bank_code=payload["bank_code"],
        account_number=payload["account_number"],
        country_code=payload["country_code"],
        currency=payload["currency"],
        payment_types=payload["payment_types"],
        is_active=True,
        created_by=created_by,
    )
    session.add(bene)
    await session.flush()

    await append_event(
        session, company_id=company_id,
        event_type=CashAuditEventType.BENEFICIARY_CREATED,
        payload={"beneficiary_id": str(bene.id), "name": bene.name, "bank_code": bene.bank_code},
        performed_by=created_by,
    )
    return bene


async def update_beneficiary(
    session: AsyncSession,
    *,
    beneficiary_id: uuid.UUID,
    company_id: uuid.UUID,
    payload: dict[str, Any],
) -> PaymentBeneficiary:
    result = await session.execute(
        select(PaymentBeneficiary).where(
            PaymentBeneficiary.id == beneficiary_id,
            PaymentBeneficiary.company_id == company_id,
        )
    )
    bene = result.scalar_one_or_none()
    if bene is None:
        raise HTTPException(status_code=404, detail="Beneficiary not found")
    if "name" in payload and payload["name"] is not None:
        bene.name = payload["name"]
    if "bank_name" in payload and payload["bank_name"] is not None:
        bene.bank_name = payload["bank_name"]
    if "is_active" in payload and payload["is_active"] is not None:
        bene.is_active = payload["is_active"]
    if "payment_types" in payload and payload["payment_types"] is not None:
        bene.payment_types = payload["payment_types"]
    await session.flush()
    return bene


async def deactivate_beneficiary(
    session: AsyncSession,
    *,
    beneficiary_id: uuid.UUID,
    company_id: uuid.UUID,
) -> None:
    result = await session.execute(
        select(PaymentBeneficiary).where(
            PaymentBeneficiary.id == beneficiary_id,
            PaymentBeneficiary.company_id == company_id,
        )
    )
    bene = result.scalar_one_or_none()
    if bene is None:
        raise HTTPException(status_code=404, detail="Beneficiary not found")
    bene.is_active = False
    await session.flush()


# ── Payment Lifecycle ───────────────────────────────────────────────────────

async def initiate_payment(
    session: AsyncSession,
    *,
    company_id: uuid.UUID,
    payload: dict[str, Any],
    created_by: uuid.UUID,
) -> PaymentInstruction:
    # Validate beneficiary exists, is active, supports payment_type
    result = await session.execute(
        select(PaymentBeneficiary).where(
            PaymentBeneficiary.id == payload["beneficiary_id"],
            PaymentBeneficiary.company_id == company_id,
        )
    )
    bene = result.scalar_one_or_none()
    if bene is None:
        raise HTTPException(status_code=404, detail="Beneficiary not found")
    if not bene.is_active:
        raise HTTPException(status_code=422, detail="Beneficiary is inactive")
    if payload["payment_type"] not in bene.payment_types:
        raise HTTPException(
            status_code=422,
            detail=f"Beneficiary does not support payment type {payload['payment_type']}",
        )

    now = datetime.now(UTC)
    instruction_hash = compute_instruction_hash(
        company_id=company_id,
        beneficiary_id=payload["beneficiary_id"],
        payment_type=payload["payment_type"],
        amount=Decimal(str(payload["amount"])),
        currency=payload["currency"],
        execution_date=payload["execution_date"],
        reference=payload["reference"],
        created_by=created_by,
        created_at=now,
    )

    instr = PaymentInstruction(
        company_id=company_id,
        beneficiary_id=payload["beneficiary_id"],
        payment_type=payload["payment_type"],
        amount=payload["amount"],
        currency=payload["currency"],
        execution_date=payload["execution_date"],
        reference=payload["reference"],
        memo=payload.get("memo"),
        status="PENDING_APPROVAL",
        created_by=created_by,
        transmission_mode="paper",
        instruction_hash=instruction_hash,
        created_at=now,
        updated_at=now,
    )
    session.add(instr)
    await session.flush()

    await append_event(
        session, company_id=company_id,
        event_type=CashAuditEventType.PAYMENT_INITIATED,
        payload={
            "payment_id": str(instr.id),
            "amount": str(instr.amount),
            "currency": instr.currency,
            "beneficiary_id": str(instr.beneficiary_id),
            "hash": instruction_hash,
        },
        performed_by=created_by,
    )
    return instr


async def list_payments(
    session: AsyncSession,
    *,
    company_id: uuid.UUID,
    status_filter: str | None = None,
    payment_type_filter: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[PaymentInstruction], int]:
    stmt = select(PaymentInstruction).where(
        PaymentInstruction.company_id == company_id,
    )
    if status_filter:
        stmt = stmt.where(PaymentInstruction.status == status_filter)
    if payment_type_filter:
        stmt = stmt.where(PaymentInstruction.payment_type == payment_type_filter)
    if date_from:
        stmt = stmt.where(PaymentInstruction.execution_date >= date_from)
    if date_to:
        stmt = stmt.where(PaymentInstruction.execution_date <= date_to)

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total_result = await session.execute(count_stmt)
    total = total_result.scalar_one()

    stmt = stmt.order_by(PaymentInstruction.created_at.desc()).limit(limit).offset(offset)
    result = await session.execute(stmt)
    return list(result.scalars().all()), total


async def get_payment(
    session: AsyncSession,
    *,
    payment_id: uuid.UUID,
    company_id: uuid.UUID,
) -> PaymentInstruction:
    result = await session.execute(
        select(PaymentInstruction).where(
            PaymentInstruction.id == payment_id,
            PaymentInstruction.company_id == company_id,
        )
    )
    instr = result.scalar_one_or_none()
    if instr is None:
        raise HTTPException(status_code=404, detail="Payment not found")
    return instr


async def approve_payment(
    session: AsyncSession,
    *,
    payment_id: uuid.UUID,
    company_id: uuid.UUID,
    approved_by: uuid.UUID,
) -> PaymentInstruction:
    instr = await get_payment(session, payment_id=payment_id, company_id=company_id)
    if instr.status != "PENDING_APPROVAL":
        raise HTTPException(status_code=409, detail=f"Cannot approve payment in {instr.status} state")
    if instr.created_by == approved_by:
        raise HTTPException(status_code=403, detail="Cannot approve your own payment (Separation of Duties)")

    instr.status = "APPROVED"
    instr.approved_by = approved_by
    instr.approved_at = datetime.now(UTC)
    await session.flush()

    await append_event(
        session, company_id=company_id,
        event_type=CashAuditEventType.PAYMENT_APPROVED,
        payload={"payment_id": str(instr.id), "approved_by": str(approved_by)},
        performed_by=approved_by,
    )
    return instr


async def reject_payment(
    session: AsyncSession,
    *,
    payment_id: uuid.UUID,
    company_id: uuid.UUID,
    rejected_by: uuid.UUID,
    reason: str,
) -> PaymentInstruction:
    instr = await get_payment(session, payment_id=payment_id, company_id=company_id)
    if instr.status != "PENDING_APPROVAL":
        raise HTTPException(status_code=409, detail=f"Cannot reject payment in {instr.status} state")
    if instr.created_by == rejected_by:
        raise HTTPException(status_code=403, detail="Cannot reject your own payment (Separation of Duties)")

    instr.status = "REJECTED"
    instr.rejected_by = rejected_by
    instr.rejection_reason = reason
    await session.flush()

    await append_event(
        session, company_id=company_id,
        event_type=CashAuditEventType.PAYMENT_REJECTED,
        payload={"payment_id": str(instr.id), "rejected_by": str(rejected_by), "reason": reason},
        performed_by=rejected_by,
    )
    return instr


async def transmit_payment(
    session: AsyncSession,
    *,
    payment_id: uuid.UUID,
    company_id: uuid.UUID,
    transmitted_by: uuid.UUID,
) -> PaymentInstruction:
    instr = await get_payment(session, payment_id=payment_id, company_id=company_id)
    if instr.status != "APPROVED":
        raise HTTPException(status_code=409, detail=f"Cannot transmit payment in {instr.status} state")

    instr.status = "TRANSMITTED"
    instr.transmission_mode = "paper"
    instr.transmitted_at = datetime.now(UTC)
    await session.flush()

    await append_event(
        session, company_id=company_id,
        event_type=CashAuditEventType.PAYMENT_TRANSMITTED,
        payload={"payment_id": str(instr.id), "mode": "paper"},
        performed_by=transmitted_by,
    )
    return instr


async def cancel_payment(
    session: AsyncSession,
    *,
    payment_id: uuid.UUID,
    company_id: uuid.UUID,
    cancelled_by: uuid.UUID,
) -> PaymentInstruction:
    instr = await get_payment(session, payment_id=payment_id, company_id=company_id)
    if instr.status != "DRAFT":
        raise HTTPException(status_code=409, detail=f"Cannot cancel payment in {instr.status} state")
    if instr.created_by != cancelled_by:
        raise HTTPException(status_code=403, detail="Only the creator can cancel this payment")

    instr.status = "CANCELLED"
    await session.flush()

    await append_event(
        session, company_id=company_id,
        event_type=CashAuditEventType.PAYMENT_CANCELLED,
        payload={"payment_id": str(instr.id)},
        performed_by=cancelled_by,
    )
    return instr
