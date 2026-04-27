"""
tests/test_system_routes.py

Unit/integration tests for app/api/routes/system.py:
  - GET /system/health        — no auth, always 200
  - GET /system/schema-health — redacted without key, full with key

Deep health and db-tables skipped: require live DB (postgres) or special keys.
"""
from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient, ASGITransport

from app.main import app


@pytest.fixture
async def anon_client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


# ──────────────────────────────────────────────────────────────────────────────
# GET /system/health
# ──────────────────────────────────────────────────────────────────────────────

class TestSystemHealth:

    @pytest.mark.asyncio
    async def test_health_returns_200(self, anon_client):
        resp = await anon_client.get("/api/system/health")
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_health_status_ok(self, anon_client):
        resp = await anon_client.get("/api/system/health")
        data = resp.json()
        assert data["status"] == "ok"
        assert data["component"] == "api"

    @pytest.mark.asyncio
    async def test_health_contains_governance_and_cache(self, anon_client):
        resp = await anon_client.get("/api/system/health")
        data = resp.json()
        assert "governance" in data
        assert "market_data_cache" in data


# ──────────────────────────────────────────────────────────────────────────────
# GET /system/schema-health
# ──────────────────────────────────────────────────────────────────────────────

class TestSchemaHealth:

    @pytest.mark.asyncio
    async def test_unauthenticated_returns_redacted(self, anon_client):
        """No X-API-Key → redacted booleans only."""
        mock_readiness = {
            "schema_ready": True,
            "worm_ready": True,
            "market_snapshots_ready": True,
            "checked_at": "2026-01-01T00:00:00+00:00",
        }
        with patch(
            "app.api.routes.system.run_readiness_checks_cached",
            return_value=mock_readiness,
        ):
            resp = await anon_client.get("/api/system/schema-health")

        assert resp.status_code == 200
        data = resp.json()
        assert "schema_ready" in data
        assert "worm_ready" in data
        assert "market_snapshots_ready" in data
        assert "checked_at" in data
        # Full diagnostic fields must NOT appear in redacted response
        assert "missing_items" not in data
        assert "checks" not in data
        assert "startup_schema_ready" not in data

    @pytest.mark.asyncio
    async def test_schema_ready_true_propagates(self, anon_client):
        mock_readiness = {
            "schema_ready": True,
            "worm_ready": True,
            "market_snapshots_ready": False,
            "checked_at": "2026-01-01T00:00:00+00:00",
        }
        with patch(
            "app.api.routes.system.run_readiness_checks_cached",
            return_value=mock_readiness,
        ):
            resp = await anon_client.get("/api/system/schema-health")

        data = resp.json()
        assert data["schema_ready"] is True
        assert data["market_snapshots_ready"] is False
