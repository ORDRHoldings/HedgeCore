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
