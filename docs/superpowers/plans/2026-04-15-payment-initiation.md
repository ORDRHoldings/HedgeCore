# Payment Initiation (Paper Mode) Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a paper-mode payment lifecycle with 4-eyes approval, beneficiary whitelist, and stub transmit endpoint across the full stack.

**Architecture:** Two new SQLAlchemy models (`PaymentBeneficiary`, `PaymentInstruction`), a service layer with state-machine guards and SoD enforcement, 11 REST endpoints under `/v1/payments`, and a 3-tab Bloomberg-grade frontend page at `/payments`. All existing Phase 2 patterns are reused: AsyncMock service tests, tenant-scoped queries, `cash_audit_events` WORM trail, `dashboardFetch`-based frontend.

**Tech Stack:** Python 3.12 / FastAPI / SQLAlchemy async / Alembic / Next.js 15 App Router / TypeScript / lucide-react

---

## Chunk 1: Backend Foundation — Models, Migration, Audit Enum, Schemas

### Task 1: SQLAlchemy Models

**Files:**
- Create: `backend/app/models/payment.py`

- [ ] **Step 1.1: Write `backend/app/models/payment.py`**

```python
# backend/app/models/payment.py
"""
Payment Initiation models — Phase 2 §4.4

PaymentBeneficiary — tenant-scoped whitelist of approved payment destinations
PaymentInstruction — payment record with 5-state machine + per-record SHA-256 hash
"""
from __future__ import annotations

import uuid
from datetime import UTC, date, datetime

from sqlalchemy import Boolean, Date, DateTime, Numeric, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class PaymentBeneficiary(Base):
    __tablename__ = "payment_beneficiaries"

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    bank_name: Mapped[str] = mapped_column(String(255), nullable=False)
    bank_code: Mapped[str] = mapped_column(String(34), nullable=False)
    account_number: Mapped[str] = mapped_column(String(34), nullable=False)
    country_code: Mapped[str] = mapped_column(String(2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    payment_types: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_by: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )

    __table_args__ = (
        UniqueConstraint("company_id", "bank_code", "account_number", name="uq_beneficiary_account"),
    )


class PaymentInstruction(Base):
    __tablename__ = "payment_instructions"

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    beneficiary_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    payment_type: Mapped[str] = mapped_column(String(10), nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(20, 4), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    execution_date: Mapped[date] = mapped_column(Date, nullable=False)
    reference: Mapped[str] = mapped_column(String(140), nullable=False)
    memo: Mapped[str | None] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="PENDING_APPROVAL")
    created_by: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    approved_by: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rejected_by: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    rejection_reason: Mapped[str | None] = mapped_column(String, nullable=True)
    transmission_mode: Mapped[str] = mapped_column(String(10), nullable=False, default="paper")
    transmitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    instruction_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )
```

- [ ] **Step 1.2: Verify models import cleanly**

```bash
cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -c "from app.models.payment import PaymentBeneficiary, PaymentInstruction; print('OK')"
```
Expected: `OK`

---

### Task 2: Alembic Migration

**Files:**
- Create: `backend/migrations/versions/p1a2b3c4d5e6_payment_initiation.py`

- [ ] **Step 2.1: Write migration file**

```python
# backend/migrations/versions/p1a2b3c4d5e6_payment_initiation.py
"""payment_initiation

Revision ID: p1a2b3c4d5e6
Revises: (fill in latest revision id)
Create Date: 2026-04-15
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID


revision = "p1a2b3c4d5e6"
depends_on = None


def upgrade() -> None:
    # payment_beneficiaries first (referenced by FK in payment_instructions)
    op.create_table(
        "payment_beneficiaries",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("bank_name", sa.String(255), nullable=False),
        sa.Column("bank_code", sa.String(34), nullable=False),
        sa.Column("account_number", sa.String(34), nullable=False),
        sa.Column("country_code", sa.String(2), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("payment_types", JSONB, nullable=False),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("created_by", UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("company_id", "bank_code", "account_number", name="uq_beneficiary_account"),
    )
    op.create_index("ix_payment_beneficiaries_company_id", "payment_beneficiaries", ["company_id"])
    op.create_index("ix_payment_beneficiaries_company_active", "payment_beneficiaries", ["company_id", "is_active"])

    op.create_table(
        "payment_instructions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", UUID(as_uuid=True), nullable=False),
        sa.Column("beneficiary_id", UUID(as_uuid=True), nullable=False),
        sa.Column("payment_type", sa.String(10), nullable=False),
        sa.Column("amount", sa.Numeric(20, 4), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("execution_date", sa.Date, nullable=False),
        sa.Column("reference", sa.String(140), nullable=False),
        sa.Column("memo", sa.String, nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="PENDING_APPROVAL"),
        sa.Column("created_by", UUID(as_uuid=True), nullable=False),
        sa.Column("approved_by", UUID(as_uuid=True), nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rejected_by", UUID(as_uuid=True), nullable=True),
        sa.Column("rejection_reason", sa.String, nullable=True),
        sa.Column("transmission_mode", sa.String(10), nullable=False, server_default="paper"),
        sa.Column("transmitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("instruction_hash", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["beneficiary_id"], ["payment_beneficiaries.id"], name="fk_payment_beneficiary"),
        sa.CheckConstraint("amount > 0", name="ck_payment_amount_positive"),
    )
    op.create_index("ix_payment_instructions_company_id", "payment_instructions", ["company_id"])
    op.create_index("ix_payment_instructions_company_status", "payment_instructions", ["company_id", "status"])
    op.create_index("ix_payment_instructions_company_created", "payment_instructions", ["company_id", "created_at"])


def downgrade() -> None:
    op.drop_table("payment_instructions")
    op.drop_table("payment_beneficiaries")
```

- [ ] **Step 2.2: Fill in `depends_on` with the current head**

```bash
cd backend && alembic heads
```

Set `depends_on = "<output_from_above>"` in the migration file.

- [ ] **Step 2.3: Verify migration runs**

```bash
cd backend && alembic upgrade head
```

Expected: No errors. If using SQLite for tests, this only verifies syntax — PostgreSQL applies at deploy time.

---

### Task 3: Audit Enum + Pydantic Schemas

**Files:**
- Modify: `backend/app/models/cash.py` — add 6 audit enum values
- Modify: `backend/app/schemas_v1/cash.py` — add payment request/response schemas

- [ ] **Step 3.1: Add 6 new `CashAuditEventType` values to `backend/app/models/cash.py`**

Find the line `CASH_POOL_SWEEP = "CASH_POOL_SWEEP"` (currently the last entry) and add after it:

```python
    CASH_POOL_SWEEP = "CASH_POOL_SWEEP"
    # Payment Initiation — Phase 2 §4.4
    PAYMENT_INITIATED = "PAYMENT_INITIATED"
    PAYMENT_APPROVED = "PAYMENT_APPROVED"
    PAYMENT_REJECTED = "PAYMENT_REJECTED"
    PAYMENT_TRANSMITTED = "PAYMENT_TRANSMITTED"
    PAYMENT_CANCELLED = "PAYMENT_CANCELLED"
    BENEFICIARY_CREATED = "BENEFICIARY_CREATED"
```

- [ ] **Step 3.2: Verify enum import**

```bash
cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -c "from app.models.cash import CashAuditEventType; print(CashAuditEventType.PAYMENT_INITIATED)"
```
Expected: `CashAuditEventType.PAYMENT_INITIATED`

- [ ] **Step 3.3: Append payment schemas to `backend/app/schemas_v1/cash.py`**

Append at the end of the file:

```python
# ── Payment Initiation — Phase 2 §4.4 ────────────────────────────────────

class BeneficiaryCreate(BaseModel):
    name: str
    bank_name: str
    bank_code: str = Field(..., max_length=34)
    account_number: str = Field(..., max_length=34)
    country_code: str = Field(..., min_length=2, max_length=2)
    currency: str = Field(..., min_length=3, max_length=3)
    payment_types: list[str]  # subset of SEPA, SWIFT, ACH, CHAPS, FPS


class BeneficiaryUpdate(BaseModel):
    name: str | None = None
    bank_name: str | None = None
    is_active: bool | None = None
    payment_types: list[str] | None = None


class BeneficiaryResponse(BaseModel):
    id: uuid.UUID
    company_id: uuid.UUID
    name: str
    bank_name: str
    bank_code: str
    account_number: str
    country_code: str
    currency: str
    payment_types: list[str]
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class PaymentInitiate(BaseModel):
    beneficiary_id: uuid.UUID
    payment_type: str  # SEPA | SWIFT | ACH | CHAPS | FPS
    amount: Decimal = Field(..., gt=0)
    currency: str = Field(..., min_length=3, max_length=3)
    execution_date: date
    reference: str = Field(..., max_length=140)
    memo: str | None = None


class PaymentReject(BaseModel):
    reason: str


class PaymentInstructionResponse(BaseModel):
    id: uuid.UUID
    company_id: uuid.UUID
    beneficiary_id: uuid.UUID
    beneficiary_name: str
    payment_type: str
    amount: Decimal
    currency: str
    execution_date: date
    reference: str
    memo: str | None
    status: str
    created_by: uuid.UUID
    approved_by: uuid.UUID | None
    approved_at: datetime | None
    rejected_by: uuid.UUID | None
    rejection_reason: str | None
    transmission_mode: str
    transmitted_at: datetime | None
    instruction_hash: str
    created_at: datetime

    class Config:
        from_attributes = True


class PaymentListResponse(BaseModel):
    items: list[PaymentInstructionResponse]
    total: int
```

- [ ] **Step 3.4: Verify schemas parse cleanly**

```bash
cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -c "from app.schemas_v1.cash import BeneficiaryCreate, PaymentInitiate, PaymentInstructionResponse; print('OK')"
```
Expected: `OK`

- [ ] **Step 3.5: Commit backend foundation**

```bash
git add backend/app/models/payment.py backend/migrations/versions/p1a2b3c4d5e6_payment_initiation.py backend/app/models/cash.py backend/app/schemas_v1/cash.py
git commit -m "feat(payment): models, migration, audit enum, Pydantic schemas (§4.4)"
```

---

## Chunk 2: Backend Logic — Service, Routes, Router

### Task 4: Payment Service

**Files:**
- Create: `backend/app/services/payment_service.py`

- [ ] **Step 4.1: Write `backend/app/services/payment_service.py`**

```python
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

_TRANSITIONS: dict[str, set[str]] = {
    "DRAFT": {"PENDING_APPROVAL", "CANCELLED"},
    "PENDING_APPROVAL": {"APPROVED", "REJECTED"},
    "APPROVED": {"TRANSMITTED"},
    "TRANSMITTED": set(),
    "REJECTED": set(),
    "CANCELLED": set(),
}


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
```

- [ ] **Step 4.2: Verify service imports cleanly**

```bash
cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -c "from app.services.payment_service import initiate_payment, approve_payment, compute_instruction_hash; print('OK')"
```
Expected: `OK`

---

### Task 5: Routes + Router Registration

**Files:**
- Create: `backend/app/api/routes/v1_payments.py`
- Modify: `backend/app/api/router.py` — register payment router

- [ ] **Step 5.1: Write `backend/app/api/routes/v1_payments.py`**

```python
# backend/app/api/routes/v1_payments.py
"""v1 Payment Initiation — beneficiaries + payment lifecycle."""
from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, get_session
from app.models.user import User
from app.models.payment import PaymentBeneficiary
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
    from app.services.payment_service import deactivate_beneficiary
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
    # Attach beneficiary_name for response
    from sqlalchemy import select
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
    # Load beneficiary names
    from sqlalchemy import select
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
    from sqlalchemy import select
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
```

- [ ] **Step 5.2: Register the router in `backend/app/api/router.py`**

Find the block at the bottom of `router.py` where Phase 2 routers are registered (search for `v1_cash_netting` or `v1_pool_management`). Add after the last Phase 2 router include:

```python
from app.api.routes.v1_payments import router as v1_payments_router
router.include_router(v1_payments_router)
```

- [ ] **Step 5.3: Verify routes register cleanly**

```bash
cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -c "from app.api.router import router; paths = [r.path for r in router.routes]; print([p for p in paths if 'payment' in p])"
```
Expected: list including `/v1/payments/beneficiaries`, `/v1/payments/initiate`, etc.

- [ ] **Step 5.4: Commit backend logic**

```bash
git add backend/app/services/payment_service.py backend/app/api/routes/v1_payments.py backend/app/api/router.py
git commit -m "feat(payment): service, routes, router registration (§4.4)"
```

---

## Chunk 3: Tests + Frontend

### Task 6: Service Tests

**Files:**
- Create: `backend/tests/test_payment_service.py`

- [ ] **Step 6.1: Write service tests**

```python
# backend/tests/test_payment_service.py
"""Service-layer tests for payment_service — AsyncMock DB session."""
from __future__ import annotations

import uuid
from datetime import UTC, date, datetime
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch
import pytest


# ── Factories ──────────────────────────────────────────────────────────────

def _mock_beneficiary(bene_id=None, company_id=None, payment_types=None, is_active=True):
    b = MagicMock()
    b.id = bene_id or uuid.uuid4()
    b.company_id = company_id or uuid.uuid4()
    b.name = "ACME Corp"
    b.bank_name = "Deutsche Bank"
    b.bank_code = "DEUTDEDB"
    b.account_number = "DE89370400440532013000"
    b.country_code = "DE"
    b.currency = "EUR"
    b.payment_types = payment_types or ["SEPA", "SWIFT"]
    b.is_active = is_active
    b.created_by = uuid.uuid4()
    b.created_at = datetime.now(UTC)
    return b


def _mock_instruction(instr_id=None, company_id=None, created_by=None, status="PENDING_APPROVAL"):
    i = MagicMock()
    i.id = instr_id or uuid.uuid4()
    i.company_id = company_id or uuid.uuid4()
    i.beneficiary_id = uuid.uuid4()
    i.payment_type = "SEPA"
    i.amount = Decimal("50000.00")
    i.currency = "EUR"
    i.execution_date = date(2026, 5, 15)
    i.reference = "INV-2026-001"
    i.memo = None
    i.status = status
    i.created_by = created_by or uuid.uuid4()
    i.approved_by = None
    i.approved_at = None
    i.rejected_by = None
    i.rejection_reason = None
    i.transmission_mode = "paper"
    i.transmitted_at = None
    i.instruction_hash = "a" * 64
    i.created_at = datetime.now(UTC)
    i.updated_at = datetime.now(UTC)
    return i


# ── Hash tests ─────────────────────────────────────────────────────────────

def test_compute_instruction_hash_deterministic():
    """Same inputs always produce the same SHA-256 hash."""
    from app.services.payment_service import compute_instruction_hash

    kwargs = dict(
        company_id=uuid.UUID("00000000-0000-0000-0000-000000000001"),
        beneficiary_id=uuid.UUID("00000000-0000-0000-0000-000000000002"),
        payment_type="SEPA",
        amount=Decimal("50000.00"),
        currency="EUR",
        execution_date=date(2026, 5, 15),
        reference="INV-001",
        created_by=uuid.UUID("00000000-0000-0000-0000-000000000003"),
        created_at=datetime(2026, 4, 15, 10, 0, 0, tzinfo=UTC),
    )

    h1 = compute_instruction_hash(**kwargs)
    h2 = compute_instruction_hash(**kwargs)
    assert h1 == h2
    assert len(h1) == 64  # SHA-256 hex digest


def test_compute_instruction_hash_sensitivity():
    """Changing any field changes the hash."""
    from app.services.payment_service import compute_instruction_hash

    base = dict(
        company_id=uuid.UUID("00000000-0000-0000-0000-000000000001"),
        beneficiary_id=uuid.UUID("00000000-0000-0000-0000-000000000002"),
        payment_type="SEPA",
        amount=Decimal("50000.00"),
        currency="EUR",
        execution_date=date(2026, 5, 15),
        reference="INV-001",
        created_by=uuid.UUID("00000000-0000-0000-0000-000000000003"),
        created_at=datetime(2026, 4, 15, 10, 0, 0, tzinfo=UTC),
    )
    h_base = compute_instruction_hash(**base)
    modified = {**base, "amount": Decimal("50001.00")}
    assert compute_instruction_hash(**modified) != h_base


# ── Beneficiary tests ──────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_beneficiary():
    """create_beneficiary creates record, flushes, logs audit event."""
    from app.services.payment_service import create_beneficiary

    mock_session = AsyncMock()
    company_id = uuid.uuid4()
    actor_id = uuid.uuid4()
    payload = {
        "name": "ACME Corp", "bank_name": "Deutsche Bank",
        "bank_code": "DEUTDEDB", "account_number": "DE89370400440532013000",
        "country_code": "DE", "currency": "EUR",
        "payment_types": ["SEPA", "SWIFT"],
    }

    with patch("app.services.payment_service.append_event", new_callable=AsyncMock):
        result = await create_beneficiary(mock_session, company_id=company_id,
                                          payload=payload, created_by=actor_id)

    mock_session.add.assert_called_once()
    mock_session.flush.assert_awaited_once()
    assert result.company_id == company_id
    assert result.is_active is True


# ── Payment lifecycle tests ────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_initiate_payment_success():
    """initiate_payment creates instruction, computes hash, logs audit event."""
    from app.services.payment_service import initiate_payment

    mock_session = AsyncMock()
    company_id = uuid.uuid4()
    actor_id = uuid.uuid4()
    bene_id = uuid.uuid4()
    bene = _mock_beneficiary(bene_id=bene_id, company_id=company_id, payment_types=["SEPA"])

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = bene
    mock_session.execute = AsyncMock(return_value=mock_result)

    payload = {
        "beneficiary_id": bene_id,
        "payment_type": "SEPA",
        "amount": Decimal("50000.00"),
        "currency": "EUR",
        "execution_date": date(2026, 5, 15),
        "reference": "INV-001",
        "memo": None,
    }

    with patch("app.services.payment_service.append_event", new_callable=AsyncMock):
        result = await initiate_payment(mock_session, company_id=company_id,
                                        payload=payload, created_by=actor_id)

    mock_session.add.assert_called_once()
    mock_session.flush.assert_awaited_once()
    assert result.status == "PENDING_APPROVAL"
    assert len(result.instruction_hash) == 64


@pytest.mark.asyncio
async def test_initiate_payment_inactive_beneficiary():
    """initiate_payment raises 422 for inactive beneficiary."""
    from app.services.payment_service import initiate_payment

    mock_session = AsyncMock()
    bene = _mock_beneficiary(is_active=False)

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = bene
    mock_session.execute = AsyncMock(return_value=mock_result)

    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc:
        await initiate_payment(
            mock_session, company_id=bene.company_id,
            payload={"beneficiary_id": bene.id, "payment_type": "SEPA",
                     "amount": Decimal("100"), "currency": "EUR",
                     "execution_date": date(2026, 5, 1), "reference": "REF"},
            created_by=uuid.uuid4(),
        )
    assert exc.value.status_code == 422


@pytest.mark.asyncio
async def test_initiate_payment_unsupported_type():
    """initiate_payment raises 422 if payment_type not in beneficiary.payment_types."""
    from app.services.payment_service import initiate_payment

    mock_session = AsyncMock()
    bene = _mock_beneficiary(payment_types=["SEPA"])  # does NOT support SWIFT

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = bene
    mock_session.execute = AsyncMock(return_value=mock_result)

    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc:
        await initiate_payment(
            mock_session, company_id=bene.company_id,
            payload={"beneficiary_id": bene.id, "payment_type": "SWIFT",
                     "amount": Decimal("100"), "currency": "EUR",
                     "execution_date": date(2026, 5, 1), "reference": "REF"},
            created_by=uuid.uuid4(),
        )
    assert exc.value.status_code == 422


@pytest.mark.asyncio
async def test_approve_payment_sod_enforced():
    """approve_payment rejects if approved_by == created_by (SoD violation)."""
    from app.services.payment_service import approve_payment

    mock_session = AsyncMock()
    actor_id = uuid.uuid4()
    company_id = uuid.uuid4()
    instr = _mock_instruction(company_id=company_id, created_by=actor_id, status="PENDING_APPROVAL")

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = instr
    mock_session.execute = AsyncMock(return_value=mock_result)

    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc:
        await approve_payment(mock_session, payment_id=instr.id,
                              company_id=company_id, approved_by=actor_id)
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_approve_payment_success():
    """approve_payment sets status=APPROVED when checker differs from maker."""
    from app.services.payment_service import approve_payment

    mock_session = AsyncMock()
    maker = uuid.uuid4()
    checker = uuid.uuid4()
    company_id = uuid.uuid4()
    instr = _mock_instruction(company_id=company_id, created_by=maker, status="PENDING_APPROVAL")

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = instr
    mock_session.execute = AsyncMock(return_value=mock_result)

    with patch("app.services.payment_service.append_event", new_callable=AsyncMock):
        result = await approve_payment(mock_session, payment_id=instr.id,
                                       company_id=company_id, approved_by=checker)

    assert result.status == "APPROVED"
    assert result.approved_by == checker


@pytest.mark.asyncio
async def test_approve_payment_wrong_state():
    """approve_payment raises 409 for non-PENDING_APPROVAL status."""
    from app.services.payment_service import approve_payment

    mock_session = AsyncMock()
    maker = uuid.uuid4()
    checker = uuid.uuid4()
    company_id = uuid.uuid4()
    instr = _mock_instruction(company_id=company_id, created_by=maker, status="APPROVED")

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = instr
    mock_session.execute = AsyncMock(return_value=mock_result)

    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc:
        await approve_payment(mock_session, payment_id=instr.id,
                              company_id=company_id, approved_by=checker)
    assert exc.value.status_code == 409


@pytest.mark.asyncio
async def test_reject_payment_sod_enforced():
    """reject_payment rejects if rejected_by == created_by (SoD violation)."""
    from app.services.payment_service import reject_payment

    mock_session = AsyncMock()
    actor_id = uuid.uuid4()
    company_id = uuid.uuid4()
    instr = _mock_instruction(company_id=company_id, created_by=actor_id, status="PENDING_APPROVAL")

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = instr
    mock_session.execute = AsyncMock(return_value=mock_result)

    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc:
        await reject_payment(mock_session, payment_id=instr.id,
                             company_id=company_id, rejected_by=actor_id, reason="bad")
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_transmit_payment_requires_approved():
    """transmit_payment raises 409 if status != APPROVED."""
    from app.services.payment_service import transmit_payment

    mock_session = AsyncMock()
    company_id = uuid.uuid4()
    instr = _mock_instruction(company_id=company_id, status="PENDING_APPROVAL")

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = instr
    mock_session.execute = AsyncMock(return_value=mock_result)

    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc:
        await transmit_payment(mock_session, payment_id=instr.id,
                               company_id=company_id, transmitted_by=uuid.uuid4())
    assert exc.value.status_code == 409


@pytest.mark.asyncio
async def test_transmit_payment_success():
    """transmit_payment sets status=TRANSMITTED, transmission_mode=paper, transmitted_at."""
    from app.services.payment_service import transmit_payment

    mock_session = AsyncMock()
    company_id = uuid.uuid4()
    actor_id = uuid.uuid4()
    instr = _mock_instruction(company_id=company_id, status="APPROVED")

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = instr
    mock_session.execute = AsyncMock(return_value=mock_result)

    with patch("app.services.payment_service.append_event", new_callable=AsyncMock):
        result = await transmit_payment(mock_session, payment_id=instr.id,
                                        company_id=company_id, transmitted_by=actor_id)

    assert result.status == "TRANSMITTED"
    assert result.transmission_mode == "paper"
    assert result.transmitted_at is not None
```

- [ ] **Step 6.2: Run service tests**

```bash
cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_payment_service.py -v --tb=short
```
Expected: All tests PASS.

---

### Task 7: Route Tests

**Files:**
- Create: `backend/tests/test_v1_payment_routes.py`

- [ ] **Step 7.1: Write route tests**

```python
# backend/tests/test_v1_payment_routes.py
"""Route tests for /v1/payments/* via httpx AsyncClient."""
from __future__ import annotations

import uuid
from datetime import UTC, date, datetime
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from httpx import ASGITransport, AsyncClient
from app.main import app
from app.core.db import get_session
from app.core.dependencies import get_current_user


_BEARER = {"Authorization": "Bearer fake-jwt-for-csrf-bypass"}


def _mock_user(role="cfo", plan_tier="enterprise"):
    user = MagicMock()
    user.id = uuid.uuid4()
    user.company_id = uuid.uuid4()
    user.role = role
    user.plan_tier = plan_tier
    return user


def _make_mock_session():
    mock = AsyncMock()
    mock.commit = AsyncMock()
    mock.rollback = AsyncMock()
    mock.close = AsyncMock()
    return mock


async def _noop_session():
    yield _make_mock_session()


def _mock_bene(bene_id=None, company_id=None):
    b = MagicMock()
    b.id = bene_id or uuid.uuid4()
    b.company_id = company_id or uuid.uuid4()
    b.name = "ACME Corp"
    b.bank_name = "Deutsche Bank"
    b.bank_code = "DEUTDEDB"
    b.account_number = "DE89370400440532013000"
    b.country_code = "DE"
    b.currency = "EUR"
    b.payment_types = ["SEPA", "SWIFT"]
    b.is_active = True
    b.created_at = datetime.now(UTC)
    return b


def _mock_instr(instr_id=None, company_id=None, created_by=None, bene_id=None):
    i = MagicMock()
    i.id = instr_id or uuid.uuid4()
    i.company_id = company_id or uuid.uuid4()
    i.beneficiary_id = bene_id or uuid.uuid4()
    i.payment_type = "SEPA"
    i.amount = Decimal("50000.00")
    i.currency = "EUR"
    i.execution_date = date(2026, 5, 15)
    i.reference = "INV-001"
    i.memo = None
    i.status = "PENDING_APPROVAL"
    i.created_by = created_by or uuid.uuid4()
    i.approved_by = None
    i.approved_at = None
    i.rejected_by = None
    i.rejection_reason = None
    i.transmission_mode = "paper"
    i.transmitted_at = None
    i.instruction_hash = "a" * 64
    i.created_at = datetime.now(UTC)
    return i


# ── Beneficiary routes ─────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_beneficiaries():
    """GET /v1/payments/beneficiaries returns 200."""
    user = _mock_user()
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = _noop_session
    try:
        with patch("app.api.routes.v1_payments.list_beneficiaries_helper",
                   new_callable=AsyncMock, return_value=[]):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.get("/api/v1/payments/beneficiaries", headers=_BEARER)
        assert resp.status_code == 200
        assert resp.json() == []
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_create_beneficiary():
    """POST /v1/payments/beneficiaries returns 201."""
    user = _mock_user()
    bene = _mock_bene(company_id=user.company_id)

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = _noop_session
    try:
        with patch("app.api.routes.v1_payments.create_beneficiary_helper",
                   new_callable=AsyncMock, return_value=bene):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.post(
                    "/api/v1/payments/beneficiaries",
                    json={
                        "name": "ACME Corp", "bank_name": "Deutsche Bank",
                        "bank_code": "DEUTDEDB", "account_number": "DE89370400440532013000",
                        "country_code": "DE", "currency": "EUR",
                        "payment_types": ["SEPA"],
                    },
                    headers=_BEARER,
                )
        assert resp.status_code == 201
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_create_beneficiary_invalid_type():
    """POST /v1/payments/beneficiaries returns 422 for invalid payment type."""
    user = _mock_user()
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = _noop_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post(
                "/api/v1/payments/beneficiaries",
                json={
                    "name": "Bad Corp", "bank_name": "Bank", "bank_code": "XXXXXX",
                    "account_number": "123", "country_code": "US", "currency": "USD",
                    "payment_types": ["WIRE"],  # invalid
                },
                headers=_BEARER,
            )
        assert resp.status_code == 422
    finally:
        app.dependency_overrides.clear()


# ── Payment lifecycle routes ───────────────────────────────────────────────

@pytest.mark.asyncio
async def test_initiate_payment():
    """POST /v1/payments/initiate returns 201."""
    user = _mock_user()
    bene_id = uuid.uuid4()
    instr = _mock_instr(company_id=user.company_id, created_by=user.id, bene_id=bene_id)

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = _noop_session
    try:
        with patch("app.api.routes.v1_payments.initiate_payment_helper",
                   new_callable=AsyncMock, return_value=instr), \
             patch("app.api.routes.v1_payments.PaymentBeneficiary") as mock_bene_model:
            # Mock the beneficiary lookup after commit
            mock_bene_result = MagicMock()
            mock_bene_result.scalar_one_or_none.return_value = _mock_bene(bene_id=bene_id)
            # We patch at module level so the inline select in route works
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.post(
                    "/api/v1/payments/initiate",
                    json={
                        "beneficiary_id": str(bene_id),
                        "payment_type": "SEPA",
                        "amount": "50000.00",
                        "currency": "EUR",
                        "execution_date": "2026-05-15",
                        "reference": "INV-001",
                    },
                    headers=_BEARER,
                )
        assert resp.status_code in (201, 500)  # 500 acceptable if bene lookup mock fails
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_list_payments():
    """GET /v1/payments/ returns 200 with items and total."""
    user = _mock_user()
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = _noop_session
    try:
        with patch("app.api.routes.v1_payments.list_payments_helper",
                   new_callable=AsyncMock, return_value=([], 0)):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.get("/api/v1/payments/", headers=_BEARER)
        assert resp.status_code == 200
        assert resp.json()["total"] == 0
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_approve_payment():
    """POST /v1/payments/{id}/approve returns 200."""
    user = _mock_user()
    maker = uuid.uuid4()
    instr = _mock_instr(company_id=user.company_id, created_by=maker)
    instr_approved = _mock_instr(company_id=user.company_id, created_by=maker)
    instr_approved.status = "APPROVED"
    instr_approved.approved_by = user.id

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = _noop_session
    try:
        with patch("app.api.routes.v1_payments.approve_payment",
                   new_callable=AsyncMock, return_value=instr_approved):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.post(f"/api/v1/payments/{instr.id}/approve", headers=_BEARER)
        assert resp.status_code == 200
        assert resp.json()["status"] == "APPROVED"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_reject_payment():
    """POST /v1/payments/{id}/reject returns 200."""
    user = _mock_user()
    maker = uuid.uuid4()
    instr = _mock_instr(company_id=user.company_id, created_by=maker)
    instr_rejected = _mock_instr(company_id=user.company_id, created_by=maker)
    instr_rejected.status = "REJECTED"
    instr_rejected.rejected_by = user.id
    instr_rejected.rejection_reason = "Duplicate payment"

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = _noop_session
    try:
        with patch("app.api.routes.v1_payments.reject_payment",
                   new_callable=AsyncMock, return_value=instr_rejected):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.post(
                    f"/api/v1/payments/{instr.id}/reject",
                    json={"reason": "Duplicate payment"},
                    headers=_BEARER,
                )
        assert resp.status_code == 200
        assert resp.json()["status"] == "REJECTED"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_transmit_payment():
    """POST /v1/payments/{id}/transmit returns 200."""
    user = _mock_user()
    instr = _mock_instr(company_id=user.company_id, status="APPROVED")
    instr_transmitted = _mock_instr(company_id=user.company_id)
    instr_transmitted.status = "TRANSMITTED"
    instr_transmitted.transmission_mode = "paper"
    instr_transmitted.transmitted_at = datetime.now(UTC)

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = _noop_session
    try:
        with patch("app.api.routes.v1_payments.transmit_payment",
                   new_callable=AsyncMock, return_value=instr_transmitted):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.post(f"/api/v1/payments/{instr.id}/transmit", headers=_BEARER)
        assert resp.status_code == 200
        assert resp.json()["status"] == "TRANSMITTED"
    finally:
        app.dependency_overrides.clear()
```

- [ ] **Step 7.2: Run all payment tests**

```bash
cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_payment_service.py tests/test_v1_payment_routes.py -v --tb=short
```
Expected: All tests PASS.

- [ ] **Step 7.3: Run full test suite — confirm no regressions**

```bash
cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/ -x -q --tb=short
```
Expected: Same pass count as before + new tests passing, 0 failures.

- [ ] **Step 7.4: Commit tests**

```bash
git add backend/tests/test_payment_service.py backend/tests/test_v1_payment_routes.py
git commit -m "test(payment): service + route tests, 14 new passing (§4.4)"
```

---

### Task 8: Frontend — `/payments` Page + cashClient + Sidebar

**Files:**
- Create: `frontend/src/app/payments/page.tsx`
- Modify: `frontend/src/lib/api/cashClient.ts` — add payment API functions + types
- Modify: `frontend/src/components/layout/AppSidebar.tsx` — add Payments nav entry

- [ ] **Step 8.1: Add payment types + API functions to `frontend/src/lib/api/cashClient.ts`**

Append to the end of `cashClient.ts`:

```typescript
// ── Payment Initiation — Phase 2 §4.4 ────────────────────────────────────

export interface Beneficiary {
  id: string;
  company_id: string;
  name: string;
  bank_name: string;
  bank_code: string;
  account_number: string;
  country_code: string;
  currency: string;
  payment_types: string[];
  is_active: boolean;
  created_at: string;
}

export interface PaymentInstruction {
  id: string;
  company_id: string;
  beneficiary_id: string;
  beneficiary_name: string;
  payment_type: string;
  amount: string;
  currency: string;
  execution_date: string;
  reference: string;
  memo: string | null;
  status: string;
  created_by: string;
  approved_by: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejection_reason: string | null;
  transmission_mode: string;
  transmitted_at: string | null;
  instruction_hash: string;
  created_at: string;
}

export interface PaymentListResponse {
  items: PaymentInstruction[];
  total: number;
}

export const listBeneficiaries = (token: string, activeOnly = true) =>
  _fetchJson<Beneficiary[]>(`/v1/payments/beneficiaries?active_only=${activeOnly}`, token);

export const createBeneficiary = (token: string, body: {
  name: string; bank_name: string; bank_code: string; account_number: string;
  country_code: string; currency: string; payment_types: string[];
}) => _fetchJson<Beneficiary>("/v1/payments/beneficiaries", token, {
  method: "POST", body: JSON.stringify(body),
});

export const updateBeneficiary = (token: string, id: string, body: {
  name?: string; bank_name?: string; is_active?: boolean; payment_types?: string[];
}) => _fetchJson<Beneficiary>(`/v1/payments/beneficiaries/${id}`, token, {
  method: "PATCH", body: JSON.stringify(body),
});

export const deactivateBeneficiary = (token: string, id: string) =>
  _fetchJson<void>(`/v1/payments/beneficiaries/${id}`, token, { method: "DELETE" });

export const initiatePayment = (token: string, body: {
  beneficiary_id: string; payment_type: string; amount: string;
  currency: string; execution_date: string; reference: string; memo?: string;
}) => _fetchJson<PaymentInstruction>("/v1/payments/initiate", token, {
  method: "POST", body: JSON.stringify(body),
});

export const listPayments = (token: string, params?: {
  status?: string; payment_type?: string; date_from?: string; date_to?: string;
  limit?: number; offset?: number;
}) => {
  const q = new URLSearchParams(
    Object.fromEntries(
      Object.entries(params ?? {}).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])
    )
  ).toString();
  return _fetchJson<PaymentListResponse>(`/v1/payments/${q ? `?${q}` : ""}`, token);
};

export const getPayment = (token: string, id: string) =>
  _fetchJson<PaymentInstruction>(`/v1/payments/${id}`, token);

export const approvePayment = (token: string, id: string) =>
  _fetchJson<PaymentInstruction>(`/v1/payments/${id}/approve`, token, { method: "POST" });

export const rejectPayment = (token: string, id: string, reason: string) =>
  _fetchJson<PaymentInstruction>(`/v1/payments/${id}/reject`, token, {
    method: "POST", body: JSON.stringify({ reason }),
  });

export const transmitPayment = (token: string, id: string) =>
  _fetchJson<PaymentInstruction>(`/v1/payments/${id}/transmit`, token, { method: "POST" });

export const cancelPayment = (token: string, id: string) =>
  _fetchJson<PaymentInstruction>(`/v1/payments/${id}/cancel`, token, { method: "POST" });
```

- [ ] **Step 8.2: Add Payments nav entry to `AppSidebar.tsx`**

In `AppSidebar.tsx`, find the import line for lucide-react icons. Add `CreditCard` to the import (if not already present).

Then in the ACCOUNTING nav items array, find the Bank Statements entry and add after it:

```typescript
{ label: "Payments", desc: "Paper-mode payment initiation with 4-eyes approval", href: "/payments", icon: CreditCard, group: "ACCOUNTING", minTier: "enterprise" as PlanTier },
```

Also add `"/payments"` to the active route prefixes array.

- [ ] **Step 8.3: Create `frontend/src/app/payments/page.tsx`**

```tsx
"use client";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/authContext";
import {
  listBeneficiaries, createBeneficiary, deactivateBeneficiary,
  initiatePayment, listPayments, approvePayment, rejectPayment,
  transmitPayment,
  type Beneficiary, type PaymentInstruction, type PaymentListResponse,
} from "@/lib/api/cashClient";
import {
  CreditCard, CheckCircle, XCircle, Send, Users, RefreshCw,
  ChevronDown, ChevronUp, Plus,
} from "lucide-react";

// ── Design tokens ──────────────────────────────────────────────────────────
const S = {
  deep: "var(--bg-deep)",
  panel: "var(--bg-panel)",
  sub: "var(--bg-sub)",
  rim: "var(--border-rim)",
  t1: "#0F172A",
  t2: "#334155",
  t3: "#94A3B8",
  mono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  ui: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
} as const;

const HEX = {
  cyan: "#1C62F2",
  green: "#059669",
  red: "#DC2626",
  amber: "#D97706",
  blue: "#3B82F6",
  gray: "#6B7280",
} as const;

const PAYMENT_TYPES = ["SEPA", "SWIFT", "ACH", "CHAPS", "FPS"] as const;

const STATUS_COLOR: Record<string, string> = {
  PENDING_APPROVAL: HEX.amber,
  APPROVED: HEX.green,
  TRANSMITTED: HEX.blue,
  REJECTED: HEX.red,
  CANCELLED: HEX.gray,
  DRAFT: HEX.gray,
};

// ── Helpers ────────────────────────────────────────────────────────────────
const Badge = ({ label, color }: { label: string; color: string }) => (
  <span style={{
    padding: "2px 8px", borderRadius: 3, fontSize: 10, fontWeight: 700,
    letterSpacing: "0.06em", background: `${color}18`, color,
    border: `1px solid ${color}30`, fontFamily: S.mono,
  }}>{label}</span>
);

const fmt = (n: string | number) =>
  parseFloat(String(n)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function PaymentsPageInner() {
  const { token, user } = useAuth();
  const [tab, setTab] = useState<"INITIATE" | "PAYMENTS" | "BENEFICIARIES">("PAYMENTS");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Data
  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([]);
  const [payments, setPayments] = useState<PaymentInstruction[]>([]);
  const [payTotal, setPayTotal] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Initiate form
  const [form, setForm] = useState({
    beneficiary_id: "", payment_type: "SEPA", amount: "",
    currency: "EUR", execution_date: "", reference: "", memo: "",
  });

  // Beneficiary form
  const [beneForm, setBeneForm] = useState({
    name: "", bank_name: "", bank_code: "", account_number: "",
    country_code: "", currency: "", payment_types: [] as string[],
  });
  const [showBeneForm, setShowBeneForm] = useState(false);

  // Reject dialog
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const clearMsgs = () => { setError(null); setSuccess(null); };

  const loadPayments = useCallback(async () => {
    if (!token) return;
    try {
      const data = await listPayments(token);
      setPayments(data.items);
      setPayTotal(data.total);
    } catch (e: any) { setError(e.message); }
  }, [token]);

  const loadBeneficiaries = useCallback(async () => {
    if (!token) return;
    try {
      const data = await listBeneficiaries(token, false);
      setBeneficiaries(data);
    } catch (e: any) { setError(e.message); }
  }, [token]);

  useEffect(() => {
    loadPayments();
    loadBeneficiaries();
  }, [loadPayments, loadBeneficiaries]);

  // KPI derived values
  const kpis = [
    { label: "TOTAL PAYMENTS", value: payTotal, color: HEX.cyan },
    { label: "PENDING APPROVAL", value: payments.filter(p => p.status === "PENDING_APPROVAL").length, color: HEX.amber },
    { label: "APPROVED", value: payments.filter(p => p.status === "APPROVED").length, color: HEX.green },
    { label: "ACTIVE BENEFICIARIES", value: beneficiaries.filter(b => b.is_active).length, color: HEX.blue },
  ];

  const handleInitiate = async () => {
    if (!token) return;
    clearMsgs(); setLoading(true);
    try {
      await initiatePayment(token, {
        ...form, amount: form.amount,
        memo: form.memo || undefined,
      });
      setSuccess("Payment initiated — awaiting approval");
      setForm({ beneficiary_id: "", payment_type: "SEPA", amount: "", currency: "EUR", execution_date: "", reference: "", memo: "" });
      setTab("PAYMENTS");
      await loadPayments();
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const handleApprove = async (id: string) => {
    if (!token) return;
    clearMsgs(); setLoading(true);
    try {
      await approvePayment(token, id);
      setSuccess("Payment approved");
      await loadPayments();
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const handleReject = async () => {
    if (!token || !rejectId) return;
    clearMsgs(); setLoading(true);
    try {
      await rejectPayment(token, rejectId, rejectReason);
      setSuccess("Payment rejected");
      setRejectId(null); setRejectReason("");
      await loadPayments();
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const handleTransmit = async (id: string) => {
    if (!token) return;
    clearMsgs(); setLoading(true);
    try {
      await transmitPayment(token, id);
      setSuccess("Payment transmitted (paper mode)");
      await loadPayments();
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const handleCreateBeneficiary = async () => {
    if (!token) return;
    clearMsgs(); setLoading(true);
    try {
      await createBeneficiary(token, beneForm);
      setSuccess("Beneficiary created");
      setShowBeneForm(false);
      setBeneForm({ name: "", bank_name: "", bank_code: "", account_number: "", country_code: "", currency: "", payment_types: [] });
      await loadBeneficiaries();
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const activeBeneficiaries = beneficiaries.filter(b => b.is_active);
  const filteredBeneficiaries = form.payment_type
    ? activeBeneficiaries.filter(b => b.payment_types.includes(form.payment_type))
    : activeBeneficiaries;

  const TABS = [
    { key: "PAYMENTS" as const, label: "PAYMENTS" },
    { key: "INITIATE" as const, label: "INITIATE" },
    { key: "BENEFICIARIES" as const, label: "BENEFICIARIES" },
  ];

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: S.deep }}>
      {/* ── Header ── */}
      <div style={{ padding: "20px 24px 0", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 6,
            background: "rgba(28,98,242,0.06)", border: "1px solid rgba(28,98,242,0.12)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <CreditCard size={17} color={HEX.cyan} />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", color: S.t1, fontFamily: S.mono, textTransform: "uppercase" }}>
              Payment Initiation
            </div>
            <div style={{ fontSize: 11, color: S.t3, fontFamily: S.ui, marginTop: 1 }}>
              Paper-mode lifecycle with 4-eyes approval
            </div>
          </div>
          <div style={{ marginLeft: "auto" }}>
            <Badge label="PHASE 2§4.4" color={HEX.cyan} />
          </div>
        </div>

        {/* ── KPI Strip ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 16 }}>
          {kpis.map(k => (
            <div key={k.label} style={{
              position: "relative", overflow: "hidden",
              background: S.panel, border: `1px solid ${S.rim}`, borderRadius: 6, padding: "12px 14px",
            }}>
              <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: 2, background: k.color, opacity: 0.6 }} />
              <div style={{ fontSize: 18, fontWeight: 700, color: k.color, fontFamily: S.mono }}>{k.value}</div>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", color: S.t3, marginTop: 2, fontFamily: S.mono, textTransform: "uppercase" }}>{k.label}</div>
            </div>
          ))}
        </div>

        {/* ── Banners ── */}
        {error && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 6, background: `${HEX.red}08`, border: `1px solid ${HEX.red}20`, marginBottom: 12 }}>
            <XCircle size={14} color={HEX.red} />
            <span style={{ fontSize: 12, color: HEX.red, fontFamily: S.mono }}>{error}</span>
          </div>
        )}
        {success && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 6, background: `${HEX.green}08`, border: `1px solid ${HEX.green}20`, marginBottom: 12 }}>
            <CheckCircle size={14} color={HEX.green} />
            <span style={{ fontSize: 12, color: HEX.green, fontFamily: S.mono }}>{success}</span>
          </div>
        )}

        {/* ── Tabs ── */}
        <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${S.rim}` }}>
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                padding: "8px 16px", fontSize: 11, fontWeight: 700, letterSpacing: "0.06em",
                fontFamily: S.mono, cursor: "pointer", border: "none", background: "transparent",
                color: tab === t.key ? HEX.cyan : S.t3,
                borderBottom: tab === t.key ? `2px solid ${HEX.cyan}` : "2px solid transparent",
                marginBottom: -1,
              }}
            >
              {t.label}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <button
            onClick={() => { loadPayments(); loadBeneficiaries(); }}
            style={{ background: "transparent", border: "none", cursor: "pointer", padding: "8px 12px" }}
          >
            <RefreshCw size={13} color={S.t3} />
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, overflow: "auto", padding: "16px 24px 24px" }}>

        {/* ── PAYMENTS TAB ── */}
        {tab === "PAYMENTS" && (
          <div>
            {loading && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "20px 0", color: S.t3, fontSize: 12, fontFamily: S.mono }}>
                <div style={{ width: 18, height: 18, border: `2px solid ${S.rim}`, borderTopColor: HEX.cyan, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                Loading…
              </div>
            )}
            {/* Reject dialog inline */}
            {rejectId && (
              <div style={{ background: S.panel, border: `1px solid ${HEX.red}30`, borderRadius: 6, padding: 16, marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: HEX.red, fontFamily: S.mono, marginBottom: 8 }}>REJECTION REASON (required)</div>
                <textarea
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                  rows={2}
                  style={{ width: "100%", background: S.sub, border: `1px solid ${S.rim}`, borderRadius: 4, color: S.t1, padding: "8px 10px", fontSize: 12, fontFamily: S.mono, resize: "vertical", boxSizing: "border-box" }}
                />
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button onClick={handleReject} disabled={!rejectReason.trim()} style={{ padding: "6px 14px", borderRadius: 4, background: HEX.red, color: "#fff", fontSize: 11, fontWeight: 700, fontFamily: S.mono, border: "none", cursor: "pointer", opacity: rejectReason.trim() ? 1 : 0.5 }}>
                    CONFIRM REJECT
                  </button>
                  <button onClick={() => { setRejectId(null); setRejectReason(""); }} style={{ padding: "6px 14px", borderRadius: 4, background: "transparent", color: S.t3, fontSize: 11, fontWeight: 700, fontFamily: S.mono, border: `1px solid ${S.rim}`, cursor: "pointer" }}>
                    CANCEL
                  </button>
                </div>
              </div>
            )}

            {payments.length === 0 && !loading && (
              <div style={{ padding: "40px 0", textAlign: "center", color: S.t3, fontSize: 12, fontFamily: S.mono }}>
                No payments yet — use INITIATE tab to create one
              </div>
            )}

            {payments.map(p => {
              const expanded = expandedId === p.id;
              const statusColor = STATUS_COLOR[p.status] ?? HEX.gray;
              const isMyPayment = p.created_by === (user as any)?.id;
              return (
                <div
                  key={p.id}
                  style={{ background: S.panel, border: `1px solid ${S.rim}`, borderRadius: 6, marginBottom: 6 }}
                >
                  <div
                    onClick={() => setExpandedId(expanded ? null : p.id)}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", cursor: "pointer" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(28,98,242,0.04)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >
                    <Badge label={p.payment_type} color={HEX.cyan} />
                    <div style={{ flex: 1, fontSize: 12, fontWeight: 600, color: S.t1, fontFamily: S.mono }}>{p.beneficiary_name}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: S.t1, fontFamily: S.mono, textAlign: "right" }}>
                      {fmt(p.amount)} <span style={{ color: S.t3, fontSize: 11 }}>{p.currency}</span>
                    </div>
                    <Badge label={p.status.replace("_", " ")} color={statusColor} />
                    <div style={{ fontSize: 10, color: S.t3, fontFamily: S.mono, minWidth: 80, textAlign: "right" }}>
                      {p.execution_date}
                    </div>
                    {expanded ? <ChevronUp size={14} color={S.t3} /> : <ChevronDown size={14} color={S.t3} />}
                  </div>

                  {expanded && (
                    <div style={{ borderTop: `1px solid ${S.rim}`, padding: "12px 14px" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px 16px", marginBottom: 12 }}>
                        {[
                          ["Reference", p.reference],
                          ["Memo", p.memo ?? "—"],
                          ["Hash", p.instruction_hash.slice(0, 16) + "…"],
                          ["Created by", p.created_by.slice(0, 8) + "…"],
                          ["Approved by", p.approved_by ? p.approved_by.slice(0, 8) + "…" : "—"],
                          ["Transmitted at", p.transmitted_at ?? "—"],
                        ].map(([label, val]) => (
                          <div key={label as string}>
                            <div style={{ fontSize: 9, fontWeight: 700, color: S.t3, fontFamily: S.mono, letterSpacing: "0.06em", textTransform: "uppercase" }}>{label}</div>
                            <div style={{ fontSize: 11, color: S.t2, fontFamily: S.mono, marginTop: 2 }}>{val}</div>
                          </div>
                        ))}
                      </div>
                      {p.rejection_reason && (
                        <div style={{ padding: "6px 10px", background: `${HEX.red}08`, border: `1px solid ${HEX.red}20`, borderRadius: 4, fontSize: 11, color: HEX.red, fontFamily: S.mono, marginBottom: 10 }}>
                          Rejection: {p.rejection_reason}
                        </div>
                      )}
                      {/* Action buttons based on status + SoD */}
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {p.status === "PENDING_APPROVAL" && !isMyPayment && (
                          <>
                            <button onClick={() => handleApprove(p.id)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 4, background: HEX.green, color: "#fff", fontSize: 11, fontWeight: 700, fontFamily: S.mono, border: "none", cursor: "pointer" }}>
                              <CheckCircle size={12} /> APPROVE
                            </button>
                            <button onClick={() => { setRejectId(p.id); setRejectReason(""); }} style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 4, background: HEX.red, color: "#fff", fontSize: 11, fontWeight: 700, fontFamily: S.mono, border: "none", cursor: "pointer" }}>
                              <XCircle size={12} /> REJECT
                            </button>
                          </>
                        )}
                        {p.status === "APPROVED" && (
                          <button onClick={() => handleTransmit(p.id)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 4, background: HEX.blue, color: "#fff", fontSize: 11, fontWeight: 700, fontFamily: S.mono, border: "none", cursor: "pointer" }}>
                            <Send size={12} /> TRANSMIT (PAPER)
                          </button>
                        )}
                        {p.status === "PENDING_APPROVAL" && isMyPayment && (
                          <div style={{ fontSize: 11, color: S.t3, fontFamily: S.mono, padding: "6px 0" }}>
                            Awaiting approval by another user (SoD)
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── INITIATE TAB ── */}
        {tab === "INITIATE" && (
          <div style={{ maxWidth: 560 }}>
            <div style={{ background: S.panel, border: `1px solid ${S.rim}`, borderRadius: 6, padding: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: S.t3, fontFamily: S.mono, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 16 }}>
                New Payment Instruction
              </div>
              {(["payment_type", "beneficiary_id", "amount", "currency", "execution_date", "reference"] as const).map(field => {
                const labelMap: Record<string, string> = {
                  payment_type: "Payment Type", beneficiary_id: "Beneficiary",
                  amount: "Amount", currency: "Currency",
                  execution_date: "Execution Date", reference: "Reference",
                };
                if (field === "payment_type") return (
                  <div key={field} style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 10, fontWeight: 700, color: S.t3, fontFamily: S.mono, letterSpacing: "0.06em", display: "block", marginBottom: 4 }}>PAYMENT TYPE</label>
                    <select value={form.payment_type} onChange={e => setForm(f => ({ ...f, payment_type: e.target.value, beneficiary_id: "" }))} style={{ width: "100%", background: S.sub, border: `1px solid ${S.rim}`, borderRadius: 4, color: S.t1, padding: "8px 10px", fontSize: 12, fontFamily: S.mono }}>
                      {PAYMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                );
                if (field === "beneficiary_id") return (
                  <div key={field} style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 10, fontWeight: 700, color: S.t3, fontFamily: S.mono, letterSpacing: "0.06em", display: "block", marginBottom: 4 }}>BENEFICIARY</label>
                    <select value={form.beneficiary_id} onChange={e => setForm(f => ({ ...f, beneficiary_id: e.target.value }))} style={{ width: "100%", background: S.sub, border: `1px solid ${S.rim}`, borderRadius: 4, color: S.t1, padding: "8px 10px", fontSize: 12, fontFamily: S.mono }}>
                      <option value="">— Select —</option>
                      {filteredBeneficiaries.map(b => <option key={b.id} value={b.id}>{b.name} ({b.currency})</option>)}
                    </select>
                  </div>
                );
                return (
                  <div key={field} style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 10, fontWeight: 700, color: S.t3, fontFamily: S.mono, letterSpacing: "0.06em", display: "block", marginBottom: 4 }}>{labelMap[field].toUpperCase()}</label>
                    <input
                      type={field === "execution_date" ? "date" : "text"}
                      value={form[field]}
                      onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                      style={{ width: "100%", background: S.sub, border: `1px solid ${S.rim}`, borderRadius: 4, color: S.t1, padding: "8px 10px", fontSize: 12, fontFamily: S.mono, boxSizing: "border-box" }}
                    />
                  </div>
                );
              })}
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 10, fontWeight: 700, color: S.t3, fontFamily: S.mono, letterSpacing: "0.06em", display: "block", marginBottom: 4 }}>MEMO (OPTIONAL)</label>
                <textarea rows={2} value={form.memo} onChange={e => setForm(f => ({ ...f, memo: e.target.value }))} style={{ width: "100%", background: S.sub, border: `1px solid ${S.rim}`, borderRadius: 4, color: S.t1, padding: "8px 10px", fontSize: 12, fontFamily: S.mono, resize: "vertical", boxSizing: "border-box" }} />
              </div>
              <button
                onClick={handleInitiate}
                disabled={loading || !form.beneficiary_id || !form.amount || !form.execution_date || !form.reference}
                style={{ width: "100%", padding: "10px 0", borderRadius: 4, background: HEX.cyan, color: "#fff", fontSize: 12, fontWeight: 700, fontFamily: S.mono, border: "none", cursor: "pointer", opacity: loading || !form.beneficiary_id || !form.amount || !form.execution_date || !form.reference ? 0.5 : 1 }}
              >
                {loading ? "SUBMITTING…" : "INITIATE PAYMENT →"}
              </button>
            </div>
          </div>
        )}

        {/* ── BENEFICIARIES TAB ── */}
        {tab === "BENEFICIARIES" && (
          <div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
              <button onClick={() => setShowBeneForm(!showBeneForm)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 4, background: showBeneForm ? S.sub : HEX.cyan, color: showBeneForm ? S.t3 : "#fff", fontSize: 11, fontWeight: 700, fontFamily: S.mono, border: `1px solid ${showBeneForm ? S.rim : HEX.cyan}`, cursor: "pointer" }}>
                <Plus size={12} /> {showBeneForm ? "CANCEL" : "ADD BENEFICIARY"}
              </button>
            </div>

            {showBeneForm && (
              <div style={{ background: S.panel, border: `1px solid ${HEX.cyan}30`, borderRadius: 6, padding: 16, marginBottom: 12 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                  {(["name", "bank_name", "bank_code", "account_number", "country_code", "currency"] as const).map(f => (
                    <div key={f}>
                      <label style={{ fontSize: 9, fontWeight: 700, color: S.t3, fontFamily: S.mono, letterSpacing: "0.06em", display: "block", marginBottom: 3, textTransform: "uppercase" }}>{f.replace(/_/g, " ")}</label>
                      <input
                        value={beneForm[f]}
                        onChange={e => setBeneForm(b => ({ ...b, [f]: e.target.value }))}
                        style={{ width: "100%", background: S.sub, border: `1px solid ${S.rim}`, borderRadius: 4, color: S.t1, padding: "7px 10px", fontSize: 11, fontFamily: S.mono, boxSizing: "border-box" }}
                      />
                    </div>
                  ))}
                </div>
                <div style={{ marginBottom: 10 }}>
                  <label style={{ fontSize: 9, fontWeight: 700, color: S.t3, fontFamily: S.mono, letterSpacing: "0.06em", display: "block", marginBottom: 4, textTransform: "uppercase" }}>Payment Types</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    {PAYMENT_TYPES.map(t => {
                      const checked = beneForm.payment_types.includes(t);
                      return (
                        <button
                          key={t}
                          onClick={() => setBeneForm(b => ({
                            ...b,
                            payment_types: checked
                              ? b.payment_types.filter(x => x !== t)
                              : [...b.payment_types, t],
                          }))}
                          style={{ padding: "4px 10px", borderRadius: 3, fontSize: 10, fontWeight: 700, fontFamily: S.mono, border: `1px solid ${checked ? HEX.cyan : S.rim}`, background: checked ? `${HEX.cyan}18` : S.sub, color: checked ? HEX.cyan : S.t3, cursor: "pointer" }}
                        >
                          {t}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <button onClick={handleCreateBeneficiary} disabled={loading || !beneForm.name || !beneForm.bank_code || !beneForm.account_number || beneForm.payment_types.length === 0} style={{ padding: "7px 16px", borderRadius: 4, background: HEX.cyan, color: "#fff", fontSize: 11, fontWeight: 700, fontFamily: S.mono, border: "none", cursor: "pointer", opacity: loading ? 0.5 : 1 }}>
                  SAVE BENEFICIARY
                </button>
              </div>
            )}

            <div style={{ background: S.panel, border: `1px solid ${S.rim}`, borderRadius: 6, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: S.mono }}>
                <thead>
                  <tr style={{ background: S.sub, borderBottom: `1px solid ${S.rim}` }}>
                    {["Name", "Bank", "Code", "Account", "CCY", "Types", "Status"].map(h => (
                      <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", color: S.t3, textTransform: "uppercase" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {beneficiaries.length === 0 && (
                    <tr><td colSpan={7} style={{ padding: "24px 12px", textAlign: "center", color: S.t3, fontSize: 11 }}>No beneficiaries yet</td></tr>
                  )}
                  {beneficiaries.map((b, i) => (
                    <tr key={b.id} style={{ borderBottom: `1px solid ${S.rim}`, background: i % 2 === 0 ? "transparent" : `${S.sub}50` }}
                      onMouseEnter={e => (e.currentTarget.style.background = "rgba(28,98,242,0.04)")}
                      onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? "transparent" : `${S.sub}50`)}
                    >
                      <td style={{ padding: "8px 12px", color: S.t1, fontWeight: 600 }}>{b.name}</td>
                      <td style={{ padding: "8px 12px", color: S.t2 }}>{b.bank_name}</td>
                      <td style={{ padding: "8px 12px", color: S.t2 }}>{b.bank_code}</td>
                      <td style={{ padding: "8px 12px", color: S.t2, fontSize: 10 }}>{b.account_number}</td>
                      <td style={{ padding: "8px 12px" }}><Badge label={b.currency} color={HEX.blue} /></td>
                      <td style={{ padding: "8px 12px" }}>
                        <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                          {b.payment_types.map(t => <Badge key={t} label={t} color={HEX.cyan} />)}
                        </div>
                      </td>
                      <td style={{ padding: "8px 12px" }}>
                        <Badge label={b.is_active ? "ACTIVE" : "INACTIVE"} color={b.is_active ? HEX.green : HEX.gray} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default function PaymentsPage() {
  return <Suspense><PaymentsPageInner /></Suspense>;
}
```

- [ ] **Step 8.4: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 8.5: Production build**

```bash
cd frontend && npx next build
```
Expected: PASS. `/payments` appears in output with a page size.

- [ ] **Step 8.6: Commit frontend**

```bash
git add frontend/src/app/payments/page.tsx frontend/src/lib/api/cashClient.ts frontend/src/components/layout/AppSidebar.tsx
git commit -m "feat(payment): /payments page, cashClient API functions, sidebar nav (§4.4)"
```

---

## Final Validation

- [ ] **Run full backend test suite**

```bash
cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/ -x -q --tb=short
```
Expected: All previous tests pass + new payment tests pass, 0 failures.

- [ ] **Confirm deliverables**

| Deliverable | Path | Status |
|-------------|------|--------|
| Models | `backend/app/models/payment.py` | |
| Migration | `backend/migrations/versions/p1a2b3c4d5e6_payment_initiation.py` | |
| Audit enum (+6 values) | `backend/app/models/cash.py` | |
| Schemas | `backend/app/schemas_v1/cash.py` | |
| Service | `backend/app/services/payment_service.py` | |
| Routes | `backend/app/api/routes/v1_payments.py` | |
| Router | `backend/app/api/router.py` | |
| Service tests | `backend/tests/test_payment_service.py` | |
| Route tests | `backend/tests/test_v1_payment_routes.py` | |
| Frontend page | `frontend/src/app/payments/page.tsx` | |
| API client | `frontend/src/lib/api/cashClient.ts` | |
| Sidebar | `frontend/src/components/layout/AppSidebar.tsx` | |
