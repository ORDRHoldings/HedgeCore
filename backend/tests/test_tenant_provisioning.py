"""Tests for tenant_provisioning.py"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


class TestProvisionTenant:
    @pytest.mark.asyncio
    async def test_creates_company_user_and_genesis_event(self):
        """Three db.add() calls: Company, User, AuditEvent (via build_audit_event)."""
        from app.services.tenant_provisioning import provision_tenant

        db = AsyncMock()
        db.flush = AsyncMock()
        db.add = MagicMock()

        with patch("app.services.tenant_provisioning.Company") as MockCompany, \
             patch("app.services.tenant_provisioning.User") as MockUser, \
             patch("app.services.tenant_provisioning.build_audit_event") as MockBuildEvent, \
             patch("app.services.tenant_provisioning.hash_password", return_value="hashed"):

            mock_company = MagicMock()
            mock_company.id = "c1"
            mock_user = MagicMock()
            mock_user.id = "u1"
            mock_genesis = MagicMock()
            MockCompany.return_value = mock_company
            MockUser.return_value = mock_user
            MockBuildEvent.return_value = mock_genesis

            result_company, result_user = await provision_tenant(
                db,
                company_name="Acme Corp",
                admin_email="admin@acme.com",
                admin_password="secret123",
            )

        assert db.add.call_count == 3
        assert result_company is mock_company
        assert result_user is mock_user

    @pytest.mark.asyncio
    async def test_genesis_hash_is_64_zeros(self):
        from app.services.tenant_provisioning import GENESIS_HASH
        assert GENESIS_HASH == "0" * 64
        assert len(GENESIS_HASH) == 64

    @pytest.mark.asyncio
    async def test_genesis_prev_event_hash_is_genesis_constant(self):
        from app.services.tenant_provisioning import provision_tenant, GENESIS_HASH

        db = AsyncMock()
        db.flush = AsyncMock()
        db.add = MagicMock()

        build_event_kwargs = {}

        def _capture_build(**kw):
            build_event_kwargs.update(kw)
            return MagicMock()

        with patch("app.services.tenant_provisioning.Company") as MockCompany, \
             patch("app.services.tenant_provisioning.User") as MockUser, \
             patch("app.services.tenant_provisioning.build_audit_event", side_effect=_capture_build), \
             patch("app.services.tenant_provisioning.hash_password", return_value="h"):

            MockCompany.return_value = MagicMock(id="c1")
            MockUser.return_value = MagicMock(id="u1")

            await provision_tenant(db, company_name="X", admin_email="a@b.com", admin_password="pw12345")

        assert build_event_kwargs.get("prev_event_hash") == GENESIS_HASH

    @pytest.mark.asyncio
    async def test_empty_company_name_raises_value_error(self):
        from app.services.tenant_provisioning import provision_tenant

        db = AsyncMock()
        with pytest.raises(ValueError, match="company_name"):
            await provision_tenant(db, company_name="   ", admin_email="a@b.com", admin_password="pw12345")

    @pytest.mark.asyncio
    async def test_empty_email_raises_value_error(self):
        from app.services.tenant_provisioning import provision_tenant

        db = AsyncMock()
        with pytest.raises(ValueError, match="admin_email"):
            await provision_tenant(db, company_name="Corp", admin_email="  ", admin_password="pw12345")

    @pytest.mark.asyncio
    async def test_plan_tier_defaults_to_starter(self):
        from app.services.tenant_provisioning import provision_tenant

        db = AsyncMock()
        db.flush = AsyncMock()
        db.add = MagicMock()

        company_kwargs = {}

        def _capture_company(**kw):
            company_kwargs.update(kw)
            return MagicMock(id="c1")

        with patch("app.services.tenant_provisioning.Company", side_effect=_capture_company), \
             patch("app.services.tenant_provisioning.User") as MockUser, \
             patch("app.services.tenant_provisioning.build_audit_event", return_value=MagicMock()), \
             patch("app.services.tenant_provisioning.hash_password", return_value="h"):

            MockUser.return_value = MagicMock(id="u1")

            await provision_tenant(db, company_name="Corp", admin_email="a@b.com", admin_password="pw12345")

        assert company_kwargs.get("plan_tier") == "starter"
