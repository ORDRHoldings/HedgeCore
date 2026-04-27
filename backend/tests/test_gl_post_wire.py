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


class TestErpSystemWrittenAfterXeroOAuth:

    @pytest.mark.asyncio
    async def test_erp_system_set_to_xero_after_exchange_code(self):
        """exchange_code() must write company.settings['erp_system'] = 'xero'."""
        from app.connectors.xero.connector import XeroConnector

        tenant_id = uuid.uuid4()
        saved_settings: dict = {}

        async def fake_load(session, tenant_id):
            return dict(saved_settings)

        async def fake_save(session, tenant_id, settings):
            saved_settings.update(settings)

        mock_bundle = MagicMock()
        mock_bundle.access_token = "xtok"
        mock_bundle.refresh_token = "xref"
        mock_bundle.expires_at = None
        mock_bundle.realm_id = "xero-tenant-abc"
        mock_bundle.scope = "openid profile email accounting.transactions"
        mock_bundle.raw = {}

        with (
            patch("app.connectors.xero.connector.settings") as ms,
            patch("app.connectors.xero.connector.token_vault.store_tokens", new_callable=AsyncMock),
            patch("app.connectors.xero.connector.token_vault.update_state", new_callable=AsyncMock),
            patch("app.connectors.xero.connector.token_vault._load_company_settings", side_effect=fake_load),
            patch("app.connectors.xero.connector.token_vault._save_company_settings", side_effect=fake_save),
            patch("app.connectors.xero.connector.async_session_maker") as mock_maker,
            patch("app.connectors.xero.connector.XeroConnector._token_request", new_callable=AsyncMock, return_value=mock_bundle),
            patch("app.connectors.xero.connector.XeroConnector._fetch_first_tenant", new_callable=AsyncMock, return_value="xero-tenant-abc"),
        ):
            ms.XERO_REDIRECT_URI = "https://example.com/callback"
            mock_session = AsyncMock()
            mock_session.__aenter__ = AsyncMock(return_value=mock_session)
            mock_session.__aexit__ = AsyncMock(return_value=False)
            mock_maker.return_value = mock_session

            connector = XeroConnector()
            await connector.exchange_code(
                code="auth_code", state="state_token", tenant_id=tenant_id,
            )

        assert saved_settings.get("erp_system") == "xero"


class TestGlPostingUsesConnector:

    @pytest.mark.asyncio
    async def test_post_route_calls_connector_post_journal_for_quickbooks(self):
        """When erp_system='quickbooks', route must call connector.post_journal not _post_je."""
        from httpx import AsyncClient, ASGITransport
        from app.main import app

        mock_result = MagicMock()
        mock_result.external_ref = "QB-9001"

        mock_connector = AsyncMock()
        mock_connector.post_journal = AsyncMock(return_value=mock_result)

        je_id = uuid.uuid4()

        with (
            patch("app.connectors.registry") as mock_registry,
            patch("app.api.routes.v1_gl._post_je", new_callable=AsyncMock) as mock_csv,
        ):
            mock_registry.get_connector.return_value = mock_connector

            from app.core.dependencies import get_current_user
            from app.core.db import get_async_session

            import datetime as _dt
            from decimal import Decimal as _D

            mock_je = MagicMock()
            mock_je.id = je_id
            mock_je.company_id = uuid.uuid4()
            mock_je.run_id = None
            mock_je.ledger_entry_id = None
            mock_je.settlement_event_id = None
            mock_je.status = "APPROVED"
            mock_je.entry_type = "HEDGE_EFFECTIVE"
            mock_je.standard = "IFRS9"
            mock_je.debit_account = "1001"
            mock_je.credit_account = "2001"
            mock_je.amount = _D("1000.00")
            mock_je.currency = "USD"
            mock_je.base_amount = _D("1000.00")
            mock_je.base_currency = "USD"
            mock_je.fx_rate_used = _D("1.0")
            mock_je.period_date = _dt.date(2026, 1, 1)
            mock_je.description = "Test hedge"
            mock_je.posted_at = None
            mock_je.posted_to = None
            mock_je.posted_ref = None
            mock_je.chain_seq = 1
            mock_je.created_at = _dt.datetime(2026, 1, 1, tzinfo=_dt.timezone.utc)

            mock_company = MagicMock()
            mock_company.settings = {"erp_system": "quickbooks"}
            mock_company.id = uuid.uuid4()

            mock_user = MagicMock()
            mock_user.company = mock_company

            mock_session = AsyncMock()
            result_mock = MagicMock()
            result_mock.scalar_one_or_none.return_value = mock_je
            mock_session.execute = AsyncMock(return_value=result_mock)
            mock_session.commit = AsyncMock()

            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                app.dependency_overrides[get_current_user] = lambda: mock_user
                app.dependency_overrides[get_async_session] = lambda: mock_session
                resp = await client.post(f"/api/v1/gl/journal-entries/{je_id}/post")
                app.dependency_overrides.clear()

        assert resp.status_code == 200
        # connector.post_journal must have been called
        mock_connector.post_journal.assert_called_once()
        # CSV fallback must NOT have been called
        mock_csv.assert_not_called()
        # Status must be POSTED
        assert mock_je.status == "POSTED"
        assert mock_je.posted_ref == "QB-9001"

    @pytest.mark.asyncio
    async def test_post_route_uses_csv_when_no_erp_connected(self):
        """When erp_system absent/'CSV', route falls through to CSV export."""
        from httpx import AsyncClient, ASGITransport
        from app.main import app
        from app.services.posting_adapters.base import PostingResult
        from app.core.dependencies import get_current_user
        from app.core.db import get_async_session

        import datetime as _dt2
        from decimal import Decimal as _D2

        _je_id2 = uuid.uuid4()
        mock_je = MagicMock()
        mock_je.id = _je_id2
        mock_je.company_id = uuid.uuid4()
        mock_je.run_id = None
        mock_je.ledger_entry_id = None
        mock_je.settlement_event_id = None
        mock_je.status = "APPROVED"
        mock_je.entry_type = "HEDGE_EFFECTIVE"
        mock_je.standard = "IFRS9"
        mock_je.debit_account = "1001"
        mock_je.credit_account = "2001"
        mock_je.amount = _D2("500.00")
        mock_je.currency = "USD"
        mock_je.base_amount = _D2("500.00")
        mock_je.base_currency = "USD"
        mock_je.fx_rate_used = _D2("1.0")
        mock_je.period_date = _dt2.date(2026, 1, 1)
        mock_je.description = "CSV hedge"
        mock_je.posted_at = None
        mock_je.posted_to = None
        mock_je.posted_ref = None
        mock_je.chain_seq = 2
        mock_je.created_at = _dt2.datetime(2026, 1, 1, tzinfo=_dt2.timezone.utc)

        mock_company = MagicMock()
        mock_company.settings = {}  # no erp_system
        mock_company.id = uuid.uuid4()

        mock_user = MagicMock()
        mock_user.company = mock_company

        mock_session = AsyncMock()
        result_mock = MagicMock()
        result_mock.scalar_one_or_none.return_value = mock_je
        mock_session.execute = AsyncMock(return_value=result_mock)
        mock_session.commit = AsyncMock()

        csv_result = PostingResult(success=True, payload="csv_data", erp_ref="CSV-export")

        with patch("app.api.routes.v1_gl._post_je", new_callable=AsyncMock, return_value=csv_result) as mock_csv:
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                app.dependency_overrides[get_current_user] = lambda: mock_user
                app.dependency_overrides[get_async_session] = lambda: mock_session
                resp = await client.post(f"/api/v1/gl/journal-entries/{mock_je.id}/post")
                app.dependency_overrides.clear()
        assert resp.status_code == 200
        mock_csv.assert_called_once()
