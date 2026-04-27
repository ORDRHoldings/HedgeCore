"""Tests that OAuth callback redirects to /accounting-oauth-callback, not /settings/connectors."""
from __future__ import annotations
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient, ASGITransport

from app.main import app


class TestOAuthCallbackRedirect:

    @pytest.mark.asyncio
    async def test_success_redirects_to_accounting_oauth_callback(self):
        """Successful OAuth must redirect to /accounting-oauth-callback?system={provider}."""
        from app.connectors.oauth_state import StateToken
        from uuid import uuid4

        mock_state = StateToken(
            tenant_id=uuid4(),
            provider="quickbooks",
            nonce="abc",
            issued_at=0,
        )
        mock_connector = AsyncMock()
        mock_connector.exchange_code = AsyncMock()

        with (
            patch("app.api.routes.v1_connectors.oauth_state.verify_and_consume", new_callable=AsyncMock, return_value=mock_state),
            patch("app.api.routes.v1_connectors.registry.get_connector", return_value=mock_connector),
            patch("app.api.routes.v1_connectors.async_session_maker") as mock_maker,
        ):
            mock_session = AsyncMock()
            mock_session.__aenter__ = AsyncMock(return_value=mock_session)
            mock_session.__aexit__ = AsyncMock(return_value=False)
            mock_maker.return_value = mock_session

            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test", follow_redirects=False) as client:
                resp = await client.get(
                    "/api/v1/connectors/oauth/callback",
                    params={"code": "authcode", "state": "state_token", "realmId": "realm123"},
                )

        assert resp.status_code == 302
        location = resp.headers["location"]
        assert "/accounting-oauth-callback" in location
        assert "system=quickbooks" in location
        assert "/settings/connectors" not in location

    @pytest.mark.asyncio
    async def test_error_redirects_to_accounting_oauth_callback(self):
        """OAuth error must redirect to /accounting-oauth-callback with error param."""
        from app.connectors.errors import ConnectorAuthError

        with patch(
            "app.api.routes.v1_connectors.oauth_state.verify_and_consume",
            new_callable=AsyncMock,
            side_effect=ConnectorAuthError("expired"),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test", follow_redirects=False) as client:
                resp = await client.get(
                    "/api/v1/connectors/oauth/callback",
                    params={"code": "code", "state": "bad_state"},
                )

        assert resp.status_code == 302
        location = resp.headers["location"]
        assert "/accounting-oauth-callback" in location
        assert "/settings/connectors" not in location
        assert "error=" in location
        assert "error_description=" in location
