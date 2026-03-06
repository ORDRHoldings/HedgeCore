"""
tests/test_policy_service_fix.py

Regression tests for critical policy service bugs:
  - policy_service.list_templates used Python `is None` instead of SQLAlchemy `.is_(None)`
    causing GET /v1/policies/templates to return 500 Internal Server Error.
"""
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.policy import PolicyTemplate
from app.services import policy_service


@pytest.mark.asyncio
async def test_list_templates_endpoint_returns_200(
    client: AsyncClient, auth_headers: dict
):
    """
    GET /v1/policies/templates must return 200, not 500.
    Regression: was failing due to `company_id is None` Python identity check
    instead of SQLAlchemy `.is_(None)` for SQL IS NULL.
    """
    r = await client.get("/api/v1/policies/templates", headers=auth_headers)
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"


@pytest.mark.asyncio
async def test_list_templates_returns_list(
    client: AsyncClient, auth_headers: dict
):
    """Response is a list (possibly empty if templates not seeded)."""
    r = await client.get("/api/v1/policies/templates", headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list), f"Expected list, got {type(data)}: {data}"


@pytest.mark.asyncio
async def test_seed_status_endpoint(
    client: AsyncClient, auth_headers: dict
):
    """GET /v1/policies/templates/seed-status returns seeded/count/expected_count."""
    r = await client.get("/api/v1/policies/templates/seed-status", headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert "seeded" in data
    assert "count" in data
    assert "expected_count" in data
    assert data["expected_count"] == 60, f"Expected 60 templates, got {data['expected_count']}"


@pytest.mark.asyncio
async def test_active_policy_endpoint(
    client: AsyncClient, auth_headers: dict
):
    """GET /v1/policies/active returns 200 (null or active policy object)."""
    r = await client.get("/api/v1/policies/active", headers=auth_headers)
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_policy_service_query_uses_sql_null(
    db_session: AsyncSession, demo_user
):
    """
    Unit test: policy_service.list_templates executes without error.
    Validates the .is_(None) SQLAlchemy fix vs Python `is None`.
    """
    # Should not raise any exception
    templates = await policy_service.list_templates(db_session, demo_user)
    assert isinstance(templates, list)


@pytest.mark.asyncio
async def test_templates_include_system_templates_if_seeded(
    client: AsyncClient, auth_headers: dict
):
    """If templates are seeded, all returned templates have required fields."""
    r = await client.get("/api/v1/policies/templates", headers=auth_headers)
    assert r.status_code == 200
    templates = r.json()
    for tpl in templates:
        assert "id" in tpl
        assert "name" in tpl
        assert "short_name" in tpl
        assert "risk_posture" in tpl
        assert "is_system" in tpl
        assert "config" in tpl
        # Config should have hedge_ratios
        if tpl["config"]:
            assert "hedge_ratios" in tpl["config"]


@pytest.mark.asyncio
async def test_policy_favorites_endpoint(
    client: AsyncClient, auth_headers: dict
):
    """GET /v1/policies/favorites returns 200."""
    r = await client.get("/api/v1/policies/favorites", headers=auth_headers)
    assert r.status_code == 200
    assert isinstance(r.json(), list)
