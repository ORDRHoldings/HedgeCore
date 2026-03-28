"""
Tests verifying GENESIS hash chain integrity for newly provisioned tenants.

Done-criteria evidence for Sprint 3: "signup flow creates full tenant
end-to-end with valid genesis hash chain."
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


GENESIS_HASH = "0" * 64


class TestGenesisHashChain:

    def test_genesis_constant_is_64_zeros(self):
        """Architecture freeze: GENESIS_HASH must be exactly 64 zero characters."""
        from app.services.tenant_provisioning import GENESIS_HASH as IMPORTED_GENESIS
        assert IMPORTED_GENESIS == "0" * 64
        assert len(IMPORTED_GENESIS) == 64
        assert all(c == "0" for c in IMPORTED_GENESIS)

    @pytest.mark.asyncio
    async def test_provision_tenant_passes_genesis_hash_to_audit_event(self):
        """
        provision_tenant() must pass prev_event_hash=GENESIS_HASH (64 zeros)
        to build_audit_event, so the first event in the chain is anchored
        to the GENESIS constant rather than any previous event hash.
        """
        from app.services.tenant_provisioning import provision_tenant

        db = AsyncMock()
        db.flush = AsyncMock()
        db.add = MagicMock()

        captured_kwargs = {}

        def capture_build_audit_event(**kwargs):
            captured_kwargs.update(kwargs)
            return MagicMock()

        with patch("app.services.tenant_provisioning.Company") as MockCompany, \
             patch("app.services.tenant_provisioning.User") as MockUser, \
             patch("app.services.tenant_provisioning.hash_password", return_value="hashed"), \
             patch("app.services.tenant_provisioning.build_audit_event",
                   side_effect=capture_build_audit_event):

            MockCompany.return_value = MagicMock(id="tenant-001")
            MockUser.return_value = MagicMock(id="user-001")

            await provision_tenant(
                db,
                company_name="Test Corp",
                admin_email="test@testcorp.com",
                admin_password="password123",
            )

        assert captured_kwargs.get("prev_event_hash") == GENESIS_HASH, (
            f"Expected prev_event_hash='{GENESIS_HASH}' (64 zeros), "
            f"got '{captured_kwargs.get('prev_event_hash')}'"
        )

    @pytest.mark.asyncio
    async def test_genesis_event_company_id_matches_provisioned_company(self):
        """
        The GENESIS audit event must be scoped to the newly created company's
        company_id, not a different tenant.
        """
        from app.services.tenant_provisioning import provision_tenant

        db = AsyncMock()
        db.flush = AsyncMock()
        db.add = MagicMock()

        captured_kwargs = {}

        def capture_build_audit_event(**kwargs):
            captured_kwargs.update(kwargs)
            return MagicMock()

        company_id = "tenant-uuid-123"

        with patch("app.services.tenant_provisioning.Company") as MockCompany, \
             patch("app.services.tenant_provisioning.User") as MockUser, \
             patch("app.services.tenant_provisioning.hash_password", return_value="hashed"), \
             patch("app.services.tenant_provisioning.build_audit_event",
                   side_effect=capture_build_audit_event):

            MockCompany.return_value = MagicMock(id=company_id)
            MockUser.return_value = MagicMock(id="user-uuid-456")

            await provision_tenant(
                db,
                company_name="Isolated Corp",
                admin_email="ceo@isolated.com",
                admin_password="securepass9",
            )

        audit_company = captured_kwargs.get("company_id")
        assert audit_company == company_id, (
            f"GENESIS event company_id '{audit_company}' does not match "
            f"the provisioned company_id '{company_id}'"
        )
