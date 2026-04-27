"""
Tests for POST /v1/positions/bulk — JSON bulk create endpoint.

Uses dependency overrides + service-layer mocks (no live DB).
"""

import uuid
from datetime import datetime, UTC
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import AsyncClient, ASGITransport

from app.core.security import get_current_user
from app.main import app

_BEARER = {"Authorization": "Bearer fake-jwt-for-csrf-bypass"}
_ROUTE = "app.api.routes.v1_positions"

_SAMPLE_ITEMS = [
    {
        "record_id": "BULK-001",
        "entity": "Acme Corp",
        "flow_type": "AR",
        "currency": "EUR",
        "amount": 100000,
        "value_date": "2026-06-30",
        "status": "CONFIRMED",
    },
    {
        "record_id": "BULK-002",
        "entity": "Beta Ltd",
        "flow_type": "AP",
        "currency": "GBP",
        "amount": 50000,
        "value_date": "2026-09-30",
        "status": "CONFIRMED",
    },
]


def _make_user():
    user = MagicMock()
    user.id = uuid.UUID("aaaaaaaa-0000-0000-0000-000000000001")
    user.email = "test@example.com"
    user.company_id = uuid.UUID("cccccccc-0000-0000-0000-000000000001")
    user.branch_id = uuid.UUID("bbbbbbbb-0000-0000-0000-000000000001")
    user.is_active = True
    user.is_superuser = False
    return user


def _make_pos(record_id: str, idx: int = 0):
    pos = MagicMock()
    pos.id = uuid.UUID(f"dddddddd-0000-0000-0000-{idx:012d}")
    pos.record_id = record_id
    pos.entity = "Acme"
    pos.flow_type = "AR"
    pos.currency = "EUR"
    pos.amount = 100000.0
    pos.value_date = "2026-06-30"
    pos.status = "CONFIRMED"
    pos.company_id = uuid.UUID("cccccccc-0000-0000-0000-000000000001")
    pos.branch_id = uuid.UUID("bbbbbbbb-0000-0000-0000-000000000001")
    pos.created_by = uuid.UUID("aaaaaaaa-0000-0000-0000-000000000001")
    pos.description = None
    pos.is_active = True
    pos.created_at = datetime(2026, 1, 1, tzinfo=UTC)
    pos.updated_at = datetime(2026, 1, 1, tzinfo=UTC)
    pos.execution_status = "NEW"
    pos.policy_id = None
    pos.run_id = None
    return pos


@pytest.mark.asyncio
async def test_bulk_create_all_succeed():
    """All valid rows → 207 with created=N, failed=0, len(ids)==N."""
    mock_user = _make_user()
    app.dependency_overrides[get_current_user] = lambda: mock_user

    side_effects = [_make_pos(item["record_id"], idx) for idx, item in enumerate(_SAMPLE_ITEMS)]

    with (
        patch(f"{_ROUTE}._check_permission", new=AsyncMock()),
        patch(f"{_ROUTE}.position_service.create_position", new=AsyncMock(side_effect=side_effects)),
        patch(f"{_ROUTE}._emit_lifecycle_audit", new=AsyncMock()),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post(
                "/api/v1/positions/bulk",
                json={"items": _SAMPLE_ITEMS},
                headers=_BEARER,
            )

    app.dependency_overrides.clear()
    assert resp.status_code == 207
    body = resp.json()
    assert body["created"] == 2
    assert body["failed"] == 0
    assert len(body["ids"]) == 2
    assert body["errors"] == []


@pytest.mark.asyncio
async def test_bulk_create_partial_failure():
    """One row raises ValueError → 207, created=1, failed=1, errors has message."""
    mock_user = _make_user()
    app.dependency_overrides[get_current_user] = lambda: mock_user

    good_pos = _make_pos("BULK-001", 0)

    async def _side_effect(session, user, item):
        if item.record_id == "BULK-002":
            raise ValueError("duplicate record_id")
        return good_pos

    with (
        patch(f"{_ROUTE}._check_permission", new=AsyncMock()),
        patch(f"{_ROUTE}.position_service.create_position", new=AsyncMock(side_effect=_side_effect)),
        patch(f"{_ROUTE}._emit_lifecycle_audit", new=AsyncMock()),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post(
                "/api/v1/positions/bulk",
                json={"items": _SAMPLE_ITEMS},
                headers=_BEARER,
            )

    app.dependency_overrides.clear()
    assert resp.status_code == 207
    body = resp.json()
    assert body["created"] == 1
    assert body["failed"] == 1
    assert len(body["errors"]) == 1
    assert "BULK-002" in body["errors"][0]
    assert "duplicate record_id" in body["errors"][0]


@pytest.mark.asyncio
async def test_bulk_create_empty_items_rejected():
    """Empty items array → 422 validation error."""
    mock_user = _make_user()
    app.dependency_overrides[get_current_user] = lambda: mock_user

    with patch(f"{_ROUTE}._check_permission", new=AsyncMock()):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post(
                "/api/v1/positions/bulk",
                json={"items": []},
                headers=_BEARER,
            )

    app.dependency_overrides.clear()
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_bulk_create_over_limit_rejected():
    """More than 500 items → 422 validation error."""
    mock_user = _make_user()
    app.dependency_overrides[get_current_user] = lambda: mock_user

    item = _SAMPLE_ITEMS[0]
    with patch(f"{_ROUTE}._check_permission", new=AsyncMock()):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post(
                "/api/v1/positions/bulk",
                json={"items": [item] * 501},
                headers=_BEARER,
            )

    app.dependency_overrides.clear()
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_bulk_create_requires_auth():
    """No auth override → endpoint rejects unauthenticated request."""
    app.dependency_overrides.clear()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post(
            "/api/v1/positions/bulk",
            json={"items": _SAMPLE_ITEMS},
        )
    assert resp.status_code in (401, 403, 422)
