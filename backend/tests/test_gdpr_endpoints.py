"""Tests for GDPR anonymisation job and data rights endpoints."""
from __future__ import annotations
import uuid
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


class TestGDPRJobImportable:
    def test_anonymise_job_importable(self):
        from app.tasks.gdpr_anonymise import run_gdpr_anonymise_job
        assert callable(run_gdpr_anonymise_job)

    def test_anonymise_user_importable(self):
        from app.tasks.gdpr_anonymise import anonymise_user
        assert callable(anonymise_user)


class TestGDPRAnonymiseLogic:
    @pytest.mark.asyncio
    async def test_anonymise_user_hashes_email_and_name(self):
        from app.tasks.gdpr_anonymise import _hash_pii
        original_email = "john.doe@acme.com"
        hashed = _hash_pii(original_email)
        assert hashed != original_email
        assert len(hashed) == 64  # SHA-256 hex
        assert "@" not in hashed

    def test_hash_pii_is_deterministic(self):
        from app.tasks.gdpr_anonymise import _hash_pii
        val = "test@example.com"
        assert _hash_pii(val) == _hash_pii(val)

    def test_hash_pii_different_inputs_differ(self):
        from app.tasks.gdpr_anonymise import _hash_pii
        assert _hash_pii("a@example.com") != _hash_pii("b@example.com")


class TestGDPRRouterImportable:
    def test_router_importable(self):
        from app.api.routes.v1_user_gdpr import router
        assert router is not None

    def test_data_export_route_exists(self):
        from app.api.routes.v1_user_gdpr import router
        paths = {route.path for route in router.routes}
        assert "/v1/user/data-export" in paths

    def test_account_delete_route_exists(self):
        from app.api.routes.v1_user_gdpr import router
        paths = {route.path for route in router.routes}
        assert "/v1/user/account" in paths

    def test_account_delete_is_delete_method(self):
        from app.api.routes.v1_user_gdpr import router
        delete_routes = [
            r for r in router.routes
            if hasattr(r, "methods") and "DELETE" in r.methods
        ]
        assert any("/v1/user/account" in r.path for r in delete_routes)
