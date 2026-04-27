# backend/tests/test_connector_test_post.py
"""Tests for POST /v1/connectors/{provider}/test-post endpoint."""
from __future__ import annotations
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.core.dependencies import get_current_user
from app.core.db import get_async_session


def _make_mock_user(permissions=("trades.create",)):
    mock_permission = MagicMock()
    mock_permission.permission = MagicMock()
    mock_permission.permission.name = "trades.create"

    mock_company = MagicMock()
    mock_company.id = uuid.uuid4()

    mock_user = MagicMock()
    mock_user.company = mock_company
    mock_user.company_id = mock_company.id  # needed for company_id scalar access
    mock_user.role = MagicMock()
    mock_user.role.permissions = [mock_permission] if "trades.create" in permissions else []
    return mock_user


def _make_mock_session(mappings=()):
    mock_session = AsyncMock()
    result_mock = MagicMock()
    result_mock.scalars.return_value.all.return_value = list(mappings)
    mock_session.execute = AsyncMock(return_value=result_mock)
    return mock_session


class TestTestPostEndpoint:

    @pytest.mark.asyncio
    async def test_returns_success_when_connector_posts(self):
        mock_result = MagicMock()
        mock_result.external_ref = "QB-TEST-001"

        mock_connector = AsyncMock()
        mock_connector.post_journal = AsyncMock(return_value=mock_result)

        mock_user = _make_mock_user()
        mock_session = _make_mock_session()

        with (
            patch("app.api.routes.v1_connectors.registry") as mock_reg,
            patch("app.api.routes.v1_connectors._check_permission", new_callable=AsyncMock),
        ):
            mock_reg.get_connector.return_value = mock_connector

            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                app.dependency_overrides[get_current_user] = lambda: mock_user
                app.dependency_overrides[get_async_session] = lambda: mock_session
                resp = await client.post("/api/v1/connectors/quickbooks/test-post")
                app.dependency_overrides.clear()

        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["erp_ref"] == "QB-TEST-001"
        assert data["provider"] == "quickbooks"

    @pytest.mark.asyncio
    async def test_returns_failure_on_connector_error(self):
        from app.connectors.errors import ConnectorServerError

        mock_connector = AsyncMock()
        mock_connector.post_journal = AsyncMock(side_effect=ConnectorServerError("API down"))

        mock_user = _make_mock_user()
        mock_session = _make_mock_session()

        with (
            patch("app.api.routes.v1_connectors.registry") as mock_reg,
            patch("app.api.routes.v1_connectors._check_permission", new_callable=AsyncMock),
        ):
            mock_reg.get_connector.return_value = mock_connector

            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                app.dependency_overrides[get_current_user] = lambda: mock_user
                app.dependency_overrides[get_async_session] = lambda: mock_session
                resp = await client.post("/api/v1/connectors/quickbooks/test-post")
                app.dependency_overrides.clear()

        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is False
        assert data["erp_ref"] is None
        assert "API down" in data["error"]

    @pytest.mark.asyncio
    async def test_payload_is_balanced(self):
        """JournalPayload sent to connector must have equal debit and credit totals."""
        captured_payload = []

        async def capture_post_journal(*, tenant_id, payload):
            captured_payload.append(payload)
            result = MagicMock()
            result.external_ref = "QB-BAL-001"
            return result

        mock_connector = AsyncMock()
        mock_connector.post_journal = capture_post_journal

        mock_user = _make_mock_user()
        mock_session = _make_mock_session()

        with (
            patch("app.api.routes.v1_connectors.registry") as mock_reg,
            patch("app.api.routes.v1_connectors._check_permission", new_callable=AsyncMock),
        ):
            mock_reg.get_connector.return_value = mock_connector

            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                app.dependency_overrides[get_current_user] = lambda: mock_user
                app.dependency_overrides[get_async_session] = lambda: mock_session
                await client.post("/api/v1/connectors/quickbooks/test-post")
                app.dependency_overrides.clear()

        assert len(captured_payload) == 1
        p = captured_payload[0]
        total_debit = sum(ln.debit for ln in p.lines)
        total_credit = sum(ln.credit for ln in p.lines)
        assert total_debit == total_credit, "Payload must be balanced"

    @pytest.mark.asyncio
    async def test_no_journal_entry_row_created(self):
        """test-post must NOT create a JournalEntry ORM row."""
        mock_connector = AsyncMock()
        result = MagicMock()
        result.external_ref = "QB-001"
        mock_connector.post_journal = AsyncMock(return_value=result)

        mock_user = _make_mock_user()
        mock_session = _make_mock_session()

        with (
            patch("app.api.routes.v1_connectors.registry") as mock_reg,
            patch("app.api.routes.v1_connectors._check_permission", new_callable=AsyncMock),
        ):
            mock_reg.get_connector.return_value = mock_connector

            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                app.dependency_overrides[get_current_user] = lambda: mock_user
                app.dependency_overrides[get_async_session] = lambda: mock_session
                await client.post("/api/v1/connectors/quickbooks/test-post")
                app.dependency_overrides.clear()

        # session.add() must never have been called (no ORM row created)
        mock_session.add.assert_not_called()
