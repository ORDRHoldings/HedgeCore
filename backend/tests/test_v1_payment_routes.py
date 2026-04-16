# backend/tests/test_v1_payment_routes.py
"""Route tests for /v1/payments/* via httpx AsyncClient."""
import uuid
from datetime import date, datetime, UTC
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.core.db import get_session
from app.core.dependencies import get_current_user

_BEARER = {"Authorization": "Bearer fake-jwt-for-csrf-bypass"}


def _mock_user(role="cfo"):
    user = MagicMock()
    user.id = uuid.uuid4()
    user.company_id = uuid.uuid4()
    user.role = role
    user.plan_tier = "enterprise"
    return user


def _make_mock_session():
    mock = AsyncMock()
    mock.commit = AsyncMock()
    mock.rollback = AsyncMock()
    mock.close = AsyncMock()
    return mock


async def _noop_session():
    yield _make_mock_session()


def _mock_beneficiary(company_id=None):
    b = MagicMock()
    b.id = uuid.uuid4()
    b.company_id = company_id or uuid.uuid4()
    b.name = "Acme Corp"
    b.bank_name = "Deutsche Bank"
    b.bank_code = "DEUTDEDB"
    b.account_number = "DE89370400440532013000"
    b.country_code = "DE"
    b.currency = "EUR"
    b.payment_types = ["SEPA"]
    b.is_active = True
    b.created_at = datetime.now(UTC)
    return b


def _mock_payment_instruction(company_id=None, status="PENDING"):
    instr = MagicMock()
    instr.id = uuid.uuid4()
    instr.company_id = company_id or uuid.uuid4()
    instr.beneficiary_id = uuid.uuid4()
    instr.payment_type = "SEPA"
    instr.amount = Decimal("50000.00")
    instr.currency = "EUR"
    instr.execution_date = date(2026, 5, 15)
    instr.reference = "INV-2026-001"
    instr.memo = None
    instr.status = status
    instr.created_by = uuid.uuid4()
    instr.approved_by = None
    instr.approved_at = None
    instr.rejected_by = None
    instr.rejection_reason = None
    instr.transmission_mode = "MANUAL"
    instr.transmitted_at = None
    instr.instruction_hash = "a" * 64
    instr.created_at = datetime.now(UTC)
    return instr


# ── Beneficiary Tests ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_list_beneficiaries():
    """GET /v1/payments/beneficiaries returns 200 with empty list."""
    user = _mock_user()

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = _noop_session
    try:
        with patch(
            "app.api.routes.v1_payments.list_beneficiaries_helper",
            new_callable=AsyncMock,
            return_value=[],
        ):
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
    mock_bene = _mock_beneficiary(company_id=user.company_id)

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = _noop_session
    try:
        with patch(
            "app.api.routes.v1_payments.create_beneficiary_helper",
            new_callable=AsyncMock,
            return_value=mock_bene,
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.post(
                    "/api/v1/payments/beneficiaries",
                    json={
                        "name": "Acme Corp",
                        "bank_name": "Deutsche Bank",
                        "bank_code": "DEUTDEDB",
                        "account_number": "DE89370400440532013000",
                        "country_code": "DE",
                        "currency": "EUR",
                        "payment_types": ["SEPA"],
                    },
                    headers=_BEARER,
                )
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "Acme Corp"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_create_beneficiary_invalid_type():
    """POST /v1/payments/beneficiaries with invalid payment_type returns 422."""
    user = _mock_user()

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = _noop_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post(
                "/api/v1/payments/beneficiaries",
                json={
                    "name": "Bad Corp",
                    "bank_name": "SomeBank",
                    "bank_code": "SOMECODE",
                    "account_number": "GB29NWBK60161331926819",
                    "country_code": "GB",
                    "currency": "GBP",
                    "payment_types": ["WIRE"],  # invalid — not in VALID_PAYMENT_TYPES
                },
                headers=_BEARER,
            )
        assert resp.status_code == 422
    finally:
        app.dependency_overrides.clear()


# ── Payment List Test ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_list_payments():
    """GET /v1/payments/ returns 200 with total=0."""
    user = _mock_user()

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = _noop_session
    try:
        with patch(
            "app.api.routes.v1_payments.list_payments_helper",
            new_callable=AsyncMock,
            return_value=([], 0),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.get("/api/v1/payments/", headers=_BEARER)
        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] == 0
        assert body["items"] == []
    finally:
        app.dependency_overrides.clear()


# ── Approve / Reject / Transmit Tests ────────────────────────────────────


@pytest.mark.asyncio
async def test_approve_payment():
    """POST /v1/payments/{id}/approve returns 200, status=APPROVED."""
    user = _mock_user()
    payment_id = uuid.uuid4()
    mock_instr = _mock_payment_instruction(company_id=user.company_id, status="APPROVED")

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = _noop_session
    try:
        with patch(
            "app.api.routes.v1_payments.approve_payment",
            new_callable=AsyncMock,
            return_value=mock_instr,
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.post(
                    f"/api/v1/payments/{payment_id}/approve",
                    headers=_BEARER,
                )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "APPROVED"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_reject_payment():
    """POST /v1/payments/{id}/reject returns 200, status=REJECTED."""
    user = _mock_user()
    payment_id = uuid.uuid4()
    mock_instr = _mock_payment_instruction(company_id=user.company_id, status="REJECTED")

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = _noop_session
    try:
        with patch(
            "app.api.routes.v1_payments.reject_payment",
            new_callable=AsyncMock,
            return_value=mock_instr,
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.post(
                    f"/api/v1/payments/{payment_id}/reject",
                    json={"reason": "Duplicate payment detected"},
                    headers=_BEARER,
                )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "REJECTED"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_transmit_payment():
    """POST /v1/payments/{id}/transmit returns 200, status=TRANSMITTED."""
    user = _mock_user()
    payment_id = uuid.uuid4()
    mock_instr = _mock_payment_instruction(company_id=user.company_id, status="TRANSMITTED")

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = _noop_session
    try:
        with patch(
            "app.api.routes.v1_payments.transmit_payment",
            new_callable=AsyncMock,
            return_value=mock_instr,
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.post(
                    f"/api/v1/payments/{payment_id}/transmit",
                    headers=_BEARER,
                )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "TRANSMITTED"
    finally:
        app.dependency_overrides.clear()
