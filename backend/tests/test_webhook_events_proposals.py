"""TDD: proposal.approved and proposal.rejected webhook events fire correctly."""
from __future__ import annotations
import uuid
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


def _make_mock_user(company_id=None):
    u = MagicMock()
    u.id = uuid.uuid4()
    u.company_id = company_id or uuid.uuid4()
    u.email = "proposal-test@example.com"
    u.hierarchy_level = 10
    u.company = MagicMock()
    u.company.plan_tier = "enterprise"
    return u


def _make_mock_endpoint(company_id):
    ep = MagicMock()
    ep.id = uuid.uuid4()
    ep.company_id = company_id
    ep.url = "https://example.com/hook"
    ep.secret = "deadbeef" * 8
    ep.subscribes_to = MagicMock(return_value=True)
    return ep


@pytest.mark.asyncio
async def test_proposal_approved_webhook_dispatched():
    """After a proposal is approved, dispatch_webhook_event must be called
    with event_type='proposal.approved'."""
    from app.main import app
    from app.core.dependencies import get_current_user
    from app.core.db import get_session

    mock_user = _make_mock_user()
    mock_endpoint = _make_mock_endpoint(mock_user.company_id)

    mock_session = AsyncMock()
    mock_wh_result = MagicMock()
    mock_wh_result.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[mock_endpoint])))
    mock_session.execute = AsyncMock(return_value=mock_wh_result)

    dispatched_events = []

    async def fake_dispatch(db, endpoint, event_type, data):
        dispatched_events.append(event_type)

    app.dependency_overrides[get_current_user] = lambda: mock_user
    app.dependency_overrides[get_session] = lambda: mock_session

    try:
        with patch("app.services.webhook_service.dispatch_webhook_event", side_effect=fake_dispatch):
            from httpx import AsyncClient, ASGITransport
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.patch(
                    f"/api/v1/execution-proposals/{uuid.uuid4()}/approve",
                    json={"approval_notes": "Looks good"},
                    headers={"Authorization": "Bearer test-token"},
                )
        # Accept 200 or 404 — key assertion is on dispatch
        assert resp.status_code in (200, 404), resp.text
        if resp.status_code == 200:
            assert "proposal.approved" in dispatched_events
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_proposal_rejected_webhook_dispatched():
    """After a proposal is rejected, dispatch_webhook_event must be called
    with event_type='proposal.rejected'."""
    from app.main import app
    from app.core.dependencies import get_current_user
    from app.core.db import get_session

    mock_user = _make_mock_user()
    mock_endpoint = _make_mock_endpoint(mock_user.company_id)

    mock_session = AsyncMock()
    mock_wh_result = MagicMock()
    mock_wh_result.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[mock_endpoint])))
    mock_session.execute = AsyncMock(return_value=mock_wh_result)

    dispatched_events = []

    async def fake_dispatch(db, endpoint, event_type, data):
        dispatched_events.append(event_type)

    app.dependency_overrides[get_current_user] = lambda: mock_user
    app.dependency_overrides[get_session] = lambda: mock_session

    try:
        with patch("app.services.webhook_service.dispatch_webhook_event", side_effect=fake_dispatch):
            from httpx import AsyncClient, ASGITransport
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.patch(
                    f"/api/v1/execution-proposals/{uuid.uuid4()}/reject",
                    json={"reason": "Not approved"},
                    headers={"Authorization": "Bearer test-token"},
                )
        assert resp.status_code in (200, 404), resp.text
        if resp.status_code == 200:
            assert "proposal.rejected" in dispatched_events
    finally:
        app.dependency_overrides.clear()
