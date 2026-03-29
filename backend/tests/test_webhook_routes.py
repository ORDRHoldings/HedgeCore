"""Tests for webhook CRUD routes: POST/GET/DELETE /v1/webhooks."""
from __future__ import annotations
import uuid
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import AsyncClient, ASGITransport


@pytest.fixture
def mock_user():
    u = MagicMock()
    u.id = uuid.uuid4()
    u.company_id = uuid.uuid4()
    u.email = "test@example.com"
    return u


@pytest.mark.asyncio
async def test_register_webhook_returns_201(mock_user):
    """POST /v1/webhooks creates a webhook and returns 201 with id and secret."""
    from app.main import app
    from app.core.dependencies import get_current_user
    from app.core.db import get_session

    mock_session = AsyncMock()
    mock_session.execute = AsyncMock(return_value=MagicMock(scalar=MagicMock(return_value=0)))
    mock_session.add = MagicMock()
    mock_session.commit = AsyncMock()
    mock_session.refresh = AsyncMock()

    app.dependency_overrides[get_current_user] = lambda: mock_user
    app.dependency_overrides[get_session] = lambda: mock_session

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/webhooks",
                json={"url": "https://example.com/hook", "events": ["position.created"]},
                headers={"Authorization": "Bearer test-token"},
            )
        assert resp.status_code in (201, 200), resp.text
        data = resp.json()
        assert "id" in data
        assert "secret" in data
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_list_webhooks_returns_200(mock_user):
    """GET /v1/webhooks returns list."""
    from app.main import app
    from app.core.dependencies import get_current_user
    from app.core.db import get_session

    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[])))
    mock_session.execute = AsyncMock(return_value=mock_result)

    app.dependency_overrides[get_current_user] = lambda: mock_user
    app.dependency_overrides[get_session] = lambda: mock_session

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get(
                "/api/v1/webhooks",
                headers={"Authorization": "Bearer test-token"},
            )
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_delete_webhook_not_found_returns_404(mock_user):
    """DELETE /v1/webhooks/{id} returns 404 if endpoint not owned by tenant."""
    from app.main import app
    from app.core.dependencies import get_current_user
    from app.core.db import get_session

    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none = MagicMock(return_value=None)
    mock_session.execute = AsyncMock(return_value=mock_result)

    app.dependency_overrides[get_current_user] = lambda: mock_user
    app.dependency_overrides[get_session] = lambda: mock_session

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.delete(
                f"/api/v1/webhooks/{uuid.uuid4()}",
                headers={"Authorization": "Bearer test-token"},
            )
        assert resp.status_code == 404
    finally:
        app.dependency_overrides.clear()


def test_max_webhooks_per_tenant_enforced():
    """MAX_WEBHOOKS_PER_TENANT constant must be 5."""
    from app.models.webhook import MAX_WEBHOOKS_PER_TENANT
    assert MAX_WEBHOOKS_PER_TENANT == 5
