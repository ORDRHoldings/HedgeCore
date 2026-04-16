# backend/app/api/routes/v1_payments.py
"""v1 Payment Initiation — beneficiaries + payment lifecycle."""
from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, get_session
from app.models.payment import PaymentBeneficiary
from app.models.user import User
from app.schemas_v1.cash import (
    BeneficiaryCreate, BeneficiaryUpdate, BeneficiaryResponse,
    PaymentInitiate, PaymentReject,
    PaymentInstructionResponse, PaymentListResponse,
)
from app.services.payment_service import (
    list_beneficiaries, create_beneficiary, update_beneficiary, deactivate_beneficiary,
    initiate_payment, list_payments, get_payment,
    approve_payment, reject_payment, transmit_payment, cancel_payment,
)

router = APIRouter(prefix="/v1/payments", tags=["payments"])

VALID_PAYMENT_TYPES = {"SEPA", "SWIFT", "ACH", "CHAPS", "FPS"}


def _require_enterprise(user: User) -> None:
    if getattr(user, "plan_tier", "starter") not in ("enterprise",):
        raise HTTPException(status_code=403, detail="Enterprise plan required")


def _require_write(user: User) -> None:
    _require_enterprise(user)
    if getattr(user, "role", "") not in ("cfo", "head_of_risk", "admin"):
        raise HTTPException(status_code=403, detail="Insufficient role")


# ── Module-level helpers for testability ──────────────────────────────────

async def list_beneficiaries_helper(db, *, company_id, active_only):
    return await list_beneficiaries(db, company_id=company_id, active_only=active_only)


async def create_beneficiary_helper(db, *, company_id, payload, created_by):
    return await create_beneficiary(db, company_id=company_id, payload=payload, created_by=created_by)


async def update_beneficiary_helper(db, *, beneficiary_id, company_id, payload):
    return await update_beneficiary(db, beneficiary_id=beneficiary_id, company_id=company_id, payload=payload)


async def initiate_payment_helper(db, *, company_id, payload, created_by):
    return await initiate_payment(db, company_id=company_id, payload=payload, created_by=created_by)


async def list_payments_helper(db, *, company_id, status_filter, payment_type_filter, date_from, date_to, limit, offset):
    return await list_payments(
        db, company_id=company_id,
        status_filter=status_filter, payment_type_filter=payment_type_filter,
        date_from=date_from, date_to=date_to, limit=limit, offset=offset,
    )


# ── Beneficiary Routes ────────────────────────────────────────────────────

@router.get("/beneficiaries", response_model=list[BeneficiaryResponse])
async def get_beneficiaries(
    active_only: bool = Query(default=True),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_enterprise(current_user)
    return await list_beneficiaries_helper(db, company_id=current_user.company_id, active_only=active_only)


@router.post("/beneficiaries", response_model=BeneficiaryResponse, status_code=201)
async def post_beneficiary(
    body: BeneficiaryCreate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_write(current_user)
    invalid = [pt for pt in body.payment_types if pt not in VALID_PAYMENT_TYPES]
    if invalid:
        raise HTTPException(status_code=422, detail=f"Invalid payment types: {invalid}")
    result = await create_beneficiary_helper(
        db, company_id=current_user.company_id,
        payload=body.model_dump(), created_by=current_user.id,
    )
    await db.commit()
    return result


@router.patch("/beneficiaries/{beneficiary_id}", response_model=BeneficiaryResponse)
async def patch_beneficiary(
    beneficiary_id: uuid.UUID,
    body: BeneficiaryUpdate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_write(current_user)
    result = await update_beneficiary_helper(
        db, beneficiary_id=beneficiary_id,
        company_id=current_user.company_id,
        payload=body.model_dump(exclude_unset=True),
    )
    await db.commit()
    return result


@router.delete("/beneficiaries/{beneficiary_id}", status_code=204)
async def delete_beneficiary(
    beneficiary_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_write(current_user)
    await deactivate_beneficiary(db, beneficiary_id=beneficiary_id, company_id=current_user.company_id)
    await db.commit()


# ── Payment Routes ─────────────────────────────────────────────────────────

@router.post("/initiate", response_model=PaymentInstructionResponse, status_code=201)
async def post_initiate_payment(
    body: PaymentInitiate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_write(current_user)
    if body.payment_type not in VALID_PAYMENT_TYPES:
        raise HTTPException(status_code=422, detail=f"Invalid payment type: {body.payment_type}")
    instr = await initiate_payment_helper(
        db, company_id=current_user.company_id,
        payload=body.model_dump(), created_by=current_user.id,
    )
    await db.commit()
    bene_result = await db.execute(
        select(PaymentBeneficiary).where(PaymentBeneficiary.id == instr.beneficiary_id)
    )
    bene = bene_result.scalar_one_or_none()
    return _to_response(instr, bene.name if bene else "")


@router.get("/", response_model=PaymentListResponse)
async def get_payments(
    status: str | None = Query(default=None),
    payment_type: str | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_enterprise(current_user)
    items, total = await list_payments_helper(
        db, company_id=current_user.company_id,
        status_filter=status, payment_type_filter=payment_type,
        date_from=date_from, date_to=date_to, limit=limit, offset=offset,
    )
    bene_ids = list({i.beneficiary_id for i in items})
    bene_map: dict[uuid.UUID, str] = {}
    if bene_ids:
        res = await db.execute(select(PaymentBeneficiary).where(PaymentBeneficiary.id.in_(bene_ids)))
        for b in res.scalars().all():
            bene_map[b.id] = b.name
    return PaymentListResponse(
        items=[_to_response(i, bene_map.get(i.beneficiary_id, "")) for i in items],
        total=total,
    )


@router.get("/{payment_id}", response_model=PaymentInstructionResponse)
async def get_payment_detail(
    payment_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_enterprise(current_user)
    instr = await get_payment(db, payment_id=payment_id, company_id=current_user.company_id)
    bene_result = await db.execute(
        select(PaymentBeneficiary).where(PaymentBeneficiary.id == instr.beneficiary_id)
    )
    bene = bene_result.scalar_one_or_none()
    return _to_response(instr, bene.name if bene else "")


@router.post("/{payment_id}/approve", response_model=PaymentInstructionResponse)
async def post_approve_payment(
    payment_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_write(current_user)
    instr = await approve_payment(
        db, payment_id=payment_id,
        company_id=current_user.company_id, approved_by=current_user.id,
    )
    await db.commit()
    return _to_response(instr, "")


@router.post("/{payment_id}/reject", response_model=PaymentInstructionResponse)
async def post_reject_payment(
    payment_id: uuid.UUID,
    body: PaymentReject,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_write(current_user)
    instr = await reject_payment(
        db, payment_id=payment_id,
        company_id=current_user.company_id,
        rejected_by=current_user.id, reason=body.reason,
    )
    await db.commit()
    return _to_response(instr, "")


@router.post("/{payment_id}/transmit", response_model=PaymentInstructionResponse)
async def post_transmit_payment(
    payment_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_write(current_user)
    instr = await transmit_payment(
        db, payment_id=payment_id,
        company_id=current_user.company_id, transmitted_by=current_user.id,
    )
    await db.commit()
    return _to_response(instr, "")


@router.post("/{payment_id}/cancel", response_model=PaymentInstructionResponse)
async def post_cancel_payment(
    payment_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_enterprise(current_user)
    instr = await cancel_payment(
        db, payment_id=payment_id,
        company_id=current_user.company_id, cancelled_by=current_user.id,
    )
    await db.commit()
    return _to_response(instr, "")


# ── Response helper ───────────────────────────────────────────────────────

def _to_response(instr, beneficiary_name: str) -> PaymentInstructionResponse:
    return PaymentInstructionResponse(
        id=instr.id,
        company_id=instr.company_id,
        beneficiary_id=instr.beneficiary_id,
        beneficiary_name=beneficiary_name,
        payment_type=instr.payment_type,
        amount=instr.amount,
        currency=instr.currency,
        execution_date=instr.execution_date,
        reference=instr.reference,
        memo=instr.memo,
        status=instr.status,
        created_by=instr.created_by,
        approved_by=instr.approved_by,
        approved_at=instr.approved_at,
        rejected_by=instr.rejected_by,
        rejection_reason=instr.rejection_reason,
        transmission_mode=instr.transmission_mode,
        transmitted_at=instr.transmitted_at,
        instruction_hash=instr.instruction_hash,
        created_at=instr.created_at,
    )
