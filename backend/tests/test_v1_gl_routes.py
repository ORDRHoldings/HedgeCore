# backend/tests/test_v1_gl_routes.py
"""Route tests for v1_gl — ASGI transport, AsyncMock service."""
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.core.dependencies import get_current_user

_ROUTE = "app.api.routes.v1_gl"


def _make_user(company_id=None):
    u = MagicMock()
    u.id = uuid.uuid4()
    u.company = MagicMock()
    u.company.id = company_id or uuid.uuid4()
    u.company.settings = {"plan_tier": "professional"}
    return u


@pytest.fixture
def auth_override():
    user = _make_user()
    app.dependency_overrides[get_current_user] = lambda: user
    yield user
    app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_list_journal_entries_returns_200(auth_override):
    with patch(f"{_ROUTE}.gl_service") as mock_svc:
        mock_svc.list_journal_entries = AsyncMock(return_value=[])
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.get(
                "/api/v1/gl/journal-entries",
                headers={"Authorization": "Bearer fake-jwt"},
            )
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_generate_journal_entries_returns_201(auth_override):
    run_id = uuid.uuid4()
    fake_je = MagicMock()
    fake_je.id = uuid.uuid4()
    fake_je.company_id = auth_override.company.id
    fake_je.run_id = run_id
    fake_je.ledger_entry_id = None
    fake_je.settlement_event_id = None
    fake_je.entry_type = "OCI_RECOGNITION"
    fake_je.standard = "IFRS_9"
    fake_je.debit_account = "1200"
    fake_je.credit_account = "3400"
    fake_je.amount = 100000.0
    fake_je.currency = "EUR"
    fake_je.base_amount = 110000.0
    fake_je.base_currency = "USD"
    fake_je.fx_rate_used = 1.1
    from datetime import date, datetime, UTC
    fake_je.period_date = date(2026, 3, 31)
    fake_je.description = ""
    fake_je.status = "DRAFT"
    fake_je.posted_at = None
    fake_je.posted_to = None
    fake_je.posted_ref = None
    fake_je.chain_seq = 1
    fake_je.created_at = datetime.now(UTC)

    fake_run = MagicMock()
    fake_run.company_id = auth_override.company.id

    with patch(f"{_ROUTE}.gl_service") as mock_svc:
        mock_svc.generate_journal_entries = AsyncMock(return_value=[fake_je])
        with patch(f"{_ROUTE}._get_run", AsyncMock(return_value=fake_run)):
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                resp = await client.post(
                    f"/api/v1/gl/journal-entries/generate/{run_id}",
                    headers={"Authorization": "Bearer fake-jwt"},
                )
    assert resp.status_code == 201


@pytest.mark.asyncio
async def test_approve_enforces_sod_returns_403(auth_override):
    entry_id = uuid.uuid4()
    with patch(f"{_ROUTE}.gl_service") as mock_svc:
        mock_svc.approve_journal_entry = AsyncMock(
            side_effect=ValueError("SoD violation: checker cannot be the creator")
        )
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                f"/api/v1/gl/journal-entries/{entry_id}/approve",
                headers={"Authorization": "Bearer fake-jwt"},
            )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_reject_missing_reason_returns_422(auth_override):
    entry_id = uuid.uuid4()
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.post(
            f"/api/v1/gl/journal-entries/{entry_id}/reject",
            json={},  # missing reason
            headers={"Authorization": "Bearer fake-jwt"},
        )
    assert resp.status_code == 422
