# backend/tests/test_gl_post_wire.py
"""
Tests for the erp_system write in QBO exchange_code and
the GL posting route's use of connector.post_journal.
"""
from __future__ import annotations
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


class TestErpSystemWrittenAfterQboOAuth:

    @pytest.mark.asyncio
    async def test_erp_system_set_to_quickbooks_after_exchange_code(self):
        """exchange_code() must write company.settings['erp_system'] = 'quickbooks'."""
        from app.connectors.quickbooks.connector import QuickBooksConnector

        tenant_id = uuid.uuid4()
        saved_settings: dict = {}

        async def fake_load(session, tenant_id):
            return dict(saved_settings)

        async def fake_save(session, tenant_id, settings):
            saved_settings.update(settings)

        mock_bundle = MagicMock()
        mock_bundle.access_token = "tok"
        mock_bundle.refresh_token = "ref"
        mock_bundle.expires_at = None
        mock_bundle.realm_id = "123"
        mock_bundle.scope = ""
        mock_bundle.raw = {}

        with (
            patch("app.connectors.quickbooks.connector.settings") as ms,
            patch("app.connectors.quickbooks.connector.token_vault.store_tokens", new_callable=AsyncMock),
            patch("app.connectors.quickbooks.connector.token_vault.update_state", new_callable=AsyncMock),
            patch("app.connectors.quickbooks.connector.token_vault._load_company_settings", side_effect=fake_load),
            patch("app.connectors.quickbooks.connector.token_vault._save_company_settings", side_effect=fake_save),
            patch("app.connectors.quickbooks.connector.async_session_maker") as mock_maker,
            patch("app.connectors.quickbooks.connector.QuickBooksConnector._token_request", new_callable=AsyncMock, return_value=mock_bundle),
        ):
            ms.QBO_REDIRECT_URI = "https://example.com/callback"
            mock_session = AsyncMock()
            mock_session.__aenter__ = AsyncMock(return_value=mock_session)
            mock_session.__aexit__ = AsyncMock(return_value=False)
            mock_maker.return_value = mock_session

            connector = QuickBooksConnector()
            await connector.exchange_code(
                code="auth_code", state="state_token",
                tenant_id=tenant_id, realmId="realm123",
            )

        assert saved_settings.get("erp_system") == "quickbooks"
